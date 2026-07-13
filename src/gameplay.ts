import type { WeaponId } from './protocol';

export type HitZone = 'head' | 'body' | 'limb';
export type Stance = 'stand' | 'crouch' | 'prone';

/** Solo bots deal half of the equivalent player-weapon damage. */
export const BOT_DAMAGE_MULTIPLIER = 0.5;

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
  prone?: boolean;
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
  const prone = context.prone === true;
  const maxSpeed = prone ? 1.55 : context.crouched ? 3.15 : context.ads ? 4.05 : context.sprinting ? 8.7 : 6.15;
  const groundAcceleration = prone ? 17 : context.crouched ? 36 : context.sprinting ? 54 : context.ads ? 40 : 48;
  return {
    maxSpeed,
    acceleration: context.grounded ? groundAcceleration : 10.5,
    deceleration: context.grounded ? (prone ? 25 : context.crouched ? 42 : 62) : 2.4,
    friction: context.grounded ? 0 : 0.25,
    eyeHeight: prone ? 0.5 : context.crouched ? 1.16 : 1.7,
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
  const delta = { x: target.x - velocity.x, z: target.z - velocity.z };
  const deltaLength = Math.hypot(delta.x, delta.z);
  if (deltaLength <= maxDelta || deltaLength < 1e-8) return target;
  const scale = maxDelta / deltaLength;
  return { x: velocity.x + delta.x * scale, z: velocity.z + delta.z * scale };
}

export function sprintEligible(forwardInput: number, strafeInput: number, ads: boolean, crouched: boolean, prone = false): boolean {
  return !ads && !crouched && !prone && forwardInput > 0.45 && Math.abs(strafeInput) < 0.92;
}

export type StanceAction = 'toggle-crouch' | 'toggle-prone' | 'stand';

/** Pure stance intent reducer; physical clearance is verified by CharacterPhysics before the change is accepted. */
export function nextStance(current: Stance, action: StanceAction): Stance {
  if (action === 'stand') return 'stand';
  if (action === 'toggle-prone') return current === 'prone' ? 'stand' : 'prone';
  if (current === 'stand') return 'crouch';
  if (current === 'crouch') return 'stand';
  return 'crouch';
}

export function mouseSensitivityMultiplier(ads: boolean, sprinting: boolean): number {
  return ads ? 0.68 : sprinting ? 0.94 : 1;
}

export function applyRadialDeadzone(x: number, y: number, deadzone = 0.14, exponent = 1.6): { x: number; y: number } {
  if (![x, y, deadzone, exponent].every(Number.isFinite)) return { x: 0, y: 0 };
  const safeDeadzone = Math.max(0, Math.min(0.99, deadzone));
  const safeExponent = Math.max(0.01, exponent);
  const rawMagnitude = Math.hypot(x, y);
  if (rawMagnitude <= safeDeadzone || rawMagnitude < 1e-8) return { x: 0, y: 0 };
  const clampedMagnitude = Math.min(1, rawMagnitude);
  const scaled = Math.pow((clampedMagnitude - safeDeadzone) / Math.max(0.001, 1 - safeDeadzone), safeExponent);
  return { x: (x / rawMagnitude) * scaled, y: (y / rawMagnitude) * scaled };
}

export type GamepadLookRate = { yaw: number; pitch: number };

/**
 * Converts shaped right-stick input into a bounded angular velocity. Acceleration is quick enough
 * for target acquisition while the faster release rate prevents stick drift from leaving a tail.
 */
export function integrateGamepadLookRate(
  current: GamepadLookRate,
  input: { x: number; y: number },
  dt: number,
  ads: boolean,
  sensitivity = 1,
): GamepadLookRate {
  const safeDt = Math.max(0, Math.min(0.05, dt));
  const safeSensitivity = Math.max(0.5, Math.min(1.8, Number.isFinite(sensitivity) ? sensitivity : 1));
  const magnitude = Math.min(1, Math.hypot(input.x, input.y));
  const flickBoost = magnitude > 0.92 ? 1.08 : 1;
  const maximumRate = (ads ? 2.02 : 3.78) * safeSensitivity * flickBoost;
  const targetYaw = input.x * maximumRate;
  const targetPitch = input.y * maximumRate * 0.8;
  const acceleration = ads ? 16.5 : 22;
  const release = 29;
  const integrateAxis = (value: number, target: number): number => {
    const building = (value === 0 || Math.sign(value) === Math.sign(target)) && Math.abs(target) > Math.abs(value);
    return approach(value, target, (building ? acceleration : release) * safeDt);
  };
  return {
    yaw: integrateAxis(current.yaw, targetYaw),
    pitch: integrateAxis(current.pitch, targetPitch),
  };
}

export type SpreadContext = {
  ads: boolean;
  moving: boolean;
  crouched: boolean;
  prone?: boolean;
  sustainedShots: number;
};

export function computeSpread(weapon: WeaponSpec, context: SpreadContext): number {
  let spread = weapon.hipSpread;
  if (context.ads) spread *= weapon.adsSpreadMultiplier;
  if (context.moving) spread *= weapon.movementSpreadMultiplier;
  if (context.crouched) spread *= weapon.crouchSpreadMultiplier;
  if (context.prone) spread *= 0.62;
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
  endReason?: 'score' | 'time';
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
    return {
      phase: 'ended', phaseStartedAt: now, endsAt: now, winner,
      endReason: scores[0] >= 25 || scores[1] >= 25 ? 'score' : 'time',
    };
  }
  return state;
}
