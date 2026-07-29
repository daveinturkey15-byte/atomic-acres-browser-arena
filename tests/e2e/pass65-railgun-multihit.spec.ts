import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { resolve } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const peerPort = 9_168;
let peerProcess: ChildProcess | null = null;

test.use({
  // Playwright's retained-trace packer can race temporary screencast resources
  // while closing this manually managed three-page context on Windows.
  trace: 'off',
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

async function installPointerLockHarness(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('Missing game canvas');
    const harness = { locked: false };
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => harness.locked ? canvas : null,
    });
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

async function openPeer(context: BrowserContext, name: string, seed: string): Promise<Page> {
  const page = await context.newPage();
  const url = new URL('/', test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest', renderer: 'webgl2', render: 'performance', grass: 'off', mist: 'off', clouds: 'off', rays: 'off',
    signal: 'off', multiplayerQa: '1', peerQaPort: String(peerPort), seed, previewTime: '0',
  })) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await page.waitForFunction(() => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
    return debug?.snapshot().weaponReady === true && document.querySelector<HTMLButtonElement>('#host')?.disabled === false;
  }, undefined, { timeout: 45_000 });
  await page.locator('#player-name').fill(name);
  await installPointerLockHarness(page);
  return page;
}

type RailgunTrio = Readonly<{
  context: BrowserContext;
  host: Page;
  shooter: Page;
  observer: Page;
  errors: string[];
  shooterId: string;
}>;

async function startRailgunTrio(browser: Browser, observerTeam: '0' | '1' = '0'): Promise<RailgunTrio> {
  const context = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
  const [host, shooter, observer] = await Promise.all([
    openPeer(context, 'RAILGUN HOST', 'railgun-host'),
    openPeer(context, 'RAILGUN SHOOTER', 'railgun-shooter'),
    openPeer(context, 'RAILGUN OBSERVER', 'railgun-observer'),
  ]);
  const errors: string[] = [];
  for (const [label, page] of [['host', host], ['shooter', shooter], ['observer', observer]] as const) {
    page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  }
  await Promise.all([host, shooter, observer].map((page) => page.evaluate(async () => {
    await (window as any).__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres');
  })));
  await host.locator('#team').selectOption('0');
  await shooter.locator('#team').selectOption('1');
  await observer.locator('#team').selectOption(observerTeam);
  expect(await peerServerReady(), 'Local PeerJS signalling must be live before room creation').toBe(true);
  await host.locator('#host').click();
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()), undefined, { timeout: 30_000 });
  await host.locator('#lobby-mode').selectOption('tdm');
  await host.locator('#lobby-auto-balance').uncheck();
  const roomCode = (await host.locator('#room-code').textContent())?.trim() ?? '';
  expect(roomCode.length).toBeGreaterThan(0);
  for (const page of [shooter, observer]) {
    await page.locator('#room-input').fill(roomCode);
    await page.locator('#join').click();
  }
  await Promise.all([host, shooter, observer].map((page) => page.waitForFunction(
    () => document.querySelectorAll('#lobby-roster .lobby-player').length === 3,
    undefined,
    { timeout: 30_000 },
  )));
  await host.locator('#lobby-bots').selectOption('4');
  await Promise.all([host, shooter, observer].map((page) => page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.privateMatch?.mode === 'tdm'
      && state.privateMatch.autoBalance === false
      && state.privateMatch.hostedBotCount === 4;
  }, undefined, { timeout: 15_000 })));
  const lobby = await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch);
  expect(Object.fromEntries(lobby.members.map((member: any) => [member.name, member.team]))).toEqual({
    'RAILGUN HOST': 0,
    'RAILGUN SHOOTER': 1,
    'RAILGUN OBSERVER': Number(observerTeam),
  });
  const shooterId = lobby.members.find((member: any) => member.name === 'RAILGUN SHOOTER')?.id;
  expect(typeof shooterId).toBe('string');
  for (const page of [host, shooter, observer]) await page.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await Promise.all([host, shooter, observer].map((page) => page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.bootstrap.stage === 'failed'
      || state.gameStarted === true && state.matchPhase === 'active'
        && state.arenaSelection.id === 'atomic-acres'
        && state.remotePlayers.length === 2
        && state.bots.length === 4;
  }, undefined, { timeout: 60_000 })));
  const admissions = await Promise.all([host, shooter, observer].map((page) => page.evaluate(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return { bootstrap: state.bootstrap, started: state.gameStarted, phase: state.matchPhase, bots: state.bots.length, remotes: state.remotePlayers.length };
  })));
  for (const admission of admissions) {
    expect(admission).toMatchObject({ bootstrap: { stage: 'ready', error: null }, started: true, phase: 'active', bots: 4, remotes: 2 });
  }
  // Unlock every audio context through a real user gesture before observing the
  // local and replicated Railgun report paths.
  for (const page of [host, shooter, observer]) {
    await page.bringToFront();
    await page.locator('#game').click({ position: { x: 80, y: 80 }, force: true });
  }
  return { context, host, shooter, observer, errors, shooterId };
}

async function state(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot());
}

test.describe('Pass 65 host-authoritative Railgun multi-hit gate', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'The local PeerJS authority gate is Chromium-only.');

  test('resolves three aligned hostiles once, excludes friendly/off-axis actors, and replicates one scary bolt/report to every peer', async ({ browser }) => {
    test.setTimeout(180_000);
    const trio = await startRailgunTrio(browser);
    const { context, host, shooter, observer, errors, shooterId } = trio;
    try {
      const stagedPickup = await host.evaluate(() => {
        const api = (window as any).__ATOMIC_ACRES_DEBUG__;
        return api.stageRailgunSpawn(0);
      });
      expect(stagedPickup).toMatchObject({ status: 'available', roundsRemaining: 8 });
      expect(stagedPickup.pickupPosition).toHaveLength(3);
      await Promise.all([shooter, observer].map((page) => page.waitForFunction((generation) => {
        const railgun = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().railgun;
        return railgun.generation === generation && railgun.status === 'available';
      }, stagedPickup.generation, { timeout: 5_000 })));
      // Pickup geometry is covered by the existing Railgun gate. This host-only
      // QA grant isolates the remote firing/result path without making the
      // multi-peer oracle depend on interpolation around an upper-floor pickup.
      expect(await host.evaluate((id) => (window as any).__ATOMIC_ACRES_DEBUG__.grantRailgunToRemote(id), shooterId)).toBe(true);
      await Promise.all([host, shooter, observer].map((page) => page.waitForFunction((holderId) => {
        const railgun = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().railgun;
        return railgun.status === 'held' && railgun.holderId === holderId;
      }, shooterId, { timeout: 5_000 })));
      expect((await state(shooter)).railgun.localHolder).toBe(true);

      await Promise.all([
        shooter.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 1.7, 30, 0, 0)),
        host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(-10, 1.7, 0, 0, 0)),
        observer.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(10, 1.7, 0, 0, 0)),
      ]);
      await host.waitForFunction((id) => {
        const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers.find((candidate: any) => candidate.id === id);
        const position = remote?.authoritativePosition;
        return remote && position && Math.abs(position[0]) < 0.15 && Math.abs(position[1] - 1.7) < 0.15
          && Math.abs(position[2] - 30) < 0.15 && Math.abs(remote.yaw) < 0.01 && Math.abs(remote.pitch) < 0.01;
      }, shooterId, { timeout: 10_000 });
      const stage = await host.evaluate((id) => (window as any).__ATOMIC_ACRES_DEBUG__.stageRailgunMultiHitTargets(id), shooterId);
      expect(stage).toMatchObject({
        staged: true,
        shooterId,
        distances: [12, 22, 32, 42],
        health: [100, 40, 10, 100],
      });
      expect(stage.hostileIds).toHaveLength(3);
      expect(stage.friendlyId).toMatch(/^host-bot-/);
      await Promise.all([shooter, observer].map((page) => page.waitForFunction(({ hostileIds, friendlyId }) => {
        const bots = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().bots;
        return [...hostileIds, friendlyId].every((id) => bots.some((bot: any) => bot.id === id));
      }, { hostileIds: stage.hostileIds, friendlyId: stage.friendlyId }, { timeout: 5_000 })));

      const before = {
        host: await state(host),
        shooter: await state(shooter),
        observer: await state(observer),
      };
      await shooter.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.fireOnce());
      let hostShot: any;
      let shooterShot: any;
      let observerShot: any;
      try {
        await host.waitForFunction(() => {
          const railgun = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().railgun;
          return railgun.presentation.beamPresentations === 1
            && railgun.presentation.lastAcceptedOutcomes.length === 3;
        }, undefined, { timeout: 5_000 });
        // Capture host health/death authority before the normal 2.2 s bot
        // respawn. The result itself remains immutable on every peer.
        hostShot = await state(host);
        const peerDeliveries = await Promise.all([shooter, observer].map(async (page) => {
          await page.waitForFunction(() => {
            const railgun = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().railgun;
            return railgun.presentation.beamPresentations === 1
              && railgun.presentation.lastAcceptedOutcomes.length === 3;
          }, undefined, { timeout: 5_000 });
          return state(page);
        }));
        shooterShot = peerDeliveries[0];
        observerShot = peerDeliveries[1];
      } catch (error) {
        const delivery = Object.fromEntries(await Promise.all(([
          ['host', host], ['shooter', shooter], ['observer', observer],
        ] as const).map(async ([label, page]) => {
          const snapshot = await state(page);
          return [label, {
            railgun: snapshot.railgun,
            audio: snapshot.audio.railgun,
            player: snapshot.player,
            network: snapshot.networkLifecycle,
          }];
        })));
        console.error(`[railgun-multihit] delivery timeout ${JSON.stringify(delivery)}`);
        throw error;
      }

      const result = hostShot.railgun.lastAuthoritativeResult;
      expect(result).toMatchObject({
        forPlayerId: shooterId,
        status: 'accepted-hit',
        reason: 'accepted',
        outcomes: [
          { target: stage.hostileIds[0], damageRequested: 50, damageApplied: 50, resultingHealth: 50, died: false },
          { target: stage.hostileIds[1], damageRequested: 50, damageApplied: 40, resultingHealth: 0, died: true },
          { target: stage.hostileIds[2], damageRequested: 50, damageApplied: 10, resultingHealth: 0, died: true },
        ],
      });
      expect(result.outcomes.map((outcome: any) => outcome.distanceMeters)).toEqual([12, 22, 32]);
      const outcomeTargets = result.outcomes.map((outcome: any) => outcome.target);
      const hostId = before.host.privateMatch.members.find((member: any) => member.name === 'RAILGUN HOST')?.id;
      const observerId = before.host.privateMatch.members.find((member: any) => member.name === 'RAILGUN OBSERVER')?.id;
      expect(typeof hostId).toBe('string');
      expect(typeof observerId).toBe('string');
      expect(outcomeTargets).toEqual(stage.hostileIds);
      expect(outcomeTargets).not.toContain(stage.friendlyId);
      expect(outcomeTargets).not.toContain(hostId);
      expect(outcomeTargets).not.toContain(observerId);
      expect(result.outcomes.every((outcome: any) => Object.keys(outcome).sort().join(',')
        === 'damageApplied,damageRequested,died,distanceMeters,resultingHealth,target')).toBe(true);

      const roleShots = [hostShot, shooterShot, observerShot];
      for (const shot of roleShots) {
        expect(shot.railgun.presentation).toMatchObject({
          beamPresentations: 1,
          lastBeamLengthM: 180,
          visibleDurationMs: 1_000,
          coreRadiusM: 0.32,
          haloRadiusM: 1,
          shockRadiusM: 1.6,
          filamentCount: 3,
          poolCapacity: 6,
          throughGeometry: true,
          openEnded: true,
          lastAcceptedOutcomes: result.outcomes,
        });
        expect(shot.railgun.presentation.lastAcceptedBeam).toEqual(hostShot.railgun.presentation.lastAcceptedBeam);
      }
      expect(shooterShot.railgun.presentation).toMatchObject({ lastViewer: 'shooter', lastPresentationStartOffsetM: 2.4 });
      expect(hostShot.railgun.presentation).toMatchObject({ lastViewer: 'peer', lastPresentationStartOffsetM: 0 });
      expect(observerShot.railgun.presentation).toMatchObject({ lastViewer: 'peer', lastPresentationStartOffsetM: 0 });
      expect(shooterShot.audio.railgun).toMatchObject({ local: 1, replicated: 0, lastSpatial: false, layerCount: 10, pressureDuration: 0.62 });
      for (const observerAudio of [hostShot.audio.railgun, observerShot.audio.railgun]) {
        expect(observerAudio).toMatchObject({
          local: 0,
          replicated: 1,
          lastSpatial: true,
          lastEmitter: {
            x: hostShot.railgun.presentation.lastAcceptedBeam.start[0],
            y: hostShot.railgun.presentation.lastAcceptedBeam.start[1],
            z: hostShot.railgun.presentation.lastAcceptedBeam.start[2],
          },
          layerCount: 10,
          pressureDuration: 0.62,
        });
      }
      expect(hostShot.audio.railgun.lastDistanceM).toBeGreaterThan(0);
      expect(observerShot.audio.railgun.lastDistanceM).toBeGreaterThan(0);

      const hostBots = Object.fromEntries(hostShot.bots.map((bot: any) => [bot.id, bot]));
      expect(hostBots[stage.hostileIds[0]]).toMatchObject({ hp: 50, alive: true, deaths: 0 });
      expect(hostBots[stage.hostileIds[1]]).toMatchObject({ hp: 0, alive: false, deaths: 1 });
      expect(hostBots[stage.hostileIds[2]]).toMatchObject({ hp: 0, alive: false, deaths: 1 });
      expect(hostBots[stage.friendlyId]).toMatchObject({ hp: 100, alive: true, deaths: 0, team: 1 });
      // Passive health regeneration can advance while the three peers deliver
      // the result. An off-axis Railgun strike must never reduce either ally.
      expect(hostShot.player.hp).toBeGreaterThanOrEqual(before.host.player.hp);
      expect(observerShot.player.hp).toBeGreaterThanOrEqual(before.observer.player.hp);
      const shooterScore = hostShot.privateMatch.scores.find((score: any) => score.id === shooterId);
      expect(shooterScore).toMatchObject({ kills: 2, deaths: 0, damageDealt: 100 });
      expect(shooterShot.player.kills).toBe(2);

      for (const shot of roleShots) {
        expect(shot.railgun.deathPresentationCount).toBe(2);
        expect(shot.railgun.deathPresentations.map((entry: any) => entry.victimId)).toEqual(stage.hostileIds.slice(1));
        expect(shot.railgun.deathPresentations.every((entry: any) => (
          entry.killerId === shooterId && entry.text.startsWith('RAILGUN SHOOTER eliminated ')
        ))).toBe(true);
      }
      expect(hostShot.railgun.lastLocalFeedbackSummary).toBeNull();
      expect(shooterShot.railgun.lastLocalFeedbackSummary).toBe('RAILGUN MULTI-HIT ×3 · 100 DAMAGE · 2 LETHAL');
      expect(observerShot.railgun.lastLocalFeedbackSummary).toBeNull();
      expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.replayLastRailgunResult())).toBe(true);
      await host.waitForTimeout(250);
      const replayed = {
        host: await state(host),
        shooter: await state(shooter),
        observer: await state(observer),
      };
      expect(replayed.host.railgun.presentation.beamPresentations).toBe(1);
      expect(replayed.shooter.railgun.presentation.beamPresentations).toBe(1);
      expect(replayed.observer.railgun.presentation.beamPresentations).toBe(1);
      expect(replayed.host.audio.railgun.replicated).toBe(1);
      expect(replayed.shooter.audio.railgun.local).toBe(1);
      expect(replayed.observer.audio.railgun.replicated).toBe(1);
      expect(replayed.shooter.player.kills).toBe(2);
      expect(replayed.host.railgun.localFeedbackPresentations).toBe(0);
      expect(replayed.shooter.railgun.localFeedbackPresentations).toBe(1);
      expect(replayed.observer.railgun.localFeedbackPresentations).toBe(0);
      for (const [beforeReplay, afterReplay] of [
        [hostShot, replayed.host],
        [shooterShot, replayed.shooter],
        [observerShot, replayed.observer],
      ]) {
        expect(afterReplay.railgun.deathPresentationCount).toBe(2);
        expect(afterReplay.railgun.deathPresentations).toEqual(beforeReplay.railgun.deathPresentations);
      }
      await Promise.all([host, shooter, observer].map((page) => expect.poll(
        async () => (await state(page)).railgun.presentation.activeBeams,
        { timeout: 3_000 },
      ).toBe(0)));
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('pierces two aligned human peers for two exact 50-damage passes and credits both deaths to the host shooter', async ({ browser }) => {
    test.setTimeout(180_000);
    const trio = await startRailgunTrio(browser, '1');
    const { context, host, shooter, observer, errors } = trio;
    try {
      const lobby = await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch);
      const hostId = lobby.members.find((member: any) => member.name === 'RAILGUN HOST')?.id;
      const shooterId = lobby.members.find((member: any) => member.name === 'RAILGUN SHOOTER')?.id;
      const observerId = lobby.members.find((member: any) => member.name === 'RAILGUN OBSERVER')?.id;
      expect(typeof hostId).toBe('string');
      expect(typeof shooterId).toBe('string');
      expect(typeof observerId).toBe('string');

      const stagedPickup = await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.stageRailgunSpawn(0));
      expect(stagedPickup).toMatchObject({ status: 'available', roundsRemaining: 8 });
      expect(stagedPickup.pickupPosition).toHaveLength(3);
      await host.evaluate((position) => {
        const api = (window as any).__ATOMIC_ACRES_DEBUG__;
        api.teleportPlayer(position[0], position[1], position[2], 0, 0);
      }, stagedPickup.pickupPosition);
      expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.interactRailgun())).toBe(true);
      await Promise.all([host, shooter, observer].map((page) => page.waitForFunction((holderId) => {
        const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
        return snapshot.railgun.status === 'held' && snapshot.railgun.holderId === holderId;
      }, hostId, { timeout: 5_000 })));

      await Promise.all([
        host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 1.7, 30, 0, 0)),
        shooter.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 1.7, 18, 0, 0)),
        observer.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 1.7, 8, 0, 0)),
      ]);
      await host.waitForFunction(({ shooterId, observerId }) => {
        const remotes = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers;
        const byId = new Map(remotes.map((remote: any) => [remote.id, remote]));
        const shooter = byId.get(shooterId) as any;
        const observer = byId.get(observerId) as any;
        const at = (remote: any, z: number) => remote?.authoritativePosition
          && Math.abs(remote.authoritativePosition[0]) < 0.15
          && Math.abs(remote.authoritativePosition[1] - 1.7) < 0.15
          && Math.abs(remote.authoritativePosition[2] - z) < 0.15;
        return at(shooter, 18) && at(observer, 8);
      }, { shooterId, observerId }, { timeout: 10_000 });

      const fireAndAwait = async (expectedPresentations: number): Promise<any> => {
        await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.fireOnce());
        await host.waitForFunction((presentations) => {
          const railgun = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().railgun;
          return railgun.presentation.beamPresentations === presentations
            && railgun.lastAuthoritativeResult?.outcomes.length === 2;
        }, expectedPresentations, { timeout: 5_000 });
        const result = (await state(host)).railgun.lastAuthoritativeResult;
        expect(result).toMatchObject({
          forPlayerId: hostId,
          status: 'accepted-hit',
          reason: 'accepted',
        });
        expect(result.outcomes.map((outcome: any) => outcome.target)).toEqual([shooterId, observerId]);
        expect(result.outcomes.map((outcome: any) => outcome.damageRequested)).toEqual([50, 50]);
        expect(result.outcomes.map((outcome: any) => outcome.damageApplied)).toEqual([50, 50]);
        // Remote interpolation can move a staged peer by millimetres between
        // the two rechambered shots; retain the ordering/range oracle without
        // pretending transport snapshots are bit-exact world positions.
        expect(result.outcomes[0].distanceMeters).toBeCloseTo(12, 0);
        expect(result.outcomes[1].distanceMeters).toBeCloseTo(22, 0);
        return result;
      };

      const first = await fireAndAwait(1);
      expect(first.outcomes.map((outcome: any) => ({ resultingHealth: outcome.resultingHealth, died: outcome.died }))).toEqual([
        { resultingHealth: 50, died: false },
        { resultingHealth: 50, died: false },
      ]);
      await host.waitForFunction(() => (
        (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().railgun.chamberReadyAtHostTimeMs <= performance.now()
      ), undefined, { timeout: 4_000 });
      const second = await fireAndAwait(2);
      expect(second.outcomes.map((outcome: any) => ({ resultingHealth: outcome.resultingHealth, died: outcome.died }))).toEqual([
        { resultingHealth: 0, died: true },
        { resultingHealth: 0, died: true },
      ]);

      await Promise.all([host, shooter, observer].map((page) => page.waitForFunction(({ hostId, shooterId, observerId }) => {
        const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
        const deaths = snapshot.railgun.deathPresentations;
        return snapshot.railgun.presentation.beamPresentations === 2
          && deaths.length === 2
          && deaths.map((entry: any) => entry.victimId).join(',') === `${shooterId},${observerId}`
          && deaths.every((entry: any) => entry.killerId === hostId);
      }, { hostId, shooterId, observerId }, { timeout: 5_000 })));
      const roleShots = await Promise.all([host, shooter, observer].map(state));
      for (const shot of roleShots) {
        expect(shot.railgun.deathPresentationCount).toBe(2);
        expect(shot.railgun.deathPresentations.map((entry: any) => entry.victimId)).toEqual([shooterId, observerId]);
        expect(shot.railgun.deathPresentations.every((entry: any) => entry.killerId === hostId)).toBe(true);
      }
      expect(roleShots[0].player.kills).toBe(2);
      expect(roleShots[0].privateMatch.scores.find((score: any) => score.id === hostId)).toMatchObject({
        kills: 2,
        deaths: 0,
        damageDealt: 200,
      });
      expect(roleShots[0].audio.railgun).toMatchObject({ local: 2, replicated: 0 });
      expect(roleShots[1].audio.railgun).toMatchObject({ local: 0, replicated: 2, lastSpatial: true });
      expect(roleShots[2].audio.railgun).toMatchObject({ local: 0, replicated: 2, lastSpatial: true });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
