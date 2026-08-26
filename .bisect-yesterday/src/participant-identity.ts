/**
 * Protocol-owned actor namespaces must never be admitted as human identities.
 * Otherwise a guest can alias map attribution or a hosted bot and corrupt the
 * shared health, score and presentation maps keyed by participant id.
 */
export function isReservedMultiplayerParticipantId(playerId: unknown): playerId is string {
  return typeof playerId === 'string'
    && (playerId.startsWith('map:') || playerId.startsWith('host-bot-'));
}
