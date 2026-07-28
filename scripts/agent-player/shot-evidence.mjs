function officialSummaryReport(download) {
  if (!download) return null;
  return download.report ?? download;
}

function targetMotion(trace = []) {
  if (trace.length < 2) return null;
  const before = trace.at(-2);
  const after = trace.at(-1);
  const dtMs = Number(after.receivedAt) - Number(before.receivedAt);
  if (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 500) return null;
  const width = Math.max(1, Number(after.bounds?.width ?? 1));
  const height = Math.max(1, Number(after.bounds?.height ?? 1));
  const dx = Number(after.x) - Number(before.x);
  const dy = Number(after.y) - Number(before.y);
  return {
    kind: 'reticle-relative-image-plane',
    dtMs,
    vxPxPerSecond: dx * 1000 / dtMs,
    vyPxPerSecond: dy * 1000 / dtMs,
    speedBodyWidthsPerSecond: Math.hypot(dx, dy) * 1000 / dtMs / width,
    dyBodyHeights: dy / height,
  };
}

function reticleError(action) {
  const target = action.target ?? {};
  const bounds = target.bounds ?? {};
  const width = Math.max(1, Number(bounds.width ?? 1));
  const height = Math.max(1, Number(bounds.height ?? 1));
  const dx = Number(target.x) - 160;
  const dy = Number(target.y) - 90;
  return {
    dxPx: dx,
    dyPx: dy,
    radialNormalized: Number(action.alignment),
    dxBodyWidths: dx / width,
    dyBodyHeights: dy / height,
  };
}

export function buildShotEvidence({ actions = [], matchSummaryDownload = null, startedAt }) {
  const summary = officialSummaryReport(matchSummaryDownload);
  const bursts = actions.filter((action) => action.kind === 'operator-authorized-burst');
  const shotRequests = [];
  for (const burst of bursts) {
    for (const [index, trigger] of (burst.triggerReceipts ?? []).entries()) {
      shotRequests.push({
        id: `S${String(shotRequests.length + 1).padStart(4, '0')}`,
        burstAtMs: burst.atMs,
        pulseIndex: index + 1,
        authorityFrameId: burst.fireEvidenceFile ?? null,
        trigger,
        ads: {
          requested: Boolean(burst.useAds),
          renderedState: burst.adsRenderedState ?? 'unknown',
        },
        reticleError: reticleError(burst),
        targetMotion: targetMotion(burst.aimTrace),
        freshness: {
          authoritySourceSequence: burst.aimTrace?.at(-1)?.sourceSequence ?? null,
          authorityReceivedAtMonotonicMs: burst.aimTrace?.at(-1)?.receivedAt ?? null,
          ageAtTriggerMs: burst.authorityFrameAgeAtTriggerMs ?? null,
          newerThanLastAimInput: Boolean(burst.postInputReacquired),
          twoFrameAligned: Boolean(burst.twoFrameAligned),
        },
        finish: {
          followup: Boolean(burst.finishFollowup),
          activationAtMs: burst.finishActivationAtMs ?? null,
          followupsRemaining: burst.finishFollowupsRemaining ?? null,
        },
        target: burst.target ?? null,
        official: { hitMatch: 'unavailable' },
      });
    }
  }

  const officialShots = Number(summary?.stats?.shotsFired ?? summary?.participants?.find((p) => p.name === 'Jigglyclaw')?.shots ?? NaN);
  const officialHits = Number(summary?.stats?.shotsHit ?? summary?.participants?.find((p) => p.name === 'Jigglyclaw')?.hits ?? NaN);
  const outgoingHits = (summary?.damageTimeline ?? [])
    .filter((event) => event.from === 'Jigglyclaw' && event.toKind === 'solo-bot' && event.timestamp)
    .map((event) => ({ ...event, epochMs: Date.parse(event.timestamp) }))
    .filter((event) => Number.isFinite(event.epochMs));
  const shotCountReconciled = Number.isFinite(officialShots) && officialShots === shotRequests.length;
  let matchedOfficialHits = 0;

  if (shotCountReconciled) {
    const usedShots = new Set();
    for (const hit of outgoingHits) {
      const candidates = shotRequests
        .map((request, index) => ({ request, index, latencyMs: hit.epochMs - Number(request.trigger.browserDownEpochMs ?? request.trigger.downEpochMs) }))
        .filter(({ index, latencyMs }) => !usedShots.has(index) && latencyMs >= 0 && latencyMs <= 350)
        .sort((left, right) => left.latencyMs - right.latencyMs);
      if (candidates.length === 1 || (candidates.length > 1 && candidates[0].latencyMs + 20 < candidates[1].latencyMs)) {
        const selected = candidates[0];
        usedShots.add(selected.index);
        matchedOfficialHits += 1;
        selected.request.official = {
          hitMatch: 'matched',
          hitTimestamp: hit.timestamp,
          hitLatencyMs: selected.latencyMs,
          damage: hit.damage,
          target: hit.to,
          health: hit.health,
          kill: /->\s*0(?:\.0+)?\s*HP/i.test(String(hit.health ?? '')),
        };
      }
    }
    const allOfficialHitsMatched = matchedOfficialHits === outgoingHits.length;
    for (const [index, request] of shotRequests.entries()) {
      if (!usedShots.has(index)) request.official = {
        hitMatch: allOfficialHitsMatched ? 'miss-by-reconciled-elimination' : 'ambiguous-or-unmatched',
      };
    }
  }

  return {
    schemaVersion: 1,
    kind: 'rendered-state-shot-evidence',
    startedAt,
    authority: {
      allowed: ['rendered screencast frames', 'visible HUD', 'ordinary input timestamps', 'human-readable match summary'],
      unavailable: ['hidden enemy state', 'server-private coordinates', 'per-miss trajectories', 'authoritative miss impact points'],
    },
    reconciliation: {
      pulseRequests: shotRequests.length,
      officialShots: Number.isFinite(officialShots) ? officialShots : null,
      officialHits: Number.isFinite(officialHits) ? officialHits : null,
      outgoingDamageEvents: outgoingHits.length,
      matchedOfficialHits,
      unmatchedOfficialHits: outgoingHits.length - matchedOfficialHits,
      shotCountReconciled,
    },
    shotRequests,
  };
}
