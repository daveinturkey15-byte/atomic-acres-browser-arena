import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CARPET_BOMBER_MAX_RUN_LENGTH_M,
  createCarpetCorridorTargeting,
  registerCarpetCorridorPoint,
} from './carpet-corridor-targeting';
import { carpetCorridorOverlayPlan, carpetCorridorPrompt } from './ui/carpet-corridor-map-overlay';

/**
 * HF-369 wiring pin (HF-536 S1 salvage, 2026-09-06).
 *
 * Owner, verbatim: "should be clearer that the 2nd click of the carpet bomb is
 * for its direction, animated on the map maybe when selecting the drop and
 * direction pins."
 *
 * `src/ui/carpet-corridor-map-overlay.ts` fixes that and was deleted unwired by
 * `ccfeec86`; its own 22 tests stayed green the entire time the shipping map was
 * still printing 'SELECT RUN START AND END' for both clicks. That is the failure
 * mode this file exists to catch: unit-green module, dead in the product. It
 * reads the shipping source, like `src/radar-fire-reveal-main-integration.test.ts`.
 *
 * The solver (`src/carpet-corridor-targeting.ts`) is deliberately not touched by
 * the wiring, so the preview and the dispatched intent stay one solve.
 */
const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function block(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

const BOUNDS = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
const project = (x: number, z: number) => [x, z] as const;

describe('HF-369: the tactical map names the click you are on', () => {
  it('has retired the caption that named both clicks at once', () => {
    expect(source).not.toContain('SELECT RUN START AND END');
    expect(source).not.toContain('CLICK RUN START THEN RUN END');
    // And the START/END pin labels that made click one look like a Care Package
    // drop marker are gone with the raw-drag draw they belonged to.
    expect(source).not.toContain("index === 0 ? 'START' : 'END'");
  });

  it('derives both captions from the corridor stage, never from a literal', () => {
    const map = block('function drawStrikeMap(now = performance.now()): void {', '\nfunction beginTriPassTargeting(');
    expect(map).toContain('const corridorPrompt = carpetCorridorTargeting ? carpetCorridorPrompt(carpetCorridorTargeting) : null;');
    expect(map).toContain("element<HTMLElement>('#strike-target-instruction').textContent = corridorPrompt\n    ? corridorPrompt.instruction");
    expect(map).toContain("element<HTMLElement>('#strike-target-help').innerHTML = corridorPrompt\n    ? corridorPrompt.help");
    // Care Package and Tri-Pass keep their own one-click captions.
    expect(map).toContain("? 'SELECT DELIVERY AREA'");
    expect(map).toContain("      : 'SELECT THREE TARGETS';");
  });

  it('draws the corridor through the overlay module, with the map projection', () => {
    const map = block('function drawStrikeMap(now = performance.now()): void {', '\nfunction beginTriPassTargeting(');
    expect(map).toContain('drawCarpetCorridorOverlay(context, carpetCorridorOverlayPlan({');
    expect(map).toContain('state: carpetCorridorTargeting,');
    expect(map).toContain('project: (worldX, worldZ) => worldToTacticalMap(worldX, worldZ, arena.bounds, width, height),');
    // The band half-width is still measured in world metres and projected, so it
    // stays correct on maps of different sizes.
    expect(map).toContain('const [halfWidthProbeX] = worldToTacticalMap(CARPET_CORRIDOR_BAND_HALF_WIDTH_M, 0, arena.bounds, width, height);');
    expect(map).toContain('bandHalfWidthPx: Math.max(6, Math.abs(halfWidthProbeX - originX)),');
    // Animation phase comes from the draw's own clock, and reduced motion is
    // honoured rather than being a second code path.
    expect(map).toContain('nowMs: now,');
    expect(map).toContain('reducedMotion: accessibilityRuntime.reducedMotion,');
    expect(source).toContain(
      "import { carpetCorridorOverlayPlan, carpetCorridorPrompt, drawCarpetCorridorOverlay } from './ui/carpet-corridor-map-overlay';",
    );
  });

  it('leaves the solver as the single source of the run', () => {
    // The wiring must not re-derive a corridor beside carpet-corridor-targeting;
    // that drift is what let the preview disagree with the bombed run.
    const map = block('function drawStrikeMap(now = performance.now()): void {', '\nfunction beginTriPassTargeting(');
    expect(map).not.toContain('carpetCorridorRunFromPoints(');
    expect(map).not.toContain('Math.atan2(end[1] - start[1], end[0] - start[0])');
    expect(source.match(/drawCarpetCorridorOverlay\(/g)).toHaveLength(1);
  });

  it('says step 1 of 2 before the drop pin and step 2 of 2 for the direction', () => {
    const empty = createCarpetCorridorTargeting();
    expect(carpetCorridorPrompt(empty).instruction).toContain('STEP 1 OF 2');
    expect(carpetCorridorPrompt(empty).instruction).toContain('DROP POINT');
    const afterDrop = registerCarpetCorridorPoint(empty, { x: 0, z: 0 }, BOUNDS);
    expect(carpetCorridorPrompt(afterDrop).instruction).toContain('STEP 2 OF 2');
    expect(carpetCorridorPrompt(afterDrop).instruction).toContain('DIRECTION');
    const complete = registerCarpetCorridorPoint(afterDrop, { x: 40, z: 0 }, BOUNDS);
    expect(carpetCorridorPrompt(complete).instruction).not.toContain('STEP 1');
    // Neither caption can print the retired sentence any more.
    for (const state of [empty, afterDrop, complete]) {
      expect(carpetCorridorPrompt(state).instruction).not.toBe('SELECT RUN START AND END');
    }
  });

  it('shows the direction stage as a compass dial, not a lone dot', () => {
    const afterDrop = registerCarpetCorridorPoint(createCarpetCorridorTargeting(), { x: 0, z: 0 }, BOUNDS);
    const plan = carpetCorridorOverlayPlan({
      state: afterDrop, project, bandHalfWidthPx: 8, nowMs: 600,
    });
    expect(plan.stage).toBe('direction');
    expect(plan.compass).not.toBeNull();
    expect(plan.pins.map((pin) => pin.label)).toEqual(['DROP']);
    // Frozen at phase zero under reduced motion, so the dial is a static ring.
    const still = carpetCorridorOverlayPlan({
      state: afterDrop, project, bandHalfWidthPx: 8, nowMs: 600, reducedMotion: true,
    });
    expect(still.compass?.sweepRadians).toBe(0);
  });

  it('draws the run the host will fly, not the raw drag', () => {
    const overLong = registerCarpetCorridorPoint(
      registerCarpetCorridorPoint(createCarpetCorridorTargeting(), { x: -60, z: 0 }, BOUNDS),
      { x: 60, z: 0 },
      BOUNDS,
    );
    const plan = carpetCorridorOverlayPlan({ state: overLong, project, bandHalfWidthPx: 8, nowMs: 0 });
    expect(plan.band).not.toBeNull();
    const drawnLength = Math.abs(plan.band!.end[0] - plan.band!.start[0]);
    expect(drawnLength).toBeCloseTo(CARPET_BOMBER_MAX_RUN_LENGTH_M, 5);
    // 120 m of drag, and the clamp is visible rather than silent.
    expect(drawnLength).toBeLessThan(120);
    expect(plan.guide).not.toBeNull();
    expect(plan.guide?.clamp).toBe('shortened');
  });
});
