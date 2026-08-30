#!/usr/bin/env node
// HF-388 follow-up: WHICH TERM is washing the first-person arm out?
//
// The arm's own albedo is measured (`capture-hf388-arms.mjs` reports it): the
// sleeve is #2c656d, sRGB luminance 0.35. The arm ON SCREEN at Nuke Town
// sunset sits near 0.8. Something is adding roughly 2.5x, and rebuilding the
// bundle once per guess is far too slow to find out which term it is.
//
// So this mutates the LIVE material/light state in one booted session and
// measures the rendered result per candidate. It is a DIAGNOSTIC, not a fix:
// nothing it writes survives a reload, and the winning numbers still have to
// be encoded in src and re-measured from a real build.
//
// Measurement is identical to capture-hf388-arms.mjs - a difference mask
// against a frame with `setArmEvidenceCapture('background')` - because a
// WebGPU canvas cannot be read back with drawImage and any probe that tries
// reports luminance 0 for a frame that is demonstrably rendering. Every number
// here comes from a PNG screenshot.
//
// Usage:
//   node scripts/qa/probe-hf388-arm-lighting.mjs --arena atomic-acres --tag sweep-bright
//   node scripts/qa/probe-hf388-arm-lighting.mjs --arena high-seas \
//     --teleport 0,1.7,0,3.14159,0 --tag sweep-dark
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41941');
const TAG = arg('--tag', 'sweep');
const ARENA = arg('--arena', 'atomic-acres');
const WIDTH = Number(arg('--width', '1920'));
const HEIGHT = Number(arg('--height', '1080'));
const TELEPORT = arg('--teleport', '') ? arg('--teleport', '').split(',').map(Number) : null;
const OUT = `artifacts/hf388/${TAG}`;
mkdirSync(OUT, { recursive: true });

// Each candidate is applied on top of the SHIPPED state, then the shipped
// state is restored, so candidates cannot contaminate each other.
//   fill      - scalar on `first-person-viewmodel-fill`.intensity (17.5 shipped)
//   emissive  - absolute emissiveIntensity forced on every arm material,
//               or null to leave the shipped 0.34/0.36/0.38 alone.
//   albedo    - scalar on each arm material's linear colour, 1 = shipped.
const DEFAULT_CANDIDATES = [
  { id: 'a-shipped', fill: 17.5, emissive: null, albedo: 1 },
  { id: 'b-emissive-cap-0p18', fill: 17.5, emissive: 0.18, albedo: 1 },
  { id: 'c-emissive-zero', fill: 17.5, emissive: 0, albedo: 1 },
  { id: 'd-fill-8', fill: 8, emissive: null, albedo: 1 },
  { id: 'e-fill-8-cap', fill: 8, emissive: 0.18, albedo: 1 },
  { id: 'f-fill-4-cap', fill: 4, emissive: 0.18, albedo: 1 },
  { id: 'g-fill-4-zero', fill: 4, emissive: 0, albedo: 1 },
  { id: 'h-fill-2-cap', fill: 2, emissive: 0.18, albedo: 1 },
  { id: 'i-fill-4-cap-albedo-1p3', fill: 4, emissive: 0.18, albedo: 1.3 },
];
// `--spec <file>` supplies the candidate list as JSON so a new hypothesis costs
// a data file rather than an edit to a script another run may be executing.
// Recognised keys per row: id, fill, emissive, albedo, envMapIntensity,
// roughness, metalness, aoMapIntensity. Anything omitted keeps the shipped value.
const SPEC = arg('--spec', '');
// Idle sway and breathing move the arm between frames, and a no-op candidate
// measured 13 luminance points away from its own control in an early run. Every
// candidate is therefore measured REPEATS times and averaged, and the spread is
// reported so a difference smaller than the noise cannot be read as a result.
const REPEATS = Number(arg('--repeats', '3'));
const CANDIDATES = SPEC
  ? JSON.parse(readFileSync(resolve(SPEC), 'utf8'))
  : DEFAULT_CANDIDATES;

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', 
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
const log = (...parts) => console.error('[probe]', ...parts);

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf388probe&previewTime=0`, { waitUntil: 'domcontentloaded' });
const gpu = await page.evaluate(async () => {
  if (!navigator.gpu) return { gpu: false, secureContext: window.isSecureContext };
  const adapter = await navigator.gpu.requestAdapter().catch(() => null);
  if (!adapter) return { gpu: true, adapter: false };
  const device = await adapter.requestDevice().catch(() => null);
  return { gpu: true, adapter: true, device: Boolean(device), vendor: adapter.info?.vendor ?? null };
});
log('webgpu', JSON.stringify(gpu));
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
log('backend', backend);

await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 240_000 });
await page.waitForTimeout(2600);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.equipWeapon('carbine'); });
await page.waitForTimeout(2200);

async function station() {
  if (!TELEPORT) return null;
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw ?? 0, pitch ?? 0);
  }, TELEPORT);
  await page.waitForTimeout(900);
  const first = await page.evaluate(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { position: s.player.position.map((v) => Number(v.toFixed(2))), frameCount: s.frameCount };
  });
  await page.waitForTimeout(600);
  const later = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  return { landed: first.position, rendering: later > first.frameCount, frames: [first.frameCount, later] };
}
const stationInfo = await station();
log('station', JSON.stringify(stationInfo));

// Capture the shipped material/light state ONCE so every candidate starts from
// it. Keyed by the authored material name the skin pass preserves.
const baselineState = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const scene = api.sampleSceneGraph();
  const materials = [];
  const lights = [];
  const ARM = /arms_(sleeve|glove|fingerglove|wristaccent|armorpad)/i;
  scene.traverse((node) => {
    if (node.isLight) {
      // EVERY light, not just the viewmodel fill. The arm turned out to be
      // dominated by a term the viewmodel does not own, and a probe that only
      // inventories its own light cannot see that.
      lights.push({
        name: String(node.name ?? ''),
        type: node.type,
        intensity: node.intensity,
        colour: `#${node.color?.getHexString?.() ?? '??????'}`,
        groundColour: node.groundColor ? `#${node.groundColor.getHexString()}` : null,
        distance: node.distance ?? null,
        decay: node.decay ?? null,
        visible: node.visible,
        authored: node.userData?.authoredIntensity ?? null,
      });
    }
    if (!node.isMesh) return;
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      if (!material) continue;
      const name = String(material.userData?.authoredArmMaterialName ?? material.name ?? '');
      if (!ARM.test(name)) continue;
      if (materials.some((row) => row.name === name)) continue;
      materials.push({
        name,
        colorLinear: [material.color.r, material.color.g, material.color.b],
        emissiveIntensity: material.emissiveIntensity,
        roughness: material.roughness,
        metalness: material.metalness,
        envMapIntensity: material.envMapIntensity ?? null,
        aoMapIntensity: material.aoMapIntensity ?? null,
        lightMapIntensity: material.lightMapIntensity ?? null,
        hasEnvMap: Boolean(material.envMap),
        hasSceneEnvironment: Boolean(scene.environment),
        envMapRotationSet: Boolean(material.envMapRotation),
        normalScale: material.normalScale ? [material.normalScale.x, material.normalScale.y] : null,
        // "The normal and roughness maps are not doing visible work" has a
        // mundane possible cause that a material dump alone cannot see: a
        // tangent-space normal map needs TANGENTS, and a GLB exported without
        // them can render perfectly flat while reporting normalMap: true.
        // aoMap likewise needs a second UV set and is inert without one.
        attributes: node.geometry ? Object.keys(node.geometry.attributes) : null,
        hasTangent: Boolean(node.geometry?.attributes?.tangent),
        hasUv1: Boolean(node.geometry?.attributes?.uv1 ?? node.geometry?.attributes?.uv2),
        mesh: String(node.name ?? ''),
      });
    }
  });
  window.__HF388_PROBE_BASE__ = { materials, lights };
  return { materials, lights };
});
log('baseline', JSON.stringify(baselineState));

// How far is the fill light from the arm surface it is blowing out? The
// inverse-square term is the whole question, and the light is parented to a
// SCALED viewmodel root, so the world distance is not the authored 0.4.
const fillGeometry = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const scene = api.sampleSceneGraph();
  let fill = null;
  const armMeshes = [];
  scene.traverse((node) => {
    if (node.isLight && String(node.name ?? '').includes('viewmodel-fill')) fill = node;
    if (node.isMesh && /arms_/i.test(String(node.material?.userData?.authoredArmMaterialName ?? node.material?.name ?? ''))) armMeshes.push(node);
  });
  if (!fill) return { error: 'fill light not found' };
  fill.updateWorldMatrix(true, false);
  const Vector3 = fill.position.constructor;
  const lightWorld = fill.getWorldPosition(new Vector3());
  const rows = [];
  for (const mesh of armMeshes.slice(0, 8)) {
    mesh.updateWorldMatrix(true, false);
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const centre = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld);
    rows.push({
      mesh: String(mesh.name ?? ''),
      material: String(mesh.material?.userData?.authoredArmMaterialName ?? mesh.material?.name ?? ''),
      distance: Number(lightWorld.distanceTo(centre).toFixed(4)),
    });
  }
  return {
    lightWorld: [lightWorld.x, lightWorld.y, lightWorld.z].map((v) => Number(v.toFixed(4))),
    intensity: fill.intensity,
    distance: fill.distance,
    decay: fill.decay,
    meshes: rows,
  };
});
log('fillGeometry', JSON.stringify(fillGeometry));

async function applyCandidate(candidate) {
  return page.evaluate((spec) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const scene = api.sampleSceneGraph();
    const base = window.__HF388_PROBE_BASE__;
    const byName = new Map(base.materials.map((row) => [row.name, row]));
    const ARM = /arms_(sleeve|glove|fingerglove|wristaccent|armorpad)/i;
    let touchedMaterials = 0;
    let touchedLights = 0;
    let touchedAmbient = 0;
    const ambientBase = window.__HF388_AMBIENT_BASE__ ?? (window.__HF388_AMBIENT_BASE__ = new Map());
    scene.traverse((node) => {
      // DIAGNOSTIC ONLY. Scaling the arena's own ambient/hemisphere light is
      // how "is the flat term what is washing the arm out" gets answered; the
      // fix may not live here, because arena lighting is not this lane's.
      if (spec.ambientScale !== undefined && node.isLight
        && (node.type === 'AmbientLight' || node.type === 'HemisphereLight')) {
        if (!ambientBase.has(node)) ambientBase.set(node, node.intensity);
        node.intensity = ambientBase.get(node) * spec.ambientScale;
        touchedAmbient += 1;
      } else if (node.isLight && (node.type === 'AmbientLight' || node.type === 'HemisphereLight') && ambientBase.has(node)) {
        node.intensity = ambientBase.get(node);
      }
      if (node.isLight && String(node.name ?? '').includes('viewmodel-fill')) {
        node.intensity = spec.fill;
        // The runtime re-asserts intensity from userData.authoredIntensity on
        // visibility and suppression changes, so the override has to land on
        // BOTH or the next frame quietly restores the shipped value.
        if (node.userData) node.userData.authoredIntensity = spec.fill;
        touchedLights += 1;
      }
      if (!node.isMesh) return;
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
        if (!material) continue;
        const name = String(material.userData?.authoredArmMaterialName ?? material.name ?? '');
        if (!ARM.test(name)) continue;
        const shipped = byName.get(name);
        if (!shipped) continue;
        if (spec.emissive !== null && spec.emissive !== undefined) material.emissiveIntensity = spec.emissive;
        else material.emissiveIntensity = shipped.emissiveIntensity;
        material.envMapIntensity = spec.envMapIntensity ?? shipped.envMapIntensity ?? material.envMapIntensity;
        material.aoMapIntensity = spec.aoMapIntensity ?? shipped.aoMapIntensity ?? material.aoMapIntensity;
        const role = (/arms_(sleeve|fingerglove|glove|wristaccent|armorpad)/i.exec(name)?.[1] ?? '').toLowerCase();
        if (spec.normalScale !== undefined && material.normalScale) {
          material.normalScale.set(spec.normalScale, spec.normalScale);
        }
        const roleRoughness = spec.roughnessByRole?.[role];
        if (roleRoughness !== undefined) material.roughness = roleRoughness;
        else if (spec.roughness !== undefined) material.roughness = spec.roughness;
        else material.roughness = shipped.roughness;
        if (spec.metalness !== undefined) material.metalness = spec.metalness;
        else material.metalness = shipped.metalness;
        // `paint` forces a flat identifying colour per role. "Which material is
        // the pale tube?" is not answerable from a material dump - the visible
        // region has to be attributed to a material by LOOKING at a frame where
        // only that material changed.
        const painted = spec.paint?.[name.toLowerCase().replace(/^mat_pass65_/u, '').replace(/_pbr$/u, '')]
          ?? spec.paint?.[(/arms_(sleeve|glove|fingerglove|wristaccent|armorpad)/i.exec(name)?.[0] ?? '').toLowerCase()];
        if (painted) {
          material.color.set(painted);
          touchedMaterials += 1;
          continue;
        }
        const albedo = spec.albedo ?? 1;
        material.color.setRGB(
          Math.min(1, shipped.colorLinear[0] * albedo),
          Math.min(1, shipped.colorLinear[1] * albedo),
          Math.min(1, shipped.colorLinear[2] * albedo),
        );
        touchedMaterials += 1;
      }
    });
    return { touchedMaterials, touchedLights, touchedAmbient };
  }, candidate);
}

async function rawFrame() {
  const png = await page.screenshot({ type: 'png' });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels, png };
}

function differenceMask(a, b, threshold = 12) {
  const { data: da, width, height, channels } = a;
  const db = b.data;
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (let index = 0, pixel = 0; pixel < width * height; pixel += 1, index += channels) {
    if (Math.abs(da[index] - db[index]) > threshold
      || Math.abs(da[index + 1] - db[index + 1]) > threshold
      || Math.abs(da[index + 2] - db[index + 2]) > threshold) {
      mask[pixel] = 1;
      count += 1;
    }
  }
  return { mask, count };
}

/**
 * Value distribution plus a LOCAL detail term.
 *
 * stdDev alone cannot answer "is the normal map doing visible work" - a limb
 * lit by a broad gradient has a healthy stdDev while being locally flat, which
 * is exactly the failure being fixed. `microContrast` is the mean absolute
 * one-pixel luminance step measured only between neighbouring pixels that are
 * BOTH inside the arm mask, so it ignores the silhouette edge and reports the
 * weave/wrinkle signal on its own.
 */
function luminanceStats(frame, mask) {
  const { data, channels, width, height } = frame;
  const lum = new Float32Array(width * height);
  const values = [];
  let clipped = 0;
  let nearClipped = 0;
  for (let index = 0, pixel = 0; pixel < mask.length; pixel += 1, index += channels) {
    const luminance = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    lum[pixel] = luminance;
    if (!mask[pixel]) continue;
    values.push(luminance);
    if (luminance >= 250) clipped += 1;
    if (luminance >= 232) nearClipped += 1;
  }
  if (values.length === 0) return null;
  let steps = 0;
  let stepSum = 0;
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const pixel = y * width + x;
      if (!mask[pixel]) continue;
      if (mask[pixel + 1]) { stepSum += Math.abs(lum[pixel] - lum[pixel + 1]); steps += 1; }
      if (mask[pixel + width]) { stepSum += Math.abs(lum[pixel] - lum[pixel + width]); steps += 1; }
    }
  }
  values.sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const at = (fraction) => values[Math.min(values.length - 1, Math.floor(values.length * fraction))];
  return {
    pixels: values.length,
    mean: Number(mean.toFixed(2)),
    stdDev: Number(Math.sqrt(variance).toFixed(2)),
    p05: Number(at(0.05).toFixed(1)),
    p50: Number(at(0.5).toFixed(1)),
    p95: Number(at(0.95).toFixed(1)),
    clippedFraction: Number((clipped / values.length).toFixed(4)),
    nearClippedFraction: Number((nearClipped / values.length).toFixed(4)),
    microContrast: steps === 0 ? null : Number((stepSum / steps).toFixed(3)),
  };
}

async function setEvidence(mode) {
  await page.evaluate((value) => window.__ATOMIC_ACRES_DEBUG__.setArmEvidenceCapture(value), mode);
  await page.waitForTimeout(340);
}

const results = [];
for (const candidate of CANDIDATES) {
  const applied = await applyCandidate(candidate);
  await page.waitForTimeout(700);
  const samples = [];
  let visible = null;
  let normal = null;
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    normal = await rawFrame();
    if (repeat === 0) writeFileSync(resolve(`${OUT}/${candidate.id}.png`), normal.png);
    await setEvidence('background');
    const hidden = await rawFrame();
    await setEvidence(null);
    visible = differenceMask(normal, hidden);
    const sample = luminanceStats(normal, visible.mask);
    if (sample) samples.push(sample);
    await page.waitForTimeout(260);
  }
  // Read the material state BACK after the frame, so a runtime pass that
  // re-asserted the shipped value between apply and capture is visible here
  // rather than silently invalidating the row.
  const readback = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const scene = api.sampleSceneGraph();
    const rows = [];
    let fillIntensity = null;
    const ARM = /arms_(sleeve|glove|fingerglove)/i;
    scene.traverse((node) => {
      if (node.isLight && String(node.name ?? '').includes('viewmodel-fill')) fillIntensity = node.intensity;
      if (!node.isMesh) return;
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
        if (!material) continue;
        const name = String(material.userData?.authoredArmMaterialName ?? material.name ?? '');
        if (!ARM.test(name) || rows.some((row) => row.name === name)) continue;
        rows.push({ name, color: `#${material.color.getHexString()}`, emissiveIntensity: material.emissiveIntensity });
      }
    });
    return { fillIntensity, rows };
  });
  const average = (key) => Number((samples.reduce((sum, row) => sum + row[key], 0) / samples.length).toFixed(3));
  const spread = (key) => Number((Math.max(...samples.map((row) => row[key])) - Math.min(...samples.map((row) => row[key]))).toFixed(2));
  const stats = samples.length === 0 ? null : {
    samples: samples.length,
    pixels: Math.round(average('pixels')),
    mean: average('mean'),
    meanSpread: spread('mean'),
    stdDev: average('stdDev'),
    p05: average('p05'),
    p50: average('p50'),
    p95: average('p95'),
    clippedFraction: average('clippedFraction'),
    nearClippedFraction: average('nearClippedFraction'),
    microContrast: average('microContrast'),
    microContrastSpread: spread('microContrast'),
  };
  results.push({ ...candidate, applied, readback, armPixels: visible.count, armLuminance: stats, frame: `${OUT}/${candidate.id}.png` });
  log(candidate.id, 'fill', readback.fillIntensity, 'lum', JSON.stringify(stats));
}

const summary = {
  tag: TAG, arena: ARENA, base: BASE, backend, gpu, viewport: [WIDTH, HEIGHT],
  station: stationInfo, fillGeometry, baselineState, results,
  errors: [...new Set(errors)].slice(0, 10),
};
writeFileSync(resolve(`${OUT}/summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({
  tag: TAG, arena: ARENA, backend, vendor: gpu.vendor, station: stationInfo,
  rows: results.map((row) => ({
    id: row.id, fillReadback: row.readback.fillIntensity,
    emissiveReadback: row.readback.rows.map((entry) => entry.emissiveIntensity),
    ...row.armLuminance,
  })),
  errorCount: errors.length,
}, null, 2));
