import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import {
  BALLISTIC_MATERIALS,
  classifyBallisticMaterial,
  createBallisticSurface,
  penetrationEnergyRetention,
  traceBallisticPath,
  type BallisticMaterialId,
  type WeaponPenetrationProfile,
} from './ballistics';
import { WEAPONS } from './gameplay';
import { buildArena } from './map';

const origin = { x: 0, y: 1.5, z: 0 };
const direction = { x: 1, y: 0, z: 0 };

function surface(
  material: BallisticMaterialId,
  x: number,
  thickness: number,
  id = `${material}-${x}`,
) {
  return createBallisticSurface(
    id,
    id,
    { minX: x, maxX: x + thickness, minY: 0, maxY: 3, minZ: -20, maxZ: 20 },
    { material },
  );
}

describe('shared wall-penetration authority', () => {
  it('keeps the material table physically ordered for gameplay', () => {
    const cost = (material: BallisticMaterialId, thickness: number) => {
      const rule = BALLISTIC_MATERIALS[material];
      return rule.entryCost + rule.costPerMeter * thickness;
    };
    expect(cost('glass', 0.2)).toBeLessThan(cost('fence', 0.2));
    expect(cost('fence', 0.42)).toBeLessThan(cost('interior-wall', 0.42));
    expect(cost('interior-wall', 0.42)).toBeLessThan(cost('brick', 0.42));
    expect(cost('brick', 0.42)).toBeLessThan(cost('concrete', 0.42));
    expect(cost('container', 2.6)).toBeGreaterThan(cost('concrete', 0.42));
  });

  it('gives every weapon a bounded calibre, distance, FMJ, and residual-damage profile', () => {
    const noWallPenetration = new Set(['explosive-crossbow', 'flamethrower', 'flare-gun']);
    expect(Object.values(WEAPONS)
      .filter((weapon) => weapon.penetration.maxPenetratedSurfaces === 0)
      .map((weapon) => weapon.id)
      .sort()).toEqual([...noWallPenetration].sort());
    for (const weapon of Object.values(WEAPONS)) {
      const profile = weapon.penetration;
      expect(profile.caliber.length, weapon.id).toBeGreaterThan(2);
      if (noWallPenetration.has(weapon.id)) {
        expect(profile.penetrationPower, weapon.id).toBe(0);
        expect(profile.maxPenetratedSurfaces, weapon.id).toBe(0);
        expect(profile.minimumEnergyRetention, weapon.id).toBe(0);
        expect(profile.minimumWallDamageMultiplier, weapon.id).toBe(0);
      } else {
        expect(profile.penetrationPower, weapon.id).toBeGreaterThan(0);
        expect(profile.maxPenetratedSurfaces, weapon.id).toBeGreaterThanOrEqual(1);
        expect(profile.minimumEnergyRetention, weapon.id).toBeGreaterThan(0);
        expect(profile.minimumWallDamageMultiplier, weapon.id).toBeGreaterThan(0);
      }
      expect(profile.fmjMultiplier, weapon.id).toBeGreaterThanOrEqual(1);
      expect(profile.energyFalloffEnd, weapon.id).toBeGreaterThan(profile.energyFalloffStart);
      expect(profile.minimumEnergyRetention, weapon.id).toBeLessThanOrEqual(1);
      expect(profile.minimumWallDamageMultiplier, weapon.id).toBeLessThanOrEqual(1);
    }
  });

  it('makes close-range fire retain more penetration energy than long-range fire', () => {
    const profile = WEAPONS.smg.penetration;
    expect(penetrationEnergyRetention(profile, 4)).toBe(1);
    expect(penetrationEnergyRetention(profile, 30)).toBeLessThan(0.5);
    expect(traceBallisticPath(origin, direction, 10, profile, [surface('wood', 5, 1.5)]).reachedDistance).toBe(true);
    expect(traceBallisticPath(origin, direction, 40, profile, [surface('wood', 30, 1.5)]).reachedDistance).toBe(false);
  });

  it('lets rifle-calibre weapons beat SMGs through brick at range', () => {
    const wall = surface('brick', 25, 0.42);
    const smg = traceBallisticPath(origin, direction, 35, WEAPONS.smg.penetration, [wall]);
    const carbine = traceBallisticPath(origin, direction, 35, WEAPONS.carbine.penetration, [wall]);
    const sniper = traceBallisticPath(origin, direction, 35, WEAPONS.sniper.penetration, [wall]);
    expect(smg.reachedDistance).toBe(false);
    expect(carbine.reachedDistance).toBe(true);
    expect(sniper.reachedDistance).toBe(true);
    expect(sniper.remainingEnergy).toBeGreaterThan(carbine.remainingEnergy);
  });

  it('passes thin fence and interior cover but stops on a thick container', () => {
    const weapon = WEAPONS.carbine.penetration;
    const fence = traceBallisticPath(origin, direction, 12, weapon, [surface('fence', 5, 0.2)]);
    const interior = traceBallisticPath(origin, direction, 12, weapon, [surface('interior-wall', 5, 0.42)]);
    const container = traceBallisticPath(origin, direction, 12, weapon, [surface('container', 5, 2.6)]);
    expect(fence.reachedDistance).toBe(true);
    expect(interior.reachedDistance).toBe(true);
    expect(fence.damageMultiplier).toBeGreaterThan(interior.damageMultiplier);
    expect(container.reachedDistance).toBe(false);
    expect(container.stoppedBy?.material).toBe('container');
  });

  it('charges oblique shots for their longer path through a surface', () => {
    const tightProfile: WeaponPenetrationProfile = {
      caliber: 'test', penetrationPower: 1.6, fmjMultiplier: 1,
      energyFalloffStart: 100, energyFalloffEnd: 200, minimumEnergyRetention: 1,
      minimumWallDamageMultiplier: 0.2, maxPenetratedSurfaces: 1,
    };
    const wall = surface('interior-wall', 5, 1);
    const square = traceBallisticPath(origin, direction, 12, tightProfile, [wall]);
    const oblique = traceBallisticPath(origin, { x: 1, y: 0, z: 0.75 }, 16, tightProfile, [wall]);
    expect(square.reachedDistance).toBe(true);
    expect(oblique.reachedDistance).toBe(false);
  });

  it('bounds repeated wallbangs and reduces damage after every accepted surface', () => {
    const profile = WEAPONS.sniper.penetration;
    const one = traceBallisticPath(origin, direction, 20, profile, [surface('interior-wall', 4, 0.42)]);
    const three = traceBallisticPath(origin, direction, 20, profile, [
      surface('interior-wall', 4, 0.42, 'wall-1'),
      surface('interior-wall', 8, 0.42, 'wall-2'),
      surface('interior-wall', 12, 0.42, 'wall-3'),
    ]);
    const four = traceBallisticPath(origin, direction, 20, profile, [
      surface('glass', 2, 0.08, 'pane'),
      surface('interior-wall', 4, 0.42, 'wall-1'),
      surface('interior-wall', 8, 0.42, 'wall-2'),
      surface('interior-wall', 12, 0.42, 'wall-3'),
    ]);
    expect(one.reachedDistance).toBe(true);
    expect(three.reachedDistance).toBe(true);
    expect(three.damageMultiplier).toBeLessThan(one.damageMultiplier);
    expect(four.reachedDistance).toBe(false);
  });

  it('fails unknown future materials closed instead of granting accidental penetration', () => {
    expect(classifyBallisticMaterial({ name: 'mystery-new-asset' })).toEqual({
      material: 'reinforced',
      classification: 'fallback',
    });
    const unknown = createBallisticSurface(
      'unknown',
      'mystery-new-asset',
      { minX: 5, maxX: 5.1, minY: 0, maxY: 3, minZ: -1, maxZ: 1 },
    );
    expect(traceBallisticPath(origin, direction, 10, WEAPONS.sniper.penetration, [unknown]).reachedDistance).toBe(false);
  });

  it('passes only through a canonical dynamic aperture at the exact entry point', () => {
    const sheet = surface('reinforced', 5, 0.08, 'shed-sheet');
    const blocked = traceBallisticPath(origin, direction, 10, WEAPONS.carbine.penetration, [sheet], () => false);
    const aperture = traceBallisticPath(origin, direction, 10, WEAPONS.carbine.penetration, [sheet], (candidate, entry) => (
      candidate.id === 'shed-sheet' && Math.hypot(entry.y - 1.5, entry.z) <= 0.1
    ));
    const outside = traceBallisticPath(
      { ...origin, y: 1.8 }, direction, 10, WEAPONS.carbine.penetration, [sheet],
      (_candidate, entry) => Math.hypot(entry.y - 1.5, entry.z) <= 0.1,
    );
    expect(blocked.reachedDistance).toBe(false);
    expect(aperture).toMatchObject({ reachedDistance: true, impacts: [] });
    expect(outside.reachedDistance).toBe(false);
  });

  it('classifies every current additional-map shot blocker with unique authority', () => {
    for (const build of [buildArena, buildRustworks1v1, buildGunRange, buildSkylineTerminal]) {
      const arena = build(new THREE.Scene());
      const dynamicTargetMeshes = arena.raycastMeshes.filter((mesh) => (
        typeof mesh.userData.ballisticSurfaceId !== 'string'
      ));
      expect(dynamicTargetMeshes.every((mesh) => (
        typeof mesh.userData.targetId === 'string'
        && mesh.userData.targetRoot instanceof THREE.Group
        && (mesh.userData.hitZone === 'head' || mesh.userData.hitZone === 'body' || mesh.userData.hitZone === 'limb')
      ))).toBe(true);
      expect(arena.shotSurfaces.length + dynamicTargetMeshes.length).toBe(arena.raycastMeshes.length);
      expect(arena.shotSurfaces.filter((entry) => entry.classification === 'fallback')).toEqual([]);
      expect(new Set(arena.shotSurfaces.map((entry) => entry.id)).size).toBe(arena.shotSurfaces.length);
      expect(arena.raycastMeshes.every((mesh) => (
        typeof mesh.userData.ballisticSurfaceId === 'string' || dynamicTargetMeshes.includes(mesh)
      ))).toBe(true);
    }
  });
});
