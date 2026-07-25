import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { resolve } from 'node:path';

const peerPort = 9_063;
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
  viewport: { width: 1_920, height: 1_080 },
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

async function openPlayer(context: BrowserContext, name: string, seed: string): Promise<Page> {
  const page = await context.newPage();
  const url = new URL('/', test.info().project.use.baseURL as string);
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
  url.searchParams.set('seed', seed);
  await page.goto(url.toString());
  await page.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('.map-card')].some((button) => !button.disabled));
  await page.fill('#player-name', name);
  return page;
}

async function openChat(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  await expect(page.locator('#text-chat')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#text-chat-input')).toBeFocused();
}

async function sendChat(page: Page, text: string): Promise<void> {
  await openChat(page);
  await page.locator('#text-chat-input').fill(text);
  await page.keyboard.press('Enter');
  await expect(page.locator('#text-chat')).toHaveAttribute('data-open', 'false');
}

async function chatSnapshot(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().textChat);
}

test('shares safe authoritative history in lobby and match, gates input, and restores it on rejoin', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1_920, height: 1_080 } });
  const host = await openPlayer(context, 'Host 63', 'pass63-chat-host');
  const guest = await openPlayer(context, 'Guest 63', 'pass63-chat-guest');

  await host.click('#host');
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.textContent('#room-code'))!.trim();
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await Promise.all([
    host.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2),
    guest.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2),
  ]);

  await sendChat(host, 'Host says hello.');
  await expect(host.locator('#text-chat-log')).toContainText('Host says hello.');
  await expect(guest.locator('#text-chat-log')).toContainText('Host says hello.');

  const xssText = 'Literal <img src=x onerror="window.__chatXss=1">';
  await sendChat(guest, xssText);
  await expect(host.locator('#text-chat-log')).toContainText(xssText);
  await expect(guest.locator('#text-chat-log')).toContainText(xssText);
  expect(await host.locator('#text-chat-log img').count()).toBe(0);
  expect(await guest.locator('#text-chat-log img').count()).toBe(0);
  expect(await host.evaluate(() => (window as any).__chatXss)).toBeUndefined();
  expect(await guest.evaluate(() => (window as any).__chatXss)).toBeUndefined();

  const beforeSpoof = (await chatSnapshot(host)).entries.length;
  const hostId = await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members[0].id);
  expect(await guest.evaluate(({ claimedBy }) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.sendRawChat('spoofed sender', claimedBy)
  ), { claimedBy: hostId })).toBe(true);
  await host.waitForTimeout(500);
  expect((await chatSnapshot(host)).entries).toHaveLength(beforeSpoof);
  expect((await chatSnapshot(guest)).entries).toHaveLength(beforeSpoof);

  await openChat(guest);
  await guest.keyboard.down('w');
  await guest.keyboard.up('w');
  expect((await chatSnapshot(guest)).heldKeys).not.toContain('KeyW');
  expect((await chatSnapshot(guest)).triggerHeld).toBe(false);
  await guest.keyboard.press('Escape');
  await expect(guest.locator('#text-chat')).toHaveAttribute('data-open', 'false');
  await expect(guest.locator('#text-chat-input')).toHaveValue('');

  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.click('#lobby-start');
  await Promise.all([
    host.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === true),
    guest.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === true),
  ]);

  await sendChat(guest, 'Live match check.');
  await expect(host.locator('#text-chat-log')).toContainText('Live match check.');
  await expect(guest.locator('#text-chat-log')).toContainText('Live match check.');

  const overlapAudit = await host.evaluate(() => {
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
    const chat = rect('#text-chat');
    const core = ['#health-block', '#weapon-block', '#support-block', '#minimap'].map((selector) => ({ selector, rect: rect(selector) }));
    const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      viewport: [window.innerWidth, window.innerHeight],
      chat: chat ? { left: chat.left, top: chat.top, right: chat.right, bottom: chat.bottom } : null,
      collisions: chat ? core.filter((item) => item.rect && overlaps(chat, item.rect)).map((item) => item.selector) : ['missing-chat'],
    };
  });
  expect(overlapAudit.viewport).toEqual([1_920, 1_080]);
  expect(overlapAudit.chat).not.toBeNull();
  expect(overlapAudit.collisions).toEqual([]);

  const expectedHistory = (await chatSnapshot(host)).entries.map((entry: any) => entry.text);
  await guest.reload({ waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => document.querySelector('#lobby-roster')?.textContent?.includes('REJOINING'));
  await guest.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await guest.fill('#player-name', 'Guest 63');
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await guest.waitForFunction((count) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().textChat.entries.length === count
  ), expectedHistory.length);
  expect((await chatSnapshot(guest)).entries.map((entry: any) => entry.text)).toEqual(expectedHistory);
  await expect(guest.locator('#text-chat-log')).toContainText('Live match check.');

  await context.close();
});
