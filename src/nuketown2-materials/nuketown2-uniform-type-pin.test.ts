/**
 * HF-535 day shift — the shared-uniform TYPE PIN gate.
 *
 * MECHANISM THIS GATE EXISTS FOR (measured from the base build's own generated
 * WGSL, not theorised). The Nuke Town families share one node object per
 * uniform so the renderer admits a single pipeline per family. Those nodes were
 * built as `uniform(DEFAULTS[name])` with NO type argument, which leaves
 * `UniformNode.nodeType === null`. A node with a null nodeType re-derives its
 * declared type in EVERY program from `getValueType(node.value)` at
 * graph-build time, so the declared type of one shared node can — and did —
 * differ from program to program.
 *
 * In the base build (a9ed4c7c) the nuketown2-roof-shingles program declared the
 * shared baseColor slot as a SCALAR:
 *
 *     struct objectStruct { nodeUniform0 : f32, nodeUniform1 : f32, ... }
 *     nodeVar14 = mix( vec3<f32>( ( ( object.nodeUniform0 * nodeVar0 ) * ... ) ), ... );
 *
 * while nuketown2-asphalt-road and nuketown2-siding-cream declared the same
 * node as `vec3<f32>`. A float-typed slot is backed by a NumberNodeUniform, so
 * three r185 UniformsGroup.updateNumber() executes
 * `Float32Array[offset] = <THREE.Color>` -> NaN, every frame, forever (the
 * `a[offset] !== v` short-circuit never settles because NaN !== object). That
 * is the black-roof defect, and it is why the black surface MOVED between roofs
 * and roads whenever the set of compiled programs changed.
 *
 * THE PIN. Every shared node now declares its type explicitly, derived from its
 * own default value: THREE.Color -> 'color', number -> 'float'. 'color' is
 * required rather than 'vec3': both emit `vec3<f32>` in WGSL, but only 'color'
 * selects ColorNodeUniform (which reads .r/.g/.b). 'vec3' would select
 * Vector3NodeUniform, which reads .x/.y/.z off a THREE.Color and writes
 * undefined — NaN again.
 *
 * FALSIFIER PROPERTY: this file fails at a9ed4c7c on CONTENT (every nodeType is
 * null there), using only exports that already existed at that commit.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import { createNuketown2Uniforms } from './material-uniforms';
import { roofSpec } from './families/roof';

/** The node type a value implies: a colour is three components, never one. */
function impliedType(value: unknown): string {
  return value instanceof THREE.Color ? 'color' : 'float';
}

function sharedNodes(): Array<[string, any]> {
  const spec = roofSpec();
  const uniforms = createNuketown2Uniforms(spec, spec.baseSrgb, 0x6b5741, new THREE.MeshStandardMaterial());
  return Object.entries(uniforms).filter(([name]) => name !== 'values') as Array<[string, any]>;
}

describe('nuketown2 shared uniform type pin', () => {
  it('exposes every shared node', () => {
    const nodes = sharedNodes();
    expect(nodes.length).toBeGreaterThanOrEqual(25);
    for (const [name, node] of nodes) {
      expect(node?.isUniformNode, `${name} is a uniform node`).toBe(true);
    }
  });

  it('declares an explicit nodeType on every shared node', () => {
    const unpinned = sharedNodes()
      .filter(([, node]) => node.nodeType === null || node.nodeType === undefined || node.nodeType === '')
      .map(([name]) => name);
    expect(unpinned).toEqual([]);
  });

  it('pins each nodeType to the type implied by the node default', () => {
    for (const [name, node] of sharedNodes()) {
      expect(node.nodeType, `${name} node type`).toBe(impliedType(node.value));
    }
  });

  it('pins each nodeType to the type of the value the material actually binds', () => {
    const spec = roofSpec();
    const mat = new THREE.MeshStandardMaterial();
    const uniforms = createNuketown2Uniforms(spec, spec.baseSrgb, 0x6b5741, mat);
    const bound = (mat.userData as any).nuketown2Uniforms as Record<string, unknown>;
    for (const [name, node] of Object.entries(uniforms)) {
      if (name === 'values') continue;
      expect((node as any).nodeType, `${name} vs bound value`).toBe(impliedType(bound[name]));
    }
  });

  it('never lets a THREE.Color-valued uniform occupy a scalar slot', () => {
    const colourNames = sharedNodes()
      .filter(([, node]) => node.value instanceof THREE.Color)
      .map(([name]) => name);
    // baseColor is the node the roof program collapsed to f32 at a9ed4c7c.
    expect(colourNames).toContain('baseColor');
    expect(colourNames).toContain('soilColor');
    expect(colourNames).toContain('sidingWainscotColor');
    for (const [name, node] of sharedNodes()) {
      if (!(node.value instanceof THREE.Color)) continue;
      expect(node.nodeType, `${name} must not be a scalar slot`).toBe('color');
      expect(node.nodeType, `${name} must not be a Vector3 slot`).not.toBe('vec3');
    }
  });

  it('keeps the shared node identity the one-pipeline-per-family gate relies on', () => {
    const spec = roofSpec();
    const a = createNuketown2Uniforms(spec, spec.baseSrgb, 0x6b5741, new THREE.MeshStandardMaterial());
    const b = createNuketown2Uniforms(spec, 0x804020, 0x6b5741, new THREE.MeshStandardMaterial());
    for (const [name, node] of Object.entries(a)) {
      if (name === 'values') continue;
      expect(node, name).toBe((b as any)[name]);
    }
    expect(a.values).not.toBe(b.values);
  });
});
