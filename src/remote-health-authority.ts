export const REMOTE_RESPAWN_MIN_MS = 1_800;
export const REMOTE_HEALTH_REGEN_DELAY_MS = 5_000;
export const REMOTE_HEALTH_REGEN_PER_SECOND = 18;

export type RemoteHealthAuthorityState = Readonly<{
  hp: number;
  alive: boolean;
  respawnEligibleAt: number;
  diedAtHostTimeMs: number | null;
  lastDamageAtHostTimeMs: number;
  lastAdvancedAtHostTimeMs: number;
}>;

export type AuthoritativeRemoteDamageResult = Readonly<{
  applied: boolean;
  died: boolean;
  /** Stored health before this mutation advanced deterministic regeneration. */
  healthBeforeAdvance: number;
  /** Canonical health after regeneration and before admitted damage. */
  healthBefore: number;
  healthAfter: number;
  damageRequested: number;
  damageApplied: number;
  state: RemoteHealthAuthorityState;
}>;

export type RemoteDamageResolver = (damage: number, canonicalHealth: number) => number;

export function createRemoteHealthAuthorityState(alive = true, now = 0): RemoteHealthAuthorityState {
  const hostTime = Number.isFinite(now) ? Math.max(0, now) : 0;
  return {
    hp: alive ? 100 : 0,
    alive,
    respawnEligibleAt: 0,
    diedAtHostTimeMs: alive ? null : hostTime,
    lastDamageAtHostTimeMs: hostTime,
    lastAdvancedAtHostTimeMs: hostTime,
  };
}

/** Advance the host-owned health ledger with the same 5 s / 18 HP/s contract as the local simulation. */
export function advanceRemoteHealthAuthority(
  state: RemoteHealthAuthorityState,
  now: number,
): RemoteHealthAuthorityState {
  if (!state.alive || !Number.isFinite(now) || now <= state.lastAdvancedAtHostTimeMs) return state;
  const regenFrom = Math.max(state.lastAdvancedAtHostTimeMs, state.lastDamageAtHostTimeMs + REMOTE_HEALTH_REGEN_DELAY_MS);
  const regenMs = Math.max(0, now - regenFrom);
  return {
    ...state,
    hp: regenMs > 0
      ? Math.min(100, state.hp + regenMs * REMOTE_HEALTH_REGEN_PER_SECOND / 1_000)
      : state.hp,
    lastAdvancedAtHostTimeMs: now,
  };
}

export function applyAuthoritativeRemoteDamage(
  state: RemoteHealthAuthorityState,
  damage: number,
  now: number,
  resolveDamage: RemoteDamageResolver = (requested) => requested,
): AuthoritativeRemoteDamageResult {
  if (!state.alive || !Number.isFinite(damage) || damage <= 0 || !Number.isFinite(now)) {
    return {
      applied: false,
      died: false,
      healthBeforeAdvance: state.hp,
      healthBefore: state.hp,
      healthAfter: state.hp,
      damageRequested: 0,
      damageApplied: 0,
      state,
    };
  }
  const advanced = advanceRemoteHealthAuthority(state, now);
  const resolvedDamage = resolveDamage(damage, advanced.hp);
  if (!Number.isFinite(resolvedDamage) || resolvedDamage <= 0) {
    return {
      applied: false,
      died: false,
      healthBeforeAdvance: state.hp,
      healthBefore: state.hp,
      healthAfter: state.hp,
      damageRequested: 0,
      damageApplied: 0,
      state,
    };
  }
  const damageRequested = Math.min(100, resolvedDamage);
  const hp = Math.max(0, advanced.hp - damageRequested);
  const damageApplied = advanced.hp - hp;
  const died = hp <= 0;
  return {
    applied: true,
    died,
    healthBeforeAdvance: state.hp,
    healthBefore: advanced.hp,
    healthAfter: hp,
    damageRequested,
    damageApplied,
    state: died
      ? {
          ...advanced,
          hp: 0,
          alive: false,
          respawnEligibleAt: now + REMOTE_RESPAWN_MIN_MS,
          diedAtHostTimeMs: now,
          lastDamageAtHostTimeMs: now,
          lastAdvancedAtHostTimeMs: now,
        }
      : {
          ...advanced,
          hp,
          lastDamageAtHostTimeMs: now,
          lastAdvancedAtHostTimeMs: now,
        },
  };
}

/** A class redeploy starts a fresh life without manufacturing a combat death. */
export function applyAuthoritativeRemoteRedeploy(
  state: RemoteHealthAuthorityState,
  now: number,
): { applied: boolean; state: RemoteHealthAuthorityState } {
  if (!state.alive || !Number.isFinite(now)) return { applied: false, state };
  return { applied: true, state: createRemoteHealthAuthorityState(true, now) };
}

export function admitAuthoritativeRemoteRespawn(
  state: RemoteHealthAuthorityState,
  incomingHp: number,
  now: number,
): { respawned: boolean; state: RemoteHealthAuthorityState } {
  if (state.alive || incomingHp <= 0 || !Number.isFinite(now) || now < state.respawnEligibleAt) {
    return { respawned: false, state };
  }
  return { respawned: true, state: createRemoteHealthAuthorityState(true, now) };
}
