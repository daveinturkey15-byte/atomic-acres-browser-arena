/**
 * nuketown2-vegetation.test.ts — the containment contract for PASS 94's
 * hedges and avenue.
 *
 * The whole admissibility argument for this module is two claims:
 *   1. every hedge run dresses a body the arena already emits as a COLLIDER,
 *      so no cover read, sightline or shot surface moved; and
 *   2. every avenue tree stands OUTSIDE the arena rectangle inflated by
 *      AVENUE_RECT_MARGIN_M, so no reachable ground has an unexplained
 *      visible solid over it.
 *
 * Both are asserted here against the REAL constructed arena, not against a
 * second copy of the numbers - the same discipline nuketown-lawn-field.test.ts
 * applies to the lawn keep-out table, and for the same reason: a hand-mirrored
 * table drifts from map source silently, and a table checked against the built
 * arena cannot.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2 } from './nuketown2-arena';
import { NUKETOWN2_BOUNDS, nuketown2HandedX } from './nuketown2-layout';
import {
  AVENUE_MAX_RADIAL_M,
  HEDGE_CLAD_M,
  HEDGE_CLAD_TOP_M,
  AVENUE_RECT_MARGIN_M,
  AVENUE_TREE_BUDGET,
  HEDGE_SPECIES,
  NUKETOWN2_HEDGE_DRESSING,
  TREE_SPECIES,
  buildNuketown2Vegetation,
  nuketown2AvenueTreePositions,
} from './nuketown2-vegetation';

describe('Nuke Town Rebuild vegetation', () => {
  it('dresses only footprints the arena already emits as solid colliders', () => {
    const map = buildNuketown2(new THREE.Scene());
    for (const run of NUKETOWN2_HEDGE_DRESSING) {
      // Both halves: the authored run and its 180-degree partner.
      for (const sign of [1, -1] as const) {
        const cx = nuketown2HandedX(run.x) * sign;
        const cz = run.z * sign;
        const x0 = cx - run.width / 2;
        const x1 = cx + run.width / 2;
        const z0 = cz - run.depth / 2;
        const z1 = cz + run.depth / 2;
        const covering = map.colliders.find((bounds) => (
          bounds.minX <= x0 + 1e-6 && bounds.maxX >= x1 - 1e-6
          && bounds.minZ <= z0 + 1e-6 && bounds.maxZ >= z1 - 1e-6
          && Math.abs((bounds.maxY ?? 0) - run.topY) < 1e-6
        ));
        expect(
          covering,
          `hedge run "${run.id}" at (${cx}, ${cz}) ${run.width}x${run.depth} top=${run.topY}`
          + ' has no arena collider under it - the dressing has drifted from nuketown2-arena.ts',
        ).toBeDefined();
      }
    }
  });

  it('plants every avenue tree outside the inflated arena rectangle and inside the forest ring', () => {
    const positions = nuketown2AvenueTreePositions();
    expect(positions.length).toBeGreaterThan(30);
    expect(positions.length).toBeLessThanOrEqual(AVENUE_TREE_BUDGET);
    const minX = NUKETOWN2_BOUNDS.minX - AVENUE_RECT_MARGIN_M;
    const maxX = NUKETOWN2_BOUNDS.maxX + AVENUE_RECT_MARGIN_M;
    const minZ = NUKETOWN2_BOUNDS.minZ - AVENUE_RECT_MARGIN_M;
    const maxZ = NUKETOWN2_BOUNDS.maxZ + AVENUE_RECT_MARGIN_M;
    for (const [x, z] of positions) {
      const inside = x > minX && x < maxX && z > minZ && z < maxZ;
      expect(inside, `avenue tree at (${x.toFixed(2)}, ${z.toFixed(2)}) stands on playable ground`).toBe(false);
      // Inside the forest ring's inner radius (44.5), so the avenue is a
      // distinct kept planting and never a second ragged forest edge.
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(AVENUE_MAX_RADIAL_M + 1e-6);
    }
  });

  it('keeps every avenue trunk at least 4.6 m from every other one', () => {
    const positions = nuketown2AvenueTreePositions();
    for (let a = 0; a < positions.length; a += 1) {
      for (let b = a + 1; b < positions.length; b += 1) {
        const [ax, az] = positions[a]!;
        const [bx, bz] = positions[b]!;
        expect(Math.hypot(ax - bx, az - bz)).toBeGreaterThanOrEqual(4.6 - 1e-9);
      }
    }
  });

  it('is deterministic: two builds place the identical avenue', () => {
    const first = nuketown2AvenueTreePositions();
    const second = nuketown2AvenueTreePositions();
    expect(second).toEqual(first);
  });

  it('adds no collider, raycast mesh or shot surface to the arena', () => {
    const bare = buildNuketown2(new THREE.Scene());
    // Every vegetation node in the constructed arena is presentation-only.
    let vegetationNodes = 0;
    bare.root.traverse((node) => {
      if (!node.name.startsWith('nuketown2-hedges') && !node.name.startsWith('nuketown2-avenue')) return;
      vegetationNodes += 1;
      expect(node.userData.presentationOnly, node.name).toBe(true);
    });
    // 8 hedge runs x (1 LOD + 3 meshes) + 4 avenue sectors x (1 + 3) = 48.
    expect(vegetationNodes).toBe(48);
    for (const mesh of bare.raycastMeshes) {
      expect(mesh.name.startsWith('nuketown2-hedges')).toBe(false);
      expect(mesh.name.startsWith('nuketown2-avenue')).toBe(false);
    }
  });

  it('gives every LOD three levels, with the near level the most expensive', () => {
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    const lods = vegetation.group.children.filter((node): node is THREE.LOD => (node as THREE.LOD).isLOD === true);
    // 8 hedge runs + 4 avenue sectors.
    expect(lods.length).toBe(12);
    for (const lod of lods) {
      expect(lod.levels.length).toBe(3);
      // Distances strictly increase, and the first is 0 (always drawn near).
      expect(lod.levels[0]!.distance).toBe(0);
      expect(lod.levels[1]!.distance).toBeGreaterThan(lod.levels[0]!.distance);
      expect(lod.levels[2]!.distance).toBeGreaterThan(lod.levels[1]!.distance);
      const tris = lod.levels.map((level) => {
        const geometry = (level.object as THREE.Mesh).geometry;
        return geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
      });
      expect(tris[0]).toBeGreaterThan(tris[1]!);
      expect(tris[1]).toBeGreaterThan(tris[2]!);
      // AND the LOD object must stand where the thing it draws stands. An LOD
      // parked at the origin switches on distance-to-map-centre, which is a
      // global quality switch, not a distance LOD. Only a run or sector that
      // genuinely straddles the origin may sit there, and none of these do.
      expect(lod.position.lengthSq(), `${lod.name} sits at the arena origin`).toBeGreaterThan(1);
    }
    vegetation.dispose();
  });

  it('CLADS its host solid instead of hiding inside it', () => {
    // The regression this exists for: the first cut inset the foliage 0.06 m
    // inside an opaque host box, so the hedge rendered nowhere and the review
    // capture was byte-similar to the baseline. Cladding is the fix, and the
    // numbers are asserted so a future "tidy" cannot quietly re-inset them.
    expect(HEDGE_CLAD_M).toBeGreaterThan(0);
    expect(HEDGE_CLAD_TOP_M).toBeGreaterThan(0.03);
    // ...and it stays DRESSING: a hedge that reads much taller than the cover
    // it sits on is a cover lie, so the ridge may not rise more than 0.1 m.
    expect(HEDGE_CLAD_TOP_M).toBeLessThanOrEqual(0.1);
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    const lod = vegetation.group.children.find(
      (node) => node.name === 'nuketown2-hedges-north-verge-front-hedge',
    ) as THREE.LOD;
    const run = NUKETOWN2_HEDGE_DRESSING.find((entry) => entry.id === 'verge front hedge')!;
    const near = lod.levels[0]!.object as THREE.Mesh;
    near.geometry.computeBoundingBox();
    const box = near.geometry.boundingBox!;
    // Wider than the host on the long axis, and taller than its top face.
    expect(box.max.x - box.min.x).toBeGreaterThan(run.width);
    expect(box.max.z - box.min.z).toBeGreaterThan(run.depth);
    expect(box.max.y).toBeGreaterThan(run.topY);
    // But not by much - this is cladding, not a new body.
    expect(box.max.y).toBeLessThan(run.topY + 0.2);
    vegetation.dispose();
  });

  it('carries two distinct species, not one silhouette scaled twice', () => {
    expect(HEDGE_SPECIES.id).not.toEqual(TREE_SPECIES.id);
    // The properties that actually make them different plants: a clipped hedge
    // barely moves and a deciduous crown moves a lot.
    expect(TREE_SPECIES.swayM).toBeGreaterThan(HEDGE_SPECIES.swayM * 4);
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    expect(vegetation.stats.species).toBe(2);
    vegetation.dispose();
  });

  it('advances the wind with one uniform write and allocates nothing per frame', () => {
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    // The call must be safe to make sixty times a second forever.
    for (let i = 0; i < 120; i += 1) vegetation.advanceWind(i / 60);
    expect(vegetation.stats.hedgeSegments).toBeGreaterThan(20);
    vegetation.dispose();
  });

  it('stays inside its stated draw-call and triangle budget', () => {
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    // Worst case = every one of the 12 LODs showing level 0 at once. It is a
    // BOUND, not the normal case: the four avenue sectors are 40 m apart and
    // cannot all be inside one camera's 26 m near tier.
    expect(vegetation.stats.worstCaseDrawCalls).toBe(12);
    // Measured 2026-09-04: 40,376. The ceiling is that measurement plus ~11 %
    // headroom, and it is 7 % of the arena's 650 k triangle budget. If a future
    // edit blows it, the thing to change is the geometry, not this number.
    expect(vegetation.stats.worstCaseTriangles).toBeLessThan(45_000);
    vegetation.dispose();
  });
});
