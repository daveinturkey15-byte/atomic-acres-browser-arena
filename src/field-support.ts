import { GRENADE_RADIUS, type Stance } from './gameplay';
import type { ExplosiveSource } from './protocol';

export const FIELD_SUPPORT_IDS = ['scout-sweep', 'yardhawk', 'tri-pass', 'hunter-swarm', 'nuke'] as const;
export type FieldSupportId = typeof FIELD_SUPPORT_IDS[number];

export type FieldSupportDefinition = {
  id: FieldSupportId;
  name: string;
  eliminations: number;
  repeatable: boolean;
};

export const FIELD_SUPPORT: readonly FieldSupportDefinition[] = [
  { id: 'scout-sweep', name: 'Scout Sweep', eliminations: 3, repeatable: true },
  { id: 'yardhawk', name: 'Yardhawk', eliminations: 5, repeatable: true },
  { id: 'tri-pass', name: 'Tri-Pass Strike', eliminations: 7, repeatable: true },
  { id: 'hunter-swarm', name: 'Hunter Swarm', eliminations: 8, repeatable: true },
  { id: 'nuke', name: 'Nuke', eliminations: 15, repeatable: true },
] as const;

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

export function remoteExplosiveHitMaximumDistance(source?: ExplosiveSource): number {
  if (source === 'grenade') return GRENADE_RADIUS + REMOTE_EXPLOSIVE_HIT_MARGIN;
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

export function cycleFieldSupportSelection(current: FieldSupportId, direction: -1 | 1): FieldSupportId {
  const index = FIELD_SUPPORT_IDS.indexOf(current);
  return FIELD_SUPPORT_IDS[(index + direction + FIELD_SUPPORT_IDS.length) % FIELD_SUPPORT_IDS.length];
}

const REPEATABLE_REWARD_THRESHOLD = 7;

function supportFlags(value = false): Record<FieldSupportId, boolean> {
  return {
    'scout-sweep': value,
    yardhawk: value,
    'tri-pass': value,
    'hunter-swarm': value,
    nuke: value,
  };
}

export type FieldSupportState = {
  /** Continuous combat streak. Resets only on death or a new match. */
  streak: number;
  /** Progress through the compact 3/5/7 field-support eligibility cycle. */
  rewardCycle: number;
  available: Record<FieldSupportId, boolean>;
  earnedThisStreak: Record<FieldSupportId, boolean>;
};

export function createFieldSupportState(): FieldSupportState {
  return {
    streak: 0,
    rewardCycle: 0,
    available: supportFlags(),
    earnedThisStreak: supportFlags(),
  };
}

export function recordSupportElimination(state: FieldSupportState): FieldSupportState {
  const nextStreak = Math.max(0, Math.floor(state.streak)) + 1;
  const nextRewardCycle = Math.max(0, Math.floor(state.rewardCycle)) % REPEATABLE_REWARD_THRESHOLD + 1;
  const available = { ...state.available };
  const earnedThisStreak = { ...state.earnedThisStreak };
  for (const reward of FIELD_SUPPORT) {
    const usesCompactCycle = reward.repeatable && reward.eliminations <= REPEATABLE_REWARD_THRESHOLD;
    const thresholdReached = !reward.repeatable
      ? nextStreak === reward.eliminations
      : usesCompactCycle
        ? nextRewardCycle === reward.eliminations
        : nextStreak % reward.eliminations === 0;
    // High-tier rewards use independent streak multiples (8, 16, 24… and
    // 15, 30, 45…). They must be earnable again after use without forcing a
    // death, while an unused copy simply stays banked.
    const canEarnAgain = reward.repeatable && !usesCompactCycle;
    if (thresholdReached && (canEarnAgain || !earnedThisStreak[reward.id])) {
      available[reward.id] = true;
      earnedThisStreak[reward.id] = true;
    }
  }
  if (nextRewardCycle === REPEATABLE_REWARD_THRESHOLD) {
    return {
      streak: nextStreak,
      rewardCycle: 0,
      available,
      earnedThisStreak: {
        ...earnedThisStreak,
        'scout-sweep': false,
        yardhawk: false,
        'tri-pass': false,
      },
    };
  }
  return { streak: nextStreak, rewardCycle: nextRewardCycle, available, earnedThisStreak };
}

export function recordSupportDeath(state: FieldSupportState): FieldSupportState {
  return {
    streak: 0,
    rewardCycle: 0,
    available: { ...state.available, 'hunter-swarm': false, nuke: false },
    earnedThisStreak: supportFlags(),
  };
}

export function consumeFieldSupport(state: FieldSupportState, id: FieldSupportId): { state: FieldSupportState; activated: boolean } {
  if (!state.available[id]) return { state, activated: false };
  return {
    state: { ...state, available: { ...state.available, [id]: false } },
    activated: true,
  };
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
