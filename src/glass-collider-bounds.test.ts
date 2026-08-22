import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Point3 } from './collision';
import {
  buildAuthoredGlassBoundsMap,
  deriveGlassColliderBounds,
  deriveGlassDynamicColliders,
  deriveGlassMovementCollider,
  isGlassMovementSolid,
  resolveAuthoredGlassBounds,
} from './glass-collider-bounds';
import { admitGlassImpact, createGlassState } from './glass-authority';
import { createHouseArchitecture, solidBounds } from './house-navigation';
import { CharacterPhysics } from './physics';
import type { Team } from './protocol';

async function walkToward(physics: CharacterPhysics, target: Point3, maxSteps = 360): Promise<Point3> {
  for (let step = 0; step < maxSteps; step += 1) {
    const current = physics.eyePosition();
    const dx = target.x - current.x;
    const dz = target.z - current.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.14 && Math.abs(target.y - current.y) < 0.24) return current;
    const amount = Math.min(0.032, distance);
    physics.move({ x: distance > 0 ? (dx / distance) * amount : 0, y: -0.002, z: distance > 0 ? (dz / distance) * amount : 0 }, 1 / 120);
  }
  return physics.eyePosition();
}

describe('HF-344: glass movement collider derivation from authored solid bounds', () => {
  const aqua = createHouseArchitecture(0, 0, 0, 1);
  const coral = createHouseArchitecture(1, 0, 0, -1);
  const houses = [aqua, coral] as const;

  it('determines movement solidity correctly for intact, cracked, breached, and detached panes', () => {
    const state = createGlassState('aqua-irrigation-workshop:upper-window-glass', 1);
    expect(isGlassMovementSolid({ id: state.paneId, glassState: state })).toBe(true);

    // Minor damage: cracked pane is still movement solid
    const cracked = admitGlassImpact(state, {
      isHost: true,
      matchEpoch: 1,
      expectedRevision: 0,
      impactId: 'bullet:1:0',
      tick: 1,
      profile: 'bullet',
      damageQ: 400,
    });
    expect(cracked.accepted).toBe(true);
    expect(cracked.state.phase).toBe('cracked');
    expect(isGlassMovementSolid({ id: state.paneId, glassState: cracked.state })).toBe(true);

    // Breached pane is open and admits movement
    const breached = admitGlassImpact(state, {
      isHost: true,
      matchEpoch: 1,
      expectedRevision: 0,
      impactId: 'bullet:1:0',
      tick: 1,
      profile: 'bullet',
      damageQ: 1000,
    });
    expect(breached.accepted).toBe(true);
    expect(breached.state.phase).toBe('breached');
    expect(isGlassMovementSolid({ id: state.paneId, glassState: breached.state })).toBe(false);

    // Detached pane is open and admits movement
    const detached = admitGlassImpact(state, {
      isHost: true,
      matchEpoch: 1,
      expectedRevision: 0,
      impactId: 'explosion:1:0',
      tick: 1,
      profile: 'explosion',
      damageQ: 2000,
    });
    expect(detached.accepted).toBe(true);
    expect(detached.state.phase).toBe('detached');
    expect(isGlassMovementSolid({ id: state.paneId, glassState: detached.state })).toBe(false);

    // Fallback without glassState uses boolean broken flag
    expect(isGlassMovementSolid({ id: state.paneId, broken: false })).toBe(true);
    expect(isGlassMovementSolid({ id: state.paneId, broken: true })).toBe(false);
  });

  it('resolves authored solid bounds for every house window in Aqua and Coral houses', () => {
    for (const house of houses) {
      const glassSolids = house.solids.filter((s) => s.kind === 'glass');
      expect(glassSolids).toHaveLength(3);

      for (const glassSolid of glassSolids) {
        const expected = solidBounds(glassSolid);
        const resolved = resolveAuthoredGlassBounds(glassSolid.id, houses);
        expect(resolved).toEqual(expected);
      }
    }
  });

  it('builds an authored glass bounds map indexed by solid ID', () => {
    const boundsMap = buildAuthoredGlassBoundsMap(houses);
    expect(boundsMap.size).toBe(6);

    for (const house of houses) {
      for (const glassSolid of house.solids.filter((s) => s.kind === 'glass')) {
        expect(boundsMap.has(glassSolid.id)).toBe(true);
        expect(boundsMap.get(glassSolid.id)).toEqual(solidBounds(glassSolid));
      }
    }
  });

  it('produces IDENTICAL bounds in Performance and Quality profiles, ignoring GLB mesh AABB differences', () => {
    // Upstairs front window
    const paneId = 'aqua-irrigation-workshop:upper-window-glass';
    const upperSolid = aqua.solids.find((s) => s.id === paneId);
    if (!upperSolid) throw new Error('Missing upper-window-glass solid');
    const authored = solidBounds(upperSolid);

    // Performance profile: procedural box mesh matching authored size exactly
    const perfMesh = new THREE.Mesh(
      new THREE.BoxGeometry(...upperSolid.size),
      new THREE.MeshBasicMaterial(),
    );
    perfMesh.position.set(...upperSolid.position);
    perfMesh.updateMatrixWorld(true);

    // Quality profile: simulated GLB mesh with oversized AABB that would formerly block
    const qualityMesh = new THREE.Mesh(
      new THREE.BoxGeometry(upperSolid.size[0] + 0.6, upperSolid.size[1] + 0.8, 0.4),
      new THREE.MeshBasicMaterial(),
    );
    qualityMesh.position.set(...upperSolid.position);
    qualityMesh.updateMatrixWorld(true);

    // The legacy derivation using Box3.setFromObject on mesh produced diverging, oversized bounds in Quality:
    const legacyPerfBox = new THREE.Box3().setFromObject(perfMesh);
    const legacyQualityBox = new THREE.Box3().setFromObject(qualityMesh);
    expect(legacyQualityBox.min.x).not.toBeCloseTo(legacyPerfBox.min.x, 2);
    expect(legacyQualityBox.max.y).toBeGreaterThan(legacyPerfBox.max.y + 0.2);

    // The authored derivation produces EXACTLY identical bounds for both profiles:
    const perfCollider = deriveGlassMovementCollider(
      { id: paneId, mesh: perfMesh, broken: false },
      houses,
    );
    const qualityCollider = deriveGlassMovementCollider(
      { id: paneId, mesh: qualityMesh, broken: false },
      houses,
    );

    expect(perfCollider).toBeDefined();
    expect(qualityCollider).toBeDefined();
    expect(perfCollider?.bounds).toEqual(authored);
    expect(qualityCollider?.bounds).toEqual(authored);
    expect(perfCollider?.bounds).toEqual(qualityCollider?.bounds);

    const perfBounds = deriveGlassColliderBounds(
      { id: paneId, mesh: perfMesh, broken: false },
      houses,
    );
    const qualityBounds = deriveGlassColliderBounds(
      { id: paneId, mesh: qualityMesh, broken: false },
      houses,
    );
    expect(perfBounds).toEqual(authored);
    expect(qualityBounds).toEqual(authored);
  });

  it.each([0, 1] as Team[])('intact pane blocks traversal while breached pane admits traversal for team %s', async (team) => {
    const facing = team === 0 ? 1 : -1;
    const architecture = createHouseArchitecture(team, 0, 0, facing);
    const opening = architecture.openings.find((entry) => entry.id === 'upper-window');
    if (!opening) throw new Error('Missing upper-window');

    const paneId = `${architecture.id}:upper-window-glass`;
    const glassState = createGlassState(paneId, 1);

    // Create physics with static house solids (where glass is collidable: false)
    const physics = await CharacterPhysics.create(
      architecture.solids.filter((entry) => entry.collidable).map(solidBounds),
      { minX: -16, maxX: 16, minZ: -16, maxZ: 16 },
    );

    try {
      const inside = { x: opening.centre[0], y: 5.18, z: opening.centre[2] - facing * 1.2 };
      const outside = { x: opening.centre[0], y: 5.18, z: opening.centre[2] + facing * 0.72 };

      // 1. INTACT PANE: dynamic collider is active -> traversal is BLOCKED
      const intactColliders = deriveGlassDynamicColliders(
        [{ id: paneId, broken: false, glassState }],
        [architecture],
      );
      expect(intactColliders).toHaveLength(1);
      expect(intactColliders[0].id).toBe(`glass:${paneId}`);

      physics.syncDynamicColliders(intactColliders);
      physics.teleportEye(inside);
      const blockedResult = await walkToward(physics, outside, 360);
      const blockedDist = Math.hypot(blockedResult.x - outside.x, blockedResult.z - outside.z);
      // Intact glass must block the player from reaching the outside target
      expect(blockedDist, 'Intact glass must block traversal').toBeGreaterThan(0.6);

      // 2. BREACHED PANE: dynamic collider is omitted -> traversal SUCCEEDS
      const breachedImpact = admitGlassImpact(glassState, {
        isHost: true,
        matchEpoch: 1,
        expectedRevision: 0,
        impactId: 'bullet:1:0',
        tick: 1,
        profile: 'bullet',
      });
      expect(breachedImpact.accepted).toBe(true);
      expect(breachedImpact.state.phase).toBe('breached');

      const breachedColliders = deriveGlassDynamicColliders(
        [{ id: paneId, broken: false, glassState: breachedImpact.state }],
        [architecture],
      );
      // Breached pane produces 0 dynamic colliders
      expect(breachedColliders).toHaveLength(0);

      physics.syncDynamicColliders(breachedColliders);
      physics.teleportEye(inside);
      const admittedResult = await walkToward(physics, outside, 360);
      const admittedDist = Math.hypot(admittedResult.x - outside.x, admittedResult.z - outside.z);
      // Breached glass must admit the player through the window opening
      expect(admittedDist, 'Breached glass must admit traversal').toBeLessThan(0.38);

      // 3. BROKEN PANE (boolean flag fallback): traversal also SUCCEEDS
      const brokenColliders = deriveGlassDynamicColliders(
        [{ id: paneId, broken: true }],
        [architecture],
      );
      expect(brokenColliders).toHaveLength(0);
      physics.syncDynamicColliders(brokenColliders);
      physics.teleportEye(inside);
      const brokenResult = await walkToward(physics, outside, 360);
      expect(Math.hypot(brokenResult.x - outside.x, brokenResult.z - outside.z)).toBeLessThan(0.38);
    } finally {
      physics.dispose();
    }
  });

  it('handles downstairs windows with intact blocking and breached admission', async () => {
    const architecture = createHouseArchitecture(0, 0, 0, 1);
    const frontPaneId = `${architecture.id}:ground-window-glass`;
    const rearPaneId = `${architecture.id}:rear-ground-window-glass`;

    const panes = [
      { id: frontPaneId, broken: false },
      { id: rearPaneId, broken: false },
    ];

    const colliders = deriveGlassDynamicColliders(panes, [architecture]);
    expect(colliders).toHaveLength(2);
    expect(colliders.map((c) => c.id).sort()).toEqual([
      `glass:${frontPaneId}`,
      `glass:${rearPaneId}`,
    ].sort());

    // Break front window, keep rear window intact
    const halfBrokenPanes = [
      { id: frontPaneId, broken: true },
      { id: rearPaneId, broken: false },
    ];
    const halfColliders = deriveGlassDynamicColliders(halfBrokenPanes, [architecture]);
    expect(halfColliders).toHaveLength(1);
    expect(halfColliders[0].id).toBe(`glass:${rearPaneId}`);
  });
});
