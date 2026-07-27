import { describe, expect, it } from 'vitest';
import { flashbangPresentation } from './combat/pass65-ordnance-contract';
import { FlashHostAuthority, FlashVictimResultConsumer, flashActivationId } from './flash-authority';
import { isFlashResultMessage, type FlashResultMessage } from './flash-protocol';

describe('host-to-victim flash authority integration', () => {
  it('preserves admitted intensity and only the synchronized remaining duration across wire delay', () => {
    const host = new FlashHostAuthority(33, 'host');
    const result = host.resolveDetonation({
      matchEpoch: 33,
      activationId: flashActivationId(33, 'host', 77),
      startsAtHostTimeMs: 10_000,
      victims: [{ targetId: 'guest', targetLifeId: 9, intensity: 0.84, durationMs: 2_600 }],
    }).results[0]!;
    const wire: FlashResultMessage = {
      type: 'flash-result', schemaVersion: 1, by: 'host', forPlayerId: 'guest', result, nonce: 80,
    };
    expect(isFlashResultMessage(structuredClone(wire))).toBe(true);

    const victim = new FlashVictimResultConsumer(33, 'guest', 9);
    const admitted = victim.admit(structuredClone(wire.result), 10_475);
    expect(admitted).toEqual({
      accepted: true,
      reason: 'accepted',
      intensity: 0.84,
      remainingDurationMs: 2_125,
    });
    const standard = flashbangPresentation(admitted.intensity, false);
    const reduced = flashbangPresentation(admitted.intensity, true);
    expect(standard.audioGain).toBe(0.84);
    expect(reduced.audioGain).toBeCloseTo(0.168);
    expect(reduced.whiteoutOpacity).toBeLessThan(standard.whiteoutOpacity);
    expect(victim.admit(structuredClone(wire.result), 10_476)).toMatchObject({
      accepted: false,
      reason: 'duplicate',
      remainingDurationMs: 0,
    });
  });
});
