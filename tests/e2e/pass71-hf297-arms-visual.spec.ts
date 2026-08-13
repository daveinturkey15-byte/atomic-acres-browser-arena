import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';

const enabled = process.env.PASS71_HF297_ARMS_VISUAL === '1';
const expectedSourceSha = process.env.PASS71_HF297_SOURCE_SHA ?? '';
const receiptPath = process.env.PASS71_HF297_VISUAL_RECEIPT;
const expectedReleasePass = process.env.PASS71_HF297_RELEASE_PASS ?? 'PASS 71';
const browserChannel = process.env.PASS71_HF297_BROWSER_CHANNEL ?? 'chrome';
const browserExecutable = process.env.PASS71_HF297_BROWSER_EXECUTABLE ?? '';
const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const artifactRoot = resolve(process.cwd(), 'artifacts/pass71/hf297-arms-evidence/visual-source');

const VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop-1440p', width: 2560, height: 1440, mobile: false }),
  Object.freeze({ id: 'ultrawide-1440p', width: 3440, height: 1440, mobile: false }),
  Object.freeze({ id: 'iphone-15-landscape', width: 844, height: 390, mobile: true }),
  Object.freeze({ id: 'iphone-15-portrait', width: 390, height: 844, mobile: true }),
]);

const ACTIONS = Object.freeze([
  Object.freeze({ id: 'm4a1-hip', weapon: 'm4a1', action: 'hip' }),
  Object.freeze({ id: 'm4a1-ads', weapon: 'm4a1', action: 'ads' }),
  Object.freeze({ id: 'm4a1-fire', weapon: 'm4a1', action: 'fire' }),
  Object.freeze({ id: 'm4a1-reload', weapon: 'm4a1', action: 'reload' }),
  Object.freeze({ id: 'pistol-hip', weapon: 'pistol', action: 'hip' }),
  Object.freeze({ id: 'pistol-ads', weapon: 'pistol', action: 'ads' }),
  Object.freeze({ id: 'pistol-fire', weapon: 'pistol', action: 'fire' }),
  Object.freeze({ id: 'pistol-reload', weapon: 'pistol', action: 'reload' }),
  Object.freeze({ id: 'field-knife-melee', weapon: 'field-knife', action: 'melee' }),
]);

const WEAPONS = Object.freeze([
  'carbine', 'smg', 'lmg', 'scattergun', 'sniper',
  'mini-uzi', 'mp5', 'm4a1', 'ak-47', 'minigun', 'm14-ebr', 'slug-shotgun',
  'pistol', 'machine-pistol', 'magnum', 'flashlight-pistol', 'explosive-crossbow',
  'railgun', 'flamethrower', 'flare-gun',
]);
const CATALOG_ACTIONS = Object.freeze(['hip', 'ads', 'fire', 'reload']);
const FULLSCREEN_OPTICS = new Set(['sniper', 'm14-ebr']);

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function finiteFraming(framing: any, label: string): void {
  expect(framing, `${label}: finite near-plane-clear framing`).toMatchObject({
    finite: true,
    nearPlaneClear: true,
    intersectsViewport: true,
  });
  expect([...framing.ndcMin, ...framing.ndcMax, framing.nearestDepth].every(Number.isFinite),
    `${label}: finite framing telemetry`).toBe(true);
}

function assertAnatomy(presentation: any, label: string, melee: boolean): void {
  expect(presentation.armsSource, `${label}: authored two-chain arms`).toBe('authored-two-chain');
  expect(presentation.authoredFingerBoneCount, `${label}: complete finger rig`).toBe(30);
  expect(presentation.armMaterials, `${label}: opaque arm materials`).toMatchObject({
    contract: 'opaque-depth-writing',
    transparent: 0,
    nonOpaque: 0,
    depthWriteDisabled: 0,
  });
  finiteFraming(presentation.armFraming, `${label}/arms`);
  expect(presentation.armFraming.ndcMin[1], `${label}: arms continue below the lower crop`)
    .toBeLessThanOrEqual(-1.2);
  expect(presentation.riggedArms, `${label}: two arm chains`).toHaveLength(2);
  for (const side of ['left', 'right'] as const) {
    const arm = presentation.riggedArms.find((candidate: { side: string }) => candidate.side === side);
    expect(arm, `${label}/${side}: authored chain`).toMatchObject({
      active: true,
      finite: true,
      withinStableReach: true,
      authoredSegmentDirectionsPreserved: true,
      poseChainContract: 'authored-palm-full-transform-to-socket-frame-v2',
      shoulderEntryPolicy: 'camera-space-below-frame-continuation-v1',
      segmentLengthScale: 1,
      bindOffsetsPreserved: true,
    });
    expect(arm.contactError, `${label}/${side}: palm contact`).toBeLessThanOrEqual(melee ? 0.025 : 0.02);
    expect(arm.wristContactError, `${label}/${side}: wrist contact`).toBeLessThanOrEqual(melee ? 0.025 : 0.02);
    expect(arm.palmOrientationError, `${label}/${side}: palm orientation`).toBeLessThanOrEqual(0.2);
    const branch = presentation.armBranchFraming?.[side];
    finiteFraming(branch, `${label}/${side}-branch`);
    expect(branch.ndcMin[1], `${label}/${side}: sleeve independently exits below frame`).toBeLessThanOrEqual(-1.05);
    expect(presentation.proximalSleeveContinuations?.find((entry: { side: string }) => entry.side === side),
      `${label}/${side}: authored sleeve continuation`).toMatchObject({
      contract: 'shoulder-bound-authored-pbr-lower-crop-continuation-v1',
      materialKind: 'MeshStandardMaterial',
      authoredSleeveMaterial: true,
      opaque: true,
    });
  }
  if (melee) {
    expect(presentation, `${label}: authored wrist-mounted knife`).toMatchObject({
      meleeArmSource: 'authored-rigged-arms',
      knifeVisible: true,
      passiveKnifeVisible: false,
      authoredMeleeKnifeParent: 'right-wrist-knife-socket',
    });
    expect(presentation.authoredMeleeGripError, `${label}: knife socket grip`).toBeLessThanOrEqual(0.001);
    expect(presentation.authoredMeleeHandContactError, `${label}: knife hand contact`).toBeLessThanOrEqual(0.015);
    finiteFraming(presentation.meleeKnifeFraming, `${label}/knife`);
  } else {
    finiteFraming(presentation.weaponFraming, `${label}/weapon`);
  }
}

async function stageAction(page: Page, cell: typeof ACTIONS[number]): Promise<any> {
  await page.evaluate(({ weapon, action }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__!;
    api.setAds(false);
    api.setFireCaptureAgeMs(null);
    api.setReloadCaptureProgress(null);
    api.setMeleeCaptureProgress(null);
    api.equipWeapon((weapon === 'field-knife' ? 'm4a1' : weapon) as any);
    if (action === 'ads') api.setAds(true);
    else if (action === 'fire') { api.fireOnce(); api.setFireCaptureAgeMs(0); }
    else if (action === 'reload') api.setReloadCaptureProgress(0.46);
    else if (action === 'melee') { api.melee(); api.setMeleeCaptureProgress(0.42); }
  }, cell);
  await page.waitForFunction(({ weapon, action }) => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
    if (!presentation) return false;
    if (action === 'melee') return presentation.actionContract?.state === 'melee'
      && presentation.meleeArmSource === 'authored-rigged-arms'
      && presentation.knifeVisible === true;
    if (presentation.weapon !== weapon || presentation.importedModel?.weapon !== weapon) return false;
    if (action === 'ads') return presentation.adsProgress > 0.98 && presentation.actionContract?.state === 'ads';
    if (action === 'reload') return presentation.actionContract?.state === 'reload'
      && Math.abs(presentation.actionContract.reloadProgress - 0.46) <= 0.015;
    if (action === 'fire') return presentation.fireCycle?.flash > 0.99 && presentation.fireCycle?.kick > 0.99;
    return presentation.adsProgress < 0.02 && presentation.actionContract?.state === 'hip';
  }, cell, { timeout: 15_000 });
  await page.waitForTimeout(120);
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot());
}

async function captureLosslessPng(page: Page): Promise<Buffer> {
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.setRenderPaused(true));
  try {
    return await page.screenshot({ animations: 'disabled', timeout: 60_000 });
  } finally {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.setRenderPaused(false));
  }
}

async function stageCatalogAction(page: Page, weapon: string, action: string): Promise<any> {
  await page.evaluate(({ weaponId, actionId }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__!;
    api.setAds(false);
    api.setFireCaptureAgeMs(null);
    api.setReloadCaptureProgress(null);
    api.setMeleeCaptureProgress(null);
    api.equipWeapon(weaponId as any);
    if (actionId === 'ads') api.setAds(true);
    else if (actionId === 'fire') { api.fireOnce(); api.setFireCaptureAgeMs(0); }
    else if (actionId === 'reload') api.setReloadCaptureProgress(0.46);
  }, { weaponId: weapon, actionId: action });
  await page.waitForFunction(({ weaponId, actionId, fullscreen }) => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    const presentation = state?.weaponPresentation;
    if (!presentation || presentation.weapon !== weaponId || presentation.importedModel?.weapon !== weaponId
      || presentation.detailsReady !== true) return false;
    if (actionId === 'ads') return presentation.actionContract?.state === 'ads'
      && presentation.adsProgress > 0.98
      && (fullscreen ? state.sniperScope?.viewmodelVisible === false : state.sniperScope?.viewmodelVisible === true);
    if (actionId === 'fire') return presentation.actionContract?.state === 'hip'
      && presentation.fireCycle?.flash > 0.99 && presentation.fireCycle?.kick > 0.99;
    if (actionId === 'reload') return presentation.actionContract?.state === 'reload'
      && Math.abs(presentation.actionContract.reloadProgress - 0.46) <= 0.015;
    return presentation.actionContract?.state === 'hip' && presentation.adsProgress < 0.02;
  }, { weaponId: weapon, actionId: action, fullscreen: FULLSCREEN_OPTICS.has(weapon) }, { timeout: 20_000 });
  await page.waitForTimeout(120);
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot());
}

function summarizeFraming(framing: any): Record<string, unknown> | null {
  if (!framing) return null;
  return {
    finite: framing.finite,
    nearPlaneClear: framing.nearPlaneClear,
    intersectsViewport: framing.intersectsViewport,
    fullyInsideViewport: framing.fullyInsideViewport,
    ndcMin: framing.ndcMin,
    ndcMax: framing.ndcMax,
    nearestDepth: framing.nearestDepth,
  };
}

function summarizeRig(presentation: any): Record<string, unknown> {
  return {
    armsSource: presentation.armsSource,
    armMeshCount: presentation.armMeshCount,
    authoredFingerBoneCount: presentation.authoredFingerBoneCount,
    armMaterials: presentation.armMaterials,
    armFraming: summarizeFraming(presentation.armFraming),
    armBranches: Object.fromEntries((['left', 'right'] as const).map((side) => (
      [side, summarizeFraming(presentation.armBranchFraming?.[side])]
    ))),
    sleeveContinuations: (presentation.proximalSleeveContinuations ?? []).map((entry: any) => ({
      side: entry.side,
      contract: entry.contract,
      parent: entry.parent,
      materialKind: entry.materialKind,
      authoredSleeveMaterial: entry.authoredSleeveMaterial,
      opaque: entry.opaque,
    })),
    riggedArms: (presentation.riggedArms ?? []).map((arm: any) => ({
      side: arm.side,
      active: arm.active,
      finite: arm.finite,
      withinStableReach: arm.withinStableReach,
      authoredSegmentDirectionsPreserved: arm.authoredSegmentDirectionsPreserved,
      poseChainContract: arm.poseChainContract,
      shoulderEntryPolicy: arm.shoulderEntryPolicy,
      contactError: arm.contactError,
      wristContactError: arm.wristContactError,
      palmOrientationError: arm.palmOrientationError,
      socketReachRatio: arm.socketReachRatio,
      gripSocketCalibration: arm.gripSocketCalibration,
      segmentLengthScale: arm.segmentLengthScale,
      bindOffsetsPreserved: arm.bindOffsetsPreserved,
      shoulderEntryNdc: arm.shoulderEntryNdc,
    })),
  };
}

function summarizeCatalogAction(state: any, weapon: string, action: string): Record<string, unknown> {
  const presentation = state.weaponPresentation;
  const visible = state.sniperScope.viewmodelVisible === true;
  if (visible) {
    finiteFraming(presentation.weaponFraming, `${weapon}/${action}/weapon`);
    finiteFraming(presentation.armFraming, `${weapon}/${action}/arms`);
    expect(presentation.weaponFraming.nearestDepth, `${weapon}/${action}: weapon near-plane margin`).toBeGreaterThanOrEqual(0.1);
    expect(presentation.armFraming.nearestDepth, `${weapon}/${action}: arms near-plane margin`).toBeGreaterThanOrEqual(0.1);
  } else {
    expect(FULLSCREEN_OPTICS.has(weapon) && action === 'ads', `${weapon}/${action}: only fullscreen optics suppress`).toBe(true);
    expect(presentation.fullscreenSuppression, `${weapon}/${action}: structural suppression`).toMatchObject({
      contract: 'retained-structural-lights-fullscreen-suppression-v1',
      active: true,
      rootVisible: true,
      rootScale: 0.0001,
    });
  }
  return {
    id: action,
    state: presentation.actionContract?.state,
    sample: action === 'fire' ? 0 : action === 'reload' ? 0.46 : null,
    effectiveViewmodelVisible: visible,
    fullscreenSuppressionActive: presentation.fullscreenSuppression?.active === true,
    weaponFraming: visible ? summarizeFraming(presentation.weaponFraming) : null,
    armFraming: visible ? summarizeFraming(presentation.armFraming) : null,
    nearestDepth: visible
      ? Math.min(presentation.weaponFraming.nearestDepth, presentation.armFraming.nearestDepth)
      : null,
    requiredDepth: visible ? 0.1 : null,
    clearanceMargin: visible
      ? Math.min(presentation.weaponFraming.nearestDepth, presentation.armFraming.nearestDepth) - 0.1
      : null,
  };
}

test.describe('Pass 71 HF-297 arms visual evidence', () => {
  test.skip(!enabled, 'owned exact-candidate-A visual runner only');

  test('captures the bounded visual matrix and all-weapon mechanical rig telemetry', async () => {
    test.setTimeout(720_000);
    expect(expectedSourceSha).toMatch(/^[a-f0-9]{40}$/u);
    expect(receiptPath).toBeTruthy();
    expect(browserExecutable).toMatch(/[\\/]chrome\.exe$/iu);
    rmSync(artifactRoot, { recursive: true, force: true });
    mkdirSync(artifactRoot, { recursive: true });
    const browser = await chromium.launch({
      headless: true,
      executablePath: browserExecutable,
      args: [
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
      ],
    });
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => { if (message.type() === 'error') faults.push(message.text()); });
    await page.route('https://fonts.googleapis.com/**', (request) => request.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('**/v1/leaderboard?*', (request) => request.fulfill({ status: 200, contentType: 'application/json', body: '{"entries":[]}' }));
    await page.route('**/v1/streak', (request) => request.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true}' }));
    try {
      await page.goto(`${baseUrl}/channels/the-big-one/?release=latest&renderer=webgl2&render=blender&map=gun-range&grass=off&mist=off&externalServices=off&seed=710297`);
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.bootstrap?.stage === 'ready' && state?.weaponReady === true
        && state?.render?.runtime?.actualBackend === 'webgl2'
        && state?.render?.runtime?.softwareAdapter === false;
    }, undefined, { timeout: 60_000 });
    const servedCandidate = await page.evaluate(async () => {
      const response = await fetch('channel-provenance.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HF-297 candidate provenance returned HTTP ${response.status}`);
      return response.json();
    });
    expect(servedCandidate).toMatchObject({
      schemaVersion: 4,
      channel: 'the-big-one',
      releasePass: expectedReleasePass,
      sourceSha: expectedSourceSha,
      path: 'channels/the-big-one',
    });
    expect(servedCandidate.treeSha256).toMatch(/^[a-f0-9]{64}$/u);
    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__!;
      api.startSolo();
      api.setBotsFrozen(true);
      api.setMovement(false);
    });
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === true && state?.matchPhase === 'active';
    }, undefined, { timeout: 45_000 });

    const frames: Array<Record<string, unknown>> = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const cell of ACTIONS) {
        const state = await stageAction(page, cell);
        const presentation = state.weaponPresentation;
        const label = `${viewport.id}/${cell.id}`;
        assertAnatomy(presentation, label, cell.action === 'melee');
        if (cell.action === 'ads') {
          expect(Math.hypot(...presentation.sightOffset), `${label}: physical sight centre`).toBeLessThanOrEqual(0.03);
        }
        const image = await captureLosslessPng(page);
        expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const fileName = `${viewport.id}-${cell.id}.png`;
        writeFileSync(resolve(artifactRoot, fileName), image);
        frames.push({
          id: label,
          viewport,
          weapon: cell.weapon,
          action: cell.action,
          state: {
            action: presentation.actionContract,
            armsSource: presentation.armsSource,
            authoredFingerBoneCount: presentation.authoredFingerBoneCount,
            armMaterials: presentation.armMaterials,
            armFraming: presentation.armFraming,
            armBranchFraming: presentation.armBranchFraming,
            proximalSleeveContinuations: presentation.proximalSleeveContinuations,
            riggedArms: presentation.riggedArms,
            weaponFraming: cell.action === 'melee' ? null : presentation.weaponFraming,
            knifeFraming: cell.action === 'melee' ? presentation.meleeKnifeFraming : null,
          },
          image: {
            path: `artifacts/pass71/hf297-arms-evidence/visual-source/${fileName}`,
            mimeType: 'image/png',
            encoding: 'lossless-png',
            width: viewport.width,
            height: viewport.height,
            byteLength: image.length,
            sha256: sha256(image),
          },
        });
      }
    }

    await page.setViewportSize({ width: 1600, height: 900 });
    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__!;
      api.setAds(false);
      api.setFireCaptureAgeMs(null);
      api.setReloadCaptureProgress(null);
      api.setMeleeCaptureProgress(null);
      api.setStance('prone');
      api.teleportPlayer(-19.65, 1.7, -14.5, Math.PI / 2, 0);
    });
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.player?.stance === 'prone'
        && state?.weaponPresentation?.surfaceRetreat >= 0.28
        && state?.weaponPresentation?.surfaceLift >= 0.13;
    }, undefined, { timeout: 20_000 });
    const catalogTelemetry: Array<Record<string, unknown>> = [];
    for (const weapon of WEAPONS) {
      const actionTelemetry: Array<Record<string, unknown>> = [];
      let identity: Record<string, unknown> | null = null;
      let rig: Record<string, unknown> | null = null;
      for (const action of CATALOG_ACTIONS) {
        const state = await stageCatalogAction(page, weapon, action);
        const presentation = state.weaponPresentation;
        if (action === 'hip') {
          assertAnatomy(presentation, `${weapon}/catalog-rig`, false);
          expect(presentation.modelKind, `${weapon}: authored model kind`).toBe('project-original-blender');
          expect(presentation.detailsReady, `${weapon}: authored details ready`).toBe(true);
          expect(presentation.importedModel, `${weapon}: imported model`).toMatchObject({
            weapon,
            socketContractReady: true,
          });
          expect(presentation.importedModel.meshes, `${weapon}: imported meshes`).toBeGreaterThan(0);
          expect(presentation.importedModel.triangles, `${weapon}: imported triangles`).toBeGreaterThan(0);
          identity = {
            modelKind: presentation.modelKind,
            firstPersonSource: presentation.firstPersonSource,
            weaponModelId: presentation.weaponModelId,
            weaponFinishId: presentation.weaponFinishId,
            importedSource: presentation.importedModel.source,
            meshes: presentation.importedModel.meshes,
            renderPrimitives: presentation.importedModel.renderPrimitives,
            triangles: presentation.importedModel.triangles,
            socketContractReady: presentation.importedModel.socketContractReady,
          };
          rig = summarizeRig(presentation);
        }
        actionTelemetry.push(summarizeCatalogAction(state, weapon, action));
      }
      catalogTelemetry.push({ weapon, identity, rig, actions: actionTelemetry });
    }
    const runtime = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot().render.runtime);
    expect(runtime).toMatchObject({
      actualBackend: 'webgl2',
      softwareAdapter: false,
      adapterClass: 'WebGL2RenderingContext',
    });
    expect(runtime.adapterLabel).toEqual(expect.any(String));
    expect(runtime.adapterLabel).not.toMatch(/swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic render driver/iu);
    expect(faults).toEqual([]);
    const userAgent = await page.evaluate(() => navigator.userAgent);
    writeFileSync(receiptPath!, `${JSON.stringify({
      schemaVersion: 1,
      status: 'PASS',
      sourceSha: expectedSourceSha,
      servedCandidate,
      browser: { channel: browserChannel, version: browser.version(), userAgent },
      renderer: { requested: 'webgl2', actual: runtime.actualBackend, softwareAdapter: runtime.softwareAdapter },
      adapterLabel: runtime.adapterLabel,
      coverage: {
        viewports: VIEWPORTS,
        actions: ACTIONS,
        frameCount: VIEWPORTS.length * ACTIONS.length,
      },
      frames,
      catalogTelemetry,
      faults,
    }, null, 2)}\n`, 'utf8');
    } finally {
      await context.close();
      await browser.close();
    }
  });
});
