import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const network = readFileSync(new URL('./network.ts', import.meta.url), 'utf8');

function between(startNeedle: string, endNeedle: string): string {
  const start = main.indexOf(startNeedle);
  const end = main.indexOf(endNeedle, start + startNeedle.length);
  expect(start, `missing start marker: ${startNeedle}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing end marker after ${startNeedle}: ${endNeedle}`).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('timed map weapon legacy-main integration', () => {
  it('checkpoints both authorities, restores them after final clock construction, and reliably repairs late joiners', () => {
    const checkpoint = between('function createHostMatchCheckpoint(', '\nfunction persistActiveHostMatchCheckpoint(');
    expect(checkpoint).toContain('checkpointTimedMapWeaponAuthorities(timedMapWeaponStates, nowMonoMs)');
    expect(checkpoint).toContain('if (!timedMapWeapons) return null');
    expect(checkpoint).toContain('timedMapWeapons,');

    const start = between('async function startGame(', '\nfunction randomNonce(');
    expect(start).toContain('const timedWeaponMatchEndsAt = matchRules.durationMs === null');
    expect(start).toContain(': railgunActiveAt + matchRules.durationMs');
    expect(start).toContain('initializeTimedMapWeaponsForMatch(railgunActiveAt, timedWeaponMatchEndsAt, hostRecovery)');

    const initialize = between('function initializeTimedMapWeaponsForMatch(', '\nfunction updateTimedMapWeapons(');
    expect(initialize).toContain('restoreTimedMapWeaponAuthorities(recovery, Date.now(), performance.now())');
    expect(initialize).toContain("throw new Error('Stored host recovery has an authority-owned special weapon without its timed state')");

    const broadcast = between('function broadcastTimedMapWeaponState(', '\nfunction initializeTimedMapWeaponsForMatch(');
    expect(broadcast).toContain('network.send(message)');
    expect(broadcast).toContain('network.sendStateCommitReliably(message)');

    const repairStart = main.indexOf("if (network.role === 'host' && message.type === 'join') {");
    const repairEnd = main.indexOf("if (network.role === 'host' && message.type === 'state') {", repairStart);
    expect(main.slice(repairStart, repairEnd)).toContain('broadcastTimedMapWeaponState()');
  });

  it('routes guest claims only to the host and seals identity, life, movement, generation, range, and sight', () => {
    const route = network.indexOf("|| payload.type === 'timed-map-weapon-claim-request'");
    const hostDelivery = network.indexOf('this.onMessage(payload);', route);
    const relay = network.indexOf('this.broadcast(payload, playerId);', route);
    expect(route).toBeGreaterThanOrEqual(0);
    expect(hostDelivery).toBeGreaterThan(route);
    expect(relay).toBeGreaterThan(hostDelivery);
    expect(network.slice(hostDelivery, relay)).toContain('return;');

    const claim = between('function acceptTimedMapWeaponClaim(', '\nfunction localHoldsRailgun(');
    expect(claim).toContain("if (network.role !== 'host') return");
    expect(claim).toContain('const remote = remotes.get(message.by)');
    expect(claim).toContain('const health = remoteHealthAuthorities.get(message.by)');
    expect(claim).toContain("message.generation !== state.generation ? 'generation-mismatch'");
    expect(claim).toContain("!remoteCanClaimTimedPickup(now, remote.lastSeen, remote.claimEligibleAt) ? 'movement-not-qualified'");
    expect(claim).toContain("authoritativeToReported > 2.8 ? 'reported-position-mismatch'");
    expect(claim).toContain("authoritativeToPickup > TIMED_MAP_WEAPON_PICKUP_RANGE + 0.5 ? 'outside-authoritative-pickup-range'");
    expect(claim).toContain("? 'pickup-line-of-sight-blocked'");

    expect(main).toContain('timedMapWeaponStates[admittedIncoming.weapon].holderId !== admittedIncoming.id');
    expect(main).toContain("if (network.role === 'host' && isTimedMapWeaponId(message.weapon)) return");
    expect(main).toContain("recordRemoteHitAdmission('shot-timed-special-host-authority-only')");
  });

  it('consumes finite host ammo only after shot admission and keeps flare projectiles out of the explosive-bolt path', () => {
    const resolve = between('function resolveAuthoritativeShot(', '\nfunction reconcileLocalAuthoritativeHealth(');
    const originValidation = resolve.indexOf('if (!validateShotOrigin(request, shooterRewind.pose))');
    const timedAuthority = resolve.indexOf('if (isTimedMapWeaponId(request.weapon))');
    const flareConsumption = resolve.indexOf('consumeTimedMapWeaponShot(authority, request.by, request.shotId)');
    const flareSpawn = resolve.indexOf('flareProjectileSystem.spawn({');
    const flameConsumption = resolve.indexOf("consumeTimedMapWeaponShot(timedMapWeaponStates.flamethrower, request.by, request.shotId)");
    const derivedDamage = resolve.indexOf('deriveAuthoritativeShotOutcomes(');
    expect(originValidation).toBeGreaterThanOrEqual(0);
    expect(timedAuthority).toBeGreaterThan(originValidation);
    expect(flareConsumption).toBeGreaterThan(timedAuthority);
    expect(flareSpawn).toBeGreaterThan(flareConsumption);
    expect(flameConsumption).toBeGreaterThan(flareSpawn);
    expect(derivedDamage).toBeGreaterThan(flameConsumption);
    expect(resolve).toContain("if (request.weapon === 'flare-gun') {");
    expect(resolve).toContain("if (request.weapon === 'explosive-crossbow') {");
    expect(resolve.indexOf("if (request.weapon === 'flare-gun') {", flareSpawn - 700)).toBeLessThan(
      resolve.indexOf("if (request.weapon === 'explosive-crossbow') {"),
    );
    expect(resolve).toContain("if (weapon === 'flamethrower' && distance > FLAMETHROWER_EFFECT.rangeM + 0.05) return 0");
  });

  it('uses dedicated local, remote, bot, and support effect paths with the canonical 18 m flame clamp', () => {
    const localFire = between('function tryFire(now: number)', '\nfunction castShot(');
    expect(localFire).toContain('const maximumShotDistance = flamethrowerShot ? FLAMETHROWER_EFFECT.rangeM : 90');
    expect(localFire).toContain('castShot(origin, direction, player.weapon, !flamethrowerShot, maximumShotDistance)');
    expect(localFire).toContain('flamethrowerStreamPresentation.emit(visualStart, authoritativeEnd, now)');
    expect(localFire).toContain("if (player.weapon === 'flare-gun') {");
    expect(localFire).toContain('flareProjectileSystem.spawn({');
    expect(localFire).toContain('} else {\n      spawnExplosiveBolt(');

    const remote = between('function renderRemoteShot(', '\nfunction showDamageDirection(');
    expect(remote).toContain("if (message.weapon === 'flare-gun') {");
    expect(remote).toContain('flareProjectileSystem.spawn({');
    expect(remote).toContain("message.weapon === 'flamethrower' ? FLAMETHROWER_EFFECT.rangeM : 50");
    expect(remote).toContain('flamethrowerStreamPresentation.emit(remoteMuzzle ?? origin, visibleEnd, performance.now())');

    const support = between('function applyKillstreakEntityShot(', '\nfunction killstreakSlotFor(');
    expect(support).toContain("const maximumDistance = weapon === 'flamethrower' ? FLAMETHROWER_EFFECT.rangeM : 220");
    expect(main).toContain("const shotLength = flamethrowerShot\n        ? Math.min(distance + 2, FLAMETHROWER_EFFECT.rangeM)");
    expect(main).toContain('if (flamethrowerShot) flamethrowerStreamPresentation.emit(botMuzzle ?? origin, pelletVisibleEnd, now)');
  });

  it('routes real F pickups and secure test-bay grants through one authority lifecycle', () => {
    const candidates = between('function fInteractionCandidates(', '\nfunction selectedFInteraction(');
    expect(candidates).toContain('const timedWeapon = !testBayWeapon ? nearbyTimedMapWeaponPickup() : null');
    expect(candidates).toContain("targetId: timedWeapon");

    const pickup = between('function interactWithWeaponPickup(', '\nfunction interactWithShedDoor(');
    expect(pickup).toContain('isTimedMapWeaponId(expectedTargetId)');
    expect(pickup).toContain('interactWithTimedMapWeaponPickup(expectedTargetId, now)');

    const training = between('function interactWithGunRangeTestBayWeapon(', '\nfunction interactWithGunRangeTestBaySupport(');
    expect(training).toContain("if (network.role === 'client') {");
    expect(training).toContain('grantTrainingTimedMapWeapon(timedMapWeaponStates[weapon], player.id');
    expect(training).toContain("stationKind: 'secure-test-bay'");

    expect(main).toContain('dropHeldTimedMapWeapons(message.victim, dropPoint)');
    expect(main).toContain('dropHeldTimedMapWeapons(id, dropPoint)');
    expect(main).toContain('dropHeldTimedMapWeapons(player.id, player.position.clone().add(new THREE.Vector3(0, 0.3, 0)))');
  });

  it('updates and prewarms every presentation and exposes exact-midpoint HITL evidence', () => {
    expect(main).toContain('updateFlareProjectiles(frameDt, now)');
    expect(main).toContain('flamethrowerStreamPresentation.update(frameDt)');
    expect(main).toContain('updateTimedMapWeapons(now)');
    expect(main).toContain('timedMapWeaponPresentation.prewarm(renderRuntime, camera, sceneGeneration)');
    expect(main).toContain('flareProjectileSystem.prewarm(renderRuntime, camera, sceneGeneration)');
    expect(main).toContain('flamethrowerStreamPresentation.prewarm(renderRuntime, camera, sceneGeneration)');
    expect(main).toContain("stageTimedMapWeaponMidpoint: (weaponId, phase) => {");
    expect(main).toContain("phase === 'before' ? Math.max(0, state.spawnAtHostTimeMs - 0.001) : state.spawnAtHostTimeMs");
    expect(main).toContain('pendingHostFlares: pendingFlareShotRequests.size');
    expect(main).toContain('flareProjectiles: flareProjectileSystem.telemetry()');
    expect(main).toContain('flameStream: flamethrowerStreamPresentation.telemetry()');
  });

  it('keeps idle railgun action ownership at hip and enters reload only while rechambering', () => {
    const update = between('function updatePhysics(dt: number)', '\nfunction interpolationSourceSnapshotRateHz(');
    const progressStart = update.indexOf("const railgunReloadProgress = player.weapon === 'railgun' && railgunRechamberPresentationActive");
    const progressEnd = update.indexOf('\n  const viewmodelObstruction', progressStart);
    expect(progressStart).toBeGreaterThanOrEqual(0);
    expect(progressEnd).toBeGreaterThan(progressStart);
    const progress = update.slice(progressStart, progressEnd);
    expect(progress).toContain('THREE.MathUtils.clamp(');
    expect(progress).toContain(': null;');
    expect(progress).not.toContain(': 0;');
    expect(update).toContain("player.weapon === 'railgun' ? railgunReloadProgress : gameplayReloadProgress(");
  });

  it('keeps flame and flare frame loops on retained pools and cached snapshots', () => {
    const groundFireUpdate = between(
      'function updateFlamethrowerGroundFires(now: number)',
      '\nconst dmrThermalPresentation',
    );
    expect(groundFireUpdate).toContain('flamethrowerGroundFires.update(');
    expect(groundFireUpdate).not.toContain('[...bots.values()]');
    expect(groundFireUpdate).not.toContain('.splice(');

    const flareUpdate = between('function updateFlareProjectiles(', '\nfunction updateExplosiveBolts(');
    expect(flareUpdate).toContain('if (!flareProjectileSystem.hasActiveProjectiles()) return');
    expect(flareUpdate).toContain('if (flareProjectileSystem.requiresWorldSnapshot(now))');
    expect(flareUpdate).toContain('prepareFlareTargetSnapshots()');
    expect(flareUpdate).toContain('flareFrameColliders = activeWorldColliders()');
    expect(flareUpdate).toContain('flareProjectileSystem.update(dt, now, flareProjectileCallbacks)');
    expect(flareUpdate).not.toContain('flareProjectileSystem.telemetry()');
    expect(flareUpdate).not.toContain('point.clone()');

    const targetSnapshots = between('function prepareFlareTargetSnapshots(', '\nfunction flareTargetView(');
    expect(targetSnapshots).toContain('target.root.getWorldPosition(entry.target.position)');
    expect(targetSnapshots).not.toContain('position.clone()');
  });

  it('keeps flare direct impact and ground DOT on exactly one authority lane each', () => {
    const apply = between('function applyFlareTargetDamage(', '\nfunction finishPendingFlareShot(');
    expect(apply).toContain("if (target.id === player.id) {");
    expect(apply).toContain('applyDamage(outgoing, ownerId, 1, false, cause);');
    expect(apply).toContain('const health = remoteHealthAuthorities.get(target.id);');
    expect(apply).toContain('sendAuthoritativeHit({');
    expect(apply).toContain("kind: 'shot'");

    const directHit = between('function handleFlareDirectHit(', '\nfunction handleFlareImpact(');
    expect(directHit).toContain('applyFlareTargetDamage(');
    expect(directHit).toContain('finishPendingFlareShot(hit.ownerId, hit.actionNonce, outcome)');

    const groundImpact = between('function handleFlareImpact(', '\nfunction handleFlareBurnPulse(');
    expect(groundImpact).toContain('flamethrowerStreamPresentation.igniteGround(');
    expect(groundImpact).not.toContain('applyFlareTargetDamage(');
    expect(groundImpact).not.toContain('flamethrowerGroundFires.ignite(');

    const callbacks = between('const flareProjectileCallbacks:', '\nfunction updateFlareProjectiles(');
    expect(callbacks).toContain('onDirectHit: handleFlareDirectHit');
    expect(callbacks).toContain('onImpact: handleFlareImpact');
    expect(callbacks).toContain('onBurnPulse: handleFlareBurnPulse');
  });
});
