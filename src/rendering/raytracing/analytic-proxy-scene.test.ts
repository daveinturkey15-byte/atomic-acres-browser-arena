import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  extractProxyScene,
  REFLECTIVE_ROUGHNESS_CEILING,
  WATER_PROXY_MAXIMUM_METALNESS,
  DEFAULT_PROXY_EXTRACTION,
} from './analytic-proxy-scene';
import { ARENA_PROXY_EXTRACTION } from './arena-proxy-registration';

/**
 * Extractor contract, with the flat-surface case that made the whole water
 * registration dead code.
 *
 * PASS 81 DEFECT. Every sea plane this project registers as reflective —
 * `Pass 64 TSL perimeter water` (high-seas, rustworks-1v1), the farcrysis
 * lagoon/inline/shallow/vista planes — is authored as a `PlaneGeometry`
 * rotated flat, so its world bounding box is EXACTLY zero along Y. The
 * extractor's degeneracy guard demanded a positive extent on all three axes
 * and returned before the water branch could ever run, so
 * `arena-proxy-registration.ts` had never contributed a single proxy on any
 * arena. Measured at HEAD with the whole scene traversed: high-seas 16
 * reflective meshes with the 960 x 960 m sea absent, farcrysis 3 with all four
 * registered planes absent.
 *
 * The guard is still a guard: a mesh flat on one axis is admitted ONLY when it
 * is registered water. Foam rings, decals, sand-gradient cards and the wave-FX
 * surfaces stay out, because a flat card has no volume for a slab test to
 * describe and would otherwise take the largest-area slots in a 24-shape
 * budget away from the walls and containers a reflection is made of.
 */

function flatPlane(name: string, sizeM: number, roughness: number, metalness: number, y = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sizeM, sizeM),
    new THREE.MeshStandardMaterial({ roughness, metalness }),
  );
  mesh.name = name;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.updateMatrixWorld(true);
  return mesh;
}

function box(name: string, roughness: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3, 6),
    new THREE.MeshStandardMaterial({ roughness, metalness: 0.5 }),
  );
  mesh.name = name;
  mesh.updateMatrixWorld(true);
  return mesh;
}

function sceneOf(...objects: readonly THREE.Object3D[]): THREE.Scene {
  const scene = new THREE.Scene();
  for (const object of objects) scene.add(object);
  scene.updateMatrixWorld(true);
  return scene;
}

describe('analytic proxy extraction', () => {
  it('emits a plane proxy for registered water that is exactly flat in Y', () => {
    // The real shape: three.js PlaneGeometry rotated -90 deg about X, which is
    // how every sea surface in this repo is built.
    const scene = sceneOf(flatPlane('Pass 64 TSL perimeter water', 960, 1, 0, -1.2));
    const proxy = extractProxyScene(scene, THREE, ARENA_PROXY_EXTRACTION);

    expect(proxy.reflectiveMeshCount).toBe(1);
    expect(proxy.reflectiveFootprintM2).toBeGreaterThan(900_000);
    expect(proxy.shapes).toHaveLength(1);
    expect(proxy.shapes[0]).toMatchObject({ kind: 'plane', name: 'Pass 64 TSL perimeter water' });
    // Water is a dielectric and its proxy is clamped to the mirror ceiling,
    // whatever the raster material was authored at.
    expect(proxy.shapes[0].roughness).toBeLessThanOrEqual(REFLECTIVE_ROUGHNESS_CEILING);
    expect(proxy.shapes[0].metalness).toBeLessThanOrEqual(WATER_PROXY_MAXIMUM_METALNESS);
    expect(proxy.shapes[0].normal).toEqual([0, 1, 0]);
    // The plane sits where the mesh sits, not at the origin.
    expect(proxy.shapes[0].centre[1]).toBeCloseTo(-1.2, 5);
  });

  it('admits every registered sea plane the arenas actually author', () => {
    const scene = sceneOf(
      flatPlane('farcrysis-lagoon-water', 140, 0.22, 0.02),
      flatPlane('farcrysis-water-inline', 176, 0.24, 0.02),
      flatPlane('farcrysis-water-shallow', 116, 0.26, 0),
      flatPlane('farcrysis-vista-ocean', 512, 0.24, 0.05),
    );
    const proxy = extractProxyScene(scene, THREE, ARENA_PROXY_EXTRACTION);
    expect(proxy.shapes.map(({ name }) => name).sort()).toEqual([
      'farcrysis-lagoon-water',
      'farcrysis-vista-ocean',
      'farcrysis-water-inline',
      'farcrysis-water-shallow',
    ]);
    expect(proxy.reflectiveMeshCount).toBe(4);
    expect(proxy.shapes.every(({ kind }) => kind === 'plane')).toBe(true);
  });

  it('admits registered water whose flatness is EXACT, not a rotation epsilon', () => {
    // The sea planes in this repo are PlaneGeometry rotated -90 deg about X,
    // and cos(-PI/2) is 6.12e-17 rather than 0, so their world bounds are
    // 8.6e-15 m thick and squeak past a `sizeY > 0` degeneracy guard. That is
    // the only reason the water registration produces anything at all today.
    // Bake the same surface with an exact zero extent - geometry.rotateX on a
    // pre-flattened plane, a merged buffer, a GLB - and the guard drops the
    // one surface class the registration exists for, silently.
    const exact = new THREE.Mesh(
      new THREE.BoxGeometry(960, 0, 960),
      new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }),
    );
    exact.name = 'Pass 64 TSL perimeter water';
    exact.position.y = -1.2;
    exact.updateMatrixWorld(true);
    const proxy = extractProxyScene(sceneOf(exact), THREE, ARENA_PROXY_EXTRACTION);
    expect(proxy.shapes.map(({ name, kind }) => `${name}:${kind}`)).toEqual(['Pass 64 TSL perimeter water:plane']);
    expect(proxy.reflectiveMeshCount).toBe(1);
  });

  it('does not admit an unregistered exactly-flat card', () => {
    // The relaxation above is for registered water only. A foam ring, decal or
    // sand-gradient card has no volume for a slab test to describe, and its
    // large area would take slots in a 24-shape budget away from the walls and
    // containers a reflection is actually made of.
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(198, 0, 198),
      new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0 }),
    );
    card.name = 'farcrysis-water-fx-sand-depth-gradient';
    card.updateMatrixWorld(true);
    const proxy = extractProxyScene(sceneOf(card, box('arena-wall', 0.9)), THREE, ARENA_PROXY_EXTRACTION);
    expect(proxy.shapes.map(({ name }) => name)).toEqual(['arena-wall']);
  });

  it('rejects geometry degenerate on two axes even when it is registered water', () => {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(400, 0, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.1 }),
    );
    line.name = 'Pass 64 TSL perimeter water';
    const proxy = extractProxyScene(sceneOf(line), THREE, ARENA_PROXY_EXTRACTION);
    expect(proxy.shapes).toEqual([]);
    expect(proxy.reflectiveMeshCount).toBe(0);
  });

  it('keeps a vertical registered surface on the box path rather than lying about its normal', () => {
    // The packed uniform layout reconstructs planes as +Y horizontal, so a
    // wall-shaped water mesh must NOT become a plane proxy.
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 20, 40),
      new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }),
    );
    wall.name = 'Pass 64 TSL perimeter water';
    wall.updateMatrixWorld(true);
    const proxy = extractProxyScene(sceneOf(wall), THREE, ARENA_PROXY_EXTRACTION);
    expect(proxy.shapes[0].kind).toBe('box');
    expect(proxy.reflectiveMeshCount).toBe(0);
  });

  it('leaves the declared cost bounds where the registration put them', () => {
    expect(ARENA_PROXY_EXTRACTION.maximumShapes).toBe(DEFAULT_PROXY_EXTRACTION.maximumShapes);
    expect(ARENA_PROXY_EXTRACTION.minimumFootprintM2).toBe(DEFAULT_PROXY_EXTRACTION.minimumFootprintM2);
  });
});
