// DIAGNOSIS ONLY - gun clipping pass 2026-08-31. Writes only under docs/assets/.
// How much of the arena's visible geometry can actually fold the viewmodel?
// Replays collectPresentationObstructionBoxes()'s exact filter over the roots
// legacy-main hands it, and contrasts that with everything on screen.
import { launchSoloMatch } from '../../../../scripts/qa/lib/launch-match.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/').replace(/\/$/, '');
const ARENA = process.env.PROBE_ARENA ?? 'atomic-acres';
const OUT = 'docs/assets/gun-clipping-2026-08-31';
mkdirSync(OUT, { recursive: true });
const { page, close } = await launchSoloMatch({ arena: ARENA, baseUrl: BASE, viewport: { width: 1280, height: 720 } });

const report = await page.evaluate(() => {
  const D = window.__ATOMIC_ACRES_DEBUG__;
  const scene = D.sampleSceneGraph();
  const named = {};
  scene.traverse((n) => { if (n.name) named[n.name] = (named[n.name] ?? 0) + 1; });
  const find = (name) => { let hit = null; scene.traverse((n) => { if (!hit && n.name === name) hit = n; }); return hit; };
  const life = find('pass31-neighbourhood-life');
  const dressing = find('test1-dressing') ?? find('test2-dressing');

  // Exact re-implementation of src/presentation-obstruction.ts's filter.
  const MIN_H = 1.05; const MIN_T = 0.16; const MAX = 420;
  function collect(roots) {
    const boxes = []; const rejected = { batched: 0, instanced: 0, short: 0, thin: 0, wide: 0, noGeom: 0 };
    for (const root of roots) {
      if (!root) continue;
      root.updateMatrixWorld(true);
      root.traverse((node) => {
        if (boxes.length >= MAX) return;
        if (!node.isMesh || !node.visible) return;
        if (node.userData.staticBatchRendered === true) { rejected.batched += 1; return; }
        if (node.isInstancedMesh) { rejected.instanced += 1; return; }
        const g = node.geometry; if (!g) { rejected.noGeom += 1; return; }
        if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox; if (!bb) { rejected.noGeom += 1; return; }
        // world AABB
        const e = node.matrixWorld.elements;
        const mn = [1e9, 1e9, 1e9]; const mx = [-1e9, -1e9, -1e9];
        for (let i = 0; i < 8; i += 1) {
          const x = (i & 1) ? bb.max.x : bb.min.x;
          const y = (i & 2) ? bb.max.y : bb.min.y;
          const z = (i & 4) ? bb.max.z : bb.min.z;
          const w = [
            e[0] * x + e[4] * y + e[8] * z + e[12],
            e[1] * x + e[5] * y + e[9] * z + e[13],
            e[2] * x + e[6] * y + e[10] * z + e[14],
          ];
          for (let k = 0; k < 3; k += 1) { if (w[k] < mn[k]) mn[k] = w[k]; if (w[k] > mx[k]) mx[k] = w[k]; }
        }
        const width = mx[0] - mn[0]; const height = mx[1] - mn[1]; const depth = mx[2] - mn[2];
        if (height < MIN_H) { rejected.short += 1; return; }
        if (Math.min(width, depth) < MIN_T) { rejected.thin += 1; return; }
        if (width > 12 || depth > 12) { rejected.wide += 1; return; }
        boxes.push({ name: node.name, min: mn, max: mx });
      });
    }
    return { boxes, rejected };
  }
  const result = collect([life, dressing]);

  // Everything actually drawn in the world layer, for contrast.
  let worldVisibleMeshes = 0; let worldBatchMeshes = 0;
  scene.traverse((n) => {
    if (!n.isMesh || !n.visible) return;
    if (n.layers.mask === 4 || n.layers.mask === 12) return; // viewmodel layer
    worldVisibleMeshes += 1;
    if (n.userData.staticBatchRendered === true) worldBatchMeshes += 1;
  });
  return {
    hasNeighbourhoodLifeRoot: Boolean(life),
    hasDressingRoot: Boolean(dressing),
    dressingBoxCount: result.boxes.length,
    dressingBoxNames: result.boxes.slice(0, 25).map((b) => b.name),
    rejected: result.rejected,
    worldVisibleMeshes,
    worldBatchMeshes,
    hasArenaArtRoot: Object.keys(named).some((n) => /arena-art|atomic.*art/i.test(n)),
    sampleRootNames: Object.keys(named).filter((n) => /dressing|life|art|arena|house|garage|bus|van|crate/i.test(n)).slice(0, 40),
  };
});
console.log(JSON.stringify(report, null, 2));
writeFileSync(`${OUT}/dressing-coverage-${ARENA}.json`, JSON.stringify(report, null, 2));
await close();
