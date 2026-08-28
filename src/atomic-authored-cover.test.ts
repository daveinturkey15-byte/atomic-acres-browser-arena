import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COVER_LAYOUT } from './arena-layout';
import { addNeighbourhoodLife } from './environment-assets';
import {
  ATOMIC_MANNEQUIN_COLLIDER_SIZE,
  ATOMIC_MANNEQUIN_LAYOUT,
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
  ['north-cargo-stack', -8, -22, 3, 2.2],
  ['south-pipe-stack', 8, 22, 3, 2.2],
  ['west-service-skip', 24, -13, 2.8, 4.4],
  ['east-generator-trailer', -24, 13, 2.8, 4.4],
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
describe('atomic-acres yard mannequins', () => {
  const scene = new THREE.Scene();
  const arena = buildArena(scene);
  const life = addNeighbourhoodLife(scene, false);
  scene.updateMatrixWorld(true);

  const dummies: THREE.Object3D[] = [];
  life.traverse((node) => {
    if (node.name === 'street-mannequin') dummies.push(node);
  });

  it('pairs every mannequin with its exact 180-degree twin', () => {
    expect(ATOMIC_MANNEQUIN_LAYOUT.length % 2).toBe(0);
    for (const [x, z, facing] of ATOMIC_MANNEQUIN_LAYOUT) {
      const twin = ATOMIC_MANNEQUIN_LAYOUT.find((other) => (
        Math.abs(other[0] + x) < 1e-6
        && Math.abs(other[1] + z) < 1e-6
        && Math.abs(Math.cos(other[2] - facing - Math.PI)) > 1 - 1e-9
      ));
      expect(twin, `mannequin (${x}, ${z}) has no rotated partner`).toBeDefined();
    }
  });

  it('gives every mannequin movement and shot authority, seated on the ground', () => {
    for (const [index, [x, z]] of ATOMIC_MANNEQUIN_LAYOUT.entries()) {
      const proxy = arena.root.getObjectByName(`street-mannequin-collider-${index}`) as THREE.Mesh | undefined;
      expect(proxy, `mannequin ${index} has no collider`).toBeDefined();
      expect(proxy!.visible, 'the authority proxy must never render').toBe(false);
      const collider = arena.physicsColliders.find((bounds) => (
        Math.abs((bounds.minX + bounds.maxX) / 2 - x) < 1e-6
        && Math.abs((bounds.minZ + bounds.maxZ) / 2 - z) < 1e-6
        && Math.abs((bounds.maxY ?? 0) - ATOMIC_MANNEQUIN_COLLIDER_SIZE[1]) < 1e-6
      ));
      expect(collider, `mannequin ${index} is not in the physics set`).toBeDefined();
      expect(collider!.minY, 'mannequin base must seat on the y=0 ground authority').toBeCloseTo(0, 6);
    }
  });

  /** A prop this small must never narrow a route, wedge a body or seal a
   * pocket. 3 m of clearance is nearly four capsule diameters. */
  it('stands well clear of every other collider', () => {
    const size = ATOMIC_MANNEQUIN_COLLIDER_SIZE;
    for (const [x, z] of ATOMIC_MANNEQUIN_LAYOUT) {
      let nearest = Infinity;
      for (const bounds of arena.physicsColliders) {
        const isSelf = Math.abs((bounds.minX + bounds.maxX) / 2 - x) < 1e-6
          && Math.abs((bounds.minZ + bounds.maxZ) / 2 - z) < 1e-6;
        if (isSelf || (bounds.minY ?? 0) > 1.6 || (bounds.maxY ?? 3) < 0.2) continue;
        const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
        const dz = Math.max(bounds.minZ - z, 0, z - bounds.maxZ);
        nearest = Math.min(nearest, Math.hypot(dx, dz));
      }
      expect(nearest, `mannequin (${x}, ${z}) clearance`).toBeGreaterThan(size[0] / 2 + 3);
    }
  });

  it('renders one dummy per authored anchor, inside its own authority envelope', () => {
    expect(dummies).toHaveLength(ATOMIC_MANNEQUIN_LAYOUT.length);
    const [width, height] = ATOMIC_MANNEQUIN_COLLIDER_SIZE;
    for (const [x, z] of ATOMIC_MANNEQUIN_LAYOUT) {
      const dummy = dummies.find((node) => Math.abs(node.position.x - x) < 1e-6 && Math.abs(node.position.z - z) < 1e-6);
      expect(dummy, `no mannequin art at (${x}, ${z})`).toBeDefined();
      const silhouette = new THREE.Box3().setFromObject(dummy!);
      expect(silhouette.min.y, 'mannequin floats above the ground').toBeCloseTo(0, 2);
      expect(silhouette.max.y).toBeLessThanOrEqual(height + 1e-6);
      expect(silhouette.min.x).toBeGreaterThanOrEqual(x - width / 2 - 1e-6);
      expect(silhouette.max.x).toBeLessThanOrEqual(x + width / 2 + 1e-6);
      expect(silhouette.min.z).toBeGreaterThanOrEqual(z - width / 2 - 1e-6);
      expect(silhouette.max.z).toBeLessThanOrEqual(z + width / 2 + 1e-6);
    }
  });

  it('publishes the mannequin count on the street-life contract', () => {
    expect((life.userData.neighbourhoodLife as { mannequins: number }).mannequins)
      .toBe(ATOMIC_MANNEQUIN_LAYOUT.length);
  });

  it('survives the Quality profile hiding the whole procedural arena root', () => {
    // Exactly what src/blender-environment.ts does once the Quality GLB loads.
    const proceduralWorld = scene.getObjectByName('Atomic Acres arena');
    expect(proceduralWorld, 'the arena root must be findable by that name').toBeDefined();
    expect(life.parent, 'street life must not hang under the arena root').toBe(scene);
    proceduralWorld!.visible = false;
    for (const dummy of dummies) {
      let node: THREE.Object3D | null = dummy;
      while (node && node !== scene) {
        expect(node.visible, `${node.name || '<unnamed>'} hides the mannequins on Quality`).toBe(true);
        node = node.parent;
      }
    }
    proceduralWorld!.visible = true;
  });
});
