import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('menu weapon asset preparation contract', () => {
  it('keeps WebGPU menu/bootstrap work asset-only until arena-bound prewarm', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const menuWeaponAsset = source.slice(
      source.indexOf('async function prepareMenuWeaponAsset()'),
      source.indexOf('function batchPresentationRootOnce('),
    );
    const sharedAssets = source.slice(
      source.indexOf('async function prepareSharedGameplayAssets()'),
      source.indexOf('let lastMenuDeploymentAssetsProfile:'),
    );

    expect(menuWeaponAsset).toContain("weaponView.load(undefined, { mode: 'asset-only' })");
    expect(menuWeaponAsset).not.toContain('weaponView.prewarmBrowserWeaponCatalog(');
    expect(sharedAssets).toContain(
      "if (renderRuntime.backend !== 'webgpu') weaponView.setWeapon(player.weapon, true);",
    );
  });
});
