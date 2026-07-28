const SUPPORT_THRESHOLDS = Object.freeze([
  { threshold: 7, code: 'Digit7', name: 'NUKE' },
  { threshold: 6, code: 'Digit6', name: 'HUNTER SWARM' },
  { threshold: 5, code: 'Digit5', name: 'TRI-PASS' },
  { threshold: 4, code: 'Digit4', name: 'YARDHAWK' },
  { threshold: 3, code: 'Digit3', name: 'SCOUT SWEEP' },
]);

export function parseVisibleCount(text) {
  const match = String(text ?? '').match(/(?:×|x|streak\s+)(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function chooseVisibleSupport(streak, usedThresholds = new Set()) {
  if (!Number.isFinite(Number(streak))) return null;
  return SUPPORT_THRESHOLDS.find((item) => Number(streak) >= item.threshold && !usedThresholds.has(item.threshold)) ?? null;
}

export function shouldThrowVisibleGrenade(observation) {
  const hasDistance = observation?.threatDistance !== null && observation?.threatDistance !== undefined
    && Number.isFinite(Number(observation.threatDistance));
  const distance = hasDistance ? Number(observation.threatDistance) : null;
  const distanceOrScaleValid = hasDistance
    ? distance >= Number(observation?.minimumDistance ?? 8) && distance <= Number(observation?.maximumDistance ?? 22)
    : Number(observation?.targetHeight ?? 0) >= Number(observation?.minimumTargetHeight ?? 8);
  return Boolean(observation?.enabled)
    && Number(observation?.grenades) > 0
    && Number(observation?.throwsSoFar) < Number(observation?.maximumThrows ?? 2)
    && Boolean(observation?.active)
    && Boolean(observation?.targetConfirmed)
    && Boolean(observation?.twoFrameAligned)
    && Number(observation?.stableFrames) >= 2
    && Number(observation?.alignment) <= Number(observation?.maximumAlignment ?? 0.008)
    && Number(observation?.health) >= Number(observation?.minimumHealth ?? 55)
    && distanceOrScaleValid
    && Number(observation?.now) - Number(observation?.lastThrowAt ?? Number.NEGATIVE_INFINITY)
      >= Number(observation?.cooldownMs ?? 20_000);
}
