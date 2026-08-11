import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Pass 70 contact and Railgun scope integration contracts', () => {
  it('keeps contact motion presentation-only while camera-forward remains shot authority', () => {
    const presentation = read('./weapon-presentation.ts');
    const runtime = read('./legacy-main.ts');
    expect(presentation).toContain('viewmodelContactResponse(');
    expect(presentation).toContain('+ this.contactResponse.pitchRadians');
    expect(presentation).toContain('+ this.contactResponse.yawRadians');
    expect(presentation).toContain('+ shotRoll + this.contactResponse.rollRadians');
    expect(presentation).toContain('* this.contactResponse.scale');
    expect(runtime).toContain('const baseDirection = camera.getWorldDirection(new THREE.Vector3());');
    expect(runtime).toContain('cameraDirection: baseDirection.toArray()');
    expect(runtime).not.toMatch(/contactResponse[^\n]*(camera|baseDirection|projectile)/u);
  });

  it('coordinates one settled Railgun scope lifecycle across FOV, thermal and viewmodel suppression', () => {
    const runtime = read('./legacy-main.ts');
    expect(runtime).toContain('railgunScopeState = deriveRailgunScopePresentation({');
    expect(runtime).toContain('const thermalActive = railgunScopeActive;');
    expect(runtime).toContain('sniperScopeActive || dmrThermalActive || railgunScopeActive');
    expect(runtime).toContain("hudRoot.classList.toggle('railgun-scope-active', railgunScopeActive)");
    expect(runtime).toContain("element<HTMLElement>('.railgun-scope-reticle')");
    expect(runtime).toContain('synchronizeWeaponViewmodelPresentation();');
  });

  it('authors a transparent centre aperture, aligned reticle and opaque outside mask', () => {
    const shell = read('./ui/pass64-shell.ts');
    const css = read('./ui/tactical-ui.css');
    expect(shell).toContain('Railgun 2.5x clear thermal scope');
    expect(shell).toContain('class="railgun-scope-glass"');
    expect(shell).toContain('class="railgun-scope-reticle"');
    expect(css).toMatch(/#railgun-thermal \.railgun-scope-window[\s\S]*?background:\s*transparent;/u);
    expect(css).toMatch(/0 0 0 100vmax rgba\(1, 6, 9, 0\.96\)/u);
    expect(css).toMatch(/#railgun-thermal \.railgun-scope-glass[\s\S]*?transparent 0 62%/u);
    expect(css).toContain('#hud.railgun-scope-active #crosshair { opacity: 0; }');
  });
});
