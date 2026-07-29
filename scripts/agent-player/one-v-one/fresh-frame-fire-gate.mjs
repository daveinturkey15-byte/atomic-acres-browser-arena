export function createFreshFrameFireGate(profile) {
  let alignmentTrackId = null;
  let alignedFrames = 0;
  let lastAlignedSequence = 0;
  let lastFireAtMs = -Infinity;

  function reset(reason, extra = {}) {
    alignmentTrackId = null; alignedFrames = 0; lastAlignedSequence = 0;
    return { fireCandidate: false, fireAuthorized: false, alignedFreshFrames: 0, reason, ...extra };
  }

  return {
    evaluate({ track, servo, frame, lastAimCorrectionFrame = 0, nowMs = frame.capturedAtMs, reassociationRequired = false }) {
      if (!track || track.state !== 'CONFIRMED' || !track.measurementFresh || !track.canAuthorizeFire) return reset('fresh-confirmed-semantic-track-required');
      if (track.lastMeasurementSequence !== frame.sequence) return reset('measurement-lineage-mismatch');
      if (reassociationRequired) return reset('post-shot-reassociation-required');
      if (servo.phase !== 'ALIGNED') return reset('not-aligned');
      if (frame.sequence <= lastAimCorrectionFrame) return reset('frame-not-after-correction');
      if (alignmentTrackId !== track.trackId) { alignmentTrackId = track.trackId; alignedFrames = 0; lastAlignedSequence = 0; }
      if (frame.sequence <= lastAlignedSequence) return reset('non-increasing-alignment-frame');
      alignedFrames += 1; lastAlignedSequence = frame.sequence;
      const fireCandidate = alignedFrames >= profile.fire.alignedFreshFramesRequired;
      if (!fireCandidate) return { fireCandidate: false, fireAuthorized: false, alignedFreshFrames: alignedFrames, reason: 'awaiting-fresh-alignment' };
      if (!profile.activation.liveEnabled || !profile.activation.aimInputEnabled || !profile.activation.automaticFireEnabled) {
        return { fireCandidate: true, fireAuthorized: false, alignedFreshFrames: alignedFrames, reason: 'profile-default-off' };
      }
      if (profile.detector.model.status !== 'verified') return { fireCandidate: true, fireAuthorized: false, alignedFreshFrames: alignedFrames, reason: 'detector-model-unverified' };
      if (nowMs - lastFireAtMs < profile.fire.cooldownMs) return { fireCandidate: true, fireAuthorized: false, alignedFreshFrames: alignedFrames, reason: 'fire-cooldown' };
      lastFireAtMs = nowMs; alignedFrames = 0; lastAlignedSequence = 0;
      return { fireCandidate: true, fireAuthorized: true, alignedFreshFrames: profile.fire.alignedFreshFramesRequired, reason: 'fresh-same-track-authorized' };
    },
    reset: () => reset('manual-reset'),
  };
}
