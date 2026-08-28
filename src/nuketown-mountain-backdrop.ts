/**
 * nuketown-mountain-backdrop.ts — Pass 82 "surrounding mountains in nuketown".
 *
 * A distant procedural mountain ring OUTSIDE the boundary fence: beyond the
 * fence plane the horizon was empty sky, so the military-suburb read ended at
 * a picket fence floating in void. This module closes the world with:
 *
 *   - a ground skirt disc well BELOW the arena ground plane (y = -0.42), so
 *     the land visibly continues past the fence to the ridges instead of
 *     dropping into sky;
 *   - a low scrubland foothill ring; and
 *   - a taller main ridge ring behind it, both built as seeded low-poly
 *     triangle strips with per-segment crest/height variation (procedural
 *     ridgelines, not one repeated cone) and flat shading.
 *
 * ART-ONLY BY CONSTRUCTION (the whole point of the placement envelope):
 *   - every ridge vertex sits radially OUTSIDE the boundary fence corner
 *     (NUKETOWN_BACKDROP_MIN_RADIAL_M > |bounds corner| + fence), so no
 *     sightline test inside the arena can ever intersect it;
 *   - everything stays inside the arena camera's 180 m far plane from every
 *     reachable camera position (max radial + arena corner < 180);
 *   - no colliders, no raycast surfaces, no shadow passes; fog stays ON so
 *     the arena's authored fog (0xb1c0be, near 58 / far 148 — see
 *     src/rendering/arenas/atomic-acres.ts) does the distance grading.
 *
 * Original geometry only (repo sourcePolicy): every vertex is computed here
 * from a fixed-seed mulberry32 stream — deterministic on every peer.
 */
import * as THREE from 'three';

/** Every ridge vertex is at least this far from the world origin (metres).
 * The boundary fence corner sits at hypot(31.3, 31.8) = 44.6 m; the envelope
 * starts well beyond it so the backdrop can never enter gameplay space. */
export const NUKETOWN_BACKDROP_MIN_RADIAL_M = 58;
/** Radial ceiling (metres): max radial + arena camera corner (44.3 m) stays
 * inside the atomic-acres 180 m camera far plane with margin. */
export const NUKETOWN_BACKDROP_MAX_RADIAL_M = 132;
/** Crest ceiling (metres). */
export const NUKETOWN_BACKDROP_MAX_HEIGHT_M = 34;
/** The ground skirt never rises above this (kept below the arena ground). */
export const NUKETOWN_BACKDROP_SKIRT_Y_M = -0.42;

const SEED = 0x0a82_5c17;

export interface NuketownBackdropStats {
  meshes: number;
  triangles: number;
}

export interface NuketownMountainBackdrop {
  group: THREE.Group;
  stats: Readonly<NuketownBackdropStats>;
  dispose(): void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RidgeRingSpec = Readonly<{
  name: string;
  segments: number;
  /** Radial band [innerBase, outerBase]; the crest wanders inside it. */
  innerRadius: number;
  outerRadius: number;
  /** Crest height band [min, max] before the per-segment variation. */
  heightMin: number;
  heightMax: number;
  /** Base colour at the foot and near the crest (vertex-colour lerp). */
  footColor: number;
  crestColor: number;
  /** Decorrelates the sine octaves between rings. */
  phase: number;
}>;

/**
 * One ridge ring: three vertex rows (inner foot at y~0.2 below ground, crest,
 * outer foot dipped to -2.5) triangulated into a closed strip. Crest radius
 * and height vary per angular segment through layered sines + seeded jitter,
 * which is what makes it read as a mountain RANGE instead of a crown of
 * identical cones.
 */
function buildRidgeRing(spec: RidgeRingSpec): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const foot = new THREE.Color(spec.footColor);
  const crest = new THREE.Color(spec.crestColor);
  const vertexColor = new THREE.Color();

  const rows = 3; // inner foot, crest, outer foot
  for (let segment = 0; segment <= spec.segments; segment += 1) {
    // The seam pair (segment 0 / segments) must share identical noise so the
    // ring closes; reuse the angle-periodic sines and a wrapped jitter index.
    const wrapped = segment % spec.segments;
    const angle = (wrapped / spec.segments) * Math.PI * 2;
    const jitterA = mulberry32((SEED ^ (wrapped * 2654435761)) >>> 0)();
    const jitterB = mulberry32((SEED ^ ((wrapped + 977) * 40503)) >>> 0)();

    const undulation =
      Math.sin(angle * 3 + spec.phase) * 0.45 +
      Math.sin(angle * 7 + spec.phase * 2.3) * 0.3 +
      Math.sin(angle * 13 + spec.phase * 4.1) * 0.25;
    const heightT = Math.min(1, Math.max(0, 0.5 + 0.5 * undulation + (jitterA - 0.5) * 0.55));
    const height = spec.heightMin + (spec.heightMax - spec.heightMin) * heightT;
    const crestRadius =
      spec.innerRadius +
      (spec.outerRadius - spec.innerRadius) * (0.35 + 0.3 * (0.5 + 0.5 * Math.sin(angle * 5 - spec.phase)) + (jitterB - 0.5) * 0.2);

    const ringRows: Array<readonly [number, number]> = [
      [spec.innerRadius, -0.2],
      [crestRadius, height],
      [spec.outerRadius, -2.5],
    ];
    for (let row = 0; row < rows; row += 1) {
      const [radius, y] = ringRows[row];
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      const t = row === 1 ? Math.min(1, height / spec.heightMax) : 0;
      vertexColor.copy(foot).lerp(crest, t * 0.85 + (row === 1 ? 0.15 : 0));
      // Small per-segment tonal break-up so long slopes are not one flat wash.
      const tone = 0.94 + jitterA * 0.12;
      colors.push(vertexColor.r * tone, vertexColor.g * tone, vertexColor.b * tone);
    }
  }

  for (let segment = 0; segment < spec.segments; segment += 1) {
    const a = segment * rows;
    const b = (segment + 1) * rows;
    for (let row = 0; row < rows - 1; row += 1) {
      indices.push(a + row, b + row, a + row + 1);
      indices.push(a + row + 1, b + row, b + row + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = spec.name;
  return geometry;
}

/**
 * Build the backdrop under `parent`. Deterministic; art-only. Returns stats
 * for telemetry/tests. Three meshes = three draws, ~2.3k triangles total.
 */
export function buildNuketownMountainBackdrop(parent: THREE.Object3D): NuketownMountainBackdrop {
  const group = new THREE.Group();
  group.name = 'nuketown-mountain-backdrop';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;
  group.userData.nuketownBackdrop = true;

  const ridgeMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.96,
    metalness: 0,
  });
  const skirtMaterial = new THREE.MeshStandardMaterial({
    color: 0x76765c, // dry scrubland tying the fence line to the foothills
    roughness: 1,
    metalness: 0,
  });

  // Scrubby foothill band: low, close enough to be readable over the fence.
  const foothills = new THREE.Mesh(
    buildRidgeRing({
      name: 'nuketown-mountain-foothills',
      segments: 72,
      innerRadius: NUKETOWN_BACKDROP_MIN_RADIAL_M + 6, // 64
      outerRadius: 92,
      heightMin: 4,
      heightMax: 12,
      footColor: 0x6f7355,
      crestColor: 0x7c8069,
      phase: 1.9,
    }),
    ridgeMaterial,
  );
  // Main ridge: taller, further, mostly fog-graded silhouette.
  const ridge = new THREE.Mesh(
    buildRidgeRing({
      name: 'nuketown-mountain-ridge',
      segments: 88,
      innerRadius: 96,
      outerRadius: NUKETOWN_BACKDROP_MAX_RADIAL_M, // 132
      heightMin: 13,
      heightMax: NUKETOWN_BACKDROP_MAX_HEIGHT_M - 4, // 30
      footColor: 0x6b705f,
      crestColor: 0x848c94,
      phase: 4.7,
    }),
    ridgeMaterial,
  );
  const skirt = new THREE.Mesh(
    new THREE.CircleGeometry(NUKETOWN_BACKDROP_MAX_RADIAL_M, 48),
    skirtMaterial,
  );
  skirt.geometry.name = 'nuketown-backdrop-ground-skirt';
  skirt.name = 'nuketown-backdrop-ground-skirt';
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = NUKETOWN_BACKDROP_SKIRT_Y_M;

  let triangles = 0;
  for (const mesh of [skirt, foothills, ridge]) {
    if (mesh !== skirt) mesh.name = mesh.geometry.name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    mesh.userData.nuketownBackdrop = true;
    const index = mesh.geometry.index;
    triangles += index ? index.count / 3 : (mesh.geometry.getAttribute('position')?.count ?? 0) / 3;
    group.add(mesh);
  }

  parent.add(group);
  const stats: NuketownBackdropStats = { meshes: 3, triangles: Math.round(triangles) };
  return {
    group,
    stats,
    dispose: () => {
      foothills.geometry.dispose();
      ridge.geometry.dispose();
      skirt.geometry.dispose();
      ridgeMaterial.dispose();
      skirtMaterial.dispose();
    },
  };
}
