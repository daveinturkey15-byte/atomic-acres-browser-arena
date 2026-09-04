/**
 * HF-486 — temporal denoise for the screen-space reflection term.
 *
 * WHAT THIS IS. The SSR march is noisy per frame (one mirror ray per pixel,
 * first-generation SSR). Upstream r185 pairs it with a two-node chain,
 * `temporalReproject()` + `recurrentDenoise()`:
 * https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_postprocessing_ssr_denoise.html
 * That chain costs two fullscreen pipelines and two history targets
 * (TemporalReprojectNode owns a history AND a resolve target). The brief for
 * this work allows ONE pipeline and ONE history buffer, so this module
 * re-implements the technique in our likeness as a single fused stage:
 *
 *   denoised = mix(current, clamp(history(uv - velocity), box(current)),
 *                  strength * valid * velocityGate * depthGate)
 *
 * - History buffer reprojection uses the EXISTING velocity MRT attachment (the
 *   same NDC motion vectors the motion-blur gate reads) and the EXISTING depth
 *   attachment. No new MRT attachment beyond the velocity one the denoise
 *   itself requests (see `screenSpaceMrtRequirement`).
 * - Neighbourhood clamp: the reprojected history sample must lie inside the
 *   min/max box of a 4-tap cross plus the center pixel of the CURRENT frame's
 *   SSR output. History can smooth noise but can never invent energy the
 *   current frame does not have near the pixel.
 * - Disocclusion fallback: reprojected UV outside [0,1], fast motion above
 *   the velocity knee, or a depth discontinuity at the pixel all drive the
 *   history weight to exactly 0, i.e. the old single-frame path. A moving
 *   enemy never smears: its pixels fail the velocity gate by construction.
 * - Strength uniform: every per-instance value here is a uniform; the fresh
 *   frame always keeps at least (1 - MAXIMUM_STRENGTH) of the composite, so a
 *   muzzle flash or an enemy entering a reflection reads immediately.
 *
 * BUDGETS (brief fence, all pinned by tests in ssr-temporal-denoise.test.ts):
 * - New fullscreen pipelines: 0. The blend is arithmetic fused into the
 *   existing linear-HDR composite expression; the per-frame history refresh is
 *   a `copyTextureToTexture` command, not a pipeline.
 * - New render targets: at most 1 (the history buffer, half-float RGBA).
 * - Taps per pixel: at most 8 (4 neighbourhood + center + history + 2 depth).
 * - Per-frame allocation: zero. The history target is created once at graph
 *   build and resized in place; `refresh()` mutates, never allocates.
 * - Defended per-frame cost estimate at 1440p on the owner's RTX 5080: ~0.35
 *   ms (DESIGNED — needs a headed capture; ~8 texture taps at SSR
 *   resolutionScale plus one SSR-sized texture copy per frame).
 *
 * HISTORY LIFECYCLE. The copy runs pre-frame (the only hook the graph owns):
 * frame N's update copies frame N-1's SSR output into history, then frame N
 * renders sampling it. Validity lags one frame by construction — the first
 * refresh after (re)creation or invalidation copies but reports invalid, so an
 * empty or stale target is never sampled. Arena switches invalidate (no stale
 * history across matches); size changes recreate (no stretched history).
 *
 * Upstream docs consulted (HF-481): the dated local copy
 * `docs/threejs-knowledge/upstream/threejs-docs-llms-full-2026-09-04.txt`
 * (ssr/recurrent-denoise/temporal-reproject entries), the r185 recipe
 * `docs/threejs-knowledge/r185/webgpu_postprocessing_ssr_denoise.md` on
 * `origin/contrib/dave-gaming-pc/claude/r185-techniques`, and the installed
 * `three@0.185.1` sources
 * (`SSRNode.js` setHistory/reprojectHitPointHistory, `TemporalReprojectNode.js`
 * updateBefore history/resolve management). Deliberately NOT reused: upstream
 * `setHistory` multi-bounce has no strength, no clamp and no disocclusion
 * control, and wiring it under our own blend would filter twice.
 */

import { HalfFloatType, RenderTarget } from 'three/webgpu';

/** Tuning for one SSR temporal-denoise stage. `strength` is 0..1. */
export type SsrTemporalDenoiseTuning = Readonly<{
  enabled: boolean;
  strength: number;
}>;

/** The stage is fully off: byte-identical old path, zero targets. */
export const SSR_TEMPORAL_DENOISE_OFF: SsrTemporalDenoiseTuning = Object.freeze({
  enabled: false,
  strength: 0,
});

/**
 * Default history weight before gating. 0.55 keeps just over half the
 * temporally stable signal while the fresh frame dominates transients.
 */
export const SSR_TEMPORAL_DENOISE_DEFAULT_STRENGTH = 0.55;

/**
 * Hard ceiling on the history weight. The fresh frame always contributes at
 * least 15%, so a new bright signal (muzzle flash, enemy entering the
 * reflection) is visible on the very frame it appears and converges within
 * ~3 frames. Combat readability, not taste.
 */
export const SSR_TEMPORAL_DENOISE_MAXIMUM_STRENGTH = 0.85;

/** New fullscreen pipelines this stage adds. The blend fuses into the composite. */
export const SSR_TEMPORAL_DENOISE_PIPELINE_COUNT = 0;

/** New render targets this stage adds: the single history buffer, nothing else. */
export const SSR_TEMPORAL_DENOISE_HISTORY_TARGETS = 1;

/** Taps per pixel: 4 neighbourhood + center + history + 2 depth. */
export const SSR_TEMPORAL_DENOISE_MAX_TAPS = 8;

/**
 * Velocity gate band, in UV units per frame. Below the dead zone the pixel is
 * treated as static (full trust); above the knee it is disoccluded (zero
 * history). Derived from the motion-blur NDC band (dead 0.006, knee 0.024 —
 * an aim adjustment at 240 Hz moves thousandths of NDC) halved into UV units,
 * exactly as the motion-blur gate does. A moving enemy's pixels sit above the
 * knee, so they fall back to the current frame and cannot smear.
 */
export const SSR_DENOISE_VELOCITY_DEAD_ZONE_UV = 0.003;
export const SSR_DENOISE_VELOCITY_KNEE_UV = 0.012;

/**
 * Depth-discontinuity band on the raw depth-delta signal, shared with the
 * bloom chain's depth edge guard (`depthEdgeGuard` in pass64-tsl-scene.ts):
 * at a silhouette the history weight collapses to zero so a reflection can
 * never bleed across an edge a player is aiming past.
 */
export const SSR_DENOISE_DEPTH_EDGE_NEAR = 0.00035;
export const SSR_DENOISE_DEPTH_EDGE_FAR = 0.0035;

export function resolveSsrTemporalDenoiseTuning(
  ssrEnabled: boolean,
  requested: boolean,
): SsrTemporalDenoiseTuning {
  if (!ssrEnabled || !requested) return SSR_TEMPORAL_DENOISE_OFF;
  return Object.freeze({ enabled: true, strength: SSR_TEMPORAL_DENOISE_DEFAULT_STRENGTH });
}

// ---------------------------------------------------------------------------
// CPU reference math. Mirrors the TSL stage below tap for tap so the envelope
// is provable numerically without a GPU, exactly like the filmic grade chain's
// reference stages and screen-space-post-profile's motion-blur reference.
// ---------------------------------------------------------------------------

export type Uv2 = Readonly<{ x: number; y: number }>;
export type Rgb = Readonly<{ r: number; g: number; b: number }>;

function smoothstepScalar(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Reprojects a pixel into the previous frame: previous = current - velocity,
 * in UV units. Same sign convention as upstream
 * (`historyUV = uvHit.sub(velocity)` in SSRNode.reprojectHitPointHistory):
 * velocity is current-minus-previous motion, so subtracting it walks back to
 * where the surface was last frame. Callers convert the NDC motion-vector
 * attachment to UV with a 0.5 scale, exactly as the motion-blur gate does.
 */
export function ssrDenoiseReprojectUv(uv: Uv2, velocityUv: Uv2): Uv2 {
  return Object.freeze({ x: uv.x - velocityUv.x, y: uv.y - velocityUv.y });
}

/** True when the reprojected UV lands inside the history buffer. */
export function ssrDenoiseHistoryUvValid(uv: Uv2): boolean {
  return uv.x >= 0 && uv.x <= 1 && uv.y >= 0 && uv.y <= 1;
}

export type NeighbourhoodBox = Readonly<{ min: Rgb; max: Rgb }>;

/**
 * Per-channel min/max over the neighbourhood samples (4-tap cross plus the
 * center pixel — 5 entries). The history sample must live inside this box.
 */
export function ssrDenoiseNeighbourhoodBox(samples: readonly Rgb[]): NeighbourhoodBox {
  let minR = Infinity;
  let minG = Infinity;
  let minB = Infinity;
  let maxR = -Infinity;
  let maxG = -Infinity;
  let maxB = -Infinity;
  for (const s of samples) {
    if (s.r < minR) minR = s.r;
    if (s.g < minG) minG = s.g;
    if (s.b < minB) minB = s.b;
    if (s.r > maxR) maxR = s.r;
    if (s.g > maxG) maxG = s.g;
    if (s.b > maxB) maxB = s.b;
  }
  return Object.freeze({
    min: Object.freeze({ r: minR, g: minG, b: minB }),
    max: Object.freeze({ r: maxR, g: maxG, b: maxB }),
  });
}

/** Clamps one history sample into the neighbourhood box, per channel. */
export function ssrDenoiseClampSample(sample: Rgb, box: NeighbourhoodBox): Rgb {
  return Object.freeze({
    r: Math.min(box.max.r, Math.max(box.min.r, sample.r)),
    g: Math.min(box.max.g, Math.max(box.min.g, sample.g)),
    b: Math.min(box.max.b, Math.max(box.min.b, sample.b)),
  });
}

/**
 * Motion disocclusion gate: 1 below the dead zone, 0 above the knee,
 * smooth between. Fast pixels (moving enemies, flicks) get no history.
 */
export function ssrDenoiseVelocityGate(velocityMagUv: number): number {
  return 1 - smoothstepScalar(
    SSR_DENOISE_VELOCITY_DEAD_ZONE_UV,
    SSR_DENOISE_VELOCITY_KNEE_UV,
    velocityMagUv,
  );
}

/**
 * Depth-edge gate: 1 on flat surfaces, 0 across a silhouette. Same band as
 * the bloom chain's depth guard, because it reads the same depth-delta
 * signal for the same reason.
 */
export function ssrDenoiseDepthGate(depthDiscontinuity: number): number {
  return 1 - smoothstepScalar(
    SSR_DENOISE_DEPTH_EDGE_NEAR,
    SSR_DENOISE_DEPTH_EDGE_FAR,
    depthDiscontinuity,
  );
}

/**
 * Effective history weight: requested strength, gated by validity, motion and
 * depth, hard-capped at MAXIMUM_STRENGTH. Any single veto zeroes it, which is
 * the disocclusion fallback: the pixel renders exactly the old path.
 */
export function ssrDenoiseBlendWeight(
  strength: number,
  historyValid: boolean,
  velocityGate: number,
  depthGate: number,
): number {
  if (!historyValid) return 0;
  const clamped = Math.min(SSR_TEMPORAL_DENOISE_MAXIMUM_STRENGTH, Math.max(0, strength));
  return clamped * velocityGate * depthGate;
}

/** Linear blend of the fresh pixel with the clamped history pixel. */
export function ssrDenoiseMix(current: Rgb, historyClamped: Rgb, weight: number): Rgb {
  const w = Math.min(1, Math.max(0, weight));
  return Object.freeze({
    r: current.r * (1 - w) + historyClamped.r * w,
    g: current.g * (1 - w) + historyClamped.g * w,
    b: current.b * (1 - w) + historyClamped.b * w,
  });
}

// ---------------------------------------------------------------------------
// History buffer lifecycle. Exactly one RenderTarget, created lazily on the
// first refresh that has a sized source, resized in place, never reallocated
// per frame. Validity lags one refresh behind the copy so an empty or stale
// target is never sampled.
// ---------------------------------------------------------------------------

/** Minimal renderer surface the refresh needs: the texture copy, nothing else. */
export type SsrDenoiseCopyRenderer = Readonly<{
  copyTextureToTexture(source: unknown, target: unknown): void;
}>;

export type SsrDenoiseHistorySource = Readonly<{
  image?: Readonly<{ width: number; height: number }>;
}>;

export type SsrDenoiseRefreshResult = Readonly<{
  copied: boolean;
  valid: boolean;
  targetCount: number;
}>;

export type SsrTemporalDenoiseHistory = Readonly<{
  /** 0 when off/never refreshed, else exactly 1. Never more. */
  targetCount(): number;
  /** True only when the target holds a previous frame's SSR output. */
  isValid(): boolean;
  /** The live history texture, or null until the first sized refresh. */
  texture(): unknown;
  /**
   * Copies the SSR output into history. Reports invalid on the first refresh
   * after creation/resize/invalidation (the copy lands, but nothing samples
   * it until a full frame has elapsed). Allocation-free after the first
   * sized refresh: same target, `setSize` in place.
   */
  refresh(renderer: SsrDenoiseCopyRenderer, source: SsrDenoiseHistorySource): SsrDenoiseRefreshResult;
  /** Drops validity without freeing: next refresh re-primes, never samples stale. */
  invalidate(): void;
  dispose(): void;
}>;

function sourceSize(source: SsrDenoiseHistorySource): { width: number; height: number } | null {
  const width = Math.floor(source.image?.width ?? NaN);
  const height = Math.floor(source.image?.height ?? NaN);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  return { width, height };
}

/**
 * Creates the history manager. With `initialSize` the single target is
 * allocated eagerly (1x1 at graph build, resized on the first refresh) so the
 * TSL `texture()` binding has a stable texture from construction; without it
 * allocation stays lazy (zero targets until the first sized refresh). Either
 * way the count never exceeds one.
 */
export function createSsrTemporalDenoiseHistory(
  initialSize?: Readonly<{ width: number; height: number }>,
): SsrTemporalDenoiseHistory {
  let target: RenderTarget | null = null;
  if (initialSize && initialSize.width >= 1 && initialSize.height >= 1) {
    target = new RenderTarget(Math.floor(initialSize.width), Math.floor(initialSize.height), {
      depthBuffer: false,
      type: HalfFloatType,
    });
    target.texture.name = 'SsrTemporalDenoise.history';
  }
  let framesSincePrime = 0;
  let valid = false;

  return Object.freeze({
    targetCount(): number {
      return target === null ? 0 : 1;
    },
    isValid(): boolean {
      return valid && target !== null;
    },
    texture(): unknown {
      return target?.texture ?? null;
    },
    refresh(renderer: SsrDenoiseCopyRenderer, source: SsrDenoiseHistorySource): SsrDenoiseRefreshResult {
      const size = sourceSize(source);
      if (size === null) return Object.freeze({ copied: false, valid: false, targetCount: target === null ? 0 : 1 });
      if (target === null) {
        target = new RenderTarget(size.width, size.height, { depthBuffer: false, type: HalfFloatType });
        target.texture.name = 'SsrTemporalDenoise.history';
        framesSincePrime = 0;
        valid = false;
      } else if (target.width !== size.width || target.height !== size.height) {
        target.setSize(size.width, size.height);
        framesSincePrime = 0;
        valid = false;
      }
      renderer.copyTextureToTexture(source, target.texture);
      framesSincePrime += 1;
      // One full frame must elapse between the copy landing and the first
      // sample: on the priming refresh the target is written but reports
      // invalid, so the blend weight is exactly 0 (the old path).
      if (framesSincePrime >= 2) valid = true;
      return Object.freeze({ copied: true, valid: valid && target !== null, targetCount: 1 });
    },
    invalidate(): void {
      framesSincePrime = 0;
      valid = false;
    },
    dispose(): void {
      target?.dispose();
      target = null;
      framesSincePrime = 0;
      valid = false;
    },
  });
}
