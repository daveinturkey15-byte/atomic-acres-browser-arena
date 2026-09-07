#!/usr/bin/env node
/**
 * HF-536 - THE STAIRS CASE. Owner, 2026-09-06, after playing Nuke Town Rebuild:
 * "the gun still lifts up and looks bad and hard to use on stairs".
 *
 * Every earlier viewmodel probe posed the player on FLAT ground beside a wall.
 * The stair case is different in kind: `sweepNearestForwardMeters` clamps the
 * forward obstruction analytically against a HORIZONTAL ground plane at
 * `lastGroundedFeetY` (systems/viewmodel-contact-probe.ts), and a staircase is
 * exactly where that plane stops describing the floor. This walks both house
 * flights at fixed height steps and records, per pose, the contact fold inputs
 * beside the rendered frame and the viewmodel's screen-space bounding box.
 *
 * Headless. Never opens a window on the owner's display.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = arg('--url', process.env.QA_BASE_URL ?? 'http://127.0.0.1:4310/');
const OUT = resolve(arg('--out', 'artifacts/qa/viewmodel-stairs'));
const LABEL = arg('--label', 'run');
const PROFILE = arg('--profile', 'quality');
const SHOTS = !argv.includes('--no-shots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 400)));
const url = new URL(BASE);
url.searchParams.set('quality', PROFILE);
url.searchParams.set('tod', 'authored');
await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), null, { timeout: 120000 });
await page.evaluate(async () => {
  await window.__ATOMIC_ACRES_DEBUG__.selectArena('nuketown2');
  window.__ATOMIC_ACRES_DEBUG__.startSolo();
});
await page.waitForTimeout(22000);
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true));

/** Find the house stair ramps in the built scene, by world AABB. */
const stairs = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const found = [];
  scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const name = String(o.name || '');
    if (!/stair|ramp/i.test(name)) return;
    o.updateWorldMatrix(true, false);
    if (!o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    if (!b) return;
    const m = o.matrixWorld.elements;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const x of [b.min.x, b.max.x]) {
      for (const y of [b.min.y, b.max.y]) {
        for (const z of [b.min.z, b.max.z]) {
          const p = [
            m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14],
          ];
          for (let i = 0; i < 3; i += 1) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
        }
      }
    }
    // The ramp is a box rotated about X, so its world +Y column IS the walking
    // surface normal. Uphill is -(n.x, n.z): moving along d changes height by
    // -(n . d) / n.y. Without this the sampler cannot tell which END of the
    // AABB is the top and half the poses stand 3.4 m off the flight.
    const nx = m[4]; const ny = m[5]; const nz = m[6];
    const nlen = Math.hypot(nx, ny, nz) || 1;
    found.push({ name, min, max, rise: max[1] - min[1], normal: [nx / nlen, ny / nlen, nz / nlen] });
  });
  // The WALKABLE flights only. Stringers, handrails and rail posts also carry
  // "stair" in their names and have the same rise, and sorting by rise alone
  // put four of them ahead of every ramp.
  return found.filter((f) => /stair ramp/i.test(f.name) && f.rise > 1.2);
});

/** Screen-space bbox of the camera-attached viewmodel, in pixels. */
async function viewmodelScreenBox() {
  return page.evaluate(() => {
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    let cam = null;
    scene.traverse((o) => { if (!cam && o.isPerspectiveCamera) cam = o; });
    if (!cam) return null;
    cam.updateMatrixWorld(true);
    const view = cam.matrixWorldInverse.elements;
    const proj = cam.projectionMatrix.elements;
    const near = cam.near;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity; let count = 0;
    let skippedBehindNear = 0;
    const root = cam.getObjectByName('original-weapon-view');
    if (!root) return null;
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      let p = o; let vis = true;
      while (p && p !== cam) { if (!p.visible) { vis = false; break; } p = p.parent; }
      if (!vis) return;
      const attr = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
      if (!attr) return;
      o.updateWorldMatrix(true, false);
      const m = o.matrixWorld.elements;
      const stride = Math.max(1, Math.floor(attr.count / 400));
      for (let i = 0; i < attr.count; i += stride) {
        const x = attr.getX(i); const y = attr.getY(i); const z = attr.getZ(i);
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        // Camera space first. A vertex at or behind the near plane projects to
        // an arbitrarily large NDC and poisoned every earlier bbox (centre-Y
        // read 2,000,000 px); it is not on screen, so it is not in the box.
        const ex = view[0] * wx + view[4] * wy + view[8] * wz + view[12];
        const ey = view[1] * wx + view[5] * wy + view[9] * wz + view[13];
        const ez = view[2] * wx + view[6] * wy + view[10] * wz + view[14];
        if (ez > -near) { skippedBehindNear += 1; continue; }
        const cw = -ez;
        const cx = (proj[0] * ex + proj[8] * ez) / cw;
        const cy = (proj[5] * ey + proj[9] * ez) / cw;
        const px = (cx * 0.5 + 0.5) * 1280;
        const py = (0.5 - cy * 0.5) * 720;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px);
        minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        count += 1;
      }
    });
    if (!count) return null;
    return { minX, minY, maxX, maxY, centerY: (minY + maxY) / 2, count, skippedBehindNear };
  });
}

async function sampleAt(pose) {
  await page.evaluate((p) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(p.x, p.y, p.z, p.yaw, p.pitch);
  }, pose);
  await page.evaluate(() => new Promise((done) => {
    let n = 0;
    const step = () => { n += 1; if (n > 6) done(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }));
  const snap = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const s = api.snapshot();
    let probes = null;
    try { probes = api.sampleViewmodelContactProbes ? api.sampleViewmodelContactProbes() : null; } catch { probes = null; }
    let pen = null;
    try { pen = api.sampleViewmodelPenetration ? api.sampleViewmodelPenetration() : null; } catch { pen = null; }
    return {
      weaponPresentation: s.weaponPresentation || null,
      player: s.player || null,
      probes: probes ? { lattice: probes.lattice, forwardY: probes.forwardY, probes: probes.probes } : null,
      penetration: pen,
    };
  });
  const box = await viewmodelScreenBox();
  return Object.assign({}, snap, { screenBox: box });
}

const rows = [];
const control = { x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0 };
{
  const s = await sampleAt(control);
  rows.push(Object.assign({ station: 'control-flat-street', pose: control }, s));
  if (SHOTS) await page.screenshot({ path: resolve(OUT, LABEL + '-' + PROFILE + '-control-flat-street.png') });
}

for (const stair of stairs) {
  const y0 = stair.min[1];
  const y1 = stair.max[1];
  // The flight climbs along whichever horizontal axis is longer; the other is
  // its WIDTH, and the pose belongs on that axis's centre line, not on an edge
  // (the first run of this probe walked the cross-axis and stood every pose
  // inside the stringer, which is why every row read a saturated stow).
  const spanX = stair.max[0] - stair.min[0];
  const spanZ = stair.max[2] - stair.min[2];
  const alongX = spanX >= spanZ;
  const crossCentre = alongX ? (stair.min[2] + stair.max[2]) / 2 : (stair.min[0] + stair.max[0]) / 2;
  // Inset half a capsule radius from each end so the eye is over the flight.
  const runLow = (alongX ? stair.min[0] : stair.min[2]) + 0.3;
  const runHigh = (alongX ? stair.max[0] : stair.max[2]) - 0.3;
  // The ramp's low end may sit under the slab; y0 is the geometric minimum.
  const steps = Math.max(2, Math.min(8, Math.ceil((y1 - y0) / 0.25)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const surfaceY = y0 + (y1 - y0) * t;
    const upSignForRun = (alongX ? -stair.normal[0] : -stair.normal[2]) >= 0 ? 1 : -1;
    const along = upSignForRun > 0
      ? runLow + (runHigh - runLow) * t
      : runHigh - (runHigh - runLow) * t;
    // Uphill along the run axis, from the ramp's own surface normal.
    const upSign = (alongX ? -stair.normal[0] : -stair.normal[2]) >= 0 ? 1 : -1;
    for (const dir of ['up', 'down']) {
      for (const pitch of [0, -0.35]) {
        const facing = dir === 'up' ? upSign : -upSign;
        const yaw = alongX
          ? (facing > 0 ? -Math.PI / 2 : Math.PI / 2)
          : (facing > 0 ? Math.PI : 0);
        const pose = {
          x: alongX ? along : crossCentre,
          y: surfaceY + 1.7,
          z: alongX ? crossCentre : along,
          yaw,
          pitch,
        };
        const s = await sampleAt(pose);
        const id = stair.name.replace(/[^a-z0-9]+/gi, '-') + '-h' + surfaceY.toFixed(2) + '-' + dir + '-p' + pitch;
        rows.push(Object.assign({ station: id, stair: stair.name, heightM: surfaceY, dir, pitch, pose }, s));
        if (SHOTS && pitch === -0.35 && dir === 'up') {
          await page.screenshot({ path: resolve(OUT, LABEL + '-' + PROFILE + '-' + id + '.png') });
        }
      }
    }
  }
}

writeFileSync(resolve(OUT, LABEL + '-' + PROFILE + '.json'), JSON.stringify({
  label: LABEL, profile: PROFILE, url: url.toString(), stairs, consoleErrors, rows,
}, null, 2));
console.log(JSON.stringify({
  stairs: stairs.map((s) => ({ name: s.name, rise: s.rise, min: s.min, max: s.max })),
  rowCount: rows.length,
  consoleErrors: consoleErrors.slice(0, 5),
}, null, 2));
await browser.close();
