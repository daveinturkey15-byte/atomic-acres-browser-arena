/**
 * HF-396 - per-weapon rail / optic seating contract, read off the DELIVERED
 * first-person GLBs.
 *
 * Owner (2026-09-02): "the rail is still detached from the barrel and scope on
 * the few guns i mentioned". Measured with `scripts/qa/dump-glb-nodes.mjs` and
 * the generator's own numbers (`scripts/blender/pass65_weapon_production_geometry.py`):
 * the M14 EBR's top rail was authored 0.07 m above its receiver and handguard,
 * the railgun's dorsal rail 0.07 m above its chassis with the thermal housing
 * a further 0.03 m above the rail, the Benelli's rail 0.09-0.12 m above its
 * receiver, and the HK416's rail 0.013-0.023 m above its upper. None of these
 * is a node: the rails are baked into the per-material static batch, so the
 * contract probes the triangles directly (see weapon-rail-alignment-contract.ts).
 *
 * Every probe below is a vertical line through the weapon at a place the
 * generator puts a rail, a riser, a mount or an optic. From the bore up to the
 * top of that stack the solid must be unbroken to within SEAT_TOLERANCE.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import type { Document, Node } from '@gltf-transform/core';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import { probeVerticalStack, type RailProbe } from './weapon-rail-alignment-contract';

/**
 * Largest empty run tolerated between two parts that are meant to touch. The
 * bevels on the batched parts are 2-8 mm and the meshopt quantization is
 * sub-millimetre; 12 mm is a seam, 70 mm is a floating rail.
 */
export const RAIL_SEAT_TOLERANCE_METERS = 0.012;

const FIREARMS = 'public/assets/original/models/weapons/pass65-firearms';

/**
 * Root-space probes per weapon. Root space is what the runtime sees: +Y up,
 * muzzle toward -Z, so a generator (Blender) point (x, y, z) lands at
 * (-x, z, y). `fromY` is the bore axis (the barrel datum the owner names);
 * `toY` is the top of the stack the probe must find unbroken.
 */
const CONTRACTS: Readonly<Record<string, readonly RailProbe[]>> = Object.freeze({
  // Sage chassis: bore z=.08; rail spine now .125-.15 on a riser from .10;
  // scope mounts at Blender y=-.2 and .12 rise from the rail to the tube.
  'm14-ebr': [
    { x: 0.0031, z: -0.7, fromY: 0.08, toY: 0.15 },
    { x: 0.0031, z: -0.5, fromY: 0.08, toY: 0.15 },
    { x: 0.0031, z: -0.3, fromY: 0.08, toY: 0.15 },
    { x: 0.0031, z: 0.0, fromY: 0.08, toY: 0.15 },
    { x: 0.0031, z: 0.22, fromY: 0.08, toY: 0.15 },
    // Through the scope mounts, up to the scope tube's centre.
    { x: 0.0031, z: -0.2, fromY: 0.08, toY: 0.33 },
    { x: 0.0031, z: 0.12, fromY: 0.08, toY: 0.33 },
  ],
  // EMRG: coils at z=.08 (the rail datum); dorsal rail on its riser; the
  // thermal housing on a mount block over the rail.
  railgun: [
    { x: 0.0031, z: -0.6, fromY: 0.05, toY: 0.17 },
    { x: 0.0031, z: -0.4, fromY: 0.05, toY: 0.17 },
    { x: 0.0031, z: -0.15, fromY: 0.05, toY: 0.17 },
    { x: 0.0031, z: 0.2, fromY: 0.05, toY: 0.17 },
    { x: 0.0031, z: -0.03, fromY: 0.05, toY: 0.34 },
  ],
  // HK416: bore z=.035; monolithic top rail on a riser over the forged upper
  // and the heavy handguard; holographic optic base on the rail.
  carbine: [
    { x: 0.0031, z: -0.55, fromY: 0.035, toY: 0.169 },
    { x: 0.0031, z: -0.35, fromY: 0.035, toY: 0.169 },
    { x: 0.0031, z: -0.1, fromY: 0.035, toY: 0.169 },
    { x: 0.0031, z: 0.15, fromY: 0.035, toY: 0.169 },
    { x: 0.0031, z: -0.02, fromY: 0.035, toY: 0.2 },
  ],
  // M4A1: bore z=.052; RAS top rail spine .132-.158 over the RAS core on a
  // riser; the rear aperture base on the rail at y=.175.
  m4a1: [
    { x: 0.0031, z: -0.45, fromY: 0.052, toY: 0.158 },
    { x: 0.0031, z: -0.3, fromY: 0.052, toY: 0.158 },
    { x: 0.0031, z: -0.15, fromY: 0.052, toY: 0.158 },
    { x: 0.0031, z: 0.05, fromY: 0.052, toY: 0.158 },
    { x: 0.0031, z: 0.175, fromY: 0.052, toY: 0.19 },
  ],
  // Benelli M4: bore z=.1; receiver rail on a riser; ghost ring on the rail.
  'slug-shotgun': [
    { x: 0.0031, z: -0.2, fromY: 0.1, toY: 0.145 },
    { x: 0.0031, z: -0.05, fromY: 0.1, toY: 0.145 },
    { x: 0.0031, z: 0.1, fromY: 0.1, toY: 0.145 },
    { x: 0.0031, z: 0.2, fromY: 0.1, toY: 0.145 },
  ],
  // M40A5: no rail; the scope rings and mounts sit on the action at y=-.22/.1.
  sniper: [
    { x: 0.0031, z: -0.22, fromY: 0.08, toY: 0.29 },
    { x: 0.0031, z: 0.1, fromY: 0.08, toY: 0.29 },
  ],
});

/** Every triangle of every mesh in root space, flat [ax ay az bx by bz cx cy cz ...]. */
async function rootSpaceTriangles(relative: string): Promise<Float64Array> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document: Document = await io.readBinary(new Uint8Array(readFileSync(join(process.cwd(), relative))));
  const scene = document.getRoot().listScenes()[0];
  if (!scene) throw new Error(`${relative}: no scene`);
  const out: number[] = [];
  const walk = (node: Node, parent: number[]): void => {
    const world = multiply(parent, fromTRS(node.getTranslation(), node.getRotation(), node.getScale()));
    const mesh = node.getMesh();
    if (mesh) {
      for (const primitive of mesh.listPrimitives()) {
        const position = primitive.getAttribute('POSITION');
        if (!position) continue;
        const array = position.getArray()!;
        const divisor = position.getNormalized() ? normalizedDivisor(array) : 1;
        const size = position.getElementSize();
        const point = (index: number): [number, number, number] => transform(world, [
          array[index * size]! / divisor, array[index * size + 1]! / divisor, array[index * size + 2]! / divisor,
        ]);
        const indices = primitive.getIndices();
        const count = indices ? indices.getCount() : position.getCount();
        const at = (i: number): number => (indices ? indices.getScalar(i) : i);
        for (let i = 0; i + 2 < count; i += 3) {
          out.push(...point(at(i)), ...point(at(i + 1)), ...point(at(i + 2)));
        }
      }
    }
    for (const child of node.listChildren()) walk(child, world);
  };
  for (const node of scene.listChildren()) walk(node, IDENTITY);
  return Float64Array.from(out);
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function normalizedDivisor(array: ArrayLike<number>): number {
  if (array instanceof Int16Array) return 32_767;
  if (array instanceof Int8Array) return 127;
  if (array instanceof Uint16Array) return 65_535;
  if (array instanceof Uint8Array) return 255;
  return 1;
}
function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[column * 4 + k]!;
      out[column * 4 + row] = sum;
    }
  }
  return out;
}
function fromTRS(t: ArrayLike<number>, q: ArrayLike<number>, s: ArrayLike<number>): number[] {
  const x = q[0]!; const y = q[1]!; const z = q[2]!; const w = q[3]!;
  const x2 = x + x; const y2 = y + y; const z2 = z + z;
  const xx = x * x2; const xy = x * y2; const xz = x * z2;
  const yy = y * y2; const yz = y * z2; const zz = z * z2;
  const wx = w * x2; const wy = w * y2; const wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0]!, (xy + wz) * s[0]!, (xz - wy) * s[0]!, 0,
    (xy - wz) * s[1]!, (1 - (xx + zz)) * s[1]!, (yz + wx) * s[1]!, 0,
    (xz + wy) * s[2]!, (yz - wx) * s[2]!, (1 - (xx + yy)) * s[2]!, 0,
    t[0]!, t[1]!, t[2]!, 1,
  ];
}
function transform(m: number[], p: [number, number, number]): [number, number, number] {
  return [
    m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
    m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
    m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
  ];
}

/**
 * WHICH DELIVERED MODELS ARE GATED.
 *
 * The lane re-exported six variants per weapon and only the first-person one
 * was probed, so a rail could have drifted in the world or pickup model without
 * failing anything. The probes are root-space and the generator emits every
 * full-detail variant from the same geometry, so they transfer unchanged to the
 * world and drop models; all three full-detail variants are gated here.
 *
 * The LOD1/LOD2 variants are deliberately NOT gated: they are decimated, so a
 * rail that is genuinely seated can still read as a gap wider than the 12 mm
 * seam tolerance at a probe line. Their seating is inherited from the LOD0
 * geometry these tests do gate.
 */
const GATED_VARIANTS = ['fp-lod0', 'world-lod0', 'drop-lod0'] as const;

describe('HF-396 rail and optic seating on the delivered first-person weapons', () => {
  for (const [weapon, probes] of Object.entries(CONTRACTS)) {
    for (const variant of GATED_VARIANTS) {
    it(`${weapon} ${variant}: rail on the receiver line and optic on the rail, unbroken to within ${RAIL_SEAT_TOLERANCE_METERS * 1000} mm`, async () => {
      const triangles = await rootSpaceTriangles(`${FIREARMS}/${weapon}/${weapon}-${variant}.glb`);
      expect(triangles.length).toBeGreaterThan(9 * 100);
      const verdicts = probes.map((probe) => probeVerticalStack(triangles, probe));
      const failing = verdicts
        .filter((verdict) => verdict.largestGapMeters > RAIL_SEAT_TOLERANCE_METERS)
        .map((verdict) => `z=${verdict.probe.z} gap ${(verdict.largestGapMeters * 1000).toFixed(1)} mm at y ${verdict.gaps[0]![0].toFixed(3)}..${verdict.gaps[0]![1].toFixed(3)} (solid: ${verdict.solids.map(([low, high]) => `${low.toFixed(3)}..${high.toFixed(3)}`).join(' ')})`);
      expect(failing, `${weapon} floating parts`).toEqual([]);
      // And the probe actually crossed the stack: an empty column would pass
      // the gap test trivially.
      for (const verdict of verdicts) {
        expect(verdict.solids.length, `${weapon} probe z=${verdict.probe.z} found no solid`).toBeGreaterThan(0);
      }
    }, 30_000);
    }
  }
});
