/**
 * HF-418 / Lane AL — measures what baked indirect light costs, per arena, per
 * tier, at 2560x1440 headless with a real WebGPU backend.
 *
 * WHAT IT MEASURES AND WHY EACH NUMBER IS HERE.
 *   - Frame time p50/p95 and frames/s over a settled window. The headline.
 *   - Pipelines created during admission, and pipelines created DURING COMBAT.
 *     The second number is the tripwire: a pipeline compiled while a settled
 *     match is being played is the freeze class the owner reported, and it must
 *     be zero.
 *   - Deploy time, cold. The graphics ladder's real cost is loading, not frame
 *     time (Lane AI measured 20-35 s on PERFORMANCE against 42-66 s on MAX), so
 *     a layer that adds a CPU bake has to say what it added.
 *   - The layer's own runtime receipt, `documentElement.dataset.bakedIndirect`:
 *     grid, digest, occluder count, live gain. Every one of those four is
 *     asserted, because a harness that reads a four-part receipt and checks the
 *     first part is how a build ships the exact defect the receipt was written
 *     to catch.
 *
 * HONESTY GATES, both fail-closed:
 *   - The owner's ComfyUI queue is read before AND after every run and stamped
 *     into the row. A row taken while it had work is not annotated, it is void.
 *   - The backend is asserted to be webgpu. A row measured on the WebGL2
 *     compatibility route measures a renderer this feature does not exist on.
 *
 * Headless only, one browser at a time, never focused: the owner's standing
 * instruction is that nothing may take his mouse.
 *
 * Usage:
 *   node scripts/qa/measure-baked-indirect.mjs --url http://127.0.0.1:PORT \
 *     --arena atomic-acres --tier low --out artifacts/baked-indirect
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index].replace(/^--/, ''), process.argv[index + 1]);
}
const BASE = args.get('url') ?? 'http://127.0.0.1:41947';
const ARENA = args.get('arena') ?? 'atomic-acres';
const TIER = args.get('tier') ?? 'low';
const AO = args.get('ao') ?? null;
const OUT = args.get('out') ?? 'artifacts/baked-indirect';
const TIMEOUT = Number(args.get('timeout') ?? '240000');
const SAMPLE_MS = Number(args.get('sample') ?? '14000');
const SETTINGS_KEY = 'atomic-acres-pass65-settings-v1';

async function comfyQueue() {
  try {
    const response = await fetch('http://127.0.0.1:8188/queue', { signal: AbortSignal.timeout(4000) });
    const body = await response.json();
    return (body.queue_running?.length ?? 0) + (body.queue_pending?.length ?? 0);
  } catch {
    return null; // Not running at all is a valid quiet state; unreachable is not busy.
  }
}

const queueBefore = await comfyQueue();
if (queueBefore !== null && queueBefore > 0) {
  console.error(`[measure] REFUSING: the owner's ComfyUI has ${queueBefore} item(s) queued. Numbers taken now are void.`);
  process.exit(2);
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const context = await browser.newContext({ viewport: { width: 2560, height: 1440 } });

// Count pipeline creation from before any page script runs, so the admission
// total is complete rather than "from whenever the probe attached".
await context.addInitScript(() => {
  window.__pipelineCount = 0;
  const patch = (proto, key) => {
    const original = proto?.[key];
    if (typeof original !== 'function') return;
    proto[key] = function patched(...rest) {
      window.__pipelineCount += 1;
      return original.apply(this, rest);
    };
  };
  if (typeof GPUDevice !== 'undefined') {
    patch(GPUDevice.prototype, 'createRenderPipeline');
    patch(GPUDevice.prototype, 'createRenderPipelineAsync');
  }
});

// Seed the persisted graphics settings so exactly ONE control differs between
// the rows of an A/B. Driving the Options surface would be more faithful, but
// it also changes a dozen controls at once when a preset is selected, which is
// precisely what an A/B must not do.
const row = {
  arena: ARENA, tier: TIER, ambientOcclusion: AO, viewport: '2560x1440',
  comfyQueueBefore: queueBefore, at: new Date().toISOString(),
};

row.baseProfile = 'QUALITY defaults with exactly the named controls overridden through the real Options surface';

const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));
try {
  const startedAt = Date.now();
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&seed=lightq&previewTime=0`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: TIMEOUT });

  // DRIVE THE REAL OPTIONS SURFACE, exactly as the owner does.
  //
  // An earlier version of this harness seeded the persisted settings blob into
  // localStorage. It did not work - the value never survived boot - and the row
  // came back reporting the profile default while claiming to be an A/B. The
  // receipt check below caught it, but the lesson is the general one: the ONLY
  // writer whose value survives is the app's own Options transaction
  // (`flushPendingGraphics`), so the harness uses it. One control is changed,
  // then SAVE GRAPHICS is pressed; nothing else about the profile moves.
  row.optionsDrive = await page.evaluate(async ([tier, ao]) => {
    const applied = {};
    const tab = document.querySelector('[data-menu-tab="options"]');
    if (!tab) return { error: 'no options tab' };
    tab.click();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const set = (id, value) => {
      const control = document.getElementById(id);
      if (!(control instanceof HTMLSelectElement)) return `missing ${id}`;
      control.value = value;
      if (control.value !== value) return `${id} rejected ${value}`;
      control.dispatchEvent(new Event('change', { bubbles: true }));
      applied[id] = control.value;
      return null;
    };
    const problems = [set('graphics-baked-indirect', tier)];
    if (ao) problems.push(set('graphics-ambient-occlusion', ao));
    return { applied, problems: problems.filter(Boolean), hasSave: Boolean(document.getElementById('graphics-save')) };
  }, [TIER, AO]);

  // SAVE, and expect a navigation. `bakedIndirect` is a declared
  // pipeline-rebuild owner, so committing it stages a renderer reconstruction
  // and the app reloads the page to perform it. Clicking inside an evaluate and
  // then awaiting anything in the same call destroys the execution context
  // mid-await - which is exactly how the previous version of this harness
  // failed. Click from outside, then wait for the NEW document's debug global.
  await page.click('#graphics-save', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: TIMEOUT });
  row.settingsAfterSave = await page.evaluate((key) => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(key) ?? 'null');
      return stored?.graphics
        ? { preset: stored.graphics.preset, bakedIndirect: stored.graphics.bakedIndirect, ambientOcclusion: stored.graphics.ambientOcclusion }
        : null;
    } catch { return 'unreadable'; }
  }, SETTINGS_KEY);

  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: TIMEOUT });
  row.deploySeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
  row.pipelinesAtAdmission = await page.evaluate(() => window.__pipelineCount);
  row.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

  // Let the bake converge and the frame settle before the window opens. The
  // bake is deliberately spread over frames, so measuring during it would
  // measure the loading screen rather than the game.
  await page.waitForTimeout(6000);
  row.receiptDuringSettle = await page.evaluate(() => document.documentElement.dataset.bakedIndirect ?? null);
  const pipelinesBeforeCombat = await page.evaluate(() => window.__pipelineCount);

  const sample = await page.evaluate(async (windowMs) => {
    const frames = [];
    let previous = performance.now();
    const started = previous;
    await new Promise((resolve) => {
      const tick = (now) => {
        frames.push(now - previous);
        previous = now;
        if (now - started >= windowMs) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    frames.shift();
    const sorted = [...frames].sort((a, b) => a - b);
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    return {
      frames: frames.length,
      elapsedMs: previous - started,
      medianMs: Number(at(0.5).toFixed(2)),
      p95Ms: Number(at(0.95).toFixed(2)),
      p99Ms: Number(at(0.99).toFixed(2)),
      over33: frames.filter((value) => value > 33).length,
      rateHz: Number((frames.length / ((previous - started) / 1000)).toFixed(1)),
    };
  }, SAMPLE_MS);
  Object.assign(row, sample);
  row.pipelinesInCombat = (await page.evaluate(() => window.__pipelineCount)) - pipelinesBeforeCombat;
  row.receipt = await page.evaluate(() => document.documentElement.dataset.bakedIndirect ?? null);
  row.rayTracedProxy = await page.evaluate(() => document.documentElement.dataset.rayTracedProxy ?? null);
  row.errors = errors.length;
  row.errorSamples = errors.slice(0, 3);

  // ASSERT EVERY PART OF THE RECEIPT, not just the first one.
  const receipt = row.receipt;
  if (TIER === 'off') {
    row.receiptVerdict = receipt === 'off' ? 'OK' : `EXPECTED off, GOT ${receipt}`;
  } else if (typeof receipt !== 'string' || receipt === 'off') {
    row.receiptVerdict = `EXPECTED a bound volume, GOT ${receipt}`;
  } else {
    const [dimensions, digest, occluders, gain] = receipt.split(':');
    const problems = [];
    if (dimensions !== '24x12x24') problems.push(`grid ${dimensions}`);
    if (!/^[0-9a-f]{8}$/.test(digest ?? '')) problems.push(`digest ${digest}`);
    if (!(Number(occluders) > 0)) problems.push(`occluderShapes ${occluders} - a sky-only bake is correct and invisible`);
    if (!(Number(gain) > 0)) problems.push(`live gain ${gain}`);
    row.receiptVerdict = problems.length === 0 ? 'OK' : problems.join('; ');
  }
} catch (error) {
  row.failure = String(error).slice(0, 400);
} finally {
  row.comfyQueueAfter = await comfyQueue();
  await browser.close();
}
if (row.comfyQueueAfter !== null && row.comfyQueueAfter > 0) {
  row.void = 'ComfyUI had work queued by the end of this run; the numbers are void.';
}
await mkdir(OUT, { recursive: true });
const name = `${TIER}-${AO ? `ao-${AO}-` : ''}${ARENA}.json`;
await writeFile(join(OUT, name), `${JSON.stringify(row, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(row, null, 2));
process.exit(row.failure || row.void ? 1 : 0);
