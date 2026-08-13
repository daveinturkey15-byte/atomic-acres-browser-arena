import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PASS71_HF296_ACTIONS,
  PASS71_HF296_ARENAS,
  PASS71_HF296_FIXTURES,
  PASS71_HF296_LOCAL_KEYS,
  PASS71_HF296_REMOTE_KEYS,
  PASS71_HF296_STANCES,
  PASS71_HF296_VISUAL_ACTION,
  PASS71_HF296_VISUAL_KEYS,
  PASS71_HF296_VISUAL_WEAPON,
  PASS71_HF296_WEAPONS,
  assertPass71Hf296ExactSets,
  pass71Hf296LocalKey,
  pass71Hf296RemoteKey,
  pass71Hf296VisualKey,
} from '../../scripts/qa/pass71-hf296-full-matrix.mjs';
import {
  PASS71_HF296_VISUAL_CROP,
  PASS71_HF296_VISUAL_SOURCE_VIEWPORT,
} from '../../scripts/qa/pass71-hf296-contact-evidence-contract.mjs';
import {
  attachBrowserDiagnostics,
  readPersistedClientRuntimeLog,
  startOwnedPeerServer,
  type BrowserDiagnostics,
  type OwnedPeerServer,
} from './pass66-e2e-support';

type ArenaId = 'atomic-acres' | 'skyline-terminal' | 'rustworks-1v1' | 'gun-range';
type Stance = 'stand' | 'crouch' | 'prone';
type FixtureKind = 'floor' | 'wall' | 'oblique' | 'corner' | 'door-return';
type LocalRole = 'solo' | 'host-local' | 'guest-local';
type RemoteRole = 'host-saw-guest' | 'guest-saw-host';
type FixturePose = Readonly<{
  kind: FixtureKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  approach: readonly [number, number];
  discovery: string;
}>;

const enabled = process.env.PASS71_HF296_FULL_MATRIX === '1';
const expectedSourceSha = process.env.PASS71_HF296_EXPECTED_SOURCE_SHA ?? '';
const componentDirectory = process.env.PASS71_HF296_COMPONENT_DIR ?? '';
const peerPort = Number(process.env.PASS71_HF296_PEER_PORT ?? '4587');
const renderer = 'webgl2';
const renderProfile = 'blender';
const checkoutSourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8', windowsHide: true,
}).trim();

if (enabled && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha)
  || checkoutSourceSha !== expectedSourceSha || componentDirectory === '')) {
  throw new Error('Official HF-296 full matrix requires exact candidate A and an owned component directory');
}

test.use({ viewport: { ...PASS71_HF296_VISUAL_SOURCE_VIEWPORT }, deviceScaleFactor: 1 });
test.describe.configure({ mode: 'serial' });

function candidateUrl(arena: ArenaId, seed: string, peerServer?: OwnedPeerServer): string {
  const url = new URL('/', test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest', map: arena, renderer, render: renderProfile,
    signal: 'off', grass: 'off', mist: 'off', clouds: 'off', rays: 'off',
    externalServices: 'off', seed,
    ...(peerServer ? {
      multiplayerQa: '1', peerQaPort: String(peerServer.port), peerQaPath: peerServer.path,
    } : {}),
  })) url.searchParams.set(key, value);
  return url.toString();
}

async function openCandidate(
  context: BrowserContext,
  arena: ArenaId,
  seed: string,
  diagnostics: BrowserDiagnostics,
  label: string,
  peerServer?: OwnedPeerServer,
): Promise<Page> {
  const page = await context.newPage();
  attachBrowserDiagnostics(page, label, diagnostics);
  await page.goto(candidateUrl(arena, seed, peerServer), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(({ expectedArena, expectedRenderer, expectedProfile }) => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready'
      && state.weaponReady === true
      && state.arenaSelection.id === expectedArena
      && state.render.runtime.actualBackend === expectedRenderer
      && state.render.profile === expectedProfile
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false;
  }, { expectedArena: arena, expectedRenderer: renderer, expectedProfile: renderProfile }, { timeout: 120_000 });
  return page;
}

async function candidateProvenance(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const response = await fetch(new URL('channel-provenance.json', window.location.href), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Candidate provenance request failed: ${response.status}`);
    const value = await response.json() as Record<string, unknown>;
    return Object.fromEntries([
      'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
    ].map((key) => [key, value[key]]));
  });
}

async function startSolo(page: Page, label: string): Promise<void> {
  await page.locator('#player-name').fill(label);
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

async function startHosted(host: Page, guest: Page, arena: ArenaId): Promise<void> {
  await host.locator('#player-name').fill(`HF296 Host ${arena}`);
  await guest.locator('#player-name').fill(`HF296 Guest ${arena}`);
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
    return state.gameStarted && state.matchPhase === 'active'
      && state.remotePlayers.length === 1 && state.remotePlayers[0].operatorModel !== null;
  }, undefined, { timeout: 90_000 })));
  await Promise.all([host, guest].map((page) => page.evaluate(() => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setMovement(false);
  })));
}

async function runPageMatrix(
  page: Page,
  arena: ArenaId,
  role: LocalRole,
): Promise<{
  fixtures: FixturePose[];
  localCells: Array<Record<string, unknown>>;
  catalog: Array<Record<string, unknown>>;
}> {
  return page.evaluate(async ({ arenaId, localRole, stances, weapons, fixtures, actions }) => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
    const frames = async (count: number) => { for (let index = 0; index < count; index += 1) await frame(); };
    const distance = (left: number[], right: number[]) => Math.hypot(...left.map((value, index) => value - right[index]));
    const identityReceipt = (identity: any) => ({
      cameraIdentity: identity.camera.identity,
      cameraOrigin: identity.camera.origin,
      cameraDirection: identity.camera.direction,
      muzzleIdentity: identity.muzzle.identity,
      muzzlePosition: identity.muzzle.position,
      projectileIdentity: identity.projectile.identity,
      hitIdentity: identity.hit.identity,
    });
    const state = api.sampleHf296ContactEvidence();
    const bounds = api.sampleHf296ColliderField().bounds;
    const eyeY = state.player.position[1];
    const lowerY = eyeY - 1.05;
    const upperY = eyeY - 0.3;
    const probe = (x: number, z: number) => api.collisionProbeAt(x, lowerY, z)
      && api.collisionProbeAt(x, upperY, z);
    const open = (x: number, z: number) => !api.collisionProbeAt(x, lowerY, z)
      && !api.collisionProbeAt(x, upperY, z);
    const directions = Array.from({ length: 24 }, (_, index) => {
      const angle = index * Math.PI / 12;
      return [Math.sin(angle), -Math.cos(angle)] as [number, number];
    });
    const step = Math.max(0.55, Math.min(1.05, Math.min(
      bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ,
    ) / 36));
    const points: Array<{ x: number; z: number; distance: number }> = [];
    for (let x = bounds.minX + 0.8; x <= bounds.maxX - 0.8; x += step) {
      for (let z = bounds.minZ + 0.8; z <= bounds.maxZ - 0.8; z += step) {
        if (open(x, z)) points.push({ x, z, distance: Math.hypot(x - state.player.position[0], z - state.player.position[2]) });
      }
    }
    points.sort((left, right) => left.distance - right.distance || left.x - right.x || left.z - right.z);
    const discovered = new Map<string, FixturePose>();
    for (const point of points) {
      const blocked = directions.map(([dx, dz], index) => ({
        index, dx, dz, blocked: probe(point.x + dx * 0.78, point.z + dz * 0.78),
      })).filter((entry) => entry.blocked);
      if (!discovered.has('floor') && blocked.length === 0
        && directions.every(([dx, dz]) => !probe(point.x + dx * 1.2, point.z + dz * 1.2))) {
        discovered.set('floor', {
          kind: 'floor', x: point.x, y: eyeY + 0.2, z: point.z,
          yaw: 0, approach: [0, 0], discovery: 'open-grid-grounded-world-floor',
        });
      }
      for (const direction of blocked) {
        const { dx, dz } = direction;
        const lateralX = -dz;
        const lateralZ = dx;
        const sideBlocked = [-1, 1].map((sign) => probe(
          point.x + lateralX * 0.66 * sign + dx * 0.78,
          point.z + lateralZ * 0.66 * sign + dz * 0.78,
        ));
        const yaw = Math.atan2(-dx, -dz);
        if (!discovered.has('wall') && sideBlocked.every(Boolean)) {
          discovered.set('wall', {
            kind: 'wall', x: point.x, y: eyeY + 0.2, z: point.z,
            yaw, approach: [dx, dz], discovery: 'live-probe-continuous-face-both-laterals-blocked',
          });
          const obliqueYaw = yaw + Math.PI / 6;
          discovered.set('oblique', {
            kind: 'oblique', x: point.x, y: eyeY + 0.2, z: point.z,
            yaw: obliqueYaw,
            approach: [-Math.sin(obliqueYaw), -Math.cos(obliqueYaw)],
            discovery: 'same-live-face-thirty-degree-diagonal-approach',
          });
        }
        if (!discovered.has('door-return') && sideBlocked.filter(Boolean).length === 1) {
          discovered.set('door-return', {
            kind: 'door-return', x: point.x, y: eyeY + 0.2, z: point.z,
            yaw, approach: [dx, dz], discovery: 'live-probe-face-end-one-lateral-open-one-blocked',
          });
        }
      }
      if (!discovered.has('corner')) {
        outer: for (const first of blocked) for (const second of blocked) {
          if (first.index >= second.index || Math.abs(first.dx * second.dx + first.dz * second.dz) > 0.3) continue;
          const dx = first.dx + second.dx;
          const dz = first.dz + second.dz;
          const length = Math.hypot(dx, dz);
          if (length < 0.2) continue;
          const approach: [number, number] = [dx / length, dz / length];
          discovered.set('corner', {
            kind: 'corner', x: point.x, y: eyeY + 0.2, z: point.z,
            yaw: Math.atan2(-approach[0], -approach[1]), approach,
            discovery: 'live-probe-two-perpendicular-blocking-normals',
          });
          break outer;
        }
      }
      if (fixtures.every((fixture: string) => discovered.has(fixture))) break;
    }
    if (!fixtures.every((fixture: string) => discovered.has(fixture))) {
      throw new Error(`HF-296 ${arenaId}/${localRole} fixture discovery incomplete: ${JSON.stringify([...discovered.keys()])}`);
    }
    const fixturePoses = fixtures.map((fixture: string) => discovered.get(fixture)!);
    const localCells: Array<Record<string, unknown>> = [];
    const catalog: Array<Record<string, unknown>> = [];
    const expectedNetworkRole = localRole === 'solo' ? 'offline'
      : localRole === 'host-local' ? 'host' : 'client';
    const stage = async (fixture: FixturePose, stance: string) => {
      api.setMovement(false);
      api.teleportPlayer(fixture.x, fixture.y, fixture.z, fixture.yaw, 0);
      await frames(8);
      api.setStance(stance);
      await frames(8);
      if (fixture.kind !== 'floor') {
        api.setMovement(true);
        await frames(14);
        api.setMovement(false);
        await frames(3);
      }
      const sample = api.sampleHf296ContactEvidence();
      if (sample.arena !== arenaId || sample.networkRole !== expectedNetworkRole
        || sample.player.stance !== stance || sample.contact?.stance !== stance) {
        throw new Error(`HF-296 stage identity drift ${arenaId}/${localRole}/${fixture.kind}/${stance}`);
      }
      const floorContact = sample.contact.contacts.some((contact: any) => contact.source === 'world-floor');
      const obstacleContact = sample.contact.contacts.some((contact: any) => contact.source !== 'world-floor')
        || sample.contact.sweepCollisions.some((contact: any) => contact.source !== 'world-floor');
      if (!floorContact || fixture.kind !== 'floor' && !obstacleContact) {
        throw new Error(`HF-296 missing Rapier signed contact ${arenaId}/${localRole}/${fixture.kind}/${stance}`);
      }
      if (fixture.kind !== 'floor' && !(sample.viewmodel.surfaceRetreat > 0)) {
        throw new Error(`HF-296 missing viewmodel obstruction retreat ${arenaId}/${localRole}/${fixture.kind}/${stance}`);
      }
      return sample;
    };
    for (const fixture of fixturePoses) for (const stance of stances) {
      await stage(fixture, stance);
      for (const weapon of weapons) {
        api.equipWeapon(weapon);
        await frames(4);
        let base = api.sampleHf296ContactEvidence();
        if (base.player.weapon !== weapon || base.viewmodel.weapon !== weapon
          || base.viewmodel.detailsReady !== true || base.viewmodel.importedModel?.weapon !== weapon) {
          throw new Error(`HF-296 weapon presentation not ready ${arenaId}/${localRole}/${fixture.kind}/${stance}/${weapon}`);
        }
        if (!catalog.some((entry) => entry.weapon === weapon)) catalog.push({
          weapon,
          modelId: base.viewmodel.weaponModelId,
          modelSource: base.viewmodel.firstPersonSource,
          modelKind: base.viewmodel.modelKind,
          importedSource: base.viewmodel.importedModel.source,
          socketContractReady: base.viewmodel.importedModel.socketContractReady,
          projectileIdentity: base.fireIdentity.projectile.identity,
          projectileAuthority: base.fireIdentity.projectile.authority,
        });
        for (const action of actions) {
          base = api.sampleHf296ContactEvidence();
          const beforeIdentity = base.fireIdentity;
          api.stageHf296ContactAction(action);
          if (action === 'ads') {
            for (let attempt = 0; attempt < 45; attempt += 1) {
              await frame();
              if (api.sampleHf296ActionProgress().adsProgress >= 0.9) break;
            }
          } else await frames(3);
          const sample = api.sampleHf296ContactEvidence();
          const viewmodel = sample.viewmodel;
          const framing = action === 'melee' ? viewmodel.meleeKnifeFraming : viewmodel.weaponFraming;
          const intentionallySuppressed = viewmodel.fullscreenSuppression?.active === true;
          const framingClear = intentionallySuppressed || (framing !== null
            && framing.finite === true && framing.nearPlaneClear === true && framing.intersectsViewport === true);
          const actionReady = action === 'hip' ? viewmodel.action === 'hip'
            : action === 'ads' ? viewmodel.action === 'ads' && viewmodel.adsProgress >= 0.9
              : action === 'fire' ? viewmodel.fireCycle.kick > 0 && viewmodel.shotsPresented > base.viewmodel.shotsPresented
                : action === 'reload' ? viewmodel.action === 'reload'
                  : viewmodel.action === 'melee' && viewmodel.knifeVisible === true;
          const armsClearOrIntentionallySuppressed = viewmodel.fullscreenSuppression?.active === true
            || (viewmodel.armFraming?.finite === true && viewmodel.armFraming.nearPlaneClear === true);
          if (!actionReady || !framingClear || !armsClearOrIntentionallySuppressed) {
            throw new Error(`HF-296 action presentation failed ${arenaId}/${localRole}/${fixture.kind}/${stance}/${weapon}/${action}`);
          }
          const afterIdentity = sample.fireIdentity;
          const identityFrozen = action !== 'fire' || (
            beforeIdentity.camera.identity === afterIdentity.camera.identity
            && beforeIdentity.muzzle.identity === afterIdentity.muzzle.identity
            && beforeIdentity.projectile.identity === afterIdentity.projectile.identity
            && beforeIdentity.hit.identity === afterIdentity.hit.identity
            && distance(beforeIdentity.camera.origin, afterIdentity.camera.origin) <= 1e-8
            && distance(beforeIdentity.camera.direction, afterIdentity.camera.direction) <= 1e-10
          );
          if (!identityFrozen) throw new Error(
            `HF-296 fire identity drift ${arenaId}/${localRole}/${fixture.kind}/${stance}/${weapon}`,
          );
          localCells.push({
            arena: arenaId, stance, weapon, role: localRole, fixture: fixture.kind, action,
            contactSources: sample.contact.contacts.map((contact: any) => contact.source),
            signedContactDistances: sample.contact.contacts.map((contact: any) => contact.distance),
            sweepSources: sample.contact.sweepCollisions.map((contact: any) => contact.source),
            surfaceRetreat: viewmodel.surfaceRetreat,
            surfaceLift: viewmodel.surfaceLift,
            observedAction: viewmodel.action,
            adsProgress: viewmodel.adsProgress,
            fireKick: viewmodel.fireCycle.kick,
            shotsPresentedBefore: base.viewmodel.shotsPresented,
            shotsPresentedAfter: viewmodel.shotsPresented,
            knifeVisible: viewmodel.knifeVisible,
            fullscreenSuppressed: intentionallySuppressed,
            framingClear,
            identityFrozen,
            identityBefore: identityReceipt(beforeIdentity),
            identityAfter: identityReceipt(afterIdentity),
          });
        }
      }
    }
    return { fixtures: fixturePoses, localCells, catalog };
  }, {
    arenaId: arena,
    localRole: role,
    stances: PASS71_HF296_STANCES,
    weapons: PASS71_HF296_WEAPONS,
    fixtures: PASS71_HF296_FIXTURES,
    actions: PASS71_HF296_ACTIONS,
  });
}

async function runRemoteProjectionSweep(
  actor: Page,
  observer: Page,
  arena: ArenaId,
  role: RemoteRole,
  actorFixtures: FixturePose[],
  observerFloor: FixturePose,
): Promise<Array<Record<string, unknown>>> {
  const observerPromise = observer.evaluate(async ({ arenaId, projectionRole, poses, stances, weapons, floor, expectedRole }) => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
    const distance = (left: number[], right: number[]) => Math.hypot(...left.map((value, index) => value - right[index]));
    const finiteVector = (value: unknown) => Array.isArray(value)
      && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
    if (api.sampleHf296ContactEvidence().networkRole !== expectedRole) {
      throw new Error(`HF-296 ${arenaId}/${projectionRole} observer role drift`);
    }
    api.setMovement(false);
    api.teleportPlayer(floor.x, floor.y, floor.z, floor.yaw, 0);
    for (let index = 0; index < 8; index += 1) await frame();
    // A sentinel distinct from the first stand/carbine cell prevents a stale
    // initial state from being accepted as an acknowledgement.
    api.setStance('prone');
    api.equipWeapon('flare-gun');
    const rows: Array<Record<string, unknown>> = [];
    for (const fixture of poses) for (const stance of stances) for (const weapon of weapons) {
      let remote: any = null;
      for (let attempt = 0; attempt < 360; attempt += 1) {
        remote = api.sampleHf296RemoteProjection()[0];
        const fixtureDistance = finiteVector(remote?.authoritativePosition)
          ? Math.hypot(remote.authoritativePosition[0] - fixture.x, remote.authoritativePosition[2] - fixture.z)
          : Number.POSITIVE_INFINITY;
        if (remote?.weapon === weapon && remote?.renderedWeapon === weapon && remote?.stance === stance
          && finiteVector(remote.authoritativePosition) && finiteVector(remote.renderedPosition)
          && distance(remote.authoritativePosition, remote.renderedPosition) <= 2
          && fixtureDistance <= 1.5) break;
        await frame();
      }
      if (!remote || remote.weapon !== weapon || remote.renderedWeapon !== weapon || remote.stance !== stance
        || !finiteVector(remote.authoritativePosition) || !finiteVector(remote.renderedPosition)) {
        throw new Error(`HF-296 observer timeout ${arenaId}/${projectionRole}/${fixture.kind}/${stance}/${weapon}`);
      }
      const fixtureDistance = Math.hypot(
        remote.authoritativePosition[0] - fixture.x,
        remote.authoritativePosition[2] - fixture.z,
      );
      rows.push({
        arena: arenaId,
        stance,
        weapon,
        role: projectionRole,
        fixture: fixture.kind,
        sourcePlayerId: remote.id,
        authoritativePosition: remote.authoritativePosition,
        renderedPosition: remote.renderedPosition,
        interpolationDistance: distance(remote.authoritativePosition, remote.renderedPosition),
        fixtureDistance,
        renderedWeapon: remote.renderedWeapon,
      });
      // Mirror the observed cell as an acknowledgement on the same replicated
      // state lane. The actor will not advance until this exact pair arrives.
      api.setStance(stance);
      api.equipWeapon(weapon);
    }
    return rows;
  }, {
    arenaId: arena,
    projectionRole: role,
    poses: actorFixtures,
    stances: PASS71_HF296_STANCES,
    weapons: PASS71_HF296_WEAPONS,
    floor: observerFloor,
    expectedRole: role === 'host-saw-guest' ? 'host' : 'client',
  });

  const actorPromise = actor.evaluate(async ({ arenaId, projectionRole, poses, stances, weapons, expectedRole }) => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
    const frames = async (count: number) => { for (let index = 0; index < count; index += 1) await frame(); };
    if (api.sampleHf296ContactEvidence().networkRole !== expectedRole) {
      throw new Error(`HF-296 ${arenaId}/${projectionRole} actor role drift`);
    }
    // Wait until the observer's sentinel is actually present on the network
    // before publishing the first cell.
    let sentinel = false;
    for (let attempt = 0; attempt < 360; attempt += 1) {
      const remote = api.sampleHf296RemoteProjection()[0];
      if (remote?.weapon === 'flare-gun' && remote?.stance === 'prone') { sentinel = true; break; }
      await frame();
    }
    if (!sentinel) throw new Error(`HF-296 actor did not receive observer sentinel ${arenaId}/${projectionRole}`);
    let acknowledgements = 0;
    for (const fixture of poses) for (const stance of stances) {
      api.setMovement(false);
      api.teleportPlayer(fixture.x, fixture.y, fixture.z, fixture.yaw, 0);
      await frames(8);
      api.setStance(stance);
      await frames(8);
      if (fixture.kind !== 'floor') {
        api.setMovement(true);
        await frames(14);
        api.setMovement(false);
        await frames(3);
      }
      const contact = api.sampleHf296ContactEvidence();
      const floorContact = contact.contact?.contacts.some((entry: any) => entry.source === 'world-floor');
      const obstacleContact = contact.contact?.contacts.some((entry: any) => entry.source !== 'world-floor')
        || contact.contact?.sweepCollisions.some((entry: any) => entry.source !== 'world-floor');
      if (!floorContact || fixture.kind !== 'floor' && !obstacleContact) {
        throw new Error(`HF-296 remote actor lost contact ${arenaId}/${projectionRole}/${fixture.kind}/${stance}`);
      }
      for (const weapon of weapons) {
        api.equipWeapon(weapon);
        let acknowledged = false;
        for (let attempt = 0; attempt < 360; attempt += 1) {
          const remote = api.sampleHf296RemoteProjection()[0];
          if (remote?.weapon === weapon && remote?.stance === stance) { acknowledged = true; break; }
          await frame();
        }
        if (!acknowledged) {
          throw new Error(`HF-296 projection acknowledgement timeout ${arenaId}/${projectionRole}/${fixture.kind}/${stance}/${weapon}`);
        }
        acknowledgements += 1;
      }
    }
    return acknowledgements;
  }, {
    arenaId: arena,
    projectionRole: role,
    poses: actorFixtures,
    stances: PASS71_HF296_STANCES,
    weapons: PASS71_HF296_WEAPONS,
    expectedRole: role === 'host-saw-guest' ? 'client' : 'host',
  });

  const [rows, acknowledgements] = await Promise.all([observerPromise, actorPromise]);
  expect(acknowledgements).toBe(PASS71_HF296_FIXTURES.length
    * PASS71_HF296_STANCES.length * PASS71_HF296_WEAPONS.length);
  return rows;
}

async function captureVisualMatrix(
  page: Page,
  arena: ArenaId,
  role: LocalRole,
  fixtures: FixturePose[],
  outputRoot: string,
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const fixture of fixtures) for (const stance of PASS71_HF296_STANCES as readonly Stance[]) {
    await page.evaluate(async ({ fixturePose, expectedStance, weapon }) => {
      const api = (window as any).__ATOMIC_ACRES_DEBUG__;
      const frame = () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
      api.setMovement(false);
      api.teleportPlayer(fixturePose.x, fixturePose.y, fixturePose.z, fixturePose.yaw, 0);
      for (let index = 0; index < 8; index += 1) await frame();
      api.setStance(expectedStance);
      for (let index = 0; index < 8; index += 1) await frame();
      if (fixturePose.kind !== 'floor') {
        api.setMovement(true);
        for (let index = 0; index < 14; index += 1) await frame();
        api.setMovement(false);
      }
      api.equipWeapon(weapon);
      for (let index = 0; index < 4; index += 1) await frame();
      api.stageHf296ContactAction('fire');
      for (let index = 0; index < 3; index += 1) await frame();
      const sample = api.sampleHf296ContactEvidence();
      if (sample.player.stance !== expectedStance || sample.player.weapon !== weapon
        || sample.viewmodel.fireCycle.kick <= 0) throw new Error('HF-296 visual staging failed');
    }, { fixturePose: fixture, expectedStance: stance, weapon: PASS71_HF296_VISUAL_WEAPON });
    const key = pass71Hf296VisualKey({ arena, stance, role, fixture: fixture.kind });
    const filename = `${arena}--${stance}--${role}--${fixture.kind}.png`;
    const absolutePath = resolve(outputRoot, filename);
    await page.screenshot({
      path: absolutePath,
      type: 'png',
      animations: 'disabled',
      clip: { ...PASS71_HF296_VISUAL_CROP },
    });
    rows.push({
      key, arena, stance, role, fixture: fixture.kind,
      weapon: PASS71_HF296_VISUAL_WEAPON,
      action: PASS71_HF296_VISUAL_ACTION,
      filename,
    });
  }
  return rows;
}

test('executes the literal HF-296 player/viewmodel contact closure matrix', async ({ browser, browserName }) => {
  test.skip(!enabled, 'Run only through the exact-SHA HF-296 owner.');
  test.skip(browserName !== 'chromium', 'HF-296 uses installed signed Edge through the Chromium project.');
  test.setTimeout(5_400_000);
  const peerServer = await startOwnedPeerServer(peerPort);
  const visualRoot = resolve(componentDirectory, 'visual');
  mkdirSync(visualRoot, { recursive: true });
  const localCells: Array<Record<string, unknown>> = [];
  const remoteCells: Array<Record<string, unknown>> = [];
  const visualAttachments: Array<Record<string, unknown>> = [];
  let weaponCatalog: Array<Record<string, unknown>> = [];
  let servedCandidate: Record<string, unknown> | null = null;
  let browserRuntime: Record<string, unknown> | null = null;
  const faults: string[] = [];
  try {
    for (const arena of PASS71_HF296_ARENAS as readonly ArenaId[]) {
      const soloContext = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
      try {
        const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
        const solo = await openCandidate(
          soloContext, arena, `hf296-${arena}-solo`, diagnostics, `${arena}/solo`,
        );
        await startSolo(solo, `HF296 Solo ${arena}`);
        const provenance = await candidateProvenance(solo);
        if (servedCandidate && JSON.stringify(servedCandidate) !== JSON.stringify(provenance)) {
          throw new Error(`HF-296 staged candidate changed at ${arena}/solo`);
        }
        servedCandidate = provenance;
        const soloResult = await runPageMatrix(solo, arena, 'solo');
        localCells.push(...soloResult.localCells);
        if (weaponCatalog.length === 0) weaponCatalog = soloResult.catalog;
        visualAttachments.push(...await captureVisualMatrix(solo, arena, 'solo', soloResult.fixtures, visualRoot));
        faults.push(...diagnostics.pageErrors, ...diagnostics.consoleErrors);
        const runtimeLog = await readPersistedClientRuntimeLog(solo);
        if (runtimeLog.length > 0) faults.push(`${arena}/solo persisted runtime: ${JSON.stringify(runtimeLog)}`);
        const runtimeState = await solo.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().render.runtime);
        browserRuntime ??= runtimeState;
      } finally {
        await soloContext.close();
      }

      const hostContext = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
      const guestContext = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
      try {
        const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
        const [host, guest] = await Promise.all([
          openCandidate(hostContext, arena, `hf296-${arena}-host`, diagnostics, `${arena}/host`, peerServer),
          openCandidate(guestContext, arena, `hf296-${arena}-guest`, diagnostics, `${arena}/guest`, peerServer),
        ]);
        await startHosted(host, guest, arena);
        const [hostProvenance, guestProvenance] = await Promise.all([
          candidateProvenance(host), candidateProvenance(guest),
        ]);
        if (!servedCandidate || JSON.stringify(hostProvenance) !== JSON.stringify(servedCandidate)
          || JSON.stringify(guestProvenance) !== JSON.stringify(servedCandidate)) {
          throw new Error(`HF-296 staged candidate changed at ${arena}/hosted`);
        }
        const hostResult = await runPageMatrix(host, arena, 'host-local');
        const guestResult = await runPageMatrix(guest, arena, 'guest-local');
        localCells.push(...hostResult.localCells, ...guestResult.localCells);
        const hostFloor = hostResult.fixtures.find((fixture) => fixture.kind === 'floor');
        const guestFloor = guestResult.fixtures.find((fixture) => fixture.kind === 'floor');
        if (!hostFloor || !guestFloor) throw new Error(`HF-296 ${arena} hosted floor fixture is missing`);
        // Actor/observer pages handshake entirely through their replicated
        // weapon+stance lane. This produces deterministic remote keys while
        // retaining one Node orchestration call per 300-cell sweep.
        remoteCells.push(
          ...await runRemoteProjectionSweep(
            guest, host, arena, 'host-saw-guest', guestResult.fixtures, hostFloor,
          ),
          ...await runRemoteProjectionSweep(
            host, guest, arena, 'guest-saw-host', hostResult.fixtures, guestFloor,
          ),
        );
        visualAttachments.push(
          ...await captureVisualMatrix(host, arena, 'host-local', hostResult.fixtures, visualRoot),
          ...await captureVisualMatrix(guest, arena, 'guest-local', guestResult.fixtures, visualRoot),
        );
        faults.push(...diagnostics.pageErrors, ...diagnostics.consoleErrors);
        const [hostLog, guestLog] = await Promise.all([
          readPersistedClientRuntimeLog(host), readPersistedClientRuntimeLog(guest),
        ]);
        if (hostLog.length > 0) faults.push(`${arena}/host persisted runtime: ${JSON.stringify(hostLog)}`);
        if (guestLog.length > 0) faults.push(`${arena}/guest persisted runtime: ${JSON.stringify(guestLog)}`);
      } finally {
        await Promise.allSettled([hostContext.close(), guestContext.close()]);
      }
    }

    const localKeys = localCells.map((cell) => pass71Hf296LocalKey(cell as Record<string, string>));
    const remoteKeys = remoteCells.map((cell) => pass71Hf296RemoteKey(cell as Record<string, string>));
    const visualKeys = visualAttachments.map((attachment) => String(attachment.key));
    assertPass71Hf296ExactSets({ localKeys, remoteKeys, visualKeys });
    expect(new Set(weaponCatalog.map((entry) => entry.weapon))).toEqual(new Set(PASS71_HF296_WEAPONS));
    expect(faults).toEqual([]);
    const identityContext = await browser.newContext();
    const identityPage = await identityContext.newPage();
    const userAgent = await identityPage.evaluate(() => navigator.userAgent);
    await identityContext.close();
    const component = {
      schemaVersion: 2,
      contract: 'atomic-acres/pass71-hf296-full-contact-matrix-component@2',
      status: 'passed',
      expectedSourceSha,
      checkoutSourceSha,
      servedCandidate,
      browser: { version: browser.version(), userAgent },
      runtime: browserRuntime,
      coverage: {
        renderer, renderProfile,
        sourceViewport: PASS71_HF296_VISUAL_SOURCE_VIEWPORT,
        visualCrop: PASS71_HF296_VISUAL_CROP,
        arenas: PASS71_HF296_ARENAS,
        stances: PASS71_HF296_STANCES,
        weapons: PASS71_HF296_WEAPONS,
        localRoles: ['solo', 'host-local', 'guest-local'],
        remoteRoles: ['host-saw-guest', 'guest-saw-host'],
        fixtures: PASS71_HF296_FIXTURES,
        actions: PASS71_HF296_ACTIONS,
      },
      localCells,
      remoteCells,
      weaponCatalog,
      visualAttachments,
      faults,
    };
    writeFileSync(resolve(componentDirectory, 'component.json'), `${JSON.stringify(component)}\n`, 'utf8');
  } finally {
    await peerServer.stop();
  }
});
