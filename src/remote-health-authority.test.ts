import { describe, expect, it } from 'vitest';
import {
  REMOTE_RESPAWN_MIN_MS,
  admitAuthoritativeRemoteRespawn,
  applyAuthoritativeRemoteDamage,
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
    expect(applyAuthoritativeRemoteDamage(lethal.state, 100, 300).applied).toBe(false);
  });

  it('admits respawn only after the host-authored lifecycle delay', () => {
    const dead = applyAuthoritativeRemoteDamage(createRemoteHealthAuthorityState(), 100, 1_000).state;
    expect(admitAuthoritativeRemoteRespawn(dead, 100, 1_000 + REMOTE_RESPAWN_MIN_MS - 1).respawned).toBe(false);
    expect(admitAuthoritativeRemoteRespawn(dead, 0, 1_000 + REMOTE_RESPAWN_MIN_MS).respawned).toBe(false);
    expect(admitAuthoritativeRemoteRespawn(dead, 100, 1_000 + REMOTE_RESPAWN_MIN_MS).respawned).toBe(true);
  });
});
