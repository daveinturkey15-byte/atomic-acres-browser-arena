/**
 * measure-hf421-station-bay-readability.mjs — HF-421 pass/fail bar 4.
 *
 * THE QUESTION. A corridor that grades beautifully and hides an enemy is a
 * regression, and it will be found in play, not in a pretty capture. So the
 * dark-interior look is only admitted if a human-sized matte body at
 * engagement distance keeps at least the luminance separation from its local
 * background that it had before the look was applied.
 *
 * WHY IT IS ONE RUN AND NOT TWO BUILDS. The corridor animates: the sun moves
 * nothing but two stone spheres patrol the aisle, 180 motes drift, and (after)
 * a service tram runs the bay. Comparing two builds captured minutes apart
 * would be comparing two different frames of a moving scene and calling the
 * difference "the look". Instead the kit carries a query flag: `?probe=1&bay=0`
 * builds the readability probes with the dressing switched OFF, `?probe=1`
 * builds the same probes with it ON. Same build, same browser, same pose, same
 * warm-up. The only variable is the thing under test.
 *
 * THE METRIC, stated so it can be argued with:
 *   - the three probes are 0.58 x 1.8 x 0.36 m matte 18% grey bodies standing
 *     at corridor-local z = -15, x = -2.4 / 0 / +2.4;
 *   - the camera stands at corridor-local z = 0, eye 1.7 m, looking straight
 *     down the corridor, so each probe is ~15 m away (reported, not assumed);
 *   - each probe's screen rectangle is PROJECTED from its own bounding box
 *     through the live camera, never eyeballed;
 *   - SILHOUETTE = the inner 56% x 70% of that rectangle (all body, no rim);
 *   - LOCAL BACKGROUND = the annulus from 1.08x to 1.55x the rectangle;
 *   - SEPARATION = |median luminance(silhouette) - median luminance(background)|
 *     on Rec.709 luma over the sRGB bytes the player actually sees.
 *
 * Machine rules: headless only, ComfyUI queue must be idle, >= 3000 MiB free
 * VRAM before Chrome, one browser at a time.
 *
 * Usage:
 *   node scripts/qa/measure-hf421-station-bay-readability.mjs \
 *     --port 4221 --out artifacts/hf421/readability
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const PORT = Number(opt('--port', '4221'));
const OUT = opt('--out', 'artifacts/hf421/readability');
const WIDTH = Number(opt('--width', '2560'));
const HEIGHT = Number(opt('--height', '1440'));
/**
 * HOW MANY FRAMES EACH CASE IS MEASURED OVER, AND WHY IT IS NOT ONE.
 *
 * The kit's one exposure moment is a service tram that runs the bay on an
 * 11.0 s loop carrying a 52-intensity point light. A SINGLE frame therefore
 * measures wherever the tram happened to be, and it moves the answer a long
 * way: two back-to-back runs of the one-frame version of this harness returned
 * after-medians of 7.353 and 15.575 for the same build and the same pose, and
 * one probe read 0.417 in one run and 8.358 in the other. That is not a
 * measurement, it is a sample of a moving light.
 *
 * So each case is swept over `--frames` screenshots spaced `--interval-ms`
 * apart, covering more than one full tram period, and each probe reports its
 * MINIMUM separation across the sweep as well as the median. The minimum is
 * the number the readability bar is judged on: a silhouette has to stay
 * readable at the worst moment of the loop, not the best.
 */
const FRAMES = Number(opt('--frames', '15'));
const INTERVAL_MS = Number(opt('--interval-ms', '850'));

/** Corridor 6 sits on spoke 5; its group origin is 18 m from the hub. */
const ANGLE = (5 * Math.PI) / 4;
/** Corridor-local (0, 1.7, 0) looking down local -z: the corridor mouth. */
function mouthPose() {
  const sinA = Math.sin(ANGLE);
  const cosA = Math.cos(ANGLE);
  const wz0 = 0 - 18;
  return { x: wz0 * sinA, y: 1.7, z: wz0 * cosA, yaw: ANGLE, pitch: 0.0 };
}

function gpuFreeMiB() {
  try {
    const out = execSync('nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader', { encoding: 'utf8' });
    const [used, total] = out.split(',').map((s) => Number.parseInt(s, 10));
    return total - used;
  } catch {
    return null;
  }
}

async function comfyIdle() {
  try {
    const res = await fetch(`http://127.0.0.1:8188/queue`, { signal: AbortSignal.timeout(5000) });
    const q = await res.json();
    return (q.queue_running?.length ?? 0) === 0 && (q.queue_pending?.length ?? 0) === 0;
  } catch {
    // No ComfyUI answering is not the same as ComfyUI busy.
    return true;
  }
}

async function waitForGpu() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const free = gpuFreeMiB();
    if (free === null || free >= 3000) return free;
    console.log(`[hf421] only ${free} MiB free; waiting 60 s (${attempt + 1}/10)`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error('GPU never had 3000 MiB free; not launching Chrome on a shared machine');
}

const median = (xs) => {
  if (xs.length === 0) return null;
  const s = Float64Array.from(xs).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (xs, p) => {
  if (xs.length === 0) return null;
  const s = Float64Array.from(xs).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
};

/** Rec.709 luma over the sRGB bytes, 0..255. */
function lumaAt(data, ch, w, x, y) {
  const i = (y * w + x) * ch;
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
}

function measureRect(data, ch, w, h, rect) {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const hw = (rect.x1 - rect.x0) / 2;
  const hh = (rect.y1 - rect.y0) / 2;
  const inner = [];
  const ring = [];
  const bx0 = Math.max(0, Math.floor(cx - hw * 1.55));
  const bx1 = Math.min(w - 1, Math.ceil(cx + hw * 1.55));
  const by0 = Math.max(0, Math.floor(cy - hh * 1.55));
  const by1 = Math.min(h - 1, Math.ceil(cy + hh * 1.55));
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const dx = Math.abs(x - cx) / hw;
      const dy = Math.abs(y - cy) / hh;
      const l = lumaAt(data, ch, w, x, y);
      if (dx <= 0.56 && dy <= 0.70) inner.push(l);
      else if (Math.max(dx, dy) >= 1.08 && Math.max(dx, dy) <= 1.55) ring.push(l);
    }
  }
  const mi = median(inner);
  const mr = median(ring);
  return {
    silhouettePixels: inner.length,
    backgroundPixels: ring.length,
    silhouetteMedianLuma: mi === null ? null : Number(mi.toFixed(3)),
    backgroundMedianLuma: mr === null ? null : Number(mr.toFixed(3)),
    separation: mi === null || mr === null ? null : Number(Math.abs(mi - mr).toFixed(3)),
  };
}

async function runCase(page, label, query, pose) {
  const url = `http://localhost:${PORT}/map3.html${query}`;
  console.log(`[hf421] ${label}: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__MAP3 !== 'undefined', { timeout: 60_000 });
  await page.waitForTimeout(4500);
  await page.evaluate((p) => { window.__MAP3.setPose(p.x, p.y, p.z, p.yaw, p.pitch); }, pose);
  // Pipelines for a new view settle inside 2.5 s in the sibling harness; 4 s
  // here because the kit's four materials compile on first sight of the bay.
  await page.waitForTimeout(4000);

  // Frame time, sampled from the page's own rAF rather than an fps counter.
  const frames = await page.evaluate(async () => {
    const deltas = [];
    let last = performance.now();
    const until = last + 3000;
    await new Promise((done) => {
      const tick = (t) => {
        deltas.push(t - last);
        last = t;
        if (t < until) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    return deltas.slice(2);
  });

  const geom = await page.evaluate(() => {
    const cam = window.__MAP3.camera;
    const tmp = cam.position.clone();
    const probes = [];
    window.__MAP3.scene.traverse((o) => {
      if (o.name === 'map3-station-bay-readability-probe') probes.push(o);
    });
    const w = window.innerWidth;
    const h = window.innerHeight;
    const rects = probes.map((o) => {
      o.updateWorldMatrix(true, false);
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const sx of [bb.min.x, bb.max.x]) {
        for (const sy of [bb.min.y, bb.max.y]) {
          for (const sz of [bb.min.z, bb.max.z]) {
            tmp.set(sx, sy, sz).applyMatrix4(o.matrixWorld).project(cam);
            const px = (tmp.x * 0.5 + 0.5) * w;
            const py = (-tmp.y * 0.5 + 0.5) * h;
            x0 = Math.min(x0, px); x1 = Math.max(x1, px);
            y0 = Math.min(y0, py); y1 = Math.max(y1, py);
          }
        }
      }
      const centre = cam.position.clone();
      o.getWorldPosition(centre);
      return {
        x0, y0, x1, y1,
        distanceM: Number(cam.position.distanceTo(centre).toFixed(2)),
      };
    });
    const hud = document.getElementById('hud');
    return { rects, viewport: { w, h }, hud: hud ? hud.textContent.split('|')[0].trim() : null };
  });

  // The camera and the probes are both static, so the projected rectangles are
  // computed once and reused for every frame of the sweep.
  const names = ['left', 'centre', 'right'];
  const sweep = [];
  let imageInfo = null;
  let worstFrame = { index: -1, medianSeparation: Infinity, png: null };
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const png = await page.screenshot();
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    imageInfo = { width: info.width, height: info.height };
    const measured = geom.rects.map((r, i) => ({
      probe: names[i] ?? `probe-${i}`,
      distanceM: r.distanceM,
      rect: { x0: Math.round(r.x0), y0: Math.round(r.y0), x1: Math.round(r.x1), y1: Math.round(r.y1) },
      ...measureRect(data, info.channels, info.width, info.height, r),
    }));
    const med = median(measured.map((m) => m.separation).filter((v) => v !== null)) ?? Infinity;
    sweep.push({ frame, medianSeparation: Number(med.toFixed(3)), probes: measured });
    if (frame === 0) writeFileSync(resolve(OUT, `${label}.png`), png);
    if (med < worstFrame.medianSeparation) worstFrame = { index: frame, medianSeparation: Number(med.toFixed(3)), png };
    if (frame < FRAMES - 1) await page.waitForTimeout(INTERVAL_MS);
  }
  if (worstFrame.png) writeFileSync(resolve(OUT, `${label}-worst.png`), worstFrame.png);

  // Per probe, across the whole sweep: worst, median and best separation. The
  // bar is judged on `worst`; `median` is there so a single bad frame and a
  // uniformly bad case can be told apart.
  const probes = geom.rects.map((r, i) => {
    const series = sweep.map((f) => f.probes[i]).filter((m) => m && m.separation !== null);
    const seps = series.map((m) => m.separation);
    return {
      probe: names[i] ?? `probe-${i}`,
      distanceM: r.distanceM,
      rect: { x0: Math.round(r.x0), y0: Math.round(r.y0), x1: Math.round(r.x1), y1: Math.round(r.y1) },
      frames: seps.length,
      separationWorst: seps.length ? Number(Math.min(...seps).toFixed(3)) : null,
      separationMedian: seps.length ? Number(median(seps).toFixed(3)) : null,
      separationBest: seps.length ? Number(Math.max(...seps).toFixed(3)) : null,
      silhouetteMedianLuma: series.length ? Number(median(series.map((m) => m.silhouetteMedianLuma)).toFixed(3)) : null,
      backgroundMedianLuma: series.length ? Number(median(series.map((m) => m.backgroundMedianLuma)).toFixed(3)) : null,
      silhouettePixels: series.length ? series[0].silhouettePixels : 0,
      backgroundPixels: series.length ? series[0].backgroundPixels : 0,
    };
  });

  return {
    label,
    url,
    hud: geom.hud,
    viewport: geom.viewport,
    image: imageInfo,
    sweep: { frames: FRAMES, intervalMs: INTERVAL_MS, spanSeconds: Number(((FRAMES - 1) * INTERVAL_MS / 1000).toFixed(2)), worstFrameIndex: worstFrame.index },
    frameTimeMs: {
      samples: frames.length,
      p50: Number(pct(frames, 50).toFixed(3)),
      p95: Number(pct(frames, 95).toFixed(3)),
    },
    probes,
    perFrame: sweep.map((f) => ({ frame: f.frame, medianSeparation: f.medianSeparation, separations: f.probes.map((m) => m.separation) })),
    // The number the bar is judged on: the median probe at the WORST moment of
    // the tram loop, not the median of each probe's best moment.
    worstFrameMedianSeparation: Number(worstFrame.medianSeparation.toFixed(3)),
    medianSeparation: Number(median(probes.map((p) => p.separationMedian).filter((v) => v !== null)).toFixed(3)),
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (!(await comfyIdle())) {
    throw new Error('ComfyUI queue is not idle; every number from this run would be void');
  }
  const free = await waitForGpu();
  console.log(`[hf421] ComfyUI idle, GPU free ${free} MiB; launching headless Chrome at ${WIDTH}x${HEIGHT}`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
  const report = { generatedAt: new Date().toISOString(), port: PORT, viewport: { WIDTH, HEIGHT }, gpuFreeMiB: free, cases: {} };
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.context().newCDPSession(page).then((s) => s.send('Emulation.setFocusEmulationEnabled', { enabled: true })).catch(() => {});
    page.on('pageerror', (err) => console.error('[browser error]', err));
    const pose = mouthPose();
    report.pose = pose;
    report.cases.before = await runCase(page, 'before-bay-off', '?probe=1&bay=0', pose);
    report.cases.after = await runCase(page, 'after-bay-on', '?probe=1', pose);
  } finally {
    await browser.close();
  }

  const b = report.cases.before;
  const a = report.cases.after;
  // PER PROBE, WORST FRAME AGAINST WORST FRAME. The bar is "separation at 15 m
  // in the darkest authored view is >= the before value", and a median over
  // three probes hides a probe that went to zero, so every probe is compared
  // on its own and the verdict names the ones that regressed.
  const perProbe = b.probes.map((bp, i) => {
    const ap = a.probes[i];
    return {
      probe: bp.probe,
      worstBefore: bp.separationWorst,
      worstAfter: ap.separationWorst,
      worstDelta: Number((ap.separationWorst - bp.separationWorst).toFixed(3)),
      medianBefore: bp.separationMedian,
      medianAfter: ap.separationMedian,
      medianDelta: Number((ap.separationMedian - bp.separationMedian).toFixed(3)),
      regressedOnWorst: ap.separationWorst < bp.separationWorst,
    };
  });
  report.verdict = {
    perProbe,
    probesRegressedOnWorstFrame: perProbe.filter((p) => p.regressedOnWorst).map((p) => p.probe),
    separationBefore: b.medianSeparation,
    separationAfter: a.medianSeparation,
    separationDelta: Number((a.medianSeparation - b.medianSeparation).toFixed(3)),
    worstFrameSeparationBefore: b.worstFrameMedianSeparation,
    worstFrameSeparationAfter: a.worstFrameMedianSeparation,
    // Both halves have to hold: the median over the sweep must not fall, AND
    // no individual probe may be worse at its worst moment than it was before.
    readabilityHolds: a.medianSeparation >= b.medianSeparation
      && perProbe.every((p) => !p.regressedOnWorst),
    frameTimeP50Before: b.frameTimeMs.p50,
    frameTimeP50After: a.frameTimeMs.p50,
    frameTimeP95Before: b.frameTimeMs.p95,
    frameTimeP95After: a.frameTimeMs.p95,
    frameTimeWithin10Pct: a.frameTimeMs.p50 <= b.frameTimeMs.p50 * 1.1,
  };
  writeFileSync(resolve(OUT, 'readability.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.verdict, null, 2));
  console.log(`[hf421] wrote ${resolve(OUT, 'readability.json')}`);
}

main().catch((err) => {
  console.error('[hf421] Error:', err);
  process.exit(1);
});
