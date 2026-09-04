/**
 * nuketown2-yard-props.test.ts — the contract for PASS 94's hero props.
 *
 * The claims that need pinning are the ones that would be expensive to
 * discover in a capture:
 *   1. the chirality anchor is COLOUR ONLY - identical geometry, identical
 *      collider, one pair of materials;
 *   2. every solid the props add has an exact 180-degree partner, so the two
 *      teams still get the same cover;
 *   3. every non-silhouette piece is presentation-only and lives inside or on
 *      its own silhouette box, so a detail tier can never move cover; and
 *   4. the reduced route drops exactly the `detail` tier and nothing else.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { NUKETOWN2_GROUND_DRESSING, buildNuketown2 } from './nuketown2-arena';
import { NUKETOWN2_SPAWN_LAYOUT } from './nuketown2-arena';
import {
  NUKETOWN2_APPLIANCE_BANK,
  NUKETOWN2_GARDEN_POD,
  NUKETOWN2_GLASSHOUSE,
  NUKETOWN2_SAND_PIT,
  createNuketown2YardPropMaterials,
  nuketown2YardPropSolids,
} from './nuketown2-yard-props';

function props(reduced = false) {
  const materials = createNuketown2YardPropMaterials();
  const table = nuketown2YardPropSolids(materials, { reduced });
  return { materials, table };
}

describe('Nuke Town Rebuild yard props', () => {
  it('carries the chirality anchor as COLOUR alone, on identical geometry', () => {
    const { materials, table } = props();
    const hob = table.filter((entry) => entry.name === 'lawn appliance bank hob deck');
    expect(hob.length).toBe(1);
    const pair = hob[0]!.material as readonly THREE.Material[];
    expect(Array.isArray(pair)).toBe(true);
    expect(pair.length).toBe(2);
    // Red on one lawn, blue on the other - FINDINGS Q4's "cheapest chirality
    // anchor in the whole reference".
    expect(pair[0]).toBe(materials.hobRed);
    expect(pair[1]).toBe(materials.hobBlue);
    expect((pair[0] as THREE.Material).uuid).not.toBe((pair[1] as THREE.Material).uuid);
    // And it is the ONLY two-material entry: any other split would be geometry
    // identity leaking into a colour decision.
    const split = table.filter((entry) => Array.isArray(entry.material));
    expect(split.map((entry) => entry.name)).toEqual(['lawn appliance bank hob deck']);
    materials.dispose();
  });

  it('keeps the appliance bank on the authored front-lawn zone, outside the road', () => {
    const lawn = NUKETOWN2_GROUND_DRESSING.find((piece) => piece.id === 'street lawn west');
    expect(lawn).toBeDefined();
    const bank = NUKETOWN2_APPLIANCE_BANK;
    expect(bank.x - bank.width / 2).toBeGreaterThanOrEqual(lawn!.x0);
    expect(bank.x + bank.width / 2).toBeLessThanOrEqual(lawn!.x1);
    expect(bank.z - bank.depth / 2).toBeGreaterThanOrEqual(lawn!.z0);
    expect(bank.z + bank.depth / 2).toBeLessThanOrEqual(lawn!.z1);
    // The lawn zone borders the turning head at z = -8; the bank's footprint
    // ends exactly at that boundary and never enters the carriageway.
    expect(bank.z + bank.depth / 2).toBe(-8);
  });

  it('binds the red hob to the authored north house side and blue to south', () => {
    const map = buildNuketown2(new THREE.Scene());
    const materialName = (name: string): string => {
      const mesh = map.root.getObjectByName(name) as THREE.Mesh | undefined;
      expect(mesh, name).toBeDefined();
      return (mesh!.material as THREE.Material).name;
    };
    expect(materialName('nuketown2 north lawn appliance bank hob deck')).toBe('nuketown2-appliance-hob-red');
    expect(materialName('nuketown2 south lawn appliance bank hob deck')).toBe('nuketown2-appliance-hob-blue');
    // The pushed accuracy lane's HF-477 constants make north the orange house
    // and south the cream/white house; the side binding above keeps the
    // reference's red-on-orange / blue-on-white relationship when integrated.
    expect(materialName('nuketown2 north house wall west')).toContain('north');
    expect(materialName('nuketown2 south house wall west')).toContain('south');
  });

  it('makes only the silhouette tier solid, and that tier carries the collider', () => {
    const { materials, table } = props();
    for (const entry of table) {
      if (entry.tier === 'silhouette') {
        expect(entry.options.solid, entry.name).toBe(true);
        expect(entry.options.shots, entry.name).toBe(true);
      } else {
        expect(entry.options.solid, entry.name).toBe(false);
        expect(entry.options.shots, entry.name).toBe(false);
      }
    }
    // Exactly four silhouettes: bank, glasshouse, pod, sand pit.
    const silhouettes = table.filter((entry) => entry.tier === 'silhouette').map((entry) => entry.name);
    expect(silhouettes.sort()).toEqual([
      'lawn appliance bank cabinet',
      'yard garden pod shell',
      'yard glasshouse shell',
      'yard sand pit kerb',
    ]);
    materials.dispose();
  });

  it('keeps every dressing piece within its own silhouette footprint plus a 0.15 m lip', () => {
    const { materials, table } = props();
    const hosts = table.filter((entry) => entry.tier === 'silhouette');
    for (const entry of table) {
      if (entry.tier === 'silhouette') continue;
      const [x, , z] = entry.position;
      const [w, , d] = entry.size;
      // The nearest silhouette that actually contains this piece's footprint.
      const contained = hosts.some((host) => {
        const [hx, , hz] = host.position;
        const [hw, , hd] = host.size;
        return Math.abs(x - hx) + w / 2 <= hw / 2 + 0.15
          && Math.abs(z - hz) + d / 2 <= hd / 2 + 0.15;
      });
      expect(contained, `${entry.name} sticks out past its silhouette`).toBe(true);
    }
    materials.dispose();
  });

  it('drops exactly the detail tier on the reduced route', () => {
    const full = props();
    const cut = props(true);
    const dropped = full.table.filter((entry) => !cut.table.some((other) => other.name === entry.name));
    expect(dropped.length).toBeGreaterThan(0);
    for (const entry of dropped) expect(entry.tier).toBe('detail');
    // ...and nothing solid was dropped, so the reduced route plays the same map.
    for (const entry of dropped) expect(entry.options.solid).toBe(false);
    // Every silhouette and structure piece survives.
    for (const entry of full.table) {
      if (entry.tier === 'detail') continue;
      expect(cut.table.some((other) => other.name === entry.name), entry.name).toBe(true);
    }
    full.materials.dispose();
    cut.materials.dispose();
  });

  it('gives every prop solid an exact 180-degree partner in the built arena', () => {
    const map = buildNuketown2(new THREE.Scene());
    const { materials, table } = props();
    const names = new Set(table.filter((entry) => entry.tier === 'silhouette').map((entry) => entry.name));
    const emitted = map.root.children.filter((node): node is THREE.Mesh => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh !== true) return false;
      return [...names].some((name) => mesh.name === `nuketown2 north ${name}` || mesh.name === `nuketown2 south ${name}`);
    });
    // Four props x two halves.
    expect(emitted.length).toBe(names.size * 2);
    const key = (mesh: THREE.Mesh) => {
      const p = (mesh.geometry as THREE.BoxGeometry).parameters as { width: number; height: number; depth: number };
      return `${p.width}x${p.height}x${p.depth}`;
    };
    for (const mesh of emitted) {
      const partner = emitted.find((other) => (
        other !== mesh
        && key(other) === key(mesh)
        && Math.abs(other.position.x + mesh.position.x) < 1e-6
        && Math.abs(other.position.z + mesh.position.z) < 1e-6
        && Math.abs(other.position.y - mesh.position.y) < 1e-6
      ));
      expect(partner, `${mesh.name} has no 180-degree partner`).toBeDefined();
    }
    materials.dispose();
  });

  it('stands clear of every spawn point by at least 3 m', () => {
    const bodies = [NUKETOWN2_APPLIANCE_BANK, NUKETOWN2_GLASSHOUSE, NUKETOWN2_GARDEN_POD, NUKETOWN2_SAND_PIT];
    for (const team of NUKETOWN2_SPAWN_LAYOUT) {
      for (const [spawnX, spawnZ] of team) {
        const spawn = { x: spawnX, z: spawnZ };
        for (const body of bodies) {
          for (const sign of [1, -1] as const) {
            // The authored x is mirrored by `pair()`; compare against both
            // halves, in both handedness signs, so the assertion cannot be
            // satisfied by an accident of the mirror.
            const dx = Math.max(0, Math.abs(spawn.x - sign * body.x) - body.width / 2);
            const dz = Math.max(0, Math.abs(spawn.z - sign * body.z) - body.depth / 2);
            expect(Math.hypot(dx, dz)).toBeGreaterThan(3);
          }
        }
      }
    }
  });

  it('keeps the sand pit under the arena autostep so it is never a wall', () => {
    // 0.42 m is the arena's AUTOSTEP_M. A 0.30 m kerb is stepped over; a
    // 0.45 m one silently becomes a movement blocker in a back yard.
    expect(NUKETOWN2_SAND_PIT.height).toBeLessThan(0.42);
  });
});
