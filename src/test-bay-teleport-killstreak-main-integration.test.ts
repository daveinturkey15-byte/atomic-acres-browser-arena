import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Pass 66 test-bay QA teleport support lifecycle integration', () => {
  it('advances offline/host killstreak authority with local continuity before real F arbitration', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const start = source.indexOf('  teleportPlayer: (x, y, z, yaw = player.yaw, pitch = player.pitch) => {');
    const end = source.indexOf('  setCaptureCameraPose:', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const integration = source.slice(start, end);
    expect(integration).toContain("gameStarted && matchState.phase === 'active' && network.role !== 'client'");
    expect(integration).toContain('killstreakRuntime.recordActorDeath(player.id, localContinuity);');
    expect(integration).toContain('refreshLocalKillstreakSnapshot();');
    expect(integration).toContain("if (network.role === 'host') broadcastKillstreakState();");
    expect(integration.indexOf('localContinuity += 1;'))
      .toBeLessThan(integration.indexOf('killstreakRuntime.recordActorDeath(player.id, localContinuity);'));
    expect(integration).not.toContain('grantTrainingReward');
  });

  it('keeps deterministic possessed-chopper aiming debug-only and unable to submit damage', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const start = source.indexOf('  aimPossessedChopperAtTrainingDummy: (targetId) => {');
    const end = source.indexOf('\n  aimAtRemote:', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const integration = source.slice(start, end);
    expect(integration).toContain("possession?.kind !== 'chopper-gunner'");
    expect(integration).toContain("candidate.kind === 'training-dummy' && candidate.active");
    expect(integration).toContain('chopperGunnerCameraOrigin(entity.position, entity.attitude)');
    expect(integration).toContain('trainingDummySupportPoint(target)');
    expect(integration).toContain('killstreakLineOfSight(');
    expect(integration).toContain('activeWorldColliders()');
    expect(integration).toContain('player.yaw = Math.atan2(-delta.x, -delta.z);');
    expect(integration).toContain('player.pitch = THREE.MathUtils.clamp(');
    expect(integration).not.toContain('requestKillstreakControl');
    expect(integration).not.toContain('killstreakRuntime');
    expect(integration).not.toContain('hitPracticeTarget');
    expect(integration).not.toContain('applyKillstreakDamageEvent');
    expect(integration).not.toContain('recordOwnerSupportDamage');
    expect(integration).not.toContain('setLocalTriggerHeld');
    expect(integration).not.toContain('triggerHeld');
  });
});
