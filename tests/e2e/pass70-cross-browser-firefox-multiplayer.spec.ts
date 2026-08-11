import { writeFile } from 'node:fs/promises';
import {
  chromium,
  devices,
  expect,
  firefox,
  test,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import {
  attachBrowserDiagnostics,
  startOwnedPeerServer,
  type BrowserDiagnostics,
  type OwnedPeerServer,
} from './pass66-e2e-support';
import {
  evaluatePass70BrowserAudioEvidence,
  pass70ListenerPoseModeFromCapabilities,
} from '../../scripts/qa/pass70-cross-browser-audio-evidence-contract.mjs';

const peerPort = Number(process.env.PASS70_CROSS_BROWSER_PEER_PORT ?? 9_089);
let peerServer: OwnedPeerServer | null = null;

test.describe.configure({ timeout: 360_000 });

test.beforeAll(async () => {
  if (process.env.PASS70_VERIFY_CROSS_BROWSER !== '1') return;
  peerServer = await startOwnedPeerServer(peerPort, process.env.PASS70_CROSS_BROWSER_PEER_PATH);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

function route(baseUrl: string, seed: string, renderPaused = false): string {
  if (!peerServer) throw new Error('Owned PeerJS server is not ready');
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries({
    release: 'latest', renderer: 'webgl2', render: 'compat', signal: 'off', grass: 'off', mist: 'off',
    clouds: 'off', rays: 'off', externalServices: 'off', multiplayerQa: '1',
    peerQaPort: String(peerPort), peerQaPath: peerServer.path, seed,
    ...(renderPaused ? { renderPaused: '1' } : {}),
  })) url.searchParams.set(key, value);
  return url.toString();
}

async function preparePlayer(
  page: Page,
  baseUrl: string,
  name: string,
  seed: string,
  renderPaused = false,
): Promise<void> {
  await page.goto(route(baseUrl, seed, renderPaused));
  await page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true && state.bootstrap?.stage === 'ready'
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false;
  }, undefined, { timeout: 90_000 });
  await page.fill('#player-name', name);
}

async function startOneBotSkirmish(page: Page): Promise<Record<string, unknown>> {
  await page.click('#solo');
  await page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true && state.matchPhase === 'active' && state.bots?.length === 1;
  }, undefined, { timeout: 90_000 });
  await page.evaluate(() => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
    debug.setBotsFrozen(true);
    debug.setAmmo('carbine', 2, 30);
    debug.setAds(true);
    debug.fireOnce();
    debug.reload();
  });
  await page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.player.reloading === false && state.player.ammo > 2;
  }, undefined, { timeout: 15_000 });
  const beforeFrame = await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  await page.waitForTimeout(2_000);
  return page.evaluate((startingFrame) => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      frameDelta: state.frameCount - startingFrame,
      botCount: state.bots.length,
      audioContext: state.audio.context,
      audioListenerMode: state.audio.listener.poseMode,
      runtimeError: document.querySelector('#runtime-error-log')?.textContent?.trim() ?? '',
      systemPaused: document.querySelector('#banner')?.textContent?.includes('SYSTEM PAUSED') ?? false,
      ammo: state.player.ammo,
      reloading: state.player.reloading,
      matchPhase: state.matchPhase,
      userAgent: navigator.userAgent,
    };
  }, beforeFrame);
}

async function sampleBrowserAudioListenerCapabilities(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const gameContext = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().audio.context;
    const standard = typeof window.AudioContext === 'function' ? window.AudioContext : null;
    const webkit = typeof (window as any).webkitAudioContext === 'function'
      ? (window as any).webkitAudioContext
      : null;
    const AudioContextConstructor = standard ?? webkit;
    if (!AudioContextConstructor) {
      return { gameContext, constructorSource: 'unavailable', probeContextState: 'unavailable', properties: {}, methods: {} };
    }
    const context = new AudioContextConstructor();
    try {
      const listener = context.listener as Record<string, unknown>;
      const typeOf = (value: unknown) => value === null ? 'null' : typeof value;
      const properties = Object.fromEntries([
        'positionX', 'positionY', 'positionZ',
        'forwardX', 'forwardY', 'forwardZ',
        'upX', 'upY', 'upZ',
      ].map((name) => {
        const property = listener[name];
        return [name, {
          propertyType: typeOf(property),
          valueType: typeOf((property as { value?: unknown } | null)?.value),
        }];
      }));
      return {
        gameContext,
        constructorSource: standard ? 'standard' : 'webkit',
        probeContextState: context.state,
        properties,
        methods: {
          setPosition: typeOf(listener.setPosition),
          setOrientation: typeOf(listener.setOrientation),
        },
      };
    } finally {
      await context.close();
    }
  });
}

type EngineKind = 'chromium' | 'firefox' | 'webkit' | 'chrome' | 'edge' | 'opera';
const supportedEngines: readonly EngineKind[] = ['chromium', 'firefox', 'webkit', 'chrome', 'edge', 'opera'];
const verifyCrossBrowser = process.env.PASS70_VERIFY_CROSS_BROWSER === '1';
const verifyFirefox = process.env.PASS70_VERIFY_FIREFOX === '1';
const verifyOpera = process.env.PASS70_VERIFY_OPERA === '1';
const operaExecutablePath = process.env.PASS70_OPERA_EXECUTABLE_PATH ?? null;
const operaBinarySha256 = process.env.PASS70_OPERA_BINARY_SHA256 ?? null;
const expectedSourceSha = process.env.PASS70_CROSS_BROWSER_SOURCE_SHA ?? null;
if (verifyCrossBrowser && !/^[a-f0-9]{40}$/u.test(expectedSourceSha ?? '')) {
  throw new Error('PASS70_VERIFY_CROSS_BROWSER requires exact PASS70_CROSS_BROWSER_SOURCE_SHA provenance');
}
if (verifyOpera && (!operaExecutablePath || !/^[a-f0-9]{64}$/u.test(operaBinarySha256 ?? ''))) {
  throw new Error('PASS70_VERIFY_OPERA requires exact executable path and SHA-256 provenance');
}
const configuredEngineMatrix = (process.env.PASS70_ENGINE_MATRIX ?? supportedEngines.join(','))
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
if (configuredEngineMatrix.some((entry) => !supportedEngines.includes(entry as EngineKind))) {
  throw new Error(`Unsupported PASS70_ENGINE_MATRIX: ${configuredEngineMatrix.join(',')}`);
}
const engineMatrix = new Set(configuredEngineMatrix as EngineKind[]);
const configuredCrossGuest = process.env.PASS70_CROSS_GUEST_ENGINE ?? 'firefox';
if (!supportedEngines.includes(configuredCrossGuest as EngineKind)) {
  throw new Error(`Unsupported PASS70_CROSS_GUEST_ENGINE: ${configuredCrossGuest}`);
}
const crossGuestEngine = configuredCrossGuest as EngineKind;

async function openEngineBrowser(kind: EngineKind): Promise<Browser> {
  if (kind === 'chromium') return chromium.launch({ headless: true });
  if (kind === 'firefox') {
    const executablePath = process.env.PASS70_FIREFOX_EXECUTABLE_PATH;
    return firefox.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  }
  if (kind === 'webkit') return webkit.launch({ headless: true });
  if (kind === 'opera') {
    const executablePath = process.env.PASS70_OPERA_EXECUTABLE_PATH;
    if (!executablePath) throw new Error('PASS70_VERIFY_OPERA requires PASS70_OPERA_EXECUTABLE_PATH');
    return chromium.launch({ headless: true, executablePath });
  }
  return chromium.launch({ headless: true, channel: kind === 'chrome' ? 'chrome' : 'msedge' });
}

function expectNoBrowserFaults(diagnostics: BrowserDiagnostics): void {
  const relevant = [...diagnostics.pageErrors, ...diagnostics.consoleErrors]
    .filter((entry) => !/favicon|WebGL.*software fallback/i.test(entry));
  expect(relevant).toEqual([]);
}

async function newPageWithDeadline(context: BrowserContext, label: string): Promise<Page> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      context.newPage(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label}: browser context did not create a page within 20s`)), 20_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

for (const kind of ['firefox', 'chromium', 'webkit', 'chrome', 'edge', 'opera'] as const) {
  test(`one-bot Skirmish starts, plays and weapon-reloads in ${kind}; audio evidence fails closed`, async ({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium', 'The explicit engine matrix is owned once by the Chromium project.');
    test.skip(!verifyCrossBrowser,
      'Run the explicit Pass 70 cross-browser verifier; ordinary Chromium projects do not launch external engines.');
    test.skip(!engineMatrix.has(kind), `${kind} is not selected by PASS70_ENGINE_MATRIX.`);
    test.skip(kind === 'firefox' && !verifyFirefox,
      'Set PASS70_VERIFY_FIREFOX=1 to run the real fail-closed Firefox start/play/reload lane.');
    test.skip(kind === 'opera' && !verifyOpera,
      'Set PASS70_VERIFY_OPERA=1 and PASS70_OPERA_EXECUTABLE_PATH to run the real Opera lane.');
    const baseUrl = String(testInfo.project.use.baseURL);
    const browser = await openEngineBrowser(kind);
    try {
      const context = await browser.newContext({ viewport: { width: 1_280, height: 720 } });
      const page = await newPageWithDeadline(context, kind);
      const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
      attachBrowserDiagnostics(page, kind, diagnostics);
      await preparePlayer(page, baseUrl, `${kind} Solo`, `pass70-${kind}-solo`);
      const first = await startOneBotSkirmish(page);
      const listenerCapabilities = await sampleBrowserAudioListenerCapabilities(page);
      const audioEvidenceLedger = evaluatePass70BrowserAudioEvidence({
        engine: kind,
        harness: `playwright-${kind}`,
        hostPlatform: process.platform,
        gameContext: first.audioContext as Record<string, unknown>,
        audioListenerMode: String(first.audioListenerMode),
        listenerCapabilities,
      });
      const receiptPath = testInfo.outputPath(`pass70-${kind}-one-bot-receipt.json`);
      await writeFile(receiptPath, JSON.stringify({
        sourceSha: expectedSourceSha,
        engine: kind,
        engineBinary: kind === 'opera'
          ? { executablePath: operaExecutablePath, sha256: operaBinarySha256 }
          : null,
        browserVersion: browser.version(),
        engineQualification: kind === 'webkit'
          ? `Playwright WebKit host=${process.platform}; not native Safari. Native Safari audio remains external HITL.`
          : 'Playwright browser-engine evidence; no claim about native Safari.',
        audioEvidenceLedger,
        listenerCapabilities,
        ...first,
      }, null, 2), 'utf8');
      await testInfo.attach(`${kind}-one-bot-receipt`, { path: receiptPath, contentType: 'application/json' });
      expect(first).toMatchObject({ botCount: 1, runtimeError: '', systemPaused: false, reloading: false, matchPhase: 'active' });
      expect(first.frameDelta).toBeGreaterThan(20);
      expect(audioEvidenceLedger.failures, audioEvidenceLedger.qualification).toEqual([]);
      expect(audioEvidenceLedger.verdict).toBe('PASS');
      expect(first.audioListenerMode).toBe(audioEvidenceLedger.expectedListenerMode);
      if (kind === 'opera') expect(first.userAgent).toMatch(/\bOPR\//u);

      if (kind === 'firefox') {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (
          (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true
          && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false
        ), undefined, { timeout: 90_000 });
        await page.fill('#player-name', 'firefox Solo');
        const reloaded = await startOneBotSkirmish(page);
        expect(reloaded).toMatchObject({ botCount: 1, runtimeError: '', systemPaused: false, matchPhase: 'active' });
        expect(reloaded.frameDelta).toBeGreaterThan(20);
        const reloadedCapabilities = await sampleBrowserAudioListenerCapabilities(page);
        expect(reloaded.audioListenerMode).toBe(pass70ListenerPoseModeFromCapabilities(reloadedCapabilities));
      }

      const screenshot = testInfo.outputPath(`pass70-${kind}-one-bot.png`);
      await page.screenshot({ path: screenshot, animations: 'disabled' });
      await testInfo.attach(`${kind}-one-bot`, { path: screenshot, contentType: 'image/png' });
      expectNoBrowserFaults(diagnostics);
      await context.close();
    } finally {
      await browser.close();
    }
  });
}

test('Playwright iPhone 15 touch/WebKit starts one-bot Skirmish and survives ADS/reload; native Safari remains external', async ({ browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'The explicit engine matrix is owned once by the Chromium project.');
  test.skip(!verifyCrossBrowser,
    'Run the explicit Pass 70 cross-browser verifier; ordinary Chromium projects do not launch external engines.');
  test.skip(!engineMatrix.has('webkit'), 'WebKit is not selected by PASS70_ENGINE_MATRIX.');
  const baseUrl = String(testInfo.project.use.baseURL);
  const browser = await webkit.launch({ headless: true });
  try {
    const { defaultBrowserType: _defaultBrowserType, ...iphone15 } = devices['iPhone 15'];
    expect(iphone15.hasTouch, 'Playwright iPhone 15 descriptor keeps touch emulation enabled').toBe(true);
    const context = await browser.newContext(iphone15);
    const page = await newPageWithDeadline(context, 'iphone-15-webkit');
    const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
    attachBrowserDiagnostics(page, 'iphone-15-webkit', diagnostics);
    await preparePlayer(page, baseUrl, 'iPhone 15 Solo', 'pass70-iphone15-webkit');
    const soloBounds = await page.locator('#solo').boundingBox();
    if (!soloBounds) throw new Error('iPhone 15: solo button has no touch target');
    await page.touchscreen.tap(soloBounds.x + soloBounds.width / 2, soloBounds.y + soloBounds.height / 2);
    await page.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === true && state.matchPhase === 'active' && state.bots?.length === 1;
    }, undefined, { timeout: 90_000 });
    const actionBefore = await page.evaluate(() => {
      const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
      debug.setBotsFrozen(true);
      debug.setRenderPaused(false);
      debug.equipWeapon('carbine');
      debug.setAmmo('carbine', 2, 30);
      const root = document.querySelector<HTMLElement>('#mobile-touch-controls');
      if (!root) throw new Error('Missing mobile touch root');
      const events: Array<Record<string, unknown>> = [];
      const record = (event: PointerEvent) => {
        const control = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-mtc]')?.dataset.mtc;
        if (!control) return;
        const state = debug.snapshot();
        events.push({
          control,
          type: event.type,
          pointerType: event.pointerType,
          trusted: event.isTrusted,
          adsHeld: state.textChat.adsHeld,
          ammo: state.player.ammo,
          reloading: state.player.reloading,
        });
      };
      root.addEventListener('pointerdown', record);
      root.addEventListener('pointerup', record);
      (window as any).__PASS70_MOBILE_INPUT_PROBE__ = events;
      return { ammo: debug.snapshot().player.ammo };
    });
    const touchControl = async (control: 'ads' | 'fire' | 'reload') => {
      const target = page.locator(`[data-mtc="${control}"]`);
      await expect(target).toBeVisible();
      const bounds = await target.boundingBox();
      if (!bounds || bounds.width < 44 || bounds.height < 44) {
        throw new Error(`${control}: mobile control is not a positive 44px touch target`);
      }
      await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    };
    await startFrameProbe(page);
    await touchControl('ads');
    await page.locator('[data-mtc="ads"]').evaluate((target) => {
      const control = target as HTMLElement & { setPointerCapture(pointerId: number): void };
      const originalSetPointerCapture = control.setPointerCapture.bind(control);
      control.setPointerCapture = () => undefined;
      (window as any).__PASS70_RESTORE_ADS_POINTER_CAPTURE__ = () => {
        control.setPointerCapture = originalSetPointerCapture;
      };
      control.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 70_015, pointerType: 'touch', isPrimary: true, buttons: 1,
      }));
    });
    await expect.poll(async () => page.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().textChat.adsHeld
    ))).toBe(true);
    await page.waitForFunction(() => (
      (window as any).__PASS70_ADS_FRAME_PROBE__.frames >= 30
      && (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().textChat.adsHeld === true
      && (window as any).__ATOMIC_ACRES_DEBUG__.sampleActiveWeaponReadiness().ready === true
    ));
    await touchControl('fire');
    await expect.poll(async () => page.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo
    ))).toBe(actionBefore.ammo - 1);
    await page.locator('[data-mtc="ads"]').evaluate((target) => {
      target.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 70_015, pointerType: 'touch', isPrimary: true, buttons: 0,
      }));
      (window as any).__PASS70_RESTORE_ADS_POINTER_CAPTURE__?.();
      delete (window as any).__PASS70_RESTORE_ADS_POINTER_CAPTURE__;
    });
    await expect.poll(async () => page.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().textChat.adsHeld
    ))).toBe(false);
    await touchControl('reload');
    await expect.poll(async () => page.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.reloading
    ))).toBe(true);
    await expect.poll(async () => page.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player;
      return !state.reloading && state.ammo > 1;
    }), { timeout: 15_000 }).toBe(true);
    await page.waitForTimeout(750);
    const frameProbe = await stopFrameProbe(page);
    const first = await page.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        botCount: state.bots.length,
        audioContext: state.audio.context,
        audioListenerMode: state.audio.listener.poseMode,
        runtimeError: document.querySelector('#runtime-error-log')?.textContent?.trim() ?? '',
        systemPaused: document.querySelector('#banner')?.textContent?.includes('SYSTEM PAUSED') ?? false,
        ammo: state.player.ammo,
        reloading: state.player.reloading,
        matchPhase: state.matchPhase,
        userAgent: navigator.userAgent,
        inputEvents: (window as any).__PASS70_MOBILE_INPUT_PROBE__,
      };
    });
    const listenerCapabilities = await sampleBrowserAudioListenerCapabilities(page);
    const audioEvidenceLedger = evaluatePass70BrowserAudioEvidence({
      engine: 'webkit',
      harness: 'playwright-webkit',
      hostPlatform: process.platform,
      gameContext: first.audioContext as Record<string, unknown>,
      audioListenerMode: String(first.audioListenerMode),
      listenerCapabilities,
    });
    const layout = await page.evaluate(() => {
      const visibleBounds = (selector: string) => {
        const node = document.querySelector<HTMLElement>(selector);
        if (!node || node.hidden) return null;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
          width: rect.width, height: rect.height,
          displayed: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0,
          pointerEvents: style.pointerEvents,
        };
      };
      const surfaces = {
        ads: visibleBounds('[data-mtc="ads"]'),
        fire: visibleBounds('[data-mtc="fire"]'),
        reload: visibleBounds('[data-mtc="reload"]'),
        mission: visibleBounds('.hud-mission-console'),
        operator: visibleBounds('.hud-operator-console'),
        weapon: visibleBounds('.hud-weapon-console'),
      };
      const overlaps = (left: NonNullable<(typeof surfaces)[keyof typeof surfaces]>, right: typeof left) => (
        left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
      );
      const entries = Object.entries(surfaces).filter((entry): entry is [string, NonNullable<(typeof surfaces)[keyof typeof surfaces]>] => entry[1] !== null);
      const collisions: string[] = [];
      for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
          const left = entries[leftIndex]!;
          const right = entries[rightIndex]!;
          if (overlaps(left[1], right[1])) collisions.push(`${left[0]}:${right[0]}`);
        }
      }
      return {
        viewport: [innerWidth, innerHeight],
        screen: [screen.width, screen.height],
        devicePixelRatio,
        touchPoints: navigator.maxTouchPoints,
        touchStartProperty: 'ontouchstart' in window,
        controlsRoot: visibleBounds('#mobile-touch-controls'),
        surfaces,
        collisions,
        horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      };
    });
    const receiptPath = testInfo.outputPath('pass70-iphone15-webkit-receipt.json');
    await writeFile(receiptPath, JSON.stringify({
      sourceSha: expectedSourceSha,
      device: 'Playwright iPhone 15 descriptor',
      qualification: `Playwright WebKit host=${process.platform}; touch/layout/playability only, not native iOS Safari or native Safari audio`,
      nativeSafariResidual: 'External HITL on an iPhone 15+ is required for native Safari audio and long-session gameplay.',
      sustainedAdsInput: 'synthetic touch PointerEvent on the production ADS control after a trusted touchscreen tap',
      browserVersion: browser.version(),
      audioEvidenceLedger,
      listenerCapabilities,
      layout,
      frameProbe,
      ...first,
    }, null, 2), 'utf8');
    await testInfo.attach('iphone15-webkit-receipt', { path: receiptPath, contentType: 'application/json' });
    expect(first).toMatchObject({ botCount: 1, runtimeError: '', systemPaused: false, reloading: false, matchPhase: 'active' });
    expect(frameProbe.frames).toBeGreaterThan(30);
    expect(frameProbe.maxGapMs).toBeLessThan(500);
    expect(first.inputEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ control: 'ads', type: 'pointerdown', pointerType: 'touch', trusted: true, adsHeld: true }),
      expect.objectContaining({ control: 'ads', type: 'pointerup', pointerType: 'touch', trusted: true, adsHeld: false }),
      expect.objectContaining({ control: 'ads', type: 'pointerdown', pointerType: 'touch', trusted: false, adsHeld: true }),
      expect.objectContaining({ control: 'ads', type: 'pointerup', pointerType: 'touch', trusted: false, adsHeld: false }),
      expect.objectContaining({ control: 'fire', type: 'pointerdown', pointerType: 'touch', trusted: true, ammo: actionBefore.ammo - 1 }),
      expect.objectContaining({ control: 'reload', type: 'pointerdown', pointerType: 'touch', trusted: true, reloading: true }),
    ]));
    expect(audioEvidenceLedger.failures, audioEvidenceLedger.qualification).toEqual([]);
    expect(audioEvidenceLedger.verdict).toBe('PASS');
    expect(first.audioListenerMode).toBe(audioEvidenceLedger.expectedListenerMode);
    expect(first.userAgent).toMatch(/iPhone.*AppleWebKit.*Mobile.*Safari/u);
    expect(layout).toMatchObject({
      viewport: [393, 659], screen: [393, 852], devicePixelRatio: 3,
      horizontalOverflowPx: 0, collisions: [],
    });
    expect(
      layout.touchStartProperty || Number(layout.touchPoints) > 0,
      'runtime exposes at least one production touch-capability signal',
    ).toBe(true);
    for (const surface of Object.values(layout.surfaces)) {
      expect(surface).not.toBeNull();
      expect(surface.displayed).toBe(true);
      expect(surface.width).toBeGreaterThanOrEqual(44);
      expect(surface.height).toBeGreaterThanOrEqual(44);
      expect(surface.left).toBeGreaterThanOrEqual(0);
      expect(surface.top).toBeGreaterThanOrEqual(0);
      expect(surface.right).toBeLessThanOrEqual(393);
      expect(surface.bottom).toBeLessThanOrEqual(659);
    }
    const screenshot = testInfo.outputPath('pass70-iphone15-webkit.png');
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    await testInfo.attach('iphone15-webkit', { path: screenshot, contentType: 'image/png' });
    expectNoBrowserFaults(diagnostics);
    await context.close();
  } finally {
    await browser.close();
  }
});

async function waitForActivePair(host: Page, guest: Page): Promise<void> {
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true && state.matchPhase === 'active'
      && state.privateMatch?.members.length === 2
      && state.privateMatch.members.every((member: any) => member.connected)
      && state.remotePlayers.length === 1;
  }, undefined, { timeout: 90_000 })));
}

async function startFrameProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = { active: true, frames: 0, gaps: [] as number[], last: performance.now() };
    (window as any).__PASS70_ADS_FRAME_PROBE__ = probe;
    const tick = (now: number) => {
      if (!probe.active) return;
      if (probe.frames > 0) probe.gaps.push(now - probe.last);
      probe.last = now;
      probe.frames += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopFrameProbe(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const probe = (window as any).__PASS70_ADS_FRAME_PROBE__;
    probe.active = false;
    const sorted = [...probe.gaps].sort((left: number, right: number) => left - right);
    const percentile = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      frames: probe.frames,
      maxGapMs: Math.max(0, ...sorted),
      p95GapMs: percentile(0.95),
      runtimeError: document.querySelector('#runtime-error-log')?.textContent?.trim() ?? '',
      systemPaused: document.querySelector('#banner')?.textContent?.includes('SYSTEM PAUSED') ?? false,
      listenerPoseMode: state.audio.listener.poseMode,
      audioVoices: state.audio.runtime.voices,
      audioVoiceCap: state.audio.runtime.globalCap,
      readiness: (window as any).__ATOMIC_ACRES_DEBUG__.sampleActiveWeaponReadiness(),
      shotProtocol: state.networkSync.shotProtocol,
    };
  });
}

async function crashChromiumPage(context: BrowserContext, page: Page): Promise<void> {
  const session = await context.newCDPSession(page);
  await Promise.race([
    session.send('Page.crash').catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  await Promise.race([
    page.close({ runBeforeUnload: false }).catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

async function auditChatLayout(page: Page, viewport: { width: number; height: number }): Promise<Record<string, unknown>> {
  await page.setViewportSize(viewport);
  return page.evaluate(() => {
    const bounds = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
    const overlaps = (left: DOMRect, right: DOMRect) => (
      left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
    );
    const chat = bounds('#text-chat');
    const operator = bounds('.hud-operator-console');
    const surfaces = [
      '.hud-operator-console', '#combat-stats', '#weapon-block', '#support-block', '#minimap',
      '#mobile-touch-controls .mtc-stick-move', '#mobile-touch-controls .mtc-stick-look',
      '#mobile-touch-controls .mtc-primary-actions', '#mobile-touch-controls .mtc-combat-actions',
      '#mobile-touch-controls .mtc-context-actions',
    ]
      .map((selector) => ({ selector, rect: bounds(selector) }));
    return {
      viewport: [innerWidth, innerHeight],
      context: document.querySelector<HTMLElement>('#text-chat')?.dataset.context ?? null,
      open: document.querySelector<HTMLElement>('#text-chat')?.dataset.open ?? null,
      chat: chat && { left: chat.left, top: chat.top, right: chat.right, bottom: chat.bottom },
      operatorTop: operator?.top ?? null,
      gapAboveOperator: chat && operator ? operator.top - chat.bottom : null,
      collisions: chat ? surfaces.filter((entry) => entry.rect && overlaps(chat, entry.rect)).map((entry) => entry.selector) : ['missing-chat'],
      bottomInset: chat ? innerHeight - chat.bottom : null,
      withinViewport: chat ? chat.left >= 0 && chat.top >= 0 && chat.right <= innerWidth && chat.bottom <= innerHeight : false,
    };
  });
}

test(`Chromium host and ${crossGuestEngine} guest survive ADS combat, guest rejoin and host renderer recovery`, async ({ browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'The explicit cross-engine pair is owned once by the Chromium project.');
  test.skip(!verifyCrossBrowser,
    'Run the explicit Pass 70 cross-browser verifier; ordinary Chromium projects do not launch external engines.');
  test.skip(crossGuestEngine === 'firefox' && !verifyFirefox,
    'Set PASS70_VERIFY_FIREFOX=1 to run the real fail-closed Firefox cross-engine lifecycle lane.');
  const baseUrl = String(testInfo.project.use.baseURL);
  const chromiumBrowser = await chromium.launch({
    headless: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--allow-loopback-in-peer-connection',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });
  const guestBrowser = await openEngineBrowser(crossGuestEngine);
  const hostContext = await chromiumBrowser.newContext({ viewport: { width: 1_280, height: 720 } });
  const guestContext = await guestBrowser.newContext({ viewport: { width: 1_280, height: 720 } });
  const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
  let host!: Page;
  let guest!: Page;
  try {
    host = await newPageWithDeadline(hostContext, 'chromium-host');
    guest = await newPageWithDeadline(guestContext, `${crossGuestEngine}-guest`);
    attachBrowserDiagnostics(host, 'chromium-host', diagnostics);
    attachBrowserDiagnostics(guest, `${crossGuestEngine}-guest`, diagnostics);
    await Promise.all([
      preparePlayer(host, baseUrl, 'Cross Host', 'pass70-cross-host', true),
      preparePlayer(guest, baseUrl, 'Cross Guest', 'pass70-cross-guest', true),
    ]);
    await host.click('#host');
    await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
    const roomCode = (await host.locator('#room-code').textContent())!.trim();
    await guest.fill('#room-input', roomCode);
    await guest.click('#join');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
    ), undefined, { timeout: 60_000 })));
    await host.locator('#lobby-arena').selectOption('rustworks-1v1');
    await expect(guest.locator('#lobby-arena')).toHaveValue('rustworks-1v1');
    await host.locator('#lobby-bots').selectOption('0');
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await expect(host.locator('#lobby-start')).toBeEnabled();
    await host.click('#lobby-start');
    await waitForActivePair(host, guest);

    const initialMemberIds = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.map((member: any) => member.id).sort()
    ));
    const remoteReadability = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0]?.readability
    ));
    expect(remoteReadability).toMatchObject({
      color: 0xff8c3a,
      intensity: 0.25,
      allDepthTested: true,
      allDepthWriting: true,
    });
    expect(remoteReadability.highlightedMeshes).toBeGreaterThan(0);

    const chatMessage = `${crossGuestEngine} cross-engine room check.`;
    await host.keyboard.press('Enter');
    await host.locator('#text-chat-input').fill(chatMessage);
    await host.keyboard.press('Enter');
    await expect(guest.locator('#text-chat-log')).toContainText(chatMessage);
    await expect(guest.locator('#text-chat')).toHaveAttribute('data-context', 'game');
    await expect(guest.locator('#text-chat')).toHaveAttribute('data-visible', 'true');
    await expect(guest.locator('#text-chat')).toHaveAttribute('data-open', 'false');
    const closedDesktopChat = await auditChatLayout(guest, { width: 1_280, height: 720 });
    expect(closedDesktopChat).toMatchObject({
      viewport: [1_280, 720], context: 'game', open: 'false', collisions: [], withinViewport: true,
    });
    expect(Number(closedDesktopChat.gapAboveOperator)).toBeGreaterThanOrEqual(16);
    expect(Number(closedDesktopChat.bottomInset)).toBeGreaterThanOrEqual(232);
    const closedNarrowChat = await auditChatLayout(guest, { width: 600, height: 720 });
    expect(closedNarrowChat).toMatchObject({
      viewport: [600, 720], context: 'game', open: 'false', collisions: [], withinViewport: true,
    });
    const closedTouchState = await guest.evaluate(() => {
      const controls = document.querySelector<HTMLElement>('#mobile-touch-controls');
      const state = { bodyHadClass: document.body.classList.contains('mtc-live'), controlsHidden: controls?.hidden ?? true };
      document.body.classList.add('mtc-live');
      if (controls) controls.hidden = false;
      return state;
    });
    const closedMobileChat = await auditChatLayout(guest, { width: 390, height: 844 });
    expect(closedMobileChat).toMatchObject({
      viewport: [390, 844], context: 'game', open: 'false', collisions: [], withinViewport: true,
    });
    const closedMobileLandscapeChat = await auditChatLayout(guest, { width: 844, height: 390 });
    expect(closedMobileLandscapeChat).toMatchObject({
      viewport: [844, 390], context: 'game', open: 'false', collisions: [], withinViewport: true,
    });
    await guest.evaluate(({ bodyHadClass, controlsHidden }) => {
      const controls = document.querySelector<HTMLElement>('#mobile-touch-controls');
      document.body.classList.toggle('mtc-live', bodyHadClass);
      if (controls) controls.hidden = controlsHidden;
    }, closedTouchState);
    await guest.setViewportSize({ width: 1_280, height: 720 });

    await host.keyboard.press('Enter');
    await expect(host.locator('#text-chat')).toHaveAttribute('data-open', 'true');
    const desktopChat = await auditChatLayout(host, { width: 1_280, height: 720 });
    expect(desktopChat).toMatchObject({ viewport: [1_280, 720], context: 'game', open: 'true', collisions: [], withinViewport: true });
    expect(Number(desktopChat.gapAboveOperator)).toBeGreaterThanOrEqual(16);
    expect(Number(desktopChat.bottomInset)).toBeGreaterThanOrEqual(232);
    const touchState = await host.evaluate(() => {
      const controls = document.querySelector<HTMLElement>('#mobile-touch-controls');
      const state = { bodyHadClass: document.body.classList.contains('mtc-live'), controlsHidden: controls?.hidden ?? true };
      document.body.classList.add('mtc-live');
      if (controls) controls.hidden = false;
      return state;
    });
    const mobileChat = await auditChatLayout(host, { width: 390, height: 844 });
    expect(mobileChat).toMatchObject({ viewport: [390, 844], context: 'game', open: 'true', collisions: [], withinViewport: true });
    const mobileLandscapeChat = await auditChatLayout(host, { width: 844, height: 390 });
    expect(mobileLandscapeChat).toMatchObject({ viewport: [844, 390], context: 'game', open: 'true', collisions: [], withinViewport: true });
    await host.evaluate(({ bodyHadClass, controlsHidden }) => {
      const controls = document.querySelector<HTMLElement>('#mobile-touch-controls');
      document.body.classList.toggle('mtc-live', bodyHadClass);
      if (controls) controls.hidden = controlsHidden;
    }, touchState);
    await host.setViewportSize({ width: 1_280, height: 720 });
    await host.keyboard.press('Escape');
    await expect(host.locator('#text-chat')).toHaveAttribute('data-open', 'false');

    const [hostListenerCapabilities, guestListenerCapabilities] = await Promise.all([
      sampleBrowserAudioListenerCapabilities(host),
      sampleBrowserAudioListenerCapabilities(guest),
    ]);
    const guestUserAgent = await guest.evaluate(() => navigator.userAgent);
    if (crossGuestEngine === 'opera') expect(guestUserAgent).toMatch(/\bOPR\//u);
    const guestPosition = await guest.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.position as [number, number, number]
    ));
    await host.evaluate(([x, y, z]) => {
      const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
      debug.teleportPlayer(x, y, z + 5, 0, 0);
    }, guestPosition);
    await host.waitForFunction(([x, _y, z]) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const remote = state.remotePlayers[0];
      return remote && Math.abs(remote.authoritativePosition[0] - x) < 0.5
        && Math.abs(remote.authoritativePosition[2] - z) < 0.5
        && Math.abs(state.player.position[0] - x) < 0.5
        && Math.abs(state.player.position[2] - (z + 5)) < 0.5;
    }, guestPosition, { timeout: 15_000 });
    await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
      debug.setRenderPaused(false);
      debug.equipWeapon('carbine');
      debug.setAmmo('carbine', 2, 120);
      debug.setAds(true);
    })));
    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.aimAtRemoteWithOffset(0, 0));
    await host.waitForTimeout(750);
    const combatBefore = await Promise.all([
      host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0]?.hp),
      guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.hp),
    ]);
    expect(Math.abs(Number(combatBefore[0]) - Number(combatBefore[1]))).toBeLessThanOrEqual(1);
    await Promise.all([startFrameProbe(host), startFrameProbe(guest)]);
    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.fireOnce());
    let combatAfter = { hostAuthorityHp: Number.NaN, guestHp: Number.NaN };
    await expect.poll(async () => {
      const [hostAuthorityHp, guestHp] = await Promise.all([
        host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0]?.hp),
        guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.hp),
      ]);
      combatAfter = { hostAuthorityHp: Number(hostAuthorityHp), guestHp: Number(guestHp) };
      return {
        damaged: combatAfter.guestHp < Number(combatBefore[1]),
        converged: Math.abs(combatAfter.hostAuthorityHp - combatAfter.guestHp) <= 1,
      };
    }, { timeout: 15_000 }).toEqual({ damaged: true, converged: true });
    await host.waitForTimeout(3_000);
    await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
      debug.setAds(false);
    })));
    const [hostFrame, guestFrame] = await Promise.all([stopFrameProbe(host), stopFrameProbe(guest)]);
    for (const [label, probe] of [['host', hostFrame], ['guest', guestFrame]] as const) {
      expect(probe.frames, `${label}: presented frame samples`).toBeGreaterThan(30);
      expect(probe.maxGapMs, `${label}: no >500ms steady-state ADS/fire hitch`).toBeLessThan(500);
      expect(probe.runtimeError, `${label}: runtime errors`).toBe('');
      expect(probe.systemPaused, `${label}: no fatal pause`).toBe(false);
      expect(probe.listenerPoseMode, `${label}: exact listener compatibility path`)
        .toBe(pass70ListenerPoseModeFromCapabilities(
          label === 'host' ? hostListenerCapabilities : guestListenerCapabilities,
        ));
      expect(Number(probe.audioVoices)).toBeLessThanOrEqual(Number(probe.audioVoiceCap));
      expect((probe.readiness as any).ready).toBe(true);
    }
    const crossEngineReceiptPath = testInfo.outputPath('pass70-cross-engine-ui-frame-receipt.json');
    await writeFile(crossEngineReceiptPath, JSON.stringify({
      sourceSha: expectedSourceSha,
      guestEngine: crossGuestEngine,
      guestEngineBinary: crossGuestEngine === 'opera'
        ? { executablePath: operaExecutablePath, sha256: operaBinarySha256 }
        : null,
      guestUserAgent,
      initialMemberIds,
      remoteReadability,
      listenerCapabilities: { host: hostListenerCapabilities, guest: guestListenerCapabilities },
      combat: {
        before: { hostAuthorityHp: combatBefore[0], guestHp: combatBefore[1] },
        after: combatAfter,
      },
      chat: {
        closedDesktop: closedDesktopChat,
        closedNarrow: closedNarrowChat,
        closedMobile: closedMobileChat,
        closedMobileLandscape: closedMobileLandscapeChat,
        desktop: desktopChat,
        mobile: mobileChat,
        mobileLandscape: mobileLandscapeChat,
      },
      frames: { host: hostFrame, guest: guestFrame },
    }, null, 2), 'utf8');
    await testInfo.attach('cross-engine-ui-frame-receipt', {
      path: crossEngineReceiptPath,
      contentType: 'application/json',
    });

    await host.evaluate(([x, y, z]) => {
      const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
      debug.teleportPlayer(x, y, z + 5, 0, 0);
    }, guestPosition);
    await host.waitForFunction(([x, _y, z]) => {
      const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0];
      return remote && Math.abs(remote.authoritativePosition[0] - x) < 0.5
        && Math.abs(remote.authoritativePosition[2] - z) < 0.5;
    }, guestPosition, { timeout: 15_000 });
    await host.evaluate(() => {
      const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
      debug.aimAtRemoteWithOffset(0, 0);
      debug.setRenderPaused(false);
    });
    await host.waitForTimeout(750);
    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
    const stagedRemote = await host.evaluate(() => {
      const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0];
      return { readability: remote.readability, screenPosition: remote.screenPosition };
    });
    expect(stagedRemote.readability).toMatchObject({
      color: 0xff8c3a,
      intensity: 0.25,
      allDepthTested: true,
      allDepthWriting: true,
    });
    expect(stagedRemote.readability.highlightedMeshes).toBeGreaterThan(0);
    expect(Math.abs(stagedRemote.screenPosition[0])).toBeLessThan(0.25);
    expect(Math.abs(stagedRemote.screenPosition[1])).toBeLessThan(0.25);

    const auraShot = testInfo.outputPath('pass70-cross-engine-orange-remote.png');
    await host.screenshot({ path: auraShot, animations: 'disabled' });
    await testInfo.attach('cross-engine-orange-remote', { path: auraShot, contentType: 'image/png' });

    const guestId = await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.id);
    await guest.close({ runBeforeUnload: false });
    await host.waitForFunction((id) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
        .find((member: any) => member.id === id)?.connected === false
    ), guestId, { timeout: 30_000 });
    guest = await newPageWithDeadline(guestContext, `${crossGuestEngine}-guest-rejoined`);
    attachBrowserDiagnostics(guest, `${crossGuestEngine}-guest-rejoined`, diagnostics);
    await preparePlayer(guest, baseUrl, 'Cross Guest', 'pass70-cross-guest-rejoin', true);
    await guest.fill('#room-input', roomCode);
    await expect(guest.locator('#join')).toHaveAttribute('data-rejoin-available', 'true');
    await guest.click('#join');
    await waitForActivePair(host, guest);
    expect(await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.id)).toBe(guestId);

    await host.waitForFunction(() => localStorage.getItem('atomic-acres:host-match-checkpoint:v3') !== null, undefined, { timeout: 15_000 });
    await crashChromiumPage(hostContext, host);
    host = await newPageWithDeadline(hostContext, 'chromium-host-recovered');
    attachBrowserDiagnostics(host, 'chromium-host-recovered', diagnostics);
    await preparePlayer(host, baseUrl, 'Cross Host', 'pass70-cross-host-recover', true);
    await expect(host.locator('#host')).toHaveAttribute('data-recovery-available', 'true');
    await host.click('#host');
    await host.waitForFunction((expectedRoom) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted && state.matchPhase === 'active'
        && document.querySelector('#room-code')?.textContent?.trim() === expectedRoom;
    }, roomCode, { timeout: 90_000 });
    await waitForActivePair(host, guest);
    expect(await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.map((member: any) => member.id).sort()
    ))).toEqual(initialMemberIds);

    const runtimeLogs = await Promise.all([host, guest].map((page) => page.evaluate(() => (
      document.querySelector('#runtime-error-log')?.textContent?.trim() ?? ''
    ))));
    expect(runtimeLogs).toEqual(['', '']);
    expectNoBrowserFaults(diagnostics);
  } finally {
    await Promise.allSettled([hostContext.close(), guestContext.close()]);
    await Promise.allSettled([chromiumBrowser.close(), guestBrowser.close()]);
  }
});
