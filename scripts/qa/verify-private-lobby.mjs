import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const peerPort = Number(process.env.QA_PEER_PORT ?? 0);
const browser = await chromium.launch({
  headless: process.env.QA_HEADED !== '1',
  args: [
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});
const errors = [];
const pages = [];
const pageContexts = new Map();

async function openPlayer(label) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  pageContexts.set(page, context);
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(`${label}: ${message.text()}`);
  });
  const url = new URL(baseUrl);
  url.searchParams.set('render', 'compat');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('seed', `pass38-private-${label}`);
  if (peerPort) url.searchParams.set('peerQaPort', String(peerPort));
  await page.goto(url.toString());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  await page.fill('#player-name', label);
  pages.push(page);
  return page;
}

try {
  const host = await openPlayer('Host Four');
  const guests = [await openPlayer('Guest One'), await openPlayer('Guest Two'), await openPlayer('Guest Three')];
  await host.selectOption('#team', '1');
  await host.click('#host');
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim(), undefined, { timeout: 45_000 });
  const roomCode = (await host.textContent('#room-code')).trim();
  for (const guest of guests) {
    await guest.fill('#room-input', roomCode);
    await guest.click('#join');
  }
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members.length === 4, undefined, { timeout: 45_000 });
  await Promise.all(guests.map((guest) => guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members.length === 4, undefined, { timeout: 45_000 })));

  const balancedTeams = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.reduce((counts, member) => {
    counts[member.team] += 1;
    return counts;
  }, [0, 0]));
  const hostTeamSynchronized = await host.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const hostMember = state.privateMatch.members.find((member) => member.name === 'Host Four');
    return hostMember?.team === state.player.team && document.querySelector('#team')?.value === String(state.player.team);
  });
  const startBlockedBeforeReady = await host.locator('#lobby-start').isDisabled();

  const overflow = await openPlayer('Overflow Five');
  await overflow.fill('#room-input', roomCode);
  await overflow.click('#join');
  await overflow.waitForFunction(() => {
    const status = document.querySelector('#network-status')?.textContent ?? '';
    return status.includes('Room is full') || window.__ATOMIC_ACRES_DEBUG__?.snapshot().networkLifecycle.role === 'offline';
  }, undefined, { timeout: 30_000 });
  const overflowState = await overflow.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const overflowRejected = overflowState.networkLifecycle.role === 'offline'
    && overflowState.gameStarted === false
    && (await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.length)) === 4;
  await pageContexts.get(overflow).close();
  pageContexts.delete(overflow);
  pages.pop();

  await mkdir('artifacts/pass38', { recursive: true });
  await host.screenshot({ path: 'artifacts/pass38/private-lobby-host-four-player.png', fullPage: true });

  await host.selectOption('#lobby-capacity', '6');
  await Promise.all(guests.map((guest) => guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.capacity === 6, undefined, { timeout: 30_000 })));
  const extraGuests = [await openPlayer('Guest Four'), await openPlayer('Guest Five')];
  for (const guest of extraGuests) {
    await guest.fill('#room-input', roomCode);
    await guest.click('#join');
  }
  guests.push(...extraGuests);
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members.length === 6, undefined, { timeout: 45_000 });
  await Promise.all(guests.map((guest) => guest.waitForFunction(() => {
    const match = window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch;
    return match?.capacity === 6 && match.members.length === 6;
  }, undefined, { timeout: 45_000 })));
  const sixCapacityReplicated = true;
  const sixPlayersAdmitted = true;
  await host.selectOption('#lobby-mode', 'ffa');
  await Promise.all(guests.map((guest) => guest.waitForFunction(() => {
    const match = window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch;
    return match?.capacity === 6 && match.mode === 'ffa';
  }, undefined, { timeout: 30_000 })));
  const ffaTeamControlsDisabled = await Promise.all([host, ...guests].map((page) => page.locator('#team').isDisabled()));

  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members
    .filter((member) => member.id !== window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members[0].id)
    .every((member) => member.pingMs !== null), undefined, { timeout: 15_000 });
  const pingSamples = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.map((member) => member.pingMs));

  for (const page of [host, ...guests]) await page.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 30_000 });
  const allReady = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.every((member) => member.ready));
  await host.screenshot({ path: 'artifacts/pass38/private-lobby-host-six-player.png', fullPage: true });
  await guests[0].screenshot({ path: 'artifacts/pass38/private-lobby-guest-six-player.png', fullPage: true });
  await host.click('#lobby-start');
  await Promise.all([host, ...guests].map((page) => page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 45_000 })));

  const states = await Promise.all([host, ...guests].map((page) => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot())));
  const timers = await Promise.all([host, ...guests].map((page) => page.textContent('#timer')));
  const activeAtValues = states.map((state) => state.privateMatch.activeAtEpochMs);

  const rejoinGuest = guests[0];
  const rejoinIdBefore = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.find((member) => member.name === 'Guest One')?.id);
  await rejoinGuest.reload({ waitUntil: 'load' });
  await host.waitForFunction((id) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch.members
    .some((member) => member.id === id && member.connected === false), rejoinIdBefore, { timeout: 30_000 });
  const rejoinGraceVisible = await host.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
    .some((member) => member.id === id && member.connected === false), rejoinIdBefore);
  await rejoinGuest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
  await rejoinGuest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  await rejoinGuest.fill('#player-name', 'Guest One');
  await rejoinGuest.fill('#room-input', roomCode);
  await rejoinGuest.click('#join');
  await rejoinGuest.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true && state.matchPhase === 'active' && state.remotes === 5;
  }, undefined, { timeout: 45_000 });
  await host.waitForFunction((id) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch.members
    .some((member) => member.id === id && member.connected === true), rejoinIdBefore, { timeout: 30_000 });
  const rejoinIdAfter = await rejoinGuest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.find((member) => member.name === 'Guest One')?.id);
  const rejoinState = await rejoinGuest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const rejoinIdentityPreserved = rejoinIdBefore === rejoinIdAfter;
  const rejoinRecovered = rejoinState.gameStarted === true && rejoinState.remotes === 5
    && rejoinState.networkLifecycle.eventChannels === 1 && rejoinState.networkLifecycle.stateChannels === 1;

  const report = {
    schema: 'atomic-acres/pass38-private-lobby@1',
    errors,
    roomCodeLength: roomCode.length,
    balancedTeams,
    hostTeamSynchronized,
    startBlockedBeforeReady,
    overflowRejected,
    sixCapacityReplicated,
    sixPlayersAdmitted,
    sharedConfig: states.map((state) => ({ mode: state.privateMatch.mode, capacity: state.privateMatch.capacity })),
    ffaTeamControlsDisabled,
    allReady,
    pingSamples,
    timers,
    activeAtValues,
    modes: states.map((state) => state.gameMode),
    remotes: states.map((state) => state.remotes),
    bots: states.map((state) => state.bots.length),
    eventChannels: states.map((state) => state.networkLifecycle.eventChannels),
    stateChannels: states.map((state) => state.networkLifecycle.stateChannels),
    stateReliable: states.map((state) => state.networkLifecycle.stateChannelReliable),
    stateOrdered: states.map((state) => state.networkLifecycle.stateChannelOrdered),
    stateMaxRetransmits: states.map((state) => state.networkLifecycle.stateChannelMaxRetransmits),
    hostSelfEchoesSuppressed: states[0].networkLifecycle.selfStateEchoesSuppressed,
    rejoinGraceVisible,
    rejoinIdentityPreserved,
    rejoinRecovered,
  };
  await mkdir('artifacts/pass38', { recursive: true });
  await writeFile('artifacts/pass38/private-lobby-six-player.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  const pass = errors.length === 0
    && roomCode.length === 36
    && balancedTeams[0] === 2 && balancedTeams[1] === 2
    && hostTeamSynchronized
    && startBlockedBeforeReady && overflowRejected && sixCapacityReplicated && sixPlayersAdmitted && allReady
    && ffaTeamControlsDisabled.every(Boolean)
    && pingSamples.slice(1).every((ping) => Number.isFinite(ping))
    && new Set(activeAtValues).size === 1
    && states.every((state, index) => state.privateMatch.mode === 'ffa' && state.privateMatch.capacity === 6
      && state.matchPhase === 'active' && state.remotes === 5 && state.bots.length === 0
      && state.networkLifecycle.eventChannels === (index === 0 ? 5 : 1)
      && state.networkLifecycle.stateChannels === (index === 0 ? 5 : 1)
      && state.networkLifecycle.stateChannelReliable === false
      && state.networkLifecycle.stateChannelOrdered === false
      && state.networkLifecycle.stateChannelMaxRetransmits === 0)
    && states[0].networkLifecycle.selfStateEchoesSuppressed > 0
    && rejoinGraceVisible && rejoinIdentityPreserved && rejoinRecovered;
  if (!pass) process.exitCode = 1;
} finally {
  await browser.close();
}
