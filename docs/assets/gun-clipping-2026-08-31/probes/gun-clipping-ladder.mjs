// DIAGNOSIS ONLY - gun clipping pass 2026-08-31. Writes only under docs/assets/.
// Distance ladder: park the player at fixed gaps from a known wall and record
// the fold the system computed vs where the weapon geometry actually ended up.
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
  window.__GC4__ = {
    dressing() {
      const scene = D.sampleSceneGraph();
      const names = [];
      scene.traverse((n) => { if (n.parent === scene || (n.parent && n.parent.parent === scene)) names.push(`${n.name || n.type}`); });
      return names.slice(0, 80);
    },
    probe() {
      const scene = D.sampleSceneGraph();
      let root = null; let cam = null;
      scene.traverse((n) => {
        if (n.name === 'original-weapon-view') root = n;
        if (n.isPerspectiveCamera && !cam) cam = n;
      });
      const diag = D.sampleFireAdmissionDiagnostics();
      const inv = cam.matrixWorldInverse.elements;
      const toCam = (x, y, z) => [
        inv[0] * x + inv[4] * y + inv[8] * z + inv[12],
        inv[1] * x + inv[5] * y + inv[9] * z + inv[13],
        inv[2] * x + inv[6] * y + inv[10] * z + inv[14],
      ];
      // Weapon-only camera-space envelope (arms batches excluded: their merged
      // AABBs are far larger than the drawn sleeves and would flatter nothing).
      let wmin = [1e9, 1e9, 1e9]; let wmax = [-1e9, -1e9, -1e9]; let count = 0;
      const sockets = {};
      root.traverse((n) => {
        if (!chainVisible(n, root) || !root.visible) return;
        if (/socket/i.test(n.name)) { const m = n.matrixWorld.elements; sockets[n.name] = toCam(m[12], m[13], m[14]); }
        if (!n.isMesh) return;
        if (/Arms_Batch|muzzle-flash|smoke|flash-burst|fill|light|reticle/i.test(n.name)) return;
        const g = n.geometry; if (!g) return;
        if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox; const e = n.matrixWorld.elements;
        for (let i = 0; i < 8; i += 1) {
          const x = (i & 1) ? bb.max.x : bb.min.x;
          const y = (i & 2) ? bb.max.y : bb.min.y;
          const z = (i & 4) ? bb.max.z : bb.min.z;
          const c = toCam(
            e[0] * x + e[4] * y + e[8] * z + e[12],
            e[1] * x + e[5] * y + e[9] * z + e[13],
            e[2] * x + e[6] * y + e[10] * z + e[14],
          );
          for (let k = 0; k < 3; k += 1) { if (c[k] < wmin[k]) wmin[k] = c[k]; if (c[k] > wmax[k]) wmax[k] = c[k]; }
        }
        count += 1;
      });
      if (!count) { wmin = null; wmax = null; }
      return {
        diag,
        rootPos: [root.position.x, root.position.y, root.position.z],
        rootRotX: root.rotation.x, rootScale: root.scale.x,
        weaponCamMin: wmin, weaponCamMax: wmax, weaponMeshes: count,
        muzzleCam: sockets['muzzle-socket'] ?? null,
        frontSightCam: sockets['front-sight-socket'] ?? null,
      };
    },
  };
});
const frames = (n = 30) => page.evaluate((count) => new Promise((res) => {
  let i = 0; const step = () => { i += 1; if (i >= count) res(null); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);

const WEAPONS = (process.env.PROBE_WEAPONS ?? 'carbine,sniper').split(',');
const GAPS = (process.env.PROBE_GAPS ?? '2.5,1.8,1.4,1.1,0.9,0.7,0.55,0.45').split(',').map(Number);
const WALL_X = Number(process.env.PROBE_WALL ?? '-37.0');
const Z = Number(process.env.PROBE_Z ?? '23');
const YAW = Number(process.env.PROBE_YAW ?? '1.571');
const EYE_Y = Number(process.env.PROBE_EYE_Y ?? '1.7');
const SHOT = process.env.PROBE_SHOTS === '0' ? false : true;

console.log('SCENE ROOTS', JSON.stringify(await page.evaluate(() => window.__GC4__.dressing())));

const rows = [];
for (const weapon of WEAPONS) {
  await page.evaluate((w) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon(w), weapon);
  await frames(70);
  for (const gap of GAPS) {
    await page.evaluate((a) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(a[0], a[1], a[2], a[3], 0), [WALL_X + gap, EYE_Y, Z, YAW]);
    await frames(75);
    const p = await page.evaluate(() => window.__GC4__.probe());
    const name = `ladder-${ARENA}-${weapon}-gap${String(Math.round(gap * 100)).padStart(3, '0')}cm`;
    if (SHOT) await page.screenshot({ path: `${OUT}/${name}.png` });
    const trueGap = p.diag.position[0] - WALL_X;
    const muzzle = p.muzzleCam ? -p.muzzleCam[2] : null;
    const wmax = p.weaponCamMax ? -p.weaponCamMin[2] : null; // furthest forward point
    rows.push({ weapon, requestedGapM: gap, trueGapM: trueGap, name, ...p });
    console.log('LADDER', name, JSON.stringify({
      gap: +trueGap.toFixed(3), nearestProbe: p.diag.nearestForwardMeters, retreat: p.diag.retreat,
      rootZ: +p.rootPos[2].toFixed(3), rootRotX: +p.rootRotX.toFixed(3), scale: +p.rootScale.toFixed(3),
      muzzleFwd: muzzle === null ? null : +muzzle.toFixed(3),
      muzzlePastWall: muzzle === null ? null : +(muzzle - trueGap).toFixed(3),
      weaponFwdMax: wmax === null ? null : +wmax.toFixed(3),
      weaponPastWall: wmax === null ? null : +(wmax - trueGap).toFixed(3),
    }));
  }
}
writeFileSync(`${OUT}/ladder-${ARENA}.json`, JSON.stringify(rows, null, 2));
await close();
