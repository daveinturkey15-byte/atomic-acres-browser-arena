#!/usr/bin/env node
// HF-387 eye-distance metric probe: loads atomic-acres, teleports the player into the yard fence, presses prone, and dumps mesh-tracking, eye source, and raw nearest-distance diagnostics.
// Usage: node scripts/qa/hf387-metric-debug.scratch.mjs [base-url]
//   base-url  (argv[2])  origin of the running game  default: http://127.0.0.1:41952
// Writes: artifacts/qa/hf387-r9-eye2/debug-yardfence.png; JSON report on stdout
// Exit: 0 on success; non-zero on unhandled error (no explicit process.exit calls)
// HF-387 probe metric debugger (scratch). Loads atomic-acres, teleports to the
// yard fence, presses prone into it, then introspects why the eye-distance
// metric reports null: mesh tracking, eye source, and raw nearest distances.
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41952';
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', 
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf387dbg&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
console.error('[dbg] backend=', await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null));
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 120_000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
await new Promise((r) => setTimeout(r, 5_000));

const out = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const scene = api.sampleSceneGraph();
  scene.updateMatrixWorld(true);
  // Track meshes exactly like the probe does.
  const V3 = scene.position.constructor;
  const v = new V3();
  const corners = [];
  for (let i = 0; i < 8; i += 1) corners.push(new V3());
  const entries = [];
  scene.traverse((node) => {
    let visible = true;
    for (let a = node; a; a = a.parent) if (!a.visible) visible = false;
    if (!visible || !node.isMesh || !node.geometry?.getAttribute?.('position')) return;
    const geo = node.geometry;
    geo.computeBoundingBox();
    let n = 0;
    for (const x of [geo.boundingBox.min.x, geo.boundingBox.max.x])
      for (const y of [geo.boundingBox.min.y, geo.boundingBox.max.y])
        for (const z of [geo.boundingBox.min.z, geo.boundingBox.max.z])
          corners[n++].set(x, y, z);
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const c of corners) {
      v.copy(c).applyMatrix4(node.matrixWorld);
      minX = Math.min(minX, v.x); minY = Math.min(minY, v.y); minZ = Math.min(minZ, v.z);
      maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); maxZ = Math.max(maxZ, v.z);
    }
    const sizeX = maxX - minX, sizeY = maxY - minY;
    const name = String(node.name ?? '');
    const wallLike = name.toLowerCase().includes('rail')
      || /-(torso|head)$/.test(name)
      || (sizeY >= 0.9 && Math.min(sizeX, maxZ - minZ) <= 5.7);
    if (!wallLike) return;
    entries.push({ name, mesh: node, min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });
  });
  window.__hf387WallMeshes = entries;

  api.teleportPlayer(11, 1.7, 12.5, 0, 0); // south of the x=11 yard fence (fence z 14..26)
  return entries.length;
});
console.error('[dbg] tracked meshes:', out);
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
await new Promise((r) => setTimeout(r, 400));
await page.keyboard.down('KeyW');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 30; i += 1) await sleep(100);
await page.keyboard.up('KeyW');

const report = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const snap = api.snapshot().player;
  const eye = snap.position;
  const V3 = api.sampleSceneGraph().position.constructor;
  const p = new V3(eye[0], eye[1], eye[2]);
  const fenceEntries = window.__hf387WallMeshes.filter((e) => e.name.includes('fence'));
  const tmpA = new V3(), tmpB = new V3(), tmpC = new V3();
  const ab = new V3(), ac = new V3(), ap = new V3(), bp = new V3(), cp = new V3(), q = new V3();
  function triDist(entry) {
    const mesh = entry.mesh;
    mesh.updateMatrixWorld(true);
    const pos = mesh.geometry.getAttribute('position');
    const idx = mesh.geometry.getIndex();
    const count = Math.floor((idx ? idx.count : pos.count) / 3);
    let minD = Infinity;
    for (let t = 0; t < count; t += 1) {
      for (let k = 0; k < 3; k += 1) {
        const i = idx ? idx.getX(t * 3 + k) : t * 3 + k;
        (k === 0 ? tmpA : k === 1 ? tmpB : tmpC).fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      }
      ab.subVectors(tmpB, tmpA); ac.subVectors(tmpC, tmpA); ap.subVectors(p, tmpA);
      const d1 = ab.dot(ap), d2 = ac.dot(ap);
      let d;
      if (d1 <= 0 && d2 <= 0) d = ap.length();
      else {
        bp.subVectors(p, tmpB);
        const d3 = ab.dot(bp), d4 = ac.dot(bp);
        if (d3 >= 0 && d4 <= d3) d = bp.length();
        else if (d1 * d4 - d3 * d2 <= 0 && d1 >= 0 && d3 <= 0) d = ap.sub(ab.multiplyScalar(d1 / (d1 - d3))).length();
        else {
          cp.subVectors(p, tmpC);
          const d5 = ab.dot(cp), d6 = ac.dot(cp);
          if (d6 >= 0 && d5 <= d6) d = cp.length();
          else if (d5 * d2 - d1 * d6 <= 0 && d2 >= 0 && d6 <= 0) d = ap.sub(ac.multiplyScalar(d2 / (d2 - d6))).length();
          else if (d3 * d6 - d5 * d4 <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) d = bp.length();
          else {
            const denom = d1 * d4 - d3 * d2 + (d5 * d2 - d1 * d6) + (d3 * d6 - d5 * d4);
            if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) d = Infinity;
            else {
              const vv = (d5 * d2 - d1 * d6) / denom;
              const ww = (d3 * d6 - d5 * d4) / denom;
              q.copy(ab).multiplyScalar(vv).add(ac.multiplyScalar(ww));
              d = ap.sub(q).length();
            }
          }
        }
      }
      if (Number.isFinite(d) && d < minD) minD = d;
    }
    return minD;
  }
  const near = [];
  for (const entry of window.__hf387WallMeshes) {
    const dx = Math.max(entry.min[0] - eye[0], 0, eye[0] - entry.max[0]);
    const dy = Math.max(entry.min[1] - eye[1], 0, eye[1] - entry.max[1]);
    const dz = Math.max(entry.min[2] - eye[2], 0, eye[2] - entry.max[2]);
    const aabb = Math.hypot(dx, dy, dz);
    if (aabb > 2) continue;
    near.push({ name: entry.name, aabb: Number(aabb.toFixed(3)), tri: Number.isFinite(triDist(entry)) ? Number(triDist(entry).toFixed(3)) : null });
  }
  const apiDist = window.__hf387EyeDistance ? window.__hf387EyeDistance(eye) : 'no fn';
  return {
    eye, stance: snap.stance, tracked: window.__hf387WallMeshes.length,
    fences: fenceEntries.map((e) => e.name),
    near, apiDist,
    camera: (() => { const c = api.sampleSceneGraph().userData; return null; })(),
  };
});
console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: 'artifacts/qa/hf387-r9-eye2/debug-yardfence.png' });
await browser.close();
