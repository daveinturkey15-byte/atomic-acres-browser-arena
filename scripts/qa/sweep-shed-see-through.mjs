#!/usr/bin/env node
// Gate-2 shipped-path sweep. The browser owns the scene and the raycasts;
// fireOnce() enters the production tryFire/authority route rather than the
// bulletHitShed diagnostic mutation.

import { chromium } from '@playwright/test';
import { PASS65_SHED_PLACEMENTS } from './lib/shed-see-through.mjs';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
if (argv.includes('--help')) {
  console.log(`Usage: node scripts/qa/sweep-shed-see-through.mjs [--url http://127.0.0.1:4373] [--shots 200] [--only placementId]`);
  process.exit(0);
}

const url = value('--url', 'http://127.0.0.1:4373');
const shotCount = Math.max(200, Number(value('--shots', '200')) || 200);
const only = value('--only', null);
const placements = PASS65_SHED_PLACEMENTS.filter((placement) => placement.arenaId === 'nuketown2' && (!only || placement.id === only));
if (placements.length === 0) throw new Error(`No matching nuketown2 shed placement for ${only ?? '(all)'}`);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 240)));
try {
  await page.goto(`${url}/?release=latest&renderer=webgpu&render=quality&seed=shed-sweep&previewTime=0`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('nuketown2'); });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true); });
  await page.waitForTimeout(2_000);

  const result = await page.evaluate(async ({ placements, shotCount }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
    const chunkUrl = resources.find((name) => /three\.webgpu[^/]*\.js/.test(name))
      ?? resources.find((name) => /vendor-three[^/]*\.js/.test(name));
    if (!chunkUrl) return { verdict: 'FAIL', reason: 'three-chunk-not-found' };
    const three = await import(chunkUrl);
    if (typeof three.Raycaster !== 'function') return { verdict: 'FAIL', reason: 'raycaster-not-found' };
    const random = (() => { let state = 0x51ed5eed; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x1_0000_0000; }; })();

    function shedRoot(id) {
      const scene = debug.sampleSceneGraph();
      let found = null;
      scene.traverse((node) => { if (!found && node.userData?.placementId === id) found = node; });
      return found;
    }
    function rayAabb(origin, direction, box) {
      let entry = -Infinity;
      let exit = Infinity;
      for (const axis of ['x', 'y', 'z']) {
        const o = origin[axis];
        const d = direction[axis];
        const min = box.min[axis];
        const max = box.max[axis];
        if (Math.abs(d) < 1e-9) {
          if (o < min || o > max) return null;
          continue;
        }
        const a = (min - o) / d;
        const b = (max - o) / d;
        entry = Math.max(entry, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
        if (entry > exit) return null;
      }
      return { entry, exit };
    }
    function fanTargets(box, origin, countU = 18, countV = 12) {
      const centre = box.getCenter(new three.Vector3());
      const delta = centre.clone().sub(origin);
      const horizontalX = Math.abs(delta.x) >= Math.abs(delta.z);
      const targets = [];
      for (let v = 0; v < countV; v += 1) {
        const y = three.MathUtils.lerp(box.min.y + 0.05, box.max.y - 0.05, (v + 0.5) / countV);
        for (let u = 0; u < countU; u += 1) {
          const across = three.MathUtils.lerp(
            horizontalX ? box.min.z + 0.05 : box.min.x + 0.05,
            horizontalX ? box.max.z - 0.05 : box.max.x - 0.05,
            (u + 0.5) / countU,
          );
          const target = horizontalX
            ? new three.Vector3(delta.x >= 0 ? box.max.x : box.min.x, y, across)
            : new three.Vector3(across, y, delta.z >= 0 ? box.max.z : box.min.z);
          targets.push(target);
        }
      }
      return targets;
    }
    async function scanPlacement(id) {
      const shed = shedRoot(id);
      if (!shed) return { placementId: id, verdict: 'FAIL', reason: 'shed-root-not-found' };
      shed.updateMatrixWorld(true);
      const box = new three.Box3().setFromObject(shed);
      const shell = shed.getObjectByName('field-shed-damageable-shell');
      const door = shed.getObjectByName('field-shed-door-leaf');
      const meshes = [];
      const scene = debug.sampleSceneGraph();
      scene.traverse((node) => {
        if (node.isMesh && node.visible) meshes.push(node);
      });
      const poses = [];
      const centre = box.getCenter(new three.Vector3());
      for (let radius of [2.5, 4, 6]) {
        for (let step = 0; step < 24; step += 1) {
          const bearing = step * Math.PI * 2 / 24;
          const eye = new three.Vector3(centre.x + Math.cos(bearing) * radius, 1.65, centre.z + Math.sin(bearing) * radius);
          poses.push({ kind: 'exterior', radius, bearing, eye });
        }
      }
      const localInterior = [[0, 1.6, 0], [0.6, 1.6, 0], [-0.6, 1.6, 0], [0, 1.6, 0.6], [0, 1.6, -0.6], [0.6, 1.6, 0.6], [0.6, 1.6, -0.6], [-0.6, 1.6, 0.6]];
      for (const [x, y, z] of localInterior) poses.push({ kind: 'interior', eye: shed.localToWorld(new three.Vector3(x, y, z)) });
      const perPose = [];
      let totalLeaks = 0;
      let totalRays = 0;
      let posesWithMaterialLeak = 0;
      const raycaster = new three.Raycaster();
      for (const pose of poses) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        debug.teleportPlayer(pose.eye.x, pose.eye.y, pose.eye.z, Math.atan2(-(centre.x - pose.eye.x), -(centre.z - pose.eye.z)), 0);
        const targets = fanTargets(box, pose.eye);
        let leaks = 0;
        for (const target of targets) {
          const direction = target.clone().sub(pose.eye).normalize();
          const intersection = rayAabb(pose.eye, direction, box);
          if (!intersection || intersection.exit <= 0) continue;
          const boundary = pose.eye.x >= box.min.x && pose.eye.x <= box.max.x && pose.eye.y >= box.min.y && pose.eye.y <= box.max.y && pose.eye.z >= box.min.z && pose.eye.z <= box.max.z
            ? intersection.exit : Math.max(0, intersection.entry);
          raycaster.set(pose.eye, direction);
          const hits = raycaster.intersectObjects(meshes, false);
          const firstDistance = hits[0]?.distance ?? Infinity;
          if (firstDistance > boundary + 0.08) leaks += 1;
        }
        const fraction = leaks / Math.max(1, targets.length);
        totalLeaks += leaks;
        totalRays += targets.length;
        if (fraction > 0.001) posesWithMaterialLeak += 1;
        perPose.push({ kind: pose.kind, radius: pose.radius ?? null, bearing: pose.bearing ?? null, leaks, rays: targets.length, leakFraction: fraction });
      }
      return {
        placementId: id,
        poses: poses.length,
        rays: totalRays,
        leaks: totalLeaks,
        leakFraction: totalLeaks / Math.max(1, totalRays),
        posesWithLeakOverPointOnePercent: posesWithMaterialLeak,
        shellTriangles: shell?.geometry?.index ? shell.geometry.index.count / 3 : 0,
        doorTriangles: door?.geometry?.index ? door.geometry.index.count / 3 : 0,
        samplePoses: perPose.filter((pose) => pose.leaks > 0).slice(0, 8),
      };
    }
    async function fireSoak(id) {
      const shed = shedRoot(id);
      if (!shed) return { placementId: id, fired: 0, accepted: 0 };
      shed.updateMatrixWorld(true);
      const centre = shed.getWorldPosition(new three.Vector3());
      const weapons = ['carbine', 'smg', 'lmg', 'scattergun', 'pistol', 'm4a1', 'ak-47'];
      let fired = 0;
      let accepted = 0;
      for (let shot = 0; shot < shotCount; shot += 1) {
        const radius = 3.6 + random() * 1.7;
        const bearing = random() * Math.PI * 2;
        const x = centre.x + Math.cos(bearing) * radius;
        const z = centre.z + Math.sin(bearing) * radius;
        const yaw = Math.atan2(-(centre.x - x), -(centre.z - z));
        const jitter = [0, 0.01, 0.05, 0.2][shot % 4] * Math.PI / 180;
        const pitch = (random() * 2 - 1) * jitter;
        debug.teleportPlayer(x, shot % 3 === 0 ? 1.25 : 1.65, z, yaw + (random() * 2 - 1) * jitter, pitch);
        debug.setStanceForQa?.(shot % 3 === 0 ? 'crouch' : 'stand');
        const weapon = weapons[shot % weapons.length];
        debug.equipWeapon?.(weapon);
        debug.setAmmo?.(weapon, 200, 1_000);
        const before = debug.snapshot().player.ammo?.[weapon] ?? null;
        debug.fireOnce?.();
        const after = debug.snapshot().player.ammo?.[weapon] ?? null;
        fired += 1;
        if (before !== null && after !== null && after < before) accepted += 1;
        await wait(65);
      }
      debug.setStanceForQa?.('stand');
      return { placementId: id, fired, accepted };
    }
    const reports = [];
    for (const placement of placements) {
      const soak = await fireSoak(placement.id);
      const intact = await scanPlacement(placement.id);
      const gate1Before = debug.snapshot();
      for (let index = 0; index < 3; index += 1) debug.bulletHitShed(placement.id, 'wall-east', 30, 300);
      await wait(250);
      const repro = await scanPlacement(placement.id);
      const afterRepro = debug.snapshot();
      const detachResult = debug.damageShed(placement.id, 'wall-east', 220);
      await wait(250);
      const detached = await scanPlacement(placement.id);
      reports.push({ placementId: placement.id, soak, intact, afterSoak: intact, gate1: { beforeRevision: gate1Before.interactiveWorld?.envelope?.revision ?? null, afterRevision: afterRepro.interactiveWorld?.envelope?.revision ?? null }, afterGate1ArtificialRepro: repro, legitimateDetach: { accepted: detachResult, scan: detached } });
    }
    return { verdict: 'PASS', reports };
  }, { placements, shotCount });
  result.pageErrors = pageErrors;
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.verdict === 'PASS' ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ verdict: 'FAIL', error: String(error), pageErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
