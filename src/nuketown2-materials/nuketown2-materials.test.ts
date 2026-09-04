/**
 * PASS 94 materials lane — the per-family gate.
 *
 * WHAT THIS GATE IS FOR. The owner's report on the rebuilt Nuke Town was that
 * it "looks like basic geometry". The two properties that fix that are
 * numbers, not opinions:
 *
 *   1. wear at three scales, each inside its authored physical band; and
 *   2. an albedo wear step the eye can actually resolve.
 *
 * Both are asserted here per FAMILY, against the same spec objects the node
 * graphs are built from, so a future edit that quietly tunes the wear back
 * down to the invisible 3-6% the arena shipped with fails this file rather
 * than passing review and losing the frame.
 *
 * It also pins the properties this lane must NOT have changed: the HF-434
 * coplanar offset tiers, the two houses' base hexes (the fidelity gate reads
 * those), zero imported textures, and zero light objects.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import {
  MAX_ALBEDO_DARKENING,
  MIN_ALBEDO_WEAR_STEP,
  NUKETOWN2_MATERIAL_ROLES,
  WEAR_BANDS,
  albedoWearStep,
  createNuketown2MaterialRegistry,
  linearRgb,
  maxDarkening,
  type Nuketown2MaterialSpec,
} from './index';
import { sidingSpec } from './families/siding';
import { roofSpec } from './families/roof';
import { asphaltSpec, markingSpec } from './families/asphalt';
import { concreteSpec } from './families/concrete';
import { timberSpec } from './families/timber';
import { glassSpec } from './families/glass';
import { paintedMetalSpec } from './families/painted-metal';
import { lawnSpec } from './families/lawn';

/**
 * One representative spec per family, plus the roughness/metalness window
 * that family is allowed to live in.
 *
 * The windows are per-family PBR ranges, not a global "0..1 is fine": a
 * dielectric pane at metalness 0.3 and a mown lawn at roughness 0.4 are both
 * type errors you can only catch by family.
 */
const FAMILIES: ReadonlyArray<{
  readonly family: string;
  readonly spec: Nuketown2MaterialSpec;
  readonly roughness: readonly [number, number];
  readonly metalness: readonly [number, number];
}> = [
  { family: 'siding', spec: sidingSpec('gate-siding', 0x46809f), roughness: [0.55, 0.90], metalness: [0, 0.05] },
  { family: 'roof', spec: roofSpec('gate-roof'), roughness: [0.80, 1.00], metalness: [0, 0.05] },
  { family: 'asphalt', spec: asphaltSpec('gate-asphalt'), roughness: [0.85, 1.00], metalness: [0, 0.05] },
  { family: 'asphalt-marking', spec: markingSpec('gate-marking'), roughness: [0.75, 1.00], metalness: [0, 0.05] },
  { family: 'concrete', spec: concreteSpec('gate-concrete', 0x9a978a), roughness: [0.85, 1.00], metalness: [0, 0.05] },
  { family: 'timber', spec: timberSpec('gate-timber', 0x8a6244, 'fence'), roughness: [0.80, 1.00], metalness: [0, 0.05] },
  { family: 'timber-painted', spec: timberSpec('gate-trim', 0xf0e4c9, 'painted-trim'), roughness: [0.50, 0.80], metalness: [0, 0.05] },
  // Float glass is a DIELECTRIC. metalness must be exactly 0: anything above
  // it tints the pane's own reflection by its albedo and the window comes back
  // as a sheet of coloured metal.
  { family: 'glass', spec: glassSpec('gate-glass', 0x2b3d47), roughness: [0.02, 0.10], metalness: [0, 0] },
  { family: 'painted-metal', spec: paintedMetalSpec('gate-painted-metal', 0xaebdc1), roughness: [0.25, 0.65], metalness: [0, 0.30] },
  { family: 'lawn', spec: lawnSpec('gate-lawn', 0x496438, 'turf'), roughness: [0.90, 1.00], metalness: [0, 0.02] },
];

describe('nuketown2 materials — per-family physical authoring', () => {
  for (const row of FAMILIES) {
    describe(row.family, () => {
      it('carries wear at all three authored scales, each inside its physical band', () => {
        const { grain, scuff, traffic } = row.spec;
        expect(grain.sizeM, `${row.family} grain feature size (m)`)
          .toBeGreaterThanOrEqual(WEAR_BANDS.grain.minM);
        expect(grain.sizeM).toBeLessThanOrEqual(WEAR_BANDS.grain.maxM);
        expect(scuff.sizeM, `${row.family} scuff feature size (m)`)
          .toBeGreaterThanOrEqual(WEAR_BANDS.scuff.minM);
        expect(scuff.sizeM).toBeLessThanOrEqual(WEAR_BANDS.scuff.maxM);
        expect(traffic.sizeM, `${row.family} traffic feature size (m)`)
          .toBeGreaterThanOrEqual(WEAR_BANDS.traffic.minM);
        expect(traffic.sizeM).toBeLessThanOrEqual(WEAR_BANDS.traffic.maxM);
        // Every scale must actually do something. A scale authored at zero is
        // the single-scale material this lane exists to replace.
        for (const [label, scale] of [['grain', grain], ['scuff', scuff], ['traffic', traffic]] as const) {
          expect(scale.albedo, `${row.family} ${label} albedo swing`).toBeGreaterThan(0);
        }
      });

      it('clears the visible albedo wear step and stays inside the readability ceiling', () => {
        const step = albedoWearStep(row.spec);
        expect(step, `${row.family} peak-to-peak albedo wear step`)
          .toBeGreaterThanOrEqual(MIN_ALBEDO_WEAR_STEP);
        expect(maxDarkening(row.spec), `${row.family} peak darkening`)
          .toBeLessThanOrEqual(MAX_ALBEDO_DARKENING);
      });

      it('sits in its family roughness and metalness window', () => {
        expect(row.spec.roughness, `${row.family} roughness`).toBeGreaterThanOrEqual(row.roughness[0]);
        expect(row.spec.roughness).toBeLessThanOrEqual(row.roughness[1]);
        expect(row.spec.metalness, `${row.family} metalness`).toBeGreaterThanOrEqual(row.metalness[0]);
        expect(row.spec.metalness).toBeLessThanOrEqual(row.metalness[1]);
      });
    });
  }

  it('decodes sRGB swatches to linear once, not twice', () => {
    // The trap: `new THREE.Color(hex).r` is ALREADY linear, so a generator
    // that decodes it again ships a near-black surface. These two must agree.
    for (const hex of [0x46809f, 0xf4be36, 0x8b8879, 0x496438]) {
      const [r, g, b] = linearRgb(hex);
      const viaThree = new THREE.Color(hex);
      expect(r).toBeCloseTo(viaThree.r, 4);
      expect(g).toBeCloseTo(viaThree.g, 4);
      expect(b).toBeCloseTo(viaThree.b, 4);
    }
  });
});

describe('nuketown2 material registry', () => {
  it('answers every declared role with a distinct node material', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    const seen = new Set<THREE.Material>();
    for (const role of NUKETOWN2_MATERIAL_ROLES) {
      const material = registry[role];
      expect(material, `role ${role}`).toBeDefined();
      expect(material!.name, `role ${role} is named (the coplanar instrument prints it)`).not.toBe('');
      expect(seen.has(material!), `role ${role} must be its own instance`).toBe(false);
      seen.add(material!);
    }
    expect(seen.size).toBe(NUKETOWN2_MATERIAL_ROLES.length);
  });

  it('drives albedo and roughness from node graphs, not from flat swatches', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, Record<string, unknown>>;
    for (const role of NUKETOWN2_MATERIAL_ROLES) {
      const material = registry[role]!;
      // THE REGRESSION THIS CATCHES. Ten of these roles shipped as a bare
      // `new MeshStandardMaterial({ color, roughness, metalness })` - no map,
      // no node, one value across a whole surface, which is exactly what
      // "looks like basic geometry" describes.
      expect(material.colorNode, `${role} albedo node`).toBeTruthy();
      expect(material.roughnessNode, `${role} roughness node`).toBeTruthy();
    }
  });

  it('loads no texture: every surface is generated', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, Record<string, unknown>>;
    const mapSlots = [
      'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
      'alphaMap', 'emissiveMap', 'bumpMap', 'displacementMap',
    ];
    for (const role of NUKETOWN2_MATERIAL_ROLES) {
      for (const slot of mapSlots) {
        expect(registry[role]![slot] ?? null, `${role}.${slot} must stay procedural`).toBeNull();
      }
    }
  });

  it('builds no light object', () => {
    // This lane is materials only. A material library that quietly adds a
    // light has changed the arena's lighting contract, which belongs to a
    // different lane and different gates.
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, unknown>;
    for (const role of NUKETOWN2_MATERIAL_ROLES) {
      expect((registry[role] as { isLight?: boolean }).isLight ?? false, `${role} is not a light`).toBe(false);
      expect(registry[role]).not.toBeInstanceOf(THREE.Light);
    }
  });

  it('carries the HF-434 coplanar offset tiers verbatim', () => {
    // These are not this lane's numbers to move: HF-434 measured them and the
    // coplanar instrument is asserted against the split they produce.
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    const expected: Record<string, number> = {
      lawn: -2,
      trimDecal: -2,
      asphalt: -1,
      driveDecal: -1,
      busTrim: -1,
      coachGlass: -1,
    };
    for (const [role, factor] of Object.entries(expected)) {
      expect(registry[role]!.polygonOffset, `${role} polygonOffset enabled`).toBe(true);
      expect(registry[role]!.polygonOffsetFactor, `${role} offset factor`).toBe(factor);
      expect(registry[role]!.polygonOffsetUnits, `${role} offset units`).toBe(factor);
    }
    // The SOLID users stay clean, exactly as the shipped tier says.
    for (const role of ['drive', 'trim', 'ground', 'block', 'sidingA', 'sidingB', 'roof', 'fence']) {
      expect(registry[role]!.polygonOffset, `${role} must not carry an offset`).toBe(false);
    }
  });

  it('keeps the two houses on the base hexes the fidelity gate pins', () => {
    const registry = createNuketown2MaterialRegistry();
    expect((registry.sidingA as THREE.MeshStandardMaterial).color.getHex()).toBe(0x46809f);
    expect((registry.sidingB as THREE.MeshStandardMaterial).color.getHex()).toBe(0xf4be36);
  });

  it('keeps the coach glazing band a dielectric', () => {
    // It shipped at metalness 0.5, which is a coloured metal band, not glass.
    const registry = createNuketown2MaterialRegistry();
    expect((registry.coachGlass as THREE.MeshStandardMaterial).metalness).toBe(0);
    // Opaque, so it stays out of the transparent queue it was never in.
    expect((registry.coachGlass as THREE.MeshStandardMaterial).transparent).toBe(false);
  });
});
