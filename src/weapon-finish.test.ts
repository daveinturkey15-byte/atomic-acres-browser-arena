import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildWeaponModel } from './art-kit';
import { weaponFamilyPresentation } from './weapon-family-presentation';
import { WEAPON_FINISH_PROFILES } from './weapon-finish';
import type { WeaponId } from './protocol';

const weapons = Object.keys(WEAPON_FINISH_PROFILES) as WeaponId[];
const authoredWeaponIds = new Set<WeaponId>([
  'carbine', 'smg', 'lmg', 'scattergun', 'sniper', 'railgun', 'pistol', 'magnum', 'machine-pistol',
]);

describe('Pass 65 authored and procedural-family weapon asset contract', () => {
  it('assigns every weapon a unique finish identity with bounded intentional texture reuse', () => {
    expect(weapons).toHaveLength(18);
    expect(new Set(weapons.map((weapon) => WEAPON_FINISH_PROFILES[weapon].id)).size).toBe(18);
    // Family variants intentionally reuse the reviewed original texture sets,
    // while each stable weapon ID retains a unique finish/profile identity.
    expect(new Set(weapons.map((weapon) => WEAPON_FINISH_PROFILES[weapon].albedo)).size).toBe(8);
    expect(new Set(weapons.flatMap((weapon) => {
      const profile = WEAPON_FINISH_PROFILES[weapon];
      return [profile.albedo, profile.normal, profile.roughness];
    })).size).toBe(24);
  });

  it.each(weapons)('%s has one proportional policy-labelled model and calibrated hand/aim sockets', (weapon) => {
    const model = buildWeaponModel(weapon, false, false);
    const finish = WEAPON_FINISH_PROFILES[weapon];
    const socketNames = ['muzzle-socket', 'grip-socket-r', 'support-socket-l', 'reload-socket-l'];
    const names: string[] = [];
    model.traverse((node) => names.push(node.name));
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);

    expect(model.userData.weaponModelId).toBe(authoredWeaponIds.has(weapon)
      ? `${weapon}-authored-v6`
      : `${weapon}-procedural-family-v1`);
    expect(model.userData.weaponFinishId).toBe(finish.id);
    for (const socketName of socketNames) expect(names.filter((name) => name === socketName)).toHaveLength(1);
    for (const detail of weaponFamilyPresentation(weapon).requiredDetails) expect(model.getObjectByName(detail)).toBeDefined();
    expect(size.toArray().every(Number.isFinite)).toBe(true);
    expect(maxDimension).toBeGreaterThan(0.4);
    expect(maxDimension).toBeLessThan(4);
    if (weapon === 'explosive-crossbow') expect(size.x).toBeGreaterThan(size.z);
    else expect(size.z).toBeGreaterThan(size.x);
  });
});
