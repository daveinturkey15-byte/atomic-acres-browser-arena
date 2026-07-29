function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function directionKey(direction) {
  return direction < 0 ? 'KeyA' : 'KeyD';
}

export function createRenderedCoverController(options = {}) {
  const config = {
    enabled: Boolean(options.enabled ?? false),
    probeDurationMs: Math.max(200, finite(options.probeDurationMs, 900)),
    occlusionConfirmMs: Math.max(100, finite(options.occlusionConfirmMs, 350)),
    damageQuietMs: Math.max(150, finite(options.damageQuietMs, 500)),
    holdDurationMs: Math.max(250, finite(options.holdDurationMs, 1200)),
    peekDurationMs: Math.max(150, finite(options.peekDurationMs, 500)),
    returnDurationMs: Math.max(150, finite(options.returnDurationMs, 450)),
    maximumProbeReversals: Math.max(0, Math.round(finite(options.maximumProbeReversals, 1))),
    maximumPeekCycles: Math.max(1, Math.round(finite(options.maximumPeekCycles, 3))),
    maximumActiveMs: Math.max(2000, finite(options.maximumActiveMs, 15000)),
    minimumHealth: Math.max(1, finite(options.minimumHealth, 24)),
    cueMargin: Math.max(0, finite(options.cueMargin, 0.015)),
  };
  const state = {
    mode: 'idle',
    direction: 0,
    activatedAt: null,
    phaseStartedAt: null,
    baselineTargetPixels: 0,
    baselineHealth: null,
    lastTargetAt: Number.NEGATIVE_INFINITY,
    lastDamageAt: Number.NEGATIVE_INFINITY,
    reversalsThisActivation: 0,
    peeksThisActivation: 0,
    activations: 0,
    acquisitions: 0,
    probeReversals: 0,
    aborts: 0,
    probeFrames: 0,
    occlusionFrames: 0,
    holdFrames: 0,
    peekFrames: 0,
    returnFrames: 0,
    confirmedPeekFrames: 0,
    cueSamples: 0,
    leftCueSum: 0,
    rightCueSum: 0,
    cueChosenDirections: 0,
    targetAwayDirections: 0,
  };

  const resetPhase = () => {
    state.mode = 'idle';
    state.direction = 0;
    state.activatedAt = null;
    state.phaseStartedAt = null;
    state.baselineTargetPixels = 0;
    state.baselineHealth = null;
    state.lastTargetAt = Number.NEGATIVE_INFINITY;
    state.reversalsThisActivation = 0;
    state.peeksThisActivation = 0;
  };

  const chooseDirection = (target, width, cues) => {
    const left = finite(cues?.left?.score);
    const right = finite(cues?.right?.score);
    state.cueSamples += 1;
    state.leftCueSum += left;
    state.rightCueSum += right;
    if (Math.abs(right - left) >= config.cueMargin) {
      state.cueChosenDirections += 1;
      return right > left ? 1 : -1;
    }
    state.targetAwayDirections += 1;
    return finite(target?.x, width / 2) < width / 2 ? 1 : -1;
  };

  const transition = (mode, now) => {
    state.mode = mode;
    state.phaseStartedAt = now;
  };

  return {
    update(observation = {}) {
      const now = finite(observation.now, Date.now());
      const active = Boolean(observation.active);
      const target = observation.target ?? null;
      const confirmedTarget = Boolean(observation.confirmedTarget);
      const width = Math.max(1, finite(observation.width, 320));
      const health = finite(observation.health, 100);
      const damageDelta = Math.max(0, finite(observation.damageDelta));
      if (!config.enabled || !active) {
        resetPhase();
        return { active: false, mode: 'idle', reason: config.enabled ? 'inactive' : 'disabled', keys: [], allowScan: true, event: null };
      }
      if (damageDelta > 0) state.lastDamageAt = now;
      if (target) state.lastTargetAt = now;

      let event = null;
      if (state.mode === 'idle' && damageDelta > 0 && target && health >= config.minimumHealth) {
        state.direction = chooseDirection(target, width, observation.coverCues);
        state.activatedAt = now;
        state.phaseStartedAt = now;
        state.baselineTargetPixels = Math.max(1, finite(target.pixels, target.bounds?.width * target.bounds?.height));
        state.baselineHealth = health;
        state.reversalsThisActivation = 0;
        state.peeksThisActivation = 0;
        state.activations += 1;
        transition('probe', now);
        event = { kind: 'activate', direction: state.direction, leftScore: finite(observation.coverCues?.left?.score), rightScore: finite(observation.coverCues?.right?.score) };
      }

      if (state.mode !== 'idle' && now - state.activatedAt >= config.maximumActiveMs) {
        state.aborts += 1;
        event = { kind: 'abort', reason: 'maximum-active-duration' };
        resetPhase();
      }

      if (state.mode === 'probe') {
        state.probeFrames += 1;
        const targetHiddenFor = now - state.lastTargetAt;
        const damageQuietFor = now - state.lastDamageAt;
        if (!target) state.occlusionFrames += 1;
        if (!target && targetHiddenFor >= config.occlusionConfirmMs && damageQuietFor >= config.damageQuietMs) {
          state.acquisitions += 1;
          transition('hold', now);
          event = { kind: 'acquire', direction: state.direction, targetHiddenFor, damageQuietFor };
        } else if (now - state.phaseStartedAt >= config.probeDurationMs) {
          if (state.reversalsThisActivation < config.maximumProbeReversals) {
            state.direction *= -1;
            state.reversalsThisActivation += 1;
            state.probeReversals += 1;
            state.baselineTargetPixels = Math.max(1, finite(target?.pixels, state.baselineTargetPixels));
            state.baselineHealth = health;
            state.phaseStartedAt = now;
            event = { kind: 'reverse', direction: state.direction, reason: 'probe-did-not-occlude' };
          } else {
            state.aborts += 1;
            event = { kind: 'abort', reason: 'probe-exhausted' };
            resetPhase();
          }
        }
      } else if (state.mode === 'hold') {
        state.holdFrames += 1;
        if (damageDelta > 0) {
          state.direction *= -1;
          state.reversalsThisActivation = 0;
          transition('probe', now);
          event = { kind: 'reverse', direction: state.direction, reason: 'cover-took-damage' };
        } else if (now - state.phaseStartedAt >= config.holdDurationMs) {
          state.peeksThisActivation += 1;
          transition('peek', now);
          event = { kind: 'peek', direction: -state.direction, cycle: state.peeksThisActivation };
        }
      } else if (state.mode === 'peek') {
        state.peekFrames += 1;
        if (confirmedTarget) state.confirmedPeekFrames += 1;
        if (confirmedTarget || damageDelta > 0 || now - state.phaseStartedAt >= config.peekDurationMs) {
          transition('return', now);
          event = { kind: 'return', direction: state.direction, reason: confirmedTarget ? 'confirmed-target' : damageDelta > 0 ? 'peek-damage' : 'peek-expired' };
        }
      } else if (state.mode === 'return') {
        state.returnFrames += 1;
        if (now - state.phaseStartedAt >= config.returnDurationMs) {
          if (state.peeksThisActivation >= config.maximumPeekCycles) {
            event = { kind: 'complete', reason: 'maximum-peek-cycles' };
            resetPhase();
          } else {
            transition('hold', now);
            event = { kind: 'hold', direction: state.direction };
          }
        }
      }

      const keys = [];
      let allowScan = true;
      if (state.mode === 'probe') keys.push(directionKey(state.direction), 'ShiftLeft');
      else if (state.mode === 'hold') allowScan = false;
      else if (state.mode === 'peek') keys.push(directionKey(-state.direction));
      else if (state.mode === 'return') keys.push(directionKey(state.direction), 'ShiftLeft');
      return {
        active: state.mode !== 'idle',
        mode: state.mode === 'idle' ? 'idle' : `cover-${state.mode}`,
        reason: state.mode === 'idle' ? 'idle' : `rendered-${state.mode}`,
        keys,
        allowScan,
        direction: state.direction,
        event,
      };
    },
    snapshot() {
      return {
        enabled: config.enabled,
        mode: state.mode,
        activations: state.activations,
        acquisitions: state.acquisitions,
        probeReversals: state.probeReversals,
        aborts: state.aborts,
        probeFrames: state.probeFrames,
        occlusionFrames: state.occlusionFrames,
        holdFrames: state.holdFrames,
        peekFrames: state.peekFrames,
        returnFrames: state.returnFrames,
        confirmedPeekFrames: state.confirmedPeekFrames,
        cueSamples: state.cueSamples,
        meanLeftCue: state.cueSamples ? state.leftCueSum / state.cueSamples : 0,
        meanRightCue: state.cueSamples ? state.rightCueSum / state.cueSamples : 0,
        cueChosenDirections: state.cueChosenDirections,
        targetAwayDirections: state.targetAwayDirections,
      };
    },
  };
}
