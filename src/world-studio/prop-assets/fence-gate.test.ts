import { describe, expect, it } from 'vitest';

import {
  FENCE_GATE_ASSET_PATH,
  FENCE_GATE_DIMENSIONS,
  FENCE_GATE_PLACEMENT,
  resolveFenceGateUrl,
} from './fence-gate';

describe('fence-gate prop asset', () => {
  it('resolves the export path against an explicit base', () => {
    expect(resolveFenceGateUrl('https://example.test/game/')).toBe(
      `https://example.test/game/${FENCE_GATE_ASSET_PATH}`,
    );
  });

  it('resolves host-relative when no base is configured', () => {
    expect(resolveFenceGateUrl()).toBe(`/${FENCE_GATE_ASSET_PATH}`);
  });

  it('declares ground-zero placement so the arena owner drops the origin on the boundary line', () => {
    expect(FENCE_GATE_PLACEMENT.position[1]).toBe(0);
  });

  it('declares a run that contains the gate opening plus both fixed bays', () => {
    // Two 1.8 m bays plus the 1.8 m gate opening, posts at +-2.7 m.
    expect(FENCE_GATE_DIMENSIONS.runHalfLength).toBeGreaterThanOrEqual(2.7);
  });

  it('declares a leaf swing reach the arena owner must keep clear of circulation', () => {
    // 1.72 m leaf at 32 degrees: tip reaches ~0.91 m off the run line.
    expect(FENCE_GATE_DIMENSIONS.leafSwingReach).toBeGreaterThanOrEqual(0.9);
  });

  it('declares a height that contains the post caps', () => {
    expect(FENCE_GATE_DIMENSIONS.height).toBeGreaterThanOrEqual(1.9);
  });
});
