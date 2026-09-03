/**
 * probe-map3-draw-settling.mjs - does the Map 3 HUD draw count settle?
 *
 * WHY THIS EXISTS. Lane AP quoted "+7 / +9 draw calls" from a single HUD sample
 * taken 5.5 s after the camera reached a pose. An independent reviewer re-ran
 * the same script at the same commit and read 123 draws where the lane read 132
 * - the pre-cell baseline value, WITH the cell present. Either the instrument is
 * noisy or the scene is not finished drawing when the sample is taken. This
 * probe answers that by holding one pose and reading the HUD repeatedly.
 *
 * It changes no shared instrument: capture-map3-views.mjs keeps its timings.
 *
 * Usage: node scripts/qa/probe-map3-draw-settling.mjs --port 4216 \
 *          --out docs/evidence/pass86/hf419/draw-settling-after.json \
 *          [--poses corridor-3-street-cell,corridor-3-street-kerbside] [--runs 2]
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const PORT = Number(opt('--port', '4216'));
const OUT = opt('--out', 'artifacts/draw-settling.json');
const RUNS = Number(opt('--runs', '1'));
const TOGGLE = opt('--toggle', '');
const PAIRS = Number(opt('--pairs', '40'));
const SAMPLE_MS = [500, 1000, 2000, 3000, 5500, 8000, 12000, 20000, 30000];

// Same pose maths as capture-map3-views.mjs, so the poses are the same points.
function pose(angle, dist, y, pitch, yawOffset = 0) {
  return { x: -dist * Math.sin(angle), y, z: -dist * Math.cos(angle), yaw: angle + yawOffset, pitch };
}
function local(angle, lx, lz, y, yaw, pitch) {
  const s = Math.sin(angle), c = Math.cos(angle), wz0 = lz - 18;
  return { x: lx * c + wz0 * s, y, z: -lx * s + wz0 * c, yaw: angle + yaw, pitch };
}
const A = (i) => (i * Math.PI) / 4;
const ALL = {
  'hub-overview': pose(A(0), 4, 1.7, -0.05),
  'corridor-3-grammar': pose(A(2), 20, 1.7, -0.05),
  'corridor-3-street-cell': local(A(2), -5.2, -53.5, 1.87, 0, -0.045),
  'corridor-3-street-kerbside': local(A(2), -2.4, -62.0, 1.42, -0.62, -0.10),
};
const POSES = (opt('--poses', 'corridor-3-street-cell,corridor-3-street-kerbside')).split(',').map((s) => s.trim());

function gpuFreeMiB() {
  try {
    const out = execSync('nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits', { encoding: 'utf8' }).trim().split('\n')[0];
    const [used, total] = out.split(',').map((s) => Number.parseInt(s, 10));
    return total - used;
  } catch { return null; }
}
async function waitForGpu() {
  for (let a = 0; a < 10; a++) {
    const f = gpuFreeMiB();
    if (f === null || f >= 3000) return f;
    console.log(`[settle] only ${f} MiB free; waiting 60 s (${a + 1}/10)`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error('GPU never had 3000 MiB free; not launching Chrome on a shared machine');
}

const parseHud = (s) => {
  const d = /(\d+)\s+draws/.exec(s ?? '');
  const t = /(\d+)k\s+tris/.exec(s ?? '');
  return { draws: d ? Number(d[1]) : null, trisK: t ? Number(t[1]) : null };
};

function summarise(paired) {
  if (!paired.found) return { found: false };
  const d = paired.samples.map((s) => s.dDraws).filter((v) => Number.isFinite(v));
  const t = paired.samples.map((s) => s.dTris).filter((v) => Number.isFinite(v));
  const mode = (a) => {
    const c = new Map();
    a.forEach((v) => c.set(v, (c.get(v) ?? 0) + 1));
    return [...c.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  };
  return {
    found: true, n: d.length,
    dDrawsMin: Math.min(...d), dDrawsMax: Math.max(...d), dDrawsMode: mode(d),
    dTrisMin: Math.min(...t), dTrisMax: Math.max(...t), dTrisMode: mode(t),
    samples: paired.samples,
  };
}

async function main() {
  const free = await waitForGpu();
  console.log(`[settle] GPU free: ${free} MiB; launching headless Chrome (WebGPU)`);
  const result = { port: PORT, sampleMs: SAMPLE_MS, runs: [] };
  for (let run = 0; run < RUNS; run++) {
    const browser = await chromium.launch({
      channel: 'chrome', headless: true,
      args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
        '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
    });
    const entry = { run: run + 1, startedAt: new Date().toISOString(), poses: {} };
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
      await page.goto(`http://localhost:${PORT}/map3.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.__MAP3 !== 'undefined', { timeout: 60_000 });
      await page.waitForTimeout(4000);
      const readHud = () => page.evaluate(() => {
        const h = document.getElementById('hud');
        return h ? h.textContent.split('|')[0].trim() : null;
      });
      for (const name of POSES) {
        const p = ALL[name];
        if (!p) throw new Error(`unknown pose ${name}`);
        await page.evaluate((v) => window.__MAP3.setPose(v.x, v.y, v.z, v.yaw, v.pitch), p);
        const series = [];
        let prev = 0;
        for (const ms of SAMPLE_MS) {
          await page.waitForTimeout(ms - prev);
          prev = ms;
          series.push({ tMs: ms, ...parseHud(await readHud()) });
        }
        const measurePaired = async (forceCastShadow) => page.evaluate(async ({ objName, pairs, forceCastShadow }) => {
          const obj = window.__MAP3.scene.getObjectByName(objName);
          if (!obj) return { found: false, samples: [] };
          const renderer = window.__MAP3.renderer;
          const frames = (n) => new Promise((res) => {
            let k = 0;
            const step = () => { if (++k >= n) res(); else requestAnimationFrame(step); };
            requestAnimationFrame(step);
          });
          const read = () => {
            const i = renderer.info?.render ?? {};
            return { draws: i.drawCalls ?? i.calls ?? null, tris: i.triangles ?? null };
          };
          const samples = [];
          const wasVisible = obj.visible;
          const restore = [];
          if (forceCastShadow) {
            obj.traverse((o) => { if (o.isMesh || o.isInstancedMesh) { restore.push([o, o.castShadow]); o.castShadow = true; } });
          }
          for (let i = 0; i < pairs; i++) {
            obj.visible = false;
            await frames(3);
            const off = read();
            obj.visible = true;
            await frames(3);
            const on = read();
            samples.push({ offDraws: off.draws, onDraws: on.draws, dDraws: on.draws - off.draws,
                           offTris: off.tris, onTris: on.tris, dTris: on.tris - off.tris });
          }
          obj.visible = wasVisible;
          restore.forEach(([o, v]) => { o.castShadow = v; });
          return { found: true, samples };
        }, { objName: TOGGLE, pairs: PAIRS, forceCastShadow });

        // Two paired experiments in the same session, ~17 ms per pair:
        //   as-shipped (castShadow off, which is what the cell ships with), and
        //   castShadow forced on, which is what the same cell would cost inside
        //   an arena whose shadow camera actually covers it. The difference
        //   between the two deltas IS the shadow-pass cost, measured rather
        //   than inferred from a wandering single-sample HUD read.
        const paired = TOGGLE ? await measurePaired(false) : null;
        const pairedShadow = TOGGLE ? await measurePaired(true) : null;

        // WHY the castShadow variant costs draws at one pose block and not at
        // another: Map 3's sun ORBITS (main.ts drives it from the sky each
        // frame) and its shadow camera is a +-34 box about the world origin
        // oriented along the light, near 1 / far 190. An object 70-92 m out is
        // outside that box when the sun is across it and inside it when the sun
        // is along it, so shadow-pass cost depends on the time of day, not on
        // where the player stands. This records the sun vector and how many of
        // the cell's meshes are actually inside the shadow volume right now, by
        // projecting each into the shadow camera's clip space.
        const shadowVolume = TOGGLE ? await page.evaluate((objName) => {
          const { sun, scene } = window.__MAP3;
          const obj = scene.getObjectByName(objName);
          if (!obj || !sun?.shadow?.camera) return null;
          const cam = sun.shadow.camera;
          cam.updateMatrixWorld();
          const m = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
          let meshes = 0;
          let inside = 0;
          obj.traverse((o) => {
            if (!(o.isMesh || o.isInstancedMesh)) return;
            meshes++;
            // The cell's meshes all sit at the group origin with their extent
            // baked into the geometry, so a world POSITION says nothing about
            // where they are - the bounding box has to be transformed instead.
            const g = o.geometry;
            if (!g.boundingBox) g.computeBoundingBox();
            const bb = g.boundingBox;
            const corner = sun.position.clone();
            let anyIn = false;
            for (let c = 0; c < 8; c++) {
              corner.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z);
              corner.applyMatrix4(o.matrixWorld).applyMatrix4(m);
              if (Math.abs(corner.x) <= 1 && Math.abs(corner.y) <= 1 && corner.z >= -1 && corner.z <= 1) anyIn = true;
            }
            if (anyIn) inside++;
          });
          return {
            sunPosition: { x: +sun.position.x.toFixed(2), y: +sun.position.y.toFixed(2), z: +sun.position.z.toFixed(2) },
            orthoHalfExtent: cam.right,
            cellMeshes: meshes,
            cellMeshesInsideShadowVolume: inside,
          };
        }, TOGGLE) : null;
        entry.poses[name] = {
          series,
          paired: paired ? summarise(paired) : null,
          castShadowVariant: pairedShadow ? summarise(pairedShadow) : null,
          shadowVolume,
        };
        console.log(`[settle] run ${run + 1} ${name} HOLD: ${series.map((s) => `${s.tMs}ms=${s.draws}`).join(' ')}`);
        if (paired) {
          const p = entry.poses[name].paired;
          const sv = entry.poses[name].castShadowVariant;
          console.log(`[settle] run ${run + 1} ${name} TOGGLE ${TOGGLE}: ${p.found ? `dDraws ${p.dDrawsMin}..${p.dDrawsMax} (mode ${p.dDrawsMode}, n=${p.n}) · dTris ${p.dTrisMode}` : 'OBJECT NOT FOUND'}`);
          if (sv?.found) console.log(`[settle] run ${run + 1} ${name} TOGGLE castShadow=on: dDraws ${sv.dDrawsMin}..${sv.dDrawsMax} (mode ${sv.dDrawsMode}, n=${sv.n})`);
          if (shadowVolume) console.log(`[settle] run ${run + 1} ${name} shadow volume: ${shadowVolume.cellMeshesInsideShadowVolume}/${shadowVolume.cellMeshes} cell meshes inside (+-${shadowVolume.orthoHalfExtent} box, sun ${JSON.stringify(shadowVolume.sunPosition)})`);
        }
      }
    } finally { await browser.close(); }
    result.runs.push(entry);
  }
  mkdirSync(dirname(resolve(OUT)), { recursive: true });
  writeFileSync(resolve(OUT), JSON.stringify(result, null, 2));
  console.log(`[settle] wrote ${resolve(OUT)}`);
}
main().catch((e) => { console.error('[settle] Error:', e); process.exit(1); });
