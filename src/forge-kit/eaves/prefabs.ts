/**
 * forge-kit/eaves/prefabs.ts - HF-536 (night-muse-eaves). Roof-edge trim:
 * fascia boards, gutters with brackets, downpipes with shoes, soffit line.
 *
 * WHAT THIS ADDS. Both houses end their walls at a boxed eave band
 * (`shingleRoofParts`, `src/forge-kit/facade.ts`) with a legacy 0.12 m fascia
 * on the front only, box gutters on front and back with NO brackets and NO
 * stop-ends, and nothing at all on the garages: no fascia, no gutter, no
 * pipe, no soffit. The critic's interim-6 gap #4 names exactly this at
 * `front-porch` ("roof fascia boards, eaves gutters ...") and `garage`.
 *
 * DIMENSIONS (metres, brief sections 1-4, audit-safe relief):
 * - fascia: 0.18 tall x 0.025 board (trim role) on every eave edge, 0.01
 *   proud of the eave-band face, with a 0.02 x 0.02 drip strip hung below
 *   (top 5 mm bedded into the fascia so no coplanar faces).
 * - gutters: box trough 0.12 wide x 0.09 tall (painted-metal role). Hung
 *   0.02 below the fascia bottom, 0.035 proud of the fascia face - 0.035,
 *   not the brief's 0.03, so the trough back stays clear of the 0.03 m
 *   oriented-scan near band (window-kit precedent: brief 0.02 authored
 *   0.045 for the same reason). Brackets 0.03 x 0.04 every 0.9 m, stop-ends
 *   swallowing both trough ends.
 * - downpipes: 0.08 m 8-gon closed pipe from each NEW gutter end to a shoe
 *   whose base sits 0.15 above ground, hung at the gutter line (0.27+ off
 *   the wall - the brief's 0.02 is a never-flush minimum, and the gutter
 *   line is where the hopper feeds the pipe with no visible disconnect).
 *   Two wall straps per pipe. Where a gutter already exists (both house
 *   fronts and backs) the trough, hoppers, pipes and shoes are LEFT ALONE
 *   and only brackets + stop-ends are added - re-piping those corners would
 *   double-pipe them (see forge-kit/hardware/prefabs.ts header).
 * - soffit: 0.02 thick strip (trim) under the overhang, top 0.01 below the
 *   eave-band underside, inner end bedded 0.01 into the wall, outer end
 *   0.01 short of the fascia back.
 *
 * RELIEF. No two different-material faces share a plane anywhere: fascia
 * backs bed 0.015 into the band, trough backs stand 0.035 off the fascia,
 * brackets/straps bed 0.01 into whatever they bolt to, soffit ends bed 0.01
 * into the wall. Same-material interpenetrations (drip into fascia, hopper
 * into trough) classify `oriented-same-material`, never a finding.
 *
 * AUTHORITY. Presentation only - `solid:false, shots:false, cast:false`.
 * Roles are the two the arena already owns: `trim` and `painted-metal`
 * (resolved onto `m.trim` / `m.garageDoor`, the hardware-kit's mapping).
 * Pipes are closed 8-gon cylinders (32 tris: 16 side + 16 cap), everything
 * else is a 12-tri box.
 */

export type EavesRole = 'trim' | 'painted-metal';

/** One axis-aligned box the caller emits through its own `pair()` helper. */
export interface EavesPart {
  /** Suffix appended to the caller's prop id, e.g. `<id> fascia front`. */
  readonly suffix: string;
  /** Offset from the anchor, metres, in the caller's authored frame. */
  readonly offset: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly role: EavesRole;
}

/** One 8-gon downpipe the caller emits as a closed CylinderGeometry. */
export interface EavesPipeSpec {
  readonly suffix: string;
  /** Centre of the pipe in the caller's authored frame, metres. */
  readonly offset: readonly [number, number, number];
  /** Pipe radius, metres (0.04 = the brief's 0.08 across). */
  readonly radius: number;
  /** Pipe length, metres. */
  readonly height: number;
  /** Always 8: the brief's 8-gon. */
  readonly segments: 8;
  readonly role: EavesRole;
}

/** Fascia board: 0.18 tall x 0.025, trim. */
export const EAVES_FASCIA_H = 0.18;
export const EAVES_FASCIA_T = 0.025;
/** How far the fascia face stands proud of the eave-band face. */
export const EAVES_FASCIA_PROUD = 0.01;
/** Drip strip hung below the fascia. */
export const EAVES_DRIP_H = 0.02;
export const EAVES_DRIP_D = 0.02;
/** Box gutter mouth width (z) x height (y), painted-metal. */
export const EAVES_GUTTER_W = 0.12;
export const EAVES_GUTTER_H = 0.09;
/** Trough back vs fascia face: brief 0.03, authored 0.035 (scan band). */
export const EAVES_GUTTER_PROUD = 0.035;
/** Trough top vs fascia bottom. */
export const EAVES_GUTTER_DROP = 0.02;
/** Bracket cross-section; spacing target with end inset. */
export const EAVES_BRACKET_W = 0.03;
export const EAVES_BRACKET_H = 0.04;
export const EAVES_BRACKET_SPACING = 0.9;
export const EAVES_BRACKET_END_INSET = 0.2;
/** Soffit strip thickness; top vs band underside. */
export const EAVES_SOFFIT_T = 0.02;
export const EAVES_SOFFIT_DROP = 0.01;
/** Downpipe radius (0.08 across), segments, wall minimum, shoe. */
export const EAVES_PIPE_R = 0.04;
export const EAVES_PIPE_SEGMENTS = 8;
export const EAVES_PIPE_STANDOFF_MIN = 0.02;
export const EAVES_SHOE_H = 0.14;
export const EAVES_SHOE_BASE_Y = 0.15;
/** Boxed-eave band height. MUST equal the band in `shingleRoofParts`. */
const EAVES_BAND_H = 0.16;

export const EAVES_TRIS_PER_BOX = 12;
/** Closed 8-gon cylinder: 8x2 side tris + 8 + 8 cap tris. */
export const EAVES_PIPE_TRIANGLES = 8 * 2 + 8 + 8;
/** New boxes per house: 8 fascia+drip + 4 soffit + 2 x 15 retrofit. */
export const EAVES_HOUSE_BOXES = 42;
export const EAVES_HOUSE_TRIANGLES = EAVES_HOUSE_BOXES * EAVES_TRIS_PER_BOX;
/** New boxes per garage: 8 fascia+drip + 4 soffit + 2 x 17 gutter. */
export const EAVES_GARAGE_BOXES = 46;
export const EAVES_GARAGE_PIPES = 4;
export const EAVES_GARAGE_TRIANGLES =
  EAVES_GARAGE_BOXES * EAVES_TRIS_PER_BOX + EAVES_GARAGE_PIPES * EAVES_PIPE_TRIANGLES;

export interface EavesFrameOptions {
  /** Slab width across x, metres (the shingle call's width). */
  readonly width: number;
  /** Slab depth along z, metres (the shingle call's depth). */
  readonly depth: number;
  /** Top face of the slab relative to the anchor (anchor = slab centre). */
  readonly slabTop?: number;
  /** Eaves overhang beyond the slab on all four sides, metres. */
  readonly overhang?: number;
}

interface EavesFrame {
  readonly bandY: number;
  readonly bandOuterX: number;
  readonly bandOuterZ: number;
  readonly overhang: number;
}

function frame(options: EavesFrameOptions): EavesFrame {
  const { width, depth } = options;
  if (!(width > 0 && depth > 0)) throw new Error('eaves frame dimensions must be positive');
  const overhang = options.overhang ?? 0.25;
  const slabTop = options.slabTop ?? 0.15;
  const bandY = slabTop - 0.02 - EAVES_BAND_H / 2;
  // Outer face of the boxed-eave band = the "roof edge face" of the brief.
  // Mirrors shingleRoofParts: centre depth/2+overhang/2-0.02, reach overhang+0.06.
  const bandOuterX = width / 2 + overhang + 0.01;
  const bandOuterZ = depth / 2 + overhang + 0.01;
  return { bandY, bandOuterX, bandOuterZ, overhang };
}

/** Outer face of the eave band on an axis, metres from the anchor. */
export function eavesBandOuter(options: EavesFrameOptions): { x: number; z: number } {
  const { bandOuterX, bandOuterZ } = frame(options);
  return { x: bandOuterX, z: bandOuterZ };
}

/**
 * Fascia boards + drip strips on all four eave edges, anchored at the slab
 * centre (the shingle call's anchor). Boards run the full eave lengths; side
 * boards butt into the front/back boards' inner faces.
 */
export function fasciaParts(options: EavesFrameOptions): readonly EavesPart[] {
  const { width, depth } = options;
  const ov = options.overhang ?? 0.25;
  const { bandY, bandOuterX, bandOuterZ } = frame(options);
  // Front/back boards span the full eave width (slab + both overhangs).
  const runFB = width + 2 * ov;
  // Side boards butt into the front/back boards' inner faces (which stand
  // bandOuter-0.015 off centre): zero-gap butt joints, contact class at
  // 0.0045 m2 - far under the 0.02 race floor.
  const runSide = depth + 2 * ov - 0.01;
  const cx = bandOuterX - 0.0025;
  const cz = bandOuterZ - 0.0025;
  const dripY = bandY - EAVES_FASCIA_H / 2 - EAVES_DRIP_H / 2 + 0.005;
  const parts: EavesPart[] = [
    { suffix: 'fascia front', offset: [0, bandY, cz], size: [runFB, EAVES_FASCIA_H, EAVES_FASCIA_T], role: 'trim' },
    { suffix: 'fascia back', offset: [0, bandY, -cz], size: [runFB, EAVES_FASCIA_H, EAVES_FASCIA_T], role: 'trim' },
    { suffix: 'fascia left', offset: [-cx, bandY, 0], size: [EAVES_FASCIA_T, EAVES_FASCIA_H, runSide], role: 'trim' },
    { suffix: 'fascia right', offset: [cx, bandY, 0], size: [EAVES_FASCIA_T, EAVES_FASCIA_H, runSide], role: 'trim' },
    { suffix: 'drip front', offset: [0, dripY, cz], size: [runFB, EAVES_DRIP_H, EAVES_DRIP_D], role: 'trim' },
    { suffix: 'drip back', offset: [0, dripY, -cz], size: [runFB, EAVES_DRIP_H, EAVES_DRIP_D], role: 'trim' },
    { suffix: 'drip left', offset: [-cx, dripY, 0], size: [EAVES_DRIP_D, EAVES_DRIP_H, runSide], role: 'trim' },
    { suffix: 'drip right', offset: [cx, dripY, 0], size: [EAVES_DRIP_D, EAVES_DRIP_H, runSide], role: 'trim' },
  ];
  return Object.freeze(parts);
}

/** Total fascia board length (drips excluded), metres. */
export function fasciaLength(options: EavesFrameOptions): number {
  const ov = options.overhang ?? 0.25;
  return 2 * (options.width + 2 * ov) + 2 * (options.depth + 2 * ov - 0.01);
}

/**
 * Soffit strips under the overhang on all four edges. Inner ends bed 0.01
 * into the wall; outer ends stop 0.01 short of the fascia backs.
 */
export function soffitParts(options: EavesFrameOptions): readonly EavesPart[] {
  const ov = options.overhang ?? 0.25;
  const { width, depth } = options;
  const { bandY, bandOuterX, bandOuterZ } = frame(options);
  const y = bandY - EAVES_BAND_H / 2 - EAVES_SOFFIT_DROP - EAVES_SOFFIT_T / 2;
  const lenFB = (bandOuterZ - 0.025) - (depth / 2 - 0.01);
  const cFB = (depth / 2 - 0.01 + (bandOuterZ - 0.025)) / 2;
  const lenSide = (bandOuterX - 0.025) - (width / 2 - 0.01);
  const cSide = (width / 2 - 0.01 + (bandOuterX - 0.025)) / 2;
  const parts: EavesPart[] = [
    { suffix: 'soffit front', offset: [0, y, cFB], size: [width + 2 * ov, EAVES_SOFFIT_T, lenFB], role: 'trim' },
    { suffix: 'soffit back', offset: [0, y, -cFB], size: [width + 2 * ov, EAVES_SOFFIT_T, lenFB], role: 'trim' },
    { suffix: 'soffit left', offset: [-cSide, y, 0], size: [lenSide, EAVES_SOFFIT_T, depth], role: 'trim' },
    { suffix: 'soffit right', offset: [cSide, y, 0], size: [lenSide, EAVES_SOFFIT_T, depth], role: 'trim' },
  ];
  return Object.freeze(parts);
}

/**
 * Bracket layout on a trough: `round((troughLen-0.4)/0.9)+1` brackets, end
 * brackets 0.2 in from the trough ends. Returns the x positions.
 */
export function eavesBracketXs(troughLen: number): readonly number[] {
  const span = troughLen - 2 * EAVES_BRACKET_END_INSET;
  const gaps = Math.max(1, Math.round(span / EAVES_BRACKET_SPACING));
  const xs: number[] = [];
  for (let index = 0; index <= gaps; index += 1) {
    xs.push(-span / 2 + (span * index) / gaps);
  }
  return Object.freeze(xs);
}

export interface EavesRunOptions {
  /** Eaves run the gutter spans, metres (wall width). Trough = run + 0.06. */
  readonly run: number;
  /** +1 if the eaves face +z, -1 if it faces -z. */
  readonly facing: 1 | -1;
}

/**
 * Brackets + stop-ends for an EXISTING `gutterRunParts` run, in that run's
 * own anchor frame (anchor at the fascia face plane, fascia centre height).
 * The trough, hoppers, pipes and shoes already stand; these bolt onto them.
 */
export function houseRetroBracketParts(options: EavesRunOptions): readonly EavesPart[] {
  const { run, facing } = options;
  if (!(run > 0)) throw new Error('eaves run must be positive');
  const troughLen = run + 0.06;
  const parts: EavesPart[] = [];
  for (const [index, x] of eavesBracketXs(troughLen).entries()) {
    // Vertical hanger under the trough: top 0.02 bedded into the trough
    // bottom, z centred in the trough depth.
    parts.push({
      suffix: `retrofit bracket ${index}`,
      offset: [x, -0.16, facing * 0.045],
      size: [EAVES_BRACKET_W, 0.12, EAVES_BRACKET_W],
      role: 'painted-metal',
    });
  }
  for (const [index, side] of [-1, 1].entries()) {
    // Stop-end swallowing the trough + bead ends (bead runs 0.02 past the
    // trough each end; the cap covers both with 0.01 of embed).
    parts.push({
      suffix: `retrofit stopend ${index}`,
      offset: [side * (troughLen / 2 + 0.015), -0.08, facing * 0.05],
      size: [0.05, 0.14, 0.12],
      role: 'painted-metal',
    });
  }
  return Object.freeze(parts);
}

export interface GarageGutterOptions {
  /** Eaves run the new gutter spans, metres (trough = run + 0.06). */
  readonly run: number;
  /** +1 if the eaves face +z, -1 if it faces -z. */
  readonly facing: 1 | -1;
  /** Eaves overhang of the roof this gutter hangs off, metres. */
  readonly overhang: number;
  /** Shoe base height relative to the anchor (anchor = band centre height). */
  readonly shoeBaseY: number;
}

export interface GarageGutterKit {
  readonly boxes: readonly EavesPart[];
  readonly pipes: readonly EavesPipeSpec[];
}

/**
 * A complete new gutter run for a garage: trough, brackets, stop-ends,
 * hoppers, two wall straps per pipe, shoe boxes - plus the 8-gon pipes as
 * specs (the caller emits closed CylinderGeometry for those).
 *
 * Anchor frame: origin on the FASCIA FRONT plane at band-centre height
 * (fascia spans z -0.015..+0.01, y +/-0.09 in this frame).
 */
export function garageGutterParts(options: GarageGutterOptions): GarageGutterKit {
  const { run, facing, overhang, shoeBaseY } = options;
  if (!(run > 0)) throw new Error('eaves run must be positive');
  const troughLen = run + 0.06;
  const troughY = -0.09 - EAVES_GUTTER_DROP - EAVES_GUTTER_H / 2;
  // Anchor plane IS the fascia front: trough back stands GUTTER_PROUD off it.
  const troughZ = facing * (EAVES_GUTTER_PROUD + EAVES_GUTTER_W / 2);
  // Wall face plane in this frame: fascia front stands overhang+0.02 off it.
  const wallZ = -facing * (overhang + 0.02);
  const pipeTop = troughY + 0.05;
  const pipeBottom = shoeBaseY + EAVES_SHOE_H - 0.05;
  const pipeX = run / 2 - 0.2;
  const boxes: EavesPart[] = [
    {
      suffix: 'gutter trough',
      offset: [0, troughY, troughZ],
      size: [troughLen, EAVES_GUTTER_H, EAVES_GUTTER_W],
      role: 'painted-metal',
    },
  ];
  for (const [index, x] of eavesBracketXs(troughLen).entries()) {
    // Strap from the fascia face to the trough back: 0.01 bedded each end.
    boxes.push({
      suffix: `gutter bracket ${index}`,
      offset: [x, troughY - EAVES_GUTTER_H / 2 + 0.01, facing * 0.0225],
      size: [EAVES_BRACKET_W, EAVES_BRACKET_H, 0.06],
      role: 'painted-metal',
    });
  }
  for (const [index, side] of [-1, 1].entries()) {
    boxes.push({
      suffix: `gutter stopend ${index}`,
      offset: [side * (troughLen / 2 + 0.015), troughY, troughZ],
      size: [0.05, 0.14, 0.14],
      role: 'painted-metal',
    });
  }
  const pipes: EavesPipeSpec[] = [];
  for (const [index, side] of [-1, 1].entries()) {
    const x = side * pipeX;
    boxes.push({
      suffix: `gutter hopper ${index}`,
      offset: [x, troughY, troughZ],
      size: [0.13, 0.12, 0.13],
      role: 'painted-metal',
    });
    // Two wall straps per pipe at thirds of the drop: 0.01 bedded into the
    // wall, reaching 0.02 past the pipe centre.
    for (const third of [1 / 3, 2 / 3]) {
      const y = pipeTop + (pipeBottom - pipeTop) * third;
      const strapBack = wallZ - facing * 0.01;
      const strapFront = troughZ + facing * 0.02;
      const strapLen = facing * (strapFront - strapBack);
      boxes.push({
        suffix: `downpipe strap ${index}-${third === 1 / 3 ? 'upper' : 'lower'}`,
        offset: [x, y, (strapBack + strapFront) / 2],
        size: [EAVES_BRACKET_W, 0.05, strapLen],
        role: 'painted-metal',
      });
    }
    boxes.push({
      suffix: `gutter shoe ${index}`,
      offset: [x, shoeBaseY + EAVES_SHOE_H / 2, troughZ + facing * 0.04],
      size: [EAVES_PIPE_R * 2, EAVES_SHOE_H, EAVES_PIPE_R * 2 + 0.09],
      role: 'painted-metal',
    });
    pipes.push({
      suffix: `eaves pipe ${index}`,
      offset: [x, (pipeTop + pipeBottom) / 2, troughZ],
      radius: EAVES_PIPE_R,
      height: pipeTop - pipeBottom,
      segments: 8,
      role: 'painted-metal',
    });
  }
  return Object.freeze({ boxes: Object.freeze(boxes), pipes: Object.freeze(pipes) });
}
