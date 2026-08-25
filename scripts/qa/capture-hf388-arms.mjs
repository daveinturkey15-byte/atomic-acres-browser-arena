#!/usr/bin/env node
// HF-388 first-person arm framing + per-skin differentiation evidence.
//
// Why this exists alongside capture-pass79-arms-frames.mjs: that script
// measured nothing usable and its output should not be trusted.
//   * its framing probe threw (`camera is not defined`) and recorded an error
//     string where the numbers should have been;
//   * it read `arm.hand`, a field the rigged-arm diagnostics have never
//     published (they publish `shoulder`, `elbow`, `wrist`, `palm`);
//   * it read `samplePresentationTelemetry()`, which returns the WebGPU
//     SUBMISSION telemetry (`inFlightSubmissions`, `completedSequence`, ...),
//     not the weapon presentation state - that lives at
//     `snapshot().weaponPresentation`;
//   * it ran its bot probe on `gun-range`, which has no bot pool, so
//     `placeBotAhead` returned null four times and the empty result was
//     reported as "every bot is the default skin".
//
// What this measures, on installed Chrome HEADLESS with a real hardware
// WebGPU device (secure context first - navigator.gpu is absent on
// about:blank; and an adapter is not a device, so requestDevice() is called
// and the vendor string is recorded):
//
//   1. TRIGGER-HAND FRAMING. Every first-person hand bone (Wrist/Palm/Hand and
//      the four digits plus thumb, per side) is projected through the live
//      gameplay camera into NDC, so "the trigger hand sits under the ammo
//      panel" is a rectangle compared against a rectangle, not an impression.
//      The ammo panel's own client rect is read from the DOM in the same frame.
//   2. VISIBLE ARM PIXELS. N = the frame the owner sees. B = the same frame
//      with `setArmEvidenceCapture('background')` hiding both arm skins. R / L
//      = the QA x-ray pass that draws one side's skinned vertices on top. Masks
//      are taken by DIFFERENCING against B rather than colour-keying the x-ray
//      material: the post chain lifts the reserved colours far enough that a
//      fixed key silently misses an entire arm. The HUD is a DOM overlay and is
//      byte-identical in every pass, so anything the ammo panel covers drops
//      out of the visible mask automatically. That is the point - this counts
//      what reaches the screen, not what the scene graph contains.
//   3. PER-SKIN BOTS. Every live bot operator's skin id, resolved archetype and
//      director profile, plus one deterministic third-person capture per
//      distinct skin.
//
// Usage: node scripts/qa/capture-hf388-arms.mjs --url http://127.0.0.1:41941 --tag before
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41941');
const TAG = arg('--tag', 'run');
const WIDTH = Number(arg('--width', '2560'));
const HEIGHT = Number(arg('--height', '1440'));
const ONLY = arg('--only', '');
const SKIP_BOTS = argv.includes('--skip-bots');
const OUT = `artifacts/hf388/${TAG}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
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
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });
const log = (...parts) => console.error('[hf388]', ...parts);

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf388&previewTime=0`, { waitUntil: 'domcontentloaded' });

const gpu = await page.evaluate(async () => {
  if (!navigator.gpu) return { gpu: false, secureContext: window.isSecureContext };
  const adapter = await navigator.gpu.requestAdapter().catch(() => null);
  if (!adapter) return { gpu: true, adapter: false, secureContext: window.isSecureContext };
  const device = await adapter.requestDevice().catch(() => null);
  return {
    gpu: true,
    adapter: true,
    device: Boolean(device),
    vendor: adapter.info?.vendor ?? null,
    architecture: adapter.info?.architecture ?? null,
    secureContext: window.isSecureContext,
  };
});
log('webgpu', JSON.stringify(gpu));

await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
log('backend', backend);

async function startArena(arenaId) {
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 240_000 });
  await page.waitForTimeout(2600);
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

function bbox(mask, width, height) {
  let minX = width; let minY = height; let maxX = -1; let maxY = -1; let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (count === 0) return null;
  return {
    pixels: count,
    ndcBox: {
      minX: ((minX / width) * 2) - 1,
      maxX: (((maxX + 1) / width) * 2) - 1,
      minY: 1 - (((maxY + 1) / height) * 2),
      maxY: 1 - ((minY / height) * 2),
    },
  };
}

function intersectCount(a, b) {
  let count = 0;
  for (let index = 0; index < a.length; index += 1) if (a[index] && b[index]) count += 1;
  return count;
}

/**
 * "The arms read as flat white latex" becomes a number here. Over the pixels
 * the arms actually contribute to the frame, report the luminance
 * distribution, the clipped fraction, and the standard deviation - a surface
 * that has swallowed its own normal/roughness detail because its albedo is
 * clipping has a HIGH mean and a LOW deviation, and both have to move.
 */
function luminanceStats(frame, mask) {
  const { data, channels } = frame;
  const values = [];
  let clipped = 0;
  let nearClipped = 0;
  for (let index = 0, pixel = 0; pixel < mask.length; pixel += 1, index += channels) {
    if (!mask[pixel]) continue;
    const luminance = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    values.push(luminance);
    if (luminance >= 250) clipped += 1;
    if (luminance >= 232) nearClipped += 1;
  }
  if (values.length === 0) return null;
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
  };
}

async function setEvidence(mode) {
  const ok = await page.evaluate((value) => window.__ATOMIC_ACRES_DEBUG__.setArmEvidenceCapture(value), mode);
  await page.waitForTimeout(340);
  return ok;
}

// Bone-accurate hand framing. The first-person skeleton uses Blender terminal
// L/R suffixes, the same convention weapon-presentation's own ownership pass
// relies on, so a renamed bone shows up here as a missing joint rather than as
// a quietly wrong answer.
const handFramingScript = () => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const scene = api.sampleSceneGraph();
  const viewmodelRoots = [];
  scene.traverse((node) => { if (node.name === 'original-weapon-view') viewmodelRoots.push(node); });
  let camera = null;
  for (let node = viewmodelRoots[0] ?? null; node; node = node.parent) {
    if (node.isCamera) { camera = node; break; }
  }
  if (!camera) return { error: 'gameplay camera not found from original-weapon-view' };
  const Vector3 = camera.position.constructor;
  const HAND = /^(?:Wrist|Hand|Palm|Index\d+|Middle\d+|Ring\d+|Pinky\d+|Thumb\d+)([LR])$/u;
  const CHAIN = /^(?:UpperArm|LowerArm|Wrist|Hand|Palm|Index\d+|Middle\d+|Ring\d+|Pinky\d+|Thumb\d+)([LR])$/u;
  const scratch = new Vector3();
  const sides = { left: { hand: [], chain: [] }, right: { hand: [], chain: [] } };
  const armsRoots = [];
  scene.traverse((node) => {
    if (node.userData && node.userData.authoredFirstPersonArms === true) armsRoots.push(node);
  });
  const root = armsRoots[0] ?? viewmodelRoots[0] ?? null;
  if (!root) return { error: 'authored first-person arms root not found' };
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    const handMatch = HAND.exec(String(node.name ?? ''));
    const chainMatch = CHAIN.exec(String(node.name ?? ''));
    if (!chainMatch) return;
    const side = chainMatch[1] === 'L' ? 'left' : 'right';
    node.getWorldPosition(scratch);
    const projected = scratch.clone().project(camera);
    const entry = { bone: node.name, ndc: [projected.x, projected.y, projected.z] };
    sides[side].chain.push(entry);
    if (handMatch) sides[side].hand.push(entry);
  });
  const summarise = (entries) => {
    if (entries.length === 0) return null;
    const xs = entries.map((entry) => entry.ndc[0]);
    const ys = entries.map((entry) => entry.ndc[1]);
    return {
      joints: entries.length,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  };
  const rectNdc = (selector) => {
    const rect = document.querySelector(selector)?.getBoundingClientRect?.();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      selector,
      minX: ((rect.left / innerWidth) * 2) - 1,
      maxX: ((rect.right / innerWidth) * 2) - 1,
      minY: 1 - (rect.bottom / innerHeight) * 2,
      maxY: 1 - (rect.top / innerHeight) * 2,
    };
  };
  const presentation = api.snapshot().weaponPresentation ?? null;
  const materialRows = [];
  const seenMaterials = new Set();
  root.traverse((node) => {
    if (!node.isMesh) return;
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      if (!material || seenMaterials.has(material)) continue;
      seenMaterials.add(material);
      materialRows.push({
        name: String(material.userData?.authoredArmMaterialName ?? material.name ?? ''),
        color: material.color ? `#${material.color.getHexString()}` : null,
        colorLinear: material.color ? [material.color.r, material.color.g, material.color.b].map((v) => Number(v.toFixed(4))) : null,
        map: material.map ? (material.map.name || 'unnamed') : null,
        normalMap: Boolean(material.normalMap),
        roughnessMap: Boolean(material.roughnessMap),
        metalnessMap: Boolean(material.metalnessMap),
        aoMap: Boolean(material.aoMap),
        roughness: material.roughness ?? null,
        metalness: material.metalness ?? null,
        emissive: material.emissive ? `#${material.emissive.getHexString()}` : null,
        emissiveIntensity: material.emissiveIntensity ?? null,
      });
    }
  });
  const fills = [];
  scene.traverse((node) => {
    if (node.isLight && String(node.name ?? '').includes('viewmodel')) {
      fills.push({ name: node.name, intensity: node.intensity, distance: node.distance, decay: node.decay, color: `#${node.color.getHexString()}` });
    }
  });
  return {
    weapon: presentation?.weapon ?? null,
    armMaterialDetail: materialRows,
    viewmodelFills: fills,
    handNdc: { left: summarise(sides.left.hand), right: summarise(sides.right.hand) },
    chainNdc: { left: summarise(sides.left.chain), right: summarise(sides.right.chain) },
    handJoints: {
      left: sides.left.hand.map((entry) => [entry.bone, Number(entry.ndc[0].toFixed(4)), Number(entry.ndc[1].toFixed(4))]),
      right: sides.right.hand.map((entry) => [entry.bone, Number(entry.ndc[0].toFixed(4)), Number(entry.ndc[1].toFixed(4))]),
    },
    riggedArms: (presentation?.riggedArms ?? []).map((rig) => ({
      side: rig.side,
      socket: rig.socket ?? null,
      contactError: rig.contactError ?? null,
      wristContactError: rig.wristContactError ?? null,
      reachRatio: rig.reachRatio ?? null,
      palmOrientationError: rig.palmOrientationError ?? null,
      shoulderEntryNdc: rig.shoulderEntryNdc ?? null,
      withinStableReach: rig.withinStableReach ?? null,
      bindOffsetsPreserved: rig.bindOffsetsPreserved ?? null,
    })),
    armFraming: presentation?.armFraming ?? null,
    weaponFraming: presentation?.weaponFraming ?? null,
    viewmodelViewport: presentation?.viewmodelViewport ?? null,
    armsSource: presentation?.armsSource ?? null,
    armMaterials: presentation?.armMaterials ?? null,
    hudRects: ['#weapon-block', '#killstreak-panel', '#vitals-block'].map(rectNdc).filter(Boolean),
  };
};

async function measurePose(name) {
  const normal = await rawFrame();
  writeFileSync(resolve(`${OUT}/${name}.png`), normal.png);
  const framing = await page.evaluate(handFramingScript);

  await setEvidence('background');
  const hidden = await rawFrame();
  await setEvidence('right');
  const xrayRight = await rawFrame();
  await setEvidence('left');
  const xrayLeft = await rawFrame();
  await setEvidence(null);

  const visible = differenceMask(normal, hidden);
  const rightFootprint = differenceMask(xrayRight, hidden, 24);
  const leftFootprint = differenceMask(xrayLeft, hidden, 24);
  const { width, height } = normal;
  return {
    pose: name,
    frame: `${OUT}/${name}.png`,
    viewport: [width, height],
    visibleArmPixels: visible.count,
    visibleArmBox: bbox(visible.mask, width, height),
    rightFootprint: bbox(rightFootprint.mask, width, height),
    leftFootprint: bbox(leftFootprint.mask, width, height),
    rightFootprintVisiblePixels: intersectCount(rightFootprint.mask, visible.mask),
    leftFootprintVisiblePixels: intersectCount(leftFootprint.mask, visible.mask),
    armLuminance: luminanceStats(normal, visible.mask),
    framing,
  };
}

const poses = [];
if (ONLY !== 'bots') {
  await startArena('gun-range');
  for (const weapon of ['carbine', 'pistol', 'lmg']) {
    await page.evaluate((id) => { window.__ATOMIC_ACRES_DEBUG__.equipWeapon(id); }, weapon);
    await page.waitForTimeout(2200);
    poses.push(await measurePose(`hip-${weapon}`));
    log('hip', weapon, 'done');
  }
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.equipWeapon('carbine'); });
  await page.waitForTimeout(1600);

  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setAds(true); });
  await page.waitForTimeout(1300);
  poses.push(await measurePose('ads-carbine'));
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setAds(false); });
  await page.waitForTimeout(900);

  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setReloadCaptureProgress(0.45); });
  await page.waitForTimeout(700);
  poses.push(await measurePose('reload-carbine'));
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setReloadCaptureProgress(null); });
  await page.waitForTimeout(600);

  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setMovement(true, true); });
  await page.waitForTimeout(1500);
  poses.push(await measurePose('sprint-carbine'));
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setMovement(false, false); });
  log('poses done');
}

let perSkin = { skipped: true };
if (!SKIP_BOTS) {
  // A running match does not restage on selectArena; reload, then pick the
  // arena that actually has a bot pool.
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf388bots&previewTime=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
  await startArena('atomic-acres');
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
  await page.waitForTimeout(2600);
  const roster = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const rows = [];
    api.sampleSceneGraph().traverse((node) => {
      const runtimeState = node.userData?.riggedOperatorRuntime;
      if (!runtimeState) return;
      const name = String(node.name ?? '');
      if (!name.includes('bot-operator')) return;
      const director = runtimeState.director;
      node.updateWorldMatrix(true, false);
      const world = node.getWorldPosition(new node.position.constructor());
      rows.push({
        name,
        playerId: node.userData.playerId ?? null,
        skinId: String(node.userData.operatorSkinId ?? '(unset)'),
        archetype: director?.profile?.archetype ?? null,
        idlePreference: director?.profile?.idleClipPreference ?? null,
        posture: director?.profile?.posture ?? null,
        breathHz: director?.profile?.additive?.breathHz ?? null,
        breathAmplitudeRadians: director?.profile?.additive?.breathAmplitudeRadians ?? null,
        aimResponseHz: director?.profile?.additive?.aimResponseHz ?? null,
        turnRateRadiansPerSecond: director?.profile?.additive?.turnRateRadiansPerSecond ?? null,
        hitReactionGain: director?.profile?.hitReactionGain ?? null,
        transitionScale: director?.profile?.transitionScale ?? null,
        currentBase: runtimeState.currentBase ?? null,
        activeAnimationClips: runtimeState.activeAnimationClips ?? null,
        visible: node.visible,
        world: [world.x, world.y, world.z],
        yaw: node.rotation.y,
      });
    });
    return rows;
  });
  log('bot roster', roster.length, roster.map((row) => `${row.skinId}/${row.archetype}`).join(' '));

  const framed = [];
  const seen = new Set();
  for (const row of roster) {
    if (seen.has(row.skinId)) continue;
    seen.add(row.skinId);
    await page.evaluate((bot) => {
      const bearing = bot.yaw + Math.PI * 0.8;
      const distance = 3.2;
      const x = bot.world[0] + Math.sin(bearing) * distance;
      const z = bot.world[2] + Math.cos(bearing) * distance;
      window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(
        x, bot.world[1] + 1.3, z, Math.atan2(bot.world[0] - x, bot.world[2] - z) + Math.PI, -0.02, 38, 0, 1,
      );
    }, row);
    await page.waitForTimeout(1500);
    const file = `${OUT}/skin-${row.skinId}.png`;
    await page.screenshot({ path: resolve(file) });
    framed.push({ skinId: row.skinId, archetype: row.archetype, frame: file, name: row.name });
    log('framed', row.skinId, row.archetype);
  }
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null); });
  perSkin = {
    roster,
    distinctSkins: [...new Set(roster.map((row) => row.skinId))],
    distinctArchetypes: [...new Set(roster.map((row) => row.archetype))],
    framed,
  };
}

const summary = {
  tag: TAG, base: BASE, backend, gpu, viewport: [WIDTH, HEIGHT], poses, perSkin,
  errors: [...new Set(errors)].slice(0, 10),
};
writeFileSync(resolve(`${OUT}/summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({
  tag: TAG, backend, vendor: gpu.vendor, device: gpu.device,
  poses: poses.map((pose) => ({
    pose: pose.pose,
    rightHandNdc: pose.framing?.handNdc?.right ?? null,
    leftHandNdc: pose.framing?.handNdc?.left ?? null,
    ammoPanel: pose.framing?.hudRects?.find((rect) => rect.selector === '#weapon-block') ?? null,
    visibleArmPixels: pose.visibleArmPixels,
    rightFootprintVisiblePixels: pose.rightFootprintVisiblePixels,
    leftFootprintVisiblePixels: pose.leftFootprintVisiblePixels,
  })),
  distinctSkins: perSkin.distinctSkins ?? null,
  distinctArchetypes: perSkin.distinctArchetypes ?? null,
  errorCount: errors.length,
}, null, 2));
