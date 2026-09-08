import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  aerialPerspectiveInscatter,
  resolveAerialPerspectiveTuning,
} from './atmosphere/aerial-perspective';
import {
  NUKETOWN2_MAX_VOLUMETRIC_SHAFTS,
  NUKETOWN2_OPENING_ANCHORS,
  VolumetricShaftSystem,
  buildNuketown2OpeningAnchors,
  createVolumetricShaftMaterial,
  openingSunFacingDot,
  selectSunlitOpeningAnchors,
  volumetricShaftSunPhase,
} from './volumetric-light-shafts';

describe('nuketown2 volumetric opening shafts', () => {
  it('keeps analytic in-scatter sun-facing at fixed density', () => {
    const tuning = resolveAerialPerspectiveTuning('high');
    const forward = aerialPerspectiveInscatter(80, 0, 1, [0.55, 0.62, 0.72], [1, 0.94, 0.81], tuning);
    const away = aerialPerspectiveInscatter(80, 0, -1, [0.55, 0.62, 0.72], [1, 0.94, 0.81], tuning);
    expect(forward[1]).toBeGreaterThan(away[1] * 1.8);
  });

  it('derives a paired, bounded anchor table from authored doors and windows', () => {
    const anchors = buildNuketown2OpeningAnchors();
    expect(anchors).toHaveLength(6);
    expect(new Set(anchors.map((anchor) => anchor.id)).size).toBe(anchors.length);
    expect(anchors.every((anchor) => anchor.width > 0 && anchor.headY > anchor.floorY)).toBe(true);
    expect(anchors.filter((anchor) => anchor.side === 'north')).toHaveLength(3);
    expect(anchors.filter((anchor) => anchor.side === 'south')).toHaveLength(3);

    for (const north of anchors.filter((anchor) => anchor.side === 'north')) {
      const south = anchors.find((anchor) => anchor.sourceId === north.sourceId && anchor.side === 'south');
      expect(south).toBeDefined();
      expect(south!.normal[0]).toBeCloseTo(-north.normal[0]);
      expect(south!.normal[2]).toBeCloseTo(-north.normal[2]);
      expect(south!.center[2]).toBeCloseTo(-north.center[2]);
    }
  });

  it('gates shafts by the opening normal and turns the lowest tier off', () => {
    const sun = new THREE.Vector3(0, 0.7, 1).normalize();
    const selected = selectSunlitOpeningAnchors(NUKETOWN2_OPENING_ANCHORS, 'high', sun);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((anchor) => openingSunFacingDot(anchor, sun) > 0.05)).toBe(true);
    expect(selectSunlitOpeningAnchors(NUKETOWN2_OPENING_ANCHORS, 'off', sun)).toHaveLength(0);
    expect(selectSunlitOpeningAnchors(NUKETOWN2_OPENING_ANCHORS, 'low', sun).length).toBeLessThanOrEqual(3);
  });

  it('uses the squared forward phase and rejects a back-facing view', () => {
    expect(volumetricShaftSunPhase(1)).toBeGreaterThan(volumetricShaftSunPhase(-1));
    expect(volumetricShaftSunPhase(-1)).toBe(0);
    expect(volumetricShaftSunPhase(1)).toBe(1);
  });

  it('builds one sampler-free NodeMaterial and never exceeds the shaft draw budget', () => {
    const material = createVolumetricShaftMaterial();
    expect(material.isNodeMaterial).toBe(true);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.userData).toHaveProperty('sunPhase');

    const system = new VolumetricShaftSystem();
    expect(system.group.children.length).toBeLessThanOrEqual(NUKETOWN2_MAX_VOLUMETRIC_SHAFTS);
    system.dispose();
    material.dispose();
  });
});
