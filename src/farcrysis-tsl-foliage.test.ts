import { describe, expect, it } from 'vitest';
import {
  TSL_FOLIAGE_MAX_DISTINCT_GRAPHS,
  makeTslFoliageMaterial,
  tslAdvanceWind,
  tslResetWindUniforms,
  tslWindUniformCount,
} from './farcrysis-tsl-foliage';

/** Graph identity = pipeline identity on WebGPU (see the module header). */
function graphKey(material: { positionNode?: unknown; colorNode?: unknown }): string {
  const key = (node: unknown): string => {
    const candidate = node as { getCacheKey?: () => number } | null | undefined;
    return candidate?.getCacheKey ? String(candidate.getCacheKey()) : 'none';
  };
  return `${key(material.positionNode)}|${key(material.colorNode)}`;
}

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
          swayHeight: 0.8 + i * 0.9,
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

  // HF-374 updated this case to the NEW sharing behaviour, at greater
  // strictness: the old test only proved a per-material entry was removed with
  // its own material. The shared uniform has to prove BOTH halves of the
  // reference count — it must survive while any user is alive, and it must be
  // gone once the last one is disposed — or a retired arena keeps being
  // written to every frame, which is the original HF-363 leak.
  it('shares one wind uniform per bucket and releases it with the last user', () => {
    tslResetWindUniforms();
    const a = makeTslFoliageMaterial({ color: 0x123456, swayAmount: 0.05, swayHeight: 2.5 });
    const b = makeTslFoliageMaterial({ color: 0x654321, swayAmount: 0.05, swayHeight: 2.5 });
    expect(tslWindUniformCount()).toBe(1);
    expect(graphKey(a)).toBe(graphKey(b));

    a.dispose();
    expect(tslWindUniformCount()).toBe(1); // b still drives it

    b.dispose();
    expect(tslWindUniformCount()).toBe(0);
  });

  // PASS 84 REPLACES the previous 'gives different sway buckets their own
  // uniform' case, which pinned the bucket split itself. The split was the
  // cost: nine live node graphs, ~0.6 s of pipeline compilation each, inside
  // arena admission. Sway size is now a per-material uniform read through
  // materialReference, so this asserts the STRONGER property — one graph and
  // one wind uniform for every sway size, with the per-layer numbers intact.
  it('puts every sway size on one shared graph and one wind uniform', () => {
    tslResetWindUniforms();
    const blade = makeTslFoliageMaterial({ color: 0x2e8b57, swayAmount: 0.03, swayHeight: 0.7 });
    const frond = makeTslFoliageMaterial({ color: 0x2e8b57, swayAmount: 0.09, swayHeight: 9 });

    expect(tslWindUniformCount()).toBe(1);
    expect(graphKey(blade)).toBe(graphKey(frond));

    // Sharing must not have flattened the layers onto one look: each material
    // still carries its own bucketed height, amplitude and speed, which is
    // what the shared graph reads at draw time.
    expect(blade.fcSwayHeight).toBe(0.8);
    expect(frond.fcSwayHeight).toBe(8);
    expect(blade.fcSwayAmount).toBeLessThan(frond.fcSwayAmount);
    expect(blade.fcSwaySpeed).toBe(1);
    expect(frond.fcSwaySpeed).toBe(1);

    blade.dispose();
    expect(tslWindUniformCount()).toBe(1); // frond still drives it
    frond.dispose();
    expect(tslWindUniformCount()).toBe(0);
  });

  // The shared graph renders NaN for any material that reaches a draw without
  // the four referenced properties, and nothing in three warns about it.
  it('always carries the four values the shared graph dereferences', () => {
    tslResetWindUniforms();
    const dappledSway = makeTslFoliageMaterial({ color: 0x2e8b57, dapple: 0.5, swayAmount: 0.05, swayHeight: 2.5 });
    const still = makeTslFoliageMaterial({ color: 0x2e8b57, dapple: 0.8 });
    for (const material of [dappledSway, still]) {
      for (const property of ['fcDapple', 'fcSwayHeight', 'fcSwayAmount', 'fcSwaySpeed'] as const) {
        expect(Number.isFinite(material[property]), `${property} must be a finite number`).toBe(true);
      }
    }
    expect(dappledSway.fcDapple).toBe(0.5);
    expect(still.fcDapple).toBe(0.78);
    dappledSway.dispose();
    still.dispose();
  });

  it('double dispose cannot drive the reference count negative', () => {
    tslResetWindUniforms();
    const a = makeTslFoliageMaterial({ color: 0x2e8b57, swayAmount: 0.05, swayHeight: 2.5 });
    const b = makeTslFoliageMaterial({ color: 0x2e8b57, swayAmount: 0.05, swayHeight: 2.5 });
    a.dispose();
    a.dispose();
    expect(tslWindUniformCount()).toBe(1);
    b.dispose();
    expect(tslWindUniformCount()).toBe(0);
  });
});

// HF-374: farcrysis would not boot on the WebGPU route. Every foliage layer
// baked its own colour / dapple / sway numbers into its node graph, and
// `swayHeight` came from each mesh's own bounding box, so the arena produced
// one distinct graph — one WGSL program and one render pipeline — per layer.
// The arena-admission coverage draw has to realise all of them inside a single
// GPU submission behind a 12 s queue fence, and that submission never
// completed. WebGL2 never saw it because _applyTslFoliage is skipped there.
describe('HF-374 TSL foliage pipeline-count ceiling', () => {
  it('collapses many differing layers onto a bounded set of node graphs', () => {
    tslResetWindUniforms();
    const materials = [];
    // 60 layers whose colour, dapple and height all differ continuously —
    // exactly the shape the arena builder produces from bounding-box heights.
    for (let i = 0; i < 60; i++) {
      materials.push(makeTslFoliageMaterial({
        color: 0x100000 + i * 0x000101,
        dapple: 0.25 + (i % 13) * 0.05,
        swayAmount: 0.02 + (i % 7) * 0.01,
        swayHeight: 0.4 + i * 0.17,
        doubleSided: true,
      }));
    }
    const graphs = new Set(materials.map(graphKey));
    expect(materials).toHaveLength(60);
    expect(graphs.size).toBeLessThanOrEqual(TSL_FOLIAGE_MAX_DISTINCT_GRAPHS);
    // Sharing has to be real, not an artefact of every graph collapsing to
    // "none" — sway and dapple must still be authored on these materials.
    expect(materials.every((m) => m.positionNode !== null && m.colorNode !== null)).toBe(true);
    for (const material of materials) material.dispose();
    expect(tslWindUniformCount()).toBe(0);
  });

  it('keeps each layer its own authored colour despite the shared graph', () => {
    tslResetWindUniforms();
    const a = makeTslFoliageMaterial({ color: 0x2e8b57, dapple: 0.5, swayAmount: 0.05, swayHeight: 2.5 });
    const b = makeTslFoliageMaterial({ color: 0xc25f2c, dapple: 0.5, swayAmount: 0.05, swayHeight: 2.5 });
    // Same graph (same pipeline) ...
    expect(graphKey(a)).toBe(graphKey(b));
    // ... but the colour is a per-material uniform, so the layers still differ.
    expect(a.color.getHex()).toBe(0x2e8b57);
    expect(b.color.getHex()).toBe(0xc25f2c);
    a.dispose();
    b.dispose();
  });
});
