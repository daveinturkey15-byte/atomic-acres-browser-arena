/**
 * Node QA for the world-studio nature lane: API shape, determinism, budget,
 * keep-out truth against the HF-571 coordinate contract, texture sanity, and
 * that update() allocates nothing and dispose() is idempotent.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NATURE_DRAW_GROUP_BUDGET, NATURE_TRIANGLE_BUDGET, createStudioNature } from './index';
import {
  GARAGES,
  HEDGE_LANES,
  HOUSES,
  ROAD,
  SHEDS,
  SPAWN_PADS,
  SPAWN_PAD_RADIUS_M,
  TERRAIN_INNER_R,
  coastalFactor,
  inRect,
  outsidePlayableMargin,
  terrainHeight,
  waterDepthAt,
} from './layout';
import { createLeafAtlasData, createFlowerAtlasData } from './textures';
import { cutHedgeRun, HEDGE_MAX_HEIGHT_M } from './gardens';
import { createWaterDepthMaskData } from './terrain';
import { createTreeFamily } from './trees';
import { createNatureTextures } from './textures';
import { createNatureUniforms } from './materials';

describe('world-studio nature', () => {
  const nature = createStudioNature();

  it('exports the frozen API and returns a root at the origin', () => {
    expect(nature.root).toBeInstanceOf(THREE.Group);
    expect(nature.root.position.length()).toBe(0);
    expect(nature.root.scale.equals(new THREE.Vector3(1, 1, 1))).toBe(true);
    expect(typeof nature.update).toBe('function');
    expect(typeof nature.dispose).toBe('function');
    let meshes = 0;
    nature.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        meshes += 1;
        expect(o.userData.presentationOnly).toBe(true);
        expect(o.userData.blocksShots).toBe(false);
      }
    });
    expect(meshes).toBeGreaterThan(10);
  });

  it('stays inside the per-author budget', () => {
    expect(nature.stats.triangles).toBeLessThanOrEqual(NATURE_TRIANGLE_BUDGET);
    expect(nature.stats.drawGroups).toBeLessThanOrEqual(NATURE_DRAW_GROUP_BUDGET);
    expect(nature.stats.textures).toBeLessThanOrEqual(10);
    expect(nature.stats.trees.broadleaf).toBeGreaterThan(30);
    expect(nature.stats.trees.conifer).toBeGreaterThan(50);
    expect(nature.stats.trees.birch).toBeGreaterThan(25);
    expect(nature.stats.trees.far).toBeGreaterThan(400);
    expect(nature.stats.gardens.lawnTufts).toBeGreaterThan(2000);
    expect(nature.stats.gardens.hedgeSegments).toBeGreaterThan(8);
  });

  it('is deterministic across builds', () => {
    const again = createStudioNature();
    expect(again.stats).toEqual(nature.stats);
    const a = nature.root.getObjectByName('ws-nature-conifer-trunks') as THREE.InstancedMesh;
    const b = again.root.getObjectByName('ws-nature-conifer-trunks') as THREE.InstancedMesh;
    expect(Array.from(a.instanceMatrix.array)).toEqual(Array.from(b.instanceMatrix.array));
    again.dispose();
  });

  it('plants every near tree outside the playable margin on dry ground', () => {
    const family = createTreeFamily(createNatureTextures(), createNatureUniforms());
    expect(family.feet.length).toBeGreaterThan(150);
    for (const [x, z] of family.feet) {
      expect(outsidePlayableMargin(x, z)).toBe(true);
      expect(waterDepthAt(x, z)).toBe(0);
    }
    // Minimum separation holds.
    for (let i = 0; i < family.feet.length; i += 1) {
      for (let j = i + 1; j < family.feet.length; j += 1) {
        const d = Math.hypot(family.feet[i][0] - family.feet[j][0], family.feet[i][1] - family.feet[j][1]);
        expect(d).toBeGreaterThanOrEqual(3.4 - 1e-9);
      }
    }
    family.dispose();
  });

  it('keeps hedges knee-high and out of the road, buildings, spawn pads and lanes', () => {
    const gardens = nature.root.getObjectByName('world-studio-nature-gardens')!;
    const hedges = gardens.getObjectByName('ws-nature-hedges') as THREE.Mesh;
    hedges.geometry.computeBoundingBox();
    expect(hedges.geometry.boundingBox!.max.y).toBeLessThanOrEqual(HEDGE_MAX_HEIGHT_M + 0.05);
    const pos = hedges.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      expect(inRect(ROAD, x, z)).toBe(false);
      for (const r of HOUSES) expect(inRect(r, x, z)).toBe(false);
      for (const r of GARAGES) expect(inRect(r, x, z)).toBe(false);
      for (const r of SHEDS) expect(inRect(r, x, z)).toBe(false);
      for (const r of HEDGE_LANES) expect(inRect(r, x, z)).toBe(false);
      for (const [px, pz] of SPAWN_PADS) expect(Math.hypot(x - px, z - pz)).toBeGreaterThan(SPAWN_PAD_RADIUS_M - 0.4);
    }
  });

  it('cuts a hedge run at a keep-out instead of nudging it', () => {
    // Runs straight through the east spawn pads: must come back in pieces.
    const pieces = cutHedgeRun({ x0: 34, z0: -20, x1: 34, z1: 20, height: 0.5 });
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    for (const p of pieces) {
      for (const [px, pz] of SPAWN_PADS) {
        const midZ = (p.z0 + p.z1) / 2;
        if (Math.abs(px - 34) < 1e-6) expect(Math.abs(midZ - pz)).toBeGreaterThan(SPAWN_PAD_RADIUS_M);
      }
    }
  });

  it('terrain is flat under the apron, coastal toward -Z, mountainous elsewhere', () => {
    expect(terrainHeight(10, 10)).toBe(0);
    expect(terrainHeight(0, -TERRAIN_INNER_R + 1)).toBe(0);
    expect(coastalFactor(0, -100)).toBe(1);
    expect(coastalFactor(100, 0)).toBe(0);
    expect(coastalFactor(0, 100)).toBe(0);
    // Sea past the shore, dry beach before it.
    expect(waterDepthAt(0, -140)).toBeGreaterThan(3);
    expect(waterDepthAt(0, -55)).toBe(0);
    // Mountains rise well above the fence line in the inland sectors.
    let peak = 0;
    for (let r = 150; r < 500; r += 10) peak = Math.max(peak, terrainHeight(r, 0), terrainHeight(0, r), terrainHeight(-r, 0));
    expect(peak).toBeGreaterThan(60);
    // The depth mask has both dry and deep texels.
    const mask = createWaterDepthMaskData(64);
    let dry = 0;
    let deep = 0;
    for (let i = 0; i < mask.length; i += 4) { if (mask[i] === 0) dry += 1; if (mask[i] > 200) deep += 1; }
    expect(dry).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(0);
  });

  it('generates leaf and flower atlases with alpha-cut cells that differ', () => {
    const leaf = createLeafAtlasData(128);
    const cell = 64;
    const coverage = (cx: number, cy: number): number => {
      let n = 0;
      for (let y = 0; y < cell; y += 1) for (let x = 0; x < cell; x += 1) if (leaf[((cy * cell + y) * 128 + cx * cell + x) * 4 + 3] > 128) n += 1;
      return n / (cell * cell);
    };
    const c = [coverage(0, 0), coverage(1, 0), coverage(0, 1), coverage(1, 1)];
    for (const v of c) { expect(v).toBeGreaterThan(0.15); expect(v).toBeLessThan(0.9); }
    expect(new Set(c.map((v) => v.toFixed(3))).size).toBe(4);
    // Cell borders are transparent so neighbours never bleed.
    for (let x = 0; x < 128; x += 1) expect(leaf[(63 * 128 + x) * 4 + 3]).toBe(0);
    const flowers = createFlowerAtlasData(64);
    let lit = 0;
    for (let i = 3; i < flowers.length; i += 4) if (flowers[i] > 128) lit += 1;
    expect(lit).toBeGreaterThan(100);
  });

  it('update moves the uniforms without allocating scene objects and dispose is idempotent', () => {
    const cam = new THREE.Vector3(0, 1.7, 0);
    const before = nature.root.children.length;
    let descendants = 0;
    nature.root.traverse(() => { descendants += 1; });
    nature.update(1.5, 0.016, cam, { wind: 0.4, rain: 0, snow: 0, wetness: 0 });
    nature.update(3.0, 0.016, cam, { wind: 0.4, rain: 1, snow: 1, wetness: 1 });
    let after = 0;
    nature.root.traverse(() => { after += 1; });
    expect(nature.root.children.length).toBe(before);
    expect(after).toBe(descendants);
    nature.dispose();
    nature.dispose();
    expect(nature.root.children.length).toBe(0);
  });
});
