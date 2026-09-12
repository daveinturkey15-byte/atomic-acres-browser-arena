import { describe, expect, it } from 'vitest';
import { Mesh } from 'three';
import { STUDIO_HOUSES } from '../architecture';
import { studioSpawnPositions } from '../layout';
import {
  createStudioGardens, STUDIO_GARDEN_BUDGET, STUDIO_GARDEN_CLEAR_LANES, STUDIO_GARDEN_SPAWN_CLEARANCE_M, STUDIO_GARDEN_YARDS,
} from './index';

const overlaps = (a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: typeof a) =>
  a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

describe('World Studio gardens factory', () => {
  it('follows the architecture house records for its default yards', () => {
    expect(STUDIO_GARDEN_YARDS.map((y) => [y.id, y.centreX, y.frontSign])).toEqual(STUDIO_HOUSES.map((h) => [h.side, h.centreX, h.frontSign]));
  });

  it('builds finite, non-indexed, role-merged geometry inside the frozen budget', () => {
    const gardens = createStudioGardens();
    expect(gardens.root.name).toBe('world-studio-gardens');
    expect(gardens.stats.triangles).toBeGreaterThan(5_000);
    expect(gardens.stats.triangles).toBeLessThanOrEqual(STUDIO_GARDEN_BUDGET.triangles);
    expect(gardens.stats.drawGroups).toBeLessThanOrEqual(STUDIO_GARDEN_BUDGET.drawGroups);
    expect(gardens.root.children).toHaveLength(gardens.stats.drawGroups);
    let counted = 0;
    for (const child of gardens.root.children) {
      expect(child).toBeInstanceOf(Mesh);
      const mesh = child as Mesh;
      expect(mesh.geometry.index).toBeNull();
      expect(mesh.geometry.groups).toHaveLength(0);
      for (const attribute of Object.values(mesh.geometry.attributes)) expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      counted += mesh.geometry.getAttribute('position').count / 3;
    }
    expect(counted).toBe(gardens.stats.triangles);
    const summed = Object.values(gardens.stats.perYard).reduce((sum, yard) => sum + yard.triangles, 0);
    expect(summed).toBe(gardens.stats.triangles);
    expect(gardens.stats.solids).toBe(gardens.solids.length);
    expect(gardens.stats.components).toBe(gardens.root.userData.components.length);
    gardens.dispose();
  });

  it('emits unique canonical lowercase collider ids with finite bounds, each on a merged root mesh', () => {
    const gardens = createStudioGardens();
    const ids = gardens.solids.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(40);
    for (const solid of gardens.solids) {
      expect(solid.id).toMatch(/^(teal|yellow)-[a-z0-9-]+$/);
      const b = solid.bounds;
      expect([b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ].every(Number.isFinite)).toBe(true);
      expect(b.maxX - b.minX).toBeGreaterThan(0);
      expect(b.maxZ - b.minZ).toBeGreaterThan(0);
      expect(b.maxY! - b.minY!).toBeGreaterThan(0);
      expect(b.minY!).toBeGreaterThanOrEqual(-1e-9);
      expect(gardens.root.children).toContain(solid.mesh);
      expect(['wood', 'concrete', 'thin-metal', 'structural-metal']).toContain(solid.material);
    }
    const kinds = ['-deck-platform', '-shed-wall-door-end', '-shed-roof-mass', '-condenser-unit', '-bins-bin-0-body'];
    for (const yard of ['teal', 'yellow']) for (const kind of kinds) expect(ids).toContain(`${yard}${kind}`);
    gardens.dispose();
  });

  it('is deterministic across builds', () => {
    const a = createStudioGardens();
    const b = createStudioGardens();
    expect(a.solids.map((s) => [s.id, s.bounds])).toEqual(b.solids.map((s) => [s.id, s.bounds]));
    expect(a.stats).toEqual(b.stats);
    const pa = (a.root.children[0] as Mesh).geometry.getAttribute('position').array;
    const pb = (b.root.children[0] as Mesh).geometry.getAttribute('position').array;
    expect(Array.from(pa.slice(0, 3000))).toEqual(Array.from(pb.slice(0, 3000)));
    a.dispose();
    b.dispose();
  });

  it('keeps every solid out of the access lanes, the spawn discs and the house footprints', () => {
    const gardens = createStudioGardens();
    const spawns = ([0, 1] as const).flatMap((team) => studioSpawnPositions(team));
    const houses = STUDIO_HOUSES.map((h) => ({ minX: h.centreX - 7, maxX: h.centreX + 7, minZ: -9, maxZ: 9 }));
    for (const solid of gardens.solids) {
      const b = solid.bounds;
      const half = b.rotation ? Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 : 0;
      const foot = b.rotation
        ? { minX: (b.minX + b.maxX) / 2 - half, maxX: (b.minX + b.maxX) / 2 + half, minZ: (b.minZ + b.maxZ) / 2 - half, maxZ: (b.minZ + b.maxZ) / 2 + half }
        : b;
      for (const lane of STUDIO_GARDEN_CLEAR_LANES) expect(overlaps(foot, lane), `${solid.id} vs ${lane.id}`).toBe(false);
      for (const house of houses) expect(overlaps(foot, house), `${solid.id} vs house`).toBe(false);
      for (const [sx, , sz] of spawns) {
        const dx = Math.max(foot.minX - sx, 0, sx - foot.maxX), dz = Math.max(foot.minZ - sz, 0, sz - foot.maxZ);
        expect(Math.hypot(dx, dz), `${solid.id} vs spawn ${sx},${sz}`).toBeGreaterThanOrEqual(STUDIO_GARDEN_SPAWN_CLEARANCE_M);
      }
      expect(Math.abs(b.minX)).toBeLessThan(39.85);
      expect(Math.abs(b.maxX)).toBeLessThan(39.85);
      expect(Math.abs(b.minZ)).toBeLessThan(33.85);
      expect(Math.abs(b.maxZ)).toBeLessThan(33.85);
    }
    // Decks and beds stay under the character autostep so nothing becomes an invisible wall.
    for (const solid of gardens.solids.filter((s) => /-(deck-platform|deck-step-\d|raised-bed-\d-mass)$/.test(s.id))) expect(solid.bounds.maxY!).toBeLessThanOrEqual(0.42);
    gardens.dispose();
  });

  it('refuses a yard whose solids would land on a spawn or lane', () => {
    expect(() => createStudioGardens({ spawns: [[-30.75, 7.1]] })).toThrow(/spawn clearance/);
    expect(() => createStudioGardens({ yards: [{ id: 'x', side: 'teal', centreX: -20, frontSign: 1 }, { id: 'x', side: 'teal', centreX: -20, frontSign: 1 }] })).toThrow(/duplicate/);
  });

  it('differentiates the yards and mirrors them about the road', () => {
    const gardens = createStudioGardens();
    const ids = new Set(gardens.solids.map((s) => s.id));
    expect(ids.has('teal-pergola-post-0')).toBe(true);
    expect(ids.has('yellow-rail-barrier')).toBe(true);
    expect(ids.has('yellow-umbrella-pole')).toBe(true);
    expect(ids.has('teal-clothesline-post-0')).toBe(true);
    expect(ids.has('yellow-rotary-hoist-pole')).toBe(true);
    const teal = gardens.solids.find((s) => s.id === 'teal-deck-platform')!.bounds;
    const yellow = gardens.solids.find((s) => s.id === 'yellow-deck-platform')!.bounds;
    expect(teal.minX).toBeCloseTo(-yellow.maxX, 6);
    expect(teal.minZ).toBeCloseTo(yellow.minZ, 6);
    expect(teal.maxX).toBeLessThan(-27.9);
    expect(yellow.minX).toBeGreaterThan(27.9);
    const roles = gardens.root.children.map((c) => (c as Mesh).name);
    expect(roles).toContain('world-studio-gardens-paintedteal'.replace('paintedteal', 'paintedTeal'));
    expect(roles).toContain('world-studio-gardens-paintedYellow');
    expect(roles).toContain('world-studio-gardens-canvasRed');
    expect(gardens.reviewPoints.map((p) => p.id)).toEqual(['teal-garden-deck', 'teal-garden-shed', 'yellow-garden-deck', 'yellow-garden-shed']);
    gardens.dispose();
  });

  it('disposes idempotently and releases every generated texture', () => {
    const gardens = createStudioGardens();
    const materials = gardens.root.children.map((c) => (c as Mesh).material as any);
    const textures = new Set(materials.flatMap((m) => [m.map, m.normalMap, m.roughnessMap].filter(Boolean)));
    expect(textures.size).toBe(gardens.stats.textures);
    let disposedTextures = 0;
    for (const texture of textures) texture.addEventListener('dispose', () => { disposedTextures += 1; });
    gardens.dispose();
    gardens.dispose();
    expect(disposedTextures).toBe(textures.size);
    expect(gardens.root.children).toHaveLength(0);
  });
});
