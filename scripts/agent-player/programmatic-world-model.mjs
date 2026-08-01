// Bounded active-abstraction adapter for Atomic Acres tactical lifecycle events.
//
// The live game is stochastic (bots, latency, rendering), so this deliberately
// models only a small hidden-state transition at a verified life boundary.  It
// cannot click, aim or fire.  The deterministic tactical actor consumes at most
// one short escape/re-entry plan and re-evaluates every rendered frame.

const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function evaluateRespawnWorldModel({
  now,
  previousLifeAgeMs,
  priorQuickDeathStreak,
  quickDeathWindowMs,
  baseEscapeDurationMs,
  quickDeathEscapeBonusMs,
  quickDeathCooldownMs,
  reentryDurationMs,
}) {
  const t = Math.max(0, finite(now));
  const lifeAge = previousLifeAgeMs == null ? null : Math.max(0, finite(previousLifeAgeMs));
  const windowMs = Math.max(0, finite(quickDeathWindowMs));
  const observedQuickDeath = lifeAge != null && windowMs > 0 && lifeAge < windowMs;
  const quickDeathStreak = observedQuickDeath
    ? clamp(Math.trunc(finite(priorQuickDeathStreak)) + 1, 0, 2)
    : 0;
  const bonusMs = Math.max(0, finite(quickDeathEscapeBonusMs));
  const useModel = quickDeathStreak > 0 && bonusMs > 0;
  const escapeDurationMs = Math.max(0, finite(baseEscapeDurationMs))
    + (useModel ? quickDeathStreak * bonusMs : 0);
  const nextCooldownUntil = t + escapeDurationMs
    + (quickDeathStreak > 0 ? Math.max(0, finite(quickDeathCooldownMs)) : 0);

  return {
    schemaVersion: 1,
    paper: 'arXiv:2607.28287',
    abstraction: 'life-boundary-quick-death-v1',
    useModel,
    init: {
      previousLifeAgeMs: lifeAge,
      priorQuickDeathStreak: Math.max(0, Math.trunc(finite(priorQuickDeathStreak))),
      compactModelSupported: lifeAge != null && windowMs > 0,
    },
    transition: {
      observedQuickDeath,
      quickDeathStreak,
      nextCooldownUntil,
    },
    render: {
      expectedMode: escapeDurationMs > 0 ? 'respawn-escape' : 'roam',
      escapeDurationMs,
      reentryDurationMs: escapeDurationMs > 0 ? Math.max(0, finite(reentryDurationMs)) : 0,
    },
    outcome: {
      objective: 'interrupt a verified quick-death spawn cascade without changing aim/fire authority',
      actorAuthority: 'deterministic-rendered-pixel-javascript-only',
      invalidateOn: ['visible-target', 'new-damage', 'death', 'match-end'],
    },
  };
}
