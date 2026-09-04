import { describe, expect, it } from 'vitest';
import { authoredRespawnLoadout } from './respawn-loadout-authority';
import { reloadRequestId } from './local-reload-authority';
import {
  viewmodelMuzzleInsideSurfaceClip,
  viewmodelSurfaceClipPlanes,
} from './systems/viewmodel-surface-clip';

describe('HF-498 multiplayer bug contracts', () => {
  it('keeps the reload retry key stable and scoped to the intent', () => {
    const first = reloadRequestId('connection_epoch_a', 4, 0, 'start');
    expect(first).toBe(reloadRequestId('connection_epoch_a', 4, 0, 'start'));
    expect(first).not.toBe(reloadRequestId('connection_epoch_a', 4, 1, 'start'));
    expect(first).not.toBe(reloadRequestId('connection_epoch_a', 4, 0, 'cancel'));
    expect(first).not.toBe(reloadRequestId('connection_epoch_b', 4, 0, 'start'));
    expect(first).toMatch(/^reload-[a-z0-9]+-4-s-0$/);
  });

  it('resets a new life to the authored class loadout and primary slot', () => {
    expect(authoredRespawnLoadout({ primary: 'smg', secondary: 'pistol', grenade: 'flash' })).toEqual({
      primary: 'smg', secondary: 'pistol', grenade: 'flash', weapon: 'smg',
    });
    expect(authoredRespawnLoadout({ primary: 'sniper', secondary: 'machine-pistol', grenade: 'smoke' }).weapon)
      .toBe('sniper');
  });

  it('admits stairs when the muzzle is clear and blocks only a muzzle inside the probed surface', () => {
    const eye = { x: 0, y: 1.7, z: 0 } as const;
    const stairSide = { minX: 0.5, maxX: 0.8, minY: 0, maxY: 3, minZ: -20, maxZ: 20 } as const;
    const planes = viewmodelSurfaceClipPlanes({ eye, colliders: [stairSide] });
    expect(planes).toHaveLength(1);
    expect(viewmodelMuzzleInsideSurfaceClip({ x: 0.4, y: 1.7, z: 0 }, planes)).toBe(false);
    expect(viewmodelMuzzleInsideSurfaceClip({ x: 0.65, y: 1.7, z: 0 }, planes)).toBe(true);
  });
});
