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
  // An eligible nearby world action always owns F before a support toggle.
  // Support enter/exit remains globally available when no world candidate wins.
  'care-package': 3_000,
  'shed-door': 2_900,
  'weapon-pickup': 2_800,
  'support-exit': 2_000,
  'support-enter-drone': 1_500,
  'support-enter-chopper': 1_500,
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
