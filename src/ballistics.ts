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
  /**
   * HF-368: per-weapon wallbang scalar on the close-range energy budget. Optional
   * here and defaulted to 1 by `weaponPenetrationEnergy` so a profile authored
   * before this term - test fixtures, ad-hoc drone/killstreak rays - keeps its
   * exact Pass 64 behaviour rather than silently gaining or losing penetration.
   */
  wallPenetrationMultiplier?: number;
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
  destructibleSurface?: Readonly<{
    definitionId: string;
    placementId: string;
    surfaceId: string;
  }>;
  majorDebris?: Readonly<{
    placementId: string;
    chunkId: string;
  }>;
  houseFragment?: Readonly<{
    definitionSetId: string;
    fragmentId: string;
  }>;
  houseMajorDebris?: Readonly<{
    definitionSetId: string;
    fragmentId: string;
  }>;
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

/**
 * HF-467, owner after PASS 93: "glass or blocks have no penetration; metal and
 * glass should be shot through, glass breaks; thin metal (the shed) should get
 * a hole with no collision after".
 *
 * That statement is a claim about CLASSES of surface, not about individual
 * props, so it is written once here as a projection of the material table
 * rather than as a second hand-maintained roster (AGENTS.md: "a second
 * hand-maintained eligibility list is a release blocker"). Every consumer -
 * the wallbang lab, the arena raters, the probes - derives from this map, so a
 * new `BallisticMaterialId` cannot be added without deciding, in review, which
 * of the four behaviours it has.
 *
 *   shatter   penetrable, and the surface BREAKS OPEN on admitted damage.
 *             The glass authority owns the lifecycle; at `breached` the pane
 *             leaves `activeBallisticSurfaces()` AND stops emitting a dynamic
 *             movement collider, so the opening is real for bullets, players
 *             and bot line of sight at the same instant.
 *   perforate penetrable, and each admitted hit leaves a PERSISTENT aperture
 *             that later rays pass through untouched (`apertureQuery`). The
 *             movement collider is deliberately KEPT: a bullet hole is not a
 *             doorway, and "no collision after" means no BALLISTIC collision
 *             at the hole.
 *   penetrate penetrable, energy-costed, no persistent state change.
 *   stop      structural cover: no persistent state change, and priced so a
 *             sidearm cannot cross it at cover thickness. Stated honestly,
 *             because the shipped table does NOT make these invulnerable -
 *             brick's entryCost is 1.7 against a sniper's 10.90 budget, so a
 *             rifle wallbang through half a metre of brick is intended and
 *             measured (`keeps the material table physically ordered`). What
 *             the class promises is that the arena raters reach for it when
 *             they mean "go around this", and that nothing in `shatter` or
 *             `perforate` is ever priced as high as the cheapest of these.
 *
 * `reinforced` is in `stop` because it is the classifier's failure sentinel,
 * not a material an arena may author: a surface that reaches it is an
 * authoring defect, reported by `classification: 'fallback'`. It is the one
 * member of the class that really is unreachable by every catalogue firearm.
 */
export type BallisticMaterialClass = 'shatter' | 'perforate' | 'penetrate' | 'stop';

export const BALLISTIC_MATERIAL_CLASS: Readonly<Record<BallisticMaterialId, BallisticMaterialClass>> = Object.freeze({
  glass: 'shatter',
  'thin-metal': 'perforate',
  fence: 'penetrate',
  wood: 'penetrate',
  'interior-wall': 'penetrate',
  vehicle: 'penetrate',
  container: 'penetrate',
  'structural-metal': 'penetrate',
  brick: 'stop',
  concrete: 'stop',
  earth: 'stop',
  reinforced: 'stop',
});

/** Minimum material depth charged for one stop-class ballistic hit. */
export const BALLISTIC_STOP_MINIMUM_THICKNESS_METERS = 0.6;

export function ballisticMaterialClass(material: BallisticMaterialId): BallisticMaterialClass {
  return BALLISTIC_MATERIAL_CLASS[material];
}

export type BallisticSurfaceEvidence = Readonly<{
  name: string;
  impactSurface?: ImpactSurface;
  material?: BallisticMaterialId;
}>;

/**
 * Central material rule. Unknown future shot blockers stay safe as reinforced
 * cover and fail the arena coverage verifier through `classification=fallback`.
 */
export function isBallisticMaterialId(candidate: unknown): candidate is BallisticMaterialId {
  return typeof candidate === 'string' && Object.hasOwn(BALLISTIC_MATERIALS, candidate);
}

export function classifyBallisticMaterial(
  evidence: BallisticSurfaceEvidence,
): Pick<BallisticSurface, 'material' | 'classification'> {
  // HF-390: an authored material is only authority when the shared resistance
  // table actually rates it. `farcrysis` shipped `'metal'` - an ImpactSurface,
  // not a BallisticMaterialId - through an `as` cast, and every shot that met
  // one of those 21 surfaces threw `Cannot read properties of undefined
  // (reading 'entryCost')` inside traceBallisticPath. Trusting the cast turned
  // an authoring typo into a runtime crash; failing it closed turns the same
  // typo into a `fallback` row the arena penetration gate reports by name.
  if (evidence.material !== undefined) {
    if (isBallisticMaterialId(evidence.material)) {
      return { material: evidence.material, classification: 'explicit' };
    }
    return { material: 'reinforced', classification: 'fallback' };
  }
  const name = evidence.name.toLowerCase();
  if (/(glass|window|pane)/.test(name)) return { material: 'glass', classification: 'rule' };
  if (/(fence|mesh barrier|chain.?link)/.test(name)) return { material: 'fence', classification: 'rule' };
  // HF-390: freight only. `pallet` used to live here, which rated 56 Skyline
  // Terminal pallet boards and runners - named `skyline-wood-pallet-*` - as
  // sealed shipping containers, harder to shoot through than concrete. A
  // pallet is the timber the freight sits on, so it is matched as wood below.
  if (/(shipping.container|cargo.stack|freight.crate|tarmac.cargo|baggage.item)/.test(name)) {
    return { material: 'container', classification: 'rule' };
  }
  // `luggage.cart` (not `luggage cart`) so a hyphenated authored name matches
  // the wheeled-vehicle family instead of falling through to freight.
  if (/(bus|coach|shuttle|vehicle|trailer|jetliner|fuselage|wing|engine|airstair|luggage.cart)/.test(name)) {
    return { material: 'vehicle', classification: 'rule' };
  }
  if (/(berm|soil|ground|grass|sand|earth)/.test(name)) return { material: 'earth', classification: 'rule' };
  if (/(brick|masonry)/.test(name)) return { material: 'brick', classification: 'rule' };
  if (/(timber|wood|pallet|deck|ramp|landing|bench|seat|counter)/.test(name)) return { material: 'wood', classification: 'rule' };
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
  /**
   * HF-467: the round's REMAINING energy at this surface's entry face, on the
   * same x10 quantised scale the interactive world's perforation thresholds
   * use (`DestructibleShedDefinition.thresholds.perforateEnergyQ`).
   *
   * It exists because perforation admission used to be computed from the
   * MUZZLE constant `penetrationPower * fmjMultiplier * 10`, which is the same
   * number at 5 m through clear air and at 60 m through two walls. The trace
   * has always known the real answer - distance falloff and every earlier
   * surface's traversal cost are already charged against `energy` here - it
   * simply never left this function. Reporting it is additive and cannot
   * change any existing penetration outcome.
   */
  energyAtEntryQ: number;
}>;

export type BallisticTrace = Readonly<{
  reachedDistance: boolean;
  travelDistance: number;
  damageMultiplier: number;
  remainingEnergy: number;
  impacts: readonly BallisticSurfaceImpact[];
  stoppedBy?: BallisticSurface;
}>;

/**
 * Dynamic aperture authority. The query receives the exact world-space entry
 * point used by the trace; presentation must consume the same canonical region.
 */
export type BallisticApertureQuery = (
  surface: BallisticSurface,
  entryPoint: Point3,
) => boolean;

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
/**
 * HF-368: single place the per-weapon wallbang scalar enters the model. It scales
 * the energy budget only - material entry/traversal costs are untouched - so more
 * penetration means thicker surfaces become shootable and more damage survives a
 * surface, never that a crossed surface becomes free damage: every material still
 * charges its full toll, and `damageMultiplier` stays strictly below 1 for any
 * traversed surface because `entryCost` is positive for every material.
 */
export function weaponPenetrationEnergy(profile: WeaponPenetrationProfile): number {
  const scalar = Number.isFinite(profile.wallPenetrationMultiplier) && (profile.wallPenetrationMultiplier ?? 0) > 0
    ? (profile.wallPenetrationMultiplier as number)
    : 1;
  return Math.max(0, profile.penetrationPower * profile.fmjMultiplier * scalar);
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

/**
 * The x10 quantisation the interactive world's damage authority already uses
 * for every energy threshold. Kept in one place so the trace and the shed
 * cannot drift onto two scales.
 */
export const BALLISTIC_ENERGY_Q = 10;

function quantiseEnergy(energy: number): number {
  if (!Number.isFinite(energy) || energy <= 0) return 0;
  return Math.max(0, Math.round(energy * BALLISTIC_ENERGY_Q));
}

/** Shared deterministic FMJ-like trace used by local, bot, and network authority. */
export function traceBallisticPath(
  origin: Point3,
  direction: Point3,
  requestedDistance: number,
  profile: WeaponPenetrationProfile,
  surfaces: readonly BallisticSurface[],
  apertureQuery?: BallisticApertureQuery,
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
    .filter((entry) => !apertureQuery?.(entry.surface, {
      x: origin.x + unit.x * entry.entryDistance,
      y: origin.y + unit.y * entry.entryDistance,
      z: origin.z + unit.z * entry.entryDistance,
    }))
    .sort((a, b) => a.entryDistance - b.entryDistance || a.exitDistance - b.exitDistance || a.surface.id.localeCompare(b.surface.id));
  const initialEnergy = weaponPenetrationEnergy(profile);
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
    const chargedThickness = ballisticMaterialClass(interval.surface.material) === 'stop'
      ? Math.max(thickness, BALLISTIC_STOP_MINIMUM_THICKNESS_METERS)
      : thickness;
    const traversalCost = resistance.entryCost + resistance.costPerMeter * chargedThickness;
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
        energyAtEntryQ: quantiseEnergy(energy),
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
    const energyAtEntryQ = quantiseEnergy(energy);
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
      energyAtEntryQ,
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
  const boundedMultiplier = Math.min(1, multiplier);
  // A clear trace must preserve the canonical damage value byte-for-byte;
  // wallbang attenuation retains the existing integer admission envelope.
  return boundedMultiplier >= 1 ? baseDamage : Math.max(1, Math.round(baseDamage * boundedMultiplier));
}

// HF-343: apply a graduated obstruction/high-ready spread penalty from the viewmodel
// fire admission so a partially raised weapon shoots less accurately without moving
// the authoritative shot ray.
export function applyObstructionSpreadPenalty(
  baseSpreadRadians: number,
  penaltyRadians: number,
): number {
  if (!Number.isFinite(baseSpreadRadians) || baseSpreadRadians <= 0) return baseSpreadRadians;
  if (!Number.isFinite(penaltyRadians) || penaltyRadians <= 0) return baseSpreadRadians;
  // Additive in radians matches the gameplay spread model; saturation is handled
  // by the caller (fireBlocked means full penalty, not arbitrary escalation).
  return baseSpreadRadians + penaltyRadians;
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
