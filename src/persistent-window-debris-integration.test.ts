import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('persistent physical house-window debris integration', () => {
  it('keeps one bounded major pane per broken window in the shared Rapier budget', () => {
    expect(source).toContain('const persistentWindowDebris = new Map<string, PersistentWindowDebris>()');
    expect(source).toContain('MAX_MAJOR_DEBRIS_BODIES - shedBodies.length');
    expect(source).toContain('characterPhysics.syncMajorDebrisBodies(activeMajorDebrisPhysicsBodies(), authoritativeResync)');
    expect(source).toContain('spawnPersistentWindowDebris(window, normal)');
  });

  it('updates the visible fragment from its physical body and does not age-dispose it', () => {
    const start = source.indexOf('function spawnPersistentWindowDebris(');
    const end = source.indexOf('\nfunction clearPersistentWindowDebris(', start);
    const block = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain('persistentWindowDebris.set(id, { id, windowId: window.id, root, definition })');
    expect(block).not.toContain('setTimeout');
    expect(block).not.toContain('expiresAt');
    expect(block).toContain('root.userData.persistentMajorDebris = true');
    expect(block).toContain('scene.add(root)');
    expect(block).not.toContain('if (reducedRenderMode)');
    expect(block).not.toContain('root.visible = false');
    expect(source).toContain('entry.root.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z)');
    expect(source).toContain('entry.root.quaternion.set(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z, snapshot.rotation.w)');
  });

  it('clears the persistent major pane only at the explicit window reset boundary', () => {
    const resetStart = source.indexOf('function resetBreakableWindows()');
    const resetEnd = source.indexOf('\nconst CORPSE_LIFETIME_MS', resetStart);
    const resetBlock = source.slice(resetStart, resetEnd);
    expect(resetBlock).toContain('clearPersistentWindowDebris()');
    expect(source.match(/clearPersistentWindowDebris\(\)/g)).toHaveLength(2);
  });

  it('keeps short-lived glass flecks cosmetic without mistaking them for the persistent major pane', () => {
    const shardStart = source.indexOf('function spawnGlassShards(');
    const shardEnd = source.indexOf('\nfunction deterministicWindowUnit(', shardStart);
    const shardBlock = source.slice(shardStart, shardEnd);
    expect(shardBlock).toContain("root.name = 'breaking-window-shards'");
    expect(shardBlock).toContain('if (age >= 0.9)');
    expect(shardBlock).not.toContain('persistentMajorDebris');
    expect(source).toContain('spawnPersistentWindowDebris(window, normal)');
  });

  it('lets later explosions re-impulse both shed and persistent window bodies', () => {
    const start = source.indexOf('function applyInteractiveWorldExplosion(');
    const end = source.indexOf('\ndocument.documentElement.dataset.arenaId', start);
    const block = source.slice(start, end);
    expect(block).toContain('for (const body of activeMajorDebrisPhysicsBodies())');
    expect(block).toContain('characterPhysics.applyMajorDebrisImpulse(');
    expect(block).toContain('mutations <= 0 && debrisImpulses <= 0');
  });
});
