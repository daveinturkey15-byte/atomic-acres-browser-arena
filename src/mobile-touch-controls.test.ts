import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MOBILE_CONTROLS_STORAGE_KEY,
  MOBILE_TOUCH_ACTION_GROUPS,
  isTouchCapableDevice,
  mobileOverlayVisible,
  mobileTouchFireBypassesPointerLock,
  readMobileControlsPreference,
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

  /**
   * PASS 85 Lane AE. Source-pinned rather than behavioural because this suite
   * runs in the `node` environment with no DOM: there is no element to mount an
   * overlay into and no synthesised compatibility click to observe. The
   * behaviour itself IS measured, in
   * `scripts/qa/verify-mobile-emulated-devices.mjs`, which taps PAUSE with real
   * CDP touch input on three emulated devices and fails if any second surface
   * opens from the same tap. This test exists so that deleting the listener -
   * which looks redundant next to the `preventDefault()` already in
   * `onPointerDown` - fails in the fast suite instead of on a phone.
   *
   * Why the pointerdown `preventDefault()` is NOT enough: per the Pointer
   * Events specification, cancelling a pointerdown does not suppress the
   * browser's compatibility mouse events. Only cancelling `touchstart` does,
   * and a listener can only cancel it if it is registered non-passively.
   */
  it('cancels the compatibility click a touch tap would fire at the surface underneath', () => {
    const source = readFileSync(fileURLToPath(new URL('./mobile-touch-controls.ts', import.meta.url)), 'utf8');
    const listener = /root\.addEventListener\(\s*'touchstart'[\S\s]*?\{\s*passive:\s*false\s*\}\s*\)/u.exec(source);
    expect(listener, 'the overlay must register a NON-PASSIVE touchstart listener').not.toBeNull();
    expect(listener![0], 'it must cancel the tap only for real overlay controls')
      .toContain("closest('[data-mtc]')");
    expect(listener![0], 'and cancelling is the whole point of it').toContain('preventDefault()');
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

  it('HF-536: does not auto-mount touch controls on a desktop device with mouse/keyboard even if maxTouchPoints > 0', () => {
    const originalWindow = globalThis.window;
    const originalMaxTouchPoints = globalThis.navigator.maxTouchPoints;
    try {
      Object.defineProperty(globalThis, 'window', {
        value: {
          matchMedia: (query: string) => ({
            matches: query === '(pointer: fine)' || query === '(hover: hover)',
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          } as MediaQueryList),
        } as unknown as Window & typeof globalThis,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'maxTouchPoints', { value: 10, configurable: true, writable: true });

      expect(isTouchCapableDevice()).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
      Object.defineProperty(globalThis.navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true, writable: true });
    }
  });

  it('HF-536: auto-mounts touch controls on an actual touch device (coarse pointer, no fine mouse)', () => {
    const originalWindow = globalThis.window;
    const originalMaxTouchPoints = globalThis.navigator.maxTouchPoints;
    try {
      Object.defineProperty(globalThis, 'window', {
        value: {
          matchMedia: (query: string) => ({
            matches: query === '(pointer: coarse)' || query === '(hover: none)',
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          } as MediaQueryList),
        } as unknown as Window & typeof globalThis,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'maxTouchPoints', { value: 5, configurable: true, writable: true });

      expect(isTouchCapableDevice()).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
      Object.defineProperty(globalThis.navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true, writable: true });
    }
  });

  it('HF-536: readMobileControlsPreference honors URL query override over storage and device', () => {
    const originalWindow = globalThis.window;
    const originalMaxTouchPoints = globalThis.navigator.maxTouchPoints;
    try {
      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { search: '?touch=1' } as Location,
          localStorage: { getItem: () => null } as unknown as Storage,
          matchMedia: () => ({ matches: false } as unknown as MediaQueryList),
        } as unknown as Window & typeof globalThis,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'maxTouchPoints', { value: 0, configurable: true, writable: true });
      expect(readMobileControlsPreference()).toBe(true);

      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { search: '?touch=0' } as Location,
          localStorage: { getItem: () => 'on' } as unknown as Storage,
          matchMedia: (q: string) => ({ matches: q === '(pointer: coarse)' } as unknown as MediaQueryList),
        } as unknown as Window & typeof globalThis,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'maxTouchPoints', { value: 5, configurable: true, writable: true });
      expect(readMobileControlsPreference()).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
      Object.defineProperty(globalThis.navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true, writable: true });
    }
  });

  it('HF-536: readMobileControlsPreference honors explicit localStorage preference', () => {
    const originalWindow = globalThis.window;
    const originalMaxTouchPoints = globalThis.navigator.maxTouchPoints;
    try {
      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { search: '' } as Location,
          localStorage: {
            getItem: (key: string) => (key === MOBILE_CONTROLS_STORAGE_KEY ? 'on' : null),
          } as unknown as Storage,
          matchMedia: (q: string) => ({ matches: q === '(pointer: fine)' } as unknown as MediaQueryList),
        } as unknown as Window & typeof globalThis,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'maxTouchPoints', { value: 0, configurable: true, writable: true });
      expect(readMobileControlsPreference()).toBe(true);

      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { search: '' } as Location,
          localStorage: {
            getItem: (key: string) => (key === MOBILE_CONTROLS_STORAGE_KEY ? 'off' : null),
          } as unknown as Storage,
          matchMedia: (q: string) => ({ matches: q === '(pointer: coarse)' } as unknown as MediaQueryList),
        } as unknown as Window & typeof globalThis,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'maxTouchPoints', { value: 5, configurable: true, writable: true });
      expect(readMobileControlsPreference()).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
      Object.defineProperty(globalThis.navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true, writable: true });
    }
  });
});
