/**
 * HF-418 / Lane AL - the missing headless stage: pull a REAL arena's analytic
 * proxy scene out of a running build so the offline bake has something true to
 * bake.
 *
 * WHY IT EXISTS. `scripts/bake/bake-arena-indirect.mjs` was written to take an
 * already-extracted proxy (`--proxy`) precisely because a genuinely offline bake
 * needs the arena built, which needs a browser with WebGPU. The producing half
 * was never built, so the only thing anyone ever baked was the script's own
 * 6-shape `syntheticScene()` - and the published bake-cost table was quoted from
 * it as though it were an arena. Every shipped arena's runtime receipt reports
 * 24 occluder shapes. Bake cost is dominated by shape count. The table was
 * therefore wrong by several times, and nothing in the repository could have
 * corrected it.
 *
 * WHAT IT READS. `globalThis.__ATOMIC_ACRES_BAKE_PROXY__`, published by
 * `baked-indirect-runtime.ts` at the moment it derives a digest: the same proxy,
 * the same quantised lighting and the same digest the runtime bakes against.
 * Not a reconstruction - the actual input.
 *
 * Headless only, one browser at a time, never focused (the owner's standing
 * instruction). The owner's ComfyUI queue is read before the run and the run
 * refuses if it has work, because a browser launched beside a generating
 * ComfyUI is a browser competing for his GPU.
 *
 * Usage:
 *   node scripts/qa/extract-arena-proxy.mjs --url http://127.0.0.1:PORT \
 *     --arena atomic-acres --out artifacts/proxy
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
const OUT = args.get('out') ?? 'artifacts/proxy';
const TIMEOUT = Number(args.get('timeout') ?? '300000');

async function comfyQueue() {
  try {
    const response = await fetch('http://127.0.0.1:8188/queue', { signal: AbortSignal.timeout(4000) });
    const body = await response.json();
    return (body.queue_running?.length ?? 0) + (body.queue_pending?.length ?? 0);
  } catch {
    return null;
  }
}

const queued = await comfyQueue();
if (queued !== null && queued > 0) {
  console.error(`[proxy] REFUSING: the owner's ComfyUI has ${queued} item(s) queued.`);
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
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));

let exitCode = 0;
try {
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&seed=lightq&previewTime=0`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: TIMEOUT });
  // QUALITY, the auto-selected default, already ships bakedIndirect 'low', so
  // the layer derives a proxy without the Options surface being touched. That
  // is deliberate: the proxy this writes is the one a default player bakes.
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: TIMEOUT });
  // The extraction is debounced against the scene root settling, so it lands a
  // second or two after admission rather than at it.
  await page.waitForFunction(() => Boolean(globalThis.__ATOMIC_ACRES_BAKE_PROXY__), undefined, { timeout: 120_000 });
  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  const payload = await page.evaluate(() => {
    const published = globalThis.__ATOMIC_ACRES_BAKE_PROXY__;
    return JSON.parse(JSON.stringify(published));
  });
  const receipt = await page.evaluate(() => document.documentElement.dataset.bakedIndirect ?? null);
  if (backend !== 'webgpu') throw new Error(`backend ${backend}: this proxy would describe the wrong renderer`);
  if (!payload?.scene?.shapes?.length) throw new Error('the published proxy has no shapes - a sky-only bake');
  payload.arenaId = ARENA;
  payload.extractedAt = new Date().toISOString();
  payload.runtimeReceipt = receipt;
  payload.pageErrors = errors.length;
  await mkdir(OUT, { recursive: true });
  const file = join(OUT, `${ARENA}.json`);
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    arena: ARENA,
    file,
    occluderShapes: payload.scene.shapes.length,
    candidatesConsidered: payload.scene.candidatesConsidered,
    capReason: payload.scene.capReason ?? null,
    digest: payload.digest,
    tier: payload.tier,
    runtimeReceipt: receipt,
    backend,
    pageErrors: errors.length,
  }, null, 2));
} catch (error) {
  console.error(`[proxy] FAILED for ${ARENA}: ${String(error).slice(0, 400)}`);
  exitCode = 1;
} finally {
  await browser.close();
}
process.exit(exitCode);
