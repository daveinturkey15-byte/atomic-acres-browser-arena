export const OVERDRIVE_SPAWN_INTERVAL_MS = 120_000;
export const OVERDRIVE_DURATION_MS = 30_000;
export const OVERDRIVE_DAMAGE_MULTIPLIER = 2;
export const OVERDRIVE_PICKUP_RADIUS = 1.65;
export const OVERDRIVE_POSITION = Object.freeze({ x: 0, y: 0.82, z: 0 });

export type OverdriveState = Readonly<{
  generation: number;
  available: boolean;
  nextSpawnAt: number;
  holderId: string | null;
  activeUntil: number;
}>;

export function createOverdriveState(matchStartedAt: number): OverdriveState {
  const startedAt = Number.isFinite(matchStartedAt) ? matchStartedAt : 0;
  return {
    generation: 0,
    available: false,
    nextSpawnAt: startedAt + OVERDRIVE_SPAWN_INTERVAL_MS,
    holderId: null,
    activeUntil: 0,
  };
}

export function advanceOverdrive(state: OverdriveState, now: number): OverdriveState {
  const safeNow = Number.isFinite(now) ? now : 0;
  const active = state.holderId !== null && safeNow < state.activeUntil;
  if (active) return state;
  if (!state.available && safeNow >= state.nextSpawnAt) {
    return { ...state, available: true, holderId: null, activeUntil: 0 };
  }
  if (state.holderId !== null || state.activeUntil !== 0) {
    return { ...state, holderId: null, activeUntil: 0 };
  }
  return state;
}

export function claimOverdrive(
  state: OverdriveState,
  playerId: string,
  position: Readonly<{ x: number; y: number; z: number }>,
  alive: boolean,
  now: number,
): { state: OverdriveState; claimed: boolean } {
  const advanced = advanceOverdrive(state, now);
  if (!advanced.available || !alive || !playerId || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
    return { state: advanced, claimed: false };
  }
  const distance = Math.hypot(position.x - OVERDRIVE_POSITION.x, position.z - OVERDRIVE_POSITION.z);
  if (distance > OVERDRIVE_PICKUP_RADIUS || Math.abs(position.y - OVERDRIVE_POSITION.y) > 2.4) {
    return { state: advanced, claimed: false };
  }
  const safeNow = Number.isFinite(now) ? now : 0;
  return {
    claimed: true,
    state: {
      generation: advanced.generation + 1,
      available: false,
      nextSpawnAt: safeNow + OVERDRIVE_SPAWN_INTERVAL_MS,
      holderId: playerId,
      activeUntil: safeNow + OVERDRIVE_DURATION_MS,
    },
  };
}

export function overdriveDamageMultiplier(state: OverdriveState, playerId: string, now: number): number {
  return state.holderId === playerId && Number.isFinite(now) && now < state.activeUntil
    ? OVERDRIVE_DAMAGE_MULTIPLIER
    : 1;
}

export function overdriveRemainingMs(state: OverdriveState, playerId: string, now: number): number {
  return state.holderId === playerId ? Math.max(0, Math.ceil(state.activeUntil - now)) : 0;
}

export function transferOverdriveOnElimination(
  state: OverdriveState,
  victimId: string,
  killerId: string,
  now: number,
): { state: OverdriveState; transferred: boolean } {
  if (!killerId || killerId === victimId || state.holderId !== victimId || !Number.isFinite(now) || now >= state.activeUntil) {
    return { state, transferred: false };
  }
  return {
    transferred: true,
    state: { ...state, generation: state.generation + 1, holderId: killerId },
  };
}
