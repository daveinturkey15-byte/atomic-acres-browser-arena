/**
 * farcrysis-mountains.ts — HF-398 mountain backdrop ring ("the grass, trees,
 * mountains are incredible", cadle.gg quality bar).
 *
 * WHY THIS EXISTS: the audit behind this lane found no mountain system at all
 * — beyond the ±64 m playfield there is only open ocean, five low island
 * silhouettes at 143-150 m (farcrysis-vista) and the sky dome, so the map has
 * no horizon and no skyline. The interior HF-398 highland relief in
 * farcrysis-terrain-authority.ts tops out at ~6.3 m, which reads as hills.
 *
 * WHAT THIS IS: a ring of nine ridged mountain massifs rising out of the open
 * ocean between the arena boundary and the horizon, hand-placed to avoid the
 * vista islands' compass bearings where it matters and displaced by a
 * position-hashed ridge function so every build produces byte-identical
 * geometry. One merged BufferGeometry + one MeshStandardMaterial = one draw
 * call, ~3k triangles against the arena's 1.1M budget.
 *
 * WHAT THIS IS NOT: gameplay authority. Zero colliders, zero shot surfaces,
 * zero spawn/nav data — everything lives outside FARCRYSIS_BOUNDS where the
 * authoritative physics world already ends at the shore. Every mesh is tagged
 * `userData.farcrysisArt` per the art-layer convention.
 *
 * PLACEMENT BOUNDS (all re-measured after authoring, see
 * farcrysis-mountains.test.ts):
 *   - every massif base centre sits 104-128 m from the origin, so the ring
 *     reads inside the review/gameplay camera far plane (190/180) from the
 *   - peak height <= 62 m so even the tallest silhouette stays under ~30
 *     degrees of elevation from an eye at beach level — mountain, not wall;
 *   - bases sink to y = MOUNTAIN_BASE_Y (-1.6), below the ocean vista plane
 *     (-0.62) and below the lagoon wave trough (-0.59), so no massif can ever
 *     float; the shoreline intersection is a real coast, not a seam.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Below ocean plane (-0.62) and lagoon wave trough (-0.59): bases stay sunk. */
const MOUNTAIN_BASE_Y = -1.6;

/** Vertex colour palette — jungle skirt -> forested flank -> bare rock crown. */
const COLOR_JUNGLE = new THREE.Color(0x243a2a);
const COLOR_FLANK = new THREE.Color(0x31482f);
const COLOR_ROCK = new THREE.Color(0x59544a);
/**
 * Hand-authored massif layout. Deterministic by construction (a fixed table,
 * not sampled RNG). dist = metres from origin, height/baseRadius in metres,
 * lobes are the radial ridge frequencies used by the displacement.
 */
interface MassifSpec {
  readonly angleDeg: number;
  readonly dist: number;
  readonly height: number;
  readonly baseRadius: number;
  readonly lobesA: number;
  readonly lobesB: number;
}

const MASSIFS: readonly MassifSpec[] = [
  // Bearing notes are relative to the vista islands (NW [-118,-92],
  // NE [120,-88], S [38,138], SW [-96,108], E [142,38]): massifs are offset
  // off those exact bearings so silhouettes layer instead of coinciding.
  // Ring kept at 104-128 m: the first capture pass showed massifs at 134-142
  // wash out inside the 78-200 fog band and read as pale iceberg cones.
  { angleDeg: 12, dist: 118, height: 58, baseRadius: 34, lobesA: 3, lobesB: 7 },
  { angleDeg: 55, dist: 106, height: 44, baseRadius: 27, lobesA: 4, lobesB: 9 },
  { angleDeg: 97, dist: 124, height: 62, baseRadius: 38, lobesA: 3, lobesB: 8 },
  { angleDeg: 141, dist: 112, height: 47, baseRadius: 29, lobesA: 5, lobesB: 11 },
  { angleDeg: 188, dist: 122, height: 56, baseRadius: 33, lobesA: 4, lobesB: 7 },
  { angleDeg: 229, dist: 106, height: 38, baseRadius: 24, lobesA: 3, lobesB: 10 },
  { angleDeg: 264, dist: 126, height: 60, baseRadius: 36, lobesA: 5, lobesB: 8 },
  { angleDeg: 305, dist: 114, height: 49, baseRadius: 30, lobesA: 4, lobesB: 6 },
  { angleDeg: 337, dist: 128, height: 52, baseRadius: 31, lobesA: 3, lobesB: 9 },
];

/**
 * Position-hashed deterministic noise in [0, 1). Integer-mixed so duplicate
 * seam vertices (identical quantised positions) get identical offsets — the
 * displacement stays watertight without welding vertices.
 */
function coordHash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Quantise to 1 cm so float jitter cannot split seam duplicates. */
function quantise(v: number): number {
  return Math.round(v * 100);
}

/**
 * Displace one cone into a ridged massif silhouette. Three displacement
 * channels, all deterministic:
 *   - ANGULAR LOBES (sine ridges down the flank) fade toward the apex so the
 *     peak stays sharp;
 *   - WHOLE-MASSIF ASYMMETRY (low-frequency, barely fading) leans and bulges
 *     the entire cone off-axis — without it every massif reads as the same
 *     clean pyramid, which the first capture pass showed;
 *   - POSITION-HASHED CRAG, vertical as well as radial, jags the ridgeline
 *     and offsets the apex. Duplicate seam vertices share quantised
 *     positions and therefore identical offsets, so the shell stays
 *     watertight with no vertex welding.
 */
function ridgeDisplaceCone(geometry: THREE.BufferGeometry, spec: MassifSpec): void {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const halfH = spec.height / 2;
  const phaseA = coordHash(quantise(spec.dist), quantise(spec.height), 11) * Math.PI * 2;
  const phaseB = coordHash(quantise(spec.dist), quantise(spec.height), 23) * Math.PI * 2;
  const phaseC = coordHash(quantise(spec.dist), quantise(spec.height), 37) * Math.PI * 2;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = THREE.MathUtils.clamp((y + halfH) / spec.height, 0, 1); // 0 base .. 1 apex
    const theta = Math.atan2(z, x);
    const fade = Math.pow(1 - t, 0.65);
    const lobe =
      0.55 * Math.sin(theta * spec.lobesA + phaseA) +
      0.30 * Math.sin(theta * spec.lobesB + phaseB) +
      0.15 * (coordHash(quantise(x), quantise(y), quantise(z)) - 0.5) * 2;
    const asym = 0.20 * Math.sin(theta * 2 + phaseC) + 0.12 * Math.sin(theta * 3 + phaseA + 1.7);
    const scale = 1 + fade * 0.34 * lobe + (1 - 0.5 * t) * asym;
    pos.setX(i, x * scale);
    pos.setZ(i, z * scale);
    // Vertical crag: ramps in above 6% elevation so the sunken base ring
    // stays on its plane, full strength at the apex for a jagged summit.
    if (t > 0.06) {
      const crag = (coordHash(quantise(y), quantise(z), quantise(x)) - 0.5) * 2;
      pos.setY(i, y + spec.height * 0.05 * crag * Math.min(1, t / 0.06));
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/**
 * Per-vertex elevation/slope colouring: jungle skirt at the waterline, dense
 * forest up the lower flank, bare rock above ~45% of the local peak, with a
 * hash-driven mottle so the rock band never reads as a clean stripe.
 */
function paintMassif(geometry: THREE.BufferGeometry, spec: MassifSpec): void {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const halfH = spec.height / 2;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = THREE.MathUtils.clamp((y + halfH) / spec.height, 0, 1);
    const mottle = coordHash(quantise(x), quantise(y), quantise(z));
    if (t < 0.18) {
      c.copy(COLOR_JUNGLE);
    } else if (t < 0.45) {
      c.copy(COLOR_JUNGLE).lerp(COLOR_FLANK, (t - 0.18) / 0.27);
    } else {
      c.copy(COLOR_FLANK).lerp(COLOR_ROCK, Math.min(1, (t - 0.45) / 0.35));
    }
    const shade = 0.88 + 0.24 * mottle;
    colors[i * 3] = c.r * shade;
    colors[i * 3 + 1] = c.g * shade;
    colors[i * 3 + 2] = c.b * shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Build and attach the mountain ring. Idempotent: a second call on a scene
 * that already has the ring returns the existing mesh untouched. Returns the
 * merged mesh (or null if merge failed) so callers and tests can inspect it.
 */
export function applyMountains(scene: THREE.Scene): THREE.Mesh | null {
  const existing = scene.getObjectByName('farcrysis-mountains');
  if (existing instanceof THREE.Mesh) return existing;

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.96,
    metalness: 0,
  });

  const parts: THREE.BufferGeometry[] = [];
  for (const spec of MASSIFS) {
    // ConeGeometry is indexed with matching attribute sets across all parts,
    // so the merge below stays legal without toNonIndexed conversions.
    const geom = new THREE.ConeGeometry(spec.baseRadius, spec.height, 18, 9);
    ridgeDisplaceCone(geom, spec);
    paintMassif(geom, spec);
    const azimuth = (spec.angleDeg * Math.PI) / 180;
    geom.translate(Math.sin(azimuth) * spec.dist, MOUNTAIN_BASE_Y, Math.cos(azimuth) * spec.dist);
    parts.push(geom);
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) return null;

  const mesh = new THREE.Mesh(merged, material);
  mesh.name = 'farcrysis-mountains';
  mesh.userData.farcrysisArt = true;
  mesh.castShadow = false; // far outside the shadow camera's 170 m range
  mesh.receiveShadow = false;
  mesh.renderOrder = 0;
  scene.add(mesh);
  return mesh;
}

