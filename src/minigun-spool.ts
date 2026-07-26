export const MINIGUN_PRESENTATION_SPIN_UP_MS = 1_200;
export const MINIGUN_PRESENTATION_SPIN_DOWN_MS = 720;
export const MINIGUN_MAX_BARREL_RADIANS_PER_SECOND = 42;

export type MinigunSpoolPhase = 'idle' | 'spooling-up' | 'ready' | 'spooling-down';

export type MinigunSpoolState = {
  fraction: number;
  angleRadians: number;
  radiansPerSecond: number;
  phase: MinigunSpoolPhase;
};

export function createMinigunSpoolState(): MinigunSpoolState {
  return { fraction: 0, angleRadians: 0, radiansPerSecond: 0, phase: 'idle' };
}

function finiteDeltaSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(0.05, value)) : 0;
}

/**
 * Advances presentation only. Host shot admission remains the sole authority
 * for the first legal round and consumes its own trigger-start timestamp.
 */
export function advanceMinigunSpool(
  state: MinigunSpoolState,
  input: Readonly<{ dt: number; triggerHeld: boolean; equipped: boolean }>,
): MinigunSpoolState {
  const dt = finiteDeltaSeconds(input.dt);
  const target = input.equipped && input.triggerHeld ? 1 : 0;
  const priorFraction = state.fraction;
  const seconds = target > priorFraction
    ? MINIGUN_PRESENTATION_SPIN_UP_MS / 1_000
    : MINIGUN_PRESENTATION_SPIN_DOWN_MS / 1_000;
  const step = seconds > 0 ? dt / seconds : 1;
  state.fraction = target > priorFraction
    ? Math.min(target, priorFraction + step)
    : Math.max(target, priorFraction - step);
  state.radiansPerSecond = MINIGUN_MAX_BARREL_RADIANS_PER_SECOND * state.fraction;
  state.angleRadians = (state.angleRadians + state.radiansPerSecond * dt) % (Math.PI * 2);
  state.phase = state.fraction <= 1e-6
    ? 'idle'
    : target === 1 && state.fraction >= 1 - 1e-6
      ? 'ready'
      : target === 1 ? 'spooling-up' : 'spooling-down';
  return state;
}

export function resetMinigunSpool(state: MinigunSpoolState): void {
  state.fraction = 0;
  state.angleRadians = 0;
  state.radiansPerSecond = 0;
  state.phase = 'idle';
}
