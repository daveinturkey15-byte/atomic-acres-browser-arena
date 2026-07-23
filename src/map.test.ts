import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { isBlocked } from './collision';
import { buildArena } from './map';
import { CharacterPhysics } from './physics';

describe('Atomic Acres Pass 59 collision audit', () => {
  it('binds visible terrain mounds and the large irrigation cylinder to mechanical authority', () => {
    const map = buildArena(new THREE.Scene());
    const audit = map.root.userData.atomicCollisionAudit as {
      terrainMounds: Array<{ id: string; collider: string; bottomY: number }>;
      qualityEarthBanks: Array<{ id: string; colliders: string[] }>;
      largeCylinder: { id: string; collider: string; bottomY: number };
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
    const vessel = map.root.getObjectByName(audit.largeCylinder.id)!;
    expect(vessel.userData.collisionAuthority).toBe(audit.largeCylinder.collider);
    expect(isBlocked({ x: vessel.position.x, y: 1.65, z: vessel.position.z }, map.colliders, 0.44)).toBe(true);
    expect(audit.largeCylinder.bottomY).toBe(0);
    expect(audit.qualityEarthBanks).toHaveLength(4);
    expect(audit.qualityEarthBanks.flatMap((bank) => bank.colliders)).toHaveLength(11);
    for (const bank of audit.qualityEarthBanks) {
      const visual = map.root.getObjectByName(`quality-earth-bank-${bank.id}`)!;
      expect(visual.userData.collisionAuthorities).toEqual(bank.colliders);
      for (const colliderName of bank.colliders) {
        const authority = map.root.getObjectByName(colliderName)!;
        expect(authority.visible).toBe(false);
        expect(authority.userData.collisionAuthorityFor).toBe(visual.name);
        expect(isBlocked(authority.position, map.colliders, 0.1)).toBe(true);
      }
    }
    expect(audit.substantialProps).toHaveLength(40);
    for (const colliderName of audit.substantialProps) {
      const authority = map.root.getObjectByName(colliderName)!;
      expect(authority.visible).toBe(false);
      expect(authority.userData.authoredCollisionAuthority).toBe(true);
      expect(isBlocked(authority.position, map.colliders, 0.1)).toBe(true);
    }
  });

  it('prevents Rapier penetration through a terrain mound and the irrigation vessel', async () => {
    const map = buildArena(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
    try {
      physics.teleportEye({ x: -28, y: 1.7, z: 5 });
      for (let step = 0; step < 500; step += 1) physics.move({ x: 0, y: -0.002, z: 0.03 }, 1 / 120);
      expect(physics.eyePosition().z).toBeLessThan(8.0);
      physics.teleportEye({ x: 27, y: 1.7, z: 23 });
      for (let step = 0; step < 500; step += 1) physics.move({ x: 0, y: -0.002, z: 0.03 }, 1 / 120);
      expect(physics.eyePosition().z).toBeLessThan(25.8);
      physics.teleportEye({ x: -23, y: 1.7, z: -34 });
      for (let step = 0; step < 500; step += 1) physics.move({ x: -0.03, y: -0.002, z: 0 }, 1 / 120);
      expect(physics.eyePosition().x).toBeGreaterThan(-25.9);
    } finally {
      physics.dispose();
    }
  });
  it('keeps every intended house window breakable and uniquely bound', () => {
    const map = buildArena(new THREE.Scene());
    expect(map.houseTelemetry.windows).toBe(6);
    expect(map.breakableWindows).toHaveLength(6);
    expect(new Set(map.breakableWindows.map((window) => window.id)).size).toBe(6);
    for (const window of map.breakableWindows) {
      expect(window.mesh.userData.breakableWindowId).toBe(window.id);
      expect(window.mesh.userData.dynamic).toBe(true);
      expect(window.mesh.visible).toBe(true);
    }
  });
});
