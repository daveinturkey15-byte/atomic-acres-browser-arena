#!/usr/bin/env node
// Bounded Build17 runtime/frame-stall gate.
//
// This probe uses the production debug surface only to stage the same actions
// used by the focused browser regressions. It does not patch renderer methods,
// inject fake event messages, or change quality/timer settings. The probe is
// intentionally separate from the pass/release gates: a red result is runtime
// evidence, never a reason to weaken a threshold.

import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

export function percentile(values, p) {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil((p / 100) * finite.length) - 1));
  return finite[index];
}

export function summarizeCadence(gaps, warmupMs = 0, endMs = Number.POSITIVE_INFINITY) {
  const samples = gaps.filter((entry) => entry.atMs >= warmupMs && entry.atMs < endMs && Number.isFinite(entry.gapMs));
  const values = samples.map((entry) => entry.gapMs).filter((gap) => gap > 0);
  const fps = values.map((gap) => 1000 / gap);
  return {
    sampleCount: values.length,
    medianGapMs: percentile(values, 50),
    p95GapMs: percentile(values, 95),
    p99GapMs: percentile(values, 99),
    maxGapMs: values.length ? Math.max(...values) : null,
    medianFps: percentile(fps, 50),
    p05Fps: percentile(fps, 5),
    p01Fps: percentile(fps, 1),
    stallCount100ms: values.filter((gap) => gap >= 100).length,
    stallCount250ms: values.filter((gap) => gap >= 250).length,
    stallCount1000ms: values.filter((gap) => gap >= 1_000).length,
  };
}

export function summarizePresentation(samples, warmupMs = 0, endMs = Number.POSITIVE_INFINITY) {
  const rows = samples.filter((entry) => entry.atMs >= warmupMs && entry.atMs < endMs && entry.counters);
  const submissionGaps = rows.map((entry) => entry.telemetry?.progress?.currentSubmissionGapMs).filter(Number.isFinite);
  const completionGaps = rows.map((entry) => entry.telemetry?.progress?.currentCompletionGapMs).filter(Number.isFinite);
  const completionLatencies = rows.map((entry) => entry.counters.lastCompletionLatencyMs).filter(Number.isFinite);
  const submitted = rows.length ? rows[rows.length - 1].counters.submissionSequence - rows[0].counters.submissionSequence : 0;
  const completed = rows.length ? rows[rows.length - 1].counters.completedSequence - rows[0].counters.completedSequence : 0;
  return {
    sampleCount: rows.length,
    submissionAdvances: submitted,
    completionAdvances: completed,
    maxInFlight: rows.length ? Math.max(...rows.map((entry) => entry.counters.inFlightSubmissions)) : null,
    maxCompletionLatencyMs: completionLatencies.length ? Math.max(...completionLatencies) : null,
    p95CompletionLatencyMs: percentile(completionLatencies, 95),
    p99CompletionLatencyMs: percentile(completionLatencies, 99),
    maxSubmissionGapMs: submissionGaps.length ? Math.max(...submissionGaps) : null,
    maxCompletionGapMs: completionGaps.length ? Math.max(...completionGaps) : null,
    statuses: [...new Set(rows.map((entry) => entry.telemetry?.status).filter(Boolean))],
  };
}

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function numberArg(name, fallback) {
  const value = Number(arg(name, String(fallback)));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sourceEvidence() {
  let sha = 'unknown';
  let status = 'unknown';
  try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* report unknown */ }
  try { status = execFileSync('git', ['status', '--short', '--branch'], { encoding: 'utf8' }).trim(); } catch { /* report unknown */ }
  return { sha, status };
}

function hostEvidence() {
  let memory = null;
  let processes = null;
  try {
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      '$os=Get-CimInstance Win32_OperatingSystem; $cs=Get-CimInstance Win32_ComputerSystem; [pscustomobject]@{availableMb=[math]::Round($os.FreePhysicalMemory/1024,1); totalMb=[math]::Round($cs.TotalPhysicalMemory/1MB,1); processCount=(Get-Process).Count} | ConvertTo-Json -Compress'],
    { encoding: 'utf8', timeout: 10_000 });
    const parsed = JSON.parse(raw);
    memory = { availableMb: parsed.availableMb, totalMb: parsed.totalMb };
    processes = parsed.processCount;
  } catch (error) {
    memory = { error: String(error).slice(0, 180) };
  }
  return { memory, processes };
}

async function readContentionEvidence(path) {
  if (!path) return null;
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    return {
      path,
      status: value.status ?? null,
      classification: value.classification ?? null,
      childExitCode: value.childExitCode ?? null,
      preflight: value.preflight ? {
        availableGatePass: value.preflight.availableGatePass,
        commitGatePass: value.preflight.commitGatePass,
        availableMb: value.preflight.samples?.at(-1)?.availableMb ?? null,
        commitPercent: value.preflight.samples?.at(-1)?.commitPercent ?? null,
      } : null,
    };
  } catch (error) {
    return { path, error: String(error).slice(0, 180) };
  }
}

async function main() {
  const base = arg('--url', 'http://127.0.0.1:41996/updates/slice17/');
  const profiles = arg('--profiles', 'quality,performance').split(',').map((entry) => entry.trim()).filter(Boolean);
  const warmupMs = numberArg('--warmup-ms', 8_000);
  const steadyMs = numberArg('--steady-ms', 10_000);
  const eventSettleMs = numberArg('--event-settle-ms', 1_500);
  const out = resolve(arg('--out', 'C:/Users/david/Documents/Codex/2026-09-11/p-le/work/continued-world-20260913/recovery/runtime-stability/runtime-stability-build17.json'));
  const contentionPath = arg('--contention-evidence', 'C:/Users/david/Documents/Codex/2026-09-11/p-le/work/continued-world-20260913/recovery/interiors-generation-control/supervisor-evidence/supervisor-terminal.json');
  const evidence = sourceEvidence();
  const startedAt = new Date().toISOString();
  const rows = [];
  const errors = [];
  const contention = await readContentionEvidence(contentionPath);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
  });

  try {
    for (const profile of profiles) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push({ message: error.message, stack: error.stack ?? null }));
      const session = await page.context().newCDPSession(page);
      try { await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch { /* Chromium variant */ }
      const url = `${base}${base.includes('?') ? '&' : '?'}release=latest&renderer=webgpu&render=${encodeURIComponent(profile)}&seed=runtime-stability-build17&previewTime=0&touch=0`;
      const row = {
        profile,
        url,
        browser: { channel: 'chrome', headless: true, viewport: { width: 1280, height: 720 } },
        phaseMarks: [],
        actions: [],
        pageErrors,
      };
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
        await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
        await page.evaluate(() => {
          const probe = {
            raf: [],
            presentation: [],
            longtasks: [],
            fps: [],
            phaseMarks: [],
            actions: [],
            running: true,
          };
          window.__RUNTIME_STABILITY_PROBE__ = probe;
          let prior = performance.now();
          const frame = (now) => {
            if (!probe.running) return;
            probe.raf.push({ atMs: now, gapMs: now - prior });
            prior = now;
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
          if (typeof PerformanceObserver !== 'undefined') {
            try {
              const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) probe.longtasks.push({ atMs: entry.startTime, durationMs: entry.duration });
              });
              observer.observe({ type: 'longtask', buffered: true });
              probe.longtaskObserver = observer;
            } catch { /* unsupported */ }
          }
          probe.presentationTimer = setInterval(() => {
            try {
              const api = window.__ATOMIC_ACRES_DEBUG__;
              const counters = api.samplePresentationCounters?.() ?? null;
              const telemetry = api.samplePresentationTelemetry?.() ?? null;
              probe.presentation.push({ atMs: performance.now(), counters, telemetry });
              const fpsText = document.querySelector('#fps-counter b')?.textContent ?? '';
              const fps = Number.parseFloat(fpsText);
              if (Number.isFinite(fps)) probe.fps.push({ atMs: performance.now(), fps });
            } catch { /* transient boot/retirement state */ }
          }, 50);
          probe.telemetryTimer = setInterval(() => {
            try {
              const api = window.__ATOMIC_ACRES_DEBUG__;
              const pose = api.samplePlayerPose?.();
              probe.pose = probe.pose ?? [];
              if (pose) probe.pose.push({ atMs: performance.now(), ...pose });
            } catch { /* transient */ }
          }, 250);
        });
        const debug = async (expression) => page.evaluate((source) => {
          const api = window.__ATOMIC_ACRES_DEBUG__;
          // The expression is selected from this probe's fixed action table below;
          // it is never supplied by the page or a network response.
          switch (source) {
            case 'select-world': return api.selectArena('world-studio');
            case 'select-atomic': return api.selectArena('atomic-acres');
            case 'start': return api.startSolo();
            case 'warm-read': return ({ snapshot: api.snapshot(), runtime: api.snapshot().render?.runtime ?? null });
            case 'grenade': return api.throwGrenade();
            case 'set-grenades': return api.setGrenades(5);
            case 'stage-window-0': return api.stageWindow(0, 1.1);
            case 'stage-window-1': return api.stageWindow(1, 1.1);
            case 'stage-window-2': return api.stageWindow(2, 1.1);
            case 'stage-window-3': return api.stageWindow(3, 1.1);
            case 'fire': return api.fireOnce();
            case 'support-grant': return api.earnSupport(15);
            case 'support-scout': return api.activateSupport('scout-sweep');
            case 'support-yardhawk': return api.activateSupport('yardhawk');
            case 'support-carpet': return api.activateSupport('carpet-bomber');
            case 'support-chopper': return api.activateKillstreak('chopper');
            case 'support-drone': return api.activateKillstreak('piloted-drone');
            case 'support-swarm': return api.activateKillstreak('drone-swarm');
            case 'damage': return api.damage(999);
            case 'respawn': return api.respawn();
            case 'end-match': return api.endMatch();
            case 'return-menu': return api.returnToMainMenu();
            default: throw new Error(`unknown fixed runtime probe action ${source}`);
          }
        }, expression);
        const mark = async (label) => page.evaluate((name) => {
          const probe = window.__RUNTIME_STABILITY_PROBE__;
          const mark = { label: name, atMs: performance.now() };
          probe.phaseMarks.push(mark);
          return mark;
        }, label);
        const action = async (label, expression) => {
          const started = await page.evaluate((name) => ({ label: name, atMs: performance.now() }), label);
          let result = null;
          let error = null;
          try { result = await debug(expression); } catch (caught) { error = String(caught); }
          const ended = await page.evaluate(() => performance.now());
          const record = { label, expression, startedAtMs: started.atMs, endedAtMs: ended, durationMs: ended - started.atMs, error, resultType: typeof result };
          row.actions.push(record);
          await page.evaluate((entry) => window.__RUNTIME_STABILITY_PROBE__.actions.push(entry), record);
          if (error) throw new Error(`${label}: ${error}`);
          return result;
        };
        await action('select-world-studio', 'select-world');
        await action('start-solo', 'start');
        await page.waitForFunction(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
          return snapshot?.matchPhase === 'active' && snapshot?.gameStarted === true;
        }, undefined, { timeout: 180_000 });
        row.boot = await page.evaluate(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph?.();
          const studioRoots = [];
          const studioMeshes = [];
          scene?.traverse?.((node) => {
            if (node.name?.includes('world-studio')) {
              studioRoots.push({ name: node.name, type: node.type, visible: node.visible, userDataKeys: Object.keys(node.userData ?? {}).sort() });
            }
            if (!node.isMesh || !node.name?.includes('world-studio')) return;
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            studioMeshes.push({
              name: node.name,
              visible: node.visible,
              renderOrder: node.renderOrder,
              materialDepth: materials.map((material) => ({ name: material?.name ?? '', depthTest: material?.depthTest ?? null, depthWrite: material?.depthWrite ?? null, polygonOffset: material?.polygonOffset ?? false, polygonOffsetFactor: material?.polygonOffsetFactor ?? 0, polygonOffsetUnits: material?.polygonOffsetUnits ?? 0 })),
            });
          });
          return {
            matchPhase: snapshot.matchPhase,
            gameStarted: snapshot.gameStarted,
            runtime: snapshot.render?.runtime ?? null,
            presentation: window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry?.() ?? null,
            zFightAudit: {
              studioRoots,
              studioMeshes,
              renderAudit: window.__ATOMIC_ACRES_DEBUG__.renderAudit?.() ?? null,
              note: 'Static runtime census only; no visual z-fighting claim is made without a capture or pixel evidence.',
            },
          };
        });
        if (row.boot.runtime?.actualBackend !== 'webgpu') throw new Error(`actual WebGPU backend not proven: ${JSON.stringify(row.boot.runtime)}`);

        await mark('warmup-start');
        await page.waitForTimeout(warmupMs);
        await mark('steady-start');
        await page.waitForTimeout(steadyMs);

        await mark('grenade-burst-start');
        await action('set-grenades', 'set-grenades');
        for (let index = 0; index < 4; index += 1) {
          await action(`grenade-${index + 1}`, 'grenade');
          await page.waitForTimeout(eventSettleMs);
        }
        await mark('grenade-burst-end');

        // World Studio is the asset/z-fighting subject and intentionally has no
        // breakable-window roster. Re-enter the shipped Atomic Acres arena for
        // glass authority, then return to World Studio for the final lifecycle
        // check. Both paths use the same Build17 backend and profile.
        await mark('glass-map-reentry-start');
        await action('glass-return-main-menu', 'return-menu');
        await page.waitForFunction(() => document.querySelector('#menu')?.classList.contains('hidden') === false, undefined, { timeout: 12_000 });
        await action('glass-select-atomic-acres', 'select-atomic');
        await action('glass-start-solo', 'start');
        await page.waitForFunction(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
          return snapshot?.matchPhase === 'active' && snapshot?.gameStarted === true;
        }, undefined, { timeout: 180_000 });
        await page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot().breakableWindows?.length ?? 0) > 0, undefined, { timeout: 30_000 });
        await page.waitForTimeout(Math.max(eventSettleMs, 2_000));
        await mark('glass-event-start');
        const glassResults = [];
        for (let index = 0; index < 4; index += 1) {
          const before = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().breakableWindows?.map((entry) => ({ id: entry.id, broken: entry.broken, visible: entry.visible })) ?? []);
          await action(`stage-window-${index}`, `stage-window-${index}`);
          await action(`fire-window-${index}`, 'fire');
          await page.waitForTimeout(eventSettleMs);
          const after = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().breakableWindows?.map((entry) => ({ id: entry.id, broken: entry.broken, visible: entry.visible })) ?? []);
          glassResults.push({ index, before, after, brokenDelta: after.filter((entry, item) => entry.broken && !before[item]?.broken).length });
        }
        row.glassResults = glassResults;
        await mark('glass-event-end');

        await mark('killstreak-event-start');
        await action('support-grant', 'support-grant');
        // Exercise three real presentation lanes. The first two use the current
        // field-support activation path; the third uses the explicit aerial
        // killstreak path and is retained when a lane is not in the loadout.
        await action('support-scout', 'support-scout');
        await page.waitForTimeout(eventSettleMs);
        await action('support-yardhawk', 'support-yardhawk');
        await page.waitForTimeout(eventSettleMs);
        await action('support-chopper', 'support-chopper');
        await action('support-drone', 'support-drone');
        await action('support-swarm', 'support-swarm');
        await page.waitForTimeout(Math.max(eventSettleMs, 6_000));
        row.killstreakAfter = await page.evaluate(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          return { fieldSupport: snapshot.fieldSupport ?? null, entities: snapshot.killstreak?.entities ?? [], presentation: snapshot.killstreakPresentation ?? null };
        });
        await mark('killstreak-event-end');

        await mark('death-respawn-start');
        await action('damage-lethal', 'damage');
        await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.samplePlayerPose?.().alive === false, undefined, { timeout: 8_000 });
        await page.waitForTimeout(500);
        await action('respawn', 'respawn');
        await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.samplePlayerPose?.().alive === true, undefined, { timeout: 12_000 });
        await page.waitForTimeout(eventSettleMs);
        await mark('death-respawn-end');

        await mark('map-reentry-start');
        await action('return-main-menu', 'return-menu');
        await page.waitForFunction(() => document.querySelector('#menu')?.classList.contains('hidden') === false, undefined, { timeout: 12_000 });
        await action('reentry-select-world-studio', 'select-world');
        await action('reentry-start-solo', 'start');
        await page.waitForFunction(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
          return snapshot?.matchPhase === 'active' && snapshot?.gameStarted === true;
        }, undefined, { timeout: 180_000 });
        await page.waitForTimeout(Math.max(eventSettleMs, 4_000));
        await mark('map-reentry-end');
        row.final = await page.evaluate(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          return { snapshot, runtime: snapshot.render?.runtime ?? null, telemetry: window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry?.() ?? null };
        });
        const raw = await page.evaluate(() => {
          const probe = window.__RUNTIME_STABILITY_PROBE__;
          probe.running = false;
          if (probe.presentationTimer) clearInterval(probe.presentationTimer);
          if (probe.telemetryTimer) clearInterval(probe.telemetryTimer);
          probe.longtaskObserver?.disconnect?.();
          return probe;
        });
        row.phaseMarks = raw.phaseMarks;
        row.actions = raw.actions;
        row.metrics = {
          frame: summarizeCadence(raw.raf, warmupMs),
          presentation: summarizePresentation(raw.presentation, warmupMs),
          longtasks: {
            count: raw.longtasks.filter((entry) => entry.atMs >= warmupMs).length,
            maxDurationMs: raw.longtasks.length ? Math.max(...raw.longtasks.map((entry) => entry.durationMs)) : 0,
            p95DurationMs: percentile(raw.longtasks.map((entry) => entry.durationMs), 95),
          },
          fpsHud: {
            sampleCount: raw.fps.filter((entry) => entry.atMs >= warmupMs).length,
            median: percentile(raw.fps.filter((entry) => entry.atMs >= warmupMs).map((entry) => entry.fps), 50),
            p05: percentile(raw.fps.filter((entry) => entry.atMs >= warmupMs).map((entry) => entry.fps), 5),
          },
        };
        const marks = [...raw.phaseMarks].sort((a, b) => a.atMs - b.atMs);
        row.metrics.phases = marks.slice(0, -1).map((markEntry, index) => {
          const end = marks[index + 1];
          return {
            label: markEntry.label,
            startMs: markEntry.atMs,
            endMs: end.atMs,
            durationMs: end.atMs - markEntry.atMs,
            frame: summarizeCadence(raw.raf, markEntry.atMs, end.atMs),
            presentation: summarizePresentation(raw.presentation, markEntry.atMs, end.atMs),
            longtasks: {
              count: raw.longtasks.filter((entry) => entry.atMs >= markEntry.atMs && entry.atMs < end.atMs).length,
              maxDurationMs: raw.longtasks.filter((entry) => entry.atMs >= markEntry.atMs && entry.atMs < end.atMs).reduce((max, entry) => Math.max(max, entry.durationMs), 0),
            },
          };
        });
        row.rawCounts = { raf: raw.raf.length, presentation: raw.presentation.length, longtasks: raw.longtasks.length, fps: raw.fps.length, pose: raw.pose?.length ?? 0 };
      } catch (error) {
        row.error = String(error);
        errors.push({ profile, error: String(error), pageErrors });
        try {
          const raw = await page.evaluate(() => {
            const probe = window.__RUNTIME_STABILITY_PROBE__;
            if (!probe) return null;
            probe.running = false;
            if (probe.presentationTimer) clearInterval(probe.presentationTimer);
            if (probe.telemetryTimer) clearInterval(probe.telemetryTimer);
            probe.longtaskObserver?.disconnect?.();
            return probe;
          });
          row.partial = raw ? { phaseMarks: raw.phaseMarks, actions: raw.actions, rawCounts: { raf: raw.raf.length, presentation: raw.presentation.length, longtasks: raw.longtasks.length, fps: raw.fps.length } } : null;
        } catch { /* page may have closed */ }
      } finally {
        await page.close();
      }
      rows.push(row);
    }
  } finally {
    await browser.close();
  }

  const report = {
    contract: 'runtime-stability-gate-build17-v1',
    startedAt,
    finishedAt: new Date().toISOString(),
    source: evidence,
    route: base,
    profiles,
    warmupMs,
    steadyMs,
    eventSettleMs,
    host: { before: hostEvidence(), after: hostEvidence() },
    resourceContention: contention,
    rows,
    errors,
    acceptance: {
      exactBackendRequired: 'webgpu',
      meaningfulStallGapMs: 100,
      note: 'This report preserves runtime failures and does not alter graphics quality, simulation cadence, or timer thresholds.',
    },
  };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ out, source: evidence.sha, profiles: rows.map((row) => ({ profile: row.profile, error: row.error ?? null, backend: row.boot?.runtime?.actualBackend ?? null, metrics: row.metrics ?? null })) }, null, 2));
  if (errors.length || rows.length !== profiles.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
