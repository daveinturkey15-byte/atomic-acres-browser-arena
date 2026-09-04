/**
 * RAID2 forged surfaces — the first material pass.
 *
 * WHAT THIS CLOSES. The arena shipped ten flat `MeshStandardMaterial`s: no
 * albedo map, no normal, no roughness, no AO, on 300-odd axis-aligned boxes.
 * The shipped Raid carries six forged sets over the same kind of geometry, and
 * the difference is the whole of the owner's "missing all the nice detail".
 * Eight sets are authored here, through the forge that already exists
 * (`src/rendering/surface-forge.ts`) — extended in use, never duplicated.
 *
 * THE METHOD, and where each rule comes from.
 *
 * 1. PERIODS ARE INTEGERS, ASSERTED. `createSurfaceNoise` rounds a fractional
 *    period to the nearest integer cell count, so authoring 6.5 does not fail —
 *    it silently bakes a different frequency than the one written down, and the
 *    tile stops matching its own comment. Every period this module uses comes
 *    from `PERIODS`, and `PERIODS` is validated at module load. A lane that has
 *    already lost 25 meshes to a silent NaN does not get to lose eight surfaces
 *    to a silent rounding.
 *
 * 2. AUTHOR IN MILLIMETRES, THEN MEASURE THE PIXELS. Each set records its
 *    `tileMetres`, the resulting mm/texel at 512 px, and the finest authored
 *    feature in both millimetres and texels. A generator that INTENDS a 2 mm
 *    joint and bakes a 20 mm band passes every code review and fails every
 *    frame.
 *
 * 3. THREE SCALES OF WEAR, in every set:
 *      - 0.5-1.5 mm grain: the shared micro tile, baked into normal and AO by
 *        the forge at a fixed 0.25 m physical size;
 *      - 20-80 mm scuffs, chips and pitting: authored per family below;
 *      - 0.5-3 m gradients: a low-period field per family, so a tile is not
 *        uniform at reading distance.
 *    One scale only is the single most reliable "made by code" signal.
 *
 * 4. ALBEDO CARRIES, ROUGHNESS FOLLOWS. Anything the frame must show is a
 *    10-30 % albedo step. Wear that lives only in roughness is invisible under
 *    a bright sky.
 *
 * 5. THE TINT STAYS THE PALETTE. Every description authors MODULATION about
 *    1.0 and the material's `color` carries the family value from
 *    `RAID2_PALETTE`. That is deliberate: fidelity band 22 ("never puts a cover
 *    family darker than the floor it stands on") is written against those
 *    constants, and baking the hue into the albedo would have quietly moved the
 *    readability gate's subject out from under it. Band 22 is instead
 *    STRENGTHENED — it now also measures the mean of each baked raster, so the
 *    number it gates is the one that reaches the screen.
 *
 * DISTINCTIVENESS. `raid2` must not read as the shipped Raid in the menu. The
 * levers spent here are format and spectrum, not grade: travertine at 3.0 m
 * against test2's 2.4 m (a larger, cooler slab), a mosaic pool rather than
 * plain tile, and an acrylic sports surface rather than painted concrete.
 */
import * as THREE from 'three';
import {
  forgeSurface, surfaceStandardMaterial, surfaceTexelBudget,
  type ForgedSurface, type SurfaceDescription, type SurfaceForgeOptions,
} from './rendering/surface-forge';

// ---------------------------------------------------------------------------
// Periods, asserted
// ---------------------------------------------------------------------------

/**
 * Every noise period this module uses, in lattice cells. Integers only: see
 * rule 1 above. Named so a reader can tie a number to the feature it draws.
 */
export const PERIODS = Object.freeze({
  travertineVein: 6,
  travertinePit: 20,
  travertineTraffic: 2,
  stuccoTrowel: 5,
  stuccoGrain: 32,
  stuccoWash: 3,
  limestoneCourse: 4,
  limestoneChip: 24,
  timberGrain: 3,
  timberKnot: 12,
  courtAggregate: 40,
  courtWear: 2,
  mosaicGrout: 8,
  mosaicScum: 3,
  gravelStone: 16,
  gravelTrack: 2,
  plantingLeaf: 20,
  plantingCanopy: 3,
});

for (const [name, period] of Object.entries(PERIODS)) {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error(`raid2-art: noise period ${name}=${period} must be a positive integer; `
      + 'createSurfaceNoise rounds it, so a fractional period bakes a frequency the source does not state.');
  }
}

// ---------------------------------------------------------------------------
// Small helpers (local, so this module has no dependency on another arena's art)
// ---------------------------------------------------------------------------

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

function smooth(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Distance to the nearest cell edge, in cell units, for a periodic grid. */
function cellEdge(x: number, cells: number): number {
  const f = x * cells - Math.floor(x * cells);
  return Math.min(f, 1 - f);
}

/**
 * A joint width authored in MILLIMETRES, converted to the half-width in cell
 * units that `smooth(0, w, cellEdge(...))` wants.
 *
 * This function exists because the first draft of this module got it wrong on
 * three of four surfaces and the contact sheet showed it: the limestone bed
 * joint was written down as 7 mm and authored at 0.87 mm (0.37 of a texel), so
 * the cover family - the one a player reads at range - baked with no course
 * lines in it at all. The timber board gap was 3.1 mm against a recorded 9, and
 * the mosaic grout 2 mm against a recorded 8. Every one of them passed review,
 * because a bare threshold like `0.0029` carries no unit and cannot be checked
 * by eye. Now the millimetre IS the authored value and the cell fraction is
 * derived from it, so the number in the comment and the number in the bake are
 * the same number.
 */
function jointHalfWidth(millimetres: number, tileMetres: number, cells: number): number {
  return (millimetres / 2 / 1000) / (tileMetres / cells);
}

/**
 * The finest authored feature of each set, in millimetres, in ONE place.
 * `RAID2_SURFACES` publishes these and fidelity band 32 measures them against
 * the set's own mm/texel, so an intent and a bake cannot drift apart again.
 */
export const FEATURE_MM = Object.freeze({
  travertineJoint: 20,
  limestoneJoint: 7,
  timberGap: 9,
  mosaicGrout: 8,
});

const TRAVERTINE_JOINT_W = jointHalfWidth(FEATURE_MM.travertineJoint, 3.0, 2);
const LIMESTONE_JOINT_W = jointHalfWidth(FEATURE_MM.limestoneJoint, 1.2, PERIODS.limestoneCourse);
const TIMBER_GAP_W = jointHalfWidth(FEATURE_MM.timberGap, 1.8, PERIODS.timberGrain);
const MOSAIC_GROUT_W = jointHalfWidth(FEATURE_MM.mosaicGrout, 1.0, PERIODS.mosaicGrout);

/** One reusable sample object: the forge copies immediately (documented). */
const scratch = { albedo: [1, 1, 1] as [number, number, number], height: 0.5, roughness: 0.9, ao: 1 };

function emit(r: number, g: number, b: number, height: number, roughness: number, ao: number) {
  scratch.albedo[0] = clamp01(r);
  scratch.albedo[1] = clamp01(g);
  scratch.albedo[2] = clamp01(b);
  scratch.height = clamp01(height);
  scratch.roughness = clamp01(roughness);
  scratch.ao = clamp01(ao);
  return scratch;
}

// ---------------------------------------------------------------------------
// The eight surfaces
// ---------------------------------------------------------------------------

/**
 * Large-format travertine paving. tileMetres 3.0, 512 px = 5.86 mm/texel.
 * Two slabs per tile, so the format is 1.5 m — deliberately LARGER and cooler
 * than the shipped Raid's 0.8 m, because the two arenas must not read alike.
 * Finest authored feature: the 20 mm joint groove = 3.4 texels.
 * Wear: 20 mm joints and 30-90 mm pitting (meso), a 1.5 m traffic gradient
 * (macro), the shared micro tile (grain).
 */
export const travertineSurface: SurfaceDescription = (u, v, noise) => {
  const joint = clamp01(
    (1 - smooth(0, TRAVERTINE_JOINT_W, cellEdge(u, 2)))
    + (1 - smooth(0, TRAVERTINE_JOINT_W, cellEdge(v, 2))),
  );
  // Bedding veins, wandering because the field is sampled through a displaced
  // coordinate rather than straight.
  const vein = noise.warp(u * PERIODS.travertineVein, v * PERIODS.travertineVein, PERIODS.travertineVein, 1.7);
  const pit = smooth(0.7, 1, 1 - noise.worley(u * PERIODS.travertinePit, v * PERIODS.travertinePit, PERIODS.travertinePit));
  // The 0.5-3 m scale: where feet actually go. Two cells over a 3 m tile is a
  // 1.5 m gradient, which is what stops a terrace reading as wallpaper.
  const traffic = noise.fbm(u * PERIODS.travertineTraffic, v * PERIODS.travertineTraffic, PERIODS.travertineTraffic, 2);
  const tone = clamp01(0.92 + (vein - 0.5) * 0.22 - pit * 0.20 - joint * 0.30 - (traffic - 0.5) * 0.12);
  // Cool where the stone is polished by traffic, warmer in the open pores.
  return emit(
    tone * (1 - pit * 0.03), tone, tone * (1 + (0.5 - vein) * 0.05),
    0.78 - pit * 0.5 - joint * 0.78,
    0.44 + pit * 0.42 + joint * 0.36 - traffic * 0.10,
    1 - joint * 0.38 - pit * 0.22,
  );
};

/**
 * Villa render. tileMetres 3.0 = 5.86 mm/texel.
 * Finest authored feature: the 32-cell trowel grain, 94 mm across, 16 texels.
 * Sunlit face and shaded return are separated by HUE, not only by value: the
 * wash runs cooler as it darkens, which is what a rendered wall does under a
 * blue sky and what a pure value ramp never looks like.
 */
export const stuccoSurface: SurfaceDescription = (u, v, noise) => {
  const trowel = noise.warp(u * PERIODS.stuccoTrowel, v * PERIODS.stuccoTrowel, PERIODS.stuccoTrowel, 2.1);
  const grain = 1 - noise.worley(u * PERIODS.stuccoGrain, v * PERIODS.stuccoGrain, PERIODS.stuccoGrain);
  // A plinth wash that only opens toward the bottom of the wall (v is up).
  const wash = smooth(0.3, 0, v) * smooth(0.4, 0.75, noise.fbm(u * PERIODS.stuccoWash, v * PERIODS.stuccoWash, PERIODS.stuccoWash, 3));
  // The wash is deliberately weaker than it first read. `worldTiled` gives a
  // 3.4 m wall about one 3 m tile, so anything strong here prints a plinth band
  // every three metres up the elevation - a tile, not weathering.
  const tone = clamp01(0.94 + (trowel - 0.5) * 0.20 + grain * 0.06 - wash * 0.17);
  return emit(
    tone * (1 - wash * 0.04), tone, tone * (1 + wash * 0.05),
    0.6 + (trowel - 0.5) * 0.34 + grain * 0.22,
    0.80 + grain * 0.14 + wash * 0.06,
    1 - grain * 0.14 - wash * 0.12,
  );
};

/**
 * The COVER family — piers, kerbs, plinths, treads, coping, rails. Cut ashlar
 * at tileMetres 1.2 = 2.34 mm/texel, four courses per tile so a block reads
 * 0.3 m. Finest authored feature: the 7 mm bed joint = 3.0 texels.
 * This family must stay ABOVE the paving in luminance (band 22): the wear here
 * is chipping at the arrises, which LIGHTENS, never a dark crack.
 */
export const limestoneSurface: SurfaceDescription = (u, v, noise) => {
  const course = 1 - smooth(0, LIMESTONE_JOINT_W, cellEdge(v, PERIODS.limestoneCourse));
  const perp = 1 - smooth(0, LIMESTONE_JOINT_W, cellEdge(u + Math.floor(v * PERIODS.limestoneCourse) * 0.37, PERIODS.limestoneCourse / 2));
  const joint = clamp01(course + perp);
  const chip = smooth(0.78, 1, 1 - noise.worley(u * PERIODS.limestoneChip, v * PERIODS.limestoneChip, PERIODS.limestoneChip));
  const bed = noise.fbm(u * 2, v * 2, 2, 3);
  // Chips expose fresh stone, so they read LIGHTER than the face - the
  // opposite of the "draw every crack dark" tell.
  const tone = clamp01(0.95 + (bed - 0.5) * 0.12 + chip * 0.12 - joint * 0.26);
  return emit(tone, tone, tone * 1.01,
    0.72 - joint * 0.6 - chip * 0.25,
    0.52 + chip * 0.3 + joint * 0.24,
    1 - joint * 0.3);
};

/**
 * Decking and furniture. tileMetres 1.8 = 3.52 mm/texel, three boards per tile
 * so a board reads 0.6 m wide. Finest authored feature: the 9 mm board gap =
 * 2.6 texels. Deliberately the darkest family on the map, and no darker.
 */
export const timberSurface: SurfaceDescription = (u, v, noise) => {
  // The board index MUST wrap, or the grain offset makes u=1 sample a
  // different field than u=0 and the tile seams. Fidelity band 30 measured
  // exactly that: a 0.065 albedo step down every board edge of the deck.
  const board = Math.floor(u * PERIODS.timberGrain) % PERIODS.timberGrain;
  const gap = 1 - smooth(0, TIMBER_GAP_W, cellEdge(u, PERIODS.timberGrain));
  // Grain runs ALONG the board: sampled with a long axis and a short one.
  const grain = noise.fbm((u + board * 0.31) * 24, v * 2, 24, 3);
  const knot = smooth(0.86, 1, 1 - noise.worley(u * PERIODS.timberKnot, v * PERIODS.timberKnot, PERIODS.timberKnot));
  const silvering = noise.fbm(u * 2, v * 2, 2, 2);
  const tone = clamp01(0.9 + (grain - 0.5) * 0.24 - knot * 0.26 - gap * 0.4 + (silvering - 0.5) * 0.12);
  return emit(tone, tone * (1 - knot * 0.04), tone * (1 - knot * 0.09 + silvering * 0.04),
    0.66 + (grain - 0.5) * 0.3 - gap * 0.66 - knot * 0.2,
    0.68 + grain * 0.2 + silvering * 0.12,
    1 - gap * 0.35 - knot * 0.12);
};

/**
 * The acrylic sports surface. tileMetres 4.0 = 7.81 mm/texel, because a court
 * is one continuous pour and a small tile would print a grid on it.
 * Finest authored feature: the 40-cell aggregate, 100 mm across, 12.8 texels.
 * The key wears: a 2 m traffic field opens the sheen where players actually
 * stand, which is the reference's most recognisable thing about a hard court.
 */
export const courtSurface: SurfaceDescription = (u, v, noise) => {
  const aggregate = noise.worley(u * PERIODS.courtAggregate, v * PERIODS.courtAggregate, PERIODS.courtAggregate);
  const wear = noise.fbm(u * PERIODS.courtWear, v * PERIODS.courtWear, PERIODS.courtWear, 3);
  const grain = smooth(0.25, 0.9, aggregate);
  const tone = clamp01(0.9 + (grain - 0.5) * 0.14 + (wear - 0.5) * 0.16);
  return emit(tone, tone, tone,
    0.5 + grain * 0.3,
    0.46 + grain * 0.22 + wear * 0.26,
    1 - grain * 0.08);
};

/**
 * Pool mosaic. tileMetres 1.0 = 1.95 mm/texel, eight tesserae per tile so one
 * mosaic tile is 125 mm. Finest authored feature: the 8 mm grout line = 4.1
 * texels.
 * GROUT IS LIGHTER THAN THE TESSERA. Drawing every joint dark is the single
 * most common code tell, and underwater it is also wrong: grout scatters.
 */
export const poolMosaicSurface: SurfaceDescription = (u, v, noise) => {
  const grout = clamp01(
    (1 - smooth(0, MOSAIC_GROUT_W, cellEdge(u, PERIODS.mosaicGrout)))
    + (1 - smooth(0, MOSAIC_GROUT_W, cellEdge(v, PERIODS.mosaicGrout))),
  );
  // Per-tessera tone, so the mosaic is a field of slightly different tiles.
  // Wrapped for the same reason as the timber board index, before it bites.
  const ix = Math.floor(u * PERIODS.mosaicGrout) % PERIODS.mosaicGrout;
  const iy = Math.floor(v * PERIODS.mosaicGrout) % PERIODS.mosaicGrout;
  const tessera = noise.hash(ix, iy);
  // The waterline scum band: a horizontal 0.5-1 m gradient near the top.
  const scum = smooth(0.72, 0.9, v) * smooth(0.3, 0.8, noise.fbm(u * PERIODS.mosaicScum, v * PERIODS.mosaicScum, PERIODS.mosaicScum, 2));
  const tone = clamp01(0.82 + (tessera - 0.5) * 0.20 + grout * 0.22 - scum * 0.18);
  return emit(tone * (1 + grout * 0.04), tone, tone * (1 - grout * 0.05),
    0.72 - grout * 0.5,
    0.22 + grout * 0.4 + scum * 0.22,
    1 - grout * 0.18 - scum * 0.1);
};

/**
 * Drive island aggregate. tileMetres 1.5 = 2.93 mm/texel, 16 stones per tile
 * so a stone reads 94 mm. Finest authored feature: the stone shadow at the
 * Worley ridge, ~12 mm = 4.1 texels.
 * Cool river gravel, separated from the warm travertine by HUE rather than by
 * value, so it never competes with the paving for the eye.
 */
export const gravelSurface: SurfaceDescription = (u, v, noise) => {
  const stone = noise.worley(u * PERIODS.gravelStone, v * PERIODS.gravelStone, PERIODS.gravelStone);
  const face = 1 - smooth(0, 0.55, stone);
  const track = noise.fbm(u * PERIODS.gravelTrack, v * PERIODS.gravelTrack, PERIODS.gravelTrack, 2);
  const tone = clamp01(0.84 + face * 0.22 - smooth(0.55, 0.95, stone) * 0.22 + (track - 0.5) * 0.12);
  return emit(tone * 0.98, tone, tone * 1.03,
    0.4 + face * 0.55,
    0.86 + (1 - face) * 0.1,
    1 - (1 - face) * 0.3);
};

/**
 * Clipped hedge and shrub canopy. tileMetres 1.2 = 2.34 mm/texel, 20 leaf
 * clusters per tile so a cluster reads 60 mm.
 * Read at a grazing angle a hedge is not a green wall: the leaf edges catch
 * the key and the interior falls away, which is what the AO channel is for
 * here. This family is HARD COVER on the drive, so it is a shooting backdrop
 * and must stay legible, not a black hole.
 */
export const plantingSurface: SurfaceDescription = (u, v, noise) => {
  const leaf = 1 - noise.worley(u * PERIODS.plantingLeaf, v * PERIODS.plantingLeaf, PERIODS.plantingLeaf);
  const canopy = noise.fbm(u * PERIODS.plantingCanopy, v * PERIODS.plantingCanopy, PERIODS.plantingCanopy, 3);
  const edge = smooth(0.55, 1, leaf);
  const depth = smooth(0.5, 0, leaf);
  const tone = clamp01(0.86 + edge * 0.20 - depth * 0.26 + (canopy - 0.5) * 0.18);
  return emit(tone * (1 - edge * 0.05), tone, tone * (1 - edge * 0.08),
    0.45 + leaf * 0.5,
    0.94 - edge * 0.1,
    1 - depth * 0.42);
};

// ---------------------------------------------------------------------------
// The set
// ---------------------------------------------------------------------------

export type Raid2SurfaceId =
  | 'raid2-travertine' | 'raid2-stucco' | 'raid2-limestone' | 'raid2-timber'
  | 'raid2-court' | 'raid2-pool-mosaic' | 'raid2-gravel' | 'raid2-planting';

/**
 * One row per set: the description, its forge options, and the authored
 * feature sizes that rule 2 requires be written down and measured.
 */
export const RAID2_SURFACES: ReadonlyArray<Readonly<{
  id: Raid2SurfaceId;
  description: SurfaceDescription;
  options: SurfaceForgeOptions;
  /** The finest feature this description draws, as authored. */
  finestFeatureMm: number;
}>> = Object.freeze([
  Object.freeze({ id: 'raid2-travertine' as const, description: travertineSurface, finestFeatureMm: FEATURE_MM.travertineJoint,
    options: { size: 512, seed: 0x2a11, tileMetres: 3.0, reliefMetres: 0.009, anisotropy: 8 } }),
  Object.freeze({ id: 'raid2-stucco' as const, description: stuccoSurface, finestFeatureMm: 94,
    options: { size: 512, seed: 0x2a22, tileMetres: 3.0, reliefMetres: 0.005 } }),
  Object.freeze({ id: 'raid2-limestone' as const, description: limestoneSurface, finestFeatureMm: FEATURE_MM.limestoneJoint,
    options: { size: 512, seed: 0x2a33, tileMetres: 1.2, reliefMetres: 0.006 } }),
  Object.freeze({ id: 'raid2-timber' as const, description: timberSurface, finestFeatureMm: FEATURE_MM.timberGap,
    options: { size: 512, seed: 0x2a44, tileMetres: 1.8, reliefMetres: 0.007 } }),
  Object.freeze({ id: 'raid2-court' as const, description: courtSurface, finestFeatureMm: 100,
    // 256, not 512. A court is one continuous pour at 4 m per tile, so 512 px
    // buys 7.8 mm/texel for a surface whose finest authored feature is 100 mm
    // aggregate - it was paying a quarter of a second of boot for detail no
    // frame can resolve. At 256 the aggregate still lands at 6.4 texels.
    options: { size: 256, seed: 0x2a55, tileMetres: 4.0, reliefMetres: 0.003 } }),
  Object.freeze({ id: 'raid2-pool-mosaic' as const, description: poolMosaicSurface, finestFeatureMm: FEATURE_MM.mosaicGrout,
    options: { size: 512, seed: 0x2a66, tileMetres: 1.0, reliefMetres: 0.004 } }),
  Object.freeze({ id: 'raid2-gravel' as const, description: gravelSurface, finestFeatureMm: 12,
    options: { size: 512, seed: 0x2a77, tileMetres: 1.5, reliefMetres: 0.012 } }),
  Object.freeze({ id: 'raid2-planting' as const, description: plantingSurface, finestFeatureMm: 60,
    // 256 for the same reason: a 60 mm leaf cluster reads at 12.8 texels there,
    // and hedge is never the surface a player inspects at 5 m.
    options: { size: 256, seed: 0x2a88, tileMetres: 1.2, reliefMetres: 0.03 } }),
]);

/** Measured texel budget per set, so rule 2 is checkable rather than asserted in prose. */
export function raid2TexelBudget(): Array<{ id: Raid2SurfaceId; mmPerTexel: number; finestFeatureTexels: number }> {
  return RAID2_SURFACES.map(({ id, options, finestFeatureMm }) => {
    const budget = surfaceTexelBudget(options);
    return {
      id,
      mmPerTexel: budget.millimetresPerTexel,
      finestFeatureTexels: finestFeatureMm / budget.millimetresPerTexel,
    };
  });
}

/** Forge (or fetch from the forge's own cache) all eight sets. */
export function raid2ForgedSurfaces(): Record<Raid2SurfaceId, ForgedSurface> {
  const out = {} as Record<Raid2SurfaceId, ForgedSurface>;
  for (const { id, description, options } of RAID2_SURFACES) out[id] = forgeSurface(id, description, options);
  return out;
}

export type Raid2ForgedOptions = Readonly<{
  color: number;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  /** World metres one tile spans on the mesh. Drives `worldTiled`. */
  metresPerTile: number;
}>;

/**
 * A material over a forged set, with the family value from `RAID2_PALETTE` as
 * the tint (rule 5) and `metresPerTile` recorded so `worldTiled` can give a
 * 100 m paving slab and a 1.2 m kerb the same physical texel density.
 */
export function raid2ForgedMaterial(
  forged: ForgedSurface,
  name: string,
  options: Raid2ForgedOptions,
): THREE.MeshStandardMaterial {
  const material = surfaceStandardMaterial(forged, {
    color: options.color,
    roughness: options.roughness ?? 0.9,
    metalness: options.metalness ?? 0,
    normalScale: options.normalScale ?? 1,
  });
  material.name = name;
  material.userData.metresPerTile = options.metresPerTile;
  return material;
}
