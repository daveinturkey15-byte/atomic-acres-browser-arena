/**
 * HF-477 regression: the nuketown2 arena's WebGPU shader-pipeline budget.
 *
 * WHAT BROKE. `nuketown2-materials` is a library of FAMILY FACTORIES, and every
 * one of them takes its base colour as an sRGB hex. `wear.ts::linearSwatch`
 * turned that hex into `vec3(r, g, b)` — a literal INSIDE the node graph — so
 * two roles that are the same surface in two colours generated two different
 * WGSL sources. `createNuketown2MaterialRegistry()` answers 21 roles, and it
 * was paying 19 cold compiles for what is really 15 surfaces; arena-wide it was
 * 55 graphs over 96 node materials.
 *
 * WHY THAT IS A DEPLOY FAILURE AND NOT A MICRO-OPTIMISATION. Arena admission
 * forces one full-coverage draw with frustum culling disabled and then fences
 * the GPU queue for 12,000 ms (legacy-main `coverage-submit-fence`). Every
 * distinct graph in the arena has to be realised as a WGSL program and a
 * pipeline inside that ONE submission. This is the identical failure HF-374
 * hit on farcrysis foliage ("WebGPU queue completion exceeded 12000 ms for
 * submission 22"), and the identical failure the car-paint fix in
 * `nuketown2-vehicle-materials.ts` (commit b594fe35) already fixed once by
 * moving a caller-chosen colour out of the graph and into a uniform.
 *
 * THE INSTRUMENT, AND WHY IT IS NOT `customProgramCacheKey()`.
 * `src/farcrysis-webgpu-pipeline-budget.test.ts` counts
 * `NodeMaterial.customProgramCacheKey()`, which bottoms out in
 * `Node.customCacheKey() { return this.id; }` — it is keyed by node-object
 * IDENTITY. That is the right instrument there, because the farcrysis fix was
 * to hand every foliage layer one of five SHARED node objects. It is the wrong
 * instrument here: two independent calls to `createRoofMaterial()` build
 * byte-identical graphs out of fresh node objects and get two different
 * `customProgramCacheKey()` values, so it cannot see a colour move from a
 * literal into a uniform at all.
 *
 * What the device actually counts is SHADER SOURCE. `Pipelines` looks a
 * `ProgrammableStage` up by the generated shader text
 * (`this.programs.vertex.get(nodeBuilderState.vertexShader)`) and a render
 * pipeline up by the pair of stage ids, so two materials whose graphs generate
 * the same WGSL share one compile and one pipeline no matter how they were
 * built. `nodeGraphSignature` below is a structural key that models exactly
 * that: it walks the graph, includes the VALUES of constant nodes (they are
 * emitted into the WGSL text) and deliberately omits the values of uniform
 * nodes (they live in a buffer and do not change a character of it). The first
 * test in this file proves the instrument has both of those properties, so it
 * cannot quietly degrade into a tautology.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';

import { buildNuketown2 } from './nuketown2-arena';
import {
  NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS,
  createNuketown2MaterialRegistry,
  linearRgb,
  linearSwatch,
  uniformSwatch,
} from './nuketown2-materials';

/**
 * Node bookkeeping that has nothing to do with the emitted shader.
 *
 * `id` and `_uuid` are per-instance counters — including either of them would
 * make every freshly built graph unique and the whole measurement meaningless.
 * `parents` and `_beforeNodes` are BACK-references, so following them walks the
 * graph the wrong way and drags unrelated consumers into a node's own key.
 * `_cacheKey` / `_cacheKeyVersion` are three's own identity-keyed cache, and
 * `stackTrace` is authoring provenance.
 */
const NON_SHADER_KEYS: ReadonlySet<string> = new Set([
  'id', 'uuid', '_uuid', '_cacheKey', '_cacheKeyVersion', 'parents', '_beforeNodes', 'stackTrace',
]);

/** Depth guard. The deepest graph in this arena is well under a hundred. */
const MAX_GRAPH_DEPTH = 400;

/**
 * A structural signature of a TSL node graph: equal signatures mean equal
 * generated shader source, which means one WGSL program and one pipeline.
 *
 * `memo` is per-material, so a node reached twice inside one graph is costed
 * once, and the shared TSL singletons (`positionWorld`, `cameraPosition`) are
 * re-walked structurally in each material rather than compared by identity.
 */
function nodeGraphSignature(value: unknown, memo: Map<object, string>, depth = 0): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const kind = typeof value;
  if (kind === 'function') return 'fn';
  if (kind !== 'object') return JSON.stringify(value) ?? String(value);

  const object = value as Record<string, unknown> & { isNode?: boolean; toArray?: () => number[] };

  if (object.isNode !== true) {
    // A vector, colour or matrix baked into a const node is part of the source.
    if (typeof object.toArray === 'function') return `[${object.toArray().join(',')}]`;
    if (object instanceof THREE.Color) return `rgb(${object.r},${object.g},${object.b})`;
    // Anything else — a texture, a render target, a group object — binds at
    // draw time and does not change a character of the generated WGSL.
    return `obj:${(object as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'}`;
  }

  const hit = memo.get(object);
  if (hit !== undefined) return hit;
  memo.set(object, '<recursion>');
  if (depth > MAX_GRAPH_DEPTH) return '<depth-limit>';

  // THE ONE LINE THIS WHOLE FILE IS ABOUT. A uniform's value is uploaded to a
  // buffer; the shader that reads it is the same shader for every value. A
  // const node's value is printed into the shader text, so it is part of the
  // key.
  const isUniform = (object as { isUniformNode?: boolean }).isUniformNode === true;

  const parts: string[] = [
    (object as { type?: string }).type ?? (object as { constructor?: { name?: string } }).constructor?.name ?? '?',
  ];
  for (const key of Object.keys(object).sort()) {
    if (NON_SHADER_KEYS.has(key)) continue;
    if (isUniform && key === 'value') { parts.push('value=<uniform>'); continue; }
    const child = object[key];
    if (typeof child === 'function') continue;
    if (Array.isArray(child)) {
      parts.push(`${key}=[${child.map((entry) => nodeGraphSignature(entry, memo, depth + 1)).join(',')}]`);
      continue;
    }
    parts.push(`${key}=${nodeGraphSignature(child, memo, depth + 1)}`);
  }

  const signature = `(${parts.join(' ')})`;
  memo.set(object, signature);
  return signature;
}

/** The distinct-graph key of one node material: its type plus every node slot it drives. */
function materialGraphKey(material: THREE.Material): string {
  const memo = new Map<object, string>();
  const slots = material as unknown as Record<string, unknown>;
  const nodeSlots = Object.keys(slots)
    .filter((key) => key.endsWith('Node') && (slots[key] as { isNode?: boolean } | null)?.isNode === true)
    .sort();
  return `${material.type}|${nodeSlots.map((key) => `${key}=${nodeGraphSignature(slots[key], memo)}`).join('|')}`;
}

/** Every node material reachable from a built arena root, with its name. */
function arenaNodeMaterials(root: THREE.Object3D): ReadonlyArray<{ name: string; key: string }> {
  const rows: Array<{ name: string; key: string }> = [];
  const seen = new Set<THREE.Material>();
  root.traverse((object) => {
    const holder = object as unknown as { material?: THREE.Material | THREE.Material[] };
    const materials = Array.isArray(holder.material)
      ? holder.material
      : holder.material ? [holder.material] : [];
    for (const material of materials) {
      if (seen.has(material)) continue;
      seen.add(material);
      if ((material as { isNodeMaterial?: boolean }).isNodeMaterial !== true) continue;
      rows.push({ name: material.name || '(unnamed)', key: materialGraphKey(material) });
    }
  });
  return rows;
}

/** Built once: the arena is the expensive part of this file. */
let arenaRows: ReadonlyArray<{ name: string; key: string }> | null = null;
function arena(): ReadonlyArray<{ name: string; key: string }> {
  if (arenaRows === null) {
    const scene = new THREE.Scene();
    buildNuketown2(scene);
    arenaRows = arenaNodeMaterials(scene);
  }
  return arenaRows;
}

/** Built once, keyed once: the signature walk is the expensive part per role. */
let registryKeyCache: ReadonlyMap<string, string> | null = null;
function registryKeys(): ReadonlyMap<string, string> {
  if (registryKeyCache === null) {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    registryKeyCache = new Map(
      Object.keys(registry).map((role) => [role, materialGraphKey(registry[role]!)] as const),
    );
  }
  return registryKeyCache;
}

/** A one-slot material, so the instrument can be tested on a known graph. */
function swatchMaterial(colorNode: unknown): THREE.Material {
  const material = new MeshStandardNodeMaterial();
  (material as unknown as Record<string, unknown>).colorNode = colorNode;
  return material;
}

describe('HF-477 nuketown2 WebGPU pipeline budget — the instrument', () => {
  it('is blind to node identity and sensitive to baked constants', () => {
    // Identity blindness. Two independent builds of the SAME graph must key the
    // same, or nothing below measures shader source. (This is precisely where
    // `customProgramCacheKey()` answers "different".)
    expect(
      materialGraphKey(swatchMaterial(linearSwatch(0x9f6147))),
      'two independent builds of one graph are one shader',
    ).toBe(materialGraphKey(swatchMaterial(linearSwatch(0x9f6147))));

    // Value sensitivity. A literal is printed into the WGSL, so two literals
    // are two shaders — this is the defect, and the instrument must see it.
    expect(
      materialGraphKey(swatchMaterial(linearSwatch(0x9f6147))),
      'two baked literals are two shaders',
    ).not.toBe(materialGraphKey(swatchMaterial(linearSwatch(0xeae3cf))));

    // ...and the fix. The same two colours carried as uniforms are ONE shader.
    expect(
      materialGraphKey(swatchMaterial(uniformSwatch(0x9f6147))),
      'two uniform-carried colours are one shader',
    ).toBe(materialGraphKey(swatchMaterial(uniformSwatch(0xeae3cf))));
  });

  it('feeds the uniform the same linear value the literal carried', () => {
    // The look must not move by a bit. `uniformSwatch` runs the same sRGB
    // decode `linearSwatch` does; if it ever stops, a warm timber comes back
    // near-black and no pipeline count would tell you.
    for (const hex of [0x9f6147, 0xeae3cf, 0x8b8879, 0x496438, 0x2b3d47]) {
      const [r, g, b] = linearRgb(hex);
      const value = (uniformSwatch(hex) as { value: THREE.Vector3 }).value;
      expect(value.x, `0x${hex.toString(16)} r`).toBeCloseTo(r, 12);
      expect(value.y, `0x${hex.toString(16)} g`).toBeCloseTo(g, 12);
      expect(value.z, `0x${hex.toString(16)} b`).toBeCloseTo(b, 12);
    }
  });
});

describe('HF-477 nuketown2 WebGPU pipeline budget — the arena', () => {
  it('builds many node materials but only a bounded number of graphs', () => {
    const rows = arena();
    const distinct = new Set(rows.map((row) => row.key));

    // The arena must still author materials in bulk: a future change that
    // deleted the node-material layer outright would otherwise "pass" by
    // building nothing.
    //
    // FLOOR HISTORY. 80 when written (96 measured, candidate 4b). HITL 5 merged
    // the perf lane's forge change - five per-vehicle material sets of nine
    // buckets became five paint/accent pairs over ONE shared bucket set
    // (45 -> 17 materials) - and re-pointed the garage wing at the registry's
    // cream siding role (-1), so the arena measures 68. The floor moves to 60
    // for that measured, explained reason and no other; it is a guard against
    // an EMPTY material layer, not a target, and 60 still fails a build that
    // drops the families.
    expect(rows.length, 'node materials in the built arena').toBeGreaterThanOrEqual(60);

    expect(
      distinct.size,
      `nuketown2 built ${distinct.size} distinct node graphs from ${rows.length} node materials; `
      + 'arena admission must realise every one as a WGSL program and a pipeline inside a single '
      + 'fenced coverage submission (HF-477)',
    ).toBeLessThanOrEqual(NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS);

    // Sharing has to be REAL. One graph per material is the defect itself, and
    // it is what this arena shipped for every family factory before this pass.
    expect(distinct.size, 'graphs must be shared, not one per material').toBeLessThan(rows.length);
  });

  it('shares one graph across the roles that differ only by colour', () => {
    const keys = registryKeys();
    const key = (role: string): string => keys.get(role)!;

    // THE TWO HOUSES. Terracotta-orange upper and cream ground storey: same
    // lap siding, same courses, same drip shadow, same nails, same wear — one
    // shader, two uniforms. This pair alone was two cold compiles.
    expect(key('sidingA'), 'sidingA and sidingB are one siding shader').toBe(key('sidingB'));

    // THE UNPANELLED PAINTED METAL. Signage, both chirality cooker banks and
    // the coach waistline are the same enamelled steel in four colours;
    // roughness, metalness and polygonOffset are CPU-side material properties
    // and cost no shader. Four compiles collapse to one. (HF-486 moved the
    // roof glazing out of this family and into the glass family below.)
    const unpanelled = ['sign', 'applianceRed', 'applianceBlue', 'busTrim'];
    for (const role of unpanelled) {
      expect(key(role), `${role} shares the unpanelled painted-metal shader`).toBe(key('sign'));
    }

    // THE TRANSMISSION GLAZING. HF-486: the roof glazing and the coach band
    // are one thin-walled physical-transmission graph. Tint rides the shared
    // albedo uniform, the per-role roughness trim rides a uniform node, and
    // transmission/thickness/ior are scalar properties — so the pale roof
    // pane and the dark coach band compile once, not twice.
    expect(key('roofGlazing'), 'roofGlazing and coachGlass are one glazing shader').toBe(key('coachGlass'));

    // The driveway apron and its coplanar decal are the same pour.
    expect(key('drive'), 'drive and driveDecal are one apron shader').toBe(key('driveDecal'));

    // And the library as a whole: 21 roles, strictly fewer graphs.
    expect(new Set(keys.values()).size, 'registry graphs').toBeLessThan(keys.size);
  });

  it('keeps the graph-TOPOLOGY variants as separate shaders', () => {
    // THE OTHER HALF OF THE CONTRACT. These branches change the node graph's
    // SHAPE, not a value in it: a panelled door stamps joints an unpanelled
    // sign does not have, a slab is jointed where a wall is coursed, a backdrop
    // swaps lattice noise for three sines. Collapsing any of them would be
    // deleting a surface, not sharing a pipeline — so they are pinned apart
    // here, or a future "optimisation" could buy its budget by flattening the
    // arena's actual detail.
    const keys = registryKeys();
    const key = (role: string): string => keys.get(role)!;

    const mustDiffer: ReadonlyArray<readonly [string, string, string]> = [
      ['garageDoor', 'roofGlazing', 'painted metal panelled vs glass'],
      ['roofGlazing', 'sign', 'glass vs painted metal are different families'],
      ['drive', 'kerb', 'concrete: apron vs kerb'],
      ['drive', 'block', 'concrete: apron vs blockwork'],
      ['kerb', 'block', 'concrete: kerb vs blockwork'],
      ['fence', 'trim', 'timber: fence boards vs painted trim'],
      ['lawn', 'planter', 'lawn: mown turf vs hedge'],
      ['lawn', 'ground', 'lawn: turf vs the backdrop scrub plain'],
      ['coachGlass', 'asphalt', 'glass vs asphalt are different families'],
    ];
    for (const [a, b, why] of mustDiffer) {
      expect(key(a), why).not.toBe(key(b));
    }
  });
});
