// DIAGNOSIS ONLY - gun clipping pass 2026-08-31. Writes only under docs/assets/.
// Is the viewmodel drawn at all when hugging a wall, and where does its
// geometry land in screen space? Captures: open baseline, wall contact, and
// wall contact with all world geometry hidden (viewmodel-only frame).
import { launchSoloMatch } from '../../../../scripts/qa/lib/launch-match.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/').replace(/\/$/, '');
const OUT = 'docs/assets/gun-clipping-2026-08-31';
mkdirSync(OUT, { recursive: true });
const { page, close } = await launchSoloMatch({ arena: 'atomic-acres', baseUrl: BASE, viewport: { width: 1280, height: 720 } });

await page.evaluate(() => {
  const D = window.__ATOMIC_ACRES_DEBUG__;
  const chainVisible = (n, root) => { let a = n; while (a && a !== root) { if (!a.visible) return false; a = a.parent; } return true; };
  window.__GC3__ = {
    hiddenWorld: [],
    parts() {
      const scene = D.sampleSceneGraph();
      let root = null; let cam = null;
      scene.traverse((n) => {
        if (n.name === 'original-weapon-view') root = n;
        if (n.isPerspectiveCamera && !cam) cam = n;
      });
      const inv = cam.matrixWorldInverse.elements;
      const proj = cam.projectionMatrix.elements;
      const toCam = (x, y, z) => [
        inv[0] * x + inv[4] * y + inv[8] * z + inv[12],
        inv[1] * x + inv[5] * y + inv[9] * z + inv[13],
        inv[2] * x + inv[6] * y + inv[10] * z + inv[14],
      ];
      const toScreen = (c) => {
        const w = -c[2];
        if (w <= 0) return null;
        const ndcX = (proj[0] * c[0]) / w;
        const ndcY = (proj[5] * c[1]) / w;
        return [(ndcX * 0.5 + 0.5) * 1280, (0.5 - ndcY * 0.5) * 720];
      };
      const skip = /muzzle-flash|smoke|flash-burst|fill|light|reticle/i;
      const out = [];
      root.traverse((n) => {
        if (!n.isMesh || skip.test(n.name)) return;
        const vis = chainVisible(n, root) && root.visible;
        if (!vis) return;
        const g = n.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        if (!g.boundingSphere) g.computeBoundingSphere();
        const bb = g.boundingBox;
        const e = n.matrixWorld.elements;
        const cmin = [1e9, 1e9, 1e9]; const cmax = [-1e9, -1e9, -1e9];
        const sx = []; const sy = [];
        for (let i = 0; i < 8; i += 1) {
          const x = (i & 1) ? bb.max.x : bb.min.x;
          const y = (i & 2) ? bb.max.y : bb.min.y;
          const z = (i & 4) ? bb.max.z : bb.min.z;
          const c = toCam(
            e[0] * x + e[4] * y + e[8] * z + e[12],
            e[1] * x + e[5] * y + e[9] * z + e[13],
            e[2] * x + e[6] * y + e[10] * z + e[14],
          );
          for (let k = 0; k < 3; k += 1) { if (c[k] < cmin[k]) cmin[k] = c[k]; if (c[k] > cmax[k]) cmax[k] = c[k]; }
          const s = toScreen(c);
          if (s) { sx.push(s[0]); sy.push(s[1]); }
        }
        out.push({
          name: n.name,
          frustumCulled: n.frustumCulled,
          layerMask: n.layers.mask,
          renderOrder: n.renderOrder,
          material: Array.isArray(n.material) ? n.material.map((m) => m.name || m.type).join('|') : (n.material?.name || n.material?.type),
          depthTest: Array.isArray(n.material) ? null : n.material?.depthTest,
          opacity: Array.isArray(n.material) ? null : n.material?.opacity,
          visibleTris: g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3,
          camMin: cmin, camMax: cmax,
          screenX: sx.length ? [Math.min(...sx), Math.max(...sx)] : null,
          screenY: sy.length ? [Math.min(...sy), Math.max(...sy)] : null,
          boundingSphereRadius: g.boundingSphere?.radius ?? null,
        });
      });
      return { cameraFov: cam.fov, cameraNear: cam.near, parts: out, diag: D.sampleFireAdmissionDiagnostics() };
    },
    hideWorld(hide) {
      const scene = D.sampleSceneGraph();
      if (hide) {
        window.__GC3__.hiddenWorld = [];
        for (const child of scene.children) {
          if (child.isCamera) continue;
          if (child.visible) { window.__GC3__.hiddenWorld.push(child); child.visible = false; }
        }
      } else {
        for (const c of window.__GC3__.hiddenWorld) c.visible = true;
        window.__GC3__.hiddenWorld = [];
      }
      return window.__GC3__.hiddenWorld.length;
    },
  };
});

const frames = (n = 30) => page.evaluate((count) => new Promise((res) => {
  let i = 0; const step = () => { i += 1; if (i >= count) res(null); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);

const report = {};
async function shoot(name) { await page.screenshot({ path: `${OUT}/${name}.png` }); }

await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('carbine'));
await frames(60);

// A: open ground baseline, pitch 0
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(-27, 1.7, 20, 4.712, 0));
await frames(60);
report.openBaseline = await page.evaluate(() => window.__GC3__.parts());
await shoot('isolate-A-open-baseline');

// B: hard contact with the wooden post
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(-34.5, 1.7, 14, 0, 0));
await frames(10);
await page.keyboard.down('KeyW');
await frames(150);
report.postContact = await page.evaluate(() => window.__GC3__.parts());
await shoot('isolate-B-post-contact');

// C: same frame, world geometry hidden -> viewmodel only
const hidden = await page.evaluate(() => window.__GC3__.hideWorld(true));
await frames(4);
await shoot('isolate-C-post-contact-viewmodel-only');
await page.evaluate(() => window.__GC3__.hideWorld(false));
await frames(4);
await page.keyboard.up('KeyW');
report.hiddenRoots = hidden;

// D: open ground, world hidden -> viewmodel only baseline
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(-27, 1.7, 20, 4.712, 0));
await frames(60);
await page.evaluate(() => window.__GC3__.hideWorld(true));
await frames(4);
await shoot('isolate-D-open-viewmodel-only');
await page.evaluate(() => window.__GC3__.hideWorld(false));
await frames(4);

writeFileSync(`${OUT}/isolate.json`, JSON.stringify(report, null, 2));
for (const [key, val] of Object.entries(report)) {
  if (!val || !val.parts) continue;
  console.log('===', key, 'retreat', val.diag.retreat, 'nearest', val.diag.nearestForwardMeters);
  for (const p of val.parts) {
    console.log(' ', p.name.slice(0, 34).padEnd(34),
      'camZ', p.camMin[2].toFixed(2), p.camMax[2].toFixed(2),
      'sx', p.screenX ? `${p.screenX[0].toFixed(0)}..${p.screenX[1].toFixed(0)}` : 'behind',
      'sy', p.screenY ? `${p.screenY[0].toFixed(0)}..${p.screenY[1].toFixed(0)}` : 'behind',
      'cull', p.frustumCulled, 'layer', p.layerMask, 'depthTest', p.depthTest, 'tris', Math.round(p.visibleTris));
  }
}
await close();
