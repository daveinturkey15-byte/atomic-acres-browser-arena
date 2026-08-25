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
  // COMBAT SAFETY. The whole-viewmodel NDC AABB is useless for this question -
  // an M249's barrel sweeps far enough that its box contains the crosshair
  // while the gun itself is nowhere near it. So project each VISIBLE MESH's
  // own bounding box, eight corners at a time, and ask which of those boxes
  // contains screen centre. A mesh-level box is tight enough to be an answer.
  const centreOccluders = [];
  const viewmodelRoot = viewmodelRoots[0] ?? null;
  if (viewmodelRoot) {
    viewmodelRoot.updateWorldMatrix(true, true);
    viewmodelRoot.traverse((node) => {
      if (!node.isMesh || !node.visible) return;
      let ancestorHidden = false;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (!parent.visible) ancestorHidden = true;
        if (parent === viewmodelRoot) break;
      }
      if (ancestorHidden) return;
      if (!node.geometry?.boundingBox) node.geometry?.computeBoundingBox?.();
      const box = node.geometry?.boundingBox;
      if (!box) return;
      let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
      let behind = 0;
      for (let corner = 0; corner < 8; corner += 1) {
        const point = new (node.position.constructor)(
          corner & 1 ? box.max.x : box.min.x,
          corner & 2 ? box.max.y : box.min.y,
          corner & 4 ? box.max.z : box.min.z,
        ).applyMatrix4(node.matrixWorld).project(camera);
        if (point.z > 1) behind += 1;
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      }
      if (behind === 8) return;
      if (minX <= 0 && maxX >= 0 && minY <= 0 && maxY >= 0) {
        centreOccluders.push({
          mesh: String(node.name ?? ''),
          ndcBox: [Number(minX.toFixed(3)), Number(maxX.toFixed(3)), Number(minY.toFixed(3)), Number(maxY.toFixed(3))],
        });
      }
    });
  }
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
    centreOccluders,
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
  // arena that actually has a bot pool. gun-range has none, which is why the
  // previous probe's `placeBotAhead` returned null four times.
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf388bots&previewTime=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
  await startArena('atomic-acres');

  // Solo runs ONE live bot and stages the rest as dormant reinforcements. A
  // dormant operator is never stepped, so its director never advances and its
  // `currentBase` stays at the constructor default - which is exactly what a
  // reader would mistake for "every bot animates the same". Activate them
  // first, THEN judge.
  const activations = [];
  for (let index = 0; index < 6; index += 1) {
    activations.push(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateDormantReinforcement()));
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(2600);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
  await page.waitForTimeout(1600);

  const readRoster = () => page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const rows = [];
    api.sampleSceneGraph().traverse((node) => {
      const runtimeState = node.userData?.riggedOperatorRuntime;
      if (!runtimeState) return;
      const name = String(node.name ?? '');
      if (!name.includes('bot-operator')) return;
      const director = runtimeState.director;
      const animation = runtimeState.lastAnimation;
      node.updateWorldMatrix(true, false);
      const world = node.getWorldPosition(new node.position.constructor());
      const bone = (key) => {
        const target = runtimeState.poseBones?.[key];
        return target ? Number(target.rotation.x.toFixed(5)) : null;
      };
      rows.push({
        playerId: node.userData.playerId ?? null,
        skinId: String(node.userData.operatorSkinId ?? '(unset)'),
        archetype: director?.profile?.archetype ?? null,
        idlePreference: director?.profile?.idleClipPreference?.[0] ?? null,
        posture: director?.profile?.posture ?? null,
        breathHz: director?.profile?.additive?.breathHz ?? null,
        aimResponseHz: director?.profile?.additive?.aimResponseHz ?? null,
        hitReactionGain: director?.profile?.hitReactionGain ?? null,
        transitionScale: director?.profile?.transitionScale ?? null,
        // The three that decide whether any of the above reaches a pixel.
        animated: Boolean(animation),
        selectedClip: animation?.selectedClip ?? null,
        currentBase: runtimeState.currentBase ?? null,
        appliedPosture: animation?.posture ?? null,
        // Post-mixer spine chain: the bones the posture bias is written onto.
        boneAbdomenPitch: bone('abdomen'),
        boneChestPitch: bone('chest'),
        boneHeadPitch: bone('head'),
        visible: node.visible,
        world: [world.x, world.y, world.z],
      });
    });
    return rows;
  });

  let roster = await readRoster();
  log('roster', roster.length, 'animated', roster.filter((row) => row.animated).length);

  // Stage a clear lane with the debug helper (it ray-tests the route), then
  // move one operator of each skin into that lane so all four are judged in
  // ONE frame under ONE light. Positions are restored afterwards.
  const staged = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(5)).catch(() => null);
  log('staged', staged ? JSON.stringify(staged.bot.rootPosition) : 'null');
  let lineup = null;
  if (staged) {
    // placeBotAhead searches 16 bearings for a clear one, so the lane it finds
    // is usually NOT the one the player happens to be facing. Aim at it.
    // Forward in this codebase is (-sin yaw, 0, -cos yaw).
    await page.evaluate((stage) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const from = stage.sourcePlayer.position;
      const to = stage.bot.rootPosition;
      const yaw = Math.atan2(from[0] - to[0], from[2] - to[2]);
      api.teleportPlayer(from[0], from[1], from[2], yaw, 0);
    }, staged);
    await page.waitForTimeout(900);
    lineup = await page.evaluate((stage) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const from = stage.sourcePlayer.position;
      const to = stage.bot.rootPosition;
      const yaw = Math.atan2(from[0] - to[0], from[2] - to[2]);
      const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
      const centre = stage.bot.rootPosition;
      const bySkin = new Map();
      const restore = [];
      api.sampleSceneGraph().traverse((node) => {
        if (!node.userData?.riggedOperatorRuntime) return;
        if (!String(node.name ?? '').includes('bot-operator')) return;
        const skinId = String(node.userData.operatorSkinId ?? '(unset)');
        if (!bySkin.has(skinId)) bySkin.set(skinId, node);
      });
      const order = [...bySkin.keys()].sort();
      const placedSkins = [];
      order.forEach((skinId, index) => {
        const node = bySkin.get(skinId);
        // Shifted left of centre so the first-person viewmodel (which owns the
        // right of the frame) cannot hide an operator we are comparing.
        const offset = (index - (order.length - 1) / 2) * 1.15 - 1.15;
        restore.push({ skinId, position: node.position.toArray(), rotationY: node.rotation.y });
        node.position.set(
          centre[0] + right[0] * offset,
          centre[1],
          centre[2] + right[2] * offset,
        );
        node.rotation.y = yaw + Math.PI;
        node.updateMatrixWorld(true);
        placedSkins.push({ skinId, position: node.position.toArray() });
      });
      window.__HF388_RESTORE__ = restore;
      return { order, placedSkins, playerYaw: yaw, lineupCentre: centre };
    }, staged);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: resolve(`${OUT}/per-skin-lineup.png`) });
    log('lineup captured', JSON.stringify(lineup.order));
    // A second frame a beat later: two frames of the same lineup are how a
    // per-operator idle PHASE offset shows up at all.
    await page.waitForTimeout(1700);
    await page.screenshot({ path: resolve(`${OUT}/per-skin-lineup-t2.png`) });
    roster = await readRoster();
    // Per-skin portraits from the PLAYER'S OWN EYE down the lane that
    // placeBotAhead already proved clear, narrowed to a 22-degree lens. Same
    // eye, same light, same lane for all four - only the operator changes.
    // Per-skin portraits through the PLAYER'S OWN camera - the one framing
    // already proven to work - yawed onto each operator in turn. Same eye,
    // same lane, same light; only the operator changes.
    for (const placed of lineup.placedSkins) {
      await page.evaluate((entry) => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const from = entry.from;
        const to = entry.position;
        const yaw = Math.atan2(from[0] - to[0], from[2] - to[2]);
        api.teleportPlayer(from[0], from[1], from[2], yaw, 0);
      }, { ...placed, from: staged.sourcePlayer.position });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: resolve(`${OUT}/skin-${placed.skinId}.png`) });
      log('portrait', placed.skinId);
    }
    await page.evaluate(() => {
      const restore = window.__HF388_RESTORE__ ?? [];
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const bySkin = new Map();
      api.sampleSceneGraph().traverse((node) => {
        if (!node.userData?.riggedOperatorRuntime) return;
        if (!String(node.name ?? '').includes('bot-operator')) return;
        const skinId = String(node.userData.operatorSkinId ?? '(unset)');
        if (!bySkin.has(skinId)) bySkin.set(skinId, node);
      });
      for (const entry of restore) {
        const node = bySkin.get(entry.skinId);
        if (!node) continue;
        node.position.fromArray(entry.position);
        node.rotation.y = entry.rotationY;
        node.updateMatrixWorld(true);
      }
    });
  }
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(false); });
  perSkin = {
    activations,
    roster,
    lineup,
    lineupFrames: lineup ? [`${OUT}/per-skin-lineup.png`, `${OUT}/per-skin-lineup-t2.png`] : [],
    distinctSkins: [...new Set(roster.map((row) => row.skinId))],
    distinctArchetypes: [...new Set(roster.map((row) => row.archetype))],
    animatedCount: roster.filter((row) => row.animated).length,
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
