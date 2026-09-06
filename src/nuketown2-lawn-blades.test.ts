/**
 * HF-536 muse-lawn2 — grass that reads as blades, not a plate.
 *
 * MEASUREMENT (interim-5 capture vs per-station boards, `scripts/forge/measure-tonal-gap.mjs`
 * boxes; blade-scale texture = mean-corrected neighbour-diff luma stddev on the box eroded
 * 25 % so paths and props do not dominate; full table in the lane REPORT.md):
 *
 *   box (ours -> boards, neighbour-diff texture)
 *   north-yard/grassNear       9.94 -> 6.84
 *   south-yard/lawnSouth       8.07 -> 5.90
 *   glasshouse/baseBed         5.94 -> 8.87
 *   garden-pod/bedGround       6.36 -> 10.29
 *   overhead/lawnBox          20.26 -> 21.21
 *   sand-pit/surroundGround    3.75 -> 17.59
 *
 * The close-turf boxes sit at 4-8 against the boards' blade-tip texture, and the
 * composed blade reads as a flat card: root and tip both near the plate luma. This
 * test pins the authored fix — base 0.55x / tip 1.35x of the plate luma with a
 * hashed 20 % sun-catch, near-band x1.6 density within 4 m of the review-close
 * camera footprints, 0.7x-1.4x height jitter, 0-25 deg lean jitter, a tapered
 * blade silhouette, and the plate one -6 % luma step down — plus the budgets
 * (tris delta <= 60k, draws unchanged) and the palette guard (composed mix hue
 * still within 8 deg of the lawn-tone board target).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createNuketown2MaterialRegistry } from './nuketown2-materials';
import {
  NUKETOWN2_LAWN_BASE_COLOR,
  NUKETOWN2_LAWN_NEAR_BAND_DENSITY,
  NUKETOWN2_LAWN_NEAR_BAND_RADIUS_M,
  NUKETOWN2_LAWN_ROOT_SHADE,
  NUKETOWN2_LAWN_SCALE_RANGE,
  NUKETOWN2_LAWN_TINT,
  nuketown2LawnNearBand,
  nuketown2LawnNearBandPoints,
} from './nuketown-lawn-field';
import { buildNuketown2 } from './nuketown2-arena';
import { nuketown2HandedX } from './nuketown2-layout';
import {
  buildInstancedGrassField,
  createGrassBladeGeometry,
  GRASS_BLADE_BASE_LUMA_RATIO,
  GRASS_BLADE_LEAN_MAX_DEG,
  GRASS_BLADE_SUN_CATCH_BOOST,
  GRASS_BLADE_SUN_CATCH_FRACTION,
  GRASS_BLADE_TAPER,
  GRASS_BLADE_TIP_LUMA_RATIO,
  GRASS_BLADE_TIP_TINT,
  GRASS_BLADE_TRIANGLES,
  grassBladeSunCatchBoost,
} from './rendering/instanced-grass-field';

/** Board turf target, sRGB — the same authored target as nuketown2-lawn-tone.test.ts. */
const BOARD_LAWN_SRGB = Object.freeze([104, 100, 57] as const);
/** The plate before muse-lawn2's -6 % step. */
const OLD_PLATE_SRGB = Object.freeze([106, 107, 58] as const);
/** The plate after: 0x646536. */
const NEW_PLATE_SRGB = Object.freeze([100, 101, 54] as const);

const toSrgb = (l: number): number => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055) * 255;
const lumaLinear = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
const lumaSrgb = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

function hueSat(srgb: readonly number[]): readonly [number, number] {
  const [r, g, b] = [srgb[0]! / 255, srgb[1]! / 255, srgb[2]! / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return [0, 0] as const;
  const sat = ((max - min) / max) * 100;
  let hue = 0;
  if (max === r) hue = ((g - b) / (max - min)) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return [hue, sat] as const;
}

function hueDiff(a: number, b: number): number {
  let x = a - b;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return Math.abs(x);
}

/** Blade green composition at warm 0.5, linear, exactly as the renderer multiplies. */
function bladeMidLinear(): readonly [number, number, number] {
  const base = new THREE.Color(NUKETOWN2_LAWN_BASE_COLOR);
  const warm = 0.5;
  return [
    base.r * (NUKETOWN2_LAWN_TINT.rBase + NUKETOWN2_LAWN_TINT.rWarm * warm) * NUKETOWN2_LAWN_TINT.valueBase,
    base.g * (NUKETOWN2_LAWN_TINT.gBase + NUKETOWN2_LAWN_TINT.gWarm * warm) * NUKETOWN2_LAWN_TINT.valueBase,
    base.b * (NUKETOWN2_LAWN_TINT.bBase + NUKETOWN2_LAWN_TINT.bWarm * warm) * NUKETOWN2_LAWN_TINT.valueBase,
  ] as const;
}

function plateLinear(): readonly [number, number, number] {
  const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
  const plate = (registry.lawn as THREE.Material & { color: THREE.Color }).color;
  return [plate.r, plate.g, plate.b] as const;
}

describe('HF-536 muse-lawn2 — blades read against the plate', () => {
  it('pins the authored base/tip ratios: root 0.55x, tip 1.35x of the plate luma', () => {
    expect(GRASS_BLADE_BASE_LUMA_RATIO).toBe(0.55);
    expect(GRASS_BLADE_TIP_LUMA_RATIO).toBe(1.35);
    const plate = plateLinear();
    const plateLuma = lumaLinear(plate);
    const mid = bladeMidLinear();
    // Root: the blade mid pulled down by the authored root shade.
    const root = [
      mid[0]! * NUKETOWN2_LAWN_ROOT_SHADE[0],
      mid[1]! * NUKETOWN2_LAWN_ROOT_SHADE[1],
      mid[2]! * NUKETOWN2_LAWN_ROOT_SHADE[2],
    ];
    expect(lumaLinear(root) / plateLuma).toBeCloseTo(GRASS_BLADE_BASE_LUMA_RATIO, 1);
    // Tip: the shader's gradient mix, tip = base x (0.3 + 0.7 x tint) at hN = 1.
    const tip = [
      mid[0]! * (0.3 + 0.7 * GRASS_BLADE_TIP_TINT[0]),
      mid[1]! * (0.3 + 0.7 * GRASS_BLADE_TIP_TINT[1]),
      mid[2]! * (0.3 + 0.7 * GRASS_BLADE_TIP_TINT[2]),
    ];
    expect(lumaLinear(tip) / plateLuma).toBeCloseTo(GRASS_BLADE_TIP_LUMA_RATIO, 1);
    // ...and the tip is a WARM catch, not a white clip: red leads, blue trails.
    expect(GRASS_BLADE_TIP_TINT[0]).toBeGreaterThan(GRASS_BLADE_TIP_TINT[1]);
    expect(GRASS_BLADE_TIP_TINT[1]).toBeGreaterThan(GRASS_BLADE_TIP_TINT[2]);
  });

  it('burns a hashed 20 % of tips brighter still', () => {
    expect(GRASS_BLADE_SUN_CATCH_FRACTION).toBe(0.2);
    expect(GRASS_BLADE_SUN_CATCH_BOOST).toBeGreaterThan(0);
    // A uniform hash stream lands exactly the authored fraction on the boost.
    let boosted = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (grassBladeSunCatchBoost(i / 1000) > 0) boosted += 1;
    }
    expect(boosted).toBe(200);
    expect(grassBladeSunCatchBoost(0)).toBe(0);
    expect(grassBladeSunCatchBoost(0.999)).toBe(GRASS_BLADE_SUN_CATCH_BOOST);
  });

  it('pins the near band: x1.6 density within 4 m of the review-close footprints', () => {
    expect(NUKETOWN2_LAWN_NEAR_BAND_RADIUS_M).toBe(4);
    expect(NUKETOWN2_LAWN_NEAR_BAND_DENSITY).toBe(1.6);
    const points = nuketown2LawnNearBandPoints();
    // Five ground-level yard stations, eye + target each.
    expect(points).toHaveLength(10);
    const authored: Array<readonly [number, number]> = [
      [-12, -31], [-1.25, -21.5],
      [12, 31], [1.25, 21.5],
      [-5.4, -29.1], [-2.0, -33.2],
      [12.0, -29.4], [8.6, -33.6],
      [17.3, -22.5], [14.2, -25.6],
    ];
    for (let i = 0; i < authored.length; i += 1) {
      expect(points[i]![0]).toBeCloseTo(nuketown2HandedX(authored[i]![0]), 9);
      expect(points[i]![1]).toBeCloseTo(authored[i]![1], 9);
    }
    const band = nuketown2LawnNearBand();
    expect(band.radiusM).toBe(4);
    expect(band.densityFactor).toBe(1.6);
    expect(band.points).toHaveLength(10);
  });

  it('measures the band density on a synthetic field: ~1.6x inside, identical outside', () => {
    const base = {
      name: 'band-synth',
      seed: 0x1a2,
      regions: [{ minX: -5, maxX: 5, minZ: -5, maxZ: 5 }],
      cellSizeM: 0.5,
      bladeHeightM: 0.22,
      bladesPerTuft: 1,
      scaleRange: [1, 1] as [number, number],
      material: { color: 0xffffff, swayAmount: 0 },
      tint: null,
    } as const;
    const plain = buildInstancedGrassField({ ...base });
    const far = buildInstancedGrassField({
      ...base, nearBand: { points: [[40, 40] as const], radiusM: 4, densityFactor: 1.6 },
    });
    // A band nowhere near the region draws no twin chance: byte-identical stream.
    expect(far.stats.blades).toBe(plain.stats.blades);
    const near = buildInstancedGrassField({
      ...base, nearBand: { points: [[0, 0] as const], radiusM: 4, densityFactor: 1.6 },
    });
    expect(near.stats.blades).toBeGreaterThan(plain.stats.blades * 1.15);
    expect(near.stats.blades).toBeLessThan(plain.stats.blades * 1.6);
    expect(near.stats.drawCalls).toBe(plain.stats.drawCalls);
    plain.dispose();
    far.dispose();
    near.dispose();
  });

  it('jitters height 0.7x-1.4x and leans 0-25 deg without clearing the cap', () => {
    expect(NUKETOWN2_LAWN_SCALE_RANGE[0]).toBe(0.7);
    expect(NUKETOWN2_LAWN_SCALE_RANGE[1]).toBe(1);
    // Tallest/shortest 1.43x: the brief's 1.4x band with the cap intact.
    expect(NUKETOWN2_LAWN_SCALE_RANGE[1] / NUKETOWN2_LAWN_SCALE_RANGE[0]).toBeCloseTo(1.43, 1);
    expect(GRASS_BLADE_LEAN_MAX_DEG).toBe(25);
    const field = buildInstancedGrassField({
      name: 'lean-synth',
      seed: 0x9e3779b9,
      regions: [{ minX: -4, maxX: 4, minZ: -4, maxZ: 4 }],
      cellSizeM: 0.4,
      bladeHeightM: 0.22,
      bladesPerTuft: 1,
      scaleRange: [0.7, 1],
      leanMaxDeg: GRASS_BLADE_LEAN_MAX_DEG,
      material: { color: 0xffffff, swayAmount: 0 },
      tint: null,
    });
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3();
    let maxTilt = 0;
    let tiltSum = 0;
    let n = 0;
    for (const mesh of field.meshes) {
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, matrix);
        matrix.decompose(position, quaternion, scale);
        expect(scale.y).toBeGreaterThanOrEqual(0.7 - 1e-6);
        expect(scale.y).toBeLessThanOrEqual(1 + 1e-6);
        up.set(0, 1, 0).applyQuaternion(quaternion);
        const tilt = (Math.acos(Math.min(1, Math.max(-1, up.y))) * 180) / Math.PI;
        maxTilt = Math.max(maxTilt, tilt);
        tiltSum += tilt;
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(100);
    expect(maxTilt).toBeLessThanOrEqual(25.01);
    // The jitter is real, not a pinned zero with a wide ceiling.
    expect(maxTilt).toBeGreaterThan(10);
    expect(tiltSum / n).toBeGreaterThan(3);
    field.dispose();
  });

  it('tapers the blade to a point: a blade silhouette, not a card', () => {
    expect(GRASS_BLADE_TAPER).toBe(0.92);
    const geometry = createGrassBladeGeometry(0.22, 0.062, 0.055, 'taper-probe');
    const pos = geometry.getAttribute('position');
    // 3 rows of pairs + 1 tip vertex.
    expect(pos.count).toBe(7);
    const widths: number[] = [];
    for (let row = 0; row < 3; row += 1) {
      widths.push(Math.abs(pos.getX(row * 2 + 1) - pos.getX(row * 2)));
    }
    // Strictly narrowing, top row under 42 % of the root, tip on the centreline.
    expect(widths[1]!).toBeLessThan(widths[0]!);
    expect(widths[2]!).toBeLessThan(widths[1]!);
    expect(widths[2]! / widths[0]!).toBeLessThanOrEqual(0.42);
    expect(pos.getX(6)).toBeCloseTo(0.055, 6);
    expect(pos.getY(6)).toBeCloseTo(0.22, 6);
    geometry.dispose();
    expect(GRASS_BLADE_TRIANGLES).toBe(5);
  });

  it('drops the plate one -6 % luma step with hue and p10 intact', () => {
    const ratio = lumaSrgb(NEW_PLATE_SRGB) / lumaSrgb(OLD_PLATE_SRGB);
    expect(ratio).toBeCloseTo(0.94, 1);
    const [oldHue] = hueSat(OLD_PLATE_SRGB);
    const [newHue] = hueSat(NEW_PLATE_SRGB);
    expect(hueDiff(newHue, oldHue)).toBeLessThanOrEqual(2);
    // The lawn p10 floor is far above the gate: every channel well above 10.
    for (const channel of NEW_PLATE_SRGB) expect(channel).toBeGreaterThanOrEqual(10);
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    for (const role of ['lawn', 'ground', 'planter'] as const) {
      const c = (registry[role] as THREE.Material & { color: THREE.Color }).color;
      expect(c.getHex(), `registry plate '${role}'`).toBe(
        role === 'lawn' ? 0x646536 : role === 'ground' ? 0x5e5f3c : 0x57602f,
      );
    }
  });

  it('keeps the composed blade+plate mix within 8 deg of the lawn-tone board target', () => {
    const plate = plateLinear();
    const mid = bladeMidLinear();
    const mix = [(plate[0]! + mid[0]!) / 2, (plate[1]! + mid[1]!) / 2, (plate[2]! + mid[2]!) / 2];
    const [hue] = hueSat([toSrgb(mix[0]!), toSrgb(mix[1]!), toSrgb(mix[2]!)]);
    const [boardHue] = hueSat(BOARD_LAWN_SRGB);
    expect(hueDiff(hue, boardHue)).toBeLessThanOrEqual(8);
  });

  it('holds the tris delta <= 60k with draws unchanged (instanced twins)', () => {
    const scene = new THREE.Scene();
    const map = buildNuketown2(scene);
    const stats = map.root.userData.nuketown2LawnStats as {
      blades: number; drawCalls: number; triangles: number; regions: number;
    };
    // Pre-muse-lawn2 census: 8,303 tufts / 124,545 tris / 11 draws / 17 regions.
    // Twins only ADD inside the near band and reuse the region meshes.
    expect(stats.drawCalls).toBe(11);
    expect(stats.regions).toBe(17);
    expect(stats.triangles).toBeLessThanOrEqual(124545 + 60000);
    expect(stats.blades).toBeGreaterThan(8303);
    expect(stats.triangles).toBe(stats.blades * GRASS_BLADE_TRIANGLES * 3);
    process.stdout.write(
      `\n[MUSE-LAWN2] lawn blades=${stats.blades} tris=${stats.triangles} draws=${stats.drawCalls} `
      + `(delta blades=${stats.blades - 8303} tris=${stats.triangles - 124545})\n`,
    );
  });
});
