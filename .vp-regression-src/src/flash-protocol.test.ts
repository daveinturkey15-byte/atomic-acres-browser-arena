import { describe, expect, it } from 'vitest';
import { FLASH_AUTHORITY_SCHEMA_VERSION, FlashHostAuthority, flashActivationId } from './flash-authority';
import { isFlashResultMessage, type FlashResultMessage } from './flash-protocol';
import { isGameMessage, isHostAuthorityMessage, isStateTrafficMessage, messageBelongsToPlayer } from './protocol';

function message(): FlashResultMessage {
  const host = new FlashHostAuthority(5, 'host');
  const result = host.resolveDetonation({
    matchEpoch: 5,
    activationId: flashActivationId(5, 'host', 91),
    startsAtHostTimeMs: 2_000,
    victims: [{ targetId: 'guest', targetLifeId: 4, intensity: 0.75, durationMs: 2_000 }],
  }).results[0]!;
  return {
    type: 'flash-result',
    schemaVersion: FLASH_AUTHORITY_SCHEMA_VERSION,
    by: 'host',
    forPlayerId: 'guest',
    result,
    nonce: 11,
  };
}

describe('flash result protocol', () => {
  it('classifies the result as bounded host authority, never guest-authored state traffic', () => {
    const valid = message();
    expect(isFlashResultMessage(valid)).toBe(true);
    expect(isGameMessage(valid)).toBe(true);
    expect(isHostAuthorityMessage(valid)).toBe(true);
    expect(isStateTrafficMessage(valid)).toBe(false);
    expect(messageBelongsToPlayer(valid, 'host')).toBe(true);
    expect(messageBelongsToPlayer(valid, 'guest')).toBe(false);
    // ArenaNetwork rejects every isHostAuthorityMessage at guest ingress before
    // dispatch, so a guest cannot forge this otherwise well-shaped result.
  });

  it('rejects recipient mismatch, extra keys, invalid duration, intensity and nonce', () => {
    const valid = message();
    expect(isFlashResultMessage({ ...valid, forPlayerId: 'other' })).toBe(false);
    expect(isFlashResultMessage({ ...valid, guestAuthority: true })).toBe(false);
    expect(isFlashResultMessage({
      ...valid,
      result: { ...valid.result, endsAtHostTimeMs: valid.result.startsAtHostTimeMs + 2_801 },
    })).toBe(false);
    expect(isFlashResultMessage({ ...valid, result: { ...valid.result, intensityQ: 1_001 } })).toBe(false);
    expect(isFlashResultMessage({ ...valid, nonce: -1 })).toBe(false);
  });
});
