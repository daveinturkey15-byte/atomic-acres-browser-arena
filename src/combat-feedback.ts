import { HOUSE_LAYOUT } from './arena-layout';

export type ImpactSurface = 'metal' | 'concrete' | 'wood' | 'soil' | 'glass';
export type FootstepSurface = 'asphalt' | 'concrete' | 'wood' | 'soil';

export type SurfaceEvidence = {
  hint?: unknown;
  name?: string;
  metalness?: number;
};

export type Point3 = { x: number; y: number; z: number };
export type CombatConfirmKind = 'body' | 'head' | 'kill';
export type CombatConfirmEnvelope = {
  durationMs: number;
  visualScale: number;
  audioLayers: number;
  frequencyHz: readonly number[];
};

const CONFIRM_ENVELOPES: Record<CombatConfirmKind, CombatConfirmEnvelope> = {
  body: { durationMs: 180, visualScale: 1, audioLayers: 2, frequencyHz: [910, 1320] },
  head: { durationMs: 210, visualScale: 1.18, audioLayers: 2, frequencyHz: [1260, 1840] },
  kill: { durationMs: 330, visualScale: 1.42, audioLayers: 3, frequencyHz: [510, 790, 1120] },
};

/** Shared deterministic timing/intensity contract for visual and synthesized confirms. */
export function combatConfirmEnvelope(kind: CombatConfirmKind): CombatConfirmEnvelope {
  return CONFIRM_ENVELOPES[kind];
}

const SURFACES = new Set<ImpactSurface>(['metal', 'concrete', 'wood', 'soil', 'glass']);

export function classifyImpactSurface(evidence: SurfaceEvidence): ImpactSurface {
  if (typeof evidence.hint === 'string' && SURFACES.has(evidence.hint as ImpactSurface)) return evidence.hint as ImpactSurface;
  const name = (evidence.name ?? '').toLowerCase();
  if (/(glass|window|pane)/.test(name)) return 'glass';
  if (/(metal|steel|chrome|vehicle|coach|truck|hydrant|mailbox|barrier|fence post|utility|tower)/.test(name)) return 'metal';
  if (/(wood|timber|deck|tree|trunk|branch|fence)/.test(name)) return 'wood';
  if (/(grass|ground|soil|garden|planter|shrub|hedge)/.test(name)) return 'soil';
  if (typeof evidence.metalness === 'number' && evidence.metalness >= 0.42) return 'metal';
  return 'concrete';
}

export function distancePointToSegment(point: Point3, start: Point3, end: Point3): number {
  const abX = end.x - start.x;
  const abY = end.y - start.y;
  const abZ = end.z - start.z;
  const apX = point.x - start.x;
  const apY = point.y - start.y;
  const apZ = point.z - start.z;
  const lengthSq = abX * abX + abY * abY + abZ * abZ;
  const t = lengthSq <= 1e-9 ? 0 : Math.min(1, Math.max(0, (apX * abX + apY * abY + apZ * abZ) / lengthSq));
  const dx = start.x + abX * t - point.x;
  const dy = start.y + abY * t - point.y;
  const dz = start.z + abZ * t - point.z;
  return Math.hypot(dx, dy, dz);
}

export function nearMissStrength(point: Point3, start: Point3, end: Point3): number {
  const distance = distancePointToSegment(point, start, end);
  if (distance < 0.6 || distance > 2.6) return 0;
  return Math.min(1, Math.max(0, 1 - (distance - 0.6) / 2));
}

/** Authored walkable-surface classifier for synthesized first-person footsteps. */
export function classifyFootstepSurface(point: Point3): FootstepSurface {
  if (![point.x, point.y, point.z].every(Number.isFinite)) return 'soil';
  for (const house of HOUSE_LAYOUT) {
    const localX = Math.abs(point.x - house.x);
    const localZ = Math.abs(point.z - house.z);
    if (point.y > 3.05 && localX <= 9.1 && localZ <= 8.2) return 'wood';
    const deckZ = house.z - house.facing * 10.2;
    if (localX <= 5 && Math.abs(point.z - deckZ) <= 1.8 && point.y < 1.4) return 'wood';
  }
  const roadDistance = Math.abs(point.x);
  if (roadDistance <= 9.5) return 'asphalt';
  if (roadDistance <= 14.2) return 'concrete';
  return 'soil';
}
