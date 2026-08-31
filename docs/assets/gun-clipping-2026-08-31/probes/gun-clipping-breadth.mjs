// DIAGNOSIS ONLY - gun clipping pass 2026-08-31. Writes only under docs/assets/.
// Breadth pass: from spawn, walk into whatever is ahead on N headings, on any
// arena, and report how far past the contacting surface the muzzle finished.
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
  window.__GC5__ = {
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
      let wmin = 1e9; const sockets = {};
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
          if (c[2] < wmin) wmin = c[2];
        }
      });
      return {
        diag,
        rootZ: root.position.z, rootRotX: root.rotation.x, rootScale: root.scale.x,
        muzzleFwd: sockets['muzzle-socket'] ? -sockets['muzzle-socket'][2] : null,
        muzzleCam: sockets['muzzle-socket'] ?? null,
        weaponFwdMax: wmin < 1e8 ? -wmin : null,
      };
    },
  };
});
const frames = (n = 30) => page.evaluate((count) => new Promise((res) => {
  let i = 0; const step = () => { i += 1; if (i >= count) res(null); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);
const probe = () => page.evaluate(() => window.__GC5__.probe());

// Distance from the eye to the first face of the blocking box along camera forward.
function slabDistance(eye, fwd, b) {
  if (!b) return null;
  let tmin = -1e9; let tmax = 1e9;
  const lo = [b.minX, b.minY, b.minZ]; const hi = [b.maxX, b.maxY, b.maxZ];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(fwd[i]) < 1e-9) { if (eye[i] < lo[i] || eye[i] > hi[i]) return null; continue; }
    let t1 = (lo[i] - eye[i]) / fwd[i]; let t2 = (hi[i] - eye[i]) / fwd[i];
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  }
  return tmax >= tmin ? tmin : null;
}

const WEAPONS = (process.env.PROBE_WEAPONS ?? 'carbine,sniper').split(',');
const STANCES = (process.env.PROBE_STANCES ?? 'stand').split(',');
const HEADINGS = Number(process.env.PROBE_HEADINGS ?? '8');
const SHOTS = (process.env.PROBE_SHOT_HEADINGS ?? '').split(',').filter(Boolean).map(Number);

const spawn = process.env.PROBE_START ? JSON.parse(process.env.PROBE_START) : (await probe()).diag.position;
console.log('SPAWN', ARENA, JSON.stringify(spawn.map((v) => +v.toFixed(2))));
const rows = [];
for (const weapon of WEAPONS) {
  await page.evaluate((w) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon(w), weapon);
  await frames(70);
  for (const stance of STANCES) {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStanceForQa('stand'));
    await frames(8);
    await page.evaluate((s) => window.__ATOMIC_ACRES_DEBUG__.setStanceForQa(s), stance);
    await frames(20);
    for (let i = 0; i < HEADINGS; i += 1) {
      const yaw = (i / HEADINGS) * Math.PI * 2;
      await page.evaluate((a) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(a[0], a[1], a[2], a[3], 0), [spawn[0], spawn[1], spawn[2], yaw]);
      await frames(12);
      await page.keyboard.down('KeyW');
      let last = null; let stalls = 0; const t0 = Date.now();
      while (Date.now() - t0 < 3200) {
        await frames(6);
        const m = await probe();
        const e = m.diag.position;
        if (last) { const d = Math.hypot(e[0] - last[0], e[2] - last[2]); if (d < 0.008) stalls += 1; else stalls = 0; if (stalls >= 5) break; }
        last = e;
      }
      await frames(60);
      const p = await probe();
      await page.keyboard.up('KeyW');
      const eye = p.diag.position;
      const pitch = p.diag.pitchRadians; const yw = p.diag.yawRadians;
      const fwd = [-Math.sin(yw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yw) * Math.cos(pitch)];
      const gap = slabDistance(eye, fwd, p.diag.nearestColliderBounds);
      const name = `breadth-${ARENA}-${weapon}-${stance}-h${i}`;
      if (SHOTS.includes(i)) await page.screenshot({ path: `${OUT}/${name}.png` });
      rows.push({ arena: ARENA, weapon, stance, heading: i, yaw, gapToSurfaceM: gap, ...p });
      console.log('BREADTH', name, JSON.stringify({
        eye: eye.map((v) => +v.toFixed(2)), gap: gap === null ? null : +gap.toFixed(3),
        retreat: p.diag.retreat, rootZ: +p.rootZ.toFixed(3), rotX: +p.rootRotX.toFixed(2),
        muzzleFwd: p.muzzleFwd === null ? null : +p.muzzleFwd.toFixed(3),
        muzzlePast: (gap === null || p.muzzleFwd === null) ? null : +(p.muzzleFwd - gap).toFixed(3),
        weaponPast: (gap === null || p.weaponFwdMax === null) ? null : +(p.weaponFwdMax - gap).toFixed(3),
      }));
    }
  }
}
writeFileSync(`${OUT}/breadth-${ARENA}.json`, JSON.stringify(rows, null, 2));
await close();
