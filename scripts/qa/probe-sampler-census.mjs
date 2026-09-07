/**
 * probe-sampler-census.mjs — HF-536 look-2b step 1.
 *
 * WHY THIS EXISTS. `gotcha-silent-arena-rollback-device-limit` records a real
 * failure on this map: a 17-sampler arena's `requestDevice` was REJECTED with
 * no visible error and the arena silently rolled back. So before any pass adds
 * a texture (an alpha leaf atlas, say) somebody has to answer, with a number,
 * "how many texture samplers does nuketown2 actually bind per shader stage,
 * and what is the device's limit?". Guessing that is exactly how the rollback
 * happened.
 *
 * WHAT IT MEASURES. It wraps the real WebGPU device before three ever touches
 * it and records:
 *   - adapter limits, the limits three REQUESTED, and the limits the device
 *     actually granted (the granted number is the one that binds);
 *   - every GPUBindGroupLayout's entries, classified sampler / texture /
 *     storageTexture / externalTexture / buffer;
 *   - every render pipeline, resolved through its pipeline layout to the
 *     bind-group layouts it uses, so a PER-PIPELINE PER-STAGE sampler count
 *     can be computed — which is what `maxSamplersPerShaderStage` actually
 *     limits. A whole-arena total is NOT the limit and reporting one alone
 *     would be misleading.
 *   - the WGSL of the worst pipeline, as evidence.
 *
 * Read-only: no src import, no scene mutation, writes JSON only.
 *
 * Usage:
 *   node scripts/qa/probe-sampler-census.mjs --dist dist-x --port 4322 \
 *        --profile quality --out docs/forge/sampler-census.json
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DIST = arg('--dist', 'dist-look2b-base');
const PORT = Number(arg('--port', '4322'));
// 'quality' and 'performance' are the two OWNER-FACING profiles the night
// contract requires everything to hold in. resolveRenderProfile maps
// render=quality -> 'blender' and render=performance -> 'performance'.
const PROFILES = (arg('--profiles', 'quality,performance')).split(',').map((s) => s.trim()).filter(Boolean);
const OUT = resolve(process.cwd(), arg('--out', 'docs/forge/sampler-census.json'));
const ARENA = arg('--arena', 'nuketown2');
mkdirSync(dirname(OUT), { recursive: true });

if (!existsSync(resolve(DIST, 'index.html'))) {
  console.error(`REFUSED: ${DIST}/index.html does not exist — build first`);
  process.exit(2);
}

let child = null;
const kill = () => {
  if (child && child.pid != null) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
};
process.on('exit', kill);
process.on('SIGINT', () => { kill(); process.exit(130); });

child = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore', shell: process.platform === 'win32' });
const deadline = Date.now() + 60000;
let up = false;
while (Date.now() < deadline && !up) {
  try { up = (await fetch(`http://127.0.0.1:${PORT}/`)).ok; } catch { /* not up */ }
  if (!up) await new Promise((r) => setTimeout(r, 400));
}
if (!up) { kill(); console.error('server never came up'); process.exit(2); }

// PORT-SQUATTER GUARD (gotcha-viewpoint-capture-port-squatter): prove the
// bytes on :PORT are the bytes in DIST before believing any measurement.
const diskIndex = readFileSync(resolve(DIST, 'index.html'), 'utf8');
const servedIndex = await (await fetch(`http://127.0.0.1:${PORT}/index.html`)).text();
if (servedIndex !== diskIndex || child.exitCode !== null) {
  kill();
  console.error('REFUSED: served index differs from dist (squatter?) or preview died');
  process.exit(2);
}

const initScript = () => {
  const R = { adapterLimits: null, requestedLimits: null, deviceLimits: null, layouts: [], pipelineLayouts: [], pipelines: [], modules: [], uncaptured: [] };
  window.__SAMPLER_CENSUS__ = R;
  const dumpLimits = (l) => {
    const o = {};
    try {
      let p = Object.getPrototypeOf(l);
      while (p && p !== Object.prototype) {
        for (const k of Object.getOwnPropertyNames(p)) { const v = l[k]; if (typeof v === 'number') o[k] = v; }
        p = Object.getPrototypeOf(p);
      }
    } catch { /* ignore */ }
    return o;
  };
  if (typeof GPUAdapter === 'undefined') return;
  const origRD = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function patched(desc) {
    const dev = await origRD.call(this, desc);
    if (R.deviceLimits === null) {
      R.adapterLimits = dumpLimits(this.limits);
      R.requestedLimits = desc && desc.requiredLimits ? { ...desc.requiredLimits } : null;
      R.deviceLimits = dumpLimits(dev.limits);
      try { dev.addEventListener('uncapturederror', (e) => R.uncaptured.push(String(e.error && e.error.message).slice(0, 400))); } catch { /* ignore */ }
      let n = 0;
      const wrap = (name, fn) => { const o = dev[name].bind(dev); dev[name] = (...a) => fn(o, ...a); };
      wrap('createShaderModule', (o, d) => {
        const r = o(d); r.__id = `mod${n += 1}`;
        const src = String(d.code || '');
        // WGSL-side evidence: every `var ...: sampler` / `texture_*` binding.
        const decls = src.match(/@group\(\d+\)\s*@binding\(\d+\)\s*var[^;]*;/g) || [];
        R.modules.push({
          id: r.__id,
          label: d.label || null,
          wgslSamplers: decls.filter((s) => /:\s*sampler(_comparison)?\s*;/.test(s)).length,
          wgslTextures: decls.filter((s) => /:\s*texture_/.test(s)).length,
          decls: decls.slice(0, 80),
          codeLen: src.length,
          code: src,
        });
        return r;
      });
      wrap('createBindGroupLayout', (o, d) => {
        const r = o(d); r.__id = `bgl${n += 1}`;
        const entries = (d.entries || []).map((e) => ({
          binding: e.binding,
          visibility: e.visibility,
          kind: e.buffer ? `buffer:${e.buffer.type || 'uniform'}`
            : e.sampler ? 'sampler'
              : e.texture ? 'texture'
                : e.storageTexture ? 'storageTexture'
                  : e.externalTexture ? 'externalTexture' : '?',
        }));
        R.layouts.push({ id: r.__id, label: d.label || null, entries });
        return r;
      });
      wrap('createPipelineLayout', (o, d) => {
        const r = o(d); r.__id = `pl${n += 1}`;
        R.pipelineLayouts.push({ id: r.__id, bgls: (d.bindGroupLayouts || []).map((b) => (b && b.__id) || 'auto') });
        return r;
      });
      const rec = (d) => ({
        index: R.pipelines.length,
        label: d.label || null,
        layout: typeof d.layout === 'string' ? d.layout : ((d.layout && d.layout.__id) || null),
        vertex: (d.vertex && d.vertex.module && d.vertex.module.__id) || null,
        fragment: (d.fragment && d.fragment.module && d.fragment.module.__id) || null,
      });
      wrap('createRenderPipeline', (o, d) => { R.pipelines.push(rec(d)); return o(d); });
      wrap('createRenderPipelineAsync', (o, d) => { R.pipelines.push(rec(d)); return o(d); });
      wrap('createComputePipeline', (o, d) => {
        R.pipelines.push({
          index: R.pipelines.length, label: d.label || null, compute: true,
          layout: typeof d.layout === 'string' ? d.layout : ((d.layout && d.layout.__id) || null),
          vertex: null, fragment: (d.compute && d.compute.module && d.compute.module.__id) || null,
        });
        return o(d);
      });
    }
    return dev;
  };
};

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
    '--window-position=2560,0'],
});

const report = { generatedAt: new Date().toISOString(), dist: DIST, arena: ARENA, profiles: {} };
let code = 0;
try {
  for (const profile of PROFILES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[error] ${m.text().slice(0, 300)}`); });
    await page.addInitScript(initScript);
    const url = `http://127.0.0.1:${PORT}/?release=latest&renderer=webgpu&render=${profile}&seed=viewpoint&previewTime=0&tod=authored`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180000 });
    const bundle = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/legacy-main-')) || null);
    const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend || null);
    await page.evaluate(async (a) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(a); }, ARENA);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return s.matchPhase === 'active' && s.gameStarted === true;
    }, undefined, { timeout: 180000 });
    // Let every deferred pipeline compile: three compiles a program the first
    // time an object is actually drawn, so a short hold undercounts.
    await page.waitForTimeout(12000);

    const probe = await page.evaluate(() => window.__SAMPLER_CENSUS__ || null);
    const scene = await page.evaluate(() => {
      const dbg = window.__ATOMIC_ACRES_DEBUG__;
      let mapped = 0; let materials = 0; const mapKeys = {};
      try {
        const root = dbg.sampleSceneGraph();
        const seen = new Set();
        root.traverse((o) => {
          const m = o.material; if (!m) return;
          for (const mm of (Array.isArray(m) ? m : [m])) {
            if (!mm || seen.has(mm.uuid)) continue; seen.add(mm.uuid); materials += 1;
            let any = false;
            for (const k of ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'displacementMap', 'envMap', 'lightMap', 'specularMap']) {
              if (mm[k]) { mapKeys[k] = (mapKeys[k] || 0) + 1; any = true; }
            }
            if (any) mapped += 1;
          }
        });
      } catch { /* debug surface may not expose the graph */ }
      return { materials, materialsWithMaps: mapped, mapKeys };
    });

    report.profiles[profile] = { url, bundle, backend, consoleErrors: consoleErrors.slice(0, 40), scene, probe };
    await page.close();
  }
  writeFileSync(OUT.replace(/\.json$/, '.raw.json'), JSON.stringify(report, null, 1));
} catch (e) {
  code = 1;
  report.error = String(e).slice(0, 900);
  console.error(String(e).slice(0, 900));
} finally {
  await browser.close().catch(() => {});
  kill();
}

// ---------------------------------------------------------------------------
// Reduce to the census. The LIMIT is per shader stage per pipeline, so that is
// the headline number; the arena total is reported beside it as context only.
// ---------------------------------------------------------------------------
const summary = { generatedAt: report.generatedAt, dist: DIST, arena: ARENA, profiles: {} };
for (const [profile, data] of Object.entries(report.profiles)) {
  const p = data.probe;
  if (!p) { summary.profiles[profile] = { error: 'no probe data' }; continue; }
  const bglById = new Map(p.layouts.map((l) => [l.id, l]));
  const plById = new Map(p.pipelineLayouts.map((l) => [l.id, l]));
  const modById = new Map(p.modules.map((m) => [m.id, m]));
  const rows = [];
  for (const pipe of p.pipelines) {
    const pl = pipe.layout && plById.get(pipe.layout);
    let samplers = 0; let textures = 0; let auto = false;
    if (pl) {
      for (const id of pl.bgls) {
        const bgl = bglById.get(id);
        if (!bgl) { auto = true; continue; }
        for (const e of bgl.entries) {
          if (e.kind === 'sampler') samplers += 1;
          else if (e.kind === 'texture' || e.kind === 'externalTexture') textures += 1;
        }
      }
    } else auto = true;
    const frag = pipe.fragment && modById.get(pipe.fragment);
    rows.push({
      index: pipe.index,
      label: pipe.label,
      compute: Boolean(pipe.compute),
      layoutResolved: !auto,
      layoutSamplers: samplers,
      layoutTextures: textures,
      wgslSamplers: frag ? frag.wgslSamplers : null,
      wgslTextures: frag ? frag.wgslTextures : null,
    });
  }
  const worstLayout = rows.reduce((a, r) => Math.max(a, r.layoutSamplers), 0);
  const worstWgsl = rows.reduce((a, r) => Math.max(a, r.wgslSamplers ?? 0), 0);
  const worstTexLayout = rows.reduce((a, r) => Math.max(a, r.layoutTextures), 0);
  const worstTexWgsl = rows.reduce((a, r) => Math.max(a, r.wgslTextures ?? 0), 0);
  const limSampler = (p.deviceLimits && p.deviceLimits.maxSamplersPerShaderStage) ?? null;
  const limTexture = (p.deviceLimits && p.deviceLimits.maxSampledTexturesPerShaderStage) ?? null;
  summary.profiles[profile] = {
    bundle: data.bundle,
    backend: data.backend,
    pipelines: p.pipelines.length,
    shaderModules: p.modules.length,
    bindGroupLayouts: p.layouts.length,
    uncapturedErrors: p.uncaptured,
    consoleErrors: data.consoleErrors,
    scene: data.scene,
    limits: {
      adapterMaxSamplersPerShaderStage: p.adapterLimits && p.adapterLimits.maxSamplersPerShaderStage,
      adapterMaxSampledTexturesPerShaderStage: p.adapterLimits && p.adapterLimits.maxSampledTexturesPerShaderStage,
      requested: p.requestedLimits,
      grantedMaxSamplersPerShaderStage: limSampler,
      grantedMaxSampledTexturesPerShaderStage: limTexture,
    },
    worst: {
      samplersPerPipelineLayout: worstLayout,
      samplersPerFragmentWgsl: worstWgsl,
      sampledTexturesPerPipelineLayout: worstTexLayout,
      sampledTexturesPerFragmentWgsl: worstTexWgsl,
    },
    headroom: {
      samplers: limSampler === null ? null : limSampler - Math.max(worstLayout, worstWgsl),
      sampledTextures: limTexture === null ? null : limTexture - Math.max(worstTexLayout, worstTexWgsl),
    },
    topPipelines: rows.filter((r) => !r.compute)
      .sort((a, b) => (Math.max(b.layoutSamplers, b.wgslSamplers ?? 0)) - (Math.max(a.layoutSamplers, a.wgslSamplers ?? 0)))
      .slice(0, 12),
  };
}
writeFileSync(OUT, JSON.stringify(summary, null, 1));
for (const [profile, s] of Object.entries(summary.profiles)) {
  if (s.error) { console.log(`${profile}: ${s.error}`); continue; }
  console.log(`${profile}: pipelines=${s.pipelines} worstSamplers=${JSON.stringify(s.worst)} granted=${s.limits.grantedMaxSamplersPerShaderStage}/${s.limits.grantedMaxSampledTexturesPerShaderStage} headroom=${JSON.stringify(s.headroom)} backend=${s.backend}`);
}
process.exit(code);
