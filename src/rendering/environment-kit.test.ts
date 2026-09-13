/**
 * environment-kit contract tests.
 *
 * These run in plain Node with NO canvas, NO document and NO WebGPU renderer,
 * which is the point: the collider/visual parity audit and the whole vitest
 * suite construct arenas headlessly, so the kit is only usable if every path
 * here works against three core alone. There is deliberately no jsdom and no
 * canvas shim in this file — if the kit ever reaches for `document`, these
 * tests go red rather than the parity audit.
 *
 * What is pinned:
 *   (a) DETERMINISM — same seed, byte-identical instance matrices. Our arenas
 *       must build identically on every peer and every run.
 *   (b) KEEP-OUT STABILITY — the position-hashed variation contract: an
 *       instance that survives both a before and an after build looks
 *       identical in both, so tightening a clearance never re-rolls the field.
 *   (c) CLEARANCE — the caller's predicate is respected for every instance,
 *       and layered Poisson separation actually holds.
 *   (d) BOUNDS — every InstancedMesh has a non-null bounding sphere that
 *       encloses its instances (a spread batch culls wrongly otherwise).
 *   (e) BUDGET — triangle and draw-call counts stay under a stated bound.
 *   (f) PRESENTATION-ONLY — nothing gains gameplay authority.
 *   (g) RIDGE BACKDROP — outside arena bounds, finite, seam-continuous
 *       normals, deterministic, and cheap.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildEnvironment,
  buildRidgeRing,
  detailHash,
  PLANT_KINDS,
  scatterVegetation,
  triangleCount,
  type ClearancePredicate,
  type VegetationLayerSpec,
  type VegetationScatterOptions,
} from './environment-kit';

// ---------------------------------------------------------------------------
// Fixtures — a Test1-shaped range belt: four plant kinds, layered clearances.
// ---------------------------------------------------------------------------

const LAYERS: readonly VegetationLayerSpec[] = [
  // Layer 0: broadleaf. One entry — its own self-spacing.
  { kind: 'broadleaf', count: 14, spacings: [7] },
  // Layer 1: conifer. 5 m off any broadleaf, 4.5 m off each other.
  { kind: 'conifer', count: 18, spacings: [5, 4.5] },
  // Layer 2: shrub. 2.6 m off broadleaf, 2 m off conifer, 1.6 m off itself.
  { kind: 'shrub', count: 40, spacings: [2.6, 2, 1.6] },
  // Layer 3: dry scrub. Tight to everything, 0.8 m off itself.
  { kind: 'dry-scrub', count: 120, spacings: [1.2, 1, 0.7, 0.8] },
];

const AREA = { minX: -26, maxX: 26, minZ: -19, maxZ: 19 } as const;

function baseOptions(overrides: Partial<VegetationScatterOptions> = {}): VegetationScatterOptions {
  return {
    seed: 0xa11ce,
    area: AREA,
    layers: LAYERS,
    namePrefix: 'spec',
    ...overrides,
  };
}

function scatterInto(options: VegetationScatterOptions) {
  const root = new THREE.Group();
  return { root, result: scatterVegetation(root, options) };
}

function matricesOf(mesh: THREE.InstancedMesh): number[][] {
  const out: number[][] = [];
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, matrix);
    out.push(Array.from(matrix.elements));
  }
  return out;
}

function instancePositions(mesh: THREE.InstancedMesh): THREE.Vector3[] {
  const matrix = new THREE.Matrix4();
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, matrix);
    out.push(new THREE.Vector3().setFromMatrixPosition(matrix));
  }
  return out;
}

// ---------------------------------------------------------------------------
// (a) Determinism
// ---------------------------------------------------------------------------

describe('scatterVegetation determinism', () => {
  it('produces byte-identical instance matrices for the same seed', () => {
    const a = scatterInto(baseOptions());
    const b = scatterInto(baseOptions());

    expect(a.result.meshes.map((m) => m.name)).toEqual(b.result.meshes.map((m) => m.name));
    expect(a.result.stats).toEqual(b.result.stats);
    for (let i = 0; i < a.result.meshes.length; i += 1) {
      const left = a.result.meshes[i];
      const right = b.result.meshes[i];
      expect(right.count).toBe(left.count);
      expect(matricesOf(right)).toEqual(matricesOf(left));
    }
  });

  it('changes the layout when the seed changes (the seed is actually wired)', () => {
    const a = scatterInto(baseOptions());
    const b = scatterInto(baseOptions({ seed: 0xb0b }));
    const nameA = a.result.meshes[0].name;
    const meshB = b.result.meshes.find((m) => m.name === nameA);
    expect(meshB).toBeDefined();
    expect(matricesOf(meshB as THREE.InstancedMesh)).not.toEqual(matricesOf(a.result.meshes[0]));
  });

  it('does not depend on Math.random anywhere in its output', () => {
    // three itself burns Math.random on object UUIDs, so counting calls proves
    // nothing. Pinning the global to two different constants and demanding
    // identical GEOMETRY does: if any placement, jitter or displacement term
    // read Math.random, these two builds would diverge.
    const original = Math.random;
    const build = (value: number) => {
      Math.random = () => value;
      try {
        const scatter = scatterInto(baseOptions());
        const ridge = buildRidgeRing({ seed: 7, innerRadiusM: 44, outerRadiusM: 130 });
        return {
          matrices: scatter.result.meshes.map((mesh) => matricesOf(mesh)),
          names: scatter.result.meshes.map((mesh) => mesh.name),
          ridge: Array.from(ridge.mesh.geometry.getAttribute('position').array),
        };
      } finally {
        Math.random = original;
      }
    };
    expect(build(0.123456)).toEqual(build(0.987654));
  });

  it('detailHash is a pure function of position and stream', () => {
    expect(detailHash(1, 256, -512, 4)).toBe(detailHash(1, 256, -512, 4));
    expect(detailHash(1, 256, -512, 4)).not.toBe(detailHash(1, 256, -512, 5));
    expect(detailHash(1, 256, -512, 4)).not.toBe(detailHash(2, 256, -512, 4));
    for (const stream of [2, 3, 4, 5, 6, 7, 8]) {
      const value = detailHash(0xdead, 12345, -6789, stream);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// (b) Keep-out stability (position-hashed variation)
// ---------------------------------------------------------------------------

describe('scatterVegetation keep-out stability', () => {
  it('leaves surviving instances byte-identical when a keep-out is added', () => {
    // A lane keep-out down the middle of the range.
    const lane: ClearancePredicate = (x, _z, radius) => Math.abs(x) - radius > 4;
    const open = scatterInto(baseOptions());
    const guarded = scatterInto(baseOptions({ allow: lane }));

    const byPosition = new Map<string, number[]>();
    for (const mesh of open.result.meshes) {
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.getMatrixAt(i, matrix);
        const p = new THREE.Vector3().setFromMatrixPosition(matrix);
        byPosition.set(`${mesh.name}|${p.x.toFixed(4)}|${p.z.toFixed(4)}`, Array.from(matrix.elements));
      }
    }

    let compared = 0;
    for (const mesh of guarded.result.meshes) {
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.getMatrixAt(i, matrix);
        const p = new THREE.Vector3().setFromMatrixPosition(matrix);
        const before = byPosition.get(`${mesh.name}|${p.x.toFixed(4)}|${p.z.toFixed(4)}`);
        if (!before) continue;
        expect(Array.from(matrix.elements)).toEqual(before);
        compared += 1;
      }
    }
    // The invariant is worthless if nothing actually survived both builds.
    expect(compared).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// (c) Clearance predicate and layered Poisson separation
// ---------------------------------------------------------------------------

describe('scatterVegetation clearance', () => {
  it('respects the caller clearance predicate for every placed instance', () => {
    // Keep a 9 m firing lane and a 6 m radius objective circle clear.
    const lane: ClearancePredicate = (x, z, radius) => {
      if (Math.abs(x) - radius <= 4.5) return false;
      if (Math.hypot(x - 14, z + 10) - radius <= 6) return false;
      return true;
    };
    const { result } = scatterInto(baseOptions({ allow: lane }));
    expect(result.stats.instances).toBeGreaterThan(80);

    for (const mesh of result.meshes) {
      for (const p of instancePositions(mesh)) {
        // Every emitted part shares its plant's XZ, so testing the parts
        // tests the plants (and catches a part that drifted off-centre).
        expect(Math.abs(p.x)).toBeGreaterThan(4.5);
        expect(Math.hypot(p.x - 14, p.z + 10)).toBeGreaterThan(6);
      }
    }
    expect(result.stats.rejected).toBeGreaterThan(0);
  });

  it('keeps every instance inside the requested area', () => {
    const { result } = scatterInto(baseOptions());
    for (const mesh of result.meshes) {
      for (const p of instancePositions(mesh)) {
        expect(p.x).toBeGreaterThanOrEqual(AREA.minX);
        expect(p.x).toBeLessThanOrEqual(AREA.maxX);
        expect(p.z).toBeGreaterThanOrEqual(AREA.minZ);
        expect(p.z).toBeLessThanOrEqual(AREA.maxZ);
      }
    }
  });

  it('honours self-spacing and inter-layer clearance (nothing interpenetrates)', () => {
    const { result } = scatterInto(baseOptions());
    // Collect one representative point per plant, keyed by kind. Parts share
    // XZ, so the canopy part of each kind/tier is a faithful stand-in.
    const byKind = new Map<string, THREE.Vector3[]>();
    for (const mesh of result.meshes) {
      const kind = mesh.userData.plantKind as string;
      const part = mesh.userData.partId as string;
      if (part === 'skirt') continue;
      const isCanopy = part === 'canopy' || part === 'foliage' || part === 'tuft' || part === 'silhouette';
      if (!isCanopy) continue;
      const list = byKind.get(kind) ?? [];
      list.push(...instancePositions(mesh));
      byKind.set(kind, list);
    }

    const spacingFor = (kindA: string, kindB: string): number => {
      const indexA = LAYERS.findIndex((l) => l.kind === kindA);
      const indexB = LAYERS.findIndex((l) => l.kind === kindB);
      const later = Math.max(indexA, indexB);
      const earlier = Math.min(indexA, indexB);
      return LAYERS[later].spacings[earlier];
    };

    const kinds = Array.from(byKind.keys());
    for (const kindA of kinds) {
      for (const kindB of kinds) {
        const required = spacingFor(kindA, kindB);
        const a = byKind.get(kindA) as THREE.Vector3[];
        const b = byKind.get(kindB) as THREE.Vector3[];
        for (let i = 0; i < a.length; i += 1) {
          for (let j = kindA === kindB ? i + 1 : 0; j < b.length; j += 1) {
            const distance = Math.hypot(a[i].x - b[j].x, a[i].z - b[j].z);
            // 1 mm tolerance for the float round-trip through the matrix.
            expect(distance).toBeGreaterThan(required - 0.001);
          }
        }
      }
    }
  });

  it('throws when a layer declares the wrong number of spacings', () => {
    expect(() => scatterInto(baseOptions({
      layers: [{ kind: 'broadleaf', count: 4, spacings: [6] }, { kind: 'shrub', count: 4, spacings: [2] }],
    }))).toThrow(/spacing vector/);
    expect(() => scatterInto(baseOptions({
      layers: [{ kind: 'broadleaf', count: 4, spacings: [6, 3] }],
    }))).toThrow(/spacing vector/);
  });
});

// ---------------------------------------------------------------------------
// (d) Bounding spheres
// ---------------------------------------------------------------------------

describe('scatterVegetation bounds', () => {
  it('gives every batch a non-null bounding sphere that encloses its instances', () => {
    const { result } = scatterInto(baseOptions());
    expect(result.meshes.length).toBeGreaterThan(0);

    for (const mesh of result.meshes) {
      const sphere = mesh.boundingSphere;
      expect(sphere).not.toBeNull();
      const bounds = sphere as THREE.Sphere;
      expect(Number.isFinite(bounds.radius)).toBe(true);
      expect(bounds.radius).toBeGreaterThan(0);
      for (const p of instancePositions(mesh)) {
        expect(bounds.center.distanceTo(p)).toBeLessThanOrEqual(bounds.radius + 1e-4);
      }
    }
  });

  it('produces no NaN in any instance matrix, including on sloped ground', () => {
    const groundY = (x: number, z: number): number => Math.sin(x * 0.12) * 1.4 + Math.cos(z * 0.09) * 1.1;
    const { result } = scatterInto(baseOptions({
      groundY,
      layers: LAYERS.map((layer) => ({ ...layer, tiltToSlope: layer.kind === 'dry-scrub' || layer.kind === 'shrub' })),
    }));
    for (const mesh of result.meshes) {
      for (const row of matricesOf(mesh)) {
        for (const value of row) expect(Number.isFinite(value)).toBe(true);
      }
      // Slope-following instances must still sit on the surface.
      for (const p of instancePositions(mesh)) {
        expect(Math.abs(p.y - groundY(p.x, p.z))).toBeLessThan(0.5);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// (e) Budget
// ---------------------------------------------------------------------------

describe('scatterVegetation budget', () => {
  it('reports instances, distinct plant types and triangles, and stays in budget', () => {
    const { result } = scatterInto(baseOptions());
    const { stats } = result;

    expect(stats.plantTypes).toBe(4);
    expect(PLANT_KINDS.every((kind) => stats.perKind[kind] > 0)).toBe(true);
    expect(stats.instances).toBe(
      PLANT_KINDS.reduce((total, kind) => total + stats.perKind[kind], 0),
    );

    // STATED BOUND (2026-08-30): this fixture is a full four-kind belt at
    // Test1 density (192 requested instances). Test1's ArenaVisualDefinition
    // allows 380 draw calls / 600k triangles and Test2 420 / 700k, so the kit
    // must stay a small fraction of both. Measured here well under:
    expect(stats.triangles).toBeLessThan(60_000);
    expect(stats.drawCalls).toBeLessThanOrEqual(12);

    // And the reported triangle count must be the real one, not a guess.
    let recomputed = 0;
    for (const mesh of result.meshes) recomputed += triangleCount(mesh.geometry) * mesh.count;
    expect(stats.triangles).toBe(recomputed);
  });

  it('splits into two build-time LOD tiers and the far tier is cheaper per plant', () => {
    const { result } = scatterInto(baseOptions({ lod: { nearBandM: 14, originX: 0, originZ: 0 } }));
    expect(result.stats.perTier.near).toBeGreaterThan(0);
    expect(result.stats.perTier.far).toBeGreaterThan(0);

    const cost = (tier: string, kind: string): number => {
      const parts = result.meshes.filter((m) => m.userData.lodTier === tier && m.userData.plantKind === kind);
      if (parts.length === 0) return Number.NaN;
      return parts.reduce((total, mesh) => total + triangleCount(mesh.geometry), 0);
    };
    for (const kind of ['broadleaf', 'conifer', 'shrub']) {
      expect(cost('far', kind)).toBeLessThan(cost('near', kind));
    }
    // The far tier also collapses multi-part plants into one silhouette draw.
    const farBroadleafParts = result.meshes.filter((m) => m.userData.lodTier === 'far' && m.userData.plantKind === 'broadleaf');
    expect(farBroadleafParts.length).toBe(1);
  });

  it('emits multi-part plants whose parts share XZ', () => {
    const { result } = scatterInto(baseOptions({ lod: { nearBandM: Number.POSITIVE_INFINITY } }));
    const trunk = result.meshes.find((m) => m.name === 'spec-broadleaf-near-trunk');
    const canopy = result.meshes.find((m) => m.name === 'spec-broadleaf-near-canopy');
    expect(trunk).toBeDefined();
    expect(canopy).toBeDefined();
    const trunkPositions = instancePositions(trunk as THREE.InstancedMesh);
    const canopyPositions = instancePositions(canopy as THREE.InstancedMesh);
    expect(canopyPositions.length).toBe(trunkPositions.length);
    for (let i = 0; i < trunkPositions.length; i += 1) {
      expect(canopyPositions[i].x).toBeCloseTo(trunkPositions[i].x, 6);
      expect(canopyPositions[i].z).toBeCloseTo(trunkPositions[i].z, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// (f) Presentation-only contract
// ---------------------------------------------------------------------------

describe('environment kit presentation-only contract', () => {
  it('tags every mesh presentation-only and makes it unraycastable', () => {
    const root = new THREE.Group();
    const built = buildEnvironment(root, {
      vegetation: baseOptions(),
      ridge: { seed: 0x1d6e, innerRadiusM: 46, outerRadiusM: 150, arenaClearRadiusM: 34 },
    });

    const meshes: Array<THREE.Mesh | THREE.InstancedMesh> = [];
    built.group.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
    });
    expect(meshes.length).toBeGreaterThan(0);

    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 40, 0), new THREE.Vector3(0, -1, 0));
    for (const mesh of meshes) {
      expect(mesh.userData.presentationOnly).toBe(true);
      expect(mesh.userData.blocksShots).toBe(false);
      const hits: THREE.Intersection[] = [];
      mesh.raycast(raycaster, hits);
      expect(hits).toHaveLength(0);
    }

    // Nothing that smells like gameplay authority leaked onto the group.
    for (const key of ['colliders', 'physicsColliders', 'shotSurfaces', 'spawns', 'navmesh']) {
      expect(built.group.userData[key]).toBeUndefined();
    }
    expect(built.group.userData.presentationOnly).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (g) Ridgeline backdrop
// ---------------------------------------------------------------------------

describe('buildRidgeRing', () => {
  const options = { seed: 0x51de, innerRadiusM: 46, outerRadiusM: 150, arenaClearRadiusM: 34 } as const;

  it('sits entirely outside the arena and never rises to a wall', () => {
    const { mesh, stats } = buildRidgeRing(options);
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      // The radial wobble scales the band width only, so the inner rim is a
      // hard floor: no vertex may ever fall inside innerRadiusM (1e-4 m of
      // slack for the float32 round-trip through the position attribute).
      expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(options.innerRadiusM - 1e-4);
    }
    expect(stats.minRadiusM).toBeGreaterThanOrEqual(options.innerRadiusM - 1e-4);
    expect(stats.minRadiusM).toBeGreaterThan(options.arenaClearRadiusM);
    // Landforms on the horizon, not a wall around the map: an eye at 1.6 m in
    // the arena centre never sees the ridge above ~20 degrees of elevation.
    expect(stats.maxElevationDeg).toBeLessThan(20);
    expect(stats.maxElevationDeg).toBeGreaterThan(3);
  });

  it('refuses to build inside the arena clear radius', () => {
    expect(() => buildRidgeRing({ ...options, innerRadiusM: 30 })).toThrow(/inside the arena clear radius/);
    expect(() => buildRidgeRing({ ...options, outerRadiusM: 10 })).toThrow(/innerRadiusM/);
  });

  it('buries both rims so no lip is ever visible', () => {
    const { mesh } = buildRidgeRing({ ...options, baseY: -1.6 });
    const position = mesh.geometry.getAttribute('position');
    const rows = 13; // bandSegments 12 + 1
    for (let column = 0; column * rows < position.count; column += 1) {
      expect(position.getY(column * rows)).toBeCloseTo(-1.6, 5);
      expect(position.getY(column * rows + rows - 1)).toBeCloseTo(-1.6, 5);
    }
  });

  it('has finite, normalised vertex normals and per-vertex haze colours', () => {
    const { mesh } = buildRidgeRing(options);
    const normal = mesh.geometry.getAttribute('normal');
    const color = mesh.geometry.getAttribute('color');
    expect(normal).toBeDefined();
    expect(color).toBeDefined();
    const vector = new THREE.Vector3();
    for (let i = 0; i < normal.count; i += 1) {
      vector.fromBufferAttribute(normal, i);
      expect(Number.isFinite(vector.lengthSq())).toBe(true);
      expect(vector.length()).toBeCloseTo(1, 3);
    }
    // Haze: the outer rim must be measurably paler than the crest band.
    const rows = 13;
    let inner = 0;
    let outer = 0;
    let samples = 0;
    for (let column = 0; column * rows < color.count; column += 1) {
      inner += color.getX(column * rows + 1);
      outer += color.getX(column * rows + rows - 2);
      samples += 1;
    }
    expect(outer / samples).toBeGreaterThan(inner / samples);
    expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
  });

  it('wraps the theta seam exactly, so the ridgeline has no crack', () => {
    const { mesh } = buildRidgeRing(options);
    const index = mesh.geometry.getIndex();
    expect(index).not.toBeNull();
    const position = mesh.geometry.getAttribute('position');
    const rows = 13;
    const columns = position.count / rows;
    // The last column's quads must reference column 0's vertices; if the seam
    // were duplicated instead, computeVertexNormals would crease there.
    const indices = (index as THREE.BufferAttribute).array;
    let referencesFirstColumn = false;
    for (let i = 0; i < indices.length; i += 1) {
      const vertex = indices[i] as number;
      if (Math.floor(vertex / rows) === 0) { referencesFirstColumn = true; }
    }
    expect(referencesFirstColumn).toBe(true);
    expect(columns).toBe(128);
  });

  it('is deterministic and cheap', () => {
    const a = buildRidgeRing(options);
    const b = buildRidgeRing(options);
    expect(Array.from(a.mesh.geometry.getAttribute('position').array))
      .toEqual(Array.from(b.mesh.geometry.getAttribute('position').array));
    expect(a.stats).toEqual(b.stats);

    // STATED BOUND (2026-08-30): one merged draw at 128x12 quads. Test1's
    // budget is 380 draws / 600k triangles, so the whole horizon costs well
    // under 1% of the triangle budget and one draw call.
    expect(a.stats.drawCalls).toBe(1);
    expect(a.stats.triangles).toBe(128 * 12 * 2);
    expect(a.stats.triangles).toBeLessThan(4_000);

    const c = buildRidgeRing({ ...options, seed: 0x99 });
    expect(Array.from(c.mesh.geometry.getAttribute('position').array))
      .not.toEqual(Array.from(a.mesh.geometry.getAttribute('position').array));
  });
});

// ---------------------------------------------------------------------------
// Combined entry point
// ---------------------------------------------------------------------------

describe('buildEnvironment', () => {
  it('sums vegetation and ridge cost into one budget-assertable stat block', () => {
    const root = new THREE.Group();
    const built = buildEnvironment(root, {
      vegetation: baseOptions(),
      ridge: { seed: 0x1d6e, innerRadiusM: 46, outerRadiusM: 150, arenaClearRadiusM: 34 },
    });
    expect(built.vegetation).not.toBeNull();
    expect(built.ridge).not.toBeNull();
    const vegetation = built.vegetation as NonNullable<typeof built.vegetation>;
    const ridge = built.ridge as NonNullable<typeof built.ridge>;
    expect(built.stats.drawCalls).toBe(vegetation.stats.drawCalls + 1);
    expect(built.stats.triangles).toBe(vegetation.stats.triangles + ridge.stats.triangles);
    expect(root.children).toContain(built.group);
  });

  it('is happy with either half alone', () => {
    const ridgeOnly = buildEnvironment(new THREE.Group(), {
      ridge: { seed: 3, innerRadiusM: 50, outerRadiusM: 140 },
    });
    expect(ridgeOnly.vegetation).toBeNull();
    expect(ridgeOnly.stats.instances).toBe(0);
    expect(ridgeOnly.stats.drawCalls).toBe(1);

    const plantsOnly = buildEnvironment(new THREE.Group(), { vegetation: baseOptions() });
    expect(plantsOnly.ridge).toBeNull();
    expect(plantsOnly.stats.instances).toBeGreaterThan(0);
  });
});
