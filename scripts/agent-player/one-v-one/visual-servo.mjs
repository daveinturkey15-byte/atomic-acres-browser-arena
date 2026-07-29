const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function createVisualServoController(config) {
  let previous = null;
  return {
    update(track, frame) {
      if (!track || !track.bounds) return { phase: 'SEARCH', mouseX: 0, mouseY: 0, errorX: null, errorY: null, normalizedError: null, aligned: false, saturated: false };
      const targetX = track.centre?.x ?? track.x ?? (track.bounds.x + track.bounds.width / 2);
      const targetY = track.centre?.y ?? track.y ?? (track.bounds.y + track.bounds.height * config.aimPointVerticalFraction);
      const latencySeconds = config.measuredControlLatencyMs / 1000;
      const leadX = clamp((track.vx ?? 0) * latencySeconds, -config.maximumLeadPixels, config.maximumLeadPixels);
      const leadY = clamp((track.vy ?? 0) * latencySeconds, -config.maximumLeadPixels, config.maximumLeadPixels);
      const errorX = targetX + leadX - frame.width / 2;
      const errorY = targetY + leadY - frame.height / 2;
      const normalizedX = errorX / frame.width; const normalizedY = errorY / frame.height;
      const aligned = Math.abs(normalizedX) <= config.deadbandXNormalized && Math.abs(normalizedY) <= config.deadbandYNormalized;
      const normalizedError = Math.hypot(normalizedX, normalizedY);
      const phase = aligned ? 'ALIGNED' : normalizedError > config.coarseThresholdNormalized ? 'COARSE' : 'FINE';
      const gain = phase === 'COARSE' ? config.coarseGain : phase === 'FINE' ? config.fineGain : 0;
      const derivativeX = previous ? errorX - previous.errorX : 0; const derivativeY = previous ? errorY - previous.errorY : 0;
      const rawX = phase === 'ALIGNED' ? 0 : (gain * errorX + config.derivativeGain * derivativeX) / config.pixelsPerMouseX;
      const rawY = phase === 'ALIGNED' ? 0 : (gain * errorY + config.derivativeGain * derivativeY) / config.pixelsPerMouseY;
      const mouseX = Math.round(clamp(rawX, -config.maximumMouseX, config.maximumMouseX));
      const mouseY = Math.round(clamp(rawY, -config.maximumMouseY, config.maximumMouseY));
      const saturated = Math.abs(rawX) > config.maximumMouseX || Math.abs(rawY) > config.maximumMouseY;
      previous = { errorX, errorY };
      return { phase, mouseX, mouseY, errorX, errorY, normalizedError, aligned, saturated, leadX, leadY };
    },
    reset() { previous = null; },
  };
}
