/**
 * forge-kit/interior/prefabs.ts — HF-536 NIGHT-MUSE-INTERIORS, the Nuke Town
 * ground-floor + garage dressing kit.
 *
 * WHAT THIS IS. Parameterised presentation prefabs for both houses' interiors
 * (kitchen run, living set, shelf hutch, wall art, dining set) and the garage
 * (bench dressing, racking boxes, oil stain). Each prefab returns PARTS, not
 * meshes — local-frame offsets, sizes and the material ROLE it wants — and the
 * arena emits them through its own `pair()` helper, so handedness, the
 * 180-degree symmetry gate and the presentation-only flags keep working
 * exactly as they do for authored geometry.
 *
 * APPLIED SKILL RULES.
 * - atomic-acres-procedural-art-authoring: deterministic (no Math.random
 *   anywhere; every tint/height is a literal), presentation-only (the arena
 *   emits every part solid:false shots:false), additive (no existing file
 *   behaviour changes), budgeted (116 boxes/house, 10/garage — see counts).
 * - webgpu-tsl-arena-forging: ZERO new material graphs — every role below
 *   resolves to a material `nuketown2Materials()` already builds, so the
 *   54-graph pipeline fence (`NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS`) is
 *   untouched. No texture samplers, no lights, no post changes.
 * - threejs-webgpu-interior-lighting-look: the one emissive part (lamp bulb)
 *   reuses the existing warm ceiling-light instance; everything else sits
 *   inside the arena's established warm plaster/timber value band.
 * - img2threejs: the north-interior target board sets the tone (warm wood
 *   floor, cream plaster, timber furniture) — matched with existing roles,
 *   not new finishes.
 * - atomic-acres-asset-authoring: deliberately NOT applied — owner ruling 1
 *   (code-native forge, no AI-generated assets in the inner loop).
 *
 * HONEST DEVIATIONS FROM THE BRIEF (all forced by the coplanar instrument,
 * which flags overlapping boxes whose tops land within 0.03 m — see the
 * garage shelf-board comment in nuketown2-arena.ts — and by the zero-new-graph
 * fence above):
 * - rug: a flat striped pile (alternating `interior`/`fence` strips with 6 mm
 *   shadow gaps) instead of a TSL-noise weave quad. A new weave material is
 *   one more cold-compile graph for a floor covering.
 * - wall art: the "procedural abstract panel" is a 2x2 grid of cells in the
 *   existing saturated roles (applianceRed/applianceBlue/planter/sign),
 *   not a new canvas shader.
 * - books: "per-instance colour" is per-part ROLE variation (trim/sign/
 *   rubber/fence) — per-instance uniforms would be new graphs.
 * - oil stain: a 65 mm rubber plate sunk 20 mm into the slab, not a
 *   polygonOffset decal — no dark decal-tier material exists indoors, and a
 *   5 mm film would sit inside the instrument's 0.03 m window over the slab.
 * - timber/painted-metal/glass role names from the brief do not exist in this
 *   arena; they map to fence (wood-deck), trim/chrome, windowGlass.
 *
 * STACKING DISCIPLINE (coplanar safety). Every part that overlaps another
 * part's plan footprint lands its TOP at least 0.04 m from any other
 * overlapping top; side-by-side parts either touch exactly or leave a gap.
 * Parts resting on existing solids sink 5 mm into them (invisible, and it
 * keeps bottom faces out of exact coplanarity).
 */

export type InteriorRole =
  | 'interior'
  | 'interiorFloor'
  | 'trim'
  | 'warmLight'
  | 'chrome'
  | 'windowGlass'
  | 'fence'
  | 'rubber'
  | 'applianceRed'
  | 'applianceBlue'
  | 'planter'
  | 'sign';

/** Every role name, for the gate that sweeps the kit rather than naming rows. */
export const INTERIOR_ROLES = Object.freeze([
  'interior', 'interiorFloor', 'trim', 'warmLight', 'chrome', 'windowGlass',
  'fence', 'rubber', 'applianceRed', 'applianceBlue', 'planter', 'sign',
] as const);

/** One box the caller emits through its own `pair()` helper. */
export interface InteriorPart {
  /** Suffix appended to the caller's id, e.g. `kitchen run worktop`. */
  readonly suffix: string;
  /** Offset from the prefab anchor, metres, authored frame. */
  readonly offset: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  /** The material ROLE the part wants; the caller resolves it. */
  readonly role: InteriorRole;
  /** False for small clutter that must not add shadow cost. */
  readonly cast: boolean;
}

/** Triangles one box costs. Every part here is a BoxGeometry: 12 tris. */
export const INTERIOR_BOX_TRIANGLES = 12;

const part = (
  suffix: string,
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  role: InteriorRole,
  cast: boolean,
): InteriorPart => Object.freeze({ suffix, offset, size, role, cast });

/**
 * kitchenRun — dressing for the existing front-room counter solid.
 * Local frame: origin at the counter-top slab's top face centre; the slab top
 * is local y=0 and the run's corridor (island) side is -z. Door panels mount
 * proud of the counter's corridor face; everything else stacks on the slab
 * with >= 0.04 m top separations (worktop 0.05, hob 0.10, grates 0.145,
 * sink rim 0.135, basin 0.095, tower kick 0.13, tower 1.305).
 */
export function kitchenRunParts(): readonly InteriorPart[] {
  const panels: InteriorPart[] = [];
  const panelRuns: ReadonlyArray<readonly [number, number]> = [
    [-1.5, -0.82], [-0.74, -0.06], [0.02, 0.7], [0.78, 1.46],
  ];
  for (const [index, run] of panelRuns.entries()) {
    const cx = (run[0]! + run[1]!) / 2;
    panels.push(part(
      `door panel ${index}`, [cx, -0.495, 0.03], [run[1]! - run[0]!, 0.7, 0.02], 'interior', false,
    ));
    panels.push(part(
      `door handle ${index}`, [cx, -0.215, 0.005], [0.3, 0.04, 0.03], 'chrome', false,
    ));
  }
  return Object.freeze([
    ...panels,
    // Worktop with a 40 mm nosing: one box, overhanging the slab's corridor
    // edge by 0.04 so the nosing reads as a shadow line, not a part.
    part('worktop', [0, 0.025, 0.53], [3.24, 0.05, 1.14], 'trim', true),
    // Hob plate + 4 burner grates, west end.
    part('hob plate', [-1.0, 0.075, 0.54], [0.8, 0.05, 0.6], 'rubber', false),
    part('hob grate 0', [-1.2, 0.1225, 0.39], [0.16, 0.045, 0.16], 'rubber', false),
    part('hob grate 1', [-0.8, 0.1225, 0.39], [0.16, 0.045, 0.16], 'rubber', false),
    part('hob grate 2', [-1.2, 0.1225, 0.69], [0.16, 0.045, 0.16], 'rubber', false),
    part('hob grate 3', [-0.8, 0.1225, 0.69], [0.16, 0.045, 0.16], 'rubber', false),
    // Sink, east end: a 4-strip rim frame (no plan overlap with the basin, so
    // the basin can sit near-flush) + dark inset + column tap with spout.
    part('sink rim west', [0.83, 0.09, 0.54], [0.06, 0.085, 0.4], 'trim', false),
    part('sink rim east', [1.37, 0.09, 0.54], [0.06, 0.085, 0.4], 'trim', false),
    part('sink rim north', [1.1, 0.09, 0.37], [0.48, 0.085, 0.06], 'trim', false),
    part('sink rim south', [1.1, 0.09, 0.71], [0.48, 0.085, 0.06], 'trim', false),
    part('sink basin', [1.1, 0.0725, 0.54], [0.48, 0.045, 0.28], 'chrome', false),
    part('tap column', [1.08, 0.2025, 0.29], [0.06, 0.305, 0.06], 'chrome', false),
    part('tap spout', [1.17, 0.285, 0.29], [0.24, 0.06, 0.06], 'chrome', false),
    // Pantry tower with a 20 mm reveal over a recessed kick.
    part('tower kick', [-0.4, 0.09, 0.54], [0.6, 0.08, 0.8], 'interior', false),
    part('tower carcass', [-0.4, 0.7275, 0.54], [0.64, 1.155, 0.84], 'interior', true),
    part('tower glass', [-0.4, 0.8, 0.975], [0.5, 0.6, 0.03], 'windowGlass', false),
  ]);
}

/**
 * sofa — cushions/arms/back laid on the existing living-couch solid.
 * Local frame: origin at the couch solid's top face centre.
 */
export function sofaParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('seat base', [0, 0.075, 0], [2.1, 0.16, 0.8], 'interior', true),
    part('arm west', [-1.0, 0.245, 0], [0.2, 0.5, 0.9], 'interior', true),
    part('arm east', [1.0, 0.245, 0], [0.2, 0.5, 0.9], 'interior', true),
    part('backrest', [0, 0.295, -0.325], [2.2, 0.6, 0.25], 'interior', true),
    part('seat cushion west', [-0.45, 0.24, 0.125], [0.86, 0.16, 0.55], 'trim', false),
    part('seat cushion east', [0.45, 0.24, 0.125], [0.86, 0.16, 0.55], 'trim', false),
    part('back cushion west', [-0.45, 0.37, -0.135], [0.86, 0.38, 0.13], 'trim', false),
    part('back cushion east', [0.45, 0.37, -0.135], [0.86, 0.38, 0.13], 'trim', false),
  ]);
}

/**
 * armchair — faces the sofa across the coffee table (backrest on +x).
 * Local frame: origin at the floor under its centre.
 */
export function armchairParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('seat base', [0, 0.14, 0], [0.78, 0.29, 0.78], 'interior', true),
    part('arm north', [0, 0.385, -0.39], [0.9, 0.78, 0.12], 'interior', true),
    part('arm south', [0, 0.385, 0.39], [0.9, 0.78, 0.12], 'interior', true),
    part('backrest', [0.39, 0.51, 0], [0.12, 1.03, 0.9], 'interior', true),
    part('seat cushion', [-0.02, 0.355, 0], [0.62, 0.14, 0.64], 'trim', false),
  ]);
}

/**
 * coffeeTable — timber top, trim legs.
 * Local frame: origin at the floor under its centre.
 */
export function coffeeTableParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('top', [0, 0.37, 0], [0.8, 0.05, 0.5], 'interiorFloor', true),
    part('leg 0', [-0.34, 0.17, -0.19], [0.06, 0.35, 0.06], 'trim', false),
    part('leg 1', [0.34, 0.17, -0.19], [0.06, 0.35, 0.06], 'trim', false),
    part('leg 2', [-0.34, 0.17, 0.19], [0.06, 0.35, 0.06], 'trim', false),
    part('leg 3', [0.34, 0.17, 0.19], [0.06, 0.35, 0.06], 'trim', false),
  ]);
}

/**
 * rug — 8 alternating pile strips with 6 mm shadow gaps (the weave read,
 * with no new material). Local frame: origin at the floor under its centre.
 */
export function rugParts(): readonly InteriorPart[] {
  const strips: InteriorPart[] = [];
  for (let index = 0; index < 8; index += 1) {
    const x0 = -2.1 + index * 0.525 + 0.003;
    strips.push(part(
      `strip ${index}`, [x0 + 0.519 / 2, 0.0225, 0], [0.519, 0.055, 1.7],
      index % 2 === 0 ? 'interior' : 'fence', false,
    ));
  }
  return Object.freeze(strips);
}

/**
 * floorLamp — trim base/shade, chrome pole, warm emissive bulb (the existing
 * ceiling-light instance, driven above the bloom threshold by authorship).
 * Local frame: origin at the floor under its centre.
 */
export function floorLampParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('base', [0, 0.0225, 0], [0.3, 0.055, 0.3], 'trim', false),
    part('pole', [0, 0.8625, 0], [0.06, 1.625, 0.06], 'chrome', false),
    part('shade', [0, 1.775, 0], [0.36, 0.3, 0.36], 'trim', false),
    part('bulb', [0, 1.635, 0], [0.2, 0.18, 0.2], 'warmLight', false),
  ]);
}

/**
 * shelfUnit — a bookcase hutch standing on the existing living bench top
 * (slab top is local y=0), 8 books of varied heights/roles on two shelves.
 */
export function shelfUnitParts(): readonly InteriorPart[] {
  const books: InteriorPart[] = [];
  const lower: ReadonlyArray<readonly [number, number, number, InteriorRole]> = [
    [-0.6, 0.12, 0.24, 'trim'], [-0.44, 0.1, 0.3, 'sign'],
    [-0.28, 0.14, 0.22, 'rubber'], [-0.1, 0.09, 0.28, 'fence'],
  ];
  for (const [index, spec] of lower.entries()) {
    books.push(part(
      `book lower ${index}`, [spec[0]!, 0.04 + spec[2]! / 2, -0.1], [spec[1]!, spec[2]!, 0.2], spec[3]!, false,
    ));
  }
  const upper: ReadonlyArray<readonly [number, number, number, InteriorRole]> = [
    [0.3, 0.11, 0.2, 'fence'], [0.46, 0.09, 0.26, 'trim'],
    [0.6, 0.12, 0.22, 'sign'], [0.74, 0.08, 0.24, 'rubber'],
  ];
  for (const [index, spec] of upper.entries()) {
    books.push(part(
      `book upper ${index}`, [spec[0]!, 0.4 + spec[2]! / 2, -0.1], [spec[1]!, spec[2]!, 0.2], spec[3]!, false,
    ));
  }
  return Object.freeze([
    part('side west', [-0.87, 0.5225, 0], [0.06, 1.055, 0.6], 'interiorFloor', true),
    part('side east', [0.87, 0.5225, 0], [0.06, 1.055, 0.6], 'interiorFloor', true),
    part('bottom shelf', [0, 0.02, 0], [1.68, 0.04, 0.6], 'interiorFloor', false),
    part('mid shelf', [0, 0.385, 0], [1.68, 0.03, 0.6], 'interiorFloor', false),
    part('upper shelf', [0, 0.705, 0], [1.68, 0.03, 0.6], 'interiorFloor', false),
    part('top board', [0, 1.075, 0], [1.8, 0.05, 0.6], 'interiorFloor', true),
    part('back panel', [0, 0.5, -0.285], [1.8, 1.0, 0.03], 'interiorFloor', false),
    ...books,
  ]);
}

/**
 * wallArt — frame + 2x2 abstract cells in the existing saturated roles, hung
 * on the partition's street-side face (local z=0 is the plaster face).
 */
export function wallArtParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('backing', [0, 0.3, 0.02], [1.2, 0.6, 0.04], 'interior', false),
    part('frame west', [-0.615, 0.3, 0.035], [0.03, 0.66, 0.07], 'trim', false),
    part('frame east', [0.615, 0.3, 0.035], [0.03, 0.66, 0.07], 'trim', false),
    part('frame head', [0, 0.615, 0.035], [1.2, 0.03, 0.07], 'trim', false),
    part('frame sill', [0, -0.015, 0.035], [1.2, 0.03, 0.07], 'trim', false),
    part('cell red', [-0.295, 0.155, 0.06], [0.55, 0.25, 0.04], 'applianceRed', false),
    part('cell blue', [0.295, 0.155, 0.06], [0.55, 0.25, 0.04], 'applianceBlue', false),
    part('cell green', [-0.295, 0.445, 0.06], [0.55, 0.25, 0.04], 'planter', false),
    part('cell sign', [0.295, 0.445, 0.06], [0.55, 0.25, 0.04], 'sign', false),
  ]);
}

/**
 * diningTable — timber top on trim legs.
 * Local frame: origin at the floor under its centre.
 */
export function diningTableParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('top', [0, 0.67, 0], [1.4, 0.05, 0.9], 'interiorFloor', true),
    part('leg 0', [-0.635, 0.32, -0.385], [0.07, 0.65, 0.07], 'trim', false),
    part('leg 1', [0.635, 0.32, -0.385], [0.07, 0.65, 0.07], 'trim', false),
    part('leg 2', [-0.635, 0.32, 0.385], [0.07, 0.65, 0.07], 'trim', false),
    part('leg 3', [0.635, 0.32, 0.385], [0.07, 0.65, 0.07], 'trim', false),
  ]);
}

/**
 * chair — one dining chair; `backNorth` puts the backrest on -z (chairs north
 * of the table) or +z. Local frame: origin at the floor under the seat centre.
 */
export function chairParts(backNorth: boolean): readonly InteriorPart[] {
  const backZ = backNorth ? -0.225 : 0.225;
  return Object.freeze([
    part('seat', [0, 0.37, 0], [0.4, 0.05, 0.4], 'interior', false),
    part('backrest', [0, 0.685, backZ], [0.4, 0.58, 0.05], 'interior', false),
    part('leg 0', [-0.165, 0.17, -0.165], [0.05, 0.35, 0.05], 'trim', false),
    part('leg 1', [0.165, 0.17, -0.165], [0.05, 0.35, 0.05], 'trim', false),
    part('leg 2', [-0.165, 0.17, 0.165], [0.05, 0.35, 0.05], 'trim', false),
    part('leg 3', [0.165, 0.17, 0.165], [0.05, 0.35, 0.05], 'trim', false),
  ]);
}

/**
 * workbenchDressing — 3 hand tools and a lidded tin on the garage bench-top
 * slab (local y=0), clear of the existing vice (west end).
 */
export function workbenchDressingParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('tool file', [-0.15, 0.03, -0.51], [0.4, 0.06, 0.08], 'trim', false),
    part('tool wrench', [-0.15, 0.025, -0.12], [0.3, 0.05, 0.06], 'chrome', false),
    part('tool mallet', [0.325, 0.035, -0.705], [0.35, 0.07, 0.09], 'fence', false),
    part('tin', [0.41, 0.0625, 0.7], [0.12, 0.125, 0.12], 'chrome', false),
    part('tin lid', [0.41, 0.145, 0.7], [0.14, 0.04, 0.14], 'trim', false),
  ]);
}

/**
 * rackingBoxes — cardboard boxes and tins on the existing racking boards
 * (local y values are ABSOLUTE heights: boards top out at 0.40/0.88/1.36/1.72
 * and the rack at 1.90, so every box top lands >= 0.06 clear of any
 * overlapping top).
 */
export function rackingBoxesParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('box lower', [0, 0.55, -0.7], [0.4, 0.3, 0.5], 'fence', false),
    part('box mid', [0, 1.005, 0.35], [0.36, 0.25, 0.4], 'fence', false),
    part('tin row', [0, 1.46, 0.85], [0.44, 0.2, 0.4], 'chrome', false),
    part('box top', [0, 1.78, -0.1], [0.5, 0.12, 0.6], 'interior', false),
  ]);
}

/**
 * oilStain — one dark plate on the garage slab in the house-side lane.
 * Local frame: origin 20 mm under the slab top so the plate reads as a stain,
 * not a step (top lands 45 mm over the slab — outside the 0.03 m coplanar
 * window — while the sunk base kills the bottom-face coincidence).
 */
export function oilStainParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('stain', [0, 0.0325, 0], [1.0, 0.065, 0.9], 'rubber', false),
  ]);
}

/** The whole kit, in emission order, with the arena id each group takes. */
export interface InteriorPrefabGroup {
  readonly group: string;
  readonly parts: readonly InteriorPart[];
  readonly anchor: readonly [number, number, number];
}

export const KITCHEN_RUN_TRIANGLES = 24 * INTERIOR_BOX_TRIANGLES;
export const SOFA_TRIANGLES = 8 * INTERIOR_BOX_TRIANGLES;
export const ARMCHAIR_TRIANGLES = 5 * INTERIOR_BOX_TRIANGLES;
export const COFFEE_TABLE_TRIANGLES = 5 * INTERIOR_BOX_TRIANGLES;
export const RUG_TRIANGLES = 8 * INTERIOR_BOX_TRIANGLES;
export const FLOOR_LAMP_TRIANGLES = 4 * INTERIOR_BOX_TRIANGLES;
export const SHELF_UNIT_TRIANGLES = 15 * INTERIOR_BOX_TRIANGLES;
export const WALL_ART_TRIANGLES = 9 * INTERIOR_BOX_TRIANGLES;
export const DINING_TABLE_TRIANGLES = 5 * INTERIOR_BOX_TRIANGLES;
export const CHAIR_TRIANGLES = 6 * INTERIOR_BOX_TRIANGLES;
export const WORKBENCH_DRESSING_TRIANGLES = 5 * INTERIOR_BOX_TRIANGLES;
export const RACKING_BOXES_TRIANGLES = 4 * INTERIOR_BOX_TRIANGLES;
export const OIL_STAIN_TRIANGLES = 1 * INTERIOR_BOX_TRIANGLES;

/** Everything one house carries: 107 boxes = 1,284 tris (budget 14,000). */
export const HOUSE_INTERIOR_BOXES = 107;
export const HOUSE_INTERIOR_TRIANGLES = HOUSE_INTERIOR_BOXES * INTERIOR_BOX_TRIANGLES;
/** Everything one garage carries: 10 boxes = 120 tris (budget 4,000). */
export const GARAGE_INTERIOR_BOXES = 10;
export const GARAGE_INTERIOR_TRIANGLES = GARAGE_INTERIOR_BOXES * INTERIOR_BOX_TRIANGLES;
