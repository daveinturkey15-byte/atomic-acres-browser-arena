import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildWorldStudio } from './arena';
import { validArenaSpawnPoint } from '../spawn-safety';

describe('fresh world authority and integrated assets', () => {
  const scene = new THREE.Scene();
  const arena = buildWorldStudio(scene);
  it('builds exactly the new root with architecture, nature, vehicles and furnishings', () => {
    expect(arena.id).toBe('world-studio');
    expect(scene.children).toEqual([arena.root]);
    for (const name of ['world-studio-architecture', 'world-studio-nature', 'world-studio-interiors'])
      expect(arena.root.getObjectByName(name)).toBeDefined();
    expect(arena.physicalCover.length).toBeGreaterThan(6);
  });
  it('supports every authored backyard spawn outside all blocking geometry', () => {
    for (const points of Object.values(arena.spawns)) {
      expect(points.length).toBe(8);
      for (const p of points) expect(validArenaSpawnPoint(p, arena.bounds, arena.colliders), `spawn ${p.toArray()}`).toBe(true);
    }
  });
  it('carries unique shot authority and independent glass panes', () => {
    expect(new Set(arena.shotSurfaces.map(s => s.id)).size).toBe(arena.shotSurfaces.length);
    const staticSurfaces = arena.shotSurfaces.filter(s => !s.breakableWindowId);
    expect(arena.physicsColliders).toEqual(staticSurfaces.map(s => s.bounds));
    for (const pane of arena.shotSurfaces.filter(s => s.breakableWindowId))
      expect(arena.colliders).not.toContain(pane.bounds);
    expect(arena.breakableWindows.length).toBeGreaterThan(8);
    expect(new Set(arena.breakableWindows.map(w => w.mesh)).size).toBe(arena.breakableWindows.length);
    for (const surface of arena.shotSurfaces) {
      expect([surface.bounds.minX, surface.bounds.maxX, surface.bounds.minY, surface.bounds.maxY, surface.bounds.minZ, surface.bounds.maxZ].every(Number.isFinite)).toBe(true);
    }
  });
  it('has physically authored vertical routes and a single active animation hook', () => {
    expect(arena.root.userData.verticalNavigation.routes.length).toBeGreaterThanOrEqual(4);
    expect(arena.update).toBeTypeOf('function');
  });
});
