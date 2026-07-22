import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  isEmbeddedWeaponObjectName,
  riggedStanceTarget,
  suppressEmbeddedWeaponObjects,
} from './operator-model';

describe('rigged operator presentation contract', () => {
  it('suppresses embedded loadout weapons by semantic identity without hiding body meshes', () => {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); body.name = 'Swat_Body';
    const pistol = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); pistol.name = 'Pistol';
    const holstered = new THREE.Group(); holstered.name = 'operator.weapon_backup';
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); child.name = 'embedded-prop'; holstered.add(child);
    root.add(body, pistol, holstered);

    expect(isEmbeddedWeaponObjectName('Pistol')).toBe(true);
    expect(isEmbeddedWeaponObjectName('backup-rifle.mesh')).toBe(true);
    expect(isEmbeddedWeaponObjectName('Swat_Body')).toBe(false);
    expect(suppressEmbeddedWeaponObjects(root)).toBe(2);
    expect(body.visible).toBe(true);
    expect(pistol.visible).toBe(false);
    expect(holstered.visible).toBe(false);
    expect(pistol.userData.embeddedWeaponSuppressed).toBe(true);
  });

  it('uses a pelvis-height prone pivot and bounded deterministic stance targets', () => {
    expect(riggedStanceTarget('stand')).toEqual({ pivotHeight: 0.84, pivotPitch: 0, crouch: 0, prone: 0 });
    expect(riggedStanceTarget('crouch')).toEqual({ pivotHeight: 0.84, pivotPitch: 0, crouch: 1, prone: 0 });
    const prone = riggedStanceTarget('prone');
    expect(prone.pivotHeight).toBeGreaterThan(0.35);
    expect(prone.pivotHeight).toBeLessThan(0.55);
    expect(prone.pivotPitch).toBeGreaterThan(-Math.PI / 2);
    expect(prone.pivotPitch).toBeLessThan(-1.3);
    expect(prone).toMatchObject({ crouch: 0, prone: 1 });
  });
});
