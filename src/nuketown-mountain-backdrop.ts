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
const SNOW_COLOR = new THREE.Color(0xdde4e6);

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
  /** Altitude fraction above which the crest lerps toward snow; omit = none. */
  snowline?: number;
}>;

/**
 * One ridge ring, v2 (owner 2026-08-29: "mountains should be implemented
 * using the techniques I am sharing"). Five vertex rows per angular segment
 * (inner foot, inner shoulder, crest, outer shoulder, outer foot) displaced
 * by RIDGED octave noise - 1-|sin| octaves sharpen the crestline into peaks
 * and saddles the way ridged FBM does, instead of the old three-row tent
 * profile that read as one soft lump from every angle. Colour is banded by
 * altitude (dry scrub foot, sage rock mid-slope, pale granite crest) with
 * per-segment tonal break-up, and the shoulders carry their own radial spur
 * jitter so spurs run down the slopes. Deterministic: same seeded stream.
 */
function buildRidgeRing(spec: RidgeRingSpec): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const foot = new THREE.Color(spec.footColor);
  const mid = new THREE.Color(spec.footColor).lerp(new THREE.Color(spec.crestColor), 0.55);
  const crest = new THREE.Color(spec.crestColor);
  const vertexColor = new THREE.Color();

  // Ridged octave: 1-|sin| gives sharp peaks at the sine zero crossings.
  const ridged = (angle: number, phase: number): number => {
    const o1 = 1 - Math.abs(Math.sin(angle * 3 + phase));
    const o2 = 1 - Math.abs(Math.sin(angle * 7 + phase * 2.3));
    const o3 = 1 - Math.abs(Math.sin(angle * 13 + phase * 4.1));
    const o4 = 1 - Math.abs(Math.sin(angle * 23 + phase * 7.9));
    return (o1 * 0.42 + o2 * 0.28 + o3 * 0.19 + o4 * 0.11);
  };

  const rows = 5;
  for (let segment = 0; segment <= spec.segments; segment += 1) {
    const wrapped = segment % spec.segments;
    const angle = (wrapped / spec.segments) * Math.PI * 2;
    const jitterA = mulberry32((SEED ^ (wrapped * 2654435761)) >>> 0)();
    const jitterB = mulberry32((SEED ^ ((wrapped + 977) * 40503)) >>> 0)();
    const jitterC = mulberry32((SEED ^ ((wrapped + 4409) * 69069)) >>> 0)();

    const relief = ridged(angle, spec.phase);
    const heightT = Math.min(1, Math.max(0.08, relief * 1.15 + (jitterA - 0.5) * 0.4));
    const height = spec.heightMin + (spec.heightMax - spec.heightMin) * heightT;
    const band = spec.outerRadius - spec.innerRadius;
    const crestRadius = spec.innerRadius
      + band * (0.36 + 0.26 * ridged(angle * 0.5 + 1.3, spec.phase * 1.7) + (jitterB - 0.5) * 0.16);
    // Spur jitter: shoulders wander off the crest line so ridgelines run
    // DOWN the slopes instead of the slope being one straight cone face.
    const spurIn = (jitterC - 0.5) * band * 0.18;
    const spurOut = (0.5 - jitterC) * band * 0.14;
    const innerShoulderR = spec.innerRadius + (crestRadius - spec.innerRadius) * 0.55 + spurIn;
    const outerShoulderR = crestRadius + (spec.outerRadius - crestRadius) * 0.5 + spurOut;
    const innerShoulderY = height * (0.4 + 0.18 * ridged(angle * 2.1, spec.phase + 2.2));
    const outerShoulderY = height * (0.5 + 0.16 * ridged(angle * 1.7, spec.phase + 4.4));

    const ringRows: Array<readonly [number, number, number]> = [
      [spec.innerRadius, -0.2, 0],
      [Math.max(spec.innerRadius, innerShoulderR), innerShoulderY, 0.45],
      [crestRadius, height, 1],
      [Math.min(spec.outerRadius, outerShoulderR), outerShoulderY, 0.5],
      [spec.outerRadius, -2.5, 0],
    ];
    for (let row = 0; row < rows; row += 1) {
      const [radius, y, altitude] = ringRows[row];
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      // Altitude banding: scrub foot -> sage rock -> pale crest, scaled by
      // how tall this segment actually is so low saddles stay scrubby.
      const t = altitude * Math.min(1, height / spec.heightMax);
      if (t < 0.5) vertexColor.copy(foot).lerp(mid, t * 2);
      else vertexColor.copy(mid).lerp(crest, (t - 0.5) * 2);
      // v3: crests above the snowline blend toward cold rock-snow, scaled by
      // how far past the line this vertex sits - only the tall peaks cap.
      if (spec.snowline !== undefined && t > spec.snowline) {
        vertexColor.lerp(SNOW_COLOR, Math.min(1, (t - spec.snowline) / (1 - spec.snowline)) * 0.85);
      }
      const tone = 0.92 + jitterA * 0.16;
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
      segments: 108,
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
      segments: 144,
      innerRadius: 96,
      outerRadius: NUKETOWN_BACKDROP_MAX_RADIAL_M, // 132
      heightMin: 13,
      heightMax: NUKETOWN_BACKDROP_MAX_HEIGHT_M - 4, // 30
      footColor: 0x6b705f,
      crestColor: 0x848c94,
      phase: 4.7,
      snowline: 0.8,
    }),
    ridgeMaterial,
  );
  // v3: a third, taller far range fills the gap between the main ridge's
  // saddles so the horizon reads as a layered massif instead of one band;
  // its peaks carry the snowline.
  const farRange = new THREE.Mesh(
    buildRidgeRing({
      name: 'nuketown-mountain-far-range',
      segments: 120,
      innerRadius: 116,
      outerRadius: NUKETOWN_BACKDROP_MAX_RADIAL_M,
      heightMin: 20,
      heightMax: NUKETOWN_BACKDROP_MAX_HEIGHT_M,
      footColor: 0x707a84,
      crestColor: 0x9aa6b0,
      phase: 8.3,
      snowline: 0.66,
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
  for (const mesh of [skirt, foothills, ridge, farRange]) {
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
  const stats: NuketownBackdropStats = { meshes: 4, triangles: Math.round(triangles) };
  return {
    group,
    stats,
    dispose: () => {
      foothills.geometry.dispose();
      ridge.geometry.dispose();
      farRange.geometry.dispose();
      skirt.geometry.dispose();
      ridgeMaterial.dispose();
      skirtMaterial.dispose();
    },
  };
}
