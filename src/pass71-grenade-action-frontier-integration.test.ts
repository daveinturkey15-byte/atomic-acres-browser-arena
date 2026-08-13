import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('Pass 71 grenade completion frontier integration', () => {
  it('opens the profile before every accepted-action mutation and cold presentation call', () => {
    const start = source.indexOf('function throwGrenade(): void');
    const end = source.indexOf('\nfunction presentRemoteGrenade(', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const action = source.slice(start, end);
    const admission = action.indexOf("if (!player.alive || player.grenades <= 0 || matchState.phase !== 'active') return;");
    const begin = action.indexOf('beginGrenadeFirstActionProfile(grenade, actionStartedAt);');
    for (const coldWork of [
      'endSpawnProtectionOnOffense(actionStartedAt);',
      'player.grenades -= 1;',
      'weaponView.throwGrenade();',
      'camera.getWorldDirection(new THREE.Vector3())',
      'const actionNonce = randomNonce();',
      'network.send({',
      'acquireGrenadeWorldPresentation(grenade)',
      'grenades.push({',
    ]) {
      expect(action.indexOf(coldWork), coldWork).toBeGreaterThan(begin);
    }
    expect(begin).toBeGreaterThan(admission);
    expect(action.indexOf('bindGrenadeFirstActionNonce(actionNonce);'))
      .toBeGreaterThan(action.indexOf('const actionNonce = randomNonce();'));
    expect(action.indexOf('completeGrenadeActionHandler(performance.now());'))
      .toBeGreaterThan(action.indexOf('grenades.push({'));
  });

  it('keeps the browser falsifier outside the instrumented handler', () => {
    const spec = readFileSync('tests/e2e/pass71-grenade-first-action.spec.ts', 'utf8');
    expect(spec.indexOf('const invokedAt = performance.now();'))
      .toBeLessThan(spec.indexOf('window.__ATOMIC_ACRES_DEBUG__.throwGrenade();'));
    expect(spec.indexOf('const handlerReturnedAt = performance.now();'))
      .toBeGreaterThan(spec.indexOf('window.__ATOMIC_ACRES_DEBUG__.throwGrenade();'));
    expect(spec).toContain('eventToNextAnimationFrameMs: nextAnimationFrameAt - invokedAt');
    expect(spec).toContain('actionFrontier.eventToNextAnimationFrameMs');
  });
});
