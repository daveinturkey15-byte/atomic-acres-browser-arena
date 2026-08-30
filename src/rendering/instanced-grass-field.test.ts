/**
 * Contract tests for the breakable-grass crush path of the reusable instanced
 * grass field (src/rendering/instanced-grass-field.ts).
 *
 * `crushAt()` is reached from gameplay through environment-assets'
 * `group.userData.nuketownLawnCrush`, which spawnImpactFlash calls ONCE PER
 * BULLET that hits low ground. It is therefore the hottest presentation path
 * in the arena, and it carries a partial-GPU-upload optimisation: instead of
 * re-uploading the whole 767 KB instanceMatrix it pushes
 * `addUpdateRange(min * 16, span * 16)` spans onto the attribute, collapsing
 * them into one accumulated union (`pendingMin`/`pendingMax`) once
 * CRUSH_UPDATE_RANGE_LIMIT discrete ranges have piled up unrendered.
 *
 * That optimisation is exactly the shape of defect this repo keeps paying for:
 * a system that stays fully wired, keeps returning healthy counts, and
 * silently stops doing anything visible. If a reported range ever fails to
 * COVER an instance whose matrix crushAt just rewrote, the blade is flattened
 * in CPU memory and never reaches the GPU — the grass visibly does nothing
 * while `crushAt` still returns the right number and every counter is green.
 * Code review cannot see that; only these assertions can.
 *
 * What is pinned here:
 *   1. CRUSH GEOMETRY — blades inside the radius are flattened (scale.y only);
 *      blades outside keep BYTE-EXACT original Matrix4 elements.
 *   2. NEWLY-CRUSHED COUNT + IDEMPOTENCE — the return value counts only
 *      newly-crushed tufts, and a repeated identical crush returns 0 and
 *      touches no matrix and adds no upload range.
 *   3. UPLOAD COVERAGE INVARIANT — after any crushAt the attribute's reported
 *      update ranges cover EVERY instance index whose matrix actually changed
 *      (diffed against a full pre-crush snapshot, not trusted from the code).
 *   3b. GPU MIRROR — replaying three r185's own upload semantics
 *      (WebGPUAttributeUtils.updateBuffer: full write when updateRanges is
 *      empty, otherwise range writes followed by clearUpdateRanges) leaves a
 *      mirror buffer BYTE-IDENTICAL to the CPU array, across the rendered,
 *      the frustum-culled (ranges accumulate past the limit), and the mixed
 *      cadences. This is the assertion that would catch the silent no-op.
 *   4. SPATIAL-HASH COMPLETENESS OVER THE REAL ARENA — the crush broad phase
 *      is checked against brute force at points spanning the whole ±37 × ±30
 *      arena, including negative cells and the bounds corners. The module's
 *      key comment claims ±4096 cells / ±8 km of headroom; this exercises the
 *      claim end-to-end instead of restating its formula.
 *   5. OUT-OF-FIELD CRUSH — a crush nowhere near the field returns 0, changes
 *      nothing, and queues no upload range.
 *
 * Headless: vitest has no WebGPU and no document, so the field takes its node
 * material route and nothing but InstancedMesh/BufferGeometry is constructed.
 * No renderer is created; renderer upload behaviour is replayed by hand.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARENA_BOUNDS } from '../arena-layout';
import { buildNuketownLawnField } from '../nuketown-lawn-field';
import {
  buildInstancedGrassField,
  type GrassRegionRect,
  type InstancedGrassField,
} from './instanced-grass-field';

/** The flattened height the module composes onto a crushed tuft. */
const CRUSHED_SCALE_Y = 0.06;
/** Matrix4 elements per instance in an InstancedMesh instanceMatrix. */
const ELEMENTS_PER_INSTANCE = 16;

/**
 * Two lawn bands spanning the full arena footprint, so the crush index is
 * exercised over negative AND positive broad-phase cells and right up to the
 * authored bounds. A keep-out hole is punched through both bands so instance
 * indices are NOT a clean grid — the update-range span logic must survive
 * placement rejections, which is how the real lawn is built.
 */
const TEST_REGIONS: readonly GrassRegionRect[] = Object.freeze([
  Object.freeze({ minX: ARENA_BOUNDS.minX, maxX: ARENA_BOUNDS.maxX, minZ: ARENA_BOUNDS.minZ, maxZ: -9 }),
  Object.freeze({ minX: ARENA_BOUNDS.minX, maxX: ARENA_BOUNDS.maxX, minZ: 9, maxZ: ARENA_BOUNDS.maxZ }),
]);

function keepOut(x: number, z: number): boolean {
  // Two rectangular props, mirrored, plus a circular one: enough rejection to
  // make placement indices sparse and irregular.
  if (x > -14 && x < -4 && z > -22 && z < -14) return false;
  if (x > 6 && x < 18 && z > 14 && z < 24) return false;
  const dx = x - 24;
  const dz = z + 20;
  return dx * dx + dz * dz > 9;
}

function buildTestField(cellSizeM = 1): InstancedGrassField {
  return buildInstancedGrassField({
    name: 'test-lawn',
    seed: 0x5eed_1234,
    regions: TEST_REGIONS,
    cellSizeM,
    bladeHeightM: 0.22,
    bladeWidthM: 0.062,
    bladeBendM: 0.055,
    bladesPerTuft: 3,
    scaleRange: [0.68, 1],
    placementAllowed: keepOut,
    material: { color: 0x61a244, swayAmount: 0.045, windSpeed: 0.8 },
  });
}

type Snapshot = readonly Float32Array[];

function snapshotMatrices(field: InstancedGrassField): Snapshot {
  return field.meshes.map((mesh) => Float32Array.from(mesh.instanceMatrix.array as Float32Array));
}

/** Instance indices whose Matrix4 differs from the snapshot, by raw element. */
function changedInstances(mesh: THREE.InstancedMesh, before: Float32Array): number[] {
  const array = mesh.instanceMatrix.array as Float32Array;
  const changed: number[] = [];
  for (let index = 0; index < mesh.count; index += 1) {
    const base = index * ELEMENTS_PER_INSTANCE;
    for (let element = 0; element < ELEMENTS_PER_INSTANCE; element += 1) {
      if (array[base + element] !== before[base + element]) {
        changed.push(index);
        break;
      }
    }
  }
  return changed;
}

/** Instance indices the attribute's queued update ranges actually cover. */
function coveredInstances(mesh: THREE.InstancedMesh): Set<number> {
  const attribute = mesh.instanceMatrix;
  const covered = new Set<number>();
  for (const range of attribute.updateRanges) {
    // Ranges are in ARRAY elements; a partial matrix upload would be corrupt.
    expect(range.start % ELEMENTS_PER_INSTANCE).toBe(0);
    expect(range.count % ELEMENTS_PER_INSTANCE).toBe(0);
    expect(range.start).toBeGreaterThanOrEqual(0);
    expect(range.start + range.count).toBeLessThanOrEqual(attribute.array.length);
    const first = range.start / ELEMENTS_PER_INSTANCE;
    const last = (range.start + range.count) / ELEMENTS_PER_INSTANCE;
    for (let index = first; index < last; index += 1) covered.add(index);
  }
  return covered;
}

/** Planar origin of every instance, read back out of the composed matrices. */
function instanceOrigins(mesh: THREE.InstancedMesh): Array<{ x: number; z: number }> {
  const array = mesh.instanceMatrix.array as Float32Array;
  const origins: Array<{ x: number; z: number }> = [];
  for (let index = 0; index < mesh.count; index += 1) {
    origins.push({ x: array[index * 16 + 12], z: array[index * 16 + 14] });
  }
  return origins;
}

/**
 * Replay of three r185's own attribute upload (WebGPUAttributeUtils.updateBuffer
 * and WebGLAttributeUtils.updateBuffer are identical in coverage terms): an
 * empty range list means a full write, otherwise only the listed ranges are
 * written and the list is cleared. Anything the module fails to declare is
 * simply never seen by the GPU.
 */
function uploadLikeRenderer(mesh: THREE.InstancedMesh, gpu: Float32Array): void {
  const attribute = mesh.instanceMatrix;
  const array = attribute.array as Float32Array;
  if (attribute.updateRanges.length === 0) {
    gpu.set(array);
    return;
  }
  for (const range of attribute.updateRanges) {
    gpu.set(array.subarray(range.start, range.start + range.count), range.start);
  }
  attribute.clearUpdateRanges();
}

function newGpuMirror(field: InstancedGrassField): Float32Array[] {
  // First frame: nothing has queued a range yet, so the renderer uploads the
  // whole buffer, exactly as it does for a freshly built field.
  return field.meshes.map((mesh) => {
    const gpu = new Float32Array((mesh.instanceMatrix.array as Float32Array).length);
    gpu.set(mesh.instanceMatrix.array as Float32Array);
    mesh.instanceMatrix.clearUpdateRanges();
    return gpu;
  });
}

/** A grid of crush points that lands inside the lawn bands. */
function crushPointGrid(): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [];
  for (const z of [-29.2, -24, -18.5, -11, 10.4, 16, 22.7, 29.1]) {
    for (const x of [-36.4, -27, -13.5, -0.5, 8.2, 21, 33, 36.6]) {
      points.push({ x, z });
    }
  }
  return points;
}

describe('instanced grass field — breakable crush', () => {
  it('flattens only blades inside the radius and leaves every other matrix byte-exact', () => {
    const field = buildTestField();
    expect(field.stats.blades).toBeGreaterThan(1_000);
    expect(field.meshes.length).toBe(2);

    const before = snapshotMatrices(field);
    const cx = -20;
    const cz = -20;
    const radius = 1.4;

    const expectedInside = field.meshes.map((mesh) =>
      new Set(
        instanceOrigins(mesh)
          .map((origin, index) => ({ origin, index }))
          .filter(({ origin }) => (origin.x - cx) ** 2 + (origin.z - cz) ** 2 <= radius * radius)
          .map(({ index }) => index),
      ),
    );
    const expectedTotal = expectedInside.reduce((sum, set) => sum + set.size, 0);
    expect(expectedTotal).toBeGreaterThan(3); // the probe must actually hit grass

    const crushed = field.crushAt(cx, cz, radius);
    expect(crushed).toBe(expectedTotal);

    const scratchBefore = new THREE.Matrix4();
    const scratchAfter = new THREE.Matrix4();
    const p0 = new THREE.Vector3();
    const q0 = new THREE.Quaternion();
    const s0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const q1 = new THREE.Quaternion();
    const s1 = new THREE.Vector3();

    field.meshes.forEach((mesh, meshIndex) => {
      const previous = before[meshIndex];
      const inside = expectedInside[meshIndex];
      const array = mesh.instanceMatrix.array as Float32Array;
      for (let index = 0; index < mesh.count; index += 1) {
        const base = index * ELEMENTS_PER_INSTANCE;
        if (!inside.has(index)) {
          // EXACT full-matrix equality — not just "still tall".
          for (let element = 0; element < ELEMENTS_PER_INSTANCE; element += 1) {
            expect(array[base + element]).toBe(previous[base + element]);
          }
          continue;
        }
        scratchBefore.fromArray(previous, base);
        scratchAfter.fromArray(array, base);
        scratchBefore.decompose(p0, q0, s0);
        scratchAfter.decompose(p1, q1, s1);
        // Height collapses; footprint, rotation and root position survive.
        expect(s0.y).toBeGreaterThan(0.6);
        expect(s1.y).toBeCloseTo(CRUSHED_SCALE_Y, 6);
        expect(s1.x).toBeCloseTo(s0.x, 5);
        expect(s1.z).toBeCloseTo(s0.z, 5);
        expect(p1.x).toBe(p0.x);
        expect(p1.y).toBe(p0.y);
        expect(p1.z).toBe(p0.z);
        expect(q1.angleTo(q0)).toBeLessThan(1e-5);
      }
    });

    field.dispose();
  });

  it('returns only NEWLY crushed tufts and re-crushing the same circle is a total no-op', () => {
    const field = buildTestField();
    const first = field.crushAt(4, 18, 2.2);
    expect(first).toBeGreaterThan(5);

    const afterFirst = snapshotMatrices(field);
    for (const mesh of field.meshes) mesh.instanceMatrix.clearUpdateRanges();

    const second = field.crushAt(4, 18, 2.2);
    expect(second).toBe(0);
    field.meshes.forEach((mesh, meshIndex) => {
      expect(changedInstances(mesh, afterFirst[meshIndex])).toEqual([]);
      // No matrices changed, so nothing may be queued for upload either.
      expect(mesh.instanceMatrix.updateRanges).toEqual([]);
    });

    // A concentric LARGER circle re-reports only the ring it adds.
    const widened = field.crushAt(4, 18, 3.4);
    expect(widened).toBeGreaterThan(0);
    const changedByWidening = field.meshes.reduce(
      (sum, mesh, meshIndex) => sum + changedInstances(mesh, afterFirst[meshIndex]).length,
      0,
    );
    expect(widened).toBe(changedByWidening);

    field.dispose();
  });

  it('UPLOAD COVERAGE: every instance index whose matrix changed is inside a reported update range', () => {
    const field = buildTestField();
    let everCovered = 0;

    for (const point of crushPointGrid()) {
      const before = snapshotMatrices(field);
      const versions = field.meshes.map((mesh) => mesh.instanceMatrix.version);
      for (const mesh of field.meshes) mesh.instanceMatrix.clearUpdateRanges();

      const crushed = field.crushAt(point.x, point.z, 1.1);
      let changedTotal = 0;

      field.meshes.forEach((mesh, meshIndex) => {
        const changed = changedInstances(mesh, before[meshIndex]);
        changedTotal += changed.length;
        if (changed.length === 0) return;
        const covered = coveredInstances(mesh);
        for (const index of changed) {
          expect(
            covered.has(index),
            `instance ${index} of ${mesh.name} was rewritten but no update range covers it `
              + `(ranges ${JSON.stringify(mesh.instanceMatrix.updateRanges)}) — it would be crushed on the CPU `
              + 'and never uploaded, i.e. the grass silently does nothing',
          ).toBe(true);
        }
        // The task's stated form of the invariant, kept explicit.
        expect(Math.min(...covered)).toBeLessThanOrEqual(Math.min(...changed));
        expect(Math.max(...covered)).toBeGreaterThanOrEqual(Math.max(...changed));
        // needsUpdate is write-only in three; the version bump is what makes
        // the renderer look at the attribute at all.
        expect(mesh.instanceMatrix.version).toBeGreaterThan(versions[meshIndex]);
        everCovered += changed.length;
      });

      expect(changedTotal).toBe(crushed);
    }

    expect(everCovered).toBeGreaterThan(100); // the sweep really did crush grass
    field.dispose();
  });

  it('GPU MIRROR: replaying three’s upload leaves the buffer byte-identical, rendered or frustum-culled', () => {
    // Cadence A — uploaded every frame (mesh on screen).
    const rendered = buildTestField();
    const gpuA = newGpuMirror(rendered);
    for (const point of crushPointGrid()) {
      rendered.crushAt(point.x, point.z, 0.9);
      rendered.meshes.forEach((mesh, index) => uploadLikeRenderer(mesh, gpuA[index]));
    }
    rendered.meshes.forEach((mesh, index) => {
      expect(Array.from(gpuA[index])).toEqual(Array.from(mesh.instanceMatrix.array as Float32Array));
    });
    rendered.dispose();

    // Cadence B — frustum-culled for the whole burst, so ranges accumulate
    // past CRUSH_UPDATE_RANGE_LIMIT and collapse into the pending union, then
    // one upload has to carry everything.
    const culled = buildTestField();
    const gpuB = newGpuMirror(culled);
    const burst = crushPointGrid();
    expect(burst.length).toBeGreaterThan(8 * 2); // must cross the range limit twice over
    for (const point of burst) culled.crushAt(point.x, point.z, 0.9);
    culled.meshes.forEach((mesh, index) => uploadLikeRenderer(mesh, gpuB[index]));
    culled.meshes.forEach((mesh, index) => {
      expect(Array.from(gpuB[index])).toEqual(Array.from(mesh.instanceMatrix.array as Float32Array));
    });
    culled.dispose();

    // Cadence C — intermittent (culled for a few frames, then visible), the
    // case where a stale accumulated union is most likely to under-cover.
    const mixed = buildTestField();
    const gpuC = newGpuMirror(mixed);
    crushPointGrid().forEach((point, step) => {
      mixed.crushAt(point.x, point.z, 1.3);
      if (step % 5 === 4) mixed.meshes.forEach((mesh, index) => uploadLikeRenderer(mesh, gpuC[index]));
    });
    mixed.meshes.forEach((mesh, index) => uploadLikeRenderer(mesh, gpuC[index]));
    mixed.meshes.forEach((mesh, index) => {
      expect(Array.from(gpuC[index])).toEqual(Array.from(mesh.instanceMatrix.array as Float32Array));
    });
    mixed.dispose();
  });

  it('crush broad phase matches brute force everywhere inside the real arena bounds', () => {
    // The crush cell key claims ±4096 cells (±8 km) of headroom against a
    // ±37 × ±30 m arena. Verify the guarantee that claim exists to provide —
    // that the hash never loses a blade — over the whole arena, corners and
    // negative cells included, rather than trusting the comment.
    const field = buildTestField();
    const origins = field.meshes.map(instanceOrigins);
    const alreadyCrushed = field.meshes.map(() => new Set<number>());

    const probes: Array<{ x: number; z: number; r: number }> = [];
    for (const z of [-30, -29.9, -25.3, -19, -12.7, -9.05, 9.05, 13.4, 20, 26.6, 29.9, 30]) {
      for (const x of [-37, -36.9, -30.2, -19, -8.4, -0.001, 0.001, 7.7, 18.3, 29.5, 36.9, 37]) {
        probes.push({ x, z, r: 1.7 });
      }
    }
    // Cell-boundary probes: CRUSH_CELL_M is 2 m, so these straddle four cells,
    // including the sign flip at the origin where Math.floor changes behaviour.
    for (const [x, z] of [[0, -10], [-2, -20], [2, 20], [-36, -28], [36, 28], [0, 10]] as const) {
      probes.push({ x, z, r: 2.6 });
    }

    let totalCrushed = 0;
    for (const probe of probes) {
      const before = snapshotMatrices(field);
      const expected = field.meshes.map((_mesh, meshIndex) => {
        const set = new Set<number>();
        origins[meshIndex].forEach((origin, index) => {
          if (alreadyCrushed[meshIndex].has(index)) return;
          const dx = origin.x - probe.x;
          const dz = origin.z - probe.z;
          if (dx * dx + dz * dz <= probe.r * probe.r) set.add(index);
        });
        return set;
      });
      const expectedTotal = expected.reduce((sum, set) => sum + set.size, 0);

      const crushed = field.crushAt(probe.x, probe.z, probe.r);
      expect(
        crushed,
        `crushAt(${probe.x}, ${probe.z}, ${probe.r}) reported ${crushed} but ${expectedTotal} `
          + 'uncrushed tufts sit inside that circle — the broad phase lost blades',
      ).toBe(expectedTotal);

      field.meshes.forEach((mesh, meshIndex) => {
        expect(new Set(changedInstances(mesh, before[meshIndex]))).toEqual(expected[meshIndex]);
        for (const index of expected[meshIndex]) alreadyCrushed[meshIndex].add(index);
      });
      totalCrushed += crushed;
    }

    expect(totalCrushed).toBeGreaterThan(500);
    field.dispose();
  });

  it('a crush entirely outside the field changes nothing, queues nothing and returns 0', () => {
    const field = buildTestField();
    const before = snapshotMatrices(field);

    for (const [x, z] of [[0, 0], [500, 500], [-500, -500], [0, -4], [-37 - 50, 0]] as const) {
      expect(field.crushAt(x, z, 3)).toBe(0);
    }

    field.meshes.forEach((mesh, meshIndex) => {
      expect(changedInstances(mesh, before[meshIndex])).toEqual([]);
      expect(mesh.instanceMatrix.updateRanges).toEqual([]);
    });

    // Zero radius on top of the field is also a no-op unless a blade origin
    // sits exactly under the point.
    expect(field.crushAt(-20, -20, 0)).toBe(0);

    field.dispose();
  });

  it('holds the upload-coverage invariant on the REAL Nuke Town lawn field', () => {
    // The production field: real regions, real keep-outs, real cell size, and
    // the row-major span assumption the optimisation's KB numbers rest on.
    const parent = new THREE.Group();
    const field = buildNuketownLawnField(parent, true);
    expect(field.stats.blades).toBeGreaterThan(3_000);

    const gpu = newGpuMirror(field);
    // Bullet-scale crushes (0.3 m) and one blast-scale crush (3 m), the two
    // radii spawnImpactFlash actually drives.
    const shots: Array<{ x: number; z: number; r: number }> = [
      { x: -24, z: -14, r: 0.3 }, { x: -23.7, z: -14.2, r: 0.3 }, { x: 0, z: -12, r: 0.3 },
      { x: 12, z: 13.5, r: 0.3 }, { x: 30, z: 21, r: 0.3 }, { x: -33, z: 25, r: 0.3 },
      { x: -6, z: 26, r: 3 }, { x: 20, z: -20, r: 3 },
    ];

    let crushedAny = 0;
    shots.forEach((shot, step) => {
      const before = snapshotMatrices(field);
      const crushed = field.crushAt(shot.x, shot.z, shot.r);
      crushedAny += crushed;
      let changedTotal = 0;
      field.meshes.forEach((mesh, meshIndex) => {
        const changed = changedInstances(mesh, before[meshIndex]);
        changedTotal += changed.length;
        if (changed.length === 0) return;
        const covered = coveredInstances(mesh);
        for (const index of changed) {
          expect(
            covered.has(index),
            `nuketown lawn instance ${index} rewritten with no covering update range`,
          ).toBe(true);
        }
      });
      expect(changedTotal).toBe(crushed);
      // Render every other frame so both the uploaded and the accumulating
      // branch run against the production field.
      if (step % 2 === 1) field.meshes.forEach((mesh, index) => uploadLikeRenderer(mesh, gpu[index]));
    });

    expect(crushedAny).toBeGreaterThan(20);
    field.meshes.forEach((mesh, index) => uploadLikeRenderer(mesh, gpu[index]));
    field.meshes.forEach((mesh, index) => {
      expect(Array.from(gpu[index])).toEqual(Array.from(mesh.instanceMatrix.array as Float32Array));
    });

    field.dispose();
  });
});
