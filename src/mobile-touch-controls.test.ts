import { describe, expect, it } from 'vitest';
import {
  MOBILE_TOUCH_ACTION_GROUPS,
  mobileOverlayVisible,
  mobileTouchFireBypassesPointerLock,
  shouldSuppressMobileBrowserSelection,
  sustainedMobileLookDelta,
  touchStickAxis,
} from './mobile-touch-controls';

describe('mobile touch controls', () => {
  it('PASS 84: a connected gamepad suppresses the overlay and disconnect restores it', () => {
    expect(mobileOverlayVisible(true, true, false)).toBe(true);
    expect(mobileOverlayVisible(true, true, true)).toBe(false);
    expect(mobileOverlayVisible(true, false, false)).toBe(false);
    expect(mobileOverlayVisible(false, true, false)).toBe(false);
  });

  it('allows held mobile fire while pointer lock is unavailable', () => {
    expect(mobileTouchFireBypassesPointerLock(true, true)).toBe(true);
    expect(mobileTouchFireBypassesPointerLock(false, true)).toBe(false);
    expect(mobileTouchFireBypassesPointerLock(true, false)).toBe(false);
  });

  it('suppresses browser selection only on the live non-editable game surface', () => {
    expect(shouldSuppressMobileBrowserSelection(true, false)).toBe(true);
    expect(shouldSuppressMobileBrowserSelection(true, true)).toBe(false);
    expect(shouldSuppressMobileBrowserSelection(false, false)).toBe(false);
  });

  it('exposes one unique semantic action inventory including mobile parity controls', () => {
    const actions = MOBILE_TOUCH_ACTION_GROUPS.flatMap(({ buttons }) => buttons.map(({ id }) => id));
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toEqual([
      'fire', 'ads', 'reload', 'switch-weapon',
      'jump', 'crouch', 'prone', 'grenade', 'melee',
      'sprint', 'interact', 'support-cycle', 'support-activate',
      'pause',
    ]);
    for (const group of MOBILE_TOUCH_ACTION_GROUPS) {
      expect(group.label.length).toBeGreaterThan(0);
      for (const button of group.buttons) expect(button.ariaLabel.length).toBeGreaterThan(0);
    }
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
