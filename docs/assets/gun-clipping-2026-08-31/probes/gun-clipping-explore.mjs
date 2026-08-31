// DIAGNOSIS ONLY - gun clipping pass 2026-08-31. Writes only under docs/assets/.
import { launchSoloMatch } from '../../../../scripts/qa/lib/launch-match.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const ARENA = process.env.PROBE_ARENA ?? 'atomic-acres';
const OUT = 'docs/assets/gun-clipping-2026-08-31';
mkdirSync(OUT, { recursive: true });

const { page, close } = await launchSoloMatch({ arena: ARENA, baseUrl: BASE.replace(/\/$/, '') });
page.on('console', (m) => { if (m.type() === 'error') console.log('[page-error]', m.text().slice(0, 200)); });

// Install the measurement helper once.
await page.evaluate(() => {
  const D = window.__ATOMIC_ACRES_DEBUG__;
  const worldPos = (o) => { const m = o.matrixWorld.elements; return [m[12], m[13], m[14]]; };
  window.__GC__ = {
    viewmodel() {
      const scene = D.sampleSceneGraph();
      let root = null;
      scene.traverse((n) => { if (n.name === 'original-weapon-view') root = n; });
      if (!root) return null;
      root.updateMatrixWorld(true);
      const skip = /muzzle-flash|muzzle-smoke|pooled|viewmodel-fill|light|reticle/i;
      let min = [Infinity, Infinity, Infinity]; let max = [-Infinity, -Infinity, -Infinity];
      let meshes = 0;
      const sockets = {};
      root.traverse((n) => {
        if (/socket/i.test(n.name)) sockets[n.name] = worldPos(n);
        if (!n.isMesh || !n.visible) return;
        if (skip.test(n.name)) return;
        let anc = n.parent; let skipped = false;
        while (anc && anc !== root) { if (skip.test(anc.name)) { skipped = true; break; } anc = anc.parent; }
        if (skipped) return;
        const g = n.geometry; if (!g) return;
        if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox; if (!bb) return;
        const e = n.matrixWorld.elements;
        for (let i = 0; i < 8; i += 1) {
          const x = (i & 1) ? bb.max.x : bb.min.x;
          const y = (i & 2) ? bb.max.y : bb.min.y;
          const z = (i & 4) ? bb.max.z : bb.min.z;
          const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
          const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
          const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
          if (wx < min[0]) min[0] = wx; if (wx > max[0]) max[0] = wx;
          if (wy < min[1]) min[1] = wy; if (wy > max[1]) max[1] = wy;
          if (wz < min[2]) min[2] = wz; if (wz > max[2]) max[2] = wz;
        }
        meshes += 1;
      });
      return {
        meshes,
        rootLocal: [root.position.x, root.position.y, root.position.z],
        rootScale: root.scale.x,
        rootRot: [root.rotation.x, root.rotation.y, root.rotation.z],
        rootWorld: worldPos(root),
        worldMin: min, worldMax: max,
        sockets,
        layerMask: root.layers.mask,
      };
    },
    // Distance from camera along the camera forward axis to a world point.
    measure() {
      const snap = D.snapshot();
      const diag = D.sampleFireAdmissionDiagnostics();
      const vm = window.__GC__.viewmodel();
      const eye = diag.position;
      const yaw = diag.yawRadians; const pitch = diag.pitchRadians;
      // camera forward for YXZ euler (pitch,yaw,0), looking down -Z
      const fwd = [
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      ];
      const proj = (p) => (p[0] - eye[0]) * fwd[0] + (p[1] - eye[1]) * fwd[1] + (p[2] - eye[2]) * fwd[2];
      const muzzle = vm && (vm.sockets['muzzle-socket'] ?? null);
      // furthest forward point of the viewmodel AABB along camera forward
      let vmForwardMax = null;
      if (vm && Number.isFinite(vm.worldMin[0])) {
        vmForwardMax = -Infinity;
        for (let i = 0; i < 8; i += 1) {
          const p = [
            (i & 1) ? vm.worldMax[0] : vm.worldMin[0],
            (i & 2) ? vm.worldMax[1] : vm.worldMin[1],
            (i & 4) ? vm.worldMax[2] : vm.worldMin[2],
          ];
          vmForwardMax = Math.max(vmForwardMax, proj(p));
        }
      }
      return {
        weapon: diag.weapon,
        stance: diag.stance,
        eye,
        yaw, pitch,
        grounded: snap.player?.grounded ?? null,
        forward: fwd,
        retreat: diag.retreat,
        probeLengthMeters: diag.probeLengthMeters,
        fullStowDistanceMeters: diag.fullStowDistanceMeters,
        probePaddingMeters: diag.probePaddingMeters,
        nearestForwardMeters: diag.nearestForwardMeters,
        nearestColliderBounds: diag.nearestColliderBounds,
        probes: diag.probes,
        fireAdmission: diag.fireAdmission,
        adsProgress: diag.adsProgress,
        vm,
        muzzleWorld: muzzle,
        muzzleForwardMeters: muzzle ? proj(muzzle) : null,
        vmForwardMaxMeters: vmForwardMax,
      };
    },
  };
});

async function measure() { return page.evaluate(() => window.__GC__.measure()); }
async function frames(n = 30) {
  await page.evaluate((count) => new Promise((res) => {
    let i = 0;
    const step = () => { i += 1; if (i >= count) res(null); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), n);
}

const spawn = await measure();
console.log('SPAWN', JSON.stringify({ eye: spawn.eye, weapon: spawn.weapon, vmRoot: spawn.vm?.rootLocal, vmScale: spawn.vm?.rootScale, vmMeshes: spawn.vm?.meshes, layerMask: spawn.vm?.layerMask, muzzleFwd: spawn.muzzleForwardMeters, vmFwdMax: spawn.vmForwardMaxMeters, sockets: Object.keys(spawn.vm?.sockets ?? {}) }, null, 1));

// Walk in 16 directions from spawn, find blocking contacts.
async function walk(yaw, ms = 2600) {
  const s = await measure();
  await page.evaluate((y) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(...window.__GC_SPAWN__, y, 0), yaw);
  await page.keyboard.down('KeyW');
  const t0 = Date.now();
  let last = null; let stalls = 0;
  while (Date.now() - t0 < ms) {
    await frames(8);
    const m = await measure();
    if (last) {
      const d = Math.hypot(m.eye[0] - last[0], m.eye[2] - last[2]);
      if (d < 0.01) stalls += 1; else stalls = 0;
      if (stalls >= 4) break;
    }
    last = m.eye;
  }
  await page.keyboard.up('KeyW');
  await frames(45);
  return measure();
}

await page.evaluate((p) => { window.__GC_SPAWN__ = p; }, spawn.eye);
const results = [];
for (let i = 0; i < 16; i += 1) {
  const yaw = (i / 16) * Math.PI * 2;
  const m = await walk(yaw);
  results.push({ yaw: Number(yaw.toFixed(3)), eye: m.eye.map((v) => Number(v.toFixed(3))), retreat: m.retreat, nearest: m.nearestForwardMeters, box: m.nearestColliderBounds, muzzleFwd: m.muzzleForwardMeters, vmFwdMax: m.vmForwardMaxMeters });
  console.log('WALK', i, JSON.stringify(results.at(-1)));
}
writeFileSync(`${OUT}/explore-${ARENA}.json`, JSON.stringify({ spawn, results }, null, 2));
await close();
