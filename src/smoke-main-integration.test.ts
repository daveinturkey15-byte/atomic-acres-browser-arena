import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('host-authoritative smoke integration', () => {
  it('removes the local-only corridor mutation and admits host-traced paths after shot validation', () => {
    expect(source).not.toContain('function punchSmokeCorridors(');
    expect(source).toContain('function traceAuthoritativeSmokeShotSegments(');
    expect(source).toContain('const trace = traceWeaponPath(origin, direction, requestedDistance, weapon);');
    expect(source).toContain('if (!validateShotOrigin(request, shooterRewind.pose))');
    const validation = source.indexOf('if (!validateShotOrigin(request, shooterRewind.pose))');
    const derivedPath = source.indexOf('const admittedSmokeSegments = traceAuthoritativeSmokeShotSegments(', validation);
    const admittedCorridor = source.indexOf('admitAuthoritativeSmokeSegments(\n    request.shotId', derivedPath);
    const acceptedResult = source.indexOf("finish(outcomes.length > 0 ? 'accepted-hit' : 'accepted-miss'", admittedCorridor);
    expect(derivedPath).toBeGreaterThan(validation);
    expect(admittedCorridor).toBeGreaterThan(validation);
    expect(acceptedResult).toBeGreaterThan(admittedCorridor);
  });

  it('registers smoke only outside the client role and routes state through the host filter', () => {
    expect(source).toContain("if (network.role === 'client') return null;");
    expect(source).toContain('smokeAuthority.registerVolume({');
    expect(source).toContain("message.type !== 'smoke-state'");
    expect(source).toContain("message.by !== privateLobbySnapshot?.hostId");
    expect(source).toContain('smokeAuthority.applyAuthoritativeSnapshot(message.snapshot)');
  });

  it('reconstructs late join and clears semantic plus presentation state on epoch/disposal boundaries', () => {
    expect(source).toContain('broadcastSmokeState(true);');
    expect(source).toContain("smokeAuthority.reset(interactiveWorldMatchEpoch, mode === 'client' ? 'replica' : 'host')");
    expect(source).toMatch(/smokeVolumePresentationPool\.clear\(\);\s+smokeVolumes\.length = 0;\s+smokeAuthority\.reset/);
    expect(source).toContain('smokeVolumePresentationPool.release(existing.presentationLease)');
  });

  it('does not deep-snapshot unchanged smoke authority on every render frame', () => {
    const updateStart = source.indexOf('function updateOrdnanceVolumes(');
    const updateEnd = source.indexOf('\nfunction explodeGrenade(', updateStart);
    const updateBlock = source.slice(updateStart, updateEnd);
    expect(updateBlock).toContain('if (authorityChanged) synchronizeSmokePresentation(smokeAuthority.snapshot(nowHostTimeMs), nowHostTimeMs);');
    expect(updateBlock).toContain('else updateSmokePresentationLeases(nowHostTimeMs);');

    const broadcastStart = source.indexOf('function broadcastSmokeState(');
    const broadcastEnd = source.indexOf('\nfunction spawnSmokeVolume(', broadcastStart);
    const broadcastBlock = source.slice(broadcastStart, broadcastEnd);
    expect(broadcastBlock.indexOf('if (!forceReliable && !authorityChanged && !repairWindowDue) return;'))
      .toBeLessThan(broadcastBlock.indexOf('const message = smokeStateMessage(nowHostTimeMs);'));
    expect(source).toContain('broadcastSmokeState(false, nowHostTimeMs, true);');
  });

  it('detonates smoke on the first actor, world, floor, or out-of-bounds impact without a fuse beep', () => {
    expect(source).toContain("function grenadeDetonatesOnFirstImpact(grenade: GrenadeId): boolean {\n  return grenade === 'flash' || grenade === 'smoke';\n}");
    const start = source.indexOf('function updateGrenades(');
    const end = source.indexOf('\nfunction hitPracticeTarget(', start);
    const block = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain('!grenadeDetonatesOnFirstImpact(grenade.grenade) && fuseRemainingMs <= GRENADE_FUSE_BEEP_START_MS');
    expect(block).toContain('if (grenadeDetonatesOnFirstImpact(grenade.grenade) || grenade.grenade === \'semtex\')');
    expect(block).toMatch(/if \(!pointInsideBounds\([\s\S]+?armImpactGrenade\(grenade, now, grenade\.mesh\.position\);[\s\S]+?if \(grenadeDetonatesOnFirstImpact\(grenade\.grenade\)\) \{[\s\S]+?explodeGrenade\(grenade\);/);
    expect(block).toMatch(/if \(grenade\.mesh\.position\.y < 0\.18\)[\s\S]+?armImpactGrenade\(grenade, now, grenade\.mesh\.position\);[\s\S]+?if \(grenadeDetonatesOnFirstImpact\(grenade\.grenade\)\) \{[\s\S]+?explodeGrenade\(grenade\);/);
  });
});
