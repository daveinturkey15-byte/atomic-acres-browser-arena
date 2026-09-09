/**
 * Gamepad model detection, semantic button layouts and the player's button
 * remap profile (PASS 84 Lane E).
 *
 * Browsers expose two shapes of pad: `mapping === 'standard'` (the W3C layout:
 * 0 bottom face, 1 right face, 2 left face, 3 top face, 4/5 bumpers, 6/7
 * triggers, 8 select, 9 start, 10/11 stick clicks, 12–15 d-pad, 16 guide) and
 * `mapping === ''` for pads the browser could not normalise — common over
 * Bluetooth on Firefox and for DirectInput-only pads. Every layout below maps
 * physical indices to one semantic `PadAction` vocabulary so the game loop
 * never hardcodes a button number, and every layout carries its own glyph
 * table so the HUD can name the button in the player's hands.
 */

export type PadAction =
  | 'fire'
  | 'ads'
  | 'jump'
  | 'crouch'
  | 'prone'
  | 'reload'
  | 'interact'
  | 'switch-weapon'
  | 'grenade'
  | 'melee'
  | 'sprint'
  | 'support-prev'
  | 'support-next'
  | 'support-activate'
  | 'pause'
  | 'scoreboard'
  | 'emote';

export const PAD_ACTIONS: readonly PadAction[] = Object.freeze([
  'fire', 'ads', 'jump', 'crouch', 'prone', 'reload', 'interact', 'switch-weapon',
  'grenade', 'melee', 'sprint', 'support-prev', 'support-next', 'support-activate',
  'pause', 'scoreboard', 'emote',
]);

export const PAD_ACTION_LABELS: Readonly<Record<PadAction, string>> = Object.freeze({
  fire: 'Fire',
  ads: 'Aim Down Sights',
  jump: 'Jump',
  crouch: 'Crouch',
  prone: 'Prone',
  reload: 'Reload',
  interact: 'Interact / Confirm',
  'switch-weapon': 'Switch Weapon',
  grenade: 'Grenade',
  melee: 'Melee',
  sprint: 'Sprint',
  'support-prev': 'Previous Field Support',
  'support-next': 'Next Field Support',
  'support-activate': 'Activate Field Support',
  pause: 'Pause / Resume',
  scoreboard: 'Scoreboard (hold)',
  emote: 'Emote',
});

/**
 * Actions that may legitimately share one button. Reload and interact share
 * the left face button: the press interacts when a prompt is showing and
 * reloads otherwise (the game loop resolves which).
 */
export const SHARED_PAD_ACTION_PAIRS: readonly (readonly [PadAction, PadAction])[] = Object.freeze([
  Object.freeze(['reload', 'interact'] as const),
]);

export type PadFaceFamily = 'xbox' | 'playstation' | 'nintendo' | 'generic';
export type PadModel = 'xbox' | 'dualshock' | 'dualsense' | 'switch-pro' | 'generic';
export type PadLayoutId = 'standard' | 'playstation-directinput' | 'switch-nonstandard' | 'directinput-generic';

export type PadAxes = Readonly<{ moveX: number; moveY: number; lookX: number; lookY: number }>;

export type PadLayout = Readonly<{
  layoutId: PadLayoutId;
  family: PadFaceFamily;
  model: PadModel;
  displayName: string;
  /** Physical button index per semantic action (null = unbound). */
  buttons: Readonly<Record<PadAction, number | null>>;
  axes: PadAxes;
  /** Physical button index → glyph label for this pad family. */
  glyphs: readonly string[];
}>;

const STANDARD_BUTTONS: Readonly<Record<PadAction, number | null>> = Object.freeze({
  fire: 7,
  ads: 6,
  jump: 0,
  crouch: 1,
  prone: 13,
  reload: 2,
  interact: 2,
  'switch-weapon': 3,
  grenade: 4,
  melee: 5,
  sprint: 10,
  'support-prev': 14,
  'support-next': 15,
  'support-activate': 12,
  pause: 9,
  scoreboard: 8,
  emote: 11,
});

const STANDARD_AXES: PadAxes = Object.freeze({ moveX: 0, moveY: 1, lookX: 2, lookY: 3 });

const DPAD_GLYPHS = ['▲', '▼', '◀', '▶'] as const;

const STANDARD_GLYPHS: Readonly<Record<PadFaceFamily, readonly string[]>> = Object.freeze({
  xbox: Object.freeze(['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU', 'LS', 'RS', ...DPAD_GLYPHS, 'XBOX']),
  playstation: Object.freeze(['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'SHARE', 'OPTIONS', 'L3', 'R3', ...DPAD_GLYPHS, 'PS']),
  nintendo: Object.freeze(['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS', ...DPAD_GLYPHS, 'HOME']),
  generic: Object.freeze(['1', '2', '3', '4', 'L1', 'R1', 'L2', 'R2', 'SELECT', 'START', 'L3', 'R3', ...DPAD_GLYPHS, 'HOME']),
});

/**
 * DualShock 4 / DualSense exposed without the standard mapping (Firefox on
 * Windows/Linux, some Bluetooth stacks): faces are square, cross, circle,
 * triangle; triggers sit on 6/7 as buttons; the right stick's Y is axis 5
 * because axes 3/4 carry the analogue triggers. The d-pad arrives as a hat
 * axis the Gamepad API cannot express as buttons, so those actions start
 * unbound and are remappable.
 */
const PLAYSTATION_DIRECTINPUT_BUTTONS: Readonly<Record<PadAction, number | null>> = Object.freeze({
  fire: 7,
  ads: 6,
  jump: 1,
  crouch: 2,
  prone: null,
  reload: 0,
  interact: 0,
  'switch-weapon': 3,
  grenade: 4,
  melee: 5,
  sprint: 10,
  'support-prev': null,
  'support-next': null,
  'support-activate': null,
  pause: 9,
  scoreboard: 8,
  emote: 11,
});
const PLAYSTATION_DIRECTINPUT_GLYPHS: readonly string[] = Object.freeze([
  '□', '✕', '○', '△', 'L1', 'R1', 'L2', 'R2', 'SHARE', 'OPTIONS', 'L3', 'R3', 'PS', 'PAD',
]);

/**
 * Switch Pro without the standard mapping: physical order is B, A, Y, X,
 * L, R, ZL, ZR, −, +, LS, RS, HOME, CAPTURE. Semantic bottom face stays jump.
 */
const SWITCH_NONSTANDARD_BUTTONS: Readonly<Record<PadAction, number | null>> = Object.freeze({
  fire: 7,
  ads: 6,
  jump: 0,
  crouch: 1,
  prone: null,
  reload: 2,
  interact: 2,
  'switch-weapon': 3,
  grenade: 4,
  melee: 5,
  sprint: 10,
  'support-prev': null,
  'support-next': null,
  'support-activate': null,
  pause: 9,
  scoreboard: 8,
  emote: 11,
});
const SWITCH_NONSTANDARD_GLYPHS: readonly string[] = Object.freeze([
  'B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS', 'HOME', 'CAPTURE',
]);

/**
 * Generic DirectInput pads (Logitech F310 in D mode, many budget Bluetooth
 * pads): left face first, then bottom, right, top.
 */
const DIRECTINPUT_GENERIC_BUTTONS: Readonly<Record<PadAction, number | null>> = Object.freeze({
  fire: 7,
  ads: 6,
  jump: 1,
  crouch: 2,
  prone: null,
  reload: 0,
  interact: 0,
  'switch-weapon': 3,
  grenade: 4,
  melee: 5,
  sprint: 10,
  'support-prev': null,
  'support-next': null,
  'support-activate': null,
  pause: 9,
  scoreboard: 8,
  emote: 11,
});
const DIRECTINPUT_GENERIC_GLYPHS: readonly string[] = Object.freeze([
  '3', '1', '2', '4', 'L1', 'R1', 'L2', 'R2', 'SELECT', 'START', 'L3', 'R3', 'HOME', 'PAD',
]);

const PLAYSTATION_ID = /playstation|dualshock|dualsense|054c|wireless controller|sony/iu;
const DUALSENSE_ID = /dualsense|0ce6|0df2/iu;
const XBOX_ID = /xbox|045e|xinput|x-box/iu;
const NINTENDO_ID = /nintendo|switch|pro controller|057e|joy-con/iu;

export type PadIdentity = Readonly<{ family: PadFaceFamily; model: PadModel; displayName: string }>;

/** Classifies a pad from its reported id string alone (mapping is decided separately). */
export function identifyPad(id: string): PadIdentity {
  const text = typeof id === 'string' ? id : '';
  if (DUALSENSE_ID.test(text)) return Object.freeze({ family: 'playstation', model: 'dualsense', displayName: 'DualSense' });
  // Xbox before PlayStation: "Xbox Wireless Controller" also matches the bare
  // "Wireless Controller" name Sony pads report.
  if (XBOX_ID.test(text)) return Object.freeze({ family: 'xbox', model: 'xbox', displayName: 'Xbox' });
  if (PLAYSTATION_ID.test(text)) return Object.freeze({ family: 'playstation', model: 'dualshock', displayName: 'DualShock' });
  if (NINTENDO_ID.test(text)) return Object.freeze({ family: 'nintendo', model: 'switch-pro', displayName: 'Switch Pro' });
  return Object.freeze({ family: 'generic', model: 'generic', displayName: 'Generic pad' });
}

/**
 * Resolves the semantic layout for a pad. Standard-mapped pads of every
 * family share one index table and differ only in glyphs. Non-standard pads
 * get the family fallback table; `axesCount` decides whether the right stick's
 * vertical axis is 3 (four-axis pads) or 5 (trigger-as-axis pads).
 */
export function detectPadLayout(id: string, mapping: string, axesCount = 4): PadLayout {
  const identity = identifyPad(id);
  if (mapping === 'standard') {
    return Object.freeze({
      layoutId: 'standard',
      ...identity,
      buttons: STANDARD_BUTTONS,
      axes: STANDARD_AXES,
      glyphs: STANDARD_GLYPHS[identity.family],
    });
  }
  const lookY = axesCount >= 6 ? 5 : 3;
  const axes: PadAxes = Object.freeze({ moveX: 0, moveY: 1, lookX: 2, lookY });
  if (identity.family === 'playstation') {
    return Object.freeze({ layoutId: 'playstation-directinput', ...identity, buttons: PLAYSTATION_DIRECTINPUT_BUTTONS, axes, glyphs: PLAYSTATION_DIRECTINPUT_GLYPHS });
  }
  if (identity.family === 'nintendo') {
    return Object.freeze({ layoutId: 'switch-nonstandard', ...identity, buttons: SWITCH_NONSTANDARD_BUTTONS, axes, glyphs: SWITCH_NONSTANDARD_GLYPHS });
  }
  if (identity.family === 'xbox') {
    // Firefox XInput pads keep the standard index order without declaring it.
    return Object.freeze({ layoutId: 'standard', ...identity, buttons: STANDARD_BUTTONS, axes, glyphs: STANDARD_GLYPHS.xbox });
  }
  return Object.freeze({ layoutId: 'directinput-generic', ...identity, buttons: DIRECTINPUT_GENERIC_BUTTONS, axes, glyphs: DIRECTINPUT_GENERIC_GLYPHS });
}

/** Glyph label for a physical button index on a layout; unbound/unknown → '—'. */
export function padButtonGlyph(layout: PadLayout | null, index: number | null): string {
  if (!layout || index === null || !Number.isInteger(index) || index < 0) return '—';
  return layout.glyphs[index] ?? `B${index}`;
}

// ---- Remap profile -------------------------------------------------------

export const GAMEPAD_BINDINGS_STORAGE_KEY = 'atomic-acres-gamepad-bindings.v1';

/** Per-layout button overrides: only the actions the player changed are stored. */
export type PadBindingOverrides = Readonly<Partial<Record<PadAction, number | null>>>;
export type PadBindingProfile = Readonly<Partial<Record<PadLayoutId, PadBindingOverrides>>>;

const LAYOUT_IDS: readonly PadLayoutId[] = Object.freeze(['standard', 'playstation-directinput', 'switch-nonstandard', 'directinput-generic']);
const MAX_BUTTON_INDEX = 31;

function validIndex(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_BUTTON_INDEX);
}

function sanitizeOverrides(value: unknown): PadBindingOverrides | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const entries = PAD_ACTIONS.flatMap((action) => (action in record && validIndex(record[action]) ? [[action, record[action]] as const] : []));
  return Object.freeze(Object.fromEntries(entries) as Partial<Record<PadAction, number | null>>);
}

export function resolvePadBindingProfile(storage: Pick<Storage, 'getItem'> | null = safeStorage()): PadBindingProfile {
  try {
    const raw = storage?.getItem(GAMEPAD_BINDINGS_STORAGE_KEY);
    if (!raw) return Object.freeze({});
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return Object.freeze({});
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || !record.layouts || typeof record.layouts !== 'object') return Object.freeze({});
    const layouts = record.layouts as Record<string, unknown>;
    const entries = LAYOUT_IDS.flatMap((layoutId) => {
      const overrides = sanitizeOverrides(layouts[layoutId]);
      return overrides && Object.keys(overrides).length > 0 ? [[layoutId, overrides] as const] : [];
    });
    return Object.freeze(Object.fromEntries(entries) as Partial<Record<PadLayoutId, PadBindingOverrides>>);
  } catch {
    return Object.freeze({});
  }
}

export function savePadBindingProfile(profile: PadBindingProfile, storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    storage?.setItem(GAMEPAD_BINDINGS_STORAGE_KEY, JSON.stringify({ version: 1, layouts: profile }));
    return true;
  } catch {
    return false;
  }
}

export function clearPadBindingProfile(storage: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  try { storage?.removeItem(GAMEPAD_BINDINGS_STORAGE_KEY); } catch { /* best effort */ }
}

/** Applies the player's overrides for this layout on top of its defaults. */
export function effectivePadLayout(layout: PadLayout, profile: PadBindingProfile): PadLayout {
  const overrides = profile[layout.layoutId];
  if (!overrides || Object.keys(overrides).length === 0) return layout;
  return Object.freeze({
    ...layout,
    buttons: Object.freeze({ ...layout.buttons, ...overrides }),
  });
}

export function isDefaultPadBindings(layout: PadLayout, profile: PadBindingProfile): boolean {
  const overrides = profile[layout.layoutId];
  if (!overrides) return true;
  return PAD_ACTIONS.every((action) => !(action in overrides) || overrides[action] === layout.buttons[action]);
}

function actionsMayShare(a: PadAction, b: PadAction): boolean {
  return SHARED_PAD_ACTION_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export type PadRebindResult =
  | Readonly<{ ok: true; profile: PadBindingProfile }>
  | Readonly<{ ok: false; reason: 'conflict' | 'invalid'; conflictsWith?: PadAction }>;

/**
 * Rebinds one action on one layout. Like key rebinding, a button already used
 * by another action is rejected instead of silently swapped — except the
 * designed reload/interact pair.
 */
export function rebindPadAction(
  profile: PadBindingProfile,
  layout: PadLayout,
  action: PadAction,
  index: number,
): PadRebindResult {
  if (!validIndex(index) || index === null) return Object.freeze({ ok: false, reason: 'invalid' });
  const current = effectivePadLayout(layout, profile);
  const conflict = PAD_ACTIONS.find((other) => other !== action && current.buttons[other] === index && !actionsMayShare(other, action));
  if (conflict) return Object.freeze({ ok: false, reason: 'conflict', conflictsWith: conflict });
  const overrides: Partial<Record<PadAction, number | null>> = { ...(profile[layout.layoutId] ?? {}) };
  if (layout.buttons[action] === index) delete overrides[action];
  else overrides[action] = index;
  const next: Partial<Record<PadLayoutId, PadBindingOverrides>> = { ...profile };
  if (Object.keys(overrides).length === 0) delete next[layout.layoutId];
  else next[layout.layoutId] = Object.freeze(overrides);
  return Object.freeze({ ok: true, profile: Object.freeze(next) });
}

function safeStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}
