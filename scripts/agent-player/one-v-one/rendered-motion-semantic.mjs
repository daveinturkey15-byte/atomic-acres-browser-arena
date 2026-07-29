function finiteTarget(target) {
  return target && Number.isFinite(target.x) && Number.isFinite(target.y)
    && Number.isFinite(target.pixels) && target.pixels > 0
    && Number.isFinite(target.bounds?.width) && target.bounds.width > 0
    && Number.isFinite(target.bounds?.height) && target.bounds.height > 0;
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function asDetection(target, frameSequence, confidence, motionReceipt) {
  return {
    frameSequence,
    source: 'rendered-world-view',
    provider: 'rendered-motion-semantic-v1',
    semanticClass: 'mobile-opponent-operator',
    confidence,
    proposalOnly: false,
    bounds: {
      x: Number(target.bounds.minX ?? target.x - target.bounds.width / 2),
      y: Number(target.bounds.minY ?? target.y - target.bounds.height / 2),
      width: Number(target.bounds.width),
      height: Number(target.bounds.height),
    },
    centre: { x: Number(target.x), y: Number(target.y) },
    proposalReceipt: {
      detector: target.detector ?? null,
      pixels: target.pixels,
      density: target.density ?? null,
      aspect: target.aspect ?? null,
      score: target.score ?? null,
      meanBlueRedLead: target.meanBlueRedLead ?? null,
      blueLeadRatio: target.blueLeadRatio ?? null,
      motion: motionReceipt,
    },
  };
}

export function createRenderedMotionSemanticGate(options = {}) {
  const requiredStationaryFrames = Math.max(3, Math.floor(options.requiredStationaryFrames ?? 3));
  const minimumIndependentMotionPixels = Math.max(1, Number(options.minimumIndependentMotionPixels ?? 2));
  const maximumAssociationDistancePixels = Math.max(4, Number(options.maximumAssociationDistancePixels ?? 18));
  const minimumAssociationMarginPixels = Math.max(0, Number(options.minimumAssociationMarginPixels ?? 3));
  const maximumSizeRatio = Math.max(1.2, Number(options.maximumSizeRatio ?? 4));
  const maximumMissedObservations = Math.max(0, Math.floor(options.maximumMissedObservations ?? 2));
  const maximumFreshMotionSequenceGap = Math.max(1, Math.floor(options.maximumFreshMotionSequenceGap ?? 12));
  const maximumObservationSequenceGap = Math.max(1, Math.floor(options.maximumObservationSequenceGap ?? 12));
  const minimumCandidateHeight = Math.max(1, Number(options.minimumCandidateHeight ?? 5));
  const maximumCandidateAspect = Math.max(0.4, Number(options.maximumCandidateAspect ?? 1.2));
  const maximumAspectRatioChange = Math.max(1.2, Number(options.maximumAspectRatioChange ?? 2.5));
  let selected = null;
  let anchor = null;
  let trackId = 0;
  let stationaryFrames = 0;
  let missedObservations = 0;
  let lastFrameSequence = null;
  let lastIndependentMotionSequence = null;
  let evidenceEvents = 0;

  const clear = () => {
    selected = null;
    anchor = null;
    stationaryFrames = 0;
    missedObservations = 0;
    lastFrameSequence = null;
    lastIndependentMotionSequence = null;
    evidenceEvents = 0;
  };

  function initiate(candidate, frameSequence, stationary) {
    trackId += 1;
    selected = candidate;
    anchor = candidate;
    stationaryFrames = stationary ? 1 : 0;
    missedObservations = 0;
    lastFrameSequence = frameSequence;
    lastIndependentMotionSequence = null;
    evidenceEvents = 0;
  }

  return {
    reset: clear,
    update(targets, frame, motion = {}) {
      const frameSequence = Number(frame?.sequence);
      if (!Number.isFinite(frameSequence) || (lastFrameSequence !== null && frameSequence <= lastFrameSequence)) {
        return { detections: [], receipt: { disposition: 'rejected', reason: 'stale-frame', frameSequence, trackId: selected ? `RMS-${trackId}` : null } };
      }
      const finiteCandidates = (targets ?? []).filter(finiteTarget);
      const candidates = finiteCandidates.filter((target) => {
        const aspect = target.bounds.width / target.bounds.height;
        return target.bounds.height >= minimumCandidateHeight && aspect <= maximumCandidateAspect;
      });
      const observerStationary = motion.cameraMoved !== true && motion.movementMoved !== true;
      if (lastFrameSequence !== null && frameSequence - lastFrameSequence > maximumObservationSequenceGap) {
        clear();
      }
      if (candidates.length === 0) {
        missedObservations += 1;
        lastFrameSequence = frameSequence;
        const oldTrackId = selected ? `RMS-${trackId}` : null;
        if (missedObservations > maximumMissedObservations) clear();
        return { detections: [], receipt: { disposition: finiteCandidates.length > 0 ? 'rejected' : 'none', reason: finiteCandidates.length > 0 ? 'non-body-geometry' : 'no-proposal', frameSequence, trackId: oldTrackId, missedObservations } };
      }

      let candidate = candidates[0];
      let associationDistance = null;
      let associationMargin = null;
      if (selected) {
        const ranked = candidates.map((entry) => ({ entry, distance: distance(entry, selected) }))
          .sort((left, right) => left.distance - right.distance || Number(left.entry.score ?? 0) - Number(right.entry.score ?? 0));
        candidate = ranked[0].entry;
        associationDistance = ranked[0].distance;
        associationMargin = ranked.length > 1 ? ranked[1].distance - ranked[0].distance : Number.POSITIVE_INFINITY;
        const sizeRatio = candidate.pixels / Math.max(1, selected.pixels);
        const candidateAspect = candidate.bounds.width / candidate.bounds.height;
        const selectedAspect = selected.bounds.width / selected.bounds.height;
        const aspectRatioChange = Math.max(candidateAspect / selectedAspect, selectedAspect / candidateAspect);
        if (associationDistance > maximumAssociationDistancePixels || sizeRatio < 1 / maximumSizeRatio || sizeRatio > maximumSizeRatio || aspectRatioChange > maximumAspectRatioChange) {
          initiate(candidate, frameSequence, observerStationary);
          return { detections: [], receipt: { disposition: 'warming', reason: 'association-reset', frameSequence, trackId: `RMS-${trackId}`, observerStationary, associationDistance, associationMargin, aspectRatioChange } };
        }
        if (associationMargin < minimumAssociationMarginPixels) {
          selected = candidate;
          anchor = candidate;
          stationaryFrames = observerStationary ? 1 : 0;
          missedObservations = 0;
          lastFrameSequence = frameSequence;
          lastIndependentMotionSequence = null;
          evidenceEvents = 0;
          return { detections: [], receipt: { disposition: 'rejected', reason: 'association-ambiguous', frameSequence, trackId: `RMS-${trackId}`, observerStationary, associationDistance, associationMargin } };
        }
      } else {
        initiate(candidate, frameSequence, observerStationary);
        return { detections: [], receipt: { disposition: 'warming', reason: observerStationary ? 'stationary-anchor' : 'observer-moving', frameSequence, trackId: `RMS-${trackId}`, observerStationary } };
      }

      missedObservations = 0;
      lastFrameSequence = frameSequence;
      selected = candidate;
      if (!observerStationary) {
        anchor = candidate;
        stationaryFrames = 0;
        lastIndependentMotionSequence = null;
        evidenceEvents = 0;
        return { detections: [], receipt: { disposition: 'warming', reason: 'observer-moving', frameSequence, trackId: `RMS-${trackId}`, observerStationary, associationDistance, associationMargin } };
      }

      stationaryFrames += 1;
      if (!anchor) anchor = candidate;
      const independentMotionPixels = distance(candidate, anchor);
      const motionObserved = independentMotionPixels >= minimumIndependentMotionPixels;
      if (motionObserved) {
        lastIndependentMotionSequence = frameSequence;
        evidenceEvents += 1;
      }
      const motionFresh = lastIndependentMotionSequence !== null
        && frameSequence - lastIndependentMotionSequence <= maximumFreshMotionSequenceGap;
      const confirmed = stationaryFrames >= requiredStationaryFrames && evidenceEvents >= 1 && motionFresh;
      const confidence = confirmed
        ? Math.min(0.99, 0.72 + Math.min(0.22, independentMotionPixels / 30) + Math.min(0.05, evidenceEvents * 0.01))
        : Math.min(0.69, 0.35 + stationaryFrames * 0.07 + Math.min(0.12, independentMotionPixels / 30));
      const motionReceipt = {
        trackId: `RMS-${trackId}`,
        observerStationary,
        stationaryFrames,
        evidenceEvents,
        independentMotionPixels,
        minimumIndependentMotionPixels,
        lastIndependentMotionSequence,
        motionFresh,
        associationDistance,
        associationMargin: Number.isFinite(associationMargin) ? associationMargin : null,
      };
      return {
        detections: confirmed ? [asDetection(candidate, frameSequence, confidence, motionReceipt)] : [],
        receipt: {
          disposition: confirmed ? 'accepted-motion-semantic' : 'warming',
          reason: confirmed ? 'independent-rendered-motion-confirmed' : 'awaiting-independent-motion',
          frameSequence,
          trackId: `RMS-${trackId}`,
          confidence,
          ...motionReceipt,
        },
      };
    },
    snapshot: () => ({
      selected,
      anchor,
      trackId: selected ? `RMS-${trackId}` : null,
      stationaryFrames,
      missedObservations,
      lastFrameSequence,
      lastIndependentMotionSequence,
      evidenceEvents,
    }),
  };
}
