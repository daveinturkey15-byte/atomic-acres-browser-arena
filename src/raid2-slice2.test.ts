/**
 * RAID2 slice 2 contract — estate cells 1–3 dressing (src/raid2-dressing.ts).
 *
 * Guards the slice's own rules so a later lane cannot silently break them:
 * every dressing mesh reuses an arena-forged family material (zero new
 * materials/pipelines), nothing solid sits in the 0.9–1.8 m dead band, court
 * paint clears the coplanar threshold geometrically, and facade pilasters are
 * X-mirror symmetric. The global gates (fidelity bands, parity, walkable)
 * carry the gameplay proof; this suite carries the slice's authorship rules.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildRaid2 } from './raid2-arena';
import { RAID2_SLICE2_COURT_TOP, RAID2_SLICE2_LINE_LIFT, mirrorX } from './raid2-dressing';

const DRESSING_PREFIXES = [
  'raid2 facade ',
  'raid2 deck ',
  'raid2 court stripe ',
  'raid2 court hoop ',
] as const;

const scene = new THREE.Scene();
buildRaid2(scene);

const worldBox = (mesh: THREE.Mesh): THREE.Box3 => {
  scene.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(mesh);
};

const dressingMeshes = (): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh === true) return;
    if (DRESSING_PREFIXES.some((prefix) => mesh.name.startsWith(prefix))) out.push(mesh);
  });
  return out;
};

const baseMaterialIds = (): Set<string> => {
  const ids = new Set<string>();
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    if (DRESSING_PREFIXES.some((prefix) => mesh.name.startsWith(prefix))) return;
    const material = mesh.material as THREE.Material | THREE.Material[];
    for (const entry of Array.isArray(material) ? material : [material]) ids.add(entry.uuid);
  });
  return ids;
};

describe('raid2 slice 2 — cells 1-3 dressing', () => {
  it('authors the three cells (facade-bay, pool-terrace, court)', () => {
    const meshes = dressingMeshes();
    expect(meshes.length).toBeGreaterThanOrEqual(56);
    for (const prefix of DRESSING_PREFIXES) {
      expect(meshes.some((mesh) => mesh.name.startsWith(prefix)), prefix).toBe(true);
    }
  });

  it('reuses arena-forged family materials: zero new materials, zero new pipelines', () => {
    const base = baseMaterialIds();
    for (const mesh of dressingMeshes()) {
      const material = mesh.material as THREE.Material | THREE.Material[];
      for (const entry of Array.isArray(material) ? material : [material]) {
        expect(base.has(entry.uuid), `${mesh.name} carries a material no base mesh uses`).toBe(true);
      }
    }
  });

  it('keeps every dressing solid out of the 0.9-1.8 m dead band', () => {
    // box() stamps presentation meshes (solid:false, shots:false) with
    // presentationBatchCandidate; the batcher then hides the originals but
    // keeps their names, so solidity is read off the stamp, not the name.
    const offenders: string[] = [];
    for (const mesh of dressingMeshes()) {
      if ((mesh.userData.presentationBatchCandidate as boolean | undefined) === true) continue;
      const box3 = worldBox(mesh);
      const foot = box3.min.y;
      const top = box3.max.y;
      if (foot < 0.5 && top > 0.9 && top < 1.8) offenders.push(`${mesh.name} top=${top.toFixed(2)}`);
    }
    expect(offenders).toEqual([]);
  });

  it('paints court lines proud of the floor by a geometric, non-coplanar lift', () => {
    const stripes = dressingMeshes().filter((mesh) => mesh.name.startsWith('raid2 court stripe '));
    expect(stripes.length).toBeGreaterThanOrEqual(19);
    for (const mesh of stripes) {
      const box3 = worldBox(mesh);
      const lift = box3.max.y - RAID2_SLICE2_COURT_TOP;
      expect(lift, `${mesh.name} clears the 0.03 m coplanar threshold`).toBeGreaterThan(0.03);
      expect(lift, `${mesh.name} stays a paint film, not a kerb`).toBeLessThan(0.05);
    }
    expect(RAID2_SLICE2_LINE_LIFT).toBeGreaterThan(0.03);
  });

  it('derives facade pilasters through the X-mirror helper', () => {
    const meshes = dressingMeshes().filter((mesh) => mesh.name.includes('pilaster north'));
    const xs = meshes.map((mesh) => {
      const centre = worldBox(mesh).getCenter(new THREE.Vector3());
      return Math.round(centre.x * 1e6) / 1e6;
    });
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) {
      expect(xs.includes(Math.round(mirrorX(x) * 1e6) / 1e6), `pilaster at x=${x} has no mirror`).toBe(true);
    }
  });
});
