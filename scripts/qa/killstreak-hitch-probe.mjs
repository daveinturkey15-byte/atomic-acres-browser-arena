#!/usr/bin/env node
// PASS 95 / HF-546 - native-WebGPU killstreak hitch probe.
// This is deliberately arena-agnostic: the arena is selected through the real
// debug API, while the scripted support activations exercise the real pooled
// presentation and authority snapshot paths.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};
const DIST = resolve(arg('--dist', 'dist'));
const LABEL = arg('--label', 'run');
const PORT = Number(arg('--port', '4320'));
const ARENA = arg('--arena', 'nuketown2');
const SECONDS = Number(arg('--seconds', '205'));
const OUT_DIR = resolve(arg('--out-dir', 'docs/evidence/pass95/night-killstreak-lag'));
const WIDTH = Number(arg('--width', '2560'));
const HEIGHT = Number(arg('--height', '1440'));
const HARD_KILL_MS = Number(arg('--hard-kill-ms', '232000'));
const HITCH_MS = Number(arg('--hitch-ms', '50'));

if (process.env.PASS73_NATIVE_WEBGPU !== '1') {
  console.error('[killstreak] REFUSAL: rerun with PASS73_NATIVE_WEBGPU=1.');
  process.exit(2);
}
if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}. Run npm run build first.`);
if (SECONDS < 1 || SECONDS > 220) throw new Error(`--seconds must be 1..220 (got ${SECONDS})`);
mkdirSync(OUT_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ktx2': 'image/ktx2', '.hdr': 'image/vnd.radiance',
  '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
  const file = join(DIST, relative);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404).end('nope'); return; }
  const body = readFileSync(file);
  response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));

const round = (value, digits = 3) => Number(Number(value).toFixed(digits));
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]);
};
const cloneCounters = (c) => Object.fromEntries(Object.entries(c).map(([key, value]) => [key, Number(value)]));
const subtractCounters = (end, start) => Object.fromEntries(Object.keys(end).map((key) => [key, (end[key] ?? 0) - (start[key] ?? 0)]));

function installInstrument() {
  const S = {
    hooked: false, running: false, frames: [], phases: [], longTasks: [], phase: null, current: null,
    c: {
      pipelines: 0, pipelineMs: 0, shaderModules: 0, shaderMs: 0,
      gpuBuffers: 0, gpuBufferBytes: 0, gpuBufferMs: 0, gpuTextures: 0, gpuTextureBytes: 0, gpuTextureMs: 0,
      writeBuffer: 0, writeBufferBytes: 0, writeBufferMs: 0, writeTexture: 0, writeTextureBytes: 0, writeTextureMs: 0,
      externalImage: 0, externalImageMs: 0, draws: 0, triangles: 0, submits: 0, passes: 0,
      canvas2d: 0, canvas2dMs: 0, styleReads: 0, styleReadMs: 0, layoutReads: 0, layoutReadMs: 0,
      audioDecode: 0, audioDecodeMs: 0, audioStarts: 0,
    },
  };
  globalThis.__AA_HITCH__ = S;
  const now = () => performance.now();
  const timed = (proto, name, key, msKey, bytesOf) => {
    if (!proto || typeof proto[name] !== 'function') return;
    const original = proto[name];
    proto[name] = function patched(...args) {
      const started = now();
      const result = original.apply(this, args);
      S.c[msKey] += now() - started;
      S.c[key] += 1;
      if (bytesOf) { try { bytesOf(args); } catch { /* instrumentation only */ } }
      return result;
    };
  };
  const counted = (proto, name, sink) => {
    if (!proto || typeof proto[name] !== 'function') return;
    const original = proto[name];
    proto[name] = function patched(...args) { sink(args); return original.apply(this, args); };
  };
  const install = () => {
    if (S.hooked) return;
    const device = globalThis.GPUDevice;
    const queue = globalThis.GPUQueue;
    const pass = globalThis.GPURenderPassEncoder;
    const encoder = globalThis.GPUCommandEncoder;
    if (!device?.prototype || !queue?.prototype || !pass?.prototype || !encoder?.prototype) return;
    S.hooked = true;
    timed(device.prototype, 'createRenderPipeline', 'pipelines', 'pipelineMs');
    timed(device.prototype, 'createRenderPipelineAsync', 'pipelines', 'pipelineMs');
    timed(device.prototype, 'createComputePipeline', 'pipelines', 'pipelineMs');
    timed(device.prototype, 'createShaderModule', 'shaderModules', 'shaderMs');
    timed(device.prototype, 'createBuffer', 'gpuBuffers', 'gpuBufferMs', (args) => { S.c.gpuBufferBytes += Number(args?.[0]?.size ?? 0); });
    timed(device.prototype, 'createTexture', 'gpuTextures', 'gpuTextureMs', (args) => { S.c.gpuTextureBytes += Number(args?.[0]?.size ?? 0); });
    timed(queue.prototype, 'writeBuffer', 'writeBuffer', 'writeBufferMs', (args) => {
      S.c.writeBufferBytes += Number(args?.[4] ?? args?.[2]?.byteLength ?? 0);
    });
    timed(queue.prototype, 'writeTexture', 'writeTexture', 'writeTextureMs', (args) => {
      S.c.writeTextureBytes += Number(args?.[1]?.byteLength ?? 0);
    });
    timed(queue.prototype, 'copyExternalImageToTexture', 'externalImage', 'externalImageMs');
    counted(queue.prototype, 'submit', () => { S.c.submits += 1; });
    counted(encoder.prototype, 'beginRenderPass', () => { S.c.passes += 1; });
    counted(pass.prototype, 'draw', ([vertexCount, instanceCount = 1]) => { S.c.draws += 1; S.c.triangles += (vertexCount / 3) * instanceCount; });
    counted(pass.prototype, 'drawIndexed', ([indexCount, instanceCount = 1]) => { S.c.draws += 1; S.c.triangles += (indexCount / 3) * instanceCount; });
    counted(pass.prototype, 'drawIndirect', () => { S.c.draws += 1; });
    counted(pass.prototype, 'drawIndexedIndirect', () => { S.c.draws += 1; });
  };
  install();
  if (!S.hooked) {
    const timer = setInterval(() => { install(); if (S.hooked) clearInterval(timer); }, 10);
    setTimeout(() => clearInterval(timer), 60_000);
  }
  const ctx2d = globalThis.CanvasRenderingContext2D?.prototype;
  for (const name of ['drawImage', 'putImageData', 'getImageData', 'fillRect', 'clearRect', 'fill', 'stroke', 'fillText', 'createPattern']) timed(ctx2d, name, 'canvas2d', 'canvas2dMs');
  timed(globalThis.Element?.prototype, 'getBoundingClientRect', 'layoutReads', 'layoutReadMs');
  timed(globalThis.Range?.prototype, 'getBoundingClientRect', 'layoutReads', 'layoutReadMs');
  for (const name of ['AudioContext', 'webkitAudioContext', 'OfflineAudioContext']) timed(globalThis[name]?.prototype, 'decodeAudioData', 'audioDecode', 'audioDecodeMs');
  counted(globalThis.AudioBufferSourceNode?.prototype, 'start', () => { S.c.audioStarts += 1; });
  counted(globalThis.AudioScheduledSourceNode?.prototype, 'start', () => { S.c.audioStarts += 1; });
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (S.running) S.longTasks.push({ atMs: entry.startTime, durationMs: entry.duration });
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch { /* unsupported */ }
  const channel = new MessageChannel();
  let pendingFrame = null;
  channel.port1.onmessage = () => { if (pendingFrame) { pendingFrame.jsMs = now() - pendingFrame.startMs; pendingFrame = null; } };
  S.start = () => {
    S.frames = []; S.phases = []; S.longTasks = []; S.running = true; S.phase = null;
    try { performance.mark('AA_KS_T0'); } catch { /* ignore */ }
    S.markPhase = (name) => {
      if (S.current) { S.current.endMs = now(); S.phases.push(S.current); }
      S.current = { name, startMs: now(), endMs: null, frameStart: S.frames.length, activationMs: null, activationLabel: null, counters: cloneCounters(S.c) };
      S.phase = name;
    };
    S.markActivation = (label) => { if (S.current) { S.current.activationMs = now(); S.current.activationLabel = label; } };
    S.endPhase = () => { if (S.current) { S.current.endMs = now(); S.phases.push(S.current); S.current = null; S.phase = null; } };
    let previous = cloneCounters(S.c);
    let previousStart = now();
    const tick = (rafNow) => {
      if (!S.running) return;
      requestAnimationFrame(tick);
      const startMs = now();
      const delta = {};
      for (const key of Object.keys(S.c)) { const value = S.c[key] - previous[key]; if (value) delta[key] = value; }
      previous = cloneCounters(S.c);
      const frame = { i: S.frames.length, phase: S.phase, startMs, rafMs: rafNow, frameMs: startMs - previousStart, jsMs: null, d: delta };
      previousStart = startMs; S.frames.push(frame); pendingFrame = frame; channel.port2.postMessage(0);
    };
    requestAnimationFrame(tick);
  };
  S.stop = () => { S.running = false; if (S.current) { S.current.endMs = now(); S.phases.push(S.current); S.current = null; } return { frames: S.frames, phases: S.phases, longTasks: S.longTasks, counters: cloneCounters(S.c), markNowMs: now() }; };
  S.capturePresentation = (slot) => {
    const presentation = globalThis.__ATOMIC_ACRES_DEBUG__?.snapshot?.()?.killstreakPresentation ?? null;
    const value = presentation ? {
      nodesWalked: presentation.nodesWalked ?? null,
      liveWorldMatrixWalks: presentation.liveWorldMatrixWalks ?? null,
      redundantCheckoutNodeUpdates: presentation.redundantCheckoutNodeUpdates ?? null,
      autoUpdatingNodes: presentation.autoUpdatingNodes ?? null,
      swarmRenderedInstances: presentation.swarmRenderedInstances ?? null,
      swarmInstanceMatrixSignatures: presentation.swarmInstanceMatrixSignatures ?? [],
      swarmAnimatedInstanceMatrixSignatures: presentation.swarmAnimatedInstanceMatrixSignatures ?? [],
    } : null;
    if (S.current) S.current[`presentation${slot[0].toUpperCase()}${slot.slice(1)}`] = value;
    return value;
  };
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--window-position=-4000,-4000', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--enable-precise-memory-info',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion'],
});
const hardKill = setTimeout(() => { console.error(`[killstreak] HARD KILL at ${HARD_KILL_MS} ms`); browser.close().catch(() => {}); server.close(); process.exit(3); }, HARD_KILL_MS);
let sampled = null;
let traceEvents = [];
let traceAligned = false;
const consoleErrors = [];
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300)); });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 300)}`));
  await page.addInitScript(installInstrument);
  await page.addInitScript((loadout) => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify({ schemaVersion: 1, slots: loadout }));
  }, ['care-package', 'piloted-drone', 'carpet-bomber', 'hunter-swarm', 'drone-swarm']);
  const url = new URL(`http://127.0.0.1:${PORT}/`);
  url.searchParams.set('release', 'latest'); url.searchParams.set('renderer', 'webgpu'); url.searchParams.set('seed', `hf-546-${LABEL}`);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
  await page.waitForFunction(() => { const solo = document.querySelector('#solo'); return solo && !solo.disabled; }, undefined, { timeout: 240_000 });
  await page.evaluate(async (arena) => globalThis.__ATOMIC_ACRES_DEBUG__.selectArena(arena), ARENA);
  await page.evaluate(() => globalThis.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => { const snapshot = globalThis.__ATOMIC_ACRES_DEBUG__?.snapshot(); return snapshot?.matchPhase === 'active' && snapshot?.gameStarted === true; }, undefined, { timeout: 240_000 });

  const initial = await page.evaluate(() => {
    const snapshot = globalThis.__ATOMIC_ACRES_DEBUG__.snapshot();
    const actor = snapshot.killstreak?.actors?.find((entry) => entry.actorId === snapshot.player?.id) ?? snapshot.killstreak?.actors?.[0];
    return { loadout: actor?.loadout?.slots ?? null, available: snapshot.fieldSupport?.available ?? null, renderer: snapshot.render?.backend ?? snapshot.graphics?.renderBackend ?? null };
  });
  const expectedSlots = ['care-package', 'piloted-drone', 'carpet-bomber', 'hunter-swarm', 'drone-swarm'];
  if (JSON.stringify(initial.loadout) !== JSON.stringify(expectedSlots)) throw new Error(`loadout verification failed: ${JSON.stringify(initial.loadout)}`);

  await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: ['devtools.timeline', 'blink.user_timing', 'disabled-by-default-devtools.timeline', 'v8', 'disabled-by-default-v8.gc', 'disabled-by-default-blink.gc'] } }).catch(() => {});
  cdp.on('Tracing.dataCollected', ({ value }) => { traceEvents.push(...value.filter((event) => event.name === 'AA_KS_T0' || ['X', 'complete'].includes(event.ph))); });
  await page.evaluate((arena) => {
    const api = globalThis.__ATOMIC_ACRES_DEBUG__;
    const route = arena === 'nuketown2' ? [[-9, 1.7, -12.5, 0], [-2, 1.7, 0, -Math.PI / 2], [6, 1.7, 4, Math.PI], [0, 1.7, 10, Math.PI / 2], [-8, 1.7, 2, 0]] : [[-4, 1.7, -20, -Math.PI / 2], [-30, 1.7, 0, -Math.PI / 2]];
    let index = 0; let yaw = 0;
    api.setMovement?.(true, false);
    globalThis.__AA_KS_ROUTE__ = setInterval(() => { const [x, y, z, facing] = route[index++ % route.length]; api.teleportPlayer(x, y, z, facing, 0); }, 6_000);
    globalThis.__AA_KS_LOOK__ = setInterval(() => { yaw += 0.35; const pose = api.samplePlayerPose?.(); if (pose?.position) api.teleportPlayer(pose.position[0], pose.position[1], pose.position[2], yaw, Math.sin(yaw) * 0.15); }, 700);
  }, ARENA);
  await page.evaluate(() => globalThis.__AA_HITCH__.start());

  const phaseSpecs = [
    { name: 'baseline', seconds: 20, quiet: 0, action: null },
    { name: 'care-package', seconds: 12, action: 'care-package' },
    { name: 'carpet-bomber', seconds: 15, action: 'carpet-bomber' },
    { name: 'hunter-swarm', seconds: 15, action: 'hunter-swarm' },
    { name: 'chopper', seconds: 12, action: 'chopper' },
    { name: 'chopper-possess', seconds: 12, action: 'chopper-possess' },
    { name: 'drone-swarm', seconds: 20, action: 'drone-swarm' },
    { name: 'swarm-plus-chopper', seconds: 15, action: 'swarm-plus-chopper' },
    { name: 'cooldown', seconds: 20, action: null },
  ];
  let elapsed = 0;
  for (const spec of phaseSpecs) {
    const quiet = spec.quiet ?? (spec.name === 'baseline' ? 0 : 8);
    if (quiet) { await page.waitForTimeout(quiet * 1_000); elapsed += quiet; }
    await page.evaluate((name) => globalThis.__AA_HITCH__.markPhase(name), spec.name);
    await page.evaluate(() => globalThis.__AA_HITCH__.capturePresentation('start'));
    if (spec.action) {
      const result = await page.evaluate((action) => {
        const api = globalThis.__ATOMIC_ACRES_DEBUG__;
        const earn = () => { for (let attempt = 0; attempt < 3; attempt += 1) { api.earnSupport(15); const state = api.snapshot(); if (state.fieldSupport?.available?.[action] === true) break; } };
        const activate = (id) => { earn(); return api.activateKillstreak(id, [0, 1, 1], [0, 0, 1]); };
        if (action === 'chopper-possess') {
          const entity = api.snapshot().killstreak?.entities?.find((entry) => entry.kind === 'chopper' && entry.ownerId === api.snapshot().player?.id);
          const entered = entity ? api.toggleChopperGunnerControl(entity.id) : false;
          if (entered) { api.setTriggerHeld?.(true); }
          return { entered, entityId: entity?.id ?? null };
        }
        if (action === 'swarm-plus-chopper') {
          const swarm = activate('drone-swarm');
          const chopper = activate('chopper');
          return { swarm, chopper };
        }
        return { activated: activate(action) };
      }, spec.action);
      await page.evaluate((label) => globalThis.__AA_HITCH__.markActivation(label), spec.action);
      if (spec.name === 'drone-swarm' || spec.name === 'chopper-possess') {
        await page.screenshot({ path: join(OUT_DIR, `${LABEL}-${spec.name}-activation.png`) }).catch(() => {});
      }
      if (spec.name === 'drone-swarm') {
        await page.waitForFunction(() => (globalThis.__ATOMIC_ACRES_DEBUG__.snapshot().killstreakPresentation?.swarmRenderedInstances ?? 0) === 24, undefined, { timeout: 10_000 }).catch(() => {});
      }
      if (spec.name === 'chopper-possess') {
        await page.waitForTimeout(2_000);
        await page.evaluate(() => { globalThis.__ATOMIC_ACRES_DEBUG__.setTriggerHeld?.(false); globalThis.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl?.(); });
      }
      console.error(`[killstreak] ${LABEL} ${spec.name}: ${JSON.stringify(result)}`);
    }
    await page.waitForTimeout(spec.seconds * 1_000);
    elapsed += spec.seconds;
    await page.evaluate(() => globalThis.__AA_HITCH__.capturePresentation('end'));
    await page.evaluate(() => globalThis.__AA_HITCH__.endPhase());
  }
  if (elapsed > SECONDS + 5) console.error(`[killstreak] scheduled phases ${elapsed}s exceed requested ${SECONDS}s`);
  sampled = await page.evaluate(() => globalThis.__AA_HITCH__.stop());
  await page.evaluate(() => { clearInterval(globalThis.__AA_KS_ROUTE__); clearInterval(globalThis.__AA_KS_LOOK__); globalThis.__ATOMIC_ACRES_DEBUG__.setMovement?.(false, false); globalThis.__ATOMIC_ACRES_DEBUG__.setTriggerHeld?.(false); });
  const done = new Promise((resolveDone) => cdp.once('Tracing.tracingComplete', resolveDone));
  await cdp.send('Tracing.end').catch(() => {});
  await Promise.race([done, new Promise((resolveDone) => setTimeout(resolveDone, 20_000))]);
  traceAligned = traceEvents.some((event) => event.name === 'AA_KS_T0');
  const finalState = await page.evaluate(() => globalThis.__ATOMIC_ACRES_DEBUG__.snapshot());
  await page.screenshot({ path: join(OUT_DIR, `${LABEL}-final.png`) }).catch(() => {});
  const report = {
    contract: 'pass95-native-webgpu-killstreak-hitch-probe-v1', measuredAt: new Date().toISOString(), label: LABEL,
    arena: ARENA, seconds: SECONDS, viewport: { width: WIDTH, height: HEIGHT }, hitchThresholdMs: HITCH_MS,
    browser: { channel: 'chrome', headless: true, flags: 'stock disclosed measurement flags', nativeWebGpuRequired: true },
    initial, expectedSlots, consoleErrors: consoleErrors.slice(0, 20), traceAligned, traceEvents: traceEvents.length,
    final: { matchPhase: finalState.matchPhase, gameStarted: finalState.gameStarted, killstreak: finalState.killstreak, presentation: finalState.killstreakPresentation },
    raw: sampled,
  };
  for (const phase of report.raw.phases) {
    const frames = report.raw.frames.filter((frame) => frame.phase === phase.name && Number.isFinite(frame.frameMs));
    const activationWindow = phase.activationMs === null ? [] : frames.filter((frame) => frame.startMs >= phase.activationMs && frame.startMs <= phase.activationMs + 3_000);
    const frameMs = frames.map((frame) => frame.frameMs);
    const counterTotals = frames.reduce((total, frame) => { for (const [key, value] of Object.entries(frame.d)) total[key] = (total[key] ?? 0) + value; return total; }, {});
    phase.evidence = {
      frames: frames.length, fps: frames.length && frameMs.length ? round(1_000 / (frameMs.reduce((sum, value) => sum + value, 0) / frameMs.length), 2) : null,
      p50: percentile(frameMs, 0.50), p95: percentile(frameMs, 0.95), p99: percentile(frameMs, 0.99), p999: percentile(frameMs, 0.999), max: frameMs.length ? round(Math.max(...frameMs)) : null,
      framesGte33_4: frameMs.filter((value) => value >= 33.4).length, framesGte50: frameMs.filter((value) => value >= 50).length, framesGte100: frameMs.filter((value) => value >= 100).length,
      activation3s: { frames: activationWindow.length, p99: percentile(activationWindow.map((frame) => frame.frameMs), 0.99), max: activationWindow.length ? round(Math.max(...activationWindow.map((frame) => frame.frameMs))) : null },
      counters: counterTotals,
      nodesWalkedPerFrame: phase.presentationEnd && frames.length ? round((phase.presentationEnd.nodesWalked - phase.presentationStart.nodesWalked) / frames.length, 2) : null,
      liveWorldMatrixWalks: phase.presentationEnd && phase.presentationStart ? phase.presentationEnd.liveWorldMatrixWalks - phase.presentationStart.liveWorldMatrixWalks : null,
      checkoutNodeUpdates: phase.presentationEnd && phase.presentationStart ? phase.presentationEnd.redundantCheckoutNodeUpdates - phase.presentationStart.redundantCheckoutNodeUpdates : null,
      autoUpdatingNodes: phase.presentationEnd?.autoUpdatingNodes ?? null,
    };
  }
  const snapshots = await page.evaluate(() => {
    const s = globalThis.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { presentation: s.killstreakPresentation, stateBytes: JSON.stringify({ type: 'killstreak-state', snapshot: s.killstreak }).length };
  }).catch(() => null);
  report.snapshots = snapshots;
  writeFileSync(join(OUT_DIR, `${LABEL}.json`), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(OUT_DIR, `${LABEL}.md`), `# ${LABEL}\n\nNative WebGPU killstreak probe.\n\n- Trace aligned: ${traceAligned}\n- Console errors: ${consoleErrors.length}\n- Phases: ${report.raw.phases.map((phase) => `${phase.name}=${phase.evidence?.frames ?? 0} frames`).join(', ')}\n`);
} finally {
  clearTimeout(hardKill);
  await browser.close().catch(() => {});
  server.close();
}
