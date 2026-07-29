import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  SUPPORT_FORWARD_AXIS,
  SUPPORT_VEHICLE_PRESENTATION_CONTRACT,
  missingSupportNodes,
  supportForwardAlignment,
} from './support-vehicle-presentation-contract';

describe('support vehicle authored orientation contract', () => {
  it('pins one forward axis for vehicle bodies, cameras, guns, and muzzle sockets', () => {
    expect(SUPPORT_FORWARD_AXIS).toEqual([0, 0, -1]);
    const root = new THREE.Group();
    const body = new THREE.Group(); body.name = 'body';
    const muzzle = new THREE.Group(); muzzle.name = 'muzzle'; muzzle.position.z = -2;
    root.add(body, muzzle);
    expect(supportForwardAlignment(root, 'body', 'muzzle')).toBeCloseTo(1, 8);
    muzzle.position.z = 2;
    expect(supportForwardAlignment(root, 'body', 'muzzle')).toBeCloseTo(-1, 8);
  });

  it('requires the shared drone family and complete gun/HUD feedback vocabulary', () => {
    expect(SUPPORT_VEHICLE_PRESENTATION_CONTRACT.drone.weaponFeedback).toEqual([
      'report', 'gun-recoil', 'muzzle-flash', 'tracer', 'impact', 'owner-hit-confirm', 'owner-damage-number',
    ]);
    expect(SUPPORT_VEHICLE_PRESENTATION_CONTRACT.chopper.requiredWeaponFeedback).toEqual(
      SUPPORT_VEHICLE_PRESENTATION_CONTRACT.drone.weaponFeedback,
    );
    expect(SUPPORT_VEHICLE_PRESENTATION_CONTRACT.drone.visualFamilyId).toBe('hunter-drone-visual-family-v1');
    expect(SUPPORT_VEHICLE_PRESENTATION_CONTRACT.drone.gunProfileId).toBe('drone-gun-standard-v1');
    expect(SUPPORT_VEHICLE_PRESENTATION_CONTRACT.chopper.possessedView).toEqual({
      visibleOnlyBelow: 'chopper-gunner-sightline',
      requiredVisibleNodes: ['chopper-cockpit-hud-glass', 'chopper-cockpit-hud-target-ring', 'chopper-gunner-weapon-view'],
      forbiddenVisibleNodes: ['chopper-fuselage', 'chopper-rear-fuselage', 'chopper-main-rotor', 'chopper-tail-rotor'],
    });
    expect(missingSupportNodes(new THREE.Group(), SUPPORT_VEHICLE_PRESENTATION_CONTRACT.drone.requiredNodes))
      .toEqual(SUPPORT_VEHICLE_PRESENTATION_CONTRACT.drone.requiredNodes);
  });
});
