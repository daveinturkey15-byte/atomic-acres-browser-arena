/**
 * Stick deadzones, response curves and the persisted gamepad settings
 * (PASS 84 Lane E). Pure math plus a small localStorage record that follows the
 * `MOBILE_CONTROLS_STORAGE_KEY` pattern: best-effort persistence, defaults on
 * any failure, never part of the player profile's exact-key schema.
 */

export type StickCurve = Readonly<{
  /** Inner radial deadzone (0–0.6): stick magnitudes below it read as zero. */
  deadzone: number;
  /** Response exponent (0.5–3): 1 is linear, >1 gives a finer centre. */
  exponent: number;
  /** Outer deadzone (0–0.2): magnitudes above 1 - outer saturate to 1. */
  outer: number;
}>;

export type GamepadSettings = Readonly<{
  version: 1;
  /** Master switch: false makes the runtime report no pad input (menus stay keyboard-driven). */
  enabled: boolean;
  moveCurve: StickCurve;
  lookCurve: StickCurve;
  /** Right-stick look rate multiplier (0.2–4, 1 = unchanged). Applied after the curve. */
  lookSensitivity: number;
  invertLookY: boolean;
  rumble: boolean;
}>;

export const GAMEPAD_SETTINGS_STORAGE_KEY = 'atomic-acres-gamepad-settings.v1';

export const STICK_CURVE_LIMITS = Object.freeze({
  deadzone: Object.freeze({ min: 0, max: 0.6 }),
  exponent: Object.freeze({ min: 0.5, max: 3 }),
  outer: Object.freeze({ min: 0, max: 0.2 }),
});

export const LOOK_SENSITIVITY_LIMITS = Object.freeze({ min: 0.2, max: 4 });

/** Sensible defaults: the values the legacy poll loop used, plus a small outer deadzone. */
export const DEFAULT_GAMEPAD_SETTINGS: GamepadSettings = Object.freeze({
  version: 1,
  enabled: true,
  moveCurve: Object.freeze({ deadzone: 0.14, exponent: 1.6, outer: 0.02 }),
  lookCurve: Object.freeze({ deadzone: 0.1, exponent: 1.6, outer: 0.03 }),
  lookSensitivity: 1,
  invertLookY: false,
  rumble: true,
});

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function normalizeStickCurve(value: unknown, fallback: StickCurve): StickCurve {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.freeze({
    deadzone: clampNumber(record.deadzone, STICK_CURVE_LIMITS.deadzone.min, STICK_CURVE_LIMITS.deadzone.max, fallback.deadzone),
    exponent: clampNumber(record.exponent, STICK_CURVE_LIMITS.exponent.min, STICK_CURVE_LIMITS.exponent.max, fallback.exponent),
    outer: clampNumber(record.outer, STICK_CURVE_LIMITS.outer.min, STICK_CURVE_LIMITS.outer.max, fallback.outer),
  });
}

export function normalizeGamepadSettings(value: unknown): GamepadSettings {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.freeze({
    version: 1,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : DEFAULT_GAMEPAD_SETTINGS.enabled,
    moveCurve: normalizeStickCurve(record.moveCurve, DEFAULT_GAMEPAD_SETTINGS.moveCurve),
    lookCurve: normalizeStickCurve(record.lookCurve, DEFAULT_GAMEPAD_SETTINGS.lookCurve),
    lookSensitivity: clampNumber(record.lookSensitivity, LOOK_SENSITIVITY_LIMITS.min, LOOK_SENSITIVITY_LIMITS.max, DEFAULT_GAMEPAD_SETTINGS.lookSensitivity),
    invertLookY: typeof record.invertLookY === 'boolean' ? record.invertLookY : DEFAULT_GAMEPAD_SETTINGS.invertLookY,
    rumble: typeof record.rumble === 'boolean' ? record.rumble : DEFAULT_GAMEPAD_SETTINGS.rumble,
  });
}

export function readGamepadSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): GamepadSettings {
  try {
    const raw = storage?.getItem(GAMEPAD_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_GAMEPAD_SETTINGS;
    return normalizeGamepadSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_GAMEPAD_SETTINGS;
  }
}

export function writeGamepadSettings(settings: GamepadSettings, storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    storage?.setItem(GAMEPAD_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeGamepadSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

export function clearGamepadSettings(storage: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  try { storage?.removeItem(GAMEPAD_SETTINGS_STORAGE_KEY); } catch { /* best effort */ }
}

export function isDefaultGamepadSettings(settings: GamepadSettings): boolean {
  return JSON.stringify(normalizeGamepadSettings(settings)) === JSON.stringify(DEFAULT_GAMEPAD_SETTINGS);
}

/**
 * Radial deadzone + outer saturation + response exponent. Direction is
 * preserved exactly (no per-axis snapping), so diagonals are not sticky.
 *
 *   m  = |(x, y)|
 *   m' = clamp((m - dz) / (1 - outer - dz), 0, 1) ^ exponent
 *   out = (x, y) / m * m'
 */
export function shapeStick(x: number, y: number, curve: StickCurve): { x: number; y: number } {
  if (![x, y].every(Number.isFinite)) return { x: 0, y: 0 };
  const deadzone = Math.min(0.99, Math.max(0, curve.deadzone));
  const outer = Math.min(0.5, Math.max(0, curve.outer));
  const exponent = Math.max(0.01, curve.exponent);
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone || magnitude < 1e-8) return { x: 0, y: 0 };
  const usable = Math.max(0.001, 1 - outer - deadzone);
  const normalized = Math.min(1, Math.max(0, (magnitude - deadzone) / usable));
  const shaped = Math.pow(normalized, exponent);
  return { x: (x / magnitude) * shaped, y: (y / magnitude) * shaped };
}

/** Analogue trigger threshold shared by fire and ADS: pressed above 22% travel. */
export const TRIGGER_PRESS_THRESHOLD = 0.22;

/** Digital button threshold for pads that report faces as analogue values. */
export const BUTTON_PRESS_THRESHOLD = 0.55;

export function buttonPressed(button: { pressed: boolean; value: number } | undefined, analogThreshold = BUTTON_PRESS_THRESHOLD): boolean {
  if (!button) return false;
  return button.pressed || (Number.isFinite(button.value) && button.value > analogThreshold);
}

function safeStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}
