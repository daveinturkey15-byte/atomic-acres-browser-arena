/**
 * nuketown2-materials — the arena's material library, looked up by ROLE.
 *
 * WHY THIS EXISTS. The owner's report on the rebuilt Nuke Town was that it
 * "looks like basic geometry". The arena was not short of procedural
 * materials; it was short of the two properties that separate a surface from a
 * swatch, and both of them are numbers rather than shader cleverness:
 *
 *   1. wear at THREE scales — 0.5-1.5 mm grain, 20-80 mm scuffs, 0.5-3 m
 *      traffic and weather gradients — because a photograph shows all three at
 *      once and one scale is a CG tell; and
 *   2. wear the ALBEDO carries. Ten of the arena's roles were flat
 *      `MeshStandardMaterial(colour, roughness, metalness)` with no map at
 *      all, and the ones that were procedural moved albedo by 3-6%, which is
 *      below what the eye resolves on a large flat surface. Every family here
 *      clears a 10% peak-to-peak albedo step, asserted mechanically in
 *      `spec.ts`, and the per-family gates fail the build if a spec is edited
 *      back down.
 *
 * WHAT THIS IS NOT. It is not a lighting change: nothing here adds a light, a
 * probe or a post stage, and the readability ceiling in `spec.ts` caps how
 * dark any surface is allowed to get so no enemy gains a place to disappear
 * into. It is not an authority change either: no collider, ballistic class,
 * spawn or footprint is touched. Materials only.
 *
 * WHAT THE ARENA SEES. One call, `createNuketown2MaterialRegistry()`, which
 * returns one material instance per role. The arena looks roles up by name;
 * it does not know which family answers a role, so re-authoring a family is a
 * change to this directory and nothing else.
 *
 * Method observed in `StarKnightt/morning-diner` (Claude Fable, 2026), shared
 * by the owner via x.com/prasenx/status/2095537643182563778; re-implemented
 * from first principles.
 */
import type { MeshStandardNodeMaterial } from 'three/webgpu';

import { createSidingMaterial } from './families/siding';
import { createRoofMaterial } from './families/roof';
import { createAsphaltMaterial, createMarkingMaterial } from './families/asphalt';
import { createConcreteMaterial } from './families/concrete';
import { createTimberMaterial } from './families/timber';
import { createGlassMaterial } from './families/glass';
import { createPaintedMetalMaterial } from './families/painted-metal';
import { createLawnMaterial } from './families/lawn';

export type { Nuketown2MaterialSpec, Nuketown2MaterialFamily, WearScale } from './spec';
export {
  MAX_ALBEDO_DARKENING,
  MIN_ALBEDO_WEAR_STEP,
  WEAR_BANDS,
  albedoWearStep,
  assertSpec,
  maxDarkening,
} from './spec';
export { buildWear, linearRgb, linearSwatch } from './wear';
export { createSidingMaterial, sidingSpec } from './families/siding';
export { createRoofMaterial, roofSpec } from './families/roof';
export { asphaltSpec, createAsphaltMaterial, createMarkingMaterial, markingSpec } from './families/asphalt';
export { concreteSpec, createConcreteMaterial } from './families/concrete';
export { createTimberMaterial, timberSpec } from './families/timber';
export { createGlassMaterial, glassSpec } from './families/glass';
export { createPaintedMetalMaterial, paintedMetalSpec } from './families/painted-metal';
export { createLawnMaterial, lawnSpec } from './families/lawn';

/**
 * The roles the arena asks for.
 *
 * These names are the arena's vocabulary, not the library's: `garageDoor` is a
 * role that painted metal happens to answer today. Base colours and the
 * coplanar `polygonOffset` tiers are carried over VERBATIM from the shipped
 * arena, because both are decisions other gates already own — HF-434 pinned
 * the offsets and the fidelity gate reads the siding base colours.
 */
export interface Nuketown2MaterialRegistry {
  /** The scrubland plain beyond the fence line. */
  readonly ground: MeshStandardNodeMaterial;
  /** Mown turf, with the desire lines worn through it. Decal tier -2. */
  readonly lawn: MeshStandardNodeMaterial;
  /** Carriageway. Decal tier -1. */
  readonly asphalt: MeshStandardNodeMaterial;
  /** Kerb: separate pour, chipped nose, tide mark up the face. */
  readonly kerb: MeshStandardNodeMaterial;
  /** Porch and garage-floor slabs — a SOLID user, so no offset. */
  readonly drive: MeshStandardNodeMaterial;
  /** Driveway apron laid over the ground slab. Decal tier -1. */
  readonly driveDecal: MeshStandardNodeMaterial;
  /** Worn thermoplastic lane markings. Decal tier -2. */
  readonly trimDecal: MeshStandardNodeMaterial;
  /** Blockwork: garden walls, plinths, kerbstone blocks. */
  readonly block: MeshStandardNodeMaterial;
  /** North house lap siding. */
  readonly sidingA: MeshStandardNodeMaterial;
  /** South house lap siding. */
  readonly sidingB: MeshStandardNodeMaterial;
  /** Sectional garage door leaf. */
  readonly garageDoor: MeshStandardNodeMaterial;
  /** Painted timber trim: sills, heads, lintels, door cases. SOLID user. */
  readonly trim: MeshStandardNodeMaterial;
  /** Asphalt shingle roof. */
  readonly roof: MeshStandardNodeMaterial;
  /** Timber fence pickets and deck boards. */
  readonly fence: MeshStandardNodeMaterial;
  /** Painted panel signage. */
  readonly sign: MeshStandardNodeMaterial;
  /** HF-477: the white house's pale blue-grey roof glazing. */
  readonly roofGlazing: MeshStandardNodeMaterial;
  /** HF-477: cooker tops on the ORANGE house's front lawn. */
  readonly applianceRed: MeshStandardNodeMaterial;
  /** HF-477: cooker tops on the WHITE house's front lawn. */
  readonly applianceBlue: MeshStandardNodeMaterial;
  /** Hedges, planters and garden mass. */
  readonly planter: MeshStandardNodeMaterial;
  /** Coach body trim band. Decal tier -1. */
  readonly busTrim: MeshStandardNodeMaterial;
  /** Coach glazing band — a DIELECTRIC, which is what it was not. Decal tier -1. */
  readonly coachGlass: MeshStandardNodeMaterial;
}

/** Every role name, for the gates that sweep the registry rather than naming rows. */
export const NUKETOWN2_MATERIAL_ROLES = Object.freeze([
  'ground', 'lawn', 'asphalt', 'kerb', 'drive', 'driveDecal', 'trimDecal',
  'block', 'sidingA', 'sidingB', 'garageDoor', 'trim', 'roof', 'roofGlazing',
  'fence', 'sign', 'planter', 'applianceRed', 'applianceBlue', 'busTrim',
  'coachGlass',
] as const);

/**
 * Build one material per role.
 *
 * Called ONCE per arena build. Nothing in this library allocates per frame:
 * every wear term is a node expression compiled into the material's shader at
 * construction time.
 */
export function createNuketown2MaterialRegistry(): Nuketown2MaterialRegistry {
  return Object.freeze({
    // Beyond the fence: dry scrubland keyed between the backdrop skirt's own
    // two authored ground colours, so the plain and the tree line read as the
    // same land rather than as a lit island in a void.
    //
    // It is a BACKDROP, and it says so. No route crosses it, a fence stands in
    // front of it, and it is read across the map at about 55 m, where its
    // 60 mm scuffs are 1.8 of a pixel and its 0.9 mm grain is 0.01. Authoring
    // those two scales anyway - over a 220 m slab that fills the bottom of
    // every horizon frame - was a measured 12-second first-submission stall
    // that failed the arena boot smoke. Only the metre-scale field it exists
    // to carry survives, which is the one it was authored for.
    ground: createLawnMaterial('nuketown2-ground-scrub', 0x515642, {
      variant: 'scrub',
      readDistanceM: 55,
    }),
    lawn: createLawnMaterial('nuketown2-lawn-decal', 0x496438, { variant: 'turf', polygonOffset: -2 }),

    asphalt: createAsphaltMaterial(),
    kerb: createConcreteMaterial('nuketown2-kerb', 0x9a978a, { variant: 'kerb', dampFootY: 0 }),
    drive: createConcreteMaterial('nuketown2-drive', 0x8b8879, { variant: 'apron' }),
    driveDecal: createConcreteMaterial('nuketown2-drive-decal', 0x8b8879, { variant: 'apron', polygonOffset: -1 }),
    trimDecal: createMarkingMaterial(),
    block: createConcreteMaterial('nuketown2-block', 0x9d9a8c, { variant: 'block' }),

    // HF-477 SUPERSEDES THE HEXES THIS LANE INHERITED, and it is the accuracy
    // lane's call, not this one's: `docs/references/nuketown-2025/FINDINGS.md`
    // Q2 is VERIFIED on two BO2-2025 frames and reads TERRACOTTA-ORANGE over
    // CREAM, not the blue-and-yellow pairing (which is the ORIGINAL Nuketown's
    // palette, the same source as the school bus HF-407 removed). What this
    // lane owns is everything ON TOP of the hex - the lap shadow, the chalking,
    // the weathering - and all of that is unchanged. `sidingA` is now the
    // orange UPPER band only; `sidingB` is the cream that three of the four
    // storey-halves wear, which is why one material carries both ground
    // storeys and the whole south house.
    //
    // THE LANE'S OWN `wainscotSrgb` OPTION IS DECLINED HERE, and the reason is
    // the deploy fence, not the paint: the accuracy lane split every house wall
    // AT THE SAME y = 3.0 storey line, so the two-tone is already carried by
    // geometry, and a second mechanism for it would only buy a SECOND siding
    // node graph on the cold-compile path this candidate is fighting. Same
    // picture, one pipeline.
    sidingA: createSidingMaterial(0x9f6147, 'nuketown2-siding-orange-upper'),
    sidingB: createSidingMaterial(0xeae3cf, 'nuketown2-siding-cream'),
    roof: createRoofMaterial(),
    // HF-477: the white house's PALE BLUE-GREY ROOF GLAZING, the aerial's
    // single strongest identifier for that house (measured #aebdc0/#b6c6c9 on
    // `nt2025-aerial-boii.jpg`). Authored 0xaebdc1 - within 1/255 of the
    // measurement and already this map's own `chrome` albedo, so no new value
    // is invented. Smooth and unpanelled, because it is glazing rather than a
    // shingled deck.
    roofGlazing: createPaintedMetalMaterial('nuketown2-roof-glazing', 0xaebdc1, {
      roughness: 0.22,
      metalness: 0.10,
    }),

    // A sectional door is PAINTED STEEL, not chrome. It was shipping at
    // metalness 0.76, which made a 5 x 2 m panel mirror the sky and read as a
    // blank bright rectangle from the street; painted metal at 0.08 with panel
    // joints, orange peel and chips to primer is the same door, seen.
    garageDoor: createPaintedMetalMaterial('nuketown2-garage-door', 0xaebdc1, {
      panelled: true,
      roughness: 0.34,
    }),
    trim: createTimberMaterial('nuketown2-trim', 0xf0e4c9, 'painted-trim'),
    // The shipped fence timber, unchanged. This lane re-authors how a surface
    // is WORN, not what colour it is; an earlier revision here drifted the
    // fence a shade lighter and oranger and the review captures showed it.
    fence: createTimberMaterial('nuketown2-timber-fence', 0x673b24, 'fence'),
    sign: createPaintedMetalMaterial('nuketown2-sign', 0xdbd1ba, { roughness: 0.62 }),
    // HF-477 - THE CHIRALITY ANCHORS. Each front lawn carries a three-unit
    // cooker bank, RED tops on the orange house's lawn and BLUE on the white
    // house's, which tells a player which half of a 180-degree symmetric map he
    // is standing in without moving a single collider. The RED is the coach's
    // own 0xa8382c, already measured in this arena; the BLUE is 0x46809f, the
    // value that used to paint the north HOUSE - demoted, not deleted, to the
    // prop the reference actually paints blue. Enamelled steel, which is this
    // family exactly.
    applianceRed: createPaintedMetalMaterial('nuketown2-appliance-red', 0xa8382c, {
      roughness: 0.42,
      metalness: 0.18,
    }),
    applianceBlue: createPaintedMetalMaterial('nuketown2-appliance-blue', 0x46809f, {
      roughness: 0.42,
      metalness: 0.18,
    }),
    planter: createLawnMaterial('nuketown2-planter', 0x415a33, { variant: 'hedge' }),

    // Chrome-trim exception: the coach waistline is the one intentionally
    // reflective painted-metal accent, so its 0.25 metalness is pinned here
    // rather than mistaken for the dielectric factory-paint default.
    busTrim: createPaintedMetalMaterial('nuketown2-coach-trim', 0xa8382c, {
      polygonOffset: -1,
      roughness: 0.48,
      metalness: 0.25,
    }),
    // Was metalness 0.5 — a coloured metal band, which is exactly the reading
    // "looks like basic geometry" describes. Glass is a dielectric.
    coachGlass: createGlassMaterial('nuketown2-coach-glass-band', 0x2b3d47, {
      opacity: 1,
      polygonOffset: -1,
    }),
  });
}
