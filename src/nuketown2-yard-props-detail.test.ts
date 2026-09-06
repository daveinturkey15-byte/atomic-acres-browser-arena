/**
 * nuketown2-yard-props-detail.test.ts — HF-536 mechanical proof for glasshouse
 * mullions, plinth, door, vents and garden pod seams, porthole, step, cap.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2 } from './nuketown2-arena';
import {
  NUKETOWN2_GARDEN_POD,
  NUKETOWN2_GLASSHOUSE,
  createNuketown2YardPropMaterials,
  nuketown2YardPropSolids,
} from './nuketown2-yard-props';

describe('HF-536 glasshouse and garden pod detail proof', () => {
  it('tri counts within budgets (glasshouse <= 480, pod <= 360)', () => {
    const materials = createNuketown2YardPropMaterials();
    const table = nuketown2YardPropSolids(materials);

    const glasshouseDetails = table.filter(
      (entry) => entry.tier === 'detail' && entry.name.includes('glasshouse'),
    );
    const podDetails = table.filter(
      (entry) => entry.tier === 'detail' && entry.name.includes('garden pod'),
    );

    const glasshouseTris = glasshouseDetails.length * 12;
    const podTris = podDetails.length * 12;

    expect(glasshouseDetails.length).toBeGreaterThan(0);
    expect(podDetails.length).toBeGreaterThan(0);

    expect(glasshouseTris).toBeLessThanOrEqual(480);
    expect(podTris).toBeLessThanOrEqual(360);

    materials.dispose();
  });

  it("keeps every detail part's AABB inside the shell footprint + 0.06 m", () => {
    const materials = createNuketown2YardPropMaterials();
    const table = nuketown2YardPropSolids(materials);

    const g = NUKETOWN2_GLASSHOUSE;
    const pd = NUKETOWN2_GARDEN_POD;

    const margin = 0.06 + 1e-4;

    const glasshouseDetails = table.filter(
      (entry) => entry.tier === 'detail' && entry.name.includes('glasshouse'),
    );
    for (const part of glasshouseDetails) {
      const halfX = part.size[0] / 2;
      const halfZ = part.size[2] / 2;
      const dx = Math.abs(part.position[0] - g.x) + halfX;
      const dz = Math.abs(part.position[2] - g.z) + halfZ;
      expect(dx, `${part.name} X AABB exceeds glasshouse footprint + 0.06m`).toBeLessThanOrEqual(g.width / 2 + margin);
      expect(dz, `${part.name} Z AABB exceeds glasshouse footprint + 0.06m`).toBeLessThanOrEqual(g.depth / 2 + margin);
    }

    const podDetails = table.filter(
      (entry) => entry.tier === 'detail' && entry.name.includes('garden pod'),
    );
    for (const part of podDetails) {
      const halfX = part.size[0] / 2;
      const halfZ = part.size[2] / 2;
      const dx = Math.abs(part.position[0] - pd.x) + halfX;
      const dz = Math.abs(part.position[2] - pd.z) + halfZ;
      expect(dx, `${part.name} X AABB exceeds pod footprint + 0.06m`).toBeLessThanOrEqual(pd.width / 2 + margin);
      expect(dz, `${part.name} Z AABB exceeds pod footprint + 0.06m`).toBeLessThanOrEqual(pd.depth / 2 + margin);
    }

    materials.dispose();
  });

  it('per-part relief measured against the host face in [0.02, 0.05] m (door frames [0.03, 0.05])', () => {
    const materials = createNuketown2YardPropMaterials();
    const table = nuketown2YardPropSolids(materials);

    const g = NUKETOWN2_GLASSHOUSE;
    const pd = NUKETOWN2_GARDEN_POD;

    const computeRelief = (
      part: (typeof table)[number],
      host: { x: number; z: number; width: number; depth: number; height: number },
    ): number => {
      const minX = part.position[0] - part.size[0] / 2;
      const maxX = part.position[0] + part.size[0] / 2;
      const minZ = part.position[2] - part.size[2] / 2;
      const maxZ = part.position[2] + part.size[2] / 2;
      const maxY = part.position[1] + part.size[1] / 2;

      const hostMinX = host.x - host.width / 2;
      const hostMaxX = host.x + host.width / 2;
      const hostMinZ = host.z - host.depth / 2;
      const hostMaxZ = host.z + host.depth / 2;
      const hostMaxY = host.height;

      return Math.max(
        0,
        maxX - hostMaxX,
        hostMinX - minX,
        maxZ - hostMaxZ,
        hostMinZ - minZ,
        maxY - hostMaxY,
      );
    };

    const glasshouseDetails = table.filter(
      (entry) => entry.tier === 'detail' && entry.name.includes('glasshouse'),
    );
    for (const part of glasshouseDetails) {
      const relief = computeRelief(part, g);
      if (part.name.includes('door frame')) {
        expect(relief, `${part.name} door frame relief`).toBeGreaterThanOrEqual(0.03 - 1e-4);
        expect(relief, `${part.name} door frame relief`).toBeLessThanOrEqual(0.05 + 1e-4);
      } else {
        expect(relief, `${part.name} relief`).toBeGreaterThanOrEqual(0.02 - 1e-4);
        expect(relief, `${part.name} relief`).toBeLessThanOrEqual(0.05 + 1e-4);
      }
    }

    const podDetails = table.filter(
      (entry) => entry.tier === 'detail' && entry.name.includes('garden pod'),
    );
    for (const part of podDetails) {
      const relief = computeRelief(part, pd);
      if (part.name.includes('door frame')) {
        expect(relief, `${part.name} door frame relief`).toBeGreaterThanOrEqual(0.03 - 1e-4);
        expect(relief, `${part.name} door frame relief`).toBeLessThanOrEqual(0.05 + 1e-4);
      } else {
        expect(relief, `${part.name} relief`).toBeGreaterThanOrEqual(0.02 - 1e-4);
        expect(relief, `${part.name} relief`).toBeLessThanOrEqual(0.05 + 1e-4);
      }
    }

    materials.dispose();
  });

  it('mullion spacing 0.60 m +/- 0.01 on glasshouse', () => {
    const materials = createNuketown2YardPropMaterials();
    const table = nuketown2YardPropSolids(materials);
    const g = NUKETOWN2_GLASSHOUSE;

    const frontMullions = table
      .filter((entry) => entry.tier === 'detail' && entry.name.includes('mullion v front'))
      .sort((a, b) => a.position[0] - b.position[0]);

    expect(frontMullions.length).toBe(4);

    for (let i = 0; i < frontMullions.length - 1; i += 1) {
      const spacing = frontMullions[i + 1]!.position[0] - frontMullions[i]!.position[0];
      expect(Math.abs(spacing - 0.60), `front mullion spacing ${i}->${i + 1}`).toBeLessThanOrEqual(0.01);
    }

    const leftCornerX = g.x - g.width / 2;
    const rightCornerX = g.x + g.width / 2;
    expect(Math.abs(frontMullions[0]!.position[0] - leftCornerX - 0.60), 'corner to first mullion').toBeLessThanOrEqual(0.01);
    expect(Math.abs(rightCornerX - frontMullions[3]!.position[0] - 0.60), 'last mullion to corner').toBeLessThanOrEqual(0.01);

    const backMullions = table
      .filter((entry) => entry.tier === 'detail' && entry.name.includes('mullion v back'))
      .sort((a, b) => a.position[0] - b.position[0]);

    expect(backMullions.length).toBe(4);

    for (let i = 0; i < backMullions.length - 1; i += 1) {
      const spacing = backMullions[i + 1]!.position[0] - backMullions[i]!.position[0];
      expect(Math.abs(spacing - 0.60), `back mullion spacing ${i}->${i + 1}`).toBeLessThanOrEqual(0.01);
    }

    const shortMullions = table
      .filter((entry) => entry.tier === 'detail' && entry.name.includes('mullion v left'))
      .sort((a, b) => a.position[2] - b.position[2]);

    expect(shortMullions.length).toBe(2);
    const shortSpacing = shortMullions[1]!.position[2] - shortMullions[0]!.position[2];
    expect(Math.abs(shortSpacing - 0.60), 'short side mullion spacing').toBeLessThanOrEqual(0.01);

    materials.dispose();
  });

  it('only the listed roles used', () => {
    const materials = createNuketown2YardPropMaterials();
    const table = nuketown2YardPropSolids(materials);

    const allowedMaterials = new Set<THREE.Material>([
      materials.cabinet,
      materials.hobRed,
      materials.hobBlue,
      materials.chrome,
      materials.glazing,
      materials.frame,
      materials.timber,
      materials.sand,
      materials.podShell,
    ]);

    for (const entry of table) {
      if (Array.isArray(entry.material)) {
        for (const mat of entry.material) {
          expect(allowedMaterials.has(mat), `${entry.name} has invalid material`).toBe(true);
        }
      } else {
        expect(allowedMaterials.has(entry.material as THREE.Material), `${entry.name} has invalid material`).toBe(true);
      }
    }

    materials.dispose();
  });

  it('solid count identical before/after (exactly 4 silhouette colliders)', () => {
    const materials = createNuketown2YardPropMaterials();
    const table = nuketown2YardPropSolids(materials);

    const solidEntries = table.filter((entry) => entry.options.solid === true);
    expect(solidEntries.length).toBe(4);
    expect(solidEntries.map((e) => e.name).sort()).toEqual([
      'lawn appliance bank cabinet',
      'yard garden pod shell',
      'yard glasshouse shell',
      'yard sand pit kerb',
    ]);

    const detailEntries = table.filter((entry) => entry.tier === 'detail');
    for (const entry of detailEntries) {
      expect(entry.options.solid, `${entry.name} must not be solid`).toBe(false);
      expect(entry.options.shots, `${entry.name} must not block shots`).toBe(false);
    }

    materials.dispose();
  });

  it('presentationOnly on every detail mesh in the built arena', () => {
    const scene = new THREE.Scene();
    const map = buildNuketown2(scene);
    const materials = createNuketown2YardPropMaterials();
    const table = nuketown2YardPropSolids(materials);

    const detailEntries = table.filter((entry) => entry.tier === 'detail');
    expect(detailEntries.length).toBeGreaterThan(0);

    for (const entry of detailEntries) {
      const northMesh = map.root.getObjectByName(`nuketown2 north ${entry.name}`) as THREE.Mesh;
      const southMesh = map.root.getObjectByName(`nuketown2 south ${entry.name}`) as THREE.Mesh;

      expect(northMesh, `missing north mesh for ${entry.name}`).toBeDefined();
      expect(southMesh, `missing south mesh for ${entry.name}`).toBeDefined();

      expect(northMesh.userData.presentationOnly, `north ${entry.name} presentationOnly`).toBe(true);
      expect(southMesh.userData.presentationOnly, `south ${entry.name} presentationOnly`).toBe(true);
    }

    materials.dispose();
  });

  it('both yards (pair) carry the same counts', () => {
    const scene = new THREE.Scene();
    const map = buildNuketown2(scene);
    const materials = createNuketown2YardPropMaterials();
    const table = nuketown2YardPropSolids(materials);

    const northMeshes = map.root.children.filter(
      (child) => child.name.startsWith('nuketown2 north ') && table.some((e) => `nuketown2 north ${e.name}` === child.name),
    );
    const southMeshes = map.root.children.filter(
      (child) => child.name.startsWith('nuketown2 south ') && table.some((e) => `nuketown2 south ${e.name}` === child.name),
    );

    expect(northMeshes.length).toBe(table.length);
    expect(southMeshes.length).toBe(table.length);
    expect(northMeshes.length).toBe(southMeshes.length);

    materials.dispose();
  });
});
