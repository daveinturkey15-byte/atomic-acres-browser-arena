import type { Box2 } from './collision';
import type { ShedArenaId, ShedPlacement } from './destructible-world';
import { FIELD_SHED_DEFINITION } from './destructible-shed-definition';
import { NUKETOWN2_HANDEDNESS, nuketown2HandedX } from './nuketown2-layout';

export const PASS65_SHED_ELIGIBILITY = Object.freeze([
  Object.freeze({ arenaId: 'atomic-acres' as const, zone: 'whole-arena' as const, minimumSheds: 2 }),
  Object.freeze({ arenaId: 'skyline-terminal' as const, zone: 'terminal-apron' as const, minimumSheds: 2 }),
  Object.freeze({ arenaId: 'rustworks-1v1' as const, zone: 'whole-arena' as const, minimumSheds: 2 }),
  Object.freeze({ arenaId: 'gun-range' as const, zone: null, minimumSheds: 0 }),
  // HF-359 (Pass 74): farcrysis ships without authored sheds (jungle island).
  Object.freeze({ arenaId: 'farcrysis' as const, zone: null, minimumSheds: 0 }),
  Object.freeze({ arenaId: 'high-seas' as const, zone: null, minimumSheds: 0 }),
  // NUKETOWN2 (owner 2026-09-02, HF-407): "still keeping things like ... the
  // sheds". Two, one per back yard, exactly as the shipped Nuke Town has two.
  Object.freeze({ arenaId: 'nuketown2' as const, zone: 'whole-arena' as const, minimumSheds: 2 }),
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
  // NUKETOWN2 (owner 2026-09-02, HF-407): one shed in each back yard, on the
  // outboard side away from the spawn line, so the shed is cover you fight
  // AROUND on the way out of your own yard rather than a wall across the
  // spawn. The pair is a 180-degree rotation of each other - position negated
  // in x and z, yaw turned by pi - which is the same involution every solid in
  // src/nuketown2-arena.ts is emitted through, so the sheds cannot be the one
  // asymmetric thing on a map whose whole fairness argument is that rotation.
  // HF-473: these two are WORLD positions on a map whose authored layout is
  // mirrored on x by NUKETOWN2_HANDEDNESS, so they read the same constant the
  // arena does. Left as literals they would have landed 1.1 m from a mirrored
  // spawn point, which is inside the registry's own 5.5 m spawn clearance.
  // A reflection in x also negates a yaw about y, so the two yaws swap with
  // the two x's - `R_y(-t) = M R_y(t) M` for the mirror M = diag(-1, 1, 1).
  Object.freeze({
    id: 'nuketown2-shed-north-yard', definitionId: FIELD_SHED_DEFINITION.id,
    arenaId: 'nuketown2', zone: 'whole-arena',
    position: { x: nuketown2HandedX(-14), y: 0, z: -24.5 },
    yaw: NUKETOWN2_HANDEDNESS * (Math.PI / 2),
  }),
  Object.freeze({
    id: 'nuketown2-shed-south-yard', definitionId: FIELD_SHED_DEFINITION.id,
    arenaId: 'nuketown2', zone: 'whole-arena',
    position: { x: nuketown2HandedX(14), y: 0, z: 24.5 },
    yaw: NUKETOWN2_HANDEDNESS * (-Math.PI / 2),
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
