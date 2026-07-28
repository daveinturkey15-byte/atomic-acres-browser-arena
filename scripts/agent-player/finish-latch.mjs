export function advanceFinishLatch(options = {}) {
  const {
    latch: existingLatch = null,
    active = false,
    now,
    atMs,
    visibleKillDelta = 0,
    currentTarget = null,
    lastBurstTarget = null,
    visibleDamageDealtDelta = 0,
    lastBurstAt = Number.NEGATIVE_INFINITY,
    durationMs = 0,
    followupLimit = 2,
    associate,
  } = options;
  let latch = existingLatch;
  let event = null;

  if (latch) {
    let reason = null;
    if (!active) reason = 'inactive-match';
    else if (visibleKillDelta > 0) reason = 'visible-kill';
    else if (now >= latch.expiresAt) reason = 'absolute-timeout';
    else if (!currentTarget) reason = 'identity-loss';
    else {
      const association = associate(latch.target, currentTarget);
      if (!association) reason = 'identity-ambiguity';
      else latch = { ...latch, target: association };
    }
    if (reason) {
      event = {
        kind: 'cancel',
        reason,
        activationAtMs: latch.activatedAtMs,
        followupsUsed: followupLimit - latch.followupsRemaining,
      };
      latch = null;
    }
  }

  if (!latch && durationMs > 0 && active && currentTarget && lastBurstTarget
    && visibleDamageDealtDelta > 0 && visibleKillDelta === 0 && now - lastBurstAt <= 1_200) {
    const association = associate(lastBurstTarget, currentTarget);
    if (association) {
      latch = {
        activatedAtMs: atMs,
        expiresAt: now + durationMs,
        followupsRemaining: followupLimit,
        target: association,
      };
      event = {
        kind: 'activate',
        damageDelta: visibleDamageDealtDelta,
        durationMs,
        nonExtending: true,
        followupLimit,
      };
    }
  }

  return { latch, event };
}

export function consumeFinishFollowup(latch, triggerMonotonicMs) {
  if (!latch || triggerMonotonicMs >= latch.expiresAt || latch.followupsRemaining <= 0) {
    return { latch, finishFollowup: false };
  }
  return {
    latch: { ...latch, followupsRemaining: latch.followupsRemaining - 1 },
    finishFollowup: true,
  };
}
