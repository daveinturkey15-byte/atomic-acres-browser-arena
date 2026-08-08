/**
 * Key-bindings profile: standard FPS rebinding with a frozen default profile
 * and an optional custom mapping stored in localStorage. Every gameplay action
 * is addressed by name so the input handlers never hardcode keys.
 */

export type GameplayAction =
  | 'move-forward'
  | 'move-backward'
  | 'move-left'
  | 'move-right'
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'prone'
  | 'reload'
  | 'melee'
  | 'grenade'
  | 'interact'
  | 'weapon-1'
  | 'weapon-2'
  | 'support-1'
  | 'support-2'
  | 'support-3'
  | 'support-4'
  | 'support-5'
  | 'scoreboard';

export const GAMEPLAY_ACTIONS: readonly GameplayAction[] = Object.freeze([
  'move-forward', 'move-backward', 'move-left', 'move-right', 'jump', 'sprint',
  'crouch', 'prone', 'reload', 'melee', 'grenade', 'interact',
  'weapon-1', 'weapon-2', 'support-1', 'support-2', 'support-3', 'support-4',
  'support-5', 'scoreboard',
]);

export const ACTION_LABELS: Readonly<Record<GameplayAction, string>> = Object.freeze({
  'move-forward': 'Move Forward',
  'move-backward': 'Move Backward',
  'move-left': 'Move Left',
  'move-right': 'Move Right',
  jump: 'Jump',
  sprint: 'Sprint',
  crouch: 'Crouch',
  prone: 'Prone',
  reload: 'Reload',
  melee: 'Melee',
  grenade: 'Grenade',
  interact: 'Interact / Confirm',
  'weapon-1': 'Primary Weapon',
  'weapon-2': 'Secondary Weapon',
  'support-1': 'Field Support Slot 1',
  'support-2': 'Field Support Slot 2',
  'support-3': 'Field Support Slot 3',
  'support-4': 'Field Support Slot 4',
  'support-5': 'Field Support Slot 5',
  scoreboard: 'Scoreboard',
});

/**
 * Frozen default profile. Alternative key codes are allowed per action
 * (e.g. prone is Z or Ctrl).
 */
export type KeyBindingProfile = Readonly<Record<GameplayAction, readonly string[]>>;

export const DEFAULT_KEY_BINDINGS: KeyBindingProfile = Object.freeze({
  'move-forward': Object.freeze(['KeyW']),
  'move-backward': Object.freeze(['KeyS']),
  'move-left': Object.freeze(['KeyA']),
  'move-right': Object.freeze(['KeyD']),
  jump: Object.freeze(['Space']),
  sprint: Object.freeze(['ShiftLeft', 'ShiftRight']),
  crouch: Object.freeze(['KeyC']),
  prone: Object.freeze(['KeyZ', 'ControlLeft']),
  reload: Object.freeze(['KeyR']),
  melee: Object.freeze(['KeyV']),
  grenade: Object.freeze(['KeyG']),
  interact: Object.freeze(['KeyF']),
  'weapon-1': Object.freeze(['Digit1']),
  'weapon-2': Object.freeze(['Digit2']),
  'support-1': Object.freeze(['Digit3']),
  'support-2': Object.freeze(['Digit4']),
  'support-3': Object.freeze(['Digit5']),
  'support-4': Object.freeze(['Digit6']),
  'support-5': Object.freeze(['Digit7']),
  scoreboard: Object.freeze(['Tab']),
});

const STORAGE_KEY = 'atomic-acres.key-bindings.v1';
const SUPPORT_SLOT_ACTIONS: readonly GameplayAction[] = Object.freeze([
  'support-1', 'support-2', 'support-3', 'support-4', 'support-5',
]);

function validCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]+$/.test(value) && value.length <= 32;
}

function validProfile(value: unknown): value is KeyBindingProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return GAMEPLAY_ACTIONS.every((action) => Array.isArray(record[action])
    && record[action].length > 0
    && (record[action] as unknown[]).every(validCode));
}

/** Resolve the effective profile: custom profile when stored and valid, else defaults. */
export function resolveKeyBindingProfile(storage: Pick<Storage, 'getItem'> = globalThis.localStorage): KeyBindingProfile {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_KEY_BINDINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!validProfile(parsed)) return DEFAULT_KEY_BINDINGS;
    return parsed;
  } catch {
    return DEFAULT_KEY_BINDINGS;
  }
}

export function saveKeyBindingProfile(
  profile: KeyBindingProfile,
  storage: Pick<Storage, 'setItem'> = globalThis.localStorage,
): boolean {
  try {
    if (!validProfile(profile)) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function clearKeyBindingProfile(storage: Pick<Storage, 'removeItem'> = globalThis.localStorage): void {
  try { storage.removeItem(STORAGE_KEY); } catch { /* best effort */ }
}

export function isDefaultProfile(profile: KeyBindingProfile): boolean {
  return GAMEPLAY_ACTIONS.every((action) => {
    const left = profile[action];
    const right = DEFAULT_KEY_BINDINGS[action];
    return left.length === right.length && left.every((code, index) => code === right[index]);
  });
}

/** Remap one action to a single primary code (alt codes preserved for defaults only). */
export function rebindAction(
  profile: KeyBindingProfile,
  action: GameplayAction,
  code: string,
): KeyBindingProfile | null {
  if (!validCode(code)) return null;
  if (GAMEPLAY_ACTIONS.some((other) => other !== action && profile[other].includes(code))) return null;
  return Object.freeze({
    ...profile,
    [action]: Object.freeze([code]),
  } as KeyBindingProfile);
}

export function actionKeyCodes(action: GameplayAction, profile: KeyBindingProfile = DEFAULT_KEY_BINDINGS): readonly string[] {
  return profile[action];
}

export function keyCodesAction(code: string, profile: KeyBindingProfile): GameplayAction | null {
  for (const action of GAMEPLAY_ACTIONS) {
    if (profile[action].includes(code)) return action;
  }
  return null;
}

export function supportSlotAction(slot: number): GameplayAction | null {
  return SUPPORT_SLOT_ACTIONS[slot] ?? null;
}

/** Resolve a configured support key to the compact runtime slot range 0..4. */
export function supportSlotForCode(code: string, profile: KeyBindingProfile): number | null {
  const slot = SUPPORT_SLOT_ACTIONS.findIndex((action) => profile[action].includes(code));
  return slot >= 0 ? slot : null;
}

export function actionMatchesCode(action: GameplayAction, code: string, profile: KeyBindingProfile): boolean {
  return profile[action].includes(code);
}

export function actionHeld(
  action: GameplayAction,
  heldCodes: ReadonlySet<string>,
  profile: KeyBindingProfile,
): boolean {
  return profile[action].some((code) => heldCodes.has(code));
}
