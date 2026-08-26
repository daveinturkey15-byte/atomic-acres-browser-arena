/**
 * Pass 75 - selectable operator appearance: stance and emote.
 *
 * The owner asked for skins AND animations to be easy to select. Skins already
 * had a catalog (operator-skin-catalog.ts); this is the animation half.
 *
 * IT IS DELIBERATELY BUILT FROM CLIPS THE RUNTIME ALREADY BINDS.
 * The authored operator GLB carries 24 clips, but the live mixer binds only
 * RIGGED_OPERATOR_RUNTIME_ACTION_NAMES (12) - binding every track of every
 * unused clip at spawn costs a multi-hundred-millisecond main-thread task, and
 * that budget is deliberate. So every stance below is one of the three idles
 * already bound, and the emotes are drawn from the bound set plus exactly one
 * addition. A selection here can never make spawning more expensive than the
 * authored budget already allows.
 *
 * PRESENTATION ONLY. A stance changes which idle clip plays on the
 * third-person operator. It cannot change the hit proxies (those are the
 * authoritative capsules in hit-proxies.ts, independent of the mixer), the
 * movement profile, or any authority value. Replication exists so other
 * players see your choice, exactly like the skin.
 */

export type OperatorStanceId = 'ready' | 'low' | 'alert';
export type OperatorEmoteId = 'none' | 'wave' | 'salute-punch' | 'boot';

export type OperatorStanceDefinition = Readonly<{
  id: OperatorStanceId;
  displayName: string;
  description: string;
  /** Must be a member of RIGGED_OPERATOR_RUNTIME_ACTION_NAMES. */
  clipName: string;
}>;

export type OperatorEmoteDefinition = Readonly<{
  id: OperatorEmoteId;
  displayName: string;
  description: string;
  /** null for 'none' - selecting it plays nothing. */
  clipName: string | null;
}>;

export const OPERATOR_STANCES: readonly OperatorStanceDefinition[] = Object.freeze([
  Object.freeze({
    id: 'ready',
    displayName: 'Weapon Ready',
    description: 'Rifle up and levelled. The default combat posture.',
    clipName: 'Idle_Gun_Pointing',
  }),
  Object.freeze({
    id: 'low',
    displayName: 'Low Carry',
    description: 'Muzzle down and relaxed between contacts.',
    clipName: 'Idle_Gun',
  }),
  Object.freeze({
    id: 'alert',
    displayName: 'On The Trigger',
    description: 'Tensed on the grip, ready to fire.',
    clipName: 'Idle_Gun_Shoot',
  }),
]);

export const OPERATOR_EMOTES: readonly OperatorEmoteDefinition[] = Object.freeze([
  Object.freeze({ id: 'none', displayName: 'None', description: 'No emote bound.', clipName: null }),
  Object.freeze({ id: 'wave', displayName: 'Wave', description: 'A clear friendly signal across the map.', clipName: 'Wave' }),
  Object.freeze({ id: 'salute-punch', displayName: 'Fist', description: 'Short jab - taunt or acknowledgement.', clipName: 'Punch_Right' }),
  Object.freeze({ id: 'boot', displayName: 'Boot', description: 'Front kick. Strictly for celebration.', clipName: 'Kick_Right' }),
]);

export const DEFAULT_OPERATOR_STANCE: OperatorStanceId = 'ready';
export const DEFAULT_OPERATOR_EMOTE: OperatorEmoteId = 'none';

export function isOperatorStanceId(value: unknown): value is OperatorStanceId {
  return typeof value === 'string' && OPERATOR_STANCES.some((stance) => stance.id === value);
}

export function isOperatorEmoteId(value: unknown): value is OperatorEmoteId {
  return typeof value === 'string' && OPERATOR_EMOTES.some((emote) => emote.id === value);
}

export function operatorStance(id: OperatorStanceId): OperatorStanceDefinition {
  const found = OPERATOR_STANCES.find((stance) => stance.id === id);
  if (!found) throw new Error(`unknown operator stance ${id}`);
  return found;
}

export function operatorEmote(id: OperatorEmoteId): OperatorEmoteDefinition {
  const found = OPERATOR_EMOTES.find((emote) => emote.id === id);
  if (!found) throw new Error(`unknown operator emote ${id}`);
  return found;
}

/**
 * The idle clip a given stance requests, falling back through the bound idles
 * when a skin's mixer does not carry the exact clip. Fail-soft on purpose: an
 * appearance choice must never leave an operator with no idle animation.
 */
export function stanceIdleClip(
  id: OperatorStanceId,
  availableClips: ReadonlySet<string>,
): string {
  const preferred = operatorStance(id).clipName;
  if (availableClips.has(preferred)) return preferred;
  for (const fallback of ['Idle_Gun_Pointing', 'Idle_Gun', 'Idle_Gun_Shoot', 'Idle']) {
    if (availableClips.has(fallback)) return fallback;
  }
  return preferred;
}

/** Every clip this catalog can ever request, for the runtime binding set. */
export const OPERATOR_APPEARANCE_CLIP_NAMES: readonly string[] = Object.freeze([
  ...new Set([
    ...OPERATOR_STANCES.map((stance) => stance.clipName),
    ...OPERATOR_EMOTES.map((emote) => emote.clipName).filter((name): name is string => name !== null),
  ]),
]);
