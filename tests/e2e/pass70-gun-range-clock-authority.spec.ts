import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  assertPass66OwnedCandidatePage,
  startOwnedPeerServer,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS70_RANGE_CLOCK_PEER_PORT ?? 9_077);
const nativeHiddenTab = process.env.PASS70_NATIVE_HIDDEN_TAB === '1';
let peerServer: OwnedPeerServer | null = null;

test.describe.configure({ timeout: 180_000 });
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

test.beforeAll(async () => {
  peerServer = await startOwnedPeerServer(peerPort, process.env.PASS70_RANGE_CLOCK_PEER_PATH);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

async function openPlayer(context: BrowserContext, name: string, seed: string): Promise<Page> {
  return preparePlayer(await context.newPage(), name, seed);
}

async function preparePlayer(page: Page, name: string, seed: string): Promise<Page> {
  if (!peerServer) throw new Error('Owned PeerJS server is not ready');
  const url = new URL(test.info().project.use.baseURL as string);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgl2');
  url.searchParams.set('render', 'compat');
  url.searchParams.set('signal', 'off');
  url.searchParams.set('grass', 'off');
  url.searchParams.set('mist', 'off');
  url.searchParams.set('clouds', 'off');
  url.searchParams.set('rays', 'off');
  url.searchParams.set('renderPaused', '1');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(peerPort));
  url.searchParams.set('peerQaPath', peerServer.path);
  url.searchParams.set('seed', seed);
  await page.goto(url.toString());
  await assertPass66OwnedCandidatePage(page);
  await page.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await page.fill('#player-name', name);
  return page;
}

async function clock(page: Page): Promise<{
  revision: number;
  paused: boolean;
  authorityRole: string;
  occupantIds: string[];
  remainingMs: number;
  effectiveRemainingMs: number;
}> {
  return page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock);
}

type ObservedGunRangeClock = Awaited<ReturnType<typeof clock>>;

function expectFreshBoundaryReset(
  values: readonly ObservedGunRangeClock[],
  paused: boolean,
  projectionToleranceMs = 750,
): void {
  for (const value of values) {
    expect(value.paused).toBe(paused);
    expect(Math.abs(120_000 - value.remainingMs)).toBeLessThan(projectionToleranceMs);
    expect(Math.abs(120_000 - value.effectiveRemainingMs)).toBeLessThan(projectionToleranceMs);
  }
  if (values.length > 1) {
    expect(Math.max(...values.map((value) => value.revision))).toBe(
      Math.min(...values.map((value) => value.revision)),
    );
    expect(Math.max(...values.map((value) => value.effectiveRemainingMs))
      - Math.min(...values.map((value) => value.effectiveRemainingMs))).toBeLessThan(350);
  }
}

type NativeHostHarness = Readonly<{
  host: NativeCdpClient;
  cover: NativeCdpClient;
  process: ChildProcess;
  profile: string;
  port: number;
  hostTargetId: string;
  coverTargetId: string;
}>;

class NativeCdpClient {
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data)) as {
        id?: number;
        result?: any;
        error?: { message?: string };
      };
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'Native CDP command failed'));
      else pending.resolve(message.result ?? {});
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('Native CDP socket closed'));
      this.pending.clear();
    });
  }

  static async connect(url: string): Promise<NativeCdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolveOpen, reject) => {
      socket.addEventListener('open', () => resolveOpen(), { once: true });
      socket.addEventListener('error', () => reject(new Error(`Failed to connect native CDP socket ${url}`)), { once: true });
    });
    return new NativeCdpClient(socket);
  }

  command<T = any>(method: string, params: Readonly<Record<string, unknown>> = {}): Promise<T> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<T>((resolveCommand, reject) => {
      this.pending.set(id, { resolve: resolveCommand, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T = any>(expression: string, userGesture = false): Promise<T> {
    const response = await this.command<{
      result?: { value?: T };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    }>('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Native CDP evaluation failed');
    }
    return response.result?.value as T;
  }

  close(): void {
    this.socket.close();
  }
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePort);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  if (!port) throw new Error('Failed to reserve a native Chrome debugging port');
  return port;
}

async function discoverNativeChrome(port: number): Promise<{
  targets: readonly { id: string; type: string; url: string; webSocketDebuggerUrl: string }[];
}> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const [versionResponse, targetsResponse] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/json/version`),
        fetch(`http://127.0.0.1:${port}/json/list`),
      ]);
      if (versionResponse.ok && targetsResponse.ok) {
        const version = await versionResponse.json() as { webSocketDebuggerUrl?: string };
        const targets = await targetsResponse.json() as { id: string; type: string; url: string }[];
        if (version.webSocketDebuggerUrl) return { targets };
      }
    } catch {
      // The direct CDP endpoint is not accepting connections yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error('Installed Chrome did not expose its direct CDP endpoint');
}

async function activateNativeTarget(port: number, targetId: string): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}/json/activate/${targetId}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Chrome refused to activate native tab ${targetId}: HTTP ${response.status}`);
}

function foregroundNativeChromeWindow(processId: number): void {
  if (!Number.isSafeInteger(processId) || processId <= 0) throw new Error(`Invalid native Chrome process id: ${processId}`);
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Pass70ClockWindow {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maximumCount);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint sourceThreadId, uint targetThreadId, bool attach);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  public static IntPtr FindSeedWindow(uint processId) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      uint owner;
      GetWindowThreadProcessId(hWnd, out owner);
      if (owner != processId || !IsWindowVisible(hWnd)) return true;
      int length = GetWindowTextLength(hWnd);
      if (length < 1) return true;
      StringBuilder title = new StringBuilder(length + 1);
      GetWindowText(hWnd, title, title.Capacity);
      if (title.ToString().IndexOf("Pass 70", StringComparison.OrdinalIgnoreCase) < 0) return true;
      found = hWnd;
      return false;
    }, IntPtr.Zero);
    return found;
  }
}
'@
$targetPid = ${processId}
$deadline = [DateTime]::UtcNow.AddSeconds(5)
do {
  [void](Get-Process -Id $targetPid -ErrorAction Stop)
  $handle = [Pass70ClockWindow]::FindSeedWindow([uint32]$targetPid)
  if ($handle -ne [IntPtr]::Zero) { break }
  Start-Sleep -Milliseconds 50
} while ([DateTime]::UtcNow -lt $deadline)
if ($handle -eq [IntPtr]::Zero) { throw 'native Chrome child did not expose its seeded main window' }
$ownerPid = [uint32]0
$targetThread = [Pass70ClockWindow]::GetWindowThreadProcessId($handle, [ref]$ownerPid)
if ($ownerPid -ne $targetPid) { throw 'native Chrome HWND did not belong to the launched child PID' }
$shell = New-Object -ComObject WScript.Shell
[void]$shell.AppActivate($targetPid)
$foreground = [Pass70ClockWindow]::GetForegroundWindow()
$foregroundPid = [uint32]0
$foregroundThread = [Pass70ClockWindow]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
$currentThread = [Pass70ClockWindow]::GetCurrentThreadId()
$attachedForeground = $foregroundThread -ne 0 -and $foregroundThread -ne $currentThread -and [Pass70ClockWindow]::AttachThreadInput($currentThread, $foregroundThread, $true)
$attachedTarget = $targetThread -ne 0 -and $targetThread -ne $currentThread -and [Pass70ClockWindow]::AttachThreadInput($currentThread, $targetThread, $true)
try {
  [void][Pass70ClockWindow]::ShowWindowAsync($handle, 3)
  [void][Pass70ClockWindow]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 1600, 900, 0x0040)
  [void][Pass70ClockWindow]::BringWindowToTop($handle)
  [void][Pass70ClockWindow]::SetForegroundWindow($handle)
  [void][Pass70ClockWindow]::SetActiveWindow($handle)
  [void][Pass70ClockWindow]::SetFocus($handle)
  Start-Sleep -Milliseconds 150
  if ([Pass70ClockWindow]::GetForegroundWindow() -ne $handle) { throw 'native Chrome child did not become the OS foreground window' }
} finally {
  if ($attachedTarget) { [void][Pass70ClockWindow]::AttachThreadInput($currentThread, $targetThread, $false) }
  if ($attachedForeground) { [void][Pass70ClockWindow]::AttachThreadInput($currentThread, $foregroundThread, $false) }
}
if (-not [Pass70ClockWindow]::IsWindowVisible($handle) -or [Pass70ClockWindow]::IsIconic($handle)) { throw 'native Chrome child was not visible and restored' }`;
  execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', [
    '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script,
  ], { encoding: 'utf8', windowsHide: true });
}

async function waitForNativeTabOwnership(
  host: NativeCdpClient,
  cover: NativeCdpClient,
  expected: 'host' | 'cover',
): Promise<void> {
  const documentExpression = '({visibilityState:document.visibilityState,hasFocus:document.hasFocus()})';
  await expect.poll(async () => Promise.all([
    host.evaluate(documentExpression), cover.evaluate(documentExpression),
  ]), { timeout: 5_000, intervals: [50, 100, 250] }).toEqual(expected === 'host'
    ? [
        { visibilityState: 'visible', hasFocus: true },
        { visibilityState: 'hidden', hasFocus: false },
      ]
    : [
        { visibilityState: 'hidden', hasFocus: false },
        { visibilityState: 'visible', hasFocus: true },
      ]);
}

async function startNativeHostHarness(): Promise<NativeHostHarness> {
  const chromePath = [
    process.env.PASS70_CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter((candidate): candidate is string => Boolean(candidate)).find((candidate) => existsSync(candidate));
  if (!chromePath) throw new Error('Native hidden-host evidence requires installed Google Chrome');
  const profile = await mkdtemp(join(tmpdir(), 'atomic-acres-pass70-hidden-host-'));
  const hostSeedPath = join(profile, 'pass70-host-tab.html');
  const coverSeedPath = join(profile, 'pass70-cover-tab.html');
  await Promise.all([
    writeFile(hostSeedPath, '<!doctype html><title>Pass 70 Gun Range host</title>', 'utf8'),
    writeFile(coverSeedPath, '<!doctype html><title>Pass 70 Gun Range cover</title><main>Native hidden-host evidence</main>', 'utf8'),
  ]);
  const hostSeedUrl = pathToFileURL(hostSeedPath).href;
  const coverSeedUrl = pathToFileURL(coverSeedPath).href;
  const port = await availablePort();
  // DECLARED VISIBLE LANE - do not park this off-screen. This is the native
  // hidden-host evidence run: it seeds two real tabs and covers one, so the
  // genuine on-screen visibility of these windows IS the measurement. Parking
  // them would change the occlusion state under test rather than hide it.
  // It mutes, which is the half that can be fixed without lying.
  // See scripts/qa/browser-visibility-contract.test.mjs.
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
    '--new-window',
    '--window-position=0,0',
    '--window-size=1600,900',
    hostSeedUrl,
    coverSeedUrl,
  ];
  const child = spawn(chromePath, args, { stdio: 'ignore', windowsHide: false });
  let host: NativeCdpClient | null = null;
  let cover: NativeCdpClient | null = null;
  try {
    const discovery = await discoverNativeChrome(port);
    const hostTarget = discovery.targets.find((target) => target.type === 'page' && target.url === hostSeedUrl);
    const coverTarget = discovery.targets.find((target) => target.type === 'page' && target.url === coverSeedUrl);
    if (!hostTarget || !coverTarget) throw new Error('Chrome did not preserve the two command-line-seeded native tabs');
    foregroundNativeChromeWindow(child.pid!);
    host = await NativeCdpClient.connect(hostTarget.webSocketDebuggerUrl);
    cover = await NativeCdpClient.connect(coverTarget.webSocketDebuggerUrl);
    await Promise.all([
      host.command('Runtime.enable'), host.command('Page.enable'),
      cover.command('Runtime.enable'), cover.command('Page.enable'),
    ]);
    await activateNativeTarget(port, hostTarget.id);
    await waitForNativeTabOwnership(host, cover, 'host');
    return Object.freeze({
      host, cover, process: child, profile, port,
      hostTargetId: hostTarget.id, coverTargetId: coverTarget.id,
    });
  } catch (error) {
    host?.close();
    cover?.close();
    if (child.exitCode === null) child.kill();
    if (child.exitCode === null && child.signalCode === null) {
      await Promise.race([
        new Promise<void>((resolveExit) => child.once('exit', () => resolveExit())),
        new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
      ]);
    }
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await rm(profile, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
    }
    throw error;
  }
}

async function stopNativeHostHarness(harness: NativeHostHarness): Promise<void> {
  harness.host.close();
  harness.cover.close();
  if (harness.process.exitCode === null) harness.process.kill();
  if (harness.process.exitCode === null && harness.process.signalCode === null) {
    await Promise.race([
      new Promise<void>((resolveExit) => harness.process.once('exit', () => resolveExit())),
      new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
    ]);
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(harness.profile, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
  }
}

async function waitForNativeValue<T>(
  client: NativeCdpClient,
  expression: string,
  predicate: (value: T) => boolean,
  label: string,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let latest: T | undefined;
  let latestError: unknown = null;
  while (Date.now() < deadline) {
    try {
      latest = await client.evaluate<T>(expression);
      if (predicate(latest)) return latest;
    } catch (error) {
      latestError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(`${label} did not complete within ${timeoutMs}ms; latest=${JSON.stringify(latest)}; error=${String(latestError ?? 'none')}`);
}

async function trustedNativeClick(client: NativeCdpClient, selector: string): Promise<void> {
  const point = await client.evaluate<{ x: number; y: number }>(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) throw new Error('Native click target missing: ${selector}');
    const rect = target.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await client.command('Input.dispatchMouseEvent', {
    type: 'mousePressed', ...point, button: 'left', clickCount: 1,
  });
  await client.command('Input.dispatchMouseEvent', {
    type: 'mouseReleased', ...point, button: 'left', clickCount: 1,
  });
}

async function setNativeFormValue(client: NativeCdpClient, selector: string, value: string): Promise<void> {
  await client.evaluate(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
      throw new Error('Native form target missing: ${selector}');
    }
    const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) throw new Error('Native form target has no value setter: ${selector}');
    setter.call(target, ${JSON.stringify(value)});
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  })()`, true);
}

async function prepareNativePlayer(client: NativeCdpClient, name: string, seed: string): Promise<void> {
  if (!peerServer) throw new Error('Owned PeerJS server is not ready');
  const url = new URL(test.info().project.use.baseURL as string);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgl2');
  url.searchParams.set('render', 'compat');
  url.searchParams.set('signal', 'off');
  url.searchParams.set('grass', 'off');
  url.searchParams.set('mist', 'off');
  url.searchParams.set('clouds', 'off');
  url.searchParams.set('rays', 'off');
  url.searchParams.set('renderPaused', '1');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(peerPort));
  url.searchParams.set('peerQaPath', peerServer.path);
  url.searchParams.set('seed', seed);
  await client.command('Page.navigate', { url: url.toString() });
  await waitForNativeValue<boolean>(client, `Boolean(
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true
    && document.querySelector('#player-name')
  )`, Boolean, 'native host bootstrap', 60_000);
  await setNativeFormValue(client, '#player-name', name);
}

async function nativeClock(client: NativeCdpClient): Promise<{
  revision: number;
  paused: boolean;
  authorityRole: string;
  occupantIds: string[];
  remainingMs: number;
  effectiveRemainingMs: number;
}> {
  return client.evaluate('window.__ATOMIC_ACRES_DEBUG__.snapshot().matchClock');
}

test('offline Gun Range entry and exit each reset the solo authority to two minutes', async ({ page }) => {
  await preparePlayer(page, 'CLOCK SOLO', 'pass70-clock-solo');
  await page.locator('.map-card[data-arena-id="gun-range"]').click();
  await page.waitForFunction(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.id === 'gun-range'
  ), undefined, { timeout: 60_000 });
  await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active' && state.matchClock?.paused === false;
  }, undefined, { timeout: 60_000 });
  const initial = await clock(page);
  await page.waitForTimeout(1_100);
  await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(72, 1.7, 6));
  await page.waitForFunction((revision) => {
    const value = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock;
    return value?.paused === true && value.revision === revision + 1;
  }, initial.revision, { timeout: 15_000 });
  const entered = await clock(page);
  expectFreshBoundaryReset([entered], true);
  await page.waitForTimeout(1_250);
  expect(Math.abs((await clock(page)).effectiveRemainingMs - entered.effectiveRemainingMs)).toBeLessThan(180);

  await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(20, 1.7, 0));
  await page.waitForFunction((revision) => {
    const value = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock;
    return value?.paused === false && value.revision === revision + 1;
  }, entered.revision, { timeout: 15_000 });
  const exited = await clock(page);
  expectFreshBoundaryReset([exited], false);
  await page.waitForTimeout(1_250);
  const countedDown = await clock(page);
  expect(exited.effectiveRemainingMs - countedDown.effectiveRemainingMs).toBeGreaterThan(900);
  expect(exited.effectiveRemainingMs - countedDown.effectiveRemainingMs).toBeLessThan(1_600);
});

test('every host and guest bay boundary resets the synchronized clock to two minutes', async ({ browser, browserName }) => {
  test.setTimeout(360_000);
  test.skip(browserName === 'firefox', 'Bundled headless Firefox cannot retain two simultaneous game pages.');
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext({ viewport: { width: 1_280, height: 720 } }),
    browser.newContext({ viewport: { width: 1_280, height: 720 } }),
  ]);
  try {
    const [host, guest] = await Promise.all([
      openPlayer(hostContext, 'CLOCK HOST', 'pass70-clock-host'),
      openPlayer(guestContext, 'CLOCK GUEST', 'pass70-clock-guest'),
    ]);
    await host.click('#host');
    await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
    const roomCode = (await host.textContent('#room-code'))!.trim();
    await guest.fill('#room-input', roomCode);
    await guest.click('#join');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
    ))));

    await host.locator('#lobby-arena').selectOption('gun-range');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.privateMatch?.arenaId === 'gun-range'
        && state.privateMatch.durationMs === 120_000
        && state.arenaSelection.id === 'gun-range';
    }, undefined, { timeout: 60_000 })));
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await expect(host.locator('#lobby-start')).toBeEnabled();
    await host.click('#lobby-start');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted && state.matchPhase === 'active'
        && state.matchClock?.paused === false;
    }, undefined, { timeout: 60_000 })));
    const initialClocks = await Promise.all([clock(host), clock(guest)]);
    for (const initial of initialClocks) {
      expect(initial.remainingMs).toBeLessThanOrEqual(120_000);
      expect(initial.remainingMs).toBeGreaterThan(118_500);
    }
    expect(Math.abs(initialClocks[0].effectiveRemainingMs - initialClocks[1].effectiveRemainingMs)).toBeLessThan(350);

    const guestId = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
        .find((member: any) => member.name === 'CLOCK GUEST')?.id
    ));
    const hostId = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
        .find((member: any) => member.name === 'CLOCK HOST')?.id
    ));
    expect(typeof guestId).toBe('string');
    expect(typeof hostId).toBe('string');
    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(20, 1.7, 0));
    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(72, 1.7, 6));
    await host.waitForFunction(({ id }) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const remote = state.remotePlayers.find((candidate: any) => candidate.id === id);
      return remote && Math.abs(remote.authoritativePosition[0] - 72) < 0.5
        && Math.abs(remote.authoritativePosition[2] - 6) < 0.5
        && state.matchClock?.paused === true
        && state.matchClock.occupantIds.includes(id);
    }, { id: guestId }, { timeout: 15_000 });
    await guest.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock?.paused === true
    ), undefined, { timeout: 15_000 });

    const pausedStart = await Promise.all([clock(host), clock(guest)]);
    expect(pausedStart[0]).toMatchObject({ paused: true, authorityRole: 'host', occupantIds: [guestId] });
    expect(pausedStart[1]).toMatchObject({ paused: true, authorityRole: 'replica', occupantIds: [] });
    expect(pausedStart[1].revision).toBe(pausedStart[0].revision);
    expectFreshBoundaryReset(pausedStart, true);
    await host.waitForTimeout(1_250);
    const pausedEnd = await Promise.all([clock(host), clock(guest)]);
    for (let index = 0; index < 2; index += 1) {
      expect(Math.abs(pausedEnd[index].effectiveRemainingMs - pausedStart[index].effectiveRemainingMs)).toBeLessThan(180);
    }
    expect(Math.abs(pausedEnd[0].effectiveRemainingMs - pausedEnd[1].effectiveRemainingMs)).toBeLessThan(350);

    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(20, 1.7, 0));
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock?.paused === false
    ), undefined, { timeout: 15_000 })));
    const exitReset = await Promise.all([clock(host), clock(guest)]);
    expect(exitReset[0].revision).toBe(pausedStart[0].revision + 1);
    expect(exitReset[1].revision).toBe(exitReset[0].revision);
    expectFreshBoundaryReset(exitReset, false);
    await host.waitForTimeout(1_250);
    const exitCountedDown = await Promise.all([clock(host), clock(guest)]);
    for (let index = 0; index < 2; index += 1) {
      const consumedMs = exitReset[index].effectiveRemainingMs - exitCountedDown[index].effectiveRemainingMs;
      expect(consumedMs).toBeGreaterThan(900);
      expect(consumedMs).toBeLessThan(1_600);
    }
    expect(Math.abs(exitCountedDown[0].effectiveRemainingMs - exitCountedDown[1].effectiveRemainingMs)).toBeLessThan(350);

    const revisionBeforeHostEntry = (await clock(host)).revision;
    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(72, 1.7, 6));
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock?.paused === true
    ), undefined, { timeout: 15_000 })));
    const hostEntered = await Promise.all([clock(host), clock(guest)]);
    expect(hostEntered[0].occupantIds).toEqual([hostId]);
    expect(hostEntered[0].revision).toBe(revisionBeforeHostEntry + 1);
    expectFreshBoundaryReset(hostEntered, true);
    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(20, 1.7, 0));
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock?.paused === false
    ), undefined, { timeout: 15_000 })));
    const hostExited = await Promise.all([clock(host), clock(guest)]);
    expect(hostExited[0].revision).toBe(hostEntered[0].revision + 1);
    expectFreshBoundaryReset(hostExited, false);

    // A transport replacement is not an occupant. Disconnect in-bay removes
    // one canonical participant edge and resets to two minutes while running;
    // authenticated rejoin restores the retained host position and creates a
    // second two-minute paused edge without accepting a client-local claim.
    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(72, 1.7, 6));
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock?.paused === true
    ), undefined, { timeout: 15_000 })));
    const revisionBeforeDisconnect = (await clock(host)).revision;
    await guest.reload({ waitUntil: 'domcontentloaded' });
    await assertPass66OwnedCandidatePage(guest);
    await host.waitForFunction((id) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.privateMatch.members.find((member: any) => member.id === id)?.connected === false
        && state.matchClock?.paused === false && !state.matchClock.occupantIds.includes(id);
    }, guestId, { timeout: 20_000 });
    const disconnected = await clock(host);
    // A single authority sample may observe another participant edge too; the
    // pure edge-count gate proves the exact revision jump for that case.
    expect(disconnected.revision).toBeGreaterThan(revisionBeforeDisconnect);
    expectFreshBoundaryReset([disconnected], false);

    await guest.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
    await expect(guest.locator('#room-input')).toHaveValue(roomCode);
    await expect(guest.locator('#join')).toHaveAttribute('data-rejoin-available', 'true');
    await guest.fill('#player-name', 'CLOCK GUEST');
    await guest.click('#join');
    await Promise.all([host, guest].map((page) => page.waitForFunction((id) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted && state.matchPhase === 'active'
        && state.privateMatch?.members.find((member: any) => member.id === id)?.connected === true;
    }, guestId, { timeout: 60_000 })));
    await expect.poll(async () => {
      const [hostState, guestState] = await Promise.all([
        host.evaluate((id) => {
          const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
          const remote = state.remotePlayers.find((candidate: any) => candidate.id === id);
          const retained = state.retainedRemotePlayers.find((candidate: any) => candidate.id === id);
          const stablePosition = (position: number[] | undefined): number[] | null => position
            ? [Number(position[0].toFixed(3)), position[1], Number(position[2].toFixed(3))]
            : null;
          return {
            paused: state.matchClock?.paused === true,
            occupant: state.matchClock?.occupantIds.includes(id) === true,
            remotePosition: stablePosition(remote?.authoritativePosition),
            retainedPosition: stablePosition(retained?.position),
          };
        }, guestId),
        guest.evaluate(() => {
          const player = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player;
          const position = player.lastAppliedGuestResumeAuthority?.position as number[] | undefined;
          return {
            awaitingAuthority: player.awaitingCanonicalGuestAuthority,
            appliedPosition: position
              ? [Number(position[0].toFixed(3)), position[1], Number(position[2].toFixed(3))]
              : null,
          };
        }),
      ]);
      return { host: hostState, guest: guestState };
    }, { timeout: nativeHiddenTab ? 45_000 : 20_000, intervals: [100, 250, 500] }).toMatchObject({
      host: {
        paused: true,
        occupant: true,
        remotePosition: [72, expect.any(Number), 6],
        retainedPosition: [72, expect.any(Number), 6],
      },
      guest: { awaitingAuthority: false, appliedPosition: [72, expect.any(Number), 6] },
    });
    const restored = await clock(host);
    expect(restored.occupantIds).toContain(guestId);
    expect(restored.revision).toBe(disconnected.revision + 1);
    expectFreshBoundaryReset([restored, await clock(guest)], true);

    // A host rematch constructs a fresh revision-zero two-minute authority;
    // it never carries the paused clock from the prior round.
    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.endMatch());
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'ended'
    ), undefined, { timeout: 15_000 })));
    await host.locator('#rematch').click();
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.phase === 'waiting'
    ), undefined, { timeout: 15_000 })));
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await expect(host.locator('#lobby-start')).toBeEnabled();
    await host.click('#lobby-start');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted && state.matchPhase === 'active'
        && state.matchClock?.revision === 0 && state.matchClock.remainingMs > 118_500;
    }, undefined, { timeout: 60_000 })));
    const resetClocks = await Promise.all([clock(host), clock(guest)]);
    for (const reset of resetClocks) {
      expect(reset).toMatchObject({ revision: 0, paused: false });
      expect(reset.remainingMs).toBeLessThanOrEqual(120_000);
      expect(reset.remainingMs).toBeGreaterThan(118_500);
    }
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test('a genuinely hidden native host keeps two-minute bay boundary resets authoritative', async ({ browser, browserName }, testInfo) => {
  test.setTimeout(180_000);
  test.skip(!nativeHiddenTab, 'Opt-in evidence requires a headed installed-Chrome window and native tab ownership.');
  test.skip(browserName !== 'chromium', 'The guest fixture must be Chromium for the native Chrome authority falsifier.');
  const nativeHarness = await startNativeHostHarness();
  const guestContext = await browser.newContext({ viewport: { width: 1_280, height: 720 } });
  try {
    const host = nativeHarness.host;
    const [, guest] = await Promise.all([
      prepareNativePlayer(host, 'NATIVE HOST', 'pass70-native-clock-host'),
      openPlayer(guestContext, 'NATIVE GUEST', 'pass70-native-clock-guest'),
    ]);
    await activateNativeTarget(nativeHarness.port, nativeHarness.hostTargetId);
    await waitForNativeTabOwnership(host, nativeHarness.cover, 'host');
    await trustedNativeClick(host, '#host');
    const roomCode = await waitForNativeValue<string>(
      host,
      `document.querySelector('#room-code')?.textContent?.trim() ?? ''`,
      (value) => value.length > 0,
      'native host room code',
    );
    await guest.fill('#room-input', roomCode);
    await guest.click('#join');
    await Promise.all([
      waitForNativeValue<number>(
        host,
        `window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length ?? 0`,
        (value) => value === 2,
        'native host guest admission',
      ),
      guest.waitForFunction(() => (
        (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
      )),
    ]);
    await setNativeFormValue(host, '#lobby-arena', 'gun-range');
    await Promise.all([
      waitForNativeValue<boolean>(host, `(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return state.privateMatch?.arenaId === 'gun-range'
          && state.privateMatch.durationMs === 120000
          && state.arenaSelection.id === 'gun-range';
      })()`, Boolean, 'native host Gun Range selection', 60_000),
      guest.waitForFunction(() => {
        const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
        return state.privateMatch?.arenaId === 'gun-range'
          && state.privateMatch.durationMs === 120_000
          && state.arenaSelection.id === 'gun-range';
      }, undefined, { timeout: 60_000 }),
    ]);
    await waitForNativeValue<any>(
      host,
      `(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          enabled: document.querySelector('#lobby-ready')?.disabled === false,
          document: { visibilityState: document.visibilityState, hasFocus: document.hasFocus() },
          arenaId: state.arenaSelection.id,
          transition: state.arenaSelection.streaming.transition,
          runtimeError: document.querySelector('#runtime-error-log')?.textContent ?? '',
        };
      })()`,
      (value) => value?.enabled === true,
      'native host ready admission',
      60_000,
    );
    await trustedNativeClick(host, '#lobby-ready');
    await guest.click('#lobby-ready');
    await waitForNativeValue<boolean>(host, `(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.privateMatch?.members.find((member) => member.name === 'NATIVE HOST')?.ready === true
        && state.privateMatch?.members.find((member) => member.name === 'NATIVE GUEST')?.ready === true
        && document.querySelector('#lobby-start')?.disabled === false;
    })()`, Boolean, 'native host start admission', 30_000);
    await trustedNativeClick(host, '#lobby-start');
    await Promise.all([
      waitForNativeValue<boolean>(host, `(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return state.gameStarted && state.matchPhase === 'active' && state.matchClock?.paused === false;
      })()`, Boolean, 'native host active match', 60_000),
      guest.waitForFunction(() => {
        const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
        return state.gameStarted && state.matchPhase === 'active' && state.matchClock?.paused === false;
      }, undefined, { timeout: 60_000 }),
    ]);
    const initial = await Promise.all([nativeClock(host), clock(guest)]);
    for (const value of initial) {
      expect(value.remainingMs).toBeLessThanOrEqual(120_000);
      expect(value.remainingMs).toBeGreaterThan(118_500);
    }
    const guestId = await host.evaluate<string>(`window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
      .find((member) => member.name === 'NATIVE GUEST')?.id`);
    expect(typeof guestId).toBe('string');
    await host.evaluate(`window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(20, 1.7, 0)`);
    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(20, 1.7, 0));
    const backgroundHeartbeatBefore = await host.evaluate<number>(
      `window.__ATOMIC_ACRES_DEBUG__.snapshot().presentationScheduling.hostedBackgroundNetworkHeartbeatCount`,
    );
    await activateNativeTarget(nativeHarness.port, nativeHarness.coverTargetId);
    await waitForNativeTabOwnership(host, nativeHarness.cover, 'cover');

    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(72, 1.7, 6));
    await Promise.all([
      waitForNativeValue<boolean>(host, `(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        const remote = state.remotePlayers.find((candidate) => candidate.id === ${JSON.stringify(guestId)});
        return Boolean(remote && Math.abs(remote.authoritativePosition[0] - 72) < 0.5
          && Math.abs(remote.authoritativePosition[2] - 6) < 0.5
          && state.matchClock?.paused === true
          && state.matchClock.occupantIds.includes(${JSON.stringify(guestId)}));
      })()`, Boolean, 'hidden native host bay entry reset'),
      guest.waitForFunction(() => (
        (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock?.paused === true
      ), undefined, { timeout: 15_000 }),
    ]);
    const pausedStart = await Promise.all([nativeClock(host), clock(guest)]);
    expectFreshBoundaryReset(pausedStart, true);
    await guest.waitForTimeout(1_250);
    const pausedEnd = await Promise.all([nativeClock(host), clock(guest)]);
    for (let index = 0; index < 2; index += 1) {
      expect(Math.abs(pausedEnd[index].effectiveRemainingMs - pausedStart[index].effectiveRemainingMs)).toBeLessThan(180);
    }
    await waitForNativeValue<boolean>(host, `(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.presentationScheduling.mode === 'hosted-authority-network'
        && state.presentationScheduling.hostedBackgroundNetworkHeartbeatCount > ${backgroundHeartbeatBefore};
    })()`, Boolean, 'hidden native host background heartbeat');

    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(20, 1.7, 0));
    await Promise.all([
      waitForNativeValue<boolean>(host, `window.__ATOMIC_ACRES_DEBUG__.snapshot().matchClock?.paused === false`, Boolean, 'hidden native host bay exit reset'),
      guest.waitForFunction(() => (
        (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock?.paused === false
      ), undefined, { timeout: 15_000 }),
    ]);
    const exitReset = await Promise.all([nativeClock(host), clock(guest)]);
    expectFreshBoundaryReset(exitReset, false);
    await guest.waitForTimeout(1_250);
    const exitCountedDown = await Promise.all([nativeClock(host), clock(guest)]);
    for (let index = 0; index < 2; index += 1) {
      const consumedMs = exitReset[index].effectiveRemainingMs - exitCountedDown[index].effectiveRemainingMs;
      expect(consumedMs).toBeGreaterThan(900);
      expect(consumedMs).toBeLessThan(1_600);
    }

    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(72, 1.7, 6));
    await Promise.all([
      waitForNativeValue<boolean>(host, `window.__ATOMIC_ACRES_DEBUG__.snapshot().matchClock?.paused === true`, Boolean, 'hidden native host second bay entry reset'),
      guest.waitForFunction(() => (
        (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock?.paused === true
      ), undefined, { timeout: 15_000 }),
    ]);
    const secondPaused = await Promise.all([nativeClock(host), clock(guest)]);
    expectFreshBoundaryReset(secondPaused, true);

    // Keep the host genuinely hidden while a connected guest drives the
    // secure door. The heartbeat must update the rendered leaf and both
    // collision lanes before the same authority snapshot reaches the guest.
    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(48.75, 1.7, 12));
    const hiddenDoorOpen = await waitForNativeValue<any>(host, `(() => {
      const door = window.__ATOMIC_ACRES_DEBUG__.snapshot().testBayDoor;
      return door && {
        phase: door.phase,
        openness: door.openness,
        authorityRole: door.authorityRole,
        dynamicColliderCount: door.dynamicColliderCount,
        dynamicBallisticSurfaceCount: door.dynamicBallisticSurfaceCount,
        leafY: door.leafY,
      };
    })()`, (door) => door?.phase === 'open'
      && door.openness === 1
      && door.dynamicColliderCount === 0
      && door.dynamicBallisticSurfaceCount === 0
      && Math.abs(door.leafY - 10.25) < 0.01, 'hidden native host door open');
    await guest.waitForFunction(() => {
      const door = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().testBayDoor;
      return door?.phase === 'open' && door.openness === 1
        && door.dynamicColliderCount === 0 && door.dynamicBallisticSurfaceCount === 0
        && Math.abs(door.leafY - 10.25) < 0.01;
    }, undefined, { timeout: 15_000 });
    const replicaDoorOpen = await guest.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().testBayDoor
    ));
    expect(hiddenDoorOpen).toMatchObject({ authorityRole: 'host', dynamicColliderCount: 0, dynamicBallisticSurfaceCount: 0 });
    expect(replicaDoorOpen).toMatchObject({ authorityRole: 'replica', phase: 'open', openness: 1, leafY: 10.25 });

    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(20, 1.7, 0));
    const hiddenDoorClosed = await waitForNativeValue<any>(host, `(() => {
      const door = window.__ATOMIC_ACRES_DEBUG__.snapshot().testBayDoor;
      return door && {
        phase: door.phase,
        openness: door.openness,
        authorityRole: door.authorityRole,
        dynamicColliderCount: door.dynamicColliderCount,
        dynamicBallisticSurfaceCount: door.dynamicBallisticSurfaceCount,
        leafY: door.leafY,
      };
    })()`, (door) => door?.phase === 'closed'
      && door.openness === 0
      && door.dynamicColliderCount === 1
      && door.dynamicBallisticSurfaceCount === 1
      && Math.abs(door.leafY - 3.25) < 0.01, 'hidden native host door close');
    await guest.waitForFunction(() => {
      const door = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().testBayDoor;
      return door?.phase === 'closed' && door.openness === 0
        && door.dynamicColliderCount === 1 && door.dynamicBallisticSurfaceCount === 1
        && Math.abs(door.leafY - 3.25) < 0.01;
    }, undefined, { timeout: 15_000 });
    const replicaDoorClosed = await guest.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().testBayDoor
    ));
    expect(hiddenDoorClosed).toMatchObject({ authorityRole: 'host', dynamicColliderCount: 1, dynamicBallisticSurfaceCount: 1 });
    expect(replicaDoorClosed).toMatchObject({ authorityRole: 'replica', phase: 'closed', openness: 0, leafY: 3.25 });

    foregroundNativeChromeWindow(nativeHarness.process.pid!);
    await activateNativeTarget(nativeHarness.port, nativeHarness.coverTargetId);
    await waitForNativeTabOwnership(host, nativeHarness.cover, 'cover');
    const nativeProof = await Promise.all([
      host.evaluate(`(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          document: { visibilityState: document.visibilityState, hasFocus: document.hasFocus() },
          clock: state.matchClock,
          scheduling: state.presentationScheduling,
        };
      })()`),
      nativeHarness.cover.evaluate(`({
        document: { visibilityState: document.visibilityState, hasFocus: document.hasFocus() },
      })`),
    ]);
    expect(nativeProof[0].document).toEqual({ visibilityState: 'hidden', hasFocus: false });
    expect(nativeProof[1].document).toEqual({ visibilityState: 'visible', hasFocus: true });
    const evidence = resolve(process.cwd(), 'artifacts/pass70/gun-range-clock-authority');
    mkdirSync(evidence, { recursive: true });
    const proofPath = resolve(evidence, 'native-hidden-host.json');
    writeFileSync(proofPath, `${JSON.stringify({
      contract: 'native-direct-cdp-hidden-host-v1',
      hostTargetId: nativeHarness.hostTargetId,
      coverTargetId: nativeHarness.coverTargetId,
      initial,
      pausedStart,
      pausedEnd,
      exitReset,
      exitCountedDown,
      secondPaused,
      hiddenDoorOpen,
      replicaDoorOpen,
      hiddenDoorClosed,
      replicaDoorClosed,
      backgroundHeartbeatBefore,
      host: nativeProof[0],
      cover: nativeProof[1],
    }, null, 2)}\n`, 'utf8');
    await testInfo.attach('pass70-native-hidden-host', { path: proofPath, contentType: 'application/json' });
    await activateNativeTarget(nativeHarness.port, nativeHarness.hostTargetId);
    await waitForNativeTabOwnership(host, nativeHarness.cover, 'host');
  } finally {
    await guestContext.close();
    await stopNativeHostHarness(nativeHarness);
  }
});
