#!/usr/bin/env node
// Invisible-wall MAP sweep (Pass 79, owner complaint HF-387 "clipping still
// happens ... near walls"). Companion to scripts/qa/verify-invisible-blockers.mjs,
// which is a PASS/FAIL close-out gate that boots WebGL2/performance on bundled
// chromium. This script is the evidence collector the gate is not:
//
//   - Boots the REAL WebGPU route in INSTALLED Chrome, headless, channel:'chrome'
//     (measured 2026-08-25: gets a real hardware WebGPU device; bundled
//     chromium fails requestDevice). No headed browser slot required.
//   - Sweeps a denser grid per arena, four compass directions with real key
//     input, and records EVERY blocked move with coordinates.
//   - Cross-references every block against the same visible-leaf-mesh rule the
//     static audit uses (src/invisible-blocker-audit.ts): an unexplained stop
//     is an invisible-wall FINDING; a stop with a visible mesh in front or at
//     the perimeter containment is not.
//   - For each finding it additionally records the NEAREST visible mesh within
//     2 m (name + gap), which is the hint invisible-geometry needs to fix it.
//   - Captures a PNG frame from the player camera at every finding so a human
//     can read what the player actually sees there. Telemetry alone has burned
//     this project before; frames are the evidence.
//
// Output: artifacts/qa/invisible-walls/sweep.json + per-finding PNGs under
// artifacts/qa/invisible-walls/<arena>/. Exit 0 always when the sweep COMPLETED
// (findings are the deliverable, not a failure); exit 1 only if an arena could
// not be swept at all. Read the JSON body; do not trust the exit code.
//
// Usage: node scripts/qa/sweep-invisible-walls-cdp.mjs [--url http://127.0.0.1:41911]
//        [--arenas atomic-acres,...] [--step cells] [--hold-ms 500]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41911');
const HOLD_MS = Number(arg('--hold-ms', '500'));
const SETTLE_MS = Number(arg('--settle-ms', '400'));
const BLOCKED_THRESHOLD_M = Number(arg('--threshold', '0.35'));
const EYE_HEIGHT_M = 1.7;
const MAX_CAPTURES_PER_ARENA = Number(arg('--max-captures', '24'));

// Grids stay inside each arena's authored bounds by a margin so a cell can
// never legitimately press the perimeter containment. Cell counts are denser
// than verify-invisible-blockers.mjs because this run's purpose is a MAP,
// not a gate; bounds are identical to that script's authored values.
const ARENAS = [
  { id: 'atomic-acres', minX: -31, maxX: 31, minZ: -40, maxZ: 40, cells: [10, 12], dropY: 5 },
  { id: 'rustworks-1v1', minX: -24, maxX: 24, minZ: -26, maxZ: 26, cells: [9, 9], dropY: 5 },
  { id: 'gun-range', minX: -16, maxX: 16, minZ: -44, maxZ: 34, cells: [8, 12], dropY: 5 },
  { id: 'skyline-terminal', minX: -32, maxX: 32, minZ: -32, maxZ: 32, cells: [10, 10], dropY: 5 },
  { id: 'high-seas', minX: -9, maxX: 9, minZ: -41, maxZ: 41, cells: [6, 14], dropY: 7 },
  { id: 'farcrysis', minX: -29, maxX: 29, minZ: -29, maxZ: 29, cells: [9, 9], dropY: 5 },
];
const selected = arg('--arenas', ARENAS.map((entry) => entry.id).join(','))
  .split(',').map((value) => value.trim()).filter(Boolean);

// Yaw convention (see the farcrysis harness): forward is (-sin yaw, -cos yaw).
const DIRECTIONS = [
  { label: 'north', yaw: 0 },
  { label: 'west', yaw: Math.PI / 2 },
  { label: 'south', yaw: Math.PI },
  { label: 'east', yaw: -Math.PI / 2 },
];

const OUT_DIR = resolve('artifacts/qa/invisible-walls');
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

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 160)));

// Secure context first, THEN probe the device: navigator.gpu on about:blank
// lies. An adapter is not a device - requestDevice() and check the vendor.
const gpuInfo = await (async () => {
  await page.goto(`${BASE}/?renderer=webgpu&render=quality&seed=wallmap&previewTime=0`, { waitUntil: 'load' });
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
console.error(`[wall-sweep] gpu=${JSON.stringify(gpuInfo)}`);
if (!gpuInfo.ok) {
  console.error('[wall-sweep] ABORT: no real WebGPU device; refusing to produce a WebGL2-era map.');
  await browser.close();
  process.exit(1);
}

const backend = () => page.evaluate(() => document.documentElement.dataset.renderBackend ?? null).catch(() => null);
console.error(`[wall-sweep] backend=${await backend()}`);

const ARENA_BOOT_TIMEOUT_MS = 300_000;

async function awaitDebugApi(timeout = 120_000) {
  try {
    await page.waitForFunction(
      () => Boolean(window.__ATOMIC_ACRES_DEBUG__?.snapshot?.()?.player),
      undefined,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

async function evaluateWithDebugApi(fn, argEval) {
  if (!(await awaitDebugApi())) return null;
  try {
    return await page.evaluate(fn, argEval);
  } catch (error) {
    if (String(error).includes('Execution context was destroyed')
      || String(error).includes('undefined')) return null;
    throw error;
  }
}

async function bootArena(arenaId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`${BASE}/?renderer=webgpu&render=quality&seed=wallmap&previewTime=0`, { waitUntil: 'load' });
      await page.waitForTimeout(1_000);
      await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: ARENA_BOOT_TIMEOUT_MS });
      const usedBackend = await backend();
      if (usedBackend !== 'webgpu') throw new Error(`backend is ${usedBackend}, expected webgpu`);
      await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
      await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
      await page.waitForFunction(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.();
        return Boolean(snapshot) && snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
      }, undefined, { timeout: ARENA_BOOT_TIMEOUT_MS });
      await page.waitForTimeout(2_000);
      const frozen = await evaluateWithDebugApi(() => {
        window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
        return true;
      });
      // Bots must be frozen or the walk measures marksmanship, not collision.
      if (!frozen) throw new Error('Execution context was destroyed before bots could be frozen');
      await page.click('body');
      return;
    } catch (error) {
      if (attempt === 2 || !String(error).includes('Execution context was destroyed')) throw error;
    }
  }
}

/** Visible leaf meshes as world-space AABBs - same rule as the static audit. */
async function sampleVisibleBoxes() {
  return page.evaluate(() => {
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    scene.updateMatrixWorld(true);
    const boxes = [];
    scene.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      let visible = node.visible;
      for (let parent = node.parent; parent; parent = parent.parent) if (!parent.visible) visible = false;
      if (!visible) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (!materials.some((material) => material && material.visible && (!material.transparent || material.opacity > 0.05))) return;
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      const bounding = node.geometry.boundingBox;
      if (!bounding || bounding.isEmpty()) return;
      const box = bounding.clone().applyMatrix4(node.matrixWorld);
      boxes.push({
        minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z,
        name: node.name || '(unnamed)',
      });
    });
    window.__BLOCKER_PROBE_BOXES = boxes;
    return boxes.length;
  });
}

/**
 * Explanation lookup for a blocked stop. Returns:
 *   sampled:false            -> box sample lost (reload); NOT a finding.
 *   name != null             -> visible mesh occupies the probe point; explained.
 *   name == null             -> nothing visible there -> invisible-wall finding.
 * nearest gives the closest visible mesh within 2 m regardless, as fix context.
 */
const EXPLAIN_FN = ([qx, qyMin, qyMax, qz]) => {
  const boxes = window.__BLOCKER_PROBE_BOXES;
  if (!Array.isArray(boxes) || boxes.length === 0) return { sampled: false, name: null, nearest: null };
  const half = 0.5;
  const hit = boxes.find((box) =>
    box.minX <= qx + half && box.maxX >= qx - half
    && box.minY <= qyMax && box.maxY >= qyMin
    && box.minZ <= qz + half && box.maxZ >= qz - half);
  let nearest = null;
  let bestGap = Infinity;
  for (const box of boxes) {
    const dx = Math.max(box.minX - qx, 0, qx - box.maxX);
    const dy = Math.max(box.minY - ((qyMin + qyMax) / 2), 0, ((qyMin + qyMax) / 2) - box.maxY);
    const dz = Math.max(box.minZ - qz, 0, qz - box.maxZ);
    const gap = Math.hypot(dx, dy, dz);
    if (gap < bestGap) {
      bestGap = gap;
      if (gap <= 2) nearest = { name: box.name, gapM: Number(gap.toFixed(2)) };
    }
  }
  return { sampled: true, name: hit ? hit.name : null, nearest };
};

async function runArena(arena) {
  await bootArena(arena.id);
  const boxCount = await sampleVisibleBoxes();

  const findings = [];
  let cellsTested = 0;
  let movesTested = 0;
  let blockedExplained = 0;
  let reloadsSurvived = 0;

  const [cellsX, cellsZ] = arena.cells;
  for (let cx = 0; cx < cellsX; cx += 1) {
    const x = arena.minX + (cellsX === 1 ? 0.5 : cx / (cellsX - 1)) * (arena.maxX - arena.minX);
    for (let cz = 0; cz < cellsZ; cz += 1) {
      const z = arena.minZ + (cellsZ === 1 ? 0.5 : cz / (cellsZ - 1)) * (arena.maxZ - arena.minZ);
      cellsTested += 1;
      for (const direction of DIRECTIONS) {
        const placed = await evaluateWithDebugApi(([px, py, pz, yaw]) => {
          const debug = window.__ATOMIC_ACRES_DEBUG__;
          if (!debug) return false;
          if (!debug.snapshot().player.alive) debug.respawn();
          debug.teleportPlayer(px, py, pz, yaw, 0);
          return true;
        }, [x, arena.dropY, z, direction.yaw]);
        if (!placed) { reloadsSurvived += 1; continue; }
        await page.waitForTimeout(SETTLE_MS);
        const before = await evaluateWithDebugApi(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          return { position: snapshot.player.position, alive: snapshot.player.alive };
        });
        if (!before) { reloadsSurvived += 1; continue; }
        if (!before.alive) continue;
        // A cell that settled far from its drop is inside solid authority or
        // fell out of the sampled shell - direction results would be noise.
        if (Math.hypot(before.position[0] - x, before.position[2] - z) > 2.5) continue;
        movesTested += 1;
        await page.keyboard.down('KeyW');
        await page.waitForTimeout(HOLD_MS);
        await page.keyboard.up('KeyW');
        const after = await evaluateWithDebugApi(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          return { position: snapshot.player.position, alive: snapshot.player.alive };
        });
        if (!after) { reloadsSurvived += 1; continue; }
        if (!after.alive) continue;
        const moved = Math.hypot(
          after.position[0] - before.position[0],
          after.position[2] - before.position[2],
        );
        if (moved >= BLOCKED_THRESHOLD_M) continue;

        const forwardX = -Math.sin(direction.yaw);
        const forwardZ = -Math.cos(direction.yaw);
        const probeX = after.position[0] + forwardX * 0.75;
        const probeZ = after.position[2] + forwardZ * 0.75;
        const feetY = after.position[1] - EYE_HEIGHT_M;
        if (probeX <= arena.minX - 1 || probeX >= arena.maxX + 1
          || probeZ <= arena.minZ - 1 || probeZ >= arena.maxZ + 1) continue;
        const explanation = await page.evaluate(EXPLAIN_FN, [probeX, feetY + 0.15, feetY + 1.5, probeZ]).catch(() => null);
        if (explanation === null || !explanation.sampled) {
          reloadsSurvived += 1;
          continue;
        }
        if (explanation.name !== null) {
          blockedExplained += 1;
          continue;
        }
        findings.push({
          id: `${arena.id}-f${findings.length + 1}`,
          cell: [Number(x.toFixed(1)), Number(z.toFixed(1))],
          direction: direction.label,
          blockedAt: after.position.map((value) => Number(value.toFixed(2))),
          probePoint: [Number(probeX.toFixed(2)), Number((feetY + 0.8).toFixed(2)), Number(probeZ.toFixed(2))],
          movedM: Number(moved.toFixed(3)),
          nearestVisibleMesh: explanation.nearest,
        });
      }
    }
    console.error(`[wall-sweep] ${arena.id}: column ${cx + 1}/${cellsX} done, findings=${findings.length}`);
  }

  // Frame pass: teleport to each finding, face the blockage, capture what the
  // player actually sees there. Bounded so a pathological arena cannot run away.
  const dirYaw = Object.fromEntries(DIRECTIONS.map((entry) => [entry.label, entry.yaw]));
  const captureDir = resolve(OUT_DIR, arena.id);
  mkdirSync(captureDir, { recursive: true });
  let captured = 0;
  for (const finding of findings.slice(0, MAX_CAPTURES_PER_ARENA)) {
    const placed = await evaluateWithDebugApi(([px, py, pz, yaw]) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      if (!debug) return false;
      if (!debug.snapshot().player.alive) debug.respawn();
      debug.teleportPlayer(px, py, pz, yaw, 0);
      return true;
    }, [finding.blockedAt[0], finding.blockedAt[1], finding.blockedAt[2], dirYaw[finding.direction]]);
    if (!placed) continue;
    await page.waitForTimeout(700);
    await page.screenshot({ path: resolve(captureDir, `${finding.id}.png`) });
    captured += 1;
  }

  writeFileSync(resolve(OUT_DIR, `${arena.id}.json`), `${JSON.stringify({
    arena: arena.id,
    backend: 'webgpu',
    visibleBoxesSampled: boxCount,
    cellsTested,
    movesTested,
    blockedExplained,
    reloadsSurvived,
    findingsCount: findings.length,
    capturedFrames: captured,
    findings,
  }, null, 2)}\n`);

  return {
    arena: arena.id,
    cellsTested,
    movesTested,
    blockedExplained,
    reloadsSurvived,
    findings: findings.length,
    captured,
  };
}

const results = [];
for (const arena of ARENAS.filter((entry) => selected.includes(entry.id))) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      results.push(await runArena(arena));
      break;
    } catch (error) {
      if (attempt === 1) {
        results.push({ arena: arena.id, error: String(error).slice(0, 200) });
        console.error(`[wall-sweep] ${arena.id}: FAILED - ${String(error).slice(0, 200)}`);
      } else if (!String(error).includes('Execution context was destroyed')) {
        results.push({ arena: arena.id, error: String(error).slice(0, 200) });
        console.error(`[wall-sweep] ${arena.id}: FAILED - ${String(error).slice(0, 200)}`);
        break;
      }
    }
  }
}

await browser.close();
writeFileSync(resolve(OUT_DIR, 'sweep.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  base: BASE,
  gpu: gpuInfo,
  holdMs: HOLD_MS,
  thresholdM: BLOCKED_THRESHOLD_M,
  results,
}, null, 2)}\n`);
console.log(JSON.stringify({ results }, null, 2));
