import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const peerPort = Number(process.env.QA_PEER_PORT ?? 0);
const cycles = Number(process.env.QA_MULTIPLAYER_CYCLES ?? 20);
const chromiumArgs = [
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns',
];
const headed = process.env.QA_HEADED === '1';
const browser = await chromium.launch({ headless: !headed, args: chromiumArgs });
const results = [];
const errors = [];
async function keepPageAnimating(context, page) {
  if (headed) return;
  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ sessionId }) => cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}));
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 1, everyNthFrame: 5 });
}
try {
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    console.error(`[multiplayer-lifecycle] cycle ${cycle}/${cycles}`);
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const host = await context.newPage();
    const guest = await context.newPage();
    await Promise.all([keepPageAnimating(context, host), keepPageAnimating(context, guest)]);
    for (const [label, page] of [['host', host], ['guest', guest]]) {
      await page.bringToFront();
      page.on('pageerror', (error) => errors.push(`cycle ${cycle} ${label}: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(`cycle ${cycle} ${label}: ${message.text()}`);
      });
      page.on('response', (response) => {
        if (response.status() >= 400) errors.push(`cycle ${cycle} ${label}: HTTP ${response.status()} ${response.url()}`);
      });
      const url = new URL(baseUrl);
      url.searchParams.set('render', 'compatibility');
      url.searchParams.set('seed', `pass25a-mp-${cycle}-${label}`);
      url.searchParams.set('multiplayerQa', '1');
      if (peerPort) url.searchParams.set('peerQaPort', String(peerPort));
      await page.goto(url.toString());
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
      await page.fill('#player-name', `${label} ${cycle}`);
    }
    await host.bringToFront();
    await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout: 45_000 });
    const roomCode = (await host.textContent('#room-code')).trim();
    await guest.bringToFront();
    await guest.selectOption('#team', '1');
    await guest.fill('#room-input', roomCode);
    await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await host.bringToFront();
    await host.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: 30_000 });
    await guest.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: 30_000 });
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 30_000 });
    await host.click('#lobby-start');
    await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 1, undefined, { timeout: 30_000 });
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 1, undefined, { timeout: 30_000 });
    const joined = {
      cycle,
      roomCodeLength: roomCode.length,
      hostMode: await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().gameMode),
      guestMode: await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().gameMode),
      hostRemotes: await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotes),
      guestRemotes: await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotes),
      hostNetwork: await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle),
      guestNetwork: await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle),
    };
    await guest.close({ runBeforeUnload: true });
    await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 0, undefined, { timeout: 30_000 });
    await host.waitForFunction(() => document.querySelector('#lobby-roster')?.textContent?.includes('REJOINING'), undefined, { timeout: 30_000 });
    joined.leaveObserved = true;
    joined.rejoinGraceObserved = true;
    results.push(joined);
    await context.close();
  }
  const report = { schema: 'atomic-acres/pass38-multiplayer-lifecycle@1', cycles, errors, results };
  await mkdir('artifacts/pass38', { recursive: true });
  await writeFile('artifacts/pass38/multiplayer-lifecycle.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || results.length !== cycles || results.some((result) => result.hostMode !== 'host' || result.guestMode !== 'client' || !result.leaveObserved || !result.rejoinGraceObserved || result.hostNetwork.stateChannels < 1 || result.guestNetwork.stateChannels < 1 || result.hostNetwork.stateChannelReliable !== false || result.hostNetwork.stateChannelOrdered !== false || result.hostNetwork.stateChannelMaxRetransmits !== 0 || result.guestNetwork.stateChannelMaxRetransmits !== 0)) process.exitCode = 1;
} finally {
  await browser.close();
}
