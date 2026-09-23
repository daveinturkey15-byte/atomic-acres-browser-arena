#!/usr/bin/env node
/**
 * TRUE FORWARD EXTENT vs BOUNDING-BOX FORWARD EXTENT, per viewmodel mesh.
 *
 * The corrected acceptance criterion is about the furthest-forward VERTEX of
 * every visible viewmodel mesh, not a bounding-box corner. Those are not the
 * same number and the difference decides the whole design:
 *
 *  - `measure-muzzle-contact.mjs` reports `armsFwdMaxM` from the eight corners
 *    of `geometry.boundingBox` pushed through `matrixWorld`. For a SkinnedMesh
 *    that box is the BIND-POSE box and `matrixWorld` is the arms root, so it
 *    describes a volume the posed anatomy never occupies. `measureRigBounds`
 *    already refuses to fold against it for exactly this reason ("roughly a
 *    metre looser than the anatomy it covers").
 *  - The real vertices, skinned through the live bone palette, are the thing
 *    the player sees.
 *
 * This probe prints both, per mesh, in camera space, so the fold can be
 * designed against measurement instead of against another guess.
 *
 * Usage: node probe-extent.mjs --url http://127.0.0.1:41988
 */
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41988');
const WEAPONS = arg('--weapons', 'carbine,sniper,explosive-crossbow,flamethrower').split(',');

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: [
    '--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 200)));
await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=vmclip`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
console.error('[extent] backend=', await page.evaluate(() => document.documentElement.dataset.renderBackend));
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

const SITES = [
  { label: 'open', place: [-18.041, 1.7, 20.003], yaw: 4.712, pitch: 0 },
  { label: 'wall-0.40', place: null, yaw: Math.PI / 2, pitch: 0 },
];

for (const weapon of WEAPONS) {
  for (const site of SITES) {
    await page.evaluate(({ weapon, site }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.equipWeapon(weapon);
      api.setStance('stand');
      if (site.place) { api.teleportPlayer(site.place[0], site.place[1], site.place[2], site.yaw, site.pitch); return; }
      // Walk in from the long perimeter wall until the eye is 0.40 m off it.
      const base = [-35.0, 1.7, 23.0];
      const dir = [-Math.sin(site.yaw), 0, -Math.cos(site.yaw)];
      const trace = api.traceBallistics('carbine', base, dir, 14);
      const entry = trace?.impacts?.[0]?.entryDistance ?? 3;
      const hit = [base[0] + dir[0] * entry, 1.7, base[2] + dir[2] * entry];
      api.teleportPlayer(hit[0] - dir[0] * 0.4, 1.7, hit[2] - dir[2] * 0.4, site.yaw, site.pitch);
    }, { weapon, site });
    await new Promise((r) => setTimeout(r, 2_200));

    const out = await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const scene = api.sampleSceneGraph();
      let camera = null; let vm = null;
      scene.traverse((n) => {
        if (!camera && n.isPerspectiveCamera) camera = n;
        if (!vm && n.name === 'original-weapon-view') vm = n;
      });
      scene.updateMatrixWorld(true);
      const V3 = scene.position.constructor;
      const eye = camera.getWorldPosition(new V3());
      const fwd = camera.getWorldDirection(new V3());
      const rows = [];
      const scratch = new V3();
      vm.traverse((n) => {
        if (!n.isMesh || !n.visible) return;
        for (let p = n; p && p !== vm; p = p.parent) if (!p.visible) return;
        const g = n.geometry;
        if (!g) return;
        if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox;
        const m = n.matrixWorld.elements;
        const d = (x, y, z) => (x - eye.x) * fwd.x + (y - eye.y) * fwd.y + (z - eye.z) * fwd.z;
        let boxMax = -Infinity;
        for (let i = 0; i < 8; i += 1) {
          const x = (i & 1) ? bb.max.x : bb.min.x;
          const y = (i & 2) ? bb.max.y : bb.min.y;
          const z = (i & 4) ? bb.max.z : bb.min.z;
          boxMax = Math.max(boxMax, d(
            m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14],
          ));
        }
        // True vertices. SkinnedMesh vertices are transformed by the live bone
        // palette, which is exactly what `boundingBox` does not know about.
        const pos = g.attributes.position;
        let vertMax = -Infinity;
        const skinned = Boolean(n.isSkinnedMesh && typeof n.applyBoneTransform === 'function');
        for (let i = 0; i < pos.count; i += 1) {
          scratch.fromBufferAttribute(pos, i);
          if (skinned) n.applyBoneTransform(i, scratch);
          scratch.applyMatrix4(n.matrixWorld);
          const dd = d(scratch.x, scratch.y, scratch.z);
          if (dd > vertMax) vertMax = dd;
        }
        rows.push({
          name: n.name || n.type,
          skinned,
          verts: pos.count,
          boxFwd: +boxMax.toFixed(4),
          vertFwd: +vertMax.toFixed(4),
          slack: +(boxMax - vertMax).toFixed(4),
          arms: /arm|sleeve|hand|glove|finger/i.test(n.name),
        });
      });
      let muzzle = null;
      vm.traverse((n) => { if (!muzzle && n.name === 'muzzle-socket') muzzle = n; });
      const mw = muzzle ? muzzle.getWorldPosition(new V3()) : null;
      const snap = api.snapshot();
      return {
        weapon: snap.player.weapon,
        muzzleFwd: mw ? +(((mw.x - eye.x) * fwd.x + (mw.y - eye.y) * fwd.y + (mw.z - eye.z) * fwd.z)).toFixed(4) : null,
        rootZ: +vm.position.z.toFixed(4),
        rootPitch: +vm.rotation.x.toFixed(4),
        rootScale: +vm.scale.x.toFixed(4),
        rows: rows.sort((a, b) => b.vertFwd - a.vertFwd),
      };
    });
    console.log(JSON.stringify({ site: site.label, ...out }));
  }
}
await browser.close();
