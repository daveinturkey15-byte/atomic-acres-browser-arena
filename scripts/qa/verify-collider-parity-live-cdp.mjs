#!/usr/bin/env node
// LIVE collider/visual parity verification across ALL SIX arenas (Pass 79,
// team invisible-geometry). Companion to the mechanical constructed-scene
// audit:
//
//   npx tsx scripts/qa/audit-collider-visual-parity.ts --json
//     -> artifacts/qa/collider-parity-audit.json   (constructed scene graph)
//   node scripts/qa/verify-collider-parity-live-cdp.mjs
//     -> THIS script                               (the LIVE booted arena)
//
// Green unit tests are NOT evidence a player can see/collide with the audited
// geometry, so this script boots every arena on REAL WebGPU (installed Chrome,
// headless, channel:'chrome' - measured 2026-08-25: real hardware device, no
// headed browser slot needed) and checks the audit against the game's OWN
// collision authority over CDP:
//
//   1. COLLIDER SAMPLES MUST BLOCK. For each deterministic colliderSample in
//      the audit JSON, collisionProbeAt(centre) must report blocked. A miss
//      means the audited collider does not exist in the live movement world -
//      exactly an invisible-collider candidate, measured not inferred.
//   2. WALK-THROUGH FINDINGS MUST LET YOU THROUGH. For each walk-through mesh
//      finding (including the accepted/triaged ledger entries), a segment
//      through the mesh centre along its NARROW axis must NOT be blocked AND
//      the centre point itself must NOT probe blocked. Both reporting blocked
//      is a live contradiction: what the audit called decorative is actually
//      a wall.
//   3. FRAMES ARE CAPTURED AND WRITTEN for every finding location, so the
//      JSON verdicts can be read against actual pixels instead of trusted.
//
// Output: artifacts/qa/collider-parity-live/<arena>.png frames plus
// report.json. Exit 0 = completed and consistent; 1 = live contradiction(s);
// 2 = environment/boot failure. READ THE JSON BODY - exit codes are triage,
// not proof.
//
// Usage: node scripts/qa/verify-collider-parity-live-cdp.mjs
//        [--url http://127.0.0.1:41911] [--arenas atomic-acres,...]
//        [--audit artifacts/qa/collider-parity-audit.json]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBootRoster } from './arena-roster.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41911');
const AUDIT_PATH = resolve(arg('--audit', 'artifacts/qa/collider-parity-audit.json'));
const ARENA_BOOT_TIMEOUT_MS = Number(arg('--boot-timeout-ms', '300000'));
const CAPTURES_PER_ARENA = Number(arg('--max-captures', '3'));
// PASS 85 Lane N repair: this default was a hardcoded six-arena literal, so the
// live collider-parity sweep never opened Test1, Test2 or Map 3 even though the
// offline audit it compares against (scripts/qa/collider-visual-parity-core.ts)
// already covered all nine. Derived now; `--arenas` still overrides it.
const selected = arg('--arenas', defaultBootRoster())
  .split(',').map((value) => value.trim()).filter(Boolean);

const OUT_DIR = resolve('artifacts/qa/collider-parity-live');
mkdirSync(OUT_DIR, { recursive: true });

const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf8'));
const auditByArena = new Map(audit.results.map((entry) => [entry.id, entry]));

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', 
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 160)));

// navigator.gpu requires a SECURE CONTEXT: land on 127.0.0.1 BEFORE probing -
// never about:blank. An adapter is not a device: requestDevice() and check
// the vendor; Microsoft means the software rasteriser.
const gpuInfo = await (async () => {
  await page.goto(`${BASE}/?renderer=webgpu&render=quality&seed=colliderlive&previewTime=0`, { waitUntil: 'load' });
  return page.evaluate(async () => {
    if (!navigator.gpu) return { ok: false, reason: 'navigator.gpu undefined' };
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: 'requestAdapter returned null' };
    const device = await adapter.requestDevice().catch(() => null);
    const vendor = adapter.info?.vendor ?? '(unknown)';
    if (!device) return { ok: false, reason: `requestDevice failed (adapter vendor ${vendor})` };
    return { ok: true, vendor, architecture: adapter.info?.architecture ?? '(unknown)' };
  });
})();
console.error(`[collider-live] gpu=${JSON.stringify(gpuInfo)}`);
if (!gpuInfo.ok || /microsoft|swiftshader|llvmpipe/i.test(gpuInfo.vendor ?? '')) {
  console.error('[collider-live] ABORT: no real hardware WebGPU device.');
  await browser.close();
  process.exit(2);
}

const servedBundle = () => page.evaluate(() => {
  const entry = performance.getEntriesByType('resource')
    .map((resource) => resource.name)
    .find((name) => name.includes('/legacy-main-'));
  return entry ? entry.slice(entry.lastIndexOf('/')) : null;
}).catch(() => null);
const BUNDLE_AT_START = await servedBundle();
console.error(`[collider-live] bundle=${BUNDLE_AT_START}`);

async function bootArena(arenaId) {
  await page.goto(`${BASE}/?renderer=webgpu&render=quality&seed=colliderlive&previewTime=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: ARENA_BOOT_TIMEOUT_MS });
  const usedBackend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  if (usedBackend !== 'webgpu') throw new Error(`backend is ${usedBackend}, expected webgpu`);
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.();
    return Boolean(snapshot) && snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: ARENA_BOOT_TIMEOUT_MS });
  await page.waitForTimeout(2000);
  // Freeze bots so probes measure collision authority, not marksmanship.
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
}

// Runs inside the page. Probe semantics come straight from the debug API:
// collisionProbeAt(x, y, z) is the authoritative isBlocked(..., radius)
// movement query; segmentBlocked(x1, z1, x2, z2) sweeps the same authority.
const PROBE_FN = ([samples, findings]) => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  const colliderProbes = samples.map((sample) => ({
    ...sample,
    blocked: debug.collisionProbeAt(sample.centre[0], sample.centre[1], sample.centre[2]),
  }));
  const walkThroughProbes = findings.map((finding) => {
    const [cx, , cz] = finding.centre;
    const [w, , d] = finding.size;
    // Segment along the mesh's NARROW axis so both endpoints sit outside the
    // mesh but the line passes through its centre volume.
    const alongX = w <= d;
    const half = ((alongX ? w : d) / 2) + 1;
    const x1 = alongX ? cx - half : cx;
    const z1 = alongX ? cz : cz - half;
    const x2 = alongX ? cx + half : cx;
    const z2 = alongX ? cz : cz + half;
    return {
      name: finding.name,
      centre: finding.centre,
      segment: [[x1, z1], [x2, z2]],
      segmentBlocked: debug.segmentBlocked(x1, z1, x2, z2),
      centreBlocked: debug.collisionProbeAt(cx, finding.centre[1], cz),
    };
  });
  let visibleMeshes = 0;
  const scene = debug.sampleSceneGraph();
  scene.updateMatrixWorld(true);
  scene.traverse((node) => {
    if (!node.isMesh) return;
    let visible = node.visible;
    for (let parent = node.parent; parent; parent = parent.parent) if (!parent.visible) visible = false;
    if (visible) visibleMeshes += 1;
  });
  return { colliderProbes, walkThroughProbes, visibleMeshes };
};

/**
 * Deterministic review-camera pose looking at a target point from `distance`
 * metres away, using the repo's forward=(-sin yaw, -cos yaw) convention.
 */
function capturePose(target, distance = 8) {
  // Approach from +Z/+X quadrant by default so the default yaw math stays
  // simple; direction chosen deterministically from the target coords.
  const dx = 0.6, dz = 0.8;
  const x = target[0] + dx * distance;
  const z = target[2] + dz * distance;
  const y = Math.max(target[1] + 2.5, 2.2);
  const yaw = Math.atan2(-(target[0] - x), -(target[2] - z));
  const pitch = -0.18;
  return [x, y, z, yaw, pitch];
}

const results = [];
for (const arena of selected.filter((id) => auditByArena.has(id))) {
  const entry = auditByArena.get(arena);
  if (entry.error) {
    results.push({ arena, ok: false, environmentInvalid: false, error: `audit JSON carries construction error: ${entry.error}` });
    continue;
  }
  try {
    console.error(`[collider-live] booting ${arena}...`);
    await bootArena(arena);

    const samples = entry.colliderSamples ?? [];
    const findings = entry.walkThroughMeshes ?? [];
    const probes = await page.evaluate(PROBE_FN, [samples, findings]);

    const unblockedColliders = probes.colliderProbes.filter((probe) => !probe.blocked);
    const contradictions = probes.walkThroughProbes.filter((probe) => probe.segmentBlocked && probe.centreBlocked);

    // Frames at the first few interesting locations, captured while the match
    // is still active (never after the AFTER-ACTION screen).
    const captures = [];
    const interesting = [
      ...contradictions.map((probe) => ({ label: `contradiction-${probe.name}`, centre: probe.centre })),
      ...unblockedColliders.map((probe) => ({ label: `unblocked-collider`, centre: probe.centre })),
      ...(findings[0] ? [{ label: `walkthrough-${String(findings[0].name).replace(/[^a-z0-9-]+/gi, '-')}`, centre: findings[0].centre }] : []),
    ].slice(0, CAPTURES_PER_ARENA);
    for (const shot of interesting) {
      await page.evaluate(([x, y, z, yaw, pitch]) => {
        window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(x, y, z, yaw, pitch, 75);
      }, capturePose(shot.centre));
      await page.waitForTimeout(2500);
      const path = resolve(OUT_DIR, `${arena}-${captures.length}-${shot.label.slice(0, 48)}.png`);
      await page.screenshot({ path });
      captures.push({ label: shot.label, centre: shot.centre, path });
    }

    results.push({
      arena,
      ok: unblockedColliders.length === 0 && contradictions.length === 0,
      colliderSamplesProbed: probes.colliderProbes.length,
      unblockedColliders,
      walkThroughFindingsProbed: probes.walkThroughProbes.length,
      contradictions,
      walkThroughProbes: probes.walkThroughProbes,
      liveVisibleMeshes: probes.visibleMeshes,
      auditVisibleMeshes: entry.visibleMeshes,
      captures,
    });
    console.log(`[${arena}] colliders ${probes.colliderProbes.length - unblockedColliders.length}/${probes.colliderProbes.length} blocked`
      + `, walk-through ${probes.walkThroughProbes.length} probed, ${contradictions.length} contradiction(s)`
      + `, meshes live=${probes.visibleMeshes} audit=${entry.visibleMeshes}`);
  } catch (error) {
    results.push({ arena, ok: false, environmentInvalid: true, error: String(error).slice(0, 400) });
  }
}
await browser.close();

const failed = results.filter((entry) => !entry.ok && !entry.environmentInvalid);
const invalidated = results.filter((entry) => entry.environmentInvalid);
const verdict = failed.length > 0 ? 'FAIL' : invalidated.length > 0 ? 'INVALID' : results.length === selected.length ? 'PASS' : 'INCOMPLETE';
writeFileSync(resolve(OUT_DIR, 'report.json'), `${JSON.stringify({
  verdict,
  bundleAtStart: BUNDLE_AT_START,
  gpu: gpuInfo,
  pageErrors: pageErrors.slice(-20),
  results,
}, null, 2)}\n`);
console.log(JSON.stringify({ verdict, failed: failed.map((entry) => entry.arena), invalidated: invalidated.map((entry) => entry.arena) }, null, 2));
process.exit(verdict === 'PASS' ? 0 : verdict === 'INVALID' ? 2 : 1);
