/**
 * HF-360 physics/visual contract tests for the farcrysis terrain authority.
 *
 * The audit found gameplay collision standing on a flat y=0 floor while the
 * rendered terrain sculpted ~2.2 m hills, THREE conflicting height models,
 * water that could never be reached on foot, and floating/buried colliders.
 * These tests pin the repaired contract:
 *
 *   (a) every former height-model call site resolves through the single
 *       authority module (mechanical source check — a re-introduced local
 *       model would pass any runtime sampling by construction);
 *   (b) the physics ground plates track the authority surface within the
 *       walking contract (+/-0.15 m) across a full arena grid, and seeded
 *       instanced dressing sits on real ground;
 *   (c) every named solid collider seats its base within 0.5 m of the
 *       authority surface (elevated-by-design pieces exempted BY NAME);
 *   (d) walking the beach centreline seaward reaches swim-entry depth before
 *       the world boundary, so the swimmable water is reachable on foot.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Box2 } from './collision';
import {
  farcrysisTerrainHeight,
  farcrysisTerrainPhysicsTiles,
  farcrysisBotGroundPlatforms,
  FARCRYSIS_WATER_LEVEL,
  FARCRYSIS_SAFETY_FLOOR_Y,
  farcrysisWadeSpeedScale,
  PLATE_FIT_TOLERANCE_M,
} from './farcrysis-terrain-authority';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { STANCE_SHAPES, CHARACTER_PHYSICS_CONFIG } from './physics';
import { SWIM_TUNING } from './water/swim-state';
import { FARCRYSIS_WATER } from './water/water-authoring';
import { buildFarcrysis } from './farcrysis';
import { enhancedPalmPlacements } from './farcrysis-palms-enhanced';

// --- canvas-free document stub (same shape the other farcrysis suites use) --
function fakeCanvasContext() {
  const gradient = () => ({ addColorStop: vi.fn() });
  const state: Record<PropertyKey, unknown> = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px sans-serif',
  };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'createImageData') {
        return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      }
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
      if (typeof prop === 'string') {
        if (!(prop in target)) target[prop] = vi.fn();
        return target[prop];
      }
      return undefined;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

function stubCanvasDocument(): void {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: (_tagName: string) => ({
      width: 0, height: 0, getContext: () => context, style: {},
      setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
    }),
    getElementById: (_id: string) => null,
    documentElement: { dataset: {} as Record<string, string> },
    body: { appendChild: () => undefined },
  });
}

/** Standing feet-to-eye distance, derived from the real capsule constants. */
const EYE_ABOVE_FEET = STANCE_SHAPES.stand.eyeFromCenter
  + CHARACTER_PHYSICS_CONFIG.playerHalfHeight
  + CHARACTER_PHYSICS_CONFIG.playerRadius;

/**
 * Height of a plate's TOP surface at (x, z), reconstructed from the Box2
 * alone (centre + rotation via THREE Euler XYZ — the same convention
 * physics.ts boxRotation feeds Rapier). This proves the collider data itself
 * realizes the surface, not merely the generator's intermediate numbers.
 */
function plateTopHeightAt(box: Box2, x: number, z: number): number {
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const minY = box.minY ?? 0;
  const maxY = box.maxY ?? 0;
  const cy = (minY + maxY) / 2;
  const halfY = (maxY - minY) / 2;
  const [rx, ry, rz] = box.rotation ?? [0, 0, 0];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
  const n = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const p = new THREE.Vector3(0, halfY, 0).applyQuaternion(q)
    .add(new THREE.Vector3(cx, cy, cz));
  return p.y - (n.x * (x - p.x) + n.z * (z - p.z)) / n.y;
}

describe('farcrysis terrain authority', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => vi.unstubAllGlobals());

  // (a) single source of truth — mechanical, because a resurrected local
  // model could agree with the authority at every sampled point today and
  // still drift tomorrow.
  it('routes every former height-model call site through the authority module', () => {
    const read = (name: string): string =>
      readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
    const consumers = [
      'farcrysis-art.ts',
      'farcrysis-vegetation.ts',
      'farcrysis-palms-enhanced.ts',
      'farcrysis-physics.ts',
      'farcrysis.ts',
    ];
    for (const name of consumers) {
      const source = read(name);
      expect(source, `${name} must import the terrain authority`).toContain("from './farcrysis-terrain-authority'");
      expect(source, `${name} must not define a local terrain model`).not.toMatch(
        /function (terrainHeight|terrainHeightAt|estimateTerrainHeight)\(/,
      );
    }
    // The art layer must not regress to per-peer randomness in placement.
    expect(read('farcrysis-art.ts')).not.toContain('Math.random()');
  });

  // (b) physics plates realize the surface within the walking contract.
  it('keeps the physics ground within +/-0.15 m of the authority across the arena', () => {
    const plates = farcrysisTerrainPhysicsTiles();
    expect(plates.length).toBeGreaterThan(200);
    // Plate budget guard: adaptive fitting must not explode into a mesh-like
    // collider soup that would drag down arena construction.
    expect(plates.length).toBeLessThan(8000);

    let checked = 0;
    let worst = 0;
    // Offset grid (never lands on a plate seam) — 32x32 = 1024 points >= 100.
    for (let x = -31.7; x < 32; x += 2) {
      for (let z = -31.7; z < 32; z += 2) {
        const plate = plates.find((candidate) =>
          x >= candidate.box.minX && x <= candidate.box.maxX
          && z >= candidate.box.minZ && z <= candidate.box.maxZ);
        expect(plate, `no ground plate covers (${x}, ${z})`).toBeTruthy();
        const error = Math.abs(plateTopHeightAt(plate!.box, x, z) - farcrysisTerrainHeight(x, z));
        if (error > worst) worst = error;
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(100);
    expect(worst, `worst plate/surface deviation ${worst.toFixed(3)} m`).toBeLessThanOrEqual(0.15);
    // The generator's own fit tolerance must stay inside the contract too.
    expect(PLATE_FIT_TOLERANCE_M).toBeLessThanOrEqual(0.15);
  });

  it('seats seeded instanced dressing on the authority surface', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);

    // Enhanced palm trunks: instance origin IS the trunk base by geometry
    // construction (the cylinder is pre-translated up by half its height).
    const trunks = scene.getObjectByName('farcrysis-art-enhanced-palm-trunks') as THREE.InstancedMesh;
    expect(trunks).toBeTruthy();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (let i = 0; i < trunks.count; i += 1) {
      trunks.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      const ground = farcrysisTerrainHeight(position.x, position.z);
      expect(
        Math.abs(position.y - ground),
        `palm trunk ${i} base ${position.y.toFixed(2)} vs ground ${ground.toFixed(2)} at (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`,
      ).toBeLessThanOrEqual(0.35);
    }

    // The placement export the trunk colliders are authored from must agree
    // with the authority too (it feeds buildFarcrysis directly).
    for (const palm of enhancedPalmPlacements()) {
      expect(Math.abs(palm.baseY - farcrysisTerrainHeight(palm.x, palm.z))).toBeLessThanOrEqual(1e-9);
    }

    // Vegetation layers that were flat-authored at y=0 (buried on hills) or
    // seated on the phantom plateau (floating in mid-air): sample their
    // instance matrices against ground + each layer's authored base offset.
    //
    // Pass 76 (intentional behaviour change): the palm layer now renders
    // through the shared enhanced-palm builder whose trunk geometry is
    // pre-translated (instance origin IS the base), so its offset is 0; and
    // the wrong-biome conifers were replaced by base-origin fan palms.
    const seatedLayers: ReadonlyArray<readonly [string, number]> = [
      ['farcrysis-vege-palm-trunks', 0],
      ['farcrysis-vege-broadleaf-trunks', 1.3],
      ['farcrysis-vege-fan-palms', 0],
      ['farcrysis-vege-dead-trunks', 1.2],
      ['farcrysis-vege-grass-tufts', 0.22],
      ['farcrysis-vege-bushes', 0.45],
    ];
    for (const [name, offset] of seatedLayers) {
      const layer = scene.getObjectByName(name) as THREE.InstancedMesh | null;
      expect(layer, `expected instanced layer ${name}`).toBeTruthy();
      for (let i = 0; i < layer!.count; i += 1) {
        layer!.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        const expected = farcrysisTerrainHeight(position.x, position.z) + offset;
        expect(
          Math.abs(position.y - expected),
          `${name}[${i}] centre ${position.y.toFixed(2)} vs seated ${expected.toFixed(2)}`,
        ).toBeLessThanOrEqual(0.35);
      }
    }
  });

  // (c) named solid colliders seat on the ground.
  it('seats every solid collider base within 0.5 m of the authority surface', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);
    const audit = arena.root.userData.farcrysisColliderAudit as ReadonlyArray<{ id: string; bounds: Box2 }>;
    expect(audit.length).toBeGreaterThan(80);

    // Elevated BY DESIGN (each earns its exemption): world-boundary walls
    // span the full water column; the catwalk is an upper deck reached by the
    // stair flight; -c1 crates and the vantage plank stack on ground-seated
    // bases; sandbag segments 1+ stack on segment 0.
    const elevatedByDesign = [
      /^farcrysis-bound-/,
      /^farcrysis-core-catwalk$/,
      /-c1$/,
      /-plank$/,
      /-seg-[1-9]\d*$/,
    ];

    const failures: string[] = [];
    for (const { id, bounds } of audit) {
      if (elevatedByDesign.some((pattern) => pattern.test(id))) continue;
      const centreX = (bounds.minX + bounds.maxX) / 2;
      const centreZ = (bounds.minZ + bounds.maxZ) / 2;
      const ground = farcrysisTerrainHeight(centreX, centreZ);
      const base = bounds.minY ?? 0;
      if (Math.abs(base - ground) > 0.5) {
        failures.push(`${id}: base ${base.toFixed(2)} vs ground ${ground.toFixed(2)} at (${centreX.toFixed(1)}, ${centreZ.toFixed(1)})`);
      }
    }
    expect(failures, `floating/buried colliders:\n${failures.join('\n')}`).toEqual([]);
  });

  // (d) swim water reachable on foot.
  it('reaches swim-entry depth walking seaward before the world boundary', () => {
    expect(FARCRYSIS_WATER.swimmable).toBe(true);
    expect(FARCRYSIS_WATER_LEVEL).toBe(FARCRYSIS_WATER.level);
    // Sanity: the safety floor sits below the deepest shore point so the
    // fail-safe plate cannot override the authored sea-floor ramp.
    // HF-396: the probe range derives from FARCRYSIS_BOUNDS so the contract
    // survives island resizes; the wall inner face is HALF - 0.05.
    const half = FARCRYSIS_BOUNDS.maxX;
    const wallFace = half - 0.05;
    const drySandZ = half - 8; // still on the beach shelf, before the shore band
    expect(FARCRYSIS_SAFETY_FLOOR_Y).toBeLessThan(farcrysisTerrainHeight(0, wallFace));

    // Probe the beach centreline from dry sand to the boundary wall's inner
    // face. Swim engages when the mean surface stands at least
    // SWIM_TUNING.enterDepth above the standing EYE (see legacy-main's
    // stepSwimState wiring: depth = surfaceY - player.position.y).
    let entryZ: number | null = null;
    for (let z = drySandZ; z <= wallFace; z += 0.05) {
      const feetY = farcrysisTerrainHeight(0, z);
      const depthOverEye = FARCRYSIS_WATER_LEVEL - (feetY + EYE_ABOVE_FEET);
      if (depthOverEye >= SWIM_TUNING.enterDepth) {
        entryZ = z;
        break;
      }
    }
    expect(entryZ, 'walking seaward never reached swim-entry depth').not.toBeNull();
    expect(entryZ!).toBeLessThan(wallFace);

    // The walk-in must be traversable: no seaward step along the probe rises
    // more than the character controller's autostep height.
    for (let z = drySandZ; z < entryZ!; z += 0.5) {
      const step = farcrysisTerrainHeight(0, z + 0.5) - farcrysisTerrainHeight(0, z);
      expect(step).toBeLessThanOrEqual(CHARACTER_PHYSICS_CONFIG.autostepHeight);
    }

    // HF-393 wade contract — the walk-in must be a SHELVED seabed, not a
    // chute. Two mechanical pins, both violated by the pre-HF-393 profile
    // (a 1:1 / 45-degree ramp over the outer 4 m):
    //
    // (1) GRADE — no seaward step along the walk-in may exceed a 0.6 grade
    //     (31 degrees). At 1:1 the capsule loses contact with tangent-plane
    //     plates at sprint speed and free-falls, which the owner described
    //     as "you fall down into the water".
    let worstGrade = 0;
    for (let z = drySandZ; z < entryZ!; z += 0.25) {
      const grade = (farcrysisTerrainHeight(0, z) - farcrysisTerrainHeight(0, z + 0.25)) / 0.25;
      if (grade > worstGrade) worstGrade = grade;
    }
    expect(worstGrade, `worst walk-in grade ${worstGrade.toFixed(2)}`).toBeLessThanOrEqual(0.6);

    // (2) WADE SPAN — at least 4 m of progressively deepening water between
    //     the seabed crossing the mean waterline and swim entry, so the
    //     player wades before the swim state engages. The old chute crossed
    //     the waterline ~2.5 m before swim depth.
    let waterlineZ: number | null = null;
    for (let z = drySandZ; z <= wallFace; z += 0.05) {
      if (farcrysisTerrainHeight(0, z) < FARCRYSIS_WATER_LEVEL) {
        waterlineZ = z;
        break;
      }
    }
    expect(waterlineZ, 'walk-in never crosses the mean waterline').not.toBeNull();
    expect(
      entryZ! - waterlineZ!,
      `wade span ${(entryZ! - waterlineZ!).toFixed(2)} m is too short to wade`,
    ).toBeGreaterThanOrEqual(4);
  });

  // HF-393: progressive wade slowdown. Pure helper, farcrysis-scoped, that
  // the movement loop multiplies into player speed while wading. It must be
  // CONTINUOUS with the swim state's speed scale at enter depth — a
  // discontinuity there is exactly the "speed snap" the owner feels when
  // swimming engages.
  it('eases player speed from dry land to swim scale across the wade band', () => {
    const { enterDepth } = SWIM_TUNING;
    // Dry sand: no water resistance at all.
    expect(farcrysisWadeSpeedScale(-1)).toBe(1);
    expect(farcrysisWadeSpeedScale(0)).toBe(1);
    // Monotonic non-increasing across the whole wade band.
    let previous = Number.POSITIVE_INFINITY;
    for (let d = 0; d <= enterDepth + 0.5; d += 0.01) {
      const scale = farcrysisWadeSpeedScale(d);
      expect(scale).toBeLessThanOrEqual(previous + 1e-12);
      expect(scale).toBeGreaterThan(0);
      previous = scale;
    }
    // Continuity: at swim-enter depth the wade scale IS the swim scale, so
    // engaging the swim state cannot step the player's speed.
    expect(farcrysisWadeSpeedScale(enterDepth)).toBeCloseTo(SWIM_TUNING.swimSpeedScale, 12);
    expect(farcrysisWadeSpeedScale(enterDepth + 5)).toBeCloseTo(SWIM_TUNING.swimSpeedScale, 12);
  });

  it('publishes bot ground platforms and the catwalk route through verticalNavigation', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);
    const navigation = arena.root.userData.verticalNavigation as {
      routes: readonly { id: string }[];
      ramps: readonly { id: string }[];
      platforms: readonly { minX: number; maxX: number; minZ: number; maxZ: number; y: number }[];
    };
    expect(navigation).toBeTruthy();
    expect(navigation.routes.some((route) => route.id === 'core-catwalk-stairs')).toBe(true);
    expect(navigation.ramps.some((ramp) => ramp.id === 'core-catwalk-stairs')).toBe(true);
    // 64x64 one-metre ground grid + the catwalk deck platform.
    expect(navigation.platforms.length).toBe(64 * 64 + 1);

    // Platform elevations must be the authority's, not a third model.
    const platforms = farcrysisBotGroundPlatforms();
    for (const platform of [platforms[0], platforms[1000], platforms[2048], platforms[4095]]) {
      const centreX = (platform.minX + platform.maxX) / 2;
      const centreZ = (platform.minZ + platform.maxZ) / 2;
      expect(platform.y).toBeCloseTo(farcrysisTerrainHeight(centreX, centreZ), 10);
    }
  });
});
