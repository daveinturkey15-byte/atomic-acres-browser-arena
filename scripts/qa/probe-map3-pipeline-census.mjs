/**
 * probe-map3-pipeline-census.mjs — WHEN does Map 3 create WebGPU render
 * pipelines, and does anything create one after the world is up?
 *
 * WHY THIS EXISTS RATHER THAN THE EXISTING TRIPWIRE
 * -------------------------------------------------
 * `probe-pipeline-compile-stalls-cdp.mjs` is the repository's pipeline
 * tripwire and it stays the authority for the GAME: it boots index.html, picks
 * an arena, starts a solo match and counts pipeline creations inside combat.
 * It cannot be pointed at Map 3's showcase page, because that page has no menu,
 * no arena selection and no match - `waitForFunction(__ATOMIC_ACRES_DEBUG__)`
 * never resolves there.
 *
 * So an art pass that lands in `src/map3/**` has no evidence either way from
 * that tripwire, and "the tripwire is green" would be a claim about a different
 * program. This probe asks the same question in the form the showcase page can
 * answer:
 *
 *     every GPURenderPipeline this page creates is stamped with the time it was
 *     requested; the world coming up is marked; the camera is then walked
 *     through the views under test for a fixed window; and the report states
 *     how many pipelines were created AFTER the mark.
 *
 * A pass that builds every material at construction reads 0 after the mark. A
 * pass that creates a material lazily - on first sight of a surface, per object,
 * or per frame - reads more, and that is the defect the game's tripwire exists
 * to catch, in the one place the game's tripwire cannot look.
 *
 * Headless, installed Chrome, and it refuses to launch below 3000 MiB of free
 * VRAM on this shared machine, exactly as the capture harness does.
 *
 * USAGE
 *   node scripts/qa/probe-map3-pipeline-census.mjs --port 4219 \
 *     --out docs/evidence/pass86/hf419/pipeline-census.json --seconds 26
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const PORT = Number(arg('--port', '4219'));
const SECONDS = Number(arg('--seconds', '26'));
const OUT = arg('--out', 'artifacts/hf419/pipeline-census.json');

/**
 * The poses to walk. Deliberately the two street-cell capture poses plus the
 * corridor and the hub: if a surface in the cell compiles lazily on first
 * sight, walking onto it after the mark is what exposes it.
 */
const A2 = (2 * Math.PI) / 4;
const local = (angle, lx, lz, y, yaw, pitch) => {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const wz0 = lz - 18;
  return { x: lx * c + wz0 * s, y, z: -lx * s + wz0 * c, yaw: angle + yaw, pitch };
};
const POSES = [
  { name: 'hub', x: 0, y: 1.7, z: 4, yaw: 0, pitch: -0.05 },
  { name: 'corridor-3-grammar', ...local(A2, 0, 2, 1.7, 0, -0.05) },
  { name: 'street-cell', ...local(A2, -5.2, -53.5, 1.87, 0, -0.045) },
  { name: 'street-kerbside', ...local(A2, -2.4, -62.0, 1.42, -0.62, -0.1) },
  { name: 'street-far', ...local(A2, 0, -72.0, 1.9, Math.PI, -0.02) },
];

function gpuFreeMiB() {
  try {
    const out = execSync('nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader', { encoding: 'utf8' });
    const [used, total] = out.split(',').map((s) => Number.parseInt(s, 10));
    return total - used;
  } catch { return null; }
}
for (let attempt = 0; ; attempt++) {
  const free = gpuFreeMiB();
  if (free === null || free >= 3000) { console.log(`[census] GPU free: ${free} MiB`); break; }
  if (attempt >= 9) throw new Error('GPU never had 3000 MiB free; not launching Chrome on a shared machine');
  console.log(`[census] only ${free} MiB free; waiting 60 s (attempt ${attempt + 1}/10)`);
  await new Promise((r) => setTimeout(r, 60_000));
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});

const report = { contract: 'map3-pipeline-census-v1', measuredAt: new Date().toISOString(), port: PORT, seconds: SECONDS };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.context().newCDPSession(page)
    .then((s) => s.send('Emulation.setFocusEmulationEnabled', { enabled: true })).catch(() => {});

  // Wrap the device factories BEFORE any page script runs, so the construction
  // total is visible beside the after-the-mark total. A build that compiles
  // everything up front and one that compiles nothing up front are
  // indistinguishable if you only watch the sample window.
  await page.addInitScript(() => {
    const state = { pipelines: [], shaderModules: [], hooked: false, markMs: null };
    window.__MAP3_PIPE__ = state;
    const install = () => {
      if (state.hooked) return;
      const dev = window.GPUDevice;
      if (!dev?.prototype) return;
      state.hooked = true;
      const wrap = (name, sink) => {
        const original = dev.prototype[name];
        if (typeof original !== 'function') return;
        dev.prototype[name] = function patched(descriptor, ...rest) {
          const at = performance.now();
          try { return original.call(this, descriptor, ...rest); } finally {
            sink.push({ atMs: Math.round(at), label: typeof descriptor?.label === 'string' ? descriptor.label.slice(0, 90) : null });
          }
        };
      };
      wrap('createRenderPipeline', state.pipelines);
      wrap('createRenderPipelineAsync', state.pipelines);
      wrap('createShaderModule', state.shaderModules);
    };
    install();
    if (!state.hooked) {
      const t = setInterval(() => { install(); if (state.hooked) clearInterval(t); }, 10);
      setTimeout(() => clearInterval(t), 30_000);
    }
  });

  await page.goto(`http://localhost:${PORT}/map3.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__MAP3 !== 'undefined', { timeout: 120_000 });
  // The world exists; let the first frames settle so construction-time and
  // first-draw compiles both land BEFORE the mark. Anything after the mark is
  // the thing this probe is looking for.
  await page.waitForTimeout(6000);
  const mark = await page.evaluate(() => {
    window.__MAP3_PIPE__.markMs = performance.now();
    return { markMs: window.__MAP3_PIPE__.markMs, atMark: window.__MAP3_PIPE__.pipelines.length, shadersAtMark: window.__MAP3_PIPE__.shaderModules.length };
  });
  console.log(`[census] mark at ${Math.round(mark.markMs)} ms; ${mark.atMark} pipelines built during construction`);

  const perPose = Math.max(1500, Math.round((SECONDS * 1000) / POSES.length));
  for (const pose of POSES) {
    await page.evaluate(({ x, y, z, yaw, pitch }) => window.__MAP3.setPose(x, y, z, yaw, pitch), pose);
    await page.waitForTimeout(perPose);
    const n = await page.evaluate(() => window.__MAP3_PIPE__.pipelines.length);
    console.log(`[census] after ${pose.name.padEnd(20)} total pipelines ${n}`);
  }

  const final = await page.evaluate(() => ({
    total: window.__MAP3_PIPE__.pipelines.length,
    shaders: window.__MAP3_PIPE__.shaderModules.length,
    markMs: window.__MAP3_PIPE__.markMs,
    afterMark: window.__MAP3_PIPE__.pipelines.filter((p) => p.atMs > window.__MAP3_PIPE__.markMs),
    shadersAfterMark: window.__MAP3_PIPE__.shaderModules.filter((s) => s.atMs > window.__MAP3_PIPE__.markMs).length,
    hud: document.getElementById('hud')?.textContent?.slice(0, 160) ?? null,
    errors: document.getElementById('errors')?.textContent?.slice(0, 600) ?? '',
  }));
  Object.assign(report, {
    pipelinesTotal: final.total,
    pipelinesDuringConstruction: mark.atMark,
    pipelinesAfterMark: final.afterMark.length,
    pipelinesAfterMarkDetail: final.afterMark,
    shaderModulesTotal: final.shaders,
    shaderModulesAfterMark: final.shadersAfterMark,
    hud: final.hud,
    errorPanel: final.errors,
    verdict: final.afterMark.length === 0 ? 'PASS' : 'FAIL',
  });
  console.log(`[census] ${report.verdict}: ${final.total} pipelines total, `
    + `${mark.atMark} at construction, ${final.afterMark.length} after the mark`);
} finally {
  await browser.close();
}
mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(resolve(OUT), `${JSON.stringify(report, null, 2)}\n`);
console.log(`[census] wrote ${resolve(OUT)}`);
if (report.verdict !== 'PASS') process.exitCode = 1;
