import type { Box2 } from './collision';
import type { ShedArenaId, ShedPlacement } from './destructible-world';
import { FIELD_SHED_DEFINITION } from './destructible-shed-definition';

export const PASS65_SHED_ELIGIBILITY = Object.freeze([
  Object.freeze({ arenaId: 'atomic-acres' as const, zone: 'whole-arena' as const, minimumSheds: 2 }),
  Object.freeze({ arenaId: 'skyline-terminal' as const, zone: 'terminal-apron' as const, minimumSheds: 2 }),
  Object.freeze({ arenaId: 'rustworks-1v1' as const, zone: 'whole-arena' as const, minimumSheds: 2 }),
  Object.freeze({ arenaId: 'gun-range' as const, zone: null, minimumSheds: 0 }),
  // HF-359 (Pass 74): farcrysis ships without authored sheds (jungle island).
  Object.freeze({ arenaId: 'farcrysis' as const, zone: null, minimumSheds: 0 }),
  Object.freeze({ arenaId: 'high-seas' as const, zone: null, minimumSheds: 0 }),
]);

/**
 * Authored rollout registry. Runtime activation remains gated by the one-shed
 * authority/visual/network/budget receipt; keeping placement data here makes
 * eligibility and future additions mechanically verifiable.
 */
export const PASS65_SHED_PLACEMENTS: readonly ShedPlacement[] = Object.freeze([
  Object.freeze({
    id: 'atomic-shed-west', definitionId: FIELD_SHED_DEFINITION.id,
    arenaId: 'atomic-acres', zone: 'whole-arena', position: { x: -22, y: 0, z: 5 }, yaw: Math.PI / 2,
  }),
  Object.freeze({
    id: 'atomic-shed-east', definitionId: FIELD_SHED_DEFINITION.id,
    arenaId: 'atomic-acres', zone: 'whole-arena', position: { x: 22, y: 0, z: -5 }, yaw: -Math.PI / 2,
  }),
  Object.freeze({
    id: 'rustworks-shed-west', definitionId: FIELD_SHED_DEFINITION.id,
    arenaId: 'rustworks-1v1', zone: 'whole-arena', position: { x: -24, y: 0, z: -11 }, yaw: Math.PI / 2,
  }),
  Object.freeze({
    id: 'rustworks-shed-east', definitionId: FIELD_SHED_DEFINITION.id,
    arenaId: 'rustworks-1v1', zone: 'whole-arena', position: { x: 24, y: 0, z: 11 }, yaw: -Math.PI / 2,
  }),
  Object.freeze({
    id: 'terminal-shed-west', definitionId: FIELD_SHED_DEFINITION.id,
    arenaId: 'skyline-terminal', zone: 'terminal-apron', position: { x: -29, y: 0, z: 4 }, yaw: Math.PI / 2,
  }),
  Object.freeze({
    id: 'terminal-shed-east', definitionId: FIELD_SHED_DEFINITION.id,
    arenaId: 'skyline-terminal', zone: 'terminal-apron', position: { x: 29, y: 0, z: 4 }, yaw: -Math.PI / 2,
  }),
]);

export function shedPlacementsForArena(arenaId: ShedArenaId): readonly ShedPlacement[] {
  return PASS65_SHED_PLACEMENTS.filter((placement) => placement.arenaId === arenaId);
}

export function shedPlacementFootprint(placement: ShedPlacement): Box2 {
  const halfWidth = 1.8;
  const halfDepth = 2.1;
  const cos = Math.abs(Math.cos(placement.yaw));
  const sin = Math.abs(Math.sin(placement.yaw));
  const halfX = cos * halfWidth + sin * halfDepth;
  const halfZ = sin * halfWidth + cos * halfDepth;
  return Object.freeze({
    minX: placement.position.x - halfX,
    maxX: placement.position.x + halfX,
    minY: placement.position.y,
    maxY: placement.position.y + 3.5,
    minZ: placement.position.z - halfZ,
    maxZ: placement.position.z + halfZ,
  });
}

export function validateShedPlacementRegistry(): readonly string[] {
  const errors: string[] = [];
  const ids = PASS65_SHED_PLACEMENTS.map((placement) => placement.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate placement id');
  for (const row of PASS65_SHED_ELIGIBILITY) {
    const placements = shedPlacementsForArena(row.arenaId);
    if (placements.length < row.minimumSheds) errors.push(`${row.arenaId}: placement count below frozen minimum`);
    if (row.minimumSheds === 0 && placements.length > 0) errors.push(`${row.arenaId}: indoor arena must not contain sheds`);
    if (row.zone !== null && placements.some((placement) => placement.zone !== row.zone)) {
      errors.push(`${row.arenaId}: placement outside frozen zone`);
    }
  }
  if (PASS65_SHED_PLACEMENTS.some((placement) => placement.definitionId !== FIELD_SHED_DEFINITION.id)) {
    errors.push('unknown shed definition');
  }
  return Object.freeze(errors);
}
