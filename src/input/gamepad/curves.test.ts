import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAMEPAD_SETTINGS,
  GAMEPAD_SETTINGS_STORAGE_KEY,
  buttonPressed,
  isDefaultGamepadSettings,
  normalizeGamepadSettings,
  readGamepadSettings,
  shapeStick,
  writeGamepadSettings,
} from './curves';

class FakeStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

describe('stick shaping', () => {
  const curve = DEFAULT_GAMEPAD_SETTINGS.lookCurve;

  it('returns zero inside the radial deadzone and for non-finite input', () => {
    expect(shapeStick(0.05, 0.05, curve)).toEqual({ x: 0, y: 0 });
    expect(shapeStick(0.1, 0, curve)).toEqual({ x: 0, y: 0 });
    expect(shapeStick(Number.NaN, 0.5, curve)).toEqual({ x: 0, y: 0 });
  });

  it('preserves direction, saturates at the outer deadzone and never exceeds unit magnitude', () => {
    const diagonal = shapeStick(0.6, 0.6, curve);
    expect(diagonal.x).toBeCloseTo(diagonal.y, 10);
    const full = shapeStick(1, 0, curve);
    expect(full.x).toBeCloseTo(1, 10);
    const beyond = shapeStick(1.4, 0.3, curve);
    expect(Math.hypot(beyond.x, beyond.y)).toBeCloseTo(1, 10);
    const nearOuter = shapeStick(1 - curve.outer, 0, curve);
    expect(nearOuter.x).toBeCloseTo(1, 10);
  });

  it('applies the exponent so a finer centre stays below linear', () => {
    const linear = shapeStick(0.5, 0, { deadzone: 0, exponent: 1, outer: 0 });
    const fine = shapeStick(0.5, 0, { deadzone: 0, exponent: 2, outer: 0 });
    expect(linear.x).toBeCloseTo(0.5, 10);
    expect(fine.x).toBeCloseTo(0.25, 10);
    // Monotonic across the range.
    let previous = 0;
    for (let magnitude = 0; magnitude <= 1; magnitude += 0.05) {
      const value = shapeStick(magnitude, 0, curve).x;
      expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = value;
    }
  });

  it('matches the legacy radial deadzone feel at the defaults (0.10/1.6) in the mid range', () => {
    // Legacy: ((m - dz) / (1 - dz)) ^ 1.6 with no outer deadzone.
    const legacy = Math.pow((0.55 - 0.1) / 0.9, 1.6);
    const shaped = shapeStick(0.55, 0, curve).x;
    expect(Math.abs(shaped - legacy)).toBeLessThan(0.03);
  });
});

describe('button thresholds', () => {
  it('treats digital presses and analogue travel consistently', () => {
    expect(buttonPressed({ pressed: true, value: 0 })).toBe(true);
    expect(buttonPressed({ pressed: false, value: 0.6 })).toBe(true);
    expect(buttonPressed({ pressed: false, value: 0.5 })).toBe(false);
    expect(buttonPressed({ pressed: false, value: 0.3 }, 0.22)).toBe(true);
    expect(buttonPressed(undefined)).toBe(false);
  });
});

describe('gamepad settings persistence', () => {
  it('clamps every field and falls back to defaults for junk', () => {
    const normalized = normalizeGamepadSettings({
      moveCurve: { deadzone: 5, exponent: 0.1, outer: -1 },
      lookCurve: { deadzone: 'x', exponent: 2, outer: 0.05 },
      invertLookY: 'yes',
      rumble: false,
    });
    expect(normalized.moveCurve).toEqual({ deadzone: 0.6, exponent: 0.5, outer: 0 });
    expect(normalized.lookCurve).toEqual({ deadzone: DEFAULT_GAMEPAD_SETTINGS.lookCurve.deadzone, exponent: 2, outer: 0.05 });
    expect(normalized.invertLookY).toBe(false);
    expect(normalized.rumble).toBe(false);
    expect(normalizeGamepadSettings(null)).toEqual(DEFAULT_GAMEPAD_SETTINGS);
    expect(isDefaultGamepadSettings(normalizeGamepadSettings(undefined))).toBe(true);
    expect(isDefaultGamepadSettings(normalized)).toBe(false);
  });

  it('round-trips through storage and survives a storage-less context', () => {
    const storage = new FakeStorage();
    expect(readGamepadSettings(storage)).toBe(DEFAULT_GAMEPAD_SETTINGS);
    const custom = normalizeGamepadSettings({ ...DEFAULT_GAMEPAD_SETTINGS, rumble: false, invertLookY: true });
    expect(writeGamepadSettings(custom, storage)).toBe(true);
    expect(readGamepadSettings(storage)).toEqual(custom);
    storage.setItem(GAMEPAD_SETTINGS_STORAGE_KEY, '{oops');
    expect(readGamepadSettings(storage)).toBe(DEFAULT_GAMEPAD_SETTINGS);
    expect(readGamepadSettings(null)).toBe(DEFAULT_GAMEPAD_SETTINGS);
    expect(writeGamepadSettings(custom, null)).toBe(true);
  });
});
