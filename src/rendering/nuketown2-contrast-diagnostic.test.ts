import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installNuketown2ContrastDiagnostic } from './pass64-tsl-scene';

describe('NukeTown local contrast diagnostic', () => {
  it('changes only contrast and restores the value saved at first set, including disposal', () => {
    const scene = new THREE.Scene();
    const contrast = { value: 1.0865 }, saturation = { value: 1.0812 };
    const dispose = installNuketown2ContrastDiagnostic(scene, 'nuketown2', contrast, saturation, '127.0.0.1');
    const handle = scene.userData.nuketown2ContrastDiagnostic;
    expect(handle.read()).toMatchObject({ active: true, contrast: 1.0865, savedContrast: null });
    contrast.value = 1.07; // save CURRENT value, not the install-time value
    handle.setContrast(1);
    handle.setContrast(1);
    expect(handle.read()).toMatchObject({ contrast: 1, savedContrast: 1.07, saturation: 1.0812 });
    expect(handle.restore()).toMatchObject({ contrast: 1.07, savedContrast: null });
    expect(saturation.value).toBe(1.0812);
    for (const invalid of [NaN, Infinity, 0, 1.1]) expect(() => handle.setContrast(invalid)).toThrow();
    handle.setContrast(1);
    dispose();
    dispose();
    expect(contrast.value).toBe(1.07);
    expect(scene.userData.nuketown2ContrastDiagnostic).toBeUndefined();
    expect(handle.read().active).toBe(false);
    expect(() => handle.setContrast(1)).toThrow('stale');
    expect(() => handle.restore()).toThrow('stale');
  });

  it('does not expose the seam on other arenas or public hosts', () => {
    for (const [arena, host] of [['terminal', 'localhost'], ['nuketown2', 'example.com'], ['nuketown2', '']]) {
      const scene = new THREE.Scene();
      installNuketown2ContrastDiagnostic(scene, arena, { value: 1.08 }, { value: 1.02 }, host)();
      expect(scene.userData.nuketown2ContrastDiagnostic).toBeUndefined();
    }
  });

  it('an old owner cannot mutate or delete a replacement handle', () => {
    const scene = new THREE.Scene();
    const oldContrast = { value: 1.08 }, nextContrast = { value: 1.06 };
    const disposeOld = installNuketown2ContrastDiagnostic(scene, 'nuketown2', oldContrast, { value: 1 }, 'localhost');
    const old = scene.userData.nuketown2ContrastDiagnostic;
    const disposeNext = installNuketown2ContrastDiagnostic(scene, 'nuketown2', nextContrast, { value: 1 }, 'localhost');
    const next = scene.userData.nuketown2ContrastDiagnostic;
    expect(() => old.setContrast(1)).toThrow('stale');
    disposeOld();
    expect(scene.userData.nuketown2ContrastDiagnostic).toBe(next);
    expect(next.read().active).toBe(true);
    disposeNext();
  });
});
