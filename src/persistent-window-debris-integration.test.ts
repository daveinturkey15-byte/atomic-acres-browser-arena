import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('persistent physical house-window debris integration', () => {
  it('keeps one bounded major pane per broken window in the shared Rapier budget', () => {
    expect(source).toContain('const persistentWindowDebris = new Map<string, PersistentWindowDebris>()');
    expect(source).toContain('MAX_MAJOR_DEBRIS_BODIES - runtimeBodies.length');
    expect(source).toContain('Math.min(capacity, SHARED_MAJOR_DEBRIS_BUDGET.window)');
    expect(source).toContain("canAdmitMajorDebris(counts, 'window')");
    expect(source).toContain('characterPhysics.syncMajorDebrisBodies(activeMajorDebrisPhysicsBodies(), authoritativeResync)');
    expect(source).toContain('characterPhysics.prewarmMajorDebrisBodies(arena.breakableWindows.map((window) => {');
    expect(source).toContain('spawnPersistentWindowDebris(window, normal)');
  });

  it('updates fragments through bounded physics, support-aware fallback, settle and cleanup', () => {
    const start = source.indexOf('function spawnPersistentWindowDebris(');
    const end = source.indexOf('\nfunction clearPersistentWindowDebris(', start);
    const block = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain('persistentWindowDebris.set(id, {');
    expect(block).toContain('physicsActive: physicsEligible,');
    // Owner requirement: shards always reach the ground, so the record carries a
    // presentation-only fall used when Rapier publishes no pose for the body.
    expect(block).toContain('fallbackSettled: false,');
    expect(block).toContain('receivedPhysicsPose: false,');
    expect(block).not.toContain('setTimeout');
    expect(block).toContain('fallbackSupportSource: support.source,');
    expect(block).toContain('root.userData.persistentMajorDebris = true');
    expect(block).toContain('scene.add(root)');
    expect(block).not.toContain('if (reducedRenderMode)');
    expect(block).not.toContain('root.visible = false');
    expect(source).toContain('entry.root.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z)');
    expect(source).toContain('entry.root.quaternion.set(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z, snapshot.rotation.w)');
    expect(source).toContain('.filter((entry) => entry.physicsActive)');
    expect(source).toContain('const lifecycle = windowGlassDebrisLifecycleMode({');
    expect(source).toContain("if (lifecycle === 'expired') {");
    expect(source).toContain("if (lifecycle === 'settled') {");
    expect(source).toContain('entry.receivedPhysicsPose = false;');
    expect(source).toContain('entry.fallbackVelocity.y = Math.min(entry.fallbackVelocity.y, -0.9);');
    expect(source).toContain('entry.physicsActive = false;');
    expect(source).toContain('if (retirePhysics) scheduleWindowGlassPhysicsSync();');
    expect(source).toContain('persistentWindowDebris.delete(id);');
    expect(source).toContain('entry.root.visible = false;');
  });

  it('preserves canonical pane damage while temporary debris also clears at the reset boundary', () => {
    const resetStart = source.indexOf('function resetBreakableWindows()');
    const resetEnd = source.indexOf('\nconst CORPSE_LIFETIME_MS', resetStart);
    const resetBlock = source.slice(resetStart, resetEnd);
    expect(resetBlock).toContain('clearPersistentWindowDebris()');
    expect(source.match(/clearPersistentWindowDebris\(\)/g)).toHaveLength(2);
    expect(source).toContain('WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS');
  });

  it('uses one prewarmed instanced shard presentation instead of a second cosmetic RAF path', () => {
    const poolStart = source.indexOf('async function withStagedWindowGlassDebrisPool(');
    const poolEnd = source.indexOf('\nfunction clearPersistentWindowDebris(', poolStart);
    const poolBlock = source.slice(poolStart, poolEnd);
    expect(poolStart).toBeGreaterThan(-1);
    expect(poolEnd).toBeGreaterThan(poolStart);
    expect(source).not.toContain('function spawnGlassShards(');
    expect(source).not.toContain("root.name = 'breaking-window-shards'");
    expect(poolBlock).toContain('const pooled = pooledWindowDebris.get(windowDebrisPoolKey(arena.id, window.id))');
    expect(poolBlock).toContain('updateFracturedWindowDebrisVisual(pooled.root, 0)');
    expect(poolBlock).toContain('root.userData.persistentMajorDebris = true');
    expect(poolBlock).not.toContain('requestAnimationFrame');
    expect(poolBlock).not.toContain('.material.clone()');
    expect(source).toContain('spawnPersistentWindowDebris(window, normal)');
  });

  it('coalesces deferred physics reconciliation across same-action multi-pane breaches', () => {
    const spawnStart = source.indexOf('function spawnPersistentWindowDebris(');
    const breachEnd = source.indexOf('\nfunction breakWindowsAlongBallisticTrace(', spawnStart);
    const block = source.slice(spawnStart, breachEnd);
    const breakStart = block.indexOf('function breakHouseWindow(');
    const breakBlock = block.slice(breakStart);
    const deferredSync = 'scheduleWindowGlassPhysicsSync();';

    expect(spawnStart).toBeGreaterThan(-1);
    expect(breachEnd).toBeGreaterThan(spawnStart);
    expect(source).toContain('if (windowGlassPhysicsSyncScheduled) {');
    expect(source).toContain('scheduleBrowserPreparationIdleTask(() => {');
    expect(breakBlock).toContain('spawnPersistentWindowDebris(window, normal);');
    expect(breakBlock).toContain(deferredSync);
    expect(breakBlock.indexOf('window.broken = true;'))
      .toBeLessThan(breakBlock.indexOf('spawnPersistentWindowDebris(window, normal);'));
    expect(breakBlock.indexOf('spawnPersistentWindowDebris(window, normal);'))
      .toBeLessThan(breakBlock.indexOf(deferredSync));
  });

  it('lets later explosions re-impulse only still-active shed and falling window bodies', () => {
    const start = source.indexOf('function applyInteractiveWorldExplosion(');
    const end = source.indexOf('\ndocument.documentElement.dataset.arenaId', start);
    const block = source.slice(start, end);
    expect(block).toContain('for (const body of activeMajorDebrisPhysicsBodies())');
    expect(block).toContain('characterPhysics.applyMajorDebrisImpulse(');
    expect(block).toContain('mutations <= 0 && debrisImpulses <= 0');
  });
});
