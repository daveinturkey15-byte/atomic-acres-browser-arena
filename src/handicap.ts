export const DHV_VALUES = [10, 8, 6, 4, 2, 'X'] as const;
export type Dhv = typeof DHV_VALUES[number];

export function isDhv(value: unknown): value is Dhv {
  return DHV_VALUES.includes(value as Dhv);
}

/** Lower DHV values deliberately reduce outgoing damage. X keeps the DHV 2 output. */
export function dhvOutgoingMultiplier(value: Dhv): number {
  return value === 'X' ? 0.2 : value / 10;
}

/** Lower DHV values deliberately increase incoming damage. X is handled as one-hit lethal. */
export function dhvIncomingMultiplier(value: Dhv): number {
  return value === 'X' ? Number.POSITIVE_INFINITY : 2 - value / 10;
}

export function applyDhvOutgoingDamage(damage: number, value: Dhv): number {
  return Math.max(0, Number.isFinite(damage) ? damage : 0) * dhvOutgoingMultiplier(value);
}

/** The X-mode magnum's clean headshot is the one deliberate exception to reduced output. */
export function applyDhvWeaponOutgoingDamage(damage: number, value: Dhv, magnumHeadshot: boolean): number {
  const admitted = Math.max(0, Number.isFinite(damage) ? damage : 0);
  if (value === 'X' && magnumHeadshot && admitted >= 99) return 100;
  return applyDhvOutgoingDamage(admitted, value);
}

export function applyDhvIncomingDamage(damage: number, currentHealth: number, value: Dhv): number {
  const admitted = Math.max(0, Number.isFinite(damage) ? damage : 0);
  if (admitted <= 0) return 0;
  if (value === 'X') return Math.max(0, Number.isFinite(currentHealth) ? currentHealth : 0);
  return admitted * dhvIncomingMultiplier(value);
}

export function dhvLabel(value: Dhv): string {
  return value === 10 ? 'STANDARD' : value === 'X' ? 'ONE-SHOT / MAGNUM' : `${Math.round((1 - value / 10) * 100)}% HANDICAP`;
}
