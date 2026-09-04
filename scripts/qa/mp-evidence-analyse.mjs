/**
 * PASS 95 — turn a friend's WAN session into a divergence table.
 *
 * Run:
 *   node scripts/qa/mp-evidence-analyse.mjs <bundle.json | directory> [...]
 *   node scripts/qa/mp-evidence-analyse.mjs --json docs/evidence/pass95/...
 *
 * WHY THIS SCRIPT IS THE POINT OF THE WHOLE LANE
 * ----------------------------------------------
 * Every multiplayer gate in this repository runs two Chromium contexts on one
 * machine over loopback. Loopback is not a network: no jitter worth measuring,
 * no asymmetric uplink, no NAT traversal, no friend on a train. The owner's
 * real bar is "does it feel right when I play with friends", and a session with
 * friends currently produces nothing a gate can read — only a sentence in chat.
 *
 * A bundle from `src/netcode-evidence-recorder.ts` is that missing artefact,
 * and this script is what makes it evidence rather than a file: it cross-checks
 * the HOST's bundle against each GUEST's bundle for the same room, and prints
 * what the two disagreed about. The host is authority by construction, so its
 * own rows are the control; a guest row that diverges from it is the finding.
 *
 * BUNDLES ARE UNTRUSTED INPUT
 * ---------------------------
 * A bundle arrives by whatever route a friend used to send a file. It is parsed
 * defensively, validated against the schema before any field is read, and every
 * derived number is RECOMPUTED here rather than taken from the `desync` the
 * sender wrote — a bundle from an older build, or one edited by hand, must not
 * be able to assert a health it does not have. Nothing in a bundle is executed,
 * interpolated into a shell command, or written back to disk.
 *
 * EXIT CODES
 * ----------
 *   0  every bundle parsed and every cross-check that could run, ran
 *   1  a bundle was unreadable or failed schema validation
 *   2  bundles parsed, but a threshold in THRESHOLDS was exceeded (a finding)
 * Exit 2 is the useful one: it is what lets a friend's session fail a gate.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const EVIDENCE_SCHEMA_VERSION = 1;

/**
 * Thresholds are the ones the runtime itself already reacts to, not new
 * inventions: src/network-sync.ts demotes the snapshot rate under jitter and
 * sequence gaps, and src/network-fairness.ts rewinds by rtt/2 + jitter. A
 * session that crosses these is a session where the adaptation was already
 * working hard, which is exactly what the owner wants to see written down.
 */
export const THRESHOLDS = Object.freeze({
  /** Beyond one player-width of steady-state disagreement, aim stops agreeing. */
  disagreementP95M: 1.0,
  /** Above this the interpolation buffer underruns at 40 Hz. */
  jitterMs: 25,
  lossFraction: 0.05,
  /** Below this the host is not delivering the rate it negotiated. */
  minInboundRateHz: 15,
  desync: 0.75,
});

export function validateBundle(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'bundle is not a JSON object' };
  }
  if (value.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    return { ok: false, reason: `schemaVersion ${JSON.stringify(value.schemaVersion)} is not ${EVIDENCE_SCHEMA_VERSION}` };
  }
  for (const key of ['roomCode', 'localPeerId', 'localRole']) {
    if (typeof value[key] !== 'string') return { ok: false, reason: `${key} must be a string` };
  }
  if (value.localRole !== 'host' && value.localRole !== 'guest' && value.localRole !== 'offline') {
    return { ok: false, reason: `localRole ${JSON.stringify(value.localRole)} is not host/guest/offline` };
  }
  for (const key of ['traces', 'diffs', 'requests', 'peers']) {
    if (!Array.isArray(value[key])) return { ok: false, reason: `${key} must be an array` };
  }
  for (const peer of value.peers) {
    if (typeof peer !== 'object' || peer === null) return { ok: false, reason: 'a peers entry is not an object' };
    if (typeof peer.peer !== 'string') return { ok: false, reason: 'peers[].peer must be a string' };
    for (const key of ['rttMs', 'jitterMs', 'lossFraction', 'disagreementP95M', 'disagreementMaxM']) {
      if (!Number.isFinite(peer[key])) return { ok: false, reason: `peers[].${key} must be a finite number` };
    }
  }
  return { ok: true, bundle: value };
}

/**
 * The recorder's `desyncMeter`, reimplemented here rather than imported, and
 * that duplication is deliberate. This script must read a bundle produced by a
 * DIFFERENT build than the one in the working tree — that is the entire use
 * case, a friend on whatever was deployed last week. If it imported the current
 * TypeScript it would silently rescore old bundles with new constants. The
 * constants are pinned to schemaVersion instead, and
 * `scripts/qa/mp-evidence-analyse.test.mjs` asserts the two agree for
 * schemaVersion 1.
 */
export const DESYNC_POSITION_SATURATION_M = 2;
export const DESYNC_ACK_SATURATION_MS = 1_000;

export function recomputeDesync(peer) {
  const position = Math.max(0, Number(peer.disagreementP95M) || 0) / DESYNC_POSITION_SATURATION_M;
  const loss = Math.max(0, Number(peer.lossFraction) || 0);
  const rateHz = Number(peer.inboundRateHz);
  const intervalMs = Number.isFinite(rateHz) && rateHz > 0 ? 1_000 / rateHz : 1_000 / 20;
  const jitter = Math.max(0, Number(peer.jitterMs) || 0) / (intervalMs / 2);
  return Math.min(1, Math.max(position, loss, jitter, 0));
}

/** Trace counts by kind and direction, for the "what was on the wire" line. */
export function summariseTraces(bundle) {
  const byKind = new Map();
  let inbound = 0;
  let outbound = 0;
  let bytes = 0;
  for (const trace of bundle.traces) {
    if (typeof trace !== 'object' || trace === null) continue;
    const kind = typeof trace.kind === 'string' ? trace.kind : 'other';
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    if (trace.dir === 'out') outbound += 1;
    else inbound += 1;
    bytes += Number.isFinite(trace.bytes) ? trace.bytes : 0;
  }
  return { byKind, inbound, outbound, bytes, total: bundle.traces.length };
}

/**
 * One row per (bundle, peer). `findings` names every threshold this row broke,
 * which is what makes the table actionable instead of decorative — a wall of
 * numbers with nothing flagged is what people stop reading.
 */
export function divergenceRows(bundles) {
  const rows = [];
  for (const entry of bundles) {
    for (const peer of entry.bundle.peers) {
      const desync = recomputeDesync(peer);
      const findings = [];
      if (peer.disagreementP95M > THRESHOLDS.disagreementP95M) findings.push('position');
      if (peer.jitterMs > THRESHOLDS.jitterMs) findings.push('jitter');
      if (peer.lossFraction > THRESHOLDS.lossFraction) findings.push('loss');
      if (Number.isFinite(peer.inboundRateHz) && peer.inboundRateHz > 0
        && peer.inboundRateHz < THRESHOLDS.minInboundRateHz) findings.push('rate');
      if (desync > THRESHOLDS.desync) findings.push('desync');
      rows.push({
        source: entry.source,
        room: entry.bundle.roomCode,
        observer: entry.bundle.localPeerId,
        observerRole: entry.bundle.localRole,
        peer: peer.peer,
        peerRole: typeof peer.role === 'string' ? peer.role : '?',
        rttMs: Number(peer.rttMs) || 0,
        jitterMs: Number(peer.jitterMs) || 0,
        lossFraction: Number(peer.lossFraction) || 0,
        inboundRateHz: Number(peer.inboundRateHz) || 0,
        disagreementP95M: Number(peer.disagreementP95M) || 0,
        disagreementMaxM: Number(peer.disagreementMaxM) || 0,
        desync,
        // Compared against `desyncSessionP95`, which is the SAME statistic this
        // script recomputes. `peer.desync` is the live instantaneous meter and
        // is legitimately different, so comparing against it would print a note
        // on every healthy row and train the reader to ignore all of them.
        claimedDesync: Number.isFinite(peer.desyncSessionP95) ? Number(peer.desyncSessionP95) : null,
        findings,
      });
    }
  }
  return rows;
}

/**
 * The cross-check that loopback cannot produce: for one room, compare what the
 * HOST measured for a guest against what that GUEST measured for the host. A
 * large asymmetry is the interesting case — it means one direction of the link
 * is worse than the other, which a single-machine test can never show and which
 * a player experiences as "I hit him and nothing happened" on one side only.
 */
export function asymmetryRows(bundles) {
  const rows = [];
  const hosts = bundles.filter((entry) => entry.bundle.localRole === 'host');
  const guests = bundles.filter((entry) => entry.bundle.localRole === 'guest');
  for (const host of hosts) {
    for (const guest of guests) {
      if (guest.bundle.roomCode !== host.bundle.roomCode) continue;
      const hostView = host.bundle.peers.find((peer) => peer.peer === guest.bundle.localPeerId);
      const guestView = guest.bundle.peers.find((peer) => peer.peer === host.bundle.localPeerId);
      if (!hostView || !guestView) continue;
      rows.push({
        room: host.bundle.roomCode,
        host: host.bundle.localPeerId,
        guest: guest.bundle.localPeerId,
        hostSeesRttMs: Number(hostView.rttMs) || 0,
        guestSeesRttMs: Number(guestView.rttMs) || 0,
        rttDeltaMs: Math.abs((Number(hostView.rttMs) || 0) - (Number(guestView.rttMs) || 0)),
        hostSeesP95M: Number(hostView.disagreementP95M) || 0,
        guestSeesP95M: Number(guestView.disagreementP95M) || 0,
        // The host is authority: its view of the guest is the control, and the
        // guest's larger number is the guest's own extrapolation error.
        divergenceM: Math.abs((Number(guestView.disagreementP95M) || 0) - (Number(hostView.disagreementP95M) || 0)),
      });
    }
  }
  return rows;
}

function pad(value, width, alignRight = true) {
  const text = String(value);
  if (text.length >= width) return text.slice(0, width);
  return alignRight ? text.padStart(width, ' ') : text.padEnd(width, ' ');
}

function fixed(value, places) {
  return Number.isFinite(value) ? value.toFixed(places) : '--';
}

export function formatReport(bundles, rows, asymmetries) {
  const lines = [];
  lines.push('');
  lines.push('PASS 95 — WAN netcode evidence');
  lines.push('='.repeat(96));
  for (const entry of bundles) {
    const traces = summariseTraces(entry.bundle);
    const kinds = [...traces.byKind.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([kind, count]) => `${kind}:${count}`).join(' ');
    lines.push(`${entry.source}`);
    lines.push(`  room=${entry.bundle.roomCode} role=${entry.bundle.localRole} peer=${entry.bundle.localPeerId}`
      + ` protocol=${entry.bundle.protocolVersion ?? '?'} window=${Math.round((entry.bundle.windowMs ?? 0) / 1_000)}s`);
    lines.push(`  traces=${traces.total} (in ${traces.inbound} / out ${traces.outbound}, ${traces.bytes} B)  top: ${kinds || '--'}`);
    const dropped = entry.bundle.dropped ?? {};
    const droppedTotal = (dropped.traces ?? 0) + (dropped.diffs ?? 0) + (dropped.requests ?? 0) + (dropped.byBytes ?? 0);
    // A truncated bundle must never read as a complete one.
    if (droppedTotal > 0) {
      lines.push(`  TRUNCATED: dropped traces=${dropped.traces ?? 0} diffs=${dropped.diffs ?? 0}`
        + ` requests=${dropped.requests ?? 0} byBytes=${dropped.byBytes ?? 0}`);
    }
  }

  lines.push('');
  lines.push('DIVERGENCE TABLE (one row per observer/peer pair; metres are peer-position disagreement)');
  lines.push('-'.repeat(96));
  lines.push(`${pad('observer', 14, false)} ${pad('role', 6, false)} ${pad('peer', 14, false)} `
    + `${pad('rtt', 6)} ${pad('jit', 6)} ${pad('loss%', 6)} ${pad('inHz', 5)} ${pad('p95m', 7)} ${pad('maxm', 7)} ${pad('desync', 7)}  findings`);
  if (rows.length === 0) lines.push('(no peer rows — a solo or lobby-only bundle)');
  for (const row of rows) {
    lines.push(`${pad(row.observer, 14, false)} ${pad(row.observerRole, 6, false)} ${pad(row.peer, 14, false)} `
      + `${pad(fixed(row.rttMs, 1), 6)} ${pad(fixed(row.jitterMs, 1), 6)} `
      + `${pad(fixed(row.lossFraction * 100, 2), 6)} ${pad(fixed(row.inboundRateHz, 0), 5)} `
      + `${pad(fixed(row.disagreementP95M, 3), 7)} ${pad(fixed(row.disagreementMaxM, 3), 7)} `
      + `${pad(fixed(row.desync, 3), 7)}  ${row.findings.length > 0 ? row.findings.join(',') : 'ok'}`);
    // A bundle whose own desync disagrees with the recomputation was produced
    // by a different build, or was edited. Say so rather than quietly using ours.
    if (row.claimedDesync !== null && Math.abs(row.claimedDesync - row.desync) > 0.01) {
      lines.push(`${' '.repeat(15)}NOTE: bundle claimed session desync ${fixed(row.claimedDesync, 3)},`
        + ` recomputed ${fixed(row.desync, 3)} — different build, or the bundle was edited`);
    }
  }

  lines.push('');
  lines.push('HOST/GUEST ASYMMETRY (only computable when both sides of a room sent a bundle)');
  lines.push('-'.repeat(96));
  if (asymmetries.length === 0) {
    lines.push('(none — collect a bundle from the host AND at least one guest in the same room)');
  }
  for (const row of asymmetries) {
    lines.push(`room ${row.room}: host ${row.host} <-> guest ${row.guest}`);
    lines.push(`  rtt  host sees ${fixed(row.hostSeesRttMs, 1)} ms, guest sees ${fixed(row.guestSeesRttMs, 1)} ms`
      + `  (delta ${fixed(row.rttDeltaMs, 1)} ms)`);
    lines.push(`  p95  host sees ${fixed(row.hostSeesP95M, 3)} m, guest sees ${fixed(row.guestSeesP95M, 3)} m`
      + `  (divergence ${fixed(row.divergenceM, 3)} m)`);
  }

  const flagged = rows.filter((row) => row.findings.length > 0);
  lines.push('');
  lines.push('-'.repeat(96));
  lines.push(flagged.length === 0
    ? `VERDICT: ok — ${rows.length} peer row(s), none over threshold`
    : `VERDICT: ${flagged.length} of ${rows.length} peer row(s) over threshold`);
  lines.push('');
  return lines.join('\n');
}

function collectFiles(target) {
  const stats = statSync(target);
  if (!stats.isDirectory()) return [target];
  return readdirSync(target)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(target, name));
}

export function loadBundles(targets) {
  const loaded = [];
  const errors = [];
  for (const target of targets) {
    let files;
    try {
      files = collectFiles(target);
    } catch (error) {
      errors.push({ source: target, reason: `cannot read: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    for (const file of files) {
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(file, 'utf8'));
      } catch (error) {
        errors.push({ source: file, reason: `not valid JSON: ${error instanceof Error ? error.message : String(error)}` });
        continue;
      }
      const validation = validateBundle(parsed);
      if (!validation.ok) {
        errors.push({ source: file, reason: validation.reason });
        continue;
      }
      loaded.push({ source: file, bundle: validation.bundle });
    }
  }
  return { loaded, errors };
}

export function analyse(targets) {
  const { loaded, errors } = loadBundles(targets);
  const rows = divergenceRows(loaded);
  const asymmetries = asymmetryRows(loaded);
  const flagged = rows.filter((row) => row.findings.length > 0);
  return { bundles: loaded, errors, rows, asymmetries, flagged };
}

function main(argv) {
  const wantsJson = argv.includes('--json');
  const targets = argv.filter((argument) => !argument.startsWith('--')).map((argument) => resolve(argument));
  if (targets.length === 0) {
    process.stderr.write('usage: node scripts/qa/mp-evidence-analyse.mjs [--json] <bundle.json | directory> [...]\n');
    return 1;
  }
  const result = analyse(targets);
  if (wantsJson) {
    process.stdout.write(`${JSON.stringify({
      errors: result.errors,
      rows: result.rows,
      asymmetries: result.asymmetries,
      flaggedCount: result.flagged.length,
    }, null, 2)}\n`);
  } else {
    process.stdout.write(formatReport(result.bundles, result.rows, result.asymmetries));
  }
  for (const error of result.errors) {
    process.stderr.write(`REJECTED ${error.source}: ${error.reason}\n`);
  }
  if (result.errors.length > 0) return 1;
  return result.flagged.length > 0 ? 2 : 0;
}

// `import.meta.url` guard so the module can be imported by its test without
// running the CLI, which is the same shape the other scripts/qa modules use.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  process.exitCode = main(process.argv.slice(2));
}
