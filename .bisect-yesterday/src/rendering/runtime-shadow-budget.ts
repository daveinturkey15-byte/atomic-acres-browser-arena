import type * as THREE from 'three';

export const VIEWMODEL_SHADOW_BUDGET_SCOPE = 'viewmodel' as const;

export const VIEWMODEL_SHADOW_BUDGET = Object.freeze({
  maximumLights: 1,
  maximumMapPixels: 512 * 512,
});

export function isViewmodelShadowLight(node: THREE.Object3D): boolean {
  return node.userData.shadowBudgetScope === VIEWMODEL_SHADOW_BUDGET_SCOPE;
}
