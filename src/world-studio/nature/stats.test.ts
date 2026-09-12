/**
 * Frozen build ledger for the world-studio nature lane. Measured 2026-09-12
 * at the first implementation; a change to any count here is a deliberate
 * re-measure recorded in docs/forge/WORLD_STUDIO_NATURE.md, never an edit to
 * make a red test green.
 */
import { describe, expect, it } from 'vitest';
import { createStudioNature } from './index';

export const WS_NATURE_LEDGER_20260912 = Object.freeze({
  triangles: 94794,
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
