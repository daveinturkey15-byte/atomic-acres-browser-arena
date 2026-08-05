export const BOT_SMOKE_DEGRADED_DENSITY = 0.18;
export const BOT_SMOKE_FIRE_BLOCK_DENSITY = 0.35;
export const BOT_SMOKE_BLOCKING_DENSITY = 0.55;
export const BOT_FLASH_MAX_BLIND_MS = 2_800;
export const BOT_FLASH_RECOVERY_MS = 450;
export const BOT_MAX_REMEMBERED_FLASH_RESULTS = 32;

export type BotPerceptionState = Readonly<{
  matchEpoch: number;
  botId: string;
  lifeId: number;
  revision: number;
  targetLockId: string | null;
  blindUntilHostTimeMs: number;
  fireSuppressedUntilHostTimeMs: number;
  rememberedFlashResultIds: readonly string[];
}>;

export type BotPerceptionProjection = Readonly<{
  state: BotPerceptionState;
  canSeeTarget: boolean;
  canFire: boolean;
  preciseTracking: boolean;
  smokeDensity: number;
  aimErrorRadians: number;
  reason: 'clear' | 'solid-occluded' | 'blocking-smoke' | 'degraded-smoke' | 'flash-blind' | 'flash-recovery';
}>;

function canonicalId(value: string, maximum = 160): boolean {
  return value.length > 0 && value.length <= maximum && /^[a-zA-Z0-9:_.|-]+$/.test(value);
}

function freezeState(state: BotPerceptionState): BotPerceptionState {
  return Object.freeze({ ...state, rememberedFlashResultIds: Object.freeze([...state.rememberedFlashResultIds]) });
}

export function createBotPerceptionState(matchEpoch: number, botId: string, lifeId: number): BotPerceptionState {
  if (!Number.isSafeInteger(matchEpoch) || matchEpoch < 1 || !canonicalId(botId)
    || !Number.isSafeInteger(lifeId) || lifeId < 0) throw new TypeError('Invalid bot perception identity');
  return freezeState({
    matchEpoch,
    botId,
    lifeId,
    revision: 0,
    targetLockId: null,
    blindUntilHostTimeMs: 0,
    fireSuppressedUntilHostTimeMs: 0,
    rememberedFlashResultIds: [],
  });
}

export function admitBotFlash(
  state: BotPerceptionState,
  request: Readonly<{
    isHost: boolean;
    matchEpoch: number;
    targetLifeId: number;
    resultId: string;
    hostTimeMs: number;
    durationMs: number;
    intensity: number;
    facingDot: number;
    hasLineOfSight: boolean;
  }>,
): Readonly<{ accepted: boolean; reason: 'accepted' | 'not-host' | 'wrong-epoch' | 'stale-life' | 'malformed' | 'replay' | 'not-exposed'; state: BotPerceptionState }> {
  const reject = (reason: 'not-host' | 'wrong-epoch' | 'stale-life' | 'malformed' | 'replay' | 'not-exposed') => (
    Object.freeze({ accepted: false as const, reason, state })
  );
  if (!request.isHost) return reject('not-host');
  if (request.matchEpoch !== state.matchEpoch) return reject('wrong-epoch');
  if (request.targetLifeId !== state.lifeId) return reject('stale-life');
  if (!canonicalId(request.resultId, 220) || !Number.isFinite(request.hostTimeMs) || request.hostTimeMs < 0
    || !Number.isFinite(request.durationMs) || request.durationMs <= 0
    || !Number.isFinite(request.intensity) || request.intensity <= 0 || request.intensity > 1
    || !Number.isFinite(request.facingDot) || request.facingDot < -1 || request.facingDot > 1) return reject('malformed');
  if (state.rememberedFlashResultIds.includes(request.resultId)) return reject('replay');
  if (!request.hasLineOfSight || request.facingDot <= 0.05) return reject('not-exposed');
  const blindMs = Math.min(BOT_FLASH_MAX_BLIND_MS, Math.max(1, Math.round(request.durationMs)));
  const blindUntilHostTimeMs = Math.max(state.blindUntilHostTimeMs, request.hostTimeMs + blindMs);
  const next = freezeState({
    ...state,
    revision: state.revision + 1,
    targetLockId: null,
    blindUntilHostTimeMs,
    fireSuppressedUntilHostTimeMs: blindUntilHostTimeMs + BOT_FLASH_RECOVERY_MS,
    rememberedFlashResultIds: [...state.rememberedFlashResultIds, request.resultId]
      .slice(-BOT_MAX_REMEMBERED_FLASH_RESULTS),
  });
  return Object.freeze({ accepted: true, reason: 'accepted', state: next });
}

export function resolveBotPerception(
  state: BotPerceptionState,
  input: Readonly<{
    hostTimeMs: number;
    targetId: string;
    solidLineOfSight: boolean;
    smokeDensity: number;
  }>,
): BotPerceptionProjection {
  const density = Math.max(0, Math.min(1, Number.isFinite(input.smokeDensity) ? input.smokeDensity : 1));
  const blind = input.hostTimeMs < state.blindUntilHostTimeMs;
  const recovering = !blind && input.hostTimeMs < state.fireSuppressedUntilHostTimeMs;
  const blockingSmoke = density >= BOT_SMOKE_BLOCKING_DENSITY;
  const degradedSmoke = density >= BOT_SMOKE_DEGRADED_DENSITY;
  const canSeeTarget = input.solidLineOfSight && !blind && !blockingSmoke;
  const canFire = canSeeTarget && !recovering && density < BOT_SMOKE_FIRE_BLOCK_DENSITY;
  const preciseTracking = canSeeTarget && !degradedSmoke && !recovering;
  const targetLockId = canSeeTarget ? input.targetId : null;
  const nextState = targetLockId === state.targetLockId ? state : freezeState({
    ...state,
    revision: state.revision + 1,
    targetLockId,
  });
  const reason: BotPerceptionProjection['reason'] = !input.solidLineOfSight ? 'solid-occluded'
    : blind ? 'flash-blind'
      : blockingSmoke ? 'blocking-smoke'
        : recovering ? 'flash-recovery'
          : degradedSmoke ? 'degraded-smoke' : 'clear';
  return Object.freeze({
    state: nextState,
    canSeeTarget,
    canFire,
    preciseTracking,
    smokeDensity: density,
    aimErrorRadians: preciseTracking ? 0 : 0.035 + density * 0.14,
    reason,
  });
}
