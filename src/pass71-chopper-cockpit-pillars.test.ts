import { describe, expect, it } from 'vitest';
// @ts-expect-error Production GLB audit is an executable Node ESM gate without generated declarations.
import { auditSupportVehicleGlb, readGlb } from '../scripts/qa/pass65-support-vehicle-glb.mjs';

const CHOPPER_ASSETS = Object.freeze([
  'public/assets/original/models/support/pass65-chopper-gunner-lod0.glb',
  'public/assets/original/models/support/pass65-chopper-gunner-lod1.glb',
  'public/assets/original/models/support/pass65-chopper-gunner-lod2.glb',
]);

const REQUIRED_FRAMING_CASES = Object.freeze([
  'desktop-720p-min-fov',
  'desktop-720p-max-fov',
  'desktop-1080p-min-fov',
  'desktop-1080p-max-fov',
  'iphone-15-landscape-min-fov',
  'iphone-15-landscape-max-fov',
  'iphone-15-portrait-min-fov',
  'iphone-15-portrait-max-fov',
]);

describe('Pass 71 authored Chopper cockpit framing', () => {
  it.each(CHOPPER_ASSETS.map((path, lod) => ({ path, lod })))(
    'projects the exact optimized LOD$lod pillar/glow/header endpoints above and outside the reticle',
    async ({ path, lod }) => {
      const { bytes, json } = await readGlb(path);
      const audit = auditSupportVehicleGlb(json, bytes.length, 'chopper', lod);
      expect(audit.failures).toEqual([]);
      expect(audit.cockpitFraming).not.toBeNull();
      expect(audit.cockpitFraming.cases.map((entry: { label: string }) => entry.label))
        .toEqual(REQUIRED_FRAMING_CASES);
      for (const receipt of audit.cockpitFraming.cases) {
        expect(receipt.elements).toHaveLength(4);
        expect(receipt.headers).toHaveLength(2);
        expect(receipt.elements.every((entry: { topViewportRatio: number }) => (
          entry.topViewportRatio <= 0.24
        ))).toBe(true);
        expect(receipt.elements.every((entry: { centreClearancePx: number }) => (
          entry.centreClearancePx >= 0
        ))).toBe(true);
      }
    },
    20_000,
  );

  it('rejects optimized pillar geometry whose POSITION extent no longer reaches its semantic endpoints', async () => {
    const { bytes, json } = await readGlb(CHOPPER_ASSETS[0]);
    const mutated = structuredClone(json);
    const pillar = mutated.nodes.find((node: { name?: string }) => (
      node.name === 'Chopper_InnerWindscreenPillar_-1_LOD0'
    ));
    const positionAccessorIndex = mutated.meshes[pillar.mesh].primitives[0].attributes.POSITION;
    const positionAccessor = mutated.accessors[positionAccessorIndex];
    positionAccessor.min[1] = Math.trunc(positionAccessor.min[1] / 2);
    positionAccessor.max[1] = Math.trunc(positionAccessor.max[1] / 2);

    const audit = auditSupportVehicleGlb(mutated, bytes.length, 'chopper', 0);
    expect(audit.failures).toContain(
      'chopper LOD0: left pillar mesh normalized POSITION Y extent does not match audited semantic half-length',
    );
  });
});
