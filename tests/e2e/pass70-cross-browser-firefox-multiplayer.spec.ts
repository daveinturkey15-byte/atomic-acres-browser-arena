import { writeFile } from 'node:fs/promises';
import {
  chromium,
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

type EngineKind = 'chromium' | 'firefox' | 'webkit' | 'chrome' | 'edge';
type ListenerPoseMode = 'modern-audio-param' | 'legacy-setters' | 'hybrid' | 'unavailable';
const supportedEngines: readonly EngineKind[] = ['chromium', 'firefox', 'webkit', 'chrome', 'edge'];
const verifyCrossBrowser = process.env.PASS70_VERIFY_CROSS_BROWSER === '1';
const verifyFirefox = process.env.PASS70_VERIFY_FIREFOX === '1';
const expectedSourceSha = process.env.PASS70_CROSS_BROWSER_SOURCE_SHA ?? null;
if (verifyCrossBrowser && !/^[a-f0-9]{40}$/u.test(expectedSourceSha ?? '')) {
  throw new Error('PASS70_VERIFY_CROSS_BROWSER requires exact PASS70_CROSS_BROWSER_SOURCE_SHA provenance');
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

function listenerPoseModeFromCapabilities(capabilities: Record<string, any>): ListenerPoseMode {
  const properties = capabilities.properties ?? {};
  const methods = capabilities.methods ?? {};
  const audioParam = (name: string) => (
    properties[name]?.propertyType === 'object' && properties[name]?.valueType === 'number'
  );
  const modernPosition = ['positionX', 'positionY', 'positionZ'].every(audioParam);
  const modernOrientation = [
    'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ',
  ].every(audioParam);
  const legacyPosition = methods.setPosition === 'function';
  const legacyOrientation = methods.setOrientation === 'function';
  if ((!modernPosition && !legacyPosition) || (!modernOrientation && !legacyOrientation)) return 'unavailable';
  if (modernPosition && modernOrientation) return 'modern-audio-param';
  if (!modernPosition && !modernOrientation) return 'legacy-setters';
  return 'hybrid';
}

async function openEngineBrowser(kind: EngineKind): Promise<Browser> {
  if (kind === 'chromium') return chromium.launch({ headless: true });
  if (kind === 'firefox') {
    const executablePath = process.env.PASS70_FIREFOX_EXECUTABLE_PATH;
    return firefox.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  }
  if (kind === 'webkit') return webkit.launch({ headless: true });
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

for (const kind of ['firefox', 'chromium', 'webkit', 'chrome', 'edge'] as const) {
  test(`one-bot Skirmish starts, plays and weapon-reloads in ${kind}`, async ({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium', 'The explicit engine matrix is owned once by the Chromium project.');
    test.skip(!verifyCrossBrowser,
      'Run the explicit Pass 70 cross-browser verifier; ordinary Chromium projects do not launch external engines.');
    test.skip(!engineMatrix.has(kind), `${kind} is not selected by PASS70_ENGINE_MATRIX.`);
    test.skip(kind === 'firefox' && !verifyFirefox,
      'Set PASS70_VERIFY_FIREFOX=1 to run the real fail-closed Firefox start/play/reload lane.');
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
      const receiptPath = testInfo.outputPath(`pass70-${kind}-one-bot-receipt.json`);
      await writeFile(receiptPath, JSON.stringify({
        sourceSha: expectedSourceSha,
        engine: kind,
        browserVersion: browser.version(),
        listenerCapabilities,
        ...first,
      }, null, 2), 'utf8');
      await testInfo.attach(`${kind}-one-bot-receipt`, { path: receiptPath, contentType: 'application/json' });
      expect(first).toMatchObject({ botCount: 1, runtimeError: '', systemPaused: false, reloading: false, matchPhase: 'active' });
      expect(first.frameDelta).toBeGreaterThan(20);
      expect(first.audioListenerMode).toBe(listenerPoseModeFromCapabilities(listenerCapabilities));
      expect(first.audioContext).toEqual({ source: 'standard', state: 'running' });

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
        expect(reloaded.audioListenerMode).toBe(listenerPoseModeFromCapabilities(reloadedCapabilities));
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
        .toBe(listenerPoseModeFromCapabilities(
          label === 'host' ? hostListenerCapabilities : guestListenerCapabilities,
        ));
      expect(Number(probe.audioVoices)).toBeLessThanOrEqual(Number(probe.audioVoiceCap));
      expect((probe.readiness as any).ready).toBe(true);
    }
    const crossEngineReceiptPath = testInfo.outputPath('pass70-cross-engine-ui-frame-receipt.json');
    await writeFile(crossEngineReceiptPath, JSON.stringify({
      sourceSha: expectedSourceSha,
      guestEngine: crossGuestEngine,
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
