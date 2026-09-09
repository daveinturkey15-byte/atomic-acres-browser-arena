#!/usr/bin/env node
/**
 * WHICH PART OF THE ARM IS THROUGH THE WALL?
 *
 * `probe-extent.mjs` says the sleeve's furthest real vertex sits 0.86 m from
 * the eye against a wall at 0.40 m, while the weapon body is already back at
 * 0.57 m. That difference decides whether the fix is "fold harder", "anchor
 * the arms against the fold" or "cut what cannot move". This prints the joint
 * chain in camera-forward metres so the offending link is named, not guessed.
 */
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = arg('--url', 'http://127.0.0.1:41988');

const browser = await chromium.launch({
  headless: false, channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await (await page.context().newCDPSession(page)).send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=vmclip`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
await page.evaluate(async () => {
  await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres');
  window.__ATOMIC_ACRES_DEBUG__.startSolo();
});
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
await new Promise((r) => setTimeout(r, 5_000));

for (const site of ['open', 'wall']) {
  await page.evaluate((site) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.equipWeapon('carbine');
    api.setStance('stand');
    if (site === 'open') { api.teleportPlayer(-18.041, 1.7, 20.003, 4.712, 0); return; }
    const yaw = Math.PI / 2;
    const base = [-35.0, 1.7, 23.0];
    const dir = [-Math.sin(yaw), 0, -Math.cos(yaw)];
    const entry = api.traceBallistics('carbine', base, dir, 14)?.impacts?.[0]?.entryDistance ?? 3;
    api.teleportPlayer(base[0] + dir[0] * (entry - 0.4), 1.7, base[2] + dir[2] * (entry - 0.4), yaw, 0);
  }, site);
  await new Promise((r) => setTimeout(r, 2_500));
  const out = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const scene = api.sampleSceneGraph();
    scene.updateMatrixWorld(true);
    let camera = null; let vm = null;
    scene.traverse((n) => {
      if (!camera && n.isPerspectiveCamera) camera = n;
      if (!vm && n.name === 'original-weapon-view') vm = n;
    });
    const V3 = scene.position.constructor;
    const eye = camera.getWorldPosition(new V3());
    const fwd = camera.getWorldDirection(new V3());
    const f = (o) => { const p = o.getWorldPosition(new V3()); return +(((p.x - eye.x) * fwd.x + (p.y - eye.y) * fwd.y + (p.z - eye.z) * fwd.z)).toFixed(3); };
    const bones = {};
    vm.traverse((n) => {
      if (!n.isBone) return;
      if (/^(UpperArm|LowerArm|Wrist|Hand|Palm)[LR]$/u.test(n.name) || /shoulder|elbow|wrist/i.test(n.name)) bones[n.name] = f(n);
    });
    const sockets = {};
    vm.traverse((n) => { if (/socket/i.test(n.name) && n.parent && n.parent.visible) sockets[n.name] = f(n); });
    // Furthest-forward skinned vertex, and the bone with the largest weight on it.
    const worst = [];
    const scratch = new V3();
    vm.traverse((n) => {
      if (!n.isSkinnedMesh || !n.visible) return;
      const pos = n.geometry.attributes.position;
      const idx = n.geometry.attributes.skinIndex;
      const wgt = n.geometry.attributes.skinWeight;
      let best = -Infinity; let bestI = -1;
      for (let i = 0; i < pos.count; i += 1) {
        scratch.fromBufferAttribute(pos, i);
        n.applyBoneTransform(i, scratch);
        scratch.applyMatrix4(n.matrixWorld);
        const d = (scratch.x - eye.x) * fwd.x + (scratch.y - eye.y) * fwd.y + (scratch.z - eye.z) * fwd.z;
        if (d > best) { best = d; bestI = i; }
      }
      let dominant = null;
      if (idx && wgt && bestI >= 0) {
        let bw = -1; let bb = 0;
        for (let k = 0; k < 4; k += 1) {
          const w = wgt.array[bestI * 4 + k];
          if (w > bw) { bw = w; bb = idx.array[bestI * 4 + k]; }
        }
        dominant = n.skeleton.bones[bb]?.name ?? `bone${bb}`;
      }
      worst.push({ mesh: n.name, fwd: +best.toFixed(3), dominantBone: dominant });
    });
    return { rootZ: +vm.position.z.toFixed(3), rootPitch: +vm.rotation.x.toFixed(3), rootScale: +vm.scale.x.toFixed(3), bones, sockets, worst };
  });
  console.log(site, JSON.stringify(out, null, 1));
}
await browser.close();
