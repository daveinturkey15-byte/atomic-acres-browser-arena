import { describe, expect, it } from 'vitest';
import { runStagedDmrThermalPrewarm } from './dmr-thermal-prewarm-lifecycle';

type PresentationState = {
  requestedWeapon: string;
  camera: { fov: number; position: number[]; quaternion: number[] };
  hudThermalActive: boolean;
  root: { visible: boolean; scale: number };
  structuralLights: { fill: number; muzzle: number };
  ghostIds: string[];
};

function copyState(state: PresentationState): PresentationState {
  return {
    requestedWeapon: state.requestedWeapon,
    camera: {
      fov: state.camera.fov,
      position: [...state.camera.position],
      quaternion: [...state.camera.quaternion],
    },
    hudThermalActive: state.hudThermalActive,
    root: { ...state.root },
    structuralLights: { ...state.structuralLights },
    ghostIds: [...state.ghostIds],
  };
}

describe('match-bound DMR thermal prewarm lifecycle', () => {
  it('restores weapon, camera, HUD, root, structural lights and ghosts when presentation throws', async () => {
    let live: PresentationState = {
      requestedWeapon: 'carbine',
      camera: { fov: 82, position: [2, 3, 4], quaternion: [0, 0.2, 0, 0.98] },
      hudThermalActive: false,
      root: { visible: true, scale: 0.77 },
      structuralLights: { fill: 11.75, muzzle: 0 },
      ghostIds: [],
    };
    const baseline = copyState(live);
    const order: string[] = [];

    await expect(runStagedDmrThermalPrewarm({
      capture: () => copyState(live),
      stage: () => {
        order.push('stage');
        live = {
          requestedWeapon: 'm14-ebr',
          camera: { fov: 37.6, position: [9, 8, 7], quaternion: [0.1, 0.3, 0.2, 0.9] },
          hudThermalActive: true,
          root: { visible: true, scale: 0.0001 },
          structuralLights: { fill: 0, muzzle: 0 },
          ghostIds: ['hostile-bot', 'friendly-alias'],
        };
      },
      present: async () => {
        order.push('present');
        throw new Error('synthetic renderer rejection');
      },
      restore: (state) => {
        order.push('restore');
        live = copyState(state);
      },
    })).rejects.toThrow('synthetic renderer rejection');

    expect(order).toEqual(['stage', 'present', 'restore']);
    expect(live).toEqual(baseline);
  });
});
