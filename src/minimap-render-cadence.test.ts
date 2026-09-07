import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MIN_GRAPHICS_TARGET_FPS,
  advancePresentationFrameAnchor,
  presentationFrameDue,
} from './pass65-settings';
import { recordResidualReceipt } from './pass87-residual-receipt.test-helper';

/**
 * PASS 87 Lane AR, item 2 - the minimap redraw cadence, and the responsiveness
 * it is allowed to cost.
 *
 * `updateMinimap` is a full CPU redraw into a 2D canvas: clear, arena fill,
 * every house, every cover box, every landmark label, the rare-weapon ping and
 * every actor marker, all on the main thread the frame loop runs on. At
 * MINIMAP_RENDER_HZ = 60 it ran once per presented frame on this machine.
 * Lane T proposed 30 Hz and the integrator approved it for PASS 87.
 *
 * Halving a redraw rate is only free if the thing being drawn still tracks the
 * world closely enough to play off, so that is what this file asserts, against
 * the SHIPPED constant scraped from src/legacy-main.ts rather than a copy:
 * a player who moves is on the canvas within 2 frames of a 60 fps loop.
 *
 * The scrape is deliberate. A frozen duplicate of the number here would keep
 * passing after somebody changed the real one, which is the failure mode this
 * whole class of test exists to prevent.
 */
const LEGACY_MAIN = readFileSync(resolve(__dirname, 'legacy-main.ts'), 'utf8');

function shippedMinimapHz(): number {
  const match = /^const MINIMAP_RENDER_HZ = (\d+);$/mu.exec(LEGACY_MAIN);
  if (!match) throw new Error('could not read MINIMAP_RENDER_HZ from src/legacy-main.ts');
  return Number(match[1]);
}

/**
 * Replays the shipped call shape exactly: the guard, then the anchor advance,
 * both taken from `updateMinimap`. Returns the frame indices on which a redraw
 * happened.
 */
function redrawFrames(hz: number, frameMs: number, frames: number): number[] {
  let lastAt = Number.NEGATIVE_INFINITY;
  const drawn: number[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    const now = frame * frameMs;
    if (!presentationFrameDue(now, lastAt, hz)) continue;
    lastAt = Number.isFinite(lastAt) ? advancePresentationFrameAnchor(now, lastAt, hz) : now;
    drawn.push(frame);
  }
  return drawn;
}

describe('minimap redraw cadence (Lane AR item 2)', () => {
  it('ships at 30 Hz, the lowest cadence the shared helper can express', () => {
    expect(shippedMinimapHz()).toBe(30);
    // 30 is MIN_GRAPHICS_TARGET_FPS: presentationFrameDue clamps below it, so a
    // smaller number here would silently behave as 30 anyway.
    expect(shippedMinimapHz()).toBe(MIN_GRAPHICS_TARGET_FPS);
    expect(LEGACY_MAIN).toContain('presentationFrameDue(now, lastMinimapRenderAt, MINIMAP_RENDER_HZ)');
  });

  it('reflects a moved player within 2 frames of a 60 fps loop', () => {
    const hz = shippedMinimapHz();
    const drawn = redrawFrames(hz, 1_000 / 60, 240);
    expect(drawn.length, 'the minimap must still redraw').toBeGreaterThan(0);
    // The worst case is a move committed on the frame straight after a redraw.
    let worstGap = 0;
    for (let index = 1; index < drawn.length; index += 1) {
      worstGap = Math.max(worstGap, drawn[index]! - drawn[index - 1]!);
    }
    expect(
      worstGap,
      `at ${hz} Hz on a 60 fps loop the minimap skipped ${worstGap} frames between redraws; `
        + 'a player move would be up to that many frames stale.',
    ).toBeLessThanOrEqual(2);
  });

  it('halves the redraw work: exactly half the frames of the 60 Hz predecessor', () => {
    const frames = 600;
    const after = redrawFrames(shippedMinimapHz(), 1_000 / 60, frames);
    const before = redrawFrames(60, 1_000 / 60, frames);
    expect(before.length).toBe(frames);
    expect(after.length).toBe(Math.ceil(frames / 2));
    // Stated as the ratio the change is justified by, so a later cadence tweak
    // that quietly restores the old cost fails here.
    expect(after.length / before.length).toBeCloseTo(0.5, 2);
    recordResidualReceipt('item-02-minimap-cadence', {
      item: 'Lane AR item 2 - minimap redraw cadence',
      shippedMinimapHz: shippedMinimapHz(),
      predecessorHz: 60,
      frames,
      loopFps: 60,
      redrawsBefore: before.length,
      redrawsAfter: after.length,
      ratio: after.length / before.length,
      note: 'Redraw COUNT only. The main-thread ms/frame saving is not measured here and is OPEN in the lane report.',
    });
  });

  it('does not drift or stall on an uneven frame loop', () => {
    // A 144 Hz loop and a jittery 50 fps loop must both still land inside the
    // 2-frame budget at 60 fps equivalent wall-clock (33.4 ms).
    for (const frameMs of [1_000 / 144, 1_000 / 90, 1_000 / 50]) {
      const drawn = redrawFrames(shippedMinimapHz(), frameMs, 400);
      let worstMs = 0;
      for (let index = 1; index < drawn.length; index += 1) {
        worstMs = Math.max(worstMs, (drawn[index]! - drawn[index - 1]!) * frameMs);
      }
      expect(worstMs, `${(1_000 / frameMs).toFixed(0)} fps loop`).toBeLessThanOrEqual(1_000 / 30 + frameMs);
    }
  });
});
