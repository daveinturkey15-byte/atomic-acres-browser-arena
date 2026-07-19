export const REMOTE_RESPAWN_MIN_MS = 1_800;

export type RemoteHealthAuthorityState = Readonly<{
  hp: number;
  alive: boolean;
  respawnEligibleAt: number;
}>;

export function createRemoteHealthAuthorityState(alive = true): RemoteHealthAuthorityState {
  return { hp: alive ? 100 : 0, alive, respawnEligibleAt: 0 };
}

export function applyAuthoritativeRemoteDamage(
  state: RemoteHealthAuthorityState,
  damage: number,
  now: number,
): { applied: boolean; died: boolean; state: RemoteHealthAuthorityState } {
  if (!state.alive || !Number.isFinite(damage) || damage <= 0 || !Number.isFinite(now)) {
    return { applied: false, died: false, state };
  }
  const hp = Math.max(0, state.hp - Math.min(100, damage));
  const died = hp <= 0;
  return {
    applied: true,
    died,
    state: died
      ? { hp: 0, alive: false, respawnEligibleAt: now + REMOTE_RESPAWN_MIN_MS }
      : { ...state, hp },
  };
}

export function admitAuthoritativeRemoteRespawn(
  state: RemoteHealthAuthorityState,
  incomingHp: number,
  now: number,
): { respawned: boolean; state: RemoteHealthAuthorityState } {
  if (state.alive || incomingHp <= 0 || !Number.isFinite(now) || now < state.respawnEligibleAt) {
    return { respawned: false, state };
  }
  return { respawned: true, state: createRemoteHealthAuthorityState(true) };
}
