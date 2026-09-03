import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  finaliseProxyScene,
  groundPlaneProxy,
  vec3,
  type ProxyShape,
  type Vec3,
} from '../raytracing/analytic-proxy-scene';
import {
  BAKED_INDIRECT_MAXIMUM_GAIN,
  BAKED_INDIRECT_MAXIMUM_PROBES,
  BAKED_INDIRECT_RUNTIME_GRID,
  FLOATS_PER_PROBE,
  IRRADIANCE_VOLUME_FORMAT,
  SH_L1_COEFFICIENTS,
  bakeIrradianceVolume,
  beginIrradianceBake,
  computeBakeDigest,
  decodeFloat32Base64,
  deserialiseIrradianceVolume,
  encodeFloat32Base64,
  evaluateShL1,
  fibonacciSphereDirection,
  planProbeGrid,
  pointInsideShape,
  resolveBakedIndirectTuning,
  sampleIrradianceVolume,
  serialiseIrradianceVolume,
  type BakeLighting,
} from './baked-indirect';

const UNIFORM_SKY_RADIANCE = 0.4;

/** A sky of exactly one radiance in every direction, and no sun. The furnace. */
const WHITE_FURNACE: BakeLighting = Object.freeze({
  sunDirection: vec3(0, 1, 0),
  sunColour: vec3(0, 0, 0),
  skyZenithColour: vec3(UNIFORM_SKY_RADIANCE, UNIFORM_SKY_RADIANCE, UNIFORM_SKY_RADIANCE),
  skyHorizonColour: vec3(UNIFORM_SKY_RADIANCE, UNIFORM_SKY_RADIANCE, UNIFORM_SKY_RADIANCE),
  skyGroundColour: vec3(UNIFORM_SKY_RADIANCE, UNIFORM_SKY_RADIANCE, UNIFORM_SKY_RADIANCE),
});

const DAYLIGHT: BakeLighting = Object.freeze({
  sunDirection: vec3(0.3, 0.87, 0.39),
  sunColour: vec3(3.1, 2.9, 2.6),
  skyZenithColour: vec3(0.18, 0.26, 0.42),
  skyHorizonColour: vec3(0.32, 0.34, 0.38),
  skyGroundColour: vec3(0.08, 0.075, 0.07),
});

function box(name: string, centre: Vec3, halfExtents: Vec3, albedo: Vec3): ProxyShape {
  return Object.freeze({
    kind: 'box' as const, centre, halfExtents, yaw: 0, normal: vec3(0, 0, 0),
    albedo, metalness: 0, roughness: 0.8, name,
  });
}

function emptyScene() {
  return finaliseProxyScene([], 0);
}

/**
 * A proxy the size the extractor actually produces on a shipped arena: one
 * ground plane and 23 masses, i.e. the 24 occluder shapes every live receipt
 * reports. Bake cost is dominated by shape count, so a 6-shape stand-in
 * understates it by roughly 4x - which is exactly how the published bake table
 * came to be wrong.
 */
function twentyFourOccluderProxy() {
  const shapes: ProxyShape[] = [groundPlaneProxy(0, vec3(0.42, 0.4, 0.38))];
  for (let index = 0; index < 23; index += 1) {
    const angle = (index / 23) * Math.PI * 2;
    const radius = 8 + (index % 5) * 4;
    shapes.push(box(
      `mass-${index}`,
      vec3(Math.cos(angle) * radius, 1.5 + (index % 4), Math.sin(angle) * radius),
      vec3(2 + (index % 3), 1.5 + (index % 4), 2 + ((index + 1) % 3)),
      vec3(0.3 + (index % 7) * 0.08, 0.3 + (index % 5) * 0.1, 0.3 + (index % 3) * 0.12),
    ));
  }
  return finaliseProxyScene(shapes, shapes.length);
}

describe('SH-L1 reconstruction', () => {
  it('reconstructs a uniform environment as exactly its own radiance (white furnace)', () => {
    // Project a constant radiance L over a Fibonacci sphere by hand, exactly as
    // the bake does, then reconstruct. The identity that must hold is E/pi = L.
    const rays = 512;
    const weight = (4 * Math.PI) / rays;
    const coefficients = new Float64Array(SH_L1_COEFFICIENTS);
    for (let ray = 0; ray < rays; ray += 1) {
      const direction = fibonacciSphereDirection(ray, rays, 0.137);
      coefficients[0] += UNIFORM_SKY_RADIANCE * 0.282095 * weight;
      coefficients[1] += UNIFORM_SKY_RADIANCE * 0.488603 * weight * direction[1];
      coefficients[2] += UNIFORM_SKY_RADIANCE * 0.488603 * weight * direction[2];
      coefficients[3] += UNIFORM_SKY_RADIANCE * 0.488603 * weight * direction[0];
    }
    for (const normal of [vec3(0, 1, 0), vec3(1, 0, 0), vec3(0, -1, 0), vec3(0, 0, -1)]) {
      expect(evaluateShL1(coefficients, 0, normal)).toBeCloseTo(UNIFORM_SKY_RADIANCE, 2);
    }
  });

  it('never returns a negative irradiance, whatever the coefficients say', () => {
    // A directional lobe strong enough to ring negative on the opposite normal.
    const coefficients = [0.05, -0.9, 0, 0];
    expect(evaluateShL1(coefficients, 0, vec3(0, 1, 0))).toBeGreaterThanOrEqual(0);
    expect(evaluateShL1(coefficients, 0, vec3(0, -1, 0))).toBeGreaterThanOrEqual(0);
  });
});

describe('fibonacciSphereDirection', () => {
  it('produces unit vectors that integrate to a zero mean over the sphere', () => {
    let sum = vec3(0, 0, 0);
    for (let index = 0; index < 256; index += 1) {
      const direction = fibonacciSphereDirection(index, 256, 0);
      const length = Math.hypot(direction[0], direction[1], direction[2]);
      expect(length).toBeCloseTo(1, 6);
      sum = vec3(sum[0] + direction[0], sum[1] + direction[1], sum[2] + direction[2]);
    }
    expect(Math.hypot(sum[0], sum[1], sum[2]) / 256).toBeLessThan(0.01);
  });
});

describe('bakeIrradianceVolume', () => {
  it('bakes an empty scene to exactly the sky radiance everywhere (the furnace, end to end)', () => {
    const scene = finaliseProxyScene([
      // One shape so the bounds are not degenerate, placed far below and made
      // black so it cannot contribute: this measures the SKY path only.
      box('marker', vec3(0, -40, 0), vec3(0.5, 0.5, 0.5), vec3(0, 0, 0)),
    ], 1);
    const volume = bakeIrradianceVolume(scene, WHITE_FURNACE, {
      arenaId: 'furnace',
      tuning: resolveBakedIndirectTuning('high'),
    });
    const sample = sampleIrradianceVolume(volume, vec3(0, 0, 0), vec3(0, 1, 0));
    // The black marker removes a small solid angle; everything else is sky.
    expect(sample[0]).toBeGreaterThan(UNIFORM_SKY_RADIANCE * 0.9);
    expect(sample[0]).toBeLessThanOrEqual(UNIFORM_SKY_RADIANCE * 1.02);
    expect(sample[1]).toBeCloseTo(sample[0], 5);
    expect(sample[2]).toBeCloseTo(sample[0], 5);
  });

  it('is deterministic: the same inputs bake byte-identical coefficients', () => {
    const scene = finaliseProxyScene([
      groundPlaneProxy(0, vec3(0.4, 0.4, 0.4)),
      box('wall', vec3(0, 2, 4), vec3(6, 2, 0.3), vec3(0.7, 0.2, 0.2)),
    ], 2);
    const options = { arenaId: 'determinism', tuning: resolveBakedIndirectTuning('low') } as const;
    const first = bakeIrradianceVolume(scene, DAYLIGHT, options);
    const second = bakeIrradianceVolume(scene, DAYLIGHT, options);
    expect(first.digest).toBe(second.digest);
    expect(Array.from(first.coefficients)).toEqual(Array.from(second.coefficients));
  });

  it('carries colour from a red wall onto the ground beside it (the bounce the profile ladder has no other source for)', () => {
    // A saturated red wall lit by the sun, over a neutral floor. If indirect
    // light works at all, the floor in front of the wall is measurably redder
    // than the same floor with the wall painted grey. This is the exact effect
    // the RTX skill names as the one only GI or baked irradiance delivers.
    const floor = groundPlaneProxy(0, vec3(0.5, 0.5, 0.5));
    const red = finaliseProxyScene([floor, box('wall', vec3(0, 3, 5), vec3(8, 3, 0.4), vec3(0.85, 0.06, 0.05))], 2);
    const grey = finaliseProxyScene([floor, box('wall', vec3(0, 3, 5), vec3(8, 3, 0.4), vec3(0.5, 0.5, 0.5))], 2);
    const tuning = resolveBakedIndirectTuning('high');
    const redVolume = bakeIrradianceVolume(red, DAYLIGHT, { arenaId: 'bounce-red', tuning });
    const greyVolume = bakeIrradianceVolume(grey, DAYLIGHT, { arenaId: 'bounce-grey', tuning });
    const probe = vec3(0, 1.2, 3.2);
    const up = vec3(0, 1, 0);
    const redSample = sampleIrradianceVolume(redVolume, probe, up);
    const greySample = sampleIrradianceVolume(greyVolume, probe, up);
    const redRatio = redSample[0] / Math.max(1e-6, redSample[1]);
    const greyRatio = greySample[0] / Math.max(1e-6, greySample[1]);
    expect(redRatio).toBeGreaterThan(greyRatio * 1.05);
  });

  it('reports its occluder count so a sky-only bake is distinguishable from a healthy one', () => {
    const scene = finaliseProxyScene([groundPlaneProxy(0, vec3(0.4, 0.4, 0.4))], 1);
    const volume = bakeIrradianceVolume(scene, DAYLIGHT, {
      arenaId: 'coverage', tuning: resolveBakedIndirectTuning('low'),
    });
    expect(volume.bake.occluderShapes).toBe(1);
    expect(volume.bake.raysPerProbe).toBe(48);
    expect(volume.bake.bounces).toBe(1);
  });

  it('fills probes buried inside geometry rather than leaving a black band through the wall', () => {
    const scene = finaliseProxyScene([
      groundPlaneProxy(0, vec3(0.4, 0.4, 0.4)),
      box('slab', vec3(0, 3, 0), vec3(5, 3, 5), vec3(0.6, 0.6, 0.6)),
    ], 2);
    const volume = bakeIrradianceVolume(scene, DAYLIGHT, {
      arenaId: 'buried', tuning: resolveBakedIndirectTuning('low'),
    });
    expect(volume.bake.filledProbes).toBeGreaterThan(0);
    // No probe may be all-zero after the fill: an all-zero probe is the black
    // band this pass exists to prevent.
    const probes = volume.dimensions[0] * volume.dimensions[1] * volume.dimensions[2];
    let allZero = 0;
    for (let probe = 0; probe < probes; probe += 1) {
      let magnitude = 0;
      for (let slot = 0; slot < FLOATS_PER_PROBE; slot += 1) {
        magnitude += Math.abs(volume.coefficients[probe * FLOATS_PER_PROBE + slot]);
      }
      if (magnitude === 0) allZero += 1;
    }
    expect(allZero).toBe(0);
  });

  it('a chunked bake produces byte-identical coefficients to a one-shot bake', () => {
    // The runtime path steps the bake under a per-frame millisecond budget so a
    // loading screen does not freeze; the offline CLI runs it in one pass. If
    // those two disagree, the committed cache would be a different volume from
    // the one a player without the cache sees.
    const scene = finaliseProxyScene([
      groundPlaneProxy(0, vec3(0.42, 0.4, 0.38)),
      box('wall', vec3(0, 3, 6), vec3(9, 3, 0.4), vec3(0.8, 0.12, 0.1)),
      box('crate', vec3(-4, 1, 1), vec3(1, 1, 1), vec3(0.5, 0.45, 0.3)),
    ], 3);
    const options = { arenaId: 'chunked', tuning: resolveBakedIndirectTuning('low') } as const;
    const oneShot = bakeIrradianceVolume(scene, DAYLIGHT, options);
    const session = beginIrradianceBake(scene, DAYLIGHT, options);
    // `step(0)` is the worst chunking there is: the budget is already spent
    // when the step begins, so it does exactly one unit of work. That unit used
    // to be sixteen probes and is now ONE RAY (the fix for the 198 ms stall), so
    // the same bake needs three orders of magnitude more steps - which is the
    // point of the change, and is why this cap moved. The identity below is the
    // assertion; the cap is only there so a hang fails instead of hanging.
    let steps = 0;
    while (!session.step(0) && steps < 20_000_000) steps += 1;
    expect(session.done()).toBe(true);
    expect(steps).toBeGreaterThan(1_000);
    expect(session.progress()).toBe(1);
    const chunked = session.volume();
    expect(chunked.digest).toBe(oneShot.digest);
    expect(Array.from(chunked.coefficients)).toEqual(Array.from(oneShot.coefficients));
  });

  it('can stop INSIDE a probe, which is what makes the per-frame budget a bound at all', () => {
    // THE STRUCTURAL HALF of the 198 ms fix, and the half that cannot flake:
    // with the budget already spent, one step must do strictly LESS than one
    // probe of work. The old stepper checked its deadline every sixteen probes,
    // so the same call advanced by 16 probes however small the budget was, and
    // no budget could bound it.
    const scene = twentyFourOccluderProxy();
    const session = beginIrradianceBake(scene, DAYLIGHT, {
      arenaId: 'stops-inside-a-probe',
      tuning: resolveBakedIndirectTuning('high'),
      fixedDimensions: BAKED_INDIRECT_RUNTIME_GRID,
    });
    const probes = BAKED_INDIRECT_RUNTIME_GRID[0] * BAKED_INDIRECT_RUNTIME_GRID[1] * BAKED_INDIRECT_RUNTIME_GRID[2];
    session.step(0);
    expect(session.progress()).toBeGreaterThan(0);
    expect(session.progress()).toBeLessThan(1 / probes);
  });

  it('stops at the FIRST ray past the deadline on a REAL-SIZED proxy at both tiers (the 198 ms stall)', () => {
    // THE DEFECT THIS PINS. The stepper used to check its deadline every 16
    // probes. One HIGH probe on a 24-occluder proxy is 128 rays at two bounces
    // against every shape, so sixteen of them is ~200 ms of straight-line
    // JavaScript on the main thread - measured by a skeptic at 198 ms worst /
    // 45.9 ms mean against a declared 3 ms budget, on the tier MAX and RAY
    // TRACED ship. That is the same freeze class as HF-399 and PASS 82-83.
    //
    // 24 occluders is not an arbitrary fixture size: it is the count every
    // shipped arena's own runtime receipt reports (`...:24:...`).
    //
    // MEASURED AGAINST AN INJECTED CLOCK, and that is a TIGHTER bound than the
    // wall-clock percentile this test used to carry, not a looser one. The old
    // form allowed p95 4.5 ms and worst 6 ms against a 3 ms budget, and it
    // still went red inside the full suite (4.76 ms p95) while reading
    // 3.0-3.2 ms in isolation on the same commit: on a shared workstation a
    // wall clock measures the machine. With one tick of the clock per ray the
    // property becomes exact - a step may cross the deadline by AT MOST ONE
    // RAY, at both tiers, on the real proxy - and no amount of contention can
    // move it. The old stepper fails it by three orders of magnitude, because
    // it consulted the clock 2048 rays apart.
    const scene = twentyFourOccluderProxy();
    expect(scene.shapes.length).toBe(24);
    const BUDGET = 3;
    for (const tier of ['low', 'high'] as const) {
      let ticks = 0;
      const session = beginIrradianceBake(scene, DAYLIGHT, {
        arenaId: `budget-${tier}`,
        tuning: resolveBakedIndirectTuning(tier),
        fixedDimensions: BAKED_INDIRECT_RUNTIME_GRID,
        // One tick per READ of the clock. `traceRay` is the only work between
        // two deadline reads, so a step's budget is spent in units of rays.
        // The handful of reads that are NOT a ray - the deadline itself, an
        // empty probe skipped - only make a step stop EARLIER, so they bias
        // the assertion below towards strictness, never towards passing.
        now: () => ticks++,
      });
      const probes = BAKED_INDIRECT_RUNTIME_GRID[0] * BAKED_INDIRECT_RUNTIME_GRID[1] * BAKED_INDIRECT_RUNTIME_GRID[2];
      const rays = resolveBakedIndirectTuning(tier).raysPerProbe;
      const overshoots: number[] = [];
      for (let step = 0; step < 40 && !session.done(); step += 1) {
        const before = ticks;
        const startedAtProgress = session.progress();
        session.step(BUDGET);
        const raysTraced = Math.round((session.progress() - startedAtProgress) * probes * rays);
        expect(ticks, `${tier}: the step must consult the clock`).toBeGreaterThan(before);
        overshoots.push(raysTraced);
      }
      expect(overshoots.length, `${tier}: the loop must actually step`).toBeGreaterThan(0);
      for (const spent of overshoots) {
        // At most the budget plus the one ray that crossed it. The old
        // sixteen-probe stepper traces 2048 rays here whatever the budget is,
        // so it misses this by three orders of magnitude.
        expect(spent, `${tier}: one step may cross a ${BUDGET}-tick budget by at most one ray`)
          .toBeLessThanOrEqual(BUDGET + 1);
      }
      // Not vacuous, in both directions: real work happened, and the budget is
      // what stopped it rather than the bake running out of probes.
      expect(Math.max(...overshoots), `${tier}: the steps must trace something`).toBeGreaterThan(0);
      expect(session.done(), `${tier}: 40 bounded steps must not finish the bake`).toBe(false);
    }
  });

  it('reads its deadline from a sub-millisecond clock, not from Date.now', () => {
    // The other half of the 198 ms fix, and the half an injected clock cannot
    // see. Checking per ray is not enough if the clock cannot resolve 3 ms:
    // Date.now() on Windows advances in ~15.6 ms steps, and the first per-ray
    // stepper still spent 31 ms in one step until the deadline moved to
    // performance.now(). Pinned at the SOURCE, the way the light-set freeze is,
    // because a unit test cannot observe which clock a correct-looking module
    // chose.
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'baked-indirect.ts'),
      'utf8',
    );
    const clockBody = source.slice(source.indexOf('const nowMs ='), source.indexOf('export function beginIrradianceBake'));
    expect(clockBody).toMatch(/performance/);
    expect(clockBody).toMatch(/clock\.now\(\)/);
    // Date.now survives only as the fallback for a host with no performance.
    expect(clockBody.indexOf('clock.now()')).toBeLessThan(clockBody.indexOf('Date.now()'));
  });

  it('a partially stepped volume is readable and non-negative rather than undefined', () => {
    const scene = finaliseProxyScene([
      groundPlaneProxy(0, vec3(0.42, 0.4, 0.38)),
      box('wall', vec3(0, 3, 6), vec3(9, 3, 0.4), vec3(0.8, 0.12, 0.1)),
    ], 2);
    const session = beginIrradianceBake(scene, DAYLIGHT, {
      arenaId: 'partial', tuning: resolveBakedIndirectTuning('low'),
    });
    session.step(0);
    expect(session.done()).toBe(false);
    expect(session.progress()).toBeGreaterThan(0);
    expect(session.progress()).toBeLessThan(1);
    const partial = session.volume();
    const sample = sampleIrradianceVolume(partial, vec3(0, 1.5, 0), vec3(0, 1, 0));
    for (const channel of sample) expect(Number.isFinite(channel) && channel >= 0).toBe(true);
  });

  it('refuses to bake the OFF tier rather than emitting an empty volume', () => {
    expect(() => bakeIrradianceVolume(emptyScene(), DAYLIGHT, {
      arenaId: 'off', tuning: resolveBakedIndirectTuning('off'),
    })).toThrow(/OFF tier/);
  });
});

describe('the digest cache key', () => {
  const scene = finaliseProxyScene([
    groundPlaneProxy(0, vec3(0.4, 0.4, 0.4)),
    box('wall', vec3(0, 2, 4), vec3(6, 2, 0.3), vec3(0.7, 0.2, 0.2)),
  ], 2);
  const tuning = resolveBakedIndirectTuning('low');

  it('is stable for identical inputs', () => {
    expect(computeBakeDigest(scene, DAYLIGHT, tuning)).toBe(computeBakeDigest(scene, DAYLIGHT, tuning));
  });

  it('changes when the geometry moves', () => {
    const moved = finaliseProxyScene([
      groundPlaneProxy(0, vec3(0.4, 0.4, 0.4)),
      box('wall', vec3(0, 2, 4.5), vec3(6, 2, 0.3), vec3(0.7, 0.2, 0.2)),
    ], 2);
    expect(computeBakeDigest(moved, DAYLIGHT, tuning)).not.toBe(computeBakeDigest(scene, DAYLIGHT, tuning));
  });

  it('changes when the LIGHTING moves, so a noon bake is never served for dusk', () => {
    const dusk: BakeLighting = { ...DAYLIGHT, sunDirection: vec3(0.9, 0.1, 0.42), sunColour: vec3(3.4, 1.6, 0.7) };
    expect(computeBakeDigest(scene, dusk, tuning)).not.toBe(computeBakeDigest(scene, DAYLIGHT, tuning));
  });

  it('changes when the TIER moves, so a LOW volume is never served to HIGH', () => {
    expect(computeBakeDigest(scene, DAYLIGHT, resolveBakedIndirectTuning('high')))
      .not.toBe(computeBakeDigest(scene, DAYLIGHT, tuning));
  });
});

describe('planProbeGrid', () => {
  it('coarsens the spacing rather than truncating the arena when the cap is hit', () => {
    const huge = finaliseProxyScene([
      box('a', vec3(-200, 0, -200), vec3(1, 1, 1), vec3(0.5, 0.5, 0.5)),
      box('b', vec3(200, 60, 200), vec3(1, 1, 1), vec3(0.5, 0.5, 0.5)),
    ], 2);
    const plan = planProbeGrid(huge, 2, 2, BAKED_INDIRECT_MAXIMUM_PROBES);
    expect(plan.dimensions[0] * plan.dimensions[1] * plan.dimensions[2])
      .toBeLessThanOrEqual(BAKED_INDIRECT_MAXIMUM_PROBES);
    expect(plan.spacingM[0]).toBeGreaterThan(2);
    // The grid still spans the whole arena: the far corner is inside it.
    const spanX = plan.originM[0] + (plan.dimensions[0] - 1) * plan.spacingM[0];
    expect(spanX).toBeGreaterThanOrEqual(201);
  });
});

describe('pointInsideShape', () => {
  it('detects a point inside a yawed box and outside its rotated silhouette', () => {
    const yawed: ProxyShape = Object.freeze({
      kind: 'box' as const, centre: vec3(0, 0, 0), halfExtents: vec3(4, 1, 0.5),
      yaw: Math.PI / 2, normal: vec3(0, 0, 0), albedo: vec3(0.5, 0.5, 0.5),
      metalness: 0, roughness: 0.8, name: 'yawed',
    });
    expect(pointInsideShape(vec3(0, 0, 3), yawed)).toBe(true);
    expect(pointInsideShape(vec3(3, 0, 0), yawed)).toBe(false);
  });

  it('never treats a ground plane as solid, so no probe above the floor is buried', () => {
    expect(pointInsideShape(vec3(0, -5, 0), groundPlaneProxy(0, vec3(0.4, 0.4, 0.4)))).toBe(false);
  });
});

describe('serialisation', () => {
  it('round-trips a Float32Array through the hand-written base64 codec', () => {
    const values = new Float32Array([0, 1, -1, 0.5, 1e-7, 1234.5, -0.0001, Math.PI]);
    expect(Array.from(decodeFloat32Base64(encodeFloat32Base64(values)))).toEqual(Array.from(values));
  });

  it('round-trips a whole volume and keeps its digest', () => {
    const scene = finaliseProxyScene([
      groundPlaneProxy(0, vec3(0.4, 0.4, 0.4)),
      box('wall', vec3(0, 2, 4), vec3(6, 2, 0.3), vec3(0.7, 0.2, 0.2)),
    ], 2);
    const volume = bakeIrradianceVolume(scene, DAYLIGHT, {
      arenaId: 'round-trip', tuning: resolveBakedIndirectTuning('low'),
    });
    const payload = serialiseIrradianceVolume(volume);
    expect(payload.format).toBe(IRRADIANCE_VOLUME_FORMAT);
    const restored = deserialiseIrradianceVolume(payload);
    expect(restored.digest).toBe(volume.digest);
    expect(restored.dimensions).toEqual(volume.dimensions);
    expect(Array.from(restored.coefficients)).toEqual(Array.from(volume.coefficients));
  });

  it('refuses a payload whose coefficient count does not match its dimensions', () => {
    const scene = finaliseProxyScene([groundPlaneProxy(0, vec3(0.4, 0.4, 0.4))], 1);
    const volume = bakeIrradianceVolume(scene, DAYLIGHT, {
      arenaId: 'truncated', tuning: resolveBakedIndirectTuning('low'),
    });
    const payload = serialiseIrradianceVolume(volume);
    const truncated = { ...payload, dimensions: [payload.dimensions[0] + 1, payload.dimensions[1], payload.dimensions[2]] as const };
    expect(() => deserialiseIrradianceVolume(truncated)).toThrow(/expected/);
  });

  it('refuses an unknown format rather than decoding it as v1', () => {
    expect(() => deserialiseIrradianceVolume({
      format: 'atomic-acres.irradiance-probe-volume.sh-l2.v2',
    } as never)).toThrow(/Unknown irradiance volume format/);
  });
});

describe('combat safety and parity', () => {
  it('clamps every tier composite to BAKED_INDIRECT_MAXIMUM_GAIN', () => {
    for (const tier of ['off', 'low', 'high'] as const) {
      expect(resolveBakedIndirectTuning(tier).composite).toBeLessThanOrEqual(BAKED_INDIRECT_MAXIMUM_GAIN);
      expect(resolveBakedIndirectTuning(tier).composite).toBeGreaterThanOrEqual(0);
    }
  });

  it('OFF resolves to a structurally disabled tuning, not a zeroed enabled one', () => {
    const off = resolveBakedIndirectTuning('off');
    expect(off.enabled).toBe(false);
    expect(off.raysPerProbe).toBe(0);
    expect(off.probeSpacingM).toBe(0);
  });

  it('LOW and HIGH differ only in BAKE cost, never in per-frame cost', () => {
    const low = resolveBakedIndirectTuning('low');
    const high = resolveBakedIndirectTuning('high');
    // Per-frame work is four texture fetches and eleven multiply-adds on both
    // tiers; the tuning carries no per-frame term that differs. If a per-frame
    // knob is ever added to this tuning, this test is where it has to be argued.
    expect(Object.keys(low)).toEqual(Object.keys(high));
    expect(low.raysPerProbe).toBeLessThan(high.raysPerProbe);
    expect(low.bounces).toBeLessThan(high.bounces);
    expect(low.probeSpacingM).toBeGreaterThan(high.probeSpacingM);
  });

  it('bakedIndirectRevealsNoDynamicActors: the bake sees only the static proxy set', () => {
    // The parity property, asserted structurally. `bakeIrradianceVolume` takes a
    // ProxyScene and a BakeLighting and nothing else: there is no parameter
    // through which a player, bot or vehicle could enter the integral, so a
    // baked bounce cannot carry information about where anybody is. If a future
    // change adds a dynamic input to either type, this test fails to compile or
    // to match, which is the point.
    const scene = finaliseProxyScene([groundPlaneProxy(0, vec3(0.4, 0.4, 0.4))], 1);
    const first = bakeIrradianceVolume(scene, DAYLIGHT, { arenaId: 'parity', tuning: resolveBakedIndirectTuning('low') });
    const second = bakeIrradianceVolume(scene, DAYLIGHT, { arenaId: 'parity', tuning: resolveBakedIndirectTuning('low') });
    expect(Array.from(first.coefficients)).toEqual(Array.from(second.coefficients));
    expect(first.bake.occluderShapes).toBe(scene.shapes.length);
  });

  it('can only brighten: every sampled irradiance is non-negative', () => {
    const scene = finaliseProxyScene([
      groundPlaneProxy(0, vec3(0.4, 0.4, 0.4)),
      box('overhang', vec3(0, 6, 0), vec3(10, 0.4, 10), vec3(0.2, 0.2, 0.2)),
    ], 2);
    const volume = bakeIrradianceVolume(scene, DAYLIGHT, {
      arenaId: 'non-negative', tuning: resolveBakedIndirectTuning('low'),
    });
    for (const normal of [vec3(0, 1, 0), vec3(0, -1, 0), vec3(1, 0, 0), vec3(-1, 0, 0)]) {
      for (let step = 0; step < 12; step += 1) {
        const sample = sampleIrradianceVolume(volume, vec3(step - 6, 1 + step * 0.3, step - 6), normal);
        expect(sample[0]).toBeGreaterThanOrEqual(0);
        expect(sample[1]).toBeGreaterThanOrEqual(0);
        expect(sample[2]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
