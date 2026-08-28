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
  FARCRYSIS_WADE_TUNING,
  PLATE_FIT_TOLERANCE_M,
} from './farcrysis-terrain-authority';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { STANCE_SHAPES, CHARACTER_PHYSICS_CONFIG } from './physics';
import {
  EYE_ABOVE_FEET_M,
  SWIM_TUNING,
  createSwimState,
  stepSwimState,
  swimMovementModifiers,
} from './water/swim-state';
import { PLAYER_JUMP_GRAVITY } from './gameplay';
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

/**
 * Standing feet-to-eye distance, derived from the real capsule constants.
 * swim-state.test.ts pins EYE_ABOVE_FEET_M against this same derivation, so
 * the water thresholds and the capsule cannot drift apart.
 */
const EYE_ABOVE_FEET = STANCE_SHAPES.stand.eyeFromCenter
  + CHARACTER_PHYSICS_CONFIG.playerHalfHeight
  + CHARACTER_PHYSICS_CONFIG.playerRadius;

/**
 * Water column standing over the player's FEET at (x, z) — the depth
 * SWIM_TUNING and FARCRYSIS_WADE_TUNING are keyed to (Pass 81 HF-393
 * body-reference correction). Before Pass 81 these probes compared
 * `FARCRYSIS_WATER_LEVEL - (feetY + EYE_ABOVE_FEET)`, i.e. depth over the
 * EYE, against the same constants — which is what let a green test coexist
 * with a swim state no player could ever reach.
 */
function waterDepthOverFeet(x: number, z: number): number {
  return FARCRYSIS_WATER_LEVEL - farcrysisTerrainHeight(x, z);
}

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
    // Offset grid (never lands on a plate seam), derived from FARCRYSIS_BOUNDS
    // so it always covers the FULL island — a hardcoded +/-31.7 window kept
    // sampling only the old 64 m island's NW quadrant after the HF-396 rescale,
    // silently skipping 3/4 of the walking surface.
    const half = FARCRYSIS_BOUNDS.maxX;
    for (let x = -half + 0.3; x < half; x += 2) {
      for (let z = -half + 0.3; z < half; z += 2) {
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
    // PASS 81: this was `half - 8` (z = 56), which the comment called dry
    // sand but which the HF-393 shelf envelope already puts 0.31 m UNDER
    // water - the envelope crosses the waterline at z = 55.18. Starting the
    // probe below the waterline shortened the measured wade span by 0.8 m and
    // skipped the whole approach flatten. half - 12 is genuinely dry.
    const drySandZ = half - 12;
    expect(FARCRYSIS_SAFETY_FLOOR_Y).toBeLessThan(farcrysisTerrainHeight(0, wallFace));

    // Probe the beach centreline from dry sand to the boundary wall's inner
    // face. Swim engages when the water column standing over the player's
    // FEET reaches SWIM_TUNING.enterDepth (chin-deep against the 1.70 m eye
    // height); the reducer converts the eye depth legacy-main measures.
    let entryZ: number | null = null;
    for (let z = drySandZ; z <= wallFace; z += 0.05) {
      if (waterDepthOverFeet(0, z) >= SWIM_TUNING.enterDepth) {
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

  // HF-393 follow-up: the centreline probe above walks the x=0 beach only,
  // where the interior hills happen to sit low near the shore. On other
  // azimuths the interior rises toward ~2.2 m while the shore shelf joins at
  // 0.2 m, so an unblended descent boundary is a cliff and the owner's
  // "you fall down into the water" reproduces on most of the beach. EVERY
  // seaward walk must satisfy the same step/grade/swim-entry contract.
  it('walks into the water from every azimuth without a step or grade violation', () => {
    const half = FARCRYSIS_BOUNDS.maxX;
    const failures: string[] = [];
    for (let deg = 0; deg < 360; deg += 15) {
      const ang = (deg * Math.PI) / 180;
      // Parametrise by Chebyshev distance-inward so max(|x|,|z|) matches the
      // authority's own shore-band coordinate.
      const m = Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
      const at = (distIn: number): readonly [number, number] => {
        const r = half - distIn;
        return [(r * Math.cos(ang)) / m, (r * Math.sin(ang)) / m] as const;
      };

      let entryDist: number | null = null;
      for (let d = 16; d >= 0.05; d -= 0.25) {
        const [x, z] = at(d);
        if (waterDepthOverFeet(x, z) >= SWIM_TUNING.enterDepth) {
          entryDist = d;
          break;
        }
      }
      if (entryDist === null) {
        failures.push(`${deg}deg: walking seaward never reached swim-entry depth`);
        continue;
      }

      for (let d = 16; d > entryDist + 1e-9; d -= 0.25) {
        const [x1, z1] = at(d);
        const [x2, z2] = at(d - 0.25);
        const h1 = farcrysisTerrainHeight(x1, z1);
        const h2 = farcrysisTerrainHeight(x2, z2);
        const segLen = Math.hypot(x2 - x1, z2 - z1);
        const rise = h2 - h1;
        if (rise > CHARACTER_PHYSICS_CONFIG.autostepHeight) {
          failures.push(`${deg}deg @${d.toFixed(2)}m: ${rise.toFixed(2)} m step UP seaward`);
        }
        const grade = (h1 - h2) / segLen;
        if (grade > 0.6) {
          failures.push(`${deg}deg @${d.toFixed(2)}m: downhill grade ${grade.toFixed(2)}`);
        }
      }
    }
    expect(
      failures,
      `shore walk violations (${failures.length}):\n${failures.slice(0, 12).join('\n')}`,
    ).toEqual([]);
  });

  // HF-393: progressive wade slowdown. Pure helper, farcrysis-scoped, that
  // the movement loop multiplies into player speed while wading. It must be
  // CONTINUOUS with the swim state's speed scale at enter depth - a
  // discontinuity there is exactly the "speed snap" the owner feels when
  // swimming engages.
  //
  // PASS 81 RE-PIN (deliberate contract change, not a weakened gate). The
  // previous version of this test asserted `farcrysisWadeSpeedScale(0) === 1`
  // and labelled it "dry sand". The argument is depth over the EYE, so 0 is
  // water standing level with the player's eye - total submersion - and the
  // assertion was pinning "run at full dry-land speed while underwater" as
  // correct. The tuning is now keyed to the column over the FEET and the same
  // curve is probed at real body landmarks.
  it('eases player speed from dry land to swim scale across the wade band', () => {
    const { enterDepth } = SWIM_TUNING;
    /** The helper takes eye depth; these probes are stated in feet depth. */
    const atFeetDepth = (depthOverFeet: number): number =>
      farcrysisWadeSpeedScale(depthOverFeet - EYE_ABOVE_FEET_M);

    // Dry sand, and the waterline itself: no water resistance at all.
    expect(atFeetDepth(-1)).toBe(1);
    expect(atFeetDepth(0)).toBe(1);
    expect(atFeetDepth(FARCRYSIS_WADE_TUNING.startDepth)).toBe(1);

    // The band the owner actually walks. Each landmark must resist MORE than
    // the last: this is the whole feel of a wade, and every one of these
    // measured exactly 1.000 before the re-key.
    const knee = atFeetDepth(0.5);
    const waist = atFeetDepth(1.0);
    const chest = atFeetDepth(1.35);
    expect(knee).toBeLessThan(1);
    expect(waist).toBeLessThan(knee);
    expect(chest).toBeLessThan(waist);
    // ...and by a margin a player can feel, not a rounding difference.
    expect(1 - waist).toBeGreaterThan(0.15);

    // Monotonic non-increasing across the whole wade band.
    let previous = Number.POSITIVE_INFINITY;
    for (let d = -EYE_ABOVE_FEET_M; d <= enterDepth + 0.5; d += 0.01) {
      const scale = atFeetDepth(d);
      expect(scale).toBeLessThanOrEqual(previous + 1e-12);
      expect(scale).toBeGreaterThan(0);
      previous = scale;
    }

    // Continuity: at swim-enter depth the wade scale IS the swim scale, so
    // engaging the swim state cannot step the player's speed.
    expect(atFeetDepth(enterDepth)).toBeCloseTo(SWIM_TUNING.swimSpeedScale, 12);
    expect(atFeetDepth(enterDepth + 5)).toBeCloseTo(SWIM_TUNING.swimSpeedScale, 12);
  });

  // HF-393 (Pass 81) - THE test the old suite did not have. The retired
  // swim-entry probe was geometry only: it read the terrain height, added the
  // eye offset and declared the water deep enough. That models a player
  // planted on the seabed with no vertical dynamics at all, which is why it
  // stayed green for two passes while the live game could not enter the swim
  // state on any azimuth (browser probes: artifacts/hf393-wade-r2/verdict.json
  // records "reachedSwim": false).
  //
  // This steps the ACTUAL vertical sequence of legacy-main's updatePhysics -
  // gravity, the swim block's gravity cancel and rest-depth drive, the
  // float-zone buoyancy/drag branch, then the ground clamp the character
  // controller applies - walking seaward down the beach centreline.
  //
  // It is run BOTH with and without the float-zone buoyancy branch, so the
  // contract holds whether or not the one-line `!waterSystem.swimmable` gate
  // at legacy-main.ts:24474-24480 (handed to the legacy-main lane) is applied.
  it('engages the swim state when a player actually walks into the sea', () => {
    const DT = 1 / 120;
    const REST_EYE_BELOW_SURFACE = 0.45; // legacy-main: restY = surfaceY - 0.45
    const surfaceY = FARCRYSIS_WATER_LEVEL; // mean surface; waves ride on top
    const wallFace = FARCRYSIS_BOUNDS.maxX - 0.05;
    const outsideThreshold = (FARCRYSIS_WATER.island.halfX + 0.8) * 0.98;

    function walkIntoTheSea(floatZoneBuoyancy: boolean) {
      let z = FARCRYSIS_BOUNDS.maxX - 20; // dry sand, well inland of the shelf
      let feetY = farcrysisTerrainHeight(0, z);
      let velocityY = 0;
      let grounded = true;
      let swim = createSwimState();
      let swamAtZ: number | null = null;
      let maxFeetDepth = Number.NEGATIVE_INFINITY;

      for (let frame = 0; frame < 120 * 40; frame += 1) {
        const eyeY = feetY + EYE_ABOVE_FEET;
        const depthOverEye = surfaceY - eyeY;
        maxFeetDepth = Math.max(maxFeetDepth, surfaceY - feetY);

        swim = stepSwimState(swim, { depth: depthOverEye, swimmable: true, dtSeconds: DT });
        if (swim.swimming && swamAtZ === null) swamAtZ = z;
        const modifiers = swimMovementModifiers(swim);

        velocityY += PLAYER_JUMP_GRAVITY * DT;
        if (grounded) velocityY = Math.max(0, velocityY);

        if (swim.swimming) {
          velocityY -= PLAYER_JUMP_GRAVITY * DT; // swimmers are neutrally buoyant
          const restY = surfaceY - REST_EYE_BELOW_SURFACE;
          const target = Math.max(
            -modifiers.verticalSpeed,
            Math.min(modifiers.verticalSpeed, (restY - eyeY) * 1.6),
          );
          velocityY += (target - velocityY) * Math.min(1, 7 * DT);
        }

        const outside = Math.abs(z) >= outsideThreshold;
        const inWater = outside && depthOverEye > -1.2;
        if (floatZoneBuoyancy && inWater && !swim.swimming) {
          const submerged = Math.max(0, Math.min(4, depthOverEye + 1.4));
          velocityY += submerged * 18 * DT;
          velocityY += (0 - velocityY) * Math.min(1, 1.8 * DT);
          velocityY *= Math.max(0.25, 1 - (0.7 + submerged * 0.15) * 0.65 * DT);
        }

        // Horizontal: walk seaward, slowed by the wade curve then the swim scale.
        const wadeScale = swim.swimming ? 1 : farcrysisWadeSpeedScale(depthOverEye);
        const nextZ = Math.min(wallFace, z + 4.5 * modifiers.speedScale * wadeScale * DT);

        // Vertical integrate + the controller's ground clamp.
        let nextFeetY = feetY + velocityY * DT;
        const ground = farcrysisTerrainHeight(0, nextZ);
        grounded = false;
        if (nextFeetY <= ground) {
          nextFeetY = ground;
          grounded = true;
          if (velocityY < 0) velocityY = 0;
        }
        feetY = nextFeetY;
        z = nextZ;
      }
      return { swimming: swim.swimming, swamAtZ, maxFeetDepth };
    }

    for (const floatZoneBuoyancy of [true, false]) {
      const run = walkIntoTheSea(floatZoneBuoyancy);
      const label = floatZoneBuoyancy ? 'on' : 'off';
      expect(
        run.swamAtZ,
        'walking seaward never engaged the swim state (float-zone buoyancy '
          + label + '); deepest water over the feet was '
          + run.maxFeetDepth.toFixed(3) + ' m',
      ).not.toBeNull();
      // ...and it must STAY engaged, not flicker on and immediately release.
      expect(run.swimming, 'swim state did not hold (buoyancy ' + label + ')').toBe(true);
      // Entry must happen in open water, not by clipping the boundary wall.
      expect(run.swamAtZ as number).toBeLessThan(wallFace);
    }
  });

  // The vertical loop above is a MODEL of legacy-main's updatePhysics. Pin the
  // handful of lines it models, so a change there is caught as a stale model
  // rather than passing silently against fiction.
  it('models the live updatePhysics vertical sequence', () => {
    const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(main).toContain('player.velocity.y += PLAYER_JUMP_GRAVITY * dt;');
    expect(main).toContain('player.velocity.y -= PLAYER_JUMP_GRAVITY * dt;');
    expect(main).toContain('const restY = swimSample.surfaceY - 0.45;');
    expect(main).toContain('player.velocity.y += preWater.buoyancy * dt;');
    expect(PLAYER_JUMP_GRAVITY).toBe(-24.5);
  });

  // HF-393 wiring guard (failure mode #1: green module imported by nothing).
  // farcrysisWadeSpeedScale shipped with its only importer being this file.
  // Pin the LIVE movement-loop call site in src/legacy-main.ts: the import
  // exists, and the updatePhysics swim block multiplies the wade scale into
  // BOTH horizontal speed channels, gated to swimmable water while the swim
  // state has not yet engaged (so it cannot compound with swim.speedScale).
  it('is wired into the legacy-main movement loop, not merely exported', () => {
    const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(main).toContain(
      "import { farcrysisWadeSpeedScale } from './farcrysis-terrain-authority';",
    );
    const blockStart = main.indexOf('const swimSample = waterSystem.samplePhysics(player.position);');
    expect(blockStart).toBeGreaterThan(-1);
    const blockEnd = main.indexOf('integrateHorizontalVelocity(', blockStart);
    const block = main.slice(blockStart, blockEnd);
    // Fed the same depth convention the swim reducer consumes.
    expect(block).toContain('const waterDepthOverEye = swimSample.surfaceY - player.position.y;');
    expect(block).toContain('? farcrysisWadeSpeedScale(waterDepthOverEye)');
    // Gated: dry/non-swimmable water and engaged swimming are untouched.
    expect(block).toContain('waterSystem.swimmable && !localSwimState.swimming');
    // Applied to BOTH horizontal channels, or the wade would strafe at full speed.
    expect(block).toContain('* swim.speedScale * wadeScale');
    const scaledLines = block.match(/\* swim\.speedScale \* wadeScale/g) ?? [];
    expect(scaledLines.length).toBe(2);
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
    // One-metre ground grid across the full island span + the catwalk deck
    // platform. HF-396 doubled the island (maxX 32 -> 64), so the grid is
    // 128x128; derive the count from the bounds so it tracks future resizes.
    const half = FARCRYSIS_BOUNDS.maxX;
    expect(navigation.platforms.length).toBe(2 * half * 2 * half + 1);

    // Platform elevations must be the authority's, not a third model.
    const platforms = farcrysisBotGroundPlatforms();
    for (const platform of [platforms[0], platforms[5000], platforms[10000], platforms[2 * half * 2 * half - 1]]) {
      const centreX = (platform.minX + platform.maxX) / 2;
      const centreZ = (platform.minZ + platform.maxZ) / 2;
      expect(platform.y).toBeCloseTo(farcrysisTerrainHeight(centreX, centreZ), 10);
    }
  });
});
