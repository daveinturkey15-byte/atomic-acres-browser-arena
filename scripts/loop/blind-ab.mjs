#!/usr/bin/env node
// Blind A/B critic - contract blind-ab-v1. HF-486 / HF-503, lane "blind A/B critic".
//
// WHY. Every critic this repository has run so far was told which frame was
// ours. A critic that knows the home team grades the home team; mshumer's
// Claude-of-Duty (ingestion brief, register row 56) showed the cheap fix, and
// this file re-implements it against OUR loop runner (HF-472: re-implement,
// never copy): two captures of the same station are handed to the critic as
// LEFT and RIGHT with the side chosen by a seeded hash, the files re-encoded so
// no name, path, EXIF, XMP, ICC or text chunk survives, a probe token stamped
// into BOTH frames so the critic proves it looked at both, and the answer
// unblinded only after it is parsed and validated.
//
// WHAT IT REFUSES, in code:
//   - a round whose critic misreads EITHER probe carries no vote at all;
//   - a winner outside {left,right,tie} carries no vote;
//   - the side assignment is derived from (seed, station), never from argv, so
//     a builder cannot put the candidate on the side a model favours;
//   - the critic is never shown the labels, the directory names or the seed.
//
// The reference images travel with the question "which is CLOSER to these",
// which is a MEASUREMENT of agreement, not "make it look like this". See
// docs/loop/BLIND-AB.md for the source-tier note.
//
// Usage:
//   node scripts/loop/blind-ab.mjs --a-dir <captures> --a-label candidate4b \
//     --b-dir <captures> --b-label candidate5 --references <img,img,...> \
//     --critic omp-muse --out docs/evidence/pass96/blind-ab-critic/run-1
//   node scripts/loop/blind-ab.mjs ... --critic fixture --fixture-dir scripts/loop/fixtures/blind-ab
//   node scripts/loop/blind-ab.mjs ... --capture-a-url http://127.0.0.1:4214 --capture-b-url ... --arena nuketown2
//     (captures both sides headlessly, ONE browser at a time, then judges)

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { probeToken, probeBlocks, PROBE_ALPHABET } from './probe.mjs';
import { stampProbe, sha256File } from './image.mjs';
import { extractJson } from './critic-schema.mjs';
import { loadAdapter } from './adapters/index.mjs';

export const BLIND_AB_CONTRACT = 'blind-ab-v1';
export const SIDES = Object.freeze(['left', 'right']);
export const WINNERS = Object.freeze(['left', 'right', 'tie']);
export const DEFAULT_SEED = 'blind-ab';
/** Only these routes are admitted as A/B critics (docs/loop/README.md: Gemini and Muse; local Qwen is triage only). */
export const ADMITTED_CRITICS = Object.freeze(['omp-muse', 'omp-gemini', 'fixture']);
/** Below this many decisive votes the win-rate is reported but flagged UNDERPOWERED. */
export const MIN_DECISIVE_FOR_CLAIM = 5;

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Pure functions - randomisation, unblinding, validation, aggregation.
// ---------------------------------------------------------------------------

/**
 * Which candidate sits on the LEFT for one station. Derived from the seed and
 * the station id alone, so the same run is reproducible and no argument can
 * choose a side. The first digest byte's parity decides; across a station list
 * that is a fair coin, and the unit test asserts it is not a constant.
 */
export function sideAssignment({ seed, station }) {
  if (!seed || !station) throw new TypeError('sideAssignment: seed and station are required');
  const digest = createHash('sha256').update(`${BLIND_AB_CONTRACT}|${seed}|${station}`).digest();
  const aLeft = digest[0] % 2 === 0;
  return Object.freeze({ left: aLeft ? 'A' : 'B', right: aLeft ? 'B' : 'A' });
}

/** Probe token for one side of one station, bound to the bytes shown. */
export function abProbeToken({ seed, station, side, sha256 }) {
  if (!SIDES.includes(side)) throw new RangeError(`abProbeToken: side must be left|right, got ${side}`);
  return probeToken({ subject: seed, cycle: 1, criticId: `${station}:${side}`, captureSha256: sha256 });
}

/** Map the critic's side answer back to a candidate label. */
export function unblind(winnerSide, assignment) {
  if (winnerSide === 'tie') return 'tie';
  if (winnerSide === 'left' || winnerSide === 'right') return assignment[winnerSide];
  return null;
}

/** Same normalisation the loop's schema validator uses; a wrong character is a miss. */
function probeMatches(expected, answer) {
  if (typeof answer !== 'string') return false;
  const normalised = answer.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalised.length === 0) return false;
  return normalised === expected || (normalised.length <= expected.length * 3 && normalised.includes(expected));
}

/**
 * Validate one critic response. The receipt comes first: a critic that cannot
 * read BOTH corner codes did not look at both frames, and a preference formed
 * over one frame is not a comparison.
 */
export function validateAbResponse(response, { expectedLeft, expectedRight }) {
  const errors = [];
  if (!response || typeof response !== 'object') {
    return { valid: false, invalidReason: 'unparseable', errors: ['response is not an object'], winnerSide: null, confidence: null };
  }
  if (response.contract !== BLIND_AB_CONTRACT) errors.push(`contract must be "${BLIND_AB_CONTRACT}"`);
  let invalidReason = null;
  const probes = response.probes ?? {};
  const leftOk = probeMatches(expectedLeft, probes.left);
  const rightOk = probeMatches(expectedRight, probes.right);
  if (!leftOk && !rightOk) invalidReason = 'probe-mismatch-both';
  else if (!leftOk) invalidReason = 'probe-mismatch-left';
  else if (!rightOk) invalidReason = 'probe-mismatch-right';

  const winner = response.winner;
  if (!WINNERS.includes(winner)) errors.push(`winner must be one of ${WINNERS.join('/')}`);
  const confidence = normaliseConfidence(response.confidence);
  if (confidence === null) errors.push('confidence must be a number in 0..1 (or a percentage 0..100)');
  if (typeof response.why !== 'string' || response.why.length < 20) errors.push('why must be a sentence saying what differs');
  if (winner !== 'tie') {
    const closer = winner === 'left' ? response.leftCloser : response.rightCloser;
    if (!Array.isArray(closer) || closer.length === 0) errors.push(`${winner}Closer must list at least one thing the winner does better`);
  }
  const wellFormed = errors.length === 0;
  const valid = wellFormed && invalidReason === null;
  // An INVALID round carries NO vote - not even a recorded one (same rule as
  // the loop's critic-schema: a number left beside an invalidReason is a
  // number somebody quotes later without the reason).
  return {
    valid,
    invalidReason: invalidReason ?? (wellFormed ? null : 'schema-invalid'),
    errors,
    winnerSide: valid ? winner : null,
    confidence: valid ? Math.round(confidence * 100) / 100 : null,
    probeAnswers: { left: probes.left ?? null, right: probes.right ?? null },
  };
}

/**
 * Confidence as a fraction. FOUND BY THE FIRST REAL RUN (2026-09-04): Muse read
 * both probes correctly, named the decisive region, and wrote `confidence: 78`.
 * The first validator refused the round as schema-invalid, which would have
 * thrown away a receipted vote over a unit. A percentage is unambiguous above
 * 1 and is accepted as one; `1` itself is read as 1.0, never 1%. Confidence is
 * metadata on a vote, not a gate, so this normalisation weakens nothing.
 */
export function normaliseConfidence(raw) {
  const value = typeof raw === 'string' ? Number(raw.replace(/%\s*$/, '')) : Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value > 1 ? value / 100 : value;
}

/** Wilson score interval; the honest interval for a handful of votes. */
export function wilsonInterval(wins, n, z = 1.96) {
  if (!Number.isInteger(n) || n <= 0) return null;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { low: round4(Math.max(0, centre - half)), high: round4(Math.min(1, centre + half)) };
}

/**
 * Aggregate unblinded rows into the win-rate table. Ties are votes but not
 * decisive votes; invalid rounds are counted and excluded. The claim-state is
 * derived here so a caller cannot promote an underpowered table by prose.
 */
export function aggregate(rows, { labelA, labelB }) {
  const valid = rows.filter((r) => r.valid);
  const winsA = valid.filter((r) => r.winner === 'A').length;
  const winsB = valid.filter((r) => r.winner === 'B').length;
  const ties = valid.filter((r) => r.winner === 'tie').length;
  const decisive = winsA + winsB;
  const invalid = rows.length - valid.length;
  const invalidReasons = rows.filter((r) => !r.valid).reduce((acc, r) => {
    acc[r.invalidReason ?? 'unknown'] = (acc[r.invalidReason ?? 'unknown'] ?? 0) + 1;
    return acc;
  }, {});
  const winRate = (wins) => (decisive === 0 ? null : round4(wins / decisive));
  const withTies = (wins) => (valid.length === 0 ? null : round4((wins + ties / 2) / valid.length));
  let claimState;
  if (rows.length === 0) claimState = 'OPEN';
  else if (valid.length === 0) claimState = 'INVALID';
  else if (decisive < MIN_DECISIVE_FOR_CLAIM) claimState = 'VERIFIED-UNDERPOWERED';
  else claimState = 'VERIFIED';
  const ciA = wilsonInterval(winsA, decisive);
  const meanConfidence = valid.length === 0 ? null
    : round4(valid.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / valid.length);
  return Object.freeze({
    contract: BLIND_AB_CONTRACT,
    stations: rows.length,
    valid: valid.length,
    invalid,
    invalidReasons,
    decisive,
    ties,
    candidates: {
      A: { label: labelA, wins: winsA, winRateDecisive: winRate(winsA), winRateWithHalfTies: withTies(winsA), wilson95: ciA },
      B: { label: labelB, wins: winsB, winRateDecisive: winRate(winsB), winRateWithHalfTies: withTies(winsB), wilson95: wilsonInterval(winsB, decisive) },
    },
    meanConfidence,
    claimState,
    // A CI that still contains 0.5 means the votes do not separate the two
    // builds; written into the table rather than left for a reader to infer.
    separates: Boolean(ciA && (ciA.low > 0.5 || ciA.high < 0.5)),
  });
}

export function renderWinRateTable(agg, rows) {
  const lines = [];
  const pct = (v) => (v === null || v === undefined ? '-' : `${Math.round(v * 1000) / 10}%`);
  lines.push(`| Candidate | Wins | Ties | Invalid | Win rate (decisive, n=${agg.decisive}) | Win rate (ties as half, n=${agg.valid}) | 95% Wilson (decisive) |`);
  lines.push('|---|---:|---:|---:|---:|---:|---|');
  for (const key of ['A', 'B']) {
    const c = agg.candidates[key];
    const ci = c.wilson95 ? `${pct(c.wilson95.low)} - ${pct(c.wilson95.high)}` : '-';
    lines.push(`| ${key}: ${c.label} | ${c.wins} | ${agg.ties} | ${agg.invalid} | ${pct(c.winRateDecisive)} | ${pct(c.winRateWithHalfTies)} | ${ci} |`);
  }
  lines.push('');
  lines.push(`Claim-state: **${agg.claimState}**${agg.claimState === 'VERIFIED-UNDERPOWERED' ? ` (fewer than ${MIN_DECISIVE_FOR_CLAIM} decisive votes)` : ''}. `
    + `Interval ${agg.separates ? 'EXCLUDES' : 'includes'} 50%, so the votes ${agg.separates ? 'separate' : 'do not separate'} the two builds. `
    + `Mean critic confidence ${agg.meanConfidence ?? '-'}.`);
  if (agg.invalid > 0) lines.push(`Invalid rounds: ${JSON.stringify(agg.invalidReasons)} - each carried no vote.`);
  lines.push('');
  lines.push('| Station | Left was | Right was | Critic said | Unblinded winner | Confidence | Probe L (expected/answered) | Probe R (expected/answered) | Elapsed | Claim-state |');
  lines.push('|---|---|---|---|---|---:|---|---|---:|---|');
  for (const r of rows) {
    lines.push(`| ${r.station} | ${r.assignment.left} | ${r.assignment.right} | ${r.winnerSide ?? '-'} | ${r.winner ?? '-'} | ${r.confidence ?? '-'} `
      + `| ${r.probes.left.expected}/${r.probes.left.answered ?? 'NONE'} | ${r.probes.right.expected}/${r.probes.right.answered ?? 'NONE'} `
      + `| ${r.elapsedMs === null || r.elapsedMs === undefined ? '-' : `${Math.round(r.elapsedMs / 100) / 10} s`} | ${r.valid ? 'VERIFIED' : `INVALID (${r.invalidReason})`} |`);
  }
  return lines.join('\n');
}

export function round4(n) { return Math.round(n * 1e4) / 1e4; }

// ---------------------------------------------------------------------------
// The critic instruction. Carries no label, no path, no history.
// ---------------------------------------------------------------------------

export function buildAbInstruction({ station, referenceCount }) {
  const lines = [];
  lines.push('FIRST INSTRUCTION, before anything else.');
  lines.push(`The last two attached images are two renders called LEFT and RIGHT (LEFT is attached before RIGHT). Each one has a small white box in its bottom-right corner containing four large black characters drawn in a blocky pixel font, from this set only: ${PROBE_ALPHABET.split('').join(' ')}. `
    + 'Read LEFT\'s four characters and report them as probes.left; read RIGHT\'s and report them as probes.right. The two codes are different. '
    + 'If you cannot see a box, write "NONE" for that side. Do not guess a plausible code: a wrong code makes this round invalid, which is the correct outcome when you did not receive pixels.');
  lines.push('');
  lines.push('WHAT YOU HAVE BEEN GIVEN, in order:');
  lines.push(`  1..${referenceCount}. THE REFERENCE SET: ${referenceCount} image(s) of the target this scene is meant to agree with.`);
  lines.push(`  ${referenceCount + 1}. LEFT  - a render of the scene from a fixed review camera.`);
  lines.push(`  ${referenceCount + 2}. RIGHT - a render of the SAME scene from the SAME camera, produced differently.`);
  lines.push('You are not told which render is older, newer, ours or anyone else\'s, and that is deliberate. Judge the pixels.');
  lines.push('');
  lines.push('THE QUESTION. Which of LEFT and RIGHT is CLOSER TO THE REFERENCE SET, and why? Judge agreement with the references on:');
  lines.push('  - structure and layout: are the same volumes, openings and objects present, in the same places?');
  lines.push('  - proportion: do the ratios agree?');
  lines.push('  - material read: does each surface read as the same material class the reference shows?');
  lines.push('  - value and lighting relationships: which plane is brightest, where shadows fall, how deep the contact shadow is. Absolute colour grade is NOT a criterion.');
  lines.push('Do NOT judge resolution, sharpness, the corner box, image order, or which one you find prettier. If the two are indistinguishable on every criterion, answer "tie": a tie is an honest answer, not a failure.');
  lines.push('');
  lines.push('EVERY CLAIM NAMES A REGION. Regions are the 3x3 grid ids r0c0 (top-left) through r2c2 (bottom-right) of the render.');
  lines.push('');
  lines.push('REPLY WITH ONE JSON OBJECT AND NOTHING ELSE. Shape:');
  lines.push(JSON.stringify({
    contract: BLIND_AB_CONTRACT,
    station,
    probes: { left: '<four characters from LEFT, or NONE>', right: '<four characters from RIGHT, or NONE>' },
    winner: 'left | right | tie',
    confidence: '<a fraction between 0 and 1, e.g. 0.78 - not a percentage>',
    why: 'One paragraph: the decisive differences against the reference set, each with a region id.',
    leftCloser: ['things LEFT does that agree with the references better, with region ids'],
    rightCloser: ['things RIGHT does that agree with the references better, with region ids'],
    largestDifference: { region: 'r1c1', what: 'the single biggest disagreement between LEFT and RIGHT' },
  }, null, 2));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Image preparation: neutral name, metadata stripped, probe stamped.
// ---------------------------------------------------------------------------

/**
 * Re-encode `sourcePath` as a bare PNG under a NEUTRAL name and stamp the probe.
 * sharp writes no EXIF/XMP/ICC/iTXt unless asked, so the composite is the
 * strip; the returned `metadata` is what the OUTPUT reports, so a test can
 * assert that no identifying field survived rather than trust this comment.
 */
export async function prepareBlindImage({ sourcePath, destPath, token }) {
  const stamp = await stampProbe(sourcePath, destPath, probeBlocks(token));
  const sharp = (await import('sharp')).default;
  const meta = await sharp(destPath).metadata();
  const leaked = ['exif', 'icc', 'xmp', 'iptc', 'tifftagPhotoshop'].filter((key) => meta[key] !== undefined);
  return {
    destPath,
    stamp,
    sha256: sha256File(destPath),
    metadata: { format: meta.format, width: meta.width, height: meta.height, leakedFields: leaked },
  };
}

/** Station ids both capture directories carry, excluding persistence samples and non-station shots. */
export function commonStations(aDir, bDir) {
  const list = (dir) => readdirSync(dir)
    .filter((name) => /\.png$/i.test(name) && !/\.s\d+\.png$/i.test(name))
    .filter((name) => !/^(hud|minimap)-/i.test(name))
    .map((name) => name.replace(/\.png$/i, ''));
  const b = new Set(list(bDir));
  return list(aDir).filter((id) => b.has(id)).sort();
}

// ---------------------------------------------------------------------------
// Optional capture step: both sides through the existing capture instrument,
// strictly one browser at a time.
// ---------------------------------------------------------------------------

export async function captureSide({ url, label, arena, stations, outRoot, sha = null, samples = 1, settleMs = 5000 }) {
  const out = join(outRoot, 'captures', label);
  const args = [
    resolve('scripts/qa/capture-arena-viewpoints.mjs'),
    '--url', url, '--label', label, '--arenas', arena, '--out', out,
    '--samples', String(samples), '--settle-ms', String(settleMs),
    ...(stations ? ['--cameras', stations.join(',')] : []),
    ...(sha ? ['--sha', sha] : []),
  ];
  const started = Date.now();
  const result = await execFileAsync(process.execPath, args, { maxBuffer: 16 * 1024 * 1024 })
    .then((r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }))
    .catch((error) => ({ code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? String(error) }));
  return { label, out: join(out, arena), code: result.code, elapsedMs: Date.now() - started, stderrTail: result.stderr.slice(-800) };
}

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------

function fixtureCritique({ fixtureDir, fixtures, station, expectedLeft, expectedRight }) {
  let body = null;
  if (fixtures && fixtures[station] !== undefined) body = fixtures[station];
  else if (fixtureDir && existsSync(join(fixtureDir, `${station}.json`))) body = JSON.parse(readFileSync(join(fixtureDir, `${station}.json`), 'utf8'));
  if (body === null) return { ok: false, text: null, meta: { error: `no fixture for ${station}`, elapsedMs: 0 } };
  // "ECHO" opts a fixture into being a well-behaved critic without knowing the
  // derived tokens; a fixture that hard-codes a wrong token exercises refusal.
  const probes = body.probes === 'ECHO' ? { left: expectedLeft, right: expectedRight }
    : { left: body.probes?.left === 'ECHO' ? expectedLeft : body.probes?.left, right: body.probes?.right === 'ECHO' ? expectedRight : body.probes?.right };
  const text = JSON.stringify({ ...body, probes });
  return { ok: true, text, meta: { fixture: station, elapsedMs: 0 } };
}

export async function runBlindAb({
  aDir, bDir, labelA, labelB, references, stations = null, critic = 'fixture', fixtureDir = null, fixtures = null,
  seed = DEFAULT_SEED, outDir, timeoutMs = 300_000, adapterFactory = null, log = () => {},
}) {
  if (!ADMITTED_CRITICS.includes(critic)) throw new RangeError(`critic "${critic}" is not admitted for A/B (${ADMITTED_CRITICS.join(' | ')})`);
  if (!existsSync(aDir) || !existsSync(bDir)) throw new Error(`capture directory missing: ${!existsSync(aDir) ? aDir : bDir}`);
  if (!Array.isArray(references) || references.length === 0) throw new Error('at least one reference image is required - an A/B with no reference is a taste poll');
  for (const ref of references) if (!existsSync(ref)) throw new Error(`reference missing: ${ref}`);
  const stationIds = stations ?? commonStations(aDir, bDir);
  if (stationIds.length === 0) throw new Error('no station is present in BOTH capture directories');
  mkdirSync(outDir, { recursive: true });

  let liveness = null;
  if (critic !== 'fixture') {
    const probeAdapter = adapterFactory ? adapterFactory({}) : await loadAdapter(critic, {});
    liveness = await probeAdapter.available();
    log(`[blind-ab] ${critic} liveness: ${liveness.ok ? 'ok' : 'FAILED'} - ${liveness.detail}`);
    if (!liveness.ok) throw new Error(`critic route ${critic} unavailable: ${liveness.detail}`);
  }

  const rows = [];
  for (const station of stationIds) {
    const aPath = join(aDir, `${station}.png`);
    const bPath = join(bDir, `${station}.png`);
    if (!existsSync(aPath) || !existsSync(bPath)) {
      rows.push({ station, valid: false, invalidReason: 'capture-missing', assignment: sideAssignment({ seed, station }), probes: { left: { expected: '-', answered: null }, right: { expected: '-', answered: null } }, winner: null, winnerSide: null, confidence: null, elapsedMs: null });
      continue;
    }
    const assignment = sideAssignment({ seed, station });
    const sideSource = { left: assignment.left === 'A' ? aPath : bPath, right: assignment.right === 'A' ? aPath : bPath };
    // The blind directory is the ONLY thing the critic route sees: neutral
    // names, no label anywhere in a path, and it doubles as the isolated cwd.
    const blindDir = join(outDir, station, 'blind');
    mkdirSync(blindDir, { recursive: true });
    const refPaths = references.map((ref, index) => {
      const dest = join(blindDir, `reference-${index + 1}${extname(ref).toLowerCase() || '.png'}`);
      copyFileSync(ref, dest);
      return dest;
    });
    const expected = {};
    const prepared = {};
    for (const side of SIDES) {
      const sourceSha = sha256File(sideSource[side]);
      expected[side] = abProbeToken({ seed, station, side, sha256: sourceSha });
      prepared[side] = await prepareBlindImage({ sourcePath: sideSource[side], destPath: join(blindDir, `${side}.png`), token: expected[side] });
      prepared[side].sourceSha256 = sourceSha;
    }
    const text = buildAbInstruction({ station, referenceCount: refPaths.length });
    writeFileSync(join(outDir, station, 'instruction.txt'), `${text}\n`);

    let call;
    if (critic === 'fixture') {
      call = fixtureCritique({ fixtureDir, fixtures, station, expectedLeft: expected.left, expectedRight: expected.right });
    } else {
      const adapter = adapterFactory ? adapterFactory({ cwd: blindDir, timeoutMs }) : await loadAdapter(critic, { cwd: blindDir, timeoutMs });
      // Files already sit in the isolated cwd under neutral names; the
      // adapter's own neutraliser would rename references to "capture-N".
      adapter.neutralise = ({ images, jsonPath }) => ({ images, jsonPath });
      call = await adapter.critique({ text, images: [...refPaths, prepared.left.destPath, prepared.right.destPath], jsonPath: null, criticId: station, cycle: 1, probeToken: `${expected.left}/${expected.right}` });
    }
    writeFileSync(join(outDir, station, 'critic-raw.txt'), `${call.text ?? ''}\n`);
    const parsed = call.ok ? extractJson(call.text) : null;
    const validation = call.ok
      ? validateAbResponse(parsed, { expectedLeft: expected.left, expectedRight: expected.right })
      : { valid: false, invalidReason: 'route-failed', errors: [call.meta?.error ?? call.meta?.failureMarker ?? 'route failed'], winnerSide: null, confidence: null, probeAnswers: { left: null, right: null } };
    const row = {
      station,
      assignment,
      valid: validation.valid,
      invalidReason: validation.invalidReason,
      errors: validation.errors,
      winnerSide: validation.winnerSide,
      winner: validation.valid ? unblind(validation.winnerSide, assignment) : null,
      confidence: validation.confidence,
      probes: {
        left: { expected: expected.left, answered: validation.probeAnswers.left },
        right: { expected: expected.right, answered: validation.probeAnswers.right },
      },
      images: {
        left: { candidate: assignment.left, source: sideSource.left, sourceSha256: prepared.left.sourceSha256, shownSha256: prepared.left.sha256, leakedFields: prepared.left.metadata.leakedFields },
        right: { candidate: assignment.right, source: sideSource.right, sourceSha256: prepared.right.sourceSha256, shownSha256: prepared.right.sha256, leakedFields: prepared.right.metadata.leakedFields },
        references: refPaths.map((p) => ({ shownAs: basename(p), sha256: sha256File(p) })),
      },
      why: parsed?.why ?? null,
      leftCloser: parsed?.leftCloser ?? null,
      rightCloser: parsed?.rightCloser ?? null,
      largestDifference: parsed?.largestDifference ?? null,
      elapsedMs: call.meta?.elapsedMs ?? null,
      route: critic,
      model: call.meta?.model ?? null,
    };
    rows.push(row);
    writeFileSync(join(outDir, station, 'verdict.json'), `${JSON.stringify(row, null, 2)}\n`);
    log(`[blind-ab] ${station.padEnd(40)} ${row.valid ? `${row.winnerSide} -> ${row.winner}` : `INVALID ${row.invalidReason}`}`
      + ` probes L ${expected.left}/${row.probes.left.answered ?? 'NONE'} R ${expected.right}/${row.probes.right.answered ?? 'NONE'}`
      + (row.elapsedMs ? ` ${Math.round(row.elapsedMs / 1000)} s` : ''));
  }

  const agg = aggregate(rows, { labelA, labelB });
  const receipt = {
    contract: BLIND_AB_CONTRACT,
    ranAt: new Date().toISOString(),
    critic,
    liveness,
    seed,
    candidates: { A: { label: labelA, dir: aDir }, B: { label: labelB, dir: bDir } },
    references: references.map((p) => ({ path: p, sha256: sha256File(p) })),
    stations: stationIds,
    aggregate: agg,
    rows,
  };
  writeFileSync(join(outDir, 'results.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(join(outDir, 'WIN-RATE.md'), `# Blind A/B win-rate - ${labelA} (A) vs ${labelB} (B)\n\nCritic: ${critic}. Seed: ${seed}. ${new Date().toISOString()}\n\n${renderWinRateTable(agg, rows)}\n`);
  return receipt;
}

/**
 * Re-judge a finished run from its stored raw critic outputs, WITHOUT calling
 * any critic again. This exists for exactly one reason: a validator defect
 * (see normaliseConfidence) must be repairable without re-rolling a model,
 * because a re-roll is the thing the loop refuses. The critic's words, the
 * side assignments and the expected probes are read back from the per-station
 * receipts; only the parse and the aggregation run again. The original
 * verdicts are kept beside the new ones as `verdict.original.json`.
 */
export function revalidateRun(outDir) {
  const receiptPath = join(outDir, 'results.json');
  if (!existsSync(receiptPath)) throw new Error(`no results.json under ${outDir}`);
  const previous = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const rows = [];
  for (const station of previous.stations) {
    const verdictPath = join(outDir, station, 'verdict.json');
    const rawPath = join(outDir, station, 'critic-raw.txt');
    if (!existsSync(verdictPath)) { rows.push(previous.rows.find((r) => r.station === station)); continue; }
    const old = JSON.parse(readFileSync(verdictPath, 'utf8'));
    const originalPath = join(outDir, station, 'verdict.original.json');
    if (!existsSync(originalPath)) copyFileSync(verdictPath, originalPath);
    if (old.invalidReason === 'route-failed' || old.invalidReason === 'capture-missing' || !existsSync(rawPath)) { rows.push(old); continue; }
    const parsed = extractJson(readFileSync(rawPath, 'utf8'));
    const validation = validateAbResponse(parsed, { expectedLeft: old.probes.left.expected, expectedRight: old.probes.right.expected });
    const row = {
      ...old,
      valid: validation.valid,
      invalidReason: validation.invalidReason,
      errors: validation.errors,
      winnerSide: validation.winnerSide,
      winner: validation.valid ? unblind(validation.winnerSide, old.assignment) : null,
      confidence: validation.confidence,
      probes: {
        left: { expected: old.probes.left.expected, answered: validation.probeAnswers.left },
        right: { expected: old.probes.right.expected, answered: validation.probeAnswers.right },
      },
      why: parsed?.why ?? null,
      leftCloser: parsed?.leftCloser ?? null,
      rightCloser: parsed?.rightCloser ?? null,
      largestDifference: parsed?.largestDifference ?? null,
      revalidated: { at: new Date().toISOString(), previousInvalidReason: old.invalidReason, previousErrors: old.errors ?? null },
    };
    rows.push(row);
    writeFileSync(verdictPath, `${JSON.stringify(row, null, 2)}\n`);
  }
  const agg = aggregate(rows, { labelA: previous.candidates.A.label, labelB: previous.candidates.B.label });
  const receipt = { ...previous, aggregate: agg, rows, revalidatedAt: new Date().toISOString(), originalAggregate: previous.originalAggregate ?? previous.aggregate };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(join(outDir, 'WIN-RATE.md'), `# Blind A/B win-rate - ${previous.candidates.A.label} (A) vs ${previous.candidates.B.label} (B)\n\nCritic: ${previous.critic}. Seed: ${previous.seed}. Ran ${previous.ranAt}; re-validated from stored raw verdicts ${receipt.revalidatedAt} (no critic was called again).\n\n${renderWinRateTable(agg, rows)}\n`);
  return receipt;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { args[key] = true; continue; }
    args[key] = next;
    i += 1;
  }
  return args;
}

function listReferences(spec) {
  const entries = String(spec).split(',').map((s) => s.trim()).filter(Boolean).map((p) => resolve(p));
  const out = [];
  for (const entry of entries) {
    if (existsSync(entry) && statSync(entry).isDirectory()) {
      for (const name of readdirSync(entry).filter((n) => /\.(png|jpe?g|webp)$/i.test(n)).sort()) out.push(join(entry, name));
    } else {
      out.push(entry);
    }
  }
  return out;
}

async function main(argv) {
  const args = parseArgs(argv);
  const usage = 'usage: node scripts/loop/blind-ab.mjs --a-dir <dir> --a-label <label> --b-dir <dir> --b-label <label> --references <img,dir,...> --out <dir> [--critic omp-muse|omp-gemini|fixture] [--fixture-dir <dir>] [--stations a,b] [--seed <s>] [--max-references 4] [--capture-a-url <url> --capture-b-url <url> --arena <id>]';
  if (args.revalidate) {
    const receipt = revalidateRun(resolve(String(args.revalidate)));
    console.log(JSON.stringify({ contract: receipt.contract, critic: receipt.critic, aggregate: receipt.aggregate, originalAggregate: receipt.originalAggregate, out: resolve(String(args.revalidate)) }, null, 2));
    console.log(renderWinRateTable(receipt.aggregate, receipt.rows));
    return;
  }
  let aDir = args['a-dir'] ? resolve(args['a-dir']) : null;
  let bDir = args['b-dir'] ? resolve(args['b-dir']) : null;
  const outDir = resolve(args.out ?? 'artifacts/blind-ab');
  const stations = args.stations ? String(args.stations).split(',').map((s) => s.trim()).filter(Boolean) : null;
  const labelA = args['a-label'] ?? 'A';
  const labelB = args['b-label'] ?? 'B';
  if (args['capture-a-url'] || args['capture-b-url']) {
    if (!args['capture-a-url'] || !args['capture-b-url'] || !args.arena) { console.error(usage); process.exitCode = 2; return; }
    // Sequential on purpose: one headless browser at a time on a shared GPU.
    const capA = await captureSide({ url: args['capture-a-url'], label: labelA, arena: args.arena, stations, outRoot: outDir });
    console.error(`[blind-ab] captured ${labelA}: exit ${capA.code} in ${Math.round(capA.elapsedMs / 1000)} s`);
    const capB = await captureSide({ url: args['capture-b-url'], label: labelB, arena: args.arena, stations, outRoot: outDir });
    console.error(`[blind-ab] captured ${labelB}: exit ${capB.code} in ${Math.round(capB.elapsedMs / 1000)} s`);
    if (capA.code !== 0 || capB.code !== 0) { console.error('[blind-ab] a capture failed; not judging a partial set'); console.error(capA.stderrTail, capB.stderrTail); process.exitCode = 1; return; }
    aDir = capA.out;
    bDir = capB.out;
  }
  if (!aDir || !bDir || !args.references) { console.error(usage); process.exitCode = 2; return; }
  const maxReferences = Number(args['max-references'] ?? 4);
  const references = listReferences(args.references).slice(0, maxReferences);
  const receipt = await runBlindAb({
    aDir, bDir, labelA, labelB, references, stations,
    critic: args.critic ?? 'fixture',
    fixtureDir: args['fixture-dir'] ? resolve(args['fixture-dir']) : null,
    seed: args.seed ?? DEFAULT_SEED,
    outDir,
    timeoutMs: args['timeout-ms'] ? Number(args['timeout-ms']) : 300_000,
    log: (line) => console.error(line),
  });
  console.log(JSON.stringify({ contract: receipt.contract, critic: receipt.critic, aggregate: receipt.aggregate, out: outDir }, null, 2));
  console.log(renderWinRateTable(receipt.aggregate, receipt.rows));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
