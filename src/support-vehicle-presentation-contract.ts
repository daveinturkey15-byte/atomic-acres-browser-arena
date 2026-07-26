import * as THREE from 'three';
import { DRONE_GUN_PROFILE_ID, DRONE_PRESENTATION_FAMILY_ID } from './killstreak-support-catalog';
import { SUPPORT_FORWARD_AXIS } from './support-forward-axis';
export { SUPPORT_FORWARD_AXIS } from './support-forward-axis';

export const SUPPORT_VEHICLE_PRESENTATION_CONTRACT = Object.freeze({
  forwardAxis: SUPPORT_FORWARD_AXIS,
  drone: Object.freeze({
    visualFamilyId: DRONE_PRESENTATION_FAMILY_ID,
    gunProfileId: DRONE_GUN_PROFILE_ID,
    requiredNodes: Object.freeze([
      'drone-body', 'drone-optic', 'drone-mounted-gun', 'drone-gun-muzzle-socket',
      'drone-first-person-camera-socket', 'drone-rotors',
    ]),
    weaponFeedback: Object.freeze(['report', 'muzzle-flash', 'tracer', 'impact', 'owner-hit-confirm', 'owner-damage-number']),
  }),
  chopper: Object.freeze({
    requiredNodes: Object.freeze([
      'chopper-main-rotor', 'chopper-tail-rotor', 'chopper-player-gun', 'chopper-gun-muzzle-socket',
    ]),
    requiredAudio: Object.freeze(['chopper-low-loop', 'chopper-gun-report']),
    requiredWeaponFeedback: Object.freeze(['gun-recoil', 'muzzle-flash', 'tracer', 'impact']),
  }),
  aircraft: Object.freeze({
    requiredNodes: Object.freeze(['care-aircraft-nose', 'care-aircraft-forward-socket']),
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
