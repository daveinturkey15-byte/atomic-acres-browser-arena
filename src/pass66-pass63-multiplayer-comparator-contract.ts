export type Pass66ComparatorChannel = 'stable' | 'candidate';

export type Pass66ComparatorCapabilities = Readonly<{
  sessionRoomIdentity: boolean;
  explicitRejoinAffordance: boolean;
  reliableStateCommitMirrors: boolean;
}>;

/**
 * The pinned Pass 67.1 stable singleplayer runtime carries the same session
 * room identity, rejoin affordance and reliable commit mirror counter as the
 * live candidate line; the comparator proves the stable bundle is the newer
 * singleplayer build rather than the pre-rejoin Pass 63 tree.
 */
export const PASS67_STABLE_COMPARATOR_CAPABILITIES: Pass66ComparatorCapabilities = Object.freeze({
  sessionRoomIdentity: true,
  explicitRejoinAffordance: true,
  reliableStateCommitMirrors: true,
});

export const PASS66_CANDIDATE_COMPARATOR_CAPABILITIES: Pass66ComparatorCapabilities = Object.freeze({
  sessionRoomIdentity: true,
  explicitRejoinAffordance: true,
  reliableStateCommitMirrors: true,
});

export const PASS67_STABLE_BUNDLE_CAPABILITY_EVIDENCE = Object.freeze({
  required: Object.freeze([
    'atomic-acres:room-identity:',
    'networkLifecycle',
    'REJOIN LAST MATCH',
    'PASS 67.1',
  ]),
  absent: Object.freeze([
    'PASS 69',
  ]),
});

export function pass66ComparatorCapabilities(channel: Pass66ComparatorChannel): Pass66ComparatorCapabilities {
  return channel === 'stable'
    ? PASS67_STABLE_COMPARATOR_CAPABILITIES
    : PASS66_CANDIDATE_COMPARATOR_CAPABILITIES;
}
