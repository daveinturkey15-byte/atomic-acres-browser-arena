import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  characterActionContract,
  measureCameraFraming,
  objectLocalGeometryBounds,
  resolveSocketWorld,
} from './character-presentation-contract';

describe('character presentation contracts', () => {
  it('uses deterministic action ownership across hip, ADS, sprint, reload and melee', () => {
    const state = (overrides: Partial<Parameters<typeof characterActionContract>[0]> = {}) => characterActionContract({
      weapon: 'carbine', aimBlend: 0, sprintBlend: 0, reloadProgress: null, meleeProgress: null, ...overrides,
    });
    expect(state().state).toBe('hip');
    expect(state({ aimBlend: 0.91 }).state).toBe('hip');
    expect(state({ aimBlend: 0.92 }).state).toBe('ads');
    expect(state({ aimBlend: 1, sprintBlend: 0.5 }).state).toBe('sprint');
    expect(state({ aimBlend: 1, sprintBlend: 1, reloadProgress: 0.45 }).state).toBe('reload');
    expect(state({ reloadProgress: 0.45, meleeProgress: 0.3 })).toMatchObject({
      state: 'melee', supportContactExpected: false, weaponVisible: false,
    });
  });

  it('resolves a nested moving support socket from the current frame, not stale weapon-local coordinates', () => {
    const operator = new THREE.Group(); operator.position.set(4, 1, -3);
    const wrist = new THREE.Group(); wrist.rotation.y = Math.PI / 2; operator.add(wrist);
    const weapon = new THREE.Group(); weapon.position.set(0.1, -0.05, -0.2); wrist.add(weapon);
    const pump = new THREE.Group(); pump.position.set(0, -0.04, -0.5); weapon.add(pump);
    const support = new THREE.Group(); support.name = 'support-socket-l'; support.position.set(-0.03, 0.01, 0.08); pump.add(support);

    const first = resolveSocketWorld(support);
    pump.position.z += 0.22;
    wrist.rotation.y += 0.25;
    const second = resolveSocketWorld(support);

    const expected = support.localToWorld(new THREE.Vector3());
    expect(second.distanceTo(expected)).toBeLessThan(1e-8);
    expect(second.distanceTo(first)).toBeGreaterThan(0.1);
    expect(support.parent).toBe(pump);
  });

  it('measures attached geometry in weapon-local space regardless of animated ancestry', () => {
    const wrist = new THREE.Group(); wrist.position.set(100, -20, 40); wrist.scale.set(3, 3, 3);
    const weapon = new THREE.Group(); weapon.rotation.set(0.4, -0.7, 0.2); wrist.add(weapon);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 1.2)); receiver.position.z = -0.45; weapon.add(receiver);
    const bounds = objectLocalGeometryBounds(weapon);
    expect(bounds).not.toBeNull();
    expect(bounds!.getSize(new THREE.Vector3()).toArray()).toEqual(expect.arrayContaining([
      expect.closeTo(0.2, 5), expect.closeTo(0.3, 5), expect.closeTo(1.2, 5),
    ]));
    expect(bounds!.getCenter(new THREE.Vector3()).length()).toBeLessThan(1);
  });

  it('reports near-plane and viewport framing deterministically', () => {
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 100);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.8));
    arm.position.set(0.25, -0.2, -1);
    const framing = measureCameraFraming(arm, camera);
    expect(framing).toMatchObject({ finite: true, nearPlaneClear: true, intersectsViewport: true });
    arm.position.z = -0.04;
    expect(measureCameraFraming(arm, camera)?.nearPlaneClear).toBe(false);
  });
});
