import type { HostHitAuthority } from './protocol';

export type HostCanonicalHitAdmission = Readonly<
  | { accepted: false; reason: 'missing-authority' | 'duplicate' | 'host-mismatch' | 'target-mismatch' | 'life-mismatch' }
  | { accepted: true; appliedDamage: number; resultingHealth: number }
>;

/**
 * Admits a host result without consulting the receiver's later pose or local
 * projectile timing. Those facts belonged to the host snapshot that authored
 * the canonical health result.
 */
export function admitHostCanonicalHitResult(
  authority: HostHitAuthority | undefined,
  input: Readonly<{
    expectedHostId: string | undefined;
    targetId: string;
    expectedTargetId: string;
    expectedTargetLifeId: number;
    alreadyProcessed: boolean;
  }>,
): HostCanonicalHitAdmission {
  if (!authority) return { accepted: false, reason: 'missing-authority' };
  if (input.alreadyProcessed) return { accepted: false, reason: 'duplicate' };
  if (!input.expectedHostId || authority.hostId !== input.expectedHostId) return { accepted: false, reason: 'host-mismatch' };
  if (input.targetId !== input.expectedTargetId) return { accepted: false, reason: 'target-mismatch' };
  if (authority.targetLifeId !== input.expectedTargetLifeId) return { accepted: false, reason: 'life-mismatch' };
  return { accepted: true, appliedDamage: authority.appliedDamage, resultingHealth: authority.resultingHealth };
}
