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
 *   behaviour changes), budgeted (281 boxes/house, 10/garage — see counts).
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
 * HF-536 NIGHT-MUSE-INTERIORS-2 — upper bedrooms, wall dressing, ground gaps.
 *
 * CONVENTION (10 mm float). Every freestanding part bottoms 0.01 m above its
 * supporting top and every wall-mounted part backs 0.012 m off its wall face.
 * The 10 mm reads as a shadow gap and keeps every same-direction face pair out
 * of the oriented instrument's 0.03 m band; resting contact (opposite normals,
 * FrontSide) is used only for dressing stacked on solids (mattress on the bed
 * solid, kettle on the worktop). This differs from the pass-1 5 mm sink, which
 * cannot satisfy the brief's >= 0.01 m room-clearance gate.
 *
 * HONEST DEVIATIONS (all forced by the 0.03 m coplanar band or the mirror):
 * - rug: 6 striped pile strips (tops 0.05-0.06 proud, kit pattern), not a
 *   single 0.02 m plate — a 0.02 plate's top would sit inside the 0.03 m band
 *   over the floor slab.
 * - picture inner plate: front 0.04+ proud of the wall (0.02 proud of the frame
 *   strips it never overlaps in plan), not 0.005 — 0.005 is inside the band.
 * - wardrobe door strips share the carcass role (`interior`): 0.005 proud in a
 *   second role would be a same-direction finding over 0.9 m2.
 * - desk chair faces along z (chairParts backNorth/backSouth): an x-facing
 *   chair would face the desk in one house and away from it in the other,
 *   because pair() negates x.
 * - placements are ABSOLUTE AUTHORED (anchor [0,0,0] at the call site): every
 *   upper/wall instance is unique, so a local frame buys nothing.
 */

/** Shift chairParts to an absolute authored centre, prefixing suffixes. */
function chairAt(
  prefix: string,
  centre: readonly [number, number, number],
  backNorth: boolean,
): readonly InteriorPart[] {
  return Object.freeze(chairParts(backNorth).map((p) => part(
    `${prefix} ${p.suffix}`,
    [centre[0]! + p.offset[0]!, centre[1]! + p.offset[1]!, centre[2]! + p.offset[2]!],
    p.size,
    p.role,
    p.cast,
  )));
}

/** One row of books on a shelf board top. Specs are [width, height] literals. */
function booksRow(
  prefix: string,
  x0: number,
  baseY: number,
  zc: number,
  row: number,
  specs: ReadonlyArray<readonly [number, number]>,
): readonly InteriorPart[] {
  const roles: readonly InteriorRole[] = ['trim', 'sign', 'rubber', 'fence'];
  const out: InteriorPart[] = [];
  let x = x0;
  for (const [index, spec] of specs.entries()) {
    const [w, h] = [spec[0]!, spec[1]!];
    out.push(part(
      `${prefix} book r${row} ${index}`, [x + w / 2, baseY + h / 2, zc], [w, h, 0.18],
      roles[(row + index) % roles.length]!, false,
    ));
    x += w + 0.015;
  }
  return Object.freeze(out);
}

/** Upper BACK bedroom: dressing for the bed solid + bedside + wardrobe + desk + chair + rug + bookshelf. 52 boxes. */
export function upperBackBedroomParts(): readonly InteriorPart[] {
  return Object.freeze([
    // Dressing on the existing bed solid (top 3.85): resting contact.
    part('bed mattress', [-0.5, 3.94, -21.4], [1.7, 0.18, 1.7], 'interior', false),
    part('bed pillow west', [-0.9, 4.09, -21.975], [0.6, 0.12, 0.35], 'trim', false),
    part('bed pillow east', [-0.1, 4.09, -21.975], [0.6, 0.12, 0.35], 'trim', false),
    part('bed throw', [-0.5, 4.06, -20.75], [1.7, 0.06, 0.4], 'applianceRed', false),
    // Bedside table + lamp, west of the bed foot.
    part('bedside carcass', [-1.675, 3.56, -20.075], [0.45, 0.5, 0.45], 'interior', false),
    part('bedside top', [-1.675, 3.83, -20.075], [0.5, 0.04, 0.5], 'interiorFloor', false),
    part('bedside lamp base', [-1.675, 3.885, -20.075], [0.16, 0.05, 0.16], 'trim', false),
    part('bedside lamp stem', [-1.675, 4.05, -20.075], [0.05, 0.28, 0.05], 'chrome', false),
    part('bedside lamp shade', [-1.675, 4.29, -20.075], [0.24, 0.2, 0.24], 'trim', false),
    // Wardrobe against the east wall: carcass + same-role door strips + chrome handles.
    part('wardrobe carcass', [3.58, 4.31, -17.9], [0.6, 2.0, 1.2], 'interior', true),
    part('wardrobe door north', [3.285, 4.31, -18.2], [0.02, 1.8, 0.5], 'interior', false),
    part('wardrobe door south', [3.285, 4.31, -17.6], [0.02, 1.8, 0.5], 'interior', false),
    part('wardrobe handle north', [3.255, 4.3, -17.92], [0.04, 0.12, 0.04], 'chrome', false),
    part('wardrobe handle south', [3.255, 4.3, -17.88], [0.04, 0.12, 0.04], 'chrome', false),
    // Desk against the east wall + z-facing chair north of it.
    part('desk top', [3.53, 4.025, -19.7], [0.64, 0.05, 1.2], 'interiorFloor', false),
    part('desk leg south', [3.53, 3.655, -20.2], [0.6, 0.69, 0.05], 'trim', false),
    ...chairAt('desk chair', [3.53, 3.315, -18.75], false),
    part('desk leg north', [3.53, 3.655, -19.2], [0.6, 0.69, 0.05], 'trim', false),
    // Rug: 6 pile strips, tops 0.06 proud of the upper slab.
    ...[0, 1, 2, 3, 4, 5].map((index) => part(
      `rug strip ${index}`, [0.5 + index * 0.312 + 0.15, 3.335, -18.1], [0.3, 0.05, 1.5],
      index % 2 === 0 ? 'interior' : 'fence', false,
    )),
    // Bookshelf against the partition south face: sides/top/bottom/back + 4 shelves + 14 books.
    part('shelf side west', [-0.53, 4.26, -16.85], [0.04, 1.9, 0.3], 'interiorFloor', true),
    part('shelf side east', [0.93, 4.26, -16.85], [0.04, 1.9, 0.3], 'interiorFloor', true),
    part('shelf bottom', [0.2, 3.33, -16.85], [1.5, 0.04, 0.3], 'interiorFloor', false),
    part('shelf top', [0.2, 5.19, -16.85], [1.5, 0.04, 0.3], 'interiorFloor', true),
    part('shelf back', [0.2, 4.26, -16.99], [1.5, 1.9, 0.02], 'interiorFloor', false),
    part('shelf board 0', [0.2, 3.735, -16.85], [1.42, 0.03, 0.26], 'interiorFloor', false),
    part('shelf board 1', [0.2, 4.135, -16.85], [1.42, 0.03, 0.26], 'interiorFloor', false),
    part('shelf board 2', [0.2, 4.535, -16.85], [1.42, 0.03, 0.26], 'interiorFloor', false),
    part('shelf board 3', [0.2, 4.875, -16.85], [1.42, 0.03, 0.26], 'interiorFloor', false),
    ...booksRow('shelf', -0.51, 3.35, -16.85, 0, [[0.10, 0.30], [0.12, 0.24], [0.09, 0.28], [0.13, 0.22]]),
    ...booksRow('shelf', -0.51, 3.75, -16.85, 1, [[0.11, 0.26], [0.09, 0.30], [0.12, 0.20], [0.10, 0.24]]),
    ...booksRow('shelf', -0.51, 4.15, -16.85, 2, [[0.12, 0.28], [0.10, 0.22], [0.13, 0.26]]),
    ...booksRow('shelf', -0.51, 4.55, -16.85, 3, [[0.10, 0.24], [0.12, 0.30], [0.09, 0.20]]),
  ]);
}

/** Upper FRONT bedroom: freestanding bed + bedside + wardrobe + desk + chair + rug + bookshelf. 53 boxes. */
export function upperFrontBedroomParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('bed base', [0.4, 3.46, -14.4], [1.8, 0.3, 2.0], 'interior', true),
    part('bed mattress', [0.4, 3.71, -14.4], [1.7, 0.2, 1.9], 'trim', false),
    part('bed pillow west', [0.0, 3.87, -15.125], [0.6, 0.12, 0.35], 'trim', false),
    part('bed pillow east', [0.8, 3.87, -15.125], [0.6, 0.12, 0.35], 'trim', false),
    part('bed throw', [0.4, 3.84, -13.6], [1.7, 0.06, 0.4], 'applianceBlue', false),
    part('bedside carcass', [1.725, 3.56, -15.175], [0.45, 0.5, 0.45], 'interior', false),
    part('bedside top', [1.725, 3.83, -15.175], [0.5, 0.04, 0.5], 'interiorFloor', false),
    part('bedside lamp base', [1.725, 3.885, -15.175], [0.16, 0.05, 0.16], 'trim', false),
    part('bedside lamp stem', [1.725, 4.05, -15.175], [0.05, 0.28, 0.05], 'chrome', false),
    part('bedside lamp shade', [1.725, 4.29, -15.175], [0.24, 0.2, 0.24], 'trim', false),
    part('wardrobe carcass', [3.58, 4.31, -14.2], [0.6, 2.0, 1.2], 'interior', true),
    part('wardrobe door north', [3.285, 4.31, -14.5], [0.02, 1.8, 0.5], 'interior', false),
    part('wardrobe door south', [3.285, 4.31, -13.9], [0.02, 1.8, 0.5], 'interior', false),
    part('wardrobe handle north', [3.255, 4.3, -14.22], [0.04, 0.12, 0.04], 'chrome', false),
    part('wardrobe handle south', [3.255, 4.3, -14.18], [0.04, 0.12, 0.04], 'chrome', false),
    part('desk top', [-6.03, 4.025, -12.9], [0.7, 0.05, 1.2], 'interiorFloor', false),
    part('desk leg south', [-6.03, 3.655, -13.4], [0.6, 0.69, 0.05], 'trim', false),
    part('desk leg north', [-6.03, 3.655, -12.4], [0.6, 0.69, 0.05], 'trim', false),
    ...chairAt('desk chair', [-6.03, 3.315, -11.9], false),
    ...[0, 1, 2, 3, 4, 5].map((index) => part(
      `rug strip ${index}`, [-3.43 + index * 0.312 + 0.15, 3.335, -13.5], [0.3, 0.05, 1.5],
      index % 2 === 0 ? 'interior' : 'fence', false,
    )),
    part('shelf side west', [1.32, 4.26, -16.15], [0.04, 1.9, 0.3], 'interiorFloor', true),
    part('shelf side east', [2.78, 4.26, -16.15], [0.04, 1.9, 0.3], 'interiorFloor', true),
    part('shelf bottom', [2.05, 3.33, -16.15], [1.5, 0.04, 0.3], 'interiorFloor', false),
    part('shelf top', [2.05, 5.19, -16.15], [1.5, 0.04, 0.3], 'interiorFloor', true),
    part('shelf back', [2.05, 4.26, -16.29], [1.5, 1.9, 0.02], 'interiorFloor', false),
    part('shelf board 0', [2.05, 3.735, -16.15], [1.42, 0.03, 0.26], 'interiorFloor', false),
    part('shelf board 1', [2.05, 4.135, -16.15], [1.42, 0.03, 0.26], 'interiorFloor', false),
    part('shelf board 2', [2.05, 4.535, -16.15], [1.42, 0.03, 0.26], 'interiorFloor', false),
    part('shelf board 3', [2.05, 4.875, -16.15], [1.42, 0.03, 0.26], 'interiorFloor', false),
    ...booksRow('shelf', 1.34, 3.35, -16.15, 0, [[0.10, 0.30], [0.12, 0.24], [0.09, 0.28], [0.13, 0.22]]),
    ...booksRow('shelf', 1.34, 3.75, -16.15, 1, [[0.11, 0.26], [0.09, 0.30], [0.12, 0.20], [0.10, 0.24]]),
    ...booksRow('shelf', 1.34, 4.15, -16.15, 2, [[0.12, 0.28], [0.10, 0.22], [0.13, 0.26]]),
    ...booksRow('shelf', 1.34, 4.55, -16.15, 3, [[0.10, 0.24], [0.12, 0.30], [0.09, 0.20]]),
  ]);
}

/**
 * skirtingParts — 0.10 m strips, 0.012 m proud of every interior wall base the
 * ground kit left bare (ground east/front/back; all upper walls). Ground
 * partition faces and the ground west wall already carry baseboards; doubling
 * them would race the existing strips, so they are deliberately not repeated.
 * Wall runs stop 0.02 short of the side linings (butt joints, no corner overlap).
 * 20 boxes.
 */
export function skirtingParts(): readonly InteriorPart[] {
  const g = 0.14;
  const u = 3.36;
  return Object.freeze([
    part('ground east back south', [3.908, g, -21.134], [0.02, 0.10, 3.028], 'trim', false),
    part('ground east back north', [3.908, g, -17.225], [0.02, 0.10, 1.11], 'trim', false),
    part('ground east front', [3.908, g, -13.335], [0.02, 0.10, 5.99], 'trim', false),
    part('ground front west', [-4.29, g, -10.342], [4.24, 0.10, 0.02], 'trim', false),
    part('ground front east', [1.784, g, -10.342], [4.228, 0.10, 0.02], 'trim', false),
    part('ground back west', [-4.29, g, -22.658], [4.24, 0.10, 0.02], 'trim', false),
    part('ground back east', [1.79, g, -22.658], [4.24, 0.10, 0.02], 'trim', false),
    part('upper west front', [-6.408, u, -13.335], [0.02, 0.10, 5.99], 'trim', false),
    part('upper west back', [-6.408, u, -22.045], [0.02, 0.10, 1.23], 'trim', false),
    part('upper east front', [3.908, u, -13.335], [0.02, 0.10, 5.99], 'trim', false),
    part('upper east back', [3.908, u, -19.665], [0.02, 0.10, 5.99], 'trim', false),
    part('upper partition north west', [-4.2, u, -16.328], [1.16, 0.10, 0.02], 'trim', false),
    part('upper partition north east', [1.065, u, -16.328], [5.69, 0.10, 0.02], 'trim', false),
    part('upper partition south west', [-4.2, u, -16.672], [1.16, 0.10, 0.02], 'trim', false),
    part('upper partition south east', [1.065, u, -16.672], [5.69, 0.10, 0.02], 'trim', false),
    part('upper front west', [-4.634, u, -10.322], [3.528, 0.10, 0.02], 'trim', false),
    part('upper front east', [2.134, u, -10.322], [3.528, 0.10, 0.02], 'trim', false),
    part('upper back west', [-5.159, u, -22.678], [2.478, 0.10, 0.02], 'trim', false),
    part('upper back mid', [-0.675, u, -22.678], [2.81, 0.10, 0.02], 'trim', false),
    part('upper back east', [3.59, u, -22.678], [0.64, 0.10, 0.02], 'trim', false),
  ]);
}

/** One 0.5 x 0.4 m picture: 4 frame strips + a canvas plate. Frame never overlaps the canvas in plan. */
function pictureAt(
  prefix: string,
  wall: 'n' | 's' | 'e' | 'w',
  au: number,
  av: number,
  face: number,
): InteriorPart[] {
  // Frame centre stands 0.042 off the face (0.012 gap + 0.03 half-depth);
  // the canvas centre 0.032 off it (0.012 gap + 0.02 half-depth), so the
  // canvas front lands 0.052 proud of the plaster and 0.02 behind the frame.
  const roomSign = wall === 'n' || wall === 'w' ? 1 : -1;
  const frameC = face + roomSign * 0.042;
  const canvasC = face + roomSign * 0.032;
  const frame = (suffix: string, c0: number, c1: number, s0: number, s1: number): InteriorPart => {
    const offset: readonly [number, number, number] = wall === 'n' || wall === 's'
      ? [c0, c1, frameC] : [frameC, c1, c0];
    const size: readonly [number, number, number] = wall === 'n' || wall === 's'
      ? [s0, s1, 0.06] : [0.06, s1, s0];
    return part(`${prefix} ${suffix}`, offset, size, 'trim', false);
  };
  const canvasOffset: readonly [number, number, number] = wall === 'n' || wall === 's'
    ? [au, av, canvasC] : [canvasC, av, au];
  const canvasSize: readonly [number, number, number] = wall === 'n' || wall === 's'
    ? [0.38, 0.28, 0.04] : [0.04, 0.28, 0.38];
  const sign: InteriorRole = 'sign';
  return [
    frame('frame top', au, av + 0.17, 0.5, 0.06),
    frame('frame bottom', au, av - 0.17, 0.5, 0.06),
    frame('frame left', au - 0.22, av, 0.06, 0.28),
    frame('frame right', au + 0.22, av, 0.06, 0.28),
    part(`${prefix} canvas`, canvasOffset, canvasSize, sign, false),
  ];
}

/**
 * pendantParts — ceiling rose + rod + shade + warm bulb at each room centre.
 * Back-room centres are occupied by the existing ceiling housings, so those
 * two hang offset (documented, not centred). 16 boxes.
 */
export function pendantParts(): readonly InteriorPart[] {
  const drop = (
    prefix: string, x: number, z: number, ceil: number,
  ): readonly InteriorPart[] => Object.freeze([
    part(`${prefix} rose`, [x, ceil - 0.04, z], [0.3, 0.06, 0.3], 'trim', false),
    part(`${prefix} rod`, [x, ceil - 0.325, z], [0.04, 0.53, 0.04], 'chrome', false),
    part(`${prefix} shade`, [x, ceil - 0.715, z], [0.36, 0.25, 0.36], 'trim', false),
    part(`${prefix} bulb`, [x, ceil - 0.89, z], [0.12, 0.1, 0.12], 'warmLight', false),
  ]);
  return Object.freeze([
    ...drop('kitchen pendant', -1.25, -13.34, 3.0),
    ...drop('living pendant', -2.9, -19.0, 3.0),
    ...drop('upper front pendant', 0.3, -14.3, 6.2),
    ...drop('upper back pendant', 0.5, -18.3, 6.2),
  ]);
}

/**
 * pictureParts — one picture per room (ground kitchen, ground living, upper
 * front, upper back). Frame backs stand 0.012 off the plaster; the canvas
 * front stands 0.052 proud of it, 0.02 behind the frame strips it butts
 * against without overlapping. 20 boxes.
 */
export function pictureParts(): readonly InteriorPart[] {
  return Object.freeze([
    // Partition north face (-16.35), back lining north face (-22.68),
    // upper front wall south face (-10.30), upper east lining west face (3.93).
    ...pictureAt('kitchen picture', 'n', 2.8, 1.7, -16.35),
    ...pictureAt('living picture', 'n', -2.65, 1.7, -22.68),
    ...pictureAt('upper front picture', 's', 1.75, 4.9, -10.30),
    ...pictureAt('upper back picture', 'e', -20.55, 5.2, 3.93),
  ]);
}

/**
 * switchParts — one plate beside each house doorway (front, back, internal
 * ground, internal upper, garage link, balcony). The ground living switch the
 * arena already carries is not repeated. 6 boxes.
 */
export function switchParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('switch front door', [0.0, 1.25, -10.3445], [0.09, 0.14, 0.025], 'trim', false),
    part('switch back door', [0.0, 1.25, -22.6555], [0.09, 0.14, 0.025], 'trim', false),
    part('switch internal ground', [-1.5, 1.25, -16.3255], [0.09, 0.14, 0.025], 'trim', false),
    part('switch internal upper', [-1.5, 4.55, -16.6745], [0.09, 0.14, 0.025], 'trim', false),
    part('switch garage link', [3.9055, 1.25, -17.5], [0.025, 0.14, 0.09], 'trim', false),
    part('switch balcony', [-1.8, 4.55, -22.6755], [0.09, 0.14, 0.025], 'trim', false),
  ]);
}

/** tvUnitParts — low unit + dark screen against the living-room east wall. 2 boxes. */
export function tvUnitParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('tv unit', [3.655, 0.315, -21.27], [0.45, 0.45, 0.7], 'interior', false),
    part('tv screen', [3.63, 0.84, -21.27], [0.06, 0.6, 0.7], 'rubber', false),
  ]);
}

/** fridgeParts — tall carcass + same-role door strip + chrome handle. 3 boxes. */
export function fridgeParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('fridge carcass', [3.53, 1.04, -14.15], [0.7, 1.9, 0.7], 'interior', true),
    part('fridge door', [3.185, 1.04, -14.15], [0.02, 1.7, 0.6], 'interior', false),
    part('fridge handle', [3.15, 1.1, -13.95], [0.05, 0.3, 0.05], 'chrome', false),
  ]);
}

/** kettlePairParts — kettle + toaster on the kitchen worktop (top 1.045). 2 boxes. */
export function kettlePairParts(): readonly InteriorPart[] {
  return Object.freeze([
    part('kettle', [-4.7, 1.155, -12.81], [0.18, 0.22, 0.18], 'chrome', false),
    part('toaster', [-4.35, 1.135, -12.81], [0.26, 0.18, 0.16], 'trim', false),
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
export const UPPER_BACK_BEDROOM_TRIANGLES = 52 * INTERIOR_BOX_TRIANGLES;
export const UPPER_FRONT_BEDROOM_TRIANGLES = 53 * INTERIOR_BOX_TRIANGLES;
export const SKIRTING_TRIANGLES = 20 * INTERIOR_BOX_TRIANGLES;
export const PICTURES_TRIANGLES = 20 * INTERIOR_BOX_TRIANGLES;
export const PENDANTS_TRIANGLES = 16 * INTERIOR_BOX_TRIANGLES;
export const SWITCHES_TRIANGLES = 6 * INTERIOR_BOX_TRIANGLES;
export const TV_UNIT_TRIANGLES = 2 * INTERIOR_BOX_TRIANGLES;
export const FRIDGE_TRIANGLES = 3 * INTERIOR_BOX_TRIANGLES;
export const KETTLE_PAIR_TRIANGLES = 2 * INTERIOR_BOX_TRIANGLES;

/** Interiors-2 adds 174 boxes = 2,088 tris per house (brief budget 3,200). */
export const HOUSE_INTERIORS2_BOXES = 174;
export const HOUSE_INTERIORS2_TRIANGLES = HOUSE_INTERIORS2_BOXES * INTERIOR_BOX_TRIANGLES;
export const HOUSE_INTERIORS2_BUDGET = 3200;

/** Everything one house carries: 281 boxes = 3,372 tris (107 pass-1 + 174 pass-2, budget 14,000). */
export const HOUSE_INTERIOR_BOXES = 281;
export const HOUSE_INTERIOR_TRIANGLES = HOUSE_INTERIOR_BOXES * INTERIOR_BOX_TRIANGLES;
/** Everything one garage carries: 10 boxes = 120 tris (budget 4,000). */
export const GARAGE_INTERIOR_BOXES = 10;
export const GARAGE_INTERIOR_TRIANGLES = GARAGE_INTERIOR_BOXES * INTERIOR_BOX_TRIANGLES;
