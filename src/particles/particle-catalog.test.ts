/**
 * HF-371 — the catalog is a projection, not a second list.
 *
 * Two classes of defect are pinned here. The first is an arena shipping with no
 * air in it because someone added an id and nobody added a profile. The second
 * is impact dust drifting away from the impact sparks it hangs over, because
 * the two were authored in different files from different colour values.
 */
import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from '../arena-identity';
import { BALLISTIC_MATERIALS, type BallisticMaterialId } from '../ballistics';
import { SURFACE_IMPACT_PROFILES, surfaceImpactProfile } from '../surface-impact-registry';
import { PARTICLE_READABILITY } from './combat-readability';
import {
  ARENA_PARTICLE_PROFILES,
  FOOTFALL_KINDS,
  FOOTFALL_PUFFS,
  MUZZLE_SMOKE,
  PARTICLE_FAMILIES,
  PARTICLE_FAMILY_IDS,
  PARTICLE_INSTANCED_DRAWS,
  PARTICLE_QUALITY_TIERS,
  arenaParticleProfile,
  auditArenaParticleCoverage,
  auditImpactProjection,
  auditParticleOpacityCeilings,
  familyCapacityCeiling,
  resolveImpactMaterial,
  surfaceImpactGrit,
  surfaceImpactPuff,
  totalCapacity,
} from './particle-catalog';

describe('the family list is the draw-call count', () => {
  it('is closed at four, which is what the runtime submits', () => {
    expect(PARTICLE_FAMILY_IDS).toHaveLength(4);
    expect(PARTICLE_INSTANCED_DRAWS).toBe(4);
    expect(PARTICLE_INSTANCED_DRAWS).toBe(PARTICLE_FAMILY_IDS.length);
  });

  it('sizes every buffer at the ultra ceiling so quality can change live', () => {
    for (const id of PARTICLE_FAMILY_IDS) {
      const spec = PARTICLE_FAMILIES[id];
      expect(familyCapacityCeiling(id)).toBe(Math.max(...PARTICLE_QUALITY_TIERS.map((tier) => spec.capacity[tier])));
      expect(spec.capacity.low).toBeLessThanOrEqual(spec.capacity.high);
      expect(spec.capacity.high).toBeLessThanOrEqual(spec.capacity.ultra);
    }
  });

  it('keeps the whole system inside a stateable instance budget', () => {
    // If these numbers move, the cost claim in the module header moves with
    // them - which is the point of asserting them rather than describing them.
    expect(totalCapacity('low')).toBe(388);
    expect(totalCapacity('high')).toBe(900);
    expect(totalCapacity('ultra')).toBe(1536);
  });

  it('holds every authored opacity inside the readability contract', () => {
    const audit = auditParticleOpacityCeilings();
    expect(audit.offenders).toEqual([]);
    expect(audit.pass).toBe(true);
  });

  it('only lets the family big enough to hide a torso pay for sightline tests', () => {
    // `obscuring` is what buys a family the expensive guards. Flagging fine
    // dust would cost real work for no readability gain; flagging nothing
    // would remove the guard from the only family that needs it.
    const obscuring = PARTICLE_FAMILY_IDS.filter((id) => PARTICLE_FAMILIES[id].obscuring);
    expect(obscuring).toEqual(['puff']);
  });

  it('gives the alpha-tested family no per-instance opacity to leak through', () => {
    // `grit` cannot fade per instance (stock materials, no custom GLSL), so it
    // is guarded by scale. Its blending mode is therefore load-bearing.
    expect(PARTICLE_FAMILIES.grit.blending).toBe('alpha-test');
    expect(PARTICLE_FAMILY_IDS.filter((id) => PARTICLE_FAMILIES[id].blending === 'additive'))
      .toEqual(['motes', 'drift', 'puff']);
  });
});

describe('every arena has air', () => {
  it('covers every canonical arena id', () => {
    const coverage = auditArenaParticleCoverage();
    expect(coverage.missing).toEqual([]);
    expect(coverage.extra).toEqual([]);
    expect(coverage.invalid).toEqual([]);
    expect(coverage.pass).toBe(true);
  });

  it('fails loudly when an arena is added without a profile', () => {
    // The regression this catches is a new map shipping airless while every
    // other test stays green.
    const coverage = auditArenaParticleCoverage([...ARENA_IDS, 'new-arena']);
    expect(coverage.pass).toBe(false);
    expect(coverage.missing).toEqual(['new-arena']);
  });

  it('fails when a profile is authored above its family ceiling', () => {
    const tampered = {
      ...ARENA_PARTICLE_PROFILES,
      'gun-range': {
        ...ARENA_PARTICLE_PROFILES['gun-range'],
        motes: { ...ARENA_PARTICLE_PROFILES['gun-range'].motes, opacity: 0.9 },
      },
    };
    const coverage = auditArenaParticleCoverage(ARENA_IDS, tampered);
    expect(coverage.pass).toBe(false);
    expect(coverage.invalid).toEqual(['gun-range']);
  });

  it('authors each arena as the air it actually has', () => {
    // Not a taste assertion - these are the four the owner named, and each one
    // is only right if the profile says something specific about that map.
    expect(arenaParticleProfile('farcrysis').drift.kind).toBe('leaf');
    expect(arenaParticleProfile('high-seas').drift.kind).toBe('foam');
    expect(arenaParticleProfile('gun-range').drift.kind).toBe('lint');
    // Interior: the most motes and the least wind coupling in the game.
    const range = arenaParticleProfile('gun-range');
    const ocean = arenaParticleProfile('high-seas');
    expect(range.motes.density).toBeGreaterThan(ocean.motes.density);
    expect(range.motes.windPull).toBeLessThan(ocean.motes.windPull);
    // Foam rises off a crest; leaves fall.
    expect(ocean.drift.fallMps).toBeLessThan(0);
    expect(arenaParticleProfile('farcrysis').drift.fallMps).toBeGreaterThan(0);
    // The two arenas with authored shafts respond most to them.
    expect(arenaParticleProfile('farcrysis').shaftResponse).toBeGreaterThan(0.5);
    expect(range.shaftResponse).toBeGreaterThan(0.5);
  });
});

describe('impact dust is projected from the canonical surface registry', () => {
  it('produces a usable cloud for every ballistic material', () => {
    const audit = auditImpactProjection();
    expect(audit.offenders).toEqual([]);
    expect(audit.pass).toBe(true);
    // ...and the projection covers the registry exactly, not a subset of it.
    expect(Object.keys(SURFACE_IMPACT_PROFILES).sort())
      .toEqual(Object.keys(BALLISTIC_MATERIALS).sort());
  });

  it('takes its colours from the registry rather than authoring its own', () => {
    // This is the assertion that stops the dust and the sparks drifting apart:
    // there is no dust colour in the catalog for any material, so a retune of
    // the registry moves both.
    for (const id of Object.keys(SURFACE_IMPACT_PROFILES) as BallisticMaterialId[]) {
      const [warm, cool] = surfaceImpactProfile(id).particleColors;
      expect(surfaceImpactPuff(id).colorWarm, `${id}:dust-warm`).toBe(warm);
      expect(surfaceImpactPuff(id).colorCool, `${id}:dust-cool`).toBe(cool);
      expect(surfaceImpactGrit(id).colorWarm, `${id}:grit-warm`).toBe(warm);
      expect(surfaceImpactGrit(id).colorCool, `${id}:grit-cool`).toBe(cool);
    }
  });

  it('scales dust by what the surface is, not by a per-material list', () => {
    // Earth throws dust and few sparks; glass throws shards and almost no dust.
    // Both counts derive from the registry's own count times its surface kind.
    expect(surfaceImpactPuff('earth').count).toBeGreaterThan(surfaceImpactPuff('glass').count);
    expect(surfaceImpactGrit('glass').count).toBeGreaterThanOrEqual(surfaceImpactPuff('glass').count);
    expect(surfaceImpactPuff('concrete').count).toBeGreaterThan(surfaceImpactPuff('thin-metal').count);
  });

  it('never authors a cloud above the obscuring ceiling', () => {
    for (const id of Object.keys(SURFACE_IMPACT_PROFILES) as BallisticMaterialId[]) {
      expect(surfaceImpactPuff(id).opacity).toBeLessThanOrEqual(PARTICLE_READABILITY.obscuringMaxOpacity);
    }
  });

  it('resolves the coarse ImpactSurface spellings to a material of that kind', () => {
    // The alias table mirrors a private resolver in impact-presentation.ts.
    // Rather than restate it in prose, check the property that matters: the
    // material an alias resolves to must itself be tagged with that surface.
    for (const surface of ['metal', 'concrete', 'wood', 'soil', 'glass'] as const) {
      const material = resolveImpactMaterial(surface);
      expect(surfaceImpactProfile(material).impactSurface, `${surface}:alias`).toBe(surface);
    }
  });

  it('passes canonical material ids straight through', () => {
    expect(resolveImpactMaterial('structural-metal')).toBe('structural-metal');
    expect(resolveImpactMaterial('interior-wall')).toBe('interior-wall');
  });
});

describe('event recipes', () => {
  it('emits nothing on a walked step, which is what stops a self-made smokescreen', () => {
    // Dust on every footfall at walking pace follows the player around as a
    // permanent screen. `step` is for a hard direction change, and it is the
    // quietest of the three by construction.
    expect(FOOTFALL_PUFFS.step.count).toBeLessThan(FOOTFALL_PUFFS.land.count);
    expect(FOOTFALL_PUFFS.step.opacity).toBeLessThan(FOOTFALL_PUFFS.land.opacity);
    expect(FOOTFALL_PUFFS.sprint.opacity).toBeLessThan(FOOTFALL_PUFFS.land.opacity);
    for (const kind of FOOTFALL_KINDS) {
      expect(FOOTFALL_PUFFS[kind].opacity, `${kind}:ceiling`)
        .toBeLessThanOrEqual(PARTICLE_READABILITY.obscuringMaxOpacity);
      expect(FOOTFALL_PUFFS[kind].radiusEndM).toBeGreaterThan(FOOTFALL_PUFFS[kind].radiusStartM);
    }
  });

  it('makes muzzle smoke linger and stay faint, which is the trade it exists for', () => {
    expect(MUZZLE_SMOKE.lifeSeconds).toBeGreaterThan(FOOTFALL_PUFFS.land.lifeSeconds);
    expect(MUZZLE_SMOKE.opacity).toBeLessThan(FOOTFALL_PUFFS.land.opacity);
    // A strong rise is what carries it out of the sight line.
    expect(MUZZLE_SMOKE.riseMps2).toBeGreaterThan(FOOTFALL_PUFFS.land.riseMps2);
  });
});
