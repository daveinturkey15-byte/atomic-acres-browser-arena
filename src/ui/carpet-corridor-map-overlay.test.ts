import { describe, expect, it } from 'vitest';
import {
  CARPET_BOMBER_MAX_RUN_LENGTH_M,
  createCarpetCorridorTargeting,
  registerCarpetCorridorPoint,
  type CarpetCorridorPoint,
  type CarpetCorridorTargeting,
} from '../carpet-corridor-targeting';
import {
  CARPET_CORRIDOR_COMPASS_PERIOD_MS,
  CARPET_CORRIDOR_DASH_PERIOD_PX,
  CARPET_CORRIDOR_PIN_PULSE_PERIOD_MS,
  carpetCorridorBearingDegrees,
  carpetCorridorOverlayPlan,
  carpetCorridorPrompt,
  drawCarpetCorridorOverlay,
  type CarpetCorridorDrawContext,
} from './carpet-corridor-map-overlay';

const BOUNDS = { minX: -64, maxX: 64, minZ: -64, maxZ: 64 } as const;
/** Same shape as the tactical map: +X right, +Z down, north (-Z) at the top. */
const project = (x: number, z: number) => [320 + x * 4, 320 + z * 4] as const;

function corridor(...points: readonly CarpetCorridorPoint[]): CarpetCorridorTargeting {
  return points.reduce(
    (state, point) => registerCarpetCorridorPoint(state, point, BOUNDS),
    createCarpetCorridorTargeting(),
  );
}

function plan(state: CarpetCorridorTargeting, extra: Partial<Parameters<typeof carpetCorridorOverlayPlan>[0]> = {}) {
  return carpetCorridorOverlayPlan({ state, project, bandHalfWidthPx: 12, nowMs: 0, ...extra });
}

describe('carpet corridor prompt copy (HF-369)', () => {
  it('says which of the two clicks the player is on', () => {
    const drop = carpetCorridorPrompt(corridor());
    expect(drop.stage).toBe('drop');
    expect(drop.step).toBe(1);
    expect(drop.instruction).toContain('STEP 1 OF 2');
    expect(drop.instruction).toMatch(/DROP POINT/);
    expect(drop.count).toBe('0 / 2');

    const direction = carpetCorridorPrompt(corridor({ x: 0, z: 0 }));
    expect(direction.stage).toBe('direction');
    expect(direction.step).toBe(2);
    expect(direction.instruction).toContain('STEP 2 OF 2');
    expect(direction.instruction).toMatch(/DIRECTION/);
    expect(direction.count).toBe('1 / 2');
  });

  it('never presents the two clicks as interchangeable', () => {
    const drop = carpetCorridorPrompt(corridor()).instruction;
    const direction = carpetCorridorPrompt(corridor({ x: 0, z: 0 })).instruction;
    expect(drop).not.toBe(direction);
    // The pre-HF-369 copy described the pair on both clicks; that is the defect.
    expect(drop).not.toMatch(/START AND END/i);
    expect(direction).not.toMatch(/START AND END/i);
  });

  it('keeps the ESC refund affordance the sibling targeting modes advertise', () => {
    for (const state of [corridor(), corridor({ x: 1, z: 1 })]) {
      expect(carpetCorridorPrompt(state).help).toContain('<kbd>ESC</kbd>');
    }
  });

  it('reports a completed corridor as confirmed rather than still asking for clicks', () => {
    const done = carpetCorridorPrompt(corridor({ x: 0, z: 0 }, { x: 30, z: 0 }));
    expect(done.stage).toBe('complete');
    expect(done.count).toBe('2 / 2');
    expect(done.instruction).not.toMatch(/CLICK/);
  });
});

describe('carpet corridor overlay plan (HF-369)', () => {
  it('shows nothing but the awaiting-drop readout before the first click', () => {
    const empty = plan(corridor());
    expect(empty.stage).toBe('drop');
    expect(empty.pins).toHaveLength(0);
    expect(empty.band).toBeNull();
    expect(empty.compass).toBeNull();
    expect(empty.readout).toMatch(/DROP/);
  });

  it('tracks the pointer with a provisional drop pin before the first click', () => {
    const hovering = plan(corridor(), { cursor: { x: 8, z: -4 } });
    expect(hovering.pins).toHaveLength(1);
    expect(hovering.pins[0]!.label).toBe('DROP');
    expect(hovering.pins[0]!.provisional).toBe(true);
    expect(hovering.pins[0]!.at).toEqual(project(8, -4));
  });

  it('raises a direction dial around the drop pin on the second click', () => {
    const waiting = plan(corridor({ x: 0, z: 0 }));
    expect(waiting.stage).toBe('direction');
    expect(waiting.compass).not.toBeNull();
    expect(waiting.compass!.at).toEqual(project(0, 0));
    expect(waiting.compass!.searching).toBe(true);
    expect(waiting.pins.map((pin) => pin.label)).toEqual(['DROP']);
    expect(waiting.band).toBeNull();
  });

  it('locks the dial to the pointer and previews the run under it', () => {
    const previewing = plan(corridor({ x: 0, z: 0 }), { cursor: { x: 0, z: -8 } });
    expect(previewing.compass!.searching).toBe(false);
    // Pointer is due north of the drop pin, i.e. straight up the canvas.
    expect(previewing.compass!.sweepRadians).toBeCloseTo(-Math.PI / 2, 6);
    expect(previewing.band).not.toBeNull();
    expect(previewing.band!.provisional).toBe(true);
    expect(previewing.provisional).toBe(true);
    expect(previewing.pins.map((pin) => pin.label)).toEqual(['DROP', 'DIRECTION']);
    expect(previewing.readout).toMatch(/HDG 000/);
  });

  it('draws the run the host will fly, not the raw drag, when the pick is too long', () => {
    const overlong = { x: CARPET_BOMBER_MAX_RUN_LENGTH_M * 1.5, z: 0 };
    const clamped = plan(corridor({ x: 0, z: 0 }), { cursor: overlong });
    const band = clamped.band!;
    const drawnPx = Math.hypot(band.end[0] - band.start[0], band.end[1] - band.start[1]);
    // 4 px per metre in this projection.
    expect(drawnPx).toBeCloseTo(CARPET_BOMBER_MAX_RUN_LENGTH_M * 4, 4);
    expect(band.start).not.toEqual(project(0, 0));
    expect(clamped.readout).toMatch(new RegExp(`RUN ${CARPET_BOMBER_MAX_RUN_LENGTH_M} M`));
    expect(clamped.readout).toMatch(/HELD TO/);
    // The raw pick survives as a faint guide so the correction is visible.
    expect(clamped.guide).not.toBeNull();
    expect(clamped.guide!.clamp).toBe('shortened');
    expect(clamped.guide!.end).toEqual(project(overlong.x, overlong.z));
  });

  it('omits the guide when the pick needed no correction', () => {
    expect(plan(corridor({ x: 0, z: 0 }), { cursor: { x: 30, z: 0 } }).guide).toBeNull();
  });

  it('commits the corridor once both clicks have landed', () => {
    const committed = plan(corridor({ x: -10, z: 0 }, { x: 20, z: 0 }));
    expect(committed.stage).toBe('complete');
    expect(committed.provisional).toBe(false);
    expect(committed.band!.provisional).toBe(false);
    expect(committed.compass).toBeNull();
    expect(committed.pins.every((pin) => !pin.provisional && !pin.active)).toBe(true);
  });

  it('points the arrow downrange, past the run end', () => {
    const east = plan(corridor({ x: -20, z: 0 }, { x: 20, z: 0 })).band!;
    expect(east.arrowTip[0]).toBeGreaterThan(east.end[0]);
    expect(east.headingRadians).toBeCloseTo(0, 6);
  });
});

describe('carpet corridor overlay animation (HF-369)', () => {
  const waiting = corridor({ x: 0, z: 0 });

  it('marches the corridor dashes downrange over time', () => {
    const state = corridor({ x: -20, z: 0 }, { x: 20, z: 0 });
    const first = plan(state, { nowMs: 0 }).band!.dashOffsetPx;
    const later = plan(state, { nowMs: 120 }).band!.dashOffsetPx;
    expect(first).toBe(0);
    expect(later).toBeLessThan(0);
    expect(Math.abs(later)).toBeLessThan(CARPET_CORRIDOR_DASH_PERIOD_PX);
  });

  it('sweeps the direction dial a full turn per period', () => {
    const quarter = plan(waiting, { nowMs: CARPET_CORRIDOR_COMPASS_PERIOD_MS / 4 }).compass!.sweepRadians;
    expect(quarter).toBeCloseTo(Math.PI / 2, 6);
    const full = plan(waiting, { nowMs: CARPET_CORRIDOR_COMPASS_PERIOD_MS }).compass!.sweepRadians;
    expect(full).toBeCloseTo(0, 6);
  });

  it('breathes the pin that is waiting for a click and holds the placed one still', () => {
    const halfBreath = plan(corridor(), {
      cursor: { x: 0, z: 0 },
      nowMs: CARPET_CORRIDOR_PIN_PULSE_PERIOD_MS / 2,
    }).pins[0]!;
    expect(halfBreath.active).toBe(true);
    expect(halfBreath.haloPx).toBeGreaterThan(halfBreath.radiusPx + 4);

    const placed = plan(waiting, { nowMs: CARPET_CORRIDOR_PIN_PULSE_PERIOD_MS / 2 }).pins[0]!;
    expect(placed.active).toBe(false);
    expect(placed.haloPx).toBe(placed.radiusPx);
  });

  it('freezes every moving part under reduced motion', () => {
    const state = corridor({ x: -20, z: 0 }, { x: 20, z: 0 });
    for (const nowMs of [0, 137, 4_321]) {
      const frozen = plan(state, { nowMs, reducedMotion: true });
      expect(frozen.band!.dashOffsetPx).toBe(0);
      const dial = plan(waiting, { nowMs, reducedMotion: true }).compass!;
      expect(dial.sweepRadians).toBe(0);
    }
  });

  it('is a pure function of its inputs', () => {
    const state = corridor({ x: 3, z: -6 }, { x: 24, z: 9 });
    expect(plan(state, { nowMs: 900 })).toEqual(plan(state, { nowMs: 900 }));
  });

  it('survives a non-finite clock or cursor rather than drawing NaN geometry', () => {
    const nanClock = plan(corridor({ x: 0, z: 0 }, { x: 30, z: 0 }), { nowMs: Number.NaN });
    expect(nanClock.band!.dashOffsetPx).toBe(0);
    expect(nanClock.band!.start.every(Number.isFinite)).toBe(true);
    const nanCursor = plan(corridor({ x: 0, z: 0 }), { cursor: { x: Number.NaN, z: 0 } });
    expect(nanCursor.band).toBeNull();
    expect(nanCursor.compass!.searching).toBe(true);
  });
});

describe('carpet corridor bearing', () => {
  it('reads 0 north, 90 east, 180 south, 270 west', () => {
    expect(carpetCorridorBearingDegrees(-Math.PI / 2)).toBeCloseTo(0, 6);
    expect(carpetCorridorBearingDegrees(0)).toBeCloseTo(90, 6);
    expect(carpetCorridorBearingDegrees(Math.PI / 2)).toBeCloseTo(180, 6);
    expect(carpetCorridorBearingDegrees(Math.PI)).toBeCloseTo(270, 6);
  });
});

describe('carpet corridor overlay renderer', () => {
  function recorder(): CarpetCorridorDrawContext & { calls: string[] } {
    const calls: string[] = [];
    const record = (name: string) => (...args: unknown[]) => {
      calls.push(`${name}(${args.map((value) => typeof value === 'number' ? value.toFixed(2) : String(value)).join(',')})`);
    };
    return {
      calls,
      save: record('save'),
      restore: record('restore'),
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      arc: record('arc'),
      closePath: record('closePath'),
      fill: record('fill'),
      stroke: record('stroke'),
      fillText: record('fillText'),
      setLineDash: record('setLineDash'),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineCap: 'butt',
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
    } as CarpetCorridorDrawContext & { calls: string[] };
  }

  it('balances save/restore and never emits NaN coordinates', () => {
    const context = recorder();
    drawCarpetCorridorOverlay(context, plan(corridor({ x: 0, z: 0 }), {
      cursor: { x: CARPET_BOMBER_MAX_RUN_LENGTH_M * 3, z: 4 },
      nowMs: 517,
    }));
    expect(context.calls[0]).toBe('save()');
    expect(context.calls.at(-1)).toBe('restore()');
    expect(context.calls.join('|')).not.toMatch(/NaN/);
    expect(context.globalAlpha).toBe(1);
  });

  it('labels the pins DROP and DIRECTION on the map itself', () => {
    const context = recorder();
    drawCarpetCorridorOverlay(context, plan(corridor({ x: -10, z: 0 }, { x: 20, z: 0 })));
    const text = context.calls.filter((call) => call.startsWith('fillText'));
    expect(text.some((call) => call.includes('DROP'))).toBe(true);
    expect(text.some((call) => call.includes('DIRECTION'))).toBe(true);
    expect(text.some((call) => call.includes('START') || call.includes('END'))).toBe(false);
  });

  it('draws nothing at all when the corridor has not started', () => {
    const context = recorder();
    drawCarpetCorridorOverlay(context, plan(corridor()));
    expect(context.calls).toEqual(['save()', 'restore()']);
  });
});
