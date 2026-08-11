import { describe, expect, it } from 'vitest';
import {
  RAILGUN_SCOPE_MAGNIFICATION,
  RAILGUN_SCOPE_PRESENTATION_CONTRACT,
  deriveRailgunScopePresentation,
} from './railgun-scope-state';
import { magnifiedFovDegrees } from './weapon-presentation-state';

const baseFov = 82;
const targetFov = magnifiedFovDegrees(baseFov, RAILGUN_SCOPE_MAGNIFICATION);

const scope = (overrides: Partial<Parameters<typeof deriveRailgunScopePresentation>[0]> = {}) =>
  deriveRailgunScopePresentation({
    alive: true,
    localHolder: true,
    weapon: 'railgun',
    adsHeld: true,
    adsProgress: 1,
    baseFov,
    cameraFov: targetFov,
    ...overrides,
  });

describe('railgun clear ADS scope lifecycle', () => {
  it('requires settled ADS and genuine 2.5x angular magnification', () => {
    expect(scope({ adsHeld: false }).active).toBe(false);
    expect(scope({ adsProgress: 0.899 }).active).toBe(false);
    expect(scope({ cameraFov: targetFov + 0.36 }).active).toBe(false);
    const settled = scope();
    const angularRatio = Math.tan(baseFov * Math.PI / 360) / Math.tan(settled.targetFov * Math.PI / 360);
    expect(angularRatio).toBeCloseTo(RAILGUN_SCOPE_MAGNIFICATION, 8);
    expect(settled).toMatchObject({
      contract: RAILGUN_SCOPE_PRESENTATION_CONTRACT,
      active: true,
      fovSettled: true,
      adsSettled: true,
      lens: 'clear-open-aperture',
      reticle: 'camera-forward-centred',
      viewmodelSuppressed: true,
    });
  });

  it('exits cleanly on fire/unADS, swap, holder loss or death', () => {
    expect(scope({ adsHeld: false }).viewmodelSuppressed).toBe(false);
    expect(scope({ weapon: 'pistol' }).active).toBe(false);
    expect(scope({ localHolder: false }).active).toBe(false);
    expect(scope({ alive: false }).active).toBe(false);
  });
});
