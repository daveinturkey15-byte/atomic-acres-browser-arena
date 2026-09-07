#!/usr/bin/env node
// HF-387 eye-vs-visible-geometry probe (scratch — delete before handoff).
// Drives installed Chrome headless WebGPU over CDP against a local preview.
//
// For each named wall type, march the player forward until contact, then:
//  - sample the live EYE position (player.position IS the camera eye),
//  - measure true distance from the eye to the nearest visible triangle of
//    wall-like meshes whose world AABB contains it,
//  - screenshot at contact.
// Metric: minEyeToVisibleM < camera.near (0.08) => the owner sees clipping.
//
// Usage: node scripts/qa/hf387-eye-probe.scratch.mjs --url http://127.0.0.1:41937 \
//          --arena atomic-acres --out artifacts/qa/hf387-eye

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41937');
const RENDERER = arg('--renderer', 'webgpu');
const OUT = arg('--out', 'artifacts/qa/hf387-eye');
const ARENA = arg('--arena', 'atomic-acres');

mkdirSync(resolve(OUT), { recursive: true });

// [name, startX, startY(eye), startZ, yaw] — game forward is (-sin yaw, -cos yaw).
const ATOMIC_SPOTS = [
  ['house-front-wall', 4, 1.7, -5.0, 0],
  ['garage-door-face', 17.7, 1.7, -5.0, 0],
  ['bus-east-face', 11, 1.7, 0, Math.PI / 2],
  ['van-north-side', 8, 1.7, 3.0, 0],
  ['yard-fence-run', 11, 1.7, 15.5, 0],
  ['west-boundary-fence', -26, 1.7, 0, -Math.PI / 2],
  ['mid-coach-dummy', 8, 1.7, 8.0, Math.PI],
];

const HIGH_SEAS_SPOTS = [
  ['bow-bulwark', 8, 4.9, -34, 0],
  ['stern-superstructure', 8, 4.9, 12, Math.PI],
  ['starboard-deck-edge', 2, 4.9, -12, -Math.PI / 2],
  ['port-deck-edge', 2, 4.9, -12, Math.PI / 2],
];

const SPOTS = ARENA === 'high-seas' ? HIGH_SEAS_SPOTS : ATOMIC_SPOTS;

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

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });

const url = `${BASE}/?release=latest&renderer=${RENDERER}&render=quality&seed=hf387&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[probe] backend=${backend}`);

await page.evaluate(async (id) => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  await api.selectArena(id);
  api.startSolo();
}, ARENA);
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 120_000 });
console.error(`[probe] ${ARENA} active`);
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
await new Promise((r) => setTimeout(r, 6_000));

// Collect wall-like visible meshes with world-space AABBs (manual Box3).
await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const V3 = scene.position.constructor;
  const v = new V3();
  const corners = [];
  for (let i = 0; i < 8; i += 1) corners.push(new V3());
  const entries = [];
  scene.updateMatrixWorld(true);
  scene.traverse((node) => {
    let visible = true;
    for (let a = node; a; a = a.parent) if (!a.visible) visible = false;
    if (!visible || !node.isMesh || !node.geometry?.getAttribute?.('position')) return;
    const geo = node.geometry;
    geo.computeBoundingBox();
    geo.boundingBox.toPoints
      ? geo.boundingBox.toPoints(corners)
      : (() => {
        let n = 0;
        for (const x of [geo.boundingBox.min.x, geo.boundingBox.max.x])
          for (const y of [geo.boundingBox.min.y, geo.boundingBox.max.y])
            for (const z of [geo.boundingBox.min.z, geo.boundingBox.max.z])
              corners[n++].set(x, y, z);
      })();
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const c of corners) {
      v.copy(c).applyMatrix4(node.matrixWorld);
      minX = Math.min(minX, v.x); minY = Math.min(minY, v.y); minZ = Math.min(minZ, v.z);
      maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); maxZ = Math.max(maxZ, v.z);
    }
    // Track EVERY visible mesh: Quality-profile authored assets do not carry
    // the procedural box names, so a name/size filter silently dropped the
    // very walls under test. The expanded-AABB gate in hfEyeDistance is the
    // real filter.
    const name = String(node.name ?? '');
    void name;
    entries.push({ name, mesh: node, min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });
  });
  window.__hf387WallMeshes = entries;
  // Exact point-to-triangle distance, guarded against degenerate triangles.
  window.__hf387EyeDistance = function hfEyeDistance(eye) {
    const p = new V3(eye[0], eye[1], eye[2]);
    let best = { dist: Infinity, mesh: '' };
    const tmpA = new V3(), tmpB = new V3(), tmpC = new V3();
    const ab = new V3(), ac = new V3(), ap = new V3(), bp = new V3(), cp = new V3(), q = new V3();
    for (const entry of window.__hf387WallMeshes) {
      if (p.x < entry.min[0] - 0.6 || p.x > entry.max[0] + 0.6
        || p.y < entry.min[1] - 0.6 || p.y > entry.max[1] + 0.6
        || p.z < entry.min[2] - 0.6 || p.z > entry.max[2] + 0.6) continue;
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
      if (Number.isFinite(minD) && minD < best.dist) best = { dist: minD, mesh: entry.name };
    }
    return best;
  };
});
const meshCount = await page.evaluate(() => window.__hf387WallMeshes.length);
console.error(`[probe] ${meshCount} wall-like meshes tracked`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

for (const [name, sx, sy, sz, yaw] of SPOTS) {
  errors.length = 0;
  await page.evaluate(({ sx, sy, sz, yaw }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setStance('stand');
    api.teleportPlayer(sx, sy, sz, yaw, 0);
  }, { sx, sy, sz, yaw });
  await sleep(500);

  const sampleEye = () => page.evaluate(() => {
    const p = window.__ATOMIC_ACRES_DEBUG__.snapshot().player;
    const d = window.__hf387EyeDistance(p.position);
    return {
      position: p.position, stance: p.stance, alive: p.alive, deaths: p.deaths,
      nearest: Number.isFinite(d.dist) ? Number(d.dist.toFixed(3)) : null,
      nearestMesh: d.mesh,
    };
  });

  const record = { name, samples: {} };
  for (const phase of ['stand', 'prone-push', 'prone-crawl-left']) {
    await page.evaluate((ph) => {
      window.__ATOMIC_ACRES_DEBUG__.setStance(ph === 'stand' ? 'stand' : 'prone');
    }, phase);
    await sleep(350);
    await page.keyboard.down('KeyW');
    if (phase === 'prone-crawl-left') await page.keyboard.down('KeyA');
    const samples = [];
    for (let i = 0; i < (phase === 'stand' ? 22 : 26); i += 1) {
      await sleep(100);
      samples.push(await sampleEye());
    }
    await page.keyboard.up('KeyW');
    if (phase === 'prone-crawl-left') await page.keyboard.up('KeyA');
    await page.screenshot({ path: resolve(OUT, `${ARENA}-${name}-${phase.replace(/[^a-z]/g, '')}.png`) });
    let worst = null;
    for (const s of samples) {
      if (s.nearest !== null && (worst === null || s.nearest < worst.nearest)) worst = s;
    }
    record.samples[phase.replace(/[^a-z]/g, '')] = {
      end: samples.at(-1),
      worstNearest: worst ? { dist: worst.nearest, mesh: worst.nearestMesh, eye: worst.position } : null,
      died: samples.some((s) => s.deaths > 0 || !s.alive),
    };
  }
  record.errors = [...new Set(errors)].slice(0, 3);
  results.push(record);
  const w = (k) => JSON.stringify(record.samples[k].worstNearest);
  console.error(`[probe] ${name}: stand=${w('stand')} pronePush=${w('pronepush')} crawl=${w('pronecrawlleft')}`);
}

writeFileSync(resolve(OUT, `${ARENA}-results.json`), `${JSON.stringify(results, null, 2)}\n`);
await browser.close();
