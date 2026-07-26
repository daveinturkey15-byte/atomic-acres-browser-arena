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
});
