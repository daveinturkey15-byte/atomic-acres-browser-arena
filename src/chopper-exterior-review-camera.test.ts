import { describe, expect, it } from 'vitest';
import {
  CHOPPER_EXTERIOR_REVIEW_CAMERA_CONTRACT,
  chopperExteriorReviewCameraPose,
  withExactChopperRootHiddenForControl,
  type ChopperExteriorReviewBounds,
  type ChopperExteriorReviewWorldAssessment,
} from './chopper-exterior-review-camera';

const initialBounds = Object.freeze({
  min: Object.freeze([72, 5, -8] as [number, number, number]),
  max: Object.freeze([78, 8, -4] as [number, number, number]),
}) satisfies ChopperExteriorReviewBounds;

const clearWorld = (): ChopperExteriorReviewWorldAssessment => Object.freeze({
  cameraColliderClear: true,
  cameraClearanceRadiusM: CHOPPER_EXTERIOR_REVIEW_CAMERA_CONTRACT.cameraColliderClearanceRadiusM,
  lineOfSightSampleCount: 9,
  clearLineOfSightSampleCount: 9,
});

describe('Chopper exterior review camera', () => {
  it('retains the fixed 60-degree authored-quarter fit contract', () => {
    expect(CHOPPER_EXTERIOR_REVIEW_CAMERA_CONTRACT).toMatchObject({
      quarterAngleRadians: Math.PI / 3,
      fovDegrees: 50,
      fitFraction: 0.55,
      minimumDistanceM: 5.5,
      fitPaddingM: 1.2,
      maximumDistanceM: 18,
      wallInsetM: 0.8,
      cameraColliderClearanceRadiusM: 0.4,
      minimumVerticalOffsetM: 0.55,
    });
  });

  it('tracks moving submitted-scene bounds instead of retaining a stale static camera', () => {
    const initial = chopperExteriorReviewCameraPose({
      drawableBounds: initialBounds,
      entityYaw: -1.2,
      aspect: 16 / 9,
      assessWorldCandidate: clearWorld,
    });
    expect(initial).not.toBeNull();
    const translation = [7, 0, 5] as const;
    const movedBounds = Object.freeze({
      min: Object.freeze(initialBounds.min.map((value, axis) => value + translation[axis]) as [number, number, number]),
      max: Object.freeze(initialBounds.max.map((value, axis) => value + translation[axis]) as [number, number, number]),
    });
    const tracked = chopperExteriorReviewCameraPose({
      drawableBounds: movedBounds,
      entityYaw: -1.2,
      aspect: 16 / 9,
      preferredSide: initial!.side,
      assessWorldCandidate: clearWorld,
    });
    expect(tracked).not.toBeNull();
    expect(tracked!.side).toBe(initial!.side);
    expect(tracked!.target.map((value, axis) => value - initial!.target[axis]!)).toEqual(translation);
    expect(tracked!.position.map((value, axis) => value - initial!.position[axis]!)).toEqual(translation);

    const staleDirection = movedBounds.min.map((_value, axis) => tracked!.target[axis]! - initial!.position[axis]!);
    const trackedDirection = tracked!.target.map((value, axis) => value - tracked!.position[axis]!);
    const staleLength = Math.hypot(...staleDirection);
    const trackedLength = Math.hypot(...trackedDirection);
    const directionDot = staleDirection.reduce((sum, value, axis) => (
      sum + (value / staleLength) * (trackedDirection[axis]! / trackedLength)
    ), 0);
    expect(directionDot).toBeLessThan(0.9);
  });

  it('is deterministic and does not mutate its authority-derived input', () => {
    const before = JSON.stringify(initialBounds);
    const first = chopperExteriorReviewCameraPose({
      drawableBounds: initialBounds, entityYaw: 0.4, aspect: 2, assessWorldCandidate: clearWorld,
    });
    const second = chopperExteriorReviewCameraPose({
      drawableBounds: initialBounds, entityYaw: 0.4, aspect: 2, assessWorldCandidate: clearWorld,
    });
    expect(second).toEqual(first);
    expect(JSON.stringify(initialBounds)).toBe(before);
  });

  it('fails closed for invalid bounds, aspect or attitude', () => {
    expect(chopperExteriorReviewCameraPose({
      drawableBounds: initialBounds, entityYaw: Number.NaN, aspect: 2, assessWorldCandidate: clearWorld,
    })).toBeNull();
    expect(chopperExteriorReviewCameraPose({
      drawableBounds: initialBounds, entityYaw: 0, aspect: 0, assessWorldCandidate: clearWorld,
    })).toBeNull();
    expect(chopperExteriorReviewCameraPose({
      drawableBounds: { min: [1, 1, 1], max: [0, 2, 2] },
      entityYaw: 0,
      aspect: 2,
      assessWorldCandidate: clearWorld,
    })).toBeNull();
  });

  it('falls back from an occluded preferred side to the opposite clear quarter', () => {
    let preferredSide: -1 | 1 | null = null;
    const initial = chopperExteriorReviewCameraPose({
      drawableBounds: initialBounds,
      entityYaw: -1.2,
      aspect: 16 / 9,
      assessWorldCandidate: clearWorld,
    });
    expect(initial).not.toBeNull();
    preferredSide = initial!.side;
    const assessedSides: Array<-1 | 1> = [];
    const fallback = chopperExteriorReviewCameraPose({
      drawableBounds: initialBounds,
      entityYaw: -1.2,
      aspect: 16 / 9,
      preferredSide,
      assessWorldCandidate: (candidate) => {
        assessedSides.push(candidate.side);
        return candidate.side === preferredSide
          ? { ...clearWorld(), clearLineOfSightSampleCount: 0 }
          : clearWorld();
      },
    });
    expect(assessedSides).toEqual([preferredSide, preferredSide === -1 ? 1 : -1]);
    expect(fallback?.side).toBe(preferredSide === -1 ? 1 : -1);
    expect(fallback?.world).toEqual(clearWorld());
  });

  it('fails closed when every active-world candidate is obstructed or the assessment throws', () => {
    expect(chopperExteriorReviewCameraPose({
      drawableBounds: initialBounds,
      entityYaw: 0.4,
      aspect: 2,
      assessWorldCandidate: () => ({
        ...clearWorld(),
        cameraColliderClear: false,
      }),
    })).toBeNull();
    expect(chopperExteriorReviewCameraPose({
      drawableBounds: initialBounds,
      entityYaw: 0.4,
      aspect: 2,
      assessWorldCandidate: () => { throw new Error('synthetic world query failure'); },
    })).toBeNull();
  });

  it('hides only for the paired control task and restores after success', async () => {
    const root = { visible: true };
    const captured = await withExactChopperRootHiddenForControl(root, async () => {
      expect(root.visible).toBe(false);
      return 'control-frame';
    });
    expect(captured).toBe('control-frame');
    expect(root.visible).toBe(true);
  });

  it('restores the exact root when control submission or draining fails', async () => {
    const root = { visible: true };
    await expect(withExactChopperRootHiddenForControl(root, async () => {
      expect(root.visible).toBe(false);
      throw new Error('synthetic control fence failure');
    })).rejects.toThrow('synthetic control fence failure');
    expect(root.visible).toBe(true);
    const alreadyHidden = { visible: false };
    await expect(withExactChopperRootHiddenForControl(alreadyHidden, async () => 'never'))
      .rejects.toThrow('exact visible reviewed root');
    expect(alreadyHidden.visible).toBe(false);
  });
});
