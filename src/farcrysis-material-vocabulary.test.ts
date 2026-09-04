import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';
import { collapseFarcrysisMaterialVocabulary, farcrysisMaterialCensus } from './farcrysis-material-vocabulary';
import { tslResetWindUniforms } from './farcrysis-tsl-foliage';

/**
 * PASS 94 rework, gate G4 - a ONE-WAY ratchet on farcrysis's distinct material
 * objects.
 *
 * WHY A RATCHET AND NOT A TARGET. `docs/research/2026-09-04/FARCRYSIS-rework-plan.md`
 * section 5.3 names the material count as the single largest lever on both
 * admission time and frame time, and the shipped caveat it is answering is
 * measured: farcrysis's in-combat frame time is 1.34-1.89x atomic-acres
 * (median 1.64x) at 222 distinct materials against the control's 110. The plan
 * asks for this gate to land "red first" at the measured number. It lands as a
 * ratchet instead, for the reason `legacy-main-size-ratchet.test.ts` already
 * records in this repository: a knowingly-red gate on a shared branch teaches
 * contributors to ignore red, and a gate nobody trusts protects nothing. The
 * TARGET below is not weakened by that - it is written down, it is quoted in
 * the lane report, and it stays OPEN until it is met.
 *
 * IT FAILS IN ONE DIRECTION ONLY. One extra material object reds this test
 * until MATERIAL_CEILING is raised with a CEILING_HISTORY entry saying why.
 * Removal never fails, ever - the whole point is to make the art slices' wins
 * un-losable.
 *
 * ---------------------------------------------------------------------------
 * HOW TO LOWER THE CEILING (never required to get green; always welcome)
 * ---------------------------------------------------------------------------
 * 1. Read the number this test prints.
 * 2. Set MATERIAL_CEILING to it.
 * 3. Add a CEILING_HISTORY entry.
 *
 * HOW TO RAISE IT. You need a measurement, not an argument: the arena needs a
 * genuinely new draw state, you have checked it is not an exact duplicate of one
 * that already exists (the collapse pass would have removed it if it were), and
 * you have quoted the admission pair ratio from
 * `scripts/qa/collect-farcrysis-admission-evidence.mjs` at the new number.
 */
const MATERIAL_CEILING = 166;

/**
 * Parity with the shipped control. `docs/evidence/pass87/lane-r/frame-time-at-head.json`
 * measured atomic-acres at 110 distinct materials in the browser; the rework's
 * exit condition is that farcrysis does not cost more than its control does.
 * This is a documented objective, NOT an assertion - asserting it today would
 * be the knowingly-red gate described above.
 */
const MATERIAL_TARGET = 110;

/**
 * The measured render-state families under `buildFarcrysis`. 990 meshes, 168
 * material objects, 14 distinct signatures: the gap between 168 and 14 is what
 * the art slices are being asked to close, and this ceiling stops it widening
 * while they work.
 */
const RENDER_STATE_SIGNATURE_CEILING = 14;

const CEILING_HISTORY: ReadonlyArray<{ readonly at: string; readonly ceiling: number; readonly why: string }> = [
  {
    at: '2026-09-04',
    ceiling: 198,
    why: 'PASS 94 slice 1 baseline, measured at branch point c3ba5028: 990 meshes, 198 distinct '
      + 'material objects, 14 distinct render-state signatures.',
  },
  {
    at: '2026-09-04',
    ceiling: 168,
    why: 'PASS 94 slice 1. -20 from collapseFarcrysisMaterialVocabulary (exact-duplicate '
      + 'MeshStandardMaterial objects merged onto one representative each, zero visual change), '
      + '-10 from the detail rock family moving its per-stone tint off eleven materials and onto '
      + 'the geometry as vertex colours.',
  },
  {
    at: '2026-09-04',
    ceiling: 166,
    why: 'PASS 95 slice 2. -2 from the art boulder family (farcrysis-cliff-rocks / '
      + 'farcrysis-interior-boulders / farcrysis-shore-boulders) moving its per-set tint off three '
      + 'materials and onto per-instance instanceColor behind one shared white material and one '
      + 'shared geometry (varyInstanceColors idiom per the Luna review, zero visual change by '
      + 'construction).',
  },
];

function fakeCanvasContext(): CanvasRenderingContext2D {
  const gradient = () => ({ addColorStop: vi.fn() });
  const state: Record<PropertyKey, unknown> = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px sans-serif',
  };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'createImageData') {
        return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      }
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 10 });
      if (typeof prop === 'string') {
        if (!(prop in target)) target[prop] = vi.fn();
        return target[prop];
      }
      return undefined;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

function stubCanvasDocument(renderBackend: string): void {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0, getContext: () => context, style: {},
      setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
    }),
    getElementById: () => null,
    documentElement: { dataset: { renderBackend } },
    body: { appendChild: () => undefined },
  });
}

function buildArena(): THREE.Scene {
  stubCanvasDocument('webgpu');
  const scene = new THREE.Scene();
  buildFarcrysis(scene);
  return scene;
}

describe('PASS 94 G4 - farcrysis material vocabulary', () => {
  beforeEach(() => tslResetWindUniforms());
  afterEach(() => vi.unstubAllGlobals());

  it('keeps distinct material objects under the ratchet ceiling', () => {
    const scene = buildArena();
    const census = farcrysisMaterialCensus(scene);

    expect(
      census.materials,
      `farcrysis built ${census.materials} distinct material objects across ${census.meshes} meshes `
      + `(${census.standardMaterials} standard, ${census.nodeMaterials} node, ${census.otherMaterials} other). `
      + `The ceiling is ${MATERIAL_CEILING}. Every material object is a binding the renderer sets up `
      + 'and a row in the fenced admission coverage draw, and this arena is the one measured to lose '
      + 'that 12 s race (src/rendering/cold-session-precompile-reach.ts).\n'
      + `TO LOWER (welcome, never required): set MATERIAL_CEILING = ${census.materials} and add a `
      + 'CEILING_HISTORY entry.\n'
      + 'TO RAISE: you need a genuinely new draw state plus a re-quoted admission pair ratio from '
      + 'scripts/qa/collect-farcrysis-admission-evidence.mjs.',
    ).toBeLessThanOrEqual(MATERIAL_CEILING);

    // Sharing has to be real. If a future change deletes the arena's art or the
    // collapse hook, the count collapses for the wrong reason and this catches
    // it - the same shape as the pipeline-budget gate's lower bound.
    expect(census.meshes).toBeGreaterThanOrEqual(800);
    expect(census.materials).toBeGreaterThanOrEqual(40);

    // The objective, recorded rather than asserted. See MATERIAL_TARGET.
    expect(MATERIAL_TARGET).toBeLessThan(MATERIAL_CEILING);
    expect(CEILING_HISTORY[CEILING_HISTORY.length - 1].ceiling).toBe(MATERIAL_CEILING);
  });

  it('leaves no exact-duplicate standard material behind for the collapse to find', () => {
    const scene = buildArena();
    // The build already ran the collapse as its last step. Running it again on
    // the same tree must therefore find NOTHING - which proves both that the
    // hook is wired and that the pass is a fixed point rather than something
    // whose result depends on how many times it happens to run.
    const second = collapseFarcrysisMaterialVocabulary(scene);
    expect(
      second.collapsed,
      `a second collapse pass merged ${second.collapsed} more materials, so the build is not running `
      + 'it last (or not at all). See the hook in src/farcrysis.ts.',
    ).toBe(0);
    expect(second.materialsBefore).toBe(second.materialsAfter);
  });

  it('never merges a material class whose object identity is load-bearing', () => {
    // Rule 1 of the collapse, tested directly rather than inferred from the
    // arena: every farcrysis material that is MUTATED PER FRAME is a
    // MeshBasicMaterial or a PointsMaterial (god-ray shaft opacity, foam rings,
    // caustics, edge ripples, sun glitter, fireflies), so merging two of them
    // would make every sharer animate together; and node materials carry TSL
    // graphs this collapse key cannot see. Identical twins of both classes must
    // survive the pass untouched, while identical standard twins must not.
    const scene = new THREE.Scene();
    const add = (material: THREE.Material, name: string): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.name = name;
      scene.add(mesh);
      return mesh;
    };
    const basicOptions = { color: 0xffecc0, transparent: true, opacity: 0.25, depthWrite: false };
    const basicA = add(new THREE.MeshBasicMaterial(basicOptions), 'basic-a');
    const basicB = add(new THREE.MeshBasicMaterial(basicOptions), 'basic-b');
    const pointsA = add(new THREE.PointsMaterial({ size: 0.1 }), 'points-a');
    const pointsB = add(new THREE.PointsMaterial({ size: 0.1 }), 'points-b');
    const physicalOptions = { color: 0x9fb6c0, roughness: 0.1, transmission: 0.9 };
    const physicalA = add(new THREE.MeshPhysicalMaterial(physicalOptions), 'physical-a');
    const physicalB = add(new THREE.MeshPhysicalMaterial(physicalOptions), 'physical-b');
    const standardOptions = { color: 0x5c5c5c, roughness: 0.85, metalness: 0.05 };
    const standardA = add(new THREE.MeshStandardMaterial(standardOptions), 'standard-a');
    const standardB = add(new THREE.MeshStandardMaterial(standardOptions), 'standard-b');

    const report = collapseFarcrysisMaterialVocabulary(scene);

    expect(basicA.material, 'a MeshBasicMaterial twin was merged').not.toBe(basicB.material);
    expect(pointsA.material, 'a PointsMaterial twin was merged').not.toBe(pointsB.material);
    // MeshPhysicalMaterial is a MeshStandardMaterial subclass, so an
    // `instanceof` test would have merged these two and lost transmission,
    // clearcoat, sheen and iridescence with them. The exact `type` check is why
    // they survive.
    expect(physicalA.material, 'a MeshPhysicalMaterial twin was merged by a subclass check').not.toBe(physicalB.material);
    expect(standardA.material, 'two identical MeshStandardMaterials were not merged').toBe(standardB.material);
    expect(report.collapsed).toBe(1);
  });

  it('keeps the render-state signature count under its ceiling', () => {
    const scene = buildArena();
    const signatures = new Set<string>();
    const seen = new Set<THREE.Material>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of list) {
        if (seen.has(material)) continue;
        seen.add(material);
        const m = material as THREE.MeshStandardMaterial & { colorNode?: unknown; positionNode?: unknown };
        signatures.add([
          material.type, m.map ? 'map' : '', m.normalMap ? 'nrm' : '', m.roughnessMap ? 'rgh' : '',
          m.alphaMap ? 'alp' : '', m.emissiveMap ? 'emi' : '', material.transparent ? 'T' : '',
          material.side, m.vertexColors ? 'vc' : '', material.alphaTest > 0 ? 'at' : '',
          m.colorNode ? 'cN' : '', m.positionNode ? 'pN' : '',
        ].join('/'));
      }
    });
    expect(
      signatures.size,
      `farcrysis has ${signatures.size} distinct render-state signatures for ${seen.size} material `
      + `objects. The signature ceiling is ${RENDER_STATE_SIGNATURE_CEILING}; the gap between the two `
      + 'numbers is the rework budget.',
    ).toBeLessThanOrEqual(RENDER_STATE_SIGNATURE_CEILING);
  });

  it('pins the collapse hook as the last step of the build', () => {
    // A source pin, in the style of src/presentation-prewarm-contract.test.ts.
    // Rule 2 of the collapse is an ORDERING rule, and ordering is exactly the
    // kind of contract a later refactor moves without noticing.
    const source = readFileSync(resolve(__dirname, 'farcrysis.ts'), 'utf8');
    const hook = 'root.userData.farcrysisMaterialVocabulary = collapseFarcrysisMaterialVocabulary(root);';
    expect(source).toContain(hook);
    const afterHook = source.slice(source.indexOf(hook) + hook.length);
    const nextReturn = afterHook.indexOf("return {\n    id: 'farcrysis',");
    expect(nextReturn, 'the collapse hook must be the last statement before buildFarcrysis returns').toBeGreaterThanOrEqual(0);
    expect(
      afterHook.slice(0, nextReturn).includes('applyFarcrysis'),
      'a name-keyed material mutator runs AFTER the collapse - see rule 2 in farcrysis-material-vocabulary.ts',
    ).toBe(false);
  });
});
