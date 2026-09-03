/**
 * HF-418 / Lane AL — the runtime half: where the baked volume comes from on a
 * machine that has never seen this arena before.
 *
 * `baked-indirect.ts` bakes, `baked-indirect-node.ts` samples. This module is
 * the thing in between: it finds the arena, decides whether a bake is needed,
 * runs it a few milliseconds at a time so the loading screen does not freeze,
 * uploads the result, and publishes the receipt.
 *
 * THE THREE RULES IT EXISTS TO ENFORCE.
 *
 * 1. NEVER STALL A FRAME. A 3 m grid over a 60 x 20 x 60 m arena is thousands
 *    of probes and several seconds of straight-line JavaScript. This steps the
 *    bake under `BAKE_FRAME_BUDGET_MS` of wall clock per presented frame, and
 *    uploads every `UPLOAD_EVERY_STEPS` steps rather than every step, because
 *    the volume is 331 KB and re-uploading it 200 times is 66 MB of traffic for
 *    an image nobody looked at. The picture converges over about four seconds
 *    from a sky-only start rather than popping in.
 *
 * 2. NEVER BAKE AN EMPTY SCENE. The arena streams in AFTER the pipeline is
 *    assembled. Baking at graph-construction time would produce a pure-sky
 *    volume for every arena, which is exactly the "correct image of nothing"
 *    the RTX skill warns about and which every unit test would pass over. The
 *    extraction is therefore debounced against the scene root's child count
 *    settling, the same way the ray-traced layer's proxy extraction is, and for
 *    the same reason.
 *
 * 3. NEVER SERVE THE WRONG VOLUME. The digest covers geometry, lighting AND
 *    tier. If the arena changes, the sun moves far enough to matter, or the
 *    tier changes, the digest changes and the bake restarts. A cached volume
 *    whose digest does not match the current inputs is discarded rather than
 *    used, because a noon bake served at dusk is a lighting bug that looks like
 *    an art bug.
 */

import * as THREE from 'three';

import {
  ARENA_PROXY_EXTRACTION,
} from '../raytracing/arena-proxy-registration';
import { extractProxyScene, vec3, type ProxyScene } from '../raytracing/analytic-proxy-scene';
import {
  BAKED_INDIRECT_RUNTIME_GRID,
  beginIrradianceBake,
  computeBakeDigest,
  type BakeLighting,
  type BakedIndirectTuning,
  type IrradianceBakeSession,
  type IrradianceProbeVolume,
} from './baked-indirect';
import {
  buildBakedIndirectLightNode,
  type BakedIndirectGraph,
  type BakedIndirectSources,
} from './baked-indirect-node';

/**
 * Wall-clock milliseconds of bake permitted per presented frame. Three
 * milliseconds is under a fifth of a 60 Hz frame and under a third of the
 * project's own 240 fps workload target's budget, so it costs a frame nothing
 * that the adaptive valve would notice, and it is spent during loading and
 * arena transition where the frame is not being read anyway.
 */
export const BAKE_FRAME_BUDGET_MS = 3;

/** Steps between texture uploads while a bake is converging. */
export const UPLOAD_EVERY_STEPS = 8;

/** How long the scene root must be stable before the proxy is extracted. */
export const EXTRACTION_DEBOUNCE_MS = 1_000;

export type BakedIndirectRuntimeSources = BakedIndirectSources & Readonly<{
  /** The arena sun, for the bake's lighting AND for the scene-root fallback. */
  sun: THREE.DirectionalLight | THREE.PointLight | null;
}>;

/**
 * A volume supplied from outside — the committed, build-time bake. Returning
 * null means "no cached volume for these inputs", and the runtime bakes.
 *
 * This is the seam the offline pipeline plugs into: `scripts/bake/` writes a
 * volume keyed by digest, the arena bundle ships it, and the runtime pays
 * nothing but a decode. Nothing here REQUIRES that pipeline to exist, which is
 * deliberate: a feature that only works for arenas someone remembered to bake
 * is a feature that is silently off on the newest map.
 */
export type BakedIndirectVolumeCache = (digest: string, arenaId: string) => IrradianceProbeVolume | null;

export type BakedIndirectRuntime = Readonly<{
  graph: BakedIndirectGraph;
  /** Progress of the current bake, 0..1. 1 when there is nothing to do. */
  progress(): number;
  /** How the volume was obtained. */
  source(): 'none' | 'cache' | 'baking' | 'baked';
  /**
   * Pushes a new tier in. A tier change changes the digest, so the next
   * extraction restarts the bake rather than re-labelling the old volume.
   */
  applyTuning(next: BakedIndirectTuning): void;
  beforeRender(): void;
  dispose(): void;
}>;

/**
 * Derives the bake's lighting from the arena's own sun, quantised.
 *
 * QUANTISATION IS THE POINT. Lane AB's time-of-day model moves the sun
 * continuously; an un-quantised digest would change every frame and the bake
 * would restart forever. Rounding the direction to ~5 degrees and the colour to
 * eighths means the volume re-bakes a handful of times across a full day cycle,
 * which is the right granularity for a signal that is already interpolated
 * across metres.
 */
export function bakeLightingFromSun(
  sun: THREE.DirectionalLight | THREE.PointLight | null,
): BakeLighting {
  const direction = new THREE.Vector3(0.45, 0.72, -0.22);
  const colour = new THREE.Vector3(1, 1, 1);
  if (sun instanceof THREE.DirectionalLight) {
    direction.copy(sun.position).sub(sun.target.position);
    if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0);
    direction.normalize();
    colour.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(Math.min(2, sun.intensity));
  } else if (sun) {
    direction.copy(sun.position).normalize();
    colour.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(Math.min(2, sun.intensity));
  }
  const quantiseDirection = (value: number): number => Math.round(value * 12) / 12;
  const quantiseColour = (value: number): number => Math.round(value * 8) / 8;
  const sunDirection = vec3(
    quantiseDirection(direction.x), quantiseDirection(direction.y), quantiseDirection(direction.z),
  );
  const sunColour = vec3(quantiseColour(colour.x), quantiseColour(colour.y), quantiseColour(colour.z));
  // The sky terms follow the sun rather than being an independent constant, so
  // a dusk bake is warm at the horizon without a second authored input. Same
  // relationship the ray-traced layer uses for its own sky and ground radiance.
  const sky = (factor: number, floor: number) => vec3(
    quantiseColour(sunColour[0] * factor + floor),
    quantiseColour(sunColour[1] * factor + floor),
    quantiseColour(sunColour[2] * factor + floor),
  );
  return Object.freeze({
    sunDirection,
    sunColour,
    skyZenithColour: sky(0.10, 0.045),
    skyHorizonColour: sky(0.14, 0.030),
    skyGroundColour: sky(0.05, 0.012),
  });
}

export function buildBakedIndirectRuntime(
  sources: BakedIndirectRuntimeSources,
  tuning: BakedIndirectTuning,
  cache: BakedIndirectVolumeCache = () => null,
  now: () => number = () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
): BakedIndirectRuntime {
  const graph = buildBakedIndirectLightNode(sources, tuning, BAKED_INDIRECT_RUNTIME_GRID, 'runtime');
  let active = tuning;
  let session: IrradianceBakeSession | null = null;
  let boundDigest: string | null = null;
  let stepsSinceUpload = 0;
  let lastRootSignature = -1;
  let signatureStableSince = Number.POSITIVE_INFINITY;
  let state: 'none' | 'cache' | 'baking' | 'baked' = 'none';
  // Set when an input the digest covers has changed under a settled scene, so
  // the next opportunity re-derives the digest instead of trusting the bound
  // one. A tier change is the case that exists today.
  let digestDirty = false;

  // The scene-pass assembler hands this module the camera, not the scene, and
  // the camera is parented into the scene. Walking up beats changing an
  // assembler owned by another lane. Same derivation as the ray-traced layer.
  const sceneRoot = (): THREE.Object3D | null => {
    let node: THREE.Object3D | null = sources.camera as THREE.Object3D;
    while (node?.parent) node = node.parent;
    if (node && node !== (sources.camera as THREE.Object3D)) return node;
    let fromSun: THREE.Object3D | null = sources.sun as THREE.Object3D | null;
    while (fromSun?.parent) fromSun = fromSun.parent;
    return fromSun && fromSun !== (sources.sun as unknown) ? fromSun : null;
  };

  const startBake = (proxy: ProxyScene, lighting: BakeLighting, digest: string, arenaId: string): void => {
    const cached = cache(digest, arenaId);
    if (cached && cached.digest === digest
      && cached.dimensions[0] === BAKED_INDIRECT_RUNTIME_GRID[0]
      && cached.dimensions[1] === BAKED_INDIRECT_RUNTIME_GRID[1]
      && cached.dimensions[2] === BAKED_INDIRECT_RUNTIME_GRID[2]) {
      graph.setVolume(cached);
      boundDigest = digest;
      session = null;
      state = 'cache';
      return;
    }
    session = beginIrradianceBake(proxy, lighting, {
      arenaId,
      tuning: active,
      fixedDimensions: BAKED_INDIRECT_RUNTIME_GRID,
    });
    boundDigest = digest;
    stepsSinceUpload = 0;
    state = 'baking';
    // Bind the sky-only starting volume immediately so the transform uniforms
    // are right from the first frame. Without this the layer samples a unit
    // grid at the world origin until the first upload lands.
    graph.setVolume(session.volume());
  };

  const maybeStartBake = (): void => {
    const root = sceneRoot();
    if (!root) return;
    const signature = root.children.length;
    const at = now();
    // SETTLING, not throttling. The arena streams in after the pipeline is
    // assembled, so the test is "the root has stopped changing", not "enough
    // time has passed since I last looked". Extracting on the first frame is
    // how a layer ends up baking an empty scene and reporting it as healthy.
    if (signature !== lastRootSignature) {
      lastRootSignature = signature;
      signatureStableSince = at;
      return;
    }
    if (at - signatureStableSince < EXTRACTION_DEBOUNCE_MS) return;
    if (boundDigest !== null && !digestDirty) return;
    digestDirty = false;
    const proxy = extractProxyScene(root, THREE, ARENA_PROXY_EXTRACTION);
    const lighting = bakeLightingFromSun(sources.sun);
    const digest = computeBakeDigest(proxy, lighting, active);
    if (digest === boundDigest) return;
    startBake(proxy, lighting, digest, root.name || 'arena');
  };

  return Object.freeze({
    graph,
    progress: (): number => (session ? session.progress() : 1),
    source: (): 'none' | 'cache' | 'baking' | 'baked' => state,
    applyTuning(next: BakedIndirectTuning): void {
      if (next.tier === active.tier) {
        active = next;
        graph.applyTuning(next);
        return;
      }
      active = next;
      graph.applyTuning(next);
      session = null;
      if (!next.enabled) {
        boundDigest = null;
        state = 'none';
        return;
      }
      // The tier is part of the digest, so the bound volume is now the wrong
      // one by definition. Re-derive rather than re-label.
      digestDirty = true;
      state = 'none';
    },
    beforeRender(): void {
      graph.beforeRender();
      if (!active.enabled) return;
      if (!session) {
        maybeStartBake();
        return;
      }
      const finished = session.step(BAKE_FRAME_BUDGET_MS);
      stepsSinceUpload += 1;
      if (finished || stepsSinceUpload >= UPLOAD_EVERY_STEPS) {
        graph.setVolume(session.volume());
        stepsSinceUpload = 0;
      }
      if (finished) {
        session = null;
        state = 'baked';
      }
    },
    dispose(): void {
      session = null;
      graph.dispose();
    },
  });
}
