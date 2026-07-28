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
    bankLeadMinimumKills: Number(options.bankLeadMinimumKills ?? 0),
    bankLeadMinimumMargin: Number(options.bankLeadMinimumMargin ?? 1),
  };
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
    modeFrames: { roam: 0, engage: 0, retreat: 0, recover: 0, bank: 0 },
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
      const kills = Number(observation.kills);
      const deaths = Number(observation.deaths);
      const scoreFresh = Number.isFinite(kills) && Number.isFinite(deaths) && kills >= 0 && deaths >= 0;
      if (observation.active && config.bankLeadMinimumKills > 0 && scoreFresh
        && kills >= config.bankLeadMinimumKills && kills - deaths >= config.bankLeadMinimumMargin) {
        state.leadBankActive = true;
      }
      if (!observation.active) {
        state.retreatUntil = 0;
        state.recoveryUntil = 0;
        state.damageWindowStartedAt = Number.NEGATIVE_INFINITY;
        state.damageWindowAmount = 0;
      }
      if (observation.active && damageDelta > 0) {
        if (now - state.damageWindowStartedAt > config.damageWindowMs) {
          state.damageWindowStartedAt = now;
          state.damageWindowAmount = 0;
        }
        state.damageWindowAmount += damageDelta;
        state.lastDamageAt = now;
        if (health < config.retreatHealth || state.damageWindowAmount >= config.retreatDamage) {
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
      } else if (now < state.retreatUntil) {
        nextMode = 'retreat';
        reason = health < config.retreatHealth ? 'low-health' : 'damage-burst';
      } else if (health < config.retreatHealth) {
        nextMode = 'recover';
        reason = 'low-health-hold';
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
      } else if (observation.currentTarget || observation.rawTarget) {
        nextMode = 'engage';
        reason = observation.currentTarget ? 'confirmed-operator' : 'candidate-observation';
      } else if (state.leadBankActive) {
        nextMode = 'bank';
        reason = 'visible-kill-lead-bank';
      }
      const changed = transition(nextMode, now, reason);
      state.modeFrames[nextMode] += 1;

      const keys = [];
      let turn = 0;
      if (observation.active) {
        if (nextMode === 'retreat') {
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
          if (threat) {
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
        allowEngagement: nextMode === 'engage',
        allowScan: nextMode === 'roam' || nextMode === 'engage' || nextMode === 'bank',
        damageWindowAmount: state.damageWindowAmount,
        direction: state.direction,
        leadBankActive: state.leadBankActive,
      };
    },
    snapshot() {
      return {
        mode: state.mode,
        transitions: state.transitions,
        modeFrames: { ...state.modeFrames },
        leadBankActive: state.leadBankActive,
        config: { ...config },
      };
    },
  };
}
