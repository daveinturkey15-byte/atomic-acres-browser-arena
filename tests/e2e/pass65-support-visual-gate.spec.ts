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
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
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

async function startPair(browser: Browser, label: string): Promise<Pair> {
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
  await Promise.all([host, guest].map((page) => page.evaluate(async () => {
    await window.__ATOMIC_ACRES_DEBUG__.selectArena('rustworks-1v1');
  })));
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
  await host.locator('#host').click();
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()), undefined, { timeout: 30_000 });
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
    return state.gameStarted === true && state.matchPhase === 'active';
  }, undefined, { timeout: 45_000 })));
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.remotePlayers.length === 1;
  }, undefined, { timeout: 20_000 })));
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.actors.length >= 1);
  return { context, host, guest, errors };
}

async function state(page: Page): Promise<any> {
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
}

async function clickStrikeMap(page: Page, xRatio: number, yRatio: number): Promise<void> {
  const box = await page.locator('#strike-map').boundingBox();
  if (!box) throw new Error('Targeting map has no bounds');
  await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
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

  test('places replicated red support X markers and keeps the carpet corridor caller-private', async ({ browser }) => {
    test.setTimeout(150_000);
    const pair = await startPair(browser, 'SUPPORT MARKERS');
    const { context, host, guest, errors } = pair;
    try {
      await host.bringToFront();
      await host.locator('#game').click({ position: { x: 100, y: 100 }, force: true });
      await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(15));
      await expect.poll(async () => (await state(host)).fieldSupport.available['care-package']).toBe(true);
      expect((await state(host)).killstreak.actors[0].loadout.slots).toEqual(pass65Loadout.slots);

      // Real player input opens the generalized targeting UI. Escape must
      // refund without creating a runtime or presentation marker.
      await host.keyboard.press('3');
      await expect(host.locator('#strike-map-overlay')).toBeVisible();
      await expect(host.locator('#strike-target-mode')).toHaveText('CARE PACKAGE');
      await expect(host.locator('#strike-target-count')).toHaveText('0 / 1');
      await host.keyboard.press('Escape');
      await expect(host.locator('#strike-map-overlay')).toBeHidden();
      expect((await state(host)).fieldSupport.available['care-package']).toBe(true);
      expect((await state(host)).killstreakPresentation.placementMarkers).toBe(0);

      await host.keyboard.press('3');
      await expect(host.locator('#strike-map-overlay')).toBeVisible();
      await clickStrikeMap(host, 0.56, 0.43);
      await expect(host.locator('#strike-map-overlay')).toBeHidden();
      await expect.poll(async () => (await state(host)).killstreakPresentation.markerDetails
        .filter((marker: any) => marker.source === 'care-package').length).toBe(1);
      await expect.poll(async () => (await state(guest)).killstreakPresentation.markerDetails
        .filter((marker: any) => marker.source === 'care-package').length).toBe(1);
      const hostCare = (await state(host)).killstreakPresentation.markerDetails.find((marker: any) => marker.source === 'care-package');
      const guestCare = (await state(guest)).killstreakPresentation.markerDetails.find((marker: any) => marker.source === 'care-package');
      expect(hostCare).toMatchObject({ shape: 'ground-x', audience: 'all-combatants', halfWidthM: null, depthTest: true, visible: true });
      expect(guestCare).toMatchObject({ id: hostCare.id, anchor: hostCare.anchor, worldPosition: hostCare.worldPosition });
      expect(hostCare.colourHexes).toContain('#ff253f');
      expect(hostCare.worldPosition[1] - hostCare.anchor[1]).toBeGreaterThanOrEqual(0.04);
      expect(hostCare.worldPosition[1] - hostCare.anchor[1]).toBeLessThanOrEqual(0.08);
      expect((await state(guest)).killstreak.placementMarkers.some((marker: any) => marker.shape === 'corridor')).toBe(false);
      await Promise.all([host, guest].map((page) => page.evaluate((anchor: number[]) => {
        window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(anchor[0], anchor[1] + 18, anchor[2], 0, -1.42);
      }, hostCare.anchor)));
      await host.screenshot({ path: resolve(artifactRoot, 'care-ground-x-host.png') });
      await guest.screenshot({ path: resolve(artifactRoot, 'care-ground-x-guest.png') });
      await Promise.all([host, guest].map((page) => page.evaluate(() => {
        window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null);
      })));

      await expect.poll(async () => (await state(host)).killstreakPresentation.markerDetails
        .some((marker: any) => marker.id === hostCare.id), { timeout: 9_000 }).toBe(false);
      await expect.poll(async () => (await state(guest)).killstreakPresentation.markerDetails
        .some((marker: any) => marker.id === hostCare.id), { timeout: 9_000 }).toBe(false);

      await host.keyboard.press('5');
      await expect(host.locator('#strike-map-overlay')).toBeVisible();
      await expect(host.locator('#strike-target-mode')).toHaveText('CARPET BOMBER');
      await clickStrikeMap(host, 0.42, 0.61);
      await expect.poll(async () => (await state(host)).killstreakPresentation.markerDetails.length).toBe(2);
      await expect.poll(async () => (await state(guest)).killstreakPresentation.markerDetails.length).toBe(1);
      const hostCarpetMarkers = (await state(host)).killstreakPresentation.markerDetails;
      const guestCarpetMarkers = (await state(guest)).killstreakPresentation.markerDetails;
      const hostTarget = hostCarpetMarkers.find((marker: any) => marker.shape === 'ground-x');
      const corridor = hostCarpetMarkers.find((marker: any) => marker.shape === 'corridor');
      expect(hostTarget).toMatchObject({ source: 'carpet-bomber', audience: 'all-combatants', halfWidthM: null });
      expect(guestCarpetMarkers[0]).toMatchObject({ id: hostTarget.id, anchor: hostTarget.anchor, worldPosition: hostTarget.worldPosition });
      expect(corridor).toMatchObject({ source: 'carpet-bomber', audience: 'owner-only', depthTest: true, visible: true });
      expect(corridor.halfWidthM).toBeGreaterThan(3.5);
      expect(corridor.halfWidthM).toBeLessThan(7.5);
      expect(corridor.pathStart).not.toBeNull();
      expect(corridor.pathEnd).not.toBeNull();
      expect(guestCarpetMarkers.some((marker: any) => marker.shape === 'corridor')).toBe(false);
      await Promise.all([host, guest].map((page) => page.evaluate((anchor: number[]) => {
        window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(anchor[0], anchor[1] + 18, anchor[2], 0, -1.42);
      }, hostTarget.anchor)));
      await host.screenshot({ path: resolve(artifactRoot, 'carpet-target-and-caller-corridor.png') });
      await guest.screenshot({ path: resolve(artifactRoot, 'carpet-shared-target-guest.png') });
      await Promise.all([host, guest].map((page) => page.evaluate(() => {
        window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null);
      })));

      await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.returnToMainMenu());
      await expect(host.locator('#menu')).toBeVisible();
      expect((await state(host)).killstreakPresentation.placementMarkers).toBe(0);
      await expect.poll(async () => (await state(guest)).killstreakPresentation.placementMarkers, { timeout: 3_000 }).toBe(0);
      expect(errors).toEqual([]);
      writeReceipt('replicated-placement-markers', {
        care: { host: hostCare, guest: guestCare },
        carpet: { host: hostCarpetMarkers, guest: guestCarpetMarkers },
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
      }).toEqual({ chopper: true, piloted: true, swarm: 12 });
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
