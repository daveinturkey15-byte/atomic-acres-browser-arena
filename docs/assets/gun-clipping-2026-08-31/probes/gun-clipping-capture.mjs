// DIAGNOSIS ONLY - gun clipping pass 2026-08-31. Writes only under docs/assets/.
import { launchSoloMatch } from '../../../../scripts/qa/lib/launch-match.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/').replace(/\/$/, '');
const ARENA = process.env.PROBE_ARENA ?? 'atomic-acres';
const OUT = 'docs/assets/gun-clipping-2026-08-31';
mkdirSync(OUT, { recursive: true });

const { page, close } = await launchSoloMatch({ arena: ARENA, baseUrl: BASE, viewport: { width: 1280, height: 720 } });

await page.evaluate(() => {
  const D = window.__ATOMIC_ACRES_DEBUG__;
  const worldPos = (o) => { const m = o.matrixWorld.elements; return [m[12], m[13], m[14]]; };
  const chainVisible = (n, root) => { let a = n; while (a && a !== root) { if (!a.visible) return false; a = a.parent; } return true; };
  window.__GC__ = {
    viewmodel() {
      const scene = D.sampleSceneGraph();
      let root = null;
      scene.traverse((n) => { if (n.name === 'original-weapon-view') root = n; });
      if (!root) return null;
      const skip = /muzzle-flash|smoke|flash-burst|fill|light|reticle/i;
      const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
      let meshes = 0; const sockets = {}; const parts = [];
      root.traverse((n) => {
        if (!chainVisible(n, root) || !root.visible) return;
        if (/socket/i.test(n.name)) sockets[n.name] = worldPos(n);
        if (!n.isMesh) return;
        if (skip.test(n.name)) return;
        let anc = n.parent; let bad = false;
        while (anc && anc !== root) { if (skip.test(anc.name)) { bad = true; break; } anc = anc.parent; }
        if (bad) return;
        const g = n.geometry; if (!g) return;
        if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox; if (!bb) return;
        const e = n.matrixWorld.elements;
        const lmin = [Infinity, Infinity, Infinity]; const lmax = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < 8; i += 1) {
          const x = (i & 1) ? bb.max.x : bb.min.x;
          const y = (i & 2) ? bb.max.y : bb.min.y;
          const z = (i & 4) ? bb.max.z : bb.min.z;
          const w = [
            e[0] * x + e[4] * y + e[8] * z + e[12],
            e[1] * x + e[5] * y + e[9] * z + e[13],
            e[2] * x + e[6] * y + e[10] * z + e[14],
          ];
          for (let k = 0; k < 3; k += 1) {
            if (w[k] < min[k]) min[k] = w[k];
            if (w[k] > max[k]) max[k] = w[k];
            if (w[k] < lmin[k]) lmin[k] = w[k];
            if (w[k] > lmax[k]) lmax[k] = w[k];
          }
        }
        meshes += 1;
        parts.push({ name: n.name, min: lmin, max: lmax });
      });
      return { meshes, rootLocal: [root.position.x, root.position.y, root.position.z], rootScale: root.scale.x,
        rootRot: [root.rotation.x, root.rotation.y, root.rotation.z], worldMin: min, worldMax: max, sockets, parts,
        layerMask: root.layers.mask, rootVisible: root.visible };
    },
    measure(includeParts = false) {
      const D2 = window.__ATOMIC_ACRES_DEBUG__;
      const diag = D2.sampleFireAdmissionDiagnostics();
      const vm = window.__GC__.viewmodel();
      const eye = diag.position;
      const yaw = diag.yawRadians; const pitch = diag.pitchRadians;
      const fwd = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
      const proj = (p) => (p[0] - eye[0]) * fwd[0] + (p[1] - eye[1]) * fwd[1] + (p[2] - eye[2]) * fwd[2];
      const muzzle = vm ? (vm.sockets['muzzle-socket'] ?? null) : null;
      let vmForwardMax = null; let vmForwardPoint = null; let lowestY = null;
      if (vm && Number.isFinite(vm.worldMin[0])) {
        vmForwardMax = -Infinity;
        for (let i = 0; i < 8; i += 1) {
          const p = [(i & 1) ? vm.worldMax[0] : vm.worldMin[0], (i & 2) ? vm.worldMax[1] : vm.worldMin[1], (i & 4) ? vm.worldMax[2] : vm.worldMin[2]];
          const d = proj(p);
          if (d > vmForwardMax) { vmForwardMax = d; vmForwardPoint = p; }
        }
        lowestY = vm.worldMin[1];
      }
      let deepest = null;
      if (includeParts && vm) {
        for (const part of vm.parts) {
          let d = -Infinity;
          for (let i = 0; i < 8; i += 1) {
            const p = [(i & 1) ? part.max[0] : part.min[0], (i & 2) ? part.max[1] : part.min[1], (i & 4) ? part.max[2] : part.min[2]];
            d = Math.max(d, proj(p));
          }
          if (!deepest || d > deepest.forwardMeters) deepest = { name: part.name, forwardMeters: d };
        }
      }
      const box = diag.nearestColliderBounds;
      let overlap = null;
      if (box && vm && Number.isFinite(vm.worldMin[0])) {
        const ox = Math.min(vm.worldMax[0], box.maxX) - Math.max(vm.worldMin[0], box.minX);
        const oy = Math.min(vm.worldMax[1], box.maxY) - Math.max(vm.worldMin[1], box.minY);
        const oz = Math.min(vm.worldMax[2], box.maxZ) - Math.max(vm.worldMin[2], box.minZ);
        overlap = { x: ox, y: oy, z: oz, intersects: ox > 0 && oy > 0 && oz > 0 };
      }
      return {
        weapon: diag.weapon, stance: diag.stance, eye, yaw, pitch, forward: fwd,
        retreat: diag.retreat, probeLengthMeters: diag.probeLengthMeters,
        fullStowDistanceMeters: diag.fullStowDistanceMeters, probePaddingMeters: diag.probePaddingMeters,
        nearestForwardMeters: diag.nearestForwardMeters, nearestColliderBounds: box,
        probes: diag.probes, fireAdmission: diag.fireAdmission, adsProgress: diag.adsProgress,
        vmMeshes: vm ? vm.meshes : null, vmRootLocal: vm ? vm.rootLocal : null, vmRootScale: vm ? vm.rootScale : null,
        vmRootRot: vm ? vm.rootRot : null, vmWorldMin: vm ? vm.worldMin : null, vmWorldMax: vm ? vm.worldMax : null,
        vmLayerMask: vm ? vm.layerMask : null, deepestPart: deepest,
        muzzleWorld: muzzle, muzzleForwardMeters: muzzle ? proj(muzzle) : null,
        muzzleY: muzzle ? muzzle[1] : null,
        vmForwardMaxMeters: vmForwardMax, vmForwardPoint, vmLowestY: lowestY,
        colliderOverlap: overlap,
      };
    },
  };
});

const frames = (n = 30) => page.evaluate((count) => new Promise((res) => {
  let i = 0; const step = () => { i += 1; if (i >= count) res(null); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);
const measure = (parts = false) => page.evaluate((p) => window.__GC__.measure(p), parts);

async function pressInto(start, yaw, pitch, ms = 2200) {
  await page.evaluate((a) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(a[0], a[1], a[2], a[3], a[4]), [...start, yaw, pitch]);
  await frames(10);
  await page.keyboard.down('KeyW');
  const t0 = Date.now(); let last = null; let stalls = 0;
  while (Date.now() - t0 < ms) {
    await frames(6);
    const m = await measure();
    if (last) { const d = Math.hypot(m.eye[0] - last[0], m.eye[2] - last[2]); if (d < 0.008) stalls += 1; else stalls = 0; if (stalls >= 5) break; }
    last = m.eye;
  }
  await frames(60);
  const out = await measure(true);
  await page.keyboard.up('KeyW');
  return out;
}

const SITES = JSON.parse(process.env.PROBE_SITES);
const WEAPONS = (process.env.PROBE_WEAPONS ?? 'carbine,sniper,explosive-crossbow,flamethrower').split(',');
const STANCES = (process.env.PROBE_STANCES ?? 'stand,crouch,prone').split(',');
const rows = [];
for (const site of SITES) {
  for (const weapon of WEAPONS) {
    await page.evaluate((w) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon(w), weapon);
    await frames(50);
    for (const stance of STANCES) {
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStanceForQa('stand'));
      await frames(8);
      await page.evaluate((s) => window.__ATOMIC_ACRES_DEBUG__.setStanceForQa(s), stance);
      await frames(20);
      const m = await pressInto(site.start, site.yaw, site.pitch ?? 0, site.ms ?? 2200);
      const name = `${ARENA}-${site.id}-${weapon}-${stance}`;
      await page.screenshot({ path: `${OUT}/${name}.png` });
      const row = { arena: ARENA, site: site.id, siteLabel: site.label, weapon, stance, ...m, screenshot: `${name}.png` };
      rows.push(row);
      console.log('CASE', name, JSON.stringify({
        eye: m.eye.map((v) => +v.toFixed(3)), retreat: m.retreat, nearest: m.nearestForwardMeters,
        muzzleFwd: m.muzzleForwardMeters === null ? null : +m.muzzleForwardMeters.toFixed(3),
        vmFwdMax: m.vmForwardMaxMeters === null ? null : +m.vmForwardMaxMeters.toFixed(3),
        vmLowY: m.vmLowestY === null ? null : +m.vmLowestY.toFixed(3),
        overlap: m.colliderOverlap ? m.colliderOverlap.intersects : null,
        deepest: m.deepestPart ? `${m.deepestPart.name}@${m.deepestPart.forwardMeters.toFixed(2)}` : null,
        admission: m.fireAdmission ? (m.fireAdmission.reason ?? m.fireAdmission.admitted) : null,
      }));
    }
  }
}
writeFileSync(`${OUT}/measurements-${ARENA}.json`, JSON.stringify(rows, null, 2));
await close();
