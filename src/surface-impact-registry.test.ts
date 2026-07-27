import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import { BALLISTIC_MATERIALS } from './ballistics';
import { ImpactPresentation, MAX_IMPACT_MARKS } from './impact-presentation';
import { buildArena } from './map';
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
    const arenas = [
      buildArena(new THREE.Scene()),
      buildRustworks1v1(new THREE.Scene()),
      buildGunRange(new THREE.Scene()),
      buildSkylineTerminal(new THREE.Scene()),
    ];
    for (const arena of arenas) {
      expect(arena.shotSurfaces.length, arena.id).toBeGreaterThan(0);
      for (const surface of arena.shotSurfaces) {
        expect(SURFACE_IMPACT_PROFILES[surface.material], `${arena.id}:${surface.id}`).toBeDefined();
      }
      for (const mesh of arena.raycastMeshes) {
        if (typeof mesh.userData.ballisticSurfaceId !== 'string') continue;
        expect(SURFACE_IMPACT_PROFILES[mesh.userData.ballisticMaterial as keyof typeof SURFACE_IMPACT_PROFILES], `${arena.id}:${mesh.name}`).toBeDefined();
      }
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

  it('routes authoritative material IDs into presentation and resets only at a round boundary', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(source.match(/spawnImpactFlash\(point, impact\.surface\.material/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain('spawnImpactFlash(point, result.impactMaterial ?? surface, normal);');
    expect(source).toContain('impactPresentation.resetForRound();');
  });
});
