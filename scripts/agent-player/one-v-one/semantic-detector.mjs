function validBounds(bounds) {
  return bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.width > 0 && bounds.height > 0;
}

export function gateSemanticDetections(detections, frame, profile, options = {}) {
  const accepted = [];
  const rejected = [];
  const modelReady = profile.detector.model.status === 'verified';
  const fixtureReady = options.offlineFixture === true && profile.detector.fixtureProviderAllowedOffline === true;
  for (const detection of detections ?? []) {
    let reason = null;
    if (!modelReady && !(fixtureReady && detection.provider === 'deterministic-fixture')) reason = 'semantic-model-unavailable';
    else if (detection.source !== 'rendered-world-view' || frame.source !== 'rendered-world-view') reason = 'not-rendered-world-view';
    else if (detection.frameSequence !== frame.sequence) reason = 'stale-detection-frame';
    else if (detection.proposalOnly) reason = 'proposal-only';
    else if (detection.semanticClass !== profile.detector.positiveClass) reason = 'forbidden-semantic-class';
    else if (!Number.isFinite(detection.confidence) || detection.confidence < profile.detector.thresholds.continuationConfidence) reason = 'semantic-confidence-low';
    else if (!validBounds(detection.bounds)) reason = 'invalid-body-bounds';
    else if (!detection.centre || !Number.isFinite(detection.centre.x) || !Number.isFinite(detection.centre.y)) reason = 'invalid-centre';
    const receipt = { ...detection, disposition: reason ? 'rejected' : 'accepted', reason };
    if (reason) rejected.push(receipt); else accepted.push(receipt);
  }
  return {
    provider: fixtureReady ? 'deterministic-fixture' : profile.detector.provider,
    modelReady,
    offlineFixture: fixtureReady,
    accepted,
    rejected,
  };
}
