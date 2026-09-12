import { GRENADE_RADIUS, type Stance } from './gameplay';
import type { ExplosiveSource } from './protocol';
import { explosiveBoltBlastRadiusM } from './combat/ordnance';
import { PASS65_KILLSTREAK_CATALOG, type KillstreakLoadoutV1, type Pass65KillstreakId, type SelectableKillstreakId } from './killstreak-catalog';
import { DEFAULT_KILLSTREAK_LOADOUT } from './killstreak-loadout';

type SelectableDefinition = (typeof PASS65_KILLSTREAK_CATALOG.definitions)[number] & { id: SelectableKillstreakId };

/** HF-334: narrows the catalog's selectable rows so downstream ids exclude
 * care-package-only rewards at the type level, not just at runtime. */
function isSelectableDefinition(
  definition: (typeof PASS65_KILLSTREAK_CATALOG.definitions)[number],
): definition is SelectableDefinition {
  return definition.availability === 'selectable';
}

export const FIELD_SUPPORT_IDS: readonly SelectableKillstreakId[] = Object.freeze(
  PASS65_KILLSTREAK_CATALOG.definitions
    .filter(isSelectableDefinition)
    .map((definition) => definition.id),
);
/**
 * HF-334: field supports are the killstreaks a player selects into a slot and
 * activates. The constant above already filters to `selectable`, so the type
 * now matches it — a care-package-only weapon reward is never a field support.
 */
export type FieldSupportId = SelectableKillstreakId;

export type FieldSupportDefinition = {
  id: FieldSupportId;
  name: string;
  eliminations: number;
  repeatable: boolean;
};

export const FIELD_SUPPORT: readonly FieldSupportDefinition[] = Object.freeze(
  PASS65_KILLSTREAK_CATALOG.definitions
    .filter(isSelectableDefinition)
    .map((definition) => Object.freeze({
      id: definition.id,
      name: definition.displayName,
      eliminations: definition.cost,
      repeatable: definition.repeatable,
    })),
);

export const TRI_PASS_BLAST_RADIUS = 15;
export const TRI_PASS_MAX_DAMAGE = 450;
export const HUNTER_SWARM_COUNT = 5;
export const HUNTER_SWARM_DIRECT_RADIUS = 0.85;
export const HUNTER_SWARM_BLAST_RADIUS = 4;
export const HUNTER_SWARM_DIRECT_DAMAGE = 200;
export const HUNTER_SWARM_SPLASH_DAMAGE = 100;
export const HUNTER_SWARM_PRONE_MULTIPLIER = 0.09;
export const NUKE_WARNING_MS = 5_000;
export const NUKE_DAMAGE = 1_000;
export const SCOUT_SWEEP_DURATION_MS = 12_000;
export const SCOUT_SWEEP_PULSE_INTERVAL_MS = 3_000;
export const SCOUT_SWEEP_PULSE_VISIBLE_MS = 1_500;
export const REMOTE_EXPLOSIVE_HIT_MARGIN = 1.3;

export function remoteExplosiveHitMaximumDistance(source?: ExplosiveSource, stuck = false): number {
  if (source === 'grenade') return GRENADE_RADIUS + REMOTE_EXPLOSIVE_HIT_MARGIN;
  if (source === 'explosive-crossbow') return explosiveBoltBlastRadiusM(stuck) + REMOTE_EXPLOSIVE_HIT_MARGIN;
  if (source === 'tri-pass') return TRI_PASS_BLAST_RADIUS + REMOTE_EXPLOSIVE_HIT_MARGIN;
  if (source === 'hunter-swarm') return HUNTER_SWARM_BLAST_RADIUS + REMOTE_EXPLOSIVE_HIT_MARGIN;
  if (source === 'nuke') return Number.POSITIVE_INFINITY;
  return 6.2;
}

export function scoutSweepPulseVisible(now: number, activeUntil: number): boolean {
  if (!Number.isFinite(now) || !Number.isFinite(activeUntil) || now >= activeUntil) return false;
  const startedAt = activeUntil - SCOUT_SWEEP_DURATION_MS;
  const elapsed = Math.max(0, now - startedAt);
  return elapsed % SCOUT_SWEEP_PULSE_INTERVAL_MS < SCOUT_SWEEP_PULSE_VISIBLE_MS;
}

export function cycleFieldSupportSelection(
  current: FieldSupportId,
  direction: -1 | 1,
  loadout: KillstreakLoadoutV1 = DEFAULT_KILLSTREAK_LOADOUT,
): FieldSupportId {
  const index = loadout.slots.indexOf(current);
  const anchoredIndex = index < 0 ? 0 : index;
  return loadout.slots[(anchoredIndex + direction + loadout.slots.length) % loadout.slots.length];
}

function supportFlags(value = false): Record<FieldSupportId, boolean> {
  return Object.fromEntries(FIELD_SUPPORT_IDS.map((id) => [id, value])) as Record<FieldSupportId, boolean>;
}

function supportCounts(): Record<FieldSupportId, number> {
  return Object.fromEntries(FIELD_SUPPORT_IDS.map((id) => [id, 0])) as Record<FieldSupportId, number>;
}

/**
 * Read-only compatibility projection for the legacy HUD and input adapters.
 * Reward authority lives exclusively in HostKillstreakRuntime; this shape must
 * never be stored and mutated as gameplay state.
 */
export type FieldSupportProjection = Readonly<{
  streak: number;
  rewardCycle: number;
  loadout: KillstreakLoadoutV1;
  available: Readonly<Record<FieldSupportId, boolean>>;
  availableCharges: Readonly<Record<FieldSupportId, number>>;
  /** HF-334: may be a weapon-grant reward (crimson flamethrower) rather than a
   * field support, so it is any care-pool id. */
  revealedCareReward: Pass65KillstreakId | null;
}>;

export type FieldSupportActorProjectionSource = Readonly<{
  streak: number;
  cycleProgress: number;
  loadout: KillstreakLoadoutV1;
  available: readonly Pass65KillstreakId[];
  availableCharges: readonly Readonly<{ id: Pass65KillstreakId; count: number }>[];
  /** HF-334: any care-pool reward, which since the crimson flamethrower may be
   * a weapon grant rather than a field support. */
  revealedCareRewards: readonly Pass65KillstreakId[];
}>;

export function projectFieldSupportActor(
  actor: FieldSupportActorProjectionSource | null,
  fallbackLoadout: KillstreakLoadoutV1 = DEFAULT_KILLSTREAK_LOADOUT,
): FieldSupportProjection {
  const loadout = actor?.loadout ?? fallbackLoadout;
  const available = supportFlags();
  const availableCharges = supportCounts();
  for (const charge of actor?.availableCharges ?? []) {
    // Charges are keyed by field support; a weapon-grant reward has no
    // readiness slot here (HF-334) and is skipped rather than coerced.
    if (!(FIELD_SUPPORT_IDS as readonly string[]).includes(charge.id)) continue;
    const chargeId = charge.id as FieldSupportId;
    availableCharges[chargeId] = charge.count;
    available[chargeId] = charge.count > 0;
  }
  const revealedCareReward = actor?.revealedCareRewards[0] ?? null;
  if (revealedCareReward) {
    // Only field supports have a readiness slot. A weapon-grant reward
    // (crimson flamethrower) is delivered by the weapon path instead, so it
    // must not be forced into the support-availability map.
    if ((FIELD_SUPPORT_IDS as readonly string[]).includes(revealedCareReward)) {
      available[revealedCareReward as FieldSupportId] = true;
    }
    // A captured Care Package is still selected through slot one. Project its
    // readiness onto that slot without manufacturing a second reward queue.
    available[loadout.slots[0]] = true;
  }
  const streak = Math.max(0, Math.floor(actor?.streak ?? 0));
  const cycleProgress = Math.max(0, Math.floor(actor?.cycleProgress ?? 0));
  return Object.freeze({
    streak,
    rewardCycle: cycleProgress,
    loadout,
    available: Object.freeze(available),
    availableCharges: Object.freeze(availableCharges),
    revealedCareReward,
  });
}

export type TriPassPoint = { x: number; z: number };
export type TriPassBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type TriPassTargeting = { points: readonly TriPassPoint[]; complete: boolean };

export type TriPassContactCandidate = Readonly<{
  id: string;
  kind: 'bot' | 'remote';
  team: 0 | 1;
  alive: boolean;
  x: number;
  z: number;
}>;

export function selectTriPassHostiles(
  candidates: readonly TriPassContactCandidate[],
  ownerTeam: 0 | 1,
  options: { freeForAll?: boolean } = {},
): Array<{ id: string; kind: 'bot' | 'remote'; x: number; z: number }> {
  const freeForAll = options.freeForAll === true;
  return candidates
    .filter((candidate) => candidate.alive
      && candidate.id.length > 0
      && Number.isFinite(candidate.x)
      && Number.isFinite(candidate.z)
      && (freeForAll || candidate.team !== ownerTeam))
    .map(({ id, kind, x, z }) => ({ id, kind, x, z }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function createTriPassTargeting(): TriPassTargeting {
  return { points: [], complete: false };
}

export function registerTriPassTarget(
  state: TriPassTargeting,
  point: TriPassPoint,
  bounds: TriPassBounds,
): TriPassTargeting {
  if (state.complete || state.points.length >= 3) return state;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)
    || point.x < bounds.minX || point.x > bounds.maxX
    || point.z < bounds.minZ || point.z > bounds.maxZ) return state;
  const points = [...state.points, { x: point.x, z: point.z }];
  return { points, complete: points.length === 3 };
}

export function triPassSchedule(confirmedAt: number): readonly [number, number, number] {
  const confirmation = Number.isFinite(confirmedAt) ? confirmedAt : 0;
  const impactAt = confirmation + 1_000;
  return [impactAt, impactAt, impactAt];
}

export type HunterTargetCandidate = Readonly<{
  id: string;
  team: 0 | 1;
  alive: boolean;
  distanceFromCentreSq: number;
}>;

export function assignHunterSwarmTargets(
  candidates: readonly HunterTargetCandidate[],
  ownerTeam: 0 | 1,
  count = HUNTER_SWARM_COUNT,
): string[] {
  const hostile = candidates
    .filter((candidate) => candidate.alive && candidate.team !== ownerTeam && candidate.id.length > 0)
    .sort((a, b) => a.distanceFromCentreSq - b.distanceFromCentreSq || a.id.localeCompare(b.id));
  if (hostile.length === 0 || count <= 0) return [];
  return Array.from({ length: Math.min(HUNTER_SWARM_COUNT, Math.floor(count)) }, (_, index) => hostile[index % hostile.length].id);
}

export function hunterSwarmDamage(distance: number, stance: Stance): number {
  if (!Number.isFinite(distance) || distance < 0 || distance > HUNTER_SWARM_BLAST_RADIUS) return 0;
  const base = distance <= HUNTER_SWARM_DIRECT_RADIUS ? HUNTER_SWARM_DIRECT_DAMAGE : HUNTER_SWARM_SPLASH_DAMAGE;
  // All five drones may converge on one hostile. Five prone direct impacts
  // total 90 damage, preserving the explicit full-health survival response.
  return stance === 'prone' ? Math.round(base * HUNTER_SWARM_PRONE_MULTIPLIER) : base;
}

export function nukeDamageForTarget(ownerTeam: 0 | 1, targetTeam: 0 | 1, alive: boolean): number {
  return alive && targetTeam !== ownerTeam ? NUKE_DAMAGE : 0;
}

/**
 * HF-509: hoisted out of `legacy-main.ts`, which sits exactly on its size
 * ratchet, so the care-package grant-once wiring could land without raising it.
 * Pure display labels keyed by the canonical catalog id and exhaustive by
 * construction, so a new killstreak fails the build here rather than reaching
 * the HUD unnamed.
 */
export const GAMEPAD_SUPPORT_LABELS: Record<Pass65KillstreakId, string> = Object.freeze({
  'crimson-flamethrower': 'CRIMSON FLAMETHROWER',
  'scout-sweep': 'SCOUT SWEEP',
  adrenaline: 'ADRENALINE BOOST',
  'care-package': 'CARE PACKAGE',
  yardhawk: 'YARDHAWK',
  'piloted-drone': 'PILOTED DRONE',
  'tri-pass': 'TRI-PASS',
  'carpet-bomber': 'CARPET BOMBER',
  'hunter-swarm': 'HUNTER SWARM',
  chopper: 'CHOPPER GUNNER',
  'drone-swarm': 'DRONE SWARM',
  nuke: 'NUKE',
});
