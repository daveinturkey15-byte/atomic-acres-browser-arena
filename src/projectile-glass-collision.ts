import type { IdentifiedSweptSphereHit } from './collision';

export type ProjectileGlassRayHit = Readonly<{
  time: number;
  windowId: string;
}>;

export type ProjectileWorldCollision = number | Readonly<{
  fraction: number;
  breakableWindowId: string;
}> | null;

/**
 * Carries pane identity across the authoritative world sweep. A ray-picked
 * pane may breach only when that same pane's active collider won the sweep;
 * proximity to an unrelated cover hit is never sufficient authority.
 */
export function resolveIdentifiedGlassSweepImpact(
  worldHit: IdentifiedSweptSphereHit | null,
  glassRayHit: ProjectileGlassRayHit | null,
  worldHitGlassWindowId: string | null,
): ProjectileWorldCollision {
  if (!worldHit) return null;
  if (!glassRayHit || worldHitGlassWindowId !== glassRayHit.windowId) return worldHit.time;
  return Object.freeze({
    fraction: worldHit.time,
    breakableWindowId: glassRayHit.windowId,
  });
}
