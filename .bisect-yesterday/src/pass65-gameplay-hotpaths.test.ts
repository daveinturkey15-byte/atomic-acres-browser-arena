import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advancePresentationFrameAnchor, presentationFrameDue } from './pass65-settings';

const collisionSource = readFileSync(new URL('./collision.ts', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('Pass 65 gameplay hot-path contracts', () => {
  it('keeps the collider slab loop free of per-axis and per-collider temporary arrays', () => {
    const slabStart = collisionSource.indexOf('function segmentSlabHit(');
    const slabEnd = collisionSource.indexOf('\nfunction cross2d(', slabStart);
    const slab = collisionSource.slice(slabStart, slabEnd);
    expect(slab).not.toContain('const starts = [');
    expect(slab).not.toContain('const deltas = [');
    expect(slab).not.toContain('const halfSizes = [');
    expect(slab).not.toContain('[first, second] =');

    const sweepStart = collisionSource.indexOf('export function sweepSphereAgainstBoxes(');
    const sweepEnd = collisionSource.indexOf('\n/** Exact sphere overlap', sweepStart);
    const sweep = collisionSource.slice(sweepStart, sweepEnd);
    expect(sweep).toContain('worldPointToLocalInto(frame, start, collisionLocalStartScratch)');
    expect(sweep).toContain('worldVectorToLocalInto(frame, delta, collisionLocalDeltaScratch)');
    expect(sweep).not.toContain('const localStart = worldPointToLocal(');
    expect(sweep).not.toContain('const localDelta = worldVectorToLocal(');
    expect(sweep).not.toContain('let best: SweptSphereHit');
  });

  it('schedules a 60 Hz minimap independently of a 144 Hz presentation loop', () => {
    let anchor = 0;
    let renders = 0;
    for (let frame = 1; frame <= 144; frame += 1) {
      const now = frame * (1_000 / 144);
      if (!presentationFrameDue(now, anchor, 60)) continue;
      anchor = advancePresentationFrameAnchor(now, anchor, 60);
      renders += 1;
    }
    expect(renders).toBeGreaterThanOrEqual(59);
    expect(renders).toBeLessThanOrEqual(61);

    const minimapStart = runtimeSource.indexOf('function updateMinimap(');
    const minimapEnd = runtimeSource.indexOf('\nfunction updateHud(', minimapStart);
    const minimap = runtimeSource.slice(minimapStart, minimapEnd);
    expect(minimap).toContain('presentationFrameDue(now, lastMinimapRenderAt, MINIMAP_RENDER_HZ)');
    expect(minimap).toContain('advancePresentationFrameAnchor(now, lastMinimapRenderAt, MINIMAP_RENDER_HZ)');
    expect(minimap).toContain('if (headingElement.textContent !== headingText)');
  });
});
