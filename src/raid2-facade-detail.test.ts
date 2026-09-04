/**
 * RAID2 procedural facade detail contract (r185 technique #6, Raid art pass).
 *
 * Guards the generator's own rules so a later lane cannot silently break
 * them: every piece derives from an authored face (within 0.12 m of a solid
 * collider), per-building instance counts stay under the ceilings (which may
 * only go down), no collider is ever added, glazing alone is shot-rated, the
 * build is deterministic, the reduced level emits nothing, and no raid2
 * top-face pair — existing or generated — sits in the 0.03 m coplanar window
 * on different materials. The global gates (fidelity, parity, walkable) carry
 * the gameplay proof; this suite carries the authorship rules.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildRaid2 } from './raid2-arena';
import {
  generateRaid2FacadeDetail,
  isRaid2FacadeDetailEnabled,
  RAID2_FACADE_CEILINGS,
  RAID2_FACADE_DETAIL_PREFIX,
  raid2FacadeDetailLevelForGeometryDetail,
  type Raid2FacadeCounts,
  type Raid2FacadeDetailClass,
} from './raid2-facade-detail';
import type { Builder } from './additional-maps';

const scene = new THREE.Scene();
const map = buildRaid2(scene);

const worldBox = (mesh: THREE.Mesh): THREE.Box3 => {
  scene.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(mesh);
};

const facadeMeshes = (): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh === true) return;
    if (mesh.name.startsWith(RAID2_FACADE_DETAIL_PREFIX)) out.push(mesh);
  });
  return out;
};

/** Names are `${prefix} ${building} ${face} … ${class-token}`. */
const buildingOf = (name: string): string => name.split(' ')[3] ?? '(unknown)';
const classOf = (name: string): Raid2FacadeDetailClass | '(unknown)' => {
  if (name.includes(' pane')) return 'windowGlass';
  if (name.includes('mullion') || name.includes('transom')) return 'mullion';
  if (name.includes('sill')) return 'sillLedge';
  if (name.includes('stringcourse')) return 'stringCourse';
  if (name.includes('downpipe')) return 'downpipe';
  if (name.includes('acunit')) return 'acUnit';
  return '(unknown)';
};

const makeBuilder = (): Builder => ({
  root: new THREE.Group(),
  colliders: [],
  physicsColliders: [],
  raycastMeshes: [],
  shotSurfaces: [],
  ballisticSurfaceSequence: 0,
});

const makeMats = (): Record<'stucco' | 'stone' | 'glass', THREE.Material> => ({
  stucco: new THREE.MeshStandardMaterial(),
  stone: new THREE.MeshStandardMaterial(),
  glass: new THREE.MeshStandardMaterial(),
});

describe('raid2 facade detail — procedural generator', () => {
  it('authors the window, mullion, sill, string, and downpipe classes', () => {
    const meshes = facadeMeshes();
    expect(meshes.length).toBeGreaterThan(0);
    for (const token of [' pane', 'mullion', 'sill', 'stringcourse', 'downpipe'] as const) {
      expect(meshes.some((mesh) => mesh.name.includes(token)), token).toBe(true);
    }
  });

  it('derives every piece from an authored face (within 0.12 m of a solid collider)', () => {
    const drifters: string[] = [];
    for (const mesh of facadeMeshes()) {
      const box3 = worldBox(mesh);
      let nearest = Number.POSITIVE_INFINITY;
      for (const collider of map.colliders) {
        const dx = Math.max(collider.minX - box3.max.x, box3.min.x - collider.maxX, 0);
        const dz = Math.max(collider.minZ - box3.max.z, box3.min.z - collider.maxZ, 0);
        nearest = Math.min(nearest, Math.hypot(dx, dz));
      }
      if (nearest > 0.12) drifters.push(`${mesh.name} gap=${nearest.toFixed(2)}`);
    }
    expect(drifters).toEqual([]);
  });

  it('keeps per-building instance counts under the ceilings', () => {
    const perBuilding: Record<string, Partial<Record<Raid2FacadeDetailClass, number>>> = {};
    for (const mesh of facadeMeshes()) {
      const building = buildingOf(mesh.name);
      const cls = classOf(mesh.name);
      expect(cls, mesh.name).not.toBe('(unknown)');
      expect(building, mesh.name).not.toBe('(unknown)');
      if (cls === '(unknown)') continue;
      const row = perBuilding[building] ?? {};
      row[cls] = (row[cls] ?? 0) + 1;
      perBuilding[building] = row;
    }
    expect(Object.keys(perBuilding).length).toBeGreaterThanOrEqual(5);
    for (const [building, row] of Object.entries(perBuilding)) {
      for (const [cls, count] of Object.entries(row)) {
        const ceiling = RAID2_FACADE_CEILINGS[cls as Raid2FacadeDetailClass];
        expect(count, `${building}/${cls}`).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it('adds no collider: fresh-builder generation leaves colliders empty', () => {
    const builder = makeBuilder();
    const counts = generateRaid2FacadeDetail(builder, makeMats());
    expect(builder.colliders).toEqual([]);
    expect(builder.physicsColliders).toEqual([]);
    expect(counts.windowGlass).toBeGreaterThan(0);
    // Only glazing is shot-rated; everything else is pure presentation.
    expect(builder.raycastMeshes.length).toBe(counts.windowGlass);
    expect(builder.shotSurfaces.length).toBe(counts.windowGlass);
    for (const surface of builder.shotSurfaces) {
      expect(surface.material).toBe('glass');
    }
  });

  it('rates every glazing pane in the built arena', () => {
    const rated: Record<string, true> = {};
    for (const surface of map.shotSurfaces) rated[surface.id] = true;
    const unrated: string[] = [];
    for (const mesh of facadeMeshes()) {
      if (!mesh.name.includes(' pane')) continue;
      const id = mesh.userData.ballisticSurfaceId as string | undefined;
      if (typeof id !== 'string' || rated[id] !== true) unrated.push(mesh.name);
    }
    expect(unrated).toEqual([]);
  });

  it('builds deterministically from the footprint seed', () => {
    const first = makeBuilder();
    const second = makeBuilder();
    const a = generateRaid2FacadeDetail(first, makeMats());
    const b = generateRaid2FacadeDetail(second, makeMats());
    expect(a).toEqual(b);
    const names = (builder: Builder): string[] =>
      builder.root.children
        .filter((node): node is THREE.Mesh => (node as THREE.Mesh).isMesh === true)
        .map((mesh) => mesh.name)
        .sort();
    expect(names(first)).toEqual(names(second));
    const matrices = (builder: Builder): string[] =>
      builder.root.children
        .filter((node): node is THREE.Mesh => (node as THREE.Mesh).isMesh === true)
        .map((mesh) => {
          mesh.updateMatrix();
          return [...mesh.position.toArray(), ...mesh.scale.toArray()].join(',');
        })
        .sort();
    expect(matrices(first)).toEqual(matrices(second));
  });

  it('honours the geometryDetail off switch: reduced emits nothing', () => {
    expect(raid2FacadeDetailLevelForGeometryDetail('reduced')).toBe('reduced');
    expect(raid2FacadeDetailLevelForGeometryDetail('full')).toBe('full');
    expect(isRaid2FacadeDetailEnabled('reduced')).toBe(false);
    expect(isRaid2FacadeDetailEnabled('full')).toBe(true);
    const builder = makeBuilder();
    const counts: Raid2FacadeCounts = generateRaid2FacadeDetail(builder, makeMats(), 'reduced');
    expect(counts).toEqual({
      windowGlass: 0, mullion: 0, sillLedge: 0, stringCourse: 0, downpipe: 0, acUnit: 0,
    });
    expect(builder.root.children).toEqual([]);
  });

  it('leaves zero coplanar top-face pairs involving facade detail (0.03 m window, different materials)', () => {
    scene.updateMatrixWorld(true);
    type TopBox = {
      name: string;
      materialId: string;
      x0: number; x1: number; z0: number; z1: number; top: number;
    };
    const boxes: TopBox[] = [];
    const world = new THREE.Vector3();
    map.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh !== true) return;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh === true) return;
      if (mesh.visible === false) return;
      if (mesh.userData.sourceMeshes !== undefined) return;
      const geometry = mesh.geometry as THREE.BoxGeometry;
      if (geometry.parameters === undefined) return;
      const material = mesh.material as THREE.Material;
      if (Array.isArray(material)) return;
      const p = geometry.parameters;
      mesh.getWorldPosition(world);
      if (!Number.isFinite(world.x + world.y + world.z)) return;
      if (!Number.isFinite(p.width ?? NaN) || !Number.isFinite(p.height ?? NaN) || !Number.isFinite(p.depth ?? NaN)) return;
      boxes.push({
        name: mesh.name,
        materialId: material.uuid,
        x0: world.x - p.width / 2, x1: world.x + p.width / 2,
        z0: world.z - p.depth / 2, z1: world.z + p.depth / 2,
        top: world.y + p.height / 2,
      });
    });
    const findings: string[] = [];
    for (let a = 0; a < boxes.length; a += 1) {
      for (let b = a + 1; b < boxes.length; b += 1) {
        const first = boxes[a]!;
        const second = boxes[b]!;
        const overlapX = Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0);
        const overlapZ = Math.min(first.z1, second.z1) - Math.max(first.z0, second.z0);
        if (overlapX <= 1e-4 || overlapZ <= 1e-4) continue;
        if (Math.abs(first.top - second.top) > 0.03) continue;
        if (first.materialId === second.materialId) continue;
        const involvesFacade = first.name.startsWith(RAID2_FACADE_DETAIL_PREFIX)
          || second.name.startsWith(RAID2_FACADE_DETAIL_PREFIX);
        if (!involvesFacade) continue;
        findings.push(`${first.name}@${first.top.toFixed(3)} vs ${second.name}@${second.top.toFixed(3)}`);
      }
    }
    expect(findings).toEqual([]);
  });
});
