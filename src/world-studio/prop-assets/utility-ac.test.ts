import { describe, expect, it } from 'vitest';

import {
  UTILITY_AC_ASSET_PATH,
  UTILITY_AC_DIMENSIONS,
  UTILITY_AC_PLACEMENT,
  resolveUtilityAcUrl,
} from './utility-ac';

describe('utility-ac prop asset', () => {
  it('resolves the export path against an explicit base', () => {
    expect(resolveUtilityAcUrl('https://example.test/game/')).toBe(
      `https://example.test/game/${UTILITY_AC_ASSET_PATH}`,
    );
  });

  it('resolves host-relative when no base is configured', () => {
    expect(resolveUtilityAcUrl()).toBe(`/${UTILITY_AC_ASSET_PATH}`);
  });

  it('declares ground-zero placement so the arena owner drops the pad base on grade', () => {
    expect(UTILITY_AC_PLACEMENT.position[1]).toBe(0);
  });

  it('declares a pad footprint that contains the cabinet and feet', () => {
    expect(UTILITY_AC_DIMENSIONS.padHalfExtentX).toBeGreaterThanOrEqual(
      UTILITY_AC_DIMENSIONS.cabinetWidth / 2,
    );
    expect(UTILITY_AC_DIMENSIONS.padHalfExtentZ).toBeGreaterThanOrEqual(
      UTILITY_AC_DIMENSIONS.cabinetDepth / 2,
    );
  });

  it('declares a height that contains the fan grille hub', () => {
    expect(UTILITY_AC_DIMENSIONS.height).toBeGreaterThanOrEqual(0.9);
  });
});
