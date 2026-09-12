/**
 * render-contract-repair (2026-09-12): focused additive cases for the value
 * restorations. Each pins the reconciliation beside the number, so the next
 * "restore" has to argue with the recorded contract and the installed source.
 * Nothing here simulates lighting. The installed lighting model was reviewed
 * separately; these tests exercise the game's material and sky behavior.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createForgePaintMaterial } from '../vehicle-forge/materials';
import { artDirectionForArena } from './art-direction';
import { createSky, ORBIT_PERIOD_SECONDS } from '../map3/sky';

describe('forge paint base lobe is a house-look contract, not a physics repair', () => {
  it('suppresses the base lobe to 0.08 on both finishes while the finishes still differ by graph', () => {
    const clean = createForgePaintMaterial({ color: 0x173451, name: 'look-navy', roughness: 0.2 });
    const worn = createForgePaintMaterial({ color: 0x173451, name: 'look-navy-worn', roughness: 0.2, finish: 'weathered' });
    // Three's own default (specularIntensity 1 at ior 1.5 = F0 0.04 / F90 1)
    // is the physically standard dielectric. The forge departs from it on
    // purpose, by the same factor on both finishes: the scalar is the look,
    // and the clean/worn distinction is carried by the finish tag and graph.
    expect(new THREE.MeshPhysicalMaterial().specularIntensity).toBe(1);
    expect(clean.specularIntensity).toBe(worn.specularIntensity);
    expect(clean.specularIntensity).toBeCloseTo(0.08, 6);
    expect(clean.userData.forgeFinish).toBe('clean');
    expect(worn.userData.forgeFinish).toBe('weathered');
    expect(clean.colorNode).toMatchObject({ isUniformNode: true });
    expect(worn.colorNode).not.toMatchObject({ isUniformNode: true });
    // Clean spends its visible reflection on a smoother, stronger coat.
    expect(clean.clearcoat).toBeGreaterThan(worn.clearcoat);
    expect(clean.clearcoatRoughness).toBeLessThan(worn.clearcoatRoughness);
    expect(clean.roughnessNode).toBeDefined();
    expect(worn.roughnessNode).toBeDefined();
  });
});

describe('nuketown2 split tone retains the measured HF-536 look-2a triple', () => {
  it('highlight and strength are the measured values the pinned tonal-match invariants resolve to', () => {
    // nuketown2-look-tonal-match.test.ts already pins the shade and R-B >= 100;
    // these two are the remaining measured members of the triple. Owner visual
    // approval of the look is OPEN; this only records which contract is live.
    const { splitTone } = artDirectionForArena('nuketown2');
    expect(splitTone.highlightTint).toBe(0xffd096);
    expect(splitTone.strengthScale).toBeCloseTo(1.45, 6);
  });
});

describe('map3 sky orbit is the recorded 40 s ask', () => {
  it('turns a quarter circle in ten seconds at the sky level, not only through the arena', () => {
    expect(ORBIT_PERIOD_SECONDS).toBe(40);
    const sky = createSky({ cloudPuffs: 0 });
    sky.update(0, 0.016);
    const start = sky.sunDirection.clone();
    sky.update(ORBIT_PERIOD_SECONDS / 4, 0.016);
    expect(sky.sunDirection.length()).toBeCloseTo(1, 5);
    expect(sky.sunDirection.distanceTo(start)).toBeGreaterThan(0.5);
    // The key still never sets: elevation only breathes.
    expect(sky.sunDirection.y).toBeGreaterThan(0.2);
    sky.dispose();
  });
});
