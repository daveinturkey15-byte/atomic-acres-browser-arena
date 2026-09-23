// DIAGNOSIS ONLY - gun clipping pass 2026-08-31. Writes only under docs/assets/.
// The frames that show the defect unambiguously, with the numbers printed next
// to each one.
import { launchSoloMatch } from '../../../../scripts/qa/lib/launch-match.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/').replace(/\/$/, '');
const OUT = 'docs/assets/gun-clipping-2026-08-31';
mkdirSync(OUT, { recursive: true });
const { page, close } = await launchSoloMatch({ arena: 'atomic-acres', baseUrl: BASE, viewport: { width: 1280, height: 720 } });

await page.evaluate(() => {
  const D = window.__ATOMIC_ACRES_DEBUG__;
  const chainVisible = (n, r) => { let a = n; while (a && a !== r) { if (!a.visible) return false; a = a.parent; } return true; };
  window.__GC6__ = () => {
    const scene = D.sampleSceneGraph();
    let root = null; let cam = null;
    scene.traverse((n) => { if (n.name === 'original-weapon-view') root = n; if (n.isPerspectiveCamera && !cam) cam = n; });
    const diag = D.sampleFireAdmissionDiagnostics();
    const inv = cam.matrixWorldInverse.elements;
    const toCam = (x, y, z) => [
      inv[0] * x + inv[4] * y + inv[8] * z + inv[12],
      inv[1] * x + inv[5] * y + inv[9] * z + inv[13],
      inv[2] * x + inv[6] * y + inv[10] * z + inv[14],
    ];
    let muzzleWorld = null; let muzzleCam = null; let lowestWorldY = 1e9;
    root.traverse((n) => {
      if (!chainVisible(n, root) || !root.visible) return;
      if (n.name === 'muzzle-socket') {
        const m = n.matrixWorld.elements;
        muzzleWorld = [m[12], m[13], m[14]];
        muzzleCam = toCam(m[12], m[13], m[14]);
      }
      if (!n.isMesh || /Arms_Batch|muzzle-flash|smoke|flash-burst|fill|light|reticle/i.test(n.name)) return;
      const g = n.geometry; if (!g) return;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox; const e = n.matrixWorld.elements;
      for (let i = 0; i < 8; i += 1) {
        const x = (i & 1) ? bb.max.x : bb.min.x;
        const y = (i & 2) ? bb.max.y : bb.min.y;
        const z = (i & 4) ? bb.max.z : bb.min.z;
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        if (wy < lowestWorldY) lowestWorldY = wy;
      }
    });
    return { diag, rootZ: root.position.z, rootRotX: root.rotation.x, muzzleWorld, muzzleCam, lowestWeaponWorldY: lowestWorldY };
  };
});
const frames = (n = 30) => page.evaluate((c) => new Promise((res) => {
  let i = 0; const s = () => { i += 1; if (i >= c) res(null); else requestAnimationFrame(s); };
  requestAnimationFrame(s);
}), n);

const shots = [];
async function hero(name, weapon, stance, pose, holdW = 0) {
  await page.evaluate((w) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon(w), weapon);
  await frames(70);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStanceForQa('stand'));
  await frames(8);
  await page.evaluate((s) => window.__ATOMIC_ACRES_DEBUG__.setStanceForQa(s), stance);
  await frames(20);
  await page.evaluate((a) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(a[0], a[1], a[2], a[3], a[4]), pose);
  await frames(20);
  if (holdW) { await page.keyboard.down('KeyW'); await frames(holdW); }
  await frames(60);
  const m = await page.evaluate(() => window.__GC6__());
  await page.screenshot({ path: `${OUT}/${name}.png` });
  if (holdW) await page.keyboard.up('KeyW');
  shots.push({ name, weapon, stance, requestedPose: pose, ...m });
  console.log('HERO', name, JSON.stringify({
    eye: m.diag.position.map((v) => +v.toFixed(2)), retreat: m.diag.retreat,
    nearestProbe: m.diag.nearestForwardMeters, rootZ: +m.rootZ.toFixed(3), rotX: +m.rootRotX.toFixed(2),
    muzzleWorld: m.muzzleWorld ? m.muzzleWorld.map((v) => +v.toFixed(3)) : null,
    muzzleFwd: m.muzzleCam ? +(-m.muzzleCam[2]).toFixed(3) : null,
    lowestWeaponY: +m.lowestWeaponWorldY.toFixed(3),
  }));
}

// Post is a 0.61 m square wooden post spanning x -34.81..-34.19, z 9.69..10.31.
// Stand off it so the barrel visibly crosses the post silhouette.
await hero('hero-1-post-carbine-100cm', 'carbine', 'stand', [-34.5, 1.7, 11.31, 0, 0]);
await hero('hero-2-post-carbine-070cm', 'carbine', 'stand', [-34.5, 1.7, 11.01, 0, 0]);
await hero('hero-3-post-sniper-100cm', 'sniper', 'stand', [-34.5, 1.7, 11.31, 0, 0]);
// Prone on open ground, looking down: nothing folds, the weapon goes under the floor.
await hero('hero-4-prone-floor-carbine', 'carbine', 'prone', [-27, 0.64, 20, 4.712, -1.2]);
await hero('hero-5-stand-floor-carbine', 'carbine', 'stand', [-27, 1.7, 20, 4.712, -1.2]);
// Hard contact with the post at full stow.
await hero('hero-6-post-contact-carbine', 'carbine', 'stand', [-34.5, 1.7, 14, 0, 0], 150);

writeFileSync(`${OUT}/hero-frames.json`, JSON.stringify(shots, null, 2));
await close();
