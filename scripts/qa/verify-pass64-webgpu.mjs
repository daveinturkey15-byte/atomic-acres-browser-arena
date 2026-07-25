import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const port = Number(process.env.QA_PREVIEW_PORT ?? '44072');
const peerPort = Number(process.env.QA_PEER_PORT ?? '44073');
const chromeCandidates = [
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 64 hardware WebGPU QA requires PASS64_CHROME_PATH or installed Google Chrome');
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const trackedWorktreeDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim().length > 0;
if (trackedWorktreeDirty) throw new Error('Pass 64 hardware WebGPU QA requires a clean tracked worktree so its receipt identifies exact source');

const cases = process.env.PASS64_ARENAS
  ? process.env.PASS64_ARENAS.split(',').map((value) => value.trim()).filter(Boolean)
  : ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'];
const artifactRoot = 'artifacts/pass64/playable-webgpu';
await mkdir(artifactRoot, { recursive: true });

function pngLuminance(png) {
  if (png.toString('ascii', 1, 4) !== 'PNG') throw new Error('ROI capture is not PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error('ROI PNG must be 8-bit');
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`Unsupported ROI PNG colour type ${colorType}`);
  const compressed = Buffer.concat(idat);
  const raw = inflateSync(compressed);
  const stride = width * channels;
  const rows = [];
  let cursor = 0;
  let previous = Buffer.alloc(stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor++];
    const row = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + up) & 255;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported ROI PNG filter ${filter}`);
    }
    rows.push(row);
    previous = row;
  }
  const luminance = [];
  const central = [];
  for (const [y, row] of rows.entries()) {
    for (let x = 0; x < stride; x += channels) {
      const value = row[x] * 0.2126 + row[x + 1] * 0.7152 + row[x + 2] * 0.0722;
      luminance.push(value);
      const pixelX = x / channels;
      if (pixelX >= width * 0.25 && pixelX < width * 0.75 && y >= height * 0.2 && y < height * 0.78) central.push(value);
    }
  }
  const centralMean = central.reduce((sum, value) => sum + value, 0) / Math.max(1, central.length);
  const centralVariance = central.reduce((sum, value) => sum + (value - centralMean) ** 2, 0) / Math.max(1, central.length);
  const centralOcclusionRatio = central.filter((value) => value < 8 || value > 250).length / Math.max(1, central.length);
  luminance.sort((a, b) => a - b);
  const mean = luminance.reduce((sum, value) => sum + value, 0) / Math.max(1, luminance.length);
  return {
    width,
    height,
    mean: Number(mean.toFixed(3)),
    p95: Number(luminance[Math.floor(luminance.length * 0.95)].toFixed(3)),
    p99: Number(luminance[Math.floor(luminance.length * 0.99)].toFixed(3)),
    centralMean: Number(centralMean.toFixed(3)),
    centralStdDev: Number(Math.sqrt(centralVariance).toFixed(3)),
    centralOcclusionRatio: Number(centralOcclusionRatio.toFixed(4)),
  };
}

const server = await createServer({ server: { host: '127.0.0.1', port }, logLevel: 'error' });
let browser;
let peerServer;
try {
  await server.listen();
  peerServer = spawn(process.execPath, [
    'node_modules/peer/dist/bin/peerjs.js', '--host', '127.0.0.1', '--port', String(peerPort), '--path', '/peerjs', '--no-allow_discovery',
  ], { stdio: 'ignore', windowsHide: true });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${peerPort}/peerjs/id`);
      if (response.status < 500) break;
    } catch {
      if (attempt === 79) throw new Error('Pass 64 local PeerJS verifier did not become ready');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  const receipts = [];
  for (const arenaId of cases) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    const scripts = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(request.url()); });
    await page.goto(`http://127.0.0.1:${port}/?release=latest&renderer=webgpu&map=${arenaId}&render=blender&grass=on&mist=on&seed=6401`);
    await page.waitForFunction(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const state = api?.snapshot();
      return state?.weaponReady === true && state?.render?.runtime?.actualBackend === 'webgpu';
    }, undefined, { timeout: 60_000 });
    await page.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.startSolo();
      window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
      window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(false);
    });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === true, undefined, { timeout: 30_000 });
    await page.waitForTimeout(500);
    const overview = await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const cameraId = api.snapshot().render.playableScene.appliedArenaVisualPolicy.reviewCameraIds
        .find((id) => id.includes('overview'));
      return { cameraId, selected: typeof cameraId === 'string' && api.setArenaReviewCamera(cameraId) };
    });
    if (!overview.selected) throw new Error(`${arenaId} deterministic overview camera is missing`);
    await page.waitForTimeout(350);
    const performanceBudget = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleArenaPerformanceBudget());
    const evidence = await page.evaluate(async () => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const state = api.snapshot();
      return {
        runtime: state.render.runtime,
        post: state.render.atomicSignal,
        playableScene: state.render.playableScene,
        arenaStreaming: state.arenaSelection.streaming,
        lightOcclusion: state.render.arenaContrastLighting,
        terminalGeometry: {
          cabinClearance: state.arenaSelection.skylineCabinClearance,
          openingAudit: state.arenaSelection.skylineOpeningAudit,
        },
        readback: await api.readbackWebGpuFrame(),
      };
    });
    const uniqueErrors = [...new Set(errors)];
    if (uniqueErrors.length > 0) throw new Error(`${arenaId} emitted browser/GPU errors: ${uniqueErrors[0]}`);
    if (evidence.runtime.actualBackend !== 'webgpu' || evidence.runtime.softwareAdapter || evidence.runtime.deviceLost) {
      throw new Error(`${arenaId} did not retain healthy hardware WebGPU`);
    }
    if (evidence.playableScene.route !== 'complete-playable-game'
      || evidence.playableScene.authoritativeArenaRoots !== 1
      || !evidence.playableScene.authoritativeArenaRootIsGameplayRoot
      || evidence.playableScene.duplicateArenaRoots) {
      throw new Error(`${arenaId} is not rendering the single authoritative gameplay arena root`);
    }
    if (!evidence.playableScene.playerCamera || !evidence.playableScene.weaponObject
      || !evidence.playableScene.railgunObject || !evidence.playableScene.multiplayerSystem) {
      throw new Error(`${arenaId} playable WebGPU scene is missing gameplay-owned objects or systems`);
    }
    if (evidence.playableScene.cameraComposition.insideHorizontalCollider
      || !evidence.playableScene.cameraComposition.aboveArenaFloor) {
      throw new Error(`${arenaId} deterministic review camera intersects arena authority: ${JSON.stringify(evidence.playableScene.cameraComposition)}`);
    }
    if (evidence.arenaStreaming.constructionCount !== 1
      || evidence.arenaStreaming.constructionHistory.length !== 1
      || evidence.arenaStreaming.constructionHistory[0] !== arenaId
      || evidence.arenaStreaming.residentArenaRoots !== 1
      || evidence.arenaStreaming.residentArenaIds[0] !== arenaId
      || !evidence.arenaStreaming.selectedOnlyResident) {
      throw new Error(`${arenaId} constructed or retained a non-selected gameplay arena: ${JSON.stringify(evidence.arenaStreaming)}`);
    }
    if (arenaId !== 'atomic-acres' && evidence.arenaStreaming.atomicAuxiliaryRoots !== 0) {
      throw new Error(`${arenaId} eagerly loaded Nuke Town-only presentation roots`);
    }
    const applied = evidence.playableScene.appliedArenaVisualPolicy;
    const actual = evidence.playableScene.actualArenaVisualPolicy;
    if (applied?.definitionId !== arenaId || actual?.definitionId !== arenaId
      || actual.atmosphereDefinitionId !== arenaId || actual.practicals.definitionId !== arenaId
      || actual.sun.color !== applied.sun.color || actual.sun.intensity !== applied.sun.intensity
      || actual.ambient.color !== applied.ambient.color || actual.ambient.intensity !== applied.ambient.intensity
      || actual.fog.color !== applied.fog.color || actual.fog.near !== applied.fog.near || actual.fog.far !== applied.fog.far
      || JSON.stringify(actual.atmosphere) !== JSON.stringify(applied.atmosphere)
      || actual.shadows.enabled !== applied.shadows.enabled || actual.shadows.mapSize !== applied.shadows.mapSize
      || actual.shadows.maximumDistance > applied.shadows.maximumDistance
      || actual.shadows.normalBias !== applied.shadows.normalBias) {
      throw new Error(`${arenaId} ArenaVisualDefinition values were not applied to gameplay: ${JSON.stringify({ applied, actual })}`);
    }
    if (!evidence.playableScene.budgetAudit.pass || evidence.playableScene.budgetAudit.definitionId !== arenaId) {
      throw new Error(`${arenaId} exceeded an ArenaVisualDefinition runtime budget: ${JSON.stringify(evidence.playableScene.budgetAudit)}`);
    }
    const systemVisibility = evidence.playableScene.tslSystemVisibility;
    if ((arenaId === 'rustworks-1v1') !== systemVisibility.waterVisible
      || (arenaId === 'atomic-acres') !== systemVisibility.grassVisible
      || (arenaId === 'rustworks-1v1' && systemVisibility.waterGeometryMaxY >= -19)) {
      throw new Error(`${arenaId} TSL water/grass visibility or water elevation is invalid: ${JSON.stringify(systemVisibility)}`);
    }
    if (performanceBudget.steadyStateFps < 55) {
      throw new Error(`${arenaId} steady-state hardware WebGPU frame rate is below 55 FPS: ${JSON.stringify(performanceBudget)}`);
    }
    if (evidence.playableScene.traversal.legacyShaderMaterials.length !== 0
      || evidence.playableScene.traversal.compiledPipelineIds.length !== 7) {
      throw new Error(`${arenaId} did not complete the seven-owner TSL cutover`);
    }
    if (evidence.runtime.principalHdrSamples !== 4 || evidence.runtime.bloomSamples !== 0
      || evidence.post.bloomGraphId !== 'pass64.full-scene-depth-tested-bloom.v1'
      || evidence.post.bloomOcclusionSource !== 'authoritative-scene-depth'
      || !evidence.post.depthAwareBloom) {
      throw new Error(`${arenaId} HDR/bloom graph telemetry is false or incomplete`);
    }
    if (evidence.readback.bytes <= 0 || !/^[a-f0-9]{8}$/.test(evidence.readback.hash)) {
      throw new Error(`${arenaId} WebGPU HDR target readback failed`);
    }
    const selectedModule = arenaId === 'atomic-acres' ? 'atomic-acres' : arenaId;
    const arenaChunks = scripts.filter((url) => (
      /\/rendering\/arenas\/(atomic-acres|rustworks-1v1|gun-range|skyline-terminal)\.(ts|js)(\?|$)/.test(url)
      || /\/(atomic-acres|rustworks-1v1|gun-range|skyline-terminal)-[^/]+\.js/.test(url)
    ));
    if (arenaChunks.length !== 1 || !arenaChunks[0].includes(selectedModule)) {
      throw new Error(`${arenaId} loaded non-selected arena definition chunks: ${JSON.stringify(arenaChunks)}`);
    }
    const playablePng = await page.screenshot({ path: `${artifactRoot}/${arenaId}-playable.png`, animations: 'disabled' });
    const composition = pngLuminance(playablePng);
    if (composition.centralOcclusionRatio >= 0.5 || composition.centralStdDev <= 12) {
      throw new Error(`${arenaId} deterministic overview failed central visibility/composition gate: ${JSON.stringify(composition)}`);
    }
    let roi = null;
    if (arenaId === 'skyline-terminal' || arenaId === 'atomic-acres') {
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true));
      const clip = { x: 560, y: 270, width: 480, height: 360 };
      const cameraIds = arenaId === 'skyline-terminal'
        ? ['terminal-concourse-wall-closed', 'terminal-boarding-open']
        : ['nuke-town-aqua-wall-closed', 'nuke-town-aqua-door-open'];
      const closedSelected = await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), cameraIds[0]);
      if (!closedSelected) throw new Error(`${arenaId} solid-wall review camera missing`);
      await page.waitForTimeout(350);
      const closedPng = await page.screenshot({ path: `${artifactRoot}/${arenaId}-solid-wall-roi.png`, clip, animations: 'disabled' });
      const openSelected = await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), cameraIds[1]);
      if (!openSelected) throw new Error(`${arenaId} open-door review camera missing`);
      await page.waitForTimeout(350);
      const openPng = await page.screenshot({ path: `${artifactRoot}/${arenaId}-open-door-roi.png`, clip, animations: 'disabled' });
      roi = { solidWall: pngLuminance(closedPng), openDoor: pngLuminance(openPng) };
    }
    receipts.push({ arenaId, scripts: arenaChunks, errors: uniqueErrors, overview, composition, performanceBudget, ...evidence, roi });
    await page.close();
  }
  const switchPage = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const switchScripts = [];
  const switchErrors = [];
  switchPage.on('pageerror', (error) => switchErrors.push(error.message));
  switchPage.on('console', (message) => { if (message.type() === 'error') switchErrors.push(message.text()); });
  switchPage.on('request', (request) => {
    if (request.resourceType() === 'script' && /\/rendering\/arenas\//.test(request.url())) switchScripts.push(request.url());
  });
  await switchPage.goto(`http://127.0.0.1:${port}/?renderer=webgpu&map=atomic-acres&render=blender&seed=6401`);
  await switchPage.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true && state?.bootstrap?.stage === 'ready';
  }, undefined, { timeout: 60_000 });
  const switchReceipts = [];
  for (const arenaId of ['skyline-terminal', 'rustworks-1v1', 'gun-range', 'atomic-acres']) {
    await switchPage.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.selectArena(id), arenaId);
    await switchPage.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleArenaPerformanceBudget());
    const switchState = await switchPage.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { arenaId: state.arenaSelection.id, streaming: state.arenaSelection.streaming, playableScene: state.render.playableScene };
    });
    if (switchState.arenaId !== arenaId || switchState.playableScene.arena.arenaId !== arenaId
      || switchState.playableScene.authoritativeArenaRoots !== 1) {
      throw new Error(`${arenaId} gameplay switch failed: ${JSON.stringify({ switchState, switchErrors })}`);
    }
    const receipt = switchState.playableScene;
    if (receipt.arena.retiredPresentationInventory.geometries <= 0
      || receipt.arena.retiredPresentationInventory.materials <= 0
      || receipt.appliedTslArenaDefinitions < 2) {
      throw new Error(`${arenaId} switch did not detach the prior presentation and apply the selected TSL definition`);
    }
    if (receipt.traversal.legacyShaderMaterials.length !== 0 || receipt.duplicateArenaRoots) {
      throw new Error(`${arenaId} switch introduced a duplicate arena or legacy shader material`);
    }
    if (!switchState.streaming.selectedOnlyResident || switchState.streaming.residentArenaRoots !== 1
      || switchState.streaming.residentArenaIds[0] !== arenaId
      || receipt.appliedArenaVisualPolicy.definitionId !== arenaId
      || receipt.actualArenaVisualPolicy.definitionId !== arenaId
      || receipt.actualArenaVisualPolicy.atmosphereDefinitionId !== arenaId
      || JSON.stringify(receipt.actualArenaVisualPolicy.atmosphere) !== JSON.stringify(receipt.appliedArenaVisualPolicy.atmosphere)
      || receipt.actualArenaVisualPolicy.practicals.definitionId !== arenaId
      || !receipt.budgetAudit.pass) {
      throw new Error(`${arenaId} switch retained an arena or failed definition policy/budget gates: ${JSON.stringify(switchState)}`);
    }
    switchReceipts.push({ ...receipt, streaming: switchState.streaming });
  }
  const requestedArenaModules = [...new Set(switchScripts
    .map((url) => /\/arenas\/(atomic-acres|skyline-terminal|rustworks-1v1|gun-range)(?:\.|\?)/.exec(url)?.[1])
    .filter(Boolean))];
  if (requestedArenaModules.length !== 4) {
    throw new Error(`Gameplay arena switch did not lazily request all four definition modules: ${JSON.stringify(requestedArenaModules)}`);
  }
  if (switchErrors.length > 0) throw new Error(`Gameplay arena switches emitted browser/GPU errors: ${[...new Set(switchErrors)][0]}`);
  await switchPage.close();
  const multiplayerPages = await Promise.all(['host', 'guest'].map(async (role) => {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const url = new URL(`http://127.0.0.1:${port}/`);
    url.searchParams.set('renderer', 'webgpu');
    url.searchParams.set('render', 'performance');
    url.searchParams.set('multiplayerQa', '1');
    url.searchParams.set('peerQaPort', String(peerPort));
    url.searchParams.set('seed', '6401');
    await page.goto(url.toString());
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.bootstrap?.stage === 'ready' && state?.render?.runtime?.actualBackend === 'webgpu';
    }, undefined, { timeout: 60_000 });
    await page.fill('#player-name', role === 'host' ? 'WebGPU Host' : 'WebGPU Guest');
    return page;
  }));
  const [host, guest] = multiplayerPages;
  await host.click('#host');
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout: 45_000 });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.selectOption('#team', '1');
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await Promise.all(multiplayerPages.map((page) => page.waitForFunction(
    () => document.querySelectorAll('#lobby-roster .lobby-player').length === 2,
    undefined,
    { timeout: 45_000 },
  )));
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 45_000 });
  await host.click('#lobby-start');
  try {
    await Promise.all(multiplayerPages.map((page) => page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === true && state?.remotes >= 1;
    }, undefined, { timeout: 45_000 })));
  } catch (error) {
    const stalled = await Promise.all(multiplayerPages.map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state ? {
        gameStarted: state.gameStarted,
        matchPhase: state.matchPhase,
        remotes: state.remotes,
        networkRole: state.networkRole,
        privateMatch: state.privateMatch,
        runtime: state.render?.runtime,
      } : null;
    })));
    throw new Error(`Two-peer WebGPU match start stalled: ${JSON.stringify(stalled)}`, { cause: error });
  }
  await Promise.all(multiplayerPages.map((page) => page.evaluate(
    () => window.__ATOMIC_ACRES_DEBUG__.sampleArenaPerformanceBudget(),
  )));
  const twoPeerWebGpu = await Promise.all(multiplayerPages.map((page) => page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      runtime: state.render.runtime,
      playableScene: state.render.playableScene,
      networkRole: state.networkLifecycle?.role ?? null,
      remotes: state.remotes,
    };
  })));
  for (const [index, peer] of twoPeerWebGpu.entries()) {
    const expectedRole = index === 0 ? 'host' : 'client';
    if (peer.runtime.actualBackend !== 'webgpu' || peer.runtime.softwareAdapter || peer.runtime.deviceLost
      || peer.playableScene.authoritativeArenaRoots !== 1 || peer.playableScene.remoteObjects < 1 || peer.remotes < 1
      || !peer.playableScene.budgetAudit.pass || peer.networkRole !== expectedRole) {
      throw new Error(`Two-peer playable WebGPU gate failed: ${JSON.stringify(peer)}`);
    }
  }
  await Promise.all(multiplayerPages.map((page) => page.close()));
  for (const arenaId of cases.filter((id) => id === 'atomic-acres' || id === 'skyline-terminal')) {
    const receipt = receipts.find((entry) => entry.arenaId === arenaId);
    if (!receipt?.roi) throw new Error(`${arenaId} paired solid-wall/open-door ROI evidence was not captured`);
    // The open portal must retain visibly more high-end light than the solid-wall
    // ROI, while the wall stays below clipping. These thresholds are fixed here
    // and intentionally fail closed rather than normalising each capture.
    if (receipt.roi.solidWall.p99 >= 252 || receipt.roi.openDoor.p99 <= receipt.roi.solidWall.p99 + 20) {
      throw new Error(`${arenaId} light-occlusion ROI gate failed: ${JSON.stringify(receipt.roi)}`);
    }
  }
  const output = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: { revision: sourceRevision, trackedWorktreeDirty },
    browserExecutable: executablePath,
    rendererPolicy: 'webgpu-default-fail-closed-webgl-explicit-compatibility',
    arenaRetirementPolicy: 'single-authoritative-gameplay-root',
    switchReceipts,
    requestedArenaModules,
    twoPeerWebGpu,
    receipts,
  };
  await writeFile(`${artifactRoot}/hardware-webgpu-playable-receipt.json`, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output, null, 2));
} finally {
  await browser?.close();
  peerServer?.kill();
  await server.close();
}
