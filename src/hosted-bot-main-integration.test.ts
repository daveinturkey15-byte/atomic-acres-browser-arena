import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function functionBody(name: string, nextName: string): string {
  const start = main.indexOf(`function ${name}`);
  const end = main.indexOf(`function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('hosted bot skirmish parity integration', () => {
  it('uses the canonical bot damage scaler in solo and multiplayer', () => {
    const damage = functionBody('botCombatDamage', 'updateBots');
    expect(damage).toContain('return botScaledDamage(rawDamage)');
    expect(main).not.toContain('HOSTED_BOT_DAMAGE_MULTIPLIER');
  });

  it('routes the bot flare through host projectile authority instead of the hitscan loop', () => {
    const update = functionBody('updateBots', 'melee');
    const flareBranch = update.indexOf("if (fireAdapter === 'signal-flare-projectile')");
    const hitscanLoop = update.indexOf('for (let pellet = 0; pellet < pelletCount; pellet += 1)');
    expect(flareBranch).toBeGreaterThanOrEqual(0);
    expect(hitscanLoop).toBeGreaterThan(flareBranch);
    const branch = update.slice(flareBranch, hitscanLoop);
    expect(branch).toContain('botSignalFlareAimDirection(');
    expect(branch).toContain('flareProjectileSystem.spawn({');
    expect(branch).toContain('ownerId: bot.id');
    expect(branch).toContain('ownerTeam: bot.team');
    expect(branch).toContain('authority: true');
    expect(branch).toContain('broadcastHostedBotFlareLaunchPresentation(bot, botMuzzle ?? origin, actionNonce)');
    expect(branch).toContain('broadcastFlarePresentationState()');
    expect(branch).toContain('persistActiveHostMatchCheckpoint()');
    expect(branch).toContain('continue;');
    expect(branch).not.toContain('resolveBallisticHitscanAgainstTarget(');
    expect(branch).not.toContain('spawnTracer(');

    const damage = functionBody('applyFlareTargetDamage', 'finishPendingFlareShot');
    expect(damage).toContain('const ownerBot = bots.get(ownerId)');
    expect(damage).toContain('applyHostedBotDamageToRemote(ownerBot, {');
    expect(damage).toContain("now, 'signal-flare-projectile'");
    const guestProjection = functionBody('acceptHostedBotDamage', 'botCombatDamage');
    expect(guestProjection).toContain("message.weapon === 'flamethrower'");
    expect(guestProjection).toContain("message.presentation === 'signal-flare-projectile'");
    expect(guestProjection).toContain('if (!hasDedicatedPresentation)');
    expect(guestProjection).toContain('reconcileLocalAuthoritativeHealth(');
  });

  it('presents host-bot flamethrower hits and misses on guests without a ballistic tracer', () => {
    const update = functionBody('updateBots', 'melee');
    const pelletLoop = update.indexOf('for (let pellet = 0; pellet < pelletCount; pellet += 1)');
    const broadcast = update.indexOf('broadcastHostedBotFlamethrowerPresentation(', pelletLoop);
    const hitGate = update.indexOf('if (hitTarget)', broadcast);
    expect(pelletLoop).toBeGreaterThanOrEqual(0);
    expect(broadcast).toBeGreaterThan(pelletLoop);
    expect(hitGate).toBeGreaterThan(broadcast);
    expect(update.slice(pelletLoop, hitGate)).toContain('flamethrowerStreamPresentation.emit(');
    expect(update.slice(pelletLoop, hitGate)).toContain('if (flamethrowerShot) {');
    expect(update).toContain("flamethrowerShot ? 'flamethrower-stream' : 'ballistic-ray'");

    const sender = functionBody('broadcastHostedBotFlamethrowerPresentation', 'broadcastHostedBotFlareLaunchPresentation');
    expect(sender).toContain("presentation: 'flamethrower-stream'");
    expect(sender).not.toContain('target:');
    expect(sender).not.toContain('damage');

    const receiver = functionBody('acceptHostedBotWeaponPresentation', 'botElevationAt');
    expect(receiver).toContain('hostedBotWeaponPresentationReplay.admit(');
    expect(receiver).toContain("admitted.presentation === 'flamethrower-stream'");
    expect(receiver).toContain('flamethrowerStreamPresentation.emit(');
    expect(receiver).toContain('audio.shot(admitted.weapon, true, origin.distanceTo(camera.position))');
    expect(receiver).not.toContain('spawnTracer(');
    expect(receiver).not.toContain('audio.impact(');

    const damageSender = functionBody('applyHostedBotDamageToRemote', 'acceptHostedBotDamage');
    expect(damageSender).toContain("authoredWeapon === 'flamethrower' ? 'flamethrower-stream' : 'ballistic-ray'");
    expect(damageSender).toContain('authoredWeapon: WeaponId = bot.weapon');
    expect(damageSender).toContain('weapon: authoredWeapon');
    expect(damageSender).toContain("cause: { kind: 'gun', weapon: authoredWeapon }");
    const damageReceiver = functionBody('acceptHostedBotDamage', 'botCombatDamage');
    expect(damageReceiver).toContain('if (!hasDedicatedPresentation)');
    expect(damageReceiver.indexOf('spawnTracer(')).toBeGreaterThan(damageReceiver.indexOf('if (!hasDedicatedPresentation)'));
  });

  it('presents each bot flare launch once without spawning a second replica or impact sound', () => {
    const sender = functionBody('broadcastHostedBotFlareLaunchPresentation', 'acceptHostedBotWeaponPresentation');
    expect(sender).toContain("presentation: 'signal-flare-launch'");
    expect(sender).not.toContain('end:');
    expect(sender).not.toContain('damage');

    const receiver = functionBody('acceptHostedBotWeaponPresentation', 'botElevationAt');
    expect(receiver).toContain('hostedBotWeaponPresentationReplay.admit(');
    expect(receiver).toContain('audio.shot(admitted.weapon, true, origin.distanceTo(camera.position))');
    expect(receiver).not.toContain('flareProjectileSystem.spawn(');
    expect(receiver).not.toContain('audio.impact(');
  });

  it('buffers ordinary guest bot poses and snaps only lifecycle discontinuities', () => {
    const admission = functionBody('acceptHostedBotState', 'updateHostedBotReplicaPresentations');
    expect(admission).toContain('bot.networkInterpolation.push({');
    expect(admission).toContain('const discontinuity = bot.networkContinuity !== continuity');
    expect(admission).toContain('if (discontinuity)');
    expect(admission).not.toContain('const priorPosition = bot.position.clone()');
    const presentation = functionBody('updateHostedBotReplicaPresentations', 'botHasLineOfSight');
    expect(presentation).toContain('bot.networkInterpolation.sample(hostNow, interpolationDelayState.delayMs)');
    expect(presentation).toContain('bot.root.position.copy(bot.position)');
    expect(main).toContain('updateHostedBotReplicaPresentations(frameDt, now)');
  });

  it('keeps guest hosted-bot admission off the authoritative spawn selector', () => {
    const selector = functionBody('selectSafeBotSpawn', 'neonBotHazeTexture');
    const admission = functionBody('acceptHostedBotState', 'updateHostedBotReplicaPresentations');
    expect(selector).toContain("if (network.role === 'client') throw new Error('Bot spawn selection is host-only');");
    expect(admission).toContain('spawnBot(index, true, false, new THREE.Vector3(snapshot.x, snapshot.y, snapshot.z));');
    expect(main).toContain('function spawnBot(index: number, hosted = false, dormantPresentation = false, initialPosition?: THREE.Vector3)');
    expect(main).toContain('const spawn = initialPosition ?? selectSafeBotSpawn(botTeam, id);');
  });

  it('keeps hosted-bot snapshots flowing while the host player respawns', () => {
    const start = main.indexOf('function scheduleStateBroadcast(): void');
    const end = main.indexOf('\nscheduleStateBroadcast();', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const scheduling = main.slice(start, end);
    expect(scheduling).toContain('player.alive || replicateHostedBots');
    expect(scheduling).toContain('if (!matchAdmissionPresentationPaused && hostedBotReplicationActive(');
    expect(scheduling).toContain(')) broadcastHostedBotState();');
    const heartbeatStart = scheduling.indexOf(
      "if (gameStarted && !matchAdmissionPresentationPaused && network.role !== 'offline' && player.alive",
    );
    const heartbeatEnd = scheduling.indexOf('// Bot simulation and damage remain authoritative');
    expect(heartbeatStart).toBeGreaterThanOrEqual(0);
    expect(heartbeatEnd).toBeGreaterThan(heartbeatStart);
    const localPlayerHeartbeat = scheduling.slice(heartbeatStart, heartbeatEnd);
    expect(localPlayerHeartbeat).toContain('network.send(createStateMessage())');
    expect(localPlayerHeartbeat).toContain("network.role === 'client' && awaitingCanonicalGuestAuthority");
    expect(localPlayerHeartbeat).not.toContain('broadcastHostedBotState()');
  });

  it('retains hosted-bot score rows in every active lobby heartbeat', () => {
    const snapshot = functionBody('hostSnapshot', 'broadcastHostLobby');
    expect(snapshot).toContain('...hostedBotIds(privateMatchConfig.hostedBotCount)');
    expect(snapshot).toContain('authoritativeScores.get(id)');
    expect(snapshot).not.toContain('members.map((member) => authoritativeScores.get(member.id)');
  });
});
