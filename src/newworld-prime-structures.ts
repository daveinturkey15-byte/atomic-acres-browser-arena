/**
 * newworld-prime structures — presentation-only parts generators.
 *
 * Data-in / parts-out: pure functions take a placement origin and return
 * frozen part descriptors (centre offsets + sizes in metres, role tags, and
 * TSL registry material keys). No THREE import, no scene mutation, no
 * authority/collider/spawn/nav data — Shell wires these parts into meshes.
 *
 * Houses (per LAYOUT_CONTRACT):
 * - Fact 2: WEST teal 2-storey street house + front porch/railing + chimney.
 * - Fact 8: EAST yellow 2-storey street house + stone chimney + rear patio.
 *
 * Visual bar (reference plates — original-art reads, no likeness copied):
 * - batch-2-layout/map__street-teal-side.png  (west teal siding/porch read)
 * - batch-2-layout/map__street-yellow-side.png (east yellow siding/trim read)
 * - batch-3 map plates (massing, roof pitch, chimney placement)
 *
 * Pattern note: generator names follow the forge-kit vocabulary
 * (lapSidingParts / windowRevealParts / panelDoorParts / shingleRoofParts
 * style) but are implemented locally here — forge-kit itself is untouched and
 * there is no shared part module this wave. Types are prefixed
 * NewworldPrimeStructure* so Shell can import structure + prop parts cleanly.
 */

// ---------------------------------------------------------------------------
// Named dimensional constants (metres unless suffixed _MM)
// ---------------------------------------------------------------------------

/** Finished floor-to-floor height, one storey. */
export const NEWWORLD_PRIME_STOREY_HEIGHT_M = 2.7;
/** Structural wall thickness (framing + sheathing). */
export const NEWWORLD_PRIME_WALL_THICKNESS_MM = 140;
/** Lap-siding course reveal — texture rhythm, not per-course geometry. */
export const NEWWORLD_PRIME_SIDING_COURSE_MM = 150;
/** Corner-board / casing trim width. */
export const NEWWORLD_PRIME_TRIM_WIDTH_MM = 90;
/** Trim stock thickness. */
export const NEWWORLD_PRIME_TRIM_THICKNESS_MM = 24;
/** Anti-z-fight setback: trim/siding faces stand proud of sheathing. */
export const NEWWORLD_PRIME_SETBACK_MM = 8;
/** Bed-in: foundation/skirts sink below grade so no daylight gaps. */
export const NEWWORLD_PRIME_BED_IN_MM = 120;
/** Post/patio bed-in depth. */
export const NEWWORLD_PRIME_POST_BED_IN_MM = 80;
/** Ground-floor window sill height. */
export const NEWWORLD_PRIME_SILL_GROUND_M = 0.9;
/** Upper-floor window sill height above upper finished floor. */
export const NEWWORLD_PRIME_SILL_UPPER_M = 0.85;
/** Standard window opening width. */
export const NEWWORLD_PRIME_WINDOW_W_M = 0.9;
/** Standard window opening height. */
export const NEWWORLD_PRIME_WINDOW_H_M = 1.2;
/** Reveal jamb depth (opening liner). */
export const NEWWORLD_PRIME_REVEAL_DEPTH_MM = 110;
/** Glass sits inside the reveal — anti-z-fight inset from outer face. */
export const NEWWORLD_PRIME_GLASS_INSET_MM = 45;
/** Entry door leaf width / height. */
export const NEWWORLD_PRIME_DOOR_W_M = 0.95;
export const NEWWORLD_PRIME_DOOR_H_M = 2.05;
/** Door leaf thickness. */
export const NEWWORLD_PRIME_DOOR_THICKNESS_MM = 45;
/** Porch deck/rail/platform dimensions (west house). */
export const NEWWORLD_PRIME_PORCH_WIDTH_M = 4.2;
export const NEWWORLD_PRIME_PORCH_DEPTH_M = 1.8;
export const NEWWORLD_PRIME_PORCH_DECK_THICKNESS_MM = 90;
export const NEWWORLD_PRIME_PORCH_DECK_HEIGHT_M = 0.45;
export const NEWWORLD_PRIME_PORCH_POST_M = 0.12;
/** Railing height / baluster-panel rhythm (panels, not per-baluster geo). */
export const NEWWORLD_PRIME_RAILING_HEIGHT_M = 1.0;
export const NEWWORLD_PRIME_BALUSTER_SPACING_MM = 120;
export const NEWWORLD_PRIME_RAIL_THICKNESS_MM = 60;
/** Chimney stack width / cap overhang / flashing height. */
export const NEWWORLD_PRIME_CHIMNEY_W_M = 0.8;
export const NEWWORLD_PRIME_CHIMNEY_D_M = 0.8;
export const NEWWORLD_PRIME_CHIMNEY_CAP_OVERHANG_MM = 80;
export const NEWWORLD_PRIME_CHIMNEY_FLASHING_MM = 150;
/** Gable roof rise over the house depth / eave overhang. */
export const NEWWORLD_PRIME_ROOF_RISE_M = 1.6;
export const NEWWORLD_PRIME_ROOF_OVERHANG_M = 0.45;
export const NEWWORLD_PRIME_ROOF_SLAB_THICKNESS_MM = 120;
/** Shingle course reveal — texture rhythm, not per-course geometry. */
export const NEWWORLD_PRIME_SHINGLE_COURSE_MM = 140;
/** Fascia board height / soffit thickness. */
export const NEWWORLD_PRIME_FASCIA_MM = 180;
export const NEWWORLD_PRIME_SOFFIT_MM = 20;
/** East-house patio slab size / thickness / expansion gap. */
export const NEWWORLD_PRIME_PATIO_SLAB_M = 1.5;
export const NEWWORLD_PRIME_PATIO_THICKNESS_MM = 100;
export const NEWWORLD_PRIME_PATIO_GAP_MM = 12;
/** Foundation stem-wall height above grade. */
export const NEWWORLD_PRIME_FOUNDATION_ABOVE_GRADE_M = 0.45;

// House footprints (plan dimensions, metres).
export const NEWWORLD_PRIME_WEST_TEAL_W_M = 7.2;
export const NEWWORLD_PRIME_WEST_TEAL_D_M = 6.0;
export const NEWWORLD_PRIME_EAST_YELLOW_W_M = 7.8;
export const NEWWORLD_PRIME_EAST_YELLOW_D_M = 6.4;

// Per-subsystem geometry fences for the new arena (own lane — the
// world-studio 59,472/60,000 lane is never touched). Counts below are the
// exact frozen lengths each house factory returns.
export const NEWWORLD_PRIME_WEST_TEAL_PART_BUDGET = 96;
export const NEWWORLD_PRIME_EAST_YELLOW_PART_BUDGET = 96;

// ---------------------------------------------------------------------------
// Part descriptor types (self-contained — no shared forge-kit module)
// ---------------------------------------------------------------------------

export type NewworldPrimeStructurePartRole =
  | 'foundation'
  | 'lap-siding'
  | 'corner-trim'
  | 'window-reveal'
  | 'window-sill'
  | 'window-glass'
  | 'panel-door'
  | 'door-frame'
  | 'door-step'
  | 'porch-deck'
  | 'porch-post'
  | 'porch-rail'
  | 'porch-baluster-panel'
  | 'chimney-stack'
  | 'chimney-cap'
  | 'chimney-flashing'
  | 'stone-veneer'
  | 'shingle-roof'
  | 'ridge-cap'
  | 'fascia'
  | 'soffit'
  | 'patio-slab'
  | 'interior-partition'
  | 'interior-floor-slab';

/** TSL registry material keys — resolved to materials by Shell, never here. */
export type NewworldPrimeStructureMaterial =
  | 'newworld-teal-siding'
  | 'newworld-yellow-siding'
  | 'newworld-trim-white'
  | 'newworld-glass'
  | 'newworld-door-teal'
  | 'newworld-door-red'
  | 'newworld-brick'
  | 'newworld-stone'
  | 'newworld-shingle-grey'
  | 'newworld-shingle-brown'
  | 'newworld-wood-porch'
  | 'newworld-concrete'
  | 'newworld-foundation';

export interface NewworldPrimeStructurePart {
  readonly id: string;
  readonly role: NewworldPrimeStructurePartRole;
  /** Centre offset in metres, relative to the house origin (ground centre). */
  readonly offsetMetres: readonly [number, number, number];
  /** Full extents in metres [w, h, d]. */
  readonly sizeMetres: readonly [number, number, number];
  readonly material: NewworldPrimeStructureMaterial;
}

/** Placement input: plan position; rotation snaps to 90-degree steps. */
export interface NewworldPrimeStructureOrigin {
  readonly xMetres: number;
  readonly zMetres: number;
  readonly rotationYDeg?: 0 | 90 | 180 | 270;
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — seeded variation, never Math.random
// ---------------------------------------------------------------------------

export function newworldPrimeMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Local placement helpers (not exported as public API surface)
// ---------------------------------------------------------------------------

type Vec3 = [number, number, number];

function rotatePlan(
  x: number,
  z: number,
  rotationYDeg: 0 | 90 | 180 | 270,
): [number, number] {
  switch (rotationYDeg) {
    case 90:
      return [z, -x];
    case 180:
      return [-x, -z];
    case 270:
      return [-z, x];
    default:
      return [x, z];
  }
}

function placePart(
  parts: NewworldPrimeStructurePart[],
  origin: NewworldPrimeStructureOrigin,
  part: NewworldPrimeStructurePart,
): void {
  const rotation = origin.rotationYDeg ?? 0;
  const [rx, rz] = rotatePlan(part.offsetMetres[0], part.offsetMetres[2], rotation);
  const [sx, sz] =
    rotation === 90 || rotation === 270
      ? [part.sizeMetres[2], part.sizeMetres[0]]
      : [part.sizeMetres[0], part.sizeMetres[2]];
  parts.push({
    ...part,
    offsetMetres: [origin.xMetres + rx, part.offsetMetres[1], origin.zMetres + rz],
    sizeMetres: [sx, part.sizeMetres[1], sz],
  });
}

const mmToM = (mm: number): number => mm / 1000;

// ---------------------------------------------------------------------------
// forge-kit-style sub-generators (local implementations, forge-kit untouched)
// ---------------------------------------------------------------------------

export interface NewworldPrimeSidingOptions {
  readonly prefix: string;
  readonly widthM: number;
  readonly depthM: number;
  readonly wallThicknessM?: number;
  readonly material: NewworldPrimeStructureMaterial;
}

/** One lap-siding panel per wall per storey (course lines live in texture). */
export function lapSidingParts(options: NewworldPrimeSidingOptions): readonly NewworldPrimeStructurePart[] {
  const { prefix, widthM, depthM, material } = options;
  const t = (options.wallThicknessM ?? mmToM(NEWWORLD_PRIME_WALL_THICKNESS_MM)) / 2;
  const setback = mmToM(NEWWORLD_PRIME_SETBACK_MM);
  const h = NEWWORLD_PRIME_STOREY_HEIGHT_M;
  const y0 = h / 2;
  const y1 = h + h / 2;
  const hw = widthM / 2 + setback;
  const hd = depthM / 2 + setback;
  void t;
  return Object.freeze([
    { id: `${prefix}-siding-north-0`, role: 'lap-siding', offsetMetres: [0, y0, -hd], sizeMetres: [widthM, h, mmToM(NEWWORLD_PRIME_WALL_THICKNESS_MM)], material },
    { id: `${prefix}-siding-south-0`, role: 'lap-siding', offsetMetres: [0, y0, hd], sizeMetres: [widthM, h, mmToM(NEWWORLD_PRIME_WALL_THICKNESS_MM)], material },
    { id: `${prefix}-siding-east-0`, role: 'lap-siding', offsetMetres: [hw, y0, 0], sizeMetres: [mmToM(NEWWORLD_PRIME_WALL_THICKNESS_MM), h, depthM], material },
    { id: `${prefix}-siding-west-0`, role: 'lap-siding', offsetMetres: [-hw, y0, 0], sizeMetres: [mmToM(NEWWORLD_PRIME_WALL_THICKNESS_MM), h, depthM], material },
    { id: `${prefix}-siding-north-1`, role: 'lap-siding', offsetMetres: [0, y1, -hd], sizeMetres: [widthM, h, mmToM(NEWWORLD_PRIME_WALL_THICKNESS_MM)], material },
    { id: `${prefix}-siding-south-1`, role: 'lap-siding', offsetMetres: [0, y1, hd], sizeMetres: [widthM, h, mmToM(NEWWORLD_PRIME_WALL_THICKNESS_MM)], material },
    { id: `${prefix}-siding-east-1`, role: 'lap-siding', offsetMetres: [hw, y1, 0], sizeMetres: [mmToM(NEWWORLD_PRIME_WALL_THICKNESS_MM), h, depthM], material },
    { id: `${prefix}-siding-west-1`, role: 'lap-siding', offsetMetres: [-hw, y1, 0], sizeMetres: [mmToM(NEWWORLD_PRIME_WALL_THICKNESS_MM), h, depthM], material },
  ] as NewworldPrimeStructurePart[]);
}

export interface NewworldPrimeWindowOptions {
  readonly id: string;
  /** Opening centre, house-local metres (y = absolute, x/z = wall plane). */
  readonly centre: Vec3;
  /** Outward wall normal: 'north' | 'south' | 'east' | 'west'. */
  readonly facing: 'north' | 'south' | 'east' | 'west';
  readonly widthM?: number;
  readonly heightM?: number;
}

/** Reveal liner + sill + inset glass for one punched opening. */
export function windowRevealParts(options: NewworldPrimeWindowOptions): readonly NewworldPrimeStructurePart[] {
  const w = options.widthM ?? NEWWORLD_PRIME_WINDOW_W_M;
  const h = options.heightM ?? NEWWORLD_PRIME_WINDOW_H_M;
  const reveal = mmToM(NEWWORLD_PRIME_REVEAL_DEPTH_MM);
  const inset = mmToM(NEWWORLD_PRIME_GLASS_INSET_MM);
  const sillT = mmToM(40);
  const trimW = mmToM(NEWWORLD_PRIME_TRIM_WIDTH_MM);
  const [cx, cy, cz] = options.centre;
  const horizontal = options.facing === 'north' || options.facing === 'south';
  const sign = options.facing === 'south' || options.facing === 'east' ? 1 : -1;
  // Liner stands slightly proud of the siding face (anti-z-fight), glass
  // sits deeper inside the reveal so coplanar faces never coincide.
  const linerC: Vec3 = horizontal ? [cx, cy, cz + sign * reveal * 0.5] : [cx + sign * reveal * 0.5, cy, cz];
  const glassC: Vec3 = horizontal
    ? [cx, cy, cz + sign * (reveal * 0.5 - inset * 0.5)]
    : [cx + sign * (reveal * 0.5 - inset * 0.5), cy, cz];
  const sillC: Vec3 = horizontal
    ? [cx, cy - h / 2 - sillT / 2, cz + sign * (reveal * 0.5 + trimW * 0.25)]
    : [cx + sign * (reveal * 0.5 + trimW * 0.25), cy - h / 2 - sillT / 2, cz];
  const linerSize: Vec3 = horizontal ? [w + trimW * 2, h + trimW, reveal] : [reveal, h + trimW, w + trimW * 2];
  const glassSize: Vec3 = horizontal ? [w, h, mmToM(12)] : [mmToM(12), h, w];
  const sillSize: Vec3 = horizontal ? [w + trimW * 2, sillT, reveal + trimW * 0.5] : [reveal + trimW * 0.5, sillT, w + trimW * 2];
  return Object.freeze([
    { id: `${options.id}-reveal`, role: 'window-reveal', offsetMetres: linerC, sizeMetres: linerSize, material: 'newworld-trim-white' },
    { id: `${options.id}-glass`, role: 'window-glass', offsetMetres: glassC, sizeMetres: glassSize, material: 'newworld-glass' },
    { id: `${options.id}-sill`, role: 'window-sill', offsetMetres: sillC, sizeMetres: sillSize, material: 'newworld-trim-white' },
  ] as NewworldPrimeStructurePart[]);
}

export interface NewworldPrimeDoorOptions {
  readonly id: string;
  readonly centre: Vec3;
  readonly facing: 'north' | 'south' | 'east' | 'west';
  readonly leafMaterial: 'newworld-door-teal' | 'newworld-door-red';
}

/** Cased frame + panel leaf (proud of the opening) + bedded step. */
export function panelDoorParts(options: NewworldPrimeDoorOptions): readonly NewworldPrimeStructurePart[] {
  const w = NEWWORLD_PRIME_DOOR_W_M;
  const h = NEWWORLD_PRIME_DOOR_H_M;
  const trimW = mmToM(NEWWORLD_PRIME_TRIM_WIDTH_MM);
  const leafT = mmToM(NEWWORLD_PRIME_DOOR_THICKNESS_MM);
  const [cx, cy, cz] = options.centre;
  const horizontal = options.facing === 'north' || options.facing === 'south';
  const sign = options.facing === 'south' || options.facing === 'east' ? 1 : -1;
  const frameC: Vec3 = horizontal ? [cx, cy, cz] : [cx, cy, cz];
  const leafC: Vec3 = horizontal ? [cx, cy, cz + sign * leafT] : [cx + sign * leafT, cy, cz];
  const stepC: Vec3 = horizontal
    ? [cx, mmToM(NEWWORLD_PRIME_POST_BED_IN_MM) / 2, cz + sign * 0.45]
    : [cx + sign * 0.45, mmToM(NEWWORLD_PRIME_POST_BED_IN_MM) / 2, cz];
  const frameSize: Vec3 = horizontal ? [w + trimW * 2, h + trimW, mmToM(NEWWORLD_PRIME_REVEAL_DEPTH_MM)] : [mmToM(NEWWORLD_PRIME_REVEAL_DEPTH_MM), h + trimW, w + trimW * 2];
  const leafSize: Vec3 = horizontal ? [w, h, leafT] : [leafT, h, w];
  return Object.freeze([
    { id: `${options.id}-frame`, role: 'door-frame', offsetMetres: frameC, sizeMetres: frameSize, material: 'newworld-trim-white' },
    { id: `${options.id}-leaf`, role: 'panel-door', offsetMetres: leafC, sizeMetres: leafSize, material: options.leafMaterial },
    { id: `${options.id}-step`, role: 'door-step', offsetMetres: stepC, sizeMetres: horizontal ? [w + 0.3, mmToM(NEWWORLD_PRIME_POST_BED_IN_MM) + 0.12, 0.9] : [0.9, mmToM(NEWWORLD_PRIME_POST_BED_IN_MM) + 0.12, w + 0.3], material: 'newworld-concrete' },
  ] as NewworldPrimeStructurePart[]);
}

export interface NewworldPrimeRoofOptions {
  readonly prefix: string;
  readonly widthM: number;
  readonly depthM: number;
  readonly wallTopM: number;
  readonly material: 'newworld-shingle-grey' | 'newworld-shingle-brown';
}

/** Two sloped slabs + ridge cap + fascia/soffit on the eaves. */
export function shingleRoofParts(options: NewworldPrimeRoofOptions): readonly NewworldPrimeStructurePart[] {
  const { prefix, widthM, depthM, wallTopM, material } = options;
  const rise = NEWWORLD_PRIME_ROOF_RISE_M;
  const over = NEWWORLD_PRIME_ROOF_OVERHANG_M;
  const slabT = mmToM(NEWWORLD_PRIME_ROOF_SLAB_THICKNESS_MM);
  const slopeLen = Math.sqrt((depthM / 2 + over) ** 2 + rise ** 2);
  const slopeW = widthM + over * 2;
  const midY = wallTopM + rise / 2;
  const zOff = depthM / 4 + over / 2;
  const fasciaH = mmToM(NEWWORLD_PRIME_FASCIA_MM);
  return Object.freeze([
    { id: `${prefix}-roof-south`, role: 'shingle-roof', offsetMetres: [0, midY, zOff], sizeMetres: [slopeW, slabT, slopeLen], material },
    { id: `${prefix}-roof-north`, role: 'shingle-roof', offsetMetres: [0, midY, -zOff], sizeMetres: [slopeW, slabT, slopeLen], material },
    { id: `${prefix}-ridge`, role: 'ridge-cap', offsetMetres: [0, wallTopM + rise + slabT / 2, 0], sizeMetres: [slopeW, slabT * 1.5, 0.32], material },
    { id: `${prefix}-fascia-south`, role: 'fascia', offsetMetres: [0, wallTopM + 0.05, depthM / 2 + over], sizeMetres: [slopeW, fasciaH, mmToM(24)], material: 'newworld-trim-white' },
    { id: `${prefix}-fascia-north`, role: 'fascia', offsetMetres: [0, wallTopM + 0.05, -(depthM / 2 + over)], sizeMetres: [slopeW, fasciaH, mmToM(24)], material: 'newworld-trim-white' },
    { id: `${prefix}-soffit-south`, role: 'soffit', offsetMetres: [0, wallTopM - mmToM(NEWWORLD_PRIME_SOFFIT_MM) / 2, depthM / 2 + over / 2], sizeMetres: [slopeW, mmToM(NEWWORLD_PRIME_SOFFIT_MM), over], material: 'newworld-trim-white' },
    { id: `${prefix}-soffit-north`, role: 'soffit', offsetMetres: [0, wallTopM - mmToM(NEWWORLD_PRIME_SOFFIT_MM) / 2, -(depthM / 2 + over / 2)], sizeMetres: [slopeW, mmToM(NEWWORLD_PRIME_SOFFIT_MM), over], material: 'newworld-trim-white' },
  ] as NewworldPrimeStructurePart[]);
}

export interface NewworldPrimeChimneyOptions {
  readonly id: string;
  /** Stack centre, house-local (y = stack centre height). */
  readonly centre: Vec3;
  readonly heightM: number;
  readonly stackMaterial: NewworldPrimeStructureMaterial;
}

/** Stack + oversailing cap + step flashing (flashing laps the roof slab). */
export function chimneyParts(options: NewworldPrimeChimneyOptions): readonly NewworldPrimeStructurePart[] {
  const w = NEWWORLD_PRIME_CHIMNEY_W_M;
  const d = NEWWORLD_PRIME_CHIMNEY_D_M;
  const over = mmToM(NEWWORLD_PRIME_CHIMNEY_CAP_OVERHANG_MM);
  const [cx, cy, cz] = options.centre;
  return Object.freeze([
    { id: `${options.id}-stack`, role: 'chimney-stack', offsetMetres: [cx, cy, cz], sizeMetres: [w, options.heightM, d], material: options.stackMaterial },
    { id: `${options.id}-cap`, role: 'chimney-cap', offsetMetres: [cx, cy + options.heightM / 2 + 0.06, cz], sizeMetres: [w + over * 2, 0.12, d + over * 2], material: 'newworld-concrete' },
    { id: `${options.id}-flashing`, role: 'chimney-flashing', offsetMetres: [cx, cy - options.heightM / 2 + mmToM(NEWWORLD_PRIME_CHIMNEY_FLASHING_MM) / 2, cz], sizeMetres: [w + 0.12, mmToM(NEWWORLD_PRIME_CHIMNEY_FLASHING_MM), d + 0.12], material: 'newworld-trim-white' },
  ] as NewworldPrimeStructurePart[]);
}

export interface NewworldPrimePorchOptions {
  readonly prefix: string;
  /** Porch deck centre, house-local. */
  readonly centre: Vec3;
  readonly seed?: number;
}

/**
 * Deck + bedded posts + rails with baluster panels (one panel per bay keeps
 * the parts budget flat; baluster rhythm lives in texture/normals).
 */
export function porchParts(options: NewworldPrimePorchOptions): readonly NewworldPrimeStructurePart[] {
  const { prefix, centre } = options;
  const rand = newworldPrimeMulberry32(options.seed ?? 0x9e3779b9);
  const w = NEWWORLD_PRIME_PORCH_WIDTH_M;
  const d = NEWWORLD_PRIME_PORCH_DEPTH_M;
  const deckT = mmToM(NEWWORLD_PRIME_PORCH_DECK_THICKNESS_MM);
  const deckY = NEWWORLD_PRIME_PORCH_DECK_HEIGHT_M;
  const [cx, , cz] = centre;
  const parts: NewworldPrimeStructurePart[] = [];
  parts.push({
    id: `${prefix}-deck`, role: 'porch-deck',
    offsetMetres: [cx, deckY - deckT / 2, cz], sizeMetres: [w, deckT, d],
    material: 'newworld-wood-porch',
  });
  // Six bedded posts (corners + mid-span), jittered ±10 mm for hand-built read.
  const postXs = [-w / 2 + 0.06, 0, w / 2 - 0.06];
  const postZs = [cz - d / 2 + 0.06, cz + d / 2 - 0.06];
  for (const px of postXs) {
    for (const pz of postZs) {
      const jitter = (rand() - 0.5) * 0.02;
      const postH = 2.35;
      parts.push({
        id: `${prefix}-post-${px.toFixed(2)}-${pz.toFixed(2)}`, role: 'porch-post',
        offsetMetres: [cx + px + jitter, deckY + postH / 2 - mmToM(NEWWORLD_PRIME_POST_BED_IN_MM) / 2, pz],
        sizeMetres: [NEWWORLD_PRIME_PORCH_POST_M, postH, NEWWORLD_PRIME_PORCH_POST_M],
        material: 'newworld-trim-white',
      });
    }
  }
  // Rails: front bay (2 panels) + returns; top/bottom rail + infill panel each.
  const railT = mmToM(NEWWORLD_PRIME_RAIL_THICKNESS_MM);
  const railY = deckY + NEWWORLD_PRIME_RAILING_HEIGHT_M;
  const bays: ReadonlyArray<{ id: string; c: Vec3; s: Vec3 }> = [
    { id: 'front-l', c: [cx - w / 4, railY, cz + d / 2 - 0.06], s: [w / 2 - 0.12, railT, railT] },
    { id: 'front-r', c: [cx + w / 4, railY, cz + d / 2 - 0.06], s: [w / 2 - 0.12, railT, railT] },
    { id: 'side-l', c: [cx - w / 2 + 0.06, railY, cz], s: [railT, railT, d - 0.12] },
    { id: 'side-r', c: [cx + w / 2 - 0.06, railY, cz], s: [railT, railT, d - 0.12] },
  ];
  for (const bay of bays) {
    parts.push({
      id: `${prefix}-rail-top-${bay.id}`, role: 'porch-rail',
      offsetMetres: bay.c, sizeMetres: bay.s, material: 'newworld-trim-white',
    });
    parts.push({
      id: `${prefix}-baluster-${bay.id}`, role: 'porch-baluster-panel',
      offsetMetres: [bay.c[0], deckY + NEWWORLD_PRIME_RAILING_HEIGHT_M / 2, bay.c[2]],
      sizeMetres: [bay.s[0] === railT ? railT : bay.s[0], NEWWORLD_PRIME_RAILING_HEIGHT_M - 0.14, bay.s[2] === railT ? railT : bay.s[2]],
      material: 'newworld-trim-white',
    });
  }
  return Object.freeze(parts);
}

export interface NewworldPrimePatioOptions {
  readonly prefix: string;
  /** Patio grid origin corner (lowest x/z slab centre), house-local. */
  readonly corner: Vec3;
  readonly cols?: number;
  readonly rows?: number;
  readonly seed?: number;
}

/** Bedded concrete slab grid with expansion gaps + ±6 mm seeded height jitter. */
export function patioParts(options: NewworldPrimePatioOptions): readonly NewworldPrimeStructurePart[] {
  const cols = options.cols ?? 3;
  const rows = options.rows ?? 2;
  const rand = newworldPrimeMulberry32(options.seed ?? 0x51ed271b);
  const slab = NEWWORLD_PRIME_PATIO_SLAB_M;
  const gap = mmToM(NEWWORLD_PRIME_PATIO_GAP_MM);
  const thick = mmToM(NEWWORLD_PRIME_PATIO_THICKNESS_MM);
  const bed = mmToM(NEWWORLD_PRIME_BED_IN_MM) / 2;
  const parts: NewworldPrimeStructurePart[] = [];
  for (let ix = 0; ix < cols; ix += 1) {
    for (let iz = 0; iz < rows; iz += 1) {
      const jitter = (rand() - 0.5) * 0.012;
      parts.push({
        id: `${options.prefix}-slab-${ix}-${iz}`, role: 'patio-slab',
        offsetMetres: [
          options.corner[0] + ix * (slab + gap),
          thick / 2 - bed + jitter,
          options.corner[2] + iz * (slab + gap),
        ],
        sizeMetres: [slab, thick, slab],
        material: 'newworld-concrete',
      });
    }
  }
  return Object.freeze(parts);
}

// ---------------------------------------------------------------------------
// House assemblies — PARTS factories LayoutBlockout imports by name
// ---------------------------------------------------------------------------

function foundationPart(
  prefix: string,
  widthM: number,
  depthM: number,
): NewworldPrimeStructurePart {
  const above = NEWWORLD_PRIME_FOUNDATION_ABOVE_GRADE_M;
  const bed = mmToM(NEWWORLD_PRIME_BED_IN_MM);
  return {
    id: `${prefix}-foundation`, role: 'foundation',
    offsetMetres: [0, above / 2 - bed / 2, 0],
    sizeMetres: [widthM + 0.1, above + bed, depthM + 0.1],
    material: 'newworld-foundation',
  };
}

function cornerTrimParts(
  prefix: string,
  widthM: number,
  depthM: number,
  heightM: number,
): readonly NewworldPrimeStructurePart[] {
  const t = mmToM(NEWWORLD_PRIME_TRIM_WIDTH_MM);
  const setback = mmToM(NEWWORLD_PRIME_SETBACK_MM);
  const hw = widthM / 2 + setback + t / 2;
  const hd = depthM / 2 + setback + t / 2;
  const corners: ReadonlyArray<[number, number]> = [[hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]];
  return Object.freeze(
    corners.map(([x, z], index) => ({
      id: `${prefix}-corner-${index}`, role: 'corner-trim' as const,
      offsetMetres: [x, heightM / 2, z] as Vec3,
      sizeMetres: [t, heightM, t] as Vec3,
      material: 'newworld-trim-white' as const,
    })),
  );
}

/**
 * WEST teal 2-storey (LAYOUT_CONTRACT fact 2).
 * Bar: batch-2-layout/map__street-teal-side.png — teal lap siding, white
 * corner boards, front porch with railing, brick chimney on the ridge.
 * Returns exactly 80 parts (budget 96).
 */
export function westTealHousePARTS(
  origin: NewworldPrimeStructureOrigin = { xMetres: 0, zMetres: 0 },
): readonly NewworldPrimeStructurePart[] {
  const W = NEWWORLD_PRIME_WEST_TEAL_W_M;
  const D = NEWWORLD_PRIME_WEST_TEAL_D_M;
  const h = NEWWORLD_PRIME_STOREY_HEIGHT_M;
  const wallTop = h * 2;
  const prefix = 'newworld-west-teal';
  const local: NewworldPrimeStructurePart[] = [];
  local.push(foundationPart(prefix, W, D));
  local.push(...lapSidingParts({ prefix, widthM: W, depthM: D, material: 'newworld-teal-siding' }));
  local.push(...cornerTrimParts(prefix, W, D, wallTop));
  const hd = D / 2 + mmToM(NEWWORLD_PRIME_SETBACK_MM) + mmToM(NEWWORLD_PRIME_REVEAL_DEPTH_MM) / 2;
  const hw = W / 2 + mmToM(NEWWORLD_PRIME_SETBACK_MM) + mmToM(NEWWORLD_PRIME_REVEAL_DEPTH_MM) / 2;
  // South (street) face: door + flanking ground windows, three upper windows.
  local.push(...panelDoorParts({ id: `${prefix}-door`, centre: [0, NEWWORLD_PRIME_DOOR_H_M / 2 + NEWWORLD_PRIME_PORCH_DECK_HEIGHT_M, hd], facing: 'south', leafMaterial: 'newworld-door-red' }));
  for (const [i, x] of [-2.2, 2.2].entries()) {
    local.push(...windowRevealParts({ id: `${prefix}-win-s0-${i}`, centre: [x, NEWWORLD_PRIME_SILL_GROUND_M + NEWWORLD_PRIME_WINDOW_H_M / 2, hd], facing: 'south' }));
  }
  for (const [i, x] of [-2.2, 0, 2.2].entries()) {
    local.push(...windowRevealParts({ id: `${prefix}-win-s1-${i}`, centre: [x, h + NEWWORLD_PRIME_SILL_UPPER_M + NEWWORLD_PRIME_WINDOW_H_M / 2, hd], facing: 'south' }));
  }
  // North face: two + two. Gables: one per storey each side.
  for (const [i, x] of [-1.8, 1.8].entries()) {
    local.push(...windowRevealParts({ id: `${prefix}-win-n0-${i}`, centre: [x, NEWWORLD_PRIME_SILL_GROUND_M + NEWWORLD_PRIME_WINDOW_H_M / 2, -hd], facing: 'north' }));
    local.push(...windowRevealParts({ id: `${prefix}-win-n1-${i}`, centre: [x, h + NEWWORLD_PRIME_SILL_UPPER_M + NEWWORLD_PRIME_WINDOW_H_M / 2, -hd], facing: 'north' }));
  }
  for (const [i, z] of [-1.4, 1.4].entries()) {
    local.push(...windowRevealParts({ id: `${prefix}-win-e${i}`, centre: [hw, h / 2 + 0.35, z], facing: 'east' }));
    local.push(...windowRevealParts({ id: `${prefix}-win-w${i}`, centre: [-hw, h / 2 + 0.35, z], facing: 'west' }));
  }
  // Porch across the street face + brick chimney through the ridge.
  local.push(...porchParts({ prefix, centre: [0, 0, D / 2 + NEWWORLD_PRIME_PORCH_DEPTH_M / 2], seed: 0x7ea27ea }));
  local.push(...chimneyParts({ id: `${prefix}-chimney`, centre: [W / 4, wallTop + NEWWORLD_PRIME_ROOF_RISE_M + 0.35, 0], heightM: 2.4, stackMaterial: 'newworld-brick' }));
  local.push(...shingleRoofParts({ prefix, widthM: W, depthM: D, wallTopM: wallTop, material: 'newworld-shingle-grey' }));
  const placed: NewworldPrimeStructurePart[] = [];
  for (const part of local) placePart(placed, origin, part);
  return Object.freeze(placed);
}

/**
 * EAST yellow 2-storey (LAYOUT_CONTRACT fact 8).
 * Bar: batch-2-layout/map__street-yellow-side.png — yellow lap siding, white
 * trim, stone chimney stack, rear patio slab grid. Batch-3 map plates set the
 * wider frontage and roof pitch read.
 * Returns exactly 72 parts (budget 96).
 */
export function eastYellowHousePARTS(
  origin: NewworldPrimeStructureOrigin = { xMetres: 0, zMetres: 0 },
): readonly NewworldPrimeStructurePart[] {
  const W = NEWWORLD_PRIME_EAST_YELLOW_W_M;
  const D = NEWWORLD_PRIME_EAST_YELLOW_D_M;
  const h = NEWWORLD_PRIME_STOREY_HEIGHT_M;
  const wallTop = h * 2;
  const prefix = 'newworld-east-yellow';
  const local: NewworldPrimeStructurePart[] = [];
  local.push(foundationPart(prefix, W, D));
  local.push(...lapSidingParts({ prefix, widthM: W, depthM: D, material: 'newworld-yellow-siding' }));
  local.push(...cornerTrimParts(prefix, W, D, wallTop));
  const hd = D / 2 + mmToM(NEWWORLD_PRIME_SETBACK_MM) + mmToM(NEWWORLD_PRIME_REVEAL_DEPTH_MM) / 2;
  const hw = W / 2 + mmToM(NEWWORLD_PRIME_SETBACK_MM) + mmToM(NEWWORLD_PRIME_REVEAL_DEPTH_MM) / 2;
  // South (street) face mirrors the west rhythm on a wider frontage.
  local.push(...panelDoorParts({ id: `${prefix}-door`, centre: [0, NEWWORLD_PRIME_DOOR_H_M / 2 + 0.12, hd], facing: 'south', leafMaterial: 'newworld-door-teal' }));
  for (const [i, x] of [-2.6, 2.6].entries()) {
    local.push(...windowRevealParts({ id: `${prefix}-win-s0-${i}`, centre: [x, NEWWORLD_PRIME_SILL_GROUND_M + NEWWORLD_PRIME_WINDOW_H_M / 2, hd], facing: 'south' }));
  }
  for (const [i, x] of [-2.6, 0, 2.6].entries()) {
    local.push(...windowRevealParts({ id: `${prefix}-win-s1-${i}`, centre: [x, h + NEWWORLD_PRIME_SILL_UPPER_M + NEWWORLD_PRIME_WINDOW_H_M / 2, hd], facing: 'south' }));
  }
  for (const [i, x] of [-2.0, 2.0].entries()) {
    local.push(...windowRevealParts({ id: `${prefix}-win-n0-${i}`, centre: [x, NEWWORLD_PRIME_SILL_GROUND_M + NEWWORLD_PRIME_WINDOW_H_M / 2, -hd], facing: 'north' }));
    local.push(...windowRevealParts({ id: `${prefix}-win-n1-${i}`, centre: [x, h + NEWWORLD_PRIME_SILL_UPPER_M + NEWWORLD_PRIME_WINDOW_H_M / 2, -hd], facing: 'north' }));
  }
  for (const [i, z] of [-1.5, 1.5].entries()) {
    local.push(...windowRevealParts({ id: `${prefix}-win-e${i}`, centre: [hw, h / 2 + 0.35, z], facing: 'east' }));
    local.push(...windowRevealParts({ id: `${prefix}-win-w${i}`, centre: [-hw, h / 2 + 0.35, z], facing: 'west' }));
  }
  // Stone chimney on the east gable + rear patio grid.
  local.push(...chimneyParts({ id: `${prefix}-chimney`, centre: [W / 2 + 0.15, wallTop * 0.62, 0], heightM: wallTop * 0.62 + NEWWORLD_PRIME_ROOF_RISE_M + 0.5, stackMaterial: 'newworld-stone' }));
  local.push({
    id: `${prefix}-stone-veneer-base`, role: 'stone-veneer',
    offsetMetres: [W / 2 + 0.15, NEWWORLD_PRIME_FOUNDATION_ABOVE_GRADE_M / 2, 0],
    sizeMetres: [NEWWORLD_PRIME_CHIMNEY_W_M + 0.2, NEWWORLD_PRIME_FOUNDATION_ABOVE_GRADE_M, NEWWORLD_PRIME_CHIMNEY_D_M + 0.6],
    material: 'newworld-stone',
  });
  local.push(...patioParts({ prefix, corner: [-2.4, 0, -(D / 2 + 2.2)], cols: 3, rows: 2, seed: 0xe51717 }));
  local.push(...shingleRoofParts({ prefix, widthM: W, depthM: D, wallTopM: wallTop, material: 'newworld-shingle-brown' }));
  const placed: NewworldPrimeStructurePart[] = [];
  for (const part of local) placePart(placed, origin, part);
  return Object.freeze(placed);
}

export interface NewworldPrimeStructuresLayout {
  readonly westTeal: NewworldPrimeStructureOrigin;
  readonly eastYellow: NewworldPrimeStructureOrigin;
}

/** Both street houses in one frozen array (west first, then east). */
export function newworldPrimeStructuresPARTS(
  layout: NewworldPrimeStructuresLayout,
): readonly NewworldPrimeStructurePart[] {
  return Object.freeze([
    ...westTealHousePARTS(layout.westTeal),
    ...eastYellowHousePARTS(layout.eastYellow),
  ]);
}
