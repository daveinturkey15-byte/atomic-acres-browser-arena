export type ImpactSurface = 'metal' | 'concrete' | 'wood' | 'soil';

export type SurfaceEvidence = {
  hint?: unknown;
  name?: string;
  metalness?: number;
};

export type Point3 = { x: number; y: number; z: number };

const SURFACES = new Set<ImpactSurface>(['metal', 'concrete', 'wood', 'soil']);

export function classifyImpactSurface(evidence: SurfaceEvidence): ImpactSurface {
  if (typeof evidence.hint === 'string' && SURFACES.has(evidence.hint as ImpactSurface)) return evidence.hint as ImpactSurface;
  const name = (evidence.name ?? '').toLowerCase();
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
