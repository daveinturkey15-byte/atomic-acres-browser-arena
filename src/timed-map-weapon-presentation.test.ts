import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advanceTimedMapWeaponAuthority, createTimedMapWeaponAuthority } from './timed-map-weapon-authority';
import { TimedMapWeaponPresentation } from './timed-map-weapon-presentation';

describe('timed map weapon presentation', () => {
  it('owns one persistent hidden root per weapon and reveals only available pickups', () => {
    const scene = new THREE.Scene();
    const presentation = new TimedMapWeaponPresentation(scene, false);
    const scheduled = {
      flamethrower: createTimedMapWeaponAuthority('flamethrower', 'rustworks-1v1', 0, 100),
      'flare-gun': createTimedMapWeaponAuthority('flare-gun', 'skyline-terminal', 0, 100),
    } as const;
    presentation.update(scheduled, 20);
    expect(scene.getObjectByName('flamethrower-timed-world-pickup')?.visible).toBe(false);
    expect(scene.getObjectByName('flare-gun-timed-world-pickup')?.visible).toBe(false);

    const states = {
      ...scheduled,
      flamethrower: advanceTimedMapWeaponAuthority(scheduled.flamethrower, 50).state,
    };
    presentation.update(states, 50);
    const flame = scene.getObjectByName('flamethrower-timed-world-pickup')!;
    expect(flame.visible).toBe(true);
    expect(flame.position.x).toBeCloseTo(0.4, 8);
    expect(scene.getObjectByName('flare-gun-timed-world-pickup')?.visible).toBe(false);
    expect(presentation.telemetry()).toMatchObject({
      prepared: true,
      entries: [
        { weaponId: 'flamethrower', visible: true, source: 'fallback' },
        { weaponId: 'flare-gun', visible: false, source: 'fallback' },
      ],
    });
    presentation.reset();
    expect(flame.visible).toBe(false);
  });
});
