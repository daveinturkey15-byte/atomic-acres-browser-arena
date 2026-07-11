import type { WeaponId } from './protocol';

export type HitZone = 'head' | 'body' | 'limb';

export type WeaponSpec = {
  id: WeaponId;
  name: string;
  damage: number;
  minimumDamage: number;
  falloffStart: number;
  falloffEnd: number;
  headMultiplier: number;
  limbMultiplier: number;
  rpm: number;
  mag: number;
  reserve: number;
  reload: number;
  hipSpread: number;
  adsSpreadMultiplier: number;
  movementSpreadMultiplier: number;
  crouchSpreadMultiplier: number;
  sustainedSpreadPerShot: number;
  maximumSpread: number;
  pellets: number;
  recoilPitch: number;
  recoilYaw: number;
  recoilRecovery: number;
  switchSeconds: number;
  automatic: boolean;
  color: number;
};

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  carbine: {
    id: 'carbine', name: 'M86 Carbine', damage: 31, minimumDamage: 20,
    falloffStart: 24, falloffEnd: 72, headMultiplier: 1.45, limbMultiplier: 0.82,
    rpm: 650, mag: 30, reserve: 120, reload: 1.8,
    hipSpread: 0.012, adsSpreadMultiplier: 0.28, movementSpreadMultiplier: 1.65,
    crouchSpreadMultiplier: 0.78, sustainedSpreadPerShot: 0.0016, maximumSpread: 0.045,
    pellets: 1, recoilPitch: 0.016, recoilYaw: 0.006, recoilRecovery: 12,
    switchSeconds: 0.48, automatic: true, color: 0xffd166,
  },
  smg: {
    id: 'smg', name: 'Vectorline SMG', damage: 23, minimumDamage: 14,
    falloffStart: 15, falloffEnd: 52, headMultiplier: 1.35, limbMultiplier: 0.8,
    rpm: 860, mag: 32, reserve: 128, reload: 1.5,
    hipSpread: 0.018, adsSpreadMultiplier: 0.42, movementSpreadMultiplier: 1.45,
    crouchSpreadMultiplier: 0.82, sustainedSpreadPerShot: 0.0021, maximumSpread: 0.058,
    pellets: 1, recoilPitch: 0.011, recoilYaw: 0.009, recoilRecovery: 15,
    switchSeconds: 0.4, automatic: true, color: 0x65e7ff,
  },
  scattergun: {
    id: 'scattergun', name: 'Model 12 Scattergun', damage: 14, minimumDamage: 5,
    falloffStart: 8, falloffEnd: 30, headMultiplier: 1.15, limbMultiplier: 0.88,
    rpm: 82, mag: 8, reserve: 40, reload: 2.35,
    hipSpread: 0.068, adsSpreadMultiplier: 0.72, movementSpreadMultiplier: 1.22,
    crouchSpreadMultiplier: 0.88, sustainedSpreadPerShot: 0.002, maximumSpread: 0.09,
    pellets: 9, recoilPitch: 0.052, recoilYaw: 0.012, recoilRecovery: 8,
    switchSeconds: 0.62, automatic: false, color: 0xff8a5b,
  },
};

export type MovementContext = {
  crouched: boolean;
  ads: boolean;
  sprinting: boolean;
  grounded: boolean;
};

export type MovementProfile = {
  maxSpeed: number;
  acceleration: number;
  friction: number;
  eyeHeight: number;
  jumpVelocity: number;
};

export function movementProfile(context: MovementContext): MovementProfile {
  const maxSpeed = context.crouched ? 3.45 : context.ads ? 4.35 : context.sprinting ? 10.25 : 7.15;
  const groundAcceleration = context.crouched ? 26 : context.sprinting ? 40 : 34;
  return {
    maxSpeed,
    acceleration: context.grounded ? groundAcceleration : groundAcceleration * 0.28,
    friction: context.grounded ? 9.4 : 0.9,
    eyeHeight: context.crouched ? 1.16 : 1.7,
    jumpVelocity: 6.8,
  };
}

export type SpreadContext = {
  ads: boolean;
  moving: boolean;
  crouched: boolean;
  sustainedShots: number;
};

export function computeSpread(weapon: WeaponSpec, context: SpreadContext): number {
  let spread = weapon.hipSpread;
  if (context.ads) spread *= weapon.adsSpreadMultiplier;
  if (context.moving) spread *= weapon.movementSpreadMultiplier;
  if (context.crouched) spread *= weapon.crouchSpreadMultiplier;
  spread += Math.max(0, context.sustainedShots) * weapon.sustainedSpreadPerShot;
  return Math.min(weapon.maximumSpread, spread);
}

export function computeDamage(weapon: WeaponSpec, distance: number, zone: HitZone): number {
  const clampedDistance = Math.max(0, distance);
  const falloff = clampedDistance <= weapon.falloffStart
    ? 0
    : Math.min(1, (clampedDistance - weapon.falloffStart) / Math.max(0.001, weapon.falloffEnd - weapon.falloffStart));
  const base = weapon.damage + (weapon.minimumDamage - weapon.damage) * falloff;
  const multiplier = zone === 'head' ? weapon.headMultiplier : zone === 'limb' ? weapon.limbMultiplier : 1;
  return Math.max(1, Math.round(base * multiplier));
}

export type ReloadState = {
  weapon: WeaponId;
  startedAt: number;
  seatAt: number;
  endsAt: number;
  phase: 'eject';
};

export function beginReload(weapon: WeaponSpec, ammo: number, reserve: number, now: number): ReloadState | null {
  if (ammo >= weapon.mag || reserve <= 0) return null;
  const duration = weapon.reload * 1_000;
  return {
    weapon: weapon.id,
    startedAt: now,
    seatAt: now + duration * 0.72,
    endsAt: now + duration,
    phase: 'eject',
  };
}

export function cancelReload(state: ReloadState, now: number): boolean {
  return now < state.seatAt;
}

export function completeReload(
  state: ReloadState,
  now: number,
  ammo: number,
  reserve: number,
): { ammo: number; reserve: number; completed: boolean } {
  if (now < state.endsAt) return { ammo, reserve, completed: false };
  const weapon = WEAPONS[state.weapon];
  const moved = Math.min(weapon.mag - ammo, reserve);
  return { ammo: ammo + moved, reserve: reserve - moved, completed: true };
}

export function recoverRecoil(value: number, weapon: WeaponSpec, dt: number): number {
  return Math.max(0, value * Math.exp(-weapon.recoilRecovery * Math.max(0, dt)));
}

export function grenadeDamage(distance: number): number {
  const radius = 8;
  if (distance >= radius) return 0;
  const normalized = Math.max(0, 1 - Math.max(0, distance) / radius);
  return Math.round(115 * normalized * normalized);
}

export function meleeStrike(distance: number, now: number, lastMeleeAt: number): { hit: boolean; damage: number } {
  const ready = now - lastMeleeAt >= 650;
  const hit = ready && distance <= 1.75;
  return { hit, damage: hit ? 100 : 0 };
}

export type MatchPhase = 'warmup' | 'active' | 'ended';
export type MatchState = {
  phase: MatchPhase;
  phaseStartedAt: number;
  endsAt: number;
  winner: 0 | 1 | 'draw' | null;
  rematchRequested?: boolean;
};

export function createMatch(now: number): MatchState {
  return { phase: 'warmup', phaseStartedAt: now, endsAt: now + 3_000, winner: null };
}

export function advanceMatch(state: MatchState, now: number, scores: [number, number]): MatchState {
  if (state.phase === 'ended' && state.rematchRequested) return createMatch(now);
  if (state.phase === 'warmup' && now >= state.endsAt) {
    return { phase: 'active', phaseStartedAt: now, endsAt: now + 300_000, winner: null };
  }
  if (state.phase === 'active' && (scores[0] >= 25 || scores[1] >= 25 || now >= state.endsAt)) {
    const winner = scores[0] === scores[1] ? 'draw' : scores[0] > scores[1] ? 0 : 1;
    return { phase: 'ended', phaseStartedAt: now, endsAt: now, winner };
  }
  return state;
}
