export type InteractionKind =
  | 'support-exit'
  | 'support-enter-drone'
  | 'support-enter-chopper'
  | 'care-package'
  | 'shed-door'
  | 'weapon-pickup';

export type InteractionCandidate = Readonly<{
  kind: InteractionKind;
  targetId: string;
  prompt: string;
  proximityM: number;
  enabled?: boolean;
}>;

const INTERACTION_PRIORITY: Readonly<Record<InteractionKind, number>> = Object.freeze({
  // Possession controls are global 30-second support actions, not local-world
  // pickups. Once available, F must always enter/exit the selected platform;
  // a crate, door or corpse near the player's body cannot steal that intent.
  'support-exit': 2_000,
  'support-enter-drone': 1_500,
  'support-enter-chopper': 1_500,
  'care-package': 1_000,
  'shed-door': 900,
  'weapon-pickup': 800,
});

/**
 * One authority for F. Priority is structural; callers cannot smuggle an
 * arbitrary rank. Equal-priority candidates resolve by proximity then stable
 * identity, so the prompt and the executed action always select the same one.
 */
export function primaryInteraction(candidates: readonly InteractionCandidate[]): InteractionCandidate | null {
  return candidates
    .filter((candidate) => candidate.enabled !== false && candidate.targetId.length > 0
      && Number.isFinite(candidate.proximityM) && candidate.proximityM >= 0)
    .sort((left, right) => INTERACTION_PRIORITY[right.kind] - INTERACTION_PRIORITY[left.kind]
      || left.proximityM - right.proximityM
      || left.targetId.localeCompare(right.targetId))[0] ?? null;
}

export function interactionPriority(kind: InteractionKind): number {
  return INTERACTION_PRIORITY[kind];
}
