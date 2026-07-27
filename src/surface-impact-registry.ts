import { BALLISTIC_MATERIALS, type BallisticMaterialId } from './ballistics';
import type { ImpactSurface } from './combat-feedback';

export type SurfaceImpactProfile = Readonly<{
  material: BallisticMaterialId;
  impactSurface: ImpactSurface;
  particleColors: readonly [number, number];
  particleCount: number;
  markColor: number;
  markScale: number;
  decalPolicy: Readonly<{
    kind: 'round-persistent';
    reason: string;
  }>;
}>;

const persistent = (reason: string): SurfaceImpactProfile['decalPolicy'] => Object.freeze({
  kind: 'round-persistent',
  reason,
});

const profile = (
  material: BallisticMaterialId,
  impactSurface: ImpactSurface,
  particleColors: readonly [number, number],
  particleCount: number,
  markColor: number,
  markScale: number,
): SurfaceImpactProfile => Object.freeze({
  material,
  impactSurface,
  particleColors: Object.freeze([...particleColors]) as readonly [number, number],
  particleCount,
  markColor,
  markScale,
  decalPolicy: persistent('Retain the bounded mark until round reset or deterministic pool eviction.'),
});

/**
 * Exact material-to-impact contract for every authoritative shot blocker.
 * Adding a ballistic material without an authored impact profile is a release
 * failure rather than a silent generic-concrete fallback.
 */
export const SURFACE_IMPACT_PROFILES: Readonly<Record<BallisticMaterialId, SurfaceImpactProfile>> = Object.freeze({
  glass: profile('glass', 'glass', [0xbbeeff, 0x5ca8c4], 10, 0x739da8, 0.1),
  fence: profile('fence', 'wood', [0xcbb28a, 0x7c6b51], 6, 0x4d4539, 0.075),
  wood: profile('wood', 'wood', [0xd3a167, 0x6d4a32], 5, 0x4d3322, 0.12),
  'interior-wall': profile('interior-wall', 'wood', [0xe1d8c7, 0xa79a86], 6, 0x625c52, 0.13),
  brick: profile('brick', 'concrete', [0xd28a6a, 0x87503f], 7, 0x633a31, 0.105),
  concrete: profile('concrete', 'concrete', [0xd8d0bc, 0x8c918d], 6, 0x4a4b49, 0.11),
  'thin-metal': profile('thin-metal', 'metal', [0xffd06a, 0xff7b3a], 8, 0x5c482f, 0.075),
  'structural-metal': profile('structural-metal', 'metal', [0xffcf72, 0xd86c39], 8, 0x493e32, 0.085),
  vehicle: profile('vehicle', 'metal', [0xffd57e, 0xe57f45], 8, 0x55483b, 0.09),
  container: profile('container', 'metal', [0xffc963, 0xd95e32], 9, 0x4f382b, 0.09),
  earth: profile('earth', 'soil', [0x8ca56e, 0x5c4731], 5, 0x4a452f, 0.15),
  reinforced: profile('reinforced', 'concrete', [0xb8b8af, 0x737875], 6, 0x3e4140, 0.09),
});

export type SurfaceImpactCoverage = Readonly<{
  missing: readonly string[];
  extra: readonly string[];
  invalid: readonly string[];
  pass: boolean;
}>;

/** Runtime-shaped mutation audit used by repository gates and map fixtures. */
export function auditSurfaceImpactCoverage(
  materialIds: readonly string[] = Object.keys(BALLISTIC_MATERIALS),
  registry: Readonly<Record<string, SurfaceImpactProfile>> = SURFACE_IMPACT_PROFILES,
): SurfaceImpactCoverage {
  const expected = new Set(materialIds);
  const actual = new Set(Object.keys(registry));
  const missing = [...expected].filter((id) => !actual.has(id)).sort();
  const extra = [...actual].filter((id) => !expected.has(id)).sort();
  const invalid = [...expected].filter((id) => {
    const entry = registry[id];
    return !entry
      || entry.material !== id
      || entry.decalPolicy.kind !== 'round-persistent'
      || entry.decalPolicy.reason.trim().length === 0
      || !Number.isFinite(entry.markColor)
      || !Number.isFinite(entry.markScale)
      || entry.markScale <= 0
      || !Number.isSafeInteger(entry.particleCount)
      || entry.particleCount <= 0;
  }).sort();
  return Object.freeze({
    missing: Object.freeze(missing),
    extra: Object.freeze(extra),
    invalid: Object.freeze(invalid),
    pass: missing.length === 0 && extra.length === 0 && invalid.length === 0,
  });
}

export function surfaceImpactProfile(material: BallisticMaterialId): SurfaceImpactProfile {
  return SURFACE_IMPACT_PROFILES[material];
}
