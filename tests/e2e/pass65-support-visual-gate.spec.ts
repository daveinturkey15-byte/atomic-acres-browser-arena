import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { resolve } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const peerPort = 9_167;
const artifactRoot = resolve('artifacts/pass65/support-visual-gate');
const pass65Loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});
let peerProcess: ChildProcess | null = null;

test.use({
  launchOptions: {
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--allow-loopback-in-peer-connection',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  },
});

async function peerServerReady(): Promise<boolean> {
  return new Promise((resolveReady) => {
    const request = http.get(`http://127.0.0.1:${peerPort}/peerjs`, (response) => {
      response.resume();
      resolveReady(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.once('error', () => resolveReady(false));
    request.setTimeout(250, () => {
      request.destroy();
      resolveReady(false);
    });
  });
}

test.beforeAll(async () => {
  mkdirSync(artifactRoot, { recursive: true });
  peerProcess = spawn(process.execPath, [
    resolve('node_modules/peer/dist/bin/peerjs.js'),
    '--host', '127.0.0.1',
    '--port', String(peerPort),
    '--path', '/peerjs',
    '--no-allow_discovery',
  ], { cwd: process.cwd(), stdio: 'ignore', windowsHide: true });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await peerServerReady()) return;
    if (peerProcess.exitCode !== null) throw new Error(`Local PeerJS server exited with ${peerProcess.exitCode}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Local PeerJS server did not become ready');
});

test.afterAll(() => {
  if (peerProcess?.exitCode === null) peerProcess.kill();
  peerProcess = null;
});

async function installPointerLockHarness(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('Missing game canvas');
    const harness = { locked: false };
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => harness.locked ? canvas : null,
    });
    // Preserve the browser's real focus signal so admission telemetry records
    // the page state instead of a synthetic always-focused test value.
    Object.defineProperty(canvas, 'requestPointerLock', {
      configurable: true,
      value: () => {
        harness.locked = true;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      },
    });
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: () => {
        harness.locked = false;
        document.dispatchEvent(new Event('pointerlockchange'));
      },
    });
  });
}

function collectPageErrors(page: Page, label: string, errors: string[]): void {
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
}

async function openPeer(context: BrowserContext, name: string, seed: string): Promise<Page> {
  const page = await context.newPage();
  const url = new URL('/', test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest', renderer: 'webgl2', render: 'compat', grass: 'off', mist: 'off', clouds: 'off', rays: 'off',
    multiplayerQa: '1', peerQaPort: String(peerPort), seed, previewTime: '0',
  })) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return debug?.snapshot().weaponReady === true && document.querySelector<HTMLButtonElement>('#host')?.disabled === false;
  }, undefined, { timeout: 30_000 });
  await page.locator('#player-name').fill(name);
  await installPointerLockHarness(page);
  return page;
}

type Pair = Readonly<{
  context: BrowserContext;
  host: Page;
  guest: Page;
  errors: string[];
}>;

async function startPair(browser: Browser, label: string, arenaId = 'rustworks-1v1'): Promise<Pair> {
  const context = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript((loadout) => {
    try { localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(loadout)); } catch { /* about:blank */ }
  }, pass65Loadout);
  const [host, guest] = await Promise.all([
    openPeer(context, `HOST ${label}`, `${label}-host`),
    openPeer(context, `GUEST ${label}`, `${label}-guest`),
  ]);
  const errors: string[] = [];
  collectPageErrors(host, 'host', errors);
  collectPageErrors(guest, 'guest', errors);
  await Promise.all([host, guest].map((page) => page.evaluate(async (selectedArenaId) => {
    await window.__ATOMIC_ACRES_DEBUG__.selectArena(selectedArenaId as any);
  }, arenaId)));
  for (const page of [host, guest]) {
    await page.locator('[data-menu-tab="streaks"]').click();
    for (const [slot, id] of pass65Loadout.slots.entries()) {
      await page.locator(`[data-killstreak-slot="${slot + 1}"]`).selectOption(id);
    }
    await expect(page.locator('[data-killstreak-slot="1"]')).toHaveValue('care-package');
    await expect(page.locator('[data-killstreak-slot="3"]')).toHaveValue('carpet-bomber');
    await page.locator('[data-menu-tab="deploy"]').click();
  }
  await host.locator('#team').selectOption('0');
  await guest.locator('#team').selectOption('1');
  expect(await peerServerReady(), 'Local PeerJS signalling must remain live before host creation').toBe(true);
  await host.locator('#host').click();
  try {
    await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()), undefined, { timeout: 30_000 });
  } catch (error) {
    const diagnostics = await host.evaluate(() => ({
      status: document.querySelector('#network-status')?.textContent?.trim() ?? null,
      snapshot: window.__ATOMIC_ACRES_DEBUG__?.snapshot() ?? null,
    }));
    throw new Error(`Host signalling did not produce a room code: ${JSON.stringify(diagnostics)}`, { cause: error });
  }
  const roomCode = (await host.locator('#room-code').textContent())?.trim() ?? '';
  expect(roomCode.length).toBeGreaterThan(0);
  await guest.locator('#room-input').fill(roomCode);
  await guest.locator('#join').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(
    () => document.querySelectorAll('#lobby-roster .lobby-player').length === 2,
    undefined,
    { timeout: 30_000 },
  )));
  await host.locator('#lobby-ready').click();
  await guest.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return (state.gameStarted === true && state.matchPhase === 'active') || state.bootstrap.stage === 'failed';
  }, undefined, { timeout: 45_000 })));
  const admissionStates = await Promise.all([host, guest].map((page) => page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      bootstrap: snapshot.bootstrap,
      gameStarted: snapshot.gameStarted,
      matchPhase: snapshot.matchPhase,
      networkLifecycle: snapshot.networkLifecycle,
      status: document.querySelector('#network-status')?.textContent?.trim() ?? null,
    };
  })));
  expect(admissionStates, 'Both peers must admit the match without a bootstrap failure').toMatchObject([
    { bootstrap: { stage: 'ready', error: null }, gameStarted: true, matchPhase: 'active' },
    { bootstrap: { stage: 'ready', error: null }, gameStarted: true, matchPhase: 'active' },
  ]);
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.remotePlayers.length === 1;
  }, undefined, { timeout: 20_000 })));
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.actors.length >= 1);
  await Promise.all([host, guest].map((page) => page.waitForFunction((expectedArenaId) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.id === expectedArenaId
  ), arenaId)));
  return { context, host, guest, errors };
}

async function state(page: Page): Promise<any> {
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
}

async function aimCrosshairAtGround(page: Page, xRatio: number, zRatio: number): Promise<number[]> {
  await page.evaluate(({ xRatio: xAlpha, zRatio: zAlpha }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const bounds = api.snapshot().arenaSelection.bounds;
    const x = bounds.minX + (bounds.maxX - bounds.minX) * xAlpha;
    const z = bounds.minZ + (bounds.maxZ - bounds.minZ) * zAlpha;
    api.setCaptureCameraPose(x, 18, z, 0, -1.45);
  }, { xRatio, zRatio });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.crosshairTarget !== null);
  return (await state(page)).fieldSupport.crosshairTarget;
}

async function freezeTopDownMarkerFrame(pages: readonly Page[], anchor: number[]): Promise<void> {
  await Promise.all(pages.map((page) => page.evaluate(async (worldAnchor) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setCaptureCameraPose(worldAnchor[0], worldAnchor[1] + 18, worldAnchor[2], 0, -1.42);
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
    api.setRenderPaused(true);
  }, anchor)));
}

async function releaseMarkerFrame(pages: readonly Page[]): Promise<void> {
  await Promise.all(pages.map((page) => page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setRenderPaused(false);
    api.setCaptureCameraPose(null);
  })));
}

function writeReceipt(name: string, payload: Record<string, unknown>): void {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
  writeFileSync(resolve(artifactRoot, `${name}.receipt.json`), `${JSON.stringify({
    schemaVersion: 1,
    gate: 'pass65-support-visual-gate',
    name,
    sha,
    dirty,
    recordedAt: new Date().toISOString(),
    ...payload,
  }, null, 2)}\n`, 'utf8');
}

test.describe('Pass 65 support visual fail-closed gate', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Representative GPU support-visual gate is Chromium-only.');

  test('places replicated crosshair-selected support X markers and keeps the carpet corridor caller-private', async ({ browser }) => {
    test.setTimeout(150_000);
    const pair = await startPair(browser, 'SUPPORT MARKERS');
    const { context, host, guest, errors } = pair;
    try {
      await host.bringToFront();
      await host.locator('#game').click({ position: { x: 100, y: 100 }, force: true });
      await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(15));
      await expect.poll(async () => (await state(host)).fieldSupport.available['care-package']).toBe(true);
      expect((await state(host)).killstreak.actors[0].loadout.slots).toEqual(pass65Loadout.slots);

      // Care and Carpet use the world-space crosshair, not the Tri-Pass map.
      // Escape must refund without creating a runtime or presentation marker.
      await host.keyboard.press('3');
      await expect(host.locator('#strike-map-overlay')).toBeHidden();
      await expect.poll(async () => (await state(host)).fieldSupport).toMatchObject({
        tacticalMapOpen: false,
        targetingMode: 'care-package',
      });
      await host.keyboard.press('Escape');
      await expect(host.locator('#strike-map-overlay')).toBeHidden();
      await expect.poll(async () => (await state(host)).fieldSupport.targetingMode).toBeNull();
      expect((await state(host)).fieldSupport.available['care-package']).toBe(true);
      expect((await state(host)).killstreakPresentation.placementMarkers).toBe(0);

      await host.keyboard.press('3');
      await expect.poll(async () => (await state(host)).fieldSupport.targetingMode).toBe('care-package');
      const careCrosshairTarget = await aimCrosshairAtGround(host, 0.56, 0.43);
      await host.locator('#game').click({ force: true });
      await expect.poll(async () => (await state(host)).fieldSupport.targetingMode).toBeNull();
      await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null));
      await expect.poll(async () => (await state(host)).killstreakPresentation.markerDetails
        .filter((marker: any) => marker.source === 'care-package').length).toBe(1);
      await expect.poll(async () => (await state(guest)).killstreakPresentation.markerDetails
        .filter((marker: any) => marker.source === 'care-package').length).toBe(1);
      const hostCare = (await state(host)).killstreakPresentation.markerDetails.find((marker: any) => marker.source === 'care-package');
      const guestCare = (await state(guest)).killstreakPresentation.markerDetails.find((marker: any) => marker.source === 'care-package');
      expect(hostCare).toMatchObject({
        shape: 'ground-x', audience: 'all-combatants', halfWidthM: null,
        depthTest: true, writesDepth: false, raycastDisabled: true, visible: true,
      });
      expect(hostCare.maximumOpacity).toBeLessThanOrEqual(0.88);
      expect(guestCare).toMatchObject({ id: hostCare.id, anchor: hostCare.anchor, worldPosition: hostCare.worldPosition });
      expect(hostCare.colourHexes).toContain('#ff253f');
      expect(hostCare.worldPosition[1] - hostCare.anchor[1]).toBeGreaterThanOrEqual(0.04);
      expect(hostCare.worldPosition[1] - hostCare.anchor[1]).toBeLessThanOrEqual(0.08);
      expect((await state(guest)).killstreak.placementMarkers.some((marker: any) => marker.shape === 'corridor')).toBe(false);
      await freezeTopDownMarkerFrame([host, guest], hostCare.anchor);
      await host.screenshot({ path: resolve(artifactRoot, 'care-ground-x-host.png') });
      await guest.screenshot({ path: resolve(artifactRoot, 'care-ground-x-guest.png') });
      await releaseMarkerFrame([host, guest]);

      await expect.poll(async () => (await state(host)).killstreakPresentation.markerDetails
        .some((marker: any) => marker.id === hostCare.id), { timeout: 9_000 }).toBe(false);
      await expect.poll(async () => (await state(guest)).killstreakPresentation.markerDetails
        .some((marker: any) => marker.id === hostCare.id), { timeout: 9_000 }).toBe(false);

      await host.keyboard.press('5');
      await expect(host.locator('#strike-map-overlay')).toBeHidden();
      await expect.poll(async () => (await state(host)).fieldSupport.targetingMode).toBe('carpet-bomber');
      const carpetCrosshairTarget = await aimCrosshairAtGround(host, 0.42, 0.61);
      const [carpetActivationHandle] = await Promise.all([
        host.waitForFunction(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          const aircraft = snapshot.killstreak.entities.find((entity: any) => (
            entity.kind === 'aircraft' && String(entity.id).includes('carpet-aircraft')
          ));
          return snapshot.fieldSupport.targetingMode === null && aircraft?.phase === 'inbound'
            ? { targetingMode: snapshot.fieldSupport.targetingMode, aircraft }
            : false;
        }, undefined, { polling: 16, timeout: 3_000 }),
        host.locator('#game').click({ force: true }),
      ]);
      const carpetActivationState = await carpetActivationHandle.jsonValue() as any;
      expect(carpetActivationState.targetingMode).toBeNull();
      const carpetAircraft = carpetActivationState.aircraft;
      expect(carpetAircraft).toMatchObject({ kind: 'aircraft', phase: 'inbound' });
      await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null));
      await expect.poll(async () => (await state(host)).killstreakPresentation.markerDetails.length).toBe(2);
      await expect.poll(async () => (await state(guest)).killstreakPresentation.markerDetails.length).toBe(1);
      const hostCarpetMarkers = (await state(host)).killstreakPresentation.markerDetails;
      const guestCarpetMarkers = (await state(guest)).killstreakPresentation.markerDetails;
      const hostTarget = hostCarpetMarkers.find((marker: any) => marker.shape === 'ground-x');
      const corridor = hostCarpetMarkers.find((marker: any) => marker.shape === 'corridor');
      expect(hostTarget).toMatchObject({ source: 'carpet-bomber', audience: 'all-combatants', halfWidthM: null });
      expect(guestCarpetMarkers[0]).toMatchObject({ id: hostTarget.id, anchor: hostTarget.anchor, worldPosition: hostTarget.worldPosition });
      expect(corridor).toMatchObject({
        source: 'carpet-bomber', audience: 'owner-only',
        depthTest: true, writesDepth: false, raycastDisabled: true, visible: true,
      });
      expect(corridor.maximumOpacity).toBeLessThanOrEqual(0.84);
      expect(corridor.halfWidthM).toBeGreaterThan(3.5);
      expect(corridor.halfWidthM).toBeLessThan(7.5);
      expect(corridor.pathStart).not.toBeNull();
      expect(corridor.pathEnd).not.toBeNull();
      expect(guestCarpetMarkers.some((marker: any) => marker.shape === 'corridor')).toBe(false);
      await freezeTopDownMarkerFrame([host, guest], hostTarget.anchor);
      await host.screenshot({ path: resolve(artifactRoot, 'carpet-target-and-caller-corridor.png') });
      await guest.screenshot({ path: resolve(artifactRoot, 'carpet-shared-target-guest.png') });
      await releaseMarkerFrame([host, guest]);

      await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.returnToMainMenu());
      await expect(host.locator('#menu')).toBeVisible();
      expect((await state(host)).killstreakPresentation.placementMarkers).toBe(0);
      await expect.poll(async () => (await state(guest)).killstreakPresentation.placementMarkers, { timeout: 3_000 }).toBe(0);
      expect(errors).toEqual([]);
      writeReceipt('replicated-placement-markers', {
        care: { crosshairTarget: careCrosshairTarget, host: hostCare, guest: guestCare },
        carpet: {
          crosshairTarget: carpetCrosshairTarget,
          aircraft: carpetAircraft,
          host: hostCarpetMarkers,
          guest: guestCarpetMarkers,
        },
        browserErrors: errors,
      });
    } finally {
      await context.close();
    }
  });

  test('replicates the authoritative map-spanning Railgun bolt through its admitted building path', async ({ browser }) => {
    test.setTimeout(150_000);
    const pair = await startPair(browser, 'RAILGUN BOLT', 'atomic-acres');
    const { context, host, guest, errors } = pair;
    try {
      await host.bringToFront();
      await host.locator('#game').click({ position: { x: 100, y: 100 }, force: true });
      const acquired = await host.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__ as any;
        const staged = api.stageRailgunSpawn(0);
        if (!staged.pickupPosition) throw new Error('Railgun did not stage a pickup');
        api.teleportPlayer(...staged.pickupPosition);
        const interacted = api.interactRailgun();
        api.teleportPlayer(-17, 1.7, -17, 0, 0);
        api.setAds(true);
        return { interacted, state: api.snapshot() };
      });
      expect(acquired.interacted).toBe(true);
      expect(acquired.state.railgun).toMatchObject({ status: 'held', roundsRemaining: 8, localHolder: true });
      await expect.poll(async () => (await state(guest)).railgun.status).toBe('held');
      await guest.evaluate(() => {
        window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(5, 9, -40, 0.83, -0.22);
      });

      const guestBeamObservation = guest.waitForFunction(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return snapshot.railgun.presentation.activeBeams === 1
          ? { railgun: snapshot.railgun, audio: { railgun: snapshot.audio.railgun } }
          : false;
      }, undefined, { polling: 16, timeout: 3_000 });
      const hostShot = await host.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__ as any;
        api.fireOnce();
        const snapshot = api.snapshot();
        return { railgun: snapshot.railgun, audio: { railgun: snapshot.audio.railgun } };
      });
      expect(hostShot.railgun.roundsRemaining).toBe(7);
      const guestShot = await (await guestBeamObservation).jsonValue() as any;
      await Promise.all([host, guest].map((page) => page.evaluate(() => new Promise<void>((resolveFrame) => {
        requestAnimationFrame(() => {
          window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true);
          resolveFrame();
        });
      }))));
      for (const shot of [hostShot, guestShot]) {
        expect(shot.railgun.presentation).toMatchObject({
          activeBeams: 1,
          beamPresentations: 1,
          lastBeamLengthM: 180,
          visibleDurationMs: 1_000,
          coreRadiusM: 0.32,
          haloRadiusM: 1,
          shockRadiusM: 1.6,
          filamentCount: 3,
          poolCapacity: 6,
          throughGeometry: true,
        });
      }
      expect(guestShot.railgun.presentation.lastAcceptedBeam).toEqual(hostShot.railgun.presentation.lastAcceptedBeam);
      expect(hostShot.railgun.presentation).toMatchObject({ lastPresentationStartOffsetM: 2.4, lastViewer: 'shooter' });
      expect(guestShot.railgun.presentation).toMatchObject({ lastPresentationStartOffsetM: 0, lastViewer: 'peer' });
      expect(hostShot.railgun.presentation.lastAcceptedBeam.shotId).toMatch(/:rail:\d+$/);
      expect(hostShot.audio.railgun).toMatchObject({ local: 1, replicated: 0, layerCount: 10, pressureDuration: 0.62 });
      expect(guestShot.audio.railgun).toMatchObject({ local: 0, replicated: 1, layerCount: 10, pressureDuration: 0.62 });

      const penetrationTrace = await host.evaluate((beam: { start: number[]; end: number[] }) => {
        const direction = beam.end.map((entry, axis) => (entry - beam.start[axis]) / 180) as [number, number, number];
        return (window.__ATOMIC_ACRES_DEBUG__ as any).traceBallistics(
          'railgun',
          beam.start as [number, number, number],
          direction,
          180,
          'atomic-acres',
        );
      }, hostShot.railgun.presentation.lastAcceptedBeam);
      expect(penetrationTrace.reachedDistance).toBe(true);
      expect(penetrationTrace.impacts.some((impact: any) => impact.penetrated && (
        impact.surface.material === 'interior-wall' || impact.surface.material === 'exterior-wall'
      ))).toBe(true);
      expect(penetrationTrace.damageMultiplier).toBe(1);

      await Promise.all([
        host.screenshot({ path: resolve(artifactRoot, 'railgun-map-bolt-shooter.png') }),
        guest.screenshot({ path: resolve(artifactRoot, 'railgun-map-bolt-peer-through-building.png') }),
      ]);
      await Promise.all([host, guest].map((page) => page.evaluate(() => {
        window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false);
      })));
      await expect.poll(async () => (await state(host)).railgun.presentation.activeBeams, { timeout: 3_000 }).toBe(0);
      await expect.poll(async () => (await state(guest)).railgun.presentation.activeBeams, { timeout: 3_000 }).toBe(0);
      expect((await state(host)).railgun.presentation.beamPresentations).toBe(1);
      expect((await state(guest)).railgun.presentation.beamPresentations).toBe(1);
      expect(errors).toEqual([]);
      writeReceipt('replicated-railgun-map-bolt', {
        host: hostShot.railgun.presentation,
        guest: guestShot.railgun.presentation,
        penetrationTrace,
        audio: { host: hostShot.audio.railgun, guest: guestShot.audio.railgun },
        browserErrors: errors,
      });
    } finally {
      await context.close();
    }
  });

  test('projects chopper and drone damage over the authoritative remote victim and suppresses hidden hits', async ({ browser }) => {
    test.setTimeout(150_000);
    const pair = await startPair(browser, 'SUPPORT DAMAGE');
    const { context, host, errors } = pair;
    try {
      await host.bringToFront();
      await host.locator('#game').click({ position: { x: 100, y: 100 }, force: true });
      await host.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        api.earnSupport(15);
        api.aimAtRemoteWithOffset(0.18, 0);
      });
      await host.keyboard.press('4');
      await host.keyboard.press('6');
      await host.keyboard.press('7');
      await expect.poll(async () => {
        const entities = (await state(host)).killstreak.entities;
        return {
          chopper: entities.some((entity: any) => entity.kind === 'chopper'),
          piloted: entities.some((entity: any) => entity.kind === 'drone' && entity.mode === 'piloted'),
          swarm: entities.filter((entity: any) => entity.kind === 'drone' && entity.mode === 'swarm').length,
        };
      }).toEqual({ chopper: true, piloted: true, swarm: 24 });
      await expect.poll(async () => (await state(host)).supportDamageFeedback.visible, { timeout: 20_000 }).toBeGreaterThan(0);
      await expect.poll(async () => [...new Set((await state(host)).supportDamageFeedback.recent
        .map((sample: any) => sample.source))].sort(), { timeout: 35_000 }).toEqual(['chopper', 'drone-swarm', 'piloted-drone']);

      const visibleState = await state(host);
      const remote = visibleState.remotePlayers[0];
      const visibleSample = [...visibleState.supportDamageFeedback.recent].reverse().find((sample: any) => sample.visible);
      expect(visibleSample).toMatchObject({
        targetId: remote.id,
        visible: true,
        reason: 'visible',
        anchorSource: 'authoritative-target-position',
        reticleFallback: false,
      });
      // The guest may already be on a later respawn by the time all three
      // source types have fired. Bind the evidence to the event's life ID and
      // require its host-authored position to remain inside the live arena.
      const bounds = visibleState.arenaSelection.bounds;
      expect(visibleSample.targetLifeId).toBeGreaterThan(0);
      expect(visibleSample.targetPosition.every(Number.isFinite)).toBe(true);
      expect(visibleSample.targetPosition[0]).toBeGreaterThanOrEqual(bounds.minX);
      expect(visibleSample.targetPosition[0]).toBeLessThanOrEqual(bounds.maxX);
      expect(visibleSample.targetPosition[2]).toBeGreaterThanOrEqual(bounds.minZ);
      expect(visibleSample.targetPosition[2]).toBeLessThanOrEqual(bounds.maxZ);
      expect(visibleSample.reticleDistancePx).toBeGreaterThan(20);
      await expect(host.locator('#damage-numbers .support-hit')).not.toHaveCount(0);
      const row = host.locator('#damage-numbers .support-hit').last();
      await expect(row).toHaveAttribute('data-target-id', remote.id);
      await expect(row).toHaveAttribute('data-anchor-source', 'authoritative-target-position');
      const rowAnchor = await row.evaluate((node) => ({
        x: (node as HTMLElement).style.getPropertyValue('--damage-screen-x'),
        y: (node as HTMLElement).style.getPropertyValue('--damage-screen-y'),
      }));
      const rowTelemetry = (await state(host)).supportDamageFeedback.recent.find((sample: any) => sample.visible
        && `${sample.xPx.toFixed(2)}px` === rowAnchor.x
        && `${sample.yPx.toFixed(2)}px` === rowAnchor.y);
      expect(rowTelemetry).toMatchObject({
        targetId: remote.id,
        anchorSource: 'authoritative-target-position',
        reticleFallback: false,
      });
      await expect(host.locator('#hitmarker')).not.toHaveClass(/show/);
      await host.screenshot({ path: resolve(artifactRoot, 'support-damage-victim-anchor.png') });

      await host.locator('#damage-numbers .support-hit').evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
      const suppressedBefore = visibleState.supportDamageFeedback.suppressedBehindCamera
        + visibleState.supportDamageFeedback.suppressedOffscreen;
      await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.aimAtRemoteWithOffset(Math.PI, 0));
      await expect.poll(async () => {
        const feedback = (await state(host)).supportDamageFeedback;
        return feedback.suppressedBehindCamera + feedback.suppressedOffscreen;
      }, { timeout: 20_000 }).toBeGreaterThan(suppressedBefore);
      const hiddenState = await state(host);
      const hiddenSample = [...hiddenState.supportDamageFeedback.recent].reverse()
        .find((sample: any) => !sample.visible && sample.targetId === remote.id);
      expect(hiddenSample).toBeDefined();
      expect(['behind-camera', 'offscreen']).toContain(hiddenSample.reason);
      expect(hiddenSample).toMatchObject({ anchorSource: 'authoritative-target-position', reticleFallback: false });
      expect(hiddenState.supportDamageFeedback.reticleFallbacks).toBe(0);
      await expect(host.locator('#damage-numbers .support-hit')).toHaveCount(0);
      await expect(host.locator('#hitmarker')).not.toHaveClass(/show/);
      await host.screenshot({ path: resolve(artifactRoot, 'support-damage-hidden-suppressed.png') });
      expect(errors).toEqual([]);
      writeReceipt('authoritative-support-damage-feedback', {
        remote,
        visibleSample,
        hiddenSample,
        feedback: hiddenState.supportDamageFeedback,
        browserErrors: errors,
      });
    } finally {
      await context.close();
    }
  });
});
