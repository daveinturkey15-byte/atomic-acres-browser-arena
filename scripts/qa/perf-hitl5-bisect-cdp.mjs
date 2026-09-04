#!/usr/bin/env node
// ===========================================================================
// PERF HITL5 IN-SESSION BISECT (HF-491, owner 2026-09-04 17:20: "the FPS is
// really bad" on HITL 4 where PASS 93 was smooth).
//
// One headless installed-Chrome session (real WebGPU device), one Solo boot
// of the arena, then a ladder of RUNTIME toggles applied to the live scene
// through `__ATOMIC_ACRES_DEBUG__.sampleSceneGraph()` - each toggle is applied,
// allowed to settle (pipelines recompile), sampled with the same uncapped rAF
// sampler and WebGPU prototype hooks as hf399-fps-phase-probe-cdp.mjs, then
// REVERTED before the next one. Same session, same pose, back to back, so
// ComfyUI/background noise is minimised and the delta of each toggle is the
// cost of the thing it hides.
//
// It also takes one CDP CPU profile over the baseline window so JS busy ms
// per frame can be set beside the frame time (GPU-bound vs CPU-bound).
//
// USAGE
//   node scripts/qa/perf-hitl5-bisect-cdp.mjs --url http://127.0.0.1:4300/ \
//     --arena nuketown2 --label hitl4 [--seconds 8] [--settle 4] \
//     [--toggles baseline,wear,veg,...] [--out-dir docs/evidence/pass94/perf-hitl5/bisect]
// ===========================================================================
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};
const DIST = arg('--dist', null) ? resolve(arg('--dist')) : null;
const PORT = Number(arg('--port', '4188'));
let URL_BASE = arg('--url', DIST ? `http://127.0.0.1:${PORT}/` : 'http://127.0.0.1:4300/');
const ARENA = arg('--arena', 'nuketown2');
const LABEL = arg('--label', 'run');
const SECONDS = Number(arg('--seconds', '8'));
const SETTLE = Number(arg('--settle', '4'));
const WARMUP_SECONDS = Number(arg('--warmup', '8'));
const WIDTH = Number(arg('--width', '2560'));
const HEIGHT = Number(arg('--height', '1440'));
const OUT_DIR = resolve(arg('--out-dir', 'docs/evidence/pass94/perf-hitl5/bisect'));
const PROFILE = arg('--profile', 'none');
const CPU_ALL = argv.includes('--cpu-all');
const TOGGLES = arg('--toggles', 'baseline,wear,veg,lawn,vehicles,grime,props,pool,operators,shadows,baseline-again').split(',');
const BOOT_TIMEOUT_MS = 300_000;
mkdirSync(OUT_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ktx2': 'image/ktx2', '.hdr': 'image/vnd.radiance',
  '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
let server = null;
if (DIST) {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}`);
  server = createServer((request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    const file = join(DIST, relative);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404).end('nope'); return; }
    const body = readFileSync(file);
    response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
    response.end(body);
  });
  await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));
  URL_BASE = `http://127.0.0.1:${PORT}/`;
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-frame-rate-limit', '--disable-gpu-vsync', '--enable-precise-memory-info',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});

const percentile = (sorted, p) => (sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]);
const report = { contract: 'perf-hitl5-bisect-v1', measuredAt: new Date().toISOString(), label: LABEL, arena: ARENA, base: URL_BASE, viewport: { width: WIDTH, height: HEIGHT }, seconds: SECONDS, settle: SETTLE, toggles: [] };

try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  page.on('console', (message) => { if (message.type() === 'error') console.error(`[page] ${message.text().slice(0, 200)}`); });

  // Same WebGPU prototype hooks as hf399-fps-phase-probe-cdp.mjs: installed before page script.
  await page.addInitScript(() => {
    const state = { draws: 0, triangles: 0, instances: 0, passes: 0, submits: 0, pipelines: 0, shaderModules: 0, frames: [], running: false, hooked: false, mark: null };
    window.__BISECT__ = state;
    const wrapCount = (proto, method, fn) => {
      const original = proto?.[method];
      if (typeof original !== 'function') return;
      proto[method] = function (...args) { fn(args, this); return original.apply(this, args); };
    };
    const hook = () => {
      const pass = globalThis.GPURenderPassEncoder;
      const device = globalThis.GPUDevice;
      const queue = globalThis.GPUQueue;
      const encoder = globalThis.GPUCommandEncoder;
      if (!pass || !device || !queue || !encoder) return false;
      wrapCount(pass.prototype, 'draw', ([vertexCount, instanceCount = 1]) => { state.draws += 1; state.instances += instanceCount; state.triangles += (vertexCount / 3) * instanceCount; });
      wrapCount(pass.prototype, 'drawIndexed', ([indexCount, instanceCount = 1]) => { state.draws += 1; state.instances += instanceCount; state.triangles += (indexCount / 3) * instanceCount; });
      wrapCount(pass.prototype, 'drawIndirect', () => { state.draws += 1; });
      wrapCount(pass.prototype, 'drawIndexedIndirect', () => { state.draws += 1; });
      wrapCount(encoder.prototype, 'beginRenderPass', () => { state.passes += 1; });
      wrapCount(queue.prototype, 'submit', () => { state.submits += 1; });
      wrapCount(device.prototype, 'createRenderPipeline', () => { state.pipelines += 1; });
      wrapCount(device.prototype, 'createRenderPipelineAsync', () => { state.pipelines += 1; });
      wrapCount(device.prototype, 'createShaderModule', () => { state.shaderModules += 1; });
      state.hooked = true;
      return true;
    };
    if (!hook()) { const timer = setInterval(() => { if (hook()) clearInterval(timer); }, 5); }
  });

  await page.goto(`${URL_BASE}?release=latest&renderer=webgpu`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => { const s = document.querySelector('#solo'); return s !== null && !s.disabled; }, undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.evaluate((profile) => {
    const select = document.querySelector('#graphics-profile');
    if (select && [...select.options].some((option) => option.value === profile)) {
      select.value = profile;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#graphics-save')?.click();
    }
  }, PROFILE);
  await page.waitForTimeout(1_000);
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => { const s = document.querySelector('#solo'); return s !== null && !s.disabled; }, undefined, { timeout: BOOT_TIMEOUT_MS });
  report.profileState = await page.evaluate(() => ({
    graphicsPreset: document.documentElement.dataset.graphicsPreset ?? null,
    renderBackend: document.documentElement.dataset.renderBackend ?? null,
    effective: document.querySelector('#graphics-effective')?.textContent ?? null,
  }));
  console.error(`[bisect] profile ${JSON.stringify(report.profileState)}`);

  await page.evaluate((arena) => {
    document.querySelector(`.map-card[data-arena-id="${arena}"]`)?.click();
    const name = document.querySelector('#player-name');
    if (name) name.value = 'PERF5';
  }, ARENA);
  await page.waitForTimeout(1_500);
  await page.evaluate(() => document.querySelector('#solo').click());
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return Boolean(s && s.matchPhase === 'active' && s.gameStarted === true);
  }, undefined, { timeout: BOOT_TIMEOUT_MS });
  console.error('[bisect] match active; warming up');
  await page.evaluate(() => { try { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true); } catch { /* absent */ } });
  await page.waitForTimeout(WARMUP_SECONDS * 1000);

  // Scene census: what is actually in the scene (by material name), so the
  // toggles below hide real things and the report can name them.
  report.census = await page.evaluate(() => {
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    const byMaterial = new Map();
    let meshes = 0;
    let visibleMeshes = 0;
    const materials = new Set();
    scene.traverse((node) => {
      if (!node.isMesh) return;
      meshes += 1;
      let anyVisible = true;
      for (let p = node; p; p = p.parent) if (p.visible === false) { anyVisible = false; break; }
      if (anyVisible) visibleMeshes += 1;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) {
        if (!m) continue;
        materials.add(m);
        const key = m.name || `(unnamed ${m.type})`;
        const entry = byMaterial.get(key) ?? { material: key, type: m.type, meshes: 0, instanced: 0, instances: 0, tris: 0, transparent: Boolean(m.transparent), hasColorNode: Boolean(m.colorNode), hasPositionNode: Boolean(m.positionNode), names: [] };
        entry.meshes += 1;
        if (node.isInstancedMesh) { entry.instanced += 1; entry.instances += node.count; }
        const g = node.geometry;
        const tri = g ? (g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3) : 0;
        entry.tris += tri * (node.isInstancedMesh ? node.count : 1);
        if (entry.names.length < 4) entry.names.push(node.name);
        byMaterial.set(key, entry);
      }
    });
    const rows = [...byMaterial.values()].sort((a, b) => b.tris - a.tris);
    // Where the nodes live (HF-491 offender 3): per top-level root, how many
    // nodes three walks each frame, how many still auto-recompose, how many
    // subtrees carry the static-matrix-freeze walk-skip, and how long ONE
    // `updateMatrixWorld()` of that root costs (median of 50, in-page, CPU
    // only - ComfyUI on the GPU cannot distort it).
    const timeWalk = (object) => {
      const samples = [];
      for (let i = 0; i < 50; i += 1) { const t0 = performance.now(); object.updateMatrixWorld(); samples.push(performance.now() - t0); }
      samples.sort((a, b) => a - b);
      return Number(samples[25].toFixed(3));
    };
    const roots = scene.children.map((root) => {
      let nodes = 0; let auto = 0; let frozen = 0; let rootMeshes = 0; let visible = 0;
      root.traverse((n) => { nodes += 1; if (n.matrixAutoUpdate) auto += 1; if (Object.prototype.hasOwnProperty.call(n, 'updateMatrixWorld')) frozen += 1; if (n.isMesh) { rootMeshes += 1; let v = true; for (let p = n; p; p = p.parent) if (p.visible === false) { v = false; break; } if (v) visible += 1; } });
      return { name: root.name || `(${root.type})`, type: root.type, visible: root.visible, nodes, auto, frozen, meshes: rootMeshes, visibleMeshes: visible, walkMs: timeWalk(root) };
    }).sort((a, b) => b.walkMs - a.walkMs);
    const prefixes = new Map();
    scene.traverse((n) => { const key = (n.name || `(${n.type})`).split(/[\s:_-]+/).slice(0, 2).join('-'); prefixes.set(key, (prefixes.get(key) ?? 0) + 1); });
    const prefixRows = [...prefixes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([prefix, count]) => ({ prefix, count }));
    let totalNodes = 0; let totalAuto = 0; scene.traverse((n) => { totalNodes += 1; if (n.matrixAutoUpdate) totalAuto += 1; });
    return { meshes, visibleMeshes, materials: materials.size, totalNodes, totalAuto, sceneWalkMs: timeWalk(scene), roots, prefixes: prefixRows, rows };
  });
  console.error(`[bisect] scene walk ${report.census.sceneWalkMs} ms (${report.census.totalNodes} nodes, ${report.census.totalAuto} auto)`);
  for (const root of report.census.roots.slice(0, 14)) console.error(`[bisect]   root ${root.name.padEnd(44).slice(0, 44)} nodes ${String(root.nodes).padStart(5)} auto ${String(root.auto).padStart(5)} frozen ${String(root.frozen).padStart(3)} meshes ${String(root.meshes).padStart(5)} vis ${String(root.visibleMeshes).padStart(3)} walk ${root.walkMs} ms${root.visible ? '' : ' (hidden)'}`);
  writeFileSync(join(OUT_DIR, `${LABEL}-${ARENA}-census.json`), `${JSON.stringify(report.census, null, 2)}\n`);
  console.error(`[bisect] census: ${report.census.meshes} meshes (${report.census.visibleMeshes} visible), ${report.census.materials} materials`);
  report.presentation = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const safe = (fn) => { try { return fn(); } catch (error) { return { error: String(error) }; } };
    return { telemetry: safe(() => api.samplePresentationTelemetry?.()), counters: safe(() => api.samplePresentationCounters?.()), lighting: safe(() => api.sampleLightingConditions?.()), weather: safe(() => api.sampleWeather?.()) };
  });
  console.error(`[bisect] presentation ${JSON.stringify(report.presentation).slice(0, 600)}`);

  const startSampler = () => page.evaluate(() => {
    const state = window.__BISECT__;
    state.frames = [];
    state.running = true;
    state.mark = { atMs: performance.now(), draws: state.draws, triangles: state.triangles, instances: state.instances, passes: state.passes, submits: state.submits, pipelines: state.pipelines, shaderModules: state.shaderModules };
    let last = performance.now();
    const tick = (now) => { if (!state.running) return; state.frames.push(now - last); last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const stopSampler = () => page.evaluate(() => {
    const state = window.__BISECT__;
    state.running = false;
    const mark = state.mark;
    const elapsedMs = performance.now() - mark.atMs;
    const frames = state.frames.slice(1);
    const sorted = [...frames].sort((a, b) => a - b);
    const n = Math.max(1, frames.length);
    return {
      elapsedMs: Math.round(elapsedMs), frames: frames.length, sorted,
      perFrame: { draws: (state.draws - mark.draws) / n, triangles: (state.triangles - mark.triangles) / n, instances: (state.instances - mark.instances) / n, renderPasses: (state.passes - mark.passes) / n, submits: (state.submits - mark.submits) / n },
      created: { renderPipelines: state.pipelines - mark.pipelines, shaderModules: state.shaderModules - mark.shaderModules, renderPipelinesTotal: state.pipelines },
    };
  });

  // Toggle definitions run in the page. Each returns a description and stashes
  // what it changed on window.__BISECT_STASH__ so `revert` can undo it.
  const TOGGLE_JS = {
    'baseline': { apply: () => 'nothing hidden', revert: () => {} },
    'baseline-again': { apply: () => 'nothing hidden (repeat, drift check)', revert: () => {} },
    'veg': {
      apply: () => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); const hit = []; s.traverse((n) => { if (n.name === 'nuketown2-vegetation' && n.visible) { n.visible = false; hit.push(n); } }); window.__BISECT_STASH__ = hit; return `hid ${hit.length} vegetation group(s)`; },
      revert: () => { for (const n of window.__BISECT_STASH__ ?? []) n.visible = true; },
    },
    'lawn': {
      apply: () => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); const hit = []; s.traverse((n) => { if (n.isMesh && n.visible && /^nuketown2?-lawn$/.test(n.name)) { n.visible = false; hit.push(n); } }); window.__BISECT_STASH__ = hit; return `hid ${hit.length} lawn-field mesh(es)`; },
      revert: () => { for (const n of window.__BISECT_STASH__ ?? []) n.visible = true; },
    },
    'vehicles': {
      apply: () => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); const hit = []; s.traverse((n) => { if (n.visible && /^vehicle-forge /.test(n.name) && n.isGroup) { n.visible = false; hit.push(n); } }); window.__BISECT_STASH__ = hit; return `hid ${hit.length} vehicle-forge group(s)`; },
      revert: () => { for (const n of window.__BISECT_STASH__ ?? []) n.visible = true; },
    },
    'grime': {
      apply: () => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); const hit = []; s.traverse((n) => { const m = n.material; if (n.isMesh && n.visible && m && !Array.isArray(m) && /grime|tyre|oil|crack|court|stones/i.test(m.name) && m.transparent) { n.visible = false; hit.push(n); } }); window.__BISECT_STASH__ = hit; return `hid ${hit.length} grime decal mesh(es)`; },
      revert: () => { for (const n of window.__BISECT_STASH__ ?? []) n.visible = true; },
    },
    'props': {
      apply: () => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); const hit = []; s.traverse((n) => { const m = n.material; if (n.isMesh && n.visible && m && !Array.isArray(m) && /yard-prop|cabinet|hob|glazing|sand|pod|chrome|timber-prop/i.test(m.name)) { n.visible = false; hit.push(n); } }); window.__BISECT_STASH__ = hit; return `hid ${hit.length} yard-prop mesh(es)`; },
      revert: () => { for (const n of window.__BISECT_STASH__ ?? []) n.visible = true; },
    },
    'pool': {
      apply: () => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); const hit = []; s.traverse((n) => { const m = n.material; if (n.isMesh && n.visible && m && !Array.isArray(m) && /pool-water/i.test(m.name)) { n.visible = false; hit.push(n); } }); window.__BISECT_STASH__ = hit; return `hid ${hit.length} pool-water mesh(es)`; },
      revert: () => { for (const n of window.__BISECT_STASH__ ?? []) n.visible = true; },
    },
    'operators': {
      apply: () => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); const hit = []; s.traverse((n) => { if (n.visible && /rigged-operator-visual|operator-stance-pivot/.test(n.name)) { n.visible = false; hit.push(n); } }); window.__BISECT_STASH__ = hit; return `hid ${hit.length} operator visual(s)`; },
      revert: () => { for (const n of window.__BISECT_STASH__ ?? []) n.visible = true; },
    },
    'shadows': {
      apply: () => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); const hit = []; s.traverse((n) => { if (n.isLight && n.castShadow) { n.castShadow = false; hit.push(n); } }); window.__BISECT_STASH__ = hit; return `disabled castShadow on ${hit.length} light(s)`; },
      revert: () => { for (const n of window.__BISECT_STASH__ ?? []) n.castShadow = true; },
    },
    // Stop the per-frame local-matrix recompose for every node under the arena
    // root(s) (three r185 recomposes every auto-updating node each frame).
    // Measures the CPU matrix cost of the static arena.
    'freeze-arena': {
      apply: () => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); const hit = []; for (const root of s.children) { if (!/arena|nuketown|map/i.test(root.name) || root.userData?.presentationPool) continue; root.traverse((n) => { if (n.matrixAutoUpdate) { n.updateMatrix(); n.matrixAutoUpdate = false; hit.push(n); } }); } window.__BISECT_STASH__ = hit; return `froze ${hit.length} node(s) under ${[...s.children].filter((r) => /arena|nuketown|map/i.test(r.name)).map((r) => r.name).join(',')}`; },
      revert: () => { for (const n of window.__BISECT_STASH__ ?? []) n.matrixAutoUpdate = true; },
    },
    // Strip the TSL wear graphs from every nuketown2 material (colour /
    // roughness / opacity / normal nodes) leaving the base PBR material with
    // its flat colour. Tests "is the per-fragment procedural wear the cost".
    'wear': {
      apply: () => {
        const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); const seen = new Set(); const stash = [];
        s.traverse((n) => {
          if (!n.isMesh) return;
          const mats = Array.isArray(n.material) ? n.material : [n.material];
          for (const m of mats) {
            if (!m || seen.has(m) || !/^nuketown2-/.test(m.name) || /foliage|pool-water/.test(m.name)) continue;
            if (!m.colorNode && !m.roughnessNode) continue;
            seen.add(m);
            stash.push({ m, colorNode: m.colorNode, roughnessNode: m.roughnessNode, opacityNode: m.opacityNode, normalNode: m.normalNode, metalnessNode: m.metalnessNode });
            m.colorNode = null; m.roughnessNode = null; m.opacityNode = null; m.normalNode = null; m.metalnessNode = null; m.needsUpdate = true;
          }
        });
        window.__BISECT_STASH__ = stash;
        return `stripped wear graphs from ${stash.length} nuketown2 material(s)`;
      },
      revert: () => { for (const e of window.__BISECT_STASH__ ?? []) { const m = e.m; m.colorNode = e.colorNode; m.roughnessNode = e.roughnessNode; m.opacityNode = e.opacityNode; m.normalNode = e.normalNode; m.metalnessNode = e.metalnessNode; m.needsUpdate = true; } },
    },
    // Strip the wind positionNode from foliage (vertex cost of hedge/tree sway).
    'foliage-wind': {
      apply: () => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); const seen = new Set(); const stash = []; s.traverse((n) => { if (!n.isMesh) return; const m = n.material; if (!m || Array.isArray(m) || seen.has(m) || !/foliage/.test(m.name) || !m.positionNode) return; seen.add(m); stash.push({ m, positionNode: m.positionNode }); m.positionNode = null; m.needsUpdate = true; }); window.__BISECT_STASH__ = stash; return `stripped wind from ${stash.length} foliage material(s)`; },
      revert: () => { for (const e of window.__BISECT_STASH__ ?? []) { e.m.positionNode = e.positionNode; e.m.needsUpdate = true; } },
    },
  };

  // JS busy time over the baseline window from a CDP CPU profile.
  const profileWindow = async (fn) => {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
    const result = await fn();
    const { profile } = await cdp.send('Profiler.stop');
    await cdp.send('Profiler.disable');
    const byId = new Map(profile.nodes.map((node) => [node.id, node]));
    let busy = 0; let idle = 0; let gc = 0; let program = 0;
    const self = new Map();
    for (let i = 0; i < profile.samples.length; i += 1) {
      const node = byId.get(profile.samples[i]);
      const dt = profile.timeDeltas[i] ?? 0;
      const fnName = node?.callFrame?.functionName ?? '';
      if (fnName === '(idle)') idle += dt;
      else if (fnName === '(garbage collector)') gc += dt;
      else if (fnName === '(program)') program += dt;
      else { busy += dt; const key = `${fnName || '(anonymous)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber}`; self.set(key, (self.get(key) ?? 0) + dt); }
    }
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([key, micros]) => ({ fn: key, ms: Number((micros / 1000).toFixed(1)) }));
    // Caller attribution for the matrix pass (HF-491 offender 3): for every
    // sample inside updateMatrixWorld / updateWorldMatrix / multiplyMatrices /
    // updateMatrix, charge it to the nearest ancestor frame that is NOT one
    // of those (the app or renderer function that started the walk).
    const parentOf = new Map();
    for (const node of profile.nodes) for (const childId of node.children ?? []) parentOf.set(childId, node.id);
    const MATRIX_FNS = new Set(['updateMatrixWorld', 'updateWorldMatrix', 'multiplyMatrices', 'updateMatrix', 'compose', 'skipUpdateMatrixWorldWhileFrozen']);
    const matrixCallers = new Map();
    let matrixMicros = 0;
    for (let i = 0; i < profile.samples.length; i += 1) {
      const node = byId.get(profile.samples[i]);
      if (!node || !MATRIX_FNS.has(node.callFrame.functionName)) continue;
      const dt = profile.timeDeltas[i] ?? 0;
      matrixMicros += dt;
      let cursor = node;
      while (cursor && MATRIX_FNS.has(cursor.callFrame.functionName)) cursor = byId.get(parentOf.get(cursor.id));
      const key = cursor ? `${cursor.callFrame.functionName || '(anonymous)'} ${cursor.callFrame.url.split('/').pop()}:${cursor.callFrame.lineNumber}` : '(root)';
      matrixCallers.set(key, (matrixCallers.get(key) ?? 0) + dt);
    }
    const matrix = { totalMs: matrixMicros / 1000, callers: [...matrixCallers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([key, micros]) => ({ fn: key, ms: Number((micros / 1000).toFixed(1)) })) };
    return { result, cpu: { busyMs: busy / 1000, idleMs: idle / 1000, gcMs: gc / 1000, programMs: program / 1000, top, matrix } };
  };

  for (const name of TOGGLES) {
    const toggle = TOGGLE_JS[name];
    if (!toggle) { console.error(`[bisect] unknown toggle ${name}`); continue; }
    const applied = await page.evaluate(toggle.apply);
    await page.waitForTimeout(SETTLE * 1000);
    let raw; let cpu = null;
    if (name === 'baseline' || CPU_ALL) {
      const profiled = await profileWindow(async () => { await startSampler(); await page.waitForTimeout(SECONDS * 1000); return stopSampler(); });
      raw = profiled.result; cpu = profiled.cpu;
    } else {
      await startSampler(); await page.waitForTimeout(SECONDS * 1000); raw = await stopSampler();
    }
    await page.evaluate(toggle.revert);
    await page.waitForTimeout(1_000);
    const sorted = raw.sorted;
    const row = {
      toggle: name, applied, frames: raw.frames, elapsedMs: raw.elapsedMs,
      fps: Number((raw.frames / (raw.elapsedMs / 1000)).toFixed(1)),
      frameMs: { p50: Number((percentile(sorted, 0.5) ?? 0).toFixed(2)), p95: Number((percentile(sorted, 0.95) ?? 0).toFixed(2)), p99: Number((percentile(sorted, 0.99) ?? 0).toFixed(2)), mean: Number((sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length)).toFixed(2)) },
      perFrame: Object.fromEntries(Object.entries(raw.perFrame).map(([k, v]) => [k, Number(v.toFixed(1))])),
      created: raw.created,
    };
    if (cpu) {
      row.cpu = { ...cpu, busyMsPerFrame: Number((cpu.busyMs / Math.max(1, raw.frames)).toFixed(2)), programMsPerFrame: Number((cpu.programMs / Math.max(1, raw.frames)).toFixed(2)), matrixMsPerFrame: Number((cpu.matrix.totalMs / Math.max(1, raw.frames)).toFixed(2)) };
      console.error(`[bisect]   matrix ${row.cpu.matrixMsPerFrame} ms/frame by caller: ${cpu.matrix.callers.slice(0, 8).map((c) => `${c.fn}=${(c.ms / Math.max(1, raw.frames)).toFixed(2)}`).join('  ')}`);
    }
    report.toggles.push(row);
    console.error(`[bisect] ${LABEL} ${ARENA} ${name.padEnd(14)} fps ${String(row.fps).padStart(6)}  p50 ${row.frameMs.p50} p95 ${row.frameMs.p95} p99 ${row.frameMs.p99}  draws ${row.perFrame.draws} tris ${Math.round(row.perFrame.triangles)} inst ${Math.round(row.perFrame.instances)} pipes+${row.created.renderPipelines}  (${applied})${cpu ? `  js-busy ${row.cpu.busyMsPerFrame} ms/frame` : ''}`);
  }
  const shot = join(OUT_DIR, `${LABEL}-${ARENA}.png`);
  await page.screenshot({ path: shot });
} finally {
  await browser.close();
  if (server) server.close();
}
const out = join(OUT_DIR, `${LABEL}-${ARENA}.json`);
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.error(`Wrote ${out}`);
