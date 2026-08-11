import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SUPPORT_FORWARD_AXIS,
  SUPPORT_VEHICLE_PRESENTATION_CONTRACT,
  missingSupportMaterials,
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
    expect(SUPPORT_VEHICLE_PRESENTATION_CONTRACT.drone.gunProfileIds).toEqual({
      piloted: 'piloted-drone-gun-half-baseline-v1',
      swarm: 'drone-swarm-gun-double-baseline-v1',
    });
    expect(SUPPORT_VEHICLE_PRESENTATION_CONTRACT.chopper.possessedView).toEqual({
      visibleOnlyBelow: 'chopper-first-person-cockpit',
      requiredVisibleNodes: [
        'chopper-cockpit-dashboard-3d', 'chopper-cockpit-display-cyan', 'chopper-cockpit-display-green',
        'chopper-cockpit-hud-glass', 'chopper-cockpit-hud-target-ring', 'chopper-gunner-weapon-view',
      ],
      forbiddenVisibleNodes: ['chopper-fuselage', 'chopper-rear-fuselage', 'chopper-main-rotor', 'chopper-tail-rotor'],
    });
    expect(SUPPORT_VEHICLE_PRESENTATION_CONTRACT.chopper.requiredNodes).toEqual([
      'chopper-fuselage', 'chopper-rear-fuselage', 'chopper-tail-boom', 'chopper-tail-fin',
      'chopper-sleek-cockpit-canopy', 'chopper-main-rotor', 'chopper-tail-rotor',
      'chopper-nose-sensor',
      'chopper-player-gun', 'chopper-gun-muzzle-socket', 'chopper-forward-socket',
      'chopper-first-person-camera-socket', 'chopper-first-person-cockpit',
      'chopper-gunner-sightline', 'chopper-gunner-weapon-view',
      'chopper-cockpit-dashboard-3d', 'chopper-cockpit-display-cyan', 'chopper-cockpit-display-green',
      'chopper-cockpit-hud-glass', 'chopper-cockpit-hud-target-ring',
      'chopper-muzzle-flash', 'chopper-tracer-action', 'chopper-impact-action',
    ]);
    expect(SUPPORT_VEHICLE_PRESENTATION_CONTRACT.chopper.requiredActions).toEqual([
      'Chopper_Main_Rotor_Loop', 'Chopper_Tail_Rotor_Loop', 'Chopper_Gun_Recoil', 'Chopper_Gun_Fire',
      'Chopper_Muzzle_Flash', 'Chopper_Tracer_Pulse', 'Chopper_Impact_Pulse', 'Chopper_Quiet_Loop',
    ]);
    const productionManifest = JSON.parse(readFileSync(new URL('../source-assets/blender/pass65-weapon-production.manifest.json', import.meta.url), 'utf8')) as {
      supportVehicles: readonly {
        id: string;
        semanticNodes?: readonly string[];
        actions?: readonly string[];
      }[];
    };
    const chopperManifest = productionManifest.supportVehicles.find((entry) => entry.id === 'chopper-gunner-vehicle-v1');
    expect(chopperManifest).toBeDefined();
    expect(chopperManifest?.semanticNodes?.every((name) => (
      SUPPORT_VEHICLE_PRESENTATION_CONTRACT.chopper.requiredNodes.includes(name)
    ))).toBe(true);
    expect(chopperManifest?.actions?.every((name) => (
      SUPPORT_VEHICLE_PRESENTATION_CONTRACT.chopper.requiredActions.includes(name)
    ))).toBe(true);
    expect(missingSupportNodes(new THREE.Group(), SUPPORT_VEHICLE_PRESENTATION_CONTRACT.drone.requiredNodes))
      .toEqual(SUPPORT_VEHICLE_PRESENTATION_CONTRACT.drone.requiredNodes);
    expect(missingSupportMaterials(new THREE.Group(), SUPPORT_VEHICLE_PRESENTATION_CONTRACT.chopper.requiredMaterials))
      .toEqual(SUPPORT_VEHICLE_PRESENTATION_CONTRACT.chopper.requiredMaterials);
  });
});
