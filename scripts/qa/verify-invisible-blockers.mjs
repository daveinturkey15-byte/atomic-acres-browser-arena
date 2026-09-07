#!/usr/bin/env node
// HF-344 live close-out: walk every arena and prove no invisible blocker.
//
// The static parity audit (src/invisible-blocker-audit.ts) proves collider
// volumes are visually explained. This proves the claim a PLAYER experiences,
// which is different: teleport across a coarse grid per arena, hold W in four
// compass directions with real key input, and whenever movement is blocked,
// look ahead with the same visible-leaf-mesh rule the audit uses. A stop with
// nothing visible in front is a finding; a stop explained by a visible mesh,
// or at the arena bounds (perimeter containment), is not.
//
// Pattern follows scripts/qa/verify-farcrysis-ground-contract.mjs: bots are
// frozen so the harness measures collision, not bot marksmanship; teleports
// drop from a modest height so fall damage cannot poison later samples.
//
// Usage: node scripts/qa/verify-invisible-blockers.mjs [--url http://127.0.0.1:41876]
//        [--arenas atomic-acres,rustworks-1v1,...] [--hold-ms 600]
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876');
const HOLD_MS = Number(arg('--hold-ms', '600'));
const BLOCKED_THRESHOLD_M = Number(arg('--threshold', '0.35'));
const EYE_HEIGHT_M = 1.7;

// Grids stay inside each arena's authored bounds by a margin so a cell can
// never legitimately press the perimeter containment.
const ARENAS = [
  { id: 'atomic-acres', minX: -31, maxX: 31, minZ: -40, maxZ: 40, cells: [6, 7], dropY: 5 },
  { id: 'rustworks-1v1', minX: -24, maxX: 24, minZ: -26, maxZ: 26, cells: [5, 5], dropY: 5 },
  { id: 'gun-range', minX: -16, maxX: 16, minZ: -44, maxZ: 34, cells: [4, 7], dropY: 5 },
  { id: 'skyline-terminal', minX: -32, maxX: 32, minZ: -32, maxZ: 32, cells: [6, 6], dropY: 5 },
  { id: 'high-seas', minX: -9, maxX: 9, minZ: -41, maxZ: 41, cells: [3, 8], dropY: 7 },
  { id: 'farcrysis', minX: -29, maxX: 29, minZ: -29, maxZ: 29, cells: [5, 5], dropY: 5 },
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

const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu'] });
const results = [];
const startedAt = Date.now();

/**
 * The app performs a late self-navigation shortly after load (release-channel
 * resolution), which destroys the first execution context; on a dev server a
 * concurrent editor can additionally trigger a vite full reload at any time.
 * Retry boot rather than treating either as a probe failure.
 *
 * `release=latest` is deliberately OMITTED. It makes the app resolve a
 * release channel and self-navigate, which destroys every execution context
 * this harness is holding - not once at boot, but again at unpredictable
 * moments afterwards, which is how a mid-walk teleport ended up calling
 * `snapshot()` on an undefined debug API. The walk needs the dev bundle that
 * is already being served, not a pinned release.
 */
const ARENA_BOOT_TIMEOUT_MS = 300_000;

/**
 * The debug API disappears across any reload, and in a shared worktree a
 * concurrent lane's edit can trigger a vite full reload at ANY point in a
 * twenty-minute walk. Every evaluate that touches the API waits for it first
 * and reports whether it came back, so a reload costs one sample instead of
 * aborting the run and losing the arena.
 */
async function awaitDebugApi(page, timeout = 120_000) {
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

/** Evaluate against the debug API, returning null if it is mid-reload. */
async function evaluateWithDebugApi(page, fn, arg) {
  if (!(await awaitDebugApi(page))) return null;
  try {
    return await page.evaluate(fn, arg);
  } catch (error) {
    if (String(error).includes('Execution context was destroyed')
      || String(error).includes('undefined')) return null;
    throw error;
  }
}

async function bootArena(page, arenaId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`${BASE}/?renderer=webgl2&render=performance&seed=blockers&previewTime=0`, { waitUntil: 'load' });
      await page.waitForTimeout(1_000);
      await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: ARENA_BOOT_TIMEOUT_MS });
      await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
      await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
      await page.waitForFunction(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.();
        return Boolean(snapshot) && snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
        // farcrysis cold boot on a fresh dev server can exceed two minutes.
      }, undefined, { timeout: ARENA_BOOT_TIMEOUT_MS });
      await page.waitForTimeout(2_000);
      const frozen = await evaluateWithDebugApi(page, () => {
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

async function runArena(page, arena, pageErrors) {
  await bootArena(page, arena.id);

  // Same visibility rule as the static audit: leaf meshes, own geometry only.
  await page.evaluate(() => {
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
      boxes.push({ minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z, name: node.name || '(unnamed)' });
    });
    window.__BLOCKER_PROBE_BOXES = boxes;
  });

  const findings = [];
  let cellsTested = 0;
  let movesTested = 0;
  let blockedExplained = 0;
  // Samples abandoned because the page reloaded under us, not because the
  // arena did anything. Reported so a walk thinned by a busy worktree cannot
  // be mistaken for a clean one.
  let reloadsSurvived = 0;

  const [cellsX, cellsZ] = arena.cells;
  for (let cx = 0; cx < cellsX; cx += 1) {
    const x = arena.minX + (cellsX === 1 ? 0.5 : cx / (cellsX - 1)) * (arena.maxX - arena.minX);
    for (let cz = 0; cz < cellsZ; cz += 1) {
      const z = arena.minZ + (cellsZ === 1 ? 0.5 : cz / (cellsZ - 1)) * (arena.maxZ - arena.minZ);
      cellsTested += 1;
      for (const direction of DIRECTIONS) {
        const placed = await evaluateWithDebugApi(page, ([px, py, pz, yaw]) => {
          const debug = window.__ATOMIC_ACRES_DEBUG__;
          if (!debug) return false;
          if (!debug.snapshot().player.alive) debug.respawn();
          debug.teleportPlayer(px, py, pz, yaw, 0);
          return true;
        }, [x, arena.dropY, z, direction.yaw]);
        if (!placed) { reloadsSurvived += 1; continue; }
        await page.waitForTimeout(450);
        const before = await evaluateWithDebugApi(page, () => {
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
        const after = await evaluateWithDebugApi(page, () => {
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

        // Blocked. Is something visible in front to explain it?
        const forwardX = -Math.sin(direction.yaw);
        const forwardZ = -Math.cos(direction.yaw);
        const probeX = after.position[0] + forwardX * 0.75;
        const probeZ = after.position[2] + forwardZ * 0.75;
        const feetY = after.position[1] - EYE_HEIGHT_M;
        if (probeX <= arena.minX - 1 || probeX >= arena.maxX + 1
          || probeZ <= arena.minZ - 1 || probeZ >= arena.maxZ + 1) continue;
        // The sampled boxes live on `window` and do not survive a reload. If
        // they are gone, EVERY blocked move would look unexplained and the
        // walk would manufacture findings, so an absent sample is reported as
        // a lost sample rather than as a blocker.
        const explanation = await page.evaluate(([qx, qyMin, qyMax, qz]) => {
          const boxes = window.__BLOCKER_PROBE_BOXES;
          if (!Array.isArray(boxes) || boxes.length === 0) return { sampled: false, name: null };
          const half = 0.5;
          const hit = boxes.find((box) =>
            box.minX <= qx + half && box.maxX >= qx - half
            && box.minY <= qyMax && box.maxY >= qyMin
            && box.minZ <= qz + half && box.maxZ >= qz - half);
          return { sampled: true, name: hit ? hit.name : null };
        }, [probeX, feetY + 0.15, feetY + 1.5, probeZ]).catch(() => null);
        if (explanation === null || !explanation.sampled) {
          reloadsSurvived += 1;
          continue;
        }
        if (explanation.name !== null) {
          blockedExplained += 1;
          continue;
        }
        findings.push({
          cell: [Number(x.toFixed(1)), Number(z.toFixed(1))],
          direction: direction.label,
          settled: before.position.map((value) => Number(value.toFixed(2))),
          movedM: Number(moved.toFixed(3)),
        });
      }
    }
  }

  return {
    arena: arena.id,
    cellsTested,
    movesTested,
    blockedExplained,
    reloadsSurvived,
    findings,
    pageErrors: [...new Set(pageErrors)].slice(0, 5),
  };
}

for (const arena of ARENAS.filter((entry) => selected.includes(entry.id))) {
  // One retry per arena: a dev-server reload mid-walk destroys the execution
  // context through no fault of the arena under test.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 160)));
    try {
      results.push(await runArena(page, arena, pageErrors));
      await page.close();
      break;
    } catch (error) {
      await page.close();
      if (attempt === 1 || !String(error).includes('Execution context was destroyed')) throw error;
    }
  }
}

await browser.close();

const verdict = results.every((entry) => entry.findings.length === 0) ? 'PASS' : 'FAIL';
console.log(JSON.stringify({
  verdict,
  elapsedMs: Date.now() - startedAt,
  base: BASE,
  holdMs: HOLD_MS,
  results,
}, null, 2));
process.exit(verdict === 'PASS' ? 0 : 1);
