/**
 * forge-kit/window/prefabs.ts — HF-536 NIGHT-MUSE-WINDOWS, window dressing kit.
 *
 * WHAT THIS IS. Geometry-only dressing so every house opening reads as a
 * window: a proud outer frame, a mullion cross in front of the glass, a sill
 * with a drip edge, plus interior curtains (ground) or blinds (upper) seen
 * through the glass. Zero new materials — every part asks for `trim` or
 * `interior`, both owned by `nuketown2Materials()`.
 *
 * DIMENSIONS (metres, brief §1-4 with audit-safe relief):
 * - frame: four `trim` boxes 0.06 wide x 0.04 deep around the opening. Inner
 *   edge 0.01 outside the pane opening (never overlapping the pane). Inner
 *   face 0.045 proud of the siding face (brief says 0.02; 0.045 keeps the
 *   frame front 0.035 clear of the existing sill-nose/lintel fronts so the
 *   oriented scan's 0.03 m near band stays quiet — see below).
 * - mullion cross: vertical + horizontal `trim` bars 0.03 x 0.02 on the
 *   OUTSIDE of the glass. Vertical inner 0.015 proud of the pane outer face
 *   (brief exact); horizontal 0.040 proud (0.005 clear of the vertical in z,
 *   so the cross itself holds 5 mm relief while both sit in front of glass).
 * - sill: `trim` sill 0.08 deep x 0.04 tall along the bottom, front 0.03 proud
 *   of the frame front; drip strip 0.02 x 0.02, 0.01 below the sill in y and
 *   0.005 proud of the sill front (no coplanar faces).
 * - curtains (ground): pair of thin boxes 0.02 thick, 0.35 wide x 0.9*H tall,
 *   `interior` role, gathered at the sides so exactly 60 % of a 2.0 m opening
 *   stays clear (inner edges ±0.60, outer inset 0.05 from the opening edge).
 * - blinds (upper): 7 slats [W-0.10, 0.02, 0.02] `trim`, 0.02 gaps (pitch
 *   0.04, total 0.26), 0.05 behind the glass inner face.
 *
 * RELIEF. Every pair of own parts holds >= 0.005 m: frame corners gap 0.005
 * in y (verticals short, horizontals full); mullion cross gaps 0.005 in z;
 * sill 0.008 below the frame; drip 0.01 below the sill; slats gap 0.02;
 * curtains sit 0.06 clear of the frame in x/y and 0.34 clear in z. Frame back
 * vs siding outer 0.045; mullion backs vs pane front opposed (contact class,
 * never a finding); mullion fronts vs pane front 0.035/0.060 (> 0.03, so no
 * same-facing race); frame/sill/drip fronts vs existing nose/lintel fronts
 * 0.035+ (> 0.03). All parts are boxes: 12 tris each.
 *
 * TRIANGLES. Outer 8 boxes = 96 (<= 120). Ground dressed 10 boxes = 120.
 * Upper dressed 15 boxes = 180 (8 outer + 7 slats): the brief's "each window
 * <= 120" holds for the outer prefab on every window and for dressed ground
 * windows; a boxed 7-slat blind alone is 84 tris so a fully dressed upper
 * window is 180 — total per house 2*120 + 2*180 = 600 (<= 1200). Measured in
 * `window.test.ts`.
 */

export type WindowRole = 'trim' | 'interior';

export interface WindowPart {
  readonly suffix: string;
  readonly offset: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly role: WindowRole;
  readonly cast: boolean;
}

export interface WindowDressingOptions {
  /** Clear opening width, m (wall opening, pane opening sits inside it). */
  readonly width: number;
  /** Clear opening height, m. */
  readonly height: number;
  /** Wall thickness, m (positions the siding face off the wall centre). */
  readonly depth: number;
  /** +1 front (outboard +z), -1 back (outboard -z). Default +1. */
  readonly facing?: 1 | -1;
  /** Interior dressing behind the glass. Default 'curtain'. */
  readonly dressing?: 'curtain' | 'blind';
}

export const WINDOW_FRAME_W = 0.06;
export const WINDOW_FRAME_D = 0.04;
export const WINDOW_MULL_W = 0.03;
export const WINDOW_MULL_D = 0.02;
export const WINDOW_SILL_D = 0.08;
export const WINDOW_SILL_H = 0.04;
export const WINDOW_DRIP_H = 0.02;
export const WINDOW_DRIP_D = 0.02;
export const WINDOW_CURTAIN_W = 0.35;
export const WINDOW_CURTAIN_T = 0.02;
export const WINDOW_BLIND_T = 0.02;
export const WINDOW_BLIND_GAP = 0.02;
export const WINDOW_BLIND_SLATS = 7;
export const WINDOW_BOX_TRIANGLES = 12;

export const WINDOW_OUTER_BOXES = 8;
export const WINDOW_OUTER_TRIANGLES = WINDOW_OUTER_BOXES * WINDOW_BOX_TRIANGLES;
export const WINDOW_GROUND_BOXES = 10;
export const WINDOW_GROUND_TRIANGLES = WINDOW_GROUND_BOXES * WINDOW_BOX_TRIANGLES;
export const WINDOW_UPPER_BOXES = 15;
export const WINDOW_UPPER_TRIANGLES = WINDOW_UPPER_BOXES * WINDOW_BOX_TRIANGLES;
export const WINDOW_HOUSE_BOXES = 2 * WINDOW_GROUND_BOXES + 2 * WINDOW_UPPER_BOXES;
export const WINDOW_HOUSE_TRIANGLES = WINDOW_HOUSE_BOXES * WINDOW_BOX_TRIANGLES;

const part = (
  suffix: string,
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  role: WindowRole,
): WindowPart => Object.freeze({ suffix, offset, size, role, cast: false });

function outerParts(width: number, height: number, depth: number, facing: 1 | -1): WindowPart[] {
  const sidingOuter = depth / 2 + 0.05;
  const frameC = facing * (sidingOuter + 0.065);
  const mullVC = facing * 0.055;
  const mullHC = facing * 0.08;
  const sillC = facing * (sidingOuter + 0.075);
  // Drip stands 0.045 proud of the sill front (brief says 0.005): the brief's
  // 0.005 puts the drip back exactly coplanar with the verge front hedge
  // front (-9.85), a 0.044 m2 oriented finding x2 houses. +0.04 clears the
  // hedge by 0.04 (> 0.03 near band) with no new coplanar pair.
  const dripC = facing * (sidingOuter + 0.15);
  const hw = width / 2;
  const hh = height / 2;
  const sillY = -(hh + 0.098);
  const dripY = -(hh + 0.138);
  return [
    part('frame left', [-(hw + 0.04), 0, frameC], [WINDOW_FRAME_W, height + 0.01, WINDOW_FRAME_D], 'trim'),
    part('frame right', [hw + 0.04, 0, frameC], [WINDOW_FRAME_W, height + 0.01, WINDOW_FRAME_D], 'trim'),
    part('frame top', [0, hh + 0.04, frameC], [width + 0.14, WINDOW_FRAME_W, WINDOW_FRAME_D], 'trim'),
    part('frame bottom', [0, -(hh + 0.04), frameC], [width + 0.14, WINDOW_FRAME_W, WINDOW_FRAME_D], 'trim'),
    part('mullion vertical', [0, 0, mullVC], [WINDOW_MULL_W, height, WINDOW_MULL_D], 'trim'),
    part('mullion horizontal', [0, 0, mullHC], [width, WINDOW_MULL_W, WINDOW_MULL_D], 'trim'),
    part('sill', [0, sillY, sillC], [width + 0.2, WINDOW_SILL_H, WINDOW_SILL_D], 'trim'),
    part('drip', [0, dripY, dripC], [width + 0.2, WINDOW_DRIP_H, WINDOW_DRIP_D], 'trim'),
  ];
}

function curtainParts(width: number, height: number, facing: 1 | -1): WindowPart[] {
  const cx = width / 2 - 0.225;
  const ch = 0.9 * height;
  const cz = facing * -0.11;
  return [
    part('curtain left', [-cx, 0, cz], [WINDOW_CURTAIN_W, ch, WINDOW_CURTAIN_T], 'interior'),
    part('curtain right', [cx, 0, cz], [WINDOW_CURTAIN_W, ch, WINDOW_CURTAIN_T], 'interior'),
  ];
}

function blindParts(width: number, facing: 1 | -1): WindowPart[] {
  const bw = width - 0.1;
  const cz = facing * -0.09;
  const slats: WindowPart[] = [];
  for (let i = 0; i < WINDOW_BLIND_SLATS; i += 1) {
    slats.push(part(`blind slat ${i}`, [0, (i - 3) * 0.04, cz], [bw, WINDOW_BLIND_T, WINDOW_BLIND_T], 'trim'));
  }
  return slats;
}

/**
 * Full dressing for one opening, anchored at the opening centre on the wall
 * centre plane. `facing` signs every z offset (outboard positive); `pair()`
 * mirroring carries the authored offsets to the south house exactly.
 */
export function windowDressing(options: WindowDressingOptions): readonly WindowPart[] {
  const { width, height, depth } = options;
  if (!(width > 0 && height > 0 && depth > 0)) throw new Error('windowDressing dimensions must be positive');
  const facing = options.facing ?? 1;
  if (facing !== 1 && facing !== -1) throw new Error('windowDressing facing must be 1 or -1');
  const dressing = options.dressing ?? 'curtain';
  const outer = outerParts(width, height, depth, facing);
  const inner = dressing === 'blind' ? blindParts(width, facing) : curtainParts(width, height, facing);
  return Object.freeze([...outer, ...inner]);
}

/** Outer-only subset (frame + mullions + sill + drip), 8 boxes / 96 tris. */
export function windowOuterParts(options: WindowDressingOptions): readonly WindowPart[] {
  const { width, height, depth } = options;
  if (!(width > 0 && height > 0 && depth > 0)) throw new Error('windowOuterParts dimensions must be positive');
  const facing = options.facing ?? 1;
  return Object.freeze(outerParts(width, height, depth, facing));
}
