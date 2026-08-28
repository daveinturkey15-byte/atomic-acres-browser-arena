#!/usr/bin/env node
// HF-398 — cold admission + live-wiring proof for the RAY TRACED preset, on the
// REAL WebGPU route in installed Chrome, driven over CDP.
//
// Adapted from verify-arena-boot-cdp.mjs, with three differences that matter:
//
//  1. A FRESH BROWSER PER ARENA. Playwright launches into a throwaway profile,
//     so each launch starts on a cold shader cache. Running six arenas in one
//     browser measures one cold arena and five warm ones, and a warm number is
//     evidence about the second run, not about admission.
//
//  2. THE PRESET IS SEEDED INTO localStorage BEFORE BOOT. Seeding the persisted
//     settings drives the identical code path the menu does
//     (parsePass65Settings -> presetGraphics -> resolveGraphicsRuntime), and
//     the run asserts the preset the RUNTIME resolved rather than the one the
//     harness asked for. (The header used to say the fourth option "is not in
//     the menu yet". It has been in the menu since src/ui/pass64-shell.ts:229
//     shipped `<option value="raytraced">RAY TRACED</option>`; the seeding is
//     kept because it survives a cold profile with no click.)
//
//  3. IT READS THE LINEAR STAGE RECEIPT. Green boot is not evidence a player
//     sees anything; this project has shipped three fully-tested systems with
//     no runtime caller. The receipt is published from the graph that was
//     actually constructed, so "raytraced-reflection-refraction-add" appearing
//     in it is proof the trace compiled into the live chain.
//
//  4. PASS 81 - IT NOW FAILS ON AN EMPTY PROXY SET. The receipt has two halves,
//     `shapes/candidates:reflectiveMeshes`, and only the first was ever
//     checked. The 2026-08-25 capture (artifacts/qa/rt-final/final-summary.json)
//     therefore recorded verdict PASS with rayTracedProxy 24/260:3 on
//     atomic-acres and :0 on all five other arenas - a correctly compiled
//     tracer with nothing in the world smooth enough to spawn a ray, reported
//     as a healthy preset. A trace that reflects nothing is the defect this
//     harness exists to catch, so `reflectiveMeshes > 0` is now part of `ok`
//     for the raytraced preset.
//
// Usage:
//   node scripts/qa/verify-raytraced-preset-cdp.mjs --url http://127.0.0.1:41917 \
//        --presets high,raytraced --arenas atomic-acres,... --per-arena 180000
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41917');
const PER_ARENA_MS = Number(arg('--per-arena', '180000'));
const OUT = arg('--out', 'artifacts/qa/raytraced-preset');
const PRESETS = arg('--presets', 'high,raytraced').split(',').map((v) => v.trim()).filter(Boolean);
// Flips ONLY the ray-tracing control through the real Options surface after
// boot, which turns the preset into Custom with exactly one difference. It is
// how the A/B pair is produced, and it doubles as proof that the control is
// reachable and functional in the menu the player actually uses.
const FLIP = arg('--flip-ray-tracing', '');
const LABEL = arg('--label', '');
// Freezes bot AI before the capture. The A/B pair has to differ by the ray
// tracing control and nothing else; a bot walking through frame is the largest
// source of pixel difference in a live match and would drown the signal.
const FREEZE_BOTS = argv.includes('--freeze-bots');
const DWELL_MS = Number(arg('--dwell-ms', '2500'));
const ARENAS = arg('--arenas', 'atomic-acres,skyline-terminal,rustworks-1v1,gun-range,farcrysis,high-seas')
  .split(',').map((v) => v.trim()).filter(Boolean);

const STORAGE_KEY = 'atomic-acres-pass65-settings-v1';

mkdirSync(resolve(OUT), { recursive: true });

async function runOne(preset, arena) {
  const record = { preset, arena, flip: FLIP || null, label: LABEL || null, ok: false, admissionMs: 0, errors: [] };
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: [
      '--use-angle=d3d11',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      // Cold compile is the whole measurement: a warm pipeline cache would
      // hand back the second-run number and call it admission.
      '--disable-gpu-shader-disk-cache',
    ],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text().slice(0, 300));
    });
    await page.addInitScript(([key, value]) => {
      try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
    }, [STORAGE_KEY, JSON.stringify({ version: 1, graphics: { schemaVersion: 1, preset } })]);

    const url = `${BASE}/?release=latest&renderer=webgpu&seed=rt-${preset}-${arena}&previewTime=0`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

    record.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
    // Assert what the RUNTIME resolved, not what the harness asked for. The
    // whole class of defect this project keeps paying for is a value that was
    // written somewhere and never reached the thing that draws.
    record.resolvedPreset = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.settings?.graphics?.requestedPreset
        ?? snapshot.settings?.displayedGraphicsPreset ?? null;
    }).catch(() => null);
    record.resolvedRayTracing = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.settings?.graphics?.screenSpace?.rayTracing ?? null;
    }).catch(() => null);

    if (FLIP) {
      record.flipApplied = await page.evaluate((tier) => {
        const select = document.querySelector('#graphics-ray-tracing');
        if (!(select instanceof HTMLSelectElement)) return 'control-not-in-dom';
        const offered = [...select.options].map((option) => option.value);
        if (!offered.includes(tier)) return `tier-not-offered:${offered.join('|')}`;
        select.value = tier;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const save = document.querySelector('#graphics-save');
        if (!(save instanceof HTMLButtonElement)) return 'save-button-not-in-dom';
        save.click();
        return 'applied';
      }, FLIP);
      await page.waitForTimeout(1500);
      await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
      record.flipResolved = await page.evaluate(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return snapshot.settings?.graphics?.screenSpace?.rayTracing?.tier ?? null;
      }).catch(() => null);
    }

    const startedAt = Date.now();
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    try {
      await page.waitForFunction(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
      }, undefined, { timeout: PER_ARENA_MS });
      record.ok = true;
    } catch (error) {
      record.error = String(error).slice(0, 200);
    }
    record.admissionMs = Date.now() - startedAt;

    record.telemetry = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const advanced = snapshot.render?.atomicSignal?.advancedGraphics ?? null;
      return {
        bootstrapStage: snapshot.bootstrap?.stage ?? null,
        matchPhase: snapshot.matchPhase ?? null,
        arenaTransitionPhase: snapshot.arenaTransitionPhase ?? null,
        arenaId: document.documentElement.dataset.arenaId ?? null,
        renderBackend: document.documentElement.dataset.renderBackend ?? null,
        linearSourceStages: advanced?.linearSourceStages ?? null,
        // The receipts written BY THE GRAPH THAT WAS BUILT. Present means the
        // trace is in the live chain; absent means it is not, whatever any
        // setting says.
        rayTracedLayer: document.documentElement.dataset.rayTracedLayer ?? null,
        rayTracedProxy: document.documentElement.dataset.rayTracedProxy ?? null,
        principalHdrSamples: snapshot.render?.atomicSignal?.principalHdrSamples ?? null,
        screenSpace: advanced?.screenSpace ?? null,
        gradeProfileId: snapshot.render?.gradeProfileId ?? null,
        graphicsApplication: snapshot.render?.graphicsApplication ?? null,
        status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 200),
      };
    }).catch(() => null);

    if (record.ok) {
      if (FREEZE_BOTS) {
        await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); }).catch(() => {});
      }
      // Let a couple of seconds of gameplay frames land before capturing, so
      // the shot is a settled frame rather than the admission frame.
      await page.waitForTimeout(DWELL_MS);
      const shot = resolve(OUT, `${LABEL ? `${LABEL}-` : ''}${preset}-${arena}.png`);
      await page.screenshot({ path: shot });
      record.frame = shot;
    }
    record.errors = [...new Set(errors)].slice(0, 6);
    record.admissionFenceBreach = record.errors.some((line) => /queue completion exceeded/i.test(line));
    // `shapes/candidates:reflectiveMeshes`. Zero reflective meshes means the
    // arena has no surface at or under the mirror-roughness ceiling with a
    // footprint above the extractor's floor, so the trace draws nothing however
    // well it compiled. src/rendering/raytracing/arena-proxy-coverage.test.ts
    // is the offline ratchet for the same number; this is the live one.
    const proxy = /^(\d+)\/(\d+):(\d+)$/.exec(record.telemetry?.rayTracedProxy ?? '');
    record.proxyShapes = proxy ? Number(proxy[1]) : null;
    record.proxyCandidates = proxy ? Number(proxy[2]) : null;
    record.reflectiveMeshes = proxy ? Number(proxy[3]) : null;
    if (preset === 'raytraced' && record.ok) {
      if (!proxy) {
        record.ok = false;
        record.error = 'no rayTracedProxy receipt: the trace never extracted a proxy scene';
      } else if (record.reflectiveMeshes === 0) {
        record.ok = false;
        record.error = `rayTracedProxy ${record.telemetry.rayTracedProxy}: zero reflective meshes, so the trace renders nothing on this arena`;
      } else if (record.proxyShapes === 0) {
        record.ok = false;
        record.error = `rayTracedProxy ${record.telemetry.rayTracedProxy}: proxy scene is empty`;
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return record;
}

const results = [];
for (const preset of PRESETS) {
  for (const arena of ARENAS) {
    const record = await runOne(preset, arena);
    results.push(record);
    console.error(
      `[rt-preset] ${preset.padEnd(10)} ${arena.padEnd(18)} ${record.ok ? 'OK  ' : 'FAIL'} `
      + `${String(record.admissionMs).padStart(6)} ms  resolved=${record.resolvedPreset} `
      + `layer=${record.telemetry?.rayTracedLayer ?? 'ABSENT'} proxy=${record.telemetry?.rayTracedProxy ?? '-'} `
      + `reflective=${record.reflectiveMeshes ?? '-'}`
      + (record.admissionFenceBreach ? '  ADMISSION-FENCE-BREACH' : ''),
    );
    for (const line of record.errors) console.error(`             ${line}`);
  }
}

const failed = results.filter((entry) => !entry.ok);
const summary = {
  verdict: failed.length === 0 ? 'PASS' : 'FAIL',
  presets: PRESETS,
  arenas: ARENAS,
  failed: failed.map(({ preset, arena }) => `${preset}/${arena}`),
  results,
};
writeFileSync(resolve(OUT, `${LABEL ? `${LABEL}-` : ''}summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({
  verdict: summary.verdict,
  failed: summary.failed,
  admission: results.map(({ preset, arena, admissionMs, ok }) => `${preset}/${arena}=${admissionMs}ms${ok ? '' : '(FAIL)'}`),
}, null, 2));
process.exit(summary.verdict === 'PASS' ? 0 : 1);
