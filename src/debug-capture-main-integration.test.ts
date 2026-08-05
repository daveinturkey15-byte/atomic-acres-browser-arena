import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('debug capture viewmodel integration', () => {
  it('applies capture visibility synchronously through the normal viewmodel gate', () => {
    const setterStart = source.indexOf('setCaptureViewmodelHidden: (hidden) => {');
    const setterEnd = source.indexOf('\n  stageLoadingCaptureSquad:', setterStart);
    const setter = source.slice(setterStart, setterEnd);
    expect(setterStart).toBeGreaterThan(0);
    expect(setter).toContain('debugCaptureViewmodelHidden = hidden;');
    expect(setter).toContain('weaponView.setPresentationVisible(shouldShowWeaponViewmodel());');
    expect(source).toMatch(/function shouldShowWeaponViewmodel\(\): boolean \{[\s\S]*!debugCaptureViewmodelHidden;/);
  });

  it('locks requested capture FOV after gameplay camera updates until capture is disabled', () => {
    expect(source).toContain('let debugCaptureCameraFov: number | null = null;');
    expect(source).toContain('debugCaptureCameraFov = THREE.MathUtils.clamp(Number.isFinite(fov) ? fov : camera.fov, 35, 100);');
    expect(source).toMatch(/if \(debugCaptureCameraActive\) \{[\s\S]*camera\.fov = debugCaptureCameraFov;[\s\S]*camera\.updateProjectionMatrix\(\);/);
    expect(source).toMatch(/if \(!debugCaptureCameraActive\) \{\s+debugCaptureCameraFov = null;/);
  });
});
