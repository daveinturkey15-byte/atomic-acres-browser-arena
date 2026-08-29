/**
 * Pass 82 contract tests for the Nuke Town instanced lawn field.
 *
 *   1. REGION CONTAINMENT — every blade origin sits inside the v4 lawn bands:
 *      never on asphalt, kerbstone or pavement (|z| >= 8.8) and never outside
 *      the arena bounds.
 *   2. COLLIDER CONTAINMENT — no blade origin inside ANY ground-level
 *      collider of the REAL constructed arena (buildArena, colliders +
 *      physicsColliders). This is what keeps the hand-mirrored prop keep-out
 *      table in nuketown-lawn-field.ts honest: if map.ts moves a prop, this
 *      goes red instead of the lawn silently growing through it.
 *   3. COMBAT-SAFETY BOUND — blade height is capped by construction at
 *      0.22 m (under the 0.25 m art-only ceiling): geometry cannot exceed it
 *      and no instance scales above 1.
 *   4. DETERMINISM — two builds produce byte-identical instance streams.
 *   5. PRESENTATION ONLY — two instanced draws, no colliders, no shot
 *      surfaces, every node tagged presentationOnly + blocksShots:false.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { ARENA_BOUNDS, STREET_END_X } from './arena-layout';
import { HARD_SURFACE_HALF_DEPTH_M } from './grass-placement';
import { buildArena } from './map';
import {
  buildNuketownLawnField,
  NUKETOWN_LAWN_BLADE_HEIGHT_M,
  NUKETOWN_LAWN_TINT,
  nuketownLawnPlacementAllowed,
} from './nuketown-lawn-field';
import { grassClumpTintPeak } from './rendering/instanced-grass-field';

type Origin = { x: number; z: number; scaleY: number };

function bladeOrigins(reduced = false): { origins: Origin[]; meshes: readonly THREE.InstancedMesh[]; stats: { blades: number; drawCalls: number; triangles: number } } {
  const parent = new THREE.Group();
  const field = buildNuketownLawnField(parent, reduced);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const origins: Origin[] = [];
  for (const mesh of field.meshes) {
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      matrix.decompose(position, quaternion, scale);
      origins.push({ x: position.x, z: position.z, scaleY: scale.y });
    }
  }
  return { origins, meshes: field.meshes, stats: field.stats };
}

describe('Nuke Town lawn field (Pass 82)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('roots every blade inside the lawn bands - never on asphalt, kerb, pavement or beyond bounds', () => {
    const { origins, stats } = bladeOrigins();
    expect(stats.blades).toBeGreaterThan(5_000); // a lawn, not a dressing pass
    expect(origins).toHaveLength(stats.blades);
    for (const origin of origins) {
      // REDESIGN 2026-08-29: the street (and its hard-surface band) ends at
      // the spawn fences, so the |z| exclusion applies only inside the street
      // span; the end gardens are lawn at street level by design.
      if (Math.abs(origin.x) <= STREET_END_X) {
        expect(Math.abs(origin.z)).toBeGreaterThanOrEqual(HARD_SURFACE_HALF_DEPTH_M);
      }
      expect(origin.z).toBeGreaterThanOrEqual(ARENA_BOUNDS.minZ);
      expect(origin.z).toBeLessThanOrEqual(ARENA_BOUNDS.maxZ);
      expect(origin.x).toBeGreaterThanOrEqual(ARENA_BOUNDS.minX);
      expect(origin.x).toBeLessThanOrEqual(ARENA_BOUNDS.maxX);
    }
  });

  it('keeps every blade origin out of every ground-level collider of the REAL constructed arena', () => {
    const arena = buildArena(new THREE.Scene());
    const grounded = [...arena.colliders, ...arena.physicsColliders]
      .filter((box) => (box.minY ?? -0.5) < 0.4);
    expect(grounded.length).toBeGreaterThan(50); // the arena actually built
    const { origins } = bladeOrigins();
    const violations: Array<{ x: number; z: number; box: { minX: number; maxX: number; minZ: number; maxZ: number } }> = [];
    for (const origin of origins) {
      for (const box of grounded) {
        if (origin.x > box.minX && origin.x < box.maxX && origin.z > box.minZ && origin.z < box.maxZ) {
          violations.push({ x: Math.round(origin.x * 100) / 100, z: Math.round(origin.z * 100) / 100, box: { minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ } });
          break;
        }
      }
    }
    expect(violations.slice(0, 8), `${violations.length} blade origins inside ground-level colliders`).toEqual([]);
  });

  it('hard-caps blade height under the 0.25 m art-only ceiling by construction', () => {
    expect(NUKETOWN_LAWN_BLADE_HEIGHT_M).toBeLessThanOrEqual(0.25);
    const { origins, meshes } = bladeOrigins();
    const geometry = meshes[0].geometry;
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.y).toBeLessThanOrEqual(NUKETOWN_LAWN_BLADE_HEIGHT_M + 1e-6);
    for (const origin of origins) expect(origin.scaleY).toBeLessThanOrEqual(1 + 1e-6);
  });

  it('is deterministic: two builds produce byte-identical instance streams', () => {
    const first = bladeOrigins();
    const second = bladeOrigins();
    expect(first.stats).toEqual(second.stats);
    expect(first.meshes.length).toBe(second.meshes.length);
    for (let index = 0; index < first.meshes.length; index += 1) {
      expect(Array.from(first.meshes[index].instanceMatrix.array))
        .toEqual(Array.from(second.meshes[index].instanceMatrix.array));
    }
  });

  it('stays presentation-only: four instanced draws, shared geometry+material, no collider identity', () => {
    // REDESIGN 2026-08-29: two lawn bands + two end-garden strips = four
    // regions, one draw each; still one geometry, one material, one graph.
    const { meshes, stats } = bladeOrigins();
    expect(stats.drawCalls).toBeLessThanOrEqual(4);
    expect(meshes.length).toBe(stats.drawCalls);
    const materials = new Set(meshes.map((mesh) => mesh.material));
    const geometries = new Set(meshes.map((mesh) => mesh.geometry));
    expect(materials.size).toBe(1); // one extra pipeline, however many regions
    expect(geometries.size).toBe(1);
    for (const mesh of meshes) {
      expect(mesh.userData.presentationOnly).toBe(true);
      expect(mesh.userData.blocksShots).toBe(false);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.name).not.toMatch(/collider/i);
      // The donor's measured gotcha: the bounding volume must wrap the
      // instance BOUNDS, not the geometry at the origin.
      expect(mesh.boundingSphere).not.toBeNull();
      // v3: the smallest region is the 2 m end apron strip (radius ~9.5);
      // the pin still proves instance BOUNDS, not the 0.25 m geometry origin.
      expect(mesh.boundingSphere!.radius).toBeGreaterThan(4);
    }
  });

  it('keeps the tint spec under material.color\'s white ceiling', () => {
    expect(grassClumpTintPeak(NUKETOWN_LAWN_TINT)).toBeLessThanOrEqual(1);
  });

  it('reduces density (not coverage) on the reduced-world-detail route', () => {
    const full = bladeOrigins(false);
    const reduced = bladeOrigins(true);
    expect(reduced.stats.blades).toBeLessThan(full.stats.blades * 0.6);
    expect(reduced.stats.drawCalls).toBeLessThanOrEqual(4);
    // Coverage: both sides of the street stay planted.
    expect(new Set(reduced.origins.map((origin) => Math.sign(origin.z))).size).toBe(2);
  });

  it('keeps plain standard materials on the WebGL2 compat route', () => {
    vi.stubGlobal('document', { documentElement: { dataset: { renderBackend: 'webgl2' } } });
    const parent = new THREE.Group();
    const field = buildNuketownLawnField(parent, true);
    const material = field.meshes[0].material as THREE.Material;
    expect((material as { isNodeMaterial?: boolean }).isNodeMaterial).toBeUndefined();
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it('rejects the yard props the arena authors on the lawns', () => {
    // DECLUTTER 2026-08-29: plinth/vessel/greenhouse left the map; the
    // surviving and new props take their keep-out rows.
    // v3: fences/hedges/dividers/mannequins deleted; survivors re-seated.
    expect(nuketownLawnPlacementAllowed(-36.2, -28.8)).toBe(false); // verge mound (v3 corner)
    expect(nuketownLawnPlacementAllowed(16, 28.5)).toBe(false); // rear-strip planter
    expect(nuketownLawnPlacementAllowed(-34.5, 10)).toBe(false); // spawn-yard tree
    expect(nuketownLawnPlacementAllowed(-9, -28.5)).toBe(false); // rear yard tree
    expect(nuketownLawnPlacementAllowed(-30, -20)).toBe(true); // open west spawn yard
    expect(nuketownLawnPlacementAllowed(30, 20)).toBe(true); // open east spawn yard
  });
});
