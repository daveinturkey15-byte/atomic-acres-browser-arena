import { describe, expect, it } from 'vitest';
import { admitHostCanonicalHitResult } from './host-canonical-hit-admission';

describe('host canonical hit admission', () => {
  it('accepts the host snapshot exactly once even after the receiver has moved', () => {
    const hostImpactPose = { x: 2, y: 1.7, z: -3 };
    const receiverPoseAtDelivery = { x: 18, y: 1.7, z: 11 };
    expect(receiverPoseAtDelivery).not.toEqual(hostImpactPose);
    const authority = {
      hostId: 'host', targetLifeId: 7, appliedDamage: 64, resultingHealth: 36, stickyAttachment: null,
    } as const;
    const input = {
      expectedHostId: 'host', targetId: 'receiver', expectedTargetId: 'receiver', expectedTargetLifeId: 7,
      alreadyProcessed: false,
    } as const;

    expect(admitHostCanonicalHitResult(authority, input)).toEqual({ accepted: true, appliedDamage: 64, resultingHealth: 36 });
    expect(admitHostCanonicalHitResult(authority, { ...input, alreadyProcessed: true })).toEqual({ accepted: false, reason: 'duplicate' });
  });

  it('rejects the wrong host, target, or target life', () => {
    const authority = {
      hostId: 'host', targetLifeId: 7, appliedDamage: 25, resultingHealth: 75, stickyAttachment: null,
    } as const;
    const input = {
      expectedHostId: 'host', targetId: 'receiver', expectedTargetId: 'receiver', expectedTargetLifeId: 7,
      alreadyProcessed: false,
    } as const;
    expect(admitHostCanonicalHitResult(authority, { ...input, expectedHostId: 'forged' }).accepted).toBe(false);
    expect(admitHostCanonicalHitResult(authority, { ...input, targetId: 'other' }).accepted).toBe(false);
    expect(admitHostCanonicalHitResult(authority, { ...input, expectedTargetLifeId: 8 }).accepted).toBe(false);
  });
});
