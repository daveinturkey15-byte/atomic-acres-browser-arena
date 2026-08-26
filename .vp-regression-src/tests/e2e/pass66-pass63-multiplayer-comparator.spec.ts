import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  pass66ComparatorCapabilities,
  type Pass66ComparatorChannel,
} from '../../src/pass66-pass63-multiplayer-comparator-contract';
import {
  readPersistedClientRuntimeLog,
  startOwnedPeerServer,
  type OwnedPeerServer,
} from './pass66-e2e-support';

type ChannelId = Pass66ComparatorChannel;
type Fault = Readonly<{ channel: ChannelId; peer: 'host' | 'guest'; kind: 'pageerror' | 'console-error'; message: string }>;
type ScenarioReceipt = Readonly<{
  channel: ChannelId;
  route: string;
  joinMs: number;
  chatDeliveryMs: number;
  startMs: number;
  rejoinMs: number;
  guestIdentityRetained: boolean;
  botCount: number;
  chatEntryCount: number;
  rejoinMode: 'manual-pass63' | 'explicit-pass66';
  reliableCommitMirrorDelta: number | null;
  hostConsensus: unknown;
  guestConsensus: unknown;
  faults: readonly Fault[];
  clientRuntimeLog: readonly unknown[] | null;
}>;

const enabled = process.env.PASS66_PASS63_COMPARATOR === '1';
const expectedCandidateSha = process.env.PASS66_PASS63_COMPARATOR_SOURCE_SHA ?? '';
const peerPort = Number(process.env.PASS66_PASS63_COMPARATOR_PEER_PORT ?? 9_069);
const artifactRoot = resolve('artifacts/pass66/pass63-multiplayer-comparator');
const receiptPath = resolve(artifactRoot, 'receipt.json');
const channelConfig = JSON.parse(readFileSync(resolve('release-channels.json'), 'utf8')) as {
  stable: {
    sourceSha: string;
    pagesSha: string;
    runtimeTreeSha256: string;
    path: string;
  };
  experimental: { path: string };
};
const routes: Readonly<Record<ChannelId, string>> = Object.freeze({
  stable: `/${channelConfig.stable.path}/`,
  candidate: `/${channelConfig.experimental.path}/`,
});
let peerServer: OwnedPeerServer | null = null;

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

test.beforeAll(async () => {
  if (!enabled) return;
  mkdirSync(artifactRoot, { recursive: true });
  rmSync(receiptPath, { force: true });
  peerServer = await startOwnedPeerServer(peerPort, '/peerjs');
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

function attachFaults(page: Page, channel: ChannelId, peer: 'host' | 'guest', faults: Fault[]): void {
  page.on('pageerror', (error) => faults.push({ channel, peer, kind: 'pageerror', message: error.stack ?? error.message }));
  page.on('console', (message) => {
    if (message.type() !== 'error' || message.text().startsWith('Failed to load resource:')) return;
    faults.push({ channel, peer, kind: 'console-error', message: message.text() });
  });
}

async function openPlayer(
  context: BrowserContext,
  channel: ChannelId,
  peer: 'host' | 'guest',
  name: string,
  seed: string,
  faults: Fault[],
): Promise<Page> {
  const page = await context.newPage();
  attachFaults(page, channel, peer, faults);
  const baseURL = test.info().project.use.baseURL as string;
  const url = new URL(routes[channel], baseURL);
  for (const [key, value] of Object.entries({
    release: 'latest', renderer: 'webgl2', render: 'compat', map: 'atomic-acres',
    signal: 'off', grass: 'off', mist: 'off', clouds: 'off', rays: 'off', renderPaused: '1',
    multiplayerQa: '1', peerQaPort: String(peerPort), externalServices: 'off', seed,
  })) url.searchParams.set(key, value);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true
      && [...document.querySelectorAll<HTMLButtonElement>('.map-card')].some((button) => !button.disabled);
  }, undefined, { timeout: 60_000 });
  await page.locator('#player-name').fill(name);
  return page;
}

async function sendChat(page: Page, text: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  await expect(page.locator('#text-chat')).toHaveAttribute('data-open', 'true');
  await page.locator('#text-chat-input').fill(text);
  await page.keyboard.press('Enter');
  await expect(page.locator('#text-chat')).toHaveAttribute('data-open', 'false');
}

async function consensus(page: Page): Promise<any> {
  return page.evaluate(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      arenaId: state.arenaSelection.id,
      matchPhase: state.matchPhase,
      activeAtEpochMs: state.privateMatch.activeAtEpochMs,
      hostedBotCount: state.privateMatch.hostedBotCount,
      memberIds: state.privateMatch.members.map((member: any) => member.id).sort(),
      connectedMemberIds: state.privateMatch.members.filter((member: any) => member.connected).map((member: any) => member.id).sort(),
      scores: state.privateMatch.scores
        .map((score: any) => ({ id: score.id, kills: score.kills, deaths: score.deaths }))
        .sort((left: any, right: any) => left.id.localeCompare(right.id)),
      bots: state.bots
        .map((bot: any) => ({ id: bot.id, weapon: bot.weapon, hp: bot.hp, alive: bot.alive }))
        .sort((left: any, right: any) => left.id.localeCompare(right.id)),
      remotePlayerCount: state.remotePlayers.length,
      matchEpoch: state.killstreak.matchEpoch,
      chat: state.textChat.entries.map((entry: any) => entry.text),
    };
  });
}

async function runScenario(browser: Browser, channel: ChannelId): Promise<ScenarioReceipt> {
  const capabilities = pass66ComparatorCapabilities(channel);
  const hostContext = await browser.newContext({ viewport: { width: 1_920, height: 1_080 } });
  const guestContext = await browser.newContext({ viewport: { width: 1_920, height: 1_080 } });
  const faults: Fault[] = [];
  const hostName = `${channel} comparator host`;
  const guestName = `${channel} comparator guest`;
  try {
    const host = await openPlayer(hostContext, channel, 'host', hostName, `${channel}-pass63-comparator-host`, faults);
    let guest = await openPlayer(guestContext, channel, 'guest', guestName, `${channel}-pass63-comparator-guest`, faults);
    await host.locator('#host').click();
    await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
    const roomCode = (await host.locator('#room-code').textContent())!.trim();
    const joinStarted = performance.now();
    await guest.locator('#room-input').fill(roomCode);
    await guest.locator('#join').click();
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
    ), undefined, { timeout: 30_000 })));
    const joinMs = performance.now() - joinStarted;
    const initialIdentity = await guest.evaluate((name) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
        .find((member: any) => member.name === name)?.id
    ), guestName);
    const hostIdentity = await host.evaluate((name) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
        .find((member: any) => member.name === name)?.id
    ), hostName);
    expect(initialIdentity).toMatch(/^p-/);
    expect(hostIdentity).toMatch(/^p-/);
    expect(initialIdentity).not.toBe(hostIdentity);

    await host.locator('#lobby-bots').selectOption('2');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.hostedBotCount === 2
    ))));
    const chatText = `${channel} matched comparator chat`;
    const chatStarted = performance.now();
    await sendChat(guest, chatText);
    await Promise.all([host, guest].map((page) => page.locator('#text-chat-log').getByText(chatText).waitFor()));
    const chatDeliveryMs = performance.now() - chatStarted;

    await host.locator('#lobby-ready').click();
    await guest.locator('#lobby-ready').click();
    await expect(host.locator('#lobby-start')).toBeEnabled();
    const startStarted = performance.now();
    await host.locator('#lobby-start').click();
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted === true && state.matchPhase === 'active'
        && state.bots.length === 2 && state.remotePlayers.length === 1;
    }, undefined, { timeout: 60_000 })));
    const startMs = performance.now() - startStarted;
    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
    const botsBefore = (await consensus(guest)).bots;
    const reliableBefore = capabilities.reliableStateCommitMirrors
      ? await host.evaluate(() => (
        (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle.reliableStateCommitMirrors
      )) as number
      : null;

    await guest.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await host.waitForFunction((id) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
        .some((member: any) => member.id === id && !member.connected)
    ), initialIdentity, { timeout: 30_000 });
    await guest.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
    if (capabilities.explicitRejoinAffordance) {
      await expect(guest.locator('#join')).toHaveText('REJOIN LAST MATCH');
      await expect(guest.locator('#join')).toHaveAttribute('data-rejoin-available', 'true');
    } else {
      await expect(guest.locator('#join')).toHaveText('JOIN');
      await guest.locator('#room-input').fill(roomCode);
    }
    await guest.locator('#player-name').fill(guestName);
    const rejoinStarted = performance.now();
    await guest.locator('#join').click();
    await Promise.all([guest, host].map((page) => page.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted === true && state.matchPhase === 'active'
        && state.bots.length === 2 && state.remotePlayers.length === 1
        && state.privateMatch.members.length === 2
        && state.privateMatch.members.every((member: any) => member.connected);
    }, undefined, { timeout: 60_000 })));
    const rejoinMs = performance.now() - rejoinStarted;
    const rejoinedIdentity = await guest.evaluate((name) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
        .find((member: any) => member.name === name)?.id
    ), guestName);
    const hostConsensus = await consensus(host);
    await expect.poll(() => consensus(guest), { timeout: 20_000 }).toEqual(hostConsensus);
    const guestConsensus = await consensus(guest);
    expect(guestConsensus.bots).toEqual(botsBefore);
    expect(guestConsensus.chat).toContain(chatText);
    const reliableAfter = capabilities.reliableStateCommitMirrors
      ? await host.evaluate(() => (
        (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle.reliableStateCommitMirrors
      )) as number
      : null;
    if (reliableBefore !== null && reliableAfter !== null) expect(reliableAfter).toBeGreaterThan(reliableBefore);
    expect(faults).toEqual([]);
    const clientRuntimeLog = channel === 'candidate' ? await readPersistedClientRuntimeLog(guest) : null;
    if (clientRuntimeLog) expect(clientRuntimeLog).toEqual([]);
    return Object.freeze({
      channel,
      route: routes[channel],
      joinMs,
      chatDeliveryMs,
      startMs,
      rejoinMs,
      guestIdentityRetained: rejoinedIdentity === initialIdentity,
      botCount: guestConsensus.bots.length,
      chatEntryCount: guestConsensus.chat.length,
      rejoinMode: capabilities.explicitRejoinAffordance ? 'explicit-pass66' : 'manual-pass63',
      reliableCommitMirrorDelta: reliableBefore !== null && reliableAfter !== null ? reliableAfter - reliableBefore : null,
      hostConsensus,
      guestConsensus,
      faults,
      clientRuntimeLog,
    });
  } finally {
    await Promise.allSettled([hostContext.close(), guestContext.close()]);
  }
}

async function assertTopologyProvenance(request: APIRequestContext): Promise<unknown> {
  const stableResponse = await request.get(`${routes.stable}pinned-channel-provenance.json`);
  expect(stableResponse.ok()).toBe(true);
  const stable = await stableResponse.json();
  expect(stable).toMatchObject({
    channel: 'recent-stable',
    sourceSha: channelConfig.stable.sourceSha,
    pagesSha: channelConfig.stable.pagesSha,
    path: channelConfig.stable.path,
    pinnedRuntime: {
      sourceSha: channelConfig.stable.sourceSha,
      treeSha256: channelConfig.stable.runtimeTreeSha256,
    },
  });
  const candidateResponse = await request.get(`${routes.candidate}channel-provenance.json`);
  expect(candidateResponse.ok()).toBe(true);
  const candidate = await candidateResponse.json();
  expect(candidate).toMatchObject({ channel: 'the-big-one', releasePass: 'PASS 66', sourceSha: expectedCandidateSha });
  return { stable, candidate };
}

test('compares the byte-exact Pass 63 stable multiplayer spine with the frozen candidate', async ({ browser, request }) => {
  test.skip(!enabled, 'Run the explicit clean-SHA Pass 63 comparator command.');
  test.setTimeout(420_000);
  expect(expectedCandidateSha).toMatch(/^[a-f0-9]{40}$/);
  expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim()).toBe('');
  expect(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()).toBe(expectedCandidateSha);
  expect(peerServer?.path).toBe('/peerjs');
  const provenance = await assertTopologyProvenance(request);
  const stable = await runScenario(browser, 'stable');
  const candidate = await runScenario(browser, 'candidate');

  for (const receipt of [stable, candidate]) {
    expect(receipt.guestIdentityRetained, `${receipt.channel}: identity`).toBe(true);
    expect(receipt.botCount, `${receipt.channel}: hosted bots`).toBe(2);
    expect(receipt.hostConsensus, `${receipt.channel}: host/guest convergence`).toEqual(receipt.guestConsensus);
  }
  expect(stable.rejoinMode).toBe('manual-pass63');
  expect(stable.reliableCommitMirrorDelta).toBeNull();
  expect(candidate.rejoinMode).toBe('explicit-pass66');
  expect(candidate.reliableCommitMirrorDelta, 'candidate: reliable repair').toBeGreaterThan(0);
  const limits = Object.freeze({
    joinMs: Math.max(15_000, stable.joinMs * 2.25 + 1_000),
    chatDeliveryMs: Math.max(5_000, stable.chatDeliveryMs * 2.25 + 500),
    startMs: Math.max(60_000, stable.startMs * 2.25 + 2_000),
    rejoinMs: Math.max(60_000, stable.rejoinMs * 2.25 + 2_000),
  });
  expect(candidate.joinMs).toBeLessThanOrEqual(limits.joinMs);
  expect(candidate.chatDeliveryMs).toBeLessThanOrEqual(limits.chatDeliveryMs);
  expect(candidate.startMs).toBeLessThanOrEqual(limits.startMs);
  expect(candidate.rejoinMs).toBeLessThanOrEqual(limits.rejoinMs);

  writeFileSync(receiptPath, `${JSON.stringify({
    schema: 'atomic-acres/pass66-pass63-multiplayer-comparator@1',
    status: 'PASS',
    candidateSourceSha: expectedCandidateSha,
    stableSourceSha: channelConfig.stable.sourceSha,
    stableRuntimeTreeSha256: channelConfig.stable.runtimeTreeSha256,
    scenario: 'two isolated peers, two hosted bots, chat, active match, guest document replacement, reliable repair and full convergence',
    provenance,
    latencyLimitsMs: limits,
    stable,
    candidate,
  }, null, 2)}\n`, 'utf8');
});
