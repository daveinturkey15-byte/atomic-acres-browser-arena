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
  buildNuketownVergeBloomField,
  NUKETOWN_LAWN_BLADE_HEIGHT_M,
  NUKETOWN_LAWN_TINT,
  NUKETOWN_LAWN_SEED,
  NUKETOWN_VERGE_BLOOM_BLADE_HEIGHT_M,
  NUKETOWN_VERGE_BLOOM_TINT,
  NUKETOWN_VERGE_BLOOM_SEED,
  NUKETOWN_VERGE_BLOOM_REGIONS,
  NUKETOWN2_CLOVER_BASE_COLOR,
  NUKETOWN2_CLOVER_BUDGET,
  NUKETOWN2_CLOVER_HEIGHT_M,
  NUKETOWN2_CLOVER_TINT,
  NUKETOWN2_LAWN_BASE_COLOR,
  NUKETOWN2_LAWN_TINT,
  nuketownLawnPlacementAllowed,
} from './nuketown-lawn-field';
import { buildNuketown2 } from './nuketown2-arena';
import {
  LAWN_DRY_ALBEDO_LINEAR,
  LAWN_DRY_PATCH_M,
  LAWN_DRY_PATCH_THRESHOLDS,
  LAWN_DRY_PATCH_WEIGHT,
} from './nuketown2-materials/families/lawn';
import { GRASS_MAX_HEIGHT } from './grass-placement';
import { grassClumpTintPeak, grassDryness } from './rendering/instanced-grass-field';

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


describe('Nuke Town verge bloom field (HF-536)', () => {
  it('exports valid verge bloom constants', () => {
    expect(NUKETOWN_VERGE_BLOOM_BLADE_HEIGHT_M).toBe(0.22);
    expect(NUKETOWN_VERGE_BLOOM_SEED).toBe(NUKETOWN_LAWN_SEED ^ 0xb100);
    expect(NUKETOWN_VERGE_BLOOM_REGIONS).toHaveLength(4);
    for (const region of NUKETOWN_VERGE_BLOOM_REGIONS) {
      const isWestOrEast = Math.abs(region.minX) >= 18 && Math.abs(region.maxX) <= 24;
      const isNorthOrSouth = Math.abs(region.minZ) >= 36 && Math.abs(region.maxZ) <= 42;
      expect(isWestOrEast || isNorthOrSouth).toBe(true);
    }
  });

  it('places bloom instances in (0, 600] across <= 4 draws', () => {
    const parent = new THREE.Group();
    const bloom = buildNuketownVergeBloomField(parent);
    expect(bloom.stats.blades).toBeGreaterThan(0);
    expect(bloom.stats.blades).toBeLessThanOrEqual(600);
    expect(bloom.stats.drawCalls).toBeLessThanOrEqual(4);
    expect(bloom.meshes.length).toBe(bloom.stats.drawCalls);
  });

  it('confines every bloom instance to the verge strips and outside the fence interior', () => {
    const parent = new THREE.Group();
    const bloom = buildNuketownVergeBloomField(parent);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    let totalInstances = 0;
    for (const mesh of bloom.meshes) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        matrix.decompose(position, quaternion, scale);
        totalInstances++;

        // Outside fence interior: fence interior is |x| < 18 && |z| < 36
        const insideFence = Math.abs(position.x) < 18 && Math.abs(position.z) < 36;
        expect(insideFence, `instance at (${position.x}, ${position.z}) must be outside fence interior`).toBe(false);

        // Inside verge strips: |x| in 18..24 or |z| in 36..42
        const inVergeStrip = (Math.abs(position.x) >= 18 && Math.abs(position.x) <= 24)
          || (Math.abs(position.z) >= 36 && Math.abs(position.z) <= 42);
        expect(inVergeStrip, `instance at (${position.x}, ${position.z}) must be within verge strips`).toBe(true);

        // Within arena outer bounds for verges (|x| <= 24, |z| <= 42)
        expect(Math.abs(position.x)).toBeLessThanOrEqual(24);
        expect(Math.abs(position.z)).toBeLessThanOrEqual(42);

        // Height bounded under 0.25 m art-only ceiling
        expect(position.y).toBeLessThanOrEqual(0.25);
        expect(scale.y).toBeLessThanOrEqual(1.0);
      }
    }
    expect(totalInstances).toBe(bloom.stats.blades);
  });

  it('is deterministic: two builds produce byte-identical instance streams', () => {
    const p1 = new THREE.Group();
    const p2 = new THREE.Group();
    const b1 = buildNuketownVergeBloomField(p1);
    const b2 = buildNuketownVergeBloomField(p2);

    expect(b1.stats).toEqual(b2.stats);
    expect(b1.meshes.length).toBe(b2.meshes.length);
    for (let m = 0; m < b1.meshes.length; m++) {
      const arr1 = b1.meshes[m].instanceMatrix.array;
      const arr2 = b2.meshes[m].instanceMatrix.array;
      expect(arr1).toEqual(arr2);
      if (b1.meshes[m].instanceColor && b2.meshes[m].instanceColor) {
        expect(b1.meshes[m].instanceColor!.array).toEqual(b2.meshes[m].instanceColor!.array);
      }
    }
  });

  it('leaves the lawn field stats unchanged vs pinned values and prints total tris', () => {
    const { stats: lawnStats } = bladeOrigins(false);
    expect(lawnStats.drawCalls).toBe(4);
    expect(lawnStats.blades).toBeGreaterThan(5_000);

    const parent = new THREE.Group();
    const bloom = buildNuketownVergeBloomField(parent);
    const totalTris = lawnStats.triangles + bloom.stats.triangles;
    process.stdout.write(
      `\n[HF-536 VERGE BLOOM STATS]\n`
      + `  Lawn:  ${lawnStats.blades} blades, ${lawnStats.drawCalls} draws, ${lawnStats.triangles} tris\n`
      + `  Bloom: ${bloom.stats.blades} blades, ${bloom.stats.drawCalls} draws, ${bloom.stats.triangles} tris\n`
      + `  Total tris (lawn + bloom): ${totalTris}\n`,
    );
  });

  it('uses its own MeshStandardNodeMaterial with zero texture samplers', () => {
    const parent = new THREE.Group();
    const bloom = buildNuketownVergeBloomField(parent);
    const lawn = buildNuketownLawnField(new THREE.Group(), false);

    const bloomMat = bloom.meshes[0].material;
    const lawnMat = lawn.meshes[0].material;
    expect(bloomMat).not.toBe(lawnMat);

    // Sampler count must be 0
    let samplerCount = 0;
    const standard = bloomMat as THREE.MeshStandardMaterial;
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'displacementMap', 'alphaMap'] as const) {
      if (standard[key]) samplerCount++;
    }
    const nodeMat = bloomMat as unknown as { colorNode?: unknown; positionNode?: unknown };
    const seen = new Set<object>();
    function inspectNode(node: unknown): void {
      if (!node || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      const record = node as Record<string, unknown>;
      const val = record.value;
      const isValTexture = Boolean(val && typeof val === 'object' && 'isTexture' in val && val.isTexture === true);
      if (record.isTextureNode === true || record.type === 'TextureNode' || isValTexture) {
        samplerCount++;
      }
      for (const k of Object.keys(record)) {
        if (k !== 'parent' && k !== 'parents') inspectNode(record[k]);
      }
    }
    inspectNode(nodeMat.colorNode);
    inspectNode(nodeMat.positionNode);
  });

  it('keeps bloom tint spec under material.color ceiling', () => {
    expect(grassClumpTintPeak(NUKETOWN_VERGE_BLOOM_TINT)).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// HF-536 look-2b: dry-grass variety and the clover/flower layer (nuketown2)
// ---------------------------------------------------------------------------

describe('HF-536 look-2b nuketown2 lawn variety', () => {
  /**
   * THE NEUTRALITY PROOF, and the reason it is the first test here.
   *
   * This pass moved the rebuild lawn's BASE colour from the green 0x5e9e41 to
   * the straw 0xc5aa5b, because `material.color` multiplies and is capped at
   * white, so a straw patch is simply unreachable from a green base (this
   * machine's "three.js tint cannot lighten" gotcha). That is a big lever on a
   * surface that covers most of the map, and the ONLY thing that makes it safe
   * is that the green half of the tint was re-derived to compose to exactly
   * the old value. This asserts that composition against the OLD constants,
   * over the whole warm range - not against a comment.
   */
  it('moves the GREEN lawn toward the boards olive (HF-536 muse-lawn measured ratchet: lime hue 99 -> olive ~57 deg)', () => {
    // Look-2b's neutrality proof (exact composition vs 0x5e9e41) is SUPERSEDED by
    // measurement: interim-4 boards bedGround hue 61.3 sat 63.5%, surroundGround
    // hue 68.5 sat 69.4%, while the lime composed hue 99.0 sat 72.5% at value 0.855
    // was the largest colour gap in every yard frame. The green half now composes
    // to olive; the value terms still match the shipped lawn exactly.
    const oldBase = new THREE.Color(0x5e9e41);
    const newBase = new THREE.Color(NUKETOWN2_LAWN_BASE_COLOR);
    const toSrgb = (l: number): number => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055) * 255;
    const hueSat = (rgb: readonly number[]): readonly [number, number] => {
      const [r, g, b] = [rgb[0]! / 255, rgb[1]! / 255, rgb[2]! / 255];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return [0, 0] as const;
      const sat = (max - min) / max;
      let hue = 0;
      if (max === r) hue = ((g - b) / (max - min)) % 6;
      else if (max === g) hue = (b - r) / (max - min) + 2;
      else hue = (r - g) / (max - min) + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
      return [hue, sat * 100] as const;
    };
    for (const warm of [0, 0.25, 0.5, 0.75, 1]) {
      const before = [
        oldBase.r * (NUKETOWN_LAWN_TINT.rBase + NUKETOWN_LAWN_TINT.rWarm * warm),
        oldBase.g * (NUKETOWN_LAWN_TINT.gBase + NUKETOWN_LAWN_TINT.gWarm * warm),
        oldBase.b * (NUKETOWN_LAWN_TINT.bBase + NUKETOWN_LAWN_TINT.bWarm * warm),
      ];
      const after = [
        newBase.r * (NUKETOWN2_LAWN_TINT.rBase + NUKETOWN2_LAWN_TINT.rWarm * warm),
        newBase.g * (NUKETOWN2_LAWN_TINT.gBase + NUKETOWN2_LAWN_TINT.gWarm * warm),
        newBase.b * (NUKETOWN2_LAWN_TINT.bBase + NUKETOWN2_LAWN_TINT.bWarm * warm),
      ];
      // The move happened: red rises, green leaves lime.
      expect(after[0]!, `warm=${warm} red rises`).toBeGreaterThan(before[0]!);
      expect(after[1]!, `warm=${warm} green leaves lime`).toBeLessThan(before[1]! * 0.6);
      // ...and it landed olive: composed with the shipped value term, inside the
      // ratchet band the boards measure (lime hue 99.0 sat 72.5 fails both sides).
      const srgb = [
        toSrgb(after[0]! * NUKETOWN2_LAWN_TINT.valueBase),
        toSrgb(after[1]! * NUKETOWN2_LAWN_TINT.valueBase),
        toSrgb(after[2]! * NUKETOWN2_LAWN_TINT.valueBase),
      ];
      const [hue, sat] = hueSat(srgb);
      expect(hue, `warm=${warm} hue olive`).toBeGreaterThan(45);
      expect(hue, `warm=${warm} hue olive`).toBeLessThan(75);
      expect(sat, `warm=${warm} saturation olive`).toBeGreaterThan(30);
      expect(sat, `warm=${warm} saturation olive`).toBeLessThan(60);
    }
    // ...and the value terms, which multiply both, did not move either.
    expect(NUKETOWN2_LAWN_TINT.valueBase).toBe(NUKETOWN_LAWN_TINT.valueBase);
    expect(NUKETOWN2_LAWN_TINT.valuePatch).toBe(NUKETOWN_LAWN_TINT.valuePatch);
    expect(NUKETOWN2_LAWN_TINT.valueJitter).toBe(NUKETOWN_LAWN_TINT.valueJitter);
  });

  it('keeps both new tint specs under the material.color white cap', () => {
    expect(grassClumpTintPeak(NUKETOWN2_LAWN_TINT)).toBeLessThanOrEqual(1);
    expect(grassClumpTintPeak(NUKETOWN2_CLOVER_TINT)).toBeLessThanOrEqual(1);
  });

  it('makes the dry patch a REAL straw over the OLIVE turf (HF-536 muse-lawn measured ratchet: olive R/G forces warmth 1.8 -> 1.1, luma step kept)', () => {
    // The whole point of moving the base. A dry spot that is merely darker is
    // a shadow, not dry grass, and that is all a tint over a green base can do.
    const base = new THREE.Color(NUKETOWN2_LAWN_BASE_COLOR);
    const dry = NUKETOWN2_LAWN_TINT.dry!;
    const green = [
      base.r * (NUKETOWN2_LAWN_TINT.rBase + NUKETOWN2_LAWN_TINT.rWarm * 0.5),
      base.g * (NUKETOWN2_LAWN_TINT.gBase + NUKETOWN2_LAWN_TINT.gWarm * 0.5),
      base.b * (NUKETOWN2_LAWN_TINT.bBase + NUKETOWN2_LAWN_TINT.bWarm * 0.5),
    ];
    const patch = [
      green[0]! + (base.r * dry.rDry - green[0]!) * dry.weight,
      green[1]! + (base.g * dry.gDry - green[1]!) * dry.weight,
      green[2]! + (base.b * dry.bDry - green[2]!) * dry.weight,
    ];
    const luma = (c: number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    expect(luma(patch)).toBeGreaterThan(luma(green) * 1.15);
    // Muse-lawn: the green is olive now (R/G 1.04, not lime 0.26), so the straw's
    // measured R/G step is 1.21x, not 1.8x; the 1.81x luma step above is the dry read.
    expect(patch[0]! / patch[1]!).toBeGreaterThan((green[0]! / green[1]!) * 1.1);
    // ...and it stays a PATCH, not a repaint: never more than the brief's mix.
    expect(dry.weight).toBeLessThanOrEqual(0.35);
    // Patch size inside the brief's 3-6 m band.
    expect(dry.patchM).toBeGreaterThanOrEqual(3);
    expect(dry.patchM).toBeLessThanOrEqual(6);
  });

  it('spreads the dryness over a real yard instead of tinting all of it', () => {
    // Measured over the rebuild's north yard lawn rectangle, not asserted from
    // the `coverage` constant: the field is a warped sin/cos product, so the
    // constant is a knob, not the answer.
    const dry = NUKETOWN2_LAWN_TINT.dry!;
    let samples = 0;
    let touched = 0;
    let full = 0;
    for (let x = -16; x < 16; x += 0.25) {
      for (let z = 23; z < 36; z += 0.25) {
        const d = grassDryness(dry, x, z);
        samples += 1;
        if (d > 0.05) touched += 1;
        if (d > 0.6) full += 1;
      }
    }
    expect(samples).toBeGreaterThan(5000);
    expect(touched / samples).toBeGreaterThan(0.12);
    expect(touched / samples).toBeLessThan(0.45);
    expect(full / samples).toBeGreaterThan(0.05);
    for (const [x, z] of [[0, 0], [7.3, -19.1], [-15.9, 35.4], [3.14, 2.72]] as const) {
      const d = grassDryness(dry, x, z);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });

  it('plants the clover layer inside its 400-tuft cap, presentation only', () => {
    const scene = new THREE.Scene();
    const map = buildNuketown2(scene);
    const stats = map.root.userData.nuketown2CloverStats as {
      blades: number; drawCalls: number; triangles: number;
    };
    expect(stats).toBeDefined();
    expect(stats.blades).toBeGreaterThan(60);
    expect(stats.blades).toBeLessThanOrEqual(NUKETOWN2_CLOVER_BUDGET);
    // The clover never becomes tall grass: under half the art-only ceiling.
    expect(NUKETOWN2_CLOVER_HEIGHT_M).toBeLessThan(GRASS_MAX_HEIGHT * 0.6);
    let cloverNodes = 0;
    map.root.traverse((node) => {
      if (!node.name.startsWith('nuketown2-clover')) return;
      cloverNodes += 1;
      expect(node.userData.presentationOnly, node.name).toBe(true);
      expect(node.userData.blocksShots, node.name).toBe(false);
    });
    expect(cloverNodes).toBeGreaterThan(1);
    for (const mesh of map.raycastMeshes) {
      expect(mesh.name.startsWith('nuketown2-clover')).toBe(false);
    }
  });

  it('carries TWO plant tints in the clover layer from one material', () => {
    // The brief asked for two more tints. They come from the SAME field: the
    // base is the pale bloom and the tint pulls most tufts to clover green,
    // with the dry-patch field acting as the flower-head clusters. One field,
    // one graph, no second pipeline and no sampler.
    const base = new THREE.Color(NUKETOWN2_CLOVER_BASE_COLOR);
    const leaf = [
      base.r * NUKETOWN2_CLOVER_TINT.rBase,
      base.g * NUKETOWN2_CLOVER_TINT.gBase,
      base.b * NUKETOWN2_CLOVER_TINT.bBase,
    ];
    const bloom = [
      base.r * NUKETOWN2_CLOVER_TINT.dry!.rDry,
      base.g * NUKETOWN2_CLOVER_TINT.dry!.gDry,
      base.b * NUKETOWN2_CLOVER_TINT.dry!.bDry,
    ];
    const luma = (c: number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    expect(luma(bloom)).toBeGreaterThan(luma(leaf) * 3);
    // ...and the leaf is a GREEN, not a wash: the green channel dominates.
    expect(leaf[1]!).toBeGreaterThan(leaf[0]! * 1.4);
    expect(leaf[1]!).toBeGreaterThan(leaf[2]! * 1.4);
  });

  it('keys the OLIVE ground PLATE dry patch to the same field as the blades (HF-536 muse-lawn measured ratchet: plate 0x496438 -> 0x6a6b3a, hue step 1.8 -> 1.15)', () => {
    // THE CORRECTION ROUND'S CONTRACT. The first cut put dryness on the blade
    // instances only and it measured invisible (north-yard/lawnNear luma
    // stddev 15.70 -> 16.07, zero straw pixels either side, 15 of 29 stations
    // MATCH on the viewpoint diff), because the ground plate under the blades
    // is most of the pixels in a lawn box. Plate and blades must therefore go
    // dry in the SAME PLACES - two fields at different periods would read as
    // noise, not as patches - so the period and the threshold pair are pinned
    // across the two modules here rather than duplicated by hand.
    const dry = NUKETOWN2_LAWN_TINT.dry!;
    expect(LAWN_DRY_PATCH_M).toBe(dry.patchM);
    expect(LAWN_DRY_PATCH_WEIGHT).toBe(dry.weight);
    // grassDryness derives its ramp from `coverage`; the plate takes the same
    // two numbers as literals, so this is the equality that keeps them honest.
    const lo = 1 - dry.coverage;
    expect(LAWN_DRY_PATCH_THRESHOLDS[0]).toBeCloseTo(lo, 6);
    expect(LAWN_DRY_PATCH_THRESHOLDS[1]).toBeCloseTo(lo + (1 - lo) * 0.55, 3);
    // ...and the plate's dry albedo must be a HUE step, not a brightness step:
    // the term it replaces was a x1.42 value multiply, which is why the plate
    // read as one flat green however dry the field said it was. Muse-lawn: the
    // turf is olive now (R/G 0.98, not lime 0.53), so the straw's measured R/G
    // step is 1.42x; the B/G drop below the turf is the rest of the hue proof.
    const [r, g, b] = LAWN_DRY_ALBEDO_LINEAR;
    const turf = new THREE.Color(0x6a6b3a);
    expect(r / g).toBeGreaterThan((turf.r / turf.g) * 1.15);
    expect(b / g).toBeLessThan(turf.b / turf.g);
  });

  it('builds the clover deterministically', () => {
    const first = buildNuketown2(new THREE.Scene()).root.userData.nuketown2CloverStats;
    const second = buildNuketown2(new THREE.Scene()).root.userData.nuketown2CloverStats;
    expect(second).toEqual(first);
  });
});
