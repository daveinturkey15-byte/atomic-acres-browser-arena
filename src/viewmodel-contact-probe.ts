import * as THREE from 'three';
import { segmentBoxHitTime, type Box2, type Point3 } from './collision';
import {
  VIEWMODEL_CONTACT_PROBE_OFFSETS,
  viewmodelContactProbePaddingMeters,
  type ViewmodelContactProfile,
} from './weapon-presentation-state';

export const VIEWMODEL_CONTACT_PROBE_CONTRACT = 'retained-splayed-real-collider-envelope-v1';

export type ViewmodelContactProbeSample = Readonly<{
  contract: typeof VIEWMODEL_CONTACT_PROBE_CONTRACT;
  nearestForwardSurfaceMeters: number | null;
  floorSurfaceMeters: number | null;
  probesTested: number;
  saturated: boolean;
}>;

const FLOOR_PROBE_LENGTH_METERS = 1.05;
const FLOOR_PROBE_PADDING_METERS = 0.035;

function nearestSegmentHitTime(
  start: Point3,
  end: Point3,
  colliders: readonly Box2[],
  paddingMeters: number,
): number | null {
  let nearest: number | null = null;
  for (const collider of colliders) {
    const hitTime = segmentBoxHitTime(start, end, collider, paddingMeters);
    if (hitTime !== null && (nearest === null || hitTime < nearest)) nearest = hitTime;
  }
  return nearest;
}

/**
 * Presentation-only retained sweep over the authoritative arena colliders.
 *
 * The inner endpoints follow the held weapon while the far endpoints expand
 * to the complete weapon/hand/sleeve envelope. This catches an oblique return
 * or doorjamb beside the camera-forward ray without traversing the collider
 * catalog more often than the previous nine-ray lattice. Results and vector
 * scratch are retained, so callers must consume the returned sample before the
 * next call.
 */
export class ViewmodelContactProbe {
  private readonly direction = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly start = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly rotation = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly result: {
    contract: typeof VIEWMODEL_CONTACT_PROBE_CONTRACT;
    nearestForwardSurfaceMeters: number | null;
    floorSurfaceMeters: number | null;
    probesTested: number;
    saturated: boolean;
  } = {
    contract: VIEWMODEL_CONTACT_PROBE_CONTRACT,
    nearestForwardSurfaceMeters: null,
    floorSurfaceMeters: null,
    probesTested: 0,
    saturated: false,
  };

  sample(
    origin: Point3,
    pitchRadians: number,
    yawRadians: number,
    colliders: readonly Box2[],
    profile: ViewmodelContactProfile,
  ): ViewmodelContactProbeSample {
    this.rotation.set(pitchRadians, yawRadians, 0, 'YXZ');
    this.direction.set(0, 0, -1).applyEuler(this.rotation).normalize();
    this.right.set(1, 0, 0).applyEuler(this.rotation).normalize();
    this.up.set(0, 1, 0).applyEuler(this.rotation).normalize();

    const paddingMeters = viewmodelContactProbePaddingMeters(profile);
    let nearestForward: number | null = null;
    let probesTested = 0;
    for (const offset of VIEWMODEL_CONTACT_PROBE_OFFSETS) {
      const innerRight = offset.rightScale * profile.probeHalfWidthMeters;
      const outerRight = offset.rightScale * profile.envelopeHalfWidthMeters;
      const innerVertical = offset.vertical === 'upper'
        ? profile.probeUpperOffsetMeters
        : offset.vertical === 'lower'
          ? -profile.probeLowerOffsetMeters
          : offset.rightScale === 0 ? 0 : 0.04;
      const outerVertical = offset.vertical === 'upper'
        ? profile.envelopeUpperOffsetMeters
        : offset.vertical === 'lower'
          ? -profile.envelopeLowerOffsetMeters
          : innerVertical;

      this.start.set(origin.x, origin.y, origin.z)
        .addScaledVector(this.right, innerRight)
        .addScaledVector(this.up, innerVertical);
      this.end.copy(this.start)
        .addScaledVector(this.direction, profile.probeLengthMeters)
        .addScaledVector(this.right, outerRight - innerRight)
        .addScaledVector(this.up, outerVertical - innerVertical);
      probesTested += 1;
      const hitTime = nearestSegmentHitTime(this.start, this.end, colliders, paddingMeters);
      if (hitTime === null) continue;
      // Response distance is camera-forward progress, not the longer diagonal
      // sweep length; this keeps tuning stable while the probe fans outward.
      const forwardDistanceMeters = hitTime * profile.probeLengthMeters;
      nearestForward = nearestForward === null
        ? forwardDistanceMeters
        : Math.min(nearestForward, forwardDistanceMeters);
      if (nearestForward <= profile.fullStowDistanceMeters) break;
    }

    this.start.set(origin.x, origin.y, origin.z);
    this.end.copy(this.start);
    this.end.y -= FLOOR_PROBE_LENGTH_METERS;
    const floorHitTime = nearestSegmentHitTime(
      this.start,
      this.end,
      colliders,
      FLOOR_PROBE_PADDING_METERS,
    );

    this.result.nearestForwardSurfaceMeters = nearestForward;
    this.result.floorSurfaceMeters = floorHitTime === null
      ? null
      : floorHitTime * FLOOR_PROBE_LENGTH_METERS;
    this.result.probesTested = probesTested;
    this.result.saturated = nearestForward !== null
      && nearestForward <= profile.fullStowDistanceMeters;
    return this.result;
  }
}
