/**
 * nuketown2-pool-water.test.ts — the contract for PASS 94's pool surface.
 *
 * Three things are worth asserting about a water material, and none of them is
 * "the shader compiles":
 *   1. the roster entry matches the MESH the arena actually builds (the water
 *      skill's roster rule - a body described in data that does not exist in
 *      the world is worse than no entry at all);
 *   2. the colour model is an absorption integral, i.e. a real path length is
 *      in the graph, and the material is not simply a tinted constant; and
 *   3. the presentation-only contract is intact - the pool grants no
 *      submersion, no collider, no shot surface, and no profile-varying value.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildNuketown2 } from './nuketown2-arena';
import { nuketown2HandedX } from './nuketown2-layout';
import {
  NUKETOWN2_POOL,
  POOL_RIPPLE_SLOPE,
  createNuketown2PoolWaterMaterial,
  nuketown2PoolDepthAt,
} from './nuketown2-pool-water';

const SOURCE = readFileSync(resolve(__dirname, 'nuketown2-pool-water.ts'), 'utf8');

describe('Nuke Town Rebuild pool water', () => {
  it('describes the mesh the arena actually builds', () => {
    const map = buildNuketown2(new THREE.Scene());
    const sheets: THREE.Mesh[] = [];
    map.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh === true && mesh.name.includes('nuketown2-yard-pool-water')) sheets.push(mesh);
    });
    // Both 180-degree partners.
    expect(sheets.length).toBe(2);
    for (const sheet of sheets) {
      const p = (sheet.geometry as THREE.BoxGeometry).parameters as { width: number; height: number; depth: number };
      expect(p.width).toBeCloseTo(NUKETOWN2_POOL.width, 6);
      expect(p.depth).toBeCloseTo(NUKETOWN2_POOL.depth, 6);
      sheet.updateMatrixWorld(true);
      const world = new THREE.Vector3();
      sheet.getWorldPosition(world);
      expect(world.y + p.height / 2).toBeCloseTo(NUKETOWN2_POOL.surfaceY, 6);
      expect(Math.abs(world.x)).toBeCloseTo(Math.abs(nuketown2HandedX(NUKETOWN2_POOL.authoredX)), 6);
      expect(Math.abs(world.z)).toBeCloseTo(Math.abs(NUKETOWN2_POOL.z), 6);
    }
  });

  it('carries the same material object on both halves - one pipeline, not two', () => {
    const map = buildNuketown2(new THREE.Scene());
    const materials = new Set<string>();
    map.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh === true && mesh.name.includes('nuketown2-yard-pool-water')) {
        materials.add((mesh.material as THREE.Material).uuid);
      }
    });
    // The compile fence: a per-half variant would be a second pipeline warmed
    // (or not warmed) for no visible reason.
    expect(materials.size).toBe(1);
  });

  it('gives water a real depth: zero outside the sheet, deepest at the centre', () => {
    const cx = nuketown2HandedX(NUKETOWN2_POOL.authoredX);
    const cz = NUKETOWN2_POOL.z;
    expect(nuketown2PoolDepthAt(cx, cz)).toBeCloseTo(NUKETOWN2_POOL.maxDepthM, 6);
    // Just outside the sheet on each axis.
    expect(nuketown2PoolDepthAt(cx + NUKETOWN2_POOL.width / 2 + 0.01, cz)).toBe(0);
    expect(nuketown2PoolDepthAt(cx, cz + NUKETOWN2_POOL.depth / 2 + 0.01)).toBe(0);
    // At the wall, on the sheet: shallow, not deep. This is the property that
    // makes the absorption read as shallow-at-the-edge without a second colour.
    const atWall = nuketown2PoolDepthAt(cx, cz + NUKETOWN2_POOL.depth / 2 - 0.001);
    expect(atWall).toBeLessThan(0.02);
    // Monotone in from the wall across the shelf band.
    let previous = -1;
    for (let inset = 0; inset <= NUKETOWN2_POOL.shelfM; inset += 0.05) {
      const d = nuketown2PoolDepthAt(cx, cz + NUKETOWN2_POOL.depth / 2 - inset);
      expect(d).toBeGreaterThanOrEqual(previous);
      previous = d;
    }
    // And the 180-degree partner reads identically.
    expect(nuketown2PoolDepthAt(-cx, -cz)).toBeCloseTo(NUKETOWN2_POOL.maxDepthM, 6);
  });

  it('has an extinction vector ordered red > green, blue - not a flat tint', () => {
    const [r, g, b] = NUKETOWN2_POOL.extinction;
    // The whole reason water goes cyan-green with depth. A flat vector is a
    // tint wearing a physics name, which is exactly what this pass replaced.
    expect(r).toBeGreaterThan(g * 3);
    expect(r).toBeGreaterThan(b * 3);
    expect(g).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(r).not.toBeCloseTo(g, 2);
  });

  it('builds a node material with a colour, opacity, normal and roughness graph', () => {
    const material = createNuketown2PoolWaterMaterial() as THREE.Material & {
      colorNode?: unknown; opacityNode?: unknown; normalNode?: unknown; roughnessNode?: unknown;
    };
    expect(material.name).toBe('nuketown2-pool-water-material');
    expect(material.transparent).toBe(true);
    // The four terms the water skill's steps 1-4 require. `opacityNode` in
    // particular: a constant opacity is the "blue lid", and the local Fresnel
    // transparency term is the one that fixes it.
    expect(material.colorNode).toBeDefined();
    expect(material.opacityNode).toBeDefined();
    expect(material.normalNode).toBeDefined();
    expect(material.roughnessNode).toBeDefined();
    material.dispose();
  });

  it('injects backscatter UPSTREAM of the absorption integral, not as a tint on top', () => {
    // This is a source assertion on purpose. It is the one property of the
    // backscatter term that cannot be observed from the material object and
    // that silently reverses the result when it is wrong: added downstream the
    // water goes grey, added upstream it goes green, and both compile.
    const incoming = SOURCE.indexOf('const incoming = ');
    const transmittance = SOURCE.indexOf('const transmittance = ');
    const scatter = SOURCE.indexOf('const scatter = ');
    expect(scatter).toBeGreaterThan(-1);
    expect(incoming).toBeGreaterThan(scatter);
    expect(transmittance).toBeGreaterThan(incoming);
    expect(SOURCE).toContain('incoming.mul(transmittance)');
  });

  it('drives backscatter from the SAME estimator as foam, and zeroes it in calm water', () => {
    // Both terms read `turbulence`, and `turbulence` is a smoothstep whose
    // lower edge is a positive fraction of the ripple slope - so at zero wave
    // energy the bubble term is exactly the turbidity floor and nothing else.
    expect(SOURCE).toContain('const turbulence = smoothstep(');
    expect(SOURCE).toContain('turbulence.mul(0.55)');
    expect(SOURCE).toContain('max(\n    turbulence,');
    expect(POOL_RIPPLE_SLOPE).toBeGreaterThan(0);
    // The turbidity floor is a kept-pool value, not a pond value: if this ever
    // rises it raises the black point of the still pool, which is the failure
    // the water skill names for a global backscatter constant.
    expect(NUKETOWN2_POOL.turbidity).toBeLessThan(0.12);
  });

  it('grants no gameplay authority: no collider, no shot surface, no swim', () => {
    const map = buildNuketown2(new THREE.Scene());
    const sheets: THREE.Mesh[] = [];
    map.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh === true && mesh.name.includes('nuketown2-yard-pool-water')) sheets.push(mesh);
    });
    for (const sheet of sheets) {
      sheet.updateMatrixWorld(true);
      const world = new THREE.Vector3();
      sheet.getWorldPosition(world);
      const p = (sheet.geometry as THREE.BoxGeometry).parameters as { width: number; depth: number };
      const covering = map.colliders.filter((bounds) => (
        bounds.minX < world.x + p.width / 2 && bounds.maxX > world.x - p.width / 2
        && bounds.minZ < world.z + p.depth / 2 && bounds.maxZ > world.z - p.depth / 2
        && (bounds.minY ?? 0) >= 0.1
      ));
      // The coping surrounds the sheet but must not sit ON it; nothing solid
      // may stand in the water sheet's own plan area above the ground plate.
      for (const bounds of covering) {
        expect(bounds.maxY ?? 0).toBeLessThanOrEqual(0.4);
      }
      expect(map.raycastMeshes.includes(sheet)).toBe(false);
    }
    // No swimmable volume is claimed anywhere in this module.
    expect(SOURCE).not.toContain('swimmable: true');
  });

  it('is profile-invariant: nothing in the graph reads a render profile', () => {
    // Quality tiers may change WHICH detail renders; they may never change the
    // surface a player fights over. The only backend branch permitted is the
    // WebGL2 compatibility route, and it is named.
    expect(SOURCE).not.toMatch(/graphicsProfile|qualityTier|renderProfile/);
    expect(SOURCE).toContain('webgl2CompatRoute');
  });
});
