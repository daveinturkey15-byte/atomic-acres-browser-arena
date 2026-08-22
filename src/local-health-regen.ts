import { REMOTE_HEALTH_REGEN_DELAY_MS, REMOTE_HEALTH_REGEN_PER_SECOND } from './remote-health-authority';

/** HF-338: Pure health regeneration step for the local projection.
 * Reuses the same delay and rate constants as the remote health authority.
 * Must be called from the fixed-step loop gated ONLY on gameStarted && player.alive && match phase active.
 * Does NOT gate on playerSimulationEnabled() so possession no longer suppresses regeneration.
 */
export function advanceLocalHealthRegen({
  hp,
  lastDamageAt,
  adrenalineActive,
  now,
  dtSeconds,
}: {
  hp: number;
  lastDamageAt: number;
  adrenalineActive: boolean;
  now: number;
  dtSeconds: number;
}): number {
  if (!Number.isFinite(hp) || hp >= 100 || dtSeconds <= 0 || !Number.isFinite(now) || !Number.isFinite(lastDamageAt)) {
    return hp;
  }
  const delayMs = adrenalineActive ? 0 : REMOTE_HEALTH_REGEN_DELAY_MS;
  const rate = adrenalineActive ? REMOTE_HEALTH_REGEN_PER_SECOND + 1 : REMOTE_HEALTH_REGEN_PER_SECOND;
  if (now - lastDamageAt < delayMs) {
    return hp;
  }
  const regenAmount = rate * dtSeconds;
  return Math.min(100, hp + regenAmount);
}