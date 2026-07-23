import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRustworksWelshFlag, RUSTWORKS_WELSH_FLAG } from './rustworks-flag';

describe('Rustworks Welsh flag', () => {
  it('is a large, double-sided animated Wales flag above the derrick', () => {
    const flag = createRustworksWelshFlag();
    const cloth = flag.getObjectByName('rustworks-quality-welsh-flag-cloth') as THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshStandardMaterial
    >;
    const pole = flag.getObjectByName('rustworks-quality-welsh-flag-pole') as THREE.Mesh;

    expect(flag.userData.rustworksFlagAudit).toMatchObject({
      nation: 'Wales',
      animated: true,
      width: 6,
      height: 3.6,
      poleHeight: 20.8,
    });
    expect(cloth).toBeTruthy();
    expect(pole).toBeTruthy();
    expect(cloth.material.side).toBe(THREE.DoubleSide);
    expect(cloth.position.y + RUSTWORKS_WELSH_FLAG.height / 2).toBeGreaterThan(20);

    const position = cloth.geometry.getAttribute('position') as THREE.BufferAttribute;
    const before = Array.from(position.array as Float32Array);
    const versionBefore = position.version;
    (cloth.onBeforeRender as unknown as () => void)();
    const after = Array.from(position.array as Float32Array);
    expect(after.some((value, index) => index % 3 === 2 && Math.abs(value - before[index]) > 1e-4)).toBe(true);
    expect(position.version).toBeGreaterThan(versionBefore);
  });
});
