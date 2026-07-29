import { gateSemanticDetections } from './semantic-detector.mjs';
import { createSingleTargetTracker } from './single-target-tracker.mjs';
import { createVisualServoController } from './visual-servo.mjs';
import { createFreshFrameFireGate } from './fresh-frame-fire-gate.mjs';

export function createOneVOneController(profile, options = {}) {
  const tracker = createSingleTargetTracker(profile.tracker, profile.detector.thresholds);
  const servo = createVisualServoController(profile.servo);
  const fireGate = createFreshFrameFireGate(profile);
  let lastAimCorrectionFrame = 0;
  let reassociationRequired = false;
  let lastShotTrackId = null;
  let finishLatch = null;

  function step(observation) {
    const frame = observation.frame;
    if (observation.commandReceipt?.sourceFrameSequence) lastAimCorrectionFrame = observation.commandReceipt.sourceFrameSequence;
    const semantic = gateSemanticDetections(observation.detections ?? [], frame, profile, options);
    const track = tracker.update(semantic.accepted, frame, { commandReceipt: observation.commandReceipt });
    if (reassociationRequired && track.state === 'CONFIRMED' && track.measurementFresh && track.trackId === lastShotTrackId && track.lastMeasurementSequence === frame.sequence) reassociationRequired = false;
    if (observation.effectEvidence?.source === 'rendered-visible-cue' && track.state === 'CONFIRMED' && observation.effectEvidence.trackId === track.trackId) {
      finishLatch = { trackId: track.trackId, untilMs: frame.capturedAtMs + profile.fire.finishWindowMs, followups: 0 };
    }
    if (finishLatch && (frame.capturedAtMs > finishLatch.untilMs || (track.trackId && track.trackId !== finishLatch.trackId))) finishLatch = null;
    const aim = track.trackId ? servo.update(track, frame) : servo.update(null, frame);
    const fire = fireGate.evaluate({ track, servo: aim, frame, lastAimCorrectionFrame, nowMs: frame.capturedAtMs, reassociationRequired });
    if (fire.fireAuthorized) {
      reassociationRequired = true; lastShotTrackId = track.trackId;
      if (finishLatch?.trackId === track.trackId) finishLatch.followups += 1;
    }
    const inputIssued = false;
    const detectionConfidence = semantic.accepted[0]?.confidence ?? semantic.rejected[0]?.confidence ?? null;
    const detectionDisposition = semantic.accepted.length ? 'accepted' : semantic.rejected[0]?.reason ?? 'none';
    const telemetry = {
      frameSequence: frame.sequence,
      frameCapturedAtMs: frame.capturedAtMs,
      detectorProvider: semantic.provider,
      detectionConfidence,
      detectionDisposition,
      trackId: track.trackId,
      trackState: track.state,
      associationCost: track.association.cost,
      measurementAgeMs: track.measurementAgeMs,
      predictionAgeMs: track.predictionAgeMs,
      uncertainty: track.uncertainty,
      aimPhase: aim.phase,
      aimErrorX: aim.errorX,
      aimErrorY: aim.errorY,
      mouseCommandX: aim.mouseX,
      mouseCommandY: aim.mouseY,
      alignedFreshFrameCount: fire.alignedFreshFrames,
      fireCandidate: fire.fireCandidate,
      fireAuthorized: fire.fireAuthorized,
      fireGateReason: fire.reason,
      reassociationRequired,
      finishLatchActive: Boolean(finishLatch),
    };
    return {
      semantic, track, aim, fire, telemetry, inputIssued,
      intent: { movement: track.state === 'SEARCH' || track.state === 'LOST' ? 'SEARCH' : track.state === 'COASTING' ? 'PURSUE-PREDICTION-NO-FIRE' : 'TRACK-AND-AIM', mouseX: aim.mouseX, mouseY: aim.mouseY, fire: false },
    };
  }

  return { step };
}
