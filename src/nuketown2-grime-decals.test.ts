/**
 * nuketown2-grime-decals.test.ts — the depth-tier contract for PASS 94's grime.
 *
 * A decal set fails in exactly two ways that a screenshot will not show you:
 * it z-fights the surface it is painted on, or it quietly acquires gameplay
 * authority. Both are asserted here, and the first is asserted the strict way -
 * against the SAME footprint rules `scripts/qa/find-coplanar-pairs.ts` uses,
 * so a decal that would make that gate red fails in a unit test first.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  NUKETOWN2_BUILDING_FOOTPRINTS,
  NUKETOWN2_CARRIAGEWAY_FOOTPRINTS,
  buildNuketown2,
} from './nuketown2-arena';
import { nuketown2HandedSpan, nuketown2HandedX } from './nuketown2-layout';
import {
  GROUND_PLATE_TOP_Y,
  NUKETOWN2_GRIME_OFFSET_FACTOR,
  createNuketown2GrimeMaterials,
  nuketown2GrimeDecals,
} from './nuketown2-grime-decals';

function decals() {
  const materials = createNuketown2GrimeMaterials();
  return { materials, table: nuketown2GrimeDecals(materials) };
}

/** The world-frame building footprints, mirrored exactly as the gate does. */
function worldBuildingFootprints(): { x0: number; x1: number; z0: number; z1: number }[] {
  const world = NUKETOWN2_BUILDING_FOOTPRINTS.map((footprint) => {
    const [x0, x1] = nuketown2HandedSpan(footprint.x0, footprint.x1);
    return { x0, x1, z0: footprint.z0, z1: footprint.z1 };
  });
  return [...world, ...world.map((f) => ({ x0: -f.x1, x1: -f.x0, z0: -f.z1, z1: -f.z0 }))];
}

describe('Nuke Town Rebuild grime decals', () => {
  it('keeps every GROUND decal out of the carriageway, where an offset would not fence it', () => {
    const { materials, table } = decals();
    for (const decal of table) {
      if (decal.family === 'wall-grime') continue;
      // `pair()` mirrors the AUTHORED x into the world frame before emitting,
      // and the footprint tables this compares against are world - so the
      // mirror is applied here too. Left off, this test compares two different
      // coordinate frames and passes for the wrong reason.
      const x = nuketown2HandedX(decal.position[0]);
      const z = decal.position[2];
      const w = decal.size[0];
      const d = decal.size[2];
      // Both halves - `pair()` emits (x, z) and (-x, -z).
      for (const sign of [1, -1] as const) {
        const x0 = sign * x - w / 2;
        const x1 = sign * x + w / 2;
        const z0 = sign * z - d / 2;
        const z1 = sign * z + d / 2;
        for (const road of NUKETOWN2_CARRIAGEWAY_FOOTPRINTS) {
          const overlapX = Math.min(x1, road.x1) - Math.max(x0, road.x0);
          const overlapZ = Math.min(z1, road.z1) - Math.max(z0, road.z0);
          expect(
            overlapX > 1e-4 && overlapZ > 1e-4,
            `${decal.name} overlaps carriageway "${road.id}" - the coplanar gate ignores offsets there`,
          ).toBe(false);
        }
      }
    }
    materials.dispose();
  });

  it('keeps every GROUND decal out of both building footprints, for the same reason', () => {
    const { materials, table } = decals();
    const buildings = worldBuildingFootprints();
    for (const decal of table) {
      if (decal.family === 'wall-grime') continue;
      const x = nuketown2HandedX(decal.position[0]);
      const z = decal.position[2];
      const w = decal.size[0];
      const d = decal.size[2];
      for (const sign of [1, -1] as const) {
        const x0 = sign * x - w / 2;
        const x1 = sign * x + w / 2;
        const z0 = sign * z - d / 2;
        const z1 = sign * z + d / 2;
        for (const building of buildings) {
          const overlapX = Math.min(x1, building.x1) - Math.max(x0, building.x0);
          const overlapZ = Math.min(z1, building.z1) - Math.max(z0, building.z0);
          expect(
            overlapX > 1e-4 && overlapZ > 1e-4,
            `${decal.name} overlaps a building footprint - offsets are ignored there`,
          ).toBe(false);
        }
      }
    }
    materials.dispose();
  });

  it('carries the offset tier on every material, strictly below lawn (-2) and drive (-1)', () => {
    const { materials, table } = decals();
    expect(NUKETOWN2_GRIME_OFFSET_FACTOR).toBeLessThan(-2);
    for (const decal of table) {
      const material = decal.material as THREE.Material;
      expect(material.polygonOffset, decal.name).toBe(true);
      expect(material.polygonOffsetFactor, decal.name).toBe(NUKETOWN2_GRIME_OFFSET_FACTOR);
      // A decal must not write depth - it is a film on a surface.
      expect(material.depthWrite, decal.name).toBe(false);
      expect(material.transparent, decal.name).toBe(true);
    }
    materials.dispose();
  });

  it('separates overlapping ground families instead of stacking transparent films at one depth', () => {
    const { materials, table } = decals();
    const ground = table.filter((decal) => decal.family !== 'wall-grime');
    for (let i = 0; i < ground.length; i += 1) {
      for (let j = i + 1; j < ground.length; j += 1) {
        const first = ground[i]!;
        const second = ground[j]!;
        const overlapX = Math.min(
          first.position[0] + first.size[0] / 2,
          second.position[0] + second.size[0] / 2,
        ) - Math.max(
          first.position[0] - first.size[0] / 2,
          second.position[0] - second.size[0] / 2,
        );
        const overlapZ = Math.min(
          first.position[2] + first.size[2] / 2,
          second.position[2] + second.size[2] / 2,
        ) - Math.max(
          first.position[2] - first.size[2] / 2,
          second.position[2] - second.size[2] / 2,
        );
        if (overlapX <= 1e-4 || overlapZ <= 1e-4) continue;
        expect(
          Math.abs(first.position[1] - second.position[1]),
          `${first.name} and ${second.name} share a ground depth`,
        ).toBeGreaterThan(0.0009);
      }
    }
    materials.dispose();
  });

  it('sits inside the 0.03 m coplanar window on purpose, not above it', () => {
    const { materials, table } = decals();
    for (const decal of table) {
      if (decal.family === 'wall-grime') continue;
      const [, y] = decal.position;
      const [, h] = decal.size;
      const top = y + h / 2;
      const gap = top - GROUND_PLATE_TOP_Y;
      // Positive, so the decal draws over the plate...
      expect(gap, decal.name).toBeGreaterThan(0);
      // ...and inside 0.03 m, so the coplanar instrument SEES the pair and
      // fences it, instead of the decal hiding from the audit behind a lip a
      // player would trip over.
      expect(gap, decal.name).toBeLessThan(0.03);
    }
    materials.dispose();
  });

  it('adds no collider, no shot surface and no raycast mesh to the arena', () => {
    const map = buildNuketown2(new THREE.Scene());
    const { materials, table } = decals();
    const names = new Set(table.flatMap((decal) => [
      `nuketown2 north ${decal.name}`,
      `nuketown2 south ${decal.name}`,
    ]));
    for (const mesh of map.raycastMeshes) expect(names.has(mesh.name)).toBe(false);
    for (const surface of map.shotSurfaces) {
      expect(names.has((surface as { mesh?: THREE.Mesh }).mesh?.name ?? '')).toBe(false);
    }
    // Every decal mesh is either merged into the presentation batch (its
    // source node left hidden) or explicitly presentation-only. A decal that
    // is neither is a visible body the parity gate would owe a collider for.
    const unaccounted = map.root.children.filter((node) => (
      (node as THREE.Mesh).isMesh === true
      && names.has(node.name)
      && node.userData.presentationOnly !== true
      && node.userData.staticBatchRendered !== true
    ));
    expect(unaccounted.map((node) => node.name)).toEqual([]);
    // ...and none of them contributed a collider: no collider in the arena has
    // the paper-thin height a grime slab has.
    const thin = map.colliders.filter((bounds) => ((bounds.maxY ?? 0) - (bounds.minY ?? 0)) < 0.02);
    expect(thin.length).toBe(0);
    materials.dispose();
  });

  it('groups into one material per family, so the batcher makes one draw each', () => {
    const { materials, table } = decals();
    const byFamily = new Map<string, Set<string>>();
    for (const decal of table) {
      const set = byFamily.get(decal.family) ?? new Set<string>();
      set.add((decal.material as THREE.Material).uuid);
      byFamily.set(decal.family, set);
    }
    for (const [family, uuids] of byFamily) {
      expect(uuids.size, `family "${family}" uses more than one material`).toBe(1);
    }
    // Six families: tyre, oil, crack, court, stones, wall-grime.
    expect(byFamily.size).toBe(6);
    materials.dispose();
  });

  it('keeps the wall grime clear of the wall top face it is painted on', () => {
    const { materials, table } = decals();
    for (const decal of table) {
      if (decal.family !== 'wall-grime') continue;
      const top = decal.position[1] + decal.size[1] / 2;
      // The perimeter wall is 3.2 m; the grime tops out at 1.9. Nothing within
      // 0.03 m, so this surface never enters the top-face audit at all.
      expect(3.2 - top).toBeGreaterThan(0.03);
      // And it is a film, not a body: 24 mm proud of a wall face.
      expect(Math.min(decal.size[0], decal.size[2])).toBeLessThan(0.05);
    }
    materials.dispose();
  });
});
