import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  attachBrowserDiagnostics,
  readPersistedClientRuntimeLog,
  startOwnedPeerServer,
  type BrowserDiagnostics,
  type OwnedPeerServer,
} from './pass66-e2e-support';

type ArenaId = 'atomic-acres' | 'skyline-terminal' | 'rustworks-1v1' | 'gun-range';
type RenderProfile = 'performance' | 'blender' | 'compat';
type ContactCandidate = Readonly<{
  x: number;
  y: number;
  z: number;
  yaw: number;
  direction: readonly [number, number];
  wallDistance: number;
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
}>;
type ContactFixture = ContactCandidate & Readonly<{
  acceptedCandidate: number;
  settledPosition: readonly [number, number, number];
  wallProbeBlocked: boolean;
  bodyProbeClear: boolean;
  settledDeltaY: number;
  surfaceRetreat: number;
  surfaceLift: number;
}>;

const enabled = process.env.PASS66_PRONE_CONTACT_MATRIX === '1';
const expectedSourceSha = process.env.PASS66_PRONE_CONTACT_SOURCE_SHA ?? '';
const renderer = process.env.PASS66_PRONE_CONTACT_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const peerPort = Number(process.env.PASS66_PRONE_CONTACT_PEER_PORT ?? 9_071);
const CLIENT_RUNTIME_LOG_KEY = 'atomic-acres:client-runtime-log:v1';
const ARENAS: readonly ArenaId[] = Object.freeze([
  'atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range',
]);
const PROFILES: readonly RenderProfile[] = Object.freeze(['performance', 'blender', 'compat']);
const EXPECTED_CELLS = ARENAS.length * PROFILES.length;
const artifactRoot = resolve('artifacts/pass66/prone-contact-matrix');
const receiptPath = resolve(artifactRoot, 'receipt.json');
const receiptTempPath = `${receiptPath}.tmp`;
let peerServer: OwnedPeerServer | null = null;
let sourceSha = '';
let soloComplete = false;
let multiplayerComplete = false;
const soloRows: Array<Record<string, unknown>> = [];
const multiplayerRows: Array<Record<string, unknown>> = [];

test.use({
  launchOptions: {
    args: [
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--allow-loopback-in-peer-connection',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  },
  viewport: { width: 1_920, height: 1_080 },
});
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  if (!enabled) return;
  mkdirSync(artifactRoot, { recursive: true });
  rmSync(receiptPath, { force: true });
  rmSync(receiptTempPath, { force: true });
  if (!/^[a-f0-9]{40}$/u.test(expectedSourceSha)) {
    throw new Error(`PASS66_PRONE_CONTACT_SOURCE_SHA must be a full SHA; received ${expectedSourceSha || '(missing)'}`);
  }
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
  if (dirty) throw new Error('Pass 66 prone contact matrix requires a completely clean worktree');
  sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (sourceSha !== expectedSourceSha) {
    throw new Error(`Pass 66 prone contact matrix source mismatch: ${sourceSha} != ${expectedSourceSha}`);
  }
  peerServer = await startOwnedPeerServer(peerPort);
});

test.afterAll(async () => {
  if (!enabled) return;
  const ownedServer = peerServer;
  peerServer = null;
  await ownedServer?.stop();
  if (!soloComplete || !multiplayerComplete
    || soloRows.length !== EXPECTED_CELLS || multiplayerRows.length !== EXPECTED_CELLS) return;
  const finalDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
  if (finalDirty) throw new Error('Pass 66 prone contact matrix source drifted during execution');
  const finalSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (finalSha !== sourceSha) throw new Error(`Pass 66 prone contact matrix HEAD drifted: ${finalSha} != ${sourceSha}`);
  const receipt = {
    schema: 'atomic-acres/pass66-prone-contact-matrix@1',
    status: 'PASS',
    sourceSha,
    generatedAt: new Date().toISOString(),
    renderer,
    contract: {
      arenas: ARENAS,
      renderProfiles: PROFILES,
      soloCells: soloRows.length,
      twoPeerCells: multiplayerRows.length,
      fixtureDiscovery: 'live arena bounds plus collisionProbeAt; no authored contact coordinates',
      actions: ['hip', 'ads', 'fire', 'reload', 'melee'],
      peers: 'separate BrowserContexts with one owned tokenized PeerJS child',
      receiptPolicy: 'removed before execution and atomically written only after both serial gates pass',
    },
    solo: soloRows,
    multiplayer: multiplayerRows,
  };
  writeFileSync(receiptTempPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  renameSync(receiptTempPath, receiptPath);
});

function caseLabel(arena: ArenaId, profile: RenderProfile): string {
  return `${arena}/${profile}/${renderer}`;
}

async function clearRuntimeLog(context: BrowserContext): Promise<void> {
  await context.addInitScript((storageKey) => {
    try { localStorage.removeItem(storageKey); } catch { /* about:blank has no storage origin */ }
  }, CLIENT_RUNTIME_LOG_KEY);
}

function candidateUrl(arena: ArenaId, profile: RenderProfile, seed: string, multiplayer: boolean): string {
  const url = new URL('/', test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest', renderer, requireWebGPU: renderer === 'webgpu' ? '1' : '0', render: profile,
    map: arena, signal: 'off', grass: 'off', mist: 'off', clouds: 'off', rays: 'off',
    externalServices: 'off', seed,
    ...(multiplayer && peerServer ? {
      multiplayerQa: '1', peerQaPort: String(peerServer.port), peerQaPath: peerServer.path,
    } : {}),
  })) url.searchParams.set(key, value);
  return url.toString();
}

async function openCandidate(
  context: BrowserContext,
  arena: ArenaId,
  profile: RenderProfile,
  seed: string,
  diagnostics: BrowserDiagnostics,
  diagnosticLabel: string,
  multiplayer: boolean,
): Promise<Page> {
  const page = await context.newPage();
  attachBrowserDiagnostics(page, diagnosticLabel, diagnostics);
  await page.goto(candidateUrl(arena, profile, seed, multiplayer), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(({ expectedArena, expectedProfile, expectedRenderer }) => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready'
      && state.weaponReady === true
      && state.arenaSelection.id === expectedArena
      && state.render.profile === expectedProfile
      && state.render.runtime.actualBackend === expectedRenderer
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false;
  }, { expectedArena: arena, expectedProfile: profile, expectedRenderer: renderer }, {
    timeout: renderer === 'webgpu' ? 120_000 : 60_000,
  });
  return page;
}

async function presentedFrame(page: Page): Promise<number> {
  return page.evaluate(() => Number(window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame));
}

async function waitForPresentedFrames(page: Page, before: number, minimumDelta = 2): Promise<number> {
  await page.waitForFunction(({ start, delta }) => (
    window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame >= start + delta
  ), { start: before, delta: minimumDelta }, { timeout: 10_000 });
  const after = await presentedFrame(page);
  expect(after - before).toBeGreaterThanOrEqual(minimumDelta);
  return after - before;
}

async function discoverContactCandidates(page: Page): Promise<ContactCandidate[]> {
  return page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const state = api.snapshot();
    const bounds = state.arenaSelection.bounds as { minX: number; maxX: number; minZ: number; maxZ: number };
    const position = state.player.position as [number, number, number];
    const values = [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, ...position];
    if (!values.every(Number.isFinite) || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ) {
      throw new Error(`Invalid live contact-discovery bounds ${JSON.stringify({ bounds, position })}`);
    }
    const margin = 0.75;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const step = Math.max(0.8, Math.min(1.4, Math.min(width, depth) / 28));
    const points: Array<{ x: number; z: number; distance: number }> = [];
    for (let x = bounds.minX + margin; x <= bounds.maxX - margin; x += step) {
      for (let z = bounds.minZ + margin; z <= bounds.maxZ - margin; z += step) {
        points.push({ x, z, distance: Math.hypot(x - position[0], z - position[2]) });
      }
    }
    points.sort((left, right) => left.distance - right.distance || left.x - right.x || left.z - right.z);
    const directions = Array.from({ length: 16 }, (_, index) => {
      const angle = index * Math.PI / 8;
      return [Math.sin(angle), -Math.cos(angle)] as const;
    });
    const wallDistances = [0.72, 0.86, 1, 1.14] as const;
    const candidates: ContactCandidate[] = [];
    const probeY = position[1] - 1.05;
    const upperProbeY = position[1] - 0.3;
    for (const point of points) {
      if (candidates.length >= 48) break;
      if (api.collisionProbeAt(point.x, position[1], point.z)
        || api.collisionProbeAt(point.x, probeY, point.z)) continue;
      for (const [dx, dz] of directions) {
        if (api.collisionProbeAt(point.x + dx * 0.25, probeY, point.z + dz * 0.25)) continue;
        const wallDistance = wallDistances.find((distance) => (
          api.collisionProbeAt(point.x + dx * distance, probeY, point.z + dz * distance)
          && api.collisionProbeAt(point.x + dx * distance, upperProbeY, point.z + dz * distance)
        ));
        if (wallDistance === undefined) continue;
        candidates.push({
          x: point.x,
          y: position[1] + 0.25,
          z: point.z,
          yaw: Math.atan2(-dx, -dz),
          direction: [dx, dz],
          wallDistance,
          bounds: { ...bounds },
        });
        break;
      }
    }
    return candidates;
  });
}

async function stageDynamicContact(page: Page, preferredOffset = 0): Promise<ContactFixture> {
  const candidates = await discoverContactCandidates(page);
  if (candidates.length === 0) throw new Error('No bounds-derived contact candidates passed collisionProbeAt');
  const indexedCandidates = candidates.map((candidate, originalIndex) => ({ candidate, originalIndex }));
  const offset = Math.min(preferredOffset, indexedCandidates.length);
  const attempts = [...indexedCandidates.slice(offset), ...indexedCandidates.slice(0, offset)].slice(0, 16);
  const rejected: Array<Record<string, unknown>> = [];
  for (let index = 0; index < attempts.length; index += 1) {
    const { candidate, originalIndex } = attempts[index];
    await page.evaluate((fixture) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setAds(false);
      api.setReloadCaptureProgress(null);
      api.setMeleeCaptureProgress(null);
      api.setFireCaptureAgeMs(null);
      api.teleportPlayer(fixture.x, fixture.y, fixture.z, fixture.yaw, 0);
      api.setStance('stand');
    }, candidate);
    await page.waitForTimeout(450);
    const settleBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position as [number, number, number]);
    await page.waitForTimeout(220);
    const settleAfter = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position as [number, number, number]);
    const settledDeltaY = Math.abs(settleAfter[1] - settleBefore[1]);
    const probe = await page.evaluate(({ fixture, actual }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const [dx, dz] = fixture.direction;
      const wallY = actual[1] - 1.05;
      const withinBounds = actual[0] >= fixture.bounds.minX && actual[0] <= fixture.bounds.maxX
        && actual[2] >= fixture.bounds.minZ && actual[2] <= fixture.bounds.maxZ;
      return {
        withinBounds,
        wallProbeBlocked: api.collisionProbeAt(
          actual[0] + dx * fixture.wallDistance, wallY, actual[2] + dz * fixture.wallDistance,
        ),
        bodyProbeClear: !api.collisionProbeAt(actual[0], wallY, actual[2]),
      };
    }, { fixture: candidate, actual: settleAfter });
    if (settledDeltaY > 0.035 || !probe.withinBounds || !probe.wallProbeBlocked || !probe.bodyProbeClear) {
      rejected.push({ index, settledDeltaY, ...probe });
      continue;
    }
    const before = await presentedFrame(page);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
    try {
      await page.waitForFunction(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return state.player.stance === 'prone'
          && state.weaponPresentation.surfaceRetreat > 0.25
          && state.weaponPresentation.surfaceLift >= 0.13;
      }, undefined, { timeout: 2_500 });
      await waitForPresentedFrames(page, before, 3);
      const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
      const fixture: ContactFixture = {
        ...candidate,
        acceptedCandidate: originalIndex,
        settledPosition: state.player.position as [number, number, number],
        wallProbeBlocked: probe.wallProbeBlocked,
        bodyProbeClear: probe.bodyProbeClear,
        settledDeltaY,
        surfaceRetreat: state.weaponPresentation.surfaceRetreat,
        surfaceLift: state.weaponPresentation.surfaceLift,
      };
      return fixture;
    } catch {
      const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
      rejected.push({
        index, settledDeltaY, stance: state.player.stance,
        surfaceRetreat: state.weaponPresentation.surfaceRetreat,
        surfaceLift: state.weaponPresentation.surfaceLift,
      });
    }
  }
  throw new Error(`No live contact fixture produced grounded prone wall/floor telemetry: ${JSON.stringify(rejected)}`);
}

function assertFiniteArray(value: unknown, label: string): void {
  expect(Array.isArray(value), `${label}: array`).toBe(true);
  expect((value as unknown[]).length, `${label}: populated`).toBeGreaterThan(0);
  expect((value as unknown[]).every((entry) => typeof entry === 'number' && Number.isFinite(entry)), `${label}: finite`).toBe(true);
}

function assertFraming(value: any, label: string): void {
  expect(value, `${label}: framing telemetry`).not.toBeNull();
  expect(value, `${label}: finite near-plane-clear visible bounds`).toMatchObject({
    finite: true, nearPlaneClear: true, intersectsViewport: true,
  });
  expect(Number.isFinite(value.nearestDepth) && value.nearestDepth > 0, `${label}: positive depth`).toBe(true);
  assertFiniteArray(value.ndcMin, `${label}: ndcMin`);
  assertFiniteArray(value.ndcMax, `${label}: ndcMax`);
}

function assertPronePresentation(state: any, label: string, action: 'hip' | 'ads' | 'reload' | 'melee', knife = false): void {
  expect(state.player.stance, `${label}: canonical local stance`).toBe('prone');
  expect(state.weaponPresentation.surfaceRetreat, `${label}: real wall retreat`).toBeGreaterThan(0.25);
  expect(state.weaponPresentation.surfaceRetreat, `${label}: bounded wall retreat`).toBeLessThanOrEqual(0.7);
  expect(state.weaponPresentation.surfaceLift, `${label}: real prone floor lift`).toBeGreaterThanOrEqual(0.13);
  expect(state.weaponPresentation.surfaceLift, `${label}: bounded prone floor lift`).toBeLessThanOrEqual(0.2);
  expect(state.weaponPresentation.actionContract.state, `${label}: action owner`).toBe(action);
  assertFraming(state.weaponPresentation.armFraming, `${label}: arms`);
  if (knife) assertFraming(state.weaponPresentation.meleeKnifeFraming, `${label}: knife`);
  else assertFraming(state.weaponPresentation.weaponFraming, `${label}: weapon`);
}

async function proveSoloActions(page: Page, label: string): Promise<Record<string, number>> {
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('m4a1'));
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.weaponPresentation.weapon === 'm4a1'
      && state.weaponPresentation.importedModel?.weapon === 'm4a1';
  }, undefined, { timeout: 30_000 });
  const frameDeltas: Record<string, number> = {};

  let before = await presentedFrame(page);
  frameDeltas.hip = await waitForPresentedFrames(page, before);
  let state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  assertPronePresentation(state, `${label}/hip`, 'hip');

  before = await presentedFrame(page);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponPresentation.adsProgress > 0.98);
  frameDeltas.ads = await waitForPresentedFrames(page, before);
  state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  assertPronePresentation(state, `${label}/ads`, 'ads');

  before = await presentedFrame(page);
  const shotsBefore = state.weaponPresentation.shotsPresented;
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setAds(false);
    api.setAmmo('m4a1', 20, 80);
    api.fireOnce();
    api.setFireCaptureAgeMs(24);
  });
  await page.waitForFunction((expectedShots) => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponPresentation;
    return presentation.adsProgress < 0.02
      && presentation.shotsPresented > expectedShots
      && presentation.fireCycle.kick > 0;
  }, shotsBefore);
  frameDeltas.fire = await waitForPresentedFrames(page, before);
  state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  assertPronePresentation(state, `${label}/fire`, 'hip');

  before = await presentedFrame(page);
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setFireCaptureAgeMs(null);
    api.setAmmo('m4a1', 8, 80);
    api.reload();
    api.setReloadCaptureProgress(0.45);
  });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.player.reloading && state.weaponPresentation.actionContract.state === 'reload';
  });
  frameDeltas.reload = await waitForPresentedFrames(page, before);
  state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  assertPronePresentation(state, `${label}/reload`, 'reload');

  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setReloadCaptureProgress(null));
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.reloading === false, undefined, { timeout: 6_000 });
  before = await presentedFrame(page);
  const accepted = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const outcome = api.melee();
    api.setMeleeCaptureProgress(0.42);
    return outcome.accepted;
  });
  expect(accepted, `${label}/melee: accepted`).toBe(true);
  await page.waitForFunction(() => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponPresentation;
    return presentation.actionContract.state === 'melee'
      && presentation.meleeArmSource === 'authored-rigged-arms'
      && presentation.knifeVisible === true;
  });
  frameDeltas.melee = await waitForPresentedFrames(page, before);
  state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  assertPronePresentation(state, `${label}/melee`, 'melee', true);
  expect(state.weaponPresentation.authoredMeleeGripError, `${label}/melee: authored grip`).toBeLessThanOrEqual(0.001);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMeleeCaptureProgress(null));
  return frameDeltas;
}

function conciseFixture(fixture: ContactFixture): Record<string, unknown> {
  return {
    acceptedCandidate: fixture.acceptedCandidate,
    settledPosition: fixture.settledPosition.map((value) => Number(value.toFixed(3))),
    yaw: Number(fixture.yaw.toFixed(4)),
    wallDistance: fixture.wallDistance,
    wallProbeBlocked: fixture.wallProbeBlocked,
    bodyProbeClear: fixture.bodyProbeClear,
    settledDeltaY: Number(fixture.settledDeltaY.toFixed(4)),
    surfaceRetreat: Number(fixture.surfaceRetreat.toFixed(4)),
    surfaceLift: Number(fixture.surfaceLift.toFixed(4)),
  };
}

async function startMultiplayerMatch(
  host: Page,
  guest: Page,
  arena: ArenaId,
  profile: RenderProfile,
): Promise<{ hostId: string; guestId: string }> {
  const hostLabel = `PH-${arena.slice(0, 8)}-${profile.slice(0, 4)}`;
  const guestLabel = `PG-${arena.slice(0, 8)}-${profile.slice(0, 4)}`;
  await host.locator('#player-name').fill(hostLabel);
  await guest.locator('#player-name').fill(guestLabel);
  await host.locator('#team').selectOption('0');
  await guest.locator('#team').selectOption('1');
  await host.locator('#host').click();
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.locator('#room-code').textContent())?.trim() ?? '';
  expect(roomCode).not.toBe('');
  await guest.locator('#room-input').fill(roomCode);
  await guest.locator('#join').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
  ), undefined, { timeout: 30_000 })));
  const identities = await host.evaluate(({ hostName, guestName }) => {
    const members = window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members;
    return {
      hostId: members.find((member: any) => member.name === hostName)?.id ?? '',
      guestId: members.find((member: any) => member.name === guestName)?.id ?? '',
      memberNames: members.map((member: any) => member.name),
    };
  }, { hostName: hostLabel, guestName: guestLabel });
  expect(identities.hostId, `host member found by name (members: ${JSON.stringify(identities.memberNames)})`).toMatch(/^p-/u);
  expect(identities.guestId).toMatch(/^p-/u);
  expect(identities.hostId).not.toBe(identities.guestId);
  await host.locator('#lobby-ready').click();
  await guest.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(({ expectedArena, expectedProfile }) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active'
      && state.arenaSelection.id === expectedArena
      && state.render.profile === expectedProfile
      && state.remotePlayers.length === 1
      && state.remotePlayers[0].operatorModel !== null;
  }, { expectedArena: arena, expectedProfile: profile }, { timeout: renderer === 'webgpu' ? 150_000 : 75_000 })));
  return identities;
}

function remoteProneSummary(remote: any, expectedId: string, label: string): Record<string, unknown> {
  expect(remote.id, `${label}: canonical identity`).toBe(expectedId);
  expect(remote.stance, `${label}: network stance`).toBe('prone');
  const operator = remote.operatorModel;
  expect(operator, `${label}: authored operator`).not.toBeNull();
  expect(operator, `${label}: canonical rig`).toMatchObject({
    source: 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative',
    materialContract: 'opaque-embedded-pbr-depth-writing',
    visibleEmbeddedWeapons: 0,
    weaponChildren: 1,
    armBonesPresent: 6,
    animationContract: {
      stance: 'prone', mixerBeforeSupportIk: true,
    },
    weaponMount: {
      directChild: true, finite: true, forwardCorrection: 'stable-body-mount-minus-z',
    },
    supportGrip: {
      finite: true, torsoClear: true, bothHandsConnected: true,
      dominantGrip: { finite: true, torsoClear: true },
    },
  });
  expect(operator.animationContract.proneBlend, `${label}: authored prone blend`).toBeGreaterThan(0.98);
  expect(operator.animationContract.pivotHeight, `${label}: prone pivot height`).toBeGreaterThan(0.35);
  expect(operator.animationContract.pivotHeight, `${label}: prone pivot height`).toBeLessThan(0.55);
  expect(operator.animationContract.pivotPitch, `${label}: prone pivot pitch`).toBeLessThan(-1.3);
  expect(operator.muzzleForwardDot, `${label}: mounted weapon forward`).toBeGreaterThan(0.82);
  expect(operator.supportGrip.supportError, `${label}: support hand mount`).toBeLessThanOrEqual(0.025);
  assertFiniteArray(operator.weaponSocketWorld, `${label}: weapon socket`);
  assertFiniteArray(operator.weaponSocketQuaternion, `${label}: weapon socket quaternion`);
  assertFiniteArray(operator.weaponMount.localPosition, `${label}: weapon mount position`);
  assertFiniteArray(operator.weaponMount.localQuaternion, `${label}: weapon mount quaternion`);
  assertFiniteArray(operator.weaponMount.localScale, `${label}: weapon mount scale`);
  assertFiniteArray(operator.weaponBounds.center, `${label}: weapon bounds centre`);
  assertFiniteArray(operator.weaponBounds.size, `${label}: weapon bounds size`);
  expect(Number.isFinite(operator.weaponBounds.distanceFromSocket), `${label}: mount distance`).toBe(true);
  return {
    stance: remote.stance,
    activeClip: operator.activeClip,
    proneBlend: Number(operator.animationContract.proneBlend.toFixed(4)),
    pivotHeight: Number(operator.animationContract.pivotHeight.toFixed(4)),
    pivotPitch: Number(operator.animationContract.pivotPitch.toFixed(4)),
    mountFinite: operator.weaponMount.finite,
    supportGripError: Number(operator.supportGrip.supportError.toFixed(4)),
  };
}

test('keeps prone hip, ADS, fire, reload and melee viewmodels clear at live contact on every arena and render profile', async ({ browser, browserName }) => {
  test.skip(!enabled, 'Run the explicit clean-SHA Pass 66 prone contact matrix command.');
  test.skip(browserName !== 'chromium', 'The release matrix runs in the installed Chromium-family browser.');
  test.setTimeout(renderer === 'webgpu' ? 2_400_000 : 1_500_000);
  for (const profile of PROFILES) for (const arena of ARENAS) {
    const label = caseLabel(arena, profile);
    const context = await browser.newContext({ viewport: { width: 1_920, height: 1_080 }, deviceScaleFactor: 1 });
    const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
    try {
      await clearRuntimeLog(context);
      const page = await openCandidate(
        context, arena, profile, `pass66-prone-solo-${arena}-${profile}`,
        diagnostics, `${label}/solo`, false,
      );
      await page.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        api.startSolo();
        api.setBotsFrozen(true);
        api.setMovement(false);
      });
      await page.waitForFunction(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return state.gameStarted && state.matchPhase === 'active'
          && window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame > 0;
      }, undefined, { timeout: renderer === 'webgpu' ? 150_000 : 75_000 });
      const fixture = await stageDynamicContact(page);
      const frameDeltas = await proveSoloActions(page, label);
      expect(diagnostics.pageErrors, `${label}: page errors`).toEqual([]);
      expect(diagnostics.consoleErrors, `${label}: console errors`).toEqual([]);
      const runtimeLog = await readPersistedClientRuntimeLog(page);
      expect(runtimeLog, `${label}: persisted client runtime faults`).toEqual([]);
      soloRows.push({ arena, profile, fixture: conciseFixture(fixture), presentedFrameDeltas: frameDeltas });
    } finally {
      await context.close();
    }
  }
  expect(soloRows).toHaveLength(EXPECTED_CELLS);
  soloComplete = true;
});

test('replicates both peers canonical prone stance and finite authored operator mounts on every multiplayer arena/profile cell', async ({ browser, browserName }) => {
  test.skip(!enabled, 'Run the explicit clean-SHA Pass 66 prone contact matrix command.');
  test.skip(browserName !== 'chromium', 'The release matrix runs in the installed Chromium-family browser.');
  test.setTimeout(renderer === 'webgpu' ? 3_000_000 : 2_100_000);
  if (!peerServer) throw new Error('Owned PeerJS server is not ready');
  for (const profile of PROFILES) for (const arena of ARENAS) {
    const label = caseLabel(arena, profile);
    const hostContext = await browser.newContext({ viewport: { width: 1_920, height: 1_080 }, deviceScaleFactor: 1 });
    const guestContext = await browser.newContext({ viewport: { width: 1_920, height: 1_080 }, deviceScaleFactor: 1 });
    const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
    try {
      await Promise.all([clearRuntimeLog(hostContext), clearRuntimeLog(guestContext)]);
      const [host, guest] = await Promise.all([
        openCandidate(hostContext, arena, profile, `pass66-prone-host-${arena}-${profile}`, diagnostics, `${label}/host`, true),
        openCandidate(guestContext, arena, profile, `pass66-prone-guest-${arena}-${profile}`, diagnostics, `${label}/guest`, true),
      ]);
      const { hostId, guestId } = await startMultiplayerMatch(host, guest, arena, profile);
      const [hostFixture, guestFixture] = await Promise.all([
        stageDynamicContact(host, 0),
        stageDynamicContact(guest, 3),
      ]);
      const [hostFrame, guestFrame] = await Promise.all([presentedFrame(host), presentedFrame(guest)]);
      await Promise.all([
        waitForPresentedFrames(host, hostFrame, 3),
        waitForPresentedFrames(guest, guestFrame, 3),
        host.waitForFunction((expectedId) => {
          const remote = window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
            .find((candidate: any) => candidate.id === expectedId);
          return remote?.stance === 'prone'
            && remote.operatorModel?.animationContract?.stance === 'prone'
            && remote.operatorModel.animationContract.proneBlend > 0.98
            && remote.operatorModel.weaponMount?.finite === true;
        }, guestId, { timeout: 20_000 }),
        guest.waitForFunction((expectedId) => {
          const remote = window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
            .find((candidate: any) => candidate.id === expectedId);
          return remote?.stance === 'prone'
            && remote.operatorModel?.animationContract?.stance === 'prone'
            && remote.operatorModel.animationContract.proneBlend > 0.98
            && remote.operatorModel.weaponMount?.finite === true;
        }, hostId, { timeout: 20_000 }),
      ]);
      const [hostState, guestState] = await Promise.all([
        host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot()),
        guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot()),
      ]);
      assertPronePresentation(hostState, `${label}/host-local`, 'hip');
      assertPronePresentation(guestState, `${label}/guest-local`, 'hip');
      const hostSawGuest = remoteProneSummary(
        hostState.remotePlayers.find((remote: any) => remote.id === guestId), guestId, `${label}/host-saw-guest`,
      );
      const guestSawHost = remoteProneSummary(
        guestState.remotePlayers.find((remote: any) => remote.id === hostId), hostId, `${label}/guest-saw-host`,
      );
      expect(diagnostics.pageErrors, `${label}: page errors`).toEqual([]);
      expect(diagnostics.consoleErrors, `${label}: console errors`).toEqual([]);
      const [hostLog, guestLog] = await Promise.all([
        readPersistedClientRuntimeLog(host), readPersistedClientRuntimeLog(guest),
      ]);
      expect(hostLog, `${label}: host persisted runtime faults`).toEqual([]);
      expect(guestLog, `${label}: guest persisted runtime faults`).toEqual([]);
      multiplayerRows.push({
        arena, profile,
        hostFixture: conciseFixture(hostFixture), guestFixture: conciseFixture(guestFixture),
        hostSawGuest, guestSawHost,
      });
    } finally {
      await Promise.allSettled([hostContext.close(), guestContext.close()]);
    }
  }
  expect(multiplayerRows).toHaveLength(EXPECTED_CELLS);
  multiplayerComplete = true;
});
