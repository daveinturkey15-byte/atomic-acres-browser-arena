/**
 * carpet-corridor-map-overlay.ts — HF-369.
 *
 * Owner: "should be clearer that the 2nd click of the carpet bomb is for its
 * direction, animated on the map maybe when selecting the drop and direction
 * pins."
 *
 * The two-click corridor flow shipped (HF-317) with a static instruction that
 * read "SELECT RUN START AND END" for both clicks, a corridor that was only
 * drawn once BOTH clicks had landed, and pins labelled START/END. Nothing on
 * screen said which of the two clicks you were on, nothing moved, and between
 * click one and click two the map showed a lone dot that looked exactly like
 * the Care Package drop marker. That is the whole complaint.
 *
 * Three things are fixed here, and only the third is cosmetic:
 *
 *  1. The stage is named. Every string is derived from `carpetCorridorStage`,
 *     so the map cannot say "click the direction" while it is still waiting for
 *     the drop pin.
 *  2. The drawn corridor is the run the HOST will fly, not the raw pick. Run
 *     length is clamped to [MIN, MAX] and re-centred on the pick's midpoint, so
 *     a long drag was previously drawn as a corridor roughly twice the length
 *     of the one that actually gets bombed. `carpetCorridorRunFromPoints` is now
 *     the single solve behind both the preview and the dispatched intent.
 *  3. It animates: the direction stage sweeps a compass dial around the drop
 *     pin, the active pin breathes, and the corridor's dashes march the way the
 *     bomber flies. Motion is a pure function of `nowMs`, so the plan is
 *     snapshot-testable and `reducedMotion` freezes it at phase zero.
 *
 * This module is pure presentation and holds no state. It produces a plan
 * (canvas-space, already projected) and can render that plan into any 2D
 * context; the tactical map owns the projection and the redraw cadence.
 */
import {
  CARPET_BOMBER_MAX_RUN_LENGTH_M,
  CARPET_BOMBER_MIN_RUN_LENGTH_M,
  CARPET_CORRIDOR_POINT_COUNT,
  carpetCorridorDropPoint,
  carpetCorridorRunFromPoints,
  carpetCorridorStage,
  type CarpetCorridorPoint,
  type CarpetCorridorRun,
  type CarpetCorridorStage,
  type CarpetCorridorTargeting,
} from '../carpet-corridor-targeting';

export type CanvasPoint = readonly [number, number];
/** World (x, z) metres to tactical-map canvas pixels. Supplied by the caller. */
export type CarpetCorridorProjection = (worldX: number, worldZ: number) => CanvasPoint;

/** Milliseconds per breath of the pin waiting for the next click. */
export const CARPET_CORRIDOR_PIN_PULSE_PERIOD_MS = 1_100;
/** Milliseconds per full turn of the direction dial. */
export const CARPET_CORRIDOR_COMPASS_PERIOD_MS = 2_400;
/** Dash pitch and march speed of the corridor band, in canvas pixels. */
export const CARPET_CORRIDOR_DASH_PERIOD_PX = 22;
export const CARPET_CORRIDOR_DASH_SPEED_PX_PER_S = 44;

export type CarpetCorridorPinLabel = 'DROP' | 'DIRECTION';

export type CarpetCorridorPin = Readonly<{
  at: CanvasPoint;
  label: CarpetCorridorPinLabel;
  radiusPx: number;
  /** Breathing halo radius. Equals `radiusPx` when the pin is not awaiting a click. */
  haloPx: number;
  /** True for the pin the next click will place or replace. */
  active: boolean;
  /** True while the pin only tracks the pointer and has not been committed. */
  provisional: boolean;
}>;

export type CarpetCorridorBand = Readonly<{
  start: CanvasPoint;
  end: CanvasPoint;
  halfWidthPx: number;
  dashPeriodPx: number;
  /** Marches toward `end`, i.e. the way the bomber flies. */
  dashOffsetPx: number;
  headingRadians: number;
  arrowTip: CanvasPoint;
  arrowSizePx: number;
  provisional: boolean;
}>;

/**
 * The raw click-to-click line, drawn faintly ONLY when the host clamp moved the
 * run off it. Without it a clamped run looks like the map ignored the click.
 */
export type CarpetCorridorGuide = Readonly<{
  start: CanvasPoint;
  end: CanvasPoint;
  clamp: 'shortened' | 'extended';
}>;

export type CarpetCorridorCompass = Readonly<{
  at: CanvasPoint;
  radiusPx: number;
  /** Dial angle in canvas radians; locks to the pointer once there is one. */
  sweepRadians: number;
  sweepArcRadians: number;
  tickCount: number;
  /** True while the sweep is free-running because no direction is proposed yet. */
  searching: boolean;
}>;

export type CarpetCorridorOverlayPlan = Readonly<{
  stage: CarpetCorridorStage;
  pins: readonly CarpetCorridorPin[];
  band: CarpetCorridorBand | null;
  guide: CarpetCorridorGuide | null;
  compass: CarpetCorridorCompass | null;
  /** One short line under the map: run length, bearing, and any clamp applied. */
  readout: string;
  /** True while nothing on screen is committed yet — the run is still a proposal. */
  provisional: boolean;
}>;

export type CarpetCorridorPrompt = Readonly<{
  stage: CarpetCorridorStage;
  /** `#strike-target-mode`. */
  mode: string;
  /** 1-based index of the click the player is on; stays at the last step when complete. */
  step: number;
  stepCount: number;
  /** `#strike-target-instruction` — names the click, not the pair. */
  instruction: string;
  /** `#strike-target-help` — may contain a <kbd> element, like the sibling modes. */
  help: string;
  /** `#strike-target-count`. */
  count: string;
}>;

export type CarpetCorridorOverlayInput = Readonly<{
  state: CarpetCorridorTargeting;
  project: CarpetCorridorProjection;
  /** Half width of the drawn corridor band in canvas pixels, already projected. */
  bandHalfWidthPx: number;
  nowMs: number;
  /** World point under the pointer, when the map tracks one. Optional by design. */
  cursor?: CarpetCorridorPoint | null;
  reducedMotion?: boolean;
  /** Radius of a placed pin, matching the sibling Tri-Pass markers. */
  pinRadiusPx?: number;
}>;

const DEFAULT_PIN_RADIUS_PX = 15;
const COMPASS_TICK_COUNT = 16;
const COMPASS_SWEEP_ARC_RADIANS = Math.PI / 5;
const ARROW_SIZE_PX = 18;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

/** 0 = north (-Z), 90 = east (+X), matching the "N" the map prints at the top. */
export function carpetCorridorBearingDegrees(headingRadians: number): number {
  const degrees = Math.atan2(Math.cos(headingRadians), -Math.sin(headingRadians)) * 180 / Math.PI;
  return (degrees % 360 + 360) % 360;
}

function bearingText(headingRadians: number): string {
  return String(Math.round(carpetCorridorBearingDegrees(headingRadians)) % 360).padStart(3, '0');
}

/**
 * Stage-named copy. The sibling modes each ship one static sentence because one
 * click is all they take; carpet takes two clicks that mean different things, so
 * its copy has to move with the stage.
 */
export function carpetCorridorPrompt(state: CarpetCorridorTargeting): CarpetCorridorPrompt {
  const stage = carpetCorridorStage(state);
  const placed = Math.min(state.points.length, CARPET_CORRIDOR_POINT_COUNT);
  const step = stage === 'complete' ? CARPET_CORRIDOR_POINT_COUNT : placed + 1;
  const base = {
    stage,
    mode: 'CARPET BOMBER',
    step,
    stepCount: CARPET_CORRIDOR_POINT_COUNT,
    count: `${placed} / ${CARPET_CORRIDOR_POINT_COUNT}`,
  } as const;
  if (stage === 'drop') {
    return Object.freeze({
      ...base,
      instruction: `STEP 1 OF ${CARPET_CORRIDOR_POINT_COUNT} · CLICK THE DROP POINT`,
      help: 'CLICK WHERE THE RUN STARTS · STEP 2 SETS THE DIRECTION IT FLIES · <kbd>ESC</kbd> CANCELS AND REFUNDS',
    });
  }
  if (stage === 'direction') {
    return Object.freeze({
      ...base,
      instruction: `STEP 2 OF ${CARPET_CORRIDOR_POINT_COUNT} · CLICK THE DIRECTION`,
      help: `DROP PIN SET · CLICK THE WAY THE BOMBER FLIES — RUN LENGTH IS HELD BETWEEN ${CARPET_BOMBER_MIN_RUN_LENGTH_M} M AND ${CARPET_BOMBER_MAX_RUN_LENGTH_M} M · <kbd>ESC</kbd> CANCELS AND REFUNDS`,
    });
  }
  return Object.freeze({
    ...base,
    instruction: 'RUN CONFIRMED · BOMBER INBOUND',
    help: 'CORRIDOR LOCKED · 20-IMPACT RUN INBOUND',
  });
}

function readoutText(run: CarpetCorridorRun | null, stage: CarpetCorridorStage): string {
  if (!run) {
    return stage === 'drop'
      ? 'AWAITING DROP POINT'
      : 'AWAITING DIRECTION';
  }
  const head = `RUN ${Math.round(run.lengthM)} M · HDG ${bearingText(run.headingRadians)}`;
  if (run.clamp === 'shortened') return `${head} · HELD TO ${CARPET_BOMBER_MAX_RUN_LENGTH_M} M MAX RUN`;
  if (run.clamp === 'extended') return `${head} · HELD TO ${CARPET_BOMBER_MIN_RUN_LENGTH_M} M MIN RUN`;
  return head;
}

function pulse(nowMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return 0.5 - 0.5 * Math.cos(wrapUnit(nowMs / CARPET_CORRIDOR_PIN_PULSE_PERIOD_MS) * Math.PI * 2);
}

function bandFor(
  run: CarpetCorridorRun,
  project: CarpetCorridorProjection,
  halfWidthPx: number,
  nowMs: number,
  reducedMotion: boolean,
  provisional: boolean,
): CarpetCorridorBand {
  const start = project(run.start.x, run.start.z);
  const end = project(run.end.x, run.end.z);
  const canvasHeading = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const marched = reducedMotion
    ? 0
    : -wrapUnit(nowMs / 1_000 * CARPET_CORRIDOR_DASH_SPEED_PX_PER_S / CARPET_CORRIDOR_DASH_PERIOD_PX)
      * CARPET_CORRIDOR_DASH_PERIOD_PX;
  // Negating a zero phase yields -0, which is a real value difference for
  // snapshot comparison even though it draws identically. Normalise it.
  const march = marched === 0 ? 0 : marched;
  return Object.freeze({
    start,
    end,
    halfWidthPx: Math.max(4, finite(halfWidthPx, 6)),
    dashPeriodPx: CARPET_CORRIDOR_DASH_PERIOD_PX,
    dashOffsetPx: march,
    headingRadians: canvasHeading,
    arrowTip: [
      end[0] + Math.cos(canvasHeading) * ARROW_SIZE_PX,
      end[1] + Math.sin(canvasHeading) * ARROW_SIZE_PX,
    ] as const,
    arrowSizePx: ARROW_SIZE_PX,
    provisional,
  });
}

/**
 * Builds the whole animated overlay for one tactical-map frame.
 *
 * `cursor` is optional on purpose: with it, the direction stage previews the
 * real corridor under the pointer; without it, the compass dial free-runs so the
 * stage still reads as "pick a direction" on a pad or a touch device that has no
 * hover.
 */
export function carpetCorridorOverlayPlan(input: CarpetCorridorOverlayInput): CarpetCorridorOverlayPlan {
  const { state, project, bandHalfWidthPx, cursor = null } = input;
  const reducedMotion = input.reducedMotion === true;
  const nowMs = finite(input.nowMs, 0);
  const pinRadiusPx = Math.max(6, finite(input.pinRadiusPx ?? DEFAULT_PIN_RADIUS_PX, DEFAULT_PIN_RADIUS_PX));
  const stage = carpetCorridorStage(state);
  const drop = carpetCorridorDropPoint(state);
  const breath = pulse(nowMs, reducedMotion);
  const halo = pinRadiusPx + 4 + breath * 9;

  const committedEnd = state.points[1] ?? null;
  const liveCursor = cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.z) ? cursor : null;
  const proposedEnd = committedEnd ?? (stage === 'direction' ? liveCursor : null);
  const run = drop && proposedEnd ? carpetCorridorRunFromPoints(drop, proposedEnd) : null;
  const provisional = committedEnd === null;

  const pins: CarpetCorridorPin[] = [];
  if (drop) {
    pins.push(Object.freeze({
      at: project(drop.x, drop.z),
      label: 'DROP',
      radiusPx: pinRadiusPx,
      haloPx: pinRadiusPx,
      active: false,
      provisional: false,
    }));
  } else if (liveCursor && stage === 'drop') {
    pins.push(Object.freeze({
      at: project(liveCursor.x, liveCursor.z),
      label: 'DROP',
      radiusPx: pinRadiusPx,
      haloPx: halo,
      active: true,
      provisional: true,
    }));
  }
  if (proposedEnd) {
    pins.push(Object.freeze({
      at: project(proposedEnd.x, proposedEnd.z),
      label: 'DIRECTION',
      radiusPx: pinRadiusPx,
      haloPx: provisional ? halo : pinRadiusPx,
      active: provisional,
      provisional,
    }));
  }

  let guide: CarpetCorridorGuide | null = null;
  if (run && drop && proposedEnd && run.clamp) {
    guide = Object.freeze({
      start: project(drop.x, drop.z),
      end: project(proposedEnd.x, proposedEnd.z),
      clamp: run.clamp,
    });
  }

  let compass: CarpetCorridorCompass | null = null;
  if (stage === 'direction' && drop) {
    const at = project(drop.x, drop.z);
    const searching = run === null;
    const free = reducedMotion ? 0 : wrapUnit(nowMs / CARPET_CORRIDOR_COMPASS_PERIOD_MS) * Math.PI * 2;
    let sweepRadians = free;
    if (run) {
      const end = project(run.end.x, run.end.z);
      sweepRadians = Math.atan2(end[1] - at[1], end[0] - at[0]);
    }
    compass = Object.freeze({
      at,
      radiusPx: pinRadiusPx + 14 + (reducedMotion ? 0 : breath * 6),
      sweepRadians,
      sweepArcRadians: COMPASS_SWEEP_ARC_RADIANS,
      tickCount: COMPASS_TICK_COUNT,
      searching,
    });
  }

  return Object.freeze({
    stage,
    pins: Object.freeze(pins),
    band: run ? bandFor(run, project, bandHalfWidthPx, nowMs, reducedMotion, provisional) : null,
    guide,
    compass,
    readout: readoutText(run, stage),
    provisional,
  });
}

/**
 * The 2D-context surface this renderer uses. Narrower than
 * `CanvasRenderingContext2D` so the plan can be rendered against a recorder in
 * tests without a DOM.
 */
export type CarpetCorridorDrawContext = Pick<
  CanvasRenderingContext2D,
  'save' | 'restore' | 'beginPath' | 'moveTo' | 'lineTo' | 'arc' | 'closePath'
  | 'fill' | 'stroke' | 'fillText' | 'setLineDash'
> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
};

const BAND_FILL = 'rgba(255, 179, 71, 0.28)';
const CORRIDOR_AMBER = '#ffb347';
const PIN_TEXT = '#10232a';
const PIN_RING = '#fff4d9';
const GUIDE = 'rgba(255, 244, 217, 0.35)';

/** Renders a plan. Leaves the context's state as it found it. */
export function drawCarpetCorridorOverlay(
  context: CarpetCorridorDrawContext,
  plan: CarpetCorridorOverlayPlan,
): void {
  context.save();
  if (plan.guide) {
    context.setLineDash([4, 6]);
    context.strokeStyle = GUIDE;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(plan.guide.start[0], plan.guide.start[1]);
    context.lineTo(plan.guide.end[0], plan.guide.end[1]);
    context.stroke();
    context.setLineDash([]);
  }
  if (plan.compass) {
    const { at, radiusPx, sweepRadians, sweepArcRadians, tickCount, searching } = plan.compass;
    context.globalAlpha = searching ? 0.75 : 0.5;
    context.strokeStyle = CORRIDOR_AMBER;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(at[0], at[1], radiusPx, 0, Math.PI * 2);
    context.stroke();
    for (let tick = 0; tick < tickCount; tick += 1) {
      const angle = tick / tickCount * Math.PI * 2;
      context.beginPath();
      context.moveTo(at[0] + Math.cos(angle) * (radiusPx - 4), at[1] + Math.sin(angle) * (radiusPx - 4));
      context.lineTo(at[0] + Math.cos(angle) * radiusPx, at[1] + Math.sin(angle) * radiusPx);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.fillStyle = BAND_FILL;
    context.beginPath();
    context.moveTo(at[0], at[1]);
    context.arc(at[0], at[1], radiusPx, sweepRadians - sweepArcRadians / 2, sweepRadians + sweepArcRadians / 2);
    context.closePath();
    context.fill();
  }
  if (plan.band) {
    const band = plan.band;
    context.globalAlpha = band.provisional ? 0.7 : 1;
    context.strokeStyle = BAND_FILL;
    context.lineWidth = band.halfWidthPx * 2;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(band.start[0], band.start[1]);
    context.lineTo(band.end[0], band.end[1]);
    context.stroke();
    context.lineCap = 'butt';
    context.setLineDash([band.dashPeriodPx * 0.55, band.dashPeriodPx * 0.45]);
    // Negative offset marches the dashes toward the arrow, i.e. downrange.
    context.strokeStyle = CORRIDOR_AMBER;
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(band.start[0], band.start[1]);
    context.lineTo(band.end[0], band.end[1]);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = CORRIDOR_AMBER;
    context.beginPath();
    context.moveTo(band.arrowTip[0], band.arrowTip[1]);
    context.lineTo(
      band.end[0] + Math.cos(band.headingRadians + 2.5) * band.arrowSizePx,
      band.end[1] + Math.sin(band.headingRadians + 2.5) * band.arrowSizePx,
    );
    context.lineTo(
      band.end[0] + Math.cos(band.headingRadians - 2.5) * band.arrowSizePx,
      band.end[1] + Math.sin(band.headingRadians - 2.5) * band.arrowSizePx,
    );
    context.closePath();
    context.fill();
    context.globalAlpha = 1;
  }
  for (const pin of plan.pins) {
    if (pin.haloPx > pin.radiusPx) {
      context.globalAlpha = 0.35;
      context.strokeStyle = CORRIDOR_AMBER;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(pin.at[0], pin.at[1], pin.haloPx, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
    context.globalAlpha = pin.provisional ? 0.75 : 1;
    context.fillStyle = CORRIDOR_AMBER;
    context.beginPath();
    context.arc(pin.at[0], pin.at[1], pin.radiusPx, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PIN_RING;
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = PIN_TEXT;
    context.font = '900 11px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(pin.label, pin.at[0], pin.at[1] + 1);
    context.globalAlpha = 1;
  }
  context.restore();
}
