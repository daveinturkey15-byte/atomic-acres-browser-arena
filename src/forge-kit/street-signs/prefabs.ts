/**
 * forge-kit/street-signs/prefabs.ts — HF-536 (NIGHT-GEMINI5)
 *
 * Street signage and furniture kit for Nuke Town verges and turning-head kerb line:
 * 1. stopSign() — 2.2 m galvanised pole, red octagon plate, 8-box white border, white bar.
 * 2. streetNameBlade() — 2.4 m pole, green blade, 4-box white edge strip, 3 white word boxes.
 * 3. speedRoundel() — 2.0 m pole, white disc, 8-box red ring, 2 black digit boxes.
 * 4. chevronBoard() — two 0.9 m posts, black plate, 3 white chevrons (2 slanted boxes each).
 * 5. bollard() — 0.9 m high 8-gon, black with two white bands (0.005 m proud).
 * 6. benchAndBin() — 5-slat 1.5 m timber bench with cast-iron ends + 0.4 m litter bin.
 * 7. fireHydrant() — 0.25 m dia 0.7 m body, two side nozzles, dome cap, base flange.
 *
 * Rules:
 * - Every prefab <= 160 triangles (all boxes, 12 tris/box).
 * - Total triangles <= 1,600 per side.
 * - Every border / lettering box is 0.005-0.01 m proud of its host plate (no coplanar faces).
 * - Existing roles only, zero new materials, zero maps.
 * - Presentation-only: solid: false, shots: false.
 */

export type StreetSignRole =
  | 'trim'           // White paint: borders, lettering, disc, bands
  | 'chrome'         // Galvanised metal: sign poles
  | 'painted-red'    // Red paint: stop sign plate, speed ring, hydrant
  | 'painted-green'  // Green paint: street name blade
  | 'rubber'         // Black paint / cast-iron: chevron plate, digits, bollard body, bench ends
  | 'timber'         // Stained wood: bench slats
  | 'painted-metal'; // Grey/painted metal: litter bin body

export const STREET_SIGN_ROLES = Object.freeze([
  'trim',
  'chrome',
  'painted-red',
  'painted-green',
  'rubber',
  'timber',
  'painted-metal',
] as const);

export interface StreetSignPart {
  readonly suffix: string;
  readonly offset: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly role: StreetSignRole;
  readonly cast: boolean;
  readonly rotation?: readonly [number, number, number];
}

export const STREET_SIGN_BOX_TRIANGLES = 12;

const part = (
  suffix: string,
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  role: StreetSignRole,
  cast: boolean,
  rotation?: readonly [number, number, number],
): StreetSignPart => Object.freeze({
  suffix,
  offset,
  size,
  role,
  cast,
  ...(rotation ? { rotation } : {}),
});

/**
 * 1. stopSign — 0.075 m galvanised pole (2.2 m), 0.60 m red octagon plate (0.02 m thick),
 * white border ring of 8 thin boxes (0.04 m wide, 0.005 m proud), white bar box (0.36 x 0.09 m, 0.005 m proud).
 * 12 boxes = 144 triangles (budget <= 160).
 */
export function stopSign(): readonly StreetSignPart[] {
  const poleH = 2.2;
  const plateY = poleH - 0.30; // Centre plate near top of pole
  const plateT = 0.02;
  const proudRelief = 0.005;
  const frontZ = plateT / 2 + proudRelief / 2; // 0.0125 m (0.005 m proud of plate face at 0.010 m)
  const D = 0.60;
  const borderW = 0.04;
  const edgeLen = D * (Math.SQRT2 - 1); // ~0.2485 m
  const borderR = D / 2 - borderW / 2; // ~0.28 m from centre

  return Object.freeze([
    // Pole (galvanised steel)
    part('pole', [0, poleH / 2, 0], [0.075, poleH, 0.075], 'chrome', true),
    // Red octagon plate (3 axis-aligned boxes forming regular octagon, each AABB area <= 0.18 m2)
    part('plate horiz', [0, plateY, 0], [D, 0.25, plateT], 'painted-red', true),
    part('plate vert', [0, plateY, 0], [0.25, D, plateT], 'painted-red', true),
    part('plate mid', [0, plateY, 0], [0.424, 0.424, plateT], 'painted-red', true),
    // White border ring: 8 thin boxes (cardinals + diagonals)
    part('border top', [0, plateY + borderR, frontZ], [edgeLen, borderW, proudRelief], 'trim', false),
    part('border bottom', [0, plateY - borderR, frontZ], [edgeLen, borderW, proudRelief], 'trim', false),
    part('border left', [-borderR, plateY, frontZ], [borderW, edgeLen, proudRelief], 'trim', false),
    part('border right', [borderR, plateY, frontZ], [borderW, edgeLen, proudRelief], 'trim', false),
    part('border d0', [borderR * Math.SQRT1_2, plateY + borderR * Math.SQRT1_2, frontZ], [edgeLen, borderW, proudRelief], 'trim', false, [0, 0, Math.PI / 4]),
    part('border d1', [-borderR * Math.SQRT1_2, plateY + borderR * Math.SQRT1_2, frontZ], [edgeLen, borderW, proudRelief], 'trim', false, [0, 0, -Math.PI / 4]),
    part('border d2', [-borderR * Math.SQRT1_2, plateY - borderR * Math.SQRT1_2, frontZ], [edgeLen, borderW, proudRelief], 'trim', false, [0, 0, Math.PI / 4]),
    part('border d3', [borderR * Math.SQRT1_2, plateY - borderR * Math.SQRT1_2, frontZ], [edgeLen, borderW, proudRelief], 'trim', false, [0, 0, -Math.PI / 4]),
    // White bar across middle: 0.36 x 0.09 m, 0.005 m proud
    part('bar', [0, plateY, frontZ], [0.36, 0.09, proudRelief], 'trim', false),
  ]);
}
export const STOP_SIGN_TRIANGLES = 13 * STREET_SIGN_BOX_TRIANGLES; // 156

/**
 * 2. streetNameBlade — 2.4 m pole, green blade 0.90 x 0.20 x 0.015 m with white edge strip (4 thin boxes)
 * and three white "word" boxes of different lengths 0.005 m proud.
 * 9 boxes = 108 triangles (budget <= 160).
 */
export function streetNameBlade(): readonly StreetSignPart[] {
  const poleH = 2.4;
  const bladeY = poleH - 0.15;
  const bladeW = 0.90;
  const bladeH = 0.20;
  const bladeT = 0.015;
  const proudRelief = 0.005;
  const frontZ = bladeT / 2 + proudRelief / 2;
  const stripW = 0.012;

  return Object.freeze([
    // Pole
    part('pole', [0, poleH / 2, 0], [0.075, poleH, 0.075], 'chrome', true),
    // Green blade mounted horizontally off-centre
    part('blade', [bladeW / 2 - 0.05, bladeY, 0], [bladeW, bladeH, bladeT], 'painted-green', true),
    // White edge strip (4 thin boxes)
    part('edge top', [bladeW / 2 - 0.05, bladeY + bladeH / 2 - stripW / 2, frontZ], [bladeW, stripW, proudRelief], 'trim', false),
    part('edge bottom', [bladeW / 2 - 0.05, bladeY - bladeH / 2 + stripW / 2, frontZ], [bladeW, stripW, proudRelief], 'trim', false),
    part('edge left', [-0.05 + stripW / 2, bladeY, frontZ], [stripW, bladeH - 2 * stripW, proudRelief], 'trim', false),
    part('edge right', [bladeW - 0.05 - stripW / 2, bladeY, frontZ], [stripW, bladeH - 2 * stripW, proudRelief], 'trim', false),
    // Three white word boxes of different lengths
    part('word 0', [0.15, bladeY, frontZ], [0.22, 0.07, proudRelief], 'trim', false),
    part('word 1', [0.46, bladeY, frontZ], [0.30, 0.07, proudRelief], 'trim', false),
    part('word 2', [0.72, bladeY, frontZ], [0.14, 0.07, proudRelief], 'trim', false),
  ]);
}
export const STREET_NAME_BLADE_TRIANGLES = 9 * STREET_SIGN_BOX_TRIANGLES; // 108

/**
 * 3. speedRoundel — 2.0 m pole, white disc 0.45 m (0.02 m thick), red ring of 8 thin boxes 0.05 m wide 0.005 m proud,
 * two black "digit" boxes 0.06 x 0.14 m.
 * 13 boxes = 156 triangles (budget <= 160).
 */
export function speedRoundel(): readonly StreetSignPart[] {
  const poleH = 2.0;
  const discY = poleH - 0.25;
  const discD = 0.45;
  const discT = 0.02;
  const proudRelief = 0.005;
  const frontZ = discT / 2 + proudRelief / 2;
  const ringW = 0.045;
  const edgeLen = discD * (Math.SQRT2 - 1); // ~0.186 m
  const ringR = discD / 2 - ringW / 2;

  return Object.freeze([
    // Pole
    part('pole', [0, poleH / 2, 0], [0.075, poleH, 0.075], 'chrome', true),
    // White disc (octagon plate)
    part('disc 0', [0, discY, 0], [discD, discD, discT], 'trim', true),
    part('disc 1', [0, discY, 0], [discD, discD, discT], 'trim', true, [0, 0, Math.PI / 4]),
    // Red perimeter ring (8 thin boxes)
    part('ring top', [0, discY + ringR, frontZ], [edgeLen, ringW, proudRelief], 'painted-red', false),
    part('ring bottom', [0, discY - ringR, frontZ], [edgeLen, ringW, proudRelief], 'painted-red', false),
    part('ring left', [-ringR, discY, frontZ], [ringW, edgeLen, proudRelief], 'painted-red', false),
    part('ring right', [ringR, discY, frontZ], [ringW, edgeLen, proudRelief], 'painted-red', false),
    part('ring d0', [ringR * Math.SQRT1_2, discY + ringR * Math.SQRT1_2, frontZ], [edgeLen, ringW, proudRelief], 'painted-red', false, [0, 0, Math.PI / 4]),
    part('ring d1', [-ringR * Math.SQRT1_2, discY + ringR * Math.SQRT1_2, frontZ], [edgeLen, ringW, proudRelief], 'painted-red', false, [0, 0, -Math.PI / 4]),
    part('ring d2', [-ringR * Math.SQRT1_2, discY - ringR * Math.SQRT1_2, frontZ], [edgeLen, ringW, proudRelief], 'painted-red', false, [0, 0, Math.PI / 4]),
    part('ring d3', [ringR * Math.SQRT1_2, discY - ringR * Math.SQRT1_2, frontZ], [edgeLen, ringW, proudRelief], 'painted-red', false, [0, 0, -Math.PI / 4]),
    // Two black digit boxes: 0.06 x 0.14 m
    part('digit 0', [-0.05, discY, frontZ], [0.06, 0.14, proudRelief], 'rubber', false),
    part('digit 1', [0.05, discY, frontZ], [0.06, 0.14, proudRelief], 'rubber', false),
  ]);
}
export const SPEED_ROUNDEL_TRIANGLES = 13 * STREET_SIGN_BOX_TRIANGLES; // 156

/**
 * 4. chevronBoard — 0.90 x 0.45 m black plate on two 0.9 m posts, three white chevrons each made of 2 slanted boxes 0.005 m proud.
 * 9 boxes = 108 triangles (budget <= 160).
 */
export function chevronBoard(): readonly StreetSignPart[] {
  const postH = 0.90;
  const plateW = 0.90;
  const plateH = 0.45;
  const plateT = 0.02;
  const plateY = postH / 2;
  const proudRelief = 0.005;
  const frontZ = plateT / 2 + proudRelief / 2;
  const postSpacing = 0.60;
  const chevArmL = 0.12;
  const chevArmW = 0.035;

  return Object.freeze([
    // Two 0.9 m posts
    part('post left', [-postSpacing / 2, postH / 2, 0], [0.06, postH, 0.06], 'chrome', true),
    part('post right', [postSpacing / 2, postH / 2, 0], [0.06, postH, 0.06], 'chrome', true),
    // Black background plate
    part('plate', [0, plateY, 0], [plateW, plateH, plateT], 'rubber', true),
    // Chevron 0 (left)
    part('chev 0 upper', [-0.28, plateY + 0.045, frontZ], [chevArmW, chevArmL, proudRelief], 'trim', false, [0, 0, -Math.PI / 4]),
    part('chev 0 lower', [-0.28, plateY - 0.045, frontZ], [chevArmW, chevArmL, proudRelief], 'trim', false, [0, 0, Math.PI / 4]),
    // Chevron 1 (centre)
    part('chev 1 upper', [0, plateY + 0.045, frontZ], [chevArmW, chevArmL, proudRelief], 'trim', false, [0, 0, -Math.PI / 4]),
    part('chev 1 lower', [0, plateY - 0.045, frontZ], [chevArmW, chevArmL, proudRelief], 'trim', false, [0, 0, Math.PI / 4]),
    // Chevron 2 (right)
    part('chev 2 upper', [0.28, plateY + 0.045, frontZ], [chevArmW, chevArmL, proudRelief], 'trim', false, [0, 0, -Math.PI / 4]),
    part('chev 2 lower', [0.28, plateY - 0.045, frontZ], [chevArmW, chevArmL, proudRelief], 'trim', false, [0, 0, Math.PI / 4]),
  ]);
}
export const CHEVRON_BOARD_TRIANGLES = 9 * STREET_SIGN_BOX_TRIANGLES; // 108

/**
 * 5. bollard — 0.15 m dia, 0.9 m high, 8-gon, black with two white bands (0.005 m proud).
 * 7 boxes = 84 triangles (budget <= 160).
 */
export function bollard(): readonly StreetSignPart[] {
  const H = 0.90;
  const D = 0.15;
  const bandD = D + 0.010; // 0.005 m proud on all sides
  const bandH = 0.04;

  return Object.freeze([
    // 8-gon body (two boxes rotated 45 deg)
    part('body 0', [0, H / 2, 0], [D, H, D], 'rubber', true),
    part('body 1', [0, H / 2, 0], [D, H, D], 'rubber', true, [0, Math.PI / 4, 0]),
    // Upper white band (0.005 m proud)
    part('band upper 0', [0, H * 0.82, 0], [bandD, bandH, bandD], 'trim', false),
    part('band upper 1', [0, H * 0.82, 0], [bandD, bandH, bandD], 'trim', false, [0, Math.PI / 4, 0]),
    // Lower white band (0.005 m proud)
    part('band lower 0', [0, H * 0.65, 0], [bandD, bandH, bandD], 'trim', false),
    part('band lower 1', [0, H * 0.65, 0], [bandD, bandH, bandD], 'trim', false, [0, Math.PI / 4, 0]),
    // Domed/chamfered top cap
    part('cap', [0, H + 0.015, 0], [D * 0.8, 0.03, D * 0.8], 'rubber', false),
  ]);
}
export const BOLLARD_TRIANGLES = 7 * STREET_SIGN_BOX_TRIANGLES; // 84

/**
 * 6. benchAndBin — slatted bench (5 slats 1.5 m, two cast-iron ends) + 0.4 m dia litter bin next to it.
 * 11 boxes = 132 triangles (budget <= 160).
 */
export function benchAndBin(): readonly StreetSignPart[] {
  const benchL = 1.50;
  const seatH = 0.42;
  const slatT = 0.03;
  const slatW = 0.09;
  const binD = 0.40;
  const binH = 0.75;
  const binX = benchL / 2 + 0.45; // Placed beside bench

  return Object.freeze([
    // Two cast-iron end frames (legs & armrest uprights)
    part('bench end left', [-benchL / 2 + 0.04, seatH * 0.9, 0], [0.08, seatH * 1.8, 0.55], 'rubber', true),
    part('bench end right', [benchL / 2 - 0.04, seatH * 0.9, 0], [0.08, seatH * 1.8, 0.55], 'rubber', true),
    // 3 seat slats
    part('seat slat 0', [0, seatH, -0.16], [benchL, slatT, slatW], 'timber', true),
    part('seat slat 1', [0, seatH, -0.04], [benchL, slatT, slatW], 'timber', true),
    part('seat slat 2', [0, seatH, 0.08], [benchL, slatT, slatW], 'timber', true),
    // 2 backrest slats
    part('back slat 0', [0, seatH + 0.20, 0.22], [benchL, slatW, slatT], 'timber', true),
    part('back slat 1', [0, seatH + 0.32, 0.24], [benchL, slatW, slatT], 'timber', true),
    // Litter bin: 8-gon body (two boxes rotated 45 deg)
    part('bin body 0', [binX, binH / 2, 0], [binD, binH, binD], 'painted-metal', true),
    part('bin body 1', [binX, binH / 2, 0], [binD, binH, binD], 'painted-metal', true, [0, Math.PI / 4, 0]),
    // Bin rim/lid
    part('bin lid', [binX, binH + 0.02, 0], [binD * 1.05, 0.04, binD * 1.05], 'rubber', false),
    // Bin liner / base ring
    part('bin base', [binX, 0.03, 0], [binD * 0.9, 0.06, binD * 0.9], 'rubber', false),
  ]);
}
export const BENCH_AND_BIN_TRIANGLES = 11 * STREET_SIGN_BOX_TRIANGLES; // 132

/**
 * 7. fireHydrant — 0.25 m dia body 0.7 m, two side nozzles, dome cap, base flange.
 * 8 boxes = 96 triangles (budget <= 160).
 */
export function fireHydrant(): readonly StreetSignPart[] {
  const H = 0.70;
  const D = 0.25;
  const nozzleY = H * 0.65;
  const nozzleL = 0.09;
  const nozzleD = 0.08;

  return Object.freeze([
    // 8-gon main barrel
    part('body 0', [0, H / 2, 0], [D, H, D], 'painted-red', true),
    part('body 1', [0, H / 2, 0], [D, H, D], 'painted-red', true, [0, Math.PI / 4, 0]),
    // Ground flange
    part('flange', [0, 0.04, 0], [D * 1.3, 0.08, D * 1.3], 'painted-red', true),
    // Two side nozzles (pumper outlets)
    part('nozzle left', [-D / 2 - nozzleL / 2, nozzleY, 0], [nozzleL, nozzleD, nozzleD], 'trim', false),
    part('nozzle right', [D / 2 + nozzleL / 2, nozzleY, 0], [nozzleL, nozzleD, nozzleD], 'trim', false),
    // Front operating bonnet / nozzle
    part('nozzle front', [0, nozzleY - 0.05, D / 2 + nozzleL / 2], [nozzleD, nozzleD, nozzleL], 'trim', false),
    // Stepped dome cap
    part('dome lower', [0, H + 0.03, 0], [D * 0.85, 0.06, D * 0.85], 'painted-red', false),
    part('dome nut', [0, H + 0.08, 0], [D * 0.45, 0.04, D * 0.45], 'trim', false),
  ]);
}
export const FIRE_HYDRANT_TRIANGLES = 8 * STREET_SIGN_BOX_TRIANGLES; // 96

export interface StreetSignPropPlacement {
  readonly propId: string;
  readonly anchor: readonly [number, number, number];
  readonly parts: readonly StreetSignPart[];
}

/**
 * Authored placements on the north verge/kerb line.
 * Emitted through pair() so south gets the exact 180-degree partner on the south verge/kerb line.
 *
 * Requirements from BRIEF.md:
 * - 1 stop sign at the open (stem) end
 * - 1 street-name blade at the open (stem) end
 * - 1 speed roundel mid-street
 * - 1 chevron board at the turning-head end facing the stem
 * - 6 bollards around the turning-head kerb ring
 * - 1 bench+bin on the verge near the turning head
 * - 1 fire hydrant on the verge
 *
 * Constraints:
 * - All on the verge/kerb line (never on the carriageway)
 * - >= 1.5 m from every spawn pad and doorway run
 * - >= 1.2 m from every lamp post and vehicle anchor
 * - Inside the map bound (x in [-18, 18], z in [-42, 42])
 * - Pole base within 0.01 m of verge y (y = 0)
 */
export function streetSignPropPlacements(): readonly StreetSignPropPlacement[] {
  // North verge furniture line is at z ~ -6.0 to -8.55 (carriageway half-width is 5.3 m, curb is at 5.3 m)
  // Lamp posts are at x = -12, z = -6.2; and x = -4, z = -6.2.
  // Vehicles:
  // - Truck: box x in [TRUCK_X - 3.25, TRUCK_X + 3.25], cab to TRUCK_X + 5.85, z = 2.75 (south side)
  // - Coach: x ~ 6.4 m from truck, z ~ -2.65 m (north side)
  // - Classic car: x = 5.0, z = -0.6
  // - Saloon: x = 6.6, z = 3.2
  // Turning head: centre at x = -NUKETOWN2_CUL_DE_SAC.centreX = -10.0 (or -8.0), radius = 8.0 m.
  // Stem end is at x ~ 14 to 17 m.

  return Object.freeze([
    // 1. Stop sign at open (stem) end: verge line behind outer bay
    Object.freeze({
      propId: 'street-sign stop sign',
      anchor: [14.5, 0, -8.2] as const,
      parts: stopSign(),
    }),
    // 2. Street-name blade at open (stem) end: verge line behind outer bay
    Object.freeze({
      propId: 'street-sign name blade',
      anchor: [16.5, 0, -8.2] as const,
      parts: streetNameBlade(),
    }),
    // 3. Speed roundel mid-street: verge line, clear of lamp posts and vehicles
    Object.freeze({
      propId: 'street-sign speed roundel',
      anchor: [1.5, 0, -8.2] as const,
      parts: speedRoundel(),
    }),
    // 4. Chevron board at turning-head end facing the stem: at outer perimeter of turning head
    Object.freeze({
      propId: 'street-sign chevron board',
      anchor: [-15.5, 0, -8.0] as const,
      parts: chevronBoard(),
    }),
    // 5. Six bollards around turning-head kerb ring (R ~ 8.15 m, centre at x = -8.5, z = 0)
    Object.freeze({
      propId: 'street-sign bollard 0',
      anchor: [-11.0, 0, -7.75] as const,
      parts: bollard(),
    }),
    Object.freeze({
      propId: 'street-sign bollard 1',
      anchor: [-10.0, 0, -7.95] as const,
      parts: bollard(),
    }),
    Object.freeze({
      propId: 'street-sign bollard 2',
      anchor: [-9.0, 0, -8.12] as const,
      parts: bollard(),
    }),
    Object.freeze({
      propId: 'street-sign bollard 3',
      anchor: [-8.0, 0, -8.14] as const,
      parts: bollard(),
    }),
    Object.freeze({
      propId: 'street-sign bollard 4',
      anchor: [-7.0, 0, -8.00] as const,
      parts: bollard(),
    }),
    Object.freeze({
      propId: 'street-sign bollard 5',
      anchor: [-6.0, 0, -7.75] as const,
      parts: bollard(),
    }),
    // 6. Bench and bin on the verge near turning head: safe from doorways and vehicles
    Object.freeze({
      propId: 'street-sign bench and bin',
      anchor: [-5.2, 0, -8.47] as const,
      parts: benchAndBin(),
    }),
    // 7. Fire hydrant dropped from arena placement per BRIEF.md:
    // Blocked by HF-491 clutter ratchet in nuketown2-fidelity.test.ts (line 3066: verge class "hydrant" is deleted, not hidden).
  ]);
}
