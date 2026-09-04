/**
 * HF-486 transmission glazing — the acceptance pin for the window-look lane.
 *
 * WHAT THIS GATE IS FOR. Nuke Town Rebuild's glazing shipped as painted metal
 * (roofGlazing) and as an alpha/opaque dielectric without transmission
 * (coachGlass): surfaces that read as enamel and tinted plastic rather than
 * glass. This lane re-answers both roles with one shared thin-walled
 * physical-transmission graph — per-role tint through the albedo uniform,
 * per-role roughness trim through a uniform node, transmission/thickness/ior
 * as scalar properties — so the look arrives with zero new pipelines and no
 * per-frame work beyond the material itself.
 *
 * WHAT IT DOES NOT DO. Pipeline sharing is pinned in
 * `src/nuketown2-pipeline-budget.test.ts` (the instrument that owns graph
 * keys), breakable-pane registration in
 * `src/nuketown2-glass-authority.test.ts`, and the house colours in
 * `src/nuketown2-fidelity.test.ts`. This file pins the material contract:
 * transmission-enabled, thin-walled, dielectric, opaque, tinted per role.
 */
import { describe, expect, it } from 'vitest';

import { createNuketown2MaterialRegistry } from './nuketown2-materials';

describe('HF-486 nuketown2 transmission glazing', () => {
  it('transmission-enables the glazing roles with a per-role uniform tint', () => {
    const registry = createNuketown2MaterialRegistry();

    // Tint per role: the pale blue-grey roof pane and the dark coach band.
    expect(registry.roofGlazing.color.getHex()).toBe(0xaebdc1);
    expect(registry.coachGlass.color.getHex()).toBe(0x2b3d47);

    for (const role of ['roofGlazing', 'coachGlass'] as const) {
      const material = registry[role] as unknown as Record<string, unknown>;
      // A node material driving the arena's shared glazing graph.
      expect(material.isNodeMaterial, `${role} is a node material`).toBe(true);
      expect(material.colorNode, `${role} albedo node`).toBeTruthy();
      expect(material.roughnessNode, `${role} roughness node`).toBeTruthy();
      // Transmission-enabled, thin-walled, dielectric, opaque.
      expect(material.transmission, `${role} transmission`).toBeGreaterThan(0);
      expect(material.thickness, `${role} thin-walled thickness`).toBeLessThanOrEqual(0.1);
      expect(material.ior, `${role} IOR`).toBe(1.5);
      expect(material.metalness, `${role} dielectric`).toBe(0);
      expect(material.transparent, `${role} stays out of the transparent queue`).toBe(false);
      // Both roles opaque, so neither writes an opacity node: same graph.
      expect(material.opacityNode ?? null, `${role} has no opacity node`).toBeNull();
    }
  });

  it('pins the authored transmission split between the two roles', () => {
    const registry = createNuketown2MaterialRegistry();
    // Sunlit pale roof glass reads through; the dark coach band mostly tints.
    expect(registry.roofGlazing.transmission).toBe(0.6);
    expect(registry.coachGlass.transmission).toBe(0.45);
    expect(registry.roofGlazing.thickness).toBe(0.05);
    expect(registry.coachGlass.thickness).toBe(0.05);
  });
});
