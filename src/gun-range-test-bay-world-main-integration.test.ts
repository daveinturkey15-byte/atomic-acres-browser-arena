import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function functionBlock(name: string, next: string): string {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`\nfunction ${next}`, start);
  expect(start, `${name}:start`).toBeGreaterThanOrEqual(0);
  expect(end, `${name}:end`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Pass 70 Gun Range test-bay runtime integration', () => {
  it('merges the moving secure leaf into hitscan ballistics as well as player/projectile collision', () => {
    const ballistics = functionBlock('activeBallisticSurfaces(', 'activeRaycastMeshes(');
    expect(ballistics).toContain("selectedArena.id === 'gun-range'");
    expect(ballistics).toContain('gunRangeTestBayDoorBallisticSurfaces');
    expect(ballistics.indexOf('...doorSurfaces')).toBeLessThan(ballistics.indexOf('...interactiveWorldRuntime.collisions().ballisticSurfaces'));

    const updateStart = source.indexOf("} else if (selectedArena.id === 'gun-range') {");
    const updateEnd = source.indexOf('\n    waterSystem.update(', updateStart);
    const update = source.slice(updateStart, updateEnd);
    expect(update).toContain('synchronizeGunRangeTestBayDoorWorld(doorState, true);');
    expect(update).not.toContain('updateGunRangeTestBayDoor(arena.root, now, player.position)');

    const synchronization = functionBlock('synchronizeGunRangeTestBayDoorWorld(', 'sampleAuthoritativeGunRangeMatchClock(');
    expect(synchronization).toContain('gunRangeTestBayDoorColliders = doorFrame.dynamicColliders;');
    expect(synchronization).toContain('gunRangeTestBayDoorBallisticSurfaces = doorFrame.dynamicBallisticSurfaces;');
    expect(synchronization).toContain('syncInteractiveWorldPhysics();');
    expect(synchronization).toContain('applyGunRangeTestBayDoorState(arena.root, doorState)');
  });

  it('projects one host-authored multi-player door state on every peer and hidden-host heartbeat', () => {
    const authority = functionBlock('sampleAuthoritativeGunRangeTestBayDoor(', 'projectActiveGunRangeTestBayDoor(');
    expect(authority).toContain('admittedGunRangeClockParticipants()');
    expect(authority).toContain('const sampleTimeMs = Math.max(nowHostTimeMs, prior.updatedAtMs);');
    expect(authority).toContain('participant.admitted && participant.connected && participant.alive');
    expect(authority).toContain('advanceGunRangeTestBayDoorForObservers(');

    const projection = functionBlock('projectActiveGunRangeTestBayDoor(', 'initializeGunRangeTestBayDoor(');
    expect(projection).toContain("network.role !== 'client'");
    expect(projection).toContain('hostTimeToGuestMono(');
    expect(projection).toContain('Math.max(0, Math.min(nowLocalMonoMs, sampleAtLocalMonoMs))');
    expect(projection).toContain('projectGunRangeTestBayDoorState(');

    const hostSnapshot = functionBlock('hostSnapshot(', 'broadcastHostLobby(');
    expect(hostSnapshot).toContain("const testBayDoor = phase === 'active'");
    expect(hostSnapshot).toContain('sampleAuthoritativeGunRangeTestBayDoor(snapshotHostTimeMs)');
    expect(hostSnapshot).toContain('testBayDoor,');

    const accept = functionBlock('acceptLobbyState(', 'authorizeRedeploy(');
    expect(accept).toContain('gunRangeTestBayDoorState = message.snapshot.testBayDoor;');

    const heartbeat = functionBlock('scheduleStateBroadcast(', 'effectiveFramePacing(');
    expect(heartbeat).toContain('const doorState = updateGunRangeTestBayDoorAuthority(now);');
    expect(heartbeat).toContain('synchronizeGunRangeTestBayDoorWorld(doorState, false);');
    expect(heartbeat).toContain('flushGunRangeTestBayDoorBroadcast();');
    expect(heartbeat.indexOf('updateGunRangeTestBayDoorAuthority(now);'))
      .toBeLessThan(heartbeat.indexOf('network.send(createStateMessage())'));
    expect(heartbeat.indexOf('synchronizeGunRangeTestBayDoorWorld(doorState, false);'))
      .toBeLessThan(heartbeat.indexOf('flushGunRangeTestBayDoorBroadcast();'));

    const broadcast = functionBlock('broadcastHostLobby(', 'saveLastHostedRoomCode(');
    expect(broadcast.indexOf('synchronizeGunRangeTestBayDoorWorld('))
      .toBeLessThan(broadcast.indexOf('network.send(message);'));
  });

  it('projects live moving training dummies into the crossbow target buffer and damage path', () => {
    const fill = functionBlock('fillExplosiveBoltTargets(', 'explosiveBoltTargetDistance(');
    expect(fill).toContain("selectedArena.id === 'gun-range'");
    expect(fill).toContain("target.kind !== 'training-dummy'");
    expect(fill).toContain("'practice-target'");
    expect(fill).toContain('target.root.getWorldPosition(explosiveBoltPracticeTargetPositionScratch);');

    const damage = functionBlock('applyExplosiveBoltTargetDamage(', 'detonateExplosiveBoltEntity(');
    expect(damage).toContain("targetKind === 'practice-target'");
    expect(damage).toContain("candidate.kind === 'training-dummy'");
    expect(damage).toContain("weaponOrEffect: 'explosive-crossbow'");
    expect(damage).toContain("hitPracticeTarget(practiceTarget.id, boundedDamage, 'body'");
  });
});
