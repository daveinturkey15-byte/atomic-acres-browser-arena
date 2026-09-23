import { describe, expect, it } from 'vitest';

import {
  GARDEN_SET_ASSET_PATH,
  GARDEN_SET_DIMENSIONS,
  GARDEN_SET_PLACEMENT,
  resolveGardenSetUrl,
} from './garden-set';

describe('garden-set prop asset', () => {
  it('resolves the export path against an explicit base', () => {
    expect(resolveGardenSetUrl('https://example.test/game/')).toBe(
      `https://example.test/game/${GARDEN_SET_ASSET_PATH}`,
    );
  });

  it('resolves host-relative when no base is configured', () => {
    expect(resolveGardenSetUrl()).toBe(`/${GARDEN_SET_ASSET_PATH}`);
  });

  it('declares ground-zero placement so the arena owner drops the origin on deck boards', () => {
    expect(GARDEN_SET_PLACEMENT.position[1]).toBe(0);
  });

  it('declares a footprint that contains the canopy and the chair ring', () => {
    expect(GARDEN_SET_DIMENSIONS.footprintHalfExtent).toBeGreaterThanOrEqual(
      GARDEN_SET_DIMENSIONS.canopyRadius,
    );
    // Chair ring 1.02 m plus chair half-depth; the measured vertex bound is 1.446 m.
    expect(GARDEN_SET_DIMENSIONS.footprintHalfExtent).toBeGreaterThanOrEqual(1.4);
  });

  it('declares a height that contains the parasol apex and finial', () => {
    expect(GARDEN_SET_DIMENSIONS.height).toBeGreaterThanOrEqual(2.4);
  });
});
