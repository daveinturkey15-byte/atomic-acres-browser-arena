import { describe, expect, it } from 'vitest';
import {
  REMOTE_HEALTH_REGEN_DELAY_MS,
  REMOTE_HEALTH_REGEN_PER_SECOND,
  REMOTE_RESPAWN_MIN_MS,
  advanceRemoteHealthAuthority,
  admitAuthoritativeRemoteRespawn,
  applyAuthoritativeRemoteDamage,
  applyAuthoritativeRemoteRedeploy,
  createRemoteHealthAuthorityState,
} from './remote-health-authority';

describe('remote health authority', () => {
  it('derives health and one lethal transition from admitted damage', () => {
    const first = applyAuthoritativeRemoteDamage(createRemoteHealthAuthorityState(), 60, 100);
    expect(first.applied).toBe(true);
    expect(first.died).toBe(false);
    expect(first.state.hp).toBe(40);
    const lethal = applyAuthoritativeRemoteDamage(first.state, 40, 200);
    expect(lethal.died).toBe(true);
    expect(lethal.state.alive).toBe(false);
    expect(lethal.state.diedAtHostTimeMs).toBe(200);
    expect(applyAuthoritativeRemoteDamage(lethal.state, 100, 300).applied).toBe(false);
  });

  it('admits respawn only after the host-authored lifecycle delay', () => {
    const dead = applyAuthoritativeRemoteDamage(createRemoteHealthAuthorityState(), 100, 1_000).state;
    expect(admitAuthoritativeRemoteRespawn(dead, 100, 1_000 + REMOTE_RESPAWN_MIN_MS - 1).respawned).toBe(false);
    expect(admitAuthoritativeRemoteRespawn(dead, 0, 1_000 + REMOTE_RESPAWN_MIN_MS).respawned).toBe(false);
    const respawned = admitAuthoritativeRemoteRespawn(dead, 100, 1_000 + REMOTE_RESPAWN_MIN_MS);
    expect(respawned.respawned).toBe(true);
    expect(respawned.state.diedAtHostTimeMs).toBeNull();
  });

  it('mirrors local regeneration on the host ledger before later damage is admitted', () => {
    const damaged = applyAuthoritativeRemoteDamage(createRemoteHealthAuthorityState(true, 100), 80, 100).state;
    expect(advanceRemoteHealthAuthority(damaged, 100 + REMOTE_HEALTH_REGEN_DELAY_MS - 1).hp).toBe(20);
    const oneSecond = advanceRemoteHealthAuthority(damaged, 100 + REMOTE_HEALTH_REGEN_DELAY_MS + 1_000);
    expect(oneSecond.hp).toBe(20 + REMOTE_HEALTH_REGEN_PER_SECOND);
    const full = advanceRemoteHealthAuthority(oneSecond, 100 + REMOTE_HEALTH_REGEN_DELAY_MS + 10_000);
    expect(full.hp).toBe(100);

    // This is the reported failure mode: the guest has visibly regenerated,
    // then receives a small hit. The host must not apply that hit to stale 20 HP.
    const laterHit = applyAuthoritativeRemoteDamage(damaged, 23, 100 + REMOTE_HEALTH_REGEN_DELAY_MS + 10_000);
    expect(laterHit.died).toBe(false);
    expect(laterHit.state.hp).toBe(77);
    expect(laterHit).toMatchObject({
      healthBeforeAdvance: 20,
      healthBefore: 100,
      healthAfter: 77,
      damageRequested: 23,
      damageApplied: 23,
    });
  });

  it.each(['legacy hit', 'authored shot', 'hosted bot', 'railgun'])(
    'keeps the %s route outcome consistent after a full regeneration gap',
    () => {
      const damaged = applyAuthoritativeRemoteDamage(createRemoteHealthAuthorityState(true, 100), 80, 100).state;
      const result = applyAuthoritativeRemoteDamage(damaged, 23, 100 + REMOTE_HEALTH_REGEN_DELAY_MS + 10_000);

      expect(result).toMatchObject({
        applied: true,
        died: false,
        healthBeforeAdvance: 20,
        healthBefore: 100,
        healthAfter: 77,
        damageRequested: 23,
        damageApplied: 23,
        state: { hp: 77, alive: true },
      });
    },
  );

  it('resolves health-dependent incoming damage from post-regeneration health', () => {
    const damaged = applyAuthoritativeRemoteDamage(createRemoteHealthAuthorityState(true, 100), 80, 100).state;
    const result = applyAuthoritativeRemoteDamage(
      damaged,
      1,
      100 + REMOTE_HEALTH_REGEN_DELAY_MS + 10_000,
      (_damage, canonicalHealth) => canonicalHealth,
    );

    expect(result).toMatchObject({ healthBefore: 100, damageRequested: 100, damageApplied: 100, healthAfter: 0, died: true });
  });

  it('redeploys an alive remote as a fresh life without entering the death lifecycle', () => {
    const damaged = applyAuthoritativeRemoteDamage(createRemoteHealthAuthorityState(true, 100), 65, 100).state;
    const redeployed = applyAuthoritativeRemoteRedeploy(damaged, 700);
    expect(redeployed.applied).toBe(true);
    expect(redeployed.state).toMatchObject({ hp: 100, alive: true, diedAtHostTimeMs: null, respawnEligibleAt: 0 });
  });
});
