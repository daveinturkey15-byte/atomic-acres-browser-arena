#!/usr/bin/env node
/**
 * HF-395 diagnosis companion to measure-viewmodel-penetration-cdp.mjs.
 *
 * The measurement instrument says WHERE the rig is inside a solid; this one
 * says WHY the clip planes did not cut it. For each pose it reads the live
 * clipping planes off the viewmodel root (normal, constant, the eye's signed
 * distance), the tracked standing surface, the penetrated box and the lowest
 * drawn vertex - enough to tell a plane-count limit from a plane-selection
 * choice from a stale ground reference.
 *
 * Headless, one browser, never on the owner's display.
 *
 * Usage:
 *   QA_PORT=41942 node scripts/qa/run-with-preview-server.mjs \
 *     node scripts/qa/diagnose-viewmodel-clip-cdp.mjs --url http://127.0.0.1:41942/ --out artifacts/qa/hf395
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', process.env.QA_BASE_URL ?? 'http://127.0.0.1:41933/');
const OUT = arg('--out', 'artifacts/qa/viewmodel-penetration');
const LABEL = arg('--label', 'diagnose');
const WEAPON = arg('--weapon', 'carbine');
mkdirSync(resolve(OUT), { recursive: true });

const POSES = [
  { arena: 'atomic-acres', name: 'garage-door-stand-yaw270', x: 17.7, z: -6.2, yaw: (270 * Math.PI) / 180, pitch: 0, stance: 'stand' },
  { arena: 'atomic-acres', name: 'garage-door-stand-yaw300', x: 17.7, z: -6.2, yaw: (300 * Math.PI) / 180, pitch: 0, stance: 'stand' },
  { arena: 'atomic-acres', name: 'garage-door-prone-yaw240', x: 17.7, z: -6.2, yaw: (240 * Math.PI) / 180, pitch: 0, stance: 'prone' },
  { arena: 'atomic-acres', name: 'bus-van-gap-stand-yaw240', x: 4.5, z: -3.75, yaw: (240 * Math.PI) / 180, pitch: 0, stance: 'stand' },
  { arena: 'atomic-acres', name: 'open-ground-down-stand', x: 0, z: 0, yaw: 0, pitch: -1.2, stance: 'stand' },
  { arena: 'atomic-acres', name: 'open-ground-down-crouch', x: 0, z: 0, yaw: 0, pitch: -1.2, stance: 'crouch' },
  { arena: 'atomic-acres', name: 'open-ground-down-prone', x: 0, z: 0, yaw: 0, pitch: -1.2, stance: 'prone' },
  { arena: 'atomic-acres', name: 'grass-slope-down-stand-yaw0', x: -24, z: 26, yaw: 0, pitch: -0.85, stance: 'stand' },
  { arena: 'atomic-acres', name: 'grass-slope-down-prone-yaw0', x: -24, z: 26, yaw: 0, pitch: -0.85, stance: 'prone' },
  { arena: 'test2', name: 'upper-room-stand-yaw0', x: 0, z: -20, yaw: 0, pitch: -0.4, stance: 'stand' },
  { arena: 'test2', name: 'upper-room-prone-yaw0', x: 0, z: -20, yaw: 0, pitch: -0.4, stance: 'prone' },
  { arena: 'test2', name: 'zone-b-court-stand-yaw0', x: 0, z: 14, yaw: 0, pitch: -0.6, stance: 'stand' },
];

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), null, { timeout: 120_000 });

let currentArena = null;
const report = [];
for (const pose of POSES) {
  if (pose.arena !== currentArena) {
    await page.evaluate(async (id) => {
      await window.__ATOMIC_ACRES_DEBUG__.selectArena(id);
      window.__ATOMIC_ACRES_DEBUG__.startSolo();
    }, pose.arena);
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot?.player && snapshot.gameStarted !== false;
    }, null, { timeout: 180_000 }).catch(() => {});
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true));
    await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon?.(id), WEAPON).catch(() => {});
    await page.waitForTimeout(400);
    currentArena = pose.arena;
  }
  const sample = await page.evaluate(async (p) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    // HF-395: the same stance defect the measurement instrument had. Requesting
    // a stance before the teleport, or right after it while the player is still
    // airborne, is refused by the stance machine, so every row was sampled at
    // whatever stance was left over with the eye still 1.7-1.84 m up. Land
    // first, drive the stance, re-seat the exact look, land again, settle.
    api.teleportPlayer(p.x, 1.7, p.z, p.yaw, p.pitch);
    let grounded = false;
    for (let waited = 0; waited < 90 && !grounded; waited += 1) {
      await frame();
      grounded = api.snapshot()?.player?.grounded === true;
    }
    const stanceReached = api.setStanceForQa(p.stance);
    for (let waited = 0; waited < 24; waited += 1) await frame();
    const now = api.snapshot()?.player;
    api.teleportPlayer(now.position[0], now.position[1], now.position[2], p.yaw, p.pitch);
    for (let waited = 0; waited < 90; waited += 1) {
      await frame();
      if (api.snapshot()?.player?.grounded === true) break;
    }
    await frame(); await frame(); await frame();
    const penetration = api.sampleViewmodelPenetration();
    const snapshot = api.snapshot();
    // The live planes, straight off the clipping root.
    const scene = api.sampleSceneGraph();
    let root = null;
    let camera = null;
    scene.traverse((node) => {
      if (node.userData?.viewmodelContactClipContract) root = node;
      if (node.isPerspectiveCamera && !camera) camera = node;
    });
    const eye = camera ? { x: camera.matrixWorld.elements[12], y: camera.matrixWorld.elements[13], z: camera.matrixWorld.elements[14] } : null;
    const planes = (root?.clippingPlanes ?? []).map((plane) => ({
      normal: [plane.normal.x, plane.normal.y, plane.normal.z].map((v) => Math.round(v * 1000) / 1000),
      constant: Math.round(plane.constant * 1000) / 1000,
      eyeSignedDistance: eye ? Math.round((plane.normal.x * eye.x + plane.normal.y * eye.y + plane.normal.z * eye.z + plane.constant) * 1000) / 1000 : null,
      parked: Math.abs(plane.constant) > 500,
    }));
    // Lowest DRAWN vertex, with its mesh: the geometry the floor plane missed.
    let lowest = null;
    const drawnAt = (x, y, z) => (root?.clippingPlanes ?? []).every((plane) => plane.normal.x * x + plane.normal.y * y + plane.normal.z * z + plane.constant >= 0);
    root?.traverse((node) => {
      if (!node.isMesh || !node.visible) return;
      let ancestor = node.parent;
      while (ancestor) { if (!ancestor.visible) return; ancestor = ancestor.parent; }
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (!materials.some((m) => m && m.visible && m.colorWrite !== false)) return;
      const position = node.geometry?.getAttribute('position');
      if (!position) return;
      const e = node.matrixWorld.elements;
      const stride = position.count > 6000 ? 3 : 1;
      for (let i = 0; i < position.count; i += stride) {
        let px = position.getX(i); let py = position.getY(i); let pz = position.getZ(i);
        if (node.isSkinnedMesh && node.skeleton) {
          const v = { x: px, y: py, z: pz };
          // three's applyBoneTransform needs a Vector3; the scene graph hands us the real class via a bone position clone.
          const vec = node.skeleton.bones[0].position.clone().set(px, py, pz);
          node.applyBoneTransform(i, vec);
          px = vec.x; py = vec.y; pz = vec.z; void v;
        }
        const wx = e[0] * px + e[4] * py + e[8] * pz + e[12];
        const wy = e[1] * px + e[5] * py + e[9] * pz + e[13];
        const wz = e[2] * px + e[6] * py + e[10] * pz + e[14];
        if (!drawnAt(wx, wy, wz)) continue;
        if (!lowest || wy < lowest.y) lowest = { x: wx, y: wy, z: wz, mesh: node.name, skinned: Boolean(node.isSkinnedMesh) };
      }
    });
    return {
      eye,
      playerPosition: snapshot?.player?.position ?? null,
      stance: penetration.stance,
      stanceReached,
      grounded: snapshot?.player?.grounded === true,
      // HF-395: a pose whose EYE is inside a movement collider is not reachable
      // in play, and no separating plane exists for a box you are inside. That
      // is a different verdict from "the clip system missed a wall".
      worstBoxSource: penetration.worstBoxSource ?? null,
      eyeInsideColliderBox: penetration.eyeInsideColliderBox ?? null,
      eyeInsideDressingBox: penetration.eyeInsideDressingBox ?? null,
      lastGroundedFeetY: penetration.lastGroundedFeetY,
      activeClipPlanes: penetration.activeClipPlanes,
      clippedVertices: penetration.clippedVertices,
      verticesMeasured: penetration.verticesMeasured,
      maxPenetrationM: penetration.maxPenetrationM,
      worstMesh: penetration.worstMesh,
      worstPoint: penetration.worstPoint,
      worstBox: penetration.worstBox,
      maxBelowFloorM: penetration.maxBelowFloorM,
      lowestDrawnVertex: lowest ? { ...lowest, x: Math.round(lowest.x * 1000) / 1000, y: Math.round(lowest.y * 1000) / 1000, z: Math.round(lowest.z * 1000) / 1000 } : null,
      planes,
      contactFold: penetration.contactFold,
    };
  }, pose);
  report.push({ pose: pose.name, ...sample });
  console.log(`\n## ${pose.name}`);
  console.log(JSON.stringify(sample, null, 1));
}
await browser.close();
writeFileSync(resolve(OUT, `${LABEL}-${WEAPON}.json`), `${JSON.stringify(report, null, 2)}\n`);
