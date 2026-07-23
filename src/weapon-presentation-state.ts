import type { HitZone } from './gameplay';
import type { WeaponId } from './protocol';

export type FireCycleState = {
  flash: number;
  kick: number;
  boltTravel: number;
  smokeScale: number;
  casingReady: boolean;
};

export type HitReactionState = {
  envelope: number;
  pitch: number;
  roll: number;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;

/** Converts a base vertical field of view into a true angular magnification. */
export function magnifiedFovDegrees(baseFovDegrees: number, magnification: number): number {
  const safeBase = Math.min(120, Math.max(10, finite(baseFovDegrees, 76)));
  const safeMagnification = Math.min(12, Math.max(1, finite(magnification, 1)));
  const baseRadians = safeBase * Math.PI / 180;
  return 2 * Math.atan(Math.tan(baseRadians / 2) / safeMagnification) * 180 / Math.PI;
}

/** Sniper aim is deliberately binary; every other family retains authored easing. */
export function advanceAdsBlend(current: number, ads: boolean, dt: number, weapon: WeaponId): number {
  if (weapon === 'sniper') return ads ? 1 : 0;
  const safeCurrent = clamp01(finite(current));
  const safeDt = Math.max(0, finite(dt));
  const blend = 1 - Math.exp(-(ads ? 18 : 15) * safeDt);
  return clamp01(safeCurrent + ((ads ? 1 : 0) - safeCurrent) * blend);
}

/** Bounded heat accumulator used only for original presentation smoke/flash layering. */
export function advanceWeaponHeat(current: number, fired: boolean, dt: number, weapon: WeaponId): number {
  const safeCurrent = clamp01(finite(current));
  const safeDt = Math.max(0, finite(dt));
  const perShot = weapon === 'scattergun' ? 0.32 : weapon === 'sniper' ? 0.26 : weapon === 'lmg' ? 0.14 : weapon === 'smg' || weapon === 'machine-pistol' ? 0.1 : 0.17;
  const cooled = Math.max(0, safeCurrent - safeDt * 0.24);
  return clamp01(cooled + (fired ? perShot : 0));
}

/** Pulls camera-attached arms behind nearby world geometry without changing aim rays. */
export function viewmodelSurfaceRetreat(nearestSurfaceMeters: number | null, prone: boolean): number {
  const distance = nearestSurfaceMeters === null || !Number.isFinite(nearestSurfaceMeters)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, nearestSurfaceMeters);
  const obstruction = distance >= 1.2 ? 0 : (1 - distance / 1.2) * 0.52;
  return Math.min(0.56, Math.max(0, obstruction + (prone ? 0.045 : 0)));
}

/** Deterministic visual fire-cycle envelope. Gameplay recoil and hit rays remain authoritative elsewhere. */
export function fireCycleAt(weapon: WeaponId, rawAgeMs: number, heat: number): FireCycleState {
  const ageMs = Math.max(0, finite(rawAgeMs));
  const fastAuto = weapon === 'smg' || weapon === 'machine-pistol';
  const cycleMs = fastAuto ? 44 : weapon === 'scattergun' ? 620 : weapon === 'sniper' ? 920 : weapon === 'lmg' ? 84 : 62;
  const flashDuration = weapon === 'scattergun' ? 82 : weapon === 'sniper' ? 78 : weapon === 'lmg' ? 62 : fastAuto ? 36 : 52;
  const flashProgress = clamp01(ageMs / flashDuration);
  const flash = (1 - flashProgress) ** 2;
  const kickDuration = weapon === 'scattergun' ? 170 : weapon === 'sniper' ? 310 : weapon === 'lmg' ? 105 : fastAuto ? 50 : weapon === 'pistol' ? 58 : 62;
  const kickProgress = clamp01(ageMs / kickDuration);
  const kick = kickProgress >= 1 ? 0 : (1 - kickProgress) ** 1.35;
  const actionAge = weapon === 'scattergun' ? Math.max(0, ageMs - 180) : weapon === 'sniper' ? Math.max(0, ageMs - 130) : ageMs;
  const actionDuration = weapon === 'scattergun' ? 440 : weapon === 'sniper' ? 700 : cycleMs;
  const actionProgress = clamp01(actionAge / actionDuration);
  const boltTravel = actionProgress >= 1 ? 0 : Math.sin(actionProgress * Math.PI);
  return {
    flash,
    kick,
    boltTravel,
    smokeScale: 0.72 + clamp01(finite(heat)) * 1.28,
    casingReady: ageMs >= (weapon === 'scattergun' ? 230 : weapon === 'sniper' ? 150 : fastAuto ? 24 : 34),
  };
}

/** Presentation-only reaction envelope; authoritative operator hit meshes do not consume these rotations. */
export function hitReactionAt(rawAgeMs: number, zone: HitZone): HitReactionState {
  const ageMs = Math.max(0, finite(rawAgeMs));
  const duration = zone === 'head' ? 260 : 320;
  const progress = clamp01(ageMs / duration);
  if (progress >= 1) return { envelope: 0, pitch: 0, roll: 0 };
  const envelope = Math.sin(progress * Math.PI) * (1 - progress * 0.32);
  const strength = zone === 'head' ? 1 : zone === 'limb' ? 0.62 : 0.78;
  return {
    envelope: progress >= 1 ? 0 : envelope * strength,
    pitch: (zone === 'head' ? -0.2 : 0.12) * envelope * strength,
    roll: (zone === 'limb' ? 0.18 : 0.1) * envelope * strength,
  };
}
