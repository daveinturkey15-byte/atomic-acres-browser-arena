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
    expect(source).toContain('spawnPersistentWindowDebris(window, normal, impactId)');
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
    expect(block).toContain('fallbackStateObservedAt: spawnedAt,');
    expect(block).toContain('fallbackStateIncludesPhysicsPose: false,');
    expect(block).toContain('lifecycleMilestones: [],');
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
    expect(source).toContain("if (lifecycle === 'settled' && beforeExpiry && !entry.fallbackSettled) {");
    expect(source).toContain('const retainedPolicyInterval = entry.fallbackSettled');
    expect(source).toContain('retainedWindowDebrisFallbackInterval(entry, now);');
    expect(source).toContain('stateStartAt: entry.fallbackStateObservedAt,');
    expect(source).toContain('captureStartAt: Math.max(');
    expect(source).toContain('const preCapture = integrateWindowGlassDebrisFallback(');
    expect(source).toContain('const result = integrateWindowGlassDebrisFallback(');
    expect(source).toContain('(fallbackSupportCandidates = windowDebrisFallbackSupportCandidates());');
    expect(source).toContain('entry.physicsActive = false;');
    expect(source).toContain('characterPhysics.syncMajorDebrisBodies(activeMajorDebrisPhysicsBodies(), false);');
    expect(source).toContain('retainWindowDebrisLifecycleReceipt(entry, now);');
    expect(source).toContain('persistentWindowDebris.delete(entry.id);');
    expect(source).toContain('entry.root.visible = false;');
    expect(source).not.toContain('const fallbackDt = Math.min(0.05');
  });

  it('captures the first real Rapier pose immediately after body sync without backdating a late pose', () => {
    const spawnStart = source.indexOf('function spawnPersistentWindowDebrisSynchronously(');
    const spawnEnd = source.indexOf('\nfunction clearPersistentWindowDebris(', spawnStart);
    const spawn = source.slice(spawnStart, spawnEnd);
    const admission = spawn.indexOf('persistentWindowDebris.set(id, {');
    const eligibility = spawn.indexOf('if (physicsEligible && characterPhysics) {');
    const immediateSync = spawn.indexOf('characterPhysics.syncMajorDebrisBodies(activeMajorDebrisPhysicsBodies());');
    const actualSnapshots = spawn.indexOf('const admittedSnapshots = characterPhysics.majorDebrisSnapshots();');
    const actualObservedAt = spawn.indexOf('const observedAt = performance.now();', actualSnapshots);
    const immediateIngest = spawn.indexOf(
      'ingestPersistentWindowDebrisPhysicsSnapshots(admittedSnapshots, observedAt);',
    );
    expect(admission).toBeGreaterThanOrEqual(0);
    expect(eligibility).toBeGreaterThan(admission);
    expect(immediateSync).toBeGreaterThan(eligibility);
    expect(actualSnapshots).toBeGreaterThan(immediateSync);
    expect(actualObservedAt).toBeGreaterThan(actualSnapshots);
    expect(immediateIngest).toBeGreaterThan(actualObservedAt);
    expect(spawn.slice(eligibility, immediateIngest)).not.toContain('spawnedAt +');

    const syncStart = source.indexOf('function syncInteractiveWorldPhysics(');
    const syncEnd = source.indexOf('\nfunction scheduleWindowGlassPhysicsSync()', syncStart);
    const sync = source.slice(syncStart, syncEnd);
    const bodySync = sync.indexOf('characterPhysics.syncMajorDebrisBodies(');
    const ingest = sync.indexOf(
      'ingestPersistentWindowDebrisPhysicsSnapshots(characterPhysics.majorDebrisSnapshots(), performance.now());',
    );
    expect(bodySync).toBeGreaterThanOrEqual(0);
    expect(ingest).toBeGreaterThan(bodySync);

    const applyStart = source.indexOf('function applyPersistentWindowDebrisPhysicsSnapshot(');
    const applyEnd = source.indexOf('\nfunction ingestPersistentWindowDebrisPhysicsSnapshots(', applyStart);
    const apply = source.slice(applyStart, applyEnd);
    expect(apply).toContain('if (entry.firstPhysicsPoseAt === null) entry.firstPhysicsPoseAt = observedAt;');
    expect(apply).toContain("recordWindowDebrisLifecycleMilestone(entry, 'initial', observedAt, {");
    expect(apply).toContain('position,');
    expect(apply.indexOf('if (!applyState) return;'))
      .toBeLessThan(apply.indexOf("recordWindowDebrisLifecycleMilestone(entry, 'initial', observedAt"));
    expect(apply.indexOf("recordWindowDebrisLifecycleMilestone(entry, 'initial', observedAt"))
      .toBeLessThan(apply.indexOf('entry.root.position.set(snapshot.position.x'));
    expect(apply).toContain('entry.fallbackStateObservedAt = observedAt;');
    expect(apply).toContain('entry.fallbackStateIncludesPhysicsPose = true;');
  });

  it('catches up before hard expiry with one support snapshot and phase-monotonic receipts', () => {
    const updateStart = source.indexOf('function updatePersistentWindowDebrisPhysics(');
    const updateEnd = source.indexOf('\nfunction majorDebrisDefinitionFromSnapshot(', updateStart);
    const update = source.slice(updateStart, updateEnd);
    const snapshotRead = update.indexOf('const snapshotList = characterPhysics?.majorDebrisSnapshots() ?? [];');
    const observedAt = update.indexOf('const now = performance.now();');
    const candidateDeclaration = update.indexOf(
      'let fallbackSupportCandidates: readonly WindowGlassDebrisFallbackSupportCandidate[] | null = null;',
    );
    const entryLoop = update.indexOf('for (const entry of persistentWindowDebris.values())');
    const preCapture = update.indexOf('const preCapture = integrateWindowGlassDebrisFallback(');
    const capture = update.indexOf('const result = integrateWindowGlassDebrisFallback(', preCapture);
    const physicalRetire = update.indexOf(
      'characterPhysics.syncMajorDebrisBodies(activeMajorDebrisPhysicsBodies(), false);',
    );
    const milestoneCommit = update.indexOf('for (const pending of pendingMilestones)');
    const expiry = update.indexOf('for (const entry of expiredEntries)');
    expect(candidateDeclaration).toBeGreaterThanOrEqual(0);
    expect(snapshotRead).toBeGreaterThanOrEqual(0);
    expect(observedAt).toBeGreaterThan(snapshotRead);
    expect(candidateDeclaration).toBeLessThan(entryLoop);
    expect(update.match(/windowDebrisFallbackSupportCandidates\(\)/gu)).toHaveLength(1);
    expect(update).toContain('const retainedPolicyInterval = entry.fallbackSettled');
    expect(source).toContain('const retainedFallbackInterval = entry.fallbackSettled');
    expect(source).toContain('windowGlassDebrisPhysicsSnapshotMode({');
    expect(source).toContain("snapshotMode === 'state-and-lifecycle'");
    expect(update).toContain('retainedWindowDebrisFallbackInterval(entry, now);');
    expect(update).toContain('retainedPolicyInterval !== null');
    expect(update).toContain('stateStartAt: entry.fallbackStateObservedAt,');
    expect(update).toContain('captureStartAt: Math.max(');
    expect(update).toContain('const retainedState = snapshotWindowGlassDebrisFallbackState({');
    expect(update).toContain('position: entry.root.position,');
    expect(update).toContain('rotation: entry.root.rotation,');
    expect(update).not.toContain('const retainedState: WindowGlassDebrisFallbackState = {');
    expect(preCapture).toBeGreaterThan(entryLoop);
    expect(capture).toBeGreaterThan(preCapture);
    expect(physicalRetire).toBeGreaterThan(capture);
    expect(milestoneCommit).toBeGreaterThan(physicalRetire);
    expect(expiry).toBeGreaterThan(milestoneCommit);
  });

  it('bounds lifecycle receipts to same-generation canonical panes and drains phases atomically', () => {
    const sampleStart = source.indexOf('function recordWindowDebrisLifecycleMilestone(');
    const sampleEnd = source.indexOf('\nasync function withStagedWindowGlassDebrisPool(', sampleStart);
    const lifecycle = source.slice(sampleStart, sampleEnd);
    expect(source).toContain('const retiredWindowDebrisLifecycleReceipts = new Map<string, RetiredWindowDebrisLifecycleReceipt>()');
    expect(source).toContain('let nextWindowDebrisSpawnGeneration = 1;');
    expect(source).toContain('const spawnGeneration = nextWindowDebrisSpawnGeneration++;');
    expect(source).toContain('spawnPersistentWindowDebris(window, normal, impactId);');
    expect(source).toContain('actionIdentity,');
    expect(lifecycle).toContain('windowGlassDebrisMilestoneAdmitted({');
    expect(lifecycle).toContain('const milestones = Object.freeze(lifecycleMilestones.slice(nextMilestone));');
    expect(lifecycle).toContain('priorCursor?.spawnGeneration === record.spawnGeneration');
    expect(lifecycle).toContain('current: entry ? samplePersistentWindowDebrisLifecycle(entry) : null');
    expect(lifecycle).toContain('terminal: receipt?.terminal ?? null');
    expect(lifecycle).toContain("milestones: Object.freeze([...entry.lifecycleMilestones])");
    expect(lifecycle).toContain("throw new TypeError('window debris lifecycle receipt bound exceeded canonical pane count')");
  });

  it('preserves canonical pane damage while temporary debris also clears at the reset boundary', () => {
    const resetStart = source.indexOf('function resetBreakableWindows()');
    const resetEnd = source.indexOf('\nconst CORPSE_LIFETIME_MS', resetStart);
    const resetBlock = source.slice(resetStart, resetEnd);
    expect(resetBlock).toContain('clearPersistentWindowDebris()');
    expect(source.match(/clearPersistentWindowDebris\(\)/g)).toHaveLength(2);
    expect(source).toContain('WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS');
    const clearStart = source.indexOf('function clearPersistentWindowDebris()');
    const clearEnd = source.indexOf('\nfunction breakHouseWindow(', clearStart);
    const clearBlock = source.slice(clearStart, clearEnd);
    expect(clearBlock).toContain('persistentWindowDebris.clear();');
    expect(clearBlock).toContain('retiredWindowDebrisLifecycleReceipts.clear();');
    expect(clearBlock).toContain('windowDebrisLifecycleReadCursors.clear();');
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
    expect(source).toContain('spawnPersistentWindowDebris(window, normal, impactId)');
  });

  it('coalesces next-task physics reconciliation without depending on browser idle time', () => {
    const spawnStart = source.indexOf('function spawnPersistentWindowDebris(');
    const breachEnd = source.indexOf('\nfunction breakWindowsAlongBallisticTrace(', spawnStart);
    const block = source.slice(spawnStart, breachEnd);
    const breakStart = block.indexOf('function breakHouseWindow(');
    const breakBlock = block.slice(breakStart);
    const syncStart = source.indexOf('function scheduleWindowGlassPhysicsSync()');
    const syncEnd = source.indexOf('\nfunction activeMajorDebrisPhysicsBodies()', syncStart);
    const syncBlock = source.slice(syncStart, syncEnd);
    const deferredSync = 'scheduleWindowGlassPhysicsSync();';

    expect(spawnStart).toBeGreaterThan(-1);
    expect(breachEnd).toBeGreaterThan(spawnStart);
    expect(syncStart).toBeGreaterThan(-1);
    expect(syncEnd).toBeGreaterThan(syncStart);
    expect(syncBlock).toContain('if (windowGlassPhysicsSyncScheduled) {');
    expect(syncBlock).toContain('scheduleBrowserCpuTask(() => {');
    expect(syncBlock).not.toContain('scheduleBrowserPreparationIdleTask');
    expect(syncBlock.indexOf('windowGlassPhysicsSyncScheduled = false;'))
      .toBeLessThan(syncBlock.indexOf('syncInteractiveWorldPhysics();'));
    expect(breakBlock).toContain('spawnPersistentWindowDebris(window, normal, impactId);');
    expect(breakBlock).toContain(deferredSync);
    expect(breakBlock.indexOf('window.broken = true;'))
      .toBeLessThan(breakBlock.indexOf('spawnPersistentWindowDebris(window, normal, impactId);'));
    expect(breakBlock.indexOf('spawnPersistentWindowDebris(window, normal, impactId);'))
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
