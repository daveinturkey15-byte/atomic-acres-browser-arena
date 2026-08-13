import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  assertPass66OwnedCandidatePage,
  startOwnedPeerServer,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS66_QODER_AUTHORITY_PEER_PORT ?? 9_069);
let peerServer: OwnedPeerServer | null = null;
const REJOIN_FOREGROUND_OWNERSHIP_TIMEOUT_MS = 5_000;
const REJOIN_TRANSPORT_ADMISSION_TIMEOUT_MS = 20_000;
const REJOIN_END_TO_END_ADMISSION_TIMEOUT_MS = 75_000;
const REJOIN_PRESENTATION_SAMPLE_INTERVAL_MS = 500;
const REJOIN_PRESENTATION_TRACE_INTERVAL_MS = 5_000;
const HOST_RECOVERY_END_TO_END_TIMEOUT_MS = 90_000;
const GUEST_RENDER_RESUME_FRAME_TIMEOUT_MS = 10_000;
const DEATH_DROP_AUTHORITY_TTL_MARGIN_MS = 5_000;
const REMOTE_STAGE_ACK_TIMEOUT_MS = 10_000;

type Position3 = readonly [number, number, number];

type DeathDropApproach = Readonly<{
  directionIndex: number;
  outer: Position3;
  middle: Position3;
  pickup: Position3;
}>;

type RejoinAdmissionSample = Readonly<{
  ready: boolean;
  transportReady: boolean;
  document: Readonly<{ visibilityState: DocumentVisibilityState; hasFocus: boolean }>;
  gameStarted: boolean;
  matchPhase: string | null;
  admission: unknown;
  deployment: Readonly<{
    stage: string | null;
    percent: string | null;
    etaSeconds: string | null;
  }>;
  networkLifecycle: unknown;
  privateMatch: Readonly<{
    phase: string | null;
    members: readonly Readonly<{ id: string; connected: boolean }>[];
  }> | null;
}>;

type TimedRejoinAdmissionSample = RejoinAdmissionSample & Readonly<{ elapsedMs: number }>;

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
  viewport: { width: 1_280, height: 720 },
});
test.describe.configure({ timeout: 240_000 });

test.beforeAll(async () => {
  peerServer = await startOwnedPeerServer(peerPort, process.env.PASS66_QODER_AUTHORITY_PEER_PATH);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

async function openPlayer(context: BrowserContext, name: string, seed: string): Promise<Page> {
  if (!peerServer) throw new Error('Owned PeerJS server is not ready');
  const page = await context.newPage();
  const url = new URL(test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest', renderer: 'webgl2', render: 'performance', signal: 'off', grass: 'off', mist: 'off',
    clouds: 'off', rays: 'off', multiplayerQa: '1', peerQaPort: String(peerPort), peerQaPath: peerServer.path,
    seed, previewTime: '0',
  })) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await assertPass66OwnedCandidatePage(page);
  await page.waitForFunction(() => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
    return debug?.snapshot().weaponReady === true
      && document.querySelector<HTMLButtonElement>('#host')?.disabled === false;
  }, undefined, { timeout: 45_000 });
  await page.locator('#player-name').fill(name);
  return page;
}

async function sampleRejoinAdmission(guest: Page): Promise<RejoinAdmissionSample> {
  return guest.evaluate(() => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
    const state = debug?.snapshot?.() ?? null;
    const members = state?.privateMatch?.members ?? [];
    const transportReady = state?.networkLifecycle?.hostConnectionOpen === true
      && members.length === 2
      && members.every((member: any) => member.connected === true);
    const transition = document.querySelector<HTMLElement>('#deployment-transition');
    return {
      ready: transportReady && state?.gameStarted === true && state?.matchPhase === 'active',
      transportReady,
      document: {
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus(),
      },
      gameStarted: state?.gameStarted === true,
      matchPhase: typeof state?.matchPhase === 'string' ? state.matchPhase : null,
      admission: debug?.admissionState?.() ?? null,
      deployment: {
        stage: transition?.dataset.loadingStage ?? null,
        percent: transition?.dataset.loadingPercent ?? null,
        etaSeconds: transition?.dataset.loadingEtaSeconds ?? null,
      },
      networkLifecycle: state?.networkLifecycle ?? null,
      privateMatch: state?.privateMatch ? {
        phase: typeof state.privateMatch.phase === 'string' ? state.privateMatch.phase : null,
        members: members.map((member: any) => ({ id: member.id, connected: member.connected === true })),
      } : null,
    };
  });
}

async function sampleRejoinFailureDiagnostic(guest: Page): Promise<unknown> {
  return guest.evaluate(() => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
    return {
      capturedAtEpochMs: Date.now(),
      document: {
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus(),
      },
      admission: debug?.admissionState?.() ?? null,
      weaponCatalog: debug?.sampleWeaponCatalogReadiness?.() ?? null,
      state: debug?.snapshot?.() ?? null,
      deployment: document.querySelector<HTMLElement>('#deployment-transition')?.dataset ?? null,
      networkStatus: document.querySelector<HTMLElement>('#network-status')?.textContent?.trim() ?? null,
    };
  });
}

async function attachRejoinEvidence(name: string, evidence: unknown): Promise<void> {
  await test.info().attach(name, {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
}

function rejoinSampleFingerprint(sample: RejoinAdmissionSample): string {
  return JSON.stringify({
    ready: sample.ready,
    transportReady: sample.transportReady,
    document: sample.document,
    gameStarted: sample.gameStarted,
    matchPhase: sample.matchPhase,
    admission: sample.admission,
    deployment: sample.deployment,
    privateMatch: sample.privateMatch,
  });
}

async function waitForRejoinPresentation(guest: Page, rejoinStartedAt: number): Promise<Readonly<{
  elapsedMs: number;
  totalElapsedMs: number;
  samples: readonly TimedRejoinAdmissionSample[];
}>> {
  const startedAt = Date.now();
  const samples: TimedRejoinAdmissionSample[] = [];
  let lastFingerprint = '';
  let nextPeriodicTraceAt = 0;
  while (true) {
    const current = await sampleRejoinAdmission(guest);
    const elapsedMs = Date.now() - startedAt;
    const totalElapsedMs = Date.now() - rejoinStartedAt;
    const timed = Object.freeze({ ...current, elapsedMs });
    const fingerprint = rejoinSampleFingerprint(current);
    if (fingerprint !== lastFingerprint || elapsedMs >= nextPeriodicTraceAt) {
      samples.push(timed);
      lastFingerprint = fingerprint;
      nextPeriodicTraceAt = elapsedMs + REJOIN_PRESENTATION_TRACE_INTERVAL_MS;
    }
    if (current.document.visibilityState !== 'visible' || !current.document.hasFocus) {
      const diagnostic = await sampleRejoinFailureDiagnostic(guest);
      const evidence = { elapsedMs, totalElapsedMs, samples, diagnostic };
      await attachRejoinEvidence('qoder-rejoin-foreground-loss', evidence);
      throw new Error(`Qoder rejoin lost foreground presentation ownership: ${JSON.stringify({ elapsedMs, totalElapsedMs, document: current.document, deployment: current.deployment })}`);
    }
    if (totalElapsedMs >= REJOIN_END_TO_END_ADMISSION_TIMEOUT_MS) {
      const diagnostic = await sampleRejoinFailureDiagnostic(guest);
      const evidence = { elapsedMs, totalElapsedMs, samples, diagnostic };
      await attachRejoinEvidence('qoder-rejoin-presentation-timeout', evidence);
      throw new Error(`Qoder rejoin presentation did not converge within the ${REJOIN_END_TO_END_ADMISSION_TIMEOUT_MS} ms end-to-end bound: ${JSON.stringify({ elapsedMs, totalElapsedMs, document: current.document, admission: current.admission, deployment: current.deployment })}`);
    }
    if (current.ready) return Object.freeze({ elapsedMs, totalElapsedMs, samples: Object.freeze(samples) });
    await guest.waitForTimeout(REJOIN_PRESENTATION_SAMPLE_INTERVAL_MS);
  }
}

async function startMatch(
  hostContext: BrowserContext,
  guestContext: BrowserContext,
  names: readonly [string, string],
  seeds: readonly [string, string],
  hostedBots: '0' | '2' = '0',
): Promise<{ host: Page; guest: Page; roomCode: string }> {
  const [host, guest] = await Promise.all([
    openPlayer(hostContext, names[0], seeds[0]),
    openPlayer(guestContext, names[1], seeds[1]),
  ]);
  await host.locator('#team').selectOption('0');
  await guest.locator('#team').selectOption('1');
  await host.locator('#host').click();
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.locator('#room-code').textContent())?.trim() ?? '';
  await guest.locator('#room-input').fill(roomCode);
  await guest.locator('#join').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
  ))));
  if (hostedBots !== '0') await host.locator('#lobby-bots').selectOption(hostedBots);
  await host.locator('#lobby-ready').click();
  await guest.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction((botCount) => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active'
      && state.remotePlayers.length === 1
      && state.bots.length === botCount
      && state.killstreak.actors.length === 2;
  }, Number(hostedBots), { timeout: 75_000 })));
  return { host, guest, roomCode };
}

async function rejoinGuest(guest: Page, roomCode: string, name: string): Promise<void> {
  await guest.reload({ waitUntil: 'domcontentloaded' });
  await assertPass66OwnedCandidatePage(guest);
  await guest.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await expect(guest.locator('#room-input')).toHaveValue(roomCode);
  await expect(guest.locator('#join')).toHaveText('REJOIN LAST MATCH');
  await guest.locator('#player-name').fill(name);
  await guest.bringToFront();
  await expect.poll(async () => guest.evaluate(() => ({
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus(),
  })), { timeout: REJOIN_FOREGROUND_OWNERSHIP_TIMEOUT_MS })
    .toEqual({ visibilityState: 'visible', hasFocus: true });
  const rejoinStartedAt = Date.now();
  await guest.locator('#join').click();
  try {
    await guest.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.networkLifecycle.hostConnectionOpen === true
        && state.privateMatch?.members.length === 2
        && state.privateMatch.members.every((member: any) => member.connected === true);
    }, undefined, { timeout: REJOIN_TRANSPORT_ADMISSION_TIMEOUT_MS });
  } catch (error) {
    const diagnostic = await sampleRejoinFailureDiagnostic(guest);
    await attachRejoinEvidence('qoder-rejoin-transport-timeout', {
      elapsedMs: Date.now() - rejoinStartedAt,
      diagnostic,
    });
    throw new Error(`Qoder rejoin transport did not converge within ${REJOIN_TRANSPORT_ADMISSION_TIMEOUT_MS} ms: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  const transportElapsedMs = Date.now() - rejoinStartedAt;
  const presentation = await waitForRejoinPresentation(guest, rejoinStartedAt);
  await attachRejoinEvidence(`qoder-rejoin-${name.toLowerCase().replaceAll(' ', '-')}`, {
    transportElapsedMs,
    presentationElapsedMs: presentation.elapsedMs,
    totalElapsedMs: presentation.totalElapsedMs,
    endToEndAdmissionTimeoutMs: REJOIN_END_TO_END_ADMISSION_TIMEOUT_MS,
    samples: presentation.samples,
  });
}

async function settleCrashPrimitive(operation: Promise<unknown>, timeoutMs = 5_000): Promise<void> {
  await Promise.race([
    operation.then(() => undefined, () => undefined),
    new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, timeoutMs)),
  ]);
}

function remainingHostRecoveryTimeoutMs(startedAt: number): number {
  return Math.max(1, HOST_RECOVERY_END_TO_END_TIMEOUT_MS - (Date.now() - startedAt));
}

async function sampleHostRecoveryEvidence(host: Page, guest: Page): Promise<unknown> {
  const sample = (page: Page) => page.evaluate(() => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
    const state = debug?.snapshot?.() ?? null;
    return {
      document: {
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus(),
      },
      gameStarted: state?.gameStarted === true,
      matchPhase: state?.matchPhase ?? null,
      actorCount: state?.killstreak?.actors?.length ?? null,
      remotePlayerCount: state?.remotePlayers?.length ?? null,
      networkLifecycle: state?.networkLifecycle ?? null,
      privateMatch: state?.privateMatch ?? null,
      runtimeProvenance: state?.render?.runtime ?? null,
      arenaTransition: state?.arenaSelection?.streaming?.transition ?? null,
      admission: debug?.admissionState?.() ?? null,
      weaponCatalog: debug?.sampleWeaponCatalogReadiness?.() ?? null,
      menuPrewarm: {
        lifecycle: document.documentElement.dataset.menuLifecycle ?? null,
        state: state?.menuLifecycle ?? null,
        preview: state?.menuPreview?.rendererEvidence ?? null,
        rendererResidency: debug?.sampleRendererResidency?.() ?? null,
      },
      deployment: document.querySelector<HTMLElement>('#deployment-transition')?.dataset ?? null,
    };
  });
  const [hostState, guestState] = await Promise.all([sample(host), sample(guest)]);
  return { capturedAtEpochMs: Date.now(), host: hostState, guest: guestState };
}

async function failHostRecoveryStage(
  stage: string,
  startedAt: number,
  host: Page,
  guest: Page,
  cause: unknown,
): Promise<never> {
  const elapsedMs = Date.now() - startedAt;
  const diagnostic = await sampleHostRecoveryEvidence(host, guest);
  await attachRejoinEvidence(`qoder-host-recovery-${stage}`, {
    stage,
    elapsedMs,
    endToEndTimeoutMs: HOST_RECOVERY_END_TO_END_TIMEOUT_MS,
    diagnostic,
  });
  throw new Error(`Qoder host recovery failed at ${stage} after ${elapsedMs} ms`, { cause });
}

async function selectClearDeathDropApproach(guest: Page, dropPosition: Position3): Promise<DeathDropApproach | null> {
  const selected = await guest.evaluate(([dropX, dropY, dropZ]) => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    const pickup: [number, number, number] = [dropX, dropY + 1.55, dropZ];
    for (let directionIndex = 0; directionIndex < 32; directionIndex += 1) {
      const angle = directionIndex * Math.PI / 16;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const outer: [number, number, number] = [dropX + dx * 4, pickup[1], dropZ + dz * 4];
      const middle: [number, number, number] = [dropX + dx * 2.2, pickup[1], dropZ + dz * 2.2];
      if ([outer, middle, pickup].some(([x, y, z]) => api.collisionProbeAt(x, y, z))) continue;
      if (api.segmentBlocked(outer[0], outer[2], pickup[0], pickup[2])) continue;
      return { directionIndex, outer, middle, pickup };
    }
    return null;
  }, dropPosition);
  return selected as DeathDropApproach | null;
}

async function stageRemoteAt(
  guest: Page,
  host: Page,
  remoteId: string,
  position: Position3,
  label: string,
): Promise<void> {
  await guest.evaluate(([x, y, z]) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z)
  ), position);
  try {
    await host.waitForFunction(({ id, target }) => {
      const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
        .find((candidate: any) => candidate.id === id);
      return remote !== undefined
        && Math.abs(remote.position[0] - target[0]) < 0.5
        && Math.abs(remote.position[2] - target[2]) < 0.5;
    }, { id: remoteId, target: position }, { timeout: REMOTE_STAGE_ACK_TIMEOUT_MS });
  } catch (error) {
    const [guestState, hostState] = await Promise.all([
      guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player),
      host.evaluate((id) => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
        .find((candidate: any) => candidate.id === id) ?? null, remoteId),
    ]);
    await attachRejoinEvidence(`qoder-death-drop-stage-${label}`, {
      label,
      target: position,
      guest: guestState,
      hostRemote: hostState,
    });
    throw new Error(`Qoder death-drop ${label} position was not acknowledged within ${REMOTE_STAGE_ACK_TIMEOUT_MS} ms`, { cause: error });
  }
}

function ladderProjection(state: any): any[] {
  return state.killstreak.actors.map((actor: any) => ({
    actorId: actor.actorId,
    lifeId: actor.lifeId,
    streak: actor.streak,
    cycleProgress: actor.cycleProgress,
    charges: actor.availableCharges.map((charge: any) => ({ ...charge })),
  })).sort((left: any, right: any) => left.actorId.localeCompare(right.actorId));
}

test('post-death ladders survive authenticated replacements and an immediate host renderer crash exactly once', async ({ browser, browserName }) => {
  test.setTimeout(300_000);
  test.skip(browserName === 'firefox', 'Two simultaneous headless Firefox SWGL pages are covered by the serial browser matrix.');
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const errors: string[] = [];
  try {
    const started = await startMatch(
      hostContext,
      guestContext,
      ['Ladder Host', 'Ladder Guest'],
      ['pass66-ladder-host', 'pass66-ladder-guest'],
    );
    let host = started.host;
    const { guest, roomCode } = started;
    host.on('pageerror', (error) => errors.push(`host: ${error.message}`));
    guest.on('pageerror', (error) => errors.push(`guest: ${error.message}`));
    const guestId = await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0].id as string);
    expect(await host.evaluate((id) => {
      const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
      debug.earnSupport(15);
      debug.earnSupport(15);
      return debug.earnSupportForActor(id, 15) && debug.earnSupportForActor(id, 15);
    }, guestId)).toBe(true);

    await expect.poll(async () => {
      const actors = ladderProjection(await guest.evaluate(() => (
        (window as any).__ATOMIC_ACRES_DEBUG__.snapshot()
      )));
      return actors.length === 2 && actors.every((actor) => (
        actor.streak === 30 && actor.cycleProgress === 0
        && actor.charges.length === 5 && actor.charges.every((charge: any) => charge.count === 2)
      ));
    }).toBe(true);

    // Advance the guest to a later host-owned life before replacing its
    // document. A fresh document begins with new transport counters but must
    // not be allowed to replace or forge this retained actor life.
    const death = await host.evaluate((id) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.forceRemoteDeathForReconnect(id)
    ), guestId);
    expect(death).toMatchObject({ targetId: guestId });
    expect(death.nextLifeId).toBeGreaterThan(2);
    await expect.poll(async () => guest.evaluate((lifeId) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.player.alive
        && state.player.continuity === lifeId
        && state.player.hostConfirmedContinuity === lifeId;
    }, death.nextLifeId), { timeout: 8_000 }).toBe(true);
    await expect.poll(async () => host.evaluate(({ id, lifeId }) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const remote = state.remotePlayers.find((candidate: any) => candidate.id === id);
      const actor = state.killstreak.actors.find((candidate: any) => candidate.actorId === id);
      return remote?.continuity === lifeId && remote?.hp === 100 && actor?.lifeId === lifeId;
    }, { id: guestId, lifeId: death.nextLifeId }), { timeout: 8_000 }).toBe(true);

    expect(await host.evaluate((id) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.earnSupportForActor(id, 15)
    ), guestId)).toBe(true);
    const beforeReplacement = await guest.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('scout-sweep')
    ));
    expect(beforeReplacement).toMatchObject({ sequence: 1, lifeId: death.nextLifeId });
    await expect.poll(async () => host.evaluate((id) => {
      const actor = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.actors
        .find((candidate: any) => candidate.actorId === id);
      return actor?.availableCharges.find((charge: any) => charge.id === 'scout-sweep')?.count ?? 0;
    }, guestId)).toBe(2);

    await rejoinGuest(guest, roomCode, 'Ladder Guest');
    await expect.poll(async () => guest.evaluate((lifeId) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const actor = state.killstreak.actors.find((candidate: any) => candidate.actorId === state.player.id);
      return state.player.continuity === lifeId
        && state.player.hostConfirmedContinuity === lifeId
        && state.player.awaitingAuthoritativeRejoinContinuity === false
        && actor?.lifeId === lifeId;
    }, death.nextLifeId)).toBe(true);

    // The replacement document restarts at sequence one. The authenticated
    // replacement reset must admit it even though the prior document already
    // used sequence one, while its new request ID consumes exactly one charge.
    const afterReplacement = await guest.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('scout-sweep')
    ));
    expect(afterReplacement).toMatchObject({ sequence: 1, lifeId: death.nextLifeId });
    expect(afterReplacement.activationId).not.toBe(beforeReplacement.activationId);
    await expect.poll(async () => host.evaluate((id) => {
      const actor = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.actors
        .find((candidate: any) => candidate.actorId === id);
      return actor?.availableCharges.find((charge: any) => charge.id === 'scout-sweep')?.count ?? 0;
    }, guestId)).toBe(1);

    // Spend the final retained charge, prove its replay identity reached durable
    // storage in under the old two-second crash window, then crash the renderer
    // without pagehide/unload checkpoint assistance.
    const crashActivation = await guest.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('scout-sweep')
    ));
    expect(crashActivation).toMatchObject({ sequence: 2, lifeId: death.nextLifeId });
    await expect.poll(async () => host.evaluate((id) => {
      const actor = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.actors
        .find((candidate: any) => candidate.actorId === id);
      if (!actor) return null;
      // Zero-count rewards are intentionally omitted from the recipient
      // projection, so an absent slot on a present actor is the canonical zero.
      return actor.availableCharges.find((entry: any) => entry.id === 'scout-sweep')?.count ?? 0;
    }, guestId), { timeout: 8_000 }).toBe(0);
    expect(await host.evaluate(({ id, activationId }) => {
      const raw = localStorage.getItem('atomic-acres:host-match-checkpoint:v3');
      if (!raw) return null;
      const checkpoint = JSON.parse(raw);
      const actor = checkpoint.killstreak?.actors?.find((candidate: any) => candidate.actorId === id);
      return {
        replayIdRetained: checkpoint.killstreak?.seenActivationRequestIds?.includes(activationId) === true,
        charge: actor?.availableCharges?.find((entry: any) => entry.id === 'scout-sweep')?.count ?? 0,
        lifeId: actor?.lifeId ?? null,
        containsRawToken: JSON.stringify(checkpoint).includes('resumeToken"'),
      };
    }, { id: guestId, activationId: crashActivation.activationId })).toEqual({
      replayIdRetained: true,
      charge: 0,
      lifeId: death.nextLifeId,
      containsRawToken: false,
    });

    const guestRecoveryTopology = await guest.evaluate(() => {
      const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
      const state = debug.snapshot();
      const softwareAdapter = state.render.runtime.softwareAdapter === true;
      if (softwareAdapter) debug.setRenderPaused(true);
      return {
        softwareAdapter,
        pausedAtPresentedGameplayFrame: Number(debug.admissionState().presentedGameplayFrame),
        runtimeProvenance: state.render.runtime,
        arenaTransition: state.arenaSelection?.streaming?.transition ?? null,
        menuPrewarm: {
          lifecycle: document.documentElement.dataset.menuLifecycle ?? null,
          state: state.menuLifecycle ?? null,
          preview: state.menuPreview?.rendererEvidence ?? null,
          rendererResidency: debug.sampleRendererResidency?.() ?? null,
        },
      };
    });
    expect(typeof guestRecoveryTopology.softwareAdapter).toBe('boolean');
    expect(Number.isFinite(guestRecoveryTopology.pausedAtPresentedGameplayFrame)).toBe(true);

    // The renderer crash below is deliberate. Retain any errors already observed,
    // but do not mistake Chromium's crash diagnostic for a game page error. A
    // co-located software renderer is paused only for this recovery window so
    // the recovering host retains the same production prewarm/readiness work.
    let hostRecoveryElapsedMs = 0;
    try {
      host.removeAllListeners('pageerror');
      const cdp = await hostContext.newCDPSession(host);
      await settleCrashPrimitive(cdp.send('Page.crash'));
      host = await openPlayer(hostContext, 'Ladder Host', 'pass66-ladder-host-recovery');
      host.on('pageerror', (error) => errors.push(`recovered host: ${error.message}`));
      await expect(host.locator('#host')).toHaveText('RESUME HOSTED MATCH');
      const hostRecoveryStartedAt = Date.now();
      await host.locator('#host').click();
      try {
        await host.waitForFunction(() => {
          const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
          return state.gameStarted && state.matchPhase === 'active';
        }, undefined, { timeout: remainingHostRecoveryTimeoutMs(hostRecoveryStartedAt) });
      } catch (error) {
        await failHostRecoveryStage('host-active', hostRecoveryStartedAt, host, guest, error);
      }
      await guest.bringToFront();
      try {
        await expect.poll(async () => guest.evaluate(() => ({
          visibilityState: document.visibilityState,
          hasFocus: document.hasFocus(),
        })), {
          timeout: Math.min(
            REJOIN_FOREGROUND_OWNERSHIP_TIMEOUT_MS,
            remainingHostRecoveryTimeoutMs(hostRecoveryStartedAt),
          ),
        }).toEqual({ visibilityState: 'visible', hasFocus: true });
      } catch (error) {
        await failHostRecoveryStage('guest-foreground', hostRecoveryStartedAt, host, guest, error);
      }
      try {
        await guest.waitForFunction(() => {
          const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
          return state.gameStarted && state.matchPhase === 'active'
            && state.networkLifecycle.hostConnectionOpen === true;
        }, undefined, { timeout: remainingHostRecoveryTimeoutMs(hostRecoveryStartedAt) });
      } catch (error) {
        await failHostRecoveryStage('guest-active', hostRecoveryStartedAt, host, guest, error);
      }
      try {
        await host.waitForFunction(() => (
          (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.actors.length === 2
        ), undefined, { timeout: remainingHostRecoveryTimeoutMs(hostRecoveryStartedAt) });
      } catch (error) {
        await failHostRecoveryStage('host-actors', hostRecoveryStartedAt, host, guest, error);
      }
      hostRecoveryElapsedMs = Date.now() - hostRecoveryStartedAt;
      if (hostRecoveryElapsedMs > HOST_RECOVERY_END_TO_END_TIMEOUT_MS) {
        await failHostRecoveryStage(
          'end-to-end-bound',
          hostRecoveryStartedAt,
          host,
          guest,
          new Error(`Recovery completed after ${hostRecoveryElapsedMs} ms`),
        );
      }
    } finally {
      if (guestRecoveryTopology.softwareAdapter) {
        await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
      }
    }

    let resumedGuestPresentedGameplayFrame = guestRecoveryTopology.pausedAtPresentedGameplayFrame;
    if (guestRecoveryTopology.softwareAdapter) {
      try {
        await guest.waitForFunction((baselineFrame) => (
          (window as any).__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame > baselineFrame
        ), guestRecoveryTopology.pausedAtPresentedGameplayFrame, {
          timeout: GUEST_RENDER_RESUME_FRAME_TIMEOUT_MS,
        });
      } catch (error) {
        await attachRejoinEvidence('qoder-host-recovery-guest-render-resume-timeout', {
          timeoutMs: GUEST_RENDER_RESUME_FRAME_TIMEOUT_MS,
          guestRecoveryTopology,
          diagnostic: await sampleHostRecoveryEvidence(host, guest),
        });
        throw error;
      }
      resumedGuestPresentedGameplayFrame = await guest.evaluate(() => Number(
        (window as any).__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame,
      ));
      expect(resumedGuestPresentedGameplayFrame)
        .toBeGreaterThan(guestRecoveryTopology.pausedAtPresentedGameplayFrame);
    }
    await attachRejoinEvidence('qoder-host-recovery-complete', {
      elapsedMs: hostRecoveryElapsedMs,
      endToEndTimeoutMs: HOST_RECOVERY_END_TO_END_TIMEOUT_MS,
      guestRecoveryTopology,
      resumedGuestPresentedGameplayFrame,
      diagnostic: await sampleHostRecoveryEvidence(host, guest),
    });

    await expect.poll(async () => host.evaluate(({ id, lifeId }) => {
      const actor = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.actors
        .find((candidate: any) => candidate.actorId === id);
      return {
        lifeId: actor?.lifeId ?? null,
        streak: actor?.streak ?? null,
        firstSlotCharge: actor?.availableCharges.find((charge: any) => charge.id === 'scout-sweep')?.count ?? 0,
      };
    }, { id: guestId, lifeId: death.nextLifeId })).toEqual({
      lifeId: death.nextLifeId,
      streak: 15,
      firstSlotCharge: 0,
    });
    expect(await guest.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.replayLastKillstreakActivation()
    ))).toBe(true);
    await guest.waitForTimeout(350);
    expect(await host.evaluate(({ id, activationId }) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const actor = state.killstreak.actors.find((candidate: any) => candidate.actorId === id);
      const raw = localStorage.getItem('atomic-acres:host-match-checkpoint:v3');
      const checkpoint = raw ? JSON.parse(raw) : null;
      return {
        firstSlotCharge: actor?.availableCharges.find((charge: any) => charge.id === 'scout-sweep')?.count ?? 0,
        retainedReplayIds: checkpoint?.killstreak?.seenActivationRequestIds
          ?.filter((candidate: string) => candidate === activationId).length ?? 0,
      };
    }, { id: guestId, activationId: crashActivation.activationId })).toEqual({
      firstSlotCharge: 0,
      retainedReplayIds: 1,
    });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test('a guest death-drop scavenge converges through host authority exactly once', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Two simultaneous headless Firefox SWGL pages are covered by the serial browser matrix.');
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const errors: string[] = [];
  try {
    const { host, guest } = await startMatch(
      hostContext,
      guestContext,
      ['Scavenge Host', 'Scavenge Guest'],
      ['pass70-scavenge-host', 'pass70-scavenge-guest'],
    );
    host.on('pageerror', (error) => errors.push(`host: ${error.message}`));
    guest.on('pageerror', (error) => errors.push(`guest: ${error.message}`));
    const guestId = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0].id as string
    ));

    expect(await host.evaluate((id) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.forceRemoteDeathForReconnect(id)
    ), guestId)).toMatchObject({ targetId: guestId });
    let hostDrop: any = null;
    await expect.poll(async () => {
      hostDrop = await host.evaluate(() => {
        const candidate = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().deathDrops[0];
        return candidate ?? null;
      });
      return hostDrop;
    }).not.toBeNull();
    expect(hostDrop.expiresInMs).toBeGreaterThan(0);
    const dropObservedAtEpochMs = Date.now();
    await Promise.all([
      expect.poll(async () => guest.evaluate((dropId) => {
        const candidate = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().deathDrops
          .find((entry: any) => entry.id === dropId);
        return candidate ? {
          weapon: candidate.weapon,
          ammoAvailable: candidate.ammoAvailable,
          weaponAvailable: candidate.weaponAvailable,
        } : null;
      }, hostDrop.id)).toEqual({
        weapon: hostDrop.weapon,
        ammoAvailable: true,
        weaponAvailable: true,
      }),
      expect.poll(async () => guest.evaluate(() => {
        const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
        return { alive: state.player.alive, hp: state.player.hp };
      })).toEqual({ alive: true, hp: 100 }),
      expect.poll(async () => host.evaluate((id) => {
        const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
          .find((candidate: any) => candidate.id === id);
        return remote ? { hp: remote.hp, reserve: remote.combatInventory?.reserve?.carbine ?? null } : null;
      }, guestId)).toEqual({ hp: 100, reserve: 120 }),
    ]);

    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.fireOnce());
    await expect.poll(async () => host.evaluate((id) => {
      const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
        .find((candidate: any) => candidate.id === id);
      return remote?.combatInventory?.ammo?.carbine ?? null;
    }, guestId)).toBe(29);
    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.reload());
    await Promise.all([
      expect.poll(async () => host.evaluate((id) => {
        const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
          .find((candidate: any) => candidate.id === id);
        return remote ? {
          ammo: remote.combatInventory?.ammo?.carbine ?? null,
          reserve: remote.combatInventory?.reserve?.carbine ?? null,
        } : null;
      }, guestId), { timeout: 5_000 }).toEqual({ ammo: 30, reserve: 119 }),
      expect.poll(async () => guest.evaluate(() => {
        const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
        return { ammo: state.player.ammo, reserve: state.player.reserve };
      })).toEqual({ ammo: 30, reserve: 119 }),
    ]);

    const dropPosition = hostDrop.position as Position3;
    const approach = await selectClearDeathDropApproach(guest, dropPosition);
    if (!approach) throw new Error(`No collision-clear death-drop approach for ${JSON.stringify(dropPosition)}`);
    await stageRemoteAt(guest, host, guestId, approach.middle, 'middle');
    await guest.evaluate(([x, y, z]) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z)
    ), approach.pickup);

    let hostPostScavengeProjection: any = null;
    await expect.poll(async () => {
      const projection = await host.evaluate(({ dropId, playerId }) => {
        const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
        const candidate = snapshot.deathDrops
          .find((entry: any) => entry.id === dropId);
        const remote = snapshot.remotePlayers.find((entry: any) => entry.id === playerId);
        return {
          remotePresent: remote !== undefined,
          dropPresent: candidate !== undefined,
          ammoAvailable: candidate?.ammoAvailable ?? null,
          weaponAvailable: candidate?.weaponAvailable ?? null,
          expiresInMs: candidate?.expiresInMs ?? null,
          hostInventory: remote ? {
            reserve: remote.combatInventory?.reserve?.carbine ?? null,
            grenades: remote.combatInventory?.grenades ?? null,
          } : null,
        };
      }, { dropId: hostDrop.id, playerId: guestId });
      if (projection.remotePresent === true
        && projection.dropPresent === true
        && projection.ammoAvailable === false
        && projection.weaponAvailable === true
        && projection.hostInventory?.reserve === 120
        && projection.hostInventory?.grenades === 1
        && projection.expiresInMs >= DEATH_DROP_AUTHORITY_TTL_MARGIN_MS) hostPostScavengeProjection = projection;
      return hostPostScavengeProjection !== null;
    }).toBe(true);
    const hostPostScavengeObservedAtEpochMs = Date.now();
    const wallClockElapsedSinceDropObservationMs = hostPostScavengeObservedAtEpochMs - dropObservedAtEpochMs;
    const nonAuthoritativeWallClockRemainingTtlEstimateMs = hostDrop.expiresInMs
      - wallClockElapsedSinceDropObservationMs;
    expect(hostPostScavengeProjection).toMatchObject({
      remotePresent: true,
      dropPresent: true,
      ammoAvailable: false,
      weaponAvailable: true,
      hostInventory: { reserve: 120, grenades: 1 },
    });
    expect(hostPostScavengeProjection.expiresInMs)
      .toBeGreaterThanOrEqual(DEATH_DROP_AUTHORITY_TTL_MARGIN_MS);
    await attachRejoinEvidence('qoder-death-drop-authority-before-expiry', {
      drop: {
        id: hostDrop.id,
        observedAtEpochMs: dropObservedAtEpochMs,
        initialExpiresInMs: hostDrop.expiresInMs,
      },
      authorityObservation: {
        observedAtEpochMs: hostPostScavengeObservedAtEpochMs,
        wallClockElapsedSinceDropObservationMs,
        nonAuthoritativeWallClockRemainingTtlEstimateMs,
      },
      hostPostScavengeProjection,
    });

    let inventoryAfterScavenge: any = null;
    await expect.poll(async () => {
      inventoryAfterScavenge = await guest.evaluate(() => {
        const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
        return { reserve: state.player.reserve, grenades: state.player.grenades };
      });
      return inventoryAfterScavenge;
    }).toEqual({ reserve: 120, grenades: 1 });

    await guest.waitForTimeout(750);
    const [laterHostInventory, laterGuestInventory] = await Promise.all([
      host.evaluate((id) => {
        const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
          .find((candidate: any) => candidate.id === id);
        return remote ? {
          reserve: remote.combatInventory?.reserve?.carbine ?? null,
          grenades: remote.combatInventory?.grenades ?? null,
        } : null;
      }, guestId),
      guest.evaluate(() => {
        const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
        return { reserve: state.player.reserve, grenades: state.player.grenades };
      }),
    ]);
    await attachRejoinEvidence('qoder-death-drop-exact-once', {
      hostInventoryAfterScavenge: hostPostScavengeProjection.hostInventory,
      laterHostInventory,
      inventoryAfterScavenge,
      laterGuestInventory,
    });
    expect(laterHostInventory).toEqual(hostPostScavengeProjection.hostInventory);
    expect(laterGuestInventory).toEqual(inventoryAfterScavenge);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test('Semtex and crossbolt sticky results apply once under duplicate, reorder and guest rejoin', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Two simultaneous headless Firefox SWGL pages are covered by the serial browser matrix.');
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const errors: string[] = [];
  try {
    const { host, guest, roomCode } = await startMatch(
      hostContext,
      guestContext,
      ['Sticky Host', 'Sticky Guest'],
      ['pass66-sticky-host', 'pass66-sticky-guest'],
    );
    host.on('pageerror', (error) => errors.push(`host: ${error.message}`));
    guest.on('pageerror', (error) => errors.push(`guest: ${error.message}`));
    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setStance('prone'));
    const semtex = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.authorStickyEffect('semtex')
    ));
    expect(semtex).not.toBeNull();
    expect(semtex.stuckDamage).toBeCloseTo(semtex.baseDamage * 2, 6);
    expect(semtex.stuckRadiusM).toBeCloseTo(semtex.baseRadiusM * 2, 6);
    await expect.poll(async () => host.evaluate(() => {
      const alert = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().stickyAuthority.urgentAlert;
      return {
        visible: alert.visible,
        source: alert.source,
        audience: alert.audience,
        position: alert.computedPosition,
        zIndex: alert.computedZIndex,
        centred: alert.centreErrorPx <= 1,
      };
    })).toEqual({
      visible: true,
      source: 'semtex',
      audience: 'attacker',
      position: 'fixed',
      zIndex: 120,
      centred: true,
    });
    await expect.poll(async () => guest.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        hp: state.player.hp,
        feedback: state.stickyAuthority,
        alert: {
          visible: state.stickyAuthority.urgentAlert.visible,
          source: state.stickyAuthority.urgentAlert.source,
          audience: state.stickyAuthority.urgentAlert.audience,
          position: state.stickyAuthority.urgentAlert.computedPosition,
          zIndex: state.stickyAuthority.urgentAlert.computedZIndex,
          centred: state.stickyAuthority.urgentAlert.centreErrorPx <= 1,
        },
      };
    })).toMatchObject({
      hp: semtex.healthAfter,
      feedback: { victimFeedbackCount: 1, lastVictimFeedback: { label: 'STUCK', source: 'semtex' } },
      alert: { visible: true, source: 'semtex', audience: 'victim', position: 'fixed', zIndex: 120, centred: true },
    });
    await expect.poll(async () => Promise.all([host, guest].map((page) => page.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().stickyAuthority.urgentAlert.visible
    )))), { timeout: 1_000 }).toEqual([false, false]);
    expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.replayStickyEffect('semtex'))).toBe(true);
    await guest.waitForTimeout(350);
    expect(await guest.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return { hp: state.player.hp, count: state.stickyAuthority.victimFeedbackCount };
    })).toEqual({ hp: semtex.healthAfter, count: 1 });

    await rejoinGuest(guest, roomCode, 'Sticky Guest');
    await expect.poll(async () => guest.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return { hp: state.player.hp, count: state.stickyAuthority.victimFeedbackCount, receipts: state.stickyAuthority.retainedReceiptCount };
    })).toEqual({ hp: semtex.healthAfter, count: 0, receipts: 1 });
    expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.replayStickyEffect('semtex'))).toBe(true);
    await guest.waitForTimeout(350);
    expect(await guest.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return { hp: state.player.hp, count: state.stickyAuthority.victimFeedbackCount };
    })).toEqual({ hp: semtex.healthAfter, count: 0 });

    const crossbolt = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.authorStickyEffect('explosive-crossbow')
    ));
    expect(crossbolt).not.toBeNull();
    expect(crossbolt.stuckDamage).toBeCloseTo(crossbolt.baseDamage * 2, 6);
    expect(crossbolt.stuckRadiusM).toBeCloseTo(crossbolt.baseRadiusM * 2, 6);
    await expect.poll(async () => host.evaluate(() => {
      const alert = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().stickyAuthority.urgentAlert;
      return { visible: alert.visible, source: alert.source, audience: alert.audience, centred: alert.centreErrorPx <= 1 };
    })).toEqual({ visible: true, source: 'explosive-crossbow', audience: 'attacker', centred: true });
    await expect.poll(async () => guest.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        hp: state.player.hp,
        count: state.stickyAuthority.victimFeedbackCount,
        source: state.stickyAuthority.lastVictimFeedback?.source,
        alert: {
          visible: state.stickyAuthority.urgentAlert.visible,
          audience: state.stickyAuthority.urgentAlert.audience,
          centred: state.stickyAuthority.urgentAlert.centreErrorPx <= 1,
        },
      };
    })).toEqual({
      hp: crossbolt.healthAfter,
      count: 1,
      source: 'explosive-crossbow',
      alert: { visible: true, audience: 'victim', centred: true },
    });
    expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.replayStickyEffect('explosive-crossbow'))).toBe(true);
    expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.replayStickyEffect('semtex'))).toBe(true);
    await guest.waitForTimeout(350);
    expect(await guest.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return { hp: state.player.hp, count: state.stickyAuthority.victimFeedbackCount };
    })).toEqual({ hp: crossbolt.healthAfter, count: 1 });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test('host-authoritative facing flash and semantic smoke break bot lock while the guest observes safe replicas', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Two simultaneous headless Firefox SWGL pages are covered by the serial browser matrix.');
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const errors: string[] = [];
  try {
    const { host, guest } = await startMatch(
      hostContext,
      guestContext,
      ['Perception Host', 'Perception Guest'],
      ['pass66-perception-host', 'pass66-perception-guest'],
      '2',
    );
    host.on('pageerror', (error) => errors.push(`host: ${error.message}`));
    guest.on('pageerror', (error) => errors.push(`guest: ${error.message}`));
    const flash = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.stageBotPerceptionAgainstRemote('flash')
    ));
    expect(flash).toMatchObject({ effect: 'flash', preLockId: flash.targetId, postLockId: null, canFire: false, volumeId: null });
    expect(flash.blindRemainingMs).toBeGreaterThan(0);
    await expect.poll(async () => host.evaluate((botId) => {
      const bot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().bots.find((candidate: any) => candidate.id === botId);
      return bot?.perception ?? null;
    }, flash.botId)).toMatchObject({ targetLockId: null, canFire: false });
    await expect.poll(async () => guest.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.hp
    ))).toBe(flash.targetHealthAfterEffect);
    await guest.waitForTimeout(500);
    expect(await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.hp)).toBe(flash.targetHealthAfterEffect);

    await expect.poll(async () => host.evaluate((botId) => {
      const bot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().bots.find((candidate: any) => candidate.id === botId);
      return bot?.perception.blindRemainingMs ?? null;
    }, flash.botId)).toBe(0);
    const smoke = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.stageBotPerceptionAgainstRemote('smoke')
    ));
    expect(smoke, 'Smoke perception staging returned null after flash blindness reached zero').not.toBeNull();
    expect(smoke).toMatchObject({ effect: 'smoke', preLockId: smoke.targetId, postLockId: null, canFire: false });
    expect(smoke.volumeId).toMatch(/^smoke-/);
    expect(smoke.aimErrorRadians).toBeGreaterThan(0);
    await expect.poll(async () => guest.evaluate((botId) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        activeSmoke: state.dmrThermal.smokeAuthority.activeVolumes,
        smokeVolumes: state.dmrThermal.smokeVolumes,
        botVisible: state.bots.some((bot: any) => bot.id === botId && bot.rootVisible),
      };
    }, smoke.botId)).toMatchObject({ activeSmoke: 1, smokeVolumes: 1, botVisible: true });
    await guest.waitForTimeout(750);
    expect(await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.hp)).toBe(smoke.targetHealthAfterEffect);
    await expect.poll(async () => host.evaluate((botId) => {
      const bot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().bots.find((candidate: any) => candidate.id === botId);
      return bot?.perception ?? null;
    }, smoke.botId)).toMatchObject({ targetLockId: null, canFire: false });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});
