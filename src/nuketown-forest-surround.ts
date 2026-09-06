/**
 * nuketown-forest-surround.ts — DECLUTTER 2026-08-29: the owner called the
 * corner earth-bank ellipsoids out by sight ("strange oval and round
 * splat/piles at the edges") and asked for "the immediate surrounds more like
 * a woods/forest with decent threejs skills". This module plants that forest
 * in the annulus between the boundary fence and the mountain foothills using
 * the ingested vegetation-skill recipes:
 *
 *   - golden-angle ring distribution with seeded jitter (clump-free, natural);
 *   - multi-component instanced trees: conifers (merged trunk+two cone tiers,
 *     ONE InstancedMesh) and broadleafs (trunk mesh + double-blob canopy mesh);
 *   - an understory scatter of flat-shaded scrub blobs between the trunks;
 *   - per-instance scale/yaw variation and tonal instance colours.
 *
 * ART-ONLY BY CONSTRUCTION: every candidate must fall OUTSIDE the boundary
 * rectangle inflated by a margin and INSIDE the foothill inner radius, so no
 * sightline or traversal inside the arena can meet it; no colliders, no shot
 * surfaces, fog stays on. Deterministic: fixed-seed mulberry32 streams.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { ARENA_BOUNDS } from './arena-layout';
import { nuketownLawnPlacementAllowed } from './nuketown-lawn-field';
import { nuketownBackdropGroundNormal, nuketownBackdropGroundY } from './nuketown-mountain-backdrop';
import {
  LEAF_ALPHA_TEST,
  LEAF_ATLAS_CELLS,
  nuketown2LeafAtlas,
} from './nuketown2-vegetation';

/** Trees never spawn closer to the arena than this rectangle inflation. */
export const FOREST_RECT_MARGIN_M = 3.2;
/** ... and never beyond the foothill footline. */
export const FOREST_MAX_RADIAL_M = 62;

const SEED = 0x7d31_44b9;

/**
 * HF-426 Job 3 - the ring is FITTED to a footprint, like the mountain envelope
 * beside it. Everything the band needs is here rather than read off module
 * constants, because the Nuke Town Rebuild is 36 x 84 m: the shipped inner
 * radius of 36.5 m falls INSIDE that map along z, so every candidate on the
 * long axis would be rejected by the rectangle test and the whole forest would
 * pile onto the two short flanks.
 *
 * `groundY` / `groundNormal` are injected for the same reason. The shipped map
 * plants against the mountain backdrop's rolling skirt; the rebuild authors its
 * own flat 270 m ground slab and takes no skirt, so it plants against that.
 */
export type NuketownForestEnvelope = Readonly<{
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  /** Rectangle inflation - nothing is planted inside the arena plus this. */
  rectMarginM: number;
  /** Inner edge of the ring band. */
  ringInnerM: number;
  /** Outer edge - must stay inside the mountain envelope's foothill feet. */
  maxRadialM: number;
  seed: number;
  groundY: (x: number, z: number) => number;
  groundNormal: (x: number, z: number, target: THREE.Vector3) => THREE.Vector3;
}>;

/** The shipped map's band: exactly the radii it has always been planted on. */
export const NUKETOWN_FOREST_ENVELOPE: NuketownForestEnvelope = Object.freeze({
  bounds: ARENA_BOUNDS,
  rectMarginM: FOREST_RECT_MARGIN_M,
  ringInnerM: 36.5,
  maxRadialM: FOREST_MAX_RADIAL_M,
  seed: SEED,
  groundY: nuketownBackdropGroundY,
  groundNormal: nuketownBackdropGroundNormal,
});

/** The top face of the rebuild's own ground slab: it plants on flat ground. */
export const NUKETOWN2_FOREST_GROUND_Y = 0;

/**
 * The rebuild's band: 44.5 m in (the map corner is 45.7, so the inner edge is
 * just clear of it on every bearing) to 70 m out, which leaves the same 2 m gap
 * to its foothill feet at 72 m that the shipped map has at 62 / 64.
 */
export const NUKETOWN2_FOREST_ENVELOPE: NuketownForestEnvelope = Object.freeze({
  bounds: Object.freeze({ minX: -18, maxX: 18, minZ: -42, maxZ: 42 }),
  rectMarginM: FOREST_RECT_MARGIN_M,
  ringInnerM: 44.5,
  maxRadialM: 70,
  // A different stream, so the two maps do not carry the same tree in the same
  // world position.
  seed: SEED ^ 0x0002_6426,
  groundY: () => NUKETOWN2_FOREST_GROUND_Y,
  groundNormal: (_x: number, _z: number, target: THREE.Vector3) => target.set(0, 1, 0),
});
/** World-space height of the conifer prototype, trunk base to leader tip. */
export const FOREST_CONIFER_HEIGHT_M = 10.3;

/** HF-536: Conifer prefab constants */
export const FOREST_CONIFER_TIER_COUNT = 5;
export const FOREST_CONIFER_TIER_HEIGHT_FRACTION = 0.22;
export const FOREST_CONIFER_TIER_OVERLAP_FRACTION = 0.30;
export const FOREST_CONIFER_TIER_HEIGHT_M = Number((FOREST_CONIFER_HEIGHT_M * FOREST_CONIFER_TIER_HEIGHT_FRACTION).toFixed(4));
export const FOREST_CONIFER_TIER_OVERLAP_M = Number((FOREST_CONIFER_TIER_HEIGHT_M * FOREST_CONIFER_TIER_OVERLAP_FRACTION).toFixed(4));
export const FOREST_CONIFER_TIER_PITCH_M = Number((FOREST_CONIFER_TIER_HEIGHT_M * (1 - FOREST_CONIFER_TIER_OVERLAP_FRACTION)).toFixed(4));
export const FOREST_CONIFER_TRUNK_VISIBLE_HEIGHT_M = 1.2;
export const FOREST_CONIFER_TRUNK_DIAMETER_BASE_M = 0.35;
export const FOREST_CONIFER_MAX_TRIANGLES = 220;

/** HF-536: Broadleaf prefab constants */
export const FOREST_BROADLEAF_CANOPY_LOBES = 5;
export const FOREST_BROADLEAF_MAX_TRIANGLES = 320;

/**
 * HF-536: Deterministic per-instance yaw and scale jitter from a hash of the
 * instance index. Scale jitter is strictly within [0.85, 1.15].
 */
export function coniferInstanceJitter(index: number): { yawJitter: number; scaleJitter: number } {
  let h = (index ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  const yawJitter = (h / 0xffff_ffff) * Math.PI * 2;

  let h2 = (h ^ 0x5a5a5a5a) >>> 0;
  h2 = Math.imul(h2 ^ (h2 >>> 15), 0x45d9f3b) >>> 0;
  h2 = (h2 ^ (h2 >>> 16)) >>> 0;
  const scaleJitter = 0.85 + (h2 / 0xffff_ffff) * 0.30;
  return { yawJitter, scaleJitter };
}
/** Every Nth conifer is a standout grown above the treeline. Deterministic. */
export const FOREST_STANDOUT_EVERY = 13;
/** Height multiplier for standouts. */
export const FOREST_STANDOUT_BOOST = 1.28;
/**
 * HF-536 forge-nature PASS 1 (R22): extra deterministic height spread on top
 * of the tone band, applied as `scaleY *= 0.89 + FOREST_HEIGHT_JITTER * h`.
 * With the tone band (0.9..1.35) and the 1-in-13 standout this spans roughly
 * 8.2 - 14.6 m of world height; the lane test pins the stddev floor.
 */
export const FOREST_HEIGHT_JITTER = 0.22;
/**
 * Fixed aesthetic sun side for the warm/cool tone bias: the reference holds
 * warm sun on one flank of the treeline and cool shadow on the other.
 * Presentation-only tint bias, not a light rig claim.
 * Derived from the arena key bearing (-0.853, +0.522) at src/rendering/arenas/nuketown2.ts:167, normalised and mirrored to the treeline's lit flank.
 */
export const FOREST_SUN_AZIMUTH = Object.freeze({ x: -0.79, z: -0.61 });

/**
 * The four authored conifer albedos. Index 2 (0x27412b) is the one the floor
 * below exists for: it is the tone the cool-flank bias takes closest to black.
 * Measured 2026-09-06 at e9ba9cd8, it does NOT render black today - the
 * darkest conifer pixel in the reviewed frames is max-channel 10 - but it gets
 * there on the post chain's toe, with no albedo headroom of its own.
 */
export const FOREST_CONIFER_TONES: readonly number[] = Object.freeze([
  0x2e4a30, 0x39573a, 0x27412b, 0x435f41,
]);

/**
 * The baked underside ramp on each conifer tier (mergeParts `shade.underside`).
 * The rendered albedo of a tier's lowest ring is the instance colour times
 * this, so any floor on the instance colour has to be read through it.
 */
export const FOREST_CONIFER_UNDERSIDE_SHADE = 0.80;

/**
 * HF-536 night-defects-3b — MEASURED conifer lightness floor.
 *
 * THE TRAP THIS CLOSES. `THREE.Color.setHex()` decodes sRGB into the LINEAR
 * working colour space, and `offsetHSL()` therefore operates on the LINEAR
 * triple. The cool-flank line `offsetHSL(.., 0, 0.03 * sunSide)` reads like a
 * three-percent nudge; it is not. Measured on three r185 with the shipped
 * tones: 0x27412b has a linear HSL lightness of 0.03657, so at sunSide = -1
 * the offset removes 82 % of it and leaves L = 0.00657. Its unlit albedo
 * falls from [26,44,26] to [12,25,13], and through the 0.80 underside ramp to
 * [10,21,11] — before any lighting multiplier at all. That is the whole
 * mechanism behind "exact-black conifers": not a NaN, not a missing texture,
 * an offset applied in the wrong space to a colour that had no room for it.
 *
 * WHAT THE NUMBER IS. A floor in the same linear HSL space, applied AFTER the
 * flank offset, pinned from the rendered-frame measurement in
 * `artifacts/qa/conifer-darkness-*` (scripts/qa/probe-nuketown2-conifer-darkness.mjs
 * isolates the conifer pixels exactly by hiding the instanced mesh and diffing,
 * so this is the darkest ACTUAL conifer pixel, not a region guess). It is a
 * ratchet, not a look change: the value is at or below what the shipped build
 * already renders, so today's frames are unchanged and any future edit to the
 * tones or the flank offsets that would push a tree darker gets clamped
 * instead of shipping another black treeline.
 *
 * Moving it DOWN is a regression and the test says so.
 */
export const FOREST_CONIFER_MIN_LINEAR_LIGHTNESS = 0.0065;

const CONIFER_HSL_SCRATCH = { h: 0, s: 0, l: 0 };

/**
 * The conifer instance colour: authored tone, warm/cool flank bias, then the
 * measured lightness floor. Exported so the floor is testable as a pure
 * function of (tone, sunSide) instead of only observable through a 340-slot
 * InstancedMesh build.
 *
 * @param tone    the slot's tone stream in [0,1)
 * @param sunSide -1 (fully cool flank) .. +1 (fully lit flank)
 * @param minLightness the floor to apply; defaults to the shipped constant.
 *   Overridable ONLY so the test can (a) reproduce the unfloored maths with 0
 *   and measure the trap, and (b) drive the clamp with a floor above the
 *   darkest authored tone and prove it fires. Production never passes it.
 */
export function coniferInstanceColour(
  tone: number,
  sunSide: number,
  target: THREE.Color,
  minLightness: number = FOREST_CONIFER_MIN_LINEAR_LIGHTNESS,
): THREE.Color {
  target.setHex(FOREST_CONIFER_TONES[
    Math.floor(tone * FOREST_CONIFER_TONES.length) % FOREST_CONIFER_TONES.length
  ]);
  // DAY-VISUAL-B: warm sun on the lit flank, cool shadow on the far flank.
  if (sunSide > 0) target.offsetHSL(0.012 * sunSide, 0.06 * sunSide, 0.028 * sunSide);
  else target.offsetHSL(0.008 * sunSide, 0, 0.03 * sunSide);
  target.getHSL(CONIFER_HSL_SCRATCH);
  if (CONIFER_HSL_SCRATCH.l < minLightness) {
    target.setHSL(CONIFER_HSL_SCRATCH.h, CONIFER_HSL_SCRATCH.s, minLightness);
  }
  return target;
}

export interface NuketownForestStats {
  conifers: number;
  broadleafs: number;
  understory: number;
  contactSkirts: number;
  meshes: number;
  triangles: number;
}

export interface NuketownForestSurround {
  group: THREE.Group;
  stats: Readonly<NuketownForestStats>;
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

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * v4 2026-08-31 — "the forest stands on a plate". Every one of the 769
 * instances used to be planted at a single constant `FOREST_FLOOR_Y = -0.42`
 * with no ground query at all, so 769 trees met a dead-flat skirt along a
 * razor edge. The skirt now carries a height field
 * (nuketownBackdropGroundY) and this module plants against it, exactly the
 * groundY/groundNormal contract environment-kit.ts::scatterVegetation
 * defines - plus the kit's other half of the same idea, a contact skirt of
 * ground litter under each woody instance, so the trunk meets a fillet
 * instead of a seam.
 *
 * Kept as the fallback for the pathological case only.
 */
const FOREST_FLOOR_FALLBACK_Y = -0.42;

/** Sink each trunk this far into the ground so no base edge floats. */
const TRUNK_SINK_M = 0.12;

/**
 * The kit's contact skirt: a low LOBED disc of litter, deliberately not a
 * clean circle (a clean circle reads as a decal ring). Ported rather than
 * imported because environment-kit keeps `skirtPiece` private.
 */
function contactSkirt(radius: number, segments: number, seed: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const rim: Array<readonly [number, number]> = [];
  const rng = mulberry32(seed);
  for (let index = 0; index < segments; index += 1) {
    const theta = (index / segments) * Math.PI * 2;
    const wobble = 0.7 + rng() * 0.52;
    rim.push([Math.cos(theta) * radius * wobble, Math.sin(theta) * radius * wobble]);
  }
  for (let index = 0; index < segments; index += 1) {
    const a = rim[index];
    const b = rim[(index + 1) % segments];
    positions.push(0, 0, 0, b[0], 0, b[1], a[0], 0, a[1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.translate(0, 0.012, 0);
  return geometry;
}

function insideForestBand(x: number, z: number, envelope: NuketownForestEnvelope): boolean {
  const inflatedMinX = envelope.bounds.minX - envelope.rectMarginM;
  const inflatedMaxX = envelope.bounds.maxX + envelope.rectMarginM;
  const inflatedMinZ = envelope.bounds.minZ - envelope.rectMarginM;
  const inflatedMaxZ = envelope.bounds.maxZ + envelope.rectMarginM;
  const insideRect = x > inflatedMinX && x < inflatedMaxX && z > inflatedMinZ && z < inflatedMaxZ;
  if (insideRect) return false;
  return Math.hypot(x, z) < envelope.maxRadialM;
}

type TreeSlot = { x: number; z: number; yaw: number; scale: number; tone: number };

function ringSlots(
  envelope: NuketownForestEnvelope,
  count: number,
  innerRadius: number,
  outerRadius: number,
  seed: number,
  minSeparation: number,
): TreeSlot[] {
  const rng = mulberry32(seed);
  const slots: TreeSlot[] = [];
  let attempts = 0;
  const maxAttempts = count * 40;
  let index = 0;
  while (slots.length < count && attempts < maxAttempts) {
    attempts += 1;
    index += 1;
    const t = (index % count + 0.5) / count;
    const radius = innerRadius + (outerRadius - innerRadius) * (t * 0.6 + rng() * 0.4);
    const theta = index * GOLDEN_ANGLE + rng() * 0.5;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    if (!insideForestBand(x, z, envelope)) continue;
    let tooClose = false;
    for (const other of slots) {
      if (Math.hypot(x - other.x, z - other.z) < minSeparation) { tooClose = true; break; }
    }
    if (tooClose) continue;
    slots.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.72 + rng() * 0.6, tone: rng() });
  }
  return slots;
}

/** Merge helper (vegetation skill): non-indexed accumulate with transforms. */
/**
 * HF-536 forge-nature PASS 1: a part may carry a vertical VALUE ramp that is
 * baked into the merged geometry's `color` attribute.
 *
 * `underside` is the multiplier at the part's own local minimum y, `top` at
 * its local maximum. Both are <= 1 on purpose: this rides on top of the
 * per-instance colour and the white material base, and the gotcha
 * "material.color tint cannot lighten" is the whole family's arithmetic - a
 * multiply capped at white can only ever REMOVE light. So a tier separates
 * from the tier below it by DARKENING its own underside, never by lightening
 * its top. Parts with no ramp contribute 1.0 and are unchanged.
 */
type MergePart = {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  shade?: { underside: number; top: number };
  color?: readonly [number, number, number];
};

function mergeParts(parts: MergePart[], name: string): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  let shaded = false;
  let hasUvs = false;
  for (const part of parts) {
    const clone = part.geometry.clone();
    clone.applyMatrix4(part.matrix);
    const nonIndexed = clone.index ? clone.toNonIndexed() : clone;
    const attribute = nonIndexed.getAttribute('position');
    const uvAttr = nonIndexed.getAttribute('uv');
    if (uvAttr) hasUvs = true;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < attribute.count; i += 1) {
      const y = attribute.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const span = Math.max(1e-4, maxY - minY);
    for (let i = 0; i < attribute.count; i += 1) {
      positions.push(attribute.getX(i), attribute.getY(i), attribute.getZ(i));
      if (uvAttr) {
        uvs.push(uvAttr.getX(i), uvAttr.getY(i));
      } else {
        uvs.push(-1, -1);
      }
      if (part.color) {
        shaded = true;
        colors.push(part.color[0], part.color[1], part.color[2]);
      } else if (part.shade) {
        shaded = true;
        const t = (attribute.getY(i) - minY) / span;
        const value = part.shade.underside + (part.shade.top - part.shade.underside) * t;
        colors.push(value, value, value);
      } else {
        colors.push(1, 1, 1);
      }
    }
    clone.dispose();
    if (nonIndexed !== clone) nonIndexed.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (shaded) merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (hasUvs) merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.computeVertexNormals();
  merged.name = name;
  return merged;
}

function buildSkirtCardRing(radius: number, y: number, count = 4, tierIndex = 0): THREE.BufferGeometry {
  const quads: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  const cardWidth = (2 * Math.PI * radius / Math.max(1, count)) * 0.92;
  const cardHeight = Math.min(0.65, 0.35 + radius * 0.12);
  for (let i = 0; i < count; i += 1) {
    const quad = new THREE.PlaneGeometry(cardWidth, cardHeight, 1, 1);
    quad.translate(0, -cardHeight / 2, 0);
    const col = (i + tierIndex * 3) % LEAF_ATLAS_CELLS;
    const row = (tierIndex + (i % 2)) % LEAF_ATLAS_CELLS;
    const uvAttr = quad.getAttribute('uv') as THREE.BufferAttribute;
    for (let k = 0; k < uvAttr.count; k += 1) {
      uvAttr.setXY(
        k,
        (col + uvAttr.getX(k)) / LEAF_ATLAS_CELLS,
        (row + uvAttr.getY(k)) / LEAF_ATLAS_CELLS,
      );
    }
    uvAttr.needsUpdate = true;
    const angle = (i / count) * Math.PI * 2 + tierIndex * 0.45;
    const tilt = 0.35;
    const x = Math.cos(angle) * (radius * 0.96);
    const z = Math.sin(angle) * (radius * 0.96);
    const m = new THREE.Matrix4()
      .makeTranslation(x, y, z)
      .multiply(new THREE.Matrix4().makeRotationY(-angle - Math.PI / 2))
      .multiply(new THREE.Matrix4().makeRotationX(tilt));
    quads.push({ geometry: quad, matrix: m });
  }
  const merged = mergeParts(quads, 'conifer-skirt-ring');
  for (const q of quads) q.geometry.dispose();
  return merged;
}

export function buildConiferPrototype(seed: number = SEED ^ 0x0000_7e11): THREE.BufferGeometry {
  const parts: MergePart[] = [];
  // 1. Dark 8-gon trunk (0.35 m dia at base, visible 1.2 m below tier 0)
  const trunkGeometry = new THREE.CylinderGeometry(0.13, FOREST_CONIFER_TRUNK_DIAMETER_BASE_M / 2, 1.4, 8, 1, true);
  parts.push({
    geometry: trunkGeometry,
    matrix: new THREE.Matrix4().makeTranslation(0, 0.7, 0),
    shade: { underside: 0.22, top: 0.28 },
  });

  const R0 = 2.5;
  const tierHeight = FOREST_CONIFER_TIER_HEIGHT_M;
  const pitch = FOREST_CONIFER_TIER_PITCH_M;
  const y0 = FOREST_CONIFER_TRUNK_VISIBLE_HEIGHT_M;

  // Segment counts per tier: tier 0 uses 8 segments (rim radius >= 2.0 for jitterRim);
  // tiers 1..3 use 6 segments, tier 4 (apex) uses 6 segments cone.
  // Cards per tier: tier 0: 4, tier 1: 4, tier 2: 3, tier 3: 2, tier 4: 0.
  const tierSegments = [8, 6, 6, 6, 6];
  const tierCardCounts = [4, 4, 3, 2, 0];

  const createdGeometries: THREE.BufferGeometry[] = [trunkGeometry];
  for (let i = 0; i < FOREST_CONIFER_TIER_COUNT; i += 1) {
    const rFrac = 1.0 - (i / (FOREST_CONIFER_TIER_COUNT - 1)) * (1.0 - 0.25);
    const rBottom = R0 * rFrac;
    const tierBottomY = y0 + i * pitch;
    const segments = tierSegments[i];
    if (i < FOREST_CONIFER_TIER_COUNT - 1) {
      const rTop = rBottom * 0.38;
      const frustum = new THREE.CylinderGeometry(rTop, rBottom, tierHeight, segments, 1, true);
      createdGeometries.push(frustum);
      parts.push({
        geometry: frustum,
        matrix: new THREE.Matrix4().makeTranslation(0, tierBottomY + tierHeight / 2, 0),
        shade: { underside: FOREST_CONIFER_UNDERSIDE_SHADE, top: 1 },
      });
    } else {
      const apexHeight = FOREST_CONIFER_HEIGHT_M - tierBottomY;
      const cone = new THREE.ConeGeometry(rBottom, apexHeight, segments, 1, true);
      createdGeometries.push(cone);
      parts.push({
        geometry: cone,
        matrix: new THREE.Matrix4().makeTranslation(0, tierBottomY + apexHeight / 2, 0),
        shade: { underside: FOREST_CONIFER_UNDERSIDE_SHADE, top: 1 },
      });
    }

    if (tierCardCounts[i] > 0) {
      const skirtRing = buildSkirtCardRing(rBottom, tierBottomY, tierCardCounts[i], i);
      createdGeometries.push(skirtRing);
      parts.push({
        geometry: skirtRing,
        matrix: new THREE.Matrix4(),
        shade: { underside: FOREST_CONIFER_UNDERSIDE_SHADE, top: 0.95 },
      });
    }
  }

  const merged = mergeParts(parts, 'forest-conifer');
  jitterRim(merged, (seed ^ 0x0000_7e11) >>> 0, 2.0);
  for (const g of createdGeometries) g.dispose();
  return merged;
}

export function buildBroadleafTrunkPrototype(): THREE.BufferGeometry {
  const parts: MergePart[] = [];
  const trunk = new THREE.CylinderGeometry(0.24, 0.38, 3.4, 8, 1, true);
  parts.push({
    geometry: trunk,
    matrix: new THREE.Matrix4().makeTranslation(0, 1.7, 0),
  });
  for (let i = 0; i < 3; i += 1) {
    const angle = i * (Math.PI * 2 / 3) + 0.3;
    const limb = new THREE.CylinderGeometry(0.08, 0.16, 1.8, 8, 1, true);
    const m = new THREE.Matrix4()
      .makeRotationY(angle)
      .multiply(new THREE.Matrix4().makeTranslation(0.45, 2.9, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 4.5));
    parts.push({ geometry: limb, matrix: m });
  }
  const merged = mergeParts(parts, 'forest-broadleaf-trunk');
  for (const p of parts) p.geometry.dispose();
  return merged;
}

export function buildBroadleafCanopyPrototype(): THREE.BufferGeometry {
  const parts: MergePart[] = [];
  // 4 overlapping ellipsoid lobes (low-poly icosphere detail 0: 20 tris each = 80 tris)
  const lobeDefs = [
    { radius: 1.8, detail: 0, sx: 1.15, sy: 0.85, sz: 1.15, x: 0, y: 0.2, z: 0 },
    { radius: 1.45, detail: 0, sx: 1.05, sy: 0.8, sz: 1.0, x: 1.1, y: -0.2, z: 0.4 },
    { radius: 1.4, detail: 0, sx: 0.95, sy: 0.8, sz: 1.1, x: -1.0, y: -0.1, z: 0.5 },
    { radius: 1.35, detail: 0, sx: 1.0, sy: 0.85, sz: 0.95, x: -0.2, y: 0.7, z: -0.3 },
  ];
  for (let l = 0; l < lobeDefs.length; l += 1) {
    const d = lobeDefs[l];
    const lobeGeom = new THREE.IcosahedronGeometry(d.radius, d.detail);
    lobeGeom.scale(d.sx, d.sy, d.sz);
    parts.push({
      geometry: lobeGeom,
      matrix: new THREE.Matrix4().makeTranslation(d.x, d.y, d.z),
      shade: { underside: FOREST_CONIFER_UNDERSIDE_SHADE, top: 1.0 },
    });

    // 8 leaf-edge cards per lobe using the SAME atlas sampler (8 * 4 * 2 = 64 tris)
    const cardsPerLobe = 8;
    const rx = d.radius * d.sx;
    const ry = d.radius * d.sy;
    const rz = d.radius * d.sz;
    const cardWidth = 0.55;
    const cardHeight = 0.55;
    for (let k = 0; k < cardsPerLobe; k += 1) {
      const quad = new THREE.PlaneGeometry(cardWidth, cardHeight, 1, 1);
      const col = (k + l * 2) % LEAF_ATLAS_CELLS;
      const row = (l + (k % 3)) % LEAF_ATLAS_CELLS;
      const uvAttr = quad.getAttribute('uv') as THREE.BufferAttribute;
      for (let v = 0; v < uvAttr.count; v += 1) {
        uvAttr.setXY(
          v,
          (col + uvAttr.getX(v)) / LEAF_ATLAS_CELLS,
          (row + uvAttr.getY(v)) / LEAF_ATLAS_CELLS,
        );
      }
      uvAttr.needsUpdate = true;
      const theta = (k / cardsPerLobe) * Math.PI * 2 + l * 0.75;
      const cardX = d.x + Math.cos(theta) * (rx * 1.03);
      const cardY = d.y + Math.sin(k * 1.3) * (ry * 0.28);
      const cardZ = d.z + Math.sin(theta) * (rz * 1.03);
      const m = new THREE.Matrix4()
        .makeTranslation(cardX, cardY, cardZ)
        .multiply(new THREE.Matrix4().makeRotationY(-theta - Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationX(0.2));
      parts.push({
        geometry: quad,
        matrix: m,
        shade: { underside: FOREST_CONIFER_UNDERSIDE_SHADE, top: 1.0 },
      });
    }
  }

  const merged = mergeParts(parts, 'forest-broadleaf-canopy');
  for (const p of parts) p.geometry.dispose();
  return merged;
}

export function createForestFoliageMaterial(name: string, roughness = 0.94): THREE.Material {
  const atlas = nuketown2LeafAtlas();
  const mat = new MeshStandardNodeMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  mat.name = name;
  mat.alphaTest = LEAF_ALPHA_TEST;

  const uvNode = TSL.uv();
  const isCard = uvNode.y.greaterThanEqual(TSL.float(0.0));
  const cardSample = TSL.texture(atlas, uvNode.clamp(TSL.vec2(0, 0), TSL.vec2(1, 1)));
  mat.opacityNode = TSL.select(isCard, cardSample.a, TSL.float(1.0));
  return mat;
}

/**
 * HF-536 forge-nature PASS 1 (R20 "every silhouette breaks at three scales").
 *
 * Displace the rim vertices of a merged, non-indexed cone stack so the tier
 * edges are ragged instead of a clean 8- or 12-gon. Deterministic: the hash is
 * keyed on the QUANTISED position, so the several duplicated vertices that
 * share a rim corner in a non-indexed mesh all receive the SAME offset and the
 * surface stays closed (a per-vertex-index hash would tear it open).
 *
 * Only vertices outside `minRadius` move: the trunk (r <= 0.34) and the cone
 * apexes stay put, so the spire tip still reaches FOREST_CONIFER_HEIGHT_M.
 * Pure geometry - no material, no uniform, no graph (R2).
 */
export const FOREST_RIM_RADIAL_JITTER = 0.18;
export const FOREST_RIM_VERTICAL_JITTER_M = 0.25;

function jitterRim(geometry: THREE.BufferGeometry, seed: number, minRadius: number): void {
  const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
  const hash = (a: number, b: number, c: number): number => {
    let h = (seed ^ (a * 0x27d4_eb2d) ^ (b * 0x1656_67b1) ^ (c * 0x85eb_ca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b_3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0x297a_2d39) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
  };
  for (let i = 0; i < attribute.count; i += 1) {
    const x = attribute.getX(i);
    const y = attribute.getY(i);
    const z = attribute.getZ(i);
    const radius = Math.hypot(x, z);
    if (radius <= minRadius) continue;
    // 1 mm quantisation: identical rim corners hash identically.
    const qx = Math.round(x * 1000);
    const qy = Math.round(y * 1000);
    const qz = Math.round(z * 1000);
    const radial = 1 + FOREST_RIM_RADIAL_JITTER * (hash(qx, qy, qz) - 0.5) * 2;
    const vertical = FOREST_RIM_VERTICAL_JITTER_M * (hash(qx + 7, qy + 7, qz + 7) - 0.5);
    attribute.setXYZ(i, x * radial, y + vertical, z * radial);
  }
  attribute.needsUpdate = true;
  geometry.computeVertexNormals();
}

function triCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.index;
  if (index) return index.count / 3;
  const position = geometry.getAttribute('position');
  return position ? position.count / 3 : 0;
}

export function buildNuketownForestSurround(
  parent: THREE.Object3D,
  envelope: NuketownForestEnvelope = NUKETOWN_FOREST_ENVELOPE,
): NuketownForestSurround {
  // Tier radii as OFFSETS from the band's inner edge, so the shipped map's
  // authored 38 / 62, 37 / 56 and 36.5 / 58 fall out of ringInner = 36.5 and
  // maxRadial = 62 unchanged, and any other footprint gets the same three
  // interleaved tiers, fitted.
  const coniferBand = [envelope.ringInnerM + 1.5, envelope.maxRadialM] as const;
  const broadleafBand = [envelope.ringInnerM + 0.5, envelope.maxRadialM - 6] as const;
  const understoryBand = [envelope.ringInnerM, envelope.maxRadialM - 4] as const;
  const group = new THREE.Group();
  group.name = 'nuketown-forest-surround';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;
  group.userData.nuketownForest = true;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const color = new THREE.Color();
  const disposables: Array<{ dispose(): void }> = [];
  const stats: NuketownForestStats = { conifers: 0, broadleafs: 0, understory: 0, contactSkirts: 0, meshes: 0, triangles: 0 };
  // The forest is added to pass31-neighbourhood-life, which legacy-main
  // re-batches in 'palette-lit' mode. InstancedMeshes are skipped by that
  // batcher, but the group flag is set anyway so the contact skirts (plain
  // instanced too) and anything added later cannot be silently collapsed.
  group.userData.dynamic = true;

  // Query the beyond-fence ground the backdrop skirt actually renders. The
  // fallback only fires if the height field ever returns a non-finite value,
  // which would be a bug in the field, not a placement case.
  const groundY = (x: number, z: number): number => {
    const y = envelope.groundY(x, z);
    return Number.isFinite(y) ? y : FOREST_FLOOR_FALLBACK_Y;
  };
  const scratchNormal = new THREE.Vector3();
  const groundNormal = (x: number, z: number): THREE.Vector3 => envelope.groundNormal(x, z, scratchNormal);

  const register = (mesh: THREE.InstancedMesh): void => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); // instance bounds, not geometry origin
    mesh.castShadow = false; // distant scenery: shadow maps buy nothing
    mesh.receiveShadow = false;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    group.add(mesh);
    stats.meshes += 1;
    stats.triangles += triCount(mesh.geometry) * mesh.count;
  };

  // ---- conifers: merged 8-gon trunk + 5 cone frustum tiers + skirt cards ---
  // HF-536: 5 stacked cone frustums, radii 1.0 -> 0.25, 22 % tier height, 30 %
  // overlap, each tier broken by alpha-tested ragged skirt cards, dark 8-gon trunk
  // visible >= 1.2 m below tier 0. Exactly one atlas sampler on the material.
  const coniferGeometry = buildConiferPrototype(envelope.seed);
  const coniferMaterial = createForestFoliageMaterial('forest-conifers-material', 0.94);
  disposables.push(coniferGeometry, coniferMaterial);

  const coniferSlots = ringSlots(envelope, 340, coniferBand[0], coniferBand[1], envelope.seed, 3.4);
  const conifers = new THREE.InstancedMesh(coniferGeometry, coniferMaterial, coniferSlots.length);
  conifers.name = 'forest-conifers';
  coniferSlots.forEach((slot, index) => {
    // HF-536: deterministic yaw and 0.85-1.15 scale jitter from index hash
    const { yawJitter, scaleJitter } = coniferInstanceJitter(index);
    euler.set(0, slot.yaw + yawJitter, 0);
    quaternion.setFromEuler(euler);
    position.set(slot.x, groundY(slot.x, slot.z) - TRUNK_SINK_M, slot.z);
    // DAY-VISUAL-B: every FOREST_STANDOUT_EVERY-th tree grows above the line,
    // so the treeline has varied heights with a few standouts, deterministically.
    const standout = index % FOREST_STANDOUT_EVERY === 0 ? FOREST_STANDOUT_BOOST : 1;
    // HF-536 forge-nature PASS 1 (R22 "heights vary"): an extra deterministic
    // height jitter on top of the tone-driven band, so the treeline's apex
    // line is a saw rather than four repeated steps. `slot.yaw` is the slot's
    // own placement stream, already decorrelated from `slot.tone`.
    const heightHash = (Math.sin(slot.yaw * 91.7 + index * 0.618) * 0.5 + 0.5);
    const heightJitter = 0.89 + FOREST_HEIGHT_JITTER * heightHash;
    scaleVec.set(
      slot.scale * scaleJitter,
      slot.scale * scaleJitter * (0.9 + slot.tone * 0.45) * standout * heightJitter,
      slot.scale * scaleJitter,
    );
    matrix.compose(position, quaternion, scaleVec);
    conifers.setMatrixAt(index, matrix);
    // DAY-VISUAL-B warm/cool flank bias, then the HF-536 measured lightness
    // floor. Both now live in coniferInstanceColour() so the floor is a
    // testable pure function rather than a line buried in a 340-slot loop.
    const radius = Math.hypot(slot.x, slot.z) || 1;
    const sunSide = -((slot.x * FOREST_SUN_AZIMUTH.x + slot.z * FOREST_SUN_AZIMUTH.z) / radius);
    coniferInstanceColour(slot.tone, sunSide, color);
    conifers.setColorAt(index, color);
  });
  register(conifers);
  stats.conifers = coniferSlots.length;

  // ---- broadleafs: trunk + 3 primary limbs, 5-lobe canopy + card shell -----
  // HF-536: 8-gon tapered trunk + 3 primary limbs (64 tris) and 5 overlapping
  // ellipsoid lobes with an alpha-tested leaf card shell (240 tris), budget <= 320.
  const broadTrunkGeometry = buildBroadleafTrunkPrototype();
  const canopyGeometry = buildBroadleafCanopyPrototype();
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5138, roughness: 0.96, metalness: 0 });
  const canopyMaterial = createForestFoliageMaterial('forest-broadleaf-canopies-material', 0.92);
  disposables.push(broadTrunkGeometry, canopyGeometry, trunkMaterial, canopyMaterial);

  const broadleafSlots = ringSlots(envelope, 180, broadleafBand[0], broadleafBand[1], envelope.seed ^ 0x00ff_1234, 4.2);
  const broadTrunks = new THREE.InstancedMesh(broadTrunkGeometry, trunkMaterial, broadleafSlots.length);
  const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, broadleafSlots.length);
  broadTrunks.name = 'forest-broadleaf-trunks';
  canopies.name = 'forest-broadleaf-canopies';
  const canopyTones = [0x4d6b3a, 0x5d7a42, 0x6b8549, 0x455f35];
  broadleafSlots.forEach((slot, index) => {
    euler.set(0, slot.yaw, 0);
    quaternion.setFromEuler(euler);
    const floor = groundY(slot.x, slot.z);
    position.set(slot.x, floor - TRUNK_SINK_M, slot.z);
    scaleVec.set(slot.scale, slot.scale, slot.scale);
    matrix.compose(position, quaternion, scaleVec);
    broadTrunks.setMatrixAt(index, matrix);
    position.set(slot.x, floor + 4.3 * slot.scale, slot.z);
    matrix.compose(position, quaternion, scaleVec);
    canopies.setMatrixAt(index, matrix);
    // DAY-VISUAL-B: same warm/cool flank bias as the conifers.
    const canopyRadius = Math.hypot(slot.x, slot.z) || 1;
    const canopySun = -((slot.x * FOREST_SUN_AZIMUTH.x + slot.z * FOREST_SUN_AZIMUTH.z) / canopyRadius);
    color.setHex(canopyTones[Math.floor(slot.tone * canopyTones.length) % canopyTones.length]);
    if (canopySun > 0) color.offsetHSL(0.012 * canopySun, 0.06 * canopySun, 0.028 * canopySun);
    else color.offsetHSL(0.008 * canopySun, 0, 0.03 * canopySun);
    canopies.setColorAt(index, color);
  });
  register(broadTrunks);
  register(canopies);
  stats.broadleafs = broadleafSlots.length;

  // ---- understory scrub between the trunks --------------------------------
  const scrubGeometry = new THREE.IcosahedronGeometry(0.9, 0);
  const scrubMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, metalness: 0, flatShading: true });
  disposables.push(scrubGeometry, scrubMaterial);
  const scrubSlots = ringSlots(envelope, 260, understoryBand[0], understoryBand[1], envelope.seed ^ 0x5a5a_9c9c, 1.9);
  const scrub = new THREE.InstancedMesh(scrubGeometry, scrubMaterial, scrubSlots.length);
  scrub.name = 'forest-understory';
  const scrubTones = [0x55663d, 0x64744a, 0x707c52, 0x4a5c38];
  scrubSlots.forEach((slot, index) => {
    // Understory scrub is ground cover: unlike a trunk it DOES lean with the
    // slope (environment-kit's `tiltToSlope`), which is what stops a rolling
    // forest floor from sprouting a field of perfectly vertical blobs.
    const normal = groundNormal(slot.x, slot.z);
    euler.set(Math.atan2(-normal.z, normal.y) + slot.yaw * 0.12, slot.yaw, Math.atan2(normal.x, normal.y));
    quaternion.setFromEuler(euler);
    position.set(slot.x, groundY(slot.x, slot.z) + 0.28 * slot.scale, slot.z);
    scaleVec.set(slot.scale, slot.scale * 0.68, slot.scale);
    matrix.compose(position, quaternion, scaleVec);
    scrub.setMatrixAt(index, matrix);
    scrub.setColorAt(index, color.setHex(scrubTones[Math.floor(slot.tone * scrubTones.length) % scrubTones.length]));
  });
  register(scrub);
  stats.understory = scrubSlots.length;

  // ---- contact skirts: one litter fillet per woody trunk -----------------
  // The kit emits these under every near-tier woody plant for exactly the
  // reason the owner's frames show: a trunk that meets the ground on a hard
  // silhouette edge reads as a sticker, and 769 of them read as a plate.
  const skirtGeometry = contactSkirt(1.15, 9, envelope.seed ^ 0x00c0_ffee);
  // HF-434 (review, PASS 92): the skirt is a FLAT DISC lying 0.015 m over the
  // ground it is planted on - and on the Nuke Town Rebuild that ground is a
  // dead-flat slab, so 769 litter fillets sit 15 mm over a coplanar surface.
  // The depth quantum at this build's 0.02 m near plane and 180 m far plane is
  // ~2.98e-6 * z^2 m, i.e. 15 mm is spent by ~71 m - inside the forest ring
  // (max radial 62 m) seen from the far side of an 84 m map. Tier -3 puts the
  // litter over the ground (0), the border path decal (-1) and the lawn (-2)
  // deterministically, on both backends. This material is created per call and
  // used by `forest-contact-skirts` ALONE (disposed with the group), so no
  // tier-0 body shares it. Integer units, matching the arena tier scheme.
  const skirtMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.99, metalness: 0, flatShading: true });
  skirtMaterial.name = "nuketown-forest-contact-skirt";
  skirtMaterial.polygonOffset = true;
  skirtMaterial.polygonOffsetFactor = -3;
  skirtMaterial.polygonOffsetUnits = -3;
  disposables.push(skirtGeometry, skirtMaterial);
  const skirtSlots = [...coniferSlots, ...broadleafSlots];
  const skirts = new THREE.InstancedMesh(skirtGeometry, skirtMaterial, skirtSlots.length);
  skirts.name = 'forest-contact-skirts';
  const litterTones = [0x4a4433, 0x554d39, 0x413c2e, 0x5f5741];
  skirtSlots.forEach((slot, index) => {
    // A litter pile is RIGID: it lies on the ground, so it takes the ground's
    // normal and never the plant's tilt or vertical stretch (kit rule).
    const normal = groundNormal(slot.x, slot.z);
    euler.set(Math.atan2(-normal.z, normal.y), slot.yaw * 1.7, Math.atan2(normal.x, normal.y));
    quaternion.setFromEuler(euler);
    position.set(slot.x, groundY(slot.x, slot.z) + 0.015, slot.z);
    const spread = 0.72 + slot.scale * 0.42;
    scaleVec.set(spread, 1, spread);
    matrix.compose(position, quaternion, scaleVec);
    skirts.setMatrixAt(index, matrix);
    skirts.setColorAt(index, color.setHex(litterTones[Math.floor(slot.tone * litterTones.length) % litterTones.length]));
  });
  skirts.receiveShadow = false;
  register(skirts);
  stats.contactSkirts = skirtSlots.length;

  stats.triangles = Math.round(stats.triangles);
  parent.add(group);
  return {
    group,
    stats,
    dispose: () => {
      for (const disposable of disposables) disposable.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Inside the fence: the trees the owner can actually walk up to
// ---------------------------------------------------------------------------

/**
 * The eight authored yard-tree positions. These are NOT decoration placed by
 * eye: `src/map.ts` registers `authored-tree-trunk-collider-{index}` at each
 * one as a [0.68*scale, 4*scale, 0.68*scale] box centred at y = 2*scale, and
 * `nuketown-lawn-field.ts` keeps the lawn out of the same footprints. The list
 * is mirrored (not derived) because map.ts owns it as a literal; the
 * yard-vegetation test pins the two together.
 */
export const NUKETOWN_YARD_TREE_POSITIONS: ReadonlyArray<readonly [number, number, number]> = Object.freeze([
  [-9, -28.5, 1], [9, 28.5, 1], [-33.5, -26, 0.9], [33.5, 26, 0.9],
  [-13, 27.5, 0.85], [13, -27.5, 0.85], [-34.5, 10, 0.9], [34.5, -10, 0.9],
]);

/** Trunk collider half-extent per unit scale — nothing below head height may exceed it. */
const YARD_TRUNK_COLLIDER_HALF_M = 0.34;
/** Collider height per unit scale. */
const YARD_TRUNK_COLLIDER_HEIGHT_M = 4;
/**
 * Nothing added inside the fence may reach this high. The quality-composition
 * parity gate treats colliders shorter than 0.5 m as ground dressing the
 * ground read explains, and a player crouches to roughly 1.1 m eye height:
 * art below this cannot hide anyone, cannot read as cover, and cannot hide a
 * collider. Gameplay readability beats prettiness.
 */
export const NUKETOWN_INFENCE_PLANTING_MAX_HEIGHT_M = 0.45;

export interface NuketownYardVegetationStats {
  trees: number;
  understoryClumps: number;
  meshes: number;
  triangles: number;
  maxPlantingHeightM: number;
}

export interface NuketownYardVegetation {
  group: THREE.Group;
  stats: Readonly<NuketownYardVegetationStats>;
  dispose(): void;
}

/** A crown blob: an icosahedron squashed and offset — environment-kit's `lobePiece`. */
function crownLobe(radius: number, detail: number, x: number, y: number, z: number, squash: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  geometry.scale(1, squash, 1);
  geometry.translate(x, y, z);
  return geometry;
}

/**
 * Replaces the eight Quality sphere-trees.
 *
 * Owner 2026-08-31: "trees ... still feel poor on nuketown". What shipped on
 * his route was NOT the rich `addTree` in environment-assets.ts — that never
 * runs on the 'blender' profile, which is what `resolveRenderProfile('')`
 * returns. It was eight identical Blender props, one cylinder trunk plus four
 * identical UV spheres in a single flat MAT_foliage_military material, merged
 * into ONE draw and differing only by three scale values. Those nodes are now
 * deleted from `scripts/blender/create-atomic-acres-blender-arena.py` and the
 * arena is re-baked; this is what stands in their place, planted at the same
 * eight authored positions from `pass31-neighbourhood-life`, which is a
 * SIBLING of the arena root and therefore renders on EVERY render profile.
 *
 * Built as instanced parts in the forest-surround's white-base/setColorAt
 * tonal pattern: a shared white material carries the geometry and every
 * instance gets its own crown tone. That is the only way to get per-tree
 * colour out of a shared draw — `material.color` multiplies, so a tint on a
 * dark foliage material can only ever darken it further.
 *
 * COMBAT SAFETY: every part below head height sits strictly inside the
 * authored trunk collider, so none of it is phantom geometry you can shoot or
 * walk through; branches and canopy start well above a standing player.
 */
export function buildNuketownYardVegetation(parent: THREE.Object3D): NuketownYardVegetation {
  const group = new THREE.Group();
  group.name = 'nuketown-yard-vegetation';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;
  // pass31 is re-batched in 'palette-lit' mode by legacy-main, which deletes
  // the `color` attribute and flattens every material to one palette colour.
  // Instanced meshes are already skipped by that batcher; the flag makes the
  // intent explicit and covers anything non-instanced added here later.
  group.userData.dynamic = true;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const color = new THREE.Color();
  const disposables: Array<{ dispose(): void }> = [];
  const stats: NuketownYardVegetationStats = {
    trees: 0, understoryClumps: 0, meshes: 0, triangles: 0, maxPlantingHeightM: 0,
  };

  const register = (mesh: THREE.InstancedMesh, castShadow: boolean): void => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = castShadow;
    mesh.receiveShadow = false;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    group.add(mesh);
    stats.meshes += 1;
    stats.triangles += triCount(mesh.geometry) * mesh.count;
  };

  const slots = NUKETOWN_YARD_TREE_POSITIONS.map(([x, z, scale], index) => {
    const rng = mulberry32((SEED ^ ((index + 31) * 2654435761)) >>> 0);
    return { x, z, scale, yaw: rng() * Math.PI * 2, tone: rng(), lean: (rng() - 0.5) * 0.05 };
  });

  const bark = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, metalness: 0, flatShading: true });
  const foliage = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, flatShading: true });
  const litter = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.99, metalness: 0, flatShading: true });
  disposables.push(bark, foliage, litter);

  // ---- bole + root flares: ONE merged part, strictly inside the collider ---
  const boleHeight = YARD_TRUNK_COLLIDER_HEIGHT_M - 0.12;
  const boleParts: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [
    { geometry: new THREE.CylinderGeometry(0.155, 0.3, boleHeight, 9, 3), matrix: new THREE.Matrix4().makeTranslation(0, boleHeight / 2, 0) },
  ];
  for (let flare = 0; flare < 5; flare += 1) {
    const angle = (flare / 5) * Math.PI * 2;
    boleParts.push({
      geometry: new THREE.CylinderGeometry(0.035, 0.1, 0.86, 5),
      matrix: new THREE.Matrix4()
        .makeRotationY(angle)
        .multiply(new THREE.Matrix4().makeTranslation(0.2, 0.2, 0))
        .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2.55)),
    });
  }
  const bolePrototype = mergeParts(boleParts, 'yard-tree-bole-prototype');
  for (const part of boleParts) part.geometry.dispose();
  const barkTones = [0x6a533a, 0x5d4a35, 0x74604a, 0x53412f];

  // The boles are baked into ONE world-space mesh instead of an InstancedMesh,
  // and that is a deliberate, load-bearing choice rather than a missed
  // optimisation. src/quality-composition-parity.test.ts explains a collider by
  // looking for VISIBLE TRIANGLES standing inside its volume, and it reads
  // `geometry.position` through `mesh.matrixWorld` - it is InstancedMesh-blind,
  // because an InstancedMesh keeps its per-instance transforms in
  // `instanceMatrix`, not in the geometry. Instanced boles put all eight trees
  // at the origin as far as that gate can see, and the gate correctly failed
  // with all eight `authored-tree-trunk-collider-*` boxes reported as invisible
  // geometry a Quality player would walk into. Baking to world space costs ONE
  // draw for all eight boles (fewer than instancing, which needed one per part)
  // and gives the gate real triangles at real positions. Per-tree bark tone
  // rides in the vertex colours, which survive because this group is marked
  // `dynamic` and is therefore never re-batched.
  const bolePositions: number[] = [];
  const boleColors: number[] = [];
  const boleAttribute = bolePrototype.getAttribute('position');
  const boleMatrix = new THREE.Matrix4();
  const boleVertex = new THREE.Vector3();
  const boleTone = new THREE.Color();
  const boleScale = new THREE.Vector3();
  NUKETOWN_YARD_TREE_POSITIONS.forEach(([treeX, treeZ, treeScale], treeIndex) => {
    boleTone.setHex(barkTones[treeIndex % barkTones.length]);
    boleMatrix.makeTranslation(treeX, 0, treeZ).scale(boleScale.setScalar(treeScale));
    for (let vertex = 0; vertex < boleAttribute.count; vertex += 1) {
      boleVertex.fromBufferAttribute(boleAttribute, vertex).applyMatrix4(boleMatrix);
      bolePositions.push(boleVertex.x, boleVertex.y, boleVertex.z);
      boleColors.push(boleTone.r, boleTone.g, boleTone.b);
    }
  });
  bolePrototype.dispose();
  const boleGeometry = new THREE.BufferGeometry();
  boleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bolePositions, 3));
  boleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(boleColors, 3));
  boleGeometry.computeVertexNormals();
  boleGeometry.computeBoundingBox();
  boleGeometry.computeBoundingSphere();
  boleGeometry.name = 'yard-tree-boles';
  disposables.push(boleGeometry);
  const vertexBark = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, flatShading: true });
  disposables.push(vertexBark);
  const trunks = new THREE.Mesh(boleGeometry, vertexBark);
  trunks.name = 'yard-tree-boles';
  trunks.castShadow = true;
  trunks.receiveShadow = false;
  trunks.userData.presentationOnly = true;
  trunks.userData.blocksShots = false;
  group.add(trunks);
  stats.meshes += 1;
  stats.triangles += triCount(boleGeometry);

  // ---- branches: five tapered limbs, all ABOVE a standing player ----------
  const branchParts: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  for (const [rotation, length, height, tilt] of [
    [-0.7, 2.15, 3.25, 2.85], [0.55, 1.95, 3.45, 2.95], [1.72, 1.7, 3.62, 3.05],
    [2.66, 1.6, 3.78, 3.1], [-2.4, 1.45, 3.92, 3.2],
  ] as ReadonlyArray<readonly [number, number, number, number]>) {
    branchParts.push({
      geometry: new THREE.CylinderGeometry(0.05, 0.11, length, 6),
      matrix: new THREE.Matrix4()
        .makeRotationY(rotation)
        .multiply(new THREE.Matrix4().makeTranslation(0.5, height, 0))
        .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / tilt)),
    });
  }
  const branchGeometry = mergeParts(branchParts, 'yard-tree-branches');
  for (const part of branchParts) part.geometry.dispose();
  disposables.push(branchGeometry);
  const branches = new THREE.InstancedMesh(branchGeometry, bark, slots.length);
  branches.name = 'yard-tree-branches';

  // ---- canopy: two tiers so the crown has depth, each per-instance toned --
  const identity = new THREE.Matrix4();
  const lowerCanopy = mergeParts([
    { geometry: crownLobe(1.62, 1, 0, 4.5, 0, 0.8), matrix: identity },
    { geometry: crownLobe(1.18, 1, -1.32, 4.2, 0.44, 0.82), matrix: identity },
    { geometry: crownLobe(1.24, 1, 1.26, 4.28, -0.5, 0.8), matrix: identity },
    { geometry: crownLobe(0.96, 0, -0.42, 4.06, -1.22, 0.84), matrix: identity },
    { geometry: crownLobe(0.92, 0, 0.5, 4.12, 1.18, 0.84), matrix: identity },
  ], 'yard-tree-canopy-lower');
  const upperCanopy = mergeParts([
    { geometry: crownLobe(1.22, 1, 0.08, 5.72, 0, 0.78), matrix: identity },
    { geometry: crownLobe(0.86, 0, -0.86, 5.42, -0.5, 0.8), matrix: identity },
    { geometry: crownLobe(0.82, 0, 0.8, 5.5, 0.56, 0.8), matrix: identity },
    { geometry: crownLobe(0.66, 0, 0.05, 6.32, 0.06, 0.82), matrix: identity },
  ], 'yard-tree-canopy-upper');
  disposables.push(lowerCanopy, upperCanopy);
  const canopyLower = new THREE.InstancedMesh(lowerCanopy, foliage, slots.length);
  const canopyUpper = new THREE.InstancedMesh(upperCanopy, foliage, slots.length);
  canopyLower.name = 'yard-tree-canopy-lower';
  canopyUpper.name = 'yard-tree-canopy-upper';
  // Four leaf tones, and the upper tier runs a stop lighter than the lower so
  // the crown catches the sun instead of reading as one solid mass.
  const leafTones = [0x46703c, 0x527f42, 0x3c6437, 0x5d8a49];
  const leafHighlight = [0x5c8a4b, 0x6a9954, 0x4f7c44, 0x74a35c];

  // ---- contact litter under each bole ------------------------------------
  const litterGeometry = contactSkirt(1.05, 10, SEED ^ 0x0ba5_e011);
  disposables.push(litterGeometry);
  const litterRing = new THREE.InstancedMesh(litterGeometry, litter, slots.length);
  litterRing.name = 'yard-tree-litter';
  const litterTones = [0x4f4633, 0x59503b, 0x463f2f, 0x625843];

  slots.forEach((slot, index) => {
    euler.set(slot.lean, slot.yaw, slot.lean * 0.6);
    quaternion.setFromEuler(euler);
    position.set(slot.x, 0, slot.z);
    scaleVec.setScalar(slot.scale);
    matrix.compose(position, quaternion, scaleVec);
    branches.setMatrixAt(index, matrix);
    canopyLower.setMatrixAt(index, matrix);
    canopyUpper.setMatrixAt(index, matrix);
    // The bark material is a WHITE base (that is the whole point of the
    // white-base/setColorAt pattern), so an instanced part that never gets an
    // instance colour renders pure white. The branches did exactly that on the
    // first capture - five white sticks per tree - which is why they are toned
    // here from the same table the boles use.
    branches.setColorAt(index, color.setHex(barkTones[(index + 2) % barkTones.length]));
    canopyLower.setColorAt(index, color.setHex(leafTones[index % leafTones.length]));
    canopyUpper.setColorAt(index, color.setHex(leafHighlight[index % leafHighlight.length]));

    // Litter lies flat on the lawn: no lean, no vertical stretch (kit rule —
    // a rigid ground part never inherits the plant's tilt or stretch).
    euler.set(0, slot.yaw * 1.9, 0);
    quaternion.setFromEuler(euler);
    position.set(slot.x, 0.014, slot.z);
    scaleVec.set(slot.scale, 1, slot.scale);
    matrix.compose(position, quaternion, scaleVec);
    litterRing.setMatrixAt(index, matrix);
    litterRing.setColorAt(index, color.setHex(litterTones[index % litterTones.length]));
  });
  register(branches, true);
  register(canopyLower, true);
  register(canopyUpper, false);
  register(litterRing, false);
  stats.trees = slots.length;

  // ---- understory: low planted beds at the tree bases ---------------------
  // Owner problem 3: "you cannot walk up to a tree". The forest ring's nearest
  // instance is 37.5 m away behind a 3.1 m wall, so the only vegetation in
  // reach was grass. These are the beds around the trees you CAN reach. Every
  // clump is capped at NUKETOWN_INFENCE_PLANTING_MAX_HEIGHT_M, which is below
  // the 0.5 m the parity gate calls substantial and far below a crouched
  // player's eye: unmistakably ground dressing, never cover, never a place a
  // collider can hide.
  const clumpPrototypeHeightM = 0.2 + 0.34 * 0.62;
  const clumpGeometry = mergeParts([
    { geometry: crownLobe(0.34, 0, 0, 0.2, 0, 0.62), matrix: identity },
    { geometry: crownLobe(0.25, 0, -0.26, 0.15, 0.12, 0.6), matrix: identity },
    { geometry: crownLobe(0.23, 0, 0.24, 0.16, -0.14, 0.6), matrix: identity },
  ], 'yard-understory-clump');
  disposables.push(clumpGeometry);
  const clumpSlots: Array<{ x: number; z: number; yaw: number; scale: number; tone: number }> = [];
  const clumpRng = mulberry32(SEED ^ 0x2f1e_9a44);
  for (const [treeX, treeZ, treeScale] of NUKETOWN_YARD_TREE_POSITIONS) {
    for (let index = 0; index < 7; index += 1) {
      const theta = index * GOLDEN_ANGLE + clumpRng() * 0.9;
      const radius = 0.95 + clumpRng() * 1.35;
      const x = treeX + Math.cos(theta) * radius * treeScale;
      const z = treeZ + Math.sin(theta) * radius * treeScale;
      const scale = 0.62 + clumpRng() * 0.38;
      const yaw = clumpRng() * Math.PI * 2;
      const tone = clumpRng();
      // Never inside the trunk collider footprint, never outside the arena...
      if (Math.abs(x - treeX) < YARD_TRUNK_COLLIDER_HALF_M * treeScale + 0.1
        && Math.abs(z - treeZ) < YARD_TRUNK_COLLIDER_HALF_M * treeScale + 0.1) continue;
      if (x < ARENA_BOUNDS.minX + 0.6 || x > ARENA_BOUNDS.maxX - 0.6) continue;
      if (z < ARENA_BOUNDS.minZ + 0.6 || z > ARENA_BOUNDS.maxZ - 0.6) continue;
      // ...and never off the lawn. Two of the eight authored trees sit at
      // |z| = 10, barely clear of the pavement edge at |z| = 8.8, so a clump
      // 2.3 m out lands on the kerb or in the carriageway. This is the same
      // placement authority the lawn field itself uses - the v4 lawn bands,
      // minus every structure footprint and every authored prop keep-out -
      // so a clump can never sit on asphalt, on a pavement, or inside a
      // collider, and the containment test keeps that table honest.
      if (!nuketownLawnPlacementAllowed(x, z)) continue;
      clumpSlots.push({ x, z, yaw, scale, tone });
    }
  }
  const clumps = new THREE.InstancedMesh(clumpGeometry, foliage, clumpSlots.length);
  clumps.name = 'yard-understory-clumps';
  const clumpTones = [0x4d7440, 0x5a8348, 0x436a3a, 0x668f4f];
  clumpSlots.forEach((slot, index) => {
    euler.set(0, slot.yaw, 0);
    quaternion.setFromEuler(euler);
    position.set(slot.x, 0, slot.z);
    scaleVec.setScalar(slot.scale);
    matrix.compose(position, quaternion, scaleVec);
    clumps.setMatrixAt(index, matrix);
    clumps.setColorAt(index, color.setHex(clumpTones[Math.floor(slot.tone * clumpTones.length) % clumpTones.length]));
    stats.maxPlantingHeightM = Math.max(stats.maxPlantingHeightM, clumpPrototypeHeightM * slot.scale);
  });
  register(clumps, false);
  stats.understoryClumps = clumpSlots.length;

  stats.triangles = Math.round(stats.triangles);
  stats.maxPlantingHeightM = Number(stats.maxPlantingHeightM.toFixed(3));
  parent.add(group);
  return {
    group,
    stats,
    dispose: () => {
      for (const disposable of disposables) disposable.dispose();
    },
  };
}
