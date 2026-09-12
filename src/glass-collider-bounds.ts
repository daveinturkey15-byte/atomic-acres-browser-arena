// HF-344: Derivation of glass movement colliders from authored solid bounds
// rather than rendered mesh AABBs (Box3.setFromObject).
//
// In Quality profile, GLB mesh AABBs can be larger than the authored opening,
// creating invisible blockers for players attempting to traverse open window routes.
// Deriving movement colliders from authored solid bounds guarantees that both
// Performance and Quality profiles produce identical, exact collision bounds,
// and that breached or broken panes remain traversable.

import type { Box2 } from './collision';
import { glassAuthorityProjection, type GlassState } from './glass-authority';
import { solidBounds, type HouseArchitecture, type HouseSolid } from './house-navigation';
import type { DynamicWorldCollider } from './physics';

export type GlassPaneSource = Readonly<{
  id: string;
  broken?: boolean;
  glassState?: GlassState | null;
  mesh?: unknown;
}>;

export type GlassAuthoredBoundsResolver =
  | readonly HouseArchitecture[]
  | readonly HouseSolid[]
  | ReadonlyMap<string, Box2>
  | Record<string, Box2>
  | { readonly houses?: readonly HouseArchitecture[]; readonly solids?: readonly HouseSolid[] }
  | ((solidId: string) => Box2 | HouseSolid | null | undefined);

/**
 * HF-344: Determines if a glass pane currently blocks movement.
 * Returns true for intact or cracked panes; returns false for breached,
 * detached, or broken panes.
 */
export function isGlassMovementSolid(pane: GlassPaneSource): boolean {
  if (pane.glassState) {
    return glassAuthorityProjection(pane.glassState).movementSolid;
  }
  return !pane.broken;
}

/**
 * HF-344: Resolves the authored solid bounds for a glass pane from house
 * architecture or solid definitions.
 */
export function resolveAuthoredGlassBounds(
  paneId: string,
  source?: GlassAuthoredBoundsResolver,
): Box2 | null {
  if (!paneId || !source) return null;

  if (typeof source === 'function') {
    const result = source(paneId);
    if (!result) return null;
    if ('position' in result && 'size' in result) {
      return solidBounds(result as HouseSolid);
    }
    return result as Box2;
  }

  // Check for arena-like container with houses or solids
  if (typeof source === 'object' && source !== null && !Array.isArray(source) && !(source instanceof Map)) {
    if ('houses' in source && Array.isArray((source as { houses?: readonly HouseArchitecture[] }).houses)) {
      const foundInHouses = resolveAuthoredGlassBounds(paneId, (source as { houses: readonly HouseArchitecture[] }).houses);
      if (foundInHouses) return foundInHouses;
    }
    if ('solids' in source && Array.isArray((source as { solids?: readonly HouseSolid[] }).solids)) {
      const foundInSolids = resolveAuthoredGlassBounds(paneId, (source as { solids: readonly HouseSolid[] }).solids);
      if (foundInSolids) return foundInSolids;
    }
  }

  if (source instanceof Map || (typeof source === 'object' && 'get' in source && typeof (source as Map<string, Box2>).get === 'function')) {
    const found = (source as Map<string, Box2>).get(paneId);
    if (found) return found;
  }

  if (Array.isArray(source)) {
    for (const entry of source) {
      // HouseArchitecture entry
      if ('solids' in entry && Array.isArray((entry as HouseArchitecture).solids)) {
        const solid = (entry as HouseArchitecture).solids.find(
          (s) => s.id === paneId || s.name === paneId || s.id.endsWith(`:${paneId}`) || paneId.endsWith(`:${s.id}`),
        );
        if (solid) return solidBounds(solid);
      }
      // HouseSolid entry
      else if ('id' in entry && 'position' in entry && 'size' in entry) {
        const solid = entry as HouseSolid;
        if (solid.id === paneId || solid.name === paneId || solid.id.endsWith(`:${paneId}`) || paneId.endsWith(`:${solid.id}`)) {
          return solidBounds(solid);
        }
      }
    }
  } else if (typeof source === 'object' && source !== null && !(source instanceof Map)) {
    const record = source as Record<string, Box2>;
    if (paneId in record && record[paneId]) return record[paneId] ?? null;
  }

  return null;
}

/**
 * HF-344: Builds a lookup map from glass solid ID to authored solid bounds.
 */
export function buildAuthoredGlassBoundsMap(
  houses: readonly HouseArchitecture[],
): ReadonlyMap<string, Box2> {
  const map = new Map<string, Box2>();
  for (const house of houses) {
    for (const solid of house.solids) {
      if (solid.kind === 'glass') {
        map.set(solid.id, Object.freeze(solidBounds(solid)));
      }
    }
  }
  return Object.freeze(map);
}

/**
 * HF-344 follow-up: authored-geometry fallback for panes with no house solid.
 *
 * Not every arena registers its windows as house solids. Skyline Terminal builds
 * six breakable facade windows procedurally and ships `houses: []`, so authored
 * solid resolution finds nothing for them. Returning null there dropped their
 * movement colliders entirely and made six intact windows walk-through - a worse
 * defect than the invisible blocker HF-344 set out to fix, and one the
 * source-text integration test could not see because the code still read
 * correctly.
 *
 * The fallback reads the mesh's OWN geometry bounding box through its world
 * matrix. That is deliberately NOT `Box3.setFromObject`: setFromObject unions in
 * every descendant, which is exactly how a GLB window's frame and mullion
 * children inflated the collider past the authored opening and created HF-344's
 * invisible blocker. A procedurally authored box mesh has no such children, so
 * its own geometry IS the authored truth.
 *
 * Precedence is authored-solid first, geometry second: where a house registers
 * the opening, that remains the single source of truth.
 */
function authoredMeshBounds(mesh: unknown): Box2 | null {
  if (!mesh || typeof mesh !== 'object') return null;
  const candidate = mesh as {
    geometry?: { boundingBox?: unknown; computeBoundingBox?: () => void };
    updateWorldMatrix?: (parents: boolean, children: boolean) => void;
    matrixWorld?: unknown;
  };
  const geometry = candidate.geometry;
  if (!geometry || typeof geometry.computeBoundingBox !== 'function') return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox as
    | { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
    | undefined
    | null;
  if (!box) return null;
  candidate.updateWorldMatrix?.(true, false);
  const elements = (candidate.matrixWorld as { elements?: readonly number[] } | undefined)?.elements;
  if (!elements || elements.length < 16) return null;

  // Transform all eight corners: a rotated pane's axis-aligned extent is not the
  // transform of its local extent, and Terminal's facade panes are rotated.
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const cx of [box.min.x, box.max.x]) {
    for (const cy of [box.min.y, box.max.y]) {
      for (const cz of [box.min.z, box.max.z]) {
        const x = elements[0] * cx + elements[4] * cy + elements[8] * cz + elements[12];
        const y = elements[1] * cx + elements[5] * cy + elements[9] * cz + elements[13];
        const z = elements[2] * cx + elements[6] * cy + elements[10] * cz + elements[14];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    }
  }
  if (![minX, maxX, minY, maxY, minZ, maxZ].every(Number.isFinite)) return null;
  if (minX >= maxX || minY >= maxY || minZ >= maxZ) return null;
  return Object.freeze({ minX, maxX, minY, maxY, minZ, maxZ });
}

/**
 * HF-344: Derives a dynamic movement collider for a single breakable glass pane.
 * Uses authored solid bounds rather than rendered mesh AABB.
 * Returns null if the pane is breached/broken (traversable) or if authored
 * bounds cannot be resolved.
 */
export function deriveGlassMovementCollider(
  pane: GlassPaneSource,
  source?: GlassAuthoredBoundsResolver,
): DynamicWorldCollider | null {
  if (!isGlassMovementSolid(pane)) return null;

  const bounds = resolveAuthoredGlassBounds(pane.id, source)
    ?? authoredMeshBounds(pane.mesh);
  if (!bounds) return null;

  const colliderBounds: Box2 = Object.freeze({
    minX: bounds.minX,
    maxX: bounds.maxX,
    minY: bounds.minY,
    maxY: bounds.maxY,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    ...(bounds.rotation ? { rotation: bounds.rotation } : {}),
  });

  return Object.freeze({
    id: `glass:${pane.id}`,
    bounds: colliderBounds,
  });
}

/**
 * HF-344: Derives the authored Box2 movement collider bounds for a pane if it is solid.
 * Returns null if the pane is breached/broken or bounds cannot be resolved.
 */
export function deriveGlassColliderBounds(
  pane: GlassPaneSource,
  source?: GlassAuthoredBoundsResolver,
): Box2 | null {
  const collider = deriveGlassMovementCollider(pane, source);
  return collider ? collider.bounds : null;
}

/**
 * HF-344: Derives all active dynamic movement colliders for a collection of
 * breakable windows.
 *
 * Every intact or cracked pane gets a collider derived from AUTHORED solid bounds.
 * Breached, detached, or broken panes are omitted so they remain traversable.
 * Both Performance and Quality graphics profiles produce identical colliders.
 */
export function deriveGlassDynamicColliders(
  panes: readonly GlassPaneSource[],
  source?: GlassAuthoredBoundsResolver,
): readonly DynamicWorldCollider[] {
  const colliders: DynamicWorldCollider[] = [];
  for (const pane of panes) {
    const collider = deriveGlassMovementCollider(pane, source);
    if (collider) {
      colliders.push(collider);
    }
  }
  return Object.freeze(colliders);
}
