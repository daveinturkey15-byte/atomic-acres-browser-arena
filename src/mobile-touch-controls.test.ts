import { describe, expect, it } from 'vitest';
import {
  mobileTouchFireBypassesPointerLock,
  sustainedMobileLookDelta,
} from './mobile-touch-controls';

describe('mobile touch gameplay admission', () => {
  it('bypasses pointer lock only for a live firing touch presentation', () => {
    expect(mobileTouchFireBypassesPointerLock(true, true)).toBe(true);
    expect(mobileTouchFireBypassesPointerLock(true, false)).toBe(false);
    expect(mobileTouchFireBypassesPointerLock(false, true)).toBe(false);
  });

  it('turns a held look-stick axis into a bounded per-frame delta', () => {
    expect(sustainedMobileLookDelta(1, -1)).toEqual({ x: 0.035, y: -0.035 });
    expect(sustainedMobileLookDelta(99, -99)).toEqual({ x: 0.035, y: -0.035 });
    expect(sustainedMobileLookDelta(0, 0)).toEqual({ x: 0, y: 0 });
  });
});