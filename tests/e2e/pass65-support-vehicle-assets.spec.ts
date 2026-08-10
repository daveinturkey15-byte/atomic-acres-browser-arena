import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const REQUIRED_ASSETS = [
  'pass65-care-aircraft-lod0.glb',
  'pass65-care-aircraft-lod1.glb',
  'pass65-care-aircraft-lod2.glb',
  'pass65-care-crate-lod0.glb',
  'pass65-care-crate-lod1.glb',
  'pass65-carpet-aircraft-lod0.glb',
  'pass65-carpet-aircraft-lod1.glb',
  'pass65-carpet-aircraft-lod2.glb',
  'pass65-chopper-gunner-lod0.glb',
  'pass65-chopper-gunner-lod1.glb',
  'pass65-chopper-gunner-lod2.glb',
].sort();
const PASS65_LOADOUT = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});

type SupportAircraftRenderer = 'webgl2' | 'webgpu';
type SupportAircraftFamily = 'care' | 'carpet';

const requestedRenderer = process.env.PASS69_3_SUPPORT_AIRCRAFT_RENDERER ?? 'webgl2';
if (requestedRenderer !== 'webgl2' && requestedRenderer !== 'webgpu') {
  throw new Error(`Pass 69.3 support-aircraft renderer must be webgl2 or webgpu; received ${requestedRenderer}`);
}
const renderer: SupportAircraftRenderer = requestedRenderer;
const renderProfile = process.env.PASS69_3_SUPPORT_AIRCRAFT_RENDER_PROFILE ?? 'compat';
if (!['compat', 'performance', 'blender'].includes(renderProfile)) {
  throw new Error(`Pass 69.3 support-aircraft render profile is invalid: ${renderProfile}`);
}
const expectedSourceSha = process.env.PASS69_3_SUPPORT_AIRCRAFT_SOURCE_SHA ?? '';
const expectedTarget = process.env.PASS69_3_SUPPORT_AIRCRAFT_TARGET ?? '';
const officialEvidence = expectedSourceSha !== '' || expectedTarget !== '';
const expectedTargetForRenderer = `edge-${renderer}`;
if (officialEvidence && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha)
  || expectedTarget !== expectedTargetForRenderer
  || renderProfile !== 'blender')) {
  throw new Error(`Pass 69.3 support-aircraft evidence has incomplete target provenance for ${expectedTargetForRenderer}`);
}
const supportAircraftOnly = process.env.PASS69_3_SUPPORT_AIRCRAFT_LIVE_ONLY === '1';
const repositoryRoot = process.cwd();
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
}).trim();
const sourceStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
}).trim();
if (officialEvidence && (sourceSha !== expectedSourceSha || sourceStatus !== '')) {
  throw new Error('Pass 69.3 support-aircraft evidence must start from the requested clean exact HEAD');
}
const supportAircraftArtifactBase = resolve(repositoryRoot, 'artifacts/pass69-3/support-aircraft-live');
const supportAircraftArtifactRoot = resolve(supportAircraftArtifactBase, renderer);
const supportAircraftReceiptPath = resolve(supportAircraftArtifactBase, `receipt-${renderer}.json`);
const SUPPORT_AIRCRAFT_LOD_CAPTURES = Object.freeze([
  Object.freeze({ lodIndex: 0, distanceM: 40, label: 'near' }),
  Object.freeze({ lodIndex: 1, distanceM: 120, label: 'mid' }),
  Object.freeze({ lodIndex: 2, distanceM: 220, label: 'far' }),
]);

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function repositoryRelative(path: string): string {
  return relative(repositoryRoot, path).replaceAll('\\', '/');
}

function supportAircraftRoute(): string {
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  return `/?release=latest&renderer=${renderer}${requireWebGpu}&render=${renderProfile}`
    + '&grass=off&mist=off&clouds=off&rays=off&externalServices=off'
    + `&seed=pass69-3-support-aircraft-${renderer}`;
}

async function captureRendererEvidence(page: Page, testInfo: TestInfo): Promise<any> {
  const evidence = await page.evaluate(async (expectedRenderer) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    const gl = expectedRenderer === 'webgl2' ? canvas?.getContext('webgl2') ?? null : null;
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_VENDOR_WEBGL: number;
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    const response = await fetch('/channels/the-big-one/channel-provenance.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Support-aircraft candidate provenance returned HTTP ${response.status}`);
    return {
      userAgent: navigator.userAgent,
      servedCandidate: await response.json(),
      runtime: snapshot.render.runtime,
      contextLifecycle: snapshot.render.contextLifecycle,
      runtimeErrorVisible: document.querySelector<HTMLElement>('#runtime-error')?.hidden === false,
      webgl: gl ? {
        adapterClass: 'WebGL2RenderingContext',
        maskedVendor: String(gl.getParameter(gl.VENDOR)),
        maskedRenderer: String(gl.getParameter(gl.RENDERER)),
        unmaskedVendor: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : null,
        unmaskedRenderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : null,
        version: String(gl.getParameter(gl.VERSION)),
      } : null,
    };
  }, renderer);
  return {
    ...evidence,
    browser: {
      project: testInfo.project.name,
      channel: process.env.QA_INSTALLED_EDGE === '1' ? 'msedge' : 'configured-chromium',
      userAgent: evidence.userAgent,
    },
  };
}

function expectRendererEvidence(evidence: any, label: string): void {
  expect(evidence.runtimeErrorVisible, `${label}: runtime error surface remains hidden`).toBe(false);
  expect(evidence.runtime, `${label}: exact renderer and zero runtime failures`).toMatchObject({
    requestedBackend: renderer,
    actualBackend: renderer,
    initialized: true,
    failClosed: false,
    deviceLost: false,
    uncapturedErrors: 0,
  });
  if (renderer === 'webgpu') {
    expect(evidence.runtime, `${label}: native WebGPU device and healthy presentation`).toMatchObject({
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      presentation: { status: 'healthy' },
    });
    expect(evidence.webgl, `${label}: WebGPU canvas never masquerades as WebGL2`).toBeNull();
  } else {
    expect(evidence.runtime, `${label}: real WebGL2 context and synchronous presentation`).toMatchObject({
      adapterClass: 'WebGL2RenderingContext',
      presentation: { status: 'synchronous' },
    });
    expect(evidence.contextLifecycle, `${label}: zero WebGL context loss`).toEqual({
      lost: false, losses: 0, restorations: 0,
    });
    expect(evidence.webgl, `${label}: raw WebGL2 context evidence`).toMatchObject({
      adapterClass: 'WebGL2RenderingContext',
    });
  }
  if (!officialEvidence) return;
  expect(evidence.browser, `${label}: installed Edge`).toMatchObject({ project: 'chromium', channel: 'msedge' });
  expect(evidence.browser.userAgent, `${label}: Edge user agent`).toMatch(/Edg\//u);
  expect(evidence.runtime.softwareAdapter, `${label}: hardware adapter`).toBe(false);
  expect(evidence.runtime.adapterLabel, `${label}: concrete adapter identity`).toEqual(expect.any(String));
  expect(evidence.runtime.adapterLabel.trim().length, `${label}: non-empty adapter identity`).toBeGreaterThan(0);
  expect(evidence.runtime.adapterLabel, `${label}: non-software adapter label`)
    .not.toMatch(/swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu);
  if (renderer === 'webgl2') {
    expect(evidence.runtime.adapterLabel, `${label}: Windows hardware ANGLE adapter`).toMatch(/ANGLE/iu);
    expect(evidence.webgl?.unmaskedRenderer, `${label}: raw hardware renderer matches runtime identity`)
      .toBe(evidence.runtime.adapterLabel);
  }
  expect(evidence.servedCandidate, `${label}: staged exact source candidate`).toMatchObject({
    schemaVersion: 4,
    channel: 'the-big-one',
    releasePass: 'PASS 69',
    path: 'channels/the-big-one',
    sourceSha,
  });
  expect(evidence.servedCandidate.treeSha256, `${label}: staged tree digest`).toMatch(/^[a-f0-9]{64}$/u);
  expect(evidence.servedCandidate.exactRootFileCount, `${label}: non-empty staged candidate`)
    .toEqual(expect.any(Number));
  expect(evidence.servedCandidate.exactRootFileCount, `${label}: non-empty staged candidate`).toBeGreaterThanOrEqual(2);
}

async function captureLiveAircraftLods(
  page: Page,
  testInfo: TestInfo,
  family: SupportAircraftFamily,
): Promise<any[]> {
  const poolKey = `${family}-aircraft`;
  const captures: any[] = [];
  for (const capture of SUPPORT_AIRCRAFT_LOD_CAPTURES) {
    await page.evaluate(({ expectedPoolKey, distanceM }) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      const snapshot = debug.snapshot() as any;
      const detail = snapshot.killstreakPresentation.entityDetails
        .find((entry: any) => entry.poolKey === expectedPoolKey);
      if (!detail) throw new Error(`${expectedPoolKey}: live aircraft disappeared before LOD capture`);
      const entity = snapshot.killstreak.entities.find((entry: any) => entry.id === detail.entityId);
      if (!entity || !Number.isFinite(entity.attitude?.[1])) {
        throw new Error(`${expectedPoolKey}: live aircraft attitude disappeared before LOD capture`);
      }
      const [x, y, z] = detail.worldPosition;
      const yaw = entity.attitude[1];
      const cameraHeightM = 6;
      debug.setCaptureCameraPose(
        x + Math.sin(yaw) * distanceM,
        y + cameraHeightM,
        z + Math.cos(yaw) * distanceM,
        yaw,
        Math.atan2(-cameraHeightM, distanceM),
        35,
      );
    }, { expectedPoolKey: poolKey, distanceM: capture.distanceM });
    await page.waitForFunction(({ expectedPoolKey, expectedLod }) => {
      const detail = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation.entityDetails
        .find((entry: any) => entry.poolKey === expectedPoolKey);
      return detail?.visible === true
        && detail.presentationSource === 'project-original-blender-glb'
        && detail.activeLodIndex === expectedLod
        && detail.activeAircraftWing?.contract === 'visible-rendered-wing-span-v1'
        && detail.activeAircraftWing?.passed === true
        && detail.activeAircraftWing?.visibleMeshCount > 0;
    }, { expectedPoolKey: poolKey, expectedLod: capture.lodIndex }, { timeout: 5_000 });
    const presentation = await page.evaluate((expectedPoolKey) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      const detail = snapshot.killstreakPresentation.entityDetails
        .find((entry: any) => entry.poolKey === expectedPoolKey);
      const camera = snapshot.deterministicReview;
      const dx = detail.worldPosition[0] - camera.captureCameraX;
      const dy = detail.worldPosition[1] - camera.captureCameraY;
      const dz = detail.worldPosition[2] - camera.captureCameraZ;
      return {
        ...detail,
        cameraPosition: [camera.captureCameraX, camera.captureCameraY, camera.captureCameraZ],
        cameraDistanceM: Number(Math.hypot(dx, dy, dz).toFixed(3)),
      };
    }, poolKey);
    expect(presentation.activeLodIndex, `${family} ${capture.label}: exact live LOD`).toBe(capture.lodIndex);
    expect(presentation.activeLodName, `${family} ${capture.label}: authored LOD root`)
      .toMatch(new RegExp(`-${family === 'care' ? 'care-package' : 'carpet-bomber'}-aircraft-authored-lod${capture.lodIndex}$`, 'u'));
    expect(presentation.activeLodAsset, `${family} ${capture.label}: exact GLB`)
      .toMatch(new RegExp(`pass65-${family}-aircraft-lod${capture.lodIndex}\\.glb$`, 'u'));
    expect(presentation.activeAircraftWing, `${family} ${capture.label}: visible rendered wings`).toMatchObject({
      contract: 'visible-rendered-wing-span-v1',
      family,
      passed: true,
    });
    expect(presentation.activeAircraftWing.visibleMeshCount).toBeGreaterThan(0);
    expect(presentation.activeAircraftWing.lateralSpanRatio).toBeGreaterThanOrEqual(0.65);
    const screenshotPath = resolve(
      supportAircraftArtifactRoot,
      `${family}-lod${capture.lodIndex}-${capture.label}.png`,
    );
    const screenshot = await page.screenshot({ path: screenshotPath, animations: 'allow' });
    await testInfo.attach(`support-${family}-lod${capture.lodIndex}-${renderer}`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
    captures.push(Object.freeze({
      family,
      label: capture.label,
      expectedDistanceM: capture.distanceM,
      lodIndex: capture.lodIndex,
      presentation,
      screenshot: Object.freeze({
        path: repositoryRelative(screenshotPath),
        sha256: sha256(screenshot),
      }),
    }));
  }
  return captures;
}

test('loads and prewarms the exact authored support-vehicle family before deployment', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  mkdirSync(supportAircraftArtifactRoot, { recursive: true });
  const browserErrors: string[] = [];
  const assetResponses = new Map<string, number>();
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('response', (response) => {
    const match = response.url().match(/\/(pass65-(?:care|carpet|chopper)[^/]+\.glb)$/);
    if (match) assetResponses.set(match[1], response.status());
  });

  await page.addInitScript((loadout) => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(loadout));
  }, PASS65_LOADOUT);
  await page.goto(supportAircraftRoute());
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__));
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as {
      gameStarted: boolean;
      supportVehiclePresentation?: { state: string; readyFamilies: string[] };
      killstreakPresentation?: { prewarmedAuthoredSupportFamilies: string[] };
    };
    return snapshot.gameStarted
      && snapshot.supportVehiclePresentation?.state === 'ready'
      && snapshot.supportVehiclePresentation.readyFamilies.length === 4
      && snapshot.killstreakPresentation?.prewarmedAuthoredSupportFamilies.length === 4;
  }, undefined, { timeout: 45_000 });

  const telemetry = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as {
      supportVehiclePresentation: {
        state: string;
        requiredAssets: string[];
        loadedAssets: string[];
        readyFamilies: string[];
        maxConcurrentDecodes: number;
        failures: Record<string, string>;
        aircraftWings: Record<string, Array<{
          contract: string;
          family: string;
          visibleMeshCount: number;
          span: [number, number, number];
          aircraftSpan: [number, number, number];
          lateralSpanRatio: number;
          passed: boolean;
        }>>;
      };
      killstreakPresentation: {
        prewarmed: number;
        prewarmedAuthoredSupportFamilies: string[];
      };
    };
    return {
      ...snapshot.supportVehiclePresentation,
      prewarmed: snapshot.killstreakPresentation.prewarmed,
      prewarmedAuthoredSupportFamilies: snapshot.killstreakPresentation.prewarmedAuthoredSupportFamilies,
    };
  });
  expect(telemetry).toMatchObject({
    state: 'ready',
    readyFamilies: ['care', 'carpet', 'chopper', 'crate'],
    failures: {},
    maxConcurrentDecodes: 2,
    prewarmed: 6,
    prewarmedAuthoredSupportFamilies: ['care', 'carpet', 'chopper', 'crate'],
  });
  expect(telemetry.requiredAssets.map((asset) => asset.split('/').at(-1)).sort()).toEqual(REQUIRED_ASSETS);
  expect(telemetry.loadedAssets.map((asset) => asset.split('/').at(-1)).sort()).toEqual(REQUIRED_ASSETS);
  expect([...assetResponses.keys()].sort()).toEqual(REQUIRED_ASSETS);
  expect([...assetResponses.values()].every((status) => status === 200)).toBe(true);
  const rendererBefore = await captureRendererEvidence(page, testInfo);
  expectRendererEvidence(rendererBefore, 'before support-aircraft flyovers');
  expect(Object.keys(telemetry.aircraftWings).sort()).toEqual(['care', 'carpet']);
  for (const family of ['care', 'carpet']) {
    const lods = telemetry.aircraftWings[family]!;
    expect(lods).toHaveLength(3);
    for (const wing of lods) {
      expect(wing).toMatchObject({
        contract: 'visible-rendered-wing-span-v1',
        family,
        passed: true,
      });
      expect(wing.visibleMeshCount).toBeGreaterThan(0);
      expect(wing.span[0]).toBeGreaterThan(wing.span[2] * 0.8);
      expect(wing.lateralSpanRatio).toBeGreaterThanOrEqual(0.65);
    }
  }
  const aircraftActivations = await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.earnSupport(15);
    const position = (debug.snapshot() as any).player.position as number[];
    const target: [number, number, number] = [position[0] + 12, 0, position[2] + 12];
    return {
      care: debug.activateKillstreak('care-package', target),
      carpet: debug.activateKillstreak('carpet-bomber', target, [1, 0, 0]),
    };
  });
  expect(aircraftActivations).toEqual({ care: true, carpet: true });
  await page.waitForFunction(() => {
    const details = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation.entityDetails as any[];
    return ['care-aircraft', 'carpet-aircraft'].every((poolKey) => details.some((entry) => (
      entry.poolKey === poolKey
      && entry.presentationSource === 'project-original-blender-glb'
      && entry.visible === true
      && entry.visibleMeshCount > 0
      && entry.visibleBounds !== null
    )));
  }, undefined, { timeout: 10_000 });
  const activeAircraft = await page.evaluate(() => (
    (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation.entityDetails as any[]
  ).filter((entry) => entry.poolKey === 'care-aircraft' || entry.poolKey === 'carpet-aircraft'));
  expect(new Set(activeAircraft.map((entry: any) => entry.poolKey))).toEqual(new Set(['care-aircraft', 'carpet-aircraft']));
  for (const aircraft of activeAircraft) {
    expect(aircraft).toMatchObject({
      presentationSource: 'project-original-blender-glb',
      visible: true,
    });
    expect(aircraft.visibleMeshCount).toBeGreaterThan(0);
    expect(aircraft.visibleBounds).not.toBeNull();
  }
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraFarPlane(360));
  const lodCaptures = [
    ...await captureLiveAircraftLods(page, testInfo, 'care'),
    ...await captureLiveAircraftLods(page, testInfo, 'carpet'),
  ];
  expect(lodCaptures).toHaveLength(6);
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null);
    window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraFarPlane(null);
  });
  const rendererAfter = await captureRendererEvidence(page, testInfo);
  expectRendererEvidence(rendererAfter, 'after support-aircraft LOD captures');
  expect(browserErrors).toEqual([]);
  if (officialEvidence) {
    const endingSourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
    }).trim();
    const endingSourceStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
    }).trim();
    expect(endingSourceSha, 'support-aircraft exact source remains fixed').toBe(sourceSha);
    expect(endingSourceStatus, 'support-aircraft source remains clean').toBe('');
    writeFileSync(supportAircraftReceiptPath, `${JSON.stringify({
      schemaVersion: 1,
      status: 'PASS',
      contract: 'atomic-acres/pass69-3-support-aircraft-live@1',
      evidenceScope: 'care-and-carpet-live-authored-near-mid-far-wing-presentation',
      target: expectedTarget,
      sourceSha,
      endingSourceSha,
      cleanSource: sourceStatus === '' && endingSourceStatus === '',
      renderer,
      renderProfile,
      browser: rendererAfter.browser,
      servedCandidate: rendererBefore.servedCandidate,
      runtimeBefore: rendererBefore.runtime,
      runtimeAfter: rendererAfter.runtime,
      contextLifecycleBefore: rendererBefore.contextLifecycle,
      contextLifecycleAfter: rendererAfter.contextLifecycle,
      webglBefore: rendererBefore.webgl,
      webglAfter: rendererAfter.webgl,
      runtimeErrorVisibleBefore: rendererBefore.runtimeErrorVisible,
      runtimeErrorVisibleAfter: rendererAfter.runtimeErrorVisible,
      aircraftWings: telemetry.aircraftWings,
      liveAircraft: activeAircraft,
      lodCaptures,
      browserErrors,
    }, null, 2)}\n`, 'utf8');
  }
  if (supportAircraftOnly) return;
  expect(await page.evaluate(() => {
    return window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper');
  })).toBe(true);
  await page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
    .some((entity: any) => entity.kind === 'chopper' && entity.phase === 'orbiting'));
  // Exercise the same host control intent as the owned streak slot. Slot-key
  // input admission is covered separately; this asset gate remains focused on
  // first-person authored presentation and firing actions.
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await page.waitForFunction(() => Boolean(
    (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation.firstPersonSightline,
  ));
  expect(await page.evaluate(() => {
    const presentation = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation;
    return {
      active: presentation.activeChopperActionNames,
      pooled: presentation.pooledChopperActionNames,
    };
  })).toEqual({ active: [
    'Chopper_Gun_Fire',
    'Chopper_Gun_Recoil',
    'Chopper_Impact_Pulse',
    'Chopper_Muzzle_Flash',
    'Chopper_Tracer_Pulse',
  ], pooled: [
    'Chopper_Gun_Fire',
    'Chopper_Gun_Recoil',
    'Chopper_Impact_Pulse',
    'Chopper_Muzzle_Flash',
    'Chopper_Tracer_Pulse',
  ] });
  const canvasBounds = await page.locator('#game').boundingBox();
  if (!canvasBounds) throw new Error('Game canvas has no rendered bounds');
  const actionRegion = {
    x: canvasBounds.x + canvasBounds.width * 0.3,
    y: canvasBounds.y + canvasBounds.height * 0.3,
    width: canvasBounds.width * 0.4,
    height: canvasBounds.height * 0.55,
  };
  const beforeWeaponAction = await page.screenshot({ clip: actionRegion, animations: 'allow' });
  const beforeWeaponCanvas = await page.locator<HTMLCanvasElement>('#game').evaluate((canvas) => canvas.toDataURL('image/png'));
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setTriggerHeld(true));
  const expectedWeaponActions = [
    'Chopper_Gun_Recoil',
    'Chopper_Gun_Fire',
    'Chopper_Muzzle_Flash',
    'Chopper_Tracer_Pulse',
  ];
  const actionEvidence = await page.evaluate(async (names) => new Promise<{
    playback: any[];
    canvasFrame: string;
  }>((resolveEvidence, rejectEvidence) => {
    const deadline = performance.now() + 5_000;
    const inspect = () => {
      const presentation = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation;
      const playback = presentation.chopperActionPlayback.filter((action: any) => (
        action.visible && action.running && action.timeSeconds > 0 && action.effectiveWeight > 0
      ));
      if (presentation.chopperWeaponActionsPresented > 0 && names.every((name) => (
        playback.some((action: any) => action.name === name)
      ))) {
        const canvas = document.querySelector<HTMLCanvasElement>('#game');
        if (!canvas) return rejectEvidence(new Error('Game canvas disappeared during Chopper action'));
        return resolveEvidence({ playback, canvasFrame: canvas.toDataURL('image/png') });
      }
      if (performance.now() >= deadline) return rejectEvidence(new Error('Visible authored Chopper actions did not enter playback'));
      requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  }), expectedWeaponActions);
  const actionPlayback = actionEvidence.playback;
  expect([...new Set(actionPlayback.map((action: any) => action.name))].sort()).toEqual([...expectedWeaponActions].sort());
  expect(actionPlayback.every((action: any) => action.clipDurationSeconds > action.timeSeconds)).toBe(true);
  expect(actionPlayback.every((action: any) => /authored-lod\d+$/u.test(action.lodRootName))).toBe(true);
  expect(actionEvidence.canvasFrame).not.toBe(beforeWeaponCanvas);
  const duringWeaponAction = await page.screenshot({ clip: actionRegion, animations: 'allow' });
  expect(Buffer.compare(beforeWeaponAction, duringWeaponAction)).not.toBe(0);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setTriggerHeld(false));
  const weaponActions = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
  ).killstreakPresentation.lastChopperWeaponActions);
  expect(weaponActions).toEqual([
    'Chopper_Gun_Recoil',
    'Chopper_Gun_Fire',
    'Chopper_Muzzle_Flash',
    'Chopper_Tracer_Pulse',
  ]);
  const evidenceDir = resolve(process.cwd(), 'artifacts/pass69/chopper-gunner');
  mkdirSync(evidenceDir, { recursive: true });
  const screenshot = resolve(evidenceDir, 'first-person-weapon-action.png');
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  await testInfo.attach('chopper-first-person-weapon-action', { path: screenshot, contentType: 'image/png' });
  const sightline = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
  ).killstreakPresentation.firstPersonSightline);
  expect(sightline).toMatchObject({
    presentationSource: 'project-original-blender-glb',
    visibleOutsideSightline: [],
    hudVisible: true,
    weaponVisible: true,
  });
  expect(sightline.visibleMeshNames.length).toBeGreaterThan(0);
  expect(browserErrors).toEqual([]);
});
