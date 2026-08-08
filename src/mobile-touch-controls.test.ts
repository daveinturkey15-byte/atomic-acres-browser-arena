import { describe, expect, it } from 'vitest';
import {
  mobileTouchFireBypassesPointerLock,
  sustainedMobileLookDelta,
  touchStickAxis,
} from './mobile-touch-controls';

describe('mobile touch controls', () => {
  it('allows held mobile fire while pointer lock is unavailable', () => {
    expect(mobileTouchFireBypassesPointerLock(true, true)).toBe(true);
    expect(mobileTouchFireBypassesPointerLock(false, true)).toBe(false);
    expect(mobileTouchFireBypassesPointerLock(true, false)).toBe(false);
  });

  it('turns a held look-stick axis into a bounded per-frame delta', () => {
    expect(sustainedMobileLookDelta(0, 0)).toEqual({ x: 0, y: 0 });
    expect(sustainedMobileLookDelta(1, -1)).toEqual({ x: 0.035, y: -0.035 });
    expect(sustainedMobileLookDelta(4, -4)).toEqual({ x: 0.035, y: -0.035 });
  });

  it('maps centre, inner and edge presses to gamepad-shaped radial axes', () => {
    const bounds = { left: 100, top: 200, width: 120, height: 120 };
    expect(touchStickAxis(160, 260, bounds)).toEqual({ x: 0, y: 0 });
    const inner = touchStickAxis(190, 260, bounds);
    expect(inner.x).toBeGreaterThan(0);
    expect(inner.x).toBeLessThan(1);
    expect(inner.y).toBe(0);
    expect(touchStickAxis(220, 260, bounds)).toEqual({ x: 1, y: 0 });
    const diagonal = touchStickAxis(220, 320, bounds);
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(diagonal.y).toBeCloseTo(Math.SQRT1_2, 5);
  });
});
