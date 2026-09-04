#!/usr/bin/env node
// Reference-grounded loop - the journalled runner. Contract: reference-loop-v1.
//
// This replaces a .cmd chain whose whole persistent state was two text files
// containing "C" and "FINAL". Everything the lane brief asked to be enforced -
// the plateau rule, the budget, the validity of a critic - is evaluated here
// mechanically, from the journal, and written back to it.
//
// REFUSED IN CODE, not by convention. There is deliberately no flag to:
//   - lower a gate or a threshold,
//   - edit or drop a judgeset camera,
//   - re-run a critic until it agrees,
//   - use the rationed Codex route for a routine cycle,
//   - show a critic a source the reference set did not allow-list.
// A builder at 03:00 cannot do any of those by hand either, because the runner
// re-derives them from the manifest every cycle.
//
// Usage:
//   node scripts/loop/run-loop.mjs --subject <id> --dry-run
//   node scripts/loop/run-loop.mjs --subject <id> --critic-adapter qwen-local --critics A
//   node scripts/loop/run-loop.mjs --subject <id> --print-plan

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { precheck } from './precheck.mjs';
import { validateReferenceSet, criticTargetSources } from './reference-set.mjs';
import { buildCriticRound } from './critic-prompt.mjs';
import { validateCriticResponse, extractJson, ROW_GATE_SCORE } from './critic-schema.mjs';
import { probeToken } from './probe.mjs';
import { sha256File } from './image.mjs';
import { loadAdapter } from './adapters/index.mjs';
import {
  openJournal, appendEvent, readJournal, cycleEvents, writeState, readState,
  evaluateStopState, meanValidTotal, modalLargestGap, STOP_RULES,
} from './journal.mjs';

export const LOOP_CONTRACT = 'reference-loop-v1';
export const REFERENCES_ROOT = 'docs/references';
export const ARTIFACTS_ROOT = 'artifacts/loop';

// Machine-sharing constraints. Dave runs ComfyUI, ollama and llama.cpp on this
// PC; the capture harness refuses below the VRAM floor; one browser at a time.
export const PREFLIGHT = Object.freeze({
  vramFreeMinMiB: 3000,
  comfyQueueUrl: 'http://127.0.0.1:8188/queue',
  browserPortRange: [4280, 4289],
});

export function manifestPath(repoRoot, subject) {
  return join(repoRoot, REFERENCES_ROOT, subject, 'manifest.json');
}

export function loadManifest(repoRoot, subject) {
  const path = manifestPath(repoRoot, subject);
  if (!existsSync(path)) throw new Error(`no reference set at ${path} - a subject with no reference set cannot be scored, only rubric-graded`);
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const validation = validateReferenceSet(manifest);
  if (!validation.ok) {
    throw new Error(`reference set ${subject} is invalid:\n  ${validation.errors.join('\n  ')}`);
  }
  return { manifest, path, warnings: validation.warnings };
}

/** Resolve the reference/capture pairs a critic is allowed to be shown. */
export function resolvePairs(repoRoot, manifest) {
  const allowed = criticTargetSources(manifest);
  const pairs = [];
  for (const pair of manifest.pairs ?? []) {
    const source = allowed.find((s) => s.id === pair.sourceId);
    if (!source) {
      // Not an error in the manifest sense - it is the allow-list doing its job.
      pairs.push({ ...pair, skipped: 'sourceId is not an allow-listed critic target', referencePath: null, capturePath: null });
      continue;
    }
    pairs.push({
      ...pair,
      source,
      referencePath: resolve(repoRoot, source.localPath ?? source.cachePath),
      capturePath: resolve(repoRoot, pair.capture),
    });
  }
  return pairs;
}

async function preflight({ skip = false } = {}) {
  if (skip) return { ok: true, checks: [{ name: 'preflight', ok: true, detail: 'skipped (--no-preflight): no capture will be taken this run' }] };
  const checks = [];
  try {
    const response = await fetch(PREFLIGHT.comfyQueueUrl, { signal: AbortSignal.timeout(5000) });
    const body = await response.json();
    const busy = (body.queue_running?.length ?? 0) + (body.queue_pending?.length ?? 0);
    checks.push({ name: 'comfyui-queue', ok: busy === 0, detail: `${busy} item(s) queued` });
  } catch (error) {
    checks.push({ name: 'comfyui-queue', ok: true, detail: `not reachable (${error.name}) - treated as idle` });
  }
  return { ok: checks.every((c) => c.ok), checks };
}

/**
 * One critic round, end to end: build the prompt, stamp the probe, call the
 * adapter, validate the response against the schema AND the tier-0 measurement.
 */
export async function runCriticRound({
  adapter, manifest, subject, cycle, criticId, pair, precheckResult, precheckPath, outDir, dryRun,
}) {
  const captureSha256 = dryRun && !existsSync(pair.capturePath) ? 'f'.repeat(64) : sha256File(pair.capturePath);
  const round = await buildCriticRound({
    manifest, subject, cycle, criticId,
    referencePath: pair.referencePath,
    capturePath: pair.capturePath,
    captureSha256,
    precheck: precheckResult,
    precheckPath,
    outDir,
    dryRun,
  });
  const expected = probeToken({ subject, cycle, criticId, captureSha256 });
  const call = await adapter.critique({
    text: round.text,
    images: round.attachments.filter((p) => /\.(png|jpe?g|webp)$/i.test(p)),
    jsonPath: precheckPath,
    jsonText: JSON.stringify(precheckResult),
    criticId,
    cycle,
    probeToken: expected,
  });
  if (!call.ok) {
    return { criticId, valid: false, invalidReason: 'route-failed', total: null, route: adapter.id, meta: call.meta, expectedProbe: expected };
  }
  const parsed = extractJson(call.text);
  const validation = validateCriticResponse(parsed, { expectedProbe: expected, precheck: precheckResult });
  return {
    criticId,
    valid: validation.valid,
    invalidReason: validation.invalidReason,
    errors: validation.errors,
    warnings: validation.warnings,
    total: validation.total,
    rowsBelowGate: validation.rowsBelowGate,
    largestGap: parsed?.largestGap ?? null,
    contractConflict: parsed?.contractConflict ?? null,
    notMatchable: parsed?.notMatchable ?? [],
    decision: parsed?.decision ?? null,
    route: adapter.id,
    meta: call.meta,
    expectedProbe: expected,
    answeredProbe: parsed?.sawImages?.answer ?? null,
    response: parsed,
    rawPath: round.stampedPath,
  };
}

export async function runCycle({
  repoRoot, subject, manifest, cycle, adapter, critics, outDir, dryRun, journalPath,
}) {
  const pairs = resolvePairs(repoRoot, manifest).filter((p) => !p.skipped);
  if (pairs.length === 0) {
    throw new Error(`subject ${subject} has no allow-listed reference/capture pair. A capture with no matched reference gets a rubric-only verdict, which cannot reach the exit gate.`);
  }
  mkdirSync(outDir, { recursive: true });

  // Tier 0 first, always. A vision model is never asked to adjudicate something
  // a 40 ms script already knows.
  const prechecks = [];
  for (const pair of pairs) {
    const precheckPath = join(outDir, `precheck-${pair.id}.json`);
    const result = await precheck({
      referencePath: pair.referencePath,
      capturePath: pair.capturePath,
      regions: pair.regions ?? null,
      compositePath: join(outDir, `composite-${pair.id}.png`),
    });
    writeFileSync(precheckPath, `${JSON.stringify(result, null, 2)}\n`);
    prechecks.push({ pair, result, precheckPath });
  }

  // Score against the worst pair: the loop corrects the largest gap, so the
  // pair that agrees least is the one that decides the cycle.
  const primary = prechecks.slice().sort((a, b) => (b.result.worstRegion?.disagreement ?? 0) - (a.result.worstRegion?.disagreement ?? 0))[0];

  const criticResults = [];
  for (const criticId of critics) {
    const result = await runCriticRound({
      adapter, manifest, subject, cycle, criticId,
      pair: primary.pair,
      precheckResult: primary.result,
      precheckPath: primary.precheckPath,
      outDir, dryRun,
    });
    // The journal records the VERDICT; the evidence directory records what was
    // actually said. An invalid round's raw text is the most useful artefact
    // there is when working out why a route cannot be trusted, so it is written
    // out whether or not the round was valid.
    writeFileSync(join(outDir, `critic-${criticId}-verdict.json`), `${JSON.stringify({
      criticId, route: result.route, valid: result.valid, invalidReason: result.invalidReason,
      expectedProbe: result.expectedProbe, answeredProbe: result.answeredProbe,
      total: result.total, rowsBelowGate: result.rowsBelowGate, errors: result.errors ?? null,
      warnings: result.warnings ?? null, meta: result.meta ?? null, response: result.response ?? null,
    }, null, 2)}\n`);
    criticResults.push(result);
  }

  const validCritics = criticResults.filter((c) => c.valid).length;
  const meanTotal = meanValidTotal(criticResults);
  const gapRow = modalLargestGap(criticResults);
  const gapRegions = criticResults.find((c) => c.valid && c.largestGap?.row === gapRow)?.largestGap?.regions ?? [];
  const allRowsPassGate = validCritics >= STOP_RULES.minValidCritics
    && criticResults.filter((c) => c.valid).every((c) => (c.rowsBelowGate ?? ['unknown']).length === 0);
  const overClaiming = criticResults.filter((c) => c.valid && (c.notMatchable ?? []).length === 0).map((c) => c.criticId);

  const history = cycleEvents(readJournal(journalPath));
  const previous = history.filter((c) => Number.isFinite(c.meanTotal)).slice(-1)[0] ?? null;

  const event = {
    event: 'cycle-complete',
    contract: LOOP_CONTRACT,
    subject,
    cycle,
    adapter: adapter.id,
    pair: primary.pair.id,
    precheck: {
      ssim: primary.result.global.ssim,
      edgeIoU: primary.result.global.edgeIoU,
      valueEMD: primary.result.global.valueEMD,
      worstRegion: primary.result.worstRegion?.id ?? null,
      worstRegionDisagreement: primary.result.worstRegion?.disagreement ?? null,
      aspectMismatch: primary.result.aspectMismatch,
    },
    critics: criticResults.map((c) => ({
      id: c.criticId, valid: c.valid, invalidReason: c.invalidReason, total: c.total,
      rowsBelowGate: c.rowsBelowGate, largestGap: c.largestGap?.row ?? null,
      expectedProbe: c.expectedProbe, answeredProbe: c.answeredProbe,
      contractConflict: c.contractConflict, route: c.route, elapsedMs: c.meta?.elapsedMs ?? null,
      // A route failure must be diagnosable from the journal alone. The first
      // real call on this loop failed in 27 ms with an HTTP 401 and the journal
      // said only "route-failed", which sent the reader looking at the wrong
      // layer. Carry the transport detail.
      routeDetail: c.invalidReason === 'route-failed'
        ? { httpStatus: c.meta?.httpStatus ?? null, exitCode: c.meta?.exitCode ?? null, error: c.meta?.error ?? null, failureMarker: c.meta?.failureMarker ?? null }
        : null,
      schemaErrors: c.valid ? null : (c.errors ?? null),
    })),
    validCritics,
    meanTotal,
    deltaFromPrev: meanTotal !== null && previous ? Math.round((meanTotal - previous.meanTotal) * 100) / 100 : null,
    largestGapRow: gapRow,
    largestGapRegions: gapRegions,
    allRowsPassGate,
    overClaimingCritics: overClaiming,
    evidenceDir: outDir,
  };
  return { event, criticResults, prechecks };
}

export async function runLoop(options) {
  const {
    repoRoot, subject, adapterName = 'fixture', adapterOptions = {}, critics = ['A', 'B', 'C'],
    cyclesMax = 6, dryRun = false, skipPreflight = false, evidenceRoot = null,
  } = options;

  const { manifest, warnings } = loadManifest(repoRoot, subject);
  const journalPath = join(repoRoot, ARTIFACTS_ROOT, subject, 'journal.jsonl');
  const statePath = join(repoRoot, ARTIFACTS_ROOT, subject, 'state.json');
  openJournal(journalPath);

  const pre = await preflight({ skip: skipPreflight || dryRun });
  appendEvent(journalPath, { event: 'preflight', subject, ok: pre.ok, checks: pre.checks, dryRun });
  if (!pre.ok) {
    appendEvent(journalPath, { event: 'run-stop', subject, state: 'preflight-failed', reason: pre.checks.filter((c) => !c.ok).map((c) => c.name).join(', ') });
    return { stopped: true, state: 'preflight-failed', journalPath };
  }

  const adapter = await loadAdapter(adapterName, adapterOptions);
  if (adapter.rationed && !options.allowRationed) {
    throw new Error(`adapter ${adapter.id} is rationed and refuses a routine cycle. Route it to a contract conflict or the final pre-review only.`);
  }
  const availability = await adapter.available();
  appendEvent(journalPath, { event: 'adapter', subject, adapter: adapter.id, describe: adapter.describe(), available: availability });
  if (!availability.ok) {
    appendEvent(journalPath, { event: 'run-stop', subject, state: 'adapter-unavailable', reason: availability.detail });
    return { stopped: true, state: 'adapter-unavailable', journalPath, detail: availability.detail };
  }
  for (const warning of warnings) appendEvent(journalPath, { event: 'reference-set-warning', subject, warning });

  const resumed = readState(statePath);
  let cycle = (resumed?.cycle ?? 0) + 1;
  let plateauEscalationsUsed = resumed?.plateauEscalationsUsed ?? 0;
  const started = Date.now();

  for (;;) {
    const outDir = join(evidenceRoot ?? join(repoRoot, ARTIFACTS_ROOT, subject), `cycle-${cycle}`);
    const { event } = await runCycle({ repoRoot, subject, manifest, cycle, adapter, critics, outDir, dryRun, journalPath });
    const stop = evaluateStopState(
      [...cycleEvents(readJournal(journalPath)), event],
      { cyclesMax, plateauEscalationsUsed },
    );
    event.decision = stop.stop ? 'stop' : (stop.state === 'plateau-escalated' ? 'refine-spec' : 'refine-code');
    event.stopState = stop.state;
    event.stopReason = stop.reason;
    event.budget = { cyclesUsed: cycle, cyclesMax, wallClockMinUsed: Math.round((Date.now() - started) / 60000) };
    appendEvent(journalPath, event);
    if (stop.state === 'plateau-escalated') plateauEscalationsUsed += 1;
    writeState(statePath, {
      contract: LOOP_CONTRACT, subject, cycle, phase: stop.stop ? 'stopped' : 'awaiting-build',
      lastDecision: event.decision, stopState: stop.state, plateauEscalationsUsed, journalPath,
    });
    if (stop.stop) {
      appendEvent(journalPath, { event: 'run-stop', subject, state: stop.state, reason: stop.reason, detail: stop.detail });
      return { stopped: true, state: stop.state, reason: stop.reason, cycle, journalPath, statePath };
    }
    // A cycle ends at a DECISION, not at a rebuild. The build step is a
    // separate, human- or builder-owned action so the runner can never both
    // propose and apply a change to the thing it is grading.
    return { stopped: false, state: stop.state, reason: stop.reason, cycle, decision: event.decision, journalPath, statePath };
  }
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

async function main(argv) {
  const args = parseArgs(argv);
  const repoRoot = resolve(args['repo-root'] ?? process.cwd());
  if (!args.subject) {
    console.error('usage: node scripts/loop/run-loop.mjs --subject <id> [--dry-run] [--critic-adapter fixture|qwen-local|omp-gemini|codex] [--critics A,B,C] [--print-plan]');
    process.exitCode = 2;
    return;
  }
  const subject = String(args.subject);
  if (args['print-plan']) {
    const { manifest } = loadManifest(repoRoot, subject);
    console.log(JSON.stringify({
      contract: LOOP_CONTRACT, subject,
      criticTargets: criticTargetSources(manifest).map((s) => ({ id: s.id, tier: s.tier, kind: s.kind })),
      pairs: resolvePairs(repoRoot, manifest).map((p) => ({ id: p.id, skipped: p.skipped ?? null, reference: p.referencePath, capture: p.capturePath })),
      rowGateScore: ROW_GATE_SCORE, stopRules: STOP_RULES,
    }, null, 2));
    return;
  }
  const result = await runLoop({
    repoRoot,
    subject,
    adapterName: args['critic-adapter'] ?? (args['dry-run'] ? 'fixture' : 'qwen-local'),
    adapterOptions: args['fixture-dir'] ? { dir: resolve(args['fixture-dir']) } : {},
    critics: (args.critics ? String(args.critics) : 'A,B,C').split(',').map((s) => s.trim()).filter(Boolean),
    cyclesMax: args.cycles ? Number(args.cycles) : 6,
    dryRun: Boolean(args['dry-run']),
    skipPreflight: Boolean(args['no-preflight']),
    evidenceRoot: args['evidence-root'] ? resolve(args['evidence-root']) : null,
  });
  console.log(JSON.stringify(result, null, 2));
}

// process.argv[1] is undefined when this module is imported from `node -e`,
// and pathToFileURL(undefined) throws before anything else can run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
