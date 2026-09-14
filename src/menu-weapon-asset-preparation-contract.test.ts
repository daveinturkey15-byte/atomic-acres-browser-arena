import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('menu weapon asset preparation contract', () => {
  it('keeps WebGPU menu/bootstrap work asset-only until arena-bound prewarm', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const menuWeaponAsset = source.slice(
      source.indexOf('async function prepareMenuWeaponAsset()'),
      source.indexOf('function batchPresentationRootOnce('),
    );
    // Boundary repaired 2026-09-09. This slice used to end at `let lastMenuDeploymentAssetsProfile:`,
    // which the load-reliability lane moved ~30,000 lines EARLIER so a QA probe block could see it.
    // The end marker then preceded the start marker, slice() returned '', and the assertion below
    // passed vacuously in the "not.toContain" direction while failing in the "toContain" one.
    // The assertion is unchanged; only the boundary is, and it now ends at the next function so it
    // cannot be broken again by an unrelated declaration moving.
    const sharedAssets = source.slice(
      source.indexOf('async function prepareSharedGameplayAssets()'),
      source.indexOf('function prepareMenuDeploymentAssets('),
    );

    expect(menuWeaponAsset).toContain("weaponView.load(undefined, { mode: 'asset-only' })");
    expect(menuWeaponAsset).not.toContain('weaponView.prewarmBrowserWeaponCatalog(');
    expect(sharedAssets).toContain(
      "if (renderRuntime.backend !== 'webgpu') weaponView.setWeapon(player.weapon, true);",
    );
  });
});
