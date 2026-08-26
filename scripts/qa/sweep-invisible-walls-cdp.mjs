#!/usr/bin/env node
// Invisible-wall MAP sweep (Pass 79, owner complaint HF-387 "clipping still
// happens ... near walls"). Boots the REAL WebGPU route in INSTALLED Chrome,
// headless, channel:'chrome' (measured 2026-08-25: gets a real hardware WebGPU
// device; bundled chromium fails requestDevice). No headed browser slot needed.
//
// v3 - WHY EVERY MOVE IS NOW GATED ON AN ACTIVE MATCH (2026-08-26):
// v2 booted each arena once and swept ~10 minutes, but a solo match lasts
// DEFAULT_PRIVATE_MATCH_CONFIG.durationMs = 300_000 ms (5 minutes; gun-range
// its own GUN_RANGE_ROUND_MS). Every move after expiry ran with dead input:
// moved ~= 0 was recorded as "blocked", flooding no-collider-blocks
// (gun-range 274/379 moves) and producing fake all-four-direction sites.
// Worse, the end-of-run frame capture pass ran AFTER the AFTER-ACTION screen
// appeared, so every v2 PNG shows "DRAW - TIME LIMIT REACHED" instead of the
// wall position. v3:
//   - checks matchPhase === 'active' (plus gameStarted) with every placement;
//     on expiry it re-boots the arena, re-samples visible meshes, and retries
//   - captures each finding's frame INLINE, while the player still stands at
//     the blocked position during active play
//   - reports restarts as reloadsSurvived so a sweep that rebooted often is
//     visible in the summary instead of hidden.
// v2 rule per blocked stop:
//   1. Locate the blocking surface with the GAME'S OWN AUTHORITY:
//      march collisionProbeAt(...) forward until isBlocked fires -> tWall.
//   2. Prove visibility with TRIANGLE-ACCURATE raycasts from the player eye
//      to three heights on that wall face (knee/chest/eye) against visible
//      meshes, AABB-prefiltered. Decorative non-solid layers (particles,
//      rain, grass, ground fire, sky) and the camera/viewmodel subtree are
//      excluded - repo rules let tiny grass/particles stay non-solid, so they
//      must never explain a wall.
//   3. A stop with NO collider on the march is recorded SEPARATELY as
//      no-collider-block (terrain/slope authority gap) - never merged into
//      the invisible-wall count, never silently dropped.
//
// Output: artifacts/qa/invisible-walls/<arena>.json (+ sweep.json summary) and
// per-finding PNGs under artifacts/qa/invisible-walls/<arena>/. Exit 0 when
// the sweep COMPLETED (findings are the deliverable, not a failure); exit 1 if
// an arena could not be swept at all. Read the JSON body; do not trust exits.
//
// Usage: node scripts/qa/sweep-invisible-walls-cdp.mjs [--url http://127.0.0.1:41911]
//        [--arenas atomic-acres,...] [--hold-ms 500]
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
// never legitimately press the perimeter containment. Bounds match
// verify-invisible-blockers.mjs; density serves the MAP purpose.
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
if (!gpuInfo.ok || /microsoft|swiftshader|llvmpipe/i.test(gpuInfo.vendor ?? '')) {
  console.error('[wall-sweep] ABORT: no real hardware WebGPU device; refusing to produce a software-raster map.');
  await browser.close();
  process.exit(1);
}

const backend = () => page.evaluate(() => document.documentElement.dataset.renderBackend ?? null).catch(() => null);
console.error(`[wall-sweep] backend=${await backend()}`);

const servedBundle = () => page.evaluate(() => {
  const entry = performance.getEntriesByType('resource')
    .map((resource) => resource.name)
    .find((name) => name.includes('/legacy-main-'));
  return entry ? entry.slice(entry.lastIndexOf('/')) : null;
}).catch(() => null);
const BUNDLE_AT_START = await servedBundle();
console.error(`[wall-sweep] bundle=${BUNDLE_AT_START}`);

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

/**
 * Visible, solid-relevant meshes with their source nodes, kept page-side for
 * triangle-accurate raycasts. Excluded on purpose:
 *   - anything under the camera subtree (first-person arms/weapon sit in
 *     front of every forward ray and would falsely explain walls);
 *   - decorative non-solid layers per repo rule (tiny grass, particles,
 *     decals, rain, ground-fire pools, sky): they never block movement, so
 *     they must never EXPLAIN a stop either.
 */
const SAMPLE_MESHES_FN = () => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  scene.updateMatrixWorld(true);
  const DECORATIVE = /particle|rain|mote|drift|puff|grit|ground-fire|haze|grass|sky|cloud|fog|dust|snow|water-?splash|tracer|decal/i;
  const meshes = [];
  const excluded = { cameraSubtree: 0, decorative: 0 };
  const underCamera = (node) => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.isCamera) return true;
    }
    return false;
  };
  scene.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    if (underCamera(node)) { excluded.cameraSubtree += 1; return; }
    let visible = node.visible;
    for (let parent = node.parent; parent; parent = parent.parent) if (!parent.visible) visible = false;
    if (!visible) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (!materials.some((material) => material && material.visible && (!material.transparent || material.opacity > 0.05))) return;
    const name = node.name || '(unnamed)';
    if (DECORATIVE.test(name)) { excluded.decorative += 1; return; }
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    const bounding = node.geometry.boundingBox;
    if (!bounding || bounding.isEmpty()) return;
    const box = bounding.clone().applyMatrix4(node.matrixWorld);
    meshes.push({
      node,
      name,
      minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z,
    });
  });
  window.__WALL_PROBE_MESHES = meshes;
  return { count: meshes.length, excluded };
};

/**
 * Explanation pass for one blocked stop. All page-side.
 * Args: [eyeX, eyeY, eyeZ, dirX, dirZ, feetY].
 *   { kind: 'invisible-wall', tWall, hits, nearestVisible }
 *   { kind: 'explained', tWall, hits }
 *   { kind: 'no-collider-block' }   - authority stops us with NO collider
 *   { kind: 'probe-lost' }          - sample lost (reload); caller retries
 */
const EXPLAIN_FN = async ([eyeX, eyeY, eyeZ, dirX, dirZ, feetY]) => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  const meshes = window.__WALL_PROBE_MESHES;
  if (!debug || !Array.isArray(meshes)) return { kind: 'probe-lost' };
  // The bundled page exposes no window.THREE; re-importing the already-loaded
  // ES chunk yields the LIVE module namespace (cached, no re-execution).
  // NOTE: vendor-three-*.js is MINIFIED (no Raycaster export); the
  // three.webgpu-*.js chunk keeps real class export names - prefer it.
  if (!window.__WALL_PROBE_THREE) {
    const resourceNames = performance.getEntriesByType('resource')
      .map((entry) => entry.name);
    // The build splits three: vendor-three-* is MINIFIED (no Raycaster
    // export); three.webgpu-* keeps real class export names. Prefer it.
    const chunkUrl = resourceNames.find((name) => /three\.webgpu[^/]*\.js/.test(name))
      ?? resourceNames.find((name) => /vendor-three[^/]*\.js/.test(name));
    if (!chunkUrl) return { kind: 'probe-lost' };
    window.__WALL_PROBE_THREE = await import(chunkUrl);
    if (typeof window.__WALL_PROBE_THREE.Raycaster !== 'function') return { kind: 'probe-lost' };
  }
  const three = window.__WALL_PROBE_THREE;

  // 1. Where does the game's own authority say "blocked"? March forward.
  const MARCH_MAX_M = 2.4;
  const STEP_M = 0.12;
  let tWall = null;
  for (let t = 0.24; t <= MARCH_MAX_M; t += STEP_M) {
    if (debug.collisionProbeAt(eyeX + dirX * t, feetY + 0.9, eyeZ + dirZ * t)) { tWall = t; break; }
  }

  // Candidate meshes only: world AABB must intersect the swept corridor.
  const corridorMinX = Math.min(eyeX, eyeX + dirX * (tWall ?? MARCH_MAX_M)) - 0.4;
  const corridorMaxX = Math.max(eyeX, eyeX + dirX * (tWall ?? MARCH_MAX_M)) + 0.4;
  const corridorMinZ = Math.min(eyeZ, eyeZ + dirZ * (tWall ?? MARCH_MAX_M)) - 0.4;
  const corridorMaxZ = Math.max(eyeZ, eyeZ + dirZ * (tWall ?? MARCH_MAX_M)) + 0.4;
  const candidates = meshes.filter((mesh) =>
    mesh.minX <= corridorMaxX && mesh.maxX >= corridorMinX
    && mesh.minZ <= corridorMaxZ && mesh.maxZ >= corridorMinZ);

  // Nearest visible mesh regardless of hit outcome - fix context either way.
  let nearestVisible = null;
  let bestGap = Infinity;
  for (const mesh of candidates) {
    const dx = Math.max(mesh.minX - eyeX, 0, eyeX - mesh.maxX);
    const dy = Math.max(mesh.minY - eyeY, 0, eyeY - mesh.maxY);
    const dz = Math.max(mesh.minZ - eyeZ, 0, eyeZ - mesh.maxZ);
    const gap = Math.hypot(dx, dy, dz);
    if (gap < bestGap) {
      bestGap = gap;
      nearestVisible = { name: mesh.name, gapM: Number(gap.toFixed(2)) };
    }
  }

  if (candidates.length > 0) {
    const raycaster = new three.Raycaster();
    raycaster.far = (tWall ?? MARCH_MAX_M) + 0.6;
    const hits = [];
    for (const height of [feetY + 0.35, feetY + 0.95, feetY + 1.55]) {
      const target = new three.Vector3(eyeX + dirX * (tWall ?? MARCH_MAX_M), height, eyeZ + dirZ * (tWall ?? MARCH_MAX_M));
      const origin = new three.Vector3(eyeX, eyeY, eyeZ);
      const direction = target.clone().sub(origin).normalize();
      raycaster.set(origin, direction);
      const intersections = raycaster.intersectObjects(candidates.map((mesh) => mesh.node), false);
      if (intersections.length > 0) {
        hits.push({ heightBand: Number((height - feetY).toFixed(2)), name: intersections[0].object.name || '(unnamed)', distanceM: Number(intersections[0].distance.toFixed(2)) });
      }
    }
    if (hits.length > 0) return { kind: 'explained', tWall, hits };
  }

  if (tWall === null) return { kind: 'no-collider-block', nearestVisible };
  return { kind: 'invisible-wall', tWall, nearestVisible };
};

async function runArena(arena) {
  await bootArena(arena.id);
  const sampled = await evaluateWithDebugApi(SAMPLE_MESHES_FN);
  console.error(`[wall-sweep] ${arena.id}: sampled ${JSON.stringify(sampled)}`);

  const findings = [];
  const noColliderBlocks = [];
  // A shared preview means another agent's `vite build` can repopulate the
  // served tree MID-SWEEP; measurements would silently mix source trees.
  // Pin the served bundle identity per arena (same guard as
  // verify-arena-boot-cdp.mjs) and refuse to record across a change.
  const bundleNow = await servedBundle();
  if (bundleNow !== BUNDLE_AT_START) {
    throw new Error(`served bundle changed mid-sweep (${BUNDLE_AT_START} -> ${bundleNow}); dist rebuilt while measuring`);
  }
  let cellsTested = 0;
  let movesTested = 0;
  let blockedExplained = 0;
  let restarts = 0;
  // v3: frames are captured INLINE at the blocked position during active
  // play - the v2 end-of-run capture pass ran after the match timer expired
  // and photographed the AFTER-ACTION screen instead of the wall.
  const captureDir = resolve(OUT_DIR, arena.id);
  mkdirSync(captureDir, { recursive: true });
  let captured = 0;
  const captureHere = async (id) => {
    if (captured >= MAX_CAPTURES_PER_ARENA) return;
    try {
      await page.screenshot({ path: resolve(captureDir, `${id}.png`) });
      captured += 1;
    } catch { /* a lost frame must not kill the sweep */ }
  };

  const [cellsX, cellsZ] = arena.cells;
  for (let cx = 0; cx < cellsX; cx += 1) {
    const x = arena.minX + (cellsX === 1 ? 0.5 : cx / (cellsX - 1)) * (arena.maxX - arena.minX);
    for (let cz = 0; cz < cellsZ; cz += 1) {
      const z = arena.minZ + (cellsZ === 1 ? 0.5 : cz / (cellsZ - 1)) * (arena.maxZ - arena.minZ);
      cellsTested += 1;
      for (const direction of DIRECTIONS) {
        const placeArgs = [x, arena.dropY, z, direction.yaw];
        const placeOnce = () => evaluateWithDebugApi(([px, py, pz, yaw]) => {
          const debug = window.__ATOMIC_ACRES_DEBUG__;
          if (!debug) return false;
          if (!debug.snapshot().player.alive) debug.respawn();
          debug.teleportPlayer(px, py, pz, yaw, 0);
          return true;
        }, placeArgs);
        const readBefore = () => evaluateWithDebugApi(() => {
          const debug = window.__ATOMIC_ACRES_DEBUG__;
          const snapshot = debug.snapshot();
          return {
            position: snapshot.player.position,
            alive: snapshot.player.alive,
            matchActive: snapshot.matchPhase === 'active' && snapshot.gameStarted === true,
          };
        });
        let placed = await placeOnce();
        if (!placed) continue;
        await page.waitForTimeout(SETTLE_MS);
        let before = await readBefore();
        if (before && before.matchActive === false) {
          // v3: the 5-minute solo clock (gun-range round clock) lapsed
          // mid-sweep; input is dead past expiry, so every reading would be
          // a fake block. Re-boot the arena, re-sample visible meshes, retry.
          restarts += 1;
          console.error(`[wall-sweep] ${arena.id}: match expired mid-sweep, rebooting (restart ${restarts})`);
          await bootArena(arena.id);
          const resampled = await evaluateWithDebugApi(SAMPLE_MESHES_FN);
          if (!resampled) console.error(`[wall-sweep] ${arena.id}: mesh resample after reboot failed`);
          placed = await placeOnce();
          if (!placed) continue;
          await page.waitForTimeout(SETTLE_MS);
          before = await readBefore();
        }
        if (!before || !before.alive) continue;
        if (before.matchActive === false) continue;
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
        if (!after || !after.alive) continue;
        const moved = Math.hypot(
          after.position[0] - before.position[0],
          after.position[2] - before.position[2],
        );
        if (moved >= BLOCKED_THRESHOLD_M) continue;

        const forwardX = -Math.sin(direction.yaw);
        const forwardZ = -Math.cos(direction.yaw);
        const probeX = after.position[0] + forwardX * 0.75;
        const probeZ = after.position[2] + forwardZ * 0.75;
        if (probeX <= arena.minX - 1 || probeX >= arena.maxX + 1
          || probeZ <= arena.minZ - 1 || probeZ >= arena.maxZ + 1) continue;

        const explanation = await page.evaluate(
          EXPLAIN_FN,
          [after.position[0], after.position[1], after.position[2], forwardX, forwardZ, after.position[1] - EYE_HEIGHT_M],
        ).catch(() => null);
        if (!explanation || explanation.kind === 'probe-lost') continue;
        // A visible mesh explaining the stop means this contract PASSED for
        // the spot: ordinary walls must never be counted as invisible-wall
        // findings. v3 shipped WITHOUT this branch - 'explained' fell through
        // to findings.push below, inflating every arena's map with its own
        // visible geometry, and blockedExplained stayed 0 everywhere.
        if (explanation.kind === 'explained') { blockedExplained += 1; continue; }

        if (explanation.kind === 'no-collider-block') {
          noColliderBlocks.push({
            id: `${arena.id}-nc${noColliderBlocks.length + 1}`,
            cell: [Number(x.toFixed(1)), Number(z.toFixed(1))],
            direction: direction.label,
            blockedAt: after.position.map((value) => Number(value.toFixed(2))),
            movedM: Number(moved.toFixed(3)),
            nearestVisibleMesh: explanation.nearestVisible,
          });
          await captureHere(noColliderBlocks[noColliderBlocks.length - 1].id);
          continue;
        }
        findings.push({
          id: `${arena.id}-f${findings.length + 1}`,
          cell: [Number(x.toFixed(1)), Number(z.toFixed(1))],
          direction: direction.label,
          blockedAt: after.position.map((value) => Number(value.toFixed(2))),
          wallDistanceM: Number(explanation.tWall?.toFixed(2)),
          probePoint: [Number(probeX.toFixed(2)), Number((after.position[1] - EYE_HEIGHT_M + 0.8).toFixed(2)), Number(probeZ.toFixed(2))],
          movedM: Number(moved.toFixed(3)),
          nearestVisibleMesh: explanation.nearestVisible,
        });
        await captureHere(findings[findings.length - 1].id);
      }
    }
    console.error(`[wall-sweep] ${arena.id}: column ${cx + 1}/${cellsX} done, findings=${findings.length} noCollider=${noColliderBlocks.length}`);
  }

  writeFileSync(resolve(OUT_DIR, `${arena.id}.json`), `${JSON.stringify({
    arena: arena.id,
    backend: 'webgpu',
    visibleMeshSampled: sampled,
    cellsTested,
    movesTested,
    blockedExplained,
    reloadsSurvived: restarts,
    findingsCount: findings.length,
    noColliderBlocksCount: noColliderBlocks.length,
    capturedFrames: captured,
    findings,
    noColliderBlocks,
  }, null, 2)}\n`);

  return {
    arena: arena.id,
    cellsTested,
    movesTested,
    blockedExplained,
    findings: findings.length,
    noColliderBlocks: noColliderBlocks.length,
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
  method: 'v4: match-active gate with mid-sweep reboot; authority-march collisionProbeAt + triangle raycast vs visible non-camera meshes; inline frames during active play; decorative non-solid layers excluded; explained stops counted separately (v3 bug: they were recorded as invisible-wall findings); served-bundle identity pinned per arena',
  results,
}, null, 2)}\n`);
console.log(JSON.stringify({ results }, null, 2));
