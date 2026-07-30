import * as THREE from 'three';
import { DRONE_PRESENTATION_FAMILY_ID, DRONE_SUPPORT_DEFINITIONS } from './killstreak-support-catalog';
import { SUPPORT_FORWARD_AXIS } from './support-forward-axis';
export { SUPPORT_FORWARD_AXIS } from './support-forward-axis';

export const SUPPORT_WEAPON_FEEDBACK_CONTRACT = Object.freeze([
  'report',
  'gun-recoil',
  'muzzle-flash',
  'tracer',
  'impact',
  'owner-hit-confirm',
  'owner-damage-number',
] as const);

export const SUPPORT_VEHICLE_PRESENTATION_CONTRACT = Object.freeze({
  forwardAxis: SUPPORT_FORWARD_AXIS,
  drone: Object.freeze({
    visualFamilyId: DRONE_PRESENTATION_FAMILY_ID,
    gunProfileIds: Object.freeze({
      piloted: DRONE_SUPPORT_DEFINITIONS.piloted.gunProfileId,
      swarm: DRONE_SUPPORT_DEFINITIONS.swarm.gunProfileId,
    }),
    requiredNodes: Object.freeze([
      'drone-body', 'drone-optic', 'drone-mounted-gun', 'drone-gun-muzzle-socket',
      'drone-first-person-camera-socket', 'drone-rotors',
    ]),
    weaponFeedback: SUPPORT_WEAPON_FEEDBACK_CONTRACT,
  }),
  chopper: Object.freeze({
    requiredNodes: Object.freeze([
      'chopper-fuselage', 'chopper-rear-fuselage', 'chopper-tail-boom', 'chopper-tail-fin',
      'chopper-main-rotor', 'chopper-tail-rotor', 'chopper-player-gun', 'chopper-gun-muzzle-socket',
      'chopper-first-person-camera-socket', 'chopper-first-person-cockpit',
      'chopper-gunner-sightline', 'chopper-gunner-weapon-view',
      'chopper-cockpit-dashboard-3d', 'chopper-cockpit-display-cyan', 'chopper-cockpit-display-green',
      'chopper-cockpit-hud-glass', 'chopper-cockpit-hud-target-ring',
    ]),
    possessedView: Object.freeze({
      visibleOnlyBelow: 'chopper-gunner-sightline',
      requiredVisibleNodes: Object.freeze(['chopper-cockpit-hud-glass', 'chopper-cockpit-hud-target-ring', 'chopper-gunner-weapon-view']),
      forbiddenVisibleNodes: Object.freeze(['chopper-fuselage', 'chopper-rear-fuselage', 'chopper-main-rotor', 'chopper-tail-rotor']),
    }),
    requiredAudio: Object.freeze(['chopper-low-loop', 'chopper-gun-report']),
    requiredWeaponFeedback: SUPPORT_WEAPON_FEEDBACK_CONTRACT,
  }),
  aircraft: Object.freeze({
    requiredNodes: Object.freeze(['care-aircraft-nose', 'care-aircraft-forward-socket', 'care-aircraft-cargo-socket']),
    careRequiredNodes: Object.freeze([
      'care-aircraft-fuselage', 'care-aircraft-main-wing', 'care-aircraft-cargo-bay',
      'care-aircraft-cargo-socket', 'care-aircraft-forward-socket',
    ]),
    carpetRequiredNodes: Object.freeze([
      'carpet-aircraft-fuselage', 'carpet-aircraft-main-wing', 'carpet-aircraft-bomb-bay',
      'carpet-aircraft-bomb-socket', 'carpet-aircraft-forward-socket',
    ]),
  }),
  careCrate: Object.freeze({
    requiredNodes: Object.freeze([
      'care-package-crate', 'care-package-straps', 'care-package-parachute',
      'care-parachute-lines', 'care-crate-landing-socket',
    ]),
  }),
} as const);

export function supportForwardAlignment(root: THREE.Object3D, fromName: string, toName: string): number | null {
  const from = root.getObjectByName(fromName);
  const to = root.getObjectByName(toName);
  if (!from || !to) return null;
  root.updateWorldMatrix(true, true);
  const origin = root.worldToLocal(from.getWorldPosition(new THREE.Vector3()));
  const target = root.worldToLocal(to.getWorldPosition(new THREE.Vector3()));
  const direction = target.sub(origin);
  if (direction.lengthSq() < 1e-8) return null;
  return direction.normalize().dot(new THREE.Vector3(...SUPPORT_FORWARD_AXIS));
}

export function missingSupportNodes(root: THREE.Object3D, required: readonly string[]): readonly string[] {
  return Object.freeze(required.filter((name) => root.getObjectByName(name) === undefined));
}
