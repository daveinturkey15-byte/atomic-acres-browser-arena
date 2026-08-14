import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PASS71_HF296_ARENAS,
  PASS71_HF296_WEAPONS,
} from '../scripts/qa/pass71-hf296-full-matrix.mjs';
import { ARENA_SELECTIONS } from './map-selection';
import { WEAPON_IDS } from './protocol';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../tests/e2e/pass71-hf296-full-contact-matrix.spec.ts', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../scripts/qa/run-pass71-hf296-contact-evidence.mjs', import.meta.url), 'utf8');

function sourceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, `missing ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `missing ${end}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Pass 71 HF-296 runtime evidence integration', () => {
  it('fails if the canonical arena or firearm catalog outgrows the exact matrix', () => {
    expect(PASS71_HF296_ARENAS).toEqual(ARENA_SELECTIONS.map(({ id }) => id));
    expect(PASS71_HF296_WEAPONS).toEqual(WEAPON_IDS);
  });

  it('samples the shipped Rapier controller and production ballistic ray separately from the muzzle', () => {
    const sample = sourceBetween(main, 'function sampleHf296FireIdentity(', '\nfunction stageHf296ContactAction');
    expect(sample).toContain('camera.getWorldPosition');
    expect(sample).toContain('camera.getWorldDirection');
    expect(sample).toContain('weaponView.muzzleWorldPosition');
    expect(sample).toContain("authority: 'presentation-only-tracer-origin'");
    expect(sample).toContain('const resolution = castShot(');
    const contact = sourceBetween(main, 'function sampleHf296ContactEvidence()', '\nfunction sampleHf296ColliderField');
    expect(contact).toContain('characterPhysics?.debugContactSnapshot()');
    expect(contact).toContain('fireIdentity: sampleHf296FireIdentity(presentation)');
    expect(main).toContain('renderedPosition: Object.freeze(remote.root.position.toArray())');
    expect(main).toContain('operatorModel: riggedOperatorTelemetry(remote.root.userData.operator as THREE.Object3D)');
    expect(main).not.toContain('operatorModel: riggedOperatorTelemetry(remote.root),');
  });

  it('lets Rapier resolve the grounded gravity step before clearing blocked downward velocity', () => {
    const update = sourceBetween(main, 'function updatePhysics(dt: number): void {', '\nfunction interpolationSourceSnapshotRateHz');
    const gravity = update.indexOf('player.velocity.y -= 24.5 * dt;');
    const move = update.indexOf('const movement = characterPhysics.move({');
    const blocked = update.indexOf('if (movement.blockedY && player.velocity.y < 0) player.velocity.y = 0;');
    expect(gravity).toBeGreaterThanOrEqual(0);
    expect(move).toBeGreaterThan(gravity);
    expect(blocked).toBeGreaterThan(move);
    expect(update).not.toContain('if (playerGrounded) player.velocity.y = Math.max(0, player.velocity.y);');
  });

  it('stages every declared action through the shipped presentation implementation', () => {
    const stage = sourceBetween(main, 'function stageHf296ContactAction(', '\nfunction sampleHf296ContactEvidence');
    expect(stage).toContain("action === 'ads'");
    expect(stage).toContain('weaponView.fire(0)');
    expect(stage).toContain('weaponView.reload()');
    expect(stage).toContain('weaponView.melee()');
    expect(stage).toContain('weaponView.setFireCaptureAgeMs(24)');
    expect(stage).toContain('debugReloadProgress = 0.45');
  });

  it('runs page-side exact matrices and retains Node only for lossless captures', () => {
    expect(spec).toContain('return page.evaluate(async');
    expect(spec).toContain("'--disable-background-timer-throttling'");
    expect(spec).toContain("'--disable-renderer-backgrounding'");
    expect(spec).toContain("'--disable-backgrounding-occluded-windows'");
    expect(spec).toContain("'--allow-loopback-in-peer-connection'");
    expect(spec).toContain('const secondaryEdge = await chromium.launch({');
    expect(spec).toContain('executablePath: process.env.PASS71_HF296_EDGE_EXECUTABLE');
    expect(spec).toContain('expect(secondaryEdge.version()).toBe(browser.version())');
    expect(spec).toContain('const guestContext = await secondaryEdge.newContext(');
    expect(spec).toContain('await secondaryEdge.close();');
    const hostActive = spec.indexOf('await waitForHostedMatch(host);');
    const guestActive = spec.indexOf('await waitForHostedMatch(guest);');
    const hostOperator = spec.indexOf('await waitForHostedOperator(host);');
    const guestOperator = spec.indexOf('await waitForHostedOperator(guest);');
    expect(hostActive).toBeGreaterThanOrEqual(0);
    expect(guestActive).toBeGreaterThan(hostActive);
    expect(hostOperator).toBeGreaterThan(guestActive);
    expect(guestOperator).toBeGreaterThan(hostOperator);
    expect(spec).toContain("document.visibilityState === 'visible' && document.hasFocus()");
    expect(spec).toContain('state.remotePlayers[0].operatorModel !== null');
    expect(spec).toContain('api.authorizeHf296RemoteProjectionWeapon(first.weapon)');
    expect(spec).toContain('api.authorizeHf296RemoteProjectionWeapon(next.weapon)');
    expect(spec).toContain('api.authorizeHf296RemoteProjectionWeapon(weapon) !== remote?.id');
    expect(main).toContain("network.role !== 'offline' && localMultiplayerQa");
    expect(main).toContain("!localMultiplayerQa || network.role === 'offline'");
    expect(main).toContain('localMultiplayerQa ? player.secondaryWeapon : handicapSidearm(player.primaryWeapon)');
    expect(main).toContain('if (localMultiplayerQa) player.secondaryWeapon = handicapSidearm(player.primaryWeapon);');
    expect(main).toContain('localMultiplayerQa && SIDEARM_WEAPON_IDS.includes(weapon as SidearmWeaponId)');
    expect(main).toContain('player.secondaryWeapon = weapon as SidearmWeaponId;');
    expect(main).toContain('hf296ProjectionAuthorization?.weapon === admittedIncoming.weapon');
    expect(main).toContain('hf296ProjectionAuthorization.expiresAt > now');
    expect(main).toContain('hf296ClaimedProjectionAuthorization?.weapon === claimedIncoming.weapon');
    expect(main).toContain("claimedIncoming.weapon === 'magnum' && lobbyMember?.dhv !== 'X' && !hf296ClaimedProjectionAllowed");
    expect(main).toContain('const HF296_REMOTE_PROJECTION_AUTHORIZATION_MS = 15_000;');
    expect(main).toContain('prepareHf296WeaponCatalog: () => Promise<ReturnType<typeof weaponView.browserCatalogReadiness>>;');
    expect(main).toContain('await weaponView.prepareBrowserWeaponCatalogAssets(');
    expect(main).toContain('WEAPON_IDS,\n      undefined,\n      yieldDeploymentPrewarmFrame,');
    expect(main).toContain('expiresAt: performance.now() + HF296_REMOTE_PROJECTION_AUTHORIZATION_MS');
    expect(main).toContain('admittedIncoming.secondary === admittedIncoming.weapon');
    expect(main).toContain('admittedIncoming.primary === admittedIncoming.weapon');
    expect(main).toContain('admittedIncoming.secondary === handicapSidearm(admittedIncoming.primary, memberDhv(admittedIncoming.id))');
    expect(main).toContain('admittedIncoming.grenade === remote.snapshot.grenade');
    expect(main).toContain('&& !respawned && !hf296ProjectionSecondaryAllowed) return;');
    expect(main).toContain('if (hf296ProjectionWeaponAllowed) hf296RemoteProjectionWeaponAuthorizations.delete(admittedIncoming.id);');
    expect(main).toContain('publishHf296RemoteProjectionState: () => {');
    expect(main).toContain('network.sendStateCommitReliably(message);');
    expect(main).toContain("const hf296ContinuityResync = localMultiplayerQa && message.type === 'state'");
    expect(main).toContain('claimedContinuity === remote.continuity + 1');
    expect(main).toContain('respawned || hf296ContinuityResync');
    expect(spec).toContain('const observerSentinelPublication = api.publishHf296RemoteProjectionState();');
    expect(spec).toContain('const actorSentinelPublication = api.publishHf296RemoteProjectionState();');
    expect(spec).toContain('const acknowledgementPublication = api.publishHf296RemoteProjectionState();');
    expect(spec).toContain('const actorPublication = api.publishHf296RemoteProjectionState();');
    expect(spec).toContain('assertPass71Hf296ExactSets({ localKeys, remoteKeys, visualKeys })');
    expect(spec).toContain('await page.screenshot({');
    expect(spec).toContain('viewport: { ...PASS71_HF296_VISUAL_SOURCE_VIEWPORT }');
    expect(spec).toContain('clip: { ...PASS71_HF296_VISUAL_CROP }');
    expect(spec).toContain('sourceViewport: PASS71_HF296_VISUAL_SOURCE_VIEWPORT');
    expect(spec).toContain('visualCrop: PASS71_HF296_VISUAL_CROP');
    expect(spec).toContain("runPageMatrix(host, arena, 'host-local')");
    expect(spec).toContain("runPageMatrix(guest, arena, 'guest-local')");
    expect(spec).toContain("guest, host, arena, 'host-saw-guest'");
    expect(spec).toContain("host, guest, arena, 'guest-saw-host'");
    expect(spec).toContain('const [rows, acknowledgements] = await Promise.all');
    expect(spec).toContain("api.authorizeHf296RemoteProjectionWeapon('flare-gun') !== sentinelRemote?.id");
    expect(spec).toContain("api.authorizeHf296RemoteProjectionWeapon('flashlight-pistol') !== markerRemote?.id");
    expect(spec).toContain('const expectedSourcePlayerId = firstRemote.id;');
    expect(spec).toContain('api.authorizeHf296RemoteProjectionWeapon(weapon) !== expectedSourcePlayerId');
    expect(spec).toContain('attempt > 0 && attempt % 60 === 0');
    expect(spec).toContain('HF-296 projection authorization renewal failed');
    expect(spec.match(/const waitForExactRemote = async \(label: string\) =>/gu)).toHaveLength(2);
    expect(spec.match(/observed\.length === 1 \? observed\[0\] : null/gu)).toHaveLength(2);
    expect(spec.match(/current\.id === priorId/gu)).toHaveLength(2);
    expect(spec).toContain("const sentinelRemote = await waitForExactRemote('sentinel-authorization');");
    expect(spec).toContain("if (markerObserved?.weapon === 'flashlight-pistol') break;");
    expect(spec).toContain("api.equipWeapon('flashlight-pistol');");
    expect(spec).toContain('const sentinelDeadlineAt = performance.now() + contactSettleTimeoutMs;');
    expect(spec).toContain("sentinelSample.player?.stance !== 'prone' || sentinelSample.contact?.stance !== 'prone'");
    expect(spec).toContain('expectedRemoteId: sentinelRemote?.id');
    expect(spec).toContain('const CONTACT_SETTLE_TIMEOUT_MS = 1_500;');
    expect(spec).toContain('const WEAPON_PRESENTATION_TIMEOUT_MS = 1_500;');
    expect(spec).toContain('const presentationDeadlineAt = performance.now() + weaponPresentationTimeoutMs;');
    expect(spec).toContain('floorContact && obstacleContact && sample.viewmodel.surfaceRetreat > 0');
    expect(spec).toContain('const HOSTED_MATRIX_DURATION_MS = 900_000;');
    expect(spec).toContain('(window as any).__ATOMIC_ACRES_DEBUG__.extendHf296HostedMatrixDuration()');
    expect(main).toContain("launchParams.get('multiplayerQa') !== '1'");
    expect(main).toContain("privateLobbySnapshot?.phase !== 'waiting'");
    expect(main).toContain('durationMs: MAX_PRIVATE_MATCH_DURATION_MS');
    expect(spec).toContain('const deadlineAt = performance.now() + contactSettleTimeoutMs;');
    expect(spec).toContain('const deadlineAt = performance.now() + weaponPresentationTimeoutMs;');
    expect(spec).toContain("const floorFixture = fixturePoses.find((fixture: FixturePose) => fixture.kind === 'floor');");
    expect(spec).toContain("const floorFixture = poses.find((fixture: FixturePose) => fixture.kind === 'floor');");
    expect(spec.match(/api\.teleportPlayer\(floorFixture\.x, floorFixture\.y, floorFixture\.z, floorFixture\.yaw, 0\);/gu)).toHaveLength(2);
    expect(spec.match(/await waitForStance\(stance\);/gu)).toHaveLength(2);
    expect(spec).toContain('const stanceDeadlineAt = performance.now() + contactSettleTimeoutMs;');
    expect(spec).toContain('api.teleportPlayer(openFloor.x, openFloor.y, openFloor.z, openFloor.yaw, 0);');
    expect(spec).toContain('const fixtureCandidates = new Map<string, FixturePose[]>();');
    expect(spec).toContain('const discoveredCandidates = [fixture, ...retainedCandidates.filter');
    expect(spec).toContain('const candidates = discoveredCandidates.flatMap((candidate) => [');
    expect(spec).toContain('yaw: candidate.yaw + Math.PI');
    expect(spec).toContain('approach: [-candidate.approach[0], -candidate.approach[1]]');
    expect(spec).toContain('reverse-signed-contact-side');
    expect(spec).toContain('lateralBlockedFor(first).filter(Boolean).length !== 1');
    expect(spec).toContain('lateralBlockedFor(second).filter(Boolean).length !== 1');
    expect(spec).toContain("if (performance.now() >= presentationDeadlineAt) throw new Error('no live viewmodel obstruction retreat');");
    expect(spec).toContain('Object.assign(fixture as any, selected);');
    expect(spec).toContain('HF-296 no signed presentation-compatible fixture');
    expect(spec.match(/await waitForContact\(\{ \.\.\.candidate, kind: 'floor' \}\);/gu)).toHaveLength(1);
    expect(spec.match(/await waitForContact\(\{ \.\.\.fixture, kind: 'floor' \}\);/gu)).toHaveLength(1);
    expect(spec.match(/await waitForContact\(candidate\);/gu)).toHaveLength(1);
    expect(spec.match(/await waitForContact\(fixture\);/gu)).toHaveLength(3);
    expect(spec).toContain('let base = await waitForWeaponPresentation(weapon);');
    expect(spec).toContain('const preparedCatalog = await api.prepareHf296WeaponCatalog();');
    expect(spec).toContain('preparedCatalog.prewarming || !weapons.every');
    expect(spec).toContain('observer did not settle on the signed world floor');
    expect(spec).toContain('visual staging did not settle on the signed world floor');
    expect(spec).toContain('visual staging did not reach the signed obstacle contact');
    expect(spec.match(/finally \{\s+api\.setMovement\(false\);/gu)).toHaveLength(3);
    expect(spec).toContain("sample.contact?.contacts.some((contact: any) => contact.source === 'world-floor')");
    expect(spec).toContain('playerPosition: sample?.player?.position');
    expect(spec).toContain("progress.action === 'ads' && progress.adsProgress >= 0.92");
    expect(spec).toContain("viewmodel.action === 'ads' && viewmodel.adsProgress >= 0.92");
    expect(spec).toContain("const stagedIdentity = api.stageHf296ContactAction(action);");
    expect(spec).toContain("const afterIdentity = action === 'fire' ? stagedIdentity : sample.fireIdentity;");
  });

  it('owns exact staged candidate A and signed installed Edge provenance', () => {
    expect(runner).toContain('assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable))');
    expect(runner).toContain("resolve(root, 'scripts/qa/run-playwright-with-topology.mjs')");
    expect(runner).toContain("PASS71_HF296_FULL_MATRIX: '1'");
    expect(runner).toContain('assertPass71Hf296ExactSets({ localKeys, remoteKeys, visualKeys })');
    expect(runner).toContain("encoding: 'lossless-png-embedded-base64'");
    expect(runner).toContain('bytes.length > PASS71_HF296_MAX_VISUAL_BYTES');
    expect(runner).toContain('payload, \'utf8\') > PASS71_HF296_MAX_RECORD_JSON_BYTES');
  });
});
