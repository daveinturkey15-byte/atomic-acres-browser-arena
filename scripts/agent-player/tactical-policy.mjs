import { createRenderedCoverController } from './rendered-cover-controller.mjs';

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function createTacticalPolicy(options = {}) {
  const config = {
    retreatHealth: Number(options.retreatHealth ?? 45),
    retreatDamage: Number(options.retreatDamage ?? 18),
    damageWindowMs: Number(options.damageWindowMs ?? 700),
    retreatDurationMs: Number(options.retreatDurationMs ?? 1_600),
    recoveryDurationMs: Number(options.recoveryDurationMs ?? 1_100),
    recoveryCooldownMs: Number(options.recoveryCooldownMs ?? 3_600),
    closeThreatDistance: Number(options.closeThreatDistance ?? 18),
    sprintThreatDistance: Number(options.sprintThreatDistance ?? 30),
    postShotStrafeMs: Number(options.postShotStrafeMs ?? 650),
    routeSweepInterval: Number(options.routeSweepInterval ?? 36),
    routeSweepTurn: Number(options.routeSweepTurn ?? 18),
    threatAwareRetreatDirection: options.threatAwareRetreatDirection !== false,
    lowHealthEvade: options.lowHealthEvade === true,
    respawnEscapeDurationMs: Math.max(0, Number(options.respawnEscapeDurationMs ?? 0)),
    respawnReentryDurationMs: Math.max(0, Number(options.respawnReentryDurationMs ?? 0)),
    respawnQuickDeathWindowMs: Math.max(0, Number(options.respawnQuickDeathWindowMs ?? 0)),
    respawnQuickDeathEscapeBonusMs: Math.max(0, Number(options.respawnQuickDeathEscapeBonusMs ?? 0)),
    respawnQuickDeathCooldownMs: Math.max(0, Number(options.respawnQuickDeathCooldownMs ?? 0)),
    retreatReturnFire: options.retreatReturnFire === true,
    retreatReturnFireMinimumHealth: Number(options.retreatReturnFireMinimumHealth ?? 30),
    contactSearchAfterMs: Math.max(0, Number(options.contactSearchAfterMs ?? 0)),
    contactSearchTurn: Math.max(0, Number(options.contactSearchTurn ?? 24)),
    contactSearchMinimapGuidance: options.contactSearchMinimapGuidance === true,
    bankLeadMinimumKills: Number(options.bankLeadMinimumKills ?? 0),
    bankLeadMinimumMargin: Number(options.bankLeadMinimumMargin ?? 1),
    killAnchorDurationMs: Number(options.killAnchorDurationMs ?? 0),
    rawTargetObserveDurationMs: Number(options.rawTargetObserveDurationMs ?? 0),
    rawTargetObserveResetMs: Number(options.rawTargetObserveResetMs ?? 1_500),
    renderedCover: options.renderedCover === true,
    coverProbeDurationMs: Math.max(200, Number(options.coverProbeDurationMs ?? 900)),
    coverOcclusionConfirmMs: Math.max(100, Number(options.coverOcclusionConfirmMs ?? 350)),
    coverDamageQuietMs: Math.max(150, Number(options.coverDamageQuietMs ?? 500)),
    coverHoldDurationMs: Math.max(250, Number(options.coverHoldDurationMs ?? 1_200)),
    coverPeekDurationMs: Math.max(150, Number(options.coverPeekDurationMs ?? 500)),
    coverReturnDurationMs: Math.max(150, Number(options.coverReturnDurationMs ?? 450)),
    coverMaximumProbeReversals: Math.max(0, Number(options.coverMaximumProbeReversals ?? 1)),
    coverMaximumPeekCycles: Math.max(1, Number(options.coverMaximumPeekCycles ?? 3)),
    coverMaximumActiveMs: Math.max(2_000, Number(options.coverMaximumActiveMs ?? 15_000)),
    coverMinimumHealth: Math.max(1, Number(options.coverMinimumHealth ?? 24)),
    coverPeekMinimumHealth: Math.max(1, Number(options.coverPeekMinimumHealth ?? 80)),
    coverCueMargin: Math.max(0, Number(options.coverCueMargin ?? 0.015)),
  };
  const coverController = createRenderedCoverController({
    enabled: config.renderedCover,
    probeDurationMs: config.coverProbeDurationMs,
    occlusionConfirmMs: config.coverOcclusionConfirmMs,
    damageQuietMs: config.coverDamageQuietMs,
    holdDurationMs: config.coverHoldDurationMs,
    peekDurationMs: config.coverPeekDurationMs,
    returnDurationMs: config.coverReturnDurationMs,
    maximumProbeReversals: config.coverMaximumProbeReversals,
    maximumPeekCycles: config.coverMaximumPeekCycles,
    maximumActiveMs: config.coverMaximumActiveMs,
    minimumHealth: config.coverMinimumHealth,
    peekMinimumHealth: config.coverPeekMinimumHealth,
    cueMargin: config.coverCueMargin,
  });
  const state = {
    mode: 'roam',
    enteredAt: 0,
    retreatUntil: 0,
    recoveryUntil: 0,
    recoveryCooldownUntil: 0,
    direction: 1,
    lastDamageAt: Number.NEGATIVE_INFINITY,
    damageWindowStartedAt: Number.NEGATIVE_INFINITY,
    damageWindowAmount: 0,
    transitions: 0,
    leadBankActive: false,
    killAnchorUntil: 0,
    killAnchorActivations: 0,
    killAnchorRenewals: 0,
    killAnchorActiveFrames: 0,
    killAnchorEngagementFrames: 0,
    rawTargetObservationStartedAt: null,
    rawTargetLastSeenAt: Number.NEGATIVE_INFINITY,
    rawTargetObservationExpired: false,
    rawTargetObservationExpirations: 0,
    rawTargetObservationFrames: 0,
    lowHealthEvasionFrames: 0,
    everActive: false,
    wasActive: false,
    pendingRespawn: false,
    respawnEscapeUntil: 0,
    respawnReentryUntil: 0,
    respawnEscapeActivations: 0,
    respawnEscapeFrames: 0,
    respawnReentryFrames: 0,
    currentLifeStartedAt: null,
    lastLifeDurationMs: null,
    quickDeathStreak: 0,
    quickDeathReceipts: 0,
    quickDeathCooldownUntil: 0,
    quickDeathCooldownFrames: 0,
    retreatReturnFireFrames: 0,
    lastConfirmedTargetAt: Number.NEGATIVE_INFINITY,
    contactSearchFrames: 0,
    minimapGuidedContactSearchFrames: 0,
    modeFrames: { roam: 0, engage: 0, retreat: 0, recover: 0, bank: 0, anchor: 0 },
  };

  const transition = (mode, now, reason) => {
    if (state.mode === mode) return null;
    const previous = state.mode;
    state.mode = mode;
    state.enteredAt = now;
    state.transitions += 1;
    return { previous, mode, reason, at: now };
  };

  return {
    config,
    state,
    update(observation) {
      const now = Number(observation.now);
      const health = Number(observation.health);
      const healthValid = observation.healthFresh !== false && Number.isFinite(health) && health >= 0 && health <= 100;
      const damageDelta = Math.max(0, Number(observation.damageDelta ?? 0));
      const visibleKillDelta = Math.max(0, Number(observation.visibleKillDelta ?? 0));
      const kills = Number(observation.kills);
      const deaths = Number(observation.deaths);
      const scoreFresh = Number.isFinite(kills) && Number.isFinite(deaths) && kills >= 0 && deaths >= 0;
      const rawTarget = Boolean(observation.rawTarget);
      if (!observation.active) {
        if (state.wasActive) {
          state.pendingRespawn = true;
          if (state.currentLifeStartedAt !== null) {
            state.lastLifeDurationMs = Math.max(0, now - state.currentLifeStartedAt);
            if (config.respawnQuickDeathWindowMs > 0
              && state.lastLifeDurationMs < config.respawnQuickDeathWindowMs) {
              state.quickDeathStreak += 1;
              state.quickDeathReceipts += 1;
            } else {
              state.quickDeathStreak = 0;
            }
          }
        }
        state.wasActive = false;
      } else {
        if (!state.everActive) {
          state.everActive = true;
          state.currentLifeStartedAt = now;
          state.lastConfirmedTargetAt = now;
        } else if (state.pendingRespawn) {
          const quickDeathBonus = state.quickDeathStreak > 0
            ? config.respawnQuickDeathEscapeBonusMs * Math.min(state.quickDeathStreak, 2)
            : 0;
          const escapeDurationMs = config.respawnEscapeDurationMs + quickDeathBonus;
          if (escapeDurationMs > 0) {
            state.direction *= -1;
            state.respawnEscapeUntil = now + escapeDurationMs;
            state.quickDeathCooldownUntil = state.respawnEscapeUntil
              + (state.quickDeathStreak > 0 ? config.respawnQuickDeathCooldownMs : 0);
            state.respawnReentryUntil = state.quickDeathCooldownUntil + config.respawnReentryDurationMs;
            state.respawnEscapeActivations += 1;
          }
          state.currentLifeStartedAt = now;
          state.lastConfirmedTargetAt = now;
          state.pendingRespawn = false;
        }
        state.wasActive = true;
      }
      if (!observation.active) {
        state.rawTargetObservationStartedAt = null;
        state.rawTargetLastSeenAt = Number.NEGATIVE_INFINITY;
        state.rawTargetObservationExpired = false;
      } else if (rawTarget) {
        if (state.rawTargetObservationStartedAt === null
          || now - state.rawTargetLastSeenAt > config.rawTargetObserveResetMs) {
          state.rawTargetObservationStartedAt = now;
          state.rawTargetObservationExpired = false;
        }
        state.rawTargetLastSeenAt = now;
      } else if (now - state.rawTargetLastSeenAt > config.rawTargetObserveResetMs) {
        state.rawTargetObservationStartedAt = null;
        state.rawTargetObservationExpired = false;
      }
      const boundedRawObservation = config.rawTargetObserveDurationMs > 0;
      const rawTargetObservationActive = rawTarget && (!boundedRawObservation
        || now - state.rawTargetObservationStartedAt < config.rawTargetObserveDurationMs);
      if (rawTargetObservationActive && boundedRawObservation) state.rawTargetObservationFrames += 1;
      if (rawTarget && boundedRawObservation && !rawTargetObservationActive && !state.rawTargetObservationExpired) {
        state.rawTargetObservationExpired = true;
        state.rawTargetObservationExpirations += 1;
      }
      if (observation.active && observation.currentTarget) state.lastConfirmedTargetAt = now;
      if (observation.active && config.bankLeadMinimumKills > 0 && scoreFresh
        && kills >= config.bankLeadMinimumKills && kills - deaths >= config.bankLeadMinimumMargin) {
        state.leadBankActive = true;
      }
      let anchorEvent = null;
      if (observation.active && config.killAnchorDurationMs > 0 && visibleKillDelta > 0) {
        const renewed = now < state.killAnchorUntil;
        state.killAnchorUntil = now + config.killAnchorDurationMs;
        state.killAnchorActivations += 1;
        if (renewed) state.killAnchorRenewals += 1;
        anchorEvent = {
          kind: renewed ? 'renew' : 'activate',
          visibleKillDelta,
          expiresAt: state.killAnchorUntil,
        };
      }
      if (!observation.active) {
        state.retreatUntil = 0;
        state.recoveryUntil = 0;
        state.damageWindowStartedAt = Number.NEGATIVE_INFINITY;
        state.damageWindowAmount = 0;
        state.killAnchorUntil = 0;
        state.respawnEscapeUntil = 0;
        state.quickDeathCooldownUntil = 0;
        state.respawnReentryUntil = 0;
      }
      const coverDecision = coverController.update({
        now,
        active: observation.active && healthValid && health > 0,
        health,
        damageDelta,
        target: observation.currentTargetDetails ?? observation.rawTargetDetails ?? null,
        confirmedTarget: Boolean(observation.currentTarget),
        coverCues: observation.renderedCoverCues,
        width: observation.frameWidth,
      });
      if (observation.active && damageDelta > 0) {
        if (now - state.damageWindowStartedAt > config.damageWindowMs) {
          state.damageWindowStartedAt = now;
          state.damageWindowAmount = 0;
        }
        state.damageWindowAmount += damageDelta;
        state.lastDamageAt = now;
        if (!coverDecision.active && (health < config.retreatHealth || state.damageWindowAmount >= config.retreatDamage)) {
          if (state.mode !== 'retreat') {
            const bearing = Number(observation.minimapThreat?.bearingRadians);
            state.direction = config.threatAwareRetreatDirection && Number.isFinite(bearing) && Math.abs(bearing) > 0.08
              ? (bearing > 0 ? -1 : 1)
              : -state.direction;
          }
          state.retreatUntil = Math.max(state.retreatUntil, now + config.retreatDurationMs);
        }
      }

      let reason = 'roam-clear';
      let nextMode = 'roam';
      if (!observation.active) {
        reason = 'inactive-match';
      } else if (!healthValid) {
        nextMode = 'recover';
        reason = 'invalid-health-hold';
      } else if (health <= 0) {
        state.recoveryUntil = Math.max(state.recoveryUntil, now + 900);
        nextMode = 'recover';
        reason = 'death-reset';
      } else if (now < state.respawnEscapeUntil) {
        nextMode = 'retreat';
        reason = 'respawn-escape';
      } else if (coverDecision.active) {
        nextMode = coverDecision.mode;
        reason = coverDecision.reason;
      } else if (now < state.retreatUntil) {
        nextMode = 'retreat';
        reason = health < config.retreatHealth ? 'low-health' : 'damage-burst';
      } else if (health < config.retreatHealth) {
        if (config.lowHealthEvade) {
          nextMode = 'retreat';
          reason = 'low-health-evasion';
        } else {
          nextMode = 'recover';
          reason = 'low-health-hold';
        }
      } else if (observation.stuck && now >= state.recoveryCooldownUntil) {
        state.direction *= -1;
        state.recoveryUntil = now + config.recoveryDurationMs;
        state.recoveryCooldownUntil = now + config.recoveryCooldownMs;
        nextMode = 'recover';
        reason = 'low-world-motion';
      } else if (now < state.recoveryUntil) {
        nextMode = 'recover';
        reason = 'bounded-recovery';
      } else if (observation.stuck) {
        nextMode = 'recover';
        reason = 'stuck-cooldown-hold';
      } else if (observation.currentTarget || rawTargetObservationActive) {
        nextMode = 'engage';
        reason = observation.currentTarget ? 'confirmed-operator' : 'candidate-observation';
      } else if (now < state.quickDeathCooldownUntil) {
        nextMode = 'anchor';
        reason = 'quick-death-cooldown';
      } else if (now < state.killAnchorUntil) {
        nextMode = 'anchor';
        reason = 'visible-kill-productive-angle';
      } else if (state.leadBankActive) {
        nextMode = 'bank';
        reason = 'visible-kill-lead-bank';
      } else if (rawTarget && boundedRawObservation) {
        reason = 'candidate-observation-expired';
      } else if (now < state.respawnReentryUntil) {
        reason = 'respawn-reentry';
      } else if (config.contactSearchAfterMs > 0 && now - state.lastConfirmedTargetAt >= config.contactSearchAfterMs) {
        reason = 'contact-search-sweep';
      }
      const changed = transition(nextMode, now, reason);
      state.modeFrames[nextMode] = (state.modeFrames[nextMode] ?? 0) + 1;
      if (reason === 'low-health-evasion') state.lowHealthEvasionFrames += 1;
      if (reason === 'respawn-escape') state.respawnEscapeFrames += 1;
      if (reason === 'respawn-reentry') state.respawnReentryFrames += 1;
      if (reason === 'quick-death-cooldown') state.quickDeathCooldownFrames += 1;
      if (reason === 'contact-search-sweep') state.contactSearchFrames += 1;
      const killAnchorActive = observation.active && now < state.killAnchorUntil;
      if (killAnchorActive) {
        state.killAnchorActiveFrames += 1;
        if (observation.currentTarget || observation.rawTarget) state.killAnchorEngagementFrames += 1;
      }

      const retreatReturnFire = nextMode === 'retreat'
        && reason !== 'respawn-escape'
        && config.retreatReturnFire
        && Boolean(observation.currentTarget)
        && healthValid
        && health >= config.retreatReturnFireMinimumHealth;
      if (retreatReturnFire) state.retreatReturnFireFrames += 1;
      const keys = [];
      let turn = 0;
      if (observation.active) {
        if (coverDecision.active && nextMode.startsWith('cover-')) {
          keys.push(...coverDecision.keys);
        } else if (nextMode === 'retreat') {
          keys.push('KeyS', state.direction > 0 ? 'KeyD' : 'KeyA', 'ShiftLeft');
          if (observation.navigationTick) turn = state.direction * 16;
        } else if (nextMode === 'recover') {
          if (reason !== 'invalid-health-hold' && reason !== 'low-health-hold') {
            keys.push('KeyS', state.direction > 0 ? 'KeyD' : 'KeyA');
            if (changed?.reason === 'low-world-motion') turn = state.direction * 92;
          }
        } else if (nextMode === 'engage') {
          if (observation.currentTarget
            && !observation.holdEngagement
            && now - Number(observation.lastShotAt ?? Number.NEGATIVE_INFINITY) < config.postShotStrafeMs) {
            keys.push(state.direction > 0 ? 'KeyA' : 'KeyD');
          }
        } else if (nextMode === 'anchor') {
          // Hold the productive position that just converted a visible kill.
          // Incoming damage/low health still take precedence above and force retreat.
        } else if (nextMode === 'bank') {
          const threat = observation.minimapThreat;
          if (threat) {
            const bearing = Number(threat.bearingRadians ?? 0);
            const distance = Number(threat.distance ?? Number.POSITIVE_INFINITY);
            keys.push(bearing >= 0 ? 'KeyA' : 'KeyD');
            if (distance <= config.closeThreatDistance) keys.push('KeyS');
          } else {
            keys.push(state.direction > 0 ? 'KeyA' : 'KeyD');
          }
          if (observation.navigationTick && observation.movementCycle % 18 === 0) {
            state.direction *= -1;
            turn = state.direction * 12;
          }
        } else {
          const threat = observation.minimapThreat;
          if (reason === 'respawn-reentry') {
            keys.push('KeyW', 'ShiftLeft');
            if (observation.navigationTick) turn = state.direction * 18;
          } else if (reason === 'contact-search-sweep') {
            keys.push('KeyW', 'ShiftLeft');
            if (observation.navigationTick) {
              const guidedBearing = Number(observation.minimapThreat?.bearingRadians);
              if (config.contactSearchMinimapGuidance && Number.isFinite(guidedBearing)) {
                turn = Math.abs(guidedBearing) < 0.12 ? 0 : Math.sign(guidedBearing) * config.contactSearchTurn;
                state.minimapGuidedContactSearchFrames += 1;
              } else {
                turn = state.direction * config.contactSearchTurn;
              }
            }
          } else if (threat) {
            const bearing = Number(threat.bearingRadians ?? 0);
            const distance = Number(threat.distance ?? Number.POSITIVE_INFINITY);
            if (distance <= config.closeThreatDistance) {
              keys.push(bearing >= 0 ? 'KeyA' : 'KeyD');
            } else if (Math.abs(bearing) < 0.58) {
              keys.push('KeyW');
              if (distance >= config.sprintThreatDistance) keys.push('ShiftLeft');
            } else {
              keys.push(bearing > 0 ? 'KeyD' : 'KeyA');
            }
          } else {
            keys.push('KeyW');
            if (observation.movementCycle % 10 < 6) keys.push('ShiftLeft');
            if (observation.movementCycle % 24 === 7) keys.push('KeyA');
            if (observation.movementCycle % 24 === 19) keys.push('KeyD');
            if (observation.navigationTick && observation.movementCycle % config.routeSweepInterval === 0) {
              const sweep = Math.floor(observation.movementCycle / config.routeSweepInterval) % 2 === 0 ? -1 : 1;
              turn = sweep * config.routeSweepTurn;
            }
          }
        }
      }
      return {
        mode: nextMode,
        reason,
        changed,
        keys: [...new Set(keys)],
        turn: clamp(turn, -100, 100),
        allowEngagement: nextMode === 'engage' || retreatReturnFire || (coverDecision.active && Boolean(observation.currentTarget)),
        allowScan: coverDecision.active
          ? coverDecision.allowScan
          : nextMode === 'roam' || nextMode === 'engage' || nextMode === 'bank' || nextMode === 'anchor' || retreatReturnFire,
        damageWindowAmount: state.damageWindowAmount,
        direction: coverDecision.active ? coverDecision.direction : state.direction,
        leadBankActive: state.leadBankActive,
        killAnchorActive,
        anchorEvent,
        coverEvent: coverDecision.event,
      };
    },
    snapshot() {
      return {
        mode: state.mode,
        transitions: state.transitions,
        modeFrames: { ...state.modeFrames },
        leadBankActive: state.leadBankActive,
        killAnchorUntil: state.killAnchorUntil,
        killAnchorActivations: state.killAnchorActivations,
        killAnchorRenewals: state.killAnchorRenewals,
        killAnchorActiveFrames: state.killAnchorActiveFrames,
        killAnchorEngagementFrames: state.killAnchorEngagementFrames,
        rawTargetObservationExpirations: state.rawTargetObservationExpirations,
        rawTargetObservationFrames: state.rawTargetObservationFrames,
        lowHealthEvasionFrames: state.lowHealthEvasionFrames,
        respawnEscapeActivations: state.respawnEscapeActivations,
        respawnEscapeFrames: state.respawnEscapeFrames,
        respawnReentryFrames: state.respawnReentryFrames,
        lastLifeDurationMs: state.lastLifeDurationMs,
        quickDeathStreak: state.quickDeathStreak,
        quickDeathReceipts: state.quickDeathReceipts,
        quickDeathCooldownFrames: state.quickDeathCooldownFrames,
        retreatReturnFireFrames: state.retreatReturnFireFrames,
        contactSearchFrames: state.contactSearchFrames,
        minimapGuidedContactSearchFrames: state.minimapGuidedContactSearchFrames,
        renderedCover: coverController.snapshot(),
        config: { ...config },
      };
    },
  };
}
