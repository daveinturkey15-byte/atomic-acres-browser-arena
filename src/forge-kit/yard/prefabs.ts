/**
 * forge-kit/yard/prefabs.ts — HF-536 (NIGHT-GEMINI4)
 *
 * Presentation prefabs for Nuke Town residential back yards:
 * 1. wheelieBin() — body, lid (tinted by role: blue or green), wheels, axle, handle
 * 2. mailboxPost() — timber post, metal mailbox, door trim, red flag
 * 3. gardenChair() — timber seat & back, trim legs
 * 4. gardenTable() — timber slatted top, trim frame & legs
 * 5. hoseReel() — mounting frame, drum, coiled rubber hose, nozzle, crank
 * 6. washingLine() — 2 timber T-posts, cord line, 3 pegged cloth sheets
 * 7. sandPitToys() — bucket, spade, ball
 * 8. planterWithPlant() — planter trough/pot + 3 foliage leaf lobes
 *
 * Each prefab:
 * - <= 120 triangles (each box is 12 triangles, <= 10 boxes per prefab)
 * - existing roles only (no new materials, uniforms, or shader graphs)
 * - presentationOnly: true, solid: false, shots: false
 * - cast: true for bins and table only; false for clutter
 * - propId per prefab for declutter / prop accounting
 */

export type YardRole =
  | 'painted-metal'
  | 'timber'
  | 'trim'
  | 'chrome'
  | 'interior'
  | 'foliage'
  | 'lawn'
  | 'rubber'
  | 'painted-red'
  | 'painted-blue'
  | 'painted-green'
  | 'planter';

export const YARD_ROLES = Object.freeze([
  'painted-metal',
  'timber',
  'trim',
  'chrome',
  'interior',
  'foliage',
  'lawn',
  'rubber',
  'painted-red',
  'painted-blue',
  'painted-green',
  'planter',
] as const);

export interface YardPart {
  readonly suffix: string;
  readonly offset: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly role: YardRole;
  readonly cast: boolean;
  readonly rotation?: readonly [number, number, number];
}

export const YARD_BOX_TRIANGLES = 12;

const part = (
  suffix: string,
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  role: YardRole,
  cast: boolean,
  rotation?: readonly [number, number, number],
): YardPart => Object.freeze({
  suffix,
  offset,
  size,
  role,
  cast,
  ...(rotation ? { rotation } : {}),
});

/**
 * 1. wheelieBin — domestic two-wheeled rubbish/recycling bin.
 * Local frame: origin at ground centre under the bin.
 * Height ~0.96 m, width 0.52 m, depth 0.56 m.
 * 6 boxes = 72 triangles (<= 120 tris).
 * cast: true.
 */
export function wheelieBin(lidColor: 'blue' | 'green' = 'blue'): readonly YardPart[] {
  const lidRole: YardRole = lidColor === 'blue' ? 'painted-blue' : 'painted-green';
  return Object.freeze([
    // Main bin body: tapered read with main container box
    part('body', [0, 0.46, 0], [0.46, 0.82, 0.46], 'rubber', true),
    // Hinged top lid
    part('lid', [0, 0.89, 0.01], [0.50, 0.05, 0.50], lidRole, true),
    // Rear handle bar
    part('handle', [0, 0.86, -0.25], [0.38, 0.04, 0.06], 'trim', true),
    // Rear axle
    part('axle', [0, 0.10, -0.20], [0.52, 0.03, 0.03], 'chrome', true),
    // Left wheel
    part('wheel left', [-0.25, 0.10, -0.20], [0.06, 0.18, 0.18], 'rubber', true),
    // Right wheel
    part('wheel right', [0.25, 0.10, -0.20], [0.06, 0.18, 0.18], 'rubber', true),
  ]);
}
export const WHEELIE_BIN_TRIANGLES = 6 * YARD_BOX_TRIANGLES;

/**
 * 2. mailboxPost — American suburban curbside/gate mailbox on timber post.
 * Local frame: origin at ground centre under post.
 * Height 1.34 m, width 0.32 m, depth 0.48 m.
 * 5 boxes = 60 triangles (<= 120 tris).
 * cast: false.
 */
export function mailboxPost(): readonly YardPart[] {
  return Object.freeze([
    // Vertical timber post
    part('post', [0, 0.52, 0], [0.12, 1.04, 0.12], 'timber', false),
    // Mailbox metal housing sitting atop post
    part('box', [0, 1.16, 0.06], [0.26, 0.24, 0.46], 'painted-metal', false),
    // Front door trim / bevel
    part('door', [0, 1.16, 0.30], [0.24, 0.22, 0.03], 'trim', false),
    // Red notification flag arm
    part('flag arm', [0.14, 1.20, 0.08], [0.02, 0.18, 0.03], 'painted-red', false),
    // Red notification flag tab
    part('flag tab', [0.14, 1.27, -0.01], [0.02, 0.08, 0.12], 'painted-red', false),
  ]);
}
export const MAILBOX_POST_TRIANGLES = 5 * YARD_BOX_TRIANGLES;

/**
 * 3. gardenChair — domestic timber and painted patio chair.
 * Local frame: origin at floor/ground under seat centre.
 * Height 0.82 m, width 0.54 m, depth 0.52 m.
 * 6 boxes = 72 triangles (<= 120 tris).
 * cast: false.
 */
export function gardenChair(): readonly YardPart[] {
  return Object.freeze([
    // Slat seat
    part('seat', [0, 0.42, 0], [0.50, 0.04, 0.46], 'timber', false),
    // Slat backrest
    part('back', [0, 0.65, -0.21], [0.48, 0.38, 0.04], 'timber', false),
    // Front left leg
    part('leg front left', [-0.22, 0.20, 0.19], [0.04, 0.40, 0.04], 'trim', false),
    // Front right leg
    part('leg front right', [0.22, 0.20, 0.19], [0.04, 0.40, 0.04], 'trim', false),
    // Back left upright
    part('leg back left', [-0.22, 0.40, -0.21], [0.04, 0.80, 0.04], 'trim', false),
    // Back right upright
    part('leg back right', [0.22, 0.40, -0.21], [0.04, 0.80, 0.04], 'trim', false),
  ]);
}
export const GARDEN_CHAIR_TRIANGLES = 6 * YARD_BOX_TRIANGLES;

/**
 * 4. gardenTable — domestic timber slatted coffee / garden table.
 * Local frame: origin at floor/ground under table centre.
 * Height 0.68 m, width 0.90 m, depth 0.90 m.
 * 6 boxes = 72 triangles (<= 120 tris).
 * cast: true.
 */
export function gardenTable(): readonly YardPart[] {
  return Object.freeze([
    // Table top
    part('top', [0, 0.66, 0], [0.90, 0.04, 0.90], 'timber', true),
    // Under-frame apron
    part('apron', [0, 0.62, 0], [0.76, 0.05, 0.76], 'trim', true),
    // 4 legs
    part('leg nw', [-0.38, 0.31, -0.38], [0.06, 0.62, 0.06], 'trim', true),
    part('leg ne', [0.38, 0.31, -0.38], [0.06, 0.62, 0.06], 'trim', true),
    part('leg sw', [-0.38, 0.31, 0.38], [0.06, 0.62, 0.06], 'trim', true),
    part('leg se', [0.38, 0.31, 0.38], [0.06, 0.62, 0.06], 'trim', true),
  ]);
}
export const GARDEN_TABLE_TRIANGLES = 6 * YARD_BOX_TRIANGLES;

/**
 * 5. hoseReel — freestanding/wall garden hose reel cart.
 * Local frame: origin at ground under drum centre.
 * Height 0.60 m, width 0.44 m, depth 0.36 m.
 * 5 boxes = 60 triangles (<= 120 tris).
 * cast: false.
 */
export function hoseReel(): readonly YardPart[] {
  return Object.freeze([
    // Frame base / skid
    part('frame', [0, 0.28, 0], [0.42, 0.56, 0.34], 'trim', false),
    // Spool drum
    part('drum', [0, 0.30, 0], [0.26, 0.28, 0.24], 'painted-green', false),
    // Wound hose body
    part('hose coil', [0, 0.30, 0], [0.32, 0.32, 0.20], 'rubber', false),
    // Winder handle
    part('winder', [0.23, 0.30, 0.06], [0.08, 0.04, 0.04], 'chrome', false),
    // Brass/chrome nozzle resting on side
    part('nozzle', [-0.20, 0.45, 0], [0.04, 0.16, 0.04], 'chrome', false),
  ]);
}
export const HOSE_REEL_TRIANGLES = 5 * YARD_BOX_TRIANGLES;

/**
 * 6. washingLine — suburban rotary / two-post washing line with pegged laundry sheets.
 * Local frame: origin at ground midway between the two posts.
 * Posts at x = -1.50 and +1.50 m (3.0 m span).
 * 8 boxes = 96 triangles (<= 120 tris).
 * cast: false.
 */
export function washingLine(): readonly YardPart[] {
  return Object.freeze([
    // West post
    part('post west', [-1.50, 0.95, 0], [0.08, 1.90, 0.08], 'timber', false),
    // West crossbar T-head
    part('head west', [-1.50, 1.88, 0], [0.06, 0.06, 0.60], 'timber', false),
    // East post
    part('post east', [1.50, 0.95, 0], [0.08, 1.90, 0.08], 'timber', false),
    // East crossbar T-head
    part('head east', [1.50, 1.88, 0], [0.06, 0.06, 0.60], 'timber', false),
    // Clothesline cord (thin box connecting posts)
    part('cord', [0, 1.88, 0], [2.96, 0.015, 0.015], 'trim', false),
    // Pegged hanging sheet 1
    part('sheet left', [-0.90, 1.45, 0], [0.65, 0.82, 0.02], 'interior', false),
    // Pegged hanging sheet 2
    part('sheet centre', [0, 1.42, 0], [0.72, 0.88, 0.02], 'interior', false),
    // Pegged hanging sheet 3
    part('sheet right', [0.90, 1.46, 0], [0.65, 0.80, 0.02], 'interior', false),
  ]);
}
export const WASHING_LINE_TRIANGLES = 8 * YARD_BOX_TRIANGLES;

/**
 * 7. sandPitToys — children's play toys inside the sand pit (bucket, spade, ball).
 * Local frame: origin at the sand surface (top of sand y=0).
 * 5 boxes = 60 triangles (<= 120 tris).
 * cast: false.
 */
export function sandPitToys(): readonly YardPart[] {
  return Object.freeze([
    // Bucket main bucket body
    part('bucket body', [-0.35, 0.10, -0.15], [0.20, 0.20, 0.20], 'painted-red', false),
    // Bucket rim / lip
    part('bucket rim', [-0.35, 0.19, -0.15], [0.22, 0.03, 0.22], 'painted-red', false),
    // Spade shaft
    part('spade handle', [0.05, 0.06, -0.05], [0.03, 0.28, 0.03], 'painted-blue', false),
    // Spade blade stuck angled in sand
    part('spade blade', [0.05, 0.04, -0.22], [0.12, 0.10, 0.02], 'painted-blue', false),
    // Play ball
    part('ball', [0.35, 0.09, 0.15], [0.18, 0.18, 0.18], 'painted-blue', false),
  ]);
}
export const SAND_PIT_TOYS_TRIANGLES = 5 * YARD_BOX_TRIANGLES;

/**
 * 8. planterWithPlant — garden planter trough with decorative foliage lobes.
 * Local frame: origin at floor/ground under planter centre.
 * Height 0.65 m, width 0.48 m, depth 0.48 m.
 * 5 boxes = 60 triangles (<= 120 tris).
 * cast: false.
 */
export function planterWithPlant(): readonly YardPart[] {
  return Object.freeze([
    // Planter pot trough
    part('pot', [0, 0.20, 0], [0.46, 0.40, 0.46], 'planter', false),
    // Pot rim collar
    part('rim', [0, 0.39, 0], [0.50, 0.04, 0.50], 'trim', false),
    // Foliage lobe 1 (centre top)
    part('leaf lobe centre', [0, 0.52, 0], [0.36, 0.24, 0.36], 'foliage', false),
    // Foliage lobe 2 (spread north-west)
    part('leaf lobe nw', [-0.10, 0.48, -0.08], [0.26, 0.18, 0.24], 'foliage', false),
    // Foliage lobe 3 (spread south-east)
    part('leaf lobe se', [0.10, 0.46, 0.08], [0.26, 0.16, 0.24], 'foliage', false),
  ]);
}
export const PLANTER_WITH_PLANT_TRIANGLES = 5 * YARD_BOX_TRIANGLES;
export interface YardPropPlacement {
  readonly propId: string;
  readonly anchor: readonly [number, number, number];
  readonly parts: readonly YardPart[];
}

export function yardPropPlacements(): readonly YardPropPlacement[] {
  return Object.freeze([
    Object.freeze({ propId: 'yard domestic bin blue', anchor: [2.0, 0, -24.5] as const, parts: wheelieBin('blue') }),
    Object.freeze({ propId: 'yard domestic bin green', anchor: [2.7, 0, -24.5] as const, parts: wheelieBin('green') }),
    Object.freeze({ propId: 'yard mailbox post', anchor: [4.0, 0, -35.2] as const, parts: mailboxPost() }),
    Object.freeze({ propId: 'yard garden table', anchor: [-4.6, 0, -28.0] as const, parts: gardenTable() }),
    Object.freeze({ propId: 'yard garden chair 0', anchor: [-4.6, 0, -27.2] as const, parts: gardenChair() }),
    Object.freeze({ propId: 'yard garden chair 1', anchor: [-4.6, 0, -28.8] as const, parts: gardenChair() }),
    Object.freeze({ propId: 'yard hose reel', anchor: [1.5, 0, -23.3] as const, parts: hoseReel() }),
    Object.freeze({ propId: 'yard washing line', anchor: [-0.5, 0, -31.0] as const, parts: washingLine() }),
    Object.freeze({ propId: 'yard sand pit toys', anchor: [16.2, 0.25, -28.4] as const, parts: sandPitToys() }),
    Object.freeze({ propId: 'yard planter with plant 0', anchor: [-9.5, 0, -23.8] as const, parts: planterWithPlant() }),
    Object.freeze({ propId: 'yard planter with plant 1', anchor: [7.0, 0, -35.2] as const, parts: planterWithPlant() }),
  ]);
}
