import { describe, expect, it } from 'vitest';
import { NodeMaterial } from 'three/webgpu';
import {
  TSL_FOLIAGE_MAX_DISTINCT_GRAPHS,
  makeTslFoliageMaterial,
  makeTslGrassMaterial,
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

  it('gives different sway buckets their own uniform', () => {
    tslResetWindUniforms();
    const blade = makeTslFoliageMaterial({ color: 0x2e8b57, swayAmount: 0.03, swayHeight: 0.7 });
    const frond = makeTslFoliageMaterial({ color: 0x2e8b57, swayAmount: 0.09, swayHeight: 9 });
    expect(tslWindUniformCount()).toBe(2);
    expect(graphKey(blade)).not.toBe(graphKey(frond));
    blade.dispose();
    frond.dispose();
    expect(tslWindUniformCount()).toBe(0);
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

// ---------------------------------------------------------------------------
// PASS 84 REPAIR — the shadow pass renders foliage with a DIFFERENT material.
//
// three r185 draws every shadow caster through `scene.overrideMaterial =
// getShadowMaterial(light)` (nodes/lighting/ShadowNode.js), a bare shared
// `NodeMaterial` with no arena properties on it. `Renderer._renderObjectDirect`
// copies the SOURCE material's `positionNode` onto that shadow material and
// then renders with it, and `NodeManager.getNodeFrameForRender` sets
// `nodeFrame.material` to the material actually being rendered — the shadow
// material. So any `materialReference('x','float')` inside a foliage
// `positionNode` resolves `x` on the SHADOW material during the shadow pass.
// It is undefined there; `ReferenceNode.updateValue` assigns it straight into
// a `Float32Array` uniform, which stores NaN, and every swaying shadow-caster
// vertex becomes NaN. Nothing in three warns; the arena simply loses its
// foliage shadows and the vegetation band brightens.
//
// This is not hypothetical: a PASS 84 attempt did exactly that and the
// measured admission frames brightened by +3.2..+6.5 luminance across the
// vegetation band. The guard is on `positionNode` (and `castShadowPositionNode`
// if one is ever authored) because that is precisely the node three carries
// into the shadow pass.
describe('PASS 84 foliage node graphs survive the shadow-pass override material', () => {
  /** Collect every MaterialReferenceNode reachable from a node graph root. */
  const materialReferencesIn = (root: unknown): Array<{ property: string; node: ReferenceLike }> => {
    const found: Array<{ property: string; node: ReferenceLike }> = [];
    const node = root as { traverse?: (cb: (n: unknown) => void) => void } | null | undefined;
    if (!node || typeof node.traverse !== 'function') return found;
    node.traverse((n) => {
      const candidate = n as ReferenceLike;
      if (candidate?.isMaterialReferenceNode === true) {
        found.push({ property: String(candidate.property), node: candidate });
      }
    });
    return found;
  };

  interface ReferenceLike {
    isMaterialReferenceNode?: boolean;
    property?: string;
    getValueFromReference(object: object): unknown;
  }

  const shadowCasters = () => {
    tslResetWindUniforms();
    return [
      makeTslFoliageMaterial({ color: 0x2e8b57, dapple: 0.5, swayAmount: 0.05, swayHeight: 2.5 }),
      makeTslFoliageMaterial({ color: 0x2e8b57, dapple: 0.28, swayAmount: 0.09, swayHeight: 9 }),
      makeTslFoliageMaterial({ color: 0x8a6b3a, dapple: 0.8, swayAmount: 0.02, swayHeight: 0.7 }),
      makeTslFoliageMaterial({ color: 0x6b8f3a }),
      makeTslGrassMaterial({ color: 0x7ba428, bladeHeight: 0.55, swayAmount: 0.08 }),
    ];
  };

  it('resolves every position-node material reference on the shared shadow material', () => {
    const materials = shadowCasters();
    // The exact object three renders shadow casters with: a plain NodeMaterial
    // that carries only the properties three itself sets on it.
    const shadowMaterial = new NodeMaterial();
    for (const material of materials) {
      for (const source of ['positionNode', 'castShadowPositionNode'] as const) {
        const graph = (material as unknown as Record<string, unknown>)[source];
        for (const reference of materialReferencesIn(graph)) {
          const value = reference.node.getValueFromReference(shadowMaterial);
          expect(
            typeof value === 'number' && Number.isFinite(value),
            `${source} reads material.${reference.property}, which is undefined on three's shared `
              + `ShadowMaterial — it becomes NaN in the shadow pass and kills the caster's vertices`,
          ).toBe(true);
        }
      }
    }
    for (const material of materials) material.dispose();
    expect(tslWindUniformCount()).toBe(0);
  });

  it('keeps the sway numbers out of material-reference nodes entirely', () => {
    const materials = shadowCasters();
    for (const material of materials) {
      const properties = materialReferencesIn(material.positionNode).map((r) => r.property);
      expect(properties, 'foliage sway must not be read from the rendered material').toEqual([]);
    }
    for (const material of materials) material.dispose();
    expect(tslWindUniformCount()).toBe(0);
  });
});
