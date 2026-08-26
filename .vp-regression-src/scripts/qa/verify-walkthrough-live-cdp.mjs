#!/usr/bin/env node
// LIVE confirmation sweep for mechanical collider/visual-parity findings
// (companion to scripts/qa/audit-collider-visual-parity.ts).
//
// The Node-side audit constructs each arena from the same factory calls the
// game uses and reports, per arena: INVISIBLE COLLIDERs (authoritative
// collider with no visible mesh covering it) and WALK-THROUGH MESHes
// (substantial visible mesh with no collider). That is the permanent gate.
// This script answers the question the gate cannot: on the LIVE route, in
// INSTALLED CHROME HEADLESS on real hardware WebGPU (channel:'chrome' —
// measured 2026-08-25: gets a real device; bundled chromium fails
// requestDevice), does the game's OWN movement authority agree?
//
// For every walk-through finding it:
//   1. boots the arena solo and waits for commit;
//   2. calls window.__ATOMIC_ACRES_DEBUG__.collisionProbeAt(x, y, z) at the
//      mesh centre — the same isBlocked() the player capsule runs — plus a
//      chest-height sample, so "you walk through it" is measured authority,
//      not an AABB inference;
//   3. captures a PNG frame looking at the mesh so a human reads what the
//      player sees. Telemetry alone has burned this project before.
//
// Output: artifacts/qa/walkthrough-live/<arena>.json + <label>.png frames,
// plus a summary JSON at artifacts/qa/walkthrough-live/sweep.json.
// Exit codes: 0 = sweep completed (read the body!), 1 = any arena failed to
// boot, 2 = environment invalid (no WebGPU device / bundle drift). A
// CONFIRMED walk-through is a FINDING, not a script failure.
//
// Usage: node scripts/qa/verify-walkthrough-live-cdp.mjs
//        [--url http://127.0.0.1:41911] [--arenas atomic-acres,gun-range]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41911');
const OUT_DIR = resolve('artifacts/qa/walkthrough-live');

/**
 * Findings carried from the Node-side mechanical audit
 * (npx tsx scripts/qa/audit-collider-visual-parity.ts). Centre = world-space
 * AABB centre; probeY samples are world Y heights tested INSIDE the mesh
 * volume. camera = { x,y,z, yaw, pitch } poses the deterministic review
 * camera AT the mesh from ~3 m back along its longest horizontal axis.
 *
 * Keep in sync with the audit output; a stale row here fails loudly (probe
 * returns blocked everywhere or the frame shows nothing) rather than silently.
 */
const FINDINGS = [
  // atomic-acres — original-arena-art greenhouse: three-metre frame walls
  // authored decorative() with no movement collider (HF-387 family).
  {
    arena: 'atomic-acres',
    label: 'greenhouse-frame-wall-west',
    centre: [-30, 1.5, 21], size: [0.45, 3, 8],
    camera: { x: -26.6, y: 1.7, z: 21, yaw: Math.PI / 2, pitch: 0 },
    note: '3 m tall wall panel, walkable straight through',
  },
  {
    arena: 'atomic-acres',
    label: 'greenhouse-frame-wall-north',
    centre: [-23.5, 1.5, 17.2], size: [2.2, 3, 0.45],
    camera: { x: -23.5, y: 1.7, z: 20.8, yaw: 0, pitch: 0 },
    note: '3 m tall wall panel, walkable straight through',
  },
  {
    arena: 'atomic-acres',
    label: 'unnamed-tree-trunk-south-west',
    centre: [-18.53, 0.22, -28], size: [0.4, 0.95, 1.39],
    camera: { x: -18.53, y: 1.7, z: -25, yaw: 0, pitch: -0.15 },
    note: 'unnamed tree-trunk mesh (addTree) — audit cannot classify it by name',
  },
  {
    arena: 'atomic-acres',
    label: 'unnamed-tree-trunk-north-east',
    centre: [18.53, 0.22, 28], size: [0.4, 0.95, 1.39],
    camera: { x: 18.53, y: 1.7, z: 25, yaw: Math.PI, pitch: -0.15 },
    note: 'unnamed tree-trunk mesh (addTree) — audit cannot classify it by name',
  },
  // gun-range — wallbang demonstration panels are authored solid:false on
  // purpose (shots:true, HF-390 penetration demo); recorded here so the
  // decision is visible, not silent.
  {
    arena: 'gun-range',
    label: 'wallbang-panel-interior-wall',
    centre: [-12.3, 1.45, -7.6], size: [2.05, 2.9, 0.42],
    camera: { x: -12.3, y: 1.7, z: -4.4, yaw: 0, pitch: 0 },
    note: 'AUTHORED solid:false shots:true — deliberate shoot-through demo?',
  },
  {
    arena: 'gun-range',
    label: 'wallbang-panel-brick',
    centre: [-9.9, 1.45, -7.6], size: [2.05, 2.9, 0.7],
    camera: { x: -9.9, y: 1.7, z: -4.4, yaw: 0, pitch: 0 },
    note: 'AUTHORED solid:false shots:true — deliberate shoot-through demo?',
  },
];

const selected = arg('--arenas', [...new Set(FINDINGS.map((entry) => entry.arena))].join(','))
  .split(',').map((value) => value.trim()).filter(Boolean);

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
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

try {
  // Secure context first, THEN probe: navigator.gpu on about:blank lies, and
  // an adapter is not a device — requestDevice() and check the vendor.
  await page.goto(`${BASE}/?release=latest`, { waitUntil: 'domcontentloaded' });
  const gpuInfo = await page.evaluate(async () => {
    if (!navigator.gpu) return { ok: false, reason: 'navigator.gpu missing (not a secure context?)' };
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { ok: false, reason: 'requestAdapter returned null' };
      const device = await adapter.requestDevice();
      if (!device) return { ok: false, reason: 'requestDevice returned null' };
      return { ok: true, vendor: adapter.info?.vendor ?? 'unknown', architecture: adapter.info?.architecture ?? 'unknown' };
    } catch (error) {
      return { ok: false, reason: String(error).slice(0, 200) };
    }
  });
  console.error(`[walkthrough-live] gpu=${JSON.stringify(gpuInfo)}`);
  if (!gpuInfo.ok || gpuInfo.vendor === 'Microsoft') {
    // A Microsoft vendor string means the software rasteriser: timings and
    // behaviour on it are meaningless. Fail the ENVIRONMENT, not arenas.
    writeFileSync(resolve(OUT_DIR, 'sweep.json'), `${JSON.stringify({ verdict: 'ENVIRONMENT-INVALID', gpuInfo }, null, 2)}\n`);
    process.exitCode = 2;
  } else {
    await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=walkthrough-live&previewTime=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
    const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
    console.error(`[walkthrough-live] backend=${backend}`);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 160)));


    const results = [];
    for (const arenaId of selected) {
      const findings = FINDINGS.filter((entry) => entry.arena === arenaId);
      const boot = { arena: arenaId, committed: false, backend: null, findings: [] };

      try {
        await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
        await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
        await page.waitForFunction((id) => {
          const state = window.__ATOMIC_ACRES_DEBUG__.admissionState?.();
          return Boolean(state)
            && state.matchPhase === 'active'
            && state.arenaId === id;
        }, arenaId, { timeout: 300_000 });
        boot.committed = true;
        boot.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
        // Presentation art layers stream in after commit; probing before they
        // attach would judge the blockout shell, not what a player sees.
        await page.waitForTimeout(4000);
      } catch (error) {
        boot.error = String(error).slice(0, 300);
        results.push(boot);
        continue;
      }

      for (const finding of findings) {
        const [cx, , cz] = finding.centre;
        const [, cyMid] = finding.centre;
        // Probe INSIDE the mesh volume at two heights. isBlocked inflates the
        // collider by the capsule radius (0.36 here), so a true collider makes
        // these unambiguously blocked=true.
        const probes = await page.evaluate(([px, pyLow, pyHigh, pz]) => ({
          low: window.__ATOMIC_ACRES_DEBUG__.collisionProbeAt(px, pyLow, pz),
          chest: window.__ATOMIC_ACRES_DEBUG__.collisionProbeAt(px, pyHigh, pz),
        }), [cx, Math.max(0.15, cyMid - 0.6), Math.max(0.9, cyMid), cz]);
        const walkThroughConfirmed = !probes.low && !probes.chest;

        let framePath = null;
        if (finding.camera) {
          const cam = finding.camera;
          await page.evaluate(([x, y, z, yaw, pitch]) => {
            window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(x, y, z, yaw, pitch, 75);
          }, [cam.x, cam.y, cam.z, cam.yaw, cam.pitch]);
          await page.waitForTimeout(2000);
          framePath = resolve(OUT_DIR, `${arenaId}__${finding.label}.png`);
          await page.screenshot({ path: framePath });
        }

        boot.findings.push({
          label: finding.label,
          centre: finding.centre,
          note: finding.note ?? null,
          probes,
          walkThroughConfirmed,
          frame: framePath ? resolve(framePath).replace(/\\/g, '/') : null,
        });
        console.log(`[${arenaId}] ${finding.label}: probes=${JSON.stringify(probes)} confirmed=${walkThroughConfirmed}`);
      }

      results.push(boot);
    }

    const booted = results.filter((entry) => entry.committed);
    const confirmed = booted.flatMap((entry) => entry.findings.filter((f) => f.walkThroughConfirmed));
    const verdict = results.some((entry) => entry.error) ? 'PARTIAL'
      : booted.length === selected.length ? 'COMPLETE' : 'FAILED';
    writeFileSync(resolve(OUT_DIR, 'sweep.json'), `${JSON.stringify({
      verdict, gpuInfo, pageErrors: pageErrors.slice(0, 20),
      backends: [...new Set(booted.map((entry) => entry.backend).filter(Boolean))],
      arenasSwept: booted.map((entry) => entry.arena),
      confirmedWalkThroughs: confirmed.length,
      results,
    }, null, 2)}\n`);
    console.log(JSON.stringify({ verdict, arenasSwept: booted.length, confirmedWalkThroughs: confirmed.length }, null, 2));
    process.exitCode = verdict === 'COMPLETE' ? 0 : verdict === 'PARTIAL' ? 1 : 2;
  }
} finally {
  await browser.close();
}
