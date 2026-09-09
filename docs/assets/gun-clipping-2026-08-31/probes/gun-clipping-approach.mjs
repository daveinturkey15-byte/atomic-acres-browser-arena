// DIAGNOSIS ONLY - gun clipping pass 2026-08-31. Writes only under docs/assets/.
// Walks the player from 3 m out to hard contact with one wall, capturing a
// frame and a full pose/geometry measurement at every step.
import { launchSoloMatch } from '../../../../scripts/qa/lib/launch-match.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/').replace(/\/$/, '');
const ARENA = process.env.PROBE_ARENA ?? 'atomic-acres';
const OUT = 'docs/assets/gun-clipping-2026-08-31';
mkdirSync(OUT, { recursive: true });

const { page, close } = await launchSoloMatch({ arena: ARENA, baseUrl: BASE, viewport: { width: 1280, height: 720 } });

await page.evaluate(() => {
  const D = window.__ATOMIC_ACRES_DEBUG__;
  const chainVisible = (n, root) => { let a = n; while (a && a !== root) { if (!a.visible) return false; a = a.parent; } return true; };
  window.__GC2__ = {
    probe() {
      const scene = D.sampleSceneGraph();
      let root = null; let cam = null;
      scene.traverse((n) => {
        if (n.name === 'original-weapon-view') root = n;
        if (n.isPerspectiveCamera && !cam) cam = n;
      });
      const diag = D.sampleFireAdmissionDiagnostics();
      if (!root || !cam) return { error: 'no root/cam', diag };
      const inv = cam.matrixWorldInverse;
      const toCam = (x, y, z) => {
        const e = inv.elements;
        return [
          e[0] * x + e[4] * y + e[8] * z + e[12],
          e[1] * x + e[5] * y + e[9] * z + e[13],
          e[2] * x + e[6] * y + e[10] * z + e[14],
        ];
      };
      const skip = /muzzle-flash|smoke|flash-burst|fill|light|reticle/i;
      const groups = {};
      const sockets = {};
      let visibleMeshes = 0; let hiddenMeshes = 0; const layerMasks = {};
      root.traverse((n) => {
        const vis = chainVisible(n, root) && root.visible;
        if (n.isMesh) { if (vis) visibleMeshes += 1; else hiddenMeshes += 1; }
        if (!vis) return;
        if (/socket/i.test(n.name)) {
          const m = n.matrixWorld.elements;
          sockets[n.name] = toCam(m[12], m[13], m[14]);
        }
        if (!n.isMesh || skip.test(n.name)) return;
        layerMasks[n.layers.mask] = (layerMasks[n.layers.mask] ?? 0) + 1;
        const g = n.geometry; if (!g) return;
        if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox; if (!bb) return;
        const e = n.matrixWorld.elements;
        const key = /arm|sleeve|skin|hand|glove/i.test(n.name) ? 'arms' : 'weapon';
        const acc = groups[key] ?? (groups[key] = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], count: 0 });
        for (let i = 0; i < 8; i += 1) {
          const x = (i & 1) ? bb.max.x : bb.min.x;
          const y = (i & 2) ? bb.max.y : bb.min.y;
          const z = (i & 4) ? bb.max.z : bb.min.z;
          const w = [
            e[0] * x + e[4] * y + e[8] * z + e[12],
            e[1] * x + e[5] * y + e[9] * z + e[13],
            e[2] * x + e[6] * y + e[10] * z + e[14],
          ];
          const c = toCam(w[0], w[1], w[2]);
          for (let k = 0; k < 3; k += 1) { if (c[k] < acc.min[k]) acc.min[k] = c[k]; if (c[k] > acc.max[k]) acc.max[k] = c[k]; }
        }
        acc.count += 1;
      });
      return {
        diag,
        rootVisible: root.visible,
        rootPos: [root.position.x, root.position.y, root.position.z],
        rootRot: [root.rotation.x, root.rotation.y, root.rotation.z],
        rootScale: root.scale.x,
        rootLayerMask: root.layers.mask,
        layerMasks,
        visibleMeshes, hiddenMeshes,
        cameraNear: cam.near, cameraFov: cam.fov,
        cameraPos: [cam.position.x, cam.position.y, cam.position.z],
        groups,
        muzzleCam: sockets['muzzle-socket'] ?? null,
        sockets,
      };
    },
  };
});

const frames = (n = 30) => page.evaluate((count) => new Promise((res) => {
  let i = 0; const step = () => { i += 1; if (i >= count) res(null); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);

const WEAPON = process.env.PROBE_WEAPON ?? 'carbine';
const STANCE = process.env.PROBE_STANCE ?? 'stand';
const START = JSON.parse(process.env.PROBE_START ?? '[-33.0,1.7,23]');
const YAW = Number(process.env.PROBE_YAW ?? '1.571');
const WALL_X = Number(process.env.PROBE_WALL ?? '-37.0');

await page.evaluate((w) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon(w), WEAPON);
await frames(60);
await page.evaluate((s) => window.__ATOMIC_ACRES_DEBUG__.setStanceForQa(s), STANCE);
await frames(20);

const rows = [];
const targets = [3.0, 2.2, 1.8, 1.5, 1.2, 1.0, 0.85, 0.7, 0.6, 0.5, 0.45, 0.405];
for (const want of targets) {
  const x = WALL_X + want;
  await page.evaluate((a) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(a[0], a[1], a[2], a[3], 0), [x, START[1], START[2], YAW]);
  await frames(6);
  // hold W briefly so the capsule settles on the ground and the pose is a real
  // sustained wall-hug rather than a one-frame teleport artefact.
  await page.keyboard.down('KeyW');
  await frames(70);
  const p = await page.evaluate(() => window.__GC2__.probe());
  const name = `approach-${WEAPON}-${STANCE}-${String(Math.round(want * 100)).padStart(3, '0')}cm`;
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.keyboard.up('KeyW');
  rows.push({ requestedGapM: want, name, ...p });
  const w = p.groups?.weapon; const a = p.groups?.arms;
  console.log('STEP', name, JSON.stringify({
    eyeX: +p.diag.position[0].toFixed(3),
    gapToWall: +(p.diag.position[0] - WALL_X).toFixed(3),
    nearest: p.diag.nearestForwardMeters, retreat: p.diag.retreat,
    rootPos: p.rootPos.map((v) => +v.toFixed(3)), rootRotX: +p.rootRot[0].toFixed(3), scale: +p.rootScale.toFixed(3),
    rootVisible: p.rootVisible, visMeshes: p.visibleMeshes, layers: p.layerMasks,
    muzzleCam: p.muzzleCam ? p.muzzleCam.map((v) => +v.toFixed(3)) : null,
    weaponCamZ: w ? [+w.min[2].toFixed(3), +w.max[2].toFixed(3)] : null,
    armsCamZ: a ? [+a.min[2].toFixed(3), +a.max[2].toFixed(3)] : null,
  }));
}
writeFileSync(`${OUT}/approach-${WEAPON}-${STANCE}.json`, JSON.stringify(rows, null, 2));
await close();
