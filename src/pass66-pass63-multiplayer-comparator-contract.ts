export type Pass66ComparatorChannel = 'stable' | 'candidate';

export type Pass66ComparatorCapabilities = Readonly<{
  sessionRoomIdentity: boolean;
  explicitRejoinAffordance: boolean;
  reliableStateCommitMirrors: boolean;
}>;

/**
 * The byte-exact Pass 63 runtime can restore its session-scoped room identity,
 * but it predates both the explicit rejoin button state and reliable commit
 * mirror counter. Keep the shared comparator on only the capabilities that the
 * pinned runtime actually exposes.
 */
export const PASS63_STABLE_COMPARATOR_CAPABILITIES: Pass66ComparatorCapabilities = Object.freeze({
  sessionRoomIdentity: true,
  explicitRejoinAffordance: false,
  reliableStateCommitMirrors: false,
});

export const PASS66_CANDIDATE_COMPARATOR_CAPABILITIES: Pass66ComparatorCapabilities = Object.freeze({
  sessionRoomIdentity: true,
  explicitRejoinAffordance: true,
  reliableStateCommitMirrors: true,
});

export const PASS63_STABLE_BUNDLE_CAPABILITY_EVIDENCE = Object.freeze({
  required: Object.freeze([
    'atomic-acres:room-identity:',
    'networkLifecycle',
  ]),
  absent: Object.freeze([
    'REJOIN LAST MATCH',
    'data-rejoin-available',
    'reliableStateCommitMirrors',
  ]),
});

export function pass66ComparatorCapabilities(channel: Pass66ComparatorChannel): Pass66ComparatorCapabilities {
  return channel === 'stable'
    ? PASS63_STABLE_COMPARATOR_CAPABILITIES
    : PASS66_CANDIDATE_COMPARATOR_CAPABILITIES;
}
