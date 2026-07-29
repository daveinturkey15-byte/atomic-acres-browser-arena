function validBounds(bounds) {
  return bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.width > 0 && bounds.height > 0;
}

export function gateSemanticDetections(detections, frame, profile, options = {}) {
  const accepted = [];
  const rejected = [];
  const modelReady = profile.detector.model.status === 'verified';
  const fixtureReady = options.offlineFixture === true && profile.detector.fixtureProviderAllowedOffline === true;
  const shadowReady = options.liveShadowProposal === true
    && profile.activation.liveEnabled === false
    && profile.activation.aimInputEnabled === false
    && profile.activation.automaticFireEnabled === false;
  for (const detection of detections ?? []) {
    let reason = null;
    const fixtureDetection = fixtureReady && detection.provider === 'deterministic-fixture';
    const shadowDetection = shadowReady && detection.provider === 'legacy-rendered-proposal-shadow';
    if (!modelReady && !fixtureDetection && !shadowDetection) reason = 'semantic-model-unavailable';
    else if (detection.source !== 'rendered-world-view' || frame.source !== 'rendered-world-view') reason = 'not-rendered-world-view';
    else if (detection.frameSequence !== frame.sequence) reason = 'stale-detection-frame';
    else if (detection.proposalOnly) reason = 'proposal-only';
    else if (detection.semanticClass !== profile.detector.positiveClass) reason = 'forbidden-semantic-class';
    else if (!Number.isFinite(detection.confidence) || detection.confidence < profile.detector.thresholds.continuationConfidence) reason = 'semantic-confidence-low';
    else if (!validBounds(detection.bounds)) reason = 'invalid-body-bounds';
    else if (!detection.centre || !Number.isFinite(detection.centre.x) || !Number.isFinite(detection.centre.y)) reason = 'invalid-centre';
    const receipt = {
      ...detection,
      semanticAuthority: reason ? false : !shadowDetection,
      disposition: reason ? 'rejected' : shadowDetection ? 'accepted-shadow-proposal' : 'accepted',
      reason,
    };
    if (reason) rejected.push(receipt); else accepted.push(receipt);
  }
  return {
    provider: shadowReady ? 'legacy-rendered-proposal-shadow' : fixtureReady ? 'deterministic-fixture' : profile.detector.provider,
    modelReady,
    offlineFixture: fixtureReady,
    liveShadowProposal: shadowReady,
    accepted,
    rejected,
  };
}

export function legacyProposalsToShadowDetections(targets, frameSequence, confidence = 0.84) {
  return (targets ?? []).map((target) => ({
    frameSequence,
    source: 'rendered-world-view',
    provider: 'legacy-rendered-proposal-shadow',
    semanticClass: 'mobile-opponent-operator',
    confidence,
    proposalOnly: false,
    bounds: {
      x: Number(target.bounds?.minX ?? target.x - Number(target.bounds?.width ?? 1) / 2),
      y: Number(target.bounds?.minY ?? target.y - Number(target.bounds?.height ?? 1) / 2),
      width: Number(target.bounds?.width ?? 1),
      height: Number(target.bounds?.height ?? 1),
    },
    centre: { x: Number(target.x), y: Number(target.y) },
    proposalReceipt: {
      detector: target.detector ?? null,
      pixels: target.pixels ?? null,
      density: target.density ?? null,
      aspect: target.aspect ?? null,
      score: target.score ?? null,
    },
  }));
}
