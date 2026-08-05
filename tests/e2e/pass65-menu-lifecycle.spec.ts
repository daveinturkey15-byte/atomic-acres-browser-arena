import { mkdirSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

type PointerLockMode = 'resolve' | 'reject' | 'transient';
type ArenaId = 'atomic-acres' | 'skyline-terminal' | 'rustworks-1v1' | 'gun-range';

const peerPort = 9_165;
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

async function ready(
  page: Page,
  reducedMotion = false,
  extraParams: Readonly<Record<string, string>> = {},
): Promise<void> {
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  const url = new URL('/', test.info().project.use.baseURL as string);
  const params = {
    release: 'latest', renderer: 'webgl2', render: 'compat', grass: 'off', mist: 'off', clouds: 'off', rays: 'off',
    seed: 'pass65-menu-lifecycle', previewTime: '0', ...extraParams,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return debug?.snapshot().weaponReady === true && solo?.disabled === false;
  }, undefined, { timeout: 30_000 });
}

async function installPointerLockHarness(page: Page, mode: PointerLockMode): Promise<void> {
  await page.evaluate((initialMode) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('Missing game canvas');
    const harness = {
      mode: initialMode,
      locked: false,
      focused: true,
      requests: 0,
      losses: 0,
    };
    Object.defineProperty(window, '__PASS65_POINTER_LOCK__', { configurable: true, value: harness });
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => harness.locked ? canvas : null,
    });
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => harness.focused,
    });
    Object.defineProperty(canvas, 'requestPointerLock', {
      configurable: true,
      value: () => {
        harness.requests += 1;
        if (harness.mode === 'reject') return Promise.reject(new DOMException('QA rejection', 'NotAllowedError'));
        if (harness.mode === 'transient') {
          document.dispatchEvent(new Event('pointerlockchange'));
          queueMicrotask(() => {
            harness.locked = true;
            document.dispatchEvent(new Event('pointerlockchange'));
          });
          return Promise.resolve();
        }
        harness.locked = true;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      },
    });
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: () => {
        if (!harness.locked) return;
        harness.locked = false;
        harness.losses += 1;
        document.dispatchEvent(new Event('pointerlockchange'));
      },
    });
  }, mode);
}

async function lifecycle(page: Page): Promise<Record<string, any>> {
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().menuLifecycle as Record<string, any>);
}

type CountdownAnimationEvent = Readonly<{ cue: string; sequence: number; animationName: string }>;

async function installCountdownAnimationProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const countdown = document.querySelector<HTMLElement>('#countdown');
    if (!countdown) throw new Error('Missing match countdown');
    const events: CountdownAnimationEvent[] = [];
    Object.defineProperty(window, '__PASS65_COUNTDOWN_ANIMATIONS__', { configurable: true, value: events });
    countdown.addEventListener('animationstart', (event) => {
      if (!event.animationName.startsWith('pass65CountdownBeat') && event.animationName !== 'countdownBeat') return;
      events.push({
        cue: countdown.dataset.cue ?? '',
        sequence: Number(countdown.dataset.cueSequence ?? 0),
        animationName: event.animationName,
      });
    });
  });
}

async function countdownAnimations(page: Page): Promise<CountdownAnimationEvent[]> {
  return page.evaluate(() => [...((window as unknown as {
    __PASS65_COUNTDOWN_ANIMATIONS__: CountdownAnimationEvent[];
  }).__PASS65_COUNTDOWN_ANIMATIONS__ ?? [])]);
}

async function startFromMenu(page: Page): Promise<void> {
  await page.locator('#player-name').fill('PASS65 QA');
  await page.locator('#solo').click();
  const transition = page.locator('#deployment-transition');
  await expect(transition).toBeVisible();
  // Pass 68 deployment transition: uses data-active, loading stages, and
  // dedicated video surface outside #menu. The old pass65-era attributes
  // (data-live-render, data-media, data-ready-at) are retired.
  await expect(transition).toHaveAttribute('data-active', 'true');
  await expect(page.locator('#deployment-transition-video')).toBeHidden();
  // Wait for deployment loading to complete before the transition hides.
  await expect.poll(async () => (await lifecycle(page)).matchReadyCount, { timeout: 15_000 }).toBe(1);
  // Post-deployment: menu stays in layout but is inert/aria-hidden during
  // deployment; transition hides once deploying phase ends.
  await expect(page.locator('#menu')).toBeHidden();
  await expect(transition).toBeHidden({ timeout: 45_000 });
  await expect.poll(async () => (await lifecycle(page)).visibilityChangeCount).toBe(1);
}

async function setHarness(page: Page, patch: Partial<{ mode: PointerLockMode; locked: boolean; focused: boolean }>): Promise<void> {
  await page.evaluate((next) => {
    const harness = (window as unknown as {
      __PASS65_POINTER_LOCK__: { mode: PointerLockMode; locked: boolean; focused: boolean };
    }).__PASS65_POINTER_LOCK__;
    Object.assign(harness, next);
  }, patch);
}

async function selectArena(page: Page, arenaId: ArenaId): Promise<void> {
  await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.selectArena(id), arenaId);
  await expect(page.locator(`.map-card[data-arena-id="${arenaId}"]`)).toHaveAttribute('aria-pressed', 'true');
}

function collectUnexpectedBrowserErrors(page: Page, label: string): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(`${label}: ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${label}: HTTP ${response.status()} ${response.url()}`);
  });
  return errors;
}

async function installGameCanvasReadbackTripwire(page: Page): Promise<void> {
  await page.evaluate(() => {
    const gameCanvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!gameCanvas) throw new Error('Missing game canvas for readback tripwire');
    const telemetry = { attempts: 0, operations: [] as string[] };
    Object.defineProperty(window, '__PASS65_GAME_CANVAS_READBACK_TRIPWIRE__', {
      configurable: true,
      value: telemetry,
    });
    const rejectReadback = (operation: string): never => {
      telemetry.attempts += 1;
      telemetry.operations.push(operation);
      throw new DOMException(`QA blocked game-canvas ${operation}`, 'SecurityError');
    };

    const contextPrototype = CanvasRenderingContext2D.prototype as any;
    const originalDrawImage = contextPrototype.drawImage as CanvasRenderingContext2D['drawImage'];
    contextPrototype.drawImage = function (...args: any[]) {
      if (args[0] === gameCanvas) return rejectReadback('drawImage');
      return originalDrawImage.apply(this, args);
    };
    const originalCreatePattern = contextPrototype.createPattern as CanvasRenderingContext2D['createPattern'];
    contextPrototype.createPattern = function (...args: any[]) {
      if (args[0] === gameCanvas) return rejectReadback('createPattern');
      return originalCreatePattern.apply(this, args);
    };

    const canvasPrototype = HTMLCanvasElement.prototype as any;
    const originalToDataUrl = canvasPrototype.toDataURL as HTMLCanvasElement['toDataURL'];
    canvasPrototype.toDataURL = function (...args: any[]) {
      if (this === gameCanvas) return rejectReadback('toDataURL');
      return originalToDataUrl.apply(this, args);
    };
    const originalToBlob = canvasPrototype.toBlob as HTMLCanvasElement['toBlob'];
    canvasPrototype.toBlob = function (...args: any[]) {
      if (this === gameCanvas) return rejectReadback('toBlob');
      return originalToBlob.apply(this, args);
    };

    const originalCreateImageBitmap = window.createImageBitmap?.bind(window);
    if (originalCreateImageBitmap) {
      Object.defineProperty(window, 'createImageBitmap', {
        configurable: true,
        value: (source: ImageBitmapSource, ...args: any[]) => {
          if (source === gameCanvas) return rejectReadback('createImageBitmap');
          return originalCreateImageBitmap(source, ...args);
        },
      });
    }
  });
}

async function gameCanvasReadbackAttempts(page: Page): Promise<number> {
  return page.evaluate(() => Number((window as any).__PASS65_GAME_CANVAS_READBACK_TRIPWIRE__?.attempts ?? 0));
}

async function disablePauseBackdropCompositor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const originalSupports = CSS.supports.bind(CSS);
    Object.defineProperty(CSS, 'supports', {
      configurable: true,
      value: (propertyOrCondition: string, value?: string) => {
        if (propertyOrCondition.includes('backdrop-filter')) return false;
        return value === undefined
          ? originalSupports(propertyOrCondition)
          : originalSupports(propertyOrCondition, value);
      },
    });
  });
}

async function openMultiplayerPeer(context: BrowserContext, name: string, seed: string): Promise<Page> {
  const page = await context.newPage();
  await ready(page, false, {
    multiplayerQa: '1',
    peerQaPort: String(peerPort),
    seed,
  });
  await page.locator('#player-name').fill(name);
  await installPointerLockHarness(page, 'resolve');
  return page;
}

test.describe('Pass 65 active-match menu lifecycle', () => {
  test('persists exactly three custom loadouts with primary, secondary, and one grenade', async ({ page }) => {
    await ready(page);
    await page.locator('[data-menu-tab="kit"]').click();
    await expect(page.locator('[data-kit-id]')).toHaveCount(4);
    await expect(page.locator('[data-custom-preset-id]')).toHaveCount(3);
    // Pass 68: standalone Manage/Rename card is retired. Each preset card
    // has an EDIT row ([data-custom-modify]) that opens the loadout manager.
    await page.locator('[data-custom-preset-id="custom-2"] [data-custom-modify]').click();
    await expect(page.locator('#loadout-manager')).toBeVisible();
    await page.locator('#loadout-manage-preset').selectOption('custom-2');
    await page.locator('#loadout-preset-name').fill('Night Ops');
    await page.locator('#loadout-primary').selectOption('minigun');
    await page.locator('#loadout-secondary').selectOption('explosive-crossbow');
    await page.locator('#loadout-grenade').selectOption('smoke');
    await page.locator('#loadout-save').click();
    await page.locator('[data-custom-preset-id="custom-2"]').click();

    const selected = page.locator('[data-custom-preset-id="custom-2"]');
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(selected.locator('[data-custom-name]')).toHaveText('Night Ops');
    await expect(selected.locator('[data-custom-equipment]')).toContainText('M134 Minigun');
    await expect(selected.locator('[data-custom-equipment]')).toContainText('TAC-15 Explosive Crossbow');
    await expect(selected.locator('[data-custom-equipment]')).toContainText('SMOKE');
    expect(await page.evaluate(() => {
      const player = window.__ATOMIC_ACRES_DEBUG__.snapshot().player as Record<string, unknown>;
      return {
        primary: player.primaryWeapon,
        secondary: player.secondaryWeapon,
        grenade: player.selectedGrenade,
        grenades: player.grenades,
      };
    })).toEqual({ primary: 'minigun', secondary: 'explosive-crossbow', grenade: 'smoke', grenades: 1 });

    await page.reload();
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
    await page.locator('[data-menu-tab="kit"]').click();
    await expect(page.locator('[data-custom-preset-id="custom-2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-custom-preset-id="custom-2"] [data-custom-name]')).toHaveText('Night Ops');
  });

  test('keeps pre-match helo/cat preview ownership and reduced-motion accessibility', async ({ page }) => {
    await ready(page, true);
    await expect(page.locator('#menu')).toHaveAttribute('data-lifecycle-surface', 'pre-match');
    await expect(page.locator('#menu')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#menu-preview-frame')).toBeVisible();
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-motion', 'static');
    await expect(page.locator('#menu-showcase > #game')).toHaveCount(0);
    await expect(page.locator('#menu-preview-poster')).toBeVisible();
    await expect(page.locator('#menu-preview-video source')).toHaveCount(0);
    await expect(page.locator('#match-pause-backdrop')).toBeHidden();
    await expect(page.locator('img[src*="atomic-acres-menu-squad-joke"]')).toHaveCount(0);
  });

  test('hides once through rejected/transient-null requests and Resume never bounces', async ({ page }, testInfo) => {
    await ready(page);
    await installPointerLockHarness(page, 'reject');
    await startFromMenu(page);

    await expect.poll(async () => (await lifecycle(page)).pointerLock).toBe('denied');
    expect(await lifecycle(page)).toMatchObject({
      surface: 'hidden',
      visibilityChangeCount: 1,
      pauseOpenCount: 0,
      pointerRequestCount: 1,
      pointerRejectCount: 1,
    });
    await page.evaluate(() => document.dispatchEvent(new Event('pointerlockchange')));
    expect(await lifecycle(page)).toMatchObject({ surface: 'hidden', visibilityChangeCount: 1, pauseOpenCount: 0 });

    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
    const activeFrame = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
    await page.waitForFunction((frame) => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount > frame + 5, activeFrame);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.openMenu());
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#resume')).toBeFocused();
    await expect(page.locator('#resume')).toHaveText('RETURN TO MATCH');
    await page.locator('#resume').hover();
    const resumeStyle = await page.locator('#resume').evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
    }));
    // Pass 68 restyles the resume button; assert it renders with a visible
    // opaque background (not transparent/initial) and legible text, rather
    // than pinning to fragile pass65-era exact RGB values.
    expect(resumeStyle.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(resumeStyle.background).not.toBe('transparent');
    expect(resumeStyle.color).not.toBe('rgba(0, 0, 0, 0)');
    expect(resumeStyle.color).not.toBe('transparent');
    await expect(page.locator('#menu-preview-frame')).toBeHidden();
    await expect(page.locator('#match-pause-backdrop')).toBeVisible();
    const backdrop = await lifecycle(page).then((state) => state.backdrop as Record<string, any>);
    expect(backdrop).toMatchObject({
      visible: true,
      provenance: 'pause-only-renderer-canvas',
      captureStatus: 'pause-snapshot',
      captureReason: 'debug-pause',
      sourceCanvas: 'game',
      sourceArena: 'atomic-acres',
      contract: 'game-canvas-css-compositor-v1',
      periodicReadbackCount: 0,
      sourceCaptureAttemptCount: 1,
      sourceCaptureCount: 1,
      presentationCount: 1,
      fallbackCount: 0,
      capturedFromSurface: 'hidden',
      capturedBeforeMenuVisible: true,
    });
    expect(backdrop.sourceFrame).toBeGreaterThan(0);
    expect(await page.locator('#match-pause-frame-fallback').evaluate((element) => getComputedStyle(element).filter)).toContain('blur(12px)');
    await expect(page.locator('#match-pause-frame-fallback')).toBeVisible();
    expect(await page.locator('#match-pause-backdrop').evaluate((element) => element.tagName)).toBe('DIV');
    expect(await page.locator('#game').evaluate((element) => getComputedStyle(element).visibility)).toBe('visible');
    await expect(page.locator('img[src*="atomic-acres-menu-squad-joke"]')).toHaveCount(0);

    const directory = resolve(process.cwd(), 'artifacts/pass65/menu-lifecycle');
    mkdirSync(directory, { recursive: true });
    const screenshot = resolve(directory, 'held-match-pause-rejected-lock.png');
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    await testInfo.attach('held-match-pause-rejected-lock', { path: screenshot, contentType: 'image/png' });

    await page.locator('#resume').click();
    await expect(page.locator('#menu')).toBeHidden();
    await expect.poll(async () => (await lifecycle(page)).pointerLock).toBe('denied');
    await page.waitForTimeout(150);
    expect(await lifecycle(page)).toMatchObject({
      surface: 'hidden',
      visibilityChangeCount: 3,
      pauseOpenCount: 1,
      pointerRequestCount: 2,
      pointerRejectCount: 2,
    });
    await expect(page.locator('#menu')).toHaveAttribute('aria-hidden', 'true');
  });

  test('distinguishes focus suspension from a real Escape lock loss', async ({ page }) => {
    await ready(page);
    await installPointerLockHarness(page, 'transient');
    await startFromMenu(page);
    await expect.poll(async () => (await lifecycle(page)).pointerLock).toBe('locked');
    expect(await lifecycle(page)).toMatchObject({ surface: 'hidden', visibilityChangeCount: 1, pauseOpenCount: 0 });

    await setHarness(page, { focused: false });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      const harness = (window as unknown as { __PASS65_POINTER_LOCK__: { locked: boolean } }).__PASS65_POINTER_LOCK__;
      harness.locked = false;
      document.dispatchEvent(new Event('pointerlockchange'));
    });
    expect(await lifecycle(page)).toMatchObject({ surface: 'hidden', pointerLock: 'focus-suspended', pauseOpenCount: 0 });
    await setHarness(page, { focused: true });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    expect(await lifecycle(page)).toMatchObject({ surface: 'hidden', pointerLock: 'unlocked', reason: 'focus-return' });

    await setHarness(page, { mode: 'resolve' });
    await page.evaluate(() => document.querySelector<HTMLCanvasElement>('#game')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    await expect.poll(async () => (await lifecycle(page)).pointerLock).toBe('locked');
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      const harness = (window as unknown as { __PASS65_POINTER_LOCK__: { locked: boolean } }).__PASS65_POINTER_LOCK__;
      harness.locked = false;
      document.dispatchEvent(new Event('pointerlockchange'));
    });

    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#resume')).toBeFocused();
    await expect(page.locator('#match-pause-backdrop')).toBeVisible();
    await expect(page.locator('#menu-preview-frame')).toBeHidden();
    expect(await lifecycle(page)).toMatchObject({
      surface: 'paused-match',
      pointerLock: 'unlocked',
      reason: 'escape',
      visibilityChangeCount: 2,
      pauseOpenCount: 1,
    });
  });

  test('Escape from active-match Options commits once and returns directly to play', async ({ page }) => {
    await ready(page);
    await installPointerLockHarness(page, 'transient');
    await startFromMenu(page);
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.openMenu());
    await expect(page.locator('#menu')).toBeVisible();
    await page.locator('#menu-tab-options').click();
    await expect(page.locator('#menu-panel-options')).toBeVisible();
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      let writes = 0;
      Storage.prototype.setItem = function setItem(key: string, value: string): void {
        if (key === 'atomic-acres.player-profile.v1') writes += 1;
        original.call(this, key, value);
      };
      Object.defineProperty(window, '__PASS66_SETTINGS_WRITES__', {
        configurable: true,
        get: () => writes,
      });
    });
    const currentProfile = await page.locator('#graphics-profile').inputValue();
    await page.locator('#graphics-profile').selectOption(currentProfile === 'performance' ? 'high' : 'performance');
    await expect(page.locator('#graphics-effective')).toContainText('PENDING');

    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeHidden();
    await expect.poll(async () => (await lifecycle(page)).pointerLock).toBe('locked');
    await expect(page.locator('#menu-tab-deploy')).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => (window as unknown as { __PASS66_SETTINGS_WRITES__: number }).__PASS66_SETTINGS_WRITES__)).toBe(1);
  });

  test('restarts all four countdown cues and latches one F press for care capture', async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript((loadout) => {
      localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(loadout));
    }, { schemaVersion: 1, slots: ['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke'] });
    await ready(page);
    await selectArena(page, 'rustworks-1v1');
    await installCountdownAnimationProbe(page);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.gameStarted === true && snapshot.matchPhase === 'active';
    }, undefined, { timeout: 30_000 });
    await expect.poll(async () => (await countdownAnimations(page)).map(({ cue }) => cue))
      .toEqual(['3', '2', '1', 'engage']);
    const animations = await countdownAnimations(page);
    expect(animations.map((event) => event.cue)).toEqual(['3', '2', '1', 'engage']);
    expect(animations.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(animations.map((event) => event.animationName)).toEqual([
      'pass65CountdownBeatOdd', 'pass65CountdownBeatEven', 'pass65CountdownBeatOdd', 'pass65CountdownBeatEven',
    ]);
    await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      debug.setBotsFrozen(true);
      debug.earnSupport(4);
      const position = (debug.snapshot().player as { position: number[] }).position;
      if (!debug.activateKillstreak('care-package', [position[0], 0, position[2]])) {
        throw new Error('Care Package activation was rejected');
      }
    });

    const careState = () => page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      const crate = snapshot.killstreak.entities.find((entity: any) => entity.kind === 'care-crate');
      return {
        id: crate?.id ?? null,
        phase: crate?.phase ?? null,
        heldCrateId: snapshot.fieldSupport.careCapture.heldCrateId,
        rewards: snapshot.killstreak.actors[0]?.revealedCareRewards.length ?? 0,
        fInteraction: snapshot.fieldSupport.fInteraction,
      };
    });

    await expect.poll(careState, { timeout: 10_000 }).toMatchObject({ phase: 'landed', heldCrateId: null, rewards: 0 });
    await expect(page.locator('#support-interaction-prompt')).toBeVisible();
    await expect(page.locator('#support-interaction-prompt')).toContainText('TAP F · COLLECT KILLSTREAK');

    const tapLifecycle = await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true }));
      const down = (debug.snapshot() as any).fieldSupport.fInteraction;
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', key: 'f', bubbles: true }));
      const up = (debug.snapshot() as any).fieldSupport.fInteraction;
      return { down, up };
    });
    expect(tapLifecycle, JSON.stringify(tapLifecycle)).toMatchObject({
      down: { state: { phase: 'idle' }, lastCommit: { phase: 'tap', candidate: { kind: 'care-package' } } },
      up: { state: { phase: 'idle' }, lastCommit: { phase: 'tap', candidate: { kind: 'care-package' } } },
    });
    await expect.poll(careState, { timeout: 10_000 }).toMatchObject({ rewards: 1 });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.damage(5));
    // Pass 68: once opened, care-crate rewards persist; damage does not reset
    // collection. The crate stays resolved (phase: null, rewards: 1).
    await expect.poll(careState).toMatchObject({ heldCrateId: null, rewards: 1 });

    await page.keyboard.down('f');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    // Pass 68: care-crate rewards persist after collection; no reset on blur.
    await expect.poll(careState).toMatchObject({ heldCrateId: null, rewards: 1 });
    await page.keyboard.up('f');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    await page.keyboard.down('f');
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.openMenu());
    await expect(page.locator('#menu')).toBeVisible();
    await expect.poll(careState).toMatchObject({ heldCrateId: null, rewards: 1 });
    await page.keyboard.up('f');
  });

  test('does not skip Atomic Acres countdown cues across a long presentation stall', async ({ page }) => {
    test.setTimeout(60_000);
    await ready(page);
    await selectArena(page, 'atomic-acres');
    await installCountdownAnimationProbe(page);
    await page.evaluate(() => {
      const countdown = document.querySelector<HTMLElement>('#countdown');
      if (!countdown) throw new Error('Missing match countdown');
      let stalled = false;
      countdown.addEventListener('animationstart', () => {
        if (stalled || countdown.dataset.cue !== '3') return;
        stalled = true;
        const until = performance.now() + 1_600;
        while (performance.now() < until) { /* deliberate renderer/driver-stall surrogate */ }
      });
      window.__ATOMIC_ACRES_DEBUG__.startSolo();
    });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 30_000 });
    await expect.poll(async () => (await countdownAnimations(page)).length).toBe(4);
    expect((await countdownAnimations(page)).map((event) => event.cue)).toEqual(['3', '2', '1', 'engage']);
  });

  test('survives twenty all-arena solo starts without an unsolicited menu bounce', async ({ page }) => {
    test.setTimeout(300_000);
    const browserErrors = collectUnexpectedBrowserErrors(page, 'twenty-start');
    await ready(page);
    await installGameCanvasReadbackTripwire(page);
    await installPointerLockHarness(page, 'resolve');
    await page.locator('#player-name').fill('TWENTY START QA');
    const arenas: readonly ArenaId[] = ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'];
    const pointerModes: readonly PointerLockMode[] = ['resolve', 'reject', 'transient'];

    for (let index = 0; index < 20; index += 1) {
      const arenaId = arenas[index % arenas.length];
      await selectArena(page, arenaId);
      await setHarness(page, { mode: pointerModes[index % pointerModes.length], locked: false, focused: true });
      const before = await lifecycle(page);
      await page.locator('#solo').click();
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === true, undefined, { timeout: 30_000 });
      await expect(page.locator('#menu')).toBeHidden();
      await expect.poll(async () => (await lifecycle(page)).pointerLock).not.toBe('requesting');
      const started = await lifecycle(page);
      expect(started).toMatchObject({
        surface: 'hidden',
        matchStartCount: index + 1,
        visibilityChangeCount: Number(before.visibilityChangeCount) + 1,
        pauseOpenCount: 0,
        backdrop: {
          periodicReadbackCount: 0,
          sourceCaptureAttemptCount: 0,
          sourceCaptureCount: 0,
          presentationCount: 0,
          fallbackCount: 0,
        },
      });
      expect(await gameCanvasReadbackAttempts(page)).toBe(0);

      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 10_000 });
      await page.waitForTimeout(75);
      expect(await lifecycle(page)).toMatchObject({
        surface: 'hidden',
        matchStartCount: index + 1,
        visibilityChangeCount: Number(before.visibilityChangeCount) + 1,
        pauseOpenCount: 0,
        backdrop: { periodicReadbackCount: 0, sourceCaptureAttemptCount: 0, sourceCaptureCount: 0 },
      });
      expect(await gameCanvasReadbackAttempts(page)).toBe(0);

      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.returnToMainMenu());
      await expect(page.locator('#menu')).toBeVisible();
      await expect(page.locator('#menu')).toHaveAttribute('data-lifecycle-surface', 'pre-match');
    }

    expect(await lifecycle(page)).toMatchObject({
      surface: 'pre-match',
      matchStartCount: 20,
      pauseOpenCount: 0,
      visibilityChangeCount: 40,
      backdrop: { periodicReadbackCount: 0, sourceCaptureAttemptCount: 0, sourceCaptureCount: 0 },
    });
    expect(await gameCanvasReadbackAttempts(page)).toBe(0);
    expect(browserErrors).toEqual([]);
  });

  test('keeps synchronized host and guest countdowns hidden until active play and resumes deliberately', async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    let host: Page | null = null;
    let guest: Page | null = null;
    let hostErrors: string[] = [];
    let guestErrors: string[] = [];
    try {
      [host, guest] = await Promise.all([
        openMultiplayerPeer(context, 'HOST LIFECYCLE', 'pass65-lifecycle-host'),
        openMultiplayerPeer(context, 'GUEST LIFECYCLE', 'pass65-lifecycle-guest'),
      ]);
      hostErrors = collectUnexpectedBrowserErrors(host, 'host');
      guestErrors = collectUnexpectedBrowserErrors(guest, 'guest');

      await host.locator('#host').click();
      await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()), undefined, { timeout: 30_000 });
      const roomCode = (await host.locator('#room-code').textContent())?.trim() ?? '';
      expect(roomCode.length).toBeGreaterThan(0);
      await guest.locator('#team').selectOption('1');
      await guest.locator('#room-input').fill(roomCode);
      await guest.locator('#join').click();
      await Promise.all([host, guest].map((peer) => peer.waitForFunction(
        () => document.querySelectorAll('#lobby-roster .lobby-player').length === 2,
        undefined,
        { timeout: 30_000 },
      )));
      await host.locator('#lobby-ready').click();
      await guest.locator('#lobby-ready').click();
      await expect(host.locator('#lobby-start')).toBeEnabled();
      expect(await Promise.all([host, guest].map(lifecycle))).toEqual([
        expect.objectContaining({ surface: 'pre-match', matchStartCount: 0, pauseOpenCount: 0, visibilityChangeCount: 0 }),
        expect.objectContaining({ surface: 'pre-match', matchStartCount: 0, pauseOpenCount: 0, visibilityChangeCount: 0 }),
      ]);

      await host.locator('#lobby-start').click();
      await Promise.all([host, guest].map((peer) => peer.waitForFunction(
        () => window.__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === true,
        undefined,
        { timeout: 45_000 },
      )));
      await Promise.all([host, guest].map((peer) => peer.waitForFunction(
        () => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active',
        undefined,
        { timeout: 15_000 },
      )));
      await Promise.all([host, guest].map(async (peer) => {
        await expect(peer.locator('#menu')).toBeHidden();
        expect(await lifecycle(peer)).toMatchObject({
          surface: 'hidden',
          matchStartCount: 1,
          pauseOpenCount: 0,
          visibilityChangeCount: 1,
          pointerRequestCount: 0,
          backdrop: { periodicReadbackCount: 0, sourceCaptureAttemptCount: 0, sourceCaptureCount: 0 },
        });
      }));

      await guest.bringToFront();
      await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount > 0, undefined, { timeout: 15_000 });
      await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.openMenu());
      await expect(guest.locator('#menu')).toBeVisible();
      expect(await lifecycle(guest)).toMatchObject({
        surface: 'paused-match',
        pauseOpenCount: 1,
        visibilityChangeCount: 2,
        backdrop: {
          captureStatus: 'pause-snapshot',
          provenance: 'pause-only-renderer-canvas',
          sourceArena: 'atomic-acres',
          capturedFromSurface: 'hidden',
          capturedBeforeMenuVisible: true,
          periodicReadbackCount: 0,
          sourceCaptureAttemptCount: 1,
          sourceCaptureCount: 1,
        },
      });
      expect(await lifecycle(host)).toMatchObject({ surface: 'hidden', pauseOpenCount: 0, visibilityChangeCount: 1 });

      await guest.locator('#resume').click();
      await expect(guest.locator('#menu')).toBeHidden();
      await expect.poll(async () => (await lifecycle(guest)).pointerLock).toBe('locked');
      expect(await lifecycle(guest)).toMatchObject({
        surface: 'hidden', matchStartCount: 1, pauseOpenCount: 1, visibilityChangeCount: 3,
      });
      errors.push(...hostErrors, ...guestErrors);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('falls back nonfatally with no stale pixels when compositor and canvas readbacks are unavailable', async ({ page }) => {
    await ready(page);
    await installGameCanvasReadbackTripwire(page);
    await installPointerLockHarness(page, 'reject');
    await startFromMenu(page);
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount > 0, undefined, { timeout: 15_000 });
    expect(await gameCanvasReadbackAttempts(page)).toBe(0);
    await disablePauseBackdropCompositor(page);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.openMenu());
    await expect(page.locator('#match-pause-backdrop')).toBeVisible();
    expect(await lifecycle(page)).toMatchObject({
      surface: 'paused-match',
      backdrop: {
        captureStatus: 'fallback',
        provenance: 'generated-safe-fallback',
        sourceCanvas: 'none',
        sourceArena: 'atomic-acres',
        sourceFrame: 0,
        capturedFromSurface: 'hidden',
        capturedBeforeMenuVisible: true,
        contract: 'game-canvas-css-compositor-v1',
        periodicReadbackCount: 0,
        sourceCaptureAttemptCount: 1,
        sourceCaptureCount: 0,
        presentationCount: 0,
        fallbackCount: 1,
      },
    });
    expect(await gameCanvasReadbackAttempts(page)).toBe(1);
    expect(await page.locator('#match-pause-backdrop').evaluate((element) => element.tagName)).toBe('DIV');
    await expect(page.locator('#menu')).toHaveAttribute('data-lifecycle-surface', 'paused-match');
    await expect(page.locator('img[src*="atomic-acres-menu-squad-joke"]')).toHaveCount(0);
  });
});
