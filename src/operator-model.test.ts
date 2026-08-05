import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  BOT_EMISSIVE_BRIGHTNESS_SCALE,
  FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY,
  RIGGED_OPERATOR_RUNTIME_ACTION_NAMES,
  applyBotEmissiveBrightness,
  createOperatorInstanceMaterialResolver,
  firstPersonArmMaterialReadabilityProfile,
  isEmbeddedWeaponObjectName,
  riggedStanceTarget,
  riggedOperatorRuntimeClips,
  suppressEmbeddedWeaponObjects,
} from './operator-model';

describe('rigged operator presentation contract', () => {
  it('bounds first-person readability fill without flattening PBR into self-lit plastic', () => {
    const profiles = [
      firstPersonArmMaterialReadabilityProfile('Skin'),
      firstPersonArmMaterialReadabilityProfile('Arms_Glove_PBR'),
      firstPersonArmMaterialReadabilityProfile('Arms_FingerGlove_PBR'),
      firstPersonArmMaterialReadabilityProfile('Arms_Sleeve_PBR'),
      firstPersonArmMaterialReadabilityProfile('Arms_ArmorPad_PBR'),
    ];
    expect(profiles.every((profile) => profile !== null)).toBe(true);
    for (const profile of profiles) {
      expect(profile!.emissiveIntensity).toBeGreaterThan(0);
      expect(profile!.emissiveIntensity).toBeLessThanOrEqual(FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY);
    }
    expect(firstPersonArmMaterialReadabilityProfile('Arms_Glove_PBR')?.emissiveIntensity).toBeGreaterThan(0.6);
    expect(firstPersonArmMaterialReadabilityProfile('unrelated-world-operator')).toBeNull();
  });

  it('halves bot emissive brightness idempotently without changing base colour', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0xd85cff, emissive: 0x7d16bd, emissiveIntensity: 1.2 });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    expect(applyBotEmissiveBrightness(root)).toBe(1);
    expect(material.emissiveIntensity).toBeCloseTo(1.2 * BOT_EMISSIVE_BRIGHTNESS_SCALE);
    expect(material.color.getHex()).toBe(0xd85cff);
    applyBotEmissiveBrightness(root);
    expect(material.emissiveIntensity).toBeCloseTo(0.6);
    expect(root.userData.botEmissiveBrightnessScale).toBe(0.5);
  });

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

  it('reuses one material clone inside an operator without sharing mutable ownership across operators', () => {
    const source = new THREE.MeshStandardMaterial({ color: 0x507080, roughness: 0.61, metalness: 0.17 });
    source.name = 'Swat';
    const resolveFirstOwner = createOperatorInstanceMaterialResolver(0, false, 'team');
    const resolveSecondOwner = createOperatorInstanceMaterialResolver(0, false, 'team');

    const firstMeshMaterial = resolveFirstOwner(source);
    const siblingMeshMaterial = resolveFirstOwner(source);
    const secondOwnerMaterial = resolveSecondOwner(source);

    expect(firstMeshMaterial).toBe(siblingMeshMaterial);
    expect(firstMeshMaterial).not.toBe(source);
    expect(secondOwnerMaterial).not.toBe(firstMeshMaterial);
    expect((firstMeshMaterial as THREE.MeshStandardMaterial).color.getHex()).toBe(0x2d7882);
    expect((secondOwnerMaterial as THREE.MeshStandardMaterial).color.getHex()).toBe(0x2d7882);

    const secondOwnerDisposed = vi.fn();
    secondOwnerMaterial.addEventListener('dispose', secondOwnerDisposed);
    firstMeshMaterial.dispose();
    expect(secondOwnerDisposed).not.toHaveBeenCalled();
  });

  it('admits only controller-reachable authored clips in deterministic prewarm order', () => {
    const authored = [
      new THREE.AnimationClip('Wave', 1, []),
      ...[...RIGGED_OPERATOR_RUNTIME_ACTION_NAMES].reverse().map((name) => new THREE.AnimationClip(name, 1, [])),
      new THREE.AnimationClip('Roll', 1, []),
    ];

    const runtimeClips = riggedOperatorRuntimeClips(authored);
    expect(runtimeClips.map((clip) => clip.name)).toEqual(RIGGED_OPERATOR_RUNTIME_ACTION_NAMES);
    expect(runtimeClips).toHaveLength(12);
    expect(runtimeClips).not.toContain(authored[0]);
    expect(runtimeClips).not.toContain(authored.at(-1));
    expect(runtimeClips.every((clip) => authored.includes(clip))).toBe(true);
  });
});
