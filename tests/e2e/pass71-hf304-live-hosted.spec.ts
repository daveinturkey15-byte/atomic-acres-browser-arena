import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { WEAPON_CATALOG } from '../../src/combat/weapon-catalog';
import {
  PASS71_HF304_LIVE_HOSTED_ARENAS,
  PASS71_HF304_LIVE_HOSTED_FIRE_KINDS,
  PASS71_HF304_LIVE_HOSTED_MAX_VISUAL_BYTES,
  PASS71_HF304_LIVE_HOSTED_PANES,
  PASS71_HF304_LIVE_HOSTED_SCOPES,
  PASS71_HF304_LIVE_HOSTED_VISUAL_HEIGHT,
  PASS71_HF304_LIVE_HOSTED_VISUAL_WIDTH,
  PASS71_HF304_LIVE_HOSTED_WEAPONS,
  canonicalJson,
} from '../../scripts/qa/pass71-hf304-live-hosted-evidence-contract.mjs';
import {
  attachBrowserDiagnostics,
  readPersistedClientRuntimeLog,
  startOwnedPeerServer,
  type BrowserDiagnostics,
  type OwnedPeerServer,
} from './pass66-e2e-support';

type ArenaId = 'atomic-acres' | 'skyline-terminal';
type EvidenceMode = 'solo' | 'hosted';
type EvidenceRole = 'offline' | 'host' | 'guest';
type Scope = typeof PASS71_HF304_LIVE_HOSTED_SCOPES[number];
type PaneEvidence = Readonly<Record<string, any>>;
type DebrisSnapshot = Readonly<{
  debris: any[];
  panes: any[];
  pool: any;
  rapierMajorBodies: number;
}>;

const enabled = process.env.PASS71_HF304_LIVE_HOSTED === '1';
const expectedSourceSha = process.env.PASS71_HF304_LIVE_HOSTED_EXPECTED_SOURCE_SHA ?? '';
const componentPath = process.env.PASS71_HF304_LIVE_HOSTED_COMPONENT_PATH
  ? resolve(process.env.PASS71_HF304_LIVE_HOSTED_COMPONENT_PATH)
  : '';
const peerPort = Number(process.env.PASS71_HF304_LIVE_HOSTED_PEER_PORT ?? '4604');
const requestedScopeId = process.env.PASS71_HF304_LIVE_HOSTED_SCOPE_ID ?? '';
const selectedScope = PASS71_HF304_LIVE_HOSTED_SCOPES.find(({ id }) => id === requestedScopeId);
const checkoutSourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8', windowsHide: true,
}).trim();

if (enabled && (!selectedScope || !/^[a-f0-9]{40}$/u.test(expectedSourceSha)
  || checkoutSourceSha !== expectedSourceSha || componentPath === ''
  || !Number.isSafeInteger(peerPort) || peerPort < 1_024 || peerPort > 65_535)) {
  throw new Error('HF-304 live hosted evidence requires one exact source-bound scope/component/PeerJS owner');
}
const scope: Scope = selectedScope ?? PASS71_HF304_LIVE_HOSTED_SCOPES[0]!;
const rpmByWeapon = new Map(WEAPON_CATALOG.map((weapon) => [weapon.id, weapon.rpm]));
const panesByArena = new Map(PASS71_HF304_LIVE_HOSTED_ARENAS
  .filter((arena) => arena.paneIds.length > 0)
  .map((arena) => [arena.id as ArenaId, arena.paneIds]));
const root = resolve(process.cwd());
let nonce = 304_000_000 + Math.max(0, PASS71_HF304_LIVE_HOSTED_SCOPES.indexOf(scope)) * 1_000_000;

test.use({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
test.describe.configure({ mode: 'serial' });
test.skip(!enabled, 'HF-304 closing evidence is emitted only by its clean exact-SHA installed-Edge owner');

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function digest(value: unknown): string {
  return sha256(Buffer.from(`${canonicalJson(value)}\n`, 'utf8'));
}

function nextNonces(): Readonly<{ actionNonce: number; windowEventNonce: number }> {
  const actionNonce = nonce;
  nonce += 2;
  return { actionNonce, windowEventNonce: actionNonce + 1 };
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function candidateUrl(arena: ArenaId, peer?: OwnedPeerServer): string {
  const url = new URL('/', test.info().project.use.baseURL as string);
  const values = {
    release: 'latest', map: arena, renderer: scope.renderer, render: scope.requestedProfile,
    signal: 'off', grass: 'off', mist: 'off', clouds: 'off', rays: 'off',
    externalServices: 'off', multiplayerQa: '1',
    requireWebGPU: scope.renderer === 'webgpu' ? '1' : '0',
    seed: `pass71-hf304-live-${scope.id.replace('/', '-')}-${arena}`,
    ...(peer ? { peerQaPort: String(peer.port), peerQaPath: peer.path } : {}),
  };
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return url.toString();
}

async function openCandidate(
  context: BrowserContext,
  arena: ArenaId,
  diagnostics: BrowserDiagnostics,
  label: string,
  peer?: OwnedPeerServer,
): Promise<Page> {
  const page = await context.newPage();
  attachBrowserDiagnostics(page, label, diagnostics);
  await page.goto(candidateUrl(arena, peer), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(({ expectedArena, renderer, profile }) => {
    const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot?.bootstrap?.stage === 'ready' && snapshot.weaponReady === true
      && snapshot.arenaSelection.id === expectedArena
      && snapshot.render.runtime.initialized === true
      && snapshot.render.runtime.actualBackend === renderer
      && snapshot.render.profile === profile
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false;
  }, { expectedArena: arena, renderer: scope.renderer, profile: scope.actualProfile }, { timeout: 120_000 });
  return page;
}

async function candidateProvenance(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const response = await fetch(new URL('channel-provenance.json', window.location.href), {
      cache: 'no-store', credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`HF-304 candidate provenance returned HTTP ${response.status}`);
    const value = await response.json() as Record<string, unknown>;
    return Object.fromEntries([
      'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
    ].map((key) => [key, value[key]]));
  });
}

async function runtimeIdentity(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const runtime = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().render.runtime;
    return {
      requestedBackend: runtime.requestedBackend,
      actualBackend: runtime.actualBackend,
      initialized: runtime.initialized,
      adapterClass: runtime.adapterClass,
      deviceClass: runtime.deviceClass,
      adapterLabel: runtime.adapterLabel,
      softwareAdapter: runtime.softwareAdapter,
      deviceLost: runtime.deviceLost,
      uncapturedErrors: runtime.uncapturedErrors,
      presentationStatus: runtime.presentation.status,
    };
  });
}

async function startSolo(page: Page, arena: ArenaId): Promise<void> {
  await page.locator('#player-name').fill(`HF304 Solo ${arena}`);
  await page.locator('#solo').click();
  await page.waitForFunction(() => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    return api?.admissionState().matchPhase === 'active'
      && api.admissionState().presentedGameplayFrame > 2;
  }, undefined, { timeout: 90_000 });
  await page.evaluate(() => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setMovement(false);
  });
}

async function startHosted(host: Page, guest: Page, arena: ArenaId): Promise<string> {
  await host.locator('#player-name').fill(`HF304 Host ${arena}`);
  await guest.locator('#player-name').fill(`HF304 Guest ${arena}`);
  await host.locator('#team').selectOption('0');
  await guest.locator('#team').selectOption('1');
  await host.locator('#host').click();
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.locator('#room-code').textContent())?.trim() ?? '';
  expect(roomCode).not.toBe('');
  await guest.locator('#room-input').fill(roomCode);
  await guest.locator('#join').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
  ), undefined, { timeout: 45_000 })));
  await host.locator('#lobby-ready').click();
  await guest.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted === true && state.matchPhase === 'active'
      && state.remotePlayers.length === 1 && state.remotePlayers[0].operatorModel !== null;
  }, undefined, { timeout: 90_000 })));
  await Promise.all([host, guest].map((page) => page.evaluate(() => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setMovement(false);
  })));
  return roomCode;
}

async function frames(page: Page, count = 3): Promise<void> {
  await page.evaluate(async (frameCount) => {
    for (let index = 0; index < frameCount; index += 1) {
      await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
    }
  }, count);
}

function makeCell(
  mode: EvidenceMode,
  arenaId: ArenaId,
  paneId: string,
  paneIndex: number,
  weaponId: string,
  prepared: any,
  authored: any,
  guest: any | null,
  guestObservedHostPosition: number[] | null,
  peer: OwnedPeerServer,
): Record<string, unknown> {
  const projectile = weaponId === 'flare-gun' || weaponId === 'explosive-crossbow';
  const hostAfter = authored.after as PaneEvidence;
  const guestAfter = guest?.pane as PaneEvidence | undefined;
  return {
    id: `${scope.id}/${mode}/${arenaId}/${paneId}/${weaponId}`,
    scopeId: scope.id, mode, arenaId, paneId, paneIndex, weaponId,
    fireKind: authored.fireKind,
    policy: authored.policy,
    actor: {
      role: mode === 'solo' ? 'offline' : 'host',
      actorId: authored.actorId,
      hostId: mode === 'solo' ? null : authored.hostId,
      guestId: mode === 'solo' ? null : guest.localPlayerId,
      matchEpoch: authored.matchEpoch,
      actionNonce: authored.action.nonce,
      windowEventNonce: authored.windowEvent.nonce,
    },
    spatial: {
      playerPosition: prepared.playerPosition,
      cameraDirection: prepared.cameraDirection,
      actionOrigin: authored.action.origin,
      actionDirection: authored.action.direction,
      guestObservedHostPosition,
    },
    authority: {
      accepted: authored.accepted,
      hostBefore: authored.before,
      hostAfter,
      hostColliderRetired: hostAfter.activeWorldColliderPresent === false,
      guestActionIdentity: mode === 'solo' ? null : {
        by: guest.action?.by,
        weapon: guest.action?.weapon,
        nonce: guest.action?.nonce,
        matchEpoch: guest.action?.matchEpoch,
        paneAdmitted: guest.action?.paneAdmitted,
      },
      guestWindowEventIdentity: mode === 'solo' ? null : {
        nonce: guest.windowEvent?.nonce,
        processed: guest.windowEvent?.processed,
      },
      guestAfter: mode === 'solo' ? null : guestAfter,
      localMutationTicks: mode === 'solo' ? null : {
        host: hostAfter.state.lastMutationTick,
        guest: guestAfter!.state.lastMutationTick,
      },
    },
    protocol: mode === 'solo' ? null : {
      protocolVersion: 20,
      ownedPeer: { host: '127.0.0.1', port: peer.port, path: peer.path, localOnly: true },
      hostNetworkRole: authored.networkRole,
      guestNetworkRole: guest.networkRole,
      action: {
        by: authored.action.by, weapon: authored.action.weapon, nonce: authored.action.nonce,
        decoded: authored.action.decodedByProtocol, guestLedgerCurrent: guest.action?.nonce === authored.action.nonce,
      },
      windowEvent: {
        by: authored.windowEvent.by, nonce: authored.windowEvent.nonce, kind: authored.windowEvent.kind,
        wireWeapon: authored.windowEvent.wireWeapon,
        actionNonce: authored.windowEvent.actionNonce,
        hostAuthorityId: authored.windowEvent.hostAuthorityId,
        decoded: authored.windowEvent.decodedByProtocol,
        guestProcessed: guest.windowEvent?.processed === true,
      },
    },
  };
}

async function runSoloCells(page: Page, arena: ArenaId, peer: OwnedPeerServer): Promise<{
  cells: Record<string, unknown>[];
  actorId: string;
}> {
  const cells: Record<string, unknown>[] = [];
  let actorId = '';
  const paneIds = panesByArena.get(arena)!;
  for (const [paneIndex, paneId] of paneIds.entries()) for (const weaponId of PASS71_HF304_LIVE_HOSTED_WEAPONS) {
    const prepared = await page.evaluate(({ weapon, index }) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.prepareHf304GlassEvidenceCell(weapon, index)
    ), { weapon: weaponId, index: paneIndex });
    expect(prepared, `${arena}/${paneId}/${weaponId}: solo prepare`).not.toBeNull();
    const nonces = nextNonces();
    const authored = await page.evaluate(({ weapon, index, actionNonce, windowEventNonce }) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.authorHf304GlassEvidenceCell(
        weapon, index, actionNonce, windowEventNonce,
      )
    ), { weapon: weaponId, index: paneIndex, ...nonces });
    expect(authored, `${arena}/${paneId}/${weaponId}: solo authority`).not.toBeNull();
    actorId ||= authored.actorId;
    cells.push(makeCell('solo', arena, paneId, paneIndex, weaponId, prepared, authored, null, null, peer));
  }
  return { cells, actorId };
}

class HostedCadence {
  private sentAt = -10_000;

  async before(page: Page, weaponId: string): Promise<void> {
    const rpm = rpmByWeapon.get(weaponId);
    if (!rpm) throw new Error(`HF-304 has no authored cadence for ${weaponId}`);
    const requiredMs = 60_000 / rpm + 40;
    const waitMs = requiredMs - (Date.now() - this.sentAt);
    if (waitMs > 0) await page.waitForTimeout(waitMs);
  }

  sent(): void { this.sentAt = Date.now(); }
}

async function waitForGuestHostState(
  guest: Page,
  hostId: string,
  weaponId: string,
  expectedPosition: number[],
): Promise<number[]> {
  await guest.waitForFunction(({ expectedHost, weapon, position }) => {
    const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
      .find((entry: any) => entry.id === expectedHost);
    return remote?.weapon === weapon && remote.authoritativePosition.every(
      (value: number, index: number) => Math.abs(value - position[index]) <= 0.05,
    );
  }, { expectedHost: hostId, weapon: weaponId, position: expectedPosition }, { timeout: 8_000 });
  return guest.evaluate((expectedHost) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
      .find((entry: any) => entry.id === expectedHost).authoritativePosition
  ), hostId);
}

async function waitForGuestGlass(
  guest: Page,
  paneId: string,
  actionNonce: number,
  windowEventNonce: number,
): Promise<any> {
  await guest.waitForFunction(({ pane, action, event }) => {
    const sample = (window as any).__ATOMIC_ACRES_DEBUG__
      .sampleHf304GlassEvidenceCell(pane, action, event);
    return sample?.action?.nonce === action && sample.windowEvent.processed === true
      && sample.pane.projection.apertureOpen === true
      && sample.pane.activeWorldColliderPresent === false;
  }, { pane: paneId, action: actionNonce, event: windowEventNonce }, { timeout: 8_000 });
  return guest.evaluate(({ pane, action, event }) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.sampleHf304GlassEvidenceCell(pane, action, event)
  ), { pane: paneId, action: actionNonce, event: windowEventNonce });
}

async function runHostedCells(
  host: Page,
  guest: Page,
  arena: ArenaId,
  peer: OwnedPeerServer,
  cadence: HostedCadence,
): Promise<{
  cells: Record<string, unknown>[];
  hostId: string;
  guestId: string;
}> {
  const cells: Record<string, unknown>[] = [];
  let hostId = '';
  let guestId = '';
  const paneIds = panesByArena.get(arena)!;
  for (const [paneIndex, paneId] of paneIds.entries()) for (const weaponId of PASS71_HF304_LIVE_HOSTED_WEAPONS) {
    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.resetBreakableWindows());
    const prepared = await host.evaluate(({ weapon, index }) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.prepareHf304GlassEvidenceCell(weapon, index)
    ), { weapon: weaponId, index: paneIndex });
    expect(prepared, `${arena}/${paneId}/${weaponId}: hosted prepare`).not.toBeNull();
    hostId ||= prepared.hostId;
    const observedPosition = await waitForGuestHostState(
      guest, prepared.hostId, weaponId, prepared.playerPosition,
    );
    await cadence.before(host, weaponId);
    const nonces = nextNonces();
    const authored = await host.evaluate(({ weapon, index, actionNonce, windowEventNonce }) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.authorHf304GlassEvidenceCell(
        weapon, index, actionNonce, windowEventNonce,
      )
    ), { weapon: weaponId, index: paneIndex, ...nonces });
    cadence.sent();
    expect(authored, `${arena}/${paneId}/${weaponId}: hosted authority`).not.toBeNull();
    const guestSample = await waitForGuestGlass(guest, paneId, nonces.actionNonce, nonces.windowEventNonce);
    guestId ||= guestSample.localPlayerId;
    cells.push(makeCell(
      'hosted', arena, paneId, paneIndex, weaponId,
      prepared, authored, guestSample, observedPosition, peer,
    ));
  }
  return { cells, hostId, guestId };
}

async function debrisSnapshot(page: Page): Promise<DebrisSnapshot> {
  return page.evaluate(() => {
    const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      debris: snapshot.persistentWindowDebris,
      panes: snapshot.breakableWindows,
      pool: snapshot.windowGlassDebrisPool,
      rapierMajorBodies: snapshot.interactiveWorld.rapierMajorBodies,
    };
  });
}

function debrisFor(snapshot: DebrisSnapshot, paneId: string): any | null {
  return snapshot.debris.find((entry) => entry.windowId === paneId) ?? null;
}

function lifecycleSample(phase: string, entry: any | null): Record<string, unknown> {
  return {
    phase,
    present: entry !== null,
    visible: entry?.visible ?? false,
    physical: entry?.physical ?? false,
    physicsActive: entry?.physicsActive ?? false,
    fallbackSettled: entry?.fallbackSettled ?? false,
    restY: entry?.support?.restY ?? null,
    position: entry?.position ?? null,
  };
}

function crackProjection(pane: any): Record<string, unknown> {
  return {
    schemaVersion: pane.state.schemaVersion,
    paneStateId: pane.state.paneId,
    matchEpoch: pane.state.matchEpoch,
    revision: pane.state.revision,
    damageQ: pane.state.damageQ,
    lastMutationTick: pane.state.lastMutationTick,
    breachRevision: pane.state.breachRevision,
    breachTick: pane.state.breachTick,
    rememberedImpactIds: pane.state.rememberedImpactIds,
    phase: pane.projection.phase,
    paneVisible: pane.projection.paneVisible,
    crackOverlayVisible: pane.projection.crackOverlayVisible,
    apertureOpen: pane.projection.apertureOpen,
    movementSolid: pane.projection.movementSolid,
    ballisticSolid: pane.projection.ballisticSolid,
    aiLineOfSightSolid: pane.projection.aiLineOfSightSolid,
    colliderPresent: pane.activeWorldColliderPresent,
  };
}

async function runCrackControls(
  mode: EvidenceMode,
  arena: ArenaId,
  page: Page,
): Promise<Record<string, unknown>[]> {
  const role = mode === 'solo' ? 'offline' : 'host';
  const paneIds = panesByArena.get(arena)!;
  const controls: Array<Record<string, unknown> & { paneId: string }> = [];
  for (const [paneIndex, paneId] of paneIds.entries()) {
    await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.resetBreakableWindows());
    const impactNonce = nextNonces().actionNonce;
    const receipt = await page.evaluate(({ index, nonce: crackNonce }) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.probeHf304GlassEvidenceCrack(index, crackNonce)
    ), { index: paneIndex, nonce: impactNonce });
    expect(receipt?.accepted, `${scope.id}/${mode}/${arena}/${paneId}: crack authority`).toBe(true);
    controls.push({
      id: `${scope.id}/${mode}/${role}/${arena}/${paneId}`,
      scopeId: scope.id, mode, role, arenaId: arena, paneId,
      actorId: receipt.actorId, matchEpoch: receipt.matchEpoch,
      impactNonce, impactId: receipt.impactId,
      accepted: receipt.accepted,
      before: crackProjection(receipt.before),
      cracked: crackProjection(receipt.cracked),
      reset: {},
    });
  }
  await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.resetBreakableWindows());
  const resetPanes = await page.evaluate((ids) => ids.map((paneId) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.sampleHf304GlassEvidenceCell(paneId, 0, 1).pane
  )), paneIds);
  for (const control of controls) {
    const reset = resetPanes.find((pane: any) => pane.paneId === control.paneId);
    if (!reset) throw new Error(`HF-304 missing reset crack control pane ${control.paneId}`);
    control.reset = crackProjection(reset);
  }
  return controls;
}

async function runDebrisCohort(
  mode: EvidenceMode,
  arena: ArenaId,
  host: Page,
  peer: OwnedPeerServer,
  cadence?: HostedCadence,
  guest?: Page,
): Promise<Record<string, unknown>[]> {
  const paneIds = panesByArena.get(arena)!;
  if (guest) await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.resetBreakableWindows());
  const prepared = await host.evaluate(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.prepareHf304GlassEvidenceCell('carbine', 0)
  ));
  expect(prepared, `${arena}/${mode}: debris prepare`).not.toBeNull();
  if (guest) await waitForGuestHostState(guest, prepared.hostId, 'carbine', prepared.playerPosition);
  const pages: Array<{ role: EvidenceRole; page: Page }> = guest
    ? [{ role: 'host', page: host }, { role: 'guest', page: guest }]
    : [{ role: 'offline', page: host }];
  const spawned = new Map<string, any>();
  const authorityByPane = new Map<string, Readonly<{
    actorId: string;
    matchEpoch: number;
    actionNonce: number;
    windowEventNonce: number;
  }>>();
  let bounded = true;
  for (const [paneIndex, paneId] of paneIds.entries()) {
    if (paneIndex > 0) {
      const staged = await host.evaluate((index) => (
        (window as any).__ATOMIC_ACRES_DEBUG__.stageHf304GlassEvidenceView(index)
      ), paneIndex);
      expect(staged, `${arena}/${mode}/${paneId}: stage`).not.toBeNull();
      if (guest) {
        await waitForGuestHostState(guest, staged.actorId, 'carbine', staged.playerPosition);
      }
    }
    if (cadence) await cadence.before(host, 'carbine');
    const nonces = nextNonces();
    const authored = await host.evaluate(({ index, actionNonce, windowEventNonce }) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.authorHf304GlassEvidenceCell(
        'carbine', index, actionNonce, windowEventNonce,
      )
    ), { index: paneIndex, ...nonces });
    cadence?.sent();
    expect(authored?.accepted, `${arena}/${mode}/${paneId}: debris authority`).toBe(true);
    authorityByPane.set(paneId, {
      actorId: authored.actorId,
      matchEpoch: authored.matchEpoch,
      actionNonce: authored.action.nonce,
      windowEventNonce: authored.windowEvent.nonce,
    });
    if (guest) await waitForGuestGlass(guest, paneId, nonces.actionNonce, nonces.windowEventNonce);
    for (const { role, page } of pages) {
      await page.waitForFunction((expectedPane) => {
        const entries = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().persistentWindowDebris
          .filter((entry: any) => entry.windowId === expectedPane);
        const entry = entries[0];
        return entries.length === 1 && entry.visible === true
          && (entry.physical === true && entry.physicsActive === true
            || entry.physical === false && entry.physicsActive === false);
      }, paneId, { timeout: 2_000 });
      const snapshot = await debrisSnapshot(page);
      const entry = debrisFor(snapshot, paneId);
      spawned.set(`${role}:${paneId}`, entry);
      bounded = bounded && snapshot.pool.activePhysics <= 2 && snapshot.rapierMajorBodies <= 18;
    }
  }
  const movingSnapshots = await Promise.all(pages.map(async ({ role, page }) => {
    await expect.poll(async () => {
      const snapshot = await debrisSnapshot(page);
      return paneIds.every((paneId) => {
        const first = spawned.get(`${role}:${paneId}`);
        const current = debrisFor(snapshot, paneId);
        return first && current
          && current.position[1] <= first.position[1] - 0.025
          && Math.hypot(...current.position.map((value: number, index: number) => value - first.position[index])) >= 0.04;
      });
    }, { timeout: 3_500 }).toBe(true);
    return { role, snapshot: await debrisSnapshot(page) };
  }));
  const moving = new Map<string, any>();
  for (const { role, snapshot } of movingSnapshots) {
    bounded = bounded && snapshot.pool.activePhysics <= 2 && snapshot.rapierMajorBodies <= 18;
    for (const paneId of paneIds) moving.set(`${role}:${paneId}`, debrisFor(snapshot, paneId));
  }
  const settledSnapshots = await Promise.all(pages.map(async ({ role, page }) => {
    await expect.poll(async () => {
      const snapshot = await debrisSnapshot(page);
      return paneIds.every((paneId) => {
        const entry = debrisFor(snapshot, paneId);
        return entry?.fallbackSettled === true && entry.physicsActive === false
          && entry.physical === false && Number.isFinite(entry.support?.restY)
          && Math.abs(entry.position[1] - entry.support.restY) <= 0.04;
      });
    }, { timeout: 4_250 }).toBe(true);
    return { role, snapshot: await debrisSnapshot(page) };
  }));
  const settled = new Map<string, any>();
  for (const { role, snapshot } of settledSnapshots) {
    bounded = bounded && snapshot.pool.activePhysics <= 2 && snapshot.rapierMajorBodies <= 18;
    for (const paneId of paneIds) settled.set(`${role}:${paneId}`, debrisFor(snapshot, paneId));
  }
  await Promise.all(pages.map(async ({ page }) => {
    await expect.poll(async () => {
      const snapshot = await debrisSnapshot(page);
      return snapshot.debris.length === 0 && snapshot.pool.active === 0
        && snapshot.pool.activePhysics === 0 && snapshot.rapierMajorBodies === 0
        && snapshot.panes.every((pane) => pane.broken === true
          && pane.activeWorldColliderPresent === false && pane.authority.apertureOpen === true);
    }, { timeout: 6_000 }).toBe(true);
  }));
  return pages.flatMap(({ role }) => paneIds.map((paneId) => {
    const first = spawned.get(`${role}:${paneId}`);
    const moved = moving.get(`${role}:${paneId}`);
    const rested = settled.get(`${role}:${paneId}`);
    const authority = authorityByPane.get(paneId);
    if (!authority) throw new Error(`HF-304 missing debris authority identity ${arena}/${paneId}`);
    const verticalFall = first.position[1] - moved.position[1];
    const displacement = Math.hypot(
      ...moved.position.map((value: number, index: number) => value - first.position[index]),
    );
    return {
      id: `${scope.id}/${mode}/${role}/${arena}/${paneId}`,
      scopeId: scope.id, mode, role, arenaId: arena, paneId,
      authorityActorId: authority.actorId, matchEpoch: authority.matchEpoch,
      actionNonce: authority.actionNonce, windowEventNonce: authority.windowEventNonce,
      motionOwner: first.physical && first.physicsActive ? 'rapier-major-body' : 'bounded-presentation-fall',
      samples: [
        lifecycleSample('spawned', first),
        lifecycleSample('moving', moved),
        lifecycleSample('settled', rested),
        lifecycleSample('retired', null),
      ],
      minimumVerticalFallM: verticalFall,
      minimumDisplacementM: displacement,
      supportContact: Number.isFinite(rested.support?.restY)
        && Math.abs(rested.position[1] - rested.support.restY) <= 0.04,
      colliderRetired: true,
      unsupportedSuspension: false,
      duplicateDebris: false,
      bodyCountBounded: bounded,
    };
  }));
}

async function captureVisual(
  page: Page,
  mode: EvidenceMode,
  phase: 'intact' | 'breached',
  paneId: string,
): Promise<Record<string, unknown>> {
  await frames(page, 3);
  const canvasBox = await page.locator('#game').boundingBox();
  if (!canvasBox || canvasBox.width < PASS71_HF304_LIVE_HOSTED_VISUAL_WIDTH
    || canvasBox.height < PASS71_HF304_LIVE_HOSTED_VISUAL_HEIGHT) {
    throw new Error(`HF-304 ${scope.id}/${mode}/${phase} canvas cannot own the representative crop`);
  }
  const bytes = await page.screenshot({
    type: 'png', animations: 'disabled',
    clip: {
      x: canvasBox.x + (canvasBox.width - PASS71_HF304_LIVE_HOSTED_VISUAL_WIDTH) / 2,
      y: canvasBox.y + (canvasBox.height - PASS71_HF304_LIVE_HOSTED_VISUAL_HEIGHT) / 2,
      width: PASS71_HF304_LIVE_HOSTED_VISUAL_WIDTH,
      height: PASS71_HF304_LIVE_HOSTED_VISUAL_HEIGHT,
    },
  });
  if (bytes.length < 128 || bytes.length > PASS71_HF304_LIVE_HOSTED_MAX_VISUAL_BYTES
    || bytes.readUInt32BE(12) !== 0x49484452
    || bytes.readUInt32BE(16) !== PASS71_HF304_LIVE_HOSTED_VISUAL_WIDTH
    || bytes.readUInt32BE(20) !== PASS71_HF304_LIVE_HOSTED_VISUAL_HEIGHT) {
    throw new Error(`HF-304 ${scope.id}/${mode}/${phase} did not produce a lossless PNG`);
  }
  const relativePath = `artifacts/pass71/hf304-live-hosted/components/${scope.id.replace('/', '-')}/${mode}-${phase}.png`;
  const absolutePath = resolve(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes);
  return {
    id: `${scope.id}/${mode}/${phase}`,
    scopeId: scope.id, mode, phase, arenaId: 'atomic-acres', paneId,
    role: mode === 'solo' ? 'offline' : 'guest',
    path: relativePath, mimeType: 'image/png',
    width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length,
    sha256: sha256(bytes), dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
  };
}

async function assertNoRuntimeFaults(page: Page, label: string, faults: string[]): Promise<void> {
  const persisted = await readPersistedClientRuntimeLog(page);
  if (persisted.length > 0) faults.push(`${label}: persisted runtime ${JSON.stringify(persisted)}`);
}

test('owns the literal HF-304 solo and live two-peer closing matrix', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'HF-304 uses installed signed Edge through the Chromium project');
  test.setTimeout(900_000);
  const startedAt = new Date().toISOString();
  const peer = await startOwnedPeerServer(peerPort);
  const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
  const faults: string[] = [];
  const soloCells: Record<string, unknown>[] = [];
  const hostedCells: Record<string, unknown>[] = [];
  const crackControls: Record<string, unknown>[] = [];
  const debrisTrails: Record<string, unknown>[] = [];
  const visuals: Record<string, unknown>[] = [];
  const sessions: Record<string, unknown>[] = [];
  let servedCandidate: Record<string, unknown> | null = null;
  let runtime: Record<string, unknown> | null = null;
  let userAgent = '';
  let sessionNonce = '';
  try {
    const identityContext = await browser.newContext();
    const identityPage = await identityContext.newPage();
    ({ userAgent, sessionNonce } = await identityPage.evaluate(() => ({
      userAgent: navigator.userAgent,
      sessionNonce: crypto.randomUUID(),
    })));
    await identityContext.close();

    for (const arena of ['atomic-acres', 'skyline-terminal'] as const) {
      const soloContext = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
      let solo: Page | null = null;
      let soloActorId = '';
      let soloRuntime: Record<string, unknown> | null = null;
      try {
        solo = await openCandidate(soloContext, arena, diagnostics, `${scope.id}/${arena}/solo`);
        await startSolo(solo, arena);
        const provenance = await candidateProvenance(solo);
        if (servedCandidate && !same(servedCandidate, provenance)) throw new Error('HF-304 served candidate changed');
        servedCandidate ??= provenance;
        soloRuntime = await runtimeIdentity(solo);
        if (runtime && !same(runtime, soloRuntime)) throw new Error('HF-304 renderer runtime changed');
        runtime ??= soloRuntime;
        if (arena === 'atomic-acres') {
          const prepared = await solo.evaluate(() => (
            (window as any).__ATOMIC_ACRES_DEBUG__.prepareHf304GlassEvidenceCell('carbine', 0)
          ));
          visuals.push(await captureVisual(solo, 'solo', 'intact', prepared.paneId));
          const nonces = nextNonces();
          await solo.evaluate(({ actionNonce, windowEventNonce }) => (
            (window as any).__ATOMIC_ACRES_DEBUG__.authorHf304GlassEvidenceCell(
              'carbine', 0, actionNonce, windowEventNonce,
            )
          ), nonces);
          visuals.push(await captureVisual(solo, 'solo', 'breached', prepared.paneId));
        }
        const result = await runSoloCells(solo, arena, peer);
        soloCells.push(...result.cells);
        soloActorId = result.actorId;
        crackControls.push(...await runCrackControls('solo', arena, solo));
        debrisTrails.push(...await runDebrisCohort('solo', arena, solo, peer));
        await assertNoRuntimeFaults(solo, `${arena}/solo`, faults);
      } finally {
        await soloContext.close();
      }

      const hostContext = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
      const guestContext = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
      try {
        const [host, guest] = await Promise.all([
          openCandidate(hostContext, arena, diagnostics, `${scope.id}/${arena}/host`, peer),
          openCandidate(guestContext, arena, diagnostics, `${scope.id}/${arena}/guest`, peer),
        ]);
        const roomCode = await startHosted(host, guest, arena);
        const [hostProvenance, guestProvenance] = await Promise.all([
          candidateProvenance(host), candidateProvenance(guest),
        ]);
        if (!servedCandidate || !same(servedCandidate, hostProvenance) || !same(servedCandidate, guestProvenance)) {
          throw new Error(`HF-304 ${arena} hosted candidate identity diverged`);
        }
        const [hostRuntime, guestRuntime] = await Promise.all([
          runtimeIdentity(host), runtimeIdentity(guest),
        ]);
        if (!runtime || !soloRuntime || !same(runtime, hostRuntime) || !same(runtime, guestRuntime)) {
          throw new Error(`HF-304 ${arena} host/guest native renderer identity diverged`);
        }
        const cadence = new HostedCadence();
        if (arena === 'atomic-acres') {
          await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.resetBreakableWindows());
          const prepared = await host.evaluate(() => (
            (window as any).__ATOMIC_ACRES_DEBUG__.prepareHf304GlassEvidenceCell('carbine', 0)
          ));
          await waitForGuestHostState(guest, prepared.hostId, 'carbine', prepared.playerPosition);
          expect(await guest.evaluate(() => (
            (window as any).__ATOMIC_ACRES_DEBUG__.stageHf304GlassEvidenceView(0)
          ))).not.toBeNull();
          visuals.push(await captureVisual(guest, 'hosted', 'intact', prepared.paneId));
          await cadence.before(host, 'carbine');
          const nonces = nextNonces();
          await host.evaluate(({ actionNonce, windowEventNonce }) => (
            (window as any).__ATOMIC_ACRES_DEBUG__.authorHf304GlassEvidenceCell(
              'carbine', 0, actionNonce, windowEventNonce,
            )
          ), nonces);
          cadence.sent();
          await waitForGuestGlass(guest, prepared.paneId, nonces.actionNonce, nonces.windowEventNonce);
          visuals.push(await captureVisual(guest, 'hosted', 'breached', prepared.paneId));
        }
        const result = await runHostedCells(host, guest, arena, peer, cadence);
        hostedCells.push(...result.cells);
        sessions.push({
          arenaId: arena,
          solo: { actorId: soloActorId, networkRole: 'offline', runtime: soloRuntime },
          hosted: {
            hostId: result.hostId, guestId: result.guestId,
            hostNetworkRole: 'host', guestNetworkRole: 'client', roomCodeSha256: sha256(roomCode),
            hostRuntime, guestRuntime,
          },
        });
        crackControls.push(...await runCrackControls('hosted', arena, host));
        debrisTrails.push(...await runDebrisCohort('hosted', arena, host, peer, cadence, guest));
        await Promise.all([
          assertNoRuntimeFaults(host, `${arena}/host`, faults),
          assertNoRuntimeFaults(guest, `${arena}/guest`, faults),
        ]);
      } finally {
        await Promise.allSettled([hostContext.close(), guestContext.close()]);
      }
    }
    faults.push(...diagnostics.pageErrors, ...diagnostics.consoleErrors);
    expect(soloCells).toHaveLength(240);
    expect(hostedCells).toHaveLength(240);
    expect(crackControls).toHaveLength(24);
    expect(debrisTrails).toHaveLength(36);
    expect(visuals).toHaveLength(4);
    expect(faults).toEqual([]);
    expect(userAgent).toMatch(/Edg\//u);
    expect(servedCandidate).not.toBeNull();
    expect(runtime).not.toBeNull();
    const crackById = new Map(crackControls.map((control) => [control.id, control]));
    const orderedCrackControls = (['solo', 'hosted'] as const).flatMap((mode) => (
      PASS71_HF304_LIVE_HOSTED_PANES.map(({ arenaId, paneId }) => {
        const role = mode === 'solo' ? 'offline' : 'host';
        const id = `${scope.id}/${mode}/${role}/${arenaId}/${paneId}`;
        const control = crackById.get(id);
        if (!control) throw new Error(`HF-304 missing canonical crack control ${id}`);
        return control;
      })
    ));
    const debrisById = new Map(debrisTrails.map((trail) => [trail.id, trail]));
    const orderedDebrisTrails = (['solo', 'hosted'] as const).flatMap((mode) => (
      (mode === 'solo' ? ['offline'] : ['host', 'guest']).flatMap((role) => (
        PASS71_HF304_LIVE_HOSTED_PANES.map(({ arenaId, paneId }) => {
          const id = `${scope.id}/${mode}/${role}/${arenaId}/${paneId}`;
          const trail = debrisById.get(id);
          if (!trail) throw new Error(`HF-304 missing canonical debris trail ${id}`);
          return trail;
        })
      ))
    ));
    const component = {
      schemaVersion: 1,
      contract: 'atomic-acres/pass71-hf304-live-hosted-component@1',
      status: 'passed', scope,
      startedAt, completedAt: new Date().toISOString(),
      servedCandidate,
      browser: { channel: 'msedge', installed: true, version: browser.version(), userAgent, sessionNonce },
      runtime,
      peerServer: { host: '127.0.0.1', port: peer.port, path: peer.path, localOnly: true, processId: peer.pid },
      catalog: {
        arenas: PASS71_HF304_LIVE_HOSTED_ARENAS,
        panes: PASS71_HF304_LIVE_HOSTED_PANES,
        weapons: PASS71_HF304_LIVE_HOSTED_WEAPONS,
        fireKinds: PASS71_HF304_LIVE_HOSTED_FIRE_KINDS,
      },
      sessions, soloCells, hostedCells,
      matrixDigestSha256: digest({ solo: soloCells, hosted: hostedCells }),
      crackControls: orderedCrackControls, crackDigestSha256: digest(orderedCrackControls),
      debrisTrails: orderedDebrisTrails, debrisDigestSha256: digest(orderedDebrisTrails),
      visuals, visualDigestSha256: digest(visuals),
      faults,
    };
    mkdirSync(dirname(componentPath), { recursive: true });
    writeFileSync(componentPath, `${JSON.stringify(component)}\n`, 'utf8');
  } finally {
    await peer.stop();
  }
});
