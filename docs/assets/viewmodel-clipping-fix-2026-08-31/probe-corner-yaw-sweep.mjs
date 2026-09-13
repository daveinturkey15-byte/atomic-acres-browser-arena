#!/usr/bin/env node
/**
 * A SECOND DEFECT AT `atomic-acres/corner`, isolated.
 *
 * After the cut was moved onto the view-axis crossing, the corner row reports
 * a pose byte-identical to `atomic-acres/flat-wall`, a plane at the same
 * 0.380 m, 58% of the rig's vertices camera-side of it and ~2800 of them
 * projecting inside the frustum. The flat-wall frame shows the folded carbine.
 * The corner frame shows nothing, at any contrast.
 *
 * That is not the cut and it is not the fold - both are the same numbers at
 * both sites. This sweeps the camera through a full turn from ONE position in
 * the corner and reports, per heading, the contact numbers and whether the
 * weapon's own pixels appear. If the weapon returns at some headings the fault
 * is orientation-dependent (how the plane, or the overlay, is resolved for a
 * camera that is not axis-aligned); if it never returns from that position the
 * fault is spatial and belongs to the site, not the viewmodel.
 *
 * Weapon pixels are counted rather than eyeballed: the carbine is dark
 * gunmetal against a pale wall, so a luminance floor inside the rectangle the
 * vertices project into is a reliable presence test at 2560x1440.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41988');
const OUT = resolve(arg('--out', 'artifacts/qa/viewmodel-clip'));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: [
    '--mute-audio',
    '--window-position=2560,0',
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=vmclip&previewTime=0`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.evaluate(async () => {
  await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres');
  window.__ATOMIC_ACRES_DEBUG__.startSolo();
});
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
await sleep(5_000);

/** The corner row's own eye position, from measurements-extent-axis.json. */
const EYE = [-36.71710205078125, 1.840100042819977, 29.716590881347656];
/** ... and the same sweep from the open-ground control, as the positive control. */
const OPEN = [-18.041, 1.7, 20.003];

async function probe(where, heading) {
  await page.evaluate(({ where, heading }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.equipWeapon('carbine');
    api.setStance('stand');
    api.teleportPlayer(where[0], where[1], where[2], heading, 0);
  }, { where, heading });
  await sleep(1200);
  return page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const scene = api.sampleSceneGraph();
    let camera = null;
    let vmRoot = null;
    let cameras = 0;
    scene.traverse((n) => {
      if (n.isCamera && n.isPerspectiveCamera) { cameras += 1; if (!camera) camera = n; }
      if (!vmRoot && n.name === 'original-weapon-view') vmRoot = n;
    });
    scene.updateMatrixWorld(true);
    const V3 = scene.position.constructor;
    const eye = camera.getWorldPosition(new V3());
    const fwd = camera.getWorldDirection(new V3());
    const diag = api.sampleFireAdmissionDiagnostics();
    const fold = diag.contactFold;
    const cut = fold && Number.isFinite(fold.clipPlaneDistanceMeters)
      ? Math.max(camera.near + 0.06, fold.clipPlaneDistanceMeters - 0.02)
      : null;
    const scratch = new V3();
    let onScreen = 0;
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    vmRoot.traverse((n) => {
      // Weapon body only. The arms sit below the frame by contract, so counting
      // them would report "on screen" for a frame with no gun in it.
      if (!n.isMesh || !n.visible || /arm|sleeve|hand|glove|finger|skin|wrist/i.test(n.name)) return;
      const pos = n.geometry?.attributes?.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i += 1) {
        scratch.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld);
        const d = (scratch.x - eye.x) * fwd.x + (scratch.y - eye.y) * fwd.y + (scratch.z - eye.z) * fwd.z;
        if (cut !== null && d > cut) continue;
        const ndc = scratch.clone().project(camera);
        if (ndc.x < -1 || ndc.x > 1 || ndc.y < -1 || ndc.y > 1 || ndc.z < -1 || ndc.z > 1) continue;
        onScreen += 1;
        if (ndc.x < minX) minX = ndc.x;
        if (ndc.x > maxX) maxX = ndc.x;
        if (ndc.y < minY) minY = ndc.y;
        if (ndc.y > maxY) maxY = ndc.y;
      }
    });
    return {
      cameras,
      parentIsCamera: vmRoot.parent === camera,
      contactDepth: diag.contactDepthMeters,
      cutDepth: diag.contactCutDepthMeters,
      cut,
      clipEnabled: vmRoot.enabled,
      engaged: fold?.engaged ?? null,
      onScreen,
      rect: Number.isFinite(minX) ? [minX, maxX, minY, maxY] : null,
    };
  });
}

async function darkPixelsIn(rect, name) {
  if (!rect) return null;
  const [minX, maxX, minY, maxY] = rect;
  const x0 = Math.max(0, Math.floor((minX + 1) / 2 * 2560));
  const x1 = Math.min(2560, Math.ceil((maxX + 1) / 2 * 2560));
  const y0 = Math.max(0, Math.floor((1 - maxY) / 2 * 1440));
  const y1 = Math.min(1440, Math.ceil((1 - minY) / 2 * 1440));
  if (x1 <= x0 || y1 <= y0) return null;
  const buffer = await page.screenshot({ clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
  if (name) await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  // Decode via the page - no image library needed on the Node side.
  const base64 = buffer.toString('base64');
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 110) dark += 1;
    }
    return { pixels: data.length / 4, dark, darkFraction: dark / (data.length / 4) };
  }, base64);
}

const HEADINGS = [0, 0.785, 1.571, 2.356, 3.142, 3.927, 4.712, 5.498];
for (const [label, where] of [['corner', EYE], ['open', OPEN]]) {
  for (const heading of HEADINGS) {
    const state = await probe(where, heading);
    const pixels = await darkPixelsIn(state.rect, `yaw-${label}-${heading.toFixed(3)}`);
    console.log(`${label} yaw=${heading.toFixed(3)}`
      + ` depth=${state.contactDepth === null ? 'none' : state.contactDepth.toFixed(3)}`
      + ` cutDepth=${state.cutDepth === null ? 'none' : state.cutDepth.toFixed(3)}`
      + ` cut=${state.cut === null ? 'none' : state.cut.toFixed(3)}`
      + ` engaged=${state.engaged} clip=${state.clipEnabled}`
      + ` weaponOnScreen=${state.onScreen}`
      + ` darkPixels=${pixels ? (pixels.darkFraction * 100).toFixed(1) + '%' : 'n/a'}`
      + ` cameras=${state.cameras} parentIsCamera=${state.parentIsCamera}`);
  }
}
await browser.close();
