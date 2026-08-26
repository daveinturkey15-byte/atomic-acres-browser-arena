import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  isViewmodelShadowLight,
  VIEWMODEL_SHADOW_BUDGET,
  VIEWMODEL_SHADOW_BUDGET_SCOPE,
} from './runtime-shadow-budget';

describe('runtime shadow budget', () => {
  it('admits exactly one bounded viewmodel shadow map outside arena-authored lights', () => {
    expect(VIEWMODEL_SHADOW_BUDGET).toEqual({ maximumLights: 1, maximumMapPixels: 512 * 512 });
  });

  it('requires an explicit viewmodel budget tag', () => {
    const light = new THREE.SpotLight();
    expect(isViewmodelShadowLight(light)).toBe(false);
    light.userData.shadowBudgetScope = VIEWMODEL_SHADOW_BUDGET_SCOPE;
    expect(isViewmodelShadowLight(light)).toBe(true);
  });
});
