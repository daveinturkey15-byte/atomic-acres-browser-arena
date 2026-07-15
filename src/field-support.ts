export type FieldSupportId = 'scout-sweep' | 'yardhawk' | 'tri-pass';

export type FieldSupportDefinition = {
  id: FieldSupportId;
  name: string;
  eliminations: number;
};

export const FIELD_SUPPORT: readonly FieldSupportDefinition[] = [
  { id: 'scout-sweep', name: 'Scout Sweep', eliminations: 3 },
  { id: 'yardhawk', name: 'Yardhawk', eliminations: 5 },
  { id: 'tri-pass', name: 'Tri-Pass Strike', eliminations: 7 },
] as const;

export type FieldSupportState = {
  streak: number;
  available: Record<FieldSupportId, boolean>;
  earnedThisStreak: Record<FieldSupportId, boolean>;
};

export function createFieldSupportState(): FieldSupportState {
  return {
    streak: 0,
    available: { 'scout-sweep': false, yardhawk: false, 'tri-pass': false },
    earnedThisStreak: { 'scout-sweep': false, yardhawk: false, 'tri-pass': false },
  };
}

export function recordSupportElimination(state: FieldSupportState): FieldSupportState {
  const streak = Math.max(0, Math.floor(state.streak)) + 1;
  const available = { ...state.available };
  const earnedThisStreak = { ...state.earnedThisStreak };
  for (const reward of FIELD_SUPPORT) {
    if (streak === reward.eliminations && !earnedThisStreak[reward.id]) {
      available[reward.id] = true;
      earnedThisStreak[reward.id] = true;
    }
  }
  return { streak, available, earnedThisStreak };
}

export function recordSupportDeath(state: FieldSupportState): FieldSupportState {
  return {
    streak: 0,
    available: { ...state.available },
    earnedThisStreak: { 'scout-sweep': false, yardhawk: false, 'tri-pass': false },
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
