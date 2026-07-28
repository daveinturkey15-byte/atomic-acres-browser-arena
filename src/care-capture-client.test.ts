import { describe, expect, it } from 'vitest';
import {
  applyCareCaptureProjection,
  applyCareCaptureResult,
  careCaptureCrateId,
  createCareCaptureClientState,
  requestCareCapture,
  requestCareCaptureRelease,
} from './care-capture-client';

const begin = () => requestCareCapture(createCareCaptureClientState(), {
  actorId: 'guest', lifeId: 4, crateId: 'ks-7-care-1', sequence: 11, currentRevision: 30,
}).state;

describe('care capture client authority state', () => {
  it('keeps a pending F claim through equal, older, and newer unrelated landed projections', () => {
    const pending = begin();
    expect(pending.status).toBe('pending');
    for (const revision of [29, 30, 31]) {
      const reconciled = applyCareCaptureProjection(pending, {
        revision, cratePhase: 'landed', captureActorId: null,
      });
      expect(reconciled).toEqual({ state: pending, transition: 'none' });
    }
    expect(careCaptureCrateId(pending)).toBe('ks-7-care-1');
  });

  it('requires the correlated host result before acknowledging or rejecting a claim', () => {
    const pending = begin();
    expect(applyCareCaptureResult(pending, {
      forPlayerId: 'guest', lifeId: 4, crateId: 'ks-7-care-1', sequence: 10,
      holding: true, accepted: true, revision: 31,
    })).toEqual({ state: pending, transition: 'none' });
    const acknowledged = applyCareCaptureResult(pending, {
      forPlayerId: 'guest', lifeId: 4, crateId: 'ks-7-care-1', sequence: 11,
      holding: true, accepted: true, revision: 32,
    });
    expect(acknowledged).toMatchObject({ transition: 'acknowledged', state: { status: 'acknowledged', acknowledgedAtRevision: 32 } });
    expect(applyCareCaptureResult(begin(), {
      forPlayerId: 'guest', lifeId: 4, crateId: 'ks-7-care-1', sequence: 11,
      holding: true, accepted: false, revision: 32,
    })).toEqual({ state: { status: 'idle' }, transition: 'rejected' });
  });

  it('retains the crate through key-up until the correlated release result or projection', () => {
    const pending = begin();
    const releasing = requestCareCaptureRelease(pending, 12, 31);
    expect(releasing).toMatchObject({ transition: 'release-requested', state: { status: 'release-requested', releaseSequence: 12 } });
    expect(careCaptureCrateId(releasing.state)).toBe('ks-7-care-1');
    expect(applyCareCaptureResult(releasing.state, {
      forPlayerId: 'guest', lifeId: 4, crateId: 'ks-7-care-1', sequence: 11,
      holding: true, accepted: true, revision: 32,
    })).toEqual({ state: releasing.state, transition: 'none' });
    expect(applyCareCaptureResult(releasing.state, {
      forPlayerId: 'guest', lifeId: 4, crateId: 'ks-7-care-1', sequence: 12,
      holding: false, accepted: false, revision: 33,
    })).toEqual({ state: { status: 'idle' }, transition: 'released' });
  });

  it('uses actor-correlated snapshots to distinguish continued capture, interruption, and completion', () => {
    const acknowledged = applyCareCaptureResult(begin(), {
      forPlayerId: 'guest', lifeId: 4, crateId: 'ks-7-care-1', sequence: 11,
      holding: true, accepted: true, revision: 32,
    }).state;
    expect(applyCareCaptureProjection(acknowledged, {
      revision: 33, cratePhase: 'capturing', captureActorId: 'guest',
    })).toEqual({ state: acknowledged, transition: 'none' });
    expect(applyCareCaptureProjection(acknowledged, {
      revision: 33, cratePhase: 'capturing', captureActorId: 'rival',
    }).transition).toBe('interrupted');
    expect(applyCareCaptureProjection(acknowledged, {
      revision: 33, cratePhase: null, captureActorId: null,
    }).transition).toBe('completed');
  });
});
