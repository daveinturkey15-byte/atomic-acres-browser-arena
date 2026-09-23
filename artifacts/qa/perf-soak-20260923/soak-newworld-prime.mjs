#!/usr/bin/env node
// Day-4 newworld-prime perf soak driver v2 (evidence-only, lives in evidence dir).
// Installed Chrome headless, WebGPU renderer, per-profile runs. >=10 min ACTIVE
// sampling: walking + panning camera on waypoint legs, bots live. 1 Hz series:
// fps, draws, tris, heap, tail counts. Navigation-resilient: a sibling src save
// on the shared dev server triggers a Vite reload back to menu; the driver
// re-drives card+solo and resumes, logging recovery segments (annotated, the
// recovery window excluded from analysis).
//
// USAGE: node soak-newworld-prime.mjs --profile high|performance --duration 660
//   --url http://127.0.0.1:4201/ --out-dir <evidence dir> --label <run>
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const PROFILE = arg('--profile', 'high');
const DURATION_S = Number(arg('--duration', '660'));
const BASE = arg('--url', 'http://127.0.0.1:4201/');
const OUT_DIR = resolve(arg('--out-dir', 'artifacts/qa/perf-soak-20260923'));
const LABEL = arg('--label', `soak-${PROFILE}`);
const BOOT_TIMEOUT = 180_000;
mkdirSync(OUT_DIR, { recursive: true });

const chromeCandidates = [process.env.PASS65_CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);
const executablePath = chromeCandidates.find((c) => existsSync(c));
if (!executablePath) throw new Error('installed Chrome not found');
let sourceSha = 'unknown';
try { sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* off-git */ }

const LEG_S = 20;
const LEGS = [
  [-32, -8, -Math.PI / 2], [-8, -8, -Math.PI / 2], [16, -8, -Math.PI / 2],
  [16, 0, Math.PI / 2], [-8, 0, Math.PI / 2], [-32, 0, -Math.PI / 2],
  [-32, 8, -Math.PI / 2], [-8, 8, -Math.PI / 2], [16, 8, Math.PI / 2],
  [16, -8, 0],
];

const browser = await chromium.launch({
  headless: true, executablePath,
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-frame-rate-limit', '--disable-gpu-vsync', '--enable-precise-memory-info',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'],
});

const report = {
  contract: 'newworld-prime-day4-soak-v2', label: LABEL, measuredAt: new Date().toISOString(),
  sourceSha, base: BASE, profile: PROFILE, durationTargetS: DURATION_S,
  executablePath, viewport: { width: 2560, height: 1440 },
  r3: {}, consoleErrors: [], pageErrors: [], samples: [], recoveries: [], segments: [], status: 'started',
};

const INIT_SCRIPT = () => {
  const s = {
    bootId: `${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    frames: [], draws: 0, tris: 0, hooked: false, longTasks: 0,
  };
  window.__SOAK__ = s;
  const install = () => {
    const pass = window.GPURenderPassEncoder;
    if (!pass?.prototype || s.hooked) return;
    s.hooked = true;
    const origDraw = pass.prototype.draw, origDrawI = pass.prototype.drawIndexed;
    if (typeof origDraw === 'function') pass.prototype.draw = function (...a) { s.draws += 1; s.tris += ((a[0] ?? 0) / 3) * (a[1] ?? 1); return origDraw.apply(this, a); };
    if (typeof origDrawI === 'function') pass.prototype.drawIndexed = function (...a) { s.draws += 1; s.tris += ((a[0] ?? 0) / 3) * (a[1] ?? 1); return origDrawI.apply(this, a); };
  };
  install();
  const t = setInterval(() => { install(); if (s.hooked) clearInterval(t); }, 10);
  setTimeout(() => clearInterval(t), 30_000);
  try {
    const o = new PerformanceObserver(() => { s.longTasks += 1; });
    o.observe({ entryTypes: ['longtask'] });
  } catch { /* unsupported */ }
  let last = performance.now();
  const tick = (now) => { s.frames.push(now - last); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};

let page = null;
// Poll the shared dev server until it answers 200 (sibling src saves can make
// Vite return 500s for a window; recovery must out-wait that, not fail fast).
async function waitForServerHealthy(budgetMs, tag) {
  const start = Date.now();
  let attempts = 0;
  while (Date.now() - start < budgetMs) {
    attempts += 1;
    try {
      const res = await fetch(`${BASE}?health=${Date.now()}`, { cache: 'no-store' });
      if (res.status === 200) {
        await res.arrayBuffer().catch(() => null);
        return { ok: true, attempts, waitedMs: Date.now() - start };
      }
      report.serverUnhealthy = report.serverUnhealthy ?? [];
      report.serverUnhealthy.push({ tag, at: new Date().toISOString(), status: res.status });
    } catch (e) {
      report.serverUnhealthy = report.serverUnhealthy ?? [];
      report.serverUnhealthy.push({ tag, at: new Date().toISOString(), status: `fetch-fail:${String(e).slice(0, 60)}` });
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return { ok: false, attempts, waitedMs: Date.now() - start };
}

async function deployWithRecovery(maxAttempts, serverBudgetMs) {
  let lastError = 'never-attempted';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const health = await waitForServerHealthy(serverBudgetMs, `deploy-attempt-${attempt}`);
    if (!health.ok) { lastError = `server-unhealthy-${health.attempts}-probes`; continue; }
    try {
      await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT });
      await page.waitForFunction(() => { const b = document.querySelector('#solo'); return b !== null && !b.disabled; }, undefined, { timeout: BOOT_TIMEOUT });
      const tR = Date.now();
      await page.evaluate(() => {
        document.querySelector('.map-card[data-arena-id="newworld-prime"]')?.click();
        const name = document.querySelector('#player-name');
        if (name) name.value = 'DAY4SOAK';
      });
      await page.waitForTimeout(800);
      await page.evaluate(() => document.querySelector('#solo').click());
      await page.waitForFunction(() => {
        const s = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return Boolean(s && s.matchPhase === 'active' && s.gameStarted === true);
      }, undefined, { timeout: BOOT_TIMEOUT });
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement?.(true, false)).catch(() => {});
      return { ok: true, attempt, deployMs: Date.now() - tR };
    } catch (e) {
      lastError = String(e).split('\n')[0];
      console.error(`[soak ${LABEL}] deploy attempt ${attempt} failed: ${lastError}`);
      const bootUrl = new URL(BASE);
      bootUrl.searchParams.set('release', 'latest');
      bootUrl.searchParams.set('renderer', 'webgpu');
      try { await page.goto(bootUrl.toString(), { waitUntil: 'domcontentloaded' }); } catch { /* keep going */ }
    }
  }
  return { ok: false, error: lastError };
}

try {
  page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 300)));
  await page.addInitScript(INIT_SCRIPT);

  // ---- R3: cold boot -> menu timing ----
  const t0 = Date.now();
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  report.r3.domcontentloadedMs = Date.now() - t0;
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT });
  report.r3.debugReadyMs = Date.now() - t0;
  await page.waitForFunction(() => { const s = document.querySelector('#solo'); return s !== null && !s.disabled; }, undefined, { timeout: BOOT_TIMEOUT });
  report.r3.menuReadyMs = Date.now() - t0;

  const profileSel = await page.evaluate((profile) => {
    const select = document.querySelector('#graphics-profile');
    const before = select?.value ?? null;
    if (select && [...select.options].some((o) => o.value === profile)) {
      select.value = profile;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#graphics-save')?.click();
    }
    return { before, after: select?.value ?? null };
  }, PROFILE);
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT });
  report.profileSelection = profileSel;
  report.profileState = await page.evaluate(() => ({
    graphicsPreset: document.documentElement.dataset.graphicsPreset ?? null,
    renderBackend: document.documentElement.dataset.renderBackend ?? null,
    effective: document.querySelector('#graphics-effective')?.textContent ?? null,
    devicePixelRatio: window.devicePixelRatio,
  }));

  const tMenu = Date.now();
  const first = await deployWithRecovery(3, 120000);
  if (!first.ok) throw new Error(`initial-deploy-failed: ${first.error}`);
  report.r3.initialDeployAttempts = first.attempt;
  report.r3.arenaCardSelected = await page.evaluate(() => document.querySelector('.map-card[data-arena-id="newworld-prime"]')?.getAttribute('aria-pressed')).catch(() => null);
  report.r3.menuToActiveMs = Date.now() - tMenu;
  report.r3.coldBootToActiveMs = Date.now() - t0;
  await page.waitForTimeout(3000);

  const shotAt = async (tag) => {
    const p = join(OUT_DIR, `${LABEL}-${tag}.png`);
    await page.screenshot({ path: p });
    return p;
  };
  report.screenshots = [await shotAt('start')];
  const excluded = new Set([0]); // start screenshot second handled below via index map

  // ---- Soak loop, 1 Hz of ACTIVE match sampling ----
  let bootId = await page.evaluate(() => window.__SOAK__.bootId).catch(() => null);
  let last = await page.evaluate(() => ({ f: window.__SOAK__.frames.length, d: window.__SOAK__.draws, t: window.__SOAK__.tris, lt: window.__SOAK__.longTasks })).catch(() => null);
  const wallStart = Date.now();
  let deaths = 0, wasAlive = true, activeSamples = 0, segment = 0, s = 0;
  report.segments.push({ segment, startedSample: 0, reason: 'initial-deploy' });
  const midTaken = { done: false };

  while (activeSamples < DURATION_S) {
    s += 1;
    const legIndex = Math.floor(activeSamples / LEG_S) % LEGS.length;
    const [lx, lz, baseYaw] = LEGS[legIndex];
    const yaw = baseYaw + 0.35 * Math.sin((activeSamples / LEG_S) * Math.PI * 2 + (activeSamples % 2 ? Math.PI / 4 : 0));
    await page.evaluate(([x, z, y]) => {
      try { window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 1.7, z, y, 0); } catch { /* gone */ }
    }, [lx, lz, yaw]).catch(() => {});
    if (!midTaken.done && activeSamples >= Math.floor(DURATION_S / 2)) { report.screenshots.push(await shotAt('mid')); midTaken.done = true; }
    await page.waitForTimeout(1000);
    const cur = await page.evaluate(() => {
      const st = window.__SOAK__;
      if (!st) return null;
      let snap = null;
      try {
        const q = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        if (q) snap = { alive: q.player?.alive ?? null, phase: q.matchPhase ?? null };
      } catch { /* menu */ }
      return { bootId: st.bootId, f: st.frames.length, d: st.draws, t: st.tris, lt: st.longTasks, hooked: st.hooked, frames: st.frames.slice(-3000), heap: (performance.memory) ? performance.memory.usedJSHeapSize : null, snap };
    }).catch(() => null);

    if (!cur || cur.bootId !== bootId || !cur.snap || cur.snap.phase !== 'active') {
      // Navigation (sibling src save -> vite reload) or match exit: recover.
      segment += 1;
      report.recoveries.push({ atSample: s, activeSamples, reason: !cur ? 'evaluate-failed' : cur.bootId !== bootId ? 'page-navigation' : `phase-${cur.snap?.phase ?? 'no-snap'}` });
      const rec = await deployWithRecovery(6, 300000);
      if (rec.ok) {
        bootId = await page.evaluate(() => window.__SOAK__.bootId).catch(() => null);
        last = await page.evaluate(() => ({ f: window.__SOAK__.frames.length, d: window.__SOAK__.draws, t: window.__SOAK__.tris, lt: window.__SOAK__.longTasks })).catch(() => null);
        report.segments.push({ segment, startedSample: s, reason: 're-deploy', attempts: rec.attempt, deployMs: rec.deployMs });
        console.error(`[soak ${LABEL}] recovery #${segment} ok (attempt ${rec.attempt}), resuming`);
      } else {
        report.samples.push({ s, error: `recovery-failed: ${rec.error}` });
        console.error(`[soak ${LABEL}] recovery #${segment} FAILED: ${rec.error}`);
        break;
      }
      continue;
    }
    const nf = cur.f - last.f;
    if (nf <= 0 || nf > 100000) { // counter reset without bootId change; skip, re-baseline
      report.samples.push({ s, error: `counter-anomaly nf=${nf}`, segment });
      last = { f: cur.f, d: cur.d, t: cur.t, lt: cur.lt };
      continue;
    }
    const deltas = cur.frames.slice(-nf);
    const over50 = deltas.filter((d) => d > 50).length;
    const over500 = deltas.filter((d) => d > 500).length;
    const maxD = deltas.length ? Math.max(...deltas) : 0;
    if (wasAlive && cur.snap.alive === false) deaths += 1;
    wasAlive = cur.snap.alive !== false;
    report.samples.push({
      s, segment, fps: nf, draws: Number(((cur.d - last.d) / nf).toFixed(1)),
      tris: Math.round((cur.t - last.t) / nf),
      heapMB: cur.heap === null ? null : Number((cur.heap / 1048576).toFixed(1)),
      over50, over500, maxFrameMs: Number(maxD.toFixed(1)), longTasks: cur.lt - last.lt,
      alive: cur.snap.alive, phase: cur.snap.phase, hooked: cur.hooked,
    });
    activeSamples += 1;
    last = { f: cur.f, d: cur.d, t: cur.t, lt: cur.lt };
    if (activeSamples % 60 === 0) {
      const r = report.samples[report.samples.length - 1];
      console.error(`[soak ${LABEL}] active+${activeSamples}s fps~${r.fps} heap~${r.heapMB}MB over50=${r.over50} seg=${segment}`);
    }
  }
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement?.(false, false)).catch(() => {});
  report.screenshots.push(await shotAt('end'));
  report.soakWallMs = Date.now() - wallStart;
  report.deaths = deaths;
  report.activeSamples = activeSamples;

  // ---- Analysis (clean samples only) ----
  const ok = report.samples.filter((r) => !r.error);
  const fpsVals = ok.map((r) => r.fps);
  const heapVals = ok.map((r) => r.heapMB).filter((v) => v !== null);
  const totalOver50 = ok.reduce((a, r) => a + r.over50, 0);
  const totalOver500 = ok.reduce((a, r) => a + r.over500, 0);
  const totalFrames = fpsVals.reduce((a, b) => a + b, 0);
  const maxFrame = ok.length ? Math.max(...ok.map((r) => r.maxFrameMs)) : 0;
  let leakMbPerMin = null;
  if (heapVals.length > 60) {
    const n = heapVals.length, meanX = (n - 1) / 2;
    const meanY = heapVals.reduce((a, b) => a + b, 0) / n;
    const slope = heapVals.reduce((a, y, i) => a + (i - meanX) * (y - meanY), 0) / heapVals.reduce((a, _, i) => a + (i - meanX) ** 2, 0);
    leakMbPerMin = Number((slope * 60).toFixed(2));
  }
  const aliveFrac = ok.length ? Number((ok.filter((r) => r.alive).length / ok.length).toFixed(3)) : null;
  report.analysis = {
    samples: ok.length, errorSamples: report.samples.length - ok.length,
    totalFrames, meanFps: ok.length ? Number((totalFrames / ok.length).toFixed(1)) : null,
    minFps: fpsVals.length ? Math.min(...fpsVals) : null,
    over50Frames: totalOver50, over500Frames: totalOver500,
    over50Rate: totalFrames ? Number((totalOver50 / totalFrames).toFixed(5)) : null,
    maxSingleFrameMs: maxFrame, freezesCandidate: totalOver500,
    heapStartMB: heapVals[0] ?? null, heapEndMB: heapVals[heapVals.length - 1] ?? null,
    leakMbPerMin, deaths, aliveFraction: aliveFrac,
    hooked: ok.length ? ok[ok.length - 1].hooked : null,
    recoveries: report.recoveries.length, segments: report.segments.length,
  };
  report.status = activeSamples >= DURATION_S ? 'complete' : 'partial';
} catch (e) {
  report.status = report.status === 'started' ? 'failed' : report.status;
  report.failure = String(e).split('\n').slice(0, 5).join(' | ');
  console.error(`[soak ${LABEL}] FAILED: ${report.failure}`);
} finally {
  await browser.close().catch(() => {});
}

const csv = ['s,segment,fps,draws_per_frame,tris_per_frame,heap_mb,over50,over500,max_frame_ms,longtasks,alive,phase',
  ...report.samples.map((r) => r.error ? `${r.s},${r.segment ?? ''},ERROR:${r.error}` : `${r.s},${r.segment},${r.fps},${r.draws},${r.tris},${r.heapMB ?? ''},${r.over50},${r.over500},${r.maxFrameMs},${r.longTasks},${r.alive ?? ''},${r.phase ?? ''}`)].join('\n');
writeFileSync(join(OUT_DIR, `${LABEL}.csv`), `${csv}\n`);
writeFileSync(join(OUT_DIR, `${LABEL}.json`), `${JSON.stringify(report, null, 2)}\n`);
console.error(`[soak ${LABEL}] status=${report.status} activeSamples=${report.activeSamples ?? 0}`);
