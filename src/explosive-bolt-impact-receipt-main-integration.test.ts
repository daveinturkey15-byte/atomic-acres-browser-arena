import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../tests/e2e/pass71-glass-lifecycle-matrix.spec.ts', import.meta.url), 'utf8');

function between(source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  expect(start, startToken).toBeGreaterThanOrEqual(0);
  expect(end, endToken).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('explosive-bolt window impact receipt integration', () => {
  it('records one local authoritative receipt only at the winning world/glass collision', () => {
    const update = between(main, 'function updateExplosiveBolts(', '\nfunction throwGrenade(');
    const targetBranch = between(
      update,
      'if (targetHitIndex >= 0 && targetFraction <= worldFraction && targetFraction <= glassFraction) {',
      '} else if (worldCollision || glassCollision) {',
    );
    const worldBranch = between(
      update,
      '} else if (worldCollision || glassCollision) {',
      '} else {\n        bolt.mesh.position.add(delta);',
    );
    expect(targetBranch).not.toContain('recordLocalExplosiveBoltWindowImpactReceipt(');
    expect(worldBranch).toContain('bolt.impactWindowId = worldCollision !== null && worldFraction <= glassFraction');
    expect(worldBranch).toContain('recordLocalExplosiveBoltWindowImpactReceipt(bolt, bolt.impactWindowId, now);');
    const impactIdentity = worldBranch.indexOf('bolt.impactWindowId =');
    const impactedAt = worldBranch.indexOf('bolt.impactedAt = now;');
    const detonatesAt = worldBranch.indexOf('bolt.detonatesAt = Math.min(');
    const receipt = worldBranch.indexOf('recordLocalExplosiveBoltWindowImpactReceipt(');
    expect(impactedAt).toBeGreaterThan(impactIdentity);
    expect(detonatesAt).toBeGreaterThan(impactedAt);
    expect(receipt).toBeGreaterThan(detonatesAt);
  });

  it('atomically snapshots actual event time, impact pose and intact pane authority without backdating', () => {
    const record = between(
      main,
      'function recordLocalExplosiveBoltWindowImpactReceipt(',
      '\nfunction armLocalExplosiveBoltImpactObservation(',
    );
    expect(record).toContain('if (!bolt.authority || bolt.ownerId !== player.id) return;');
    expect(record).toContain('const state = pane?.glassState;');
    expect(record).toContain("projection.phase !== 'intact'");
    expect(record).toContain('activeGlassDynamicColliders()');
    expect(record).toContain('rapierDynamicColliderCount: characterPhysics?.dynamicColliderCount() ?? 0');
    expect(record).toContain('spawnedAt: bolt.spawnedAt,');
    expect(record).toContain('impactedAt,');
    expect(record).toContain('bolt.mesh.position.x');
    expect(record).toContain('detonatesAt: bolt.detonatesAt,');
    expect(record).toContain('broken,');
    expect(record).toContain('visible,');
    expect(record).toContain('activeWorldColliderPresent,');
    expect(record).not.toContain('performance.now()');
  });

  it('arms before fire, binds the actual newly spawned identity and adjudicates only actual event latency', () => {
    const helper = between(
      browser,
      'async function fireAndObserveLiveCrossbowImpact(',
      '\nasync function resetBreakableWindows(',
    );
    const arm = helper.indexOf('debug.armExplosiveBoltImpactObservation(paneIndex)');
    const fire = helper.indexOf('const action = debug.fireOnce();');
    const bind = helper.indexOf('debug.bindExplosiveBoltImpactObservation(arm, action)');
    const read = helper.indexOf('.readExplosiveBoltImpactReceipt(bound, maxImpactLatencyMs)');
    expect(arm).toBeGreaterThanOrEqual(0);
    expect(fire).toBeGreaterThan(arm);
    expect(bind).toBeGreaterThan(fire);
    expect(read).toBeGreaterThan(bind);
    expect(helper).toContain('maxImpactLatencyMs: LIVE_CROSSBOW_IMPACT_TIMEOUT_MS');
    expect(helper).toContain('actualImpactLatencyMs: read.actualImpactLatencyMs');
    expect(helper).toContain('observedAfterDetonation: read.observedAfterDetonation');
    expect(helper).not.toContain('projectileGlass.explosiveBolts');
    expect(helper).not.toContain('detonatesInMs');

    const debugFire = between(main, 'fireOnce: () => {', '\n  setTriggerHeld:');
    expect(debugFire).toContain('const previousExplosiveBoltAction = lastLocalExplosiveBoltActionIdentity;');
    expect(debugFire).toContain('lastLocalExplosiveBoltActionIdentity !== previousExplosiveBoltAction');
    const bindRuntime = between(
      main,
      'function bindLocalExplosiveBoltImpactObservation(',
      '\nfunction readLocalExplosiveBoltImpactReceipt(',
    );
    expect(bindRuntime).toContain('action !== lastLocalExplosiveBoltActionIdentity');
    expect(bindRuntime).toContain('!explosiveBoltImpactReceipts.acceptsCursor(arm.cursor)');
  });

  it('keeps receipts past detonation and clears them only at the match projectile boundary', () => {
    const detonate = between(main, 'function detonateExplosiveBoltEntity(', '\nfunction updateExplosiveBolts(');
    expect(detonate).not.toContain('explosiveBoltImpactReceipts.clear()');
    const clear = between(main, 'function clearGrenades()', '\nfunction clearFieldSupport()');
    expect(clear).toContain('explosiveBoltImpactReceipts.clear();');
    expect(main.match(/explosiveBoltImpactReceipts\.clear\(\)/gu)).toHaveLength(1);
  });
});
