import { GUN_RANGE_TEST_BAY_CONTRACT, gunRangeTestBayRenderedDummyPose } from './gun-range-test-bay';
import {
  RIGGED_EVIDENCE_HAND_DRAW_ADMISSION_CONTRACT,
  RIGGED_EVIDENCE_MAIN_CAMERA_DRAW_CONTRACT,
  RIGGED_HAND_SELF_OCCLUSION_CONTRACT,
} from './rigged-evidence-occlusion';
import { RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS } from './operator-model';

export type RiggedEvidenceCamera = Readonly<{
  id: string;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  yaw: number;
  pitch: number;
  fov: number;
}>;

export type AtomicPlayerSettlementSample = Readonly<{
  presentedGameplayFrame: number;
  atMs: number;
  position: readonly number[];
  grounded: boolean;
}>;

export type AtomicPlayerConvergence = Readonly<{
  contract: string;
  positionAnchor: readonly number[];
  samples: readonly AtomicPlayerSettlementSample[];
  transitionCount: number;
  durationMs: number;
  maximumObservedAxisDeltaM: number;
  maximumObservedAxisSpanM: readonly [number, number, number];
  maximumObservedAbsoluteAxisErrorM: readonly [number, number, number];
  allGrounded: boolean;
}>;

type AtomicPlayerSettlementContract = Readonly<{
  contract: string;
  minimumObservedTransitions: number;
  minimumDurationMs: number;
  maximumAxisDeltaM: number;
  maximumAxisSpanM: number;
  maximumAbsoluteAxisErrorM: readonly [number, number, number];
  groundedRequired: boolean;
}>;

/**
 * Browser-evaluable convergence waiter. Keep every dependency inside this
 * function: Playwright serializes it into the inspected page rather than
 * executing it in the test runner.
 */
export function waitForAtomicPlayerConvergenceInPage({
  commandedFrame,
  positionAnchor,
  settlement,
}: Readonly<{
  commandedFrame: number;
  positionAnchor: readonly number[];
  settlement: AtomicPlayerSettlementContract;
}>): Promise<AtomicPlayerConvergence> {
  return new Promise<AtomicPlayerConvergence>((resolveConvergence, reject) => {
    const diagnosticRingCapacity = 16;
    const timeoutMs = 10_000;
    const startedAt = performance.now();
    let samples: AtomicPlayerSettlementSample[] = [];
    let callbackCount = 0;
    let acceptedSampleCount = 0;
    let longestAcceptedStreak = 0;
    let groundedObservationCount = 0;
    let firstObservedPresentedGameplayFrame: number | null = null;
    let lastObservedPresentedGameplayFrame: number | null = null;
    let firstAcceptedPresentedGameplayFrame: number | null = null;
    let lastAcceptedPresentedGameplayFrame: number | null = null;
    let minimumObservedY = Number.POSITIVE_INFINITY;
    let maximumObservedY = Number.NEGATIVE_INFINITY;
    let minimumAcceptedY = Number.POSITIVE_INFINITY;
    let maximumAcceptedY = Number.NEGATIVE_INFINITY;
    const minimumObservedAxisErrorM = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const maximumObservedAxisErrorM = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    const minimumAcceptedAxisErrorM = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const maximumAcceptedAxisErrorM = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    const reasonCounters: Record<string, number> = {};
    const recentRawObservations: Record<string, unknown>[] = [];
    const recentResetEvents: Record<string, unknown>[] = [];

    const finiteExactVector3 = (value: unknown): value is readonly [number, number, number] => (
      Array.isArray(value)
      && value.length === 3
      && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    );
    const finiteSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value);
    const sanitizeNumber = (value: number): number | string => {
      if (Number.isFinite(value)) return value;
      if (Number.isNaN(value)) return 'NaN';
      return value === Number.POSITIVE_INFINITY ? 'Infinity' : '-Infinity';
    };
    const sanitize = (value: unknown): unknown => {
      if (typeof value === 'number') return sanitizeNumber(value);
      if (Array.isArray(value)) return value.map(sanitize);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitize(entry)]));
      }
      return value;
    };
    const pushBounded = (ring: Record<string, unknown>[], entry: Record<string, unknown>) => {
      ring.push(entry);
      if (ring.length > diagnosticRingCapacity) ring.splice(0, ring.length - diagnosticRingCapacity);
    };
    const countReason = (reason: string) => {
      reasonCounters[reason] = (reasonCounters[reason] ?? 0) + 1;
    };
    const maximumAxisDelta = (
      left: readonly [number, number, number],
      right: readonly [number, number, number],
    ) => Math.max(
      Math.abs(left[0] - right[0]),
      Math.abs(left[1] - right[1]),
      Math.abs(left[2] - right[2]),
    );
    const withinNumericBoundary = (
      observed: number,
      limit: number,
      scaleValues: readonly number[],
    ) => observed <= limit + Number.EPSILON * 8 * Math.max(1, ...scaleValues.map(Math.abs));
    const meetsMinimumBoundary = (
      observed: number,
      minimum: number,
      scaleValues: readonly number[],
    ) => observed + Number.EPSILON * 8 * Math.max(1, ...scaleValues.map(Math.abs)) >= minimum;
    const axisSpan = (entries: readonly AtomicPlayerSettlementSample[]) => [0, 1, 2].map((axis) => {
      const values = entries.map((entry) => entry.position[axis]);
      return Math.max(...values) - Math.min(...values);
    }) as [number, number, number];
    const noteAccepted = (current: AtomicPlayerSettlementSample) => {
      acceptedSampleCount += 1;
      longestAcceptedStreak = Math.max(longestAcceptedStreak, samples.length);
      firstAcceptedPresentedGameplayFrame ??= current.presentedGameplayFrame;
      lastAcceptedPresentedGameplayFrame = current.presentedGameplayFrame;
      minimumAcceptedY = Math.min(minimumAcceptedY, current.position[1]);
      maximumAcceptedY = Math.max(maximumAcceptedY, current.position[1]);
      current.position.forEach((value, axis) => {
        const errorM = Math.abs(value - positionAnchor[axis]);
        minimumAcceptedAxisErrorM[axis] = Math.min(minimumAcceptedAxisErrorM[axis], errorM);
        maximumAcceptedAxisErrorM[axis] = Math.max(maximumAcceptedAxisErrorM[axis], errorM);
      });
    };
    const resetSamples = (
      reason: string,
      observation: Record<string, unknown>,
      replacement: AtomicPlayerSettlementSample[] = [],
    ) => {
      const priorStreakLength = samples.length;
      samples = replacement;
      countReason(reason);
      pushBounded(recentResetEvents, {
        callback: callbackCount,
        reason,
        priorStreakLength,
        replacementStreakLength: replacement.length,
        observation: sanitize(observation),
      });
      if (replacement.length === 1) noteAccepted(replacement[0]);
    };
    const finiteRange = (minimum: number, maximum: number) => (
      Number.isFinite(minimum) && Number.isFinite(maximum) ? { minimum, maximum } : null
    );
    const finiteAxisRanges = (minimum: number[], maximum: number[]) => minimum.map((value, axis) => (
      finiteRange(value, maximum[axis])
    ));
    const diagnosticPayload = (outcome: string, elapsedMs: number) => sanitize({
      outcome,
      contract: settlement?.contract,
      timeoutMs,
      elapsedMs,
      commandedFrame,
      positionAnchor,
      settlement,
      diagnosticRingCapacity,
      callbackCount,
      acceptedSampleCount,
      currentAcceptedStreak: samples.length,
      longestAcceptedStreak,
      groundedObservationCount,
      firstObservedPresentedGameplayFrame,
      lastObservedPresentedGameplayFrame,
      firstAcceptedPresentedGameplayFrame,
      lastAcceptedPresentedGameplayFrame,
      observedYRangeM: finiteRange(minimumObservedY, maximumObservedY),
      acceptedYRangeM: finiteRange(minimumAcceptedY, maximumAcceptedY),
      observedAbsoluteAxisErrorRangesM: finiteAxisRanges(minimumObservedAxisErrorM, maximumObservedAxisErrorM),
      acceptedAbsoluteAxisErrorRangesM: finiteAxisRanges(minimumAcceptedAxisErrorM, maximumAcceptedAxisErrorM),
      duplicatePresentedFrameDecision: 'ignore-without-reset-or-acceptance',
      reasonCounters,
      recentRawObservations,
      recentResetEvents,
    });
    const rejectWithDiagnostics = (message: string, outcome: string, elapsedMs: number) => {
      reject(new Error(`${message}: ${JSON.stringify(diagnosticPayload(outcome, elapsedMs))}`));
    };

    if (!finiteSafeInteger(commandedFrame)
      || commandedFrame < 0
      || !finiteExactVector3(positionAnchor)
      || !settlement
      || typeof settlement.contract !== 'string'
      || !finiteSafeInteger(settlement.minimumObservedTransitions)
      || settlement.minimumObservedTransitions < 1
      || !Number.isFinite(settlement.minimumDurationMs)
      || settlement.minimumDurationMs < 0
      || !Number.isFinite(settlement.maximumAxisDeltaM)
      || settlement.maximumAxisDeltaM < 0
      || !Number.isFinite(settlement.maximumAxisSpanM)
      || settlement.maximumAxisSpanM < 0
      || !finiteExactVector3(settlement.maximumAbsoluteAxisErrorM)
      || settlement.maximumAbsoluteAxisErrorM.some((value) => value < 0)
      || typeof settlement.groundedRequired !== 'boolean') {
      rejectWithDiagnostics('Atomic open-road convergence configuration is invalid', 'invalid-configuration', 0);
      return;
    }

    const sample = () => {
      callbackCount += 1;
      const observedAtMs = performance.now();
      let rawPresentedGameplayFrame: unknown;
      let rawPosition: unknown;
      let grounded = false;
      let snapshotError: unknown = null;
      try {
        const api = (window as any).__ATOMIC_ACRES_DEBUG__;
        const snapshot = api.snapshot();
        rawPresentedGameplayFrame = api.admissionState().presentedGameplayFrame;
        rawPosition = snapshot?.player?.position;
        grounded = snapshot?.player?.grounded === true;
      } catch (error) {
        snapshotError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      }

      const observation: Record<string, unknown> = {
        callback: callbackCount,
        atMs: sanitizeNumber(observedAtMs),
        presentedGameplayFrame: sanitize(rawPresentedGameplayFrame),
        position: sanitize(rawPosition),
        grounded,
        snapshotError,
        decision: 'pending',
        streakLengthBefore: samples.length,
      };
      if (grounded) groundedObservationCount += 1;
      if (finiteSafeInteger(rawPresentedGameplayFrame)) {
        firstObservedPresentedGameplayFrame ??= rawPresentedGameplayFrame;
        lastObservedPresentedGameplayFrame = rawPresentedGameplayFrame;
      }
      if (finiteExactVector3(rawPosition)) {
        minimumObservedY = Math.min(minimumObservedY, rawPosition[1]);
        maximumObservedY = Math.max(maximumObservedY, rawPosition[1]);
        rawPosition.forEach((value, axis) => {
          const errorM = Math.abs(value - positionAnchor[axis]);
          minimumObservedAxisErrorM[axis] = Math.min(minimumObservedAxisErrorM[axis], errorM);
          maximumObservedAxisErrorM[axis] = Math.max(maximumObservedAxisErrorM[axis], errorM);
        });
      }

      const previous = samples.at(-1);
      let current: AtomicPlayerSettlementSample | null = null;
      if (!Number.isFinite(observedAtMs) || observedAtMs < 0) {
        observation.decision = 'reset-invalid-observation-time';
        resetSamples('invalid-observation-time', observation);
      } else if (snapshotError !== null) {
        observation.decision = 'reset-snapshot-error';
        resetSamples('snapshot-error', observation);
      } else if (!finiteSafeInteger(rawPresentedGameplayFrame) || rawPresentedGameplayFrame < 0) {
        observation.decision = 'reset-invalid-presented-frame';
        resetSamples('invalid-presented-frame', observation);
      } else if (!finiteExactVector3(rawPosition)) {
        observation.decision = 'reset-invalid-position-vector';
        resetSamples('invalid-position-vector', observation);
      } else {
        current = {
          presentedGameplayFrame: rawPresentedGameplayFrame,
          atMs: observedAtMs,
          position: [...rawPosition],
          grounded,
        };
        const currentAbsoluteAxisErrorM = rawPosition.map((value, axis) => (
          Math.abs(value - positionAnchor[axis])
        )) as [number, number, number];
        observation.absoluteAxisErrorsM = currentAbsoluteAxisErrorM;
        if (current.presentedGameplayFrame <= commandedFrame) {
          observation.decision = 'reset-pre-command-frame';
          resetSamples('pre-command-frame', observation);
        } else if (!current.grounded) {
          observation.decision = 'reset-not-grounded';
          resetSamples('not-grounded', observation);
        } else if (currentAbsoluteAxisErrorM.some((errorM, axis) => (
          !withinNumericBoundary(
            errorM,
            settlement.maximumAbsoluteAxisErrorM[axis],
            [rawPosition[axis], positionAnchor[axis]],
          )
        ))) {
          observation.decision = 'reset-outside-axis-envelope';
          resetSamples('outside-axis-envelope', observation);
        } else if (!previous) {
          samples = [current];
          observation.decision = 'accept-first-sample';
          countReason('accepted-first-sample');
          noteAccepted(current);
        } else if (current.presentedGameplayFrame === previous.presentedGameplayFrame) {
          observation.decision = 'ignore-duplicate-presented-frame';
          countReason('duplicate-presented-frame-ignored');
        } else if (current.presentedGameplayFrame < previous.presentedGameplayFrame) {
          observation.decision = 'reset-reversed-presented-frame';
          resetSamples('reversed-presented-frame', observation, [current]);
        } else {
          const axisDeltaM = maximumAxisDelta(current.position as readonly [number, number, number], previous.position as readonly [number, number, number]);
          observation.maximumAxisDeltaM = axisDeltaM;
          if (!withinNumericBoundary(
            axisDeltaM,
            settlement.maximumAxisDeltaM,
            [...current.position, ...previous.position],
          )) {
            observation.decision = 'reset-transition-axis-delta';
            resetSamples('transition-axis-delta', observation, [current]);
          } else {
            const prospectiveAxisSpanM = axisSpan([...samples, current]);
            observation.prospectiveAxisSpanM = prospectiveAxisSpanM;
            if (prospectiveAxisSpanM.some((spanM, axis) => !withinNumericBoundary(
              spanM,
              settlement.maximumAxisSpanM,
              [...samples.map((entry) => entry.position[axis]), current!.position[axis]],
            ))) {
              observation.decision = 'reset-accepted-window-axis-span';
              resetSamples('accepted-window-axis-span', observation, [current]);
            } else {
              samples.push(current);
              observation.decision = 'accept-transition';
              countReason('accepted-transition');
              noteAccepted(current);
            }
          }
        }
      }
      observation.streakLengthAfter = samples.length;
      pushBounded(recentRawObservations, sanitize(observation) as Record<string, unknown>);

      if (samples.length >= settlement.minimumObservedTransitions + 1) {
        const durationMs = samples.at(-1)!.atMs - samples[0].atMs;
        const maximumObservedAxisDeltaM = Math.max(...samples.slice(1).map((entry, index) => (
          maximumAxisDelta(
            entry.position as readonly [number, number, number],
            samples[index].position as readonly [number, number, number],
          )
        )));
        const maximumObservedAbsoluteAxisErrorM = [0, 1, 2].map((axis) => Math.max(
          ...samples.map((entry) => Math.abs(entry.position[axis] - positionAnchor[axis])),
        )) as [number, number, number];
        const maximumObservedAxisSpanM = axisSpan(samples);
        const allGrounded = samples.every((entry) => entry.grounded);
        if (meetsMinimumBoundary(durationMs, settlement.minimumDurationMs, [samples[0].atMs, samples.at(-1)!.atMs])
          && withinNumericBoundary(
            maximumObservedAxisDeltaM,
            settlement.maximumAxisDeltaM,
            samples.flatMap((entry) => entry.position),
          )
          && maximumObservedAxisSpanM.every((spanM, axis) => withinNumericBoundary(
            spanM,
            settlement.maximumAxisSpanM,
            samples.map((entry) => entry.position[axis]),
          ))
          && maximumObservedAbsoluteAxisErrorM.every((errorM, axis) => (
            withinNumericBoundary(
              errorM,
              settlement.maximumAbsoluteAxisErrorM[axis],
              [...samples.map((entry) => entry.position[axis]), positionAnchor[axis]],
            )
          ))
          && (!settlement.groundedRequired || allGrounded)) {
          countReason('converged');
          resolveConvergence({
            contract: settlement.contract,
            positionAnchor,
            samples,
            transitionCount: samples.length - 1,
            durationMs,
            maximumObservedAxisDeltaM,
            maximumObservedAxisSpanM,
            maximumObservedAbsoluteAxisErrorM,
            allGrounded,
          });
          return;
        }
        if (!meetsMinimumBoundary(
          durationMs, settlement.minimumDurationMs, [samples[0].atMs, samples.at(-1)!.atMs],
        )) countReason('candidate-window-too-short');
      }
      const elapsedMs = performance.now() - startedAt;
      if (elapsedMs > timeoutMs) {
        rejectWithDiagnostics(
          'Atomic open-road player did not reach the fixed grounded convergence contract',
          'timeout',
          elapsedMs,
        );
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

const lookAtCamera = (
  id: string,
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  fov: number,
): RiggedEvidenceCamera => {
  const dx = target[0] - position[0];
  const dy = target[1] - position[1];
  const dz = target[2] - position[2];
  const rawYaw = Math.atan2(-dx, -dz);
  return Object.freeze({
    id,
    position: Object.freeze([...position]) as readonly [number, number, number],
    target: Object.freeze([...target]) as readonly [number, number, number],
    yaw: Object.is(rawYaw, -Math.PI) ? Math.PI : rawYaw,
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
    fov,
  });
};

const ATOMIC_COMMANDED_PLAYER_POSITION = Object.freeze([-3, 1.7, 27] as const);
const ATOMIC_BOT_POSITION = Object.freeze([2.2, 0, 27] as const);
const ATOMIC_TARGET = Object.freeze([2.2, 1.08, 27] as const);

const fixedDummyActors = Object.freeze(GUN_RANGE_TEST_BAY_CONTRACT.dummies.map((definition, index) => {
  const pose = gunRangeTestBayRenderedDummyPose(definition, index, 0);
  return Object.freeze({
    id: definition.id,
    position: Object.freeze([pose.position.x, pose.position.y, pose.position.z] as const),
    yaw: pose.yawRadians,
  });
}));

const fixedDummyCameras = Object.freeze(fixedDummyActors.map((actor) => {
  const forwardX = -Math.sin(actor.yaw);
  const forwardZ = -Math.cos(actor.yaw);
  const position = Object.freeze([
    actor.position[0] + forwardX * 2.1,
    1.08,
    actor.position[2] + forwardZ * 2.1,
  ] as const);
  const target = Object.freeze([actor.position[0], 1.08, actor.position[2]] as const);
  return Object.freeze({
    actor,
    camera: lookAtCamera(`${actor.id}-fixed-front-close`, position, target, 58),
  });
}));

/**
 * Fixed QA evidence fixtures. These values deliberately do not auto-fit live
 * geometry: authored layout drift must fail the LOS/framing gate and require a
 * reviewed contract update.
 */
export const RIGGED_BOT_EXPECTED_SKINNED_MESH_NAMES = Object.freeze([
  'Cube018',
  'Cube018_1',
  'Cube018_2',
  'Swat_Feet',
  'Cube037',
  'Cube037_1',
  'Cube037_2',
  'Cube023',
  'Cube023_1',
] as const);

export const RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT = Object.freeze({
  schemaVersion: 8,
  contract: 'pass69-3-fixed-rigged-actor-los-fixtures-v8',
  los: Object.freeze({
    contract: 'actual-render-world-layout-occluder-multi-sentinel-los-v2',
    actorSelfOcclusionExcluded: true,
    sentinels: Object.freeze(['head', 'shoulder-left', 'shoulder-right', 'pelvis', 'wrist-left', 'wrist-right'] as const),
  }),
  handSelfOcclusion: RIGGED_HAND_SELF_OCCLUSION_CONTRACT,
  presentation: Object.freeze({
    contract: 'capture-camera-committed-frame-v2',
    order: 'pause-final-submission-await-completion-then-compositor-v1',
    compositorBoundariesAfterCommit: 2,
    mainCameraDraw: Object.freeze({
      contract: RIGGED_EVIDENCE_MAIN_CAMERA_DRAW_CONTRACT,
      pixelProof: false,
      expectedSkinnedMeshCount: RIGGED_BOT_EXPECTED_SKINNED_MESH_NAMES.length,
      expectedSkinnedMeshNames: RIGGED_BOT_EXPECTED_SKINNED_MESH_NAMES,
    }),
    handDrawAdmission: Object.freeze({
      contract: RIGGED_EVIDENCE_HAND_DRAW_ADMISSION_CONTRACT,
      pixelProof: false,
      scope: 'hand',
      influenceContract: 'rendered-joints0-weights0-influence-v2',
      thresholds: RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS,
      expectedBoneCount: 6,
      terminalSurfaceRequired: true,
    }),
    productionRgbRasterProof: Object.freeze({
      contract: 'gun-range-dummy-production-rgb-raster-proof-v1',
      principalWriteControl: 'rigged-principal-write-control-v1',
      rasterRoi: 'rigged-live-deformed-raster-roi-v1',
      modes: Object.freeze(['visible-observe', 'principal-write-suppressed', 'visible-restored'] as const),
      pngModes: Object.freeze(['principal-write-suppressed', 'visible-restored'] as const),
      viewport: Object.freeze({ width: 1_600, height: 900, devicePixelRatio: 1 }),
      changedPixelDefinition: 'any-rgb-byte-differs',
      insideMinimumChangedPixels: 1,
      outsideMaximumChangedPixels: 0,
      alphaMustMatch: true,
      roiPaddingPixels: 0,
      ownerAcceptance: 'PENDING_OWNER_INSPECTION',
    }),
    rendererCompletion: Object.freeze({
      webgl2: 'synchronous-render-return',
      webgpu: 'submission-sequence-covered-by-completion-frontier',
    }),
  }),
  atomic: Object.freeze({
    id: 'atomic-south-road-crosslane-spawn-fixed-v4',
    commandedPlayerPosition: ATOMIC_COMMANDED_PLAYER_POSITION,
    settlementPositionAnchor: ATOMIC_COMMANDED_PLAYER_POSITION,
    playerYaw: -Math.PI / 2,
    settlement: Object.freeze({
      contract: 'grounded-distinct-presented-frame-axis-envelope-convergence-v3',
      minimumObservedTransitions: 8,
      minimumDurationMs: 50,
      maximumAxisDeltaM: 0.0005,
      maximumAxisSpanM: 0.0005,
      maximumAbsoluteAxisErrorM: Object.freeze([0.0005, 0.00225, 0.0005] as const),
      groundedRequired: true,
    }),
    botDistanceM: 5.2,
    nominalBotPosition: ATOMIC_BOT_POSITION,
    expectedBotYaw: Math.PI / 2,
    placement: Object.freeze({
      contract: 'debug-place-bot-ahead-synchronous-transaction-v1',
      source: '__ATOMIC_ACRES_DEBUG__.placeBotAhead',
      distanceM: 5.2,
      rootY: 0,
      requiredYawOffsetRadians: 0,
      arithmeticEpsilonM: 1e-9,
      nominalPositionEnvelopeM: Object.freeze([0.0005, 0, 0.0005] as const),
    }),
    mediumCamera: lookAtCamera('atomic-south-road-crosslane-medium-v2', [-2.2, 1.08, 27], ATOMIC_TARGET, 58),
    closeCamera: lookAtCamera('atomic-south-road-crosslane-close-v2', [0.2, 1.08, 27], ATOMIC_TARGET, 58),
  }),
  gunRange: Object.freeze({
    id: 'gun-range-open-bay-fixed-v1',
    fixedVisualTimeMs: 0,
    overviewCamera: lookAtCamera('gun-range-dummies-north-overview', [90, 4.5, -23], [70, 1.15, -1], 58),
    dummies: fixedDummyCameras,
  }),
});

export function fixedGunRangeDummyFixtureMatchesAuthoredMotion(): boolean {
  return RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.gunRange.dummies.every(({ actor }, index) => {
    const definition = GUN_RANGE_TEST_BAY_CONTRACT.dummies[index];
    const pose = gunRangeTestBayRenderedDummyPose(
      definition,
      index,
      RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.gunRange.fixedVisualTimeMs,
    );
    return actor.id === definition.id
      && Math.abs(actor.position[0] - pose.position.x) <= 1e-9
      && Math.abs(actor.position[1] - pose.position.y) <= 1e-9
      && Math.abs(actor.position[2] - pose.position.z) <= 1e-9
      && Math.abs(actor.yaw - pose.yawRadians) <= 1e-9;
  });
}
