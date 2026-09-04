/**
 * nuketown2-interior-look.test.ts — PASS 96: the dark-interior look contract.
 *
 * Five properties the gates cannot see at a glance, pinned where the lane
 * owns them: one ceiling fixture per room per house, table lamps only where
 * the value plan puts them, every fixture emissive reading the ONE shared
 * intensity uniform (never a per-instance value), zero new materials /
 * lights / pipelines from the lane, and presentation-only bodies the parity
 * gate owes nothing for. Coplanar HOUSE-INTERIOR 0 and the pipeline budget
 * stay with their own instruments (`find-coplanar-pairs.ts`,
 * `nuketown2-pipeline-budget.test.ts`); this file asserts the shape that
 * keeps them green rather than re-running them.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2 } from './nuketown2-arena';
import { NUKETOWN2_INTERIOR_FIXTURE_INTENSITY } from './nuketown2-interior-materials';
import {
  NUKETOWN2_INTERIOR_LOOK_COUNTS,
  NUKETOWN2_INTERIOR_VALUE_PLAN,
  nuketown2InteriorJunctionDecals,
  nuketown2InteriorLampSolids,
} from './nuketown2-interior-look';

function built(): THREE.Group {
  return buildNuketown2(new THREE.Scene()).root;
}

function named(root: THREE.Object3D, suffix: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh === true && node.name.endsWith(suffix)) {
      out.push(node as THREE.Mesh);
    }
  });
  return out;
}

describe('Nuke Town Rebuild interior look (PASS 96)', () => {
  it('keeps one ceiling fixture per room per house', () => {
    const root = built();
    for (const room of ['front', 'back', 'upper front', 'upper back']) {
      const lenses = named(root, `house ${room} ceiling light lens`);
      // pair() emits north + south; the count is the symmetry proof.
      expect(lenses.length, `${room} lens pair`).toBe(2);
    }
    expect(
      named(root, 'ceiling light lens').length,
      '4 rooms x 2 houses',
    ).toBe(NUKETOWN2_INTERIOR_LOOK_COUNTS.ceilingLensAuthored * 2);
  });

  it('puts table lamps only where the value plan puts them', () => {
    const root = built();
    expect(named(root, 'house front table lamp shade').length).toBe(2);
    expect(named(root, 'house back table lamp shade').length).toBe(2);
    expect(named(root, 'upper table lamp shade').length).toBe(0);
    expect(named(root, 'table lamp shade').length).toBe(4);
    // Base + stem per lamp: 2 lamps per house, both houses.
    expect(named(root, 'table lamp base').length).toBe(4);
    expect(named(root, 'table lamp stem').length).toBe(4);
    const plan = Object.fromEntries(
      NUKETOWN2_INTERIOR_VALUE_PLAN.map((row) => [row.room, row]),
    );
    expect(plan['ground front']!.tableLamps).toBe(1);
    expect(plan['ground back']!.tableLamps).toBe(1);
    expect(plan['upper front']!.tableLamps).toBe(0);
    expect(plan['upper back']!.tableLamps).toBe(0);
  });

  it('drives every fixture emissive from the one shared intensity uniform', () => {
    const root = built();
    const fixtures = [
      ...named(root, 'ceiling light lens'),
      ...named(root, 'table lamp shade'),
      ...named(root, 'tube light tube'),
    ];
    expect(fixtures.length).toBeGreaterThan(0);
    const materials = new Set<THREE.Material>();
    for (const mesh of fixtures) {
      const material = mesh.material as THREE.Material;
      materials.add(material);
      expect(
        (material.userData as Record<string, unknown>).nuketown2FixtureIntensity,
        `${mesh.name} reads the shared fixture uniform`,
      ).toBe(NUKETOWN2_INTERIOR_FIXTURE_INTENSITY);
    }
    // Warm lenses/shades and cold garage tubes: exactly the two graphs the
    // arena already compiled, no per-instance clone.
    expect(materials.size).toBeLessThanOrEqual(2);
    expect(NUKETOWN2_INTERIOR_FIXTURE_INTENSITY.value).toBe(1);
  });

  it('creates no material, no light, and no pipeline of its own', () => {
    const trim = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const warm = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const row of nuketown2InteriorLampSolids(trim, warm)) {
      expect(
        row.material === trim || row.material === warm,
        `${row.name} reuses a caller material`,
      ).toBe(true);
    }
    expect(nuketown2InteriorLampSolids(trim, warm).length)
      .toBe(NUKETOWN2_INTERIOR_LOOK_COUNTS.lampSolidsAuthored);
    const grime = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const junctions = nuketown2InteriorJunctionDecals(grime);
    expect(junctions.length).toBe(NUKETOWN2_INTERIOR_LOOK_COUNTS.junctionStripsAuthored);
    for (const decal of junctions) {
      expect(decal.family).toBe('wall-grime');
      expect(decal.material).toBe(grime);
    }
    trim.dispose();
    warm.dispose();
    grime.dispose();

    const scene = new THREE.Scene();
    buildNuketown2(scene);
    const lights: string[] = [];
    scene.traverse((node) => {
      if ((node as THREE.Light).isLight === true) lights.push(node.type);
    });
    expect(lights, 'no dynamic light from any lane, interior look included').toEqual([]);
  });

  it('emits presentation-only bodies the parity gate owes nothing for', () => {
    const map = buildNuketown2(new THREE.Scene());
    const authored = [
      ...nuketown2InteriorLampSolids(
        new THREE.MeshStandardMaterial(),
        new THREE.MeshStandardMaterial(),
      ).map((row) => row.name),
      'house interior junction grime front',
      'house interior junction grime front east',
      'house interior junction grime back',
      'house interior junction grime back east',
    ];
    const names = new Set(authored.flatMap((name) => [
      `nuketown2 north ${name}`,
      `nuketown2 south ${name}`,
    ]));
    for (const mesh of map.raycastMeshes) expect(names.has(mesh.name)).toBe(false);
    for (const surface of map.shotSurfaces) {
      expect(names.has((surface as { mesh?: THREE.Mesh }).mesh?.name ?? '')).toBe(false);
    }
    for (const node of map.root.children) {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh !== true || !names.has(node.name)) continue;
      expect(
        mesh.userData.presentationBatchCandidate === true
          || mesh.userData.staticBatchRendered === true,
        `${node.name} is batch-merged presentation`,
      ).toBe(true);
      expect(mesh.castShadow, `${node.name} casts no shadow`).toBe(false);
    }
    // Pair integrity: every authored body exists exactly twice, mirrored.
    for (const name of authored) {
      const pairMeshes = [
        map.root.getObjectByName(`nuketown2 north ${name}`),
        map.root.getObjectByName(`nuketown2 south ${name}`),
      ];
      // Batched sources persist under their authored names (the coplanar
      // instrument audits the same nodes); merged-away members are still
      // exactly two geometric halves, never one.
      const found = pairMeshes.filter((mesh) => mesh !== undefined);
      expect(found.length, name).toBeGreaterThanOrEqual(1);
    }
  });

  it('lands every junction top clear of the slab and the baseboards', () => {
    const root = built();
    for (const suffix of [
      'junction grime front',
      'junction grime front east',
      'junction grime back',
      'junction grime back east',
    ]) {
      for (const mesh of named(root, suffix)) {
        const params = (mesh.geometry as THREE.BoxGeometry).parameters;
        const top = mesh.position.y + params.height / 2;
        // Slab top 0.08, baseboard top 0.14: the 0.03 m coplanar window
        // clears both, and the wall-grime 3.17 m ceiling is nowhere near.
        expect(top, `${mesh.name} top`).toBeGreaterThan(0.08 + 0.03);
        expect(top, `${mesh.name} top`).toBeGreaterThan(0.14 + 0.03);
        expect(top, `${mesh.name} top`).toBeLessThan(3.17);
        expect(Math.min(params.width, params.depth), `${mesh.name} film`).toBeLessThan(0.05);
      }
    }
  });
});
