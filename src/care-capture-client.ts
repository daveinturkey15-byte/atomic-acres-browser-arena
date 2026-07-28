export type CareCaptureClientState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{
    status: 'pending';
    actorId: string;
    lifeId: number;
    crateId: string;
    sequence: number;
    requestedAtRevision: number;
  }>
  | Readonly<{
    status: 'acknowledged';
    actorId: string;
    lifeId: number;
    crateId: string;
    sequence: number;
    acknowledgedAtRevision: number;
  }>
  | Readonly<{
    status: 'release-requested';
    actorId: string;
    lifeId: number;
    crateId: string;
    captureSequence: number;
    releaseSequence: number;
    requestedAtRevision: number;
  }>;

export type CareCaptureClientTransition =
  | 'none'
  | 'requested'
  | 'acknowledged'
  | 'rejected'
  | 'release-requested'
  | 'released'
  | 'completed'
  | 'interrupted';

export type CareCaptureClientUpdate = Readonly<{
  state: CareCaptureClientState;
  transition: CareCaptureClientTransition;
}>;

export type CareCaptureResultProjection = Readonly<{
  forPlayerId: string;
  lifeId: number;
  sequence: number;
  crateId: string;
  holding: boolean;
  accepted: boolean;
  revision: number;
}>;

export type CareCaptureStateProjection = Readonly<{
  revision: number;
  cratePhase: string | null;
  captureActorId: string | null;
}>;

const IDLE: CareCaptureClientState = Object.freeze({ status: 'idle' });

function update(state: CareCaptureClientState, transition: CareCaptureClientTransition): CareCaptureClientUpdate {
  return Object.freeze({ state, transition });
}

export function createCareCaptureClientState(): CareCaptureClientState {
  return IDLE;
}

export function careCaptureCrateId(state: CareCaptureClientState): string | null {
  return state.status === 'idle' ? null : state.crateId;
}

export function requestCareCapture(
  state: CareCaptureClientState,
  input: Readonly<{
    actorId: string;
    lifeId: number;
    crateId: string;
    sequence: number;
    currentRevision: number;
  }>,
): CareCaptureClientUpdate {
  if (state.status !== 'idle' || input.actorId.length === 0 || input.crateId.length === 0
    || !Number.isSafeInteger(input.lifeId) || input.lifeId < 0
    || !Number.isSafeInteger(input.sequence) || input.sequence < 0
    || !Number.isSafeInteger(input.currentRevision) || input.currentRevision < 0) return update(state, 'none');
  return update(Object.freeze({
    status: 'pending',
    actorId: input.actorId,
    lifeId: input.lifeId,
    crateId: input.crateId,
    sequence: input.sequence,
    requestedAtRevision: input.currentRevision,
  }), 'requested');
}

export function requestCareCaptureRelease(
  state: CareCaptureClientState,
  releaseSequence: number,
  currentRevision: number,
): CareCaptureClientUpdate {
  if ((state.status !== 'pending' && state.status !== 'acknowledged')
    || !Number.isSafeInteger(releaseSequence) || releaseSequence < 0
    || !Number.isSafeInteger(currentRevision) || currentRevision < 0) return update(state, 'none');
  return update(Object.freeze({
    status: 'release-requested',
    actorId: state.actorId,
    lifeId: state.lifeId,
    crateId: state.crateId,
    captureSequence: state.sequence,
    releaseSequence,
    requestedAtRevision: currentRevision,
  }), 'release-requested');
}

/** Applies only a structurally and host-authority admitted result message. */
export function applyCareCaptureResult(
  state: CareCaptureClientState,
  result: CareCaptureResultProjection,
): CareCaptureClientUpdate {
  if (state.status === 'pending') {
    if (!result.holding || result.forPlayerId !== state.actorId || result.lifeId !== state.lifeId
      || result.crateId !== state.crateId || result.sequence !== state.sequence) return update(state, 'none');
    if (!result.accepted) return update(IDLE, 'rejected');
    return update(Object.freeze({
      status: 'acknowledged',
      actorId: state.actorId,
      lifeId: state.lifeId,
      crateId: state.crateId,
      sequence: state.sequence,
      acknowledgedAtRevision: result.revision,
    }), 'acknowledged');
  }
  if (state.status === 'release-requested') {
    if (result.holding || result.forPlayerId !== state.actorId || result.lifeId !== state.lifeId
      || result.crateId !== state.crateId || result.sequence !== state.releaseSequence) return update(state, 'none');
    // Release is locally complete even when the host reports that the crate had
    // already completed or another authority path interrupted it first.
    return update(IDLE, 'released');
  }
  return update(state, 'none');
}

/**
 * Reconciles presentation after an explicit begin/release result. Pending
 * claims never infer rejection from a generic snapshot: a state projection can
 * have been emitted before the host processed the correlated intent.
 */
export function applyCareCaptureProjection(
  state: CareCaptureClientState,
  projection: CareCaptureStateProjection,
): CareCaptureClientUpdate {
  if (state.status === 'idle' || state.status === 'pending') return update(state, 'none');
  const baseline = state.status === 'acknowledged' ? state.acknowledgedAtRevision : state.requestedAtRevision;
  if (!Number.isSafeInteger(projection.revision) || projection.revision <= baseline) return update(state, 'none');
  const stillCapturing = projection.cratePhase === 'capturing' && projection.captureActorId === state.actorId;
  if (stillCapturing) return update(state, 'none');
  if (state.status === 'release-requested') return update(IDLE, 'released');
  return update(IDLE, projection.cratePhase === null ? 'completed' : 'interrupted');
}
