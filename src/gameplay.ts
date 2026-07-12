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
  deceleration: number;
  friction: number;
  eyeHeight: number;
  jumpVelocity: number;
};

export function movementProfile(context: MovementContext): MovementProfile {
  const maxSpeed = context.crouched ? 3.15 : context.ads ? 4.05 : context.sprinting ? 8.7 : 6.15;
  const groundAcceleration = context.crouched ? 36 : context.sprinting ? 54 : context.ads ? 40 : 48;
  return {
    maxSpeed,
    acceleration: context.grounded ? groundAcceleration : 10.5,
    deceleration: context.grounded ? (context.crouched ? 42 : 62) : 2.4,
    friction: context.grounded ? 0 : 0.25,
    eyeHeight: context.crouched ? 1.16 : 1.7,
    jumpVelocity: 6.35,
  };
}

export type HorizontalVelocity = { x: number; z: number };

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return target;
}

/** Converges on authored speed without creating a hidden low terminal speed through friction. */
export function integrateHorizontalVelocity(
  velocity: HorizontalVelocity,
  input: HorizontalVelocity,
  profile: MovementProfile,
  dt: number,
): HorizontalVelocity {
  const inputLength = Math.hypot(input.x, input.z);
  const normalized = inputLength > 1 ? { x: input.x / inputLength, z: input.z / inputLength } : input;
  const target = { x: normalized.x * profile.maxSpeed, z: normalized.z * profile.maxSpeed };
  const rate = inputLength > 0.001 ? profile.acceleration : profile.deceleration;
  const maxDelta = Math.max(0, rate * Math.max(0, dt));
  return {
    x: approach(velocity.x, target.x, maxDelta),
    z: approach(velocity.z, target.z, maxDelta),
  };
}

export function sprintEligible(forwardInput: number, strafeInput: number, ads: boolean, crouched: boolean): boolean {
  return !ads && !crouched && forwardInput > 0.45 && Math.abs(strafeInput) < 0.92;
}

export function mouseSensitivityMultiplier(ads: boolean, sprinting: boolean): number {
  return ads ? 0.68 : sprinting ? 0.94 : 1;
}

export function applyRadialDeadzone(x: number, y: number, deadzone = 0.14, exponent = 1.6): { x: number; y: number } {
  const magnitude = Math.min(1, Math.hypot(x, y));
  if (magnitude <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.pow((magnitude - deadzone) / Math.max(0.001, 1 - deadzone), exponent);
  return { x: (x / magnitude) * scaled, y: (y / magnitude) * scaled };
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

/** Uniformly samples a circular cone instead of biasing shots through a random XYZ cube. */
export function sampleSpreadDisk(angle: number, radialRandom: number, angularRandom: number): { x: number; y: number } {
  const radius = Math.tan(Math.max(0, angle)) * Math.sqrt(Math.min(1, Math.max(0, radialRandom)));
  const theta = Math.min(1, Math.max(0, angularRandom)) * Math.PI * 2;
  return { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius };
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

export type RecoilImpulse = { pitch: number; yaw: number };

export function computeRecoilImpulse(weapon: WeaponSpec, sustainedShots: number, random: number): RecoilImpulse {
  const buildup = 1 + Math.min(0.48, Math.max(0, sustainedShots) * 0.045);
  const centeredRandom = Math.max(-1, Math.min(1, random * 2 - 1));
  return {
    pitch: weapon.recoilPitch * buildup,
    yaw: weapon.recoilYaw * centeredRandom * (0.8 + buildup * 0.28),
  };
}

export function recoverRecoilImpulse(recoil: RecoilImpulse, weapon: WeaponSpec, dt: number): RecoilImpulse {
  const damping = Math.exp(-weapon.recoilRecovery * Math.max(0, dt));
  return { pitch: recoil.pitch * damping, yaw: recoil.yaw * damping };
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
