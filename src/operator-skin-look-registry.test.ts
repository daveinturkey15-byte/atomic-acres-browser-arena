import { describe, expect, it } from 'vitest';

import {
  OPERATOR_LOOKS_PER_TEAM_MIN,
  OPERATOR_LOOK_REGISTRY,
  OPERATOR_LOOK_SOURCES,
  OPERATOR_LOOK_TEAM_SEPARATION_MIN,
  OPERATOR_LOOK_WITHIN_TEAM_MIN,
  allResolvableOperatorLookIds,
  createOperatorLookRegistry,
  getOperatorLook,
  lookSignatureColour,
  operatorLooksForTeam,
  perceptualColourDistance,
  resolveOperatorLook,
  unpackHex,
  type OperatorLookDefinition,
} from './operator-skin-look-registry';

const BASE: OperatorLookDefinition = OPERATOR_LOOK_SOURCES[0]!;

function withOverrides(overrides: Partial<OperatorLookDefinition>): OperatorLookDefinition {
  return { ...BASE, ...overrides } as OperatorLookDefinition;
}

describe('perceptualColourDistance', () => {
  it('is zero for a colour against itself and symmetric', () => {
    expect(perceptualColourDistance(0x3f6f63, 0x3f6f63)).toBe(0);
    expect(perceptualColourDistance(0x112233, 0xaabbcc)).toBeCloseTo(
      perceptualColourDistance(0xaabbcc, 0x112233),
      10,
    );
  });

  it('separates dark colours that plain RGB Euclid would call close', () => {
    // The exact failure mode the shipped flat wash has: two near-black garment
    // colours. Redmean must still report them as meaningfully different.
    const naive = Math.sqrt(3 * 18 * 18);
    expect(perceptualColourDistance(0x101010, 0x221022)).toBeGreaterThan(naive);
  });

  it('unpacks channels exactly', () => {
    expect(unpackHex(0x123456)).toEqual({ r: 0x12, g: 0x34, b: 0x56 });
  });
});

describe('OPERATOR_LOOK_REGISTRY', () => {
  it('carries at least two looks per team', () => {
    expect(operatorLooksForTeam(0).length).toBeGreaterThanOrEqual(OPERATOR_LOOKS_PER_TEAM_MIN);
    expect(operatorLooksForTeam(1).length).toBeGreaterThanOrEqual(OPERATOR_LOOKS_PER_TEAM_MIN);
  });

  it('keeps every cross-team pair separable at range', () => {
    for (const a of operatorLooksForTeam(0)) {
      for (const b of operatorLooksForTeam(1)) {
        const distance = perceptualColourDistance(lookSignatureColour(a), lookSignatureColour(b));
        expect(distance, `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(OPERATOR_LOOK_TEAM_SEPARATION_MIN);
      }
    }
  });

  it('keeps same-team looks distinct from each other', () => {
    for (const team of [0, 1] as const) {
      const looks = operatorLooksForTeam(team);
      for (let i = 0; i < looks.length; i += 1) {
        for (let j = i + 1; j < looks.length; j += 1) {
          const distance = perceptualColourDistance(lookSignatureColour(looks[i]!), lookSignatureColour(looks[j]!));
          expect(distance, `${looks[i]!.id} vs ${looks[j]!.id}`).toBeGreaterThanOrEqual(OPERATOR_LOOK_WITHIN_TEAM_MIN);
        }
      }
    }
  });

  it('is deeply frozen so no runtime path can repaint a look', () => {
    const look = OPERATOR_LOOK_REGISTRY.looks[0]!;
    expect(Object.isFrozen(OPERATOR_LOOK_REGISTRY.looks)).toBe(true);
    expect(Object.isFrozen(look)).toBe(true);
    expect(Object.isFrozen(look.palette)).toBe(true);
    expect(Object.isFrozen(look.camo)).toBe(true);
    expect(Object.isFrozen(look.cloth)).toBe(true);
    expect(Object.isFrozen(look.wear)).toBe(true);
  });

  it('every look carries a finer secondary camo scale than its primary', () => {
    for (const look of OPERATOR_LOOK_REGISTRY.looks) {
      expect(look.camo.secondaryScaleM, look.id).toBeLessThan(look.camo.primaryScaleM);
    }
  });

  it('resolves every look id it exposes', () => {
    for (const look of OPERATOR_LOOK_REGISTRY.looks) {
      expect(getOperatorLook(look.id)).toBe(look);
    }
    expect(getOperatorLook('not-a-look')).toBeUndefined();
  });
});

describe('createOperatorLookRegistry validation', () => {
  it('rejects an empty list', () => {
    expect(() => createOperatorLookRegistry([])).toThrow(/non-empty/);
  });

  it('rejects duplicate ids', () => {
    expect(() => createOperatorLookRegistry([...OPERATOR_LOOK_SOURCES, BASE])).toThrow(/unique/);
  });

  it('rejects a team with fewer than two looks', () => {
    const oneEach = [OPERATOR_LOOK_SOURCES[0]!, OPERATOR_LOOK_SOURCES[2]!];
    expect(() => createOperatorLookRegistry(oneEach)).toThrow(/at least 2 looks/);
  });

  it('rejects a second same-team look that is only a hue nudge away', () => {
    const nearClone = withOverrides({ id: 'vanguard-clone', displayName: 'Clone' });
    const looks = [OPERATOR_LOOK_SOURCES[0]!, nearClone, OPERATOR_LOOK_SOURCES[2]!, OPERATOR_LOOK_SOURCES[3]!];
    expect(() => createOperatorLookRegistry(looks)).toThrow(/not distinct enough/);
  });

  it('rejects an opposing-team look that reads like a teammate', () => {
    const impostor = withOverrides({ id: 'marauder-impostor', displayName: 'Impostor', team: 1 });
    const looks = [OPERATOR_LOOK_SOURCES[0]!, OPERATOR_LOOK_SOURCES[1]!, impostor, OPERATOR_LOOK_SOURCES[3]!];
    expect(() => createOperatorLookRegistry(looks)).toThrow(/read alike/);
  });

  it('rejects an out-of-range camo scale', () => {
    const bad = withOverrides({
      id: 'vanguard-bad-scale',
      camo: { ...BASE.camo, primaryScaleM: 9 },
    });
    expect(() => createOperatorLookRegistry([bad, ...OPERATOR_LOOK_SOURCES.slice(1)])).toThrow(/primaryScaleM/);
  });

  it('rejects a coarser secondary camo scale than the primary', () => {
    const bad = withOverrides({
      id: 'vanguard-bad-order',
      camo: { ...BASE.camo, secondaryScaleM: BASE.camo.primaryScaleM },
    });
    expect(() => createOperatorLookRegistry([bad, ...OPERATOR_LOOK_SOURCES.slice(1)])).toThrow(/finer than the primary/);
  });

  it('rejects a palette missing a role', () => {
    const { trim: _trim, ...partial } = BASE.palette;
    const bad = withOverrides({ id: 'vanguard-bad-palette', palette: partial as never });
    expect(() => createOperatorLookRegistry([bad, ...OPERATOR_LOOK_SOURCES.slice(1)])).toThrow(/palette keys invalid/);
  });

  it('rejects a non-hex colour', () => {
    const bad = withOverrides({
      id: 'vanguard-bad-colour',
      palette: { ...BASE.palette, trim: 0x1000000 },
    });
    expect(() => createOperatorLookRegistry([bad, ...OPERATOR_LOOK_SOURCES.slice(1)])).toThrow(/hex colour/);
  });

  it('rejects an invalid id', () => {
    const bad = withOverrides({ id: 'Vanguard Woodland' });
    expect(() => createOperatorLookRegistry([bad, ...OPERATOR_LOOK_SOURCES.slice(1)])).toThrow(/invalid id/);
  });
});

describe('resolveOperatorLook', () => {
  it('is total over the shipped skin ids and always returns the asked-for team', () => {
    for (const skinId of ['default', 'explorer', 'symbiote', 'navalops']) {
      for (const team of [0, 1] as const) {
        const look = resolveOperatorLook(skinId, team);
        expect(look.team, `${skinId}/${team}`).toBe(team);
      }
    }
  });

  it('is deterministic', () => {
    expect(resolveOperatorLook('explorer', 1)).toBe(resolveOperatorLook('explorer', 1));
  });

  it('paints an unknown skin rather than throwing', () => {
    const look = resolveOperatorLook('a-skin-that-does-not-exist', 1);
    expect(look.team).toBe(1);
  });

  it('uses more than one look per team across the shipped skins', () => {
    const skins = ['default', 'explorer', 'symbiote', 'navalops'];
    const team0 = new Set(skins.map((s) => resolveOperatorLook(s, 0).id));
    const team1 = new Set(skins.map((s) => resolveOperatorLook(s, 1).id));
    expect(team0.size).toBeGreaterThanOrEqual(OPERATOR_LOOKS_PER_TEAM_MIN);
    expect(team1.size).toBeGreaterThanOrEqual(OPERATOR_LOOKS_PER_TEAM_MIN);
  });

  it('enumerates exactly the looks the runtime can reach', () => {
    const ids = allResolvableOperatorLookIds(['default', 'explorer', 'symbiote', 'navalops']);
    expect([...ids]).toEqual(OPERATOR_LOOK_REGISTRY.looks.map((look) => look.id).sort());
  });
});
