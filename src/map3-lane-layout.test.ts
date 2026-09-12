/**
 * MAP3 (HF-409): the geometry facts the Map 3 arena rests on.
 *
 * Three of them, and each one is a defect this arena has already had or was
 * one edit away from having:
 *
 *   1. QUARTER TURNS ONLY. A lane rotated off a world axis makes every box it
 *      contains measure as an inflated AABB, and the collider/visual parity
 *      audit then reads honest colliders as invisible walls. That is why the
 *      first Map 3 arena abandoned the showcase's 45-degree spokes, and this
 *      test is what stops the next author putting them back.
 *   2. LANES DO NOT INTERSECT. The corridors were authored in isolation and
 *      are between 9 and 41 m wide. Two of them sharing a patch of ground is
 *      a forest growing through a colonnade, and nothing else in the build
 *      would notice.
 *   3. EVERY LANE MOUTH IS REACHABLE FROM THE HUB. An explore mode whose
 *      content you cannot walk to is a menu screen.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  MAP3_BOUNDS,
  MAP3_COURTYARD_HALF,
  MAP3_LANES,
  MAP3_LANE_START,
  buildMap3,
  laneToWorld,
  prepareMap3,
} from './map3-arena';

/**
 * MAP3 (HF-409 finisher 2): PREPARE, then BUILD.
 *
 * `buildMap3` is synchronous like every other arena builder, but its eighth
 * corridor (the Rapier playground) needs a wasm module first, so it THROWS
 * rather than quietly returning seven corridors. One top-level await here
 * resolves it for every build below. Idempotent; ~70 ms once per process.
 */
await prepareMap3();

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

/** World footprint of a lane's corridor, from the built scene. */
function laneFootprints(): Map<string, Rect> {
  const scene = new THREE.Scene();
  buildMap3(scene);
  scene.updateMatrixWorld(true);
  const out = new Map<string, Rect>();
  for (const lane of MAP3_LANES) {
    const group = scene.getObjectByName(`map3-lane-${lane.id}`);
    expect(group, `lane group for ${lane.id}`).toBeDefined();
    const boxes = new THREE.Box3();
    boxes.makeEmpty();
    group!.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      // The colosseum's bowl, arcade and skyline are a VISTA: they are placed
      // 140-260 m away, deliberately outside the playfield, and including them
      // would make this lane "overlap" everything. Clip to the bounds, which
      // is the same thing the parity audit's backdrop rule does.
      const nodeBox = new THREE.Box3().setFromObject(node);
      if (nodeBox.max.x < MAP3_BOUNDS.minX || nodeBox.min.x > MAP3_BOUNDS.maxX) return;
      if (nodeBox.max.z < MAP3_BOUNDS.minZ || nodeBox.min.z > MAP3_BOUNDS.maxZ) return;
      const centreX = (nodeBox.min.x + nodeBox.max.x) / 2;
      const centreZ = (nodeBox.min.z + nodeBox.max.z) / 2;
      if (centreX < MAP3_BOUNDS.minX || centreX > MAP3_BOUNDS.maxX) return;
      if (centreZ < MAP3_BOUNDS.minZ || centreZ > MAP3_BOUNDS.maxZ) return;
      boxes.union(nodeBox);
    });
    out.set(lane.id, {
      minX: boxes.min.x, maxX: boxes.max.x, minZ: boxes.min.z, maxZ: boxes.max.z,
    });
  }
  return out;
}

let cached: Map<string, Rect> | null = null;
function footprints(): Map<string, Rect> {
  cached ??= laneFootprints();
  return cached;
}

describe('Map 3 lane layout', () => {
  it('places every lane on a world axis, so no box is ever yawed off one', () => {
    const scene = new THREE.Scene();
    buildMap3(scene);
    for (const lane of MAP3_LANES) {
      const group = scene.getObjectByName(`map3-lane-${lane.id}`);
      const quarterTurns = group!.rotation.y / (Math.PI / 2);
      expect(
        Math.abs(quarterTurns - Math.round(quarterTurns)),
        `${lane.id} yaw ${group!.rotation.y} is not a quarter turn`,
      ).toBeLessThan(1e-9);
      expect(group!.rotation.x).toBe(0);
      expect(group!.rotation.z).toBe(0);
    }
  }, 60_000);

  it('never lets two corridors occupy the same ground', () => {
    const rects = footprints();
    const overlaps: string[] = [];
    const ids = [...rects.keys()];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = rects.get(ids[i]!)!;
        const b = rects.get(ids[j]!)!;
        const ix = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const iz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
        if (ix > 0 && iz > 0) {
          overlaps.push(`${ids[i]} x ${ids[j]}: ${ix.toFixed(1)} x ${iz.toFixed(1)} m`);
        }
      }
    }
    expect(overlaps, 'lane footprints intersect').toEqual([]);
  }, 60_000);

  it('starts every lane clear of the hub paving, so the mouths are walkable', () => {
    // The mouth sits past the kerb, on scrub, with nothing between it and the
    // plaza. A lane starting INSIDE the paving would bury its first bay in the
    // hub slab.
    expect(MAP3_LANE_START).toBeGreaterThan(MAP3_COURTYARD_HALF + 2);
    for (const lane of MAP3_LANES) {
      const mouth = laneToWorld(lane, 0, 0);
      expect(Math.hypot(mouth.x, mouth.z)).toBeGreaterThan(MAP3_COURTYARD_HALF);
      expect(Math.abs(mouth.x)).toBeLessThanOrEqual(MAP3_BOUNDS.maxX);
      expect(Math.abs(mouth.z)).toBeLessThanOrEqual(MAP3_BOUNDS.maxZ);
    }
  });

  it('fits every walkable corridor length inside the playfield', () => {
    // The vista may hang outside the bounds - the colosseum's bowl is 140 m
    // out on purpose - but the part you can WALK must not. A corridor whose
    // far end is past the boundary is a corridor with a wall across it.
    const halfExtent = Math.min(MAP3_BOUNDS.maxX, MAP3_BOUNDS.maxZ);
    const scene = new THREE.Scene();
    buildMap3(scene);
    for (const lane of MAP3_LANES) {
      const corridor = lane.build();
      expect(
        MAP3_LANE_START + corridor.length,
        `${lane.id} runs ${MAP3_LANE_START + corridor.length} m from the hub, past the ${halfExtent} m boundary`,
      ).toBeLessThanOrEqual(halfExtent);
      corridor.dispose();
    }
  }, 60_000);
});
