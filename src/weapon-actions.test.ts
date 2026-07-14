import { describe, expect, it } from 'vitest';
import { reloadActionEvents, reloadPoseAt } from './weapon-actions';

describe('weapon action timelines', () => {
  it('emits each crossed magazine event exactly once', () => {
    expect(reloadActionEvents('carbine', 0, 0.3)).toEqual(['mag-release', 'mag-out']);
    expect(reloadActionEvents('carbine', 0.3, 0.81)).toEqual(['mag-in', 'mag-seat']);
    expect(reloadActionEvents('carbine', 0.81, 1)).toEqual(['bolt-release']);
    expect(reloadActionEvents('carbine', 0.81, 0.81)).toEqual([]);
  });

  it('authors repeated scattergun shell insert events', () => {
    expect(reloadActionEvents('scattergun', 0, 0.8)).toEqual([
      'shell-insert', 'shell-insert', 'shell-insert', 'shell-insert',
    ]);
    expect(reloadActionEvents('scattergun', 0.8, 1)).toEqual(['bolt-release']);
  });

  it('keeps magazine and shell poses finite across clamped progress', () => {
    for (const weapon of ['carbine', 'smg', 'scattergun', 'pistol'] as const) {
      for (const progress of [-2, 0, 0.25, 0.5, 0.75, 1, 4]) {
        const pose = reloadPoseAt(weapon, progress);
        for (const value of Object.values(pose)) {
          if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
    expect(reloadPoseAt('carbine', 0.45).magazineDrop).toBeGreaterThan(0.45);
    expect(reloadPoseAt('pistol', 0.34).magazineDrop).toBeGreaterThan(0.15);
    expect(reloadPoseAt('pistol', 0.34).magazineDrop).toBeLessThan(0.25);
    expect(reloadPoseAt('pistol', 0.34).magazineLateral).toBeLessThan(-0.25);
    expect(reloadPoseAt('pistol', 0.68).magazineDrop).toBeLessThan(reloadPoseAt('pistol', 0.34).magazineDrop);
    expect(reloadPoseAt('scattergun', 0.4).handToReload).toBeGreaterThan(0.9);
  });
});
