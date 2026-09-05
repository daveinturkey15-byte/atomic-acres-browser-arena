export const DIRECTIONAL_DAMAGE_SECTORS = 8;
export const MAX_CONCURRENT_DAMAGE_DIRECTIONS = 4;
export const DIRECTIONAL_DAMAGE_LIFETIME_MS = 900;
export const LOW_HEALTH_ENTER_HP = 30;
export const LOW_HEALTH_EXIT_HP = 38;

export type DirectionalDamagePulse = Readonly<{
  sourceId: string;
  sourceType: 'local' | 'remote' | 'bot' | 'world';
  worldBearingRadians: number;
  angleRadians: number;
  sector: number;
  strength: number;
  startedAt: number;
}>;

export type DirectionalDamageState = Readonly<{
  pulses: readonly DirectionalDamagePulse[];
}>;

export type DirectionalDamagePresentation = Readonly<{
  sourceId: string;
  sourceType: DirectionalDamagePulse['sourceType'];
  angleRadians: number;
  sector: number;
  opacity: number;
}>;

export function createDirectionalDamageState(): DirectionalDamageState {
  return Object.freeze({ pulses: Object.freeze([]) });
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function normalizeAngle(angleRadians: number): number {
  if (!Number.isFinite(angleRadians)) return 0;
  const fullTurn = Math.PI * 2;
  return ((angleRadians + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
}

function angleSector(angleRadians: number): number {
  const normalized = normalizeAngle(angleRadians);
  return (Math.round(normalized / (Math.PI / 4)) + DIRECTIONAL_DAMAGE_SECTORS) % DIRECTIONAL_DAMAGE_SECTORS;
}

export function recordDirectionalDamage(
  state: DirectionalDamageState,
  input: Readonly<{
    sourceId: string;
    sourceType?: DirectionalDamagePulse['sourceType'];
    angleRadians: number;
    cameraYawRadians?: number;
    damage: number;
    now: number;
  }>,
): DirectionalDamageState {
  if (!input.sourceId.trim() || !Number.isFinite(input.now) || input.now < 0 || !Number.isFinite(input.damage) || input.damage <= 0) {
    return state;
  }
  const angleRadians = normalizeAngle(input.angleRadians);
  const worldBearingRadians = normalizeAngle(angleRadians - (input.cameraYawRadians ?? 0));
  const strength = Math.max(0.2, clamp01(input.damage / 45));
  const retained = state.pulses.filter((pulse) =>
    input.now - pulse.startedAt < DIRECTIONAL_DAMAGE_LIFETIME_MS && pulse.sourceId !== input.sourceId);
  const prior = state.pulses.find((pulse) => pulse.sourceId === input.sourceId);
  const pulse: DirectionalDamagePulse = Object.freeze({
    sourceId: input.sourceId,
    sourceType: input.sourceType ?? 'world',
    worldBearingRadians,
    angleRadians,
    sector: angleSector(angleRadians),
    strength: Math.max(strength, prior?.strength ?? 0),
    startedAt: input.now,
  });
  const pulses = [pulse, ...retained]
    .sort((left, right) => right.startedAt - left.startedAt || right.strength - left.strength || left.sourceId.localeCompare(right.sourceId))
    .slice(0, MAX_CONCURRENT_DAMAGE_DIRECTIONS);
  return Object.freeze({ pulses: Object.freeze(pulses) });
}

export function directionalDamagePresentation(
  state: DirectionalDamageState,
  now: number,
  cameraYawRadians = 0,
): readonly DirectionalDamagePresentation[] {
  if (!Number.isFinite(now)) return Object.freeze([]);
  return Object.freeze(state.pulses.flatMap((pulse) => {
    const age = Math.max(0, now - pulse.startedAt);
    if (age >= DIRECTIONAL_DAMAGE_LIFETIME_MS) return [];
    const remaining = 1 - age / DIRECTIONAL_DAMAGE_LIFETIME_MS;
    const angleRadians = normalizeAngle(pulse.worldBearingRadians + cameraYawRadians);
    return [Object.freeze({
      sourceId: pulse.sourceId,
      sourceType: pulse.sourceType,
      angleRadians,
      sector: angleSector(angleRadians),
      opacity: clamp01(pulse.strength * remaining * remaining),
    })];
  }));
}

export type LowHealthFeedbackState = Readonly<{
  active: boolean;
  activeSince: number | null;
}>;

export type LowHealthFeedbackPresentation = Readonly<{
  active: boolean;
  severity: number;
  vignetteOpacity: number;
  breathingGain: number;
  heartbeatGain: number;
  pulseHz: number;
}>;

export function createLowHealthFeedbackState(): LowHealthFeedbackState {
  return Object.freeze({ active: false, activeSince: null });
}

export function sampleLowHealthFeedback(
  state: LowHealthFeedbackState,
  input: Readonly<{ health: number; alive: boolean; now: number; reducedSensory: boolean }>,
): Readonly<{ state: LowHealthFeedbackState; presentation: LowHealthFeedbackPresentation }> {
  const health = Math.min(100, Math.max(0, Number.isFinite(input.health) ? input.health : 100));
  const now = Number.isFinite(input.now) && input.now >= 0 ? input.now : 0;
  const active = input.alive && (state.active ? health < LOW_HEALTH_EXIT_HP : health <= LOW_HEALTH_ENTER_HP);
  const activeSince = active ? state.activeSince ?? now : null;
  const nextState = Object.freeze({ active, activeSince });
  if (!active || activeSince === null) {
    return Object.freeze({
      state: nextState,
      presentation: Object.freeze({ active: false, severity: 0, vignetteOpacity: 0, breathingGain: 0, heartbeatGain: 0, pulseHz: 0 }),
    });
  }
  const severity = clamp01((LOW_HEALTH_EXIT_HP - health) / LOW_HEALTH_EXIT_HP);
  const pulseHz = input.reducedSensory ? 0.28 : 0.72;
  const phase = ((now - activeSince) / 1_000) * Math.PI * 2 * pulseHz;
  const wave = 0.5 + Math.sin(phase) * 0.5;
  const baseOpacity = input.reducedSensory ? 0.055 : 0.08;
  const pulseOpacity = input.reducedSensory ? 0.025 : 0.095;
  const breathingPeak = 0.025 + severity * 0.075;
  const heartbeatPeak = 0.018 + severity * 0.062;
  return Object.freeze({
    state: nextState,
    presentation: Object.freeze({
      active: true,
      severity,
      vignetteOpacity: clamp01(baseOpacity + severity * (0.08 + wave * pulseOpacity)),
      breathingGain: input.reducedSensory ? 0 : Number((breathingPeak * (0.65 + wave * 0.35)).toFixed(4)),
      heartbeatGain: input.reducedSensory ? 0 : Number((heartbeatPeak * Math.pow(wave, 4)).toFixed(4)),
      pulseHz,
    }),
  });
}
