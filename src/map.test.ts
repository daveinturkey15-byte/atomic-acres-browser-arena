import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { isBlocked } from './collision';
import { solidBounds } from './house-navigation';
import { buildArena } from './map';
import { CharacterPhysics } from './physics';

describe('Atomic Acres Pass 59 collision audit', () => {
  it('binds visible terrain mounds and the substantial props to mechanical authority', () => {
    const map = buildArena(new THREE.Scene());
    const audit = map.root.userData.atomicCollisionAudit as {
      terrainMounds: Array<{ id: string; collider: string; bottomY: number }>;
      substantialProps: string[];
    };
    expect(audit.terrainMounds).toHaveLength(2);
    for (const entry of audit.terrainMounds) {
      const visual = map.root.getObjectByName(`terrain-mound-${entry.id}`)!;
      const authority = map.root.getObjectByName(entry.collider)!;
      expect(visual.userData.collisionAuthority).toBe(entry.collider);
      expect(authority.userData.collisionAuthorityFor).toBe(visual.name);
      expect(isBlocked({ x: visual.position.x, y: 0.55, z: visual.position.z }, map.colliders, 0.44)).toBe(true);
      expect(entry.bottomY).toBeLessThanOrEqual(0);
    }
    // DECLUTTER 2026-08-29: the irrigation vessel and the four corner earth
    // banks are deleted (owner-called clutter), so the audit carries mounds +
    // substantial props only. Substantial props: -4 terminals, -3 hydro beds,
    // -1 reclamation tank, +2 spawn-garden trees, +2 honest planters = 36.
    expect(audit.substantialProps).toHaveLength(36);
    for (const colliderName of audit.substantialProps) {
      const authority = map.root.getObjectByName(colliderName)!;
      expect(authority.visible).toBe(false);
      expect(authority.userData.authoredCollisionAuthority).toBe(true);
      expect(isBlocked(authority.position, map.colliders, 0.1)).toBe(true);
    }
  });

  it('prevents Rapier penetration through a terrain mound, a planter and the boundary fence', async () => {
    const map = buildArena(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
    try {
      // Walk into the west terrain mound from its open side.
      physics.teleportEye({ x: -24, y: 1.7, z: -33 });
      for (let step = 0; step < 500; step += 1) physics.move({ x: 0, y: -0.002, z: 0.03 }, 1 / 120);
      expect(physics.eyePosition().z).toBeLessThan(-29.3);
      // DECLUTTER 2026-08-29: the vessel and earth banks are gone. Their
      // penetration duties re-pin onto surviving authority: the rear-yard
      // planter, and the boundary fence that owns containment now the banks
      // no longer wall the outside corners.
      physics.teleportEye({ x: 16, y: 1.7, z: 25.5 });
      for (let step = 0; step < 500; step += 1) physics.move({ x: 0, y: -0.002, z: 0.03 }, 1 / 120);
      expect(physics.eyePosition().z).toBeLessThan(28.4);
      // Walk outward from inside the arena into the east boundary fence.
      physics.teleportEye({ x: 31, y: 1.7, z: -22 });
      for (let step = 0; step < 500; step += 1) physics.move({ x: 0.03, y: -0.002, z: 0 }, 1 / 120);
      expect(physics.eyePosition().x).toBeLessThan(37.2); // v3 bounds: fence face at 37
    } finally {
      physics.dispose();
    }
  });
  it('keeps every intended house window breakable and uniquely bound', () => {
    const map = buildArena(new THREE.Scene());
    expect(map.houseTelemetry.windows).toBe(6);
    // Owner 2026-08-30 (bus v6): the six house windows are joined by ten
    // breakable bus panes - all uniquely bound below.
    expect(map.breakableWindows).toHaveLength(16);
    expect(new Set(map.breakableWindows.map((window) => window.id)).size).toBe(16);
    for (const window of map.breakableWindows) {
      expect(window.mesh.userData.breakableWindowId).toBe(window.id);
      expect(window.mesh.userData.dynamic).toBe(true);
      expect(window.mesh.visible).toBe(true);
    }
  });

  it('projects each authored entrance canopy into visible mass, movement and shot authority', () => {
    const map = buildArena(new THREE.Scene());
    const canopies = map.houses.map((house) => {
      const canopy = house.solids.find((solid) => solid.name === 'entrance-canopy');
      if (!canopy) throw new Error(`Missing entrance canopy for ${house.id}`);
      return canopy;
    });
    expect(canopies).toHaveLength(2);
    for (const canopy of canopies) {
      const rendered = map.root.children.find((node) => (
        node.name === canopy.name
        && node.position.x === canopy.position[0]
        && node.position.z === canopy.position[2]
      ));
      expect(rendered, canopy.id).toBeDefined();
      expect(rendered?.visible, canopy.id).toBe(true);
      const bounds = solidBounds(canopy);
      expect(map.colliders).toContainEqual(bounds);
      expect(map.physicsColliders).toContainEqual(bounds);
      expect(map.shotSurfaces.some((surface) => (
        surface.name === canopy.name
        && surface.bounds.minX === bounds.minX
        && surface.bounds.maxZ === bounds.maxZ
        && surface.material === 'thin-metal'
      ))).toBe(true);
    }
  });
});
