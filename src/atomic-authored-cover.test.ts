import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COVER_LAYOUT } from './arena-layout';
import {
  AUTHORED_LARGE_COVER_ANCHORS,
  AUTHORED_LARGE_COVER_HEIGHT,
  authoredLargeCoverIdAt,
  buildArena,
} from './map';

/**
 * HF-383's cover removal deleted the two leading COVER_LAYOUT entries and so
 * shifted every index. Two production consumers keyed authored art by literal
 * array index (src/map.ts and src/environment-assets.ts), which silently
 * retired `west-service-skip` and `east-generator-trailer` altogether and
 * re-pointed `north-cargo-stack` / `south-pipe-stack` at the wrong anchors and
 * the wrong collider footprint. Nothing failed: the minimap simply lost two
 * landmarks and drew two more in the wrong place (legacy-main.ts feeds
 * physicalCover straight into physicalCoverMinimapKind), and the two orphaned
 * anchors went back to rendering as plain aqua/coral blockout boxes.
 *
 * These gates key on the ANCHOR COORDINATE, which is what the authored art is
 * actually modelled against, so a future layout edit either keeps the anchor
 * (art follows it) or removes it (this test fails loudly).
 */

/** id, x, z, width, depth - the footprint each authored asset is modelled to fill. */
const ANCHORS: ReadonlyArray<readonly [string, number, number, number, number]> = [
  // v3 (owner HITL 2026-08-29): anchors re-seated with COVER_LAYOUT for the
  // house-per-end anatomy; ids and footprints unchanged.
  ['north-cargo-stack', -9, -26, 3, 2.2],
  ['south-pipe-stack', 9, 26, 3, 2.2],
  ['west-service-skip', 27, -13, 2.8, 4.4],
  ['east-generator-trailer', -27, 13, 2.8, 4.4],
];

describe('atomic-acres authored large cover', () => {
  const scene = new THREE.Scene();
  const arena = buildArena(scene);
  scene.updateMatrixWorld(true);

  it('every authored anchor still exists in the frozen COVER_LAYOUT', () => {
    for (const [id, x, z, width, depth] of ANCHORS) {
      const entry = COVER_LAYOUT.find((slot) => slot[0] === x && slot[1] === z);
      expect(entry, `${id} anchor [${x},${z}] vanished from COVER_LAYOUT`).toBeDefined();
      expect([entry![2], entry![3]], `${id} footprint changed`).toEqual([width, depth]);
    }
  });

  it('builds all four authored large-cover props', () => {
    const ids = arena.physicalCover.map((cover) => cover.id).sort();
    for (const [id] of ANCHORS) expect(ids).toContain(id);
  });

  it('seats each authored prop on its own anchor with the anchor footprint', () => {
    for (const [id, x, z, width, depth] of ANCHORS) {
      const cover = arena.physicalCover.find((entry) => entry.id === id);
      expect(cover, `${id} is missing from physicalCover`).toBeDefined();
      const bounds = cover!.bounds;
      expect((bounds.minX + bounds.maxX) / 2).toBeCloseTo(x, 5);
      expect((bounds.minZ + bounds.maxZ) / 2).toBeCloseTo(z, 5);
      expect(bounds.maxX - bounds.minX).toBeCloseTo(width, 5);
      expect(bounds.maxZ - bounds.minZ).toBeCloseTo(depth, 5);
      expect(bounds.maxY! - bounds.minY!).toBeCloseTo(AUTHORED_LARGE_COVER_HEIGHT, 5);
      expect(cover!.blocksMovement).toBe(true);
      expect(cover!.blocksShots).toBe(true);
    }
  });

  it('suppresses the blockout box on every authored anchor and only there', () => {
    COVER_LAYOUT.forEach(([x, z], index) => {
      const blockout = arena.root.getObjectByName(`cover ${index}`);
      expect(blockout, `cover ${index} was not built`).toBeDefined();
      const authored = authoredLargeCoverIdAt(x, z);
      expect(
        blockout!.visible,
        `cover ${index} at [${x},${z}] ${authored ? 'is authored art and must not render as a box' : 'is ordinary cover and must render'}`,
      ).toBe(authored === null);
    });
  });

  /**
   * HF-387's authority-wrap rule: visible cover mass must stay inside the
   * movement/shot authority AABB, otherwise a capsule pressed against the prop
   * puts the eye inside geometry nothing blocks. The skip and generator
   * builders were unreachable while the index bug hid them, so they had never
   * been measured against it.
   */
  it('keeps every authored silhouette inside its own authority envelope', () => {
    for (const [id, x, z, width, depth] of ANCHORS) {
      const parts: THREE.Mesh[] = [];
      arena.root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh && mesh.userData.performanceCoverId === id) parts.push(mesh);
      });
      expect(parts.length, `${id} rendered no silhouette meshes`).toBeGreaterThan(0);
      const silhouette = new THREE.Box3();
      for (const part of parts) silhouette.union(new THREE.Box3().setFromObject(part));
      expect(silhouette.min.x, `${id} silhouette overhangs -x`).toBeGreaterThanOrEqual(x - width / 2 - 1e-6);
      expect(silhouette.max.x, `${id} silhouette overhangs +x`).toBeLessThanOrEqual(x + width / 2 + 1e-6);
      expect(silhouette.min.z, `${id} silhouette overhangs -z`).toBeGreaterThanOrEqual(z - depth / 2 - 1e-6);
      expect(silhouette.max.z, `${id} silhouette overhangs +z`).toBeLessThanOrEqual(z + depth / 2 + 1e-6);
      expect(silhouette.max.y, `${id} silhouette is taller than its collider`).toBeLessThanOrEqual(AUTHORED_LARGE_COVER_HEIGHT + 1e-6);
    }
  });

  it('exposes exactly the four authored anchors, none of them duplicated', () => {
    expect(AUTHORED_LARGE_COVER_ANCHORS).toHaveLength(4);
    const seen = new Set(AUTHORED_LARGE_COVER_ANCHORS.map(([x, z]) => `${x},${z}`));
    expect(seen.size).toBe(4);
    for (const [x, z, id] of AUTHORED_LARGE_COVER_ANCHORS) {
      expect(ANCHORS.some((anchor) => anchor[0] === id && anchor[1] === x && anchor[2] === z)).toBe(true);
    }
  });
});

/**
 * D4 of artifacts/NUKETOWN-MEASUREMENT-2026-08-24.md: mannequins, the reference
 * map's most identifiable prop class, were entirely absent - a repo-wide grep
 * for the word found one HUD string and nothing in the arena.
 *
 * The visibility gate below is the reason they are authored in the street-life
 * layer instead of in map.ts. On the DEFAULT render profile ('blender' -
 * resolveRenderProfile returns it for an empty query and for stored 'quality',
 * src/render-profile.ts:24-29) blender-environment.ts hides the entire
 * 'Atomic Acres arena' root once the Quality GLB loads, mirroring only three
 * objects out of it. Anything rendered from map.ts is therefore invisible to
 * the owner; the pass31-neighbourhood-life root is a SIBLING of the arena root
 * (legacy-main.ts adds it straight to the scene) and survives that hide.
 */
// v3 (owner HITL 2026-08-29): the mannequin prop class is DELETED with its
// whole gate suite - "random manekins that look like bots standing around,
// remove those".
