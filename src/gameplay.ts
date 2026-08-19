import type { WeaponId } from './protocol';
import { LEGACY_WEAPONS, type LegacyWeaponSpec } from './combat/legacy-weapon-adapter';

export type HitZone = 'head' | 'body' | 'limb';
export type Stance = 'stand' | 'crouch' | 'prone';

/** Solo bots deal one quarter of equivalent player-weapon damage (half the Pass 30 value). */
export const BOT_DAMAGE_MULTIPLIER = 0.25;
export function botScaledDamage(rawDamage: number): number {
  return Math.max(0, Number.isFinite(rawDamage) ? rawDamage : 0) * BOT_DAMAGE_MULTIPLIER;
}

export function admittedPlayerDamage(damage: number, minimumDamage = 1): number {
  return Math.min(100, Math.max(minimumDamage, damage));
}
export const SIMULATION_HZ = 120;
export const MATCH_WARMUP_MS = 3_000;
export const MATCH_DURATION_MS = 300_000;
export const MATCH_SCORE_LIMIT = 25;
export type MatchRules = Readonly<{ durationMs: number | null; scoreLimit: number | null }>;
export const DEFAULT_MATCH_RULES: MatchRules = Object.freeze({
  durationMs: MATCH_DURATION_MS,
  scoreLimit: MATCH_SCORE_LIMIT,
});
export const GRENADE_RADIUS = 16;
export const GRENADE_MAX_DAMAGE = 230;
export const MELEE_COOLDOWN_MS = 650;
export const MELEE_RANGE = 1.75;
export const MELEE_DAMAGE = 100;
export const HEADSHOT_DAMAGE_MULTIPLIER = 1.5;
export const SNIPER_HEADSHOT_DAMAGE_MULTIPLIER = 3;
export const FALL_DAMAGE_SAFE_SPEED = 9.5;
export const FALL_DAMAGE_LETHAL_SPEED = 22;
export const FALL_DAMAGE_MULTIPLIER = 0.5;

export type WeaponSpec = LegacyWeaponSpec;
export const WEAPONS = LEGACY_WEAPONS;
export type MovementContext = {
  crouched: boolean;
  prone?: boolean;
  ads: boolean;
  sprinting: boolean;
  grounded: boolean;
  equippedMovementMultiplier?: number;
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
  const authoredMultiplier = Number.isFinite(context.equippedMovementMultiplier)
    ? Math.max(0.1, Math.min(1.5, context.equippedMovementMultiplier!))
    : 1;
  const maxSpeed = (prone ? 1.55 : context.crouched ? 3.15 : context.ads ? 4.05 : context.sprinting ? 8.7 : 6.15)
    * authoredMultiplier;
  const groundAcceleration = prone ? 17 : context.crouched ? 36 : context.sprinting ? 54 : context.ads ? 40 : 48;
  return {
    maxSpeed,
    acceleration: context.grounded ? groundAcceleration : 10.5,
    deceleration: context.grounded ? (prone ? 25 : context.crouched ? 42 : 62) : 2.4,
    friction: context.grounded ? 0 : 0.25,
    eyeHeight: prone ? 0.61 : context.crouched ? 1.16 : 1.7,
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

/**
 * Multi-pellet weapons reserve pellet zero for the reticle ray so a close shot
 * remains readable. Single-projectile guns sample their authored cone; ADS and
 * stance multipliers make that cone small rather than cosmetically ignoring it.
 */
export function sampleWeaponPellet(
  weapon: WeaponSpec,
  pelletIndex: number,
  angle: number,
  radialRandom: number,
  angularRandom: number,
): { x: number; y: number } {
  if (weapon.pellets > 1 && pelletIndex <= 0) return { x: 0, y: 0 };
  return sampleSpreadDisk(angle, radialRandom, angularRandom);
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

/** Minigun impacts retain proxy geometry but never enter the critical-hit semantic/UI path. */
export function effectiveHitZoneForWeapon(weapon: WeaponSpec, zone: HitZone): HitZone {
  return weapon.id === 'minigun' && zone === 'head' ? 'body' : zone;
}

export function weaponCanCritical(weapon: WeaponSpec): boolean {
  return weapon.id !== 'minigun' && weapon.headMultiplier > 1;
}

/** BO2-like bounded landing damage: impact speed stays authoritative; Pass 72 halves the envelope. */
export function computeFallDamage(impactSpeed: number): number {
  const speed = Number.isFinite(impactSpeed) ? Math.max(0, impactSpeed) : 0;
  if (speed <= FALL_DAMAGE_SAFE_SPEED) return 0;
  if (speed >= FALL_DAMAGE_LETHAL_SPEED) return Math.round(100 * FALL_DAMAGE_MULTIPLIER);
  const normalized = (speed - FALL_DAMAGE_SAFE_SPEED) / (FALL_DAMAGE_LETHAL_SPEED - FALL_DAMAGE_SAFE_SPEED);
  return Math.max(1, Math.round(100 * Math.pow(normalized, 1.35) * FALL_DAMAGE_MULTIPLIER));
}

/** Full-HP player TTK for a single pellet/shot at point-blank (no Overdrive). */
export function shotsToDownFromFullHp(weapon: WeaponSpec, zone: HitZone, maxHp = 100): number {
  const perShot = computeDamage(weapon, 0, zone) * Math.max(1, weapon.pellets);
  const effective = Math.min(maxHp, perShot);
  return Math.max(1, Math.ceil(maxHp / effective));
}

/** True only when a single non-Overdrive shot at the zone kills a full-HP player. */
export function isSingleShotLethalFromFullHp(weapon: WeaponSpec, zone: HitZone, maxHp = 100): boolean {
  return shotsToDownFromFullHp(weapon, zone, maxHp) <= 1;
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

export function reloadProgress(state: ReloadState | null, now: number): number | null {
  if (!state) return null;
  const duration = Math.max(1, state.endsAt - state.startedAt);
  return Math.min(1, Math.max(0, (now - state.startedAt) / duration));
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

export type RecoilContext = Readonly<{ ads: boolean; crouched: boolean; prone?: boolean }>;

export function computeRecoilImpulse(
  weapon: WeaponSpec,
  sustainedShots: number,
  random: number,
  context: RecoilContext = { ads: false, crouched: false },
): RecoilImpulse {
  const buildup = 1 + Math.min(0.48, Math.max(0, sustainedShots) * 0.045);
  const centeredRandom = Math.max(-1, Math.min(1, random * 2 - 1));
  let control = context.ads ? weapon.adsRecoilMultiplier : 1;
  if (context.prone) control *= weapon.proneRecoilMultiplier;
  else if (context.crouched) control *= weapon.crouchRecoilMultiplier;
  return {
    pitch: weapon.recoilPitch * buildup * control,
    yaw: weapon.recoilYaw * centeredRandom * (0.8 + buildup * 0.28) * control,
  };
}

export function recoverRecoilImpulse(recoil: RecoilImpulse, weapon: WeaponSpec, dt: number): RecoilImpulse {
  const damping = Math.exp(-weapon.recoilRecovery * Math.max(0, dt));
  return { pitch: recoil.pitch * damping, yaw: recoil.yaw * damping };
}

export function grenadeDamage(distance: number): number {
  if (distance >= GRENADE_RADIUS) return 0;
  const normalized = Math.max(0, 1 - Math.max(0, distance) / GRENADE_RADIUS);
  return Math.round(GRENADE_MAX_DAMAGE * normalized * normalized);
}

export function meleeStrike(distance: number, now: number, lastMeleeAt: number): { hit: boolean; damage: number } {
  const ready = now - lastMeleeAt >= MELEE_COOLDOWN_MS;
  const hit = ready && distance <= MELEE_RANGE;
  return { hit, damage: hit ? MELEE_DAMAGE : 0 };
}

export type MatchPhase = 'warmup' | 'active' | 'ended';
export type MatchState = {
  phase: MatchPhase;
  phaseStartedAt: number;
  endsAt: number;
  winner: 0 | 1 | 'draw' | null;
  winnerPlayerId?: string;
  endReason?: 'score' | 'time';
  rematchRequested?: boolean;
};

export function createMatch(now: number, _rules: MatchRules = DEFAULT_MATCH_RULES): MatchState {
  return { phase: 'warmup', phaseStartedAt: now, endsAt: now + MATCH_WARMUP_MS, winner: null };
}

export function advanceMatch(
  state: MatchState,
  now: number,
  scores: [number, number],
  rules: MatchRules = DEFAULT_MATCH_RULES,
): MatchState {
  if (state.phase === 'ended' && state.rematchRequested) return createMatch(now, rules);
  if (state.phase === 'warmup' && now >= state.endsAt) {
    const activeAt = state.endsAt;
    return {
      phase: 'active',
      phaseStartedAt: activeAt,
      endsAt: rules.durationMs === null ? Number.POSITIVE_INFINITY : activeAt + rules.durationMs,
      winner: null,
    };
  }
  const scoreReached = rules.scoreLimit !== null
    && (scores[0] >= rules.scoreLimit || scores[1] >= rules.scoreLimit);
  const timeReached = rules.durationMs !== null && now >= state.endsAt;
  if (state.phase === 'active' && (scoreReached || timeReached)) {
    const winner = scores[0] === scores[1] ? 'draw' : scores[0] > scores[1] ? 0 : 1;
    return {
      phase: 'ended', phaseStartedAt: now, endsAt: now, winner,
      endReason: scoreReached ? 'score' : 'time',
    };
  }
  return state;
}

export function advanceFreeForAllMatch(
  state: MatchState,
  now: number,
  scores: readonly { id: string; kills: number }[],
  rules: MatchRules = DEFAULT_MATCH_RULES,
): MatchState {
  if (state.phase === 'ended' && state.rematchRequested) return createMatch(now, rules);
  if (state.phase === 'warmup' && now >= state.endsAt) {
    return {
      phase: 'active',
      phaseStartedAt: state.endsAt,
      endsAt: rules.durationMs === null ? Number.POSITIVE_INFINITY : state.endsAt + rules.durationMs,
      winner: null,
    };
  }
  const ordered = [...scores].sort((a, b) => b.kills - a.kills || a.id.localeCompare(b.id));
  const scoreReached = rules.scoreLimit !== null && (ordered[0]?.kills ?? 0) >= rules.scoreLimit;
  const timeReached = rules.durationMs !== null && now >= state.endsAt;
  if (state.phase === 'active' && (scoreReached || timeReached)) {
    const topKills = ordered[0]?.kills ?? 0;
    const leaders = ordered.filter((entry) => entry.kills === topKills);
    return {
      phase: 'ended',
      phaseStartedAt: now,
      endsAt: now,
      winner: leaders.length === 1 ? null : 'draw',
      winnerPlayerId: leaders.length === 1 ? leaders[0].id : undefined,
      endReason: scoreReached ? 'score' : 'time',
    };
  }
  return state;
}
