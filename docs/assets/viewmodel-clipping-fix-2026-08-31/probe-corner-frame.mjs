#!/usr/bin/env node
/**
 * WHY IS THE CORNER FRAME EMPTY WHEN THE NUMBERS SAY IT IS NOT?
 *
 * `measure-viewmodel-penetration.mjs` reports 58% of the carbine's vertices
 * camera-side of the cut at `atomic-acres/corner`, with a pose byte-identical
 * to `atomic-acres/flat-wall` - where the folded carbine is plainly visible in
 * the lower right. The corner frame has no weapon in it. One of those two
 * facts is wrong, and a screenshot cannot say which.
 *
 * So this asks the renderer directly, at both sites, for every visible
 * viewmodel mesh:
 *
 *   - forward extent and how much of it survives the plane;
 *   - the NDC bounds of the surviving vertices - geometry can be kept by the
 *     cut and still be outside the frustum, which looks identical on screen;
 *   - what the clipping group is actually publishing to the renderer.
 *
 * ... and then re-shoots the same frame with the plane disarmed, which
 * separates "the cut removed it" from "it was never on screen".
 *
 * Installed Chrome, off the owner's primary screen, same as every other run
 * in this bundle.
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

const SITES = [
  { site: 'flat-wall', anchor: [-35.0, 23.0], heading: Math.PI / 2 },
  { site: 'corner', anchor: [-35.4, 28.4], heading: 2.356 },
];

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

const inspect = () => page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const scene = api.sampleSceneGraph();
  let camera = null;
  let vmRoot = null;
  scene.traverse((n) => {
    if (!camera && n.isCamera && n.isPerspectiveCamera) camera = n;
    if (!vmRoot && n.name === 'original-weapon-view') vmRoot = n;
  });
  scene.updateMatrixWorld(true);
  const V3 = scene.position.constructor;
  const eye = camera.getWorldPosition(new V3());
  const fwd = camera.getWorldDirection(new V3());
  const fold = api.sampleFireAdmissionDiagnostics().contactFold;
  const cut = fold && Number.isFinite(fold.clipPlaneDistanceMeters)
    ? Math.max(camera.near + 0.06, fold.clipPlaneDistanceMeters - 0.02)
    : null;
  const scratch = new V3();
  const meshes = [];
  vmRoot.traverse((n) => {
    if (!n.isMesh || !n.visible) return;
    for (let p = n; p && p !== vmRoot; p = p.parent) if (!p.visible) return;
    const pos = n.geometry?.attributes?.position;
    if (!pos) return;
    const skinned = Boolean(n.isSkinnedMesh && typeof n.applyBoneTransform === 'function');
    let kept = 0;
    let ndcMinX = Infinity; let ndcMaxX = -Infinity;
    let ndcMinY = Infinity; let ndcMaxY = -Infinity;
    let onScreen = 0;
    let fwdMin = Infinity; let fwdMax = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      scratch.fromBufferAttribute(pos, i);
      if (skinned) n.applyBoneTransform(i, scratch);
      scratch.applyMatrix4(n.matrixWorld);
      const d = (scratch.x - eye.x) * fwd.x + (scratch.y - eye.y) * fwd.y + (scratch.z - eye.z) * fwd.z;
      if (d < fwdMin) fwdMin = d;
      if (d > fwdMax) fwdMax = d;
      if (cut !== null && d > cut) continue;
      kept += 1;
      // Same vertex, projected. Kept by the plane and outside the frustum is
      // indistinguishable from cut away, on screen and in the old numbers.
      const ndc = scratch.clone().project(camera);
      if (ndc.x < ndcMinX) ndcMinX = ndc.x;
      if (ndc.x > ndcMaxX) ndcMaxX = ndc.x;
      if (ndc.y < ndcMinY) ndcMinY = ndc.y;
      if (ndc.y > ndcMaxY) ndcMaxY = ndc.y;
      if (ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1 && ndc.z >= -1 && ndc.z <= 1) onScreen += 1;
    }
    meshes.push({
      name: n.name,
      vertices: pos.count,
      fwdMin: Number(fwdMin.toFixed(4)),
      fwdMax: Number(fwdMax.toFixed(4)),
      kept,
      onScreen,
      ndc: Number.isFinite(ndcMinX)
        ? [ndcMinX, ndcMaxX, ndcMinY, ndcMaxY].map((v) => Number(v.toFixed(3)))
        : null,
      frustumCulled: n.frustumCulled,
      renderOrder: n.renderOrder,
      depthTest: n.material?.depthTest ?? null,
      layers: n.layers?.mask ?? null,
    });
  });
  return {
    cut,
    cameraNear: camera.near,
    cameraFov: camera.fov,
    cameraAspect: camera.aspect,
    clipEnabled: vmRoot.enabled,
    clipPlanes: (vmRoot.clippingPlanes ?? []).map((p) => ({
      normal: [p.normal.x, p.normal.y, p.normal.z].map((v) => Number(v.toFixed(4))),
      constant: Number(p.constant.toFixed(4)),
      eyeSide: Number(p.distanceToPoint(eye).toFixed(4)),
    })),
    rootLayers: vmRoot.layers.mask,
    meshes,
  };
});

for (const site of SITES) {
  await page.evaluate(({ site }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.equipWeapon('carbine');
    api.setStance('stand');
    api.teleportPlayer(site.anchor[0], 1.7, site.anchor[1], site.heading, 0);
  }, { site });
  await sleep(1500);
  // Same standoff walk the matrix does, so the pose is the matrix's pose.
  const found = await page.evaluate(({ site }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const base = [site.anchor[0], 1.7, site.anchor[1]];
    const dir = [-Math.sin(site.heading), 0, -Math.cos(site.heading)];
    const trace = api.traceBallistics('carbine', base, dir, 14);
    const entry = trace?.impacts?.[0]?.entryDistance;
    if (!Number.isFinite(entry)) return null;
    const point = [base[0] + dir[0] * entry, 1.7, base[2] + dir[2] * entry];
    const place = [point[0] - dir[0] * 0.4, 1.7, point[2] - dir[2] * 0.4];
    api.teleportPlayer(place[0], place[1], place[2], site.heading, 0);
    return { entry, place };
  }, { site });
  await sleep(1500);

  const armed = await inspect();
  await page.screenshot({ path: resolve(OUT, `frame-${site.site}-armed.png`) });
  // Disarm the plane in place, nothing else touched. If the weapon appears now,
  // the cut removed it; if it does not, it was never on screen to begin with.
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const scene = api.sampleSceneGraph();
    let vmRoot = null;
    scene.traverse((n) => { if (!vmRoot && n.name === 'original-weapon-view') vmRoot = n; });
    // Emptying the plane ARRAY, not clearing `enabled`. `applyViewmodelContactClip`
    // reassigns `enabled = true` every frame, so a getter-only override there is
    // silently overwritten and the "disarmed" frame is the armed one - which is
    // exactly how the first version of this probe produced two identical frames
    // and nearly proved the wrong thing. `clippingPlanes` and `isClippingGroup`
    // are written once in the constructor and stay written.
    vmRoot.isClippingGroup = false;
    vmRoot.clippingPlanes = [];
  });
  await sleep(600);
  await page.screenshot({ path: resolve(OUT, `frame-${site.site}-disarmed.png`) });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
  await page.evaluate(async () => {
    await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres');
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
  });
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return s.matchPhase === 'active' && s.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
  await sleep(4_000);

  console.log(`\n=== ${site.site} === surface=${found?.entry?.toFixed(3)} cut=${armed.cut?.toFixed(3)} clipEnabled=${armed.clipEnabled}`);
  console.log('   planes', JSON.stringify(armed.clipPlanes));
  for (const m of armed.meshes) {
    console.log(`   ${m.name.slice(0, 46).padEnd(46)} fwd ${String(m.fwdMin).padStart(7)}..${String(m.fwdMax).padStart(7)}`
      + ` kept ${String(m.kept).padStart(5)}/${String(m.vertices).padEnd(5)} onScreen ${String(m.onScreen).padStart(5)}`
      + ` ndc ${JSON.stringify(m.ndc)}`);
  }
}
await browser.close();
