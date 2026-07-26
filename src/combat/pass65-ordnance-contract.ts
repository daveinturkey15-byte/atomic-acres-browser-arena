export const FLASHBANG_HITL_CONTRACT = Object.freeze({
  detonationTrigger: 'first-authoritative-impact',
  preDetonationBeeps: 0,
  whiteoutGain: 5,
  preservesHud: true,
  fullEffectsRecoveryMs: 2_800,
  reducedEffectsRecoveryMs: 900,
  audioPeakCeilingDbfs: -1,
  audioLimiterRequired: true,
  flashPolicy: 'single-bounded-onset-and-recovery',
} as const);

export type FlashbangPresentation = Readonly<{
  whiteoutOpacity: number;
  hudOpacity: 1;
  recoveryMs: number;
  audioGain: number;
  detonateNow: true;
  scheduleBeeps: false;
}>;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/**
 * Maps a host-authoritative exposure into one bounded local onset/recovery.
 * Five-times gain means even a moderate accepted exposure reaches a complete
 * whiteout, while the HUD remains unmasked and reduced-sensory wins locally.
 */
export function flashbangPresentation(
  authoritativeIntensity: number,
  reducedSensory: boolean,
): FlashbangPresentation {
  const admitted = clamp01(authoritativeIntensity);
  const sensoryScale = reducedSensory ? 0.1 : 1;
  return Object.freeze({
    whiteoutOpacity: clamp01(admitted * FLASHBANG_HITL_CONTRACT.whiteoutGain * sensoryScale),
    hudOpacity: 1,
    recoveryMs: reducedSensory
      ? FLASHBANG_HITL_CONTRACT.reducedEffectsRecoveryMs
      : FLASHBANG_HITL_CONTRACT.fullEffectsRecoveryMs,
    audioGain: clamp01(admitted * (reducedSensory ? 0.2 : 1)),
    detonateNow: true,
    scheduleBeeps: false,
  });
}

export const SEMTEX_HITL_CONTRACT = Object.freeze({
  id: 'semtex',
  collisionPolicy: 'stick-world-and-current-actor-life',
  fuseOrigin: 'first-authoritative-impact',
  fuseMs: 1_100,
  maximumNoImpactLifetimeMs: 5_000,
  blastMaximumDamage: 95,
  blastMinimumDamage: 18,
  blastRadiusM: 4.25,
  proneDamageMultiplier: 0.42,
  followsRespawnedLife: false,
  damageResolution: 'exactly-once',
} as const);

/** Pure balance oracle shared by local and host-admitted remote Semtex damage. */
export function semtexBlastDamage(distanceM: number, prone: boolean): number {
  if (!Number.isFinite(distanceM) || distanceM < 0 || distanceM > SEMTEX_HITL_CONTRACT.blastRadiusM) return 0;
  const alpha = distanceM / SEMTEX_HITL_CONTRACT.blastRadiusM;
  const standingDamage = SEMTEX_HITL_CONTRACT.blastMaximumDamage
    + (SEMTEX_HITL_CONTRACT.blastMinimumDamage - SEMTEX_HITL_CONTRACT.blastMaximumDamage) * alpha;
  return standingDamage * (prone ? SEMTEX_HITL_CONTRACT.proneDamageMultiplier : 1);
}
