const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function iou(a, b) {
  const left = Math.max(a.x, b.x); const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width); const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function area(bounds) { return bounds.width * bounds.height; }

export function createSingleTargetTracker(config, thresholds) {
  let track = null;
  let state = 'SEARCH';
  let nextId = 1;
  let misses = 0;
  let hitSequences = [];
  let lastFrameSequence = 0;

  function publicReceipt(extra = {}) {
    const confirmed = state === 'CONFIRMED';
    return {
      state,
      trackId: track?.id ?? null,
      x: track?.x ?? null,
      y: track?.y ?? null,
      centre: track ? { x: track.x, y: track.y } : null,
      bounds: track?.bounds ?? null,
      vx: track?.vx ?? 0,
      vy: track?.vy ?? 0,
      semanticConfidence: track?.semanticConfidence ?? 0,
      uncertainty: track?.uncertainty ?? 1,
      lastMeasurementSequence: track?.lastMeasurementSequence ?? null,
      measurementFresh: extra.measurementFresh ?? false,
      measurementAgeMs: track ? extra.nowMs - track.lastMeasurementAtMs : null,
      predictionAgeMs: track ? extra.nowMs - track.lastMeasurementAtMs : null,
      canAuthorizeFire: confirmed && Boolean(extra.measurementFresh)
        && track.semanticConfidence >= thresholds.authorizationConfidence,
      association: extra.association ?? { reason: 'none', cost: null, margin: null },
      reacquired: Boolean(extra.reacquired),
    };
  }

  function predict(frame, commandReceipt) {
    if (!track) return null;
    const dt = clamp((frame.capturedAtMs - track.updatedAtMs) / 1000, 1 / 240, 0.25);
    return {
      x: track.x + track.vx * dt + (commandReceipt?.renderedShiftX ?? 0),
      y: track.y + track.vy * dt + (commandReceipt?.renderedShiftY ?? 0),
      dt,
    };
  }

  function candidateCost(candidate, predicted, frame) {
    const diagonal = Math.hypot(frame.width, frame.height);
    const distance = Math.hypot(candidate.centre.x - predicted.x, candidate.centre.y - predicted.y) / diagonal;
    const ratio = Math.max(area(candidate.bounds), area(track.bounds)) / Math.max(1, Math.min(area(candidate.bounds), area(track.bounds)));
    if (distance > config.association.maximumCentreDistanceNormalized || ratio > config.association.maximumScaleRatio) return null;
    const overlap = iou(track.bounds, candidate.bounds);
    if (overlap < config.association.minimumIou) return null;
    const scalePenalty = Math.min(1, Math.abs(Math.log(ratio)) / Math.log(config.association.maximumScaleRatio));
    const distancePenalty = distance / config.association.maximumCentreDistanceNormalized;
    const semanticPenalty = 1 - candidate.confidence;
    const cost = config.association.distanceWeight * distancePenalty
      + config.association.overlapWeight * (1 - overlap)
      + config.association.scaleWeight * scalePenalty
      + config.association.semanticWeight * semanticPenalty;
    return { candidate, cost, distance, overlap, ratio };
  }

  function update(candidates, frame, context = {}) {
    if (!Number.isInteger(frame.sequence) || frame.sequence <= lastFrameSequence) {
      return publicReceipt({ nowMs: frame.capturedAtMs, association: { reason: 'non-increasing-frame', cost: null, margin: null } });
    }
    lastFrameSequence = frame.sequence;
    if (!track) {
      const eligible = [...candidates].filter((candidate) => candidate.confidence >= thresholds.initiationConfidence).sort((a, b) => b.confidence - a.confidence);
      if (!eligible.length) { state = 'SEARCH'; return publicReceipt({ nowMs: frame.capturedAtMs, association: { reason: 'no-initiation-candidate', cost: null, margin: null } }); }
      if (eligible[1] && eligible[0].confidence - eligible[1].confidence < thresholds.ambiguityMargin) {
        state = 'SEARCH'; return publicReceipt({ nowMs: frame.capturedAtMs, association: { reason: 'ambiguous-initiation', cost: null, margin: eligible[0].confidence - eligible[1].confidence } });
      }
      const candidate = eligible[0];
      track = { id: `OV1-${nextId++}`, x: candidate.centre.x, y: candidate.centre.y, vx: 0, vy: 0, bounds: candidate.bounds, semanticConfidence: candidate.confidence, uncertainty: config.initialUncertainty, lastMeasurementSequence: frame.sequence, lastMeasurementAtMs: frame.capturedAtMs, updatedAtMs: frame.capturedAtMs };
      hitSequences = [frame.sequence]; misses = 0; state = 'TENTATIVE';
      return publicReceipt({ nowMs: frame.capturedAtMs, measurementFresh: true, association: { reason: 'track-initiated', cost: 0, margin: null } });
    }

    const predicted = predict(frame, context.commandReceipt);
    const scored = candidates.map((candidate) => candidateCost(candidate, predicted, frame)).filter(Boolean).sort((a, b) => a.cost - b.cost);
    const winner = scored[0]; const runnerUp = scored[1];
    const margin = winner && runnerUp ? runnerUp.cost - winner.cost : 1;
    if (!winner || margin < config.association.minimumWinnerMargin) {
      misses += 1;
      const wasConfirmed = state === 'CONFIRMED' || state === 'COASTING';
      if (wasConfirmed && misses <= config.coastingMaximumFrames && frame.capturedAtMs - track.lastMeasurementAtMs <= config.coastingMaximumMs) {
        track = { ...track, x: predicted.x, y: predicted.y, updatedAtMs: frame.capturedAtMs, uncertainty: clamp(track.uncertainty + config.missUncertaintyGrowth, 0, 1) };
        state = 'COASTING';
        return publicReceipt({ nowMs: frame.capturedAtMs, association: { reason: winner ? 'ambiguous-association' : 'association-miss', cost: winner?.cost ?? null, margin: winner ? margin : null } });
      }
      const reason = winner ? 'ambiguous-association' : 'track-expired';
      track = null; state = 'LOST'; hitSequences = []; misses = 0;
      return publicReceipt({ nowMs: frame.capturedAtMs, association: { reason, cost: winner?.cost ?? null, margin: winner ? margin : null } });
    }

    const candidate = winner.candidate;
    const residualX = candidate.centre.x - predicted.x; const residualY = candidate.centre.y - predicted.y;
    const x = predicted.x + config.alpha * residualX; const y = predicted.y + config.alpha * residualY;
    const vx = track.vx + config.beta * residualX / predicted.dt; const vy = track.vy + config.beta * residualY / predicted.dt;
    const reacquired = state === 'COASTING';
    track = { ...track, x, y, vx, vy, bounds: candidate.bounds, semanticConfidence: candidate.confidence, uncertainty: clamp(track.uncertainty * config.measurementUncertaintyDecay, 0, 1), lastMeasurementSequence: frame.sequence, lastMeasurementAtMs: frame.capturedAtMs, updatedAtMs: frame.capturedAtMs };
    misses = 0; hitSequences.push(frame.sequence); hitSequences = hitSequences.filter((sequence) => sequence >= frame.sequence - config.confirmationWindowFrames + 1);
    if (reacquired || state === 'CONFIRMED' || hitSequences.length >= config.confirmationHits) state = 'CONFIRMED'; else state = 'TENTATIVE';
    return publicReceipt({ nowMs: frame.capturedAtMs, measurementFresh: true, reacquired, association: { reason: reacquired ? 'reassociated' : 'associated', cost: winner.cost, margin } });
  }

  return { update, snapshot: () => publicReceipt({ nowMs: track?.updatedAtMs ?? 0 }) };
}
