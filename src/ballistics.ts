import * as THREE from 'three';
import type { ImpactSurface } from './combat-feedback';
import type { Box2, Point3 } from './collision';

export type BallisticMaterialId =
  | 'glass'
  | 'fence'
  | 'wood'
  | 'interior-wall'
  | 'brick'
  | 'concrete'
  | 'thin-metal'
  | 'structural-metal'
  | 'vehicle'
  | 'container'
  | 'earth'
  | 'reinforced';

export type WeaponPenetrationProfile = Readonly<{
  /** Player-facing calibre label; tuning remains abstract rather than a real-world ballistic claim. */
  caliber: string;
  /** Abstract close-range energy before the built-in FMJ multiplier. */
  penetrationPower: number;
  fmjMultiplier: number;
  energyFalloffStart: number;
  energyFalloffEnd: number;
  minimumEnergyRetention: number;
  minimumWallDamageMultiplier: number;
  maxPenetratedSurfaces: number;
}>;

export type BallisticSurface = Readonly<{
  id: string;
  name: string;
  bounds: Box2;
  material: BallisticMaterialId;
  classification: 'explicit' | 'rule' | 'fallback';
  breakableWindowId?: string;
}>;

type MaterialResistance = Readonly<{
  entryCost: number;
  costPerMeter: number;
}>;

/** One canonical resistance table for every arena and every firearm. */
export const BALLISTIC_MATERIALS: Readonly<Record<BallisticMaterialId, MaterialResistance>> = Object.freeze({
  glass: Object.freeze({ entryCost: 0.08, costPerMeter: 0.25 }),
  fence: Object.freeze({ entryCost: 0.18, costPerMeter: 0.38 }),
  wood: Object.freeze({ entryCost: 0.38, costPerMeter: 0.78 }),
  'interior-wall': Object.freeze({ entryCost: 0.42, costPerMeter: 1.05 }),
  brick: Object.freeze({ entryCost: 1.7, costPerMeter: 5.0 }),
  concrete: Object.freeze({ entryCost: 2.5, costPerMeter: 7.0 }),
  'thin-metal': Object.freeze({ entryCost: 0.95, costPerMeter: 3.0 }),
  'structural-metal': Object.freeze({ entryCost: 2.15, costPerMeter: 6.4 }),
  vehicle: Object.freeze({ entryCost: 2.5, costPerMeter: 4.8 }),
  container: Object.freeze({ entryCost: 3.0, costPerMeter: 7.2 }),
  earth: Object.freeze({ entryCost: 4.0, costPerMeter: 12.0 }),
  reinforced: Object.freeze({ entryCost: 1_000, costPerMeter: 1_000 }),
});

export type BallisticSurfaceEvidence = Readonly<{
  name: string;
  impactSurface?: ImpactSurface;
  material?: BallisticMaterialId;
}>;

/**
 * Central material rule. Unknown future shot blockers stay safe as reinforced
 * cover and fail the arena coverage verifier through `classification=fallback`.
 */
export function classifyBallisticMaterial(
  evidence: BallisticSurfaceEvidence,
): Pick<BallisticSurface, 'material' | 'classification'> {
  if (evidence.material) return { material: evidence.material, classification: 'explicit' };
  const name = evidence.name.toLowerCase();
  if (/(glass|window|pane)/.test(name)) return { material: 'glass', classification: 'rule' };
  if (/(fence|mesh barrier|chain.?link)/.test(name)) return { material: 'fence', classification: 'rule' };
  if (/(shipping.container|cargo.stack|freight.crate|tarmac.cargo|pallet|luggage|baggage.item)/.test(name)) {
    return { material: 'container', classification: 'rule' };
  }
  if (/(bus|coach|shuttle|vehicle|trailer|jetliner|fuselage|wing|engine|airstair|luggage cart)/.test(name)) {
    return { material: 'vehicle', classification: 'rule' };
  }
  if (/(berm|soil|ground|grass|sand|earth)/.test(name)) return { material: 'earth', classification: 'rule' };
  if (/(brick|masonry)/.test(name)) return { material: 'brick', classification: 'rule' };
  if (/(timber|wood|deck|ramp|landing|bench|seat|counter)/.test(name)) return { material: 'wood', classification: 'rule' };
  if (/(plaster|partition|house|garage|hut|kiosk|wall|ceiling)/.test(name)) {
    return { material: 'interior-wall', classification: 'rule' };
  }
  if (/(container|backstop|foundation|plinth|concrete|curb|sidewalk|hardstand|cover|barrier|mezzanine|floor)/.test(name)) {
    return { material: 'concrete', classification: 'rule' };
  }
  if (/(rail|post|column|divider|scanner|belt|carousel|manifold|tank|steel|metal|tower|brace|girder|grate)/.test(name)) {
    return { material: 'structural-metal', classification: 'rule' };
  }
  if (evidence.impactSurface === 'glass') return { material: 'glass', classification: 'rule' };
  if (evidence.impactSurface === 'wood') return { material: 'wood', classification: 'rule' };
  if (evidence.impactSurface === 'soil') return { material: 'earth', classification: 'rule' };
  if (evidence.impactSurface === 'metal') return { material: 'structural-metal', classification: 'rule' };
  return { material: 'reinforced', classification: 'fallback' };
}

export function createBallisticSurface(
  id: string,
  name: string,
  bounds: Box2,
  evidence: Omit<BallisticSurfaceEvidence, 'name'> = {},
  breakableWindowId?: string,
): BallisticSurface {
  return Object.freeze({
    id,
    name,
    bounds: { ...bounds },
    ...classifyBallisticMaterial({ name, ...evidence }),
    ...(breakableWindowId ? { breakableWindowId } : {}),
  });
}

export type BallisticSurfaceImpact = Readonly<{
  surface: BallisticSurface;
  entryDistance: number;
  exitDistance: number;
  thickness: number;
  penetrated: boolean;
  entryNormal: Point3;
}>;

export type BallisticTrace = Readonly<{
  reachedDistance: boolean;
  travelDistance: number;
  damageMultiplier: number;
  remainingEnergy: number;
  impacts: readonly BallisticSurfaceImpact[];
  stoppedBy?: BallisticSurface;
}>;

type SurfaceInterval = Readonly<{
  surface: BallisticSurface;
  entryDistance: number;
  exitDistance: number;
  entryNormal: Point3;
}>;

function finitePoint(point: Point3): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function surfaceInterval(
  origin: Point3,
  unitDirection: Point3,
  maxDistance: number,
  surface: BallisticSurface,
): SurfaceInterval | null {
  const box = surface.bounds;
  const centre = new THREE.Vector3(
    (box.minX + box.maxX) / 2,
    ((box.minY ?? 0) + (box.maxY ?? 8)) / 2,
    (box.minZ + box.maxZ) / 2,
  );
  const half = new THREE.Vector3(
    Math.max(0, box.maxX - box.minX) / 2,
    Math.max(0, (box.maxY ?? 8) - (box.minY ?? 0)) / 2,
    Math.max(0, box.maxZ - box.minZ) / 2,
  );
  const worldRotation = new THREE.Quaternion();
  if (box.rotation) worldRotation.setFromEuler(new THREE.Euler(...box.rotation));
  const inverseRotation = worldRotation.clone().invert();
  const localOrigin = new THREE.Vector3(origin.x, origin.y, origin.z).sub(centre).applyQuaternion(inverseRotation);
  const localDirection = new THREE.Vector3(unitDirection.x, unitDirection.y, unitDirection.z).applyQuaternion(inverseRotation);
  let near = 0;
  let far = maxDistance;
  let nearAxis = -1;
  let nearSign = 0;
  for (const [axis, start, delta, extent] of [
    [0, localOrigin.x, localDirection.x, half.x],
    [1, localOrigin.y, localDirection.y, half.y],
    [2, localOrigin.z, localDirection.z, half.z],
  ] as const) {
    if (Math.abs(delta) < 1e-8) {
      if (start < -extent || start > extent) return null;
      continue;
    }
    let first = (-extent - start) / delta;
    let second = (extent - start) / delta;
    let sign = -Math.sign(delta);
    if (first > second) {
      [first, second] = [second, first];
      sign *= -1;
    }
    if (first > near) {
      near = first;
      nearAxis = axis;
      nearSign = sign;
    }
    far = Math.min(far, second);
    if (near > far) return null;
  }
  if (far <= 1e-5 || near >= maxDistance) return null;
  const localNormal = new THREE.Vector3();
  if (nearAxis === 0) localNormal.x = nearSign;
  else if (nearAxis === 1) localNormal.y = nearSign;
  else if (nearAxis === 2) localNormal.z = nearSign;
  else localNormal.copy(localDirection).multiplyScalar(-1).normalize();
  const normal = localNormal.applyQuaternion(worldRotation).normalize();
  return {
    surface,
    entryDistance: Math.max(0, near),
    exitDistance: Math.min(maxDistance, far),
    entryNormal: { x: normal.x, y: normal.y, z: normal.z },
  };
}
export function penetrationEnergyRetention(profile: WeaponPenetrationProfile, distance: number): number {
  const clamped = Math.max(0, Number.isFinite(distance) ? distance : 0);
  if (clamped <= profile.energyFalloffStart) return 1;
  const progress = Math.min(
    1,
    (clamped - profile.energyFalloffStart) / Math.max(0.001, profile.energyFalloffEnd - profile.energyFalloffStart),
  );
  return 1 + (profile.minimumEnergyRetention - 1) * progress;
}

/** Shared deterministic FMJ-like trace used by local, bot, and network authority. */
export function traceBallisticPath(
  origin: Point3,
  direction: Point3,
  requestedDistance: number,
  profile: WeaponPenetrationProfile,
  surfaces: readonly BallisticSurface[],
): BallisticTrace {
  const directionMagnitude = Math.hypot(direction.x, direction.y, direction.z);
  const targetDistance = Math.max(0, Number.isFinite(requestedDistance) ? requestedDistance : 0);
  if (!finitePoint(origin) || !finitePoint(direction) || directionMagnitude < 1e-8 || targetDistance <= 0) {
    return { reachedDistance: false, travelDistance: 0, damageMultiplier: 0, remainingEnergy: 0, impacts: [] };
  }
  const unit = {
    x: direction.x / directionMagnitude,
    y: direction.y / directionMagnitude,
    z: direction.z / directionMagnitude,
  };
  const intervals = surfaces
    .map((surface) => surfaceInterval(origin, unit, targetDistance, surface))
    .filter((entry): entry is SurfaceInterval => entry !== null)
    .sort((a, b) => a.entryDistance - b.entryDistance || a.exitDistance - b.exitDistance || a.surface.id.localeCompare(b.surface.id));
  const initialEnergy = Math.max(0, profile.penetrationPower * profile.fmjMultiplier);
  let energy = initialEnergy;
  let lastDistance = 0;
  let penetratedSurfaces = 0;
  const impacts: BallisticSurfaceImpact[] = [];
  for (const interval of intervals) {
    const entryRetention = penetrationEnergyRetention(profile, interval.entryDistance);
    const priorRetention = penetrationEnergyRetention(profile, lastDistance);
    energy *= priorRetention > 0 ? entryRetention / priorRetention : 0;
    const thickness = Math.max(0, interval.exitDistance - interval.entryDistance);
    const resistance = BALLISTIC_MATERIALS[interval.surface.material];
    const traversalCost = resistance.entryCost + resistance.costPerMeter * thickness;
    const exceedsSurfaceLimit = penetratedSurfaces >= profile.maxPenetratedSurfaces;
    if (exceedsSurfaceLimit || energy <= traversalCost + 1e-8) {
      const afterEntry = Math.max(0, energy - resistance.entryCost);
      const distanceIntoSurface = exceedsSurfaceLimit || resistance.costPerMeter <= 0
        ? 0
        : Math.min(thickness, afterEntry / resistance.costPerMeter);
      const stopDistance = interval.entryDistance + distanceIntoSurface;
      impacts.push({
        surface: interval.surface,
        entryDistance: interval.entryDistance,
        exitDistance: stopDistance,
        thickness: distanceIntoSurface,
        penetrated: false,
        entryNormal: interval.entryNormal,
      });
      return {
        reachedDistance: false,
        travelDistance: stopDistance,
        damageMultiplier: 0,
        remainingEnergy: 0,
        impacts,
        stoppedBy: interval.surface,
      };
    }
    energy -= traversalCost;
    penetratedSurfaces += 1;
    lastDistance = interval.exitDistance;
    impacts.push({
      surface: interval.surface,
      entryDistance: interval.entryDistance,
      exitDistance: interval.exitDistance,
      thickness,
      penetrated: true,
      entryNormal: interval.entryNormal,
    });
  }
  const targetRetention = penetrationEnergyRetention(profile, targetDistance);
  const priorRetention = penetrationEnergyRetention(profile, lastDistance);
  energy *= priorRetention > 0 ? targetRetention / priorRetention : 0;
  const unoccludedEnergyAtTarget = initialEnergy * targetRetention;
  const retainedThroughCover = unoccludedEnergyAtTarget > 1e-8 ? energy / unoccludedEnergyAtTarget : 0;
  return {
    reachedDistance: true,
    travelDistance: targetDistance,
    damageMultiplier: impacts.length === 0
      ? 1
      : Math.min(1, Math.max(profile.minimumWallDamageMultiplier, retainedThroughCover)),
    remainingEnergy: Math.max(0, energy),
    impacts,
  };
}

export function pointAlongBallisticPath(origin: Point3, direction: Point3, distance: number): Point3 {
  const magnitude = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return {
    x: origin.x + direction.x / magnitude * distance,
    y: origin.y + direction.y / magnitude * distance,
    z: origin.z + direction.z / magnitude * distance,
  };
}

export function applyPenetrationDamage(baseDamage: number, multiplier: number): number {
  if (!Number.isFinite(baseDamage) || baseDamage <= 0 || !Number.isFinite(multiplier) || multiplier <= 0) return 0;
  return Math.max(1, Math.round(baseDamage * Math.min(1, multiplier)));
}

export function ballisticImpactSurface(material: BallisticMaterialId): ImpactSurface {
  if (material === 'glass') return 'glass';
  if (material === 'fence' || material === 'wood' || material === 'interior-wall') return 'wood';
  if (material === 'thin-metal' || material === 'structural-metal' || material === 'vehicle' || material === 'container') return 'metal';
  if (material === 'earth') return 'soil';
  return 'concrete';
}

export type BallisticHitscanResolution = Readonly<{
  hitTarget: boolean;
  tracerDistance: number;
  targetDistanceAlongRay: number;
  damageMultiplier: number;
  trace: BallisticTrace;
}>;

/** Target proximity and cover penetration resolved from the exact same ray. */
export function resolveBallisticHitscanAgainstTarget(
  origin: Point3,
  direction: Point3,
  maxDistance: number,
  target: Point3,
  targetRadius: number,
  profile: WeaponPenetrationProfile,
  surfaces: readonly BallisticSurface[],
): BallisticHitscanResolution {
  const magnitude = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const unit = { x: direction.x / magnitude, y: direction.y / magnitude, z: direction.z / magnitude };
  const toTarget = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
  const along = toTarget.x * unit.x + toTarget.y * unit.y + toTarget.z * unit.z;
  const closest = {
    x: origin.x + unit.x * along,
    y: origin.y + unit.y * along,
    z: origin.z + unit.z * along,
  };
  const missDistance = Math.hypot(target.x - closest.x, target.y - closest.y, target.z - closest.z);
  const targetCandidate = along > 0 && along <= maxDistance && missDistance < targetRadius;
  const trace = traceBallisticPath(origin, unit, targetCandidate ? along : maxDistance, profile, surfaces);
  return {
    hitTarget: targetCandidate && trace.reachedDistance,
    tracerDistance: trace.travelDistance,
    targetDistanceAlongRay: along,
    damageMultiplier: targetCandidate && trace.reachedDistance ? trace.damageMultiplier : 0,
    trace,
  };
}
