import * as THREE from 'three';
import { computeDamage, grenadeDamage, WEAPONS, type HitZone, type Stance } from './gameplay';
import {
  HUNTER_SWARM_BLAST_RADIUS,
  TRI_PASS_BLAST_RADIUS,
  TRI_PASS_MAX_DAMAGE,
  hunterSwarmDamage,
} from './field-support';
import { AUTHORITATIVE_HIT_PROXIES, hitProxyRootTransform } from './hit-proxies';
import type { ExplosiveSource, WeaponId } from './protocol';
import { applyPenetrationDamage } from './ballistics';

type ShotTarget = Readonly<{
  x: number;
  y: number;
  z: number;
  yaw: number;
  stance: Stance;
}>;
export type AuthoritativeShotTarget = ShotTarget & Readonly<{ id: string }>;

const HIT_PROXIES = AUTHORITATIVE_HIT_PROXIES;

function stanceEyeHeight(stance: Stance): number {
  return stance === 'prone' ? 0.5 : stance === 'crouch' ? 1.16 : 1.7;
}

function firstProxyHit(
  originTuple: readonly [number, number, number],
  directionTuple: readonly [number, number, number],
  target: ShotTarget,
): { zone: HitZone; distance: number; point: THREE.Vector3 } | null {
  const origin = new THREE.Vector3(...originTuple);
  const direction = new THREE.Vector3(...directionTuple).normalize();
  const worldRay = new THREE.Ray(origin, direction);
  const stanceTransform = hitProxyRootTransform(target.stance);
  const base = new THREE.Matrix4().makeTranslation(target.x, target.y - stanceEyeHeight(target.stance), target.z)
    .multiply(new THREE.Matrix4().makeRotationY(target.yaw))
    .multiply(new THREE.Matrix4().makeTranslation(...stanceTransform.position))
    .multiply(new THREE.Matrix4().makeRotationX(stanceTransform.rotationX));
  let first: { zone: HitZone; distance: number; point: THREE.Vector3 } | null = null;
  for (const proxy of HIT_PROXIES) {
    const matrix = base.clone().multiply(new THREE.Matrix4().makeTranslation(...proxy.position));
    const localRay = worldRay.clone().applyMatrix4(matrix.clone().invert());
    const half = new THREE.Vector3(...proxy.size).multiplyScalar(0.5);
    const localPoint = localRay.intersectBox(new THREE.Box3(half.clone().multiplyScalar(-1), half), new THREE.Vector3());
    if (!localPoint) continue;
    const point = localPoint.applyMatrix4(matrix);
    const distance = point.distanceTo(origin);
    if (distance <= 110 && (!first || distance < first.distance)) first = { zone: proxy.zone, distance, point };
  }
  return first;
}

export function deriveRemoteShotBaseDamage(
  weapon: WeaponId,
  origin: readonly [number, number, number],
  pelletDirections: readonly (readonly [number, number, number])[],
  target: ShotTarget,
  penetration: (origin: THREE.Vector3, impact: THREE.Vector3, weapon: WeaponId) => boolean | number = () => 1,
): number {
  return deriveRemoteShotOutcome(weapon, origin, pelletDirections, target, penetration).damage;
}

export type DerivedRemoteShotOutcome = Readonly<{
  damage: number;
  rawDamage: number;
  pelletHits: number;
  hitZone: HitZone;
  wallbang: boolean;
  penetrationMultiplier: number;
}>;

export function deriveAuthoritativeShotOutcomes(
  weapon: WeaponId,
  originTuple: readonly [number, number, number],
  pelletDirections: readonly (readonly [number, number, number])[],
  targets: readonly AuthoritativeShotTarget[],
  penetration: (origin: THREE.Vector3, impact: THREE.Vector3, weapon: WeaponId) => boolean | number = () => 1,
): Map<string, DerivedRemoteShotOutcome> {
  const outcomes = new Map<string, DerivedRemoteShotOutcome>();
  const spec = WEAPONS[weapon];
  if (pelletDirections.length !== spec.pellets) return outcomes;
  const origin = new THREE.Vector3(...originTuple);
  for (const direction of pelletDirections) {
    let nearest: { target: AuthoritativeShotTarget; zone: HitZone; distance: number; point: THREE.Vector3 } | null = null;
    for (const target of targets) {
      const hit = firstProxyHit(originTuple, direction, target);
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = { target, ...hit };
    }
    if (!nearest) continue;
    const rawPenetration = penetration(origin, nearest.point, weapon);
    const multiplier = typeof rawPenetration === 'boolean' ? (rawPenetration ? 0 : 1) : Math.max(0, Math.min(1, rawPenetration));
    if (multiplier <= 0) continue;
    const prior = outcomes.get(nearest.target.id) ?? {
      damage: 0, rawDamage: 0, pelletHits: 0, hitZone: 'limb' as HitZone, wallbang: false, penetrationMultiplier: 1,
    };
    const rawDamage = prior.rawDamage + applyPenetrationDamage(computeDamage(spec, nearest.distance, nearest.zone), multiplier);
    outcomes.set(nearest.target.id, {
      damage: Math.min(100, rawDamage),
      rawDamage,
      pelletHits: prior.pelletHits + 1,
      hitZone: nearest.zone === 'head' || nearest.zone === 'body' && prior.hitZone === 'limb' ? nearest.zone : prior.hitZone,
      wallbang: prior.wallbang || multiplier < 0.999,
      penetrationMultiplier: Math.min(prior.penetrationMultiplier, multiplier),
    });
  }
  return outcomes;
}

export function deriveRemoteShotOutcome(
  weapon: WeaponId,
  origin: readonly [number, number, number],
  pelletDirections: readonly (readonly [number, number, number])[],
  target: ShotTarget,
  penetration: (origin: THREE.Vector3, impact: THREE.Vector3, weapon: WeaponId) => boolean | number = () => 1,
): DerivedRemoteShotOutcome {
  const spec = WEAPONS[weapon];
  if (pelletDirections.length !== spec.pellets) return {
    damage: 0, rawDamage: 0, pelletHits: 0, hitZone: 'body', wallbang: false, penetrationMultiplier: 1,
  };
  let damage = 0;
  let pelletHits = 0;
  let hitZone: HitZone = 'limb';
  let penetrationMultiplier = 1;
  for (const direction of pelletDirections) {
    const hit = firstProxyHit(origin, direction, target);
    if (!hit) continue;
    const result = penetration(new THREE.Vector3(...origin), hit.point, weapon);
    const multiplier = typeof result === 'boolean' ? (result ? 0 : 1) : Math.max(0, Math.min(1, result));
    if (multiplier <= 0) continue;
    pelletHits += 1;
    if (hit.zone === 'head' || hit.zone === 'body' && hitZone === 'limb') hitZone = hit.zone;
    penetrationMultiplier = Math.min(penetrationMultiplier, multiplier);
    damage += applyPenetrationDamage(computeDamage(spec, hit.distance, hit.zone), multiplier);
  }
  return {
    damage: Math.min(100, damage),
    rawDamage: damage,
    pelletHits,
    hitZone,
    wallbang: penetrationMultiplier < 0.999,
    penetrationMultiplier,
  };
}

export function maximumRemoteShotBaseDamage(weapon: WeaponId): number {
  const spec = WEAPONS[weapon];
  // Match computeDamage rounding so a legitimate headshot claim is never rejected.
  return Math.min(100, computeDamage(spec, 0, 'head') * spec.pellets);
}

export function maximumRemoteExplosiveBaseDamage(source: ExplosiveSource, distance: number, stance: Stance): number {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  if (source === 'grenade') return Math.min(100, grenadeDamage(distance));
  if (source === 'yardhawk') {
    if (distance > 3.2) return 0;
    return Math.min(100, Math.max(1, Math.round(200 * (1 - distance / 3.2))));
  }
  if (source === 'tri-pass') {
    if (distance > TRI_PASS_BLAST_RADIUS) return 0;
    return Math.min(100, Math.max(1, Math.round(TRI_PASS_MAX_DAMAGE * (1 - distance / TRI_PASS_BLAST_RADIUS))));
  }
  if (source === 'hunter-swarm') {
    if (distance > HUNTER_SWARM_BLAST_RADIUS) return 0;
    return Math.min(100, hunterSwarmDamage(distance, stance));
  }
  return 100;
}

export function admitRemoteBaseDamage(claimed: number, maximum: number): boolean {
  return Number.isFinite(claimed) && claimed > 0 && Number.isFinite(maximum) && maximum > 0 && claimed <= maximum + 1e-6;
}

/** Incoming wire damage is always unpowered; the receiver applies the host-authored multiplier once. */
export function resolveRemotePoweredDamage(baseDamage: number, multiplier: number): number {
  const boundedBase = Math.max(0, Math.min(100, Number.isFinite(baseDamage) ? baseDamage : 0));
  const boundedMultiplier = multiplier === 2 ? 2 : 1;
  return Math.min(100, boundedBase * boundedMultiplier);
}
