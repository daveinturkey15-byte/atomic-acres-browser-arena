import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import { buildFarcrysis } from './farcrysis';
import { buildHighSeas } from './high-seas';
import { BALLISTIC_MATERIALS } from './ballistics';
import { ImpactPresentation, MAX_IMPACT_MARKS } from './impact-presentation';
import { buildArena } from './map';
import { WEAPON_IDS } from './protocol';
import { SURFACE_IMPACT_PROFILES, auditSurfaceImpactCoverage } from './surface-impact-registry';

describe('Pass 65 collision-material decal governance', () => {
  it('keeps exact set equality with the canonical ballistic material catalog', () => {
    const audit = auditSurfaceImpactCoverage();
    expect(audit).toEqual({ missing: [], extra: [], invalid: [], pass: true });
    expect(Object.keys(SURFACE_IMPACT_PROFILES).sort()).toEqual(Object.keys(BALLISTIC_MATERIALS).sort());
    expect(Object.values(SURFACE_IMPACT_PROFILES).every((entry) => (
      entry.decalPolicy.kind === 'round-persistent' && entry.decalPolicy.reason.length > 0
    ))).toBe(true);
  });

  it('fails a synthetic future material closed until a profile is authored', () => {
    const audit = auditSurfaceImpactCoverage([
      ...Object.keys(BALLISTIC_MATERIALS),
      'future-ceramic',
    ]);
    expect(audit.pass).toBe(false);
    expect(audit.missing).toEqual(['future-ceramic']);
  });

  it('maps every shot-authority surface and raycast mesh on every arena', () => {
    // HF-390: all SIX arenas — the previous four-arena loop never audited
    // farcrysis (227 surfaces) or high-seas (199 surfaces) against the
    // decal/impact registry.
    const arenas = [
      buildArena(new THREE.Scene()),
      buildRustworks1v1(new THREE.Scene()),
      buildGunRange(new THREE.Scene()),
      buildSkylineTerminal(new THREE.Scene()),
      buildFarcrysis(new THREE.Scene()),
      buildHighSeas(new THREE.Scene()),
    ];
    for (const arena of arenas) {
      expect(arena.shotSurfaces.length, arena.id).toBeGreaterThan(0);
      // Runtime-shaped harvest routed through the coverage auditor: authored
      // shot surfaces plus EVERY mesh tagged with a ballistic material id,
      // exactly the string ids the impact presentation resolves at hit time.
      const harvested = [
        ...arena.shotSurfaces.map((surface) => surface.material as string),
        ...arena.raycastMeshes
          .map((mesh) => mesh.userData.ballisticMaterial)
          .filter((material): material is string => typeof material === 'string'),
      ];
      const audit = auditSurfaceImpactCoverage([...Object.keys(BALLISTIC_MATERIALS), ...harvested]);
      const unauthored = new Set(audit.missing);
      expect(
        [
          ...arena.shotSurfaces
            .filter((surface) => unauthored.has(surface.material as string))
            .map((surface) => `${arena.id}:${surface.id}`),
          ...arena.raycastMeshes
            .filter((mesh) => typeof mesh.userData.ballisticMaterial === 'string'
              && unauthored.has(mesh.userData.ballisticMaterial as string))
            .map((mesh) => `${arena.id}:${mesh.name}`),
        ],
        `${arena.id}: materials without an authored impact profile: ${[...unauthored].join(', ')}`,
      ).toEqual([]);
      expect(audit.pass, `${arena.id}: impact-profile coverage audit failed`).toBe(true);
    }
  });

  it('renders every catalog material through one bounded round-persistent pool', () => {
    const presentation = new ImpactPresentation(new THREE.Scene());
    Object.keys(BALLISTIC_MATERIALS).forEach((material, index) => {
      presentation.impact(
        new THREE.Vector3(index * 0.2, 1, 0),
        new THREE.Vector3(0, 0, 1),
        material as keyof typeof BALLISTIC_MATERIALS,
      );
    });
    expect(presentation.activeMarks()).toBe(Object.keys(BALLISTIC_MATERIALS).length);
    presentation.update(300);
    expect(presentation.activeMarks()).toBe(Object.keys(BALLISTIC_MATERIALS).length);
    for (let index = 0; index < MAX_IMPACT_MARKS * 3; index += 1) {
      presentation.impact(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 'container');
    }
    expect(presentation.activeMarks()).toBeLessThanOrEqual(MAX_IMPACT_MARKS);
    presentation.resetForRound();
    expect(presentation.activeMarks()).toBe(0);
  });

  it('admits one visible persistent mark for every canonical weapon in every presentation profile', () => {
    for (const reducedDetail of [false, true]) {
      const presentation = new ImpactPresentation(new THREE.Scene(), reducedDetail);
      presentation.setBudget(0.35, 0.35);
      WEAPON_IDS.forEach((weapon, index) => {
        const material = Object.keys(BALLISTIC_MATERIALS)[index % Object.keys(BALLISTIC_MATERIALS).length]!;
        presentation.impact(
          new THREE.Vector3(index * 0.02, 1, 0),
          new THREE.Vector3(0, 0, 1),
          material as keyof typeof BALLISTIC_MATERIALS,
        );
        expect(presentation.activeMarks(), `${weapon}:${reducedDetail ? 'reduced' : 'full'}`)
          .toBeGreaterThan(0);
      });
      expect((presentation.marks.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('routes authoritative material IDs into presentation and resets only at a round boundary', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(source.match(/spawnImpactFlash\(point, impact\.surface\.material/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain('spawnImpactFlash(point, result.impactMaterial ?? surface, normal);');
    expect(source).toContain('impactPresentation.resetForRound();');
  });
});
