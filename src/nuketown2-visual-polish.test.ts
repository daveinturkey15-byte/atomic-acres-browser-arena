/**
 * PASS 95 visual-polish-from-skills lane (HF-509): the three techniques this
 * lane implements from the canonical skill store and the technique register
 * must land INSIDE the existing budgets, and this file pins the properties
 * that make that true rather than restating them in a report:
 *
 *   1. edge weathering (photoreal-procedural-scene-forge: "wear at the
 *      corners, in millimetres") is a per-material uniform inside each
 *      family's ONE shared graph - so the registry's distinct-graph count is
 *      the same with and without it;
 *   2. wet asphalt and puddles (open-world-city-art-loop: the road surface
 *      carries the look) ride the shared asphalt graph behind `asphaltWet`;
 *   3. lit windows (threejs-webgpu-interior-lighting-look: emissive fixtures
 *      above the bloom threshold, never a new light) are one emissive node on
 *      the existing pane material, with no light object and no new material.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  NUKETOWN2_EDGE_CHIP_ROLES,
  NUKETOWN2_MATERIAL_ROLES,
  createNuketown2MaterialRegistry,
} from './nuketown2-materials';
import { edgeWear } from './nuketown2-materials/wear';
import {
  NUKETOWN2_WINDOW_GLOW_INTENSITY,
  createNuketown2GlassMaterial,
} from './nuketown2-interior-materials';
import { MINIMUM_COMPOSED_BLOOM_THRESHOLD } from './rendering/art-direction';

type Uniforms = Record<string, unknown>;
const uniformsOf = (material: THREE.Material): Uniforms =>
  (material.userData.nuketown2Uniforms ?? {}) as Uniforms;

describe('PASS 95 visual polish from the skill store', () => {
  it('edge weathering is a uniform, not a graph: every role carries the slot and only the chip roles set it', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    const chipRoles = new Set<string>(NUKETOWN2_EDGE_CHIP_ROLES);
    for (const role of NUKETOWN2_MATERIAL_ROLES) {
      const values = uniformsOf(registry[role]!);
      expect(values.edgeChip, `${role}.edgeChip is declared`).toBeDefined();
      expect(values.edgeChip, `${role}.edgeChip`).toBe(chipRoles.has(role) ? 1 : 0);
    }
    // Slabs, glazing bands and painted trim never chip: they have no free
    // edge, or the term would read as damage on a surface that is not damaged.
    for (const clean of ['drive', 'driveDecal', 'roofGlazing', 'busTrim', 'trim', 'coachGlass', 'asphalt']) {
      expect(chipRoles.has(clean), `${clean} stays clean`).toBe(false);
    }
  });

  it('shares one graph per family with the edge term inside it (no new pipelines)', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material & { colorNode?: unknown }>;
    // Same family, one chipped and one clean: the NODE is the same object,
    // which is the strongest possible statement that the WGSL is the same.
    expect(registry.kerb!.colorNode).toBe(registry.drive!.colorNode);
    expect(registry.garageDoor!.colorNode).toBe(registry.roofGlazing!.colorNode);
    expect(registry.fence!.colorNode).toBe(registry.trim!.colorNode);
    expect(registry.asphalt!.colorNode).toBe(registry.trimDecal!.colorNode);
  });

  it('builds the derivative-based edge mask as a node without touching vertex data', () => {
    const node = edgeWear(0.03) as { isNode?: boolean };
    expect(node.isNode).toBe(true);
  });

  it('wets the carriageway and its markings through the shared asphalt graph', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material & { metalness: number }>;
    expect(uniformsOf(registry.asphalt!).asphaltWet).toBe(1);
    expect(uniformsOf(registry.trimDecal!).asphaltWet).toBe(1);
    // Aprons and kerbs are concrete: standing water is authored on the road only.
    expect(uniformsOf(registry.kerb!).asphaltWet).toBe(0);
    expect(uniformsOf(registry.drive!).asphaltWet).toBe(0);
    // The road stays a dielectric; the reflection comes from the environment
    // and the screen-space tier, never from a metalness cheat.
    expect(registry.asphalt!.metalness).toBeLessThanOrEqual(0.05);
  });

  it('lights the house panes with an emissive node and no light object', () => {
    const pane = createNuketown2GlassMaterial() as THREE.Material & { emissiveNode?: { isNode?: boolean } | null };
    expect(pane.emissiveNode?.isNode, 'pane emissive is a node').toBe(true);
    expect((pane as { isLight?: boolean }).isLight ?? false).toBe(false);
    expect(pane.transparent).toBe(true);
    // Peak glow after the pane's own alpha clears the composed bloom floor
    // (so the halo is bought by the existing post chain), but by a margin
    // small enough that the pane never washes a sightline behind it.
    const peakAfterAlpha = NUKETOWN2_WINDOW_GLOW_INTENSITY * pane.opacity;
    expect(peakAfterAlpha).toBeGreaterThan(MINIMUM_COMPOSED_BLOOM_THRESHOLD);
    expect(peakAfterAlpha).toBeLessThan(2.0);
  });
});
