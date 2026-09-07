import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildArena } from './map';
import { Box2, firstSegmentBoxHit } from './collision';
import {
  VIEWMODEL_CONTACT_PROBE_OFFSETS,
  VIEWMODEL_CONTACT_PROFILES,
  viewmodelContactProbePaddingMeters,
  viewmodelFireAdmission,
  viewmodelObstructionPose,
} from './weapon-presentation-state';

/**
 * HF-343 mechanical reproduction ("sometimes randomly can't shoot").
 *
 * The live trigger gate in legacy-main.ts tryFire() refuses every shot while
 * `viewmodelFireAdmission(...).fireBlocked`. The owner-visible defect is that
 * the gate fires in OPEN SPACE at match spawn on atomic-acres (host blocked
 * 3/3), which reads to the player as a randomly dead trigger.
 *
 * This spec runs the EXACT production probe lattice (nine padded segment
 * casts from the eye, same padding function, same admission call) against the
 * REAL atomic-acres collider set, at each authored spawn, facing map centre —
 * the exact pose respawn() produces (`player.yaw = operatorYawToward(pos,
 * {x:0,z:0})`, pitch 0, stance stand). It pins NEW behaviour at equal or
 * greater strictness than today's code: spawns must admit fire in open space.
 * Proven RED against the pre-fix gate (blocked-at-spawn reproduced here)
 * before any threshold change; do not weaken it to green — fix the policy.
 */

const EYE_HEIGHT_METERS = 1.7;

function yawTowardCentre(x: number, z: number): number {
  // Mirrors operatorYawToward: forward = (-sin(yaw), 0, -cos(yaw)) must point
  // from (x, z) at the map centre (0, 0).
  return Math.atan2(-x, -z);
}

function nearestForwardProbeMeters(
  position: THREE.Vector3,
  yaw: number,
  pitch: number,
  weapon: keyof typeof VIEWMODEL_CONTACT_PROFILES,
  colliders: readonly Box2[],
): { nearestForwardMeters: number | null; probeHits: Record<string, number> } {
  const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
  const rotation = new THREE.Euler(pitch, yaw, 0, 'YXZ');
  const direction = new THREE.Vector3(0, 0, -1).applyEuler(rotation).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyEuler(rotation).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyEuler(rotation).normalize();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const padding = viewmodelContactProbePaddingMeters(profile);
  let nearestForwardMeters: number | null = null;
  const probeHits: Record<string, number> = {};
  for (const offset of VIEWMODEL_CONTACT_PROBE_OFFSETS) {
    const verticalOffset = offset.vertical === 'upper'
      ? profile.probeUpperOffsetMeters
      : offset.vertical === 'lower' ? -profile.probeLowerOffsetMeters : offset.rightScale === 0 ? 0 : 0.04;
    start.copy(position)
      .addScaledVector(right, offset.rightScale * profile.probeHalfWidthMeters)
      .addScaledVector(up, verticalOffset);
    end.copy(start).addScaledVector(direction, profile.probeLengthMeters);
    const hit = firstSegmentBoxHit(start, end, colliders, padding);
    if (!hit) continue;
    const distance = hit.time * profile.probeLengthMeters;
    const key = `${offset.rightScale}/${offset.vertical}`;
    probeHits[key] = Math.round(distance * 1000) / 1000;
    nearestForwardMeters = nearestForwardMeters === null ? distance : Math.min(nearestForwardMeters, distance);
  }
  return { nearestForwardMeters, probeHits };
}

describe('HF-343 fire admission at atomic-acres spawns', () => {
  const scene = new THREE.Scene();
  const arena = buildArena(scene);

  it('admits fire in open space at every authored spawn facing map centre', () => {
    const failures: string[] = [];
    for (const team of [0, 1] as const) {
      arena.spawns[team].forEach((spawn, index) => {
        for (const weapon of Object.keys(VIEWMODEL_CONTACT_PROFILES) as Array<keyof typeof VIEWMODEL_CONTACT_PROFILES>) {
          const yaw = yawTowardCentre(spawn.x, spawn.z);
          const eye = new THREE.Vector3(spawn.x, EYE_HEIGHT_METERS, spawn.z);
          const { nearestForwardMeters, probeHits } = nearestForwardProbeMeters(eye, yaw, 0, weapon, arena.colliders);
          const pose = viewmodelObstructionPose(nearestForwardMeters, false, null, weapon);
          const admission = viewmodelFireAdmission(weapon, pose.retreat, 0, false, 0);
          if (admission.fireBlocked) {
            failures.push(
              `team ${team} spawn ${index} (${spawn.x.toFixed(1)}, ${spawn.z.toFixed(1)}) weapon ${weapon}: `
              + `${admission.blockReason}, nearestForward=${nearestForwardMeters?.toFixed(3)} m, probes=${JSON.stringify(probeHits)}`,
            );
          }
        }
      });
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('still blocks when genuinely stowed against cover (gate keeps its purpose)', () => {
    // A wall 30 cm in front of the eye must refuse the shot — the owner asked
    // for a balance, not removal of the near-cover raise gate.
    const wall = [{ minX: -1, maxX: 1, minZ: -2, maxZ: -0.35, minY: 0, maxY: 3 }];
    const eye = new THREE.Vector3(0, EYE_HEIGHT_METERS, 0);
    for (const weapon of Object.keys(VIEWMODEL_CONTACT_PROFILES) as Array<keyof typeof VIEWMODEL_CONTACT_PROFILES>) {
      const { nearestForwardMeters } = nearestForwardProbeMeters(eye, 0, 0, weapon, wall);
      const pose = viewmodelObstructionPose(nearestForwardMeters, false, null, weapon);
      const admission = viewmodelFireAdmission(weapon, pose.retreat, 0, false, 0);
      expect(admission.fireBlocked, weapon).toBe(true);
      expect(admission.blockReason, weapon).toBe('full-stow');
    }
  });
});
