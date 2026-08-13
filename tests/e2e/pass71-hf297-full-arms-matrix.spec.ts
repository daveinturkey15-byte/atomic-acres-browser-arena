import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  PASS71_HF297_FULL_ARMS_SAMPLE_PROGRESS,
  pass71Hf297FullVisualCrop,
} from '../../scripts/qa/pass71-hf297-full-arms-evidence-contract.mjs';
import {
  PASS71_HF297_FULL_LOCAL_ROLES,
  PASS71_HF297_FULL_POSE_STATES,
  PASS71_HF297_FULL_RENDERERS,
  PASS71_HF297_FULL_VIEWPORTS,
  assertPass71Hf297FullExactSets,
  pass71Hf297ActionTargets,
  pass71Hf297FullCellKey,
  pass71Hf297FullVisualKeys,
  pass71Hf297SourceCatalogAtSource,
} from '../../scripts/qa/pass71-hf297-full-arms-matrix.mjs';
import {
  attachBrowserDiagnostics,
  readPersistedClientRuntimeLog,
  startOwnedPeerServer,
  type BrowserDiagnostics,
  type OwnedPeerServer,
} from './pass66-e2e-support';

type Renderer = 'webgl2' | 'webgpu';
type LocalRole = 'solo' | 'host-local' | 'guest-local';
type PoseState = Readonly<{ id: string; stance: string; contact: boolean }>;
type FixturePose = Readonly<{
  kind: 'floor' | 'wall';
  x: number;
  y: number;
  z: number;
  yaw: number;
  discovery: string;
}>;

const enabled = process.env.PASS71_HF297_FULL_ARMS === '1';
const expectedSourceSha = process.env.PASS71_HF297_FULL_SOURCE_SHA ?? '';
const componentDirectory = process.env.PASS71_HF297_FULL_COMPONENT_DIR ?? '';
const peerPort = Number(process.env.PASS71_HF297_FULL_PEER_PORT ?? '4597');
const edgeExecutable = process.env.PASS71_HF297_FULL_EDGE_EXECUTABLE ?? '';
const checkoutSourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8', windowsHide: true,
}).trim();

if (enabled && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha)
  || checkoutSourceSha !== expectedSourceSha || componentDirectory === ''
  || !/[\\/]msedge\.exe$/iu.test(edgeExecutable))) {
  throw new Error('Official HF-297 full-arms closure requires exact candidate A, signed Edge and an owned component directory');
}

const sourceCatalog = enabled ? pass71Hf297SourceCatalogAtSource(process.cwd(), expectedSourceSha) : null;
const actionTargets = sourceCatalog ? pass71Hf297ActionTargets(sourceCatalog) : [];
const expectedVisualKeys = new Set(sourceCatalog ? pass71Hf297FullVisualKeys(sourceCatalog) : []);
const renderProfile = 'blender';

test.use({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
test.describe.configure({ mode: 'serial' });

function candidateUrl(renderer: Renderer, seed: string, peerServer?: OwnedPeerServer): string {
  const url = new URL('/', test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest', map: 'gun-range', renderer, render: renderProfile,
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
  renderer: Renderer,
  role: string,
  diagnostics: BrowserDiagnostics,
  peerServer?: OwnedPeerServer,
): Promise<Page> {
  const page = await context.newPage();
  attachBrowserDiagnostics(page, `${renderer}/${role}`, diagnostics);
  await page.goto(candidateUrl(renderer, `hf297-full-${renderer}-${role}`, peerServer), {
    waitUntil: 'domcontentloaded', timeout: 90_000,
  });
  await page.waitForFunction(({ expectedRenderer, expectedProfile }) => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready' && state.weaponReady === true
      && state.arenaSelection.id === 'gun-range'
      && state.render.runtime.requestedBackend === expectedRenderer
      && state.render.runtime.actualBackend === expectedRenderer
      && state.render.runtime.softwareAdapter === false
      && state.render.profile === expectedProfile
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false;
  }, { expectedRenderer: renderer, expectedProfile: renderProfile }, { timeout: 150_000 });
  return page;
}

async function candidateProvenance(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const response = await fetch(new URL('channel-provenance.json', window.location.href), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HF-297 candidate provenance returned HTTP ${response.status}`);
    const value = await response.json() as Record<string, unknown>;
    return Object.fromEntries([
      'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
    ].map((key) => [key, value[key]]));
  });
}

async function startSolo(page: Page, renderer: Renderer): Promise<void> {
  await page.locator('#player-name').fill(`HF297 ${renderer} Solo`);
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

async function startHosted(host: Page, guest: Page, renderer: Renderer): Promise<void> {
  await host.locator('#player-name').fill(`HF297 ${renderer} Host`);
  await guest.locator('#player-name').fill(`HF297 ${renderer} Guest`);
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

async function discoverFixtures(page: Page): Promise<Record<'floor' | 'wall', FixturePose>> {
  return page.evaluate(async () => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
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
        if (open(x, z)) points.push({
          x, z, distance: Math.hypot(x - state.player.position[0], z - state.player.position[2]),
        });
      }
    }
    points.sort((left, right) => left.distance - right.distance || left.x - right.x || left.z - right.z);
    let floor: FixturePose | null = null;
    let wall: FixturePose | null = null;
    for (const point of points) {
      const blocked = directions.map(([dx, dz]) => ({ dx, dz, blocked: probe(
        point.x + dx * 0.78, point.z + dz * 0.78,
      ) })).filter((entry) => entry.blocked);
      if (!floor && blocked.length === 0
        && directions.every(([dx, dz]) => !probe(point.x + dx * 1.2, point.z + dz * 1.2))) {
        floor = {
          kind: 'floor', x: point.x, y: eyeY + 0.2, z: point.z, yaw: 0,
          discovery: 'open-grid-grounded-world-floor',
        };
      }
      for (const direction of blocked) {
        const lateralX = -direction.dz;
        const lateralZ = direction.dx;
        const continuous = [-1, 1].every((sign) => probe(
          point.x + lateralX * 0.66 * sign + direction.dx * 0.78,
          point.z + lateralZ * 0.66 * sign + direction.dz * 0.78,
        ));
        if (!wall && continuous) wall = {
          kind: 'wall', x: point.x, y: eyeY + 0.2, z: point.z,
          yaw: Math.atan2(-direction.dx, -direction.dz),
          discovery: 'live-probe-continuous-face-both-laterals-blocked',
        };
      }
      if (floor && wall) break;
      await frame();
    }
    if (!floor || !wall) throw new Error('HF-297 floor/wall fixture discovery incomplete');
    return { floor, wall };
  });
}

async function runViewportMatrix(
  page: Page,
  renderer: Renderer,
  role: LocalRole,
  viewport: typeof PASS71_HF297_FULL_VIEWPORTS[number],
  fixtures: Record<'floor' | 'wall', FixturePose>,
): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async ({
    expectedRenderer, localRole, expectedViewport, fixturePoses, poseStates, targets,
    samplesByAction, fullscreenOpticWeapons,
  }) => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
    const frames = async (count: number) => { for (let index = 0; index < count; index += 1) await frame(); };
    const expectedNetworkRole = localRole === 'solo' ? 'offline'
      : localRole === 'host-local' ? 'host' : 'client';
    const summarizeFraming = (value: any) => value ? ({
      finite: value.finite,
      nearPlaneClear: value.nearPlaneClear,
      intersectsViewport: value.intersectsViewport,
      fullyInsideViewport: value.fullyInsideViewport,
      ndcMin: value.ndcMin,
      ndcMax: value.ndcMax,
      nearestDepth: value.nearestDepth,
    }) : null;
    const vectorDistance = (left: number[], right: number[]) => (
      Math.hypot(...left.map((value, index) => value - right[index]))
    );
    const normalizeArm = (arm: any, knife: boolean) => {
      const shoulder = arm.shoulder;
      const elbow = arm.elbow;
      const wrist = arm.wrist;
      const upperLength = vectorDistance(shoulder, elbow);
      const lowerLength = vectorDistance(elbow, wrist);
      if (knife) return {
        side: arm.side,
        mode: 'knife',
        active: arm.active,
        socket: arm.side === 'right' ? 'right-wrist-knife-socket' : 'left-defensive-guard',
        contactRole: arm.side === 'right' ? 'knife-grip' : 'defensive-guard',
        progress: arm.progress,
        shoulder, elbow, wrist, palm: arm.palm, upperLength, lowerLength,
        elbowFlexRadians: arm.elbowFlexRadians,
        meaningfulElbowBend: arm.elbowFlexRadians >= 0.36,
        shoulderBindDelta: arm.shoulderBindDelta,
        elbowBindDelta: arm.elbowBindDelta,
        wristBindDelta: arm.wristBindDelta,
        knifeAttachedToRightWrist: arm.knifeAttachedToRightWrist,
        guardArm: arm.guardArm,
        supportChainPolicy: arm.supportChainPolicy,
        supportChainScale: arm.supportChainScale,
        finite: [...shoulder, ...elbow, ...wrist, ...arm.palm, arm.elbowFlexRadians].every(Number.isFinite),
      };
      return {
        side: arm.side,
        mode: 'firearm',
        active: arm.active,
        socket: arm.socket,
        contactRole: arm.side === 'right' ? 'dominant-grip' : 'bilateral-support',
        shoulder, elbow, wrist, palm: arm.palm, upperLength, lowerLength,
        elbowFlexRadians: arm.elbowFlexRadians,
        meaningfulElbowBend: arm.meaningfulElbowBend,
        contactError: arm.contactError,
        wristContactError: arm.wristContactError,
        palmOrientationError: arm.palmOrientationError,
        socketReachRatio: arm.socketReachRatio,
        gripSocketCalibration: arm.gripSocketCalibration,
        segmentLengthScale: arm.segmentLengthScale,
        withinStableReach: arm.withinStableReach,
        authoredSegmentDirectionsPreserved: arm.authoredSegmentDirectionsPreserved,
        bindOffsetsPreserved: arm.bindOffsetsPreserved,
        finite: arm.finite,
        poseChainContract: arm.poseChainContract,
        shoulderEntryPolicy: arm.shoulderEntryPolicy,
        shoulderEntryNdc: arm.shoulderEntryNdc,
      };
    };
    const normalizeIdentity = (identity: any) => ({
      contract: identity.contract,
      weapon: identity.weapon,
      camera: {
        identity: identity.camera.identity, authority: identity.camera.authority,
        origin: identity.camera.origin, direction: identity.camera.direction,
      },
      muzzle: {
        identity: identity.muzzle.identity, authority: identity.muzzle.authority,
        socket: identity.muzzle.socket, position: identity.muzzle.position,
      },
      projectile: {
        identity: identity.projectile.identity, authority: identity.projectile.authority,
        fireKind: identity.projectile.fireKind, pellets: identity.projectile.pellets,
      },
      hit: {
        identity: identity.hit.identity, authority: identity.hit.authority, kind: identity.hit.kind,
        id: identity.hit.id, distance: identity.hit.distance,
        damageMultiplier: identity.hit.damageMultiplier, traceSurfaceIds: identity.hit.traceSurfaceIds,
      },
    });
    const normalizeSample = (
      state: any,
      target: any,
      progress: number | null,
      shotsBefore: number,
      fireIdentityBefore: any,
      fireIdentityAfter: any,
    ) => {
      const presentation = state.weaponPresentation;
      const suppressed = target.action === 'ads' && fullscreenOpticWeapons.includes(target.weapon);
      const knife = target.presentation === 'knife';
      return {
        progress,
        observedState: presentation.actionContract.state,
        adsProgress: presentation.adsProgress,
        fireKick: presentation.fireCycle.kick,
        shotsPresentedBefore: shotsBefore,
        shotsPresentedAfter: presentation.shotsPresented,
        effectiveViewmodelVisible: state.sniperScope.viewmodelVisible === true,
        fullscreenSuppression: {
          contract: presentation.fullscreenSuppression.contract,
          active: presentation.fullscreenSuppression.active,
          rootVisible: presentation.fullscreenSuppression.rootVisible,
          rootScale: presentation.fullscreenSuppression.rootScale,
        },
        rig: {
          armsSource: presentation.armsSource,
          armMeshCount: presentation.armMeshCount,
          authoredFingerBoneCount: presentation.authoredFingerBoneCount,
          armMaterials: presentation.armMaterials,
          armFraming: suppressed ? null : summarizeFraming(presentation.armFraming),
          armBranches: suppressed ? { left: null, right: null } : {
            left: summarizeFraming(presentation.armBranchFraming?.left),
            right: summarizeFraming(presentation.armBranchFraming?.right),
          },
          sleeveContinuations: (presentation.proximalSleeveContinuations ?? []).map((entry: any) => ({
            side: entry.side,
            contract: entry.contract,
            parent: entry.parent,
            materialKind: entry.materialKind,
            authoredSleeveMaterial: entry.authoredSleeveMaterial,
            opaque: entry.opaque,
          })),
          arms: (presentation.riggedArms ?? []).map((arm: any) => normalizeArm(arm, knife)),
          melee: knife ? {
            meleeArmSource: presentation.meleeArmSource,
            knifeVisible: presentation.knifeVisible,
            passiveKnifeVisible: presentation.passiveKnifeVisible,
            knifeParent: presentation.authoredMeleeKnifeParent,
            knifeGripError: presentation.authoredMeleeGripError,
            knifeHandContactError: presentation.authoredMeleeHandContactError,
          } : null,
        },
        weaponFraming: suppressed || knife ? null : summarizeFraming(presentation.weaponFraming),
        knifeFraming: knife ? summarizeFraming(presentation.meleeKnifeFraming) : null,
        animation: presentation.authoredArmAnimation,
        fireIdentityBefore: fireIdentityBefore ? normalizeIdentity(fireIdentityBefore) : null,
        fireIdentityAfter: fireIdentityAfter ? normalizeIdentity(fireIdentityAfter) : null,
      };
    };
    const stagePose = async (poseState: PoseState) => {
      const fixture = poseState.contact ? fixturePoses.wall : fixturePoses.floor;
      api.setMovement(false);
      api.teleportPlayer(fixture.x, fixture.y, fixture.z, fixture.yaw, 0);
      await frames(10);
      api.setStance(poseState.stance);
      await frames(10);
      if (poseState.contact) {
        api.setMovement(true);
        await frames(18);
        api.setMovement(false);
        await frames(4);
      }
      const sample = api.sampleHf296ContactEvidence();
      const obstacle = sample.contact.contacts.some((entry: any) => entry.source !== 'world-floor')
        || sample.contact.sweepCollisions.some((entry: any) => entry.source !== 'world-floor');
      if (sample.networkRole !== expectedNetworkRole || sample.player.stance !== poseState.stance
        || !sample.contact.contacts.some((entry: any) => entry.source === 'world-floor')
        || obstacle !== poseState.contact) throw new Error(`HF-297 pose staging failed: ${poseState.id}`);
      return fixture;
    };
    const stageSample = async (target: any, progress: number | null) => {
      api.setAds(false);
      api.setFireCaptureAgeMs(null);
      api.setReloadCaptureProgress(null);
      api.setMeleeCaptureProgress(null);
      api.equipWeapon(target.equippedWeapon);
      for (let attempt = 0; attempt < 180; attempt += 1) {
        const presentation = api.snapshot().weaponPresentation;
        if (presentation.weapon === target.equippedWeapon && presentation.detailsReady === true
          && presentation.importedModel?.weapon === target.equippedWeapon) break;
        await frame();
      }
      const before = api.sampleHf296ContactEvidence();
      const shotsBefore = before.viewmodel.shotsPresented;
      const fireIdentityBefore = target.action === 'fire' ? before.fireIdentity : null;
      api.stageHf296ContactAction(target.action);
      if (target.action === 'fire') api.setFireCaptureAgeMs(progress);
      if (target.action === 'reload') api.setReloadCaptureProgress(progress);
      if (target.action === 'melee') api.setMeleeCaptureProgress(progress);
      await frames(18);
      const state = api.snapshot();
      const after = api.sampleHf296ContactEvidence();
      const expectedState = target.action === 'ads' ? 'ads'
        : target.action === 'reload' ? 'reload' : target.action === 'melee' ? 'melee' : 'hip';
      if (state.weaponPresentation.actionContract.state !== expectedState
        || target.action === 'ads' && state.weaponPresentation.adsProgress < 0.98
        || target.action === 'fire' && !(state.weaponPresentation.fireCycle.kick > 0
          && state.weaponPresentation.shotsPresented > shotsBefore)) {
        throw new Error(`HF-297 action staging failed: ${target.weapon}/${target.action}/${progress}`);
      }
      return {
        sample: normalizeSample(
          state, target, progress, shotsBefore, fireIdentityBefore,
          target.action === 'fire' ? after.fireIdentity : null,
        ),
        contact: after,
      };
    };
    const cells: Array<Record<string, unknown>> = [];
    for (const poseState of poseStates as PoseState[]) {
      await stagePose(poseState);
      for (const target of targets) {
        const samples: Array<Record<string, unknown>> = [];
        let contactSample: any = null;
        for (const progress of samplesByAction[target.action]) {
          const staged = await stageSample(target, progress);
          samples.push(staged.sample);
          contactSample = staged.contact;
        }
        cells.push({
          key: [expectedRenderer, localRole, expectedViewport.id, poseState.id, target.weapon, target.action].join('\u001f'),
          renderer: expectedRenderer,
          role: localRole,
          networkRole: expectedNetworkRole,
          viewport: expectedViewport,
          poseState,
          weapon: target.weapon,
          equippedWeapon: target.equippedWeapon,
          action: target.action,
          presentation: target.presentation,
          contact: {
            authority: contactSample.contract,
            contactSources: contactSample.contact.contacts.map((entry: any) => entry.source),
            signedContactDistances: contactSample.contact.contacts.map((entry: any) => entry.distance),
            sweepSources: contactSample.contact.sweepCollisions.map((entry: any) => entry.source),
            surfaceRetreat: contactSample.viewmodel.surfaceRetreat,
            surfaceLift: contactSample.viewmodel.surfaceLift,
          },
          samples,
        });
      }
    }
    const runtime = api.snapshot().render.runtime;
    if (runtime.requestedBackend !== expectedRenderer || runtime.actualBackend !== expectedRenderer
      || runtime.softwareAdapter !== false) throw new Error(`HF-297 renderer drifted: ${expectedRenderer}`);
    return cells;
  }, {
    expectedRenderer: renderer,
    localRole: role,
    expectedViewport: viewport,
    fixturePoses: fixtures,
    poseStates: PASS71_HF297_FULL_POSE_STATES,
    targets: actionTargets,
    samplesByAction: PASS71_HF297_FULL_ARMS_SAMPLE_PROGRESS,
    fullscreenOpticWeapons: sourceCatalog!.fullscreenOpticWeapons,
  });
}

async function stageVisual(
  page: Page,
  poseState: PoseState,
  fixture: FixturePose,
  target: typeof actionTargets[number],
): Promise<{
  presentedFrame: number;
  presentationStatus: string;
  submissionSequence: number;
  completedSequence: number;
}> {
  const captureProgress = target.action === 'reload' ? 0.46 : target.action === 'melee' ? 0.42
    : target.action === 'fire' ? 0 : null;
  return page.evaluate(async ({ expectedPose, fixturePose, actionTarget, progress }) => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
    api.setMovement(false);
    api.teleportPlayer(fixturePose.x, fixturePose.y, fixturePose.z, fixturePose.yaw, 0);
    for (let index = 0; index < 10; index += 1) await frame();
    api.setStance(expectedPose.stance);
    for (let index = 0; index < 10; index += 1) await frame();
    if (expectedPose.contact) {
      api.setMovement(true);
      for (let index = 0; index < 18; index += 1) await frame();
      api.setMovement(false);
    }
    api.setAds(false);
    api.setFireCaptureAgeMs(null);
    api.setReloadCaptureProgress(null);
    api.setMeleeCaptureProgress(null);
    api.equipWeapon(actionTarget.equippedWeapon);
    for (let index = 0; index < 18; index += 1) await frame();
    api.stageHf296ContactAction(actionTarget.action);
    if (actionTarget.action === 'fire') api.setFireCaptureAgeMs(progress);
    if (actionTarget.action === 'reload') api.setReloadCaptureProgress(progress);
    if (actionTarget.action === 'melee') api.setMeleeCaptureProgress(progress);
    for (let index = 0; index < 18; index += 1) await frame();
    const presentedFrame = api.admissionState().presentedGameplayFrame;
    const submitted = api.samplePresentationTelemetry();
    api.setRenderPaused(true);
    const completed = await api.awaitCommittedCameraCompletion();
    return {
      presentedFrame,
      presentationStatus: completed.status,
      submissionSequence: submitted.submissionSequence,
      completedSequence: completed.completedSequence,
    };
  }, { expectedPose: poseState, fixturePose: fixture, actionTarget: target, progress: captureProgress });
}

async function captureVisuals(
  page: Page,
  renderer: Renderer,
  role: LocalRole,
  viewport: typeof PASS71_HF297_FULL_VIEWPORTS[number],
  fixtures: Record<'floor' | 'wall', FixturePose>,
  outputRoot: string,
): Promise<Array<Record<string, unknown>>> {
  const attachments: Array<Record<string, unknown>> = [];
  for (const poseState of PASS71_HF297_FULL_POSE_STATES as readonly PoseState[]) {
    for (const target of actionTargets) {
      const key = pass71Hf297FullCellKey({
        renderer, role, viewportId: viewport.id, poseStateId: poseState.id,
        weapon: target.weapon, action: target.action,
      });
      if (!expectedVisualKeys.has(key)) continue;
      const attribution = await stageVisual(
        page, poseState, poseState.contact ? fixtures.wall : fixtures.floor, target,
      );
      try {
        const filename = `${createHash('sha256').update(key).digest('hex')}.png`;
        const crop = pass71Hf297FullVisualCrop(viewport);
        await page.screenshot({
          path: resolve(outputRoot, filename), type: 'png', animations: 'disabled',
          clip: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
          timeout: 120_000,
        });
        attachments.push({
          key, renderer, role, viewportId: viewport.id, poseStateId: poseState.id,
          weapon: target.weapon, action: target.action, filename,
          presentedFrame: attribution.presentedFrame,
          presentationStatus: renderer === 'webgpu' ? attribution.presentationStatus : 'synchronous',
          submissionSequence: renderer === 'webgpu' ? attribution.submissionSequence : 0,
          completedSequence: renderer === 'webgpu' ? attribution.completedSequence : 0,
          viewportWidth: viewport.width, viewportHeight: viewport.height,
          cropX: crop.x, cropY: crop.y, cropWidth: crop.width, cropHeight: crop.height,
          cropPolicy: crop.policy,
        });
      } finally {
        await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
      }
    }
  }
  return attachments;
}

async function runtimeScope(page: Page, renderer: Renderer, role: LocalRole, browserVersion: string) {
  return page.evaluate(({ expectedRenderer, localRole, version }) => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    const runtime = state.render.runtime;
    return {
      renderer: expectedRenderer,
      role: localRole,
      networkRole: localRole === 'solo' ? 'offline' : localRole === 'host-local' ? 'host' : 'client',
      browserVersion: version,
      userAgent: navigator.userAgent,
      runtime: {
        requestedBackend: runtime.requestedBackend,
        actualBackend: runtime.actualBackend,
        initialized: runtime.initialized,
        adapterClass: runtime.adapterClass,
        deviceClass: runtime.deviceClass,
        adapterLabel: runtime.adapterLabel,
        softwareAdapter: runtime.softwareAdapter,
        deviceLost: runtime.deviceLost,
        uncapturedErrors: runtime.uncapturedErrors,
        presentationStatus: expectedRenderer === 'webgpu' ? runtime.presentation.status : 'synchronous',
      },
    };
  }, { expectedRenderer: renderer, localRole: role, version: browserVersion });
}

test('executes the literal source-derived HF-297 native arms closure matrix', async ({ browser, browserName }) => {
  test.skip(!enabled, 'Run only through the exact-SHA HF-297 full-arms owner.');
  test.skip(browserName !== 'chromium', 'HF-297 uses installed signed Edge through the Chromium project.');
  test.setTimeout(28_800_000);
  const peerServer = await startOwnedPeerServer(peerPort);
  const visualRoot = resolve(componentDirectory, 'visual');
  mkdirSync(visualRoot, { recursive: true });
  const cells: Array<Record<string, unknown>> = [];
  const visualAttachments: Array<Record<string, unknown>> = [];
  const runtimeScopes: Array<Record<string, unknown>> = [];
  const faults: string[] = [];
  let servedCandidate: Record<string, unknown> | null = null;
  try {
    for (const renderer of PASS71_HF297_FULL_RENDERERS as readonly Renderer[]) {
      const soloContext = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
      try {
        const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
        const solo = await openCandidate(soloContext, renderer, 'solo', diagnostics);
        await startSolo(solo, renderer);
        const provenance = await candidateProvenance(solo);
        if (servedCandidate && JSON.stringify(servedCandidate) !== JSON.stringify(provenance)) {
          throw new Error(`HF-297 staged candidate changed at ${renderer}/solo`);
        }
        servedCandidate = provenance;
        const fixtures = await discoverFixtures(solo);
        for (const viewport of PASS71_HF297_FULL_VIEWPORTS) {
          await solo.setViewportSize({ width: viewport.width, height: viewport.height });
          cells.push(...await runViewportMatrix(solo, renderer, 'solo', viewport, fixtures));
          visualAttachments.push(...await captureVisuals(
            solo, renderer, 'solo', viewport, fixtures, visualRoot,
          ));
        }
        runtimeScopes.push(await runtimeScope(solo, renderer, 'solo', browser.version()));
        faults.push(...diagnostics.pageErrors, ...diagnostics.consoleErrors);
        const runtimeLog = await readPersistedClientRuntimeLog(solo);
        if (runtimeLog.length > 0) faults.push(`${renderer}/solo persisted runtime: ${JSON.stringify(runtimeLog)}`);
      } finally {
        await soloContext.close();
      }

      const hostContext = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
      const guestContext = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
      try {
        const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
        const [host, guest] = await Promise.all([
          openCandidate(hostContext, renderer, 'host-local', diagnostics, peerServer),
          openCandidate(guestContext, renderer, 'guest-local', diagnostics, peerServer),
        ]);
        await startHosted(host, guest, renderer);
        const [hostProvenance, guestProvenance] = await Promise.all([
          candidateProvenance(host), candidateProvenance(guest),
        ]);
        if (!servedCandidate || JSON.stringify(hostProvenance) !== JSON.stringify(servedCandidate)
          || JSON.stringify(guestProvenance) !== JSON.stringify(servedCandidate)) {
          throw new Error(`HF-297 staged candidate changed at ${renderer}/hosted`);
        }
        for (const [page, role] of [[host, 'host-local'], [guest, 'guest-local']] as const) {
          const fixtures = await discoverFixtures(page);
          for (const viewport of PASS71_HF297_FULL_VIEWPORTS) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            cells.push(...await runViewportMatrix(page, renderer, role, viewport, fixtures));
            visualAttachments.push(...await captureVisuals(
              page, renderer, role, viewport, fixtures, visualRoot,
            ));
          }
          runtimeScopes.push(await runtimeScope(page, renderer, role, browser.version()));
          const runtimeLog = await readPersistedClientRuntimeLog(page);
          if (runtimeLog.length > 0) faults.push(`${renderer}/${role} persisted runtime: ${JSON.stringify(runtimeLog)}`);
        }
        faults.push(...diagnostics.pageErrors, ...diagnostics.consoleErrors);
      } finally {
        await Promise.allSettled([hostContext.close(), guestContext.close()]);
      }
    }
    const telemetryKeys = cells.map((cell) => String(cell.key));
    const visualKeys = visualAttachments.map((attachment) => String(attachment.key));
    assertPass71Hf297FullExactSets({ telemetryKeys, visualKeys }, sourceCatalog!);
    expect(runtimeScopes).toHaveLength(
      PASS71_HF297_FULL_RENDERERS.length * PASS71_HF297_FULL_LOCAL_ROLES.length,
    );
    expect(faults).toEqual([]);
    writeFileSync(resolve(componentDirectory, 'component.json'), `${JSON.stringify({
      schemaVersion: 1,
      contract: 'atomic-acres/pass71-hf297-full-arms-matrix-component@1',
      status: 'passed',
      expectedSourceSha,
      checkoutSourceSha,
      servedCandidate,
      sourceCatalog,
      runtimeScopes,
      cells,
      visualAttachments,
      faults,
    })}\n`, 'utf8');
  } finally {
    await peerServer.stop();
  }
});
