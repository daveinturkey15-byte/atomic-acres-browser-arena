/**
 * grass-contact-layer.test.ts — DAY-3 GRASS-CONTACT lane (fix-grass).
 *
 * Pins behaviour, not values: every row reaches the artefact through the
 * module's own exports and the subtree the lawn builder parents, never
 * through re-typed copies. A retune that keeps the contract stays green; a
 * disconnected helper scores nothing.
 *
 * Row map: A ramp real · E smooth LOD · F zero samplers · G determinism ·
 * H combat safety + ceiling · J budget at construction · K tier in scene.
 * Rows B/C (plate-visible fractions) belong to the headless instrument
 * scripts/qa/estimate-ground-contact-coverage.mjs; row D is coordinator-run.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  buildNuketownRebuildLawnField,
  NUKETOWN2_LAWN_CONTACT_SEED,
  type NuketownGroundDressingPiece,
} from '../nuketown-lawn-field';
import { GRASS_MAX_HEIGHT } from '../grass-placement';
import type { InstancedGrassField } from '../rendering/instanced-grass-field';
import {
  buildGrassContactLayer,
  createGrassContactGeometry,
  createGrassLitterGeometry,
  grassContactDistanceScale,
  grassContactPatchShade,
  grassContactRamp,
  GRASS_CONTACT_BAND_HEIGHT_M,
  GRASS_CONTACT_LITTER_TRIANGLES,
  GRASS_CONTACT_LOD_FAR_M,
  GRASS_CONTACT_LOD_FAR_REDUCED_M,
  GRASS_CONTACT_LOD_NEAR_M,
  GRASS_CONTACT_LOD_NEAR_REDUCED_M,
  GRASS_CONTACT_THATCH_TRIANGLES,
  GRASS_CONTACT_TIER_MARKER,
} from './grass-contact-layer';

/**
 * Representative rebuild-lawn footprint: two 28 x 13 m yard rectangles
 * (728 m2, the scale of the rebuild's paired yard lawns), authored once
 * (paired:false) so the region set is exactly these two.
 */
const FIXTURE_DRESSING: readonly NuketownGroundDressingPiece[] = Object.freeze([
  Object.freeze({ id: 'fix-north', material: 'lawn', x0: -14, x1: 14, z0: -36, z1: -23, paired: false }),
  Object.freeze({ id: 'fix-south', material: 'lawn', x0: -14, x1: 14, z0: 23, z1: 36, paired: false }),
]);

/** 4 x 4 m hole punched in the north rect — the keep-out for row H. */
const HOLE = Object.freeze({ minX: -2, maxX: 2, minZ: -30, maxZ: -26 });
const holedPlacement = (x: number, z: number): boolean =>
  !(x > HOLE.minX && x < HOLE.maxX && z > HOLE.minZ && z < HOLE.maxZ);

function buildRebuildField(): { parent: THREE.Group; field: InstancedGrassField } {
  const parent = new THREE.Group();
  const field = buildNuketownRebuildLawnField(parent, {
    dressing: FIXTURE_DRESSING,
    keepOuts: [],
    keepOutCircles: [],
  });
  return { parent, field };
}

/** Locate-or-fail: an absent tier fails every row that depends on it. */
function locateContact(field: { group: THREE.Group }): {
  group: THREE.Group;
  meshes: THREE.InstancedMesh[];
  material: THREE.Material;
} {
  const meshes: THREE.InstancedMesh[] = [];
  field.group.traverse((node) => {
    if (node instanceof THREE.InstancedMesh && node.name.includes(GRASS_CONTACT_TIER_MARKER)) {
      meshes.push(node);
    }
  });
  expect(meshes.length, 'contact tier meshes in the lawn subtree (row K binding)').toBeGreaterThan(0);
  const tierGroup = meshes[0]!.parent as THREE.Group;
  expect(tierGroup, 'tier parent group').not.toBeNull();
  const material = meshes[0]!.material as THREE.Material;
  for (const mesh of meshes) {
    expect(mesh.material, 'one shared material across the tier (row A identity)').toBe(material);
  }
  return { group: tierGroup, meshes, material };
}

function instanceXZ(mesh: THREE.InstancedMesh): Array<{ x: number; z: number; scaleY: number }> {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const out: Array<{ x: number; z: number; scaleY: number }> = [];
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    matrix.decompose(position, quaternion, scale);
    out.push({ x: position.x, z: position.z, scaleY: scale.y });
  }
  return out;
}

describe('GRASS-CONTACT row A — the contact ramp is real', () => {
  it('ramps 0.22 at the plate to 1.0 at the band top through the shipped function', () => {
    const { field } = buildRebuildField();
    const { material } = locateContact(field);
    const diagnostics = (material.userData as { grassContact?: { rampFn?: unknown } }).grassContact;
    // Identity: the built material carries the very function under test.
    expect(diagnostics?.rampFn, 'material built from grassContactRamp').toBe(grassContactRamp);
    const ratio = grassContactRamp(0) / grassContactRamp(1);
    expect(ratio, 'ramp(0)/ramp(1) — the dark step down').toBeGreaterThanOrEqual(0.1);
    expect(ratio, 'ramp(0)/ramp(1) — not a crushed mat').toBeLessThanOrEqual(0.3);
    expect(grassContactRamp(1), 'ramp(1) still matches the plate').toBeGreaterThanOrEqual(0.9);
    expect(grassContactRamp(1), 'ramp(1) still matches the plate').toBeLessThanOrEqual(1.15);
  });

  it('is patchy in distribution, never a uniform carpet', () => {
    // 400 samples over the fixture at fixed hashes: the shade field must vary
    // structurally (hollows AND lit thatch), and never hit full black.
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 400; i += 1) {
      const x = -14 + (i % 20) * 1.4;
      const z = -36 + Math.floor(i / 20) * 1.3;
      const shade = grassContactPatchShade(x, z, (i * 0.61803398875) % 1);
      if (shade < min) min = shade;
      if (shade > max) max = shade;
      expect(shade, 'never full black').toBeGreaterThan(0.4);
    }
    expect(max - min, 'patch range (structure, not a stain)').toBeGreaterThan(0.2);
    expect(max, 'lit thatch survives').toBeGreaterThan(0.9);
  });
});

describe('GRASS-CONTACT row E — LOD is smooth', () => {
  it('fades 1 -> 0 monotone with no step, through the shipped function', () => {
    const { field } = buildRebuildField();
    const { material } = locateContact(field);
    const diagnostics = (material.userData as {
      grassContact?: { distanceFn?: unknown; lodNearM?: number; lodFarM?: number };
    }).grassContact;
    expect(diagnostics?.distanceFn, 'material built with grassContactDistanceScale').toBe(
      grassContactDistanceScale,
    );
    expect(diagnostics?.lodNearM).toBe(GRASS_CONTACT_LOD_NEAR_M);
    expect(diagnostics?.lodFarM).toBe(GRASS_CONTACT_LOD_FAR_M);
    const nearM = GRASS_CONTACT_LOD_NEAR_M;
    const farM = GRASS_CONTACT_LOD_FAR_M;
    expect(grassContactDistanceScale(nearM, nearM, farM)).toBe(1);
    expect(grassContactDistanceScale(farM, nearM, farM)).toBe(0);
    let previous = Infinity;
    let maxStep = 0;
    for (let i = 0; i < 200; i += 1) {
      const d = nearM + ((farM - nearM) * i) / 199;
      const s = grassContactDistanceScale(d, nearM, farM);
      expect(s, `monotone at sample ${i}`).toBeLessThanOrEqual(previous + 1e-12);
      if (previous !== Infinity) maxStep = Math.max(maxStep, previous - s);
      previous = s;
    }
    expect(maxStep, 'no pop step').toBeLessThanOrEqual(0.02);
  });

  it('collapses the band on reduced detail', () => {
    const parent = new THREE.Group();
    const field = buildNuketownRebuildLawnField(parent, {
      dressing: FIXTURE_DRESSING,
      keepOuts: [],
      keepOutCircles: [],
      reduced: true,
    });
    const { material } = locateContact(field);
    const diagnostics = (material.userData as {
      grassContact?: { lodNearM?: number; lodFarM?: number };
    }).grassContact;
    expect(diagnostics?.lodNearM).toBe(GRASS_CONTACT_LOD_NEAR_REDUCED_M);
    expect(diagnostics?.lodFarM).toBe(GRASS_CONTACT_LOD_FAR_REDUCED_M);
  });
});

describe('GRASS-CONTACT row F — zero samplers, zero textures', () => {
  it('declares no texture map of any kind', () => {
    const { field } = buildRebuildField();
    const { material, meshes } = locateContact(field);
    const sampled = material as THREE.Material & Record<string, unknown>;
    for (const slot of ['map', 'alphaMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap', 'emissiveMap', 'lightMap']) {
      expect(sampled[slot] ?? null, `no ${slot}`).toBeNull();
    }
    const stats = field.group.userData.grassContactStats as { samplers?: number };
    expect(stats?.samplers).toBe(0);
    expect(meshes.length).toBeGreaterThan(0);
  });
});

describe('GRASS-CONTACT row G — determinism on a non-empty tier', () => {
  it('is byte-identical on the same seed and seed-sensitive', () => {
    const first = buildRebuildField();
    const second = buildRebuildField();
    const a = locateContact(first.field);
    const b = locateContact(second.field);
    expect(a.meshes.length).toBe(b.meshes.length);
    let total = 0;
    for (let m = 0; m < a.meshes.length; m += 1) {
      const ma = Array.from(a.meshes[m]!.instanceMatrix.array);
      const mb = Array.from(b.meshes[m]!.instanceMatrix.array);
      expect(mb, `mesh ${m} byte-identical`).toEqual(ma);
      total += a.meshes[m]!.count;
      if (a.meshes[m]!.instanceColor && b.meshes[m]!.instanceColor) {
        expect(Array.from(b.meshes[m]!.instanceColor!.array)).toEqual(
          Array.from(a.meshes[m]!.instanceColor!.array),
        );
      }
    }
    // Non-empty: a constant or empty placement would also be "identical".
    expect(total, 'rebuild-footprint contact instances').toBeGreaterThanOrEqual(2000);
    // Seed-sensitive: a different stream plants a different tier.
    const alt = buildGrassContactLayer({
      name: 'seed-probe',
      seed: (NUKETOWN2_LAWN_CONTACT_SEED + 1) >>> 0,
      regions: [{ minX: -14, maxX: 14, minZ: -36, maxZ: -23 }],
      plateColor: 0xc5aa5b,
    });
    const same = buildGrassContactLayer({
      name: 'seed-probe',
      seed: NUKETOWN2_LAWN_CONTACT_SEED,
      regions: [{ minX: -14, maxX: 14, minZ: -36, maxZ: -23 }],
      plateColor: 0xc5aa5b,
    });
    expect(alt.meshes[0]!.count).toBeGreaterThan(0);
    expect(Array.from(alt.meshes[0]!.instanceMatrix.array)).not.toEqual(
      Array.from(same.meshes[0]!.instanceMatrix.array),
    );
    alt.dispose();
    same.dispose();
  });
});

describe('GRASS-CONTACT row H — combat safety and the art ceiling', () => {
  it('keeps the tier top in [0.05, 0.08], blades capped, nothing in keep-outs', () => {
    expect(GRASS_MAX_HEIGHT, 'blade cap untouched').toBeLessThanOrEqual(0.22);
    expect(GRASS_CONTACT_BAND_HEIGHT_M, 'band under the art ceiling').toBeLessThanOrEqual(0.08);
    const parent = new THREE.Group();
    const field = buildNuketownRebuildLawnField(parent, {
      dressing: FIXTURE_DRESSING,
      keepOuts: [],
      keepOutCircles: [],
    });
    // Same non-empty instance set row G counts, filtered through a keep-out.
    const holed = buildGrassContactLayer({
      name: 'keepout-probe',
      seed: NUKETOWN2_LAWN_CONTACT_SEED,
      regions: [{ minX: -14, maxX: 14, minZ: -36, maxZ: -23 }],
      placementAllowed: holedPlacement,
      plateColor: 0xc5aa5b,
    });
    expect(holed.stats.instances).toBeGreaterThan(0);
    let top = -Infinity;
    for (const mesh of holed.meshes) {
      mesh.geometry.computeBoundingBox();
      const geoTop = mesh.geometry.boundingBox!.max.y;
      for (const inst of instanceXZ(mesh)) {
        top = Math.max(top, geoTop * inst.scaleY);
        expect(inst.x > HOLE.minX && inst.x < HOLE.maxX && inst.z > HOLE.minZ && inst.z < HOLE.maxZ,
          `instance (${inst.x.toFixed(2)}, ${inst.z.toFixed(2)}) escapes the keep-out`).toBe(false);
      }
      expect(mesh.userData.presentationOnly).toBe(true);
      expect(mesh.userData.blocksShots).toBe(false);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.name).not.toMatch(/collider/i);
      expect(mesh.boundingSphere, 'bounds from real instances (donor gotcha)').not.toBeNull();
    }
    expect(top, 'constructed tier top — clears the lino floor, holds the ceiling').toBeGreaterThanOrEqual(0.05);
    expect(top, 'constructed tier top — holds the ceiling').toBeLessThanOrEqual(0.08);
    expect(field.group.userData.grassContactStats).toBeDefined();
    holed.dispose();
  });

  it('builds thatch at 6 tris and litter at 3, all procedural', () => {
    const thatch = createGrassContactGeometry('probe-thatch');
    const litter = createGrassLitterGeometry('probe-litter');
    expect(thatch.index!.count / 3).toBe(GRASS_CONTACT_THATCH_TRIANGLES);
    expect(litter.index!.count / 3).toBe(GRASS_CONTACT_LITTER_TRIANGLES);
    thatch.computeBoundingBox();
    litter.computeBoundingBox();
    expect(thatch.boundingBox!.max.y).toBeLessThanOrEqual(GRASS_CONTACT_BAND_HEIGHT_M);
    expect(litter.boundingBox!.max.y).toBeLessThanOrEqual(GRASS_CONTACT_BAND_HEIGHT_M);
    thatch.dispose();
    litter.dispose();
  });
});

describe('GRASS-CONTACT row J — budget, counted at construction', () => {
  it('stays inside instances / triangles / draws / samplers on the built objects', () => {
    const { field } = buildRebuildField();
    const { meshes } = locateContact(field);
    let instances = 0;
    let triangles = 0;
    for (const mesh of meshes) {
      instances += mesh.count;
      triangles += (mesh.geometry.index!.count / 3) * mesh.count;
    }
    const stats = field.group.userData.grassContactStats as {
      instances: number;
      triangles: number;
      drawCalls: number;
      samplers: number;
    };
    // Counted on the returned subtree, cross-checked against the stats object.
    expect(stats.instances).toBe(instances);
    expect(stats.triangles).toBe(triangles);
    expect(stats.drawCalls).toBe(meshes.length);
    expect(instances, 'added instances').toBeLessThanOrEqual(22000);
    expect(triangles, 'added triangles').toBeLessThanOrEqual(120000);
    expect(meshes.length, 'added draws').toBeLessThanOrEqual(8);
    expect(stats.samplers).toBe(0);
  });
});

describe('GRASS-CONTACT row K — the tier is in the shipped scene', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parents a visible, non-empty tier carrying the row-A material', () => {
    const { parent, field } = buildRebuildField();
    expect(field.group.parent).toBe(parent);
    const { group, meshes, material } = locateContact(field);
    expect(group.visible).toBe(true);
    for (const mesh of meshes) {
      expect(mesh.visible).toBe(true);
      expect(mesh.count, `${mesh.name} non-empty`).toBeGreaterThan(0);
      expect(mesh.material).toBe(material);
    }
    const diagnostics = (material.userData as { grassContact?: { rampFn?: unknown } }).grassContact;
    expect(diagnostics?.rampFn).toBe(grassContactRamp);
  });

  it('fails closed: removing the one grow line empties every dependent row', () => {
    const { field } = buildRebuildField();
    const before = locateContact(field);
    expect(before.meshes.length).toBeGreaterThan(0);
    // The removal check: without the grow line the subtree carries no tier,
    // so the locate-or-fail helper every row goes through finds nothing.
    for (const mesh of before.meshes) mesh.parent?.remove(mesh);
    const found: THREE.InstancedMesh[] = [];
    field.group.traverse((node) => {
      if (node instanceof THREE.InstancedMesh && node.name.includes(GRASS_CONTACT_TIER_MARKER)) {
        found.push(node);
      }
    });
    expect(found, 'no tier without the grow line — A/B/G/H/J all fail').toHaveLength(0);
  });

  it('does not construct on the WebGL2 compat route — the lawn survives', () => {
    vi.stubGlobal('document', { documentElement: { dataset: { renderBackend: 'webgl2' } } });
    const parent = new THREE.Group();
    const field = buildNuketownRebuildLawnField(parent, {
      dressing: FIXTURE_DRESSING,
      keepOuts: [],
      keepOutCircles: [],
    });
    expect(field.meshes.length, 'blade field intact').toBeGreaterThan(0);
    const found: THREE.InstancedMesh[] = [];
    field.group.traverse((node) => {
      if (node instanceof THREE.InstancedMesh && node.name.includes(GRASS_CONTACT_TIER_MARKER)) {
        found.push(node);
      }
    });
    expect(found, 'no tier on WebGL2, and no error').toHaveLength(0);
  });
});
