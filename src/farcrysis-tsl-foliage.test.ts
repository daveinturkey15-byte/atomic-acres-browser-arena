import { describe, expect, it } from 'vitest';
import {
  makeTslFoliageMaterial,
  tslAdvanceWind,
  tslResetWindUniforms,
  tslWindUniformCount,
} from './farcrysis-tsl-foliage';

// HF-363: the module-global _windUniforms array had no removal path. One
// entry was pushed per sway-enabled foliage material (~50 per farcrysis
// build) and never removed, so tslAdvanceWind kept writing uniforms of
// disposed arenas every frame and per-frame cost grew on every rebuild.
describe('HF-363 TSL foliage wind uniform registry', () => {
  it('does not grow across repeated foliage builds', () => {
    tslResetWindUniforms();
    const build = (): void => {
      const mats = Array.from({ length: 5 }, (_, i) =>
        makeTslFoliageMaterial({
          color: 0x2e8b57,
          dapple: 0.4,
          swayAmount: 0.06,
          swaySpeed: 1 + i * 0.1,
        }),
      );
      tslAdvanceWind(1.0);
      return mats.forEach((m) => m.dispose());
    };

    build();
    const afterFirstBuild = tslWindUniformCount();
    build();
    const afterSecondBuild = tslWindUniformCount();

    // Materials are disposed inside each build, so the registry must be back
    // to zero after each build instead of accumulating.
    expect(afterFirstBuild).toBe(0);
    expect(afterSecondBuild).toBe(0);
    expect(afterSecondBuild).toBeLessThanOrEqual(afterFirstBuild);
  });

  it('removes entries only when their own material is disposed', () => {
    tslResetWindUniforms();
    const a = makeTslFoliageMaterial({ color: 0x123456, swayAmount: 0.05 });
    const b = makeTslFoliageMaterial({ color: 0x654321, swayAmount: 0.05 });
    expect(tslWindUniformCount()).toBe(2);

    a.dispose();
    expect(tslWindUniformCount()).toBe(1);

    b.dispose();
    expect(tslWindUniformCount()).toBe(0);
  });
});
