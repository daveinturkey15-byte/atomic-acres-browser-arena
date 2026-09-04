/**
 * RAID2 procedural facade detail contract (r185 technique #6, Raid art pass).
 *
 * Guards the generator's own rules so a later lane cannot silently break
 * them: every piece derives from an authored face (within 0.12 m of a solid
 * collider), per-building instance counts stay under the ceilings (which may
 * only go down), no collider is ever added, glazing alone is shot-rated, the
 * build is deterministic, the reduced level emits nothing at both the
 * generator and the arena-construction layers, and no raid2 top-face pair —
 * existing or generated — sits in the 0.03 m coplanar window on different
 * materials. Presentation trim is one InstancedMesh draw per class; the suite
 * expands every instance (names, boxes, matrices) so instancing is audited
 * exactly, never hidden. The global gates (fidelity, parity, walkable) carry
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

type FacadeEntry = {
  name: string;
  building: string;
  cls: Raid2FacadeDetailClass | '(unknown)';
  box: THREE.Box3;
  instanced: boolean;
  surfaceId: string | undefined;
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

/**
 * Every facade piece as an exact world box: individual meshes directly,
 * InstancedMesh classes expanded per instance (identity from
 * `userData.facadeInstances`, geometry from the instance matrix, so the
 * expansion is an independent audit of the same transforms the renderer
 * consumes — never a name-only census).
 */
const facadeEntries = (root: THREE.Object3D): FacadeEntry[] => {
  root.updateMatrixWorld(true);
  const out: FacadeEntry[] = [];
  const instance = new THREE.Matrix4();
  const unitBox = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    if (!mesh.name.startsWith(RAID2_FACADE_DETAIL_PREFIX)) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh === true) {
      const instanced = mesh as THREE.InstancedMesh;
      const records = (mesh.userData.facadeInstances ?? []) as Array<{
        name: string; building: string;
      }>;
      for (let index = 0; index < instanced.count; index += 1) {
        instanced.getMatrixAt(index, instance);
        const box = unitBox.clone().applyMatrix4(instance).applyMatrix4(mesh.matrixWorld);
        const record = records[index];
        const name = record?.name ?? `${mesh.name}[${index}]`;
        out.push({
          name,
          building: record?.building ?? buildingOf(name),
          cls: classOf(name),
          box,
          instanced: true,
          surfaceId: undefined,
        });
      }
      return;
    }
    const box = new THREE.Box3().setFromObject(mesh);
    out.push({
      name: mesh.name,
      building: buildingOf(mesh.name),
      cls: classOf(mesh.name),
      box,
      instanced: false,
      surfaceId: mesh.userData.ballisticSurfaceId as string | undefined,
    });
  });
  return out;
};

const facadeClassMeshes = (root: THREE.Object3D): THREE.InstancedMesh[] => {
  const out: THREE.InstancedMesh[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.InstancedMesh;
    if (mesh.isMesh !== true || mesh.isInstancedMesh !== true) return;
    if (mesh.name.startsWith(RAID2_FACADE_DETAIL_PREFIX)) out.push(mesh);
  });
  return out;
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
    const entries = facadeEntries(scene);
    expect(entries.length).toBeGreaterThan(0);
    for (const token of [' pane', 'mullion', 'sill', 'stringcourse', 'downpipe'] as const) {
      expect(entries.some((entry) => entry.name.includes(token)), token).toBe(true);
    }
  });

  it('emits exactly one instanced draw per presentation class', () => {
    const classMeshes = facadeClassMeshes(scene);
    expect(classMeshes.map((mesh) => mesh.userData.facadeClass as string).sort()).toEqual(
      ['acUnit', 'downpipe', 'mullion', 'sillLedge', 'stringCourse'],
    );
    for (const mesh of classMeshes) {
      expect(mesh.count).toBeGreaterThan(0);
      expect(mesh.userData.perInstanceAudit).toBe(true);
      expect(mesh.castShadow).toBe(false);
      // The census union must be real (computed over instances, not identity).
      mesh.computeBoundingBox();
      expect(mesh.boundingBox?.isEmpty()).toBe(false);
    }
    // Glazing is never instanced: one mesh per rated pane.
    const panes = facadeEntries(scene).filter((entry) => entry.cls === 'windowGlass');
    expect(panes.length).toBeGreaterThan(0);
    expect(panes.every((entry) => !entry.instanced)).toBe(true);
  });

  it('derives every piece from an authored face (within 0.12 m of a solid collider)', () => {
    const drifters: string[] = [];
    for (const entry of facadeEntries(scene)) {
      let nearest = Number.POSITIVE_INFINITY;
      for (const collider of map.colliders) {
        const dx = Math.max(collider.minX - entry.box.max.x, entry.box.min.x - collider.maxX, 0);
        const dz = Math.max(collider.minZ - entry.box.max.z, entry.box.min.z - collider.maxZ, 0);
        nearest = Math.min(nearest, Math.hypot(dx, dz));
      }
      if (nearest > 0.12) drifters.push(`${entry.name} gap=${nearest.toFixed(2)}`);
    }
    expect(drifters).toEqual([]);
  });

  it('keeps per-building instance counts under the ceilings', () => {
    const perBuilding: Record<string, Partial<Record<Raid2FacadeDetailClass, number>>> = {};
    for (const entry of facadeEntries(scene)) {
      expect(entry.cls, entry.name).not.toBe('(unknown)');
      expect(entry.building, entry.name).not.toBe('(unknown)');
      if (entry.cls === '(unknown)') continue;
      const row = perBuilding[entry.building] ?? {};
      row[entry.cls] = (row[entry.cls] ?? 0) + 1;
      perBuilding[entry.building] = row;
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
    // Instance totals per class match the returned counts exactly.
    const entries = facadeEntries(builder.root);
    const instanced: Partial<Record<Raid2FacadeDetailClass, number>> = {};
    let panes = 0;
    for (const entry of entries) {
      if (entry.cls === '(unknown)') continue;
      if (entry.instanced) instanced[entry.cls] = (instanced[entry.cls] ?? 0) + 1;
      else if (entry.cls === 'windowGlass') panes += 1;
    }
    expect(panes).toBe(counts.windowGlass);
    expect(instanced).toEqual({
      mullion: counts.mullion,
      sillLedge: counts.sillLedge,
      stringCourse: counts.stringCourse,
      downpipe: counts.downpipe,
      acUnit: counts.acUnit,
    });
  });

  it('rates every glazing pane in the built arena', () => {
    const rated: Record<string, true> = {};
    for (const surface of map.shotSurfaces) rated[surface.id] = true;
    const unrated: string[] = [];
    for (const entry of facadeEntries(scene)) {
      if (!entry.name.includes(' pane')) continue;
      const id = entry.surfaceId;
      if (typeof id !== 'string' || rated[id] !== true) unrated.push(entry.name);
    }
    expect(unrated).toEqual([]);
  });
  it('builds deterministically from the footprint seed', () => {
    const first = makeBuilder();
    const second = makeBuilder();
    const a = generateRaid2FacadeDetail(first, makeMats());
    const b = generateRaid2FacadeDetail(second, makeMats());
    expect(a).toEqual(b);
    const signature = (entries: FacadeEntry[]): string[] => entries.map((entry) => [
      entry.name,
      entry.box.min.x.toFixed(4), entry.box.min.y.toFixed(4), entry.box.min.z.toFixed(4),
      entry.box.max.x.toFixed(4), entry.box.max.y.toFixed(4), entry.box.max.z.toFixed(4),
    ].join(',')).sort();
    expect(signature(facadeEntries(first.root))).toEqual(signature(facadeEntries(second.root)));
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

  it('threads the off switch through arena construction', () => {
    const reducedScene = new THREE.Scene();
    buildRaid2(reducedScene, { geometryDetail: 'reduced' });
    expect(facadeEntries(reducedScene)).toEqual([]);
    // The default build (this suite's arena) carries the full stage.
    expect(facadeEntries(scene).length).toBeGreaterThan(0);
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
    const pushBox = (name: string, material: THREE.Material, box: THREE.Box3): void => {
      if (Array.isArray(material)) return;
      boxes.push({
        name,
        materialId: material.uuid,
        x0: box.min.x, x1: box.max.x,
        z0: box.min.z, z1: box.max.z,
        top: box.max.y,
      });
    };
    map.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh !== true) return;
      if (mesh.visible === false) return;
      if (mesh.userData.sourceMeshes !== undefined) return;
      const material = mesh.material as THREE.Material;
      if (Array.isArray(material)) return;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh === true) {
        // Facade class meshes expand per instance; anything else stays out of
        // the instrument's scope (counted as skipped, as before).
        if (!mesh.name.startsWith(RAID2_FACADE_DETAIL_PREFIX)) return;
        for (const entry of facadeEntries(mesh)) {
          if (!Number.isFinite(entry.box.min.x + entry.box.max.x)) continue;
          pushBox(entry.name, material, entry.box);
        }
        return;
      }
      const geometry = mesh.geometry as THREE.BoxGeometry;
      if (geometry.parameters === undefined) return;
      const p = geometry.parameters;
      mesh.getWorldPosition(world);
      if (!Number.isFinite(world.x + world.y + world.z)) return;
      if (!Number.isFinite(p.width ?? NaN) || !Number.isFinite(p.height ?? NaN) || !Number.isFinite(p.depth ?? NaN)) return;
      pushBox(
        mesh.name,
        material,
        new THREE.Box3(
          new THREE.Vector3(world.x - p.width / 2, world.y - p.height / 2, world.z - p.depth / 2),
          new THREE.Vector3(world.x + p.width / 2, world.y + p.height / 2, world.z + p.depth / 2),
        ),
      );
    });
    // The expansion must actually cover the stage: one box per emitted piece.
    const facadeBoxes = boxes.filter((box) => box.name.startsWith(RAID2_FACADE_DETAIL_PREFIX));
    expect(facadeBoxes.length).toBe(facadeEntries(scene).length);
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
