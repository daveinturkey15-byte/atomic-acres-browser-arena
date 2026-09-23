/**
 * Frozen build ledger for the world-studio nature lane. Measured 2026-09-12
 * at the first implementation; a change to any count here is a deliberate
 * re-measure recorded in docs/forge/WORLD_STUDIO_NATURE.md, never an edit to
 * make a red test green.
 *
 * Re-measured 2026-09-12 (visual correction): triangles 94794 -> 93468.
 * Census: trunks and branches became open-ended cylinders (-caps on all
 * three species), the conifer canopy became a 4-cone core plus 34 spray
 * cards and an open leader (was 6 cones + capped leader). Instance counts,
 * draw groups and texture count are unchanged.
 */
import { describe, expect, it } from 'vitest';
import { createStudioNature } from './index';

export const WS_NATURE_LEDGER_20260912 = Object.freeze({
  triangles: 93468,
  drawGroups: 25,
  textures: 9,
  trees: Object.freeze({ broadleaf: 58, conifer: 98, birch: 46, far: 720 }),
  gardens: Object.freeze({ hedgeSegments: 18, hedgeSprigs: 650, flowers: 733, lawnTufts: 2551 }),
  boulders: 30,
});

describe('world-studio nature ledger', () => {
  it('matches the recorded 2026-09-12 measurement exactly', () => {
    const nature = createStudioNature();
    const ledger = { ...nature.stats, trees: { ...nature.stats.trees }, gardens: { ...nature.stats.gardens } };
    // eslint-disable-next-line no-console
    console.log(`WS_NATURE_LEDGER ${JSON.stringify(ledger)}`);
    expect(ledger).toEqual(WS_NATURE_LEDGER_20260912);
    nature.dispose();
  });
});
