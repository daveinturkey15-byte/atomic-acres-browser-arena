import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  WEAPON_FAMILIES,
  WeaponSchemaValidationError,
  parseWeaponDefinition,
  parseWeaponDefinitions,
  validateWeaponDefinition,
  validateWeaponDefinitions,
  type WeaponSchemaIssueCode,
} from './weapon-schema';

function validWeapon(): any {
  return {
    id: 'test-rifle',
    displayName: 'Test Rifle',
    slot: 'primary',
    family: 'assault-rifle',
    fireKind: 'hitscan',
    fireMode: 'automatic',
    rpm: 650,
    pellets: 1,
    spinUpMs: 0,
    movementMultiplier: 1,
    damage: {
      policy: 'standard',
      base: 31,
      minimum: 20,
      falloffStartM: 24,
      falloffEndM: 72,
      headMultiplier: 1.5,
      limbMultiplier: 0.82,
    },
    spread: {
      hipRadians: 0.012,
      adsMultiplier: 0.28,
      movementMultiplier: 1.65,
      standMultiplier: 1,
      crouchMultiplier: 0.78,
      proneMultiplier: 0.65,
      sustainedPerShot: 0.0016,
      maximumRadians: 0.045,
    },
    recoil: {
      pitchRadians: 0.016,
      yawRadians: 0.006,
      recoveryPerSecond: 12,
      adsMultiplier: 0.72,
      standMultiplier: 1,
      crouchMultiplier: 0.84,
      proneMultiplier: 0.65,
      deterministicPatternId: 'test-rifle-pattern-v1',
    },
    ammo: {
      magazine: 30,
      reserve: 120,
      reloadSeconds: 1.8,
      emptyReloadSeconds: 2.05,
      switchSeconds: 0.48,
    },
    penetration: {
      calibreLabel: '5.56 mm',
      power: 5.8,
      fmjMultiplier: 1.12,
      materialPolicyId: 'pass64-ballistic-materials-v1',
      energyFalloffStartM: 20,
      energyFalloffEndM: 76,
      minimumEnergyRetention: 0.48,
      minimumWallDamageMultiplier: 0.34,
      maximumSurfaces: 2,
    },
    effects: { tracerColorHex: 0xffd166 },
    optic: null,
    projectileId: null,
    policies: {
      loadout: 'eligible',
      bot: 'eligible',
      drop: 'droppable',
      range: { kind: 'station', stationId: 'range-test-rifle' },
      replay: 'serialized',
      telemetry: 'standard',
      stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' },
      authority: 'host-shot-v1',
    },
    modelSetId: 'test-rifle-model-set-v1',
    presentationId: 'test-rifle-view-v1',
    audioId: 'test-rifle-audio-v1',
    provenanceId: 'test-rifle-provenance-v1',
    evidenceIds: ['r232-test-rifle'],
  };
}

function issueAt(value: unknown, path: string, code?: WeaponSchemaIssueCode): void {
  const issues = validateWeaponDefinition(value);
  expect(issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ path, ...(code ? { code } : {}) }),
  ]));
}

function secondWeapon(): any {
  const weapon = validWeapon();
  weapon.id = 'test-rifle-two';
  weapon.displayName = 'Test Rifle Two';
  weapon.recoil.deterministicPatternId = 'test-rifle-two-pattern-v1';
  weapon.modelSetId = 'test-rifle-two-model-set-v1';
  weapon.presentationId = 'test-rifle-two-view-v1';
  weapon.audioId = 'test-rifle-two-audio-v1';
  weapon.provenanceId = 'test-rifle-two-provenance-v1';
  weapon.evidenceIds = ['r232-test-rifle-two'];
  weapon.policies.range.stationId = 'range-test-rifle-two';
  return weapon;
}

describe('weapon schema valid definitions', () => {
  it('accepts every definition in the independent B1 compatibility fixture', () => {
    const fixturePath = fileURLToPath(new URL(
      '../../.agents/skills/atomic-acres-combat-registry/scripts/fixtures/known-good.json',
      import.meta.url,
    ));
    const manifest = JSON.parse(readFileSync(fixturePath, 'utf8')) as { weapons: unknown };
    const parsed = parseWeaponDefinitions(manifest.weapons);

    expect(parsed.map((weapon) => weapon.id)).toEqual([
      'carbine',
      'smg',
      'lmg',
      'scattergun',
      'sniper',
      'pistol',
      'machine-pistol',
      'magnum',
      'railgun',
    ]);
  });

  it('parses a complete definition into an independent deeply frozen value', () => {
    const source = validWeapon();
    const parsed = parseWeaponDefinition(source);

    source.displayName = 'Changed after parse';
    source.damage.base = 999;
    source.evidenceIds.push('late-mutation');

    expect(parsed.displayName).toBe('Test Rifle');
    expect(parsed.damage.base).toBe(31);
    expect(parsed.evidenceIds).toEqual(['r232-test-rifle']);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.damage)).toBe(true);
    expect(Object.isFrozen(parsed.policies.range)).toBe(true);
    expect(Object.isFrozen(parsed.evidenceIds)).toBe(true);
  });

  it.each(WEAPON_FAMILIES)('accepts the %s family', (family) => {
    const weapon = validWeapon();
    weapon.family = family;
    expect(validateWeaponDefinition(weapon)).toEqual([]);
  });

  it.each([
    ['hitscan', 1, null, 'host-shot-v1'],
    ['pellet', 9, null, 'host-shot-v1'],
    ['slug', 1, null, 'host-shot-v1'],
    ['projectile', 1, 'bolt-v1', 'host-projectile-v1'],
  ] as const)('accepts the %s fire contract', (fireKind, pellets, projectileId, authority) => {
    const weapon = validWeapon();
    weapon.fireKind = fireKind;
    weapon.pellets = pellets;
    weapon.projectileId = projectileId;
    weapon.policies.authority = authority;
    expect(validateWeaponDefinition(weapon)).toEqual([]);
  });

  it('accepts null, standard, reviewed thermal, and pinned special-authority optics', () => {
    const noOptic = validWeapon();
    expect(validateWeaponDefinition(noOptic)).toEqual([]);

    const standard = validWeapon();
    standard.optic = { kind: 'standard', magnification: 1.25, solidOcclusion: 'required' };
    expect(validateWeaponDefinition(standard)).toEqual([]);

    const thermal = validWeapon();
    thermal.family = 'marksman';
    thermal.fireMode = 'semi';
    thermal.optic = {
      kind: 'thermal-smoke-only',
      magnification: 2.5,
      solidOcclusion: 'required',
      targetPolicy: 'living-targets-through-smoke',
      authority: 'presentation-only',
    };
    expect(validateWeaponDefinition(thermal)).toEqual([]);

    const special = validWeapon();
    special.optic = {
      kind: 'special-authority',
      magnification: 2.5,
      solidOcclusion: 'required',
      authorityPolicyId: 'host-railgun-v1',
    };
    special.policies.authority = 'host-railgun-v1';
    expect(validateWeaponDefinition(special)).toEqual([]);
  });

  it.each([
    ['eligible', 'standard'],
    ['curated-only', 'not-applicable'],
    ['pickup-only', 'standard'],
    ['never', 'not-applicable'],
  ] as const)('accepts explicit loadout %s and telemetry %s policies', (loadout, telemetry) => {
    const weapon = validWeapon();
    weapon.policies.loadout = loadout;
    weapon.policies.telemetry = telemetry;
    expect(validateWeaponDefinition(weapon)).toEqual([]);
  });

  it('accepts every closed Gun Range policy shape', () => {
    const station = validWeapon();
    expect(validateWeaponDefinition(station)).toEqual([]);

    const companion = validWeapon();
    companion.slot = 'secondary';
    companion.policies.range = { kind: 'companion-sidearm', primaryIds: ['carbine', 'smg'] };
    expect(validateWeaponDefinition(companion)).toEqual([]);

    const entitlement = validWeapon();
    entitlement.slot = 'secondary';
    entitlement.policies.range = { kind: 'entitlement-only', entitlementPolicyId: 'dhv-x-sidearm-v1' };
    expect(validateWeaponDefinition(entitlement)).toEqual([]);

    const unavailable = validWeapon();
    unavailable.slot = 'special';
    unavailable.policies.range = { kind: 'never' };
    expect(validateWeaponDefinition(unavailable)).toEqual([]);
  });

  it('accepts the head-only damage discriminant only with its binary hit-zone contract', () => {
    const weapon = validWeapon();
    weapon.damage.policy = 'head-only';
    weapon.damage.headMultiplier = 1;
    weapon.damage.limbMultiplier = 0;
    expect(validateWeaponDefinition(weapon)).toEqual([]);
  });
});

describe('weapon schema strict object parsing', () => {
  it.each([
    ['$', (weapon: any) => { weapon.unexpected = true; }],
    ['$.damage.legacy', (weapon: any) => { weapon.damage.legacy = 1; }],
    ['$.spread.degrees', (weapon: any) => { weapon.spread.degrees = 1; }],
    ['$.recoil.recoveryMs', (weapon: any) => { weapon.recoil.recoveryMs = 1; }],
    ['$.ammo.reloadMs', (weapon: any) => { weapon.ammo.reloadMs = 1; }],
    ['$.penetration.retentionPerSurface', (weapon: any) => { weapon.penetration.retentionPerSurface = 1; }],
    ['$.effects.threeColor', (weapon: any) => { weapon.effects.threeColor = 'red'; }],
    ['$.policies.candidate', (weapon: any) => { weapon.policies.candidate = 'eligible'; }],
    ['$.policies.range.candidate', (weapon: any) => { weapon.policies.range.candidate = true; }],
    ['$.policies.stance.candidate', (weapon: any) => { weapon.policies.stance.candidate = 'allowed'; }],
  ])('rejects unknown key at %s', (path, mutate) => {
    const weapon = validWeapon();
    mutate(weapon);
    const issuePath = path === '$' ? '$.unexpected' : path;
    issueAt(weapon, issuePath, 'unknown-key');
  });

  it.each([
    ['$.displayName', (weapon: any) => { delete weapon.displayName; }],
    ['$.damage.base', (weapon: any) => { delete weapon.damage.base; }],
    ['$.spread.standMultiplier', (weapon: any) => { delete weapon.spread.standMultiplier; }],
    ['$.recoil.deterministicPatternId', (weapon: any) => { delete weapon.recoil.deterministicPatternId; }],
    ['$.ammo.emptyReloadSeconds', (weapon: any) => { delete weapon.ammo.emptyReloadSeconds; }],
    ['$.penetration.materialPolicyId', (weapon: any) => { delete weapon.penetration.materialPolicyId; }],
    ['$.effects.tracerColorHex', (weapon: any) => { delete weapon.effects.tracerColorHex; }],
    ['$.policies.range', (weapon: any) => { delete weapon.policies.range; }],
    ['$.policies.stance.prone', (weapon: any) => { delete weapon.policies.stance.prone; }],
    ['$.evidenceIds', (weapon: any) => { delete weapon.evidenceIds; }],
  ])('rejects missing key at %s', (path, mutate) => {
    const weapon = validWeapon();
    mutate(weapon);
    issueAt(weapon, path, 'missing-key');
  });

  it('rejects unknown discriminants instead of selecting a fallback', () => {
    const weapon = validWeapon();
    weapon.fireKind = 'laser';
    weapon.damage.policy = 'body-first';
    weapon.optic = { kind: 'xray' };
    weapon.policies.loadout = 'default';
    weapon.policies.range = { kind: 'fallback' };
    weapon.policies.telemetry = 'bounded';

    const issues = validateWeaponDefinition(weapon);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.fireKind', code: 'unsupported-value' }),
      expect.objectContaining({ path: '$.damage.policy', code: 'unsupported-value' }),
      expect.objectContaining({ path: '$.optic.kind', code: 'unsupported-value' }),
      expect.objectContaining({ path: '$.policies.loadout', code: 'unsupported-value' }),
      expect.objectContaining({ path: '$.policies.range.kind', code: 'unsupported-value' }),
      expect.objectContaining({ path: '$.policies.telemetry', code: 'unsupported-value' }),
    ]));
  });

  it('throws a typed error containing stable issues', () => {
    const weapon = validWeapon();
    weapon.rpm = Number.NaN;
    expect(() => parseWeaponDefinition(weapon)).toThrow(WeaponSchemaValidationError);
    try {
      parseWeaponDefinition(weapon);
    } catch (error) {
      expect(error).toBeInstanceOf(WeaponSchemaValidationError);
      expect((error as WeaponSchemaValidationError).issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: '$.rpm', code: 'type' }),
      ]));
      expect(Object.isFrozen((error as WeaponSchemaValidationError).issues)).toBe(true);
    }
  });
});

describe('weapon schema bounds and cross-field rules', () => {
  it.each([
    ['$.rpm', (weapon: any) => { weapon.rpm = 0; }],
    ['$.pellets', (weapon: any) => { weapon.pellets = 13; }],
    ['$.spinUpMs', (weapon: any) => { weapon.spinUpMs = 10_001; }],
    ['$.movementMultiplier', (weapon: any) => { weapon.movementMultiplier = 0; }],
    ['$.damage.base', (weapon: any) => { weapon.damage.base = Number.POSITIVE_INFINITY; }],
    ['$.spread.hipRadians', (weapon: any) => { weapon.spread.hipRadians = Math.PI; }],
    ['$.recoil.recoveryPerSecond', (weapon: any) => { weapon.recoil.recoveryPerSecond = 0; }],
    ['$.ammo.magazine', (weapon: any) => { weapon.ammo.magazine = 2_001; }],
    ['$.penetration.power', (weapon: any) => { weapon.penetration.power = 100_001; }],
    ['$.penetration.maximumSurfaces', (weapon: any) => { weapon.penetration.maximumSurfaces = 65; }],
    ['$.effects.tracerColorHex', (weapon: any) => { weapon.effects.tracerColorHex = 0x1000000; }],
  ])('rejects the bounded field %s outside its contract', (path, mutate) => {
    const weapon = validWeapon();
    mutate(weapon);
    issueAt(weapon, path);
  });

  it.each([
    ['pellet count', '$.pellets', (weapon: any) => { weapon.fireKind = 'pellet'; weapon.pellets = 1; }],
    ['single-ray count', '$.pellets', (weapon: any) => { weapon.pellets = 2; }],
    ['projectile ID', '$.projectileId', (weapon: any) => { weapon.fireKind = 'projectile'; weapon.projectileId = null; weapon.policies.authority = 'host-projectile-v1'; }],
    ['projectile authority', '$.policies.authority', (weapon: any) => { weapon.fireKind = 'projectile'; weapon.projectileId = 'bolt-v1'; }],
    ['non-projectile ID', '$.projectileId', (weapon: any) => { weapon.projectileId = 'bolt-v1'; }],
    ['empty reload order', '$.ammo.emptyReloadSeconds', (weapon: any) => { weapon.ammo.emptyReloadSeconds = 1; }],
    ['damage falloff order', '$.damage.falloffEndM', (weapon: any) => { weapon.damage.falloffEndM = 20; }],
    ['penetration falloff order', '$.penetration.energyFalloffEndM', (weapon: any) => { weapon.penetration.energyFalloffEndM = 20; }],
    ['maximum spread', '$.spread.maximumRadians', (weapon: any) => { weapon.spread.maximumRadians = 0.01; }],
    ['sustained spread', '$.spread.sustainedPerShot', (weapon: any) => { weapon.spread.sustainedPerShot = 0.05; }],
    ['head-only policy', '$.damage', (weapon: any) => { weapon.damage.policy = 'head-only'; }],
    ['thermal role', '$.optic', (weapon: any) => { weapon.optic = { kind: 'thermal-smoke-only', magnification: 2.5, solidOcclusion: 'required', targetPolicy: 'living-targets-through-smoke', authority: 'presentation-only' }; }],
    ['thermal authority', '$.policies.authority', (weapon: any) => { weapon.family = 'marksman'; weapon.fireMode = 'semi'; weapon.optic = { kind: 'thermal-smoke-only', magnification: 2.5, solidOcclusion: 'required', targetPolicy: 'living-targets-through-smoke', authority: 'presentation-only' }; weapon.policies.authority = 'host-railgun-v1'; }],
    ['special optic authority', '$.optic.authorityPolicyId', (weapon: any) => { weapon.optic = { kind: 'special-authority', magnification: 2.5, solidOcclusion: 'required', authorityPolicyId: 'host-railgun-v1' }; }],
    ['station slot', '$.policies.range', (weapon: any) => { weapon.slot = 'secondary'; }],
    ['companion slot', '$.policies.range', (weapon: any) => { weapon.policies.range = { kind: 'companion-sidearm', primaryIds: ['carbine'] }; }],
  ])('rejects contradictory %s fields', (_name, path, mutate) => {
    const weapon = validWeapon();
    mutate(weapon);
    issueAt(weapon, path, 'cross-field');
  });

  it('rejects duplicate IDs inside bounded arrays', () => {
    const evidence = validWeapon();
    evidence.evidenceIds = ['r232-test', 'r232-test'];
    issueAt(evidence, '$.evidenceIds[1]', 'duplicate');

    const companions = validWeapon();
    companions.slot = 'secondary';
    companions.policies.range = { kind: 'companion-sidearm', primaryIds: ['carbine', 'carbine'] };
    issueAt(companions, '$.policies.range.primaryIds[1]', 'duplicate');
  });

  it('rejects sparse evidence and companion ID arrays at the parse boundary', () => {
    const evidence = validWeapon();
    evidence.evidenceIds = new Array(1);
    issueAt(evidence, '$.evidenceIds[0]', 'missing-key');
    expect(() => parseWeaponDefinition(evidence)).toThrow(WeaponSchemaValidationError);

    const companions = validWeapon();
    companions.slot = 'secondary';
    companions.policies.range = { kind: 'companion-sidearm', primaryIds: new Array(1) };
    issueAt(companions, '$.policies.range.primaryIds[0]', 'missing-key');
    expect(() => parseWeaponDefinition(companions)).toThrow(WeaponSchemaValidationError);
  });

  it('rejects enumerable non-index properties on schema-owned arrays', () => {
    const weapon = validWeapon();
    weapon.evidenceIds.candidate = 'undeclared';
    issueAt(weapon, '$.evidenceIds.candidate', 'unknown-key');

    const definitions = [validWeapon()];
    (definitions as any).candidate = true;
    expect(validateWeaponDefinitions(definitions)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.candidate', code: 'unknown-key' }),
    ]));
    expect(() => parseWeaponDefinitions(definitions)).toThrow(WeaponSchemaValidationError);
  });
});

describe('weapon definition collection parsing', () => {
  it('parses a nonempty collection and freezes the collection boundary', () => {
    const parsed = parseWeaponDefinitions([validWeapon(), secondWeapon()]);
    expect(parsed).toHaveLength(2);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed[1].recoil)).toBe(true);
  });

  it.each([
    ['id', (weapon: any, original: any) => { weapon.id = original.id; }],
    ['modelSetId', (weapon: any, original: any) => { weapon.modelSetId = original.modelSetId; }],
    ['presentationId', (weapon: any, original: any) => { weapon.presentationId = original.presentationId; }],
    ['audioId', (weapon: any, original: any) => { weapon.audioId = original.audioId; }],
    ['provenanceId', (weapon: any, original: any) => { weapon.provenanceId = original.provenanceId; }],
    ['recoil.deterministicPatternId', (weapon: any, original: any) => { weapon.recoil.deterministicPatternId = original.recoil.deterministicPatternId; }],
  ])('rejects duplicate %s values', (field, mutate) => {
    const original = validWeapon();
    const duplicate = secondWeapon();
    mutate(duplicate, original);
    const issues = validateWeaponDefinitions([original, duplicate]);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: `$[1].${field}`, code: 'duplicate' }),
    ]));
  });

  it('rejects missing and oversized collections', () => {
    expect(validateWeaponDefinitions([])).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$', code: 'bounds' }),
    ]));
    expect(validateWeaponDefinitions('not-an-array')).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$', code: 'type' }),
    ]));
    expect(validateWeaponDefinitions(Array.from({ length: 129 }, validWeapon))).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$', code: 'bounds' }),
    ]));
  });

  it('rejects a sparse definition collection instead of returning a sparse catalog', () => {
    const definitions = new Array(1);
    expect(validateWeaponDefinitions(definitions)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$[0]', code: 'missing-key' }),
    ]));
    expect(() => parseWeaponDefinitions(definitions)).toThrow(WeaponSchemaValidationError);
  });
});

describe('weapon schema properties', () => {
  it('accepts every finite RPM inside the declared range', () => {
    fc.assert(fc.property(
      fc.double({ min: 1, max: 3_000, noNaN: true, noDefaultInfinity: true }),
      (rpm) => {
        const weapon = validWeapon();
        weapon.rpm = rpm;
        expect(validateWeaponDefinition(weapon)).toEqual([]);
      },
    ));
  });

  it('rejects every non-finite number at a numeric boundary', () => {
    fc.assert(fc.property(fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY), (value) => {
      const weapon = validWeapon();
      weapon.damage.base = value;
      issueAt(weapon, '$.damage.base', 'type');
    }));
  });

  it('rejects arbitrary undeclared top-level keys', () => {
    fc.assert(fc.property(
      fc.stringMatching(/^[a-z][a-z0-9]{0,15}$/).filter((key) => !Object.hasOwn(validWeapon(), key)),
      (key) => {
        const weapon = validWeapon();
        weapon[key] = true;
        issueAt(weapon, `$.${key}`, 'unknown-key');
      },
    ));
  });

  it('enforces integer projectile multiplicity from one through twelve', () => {
    fc.assert(fc.property(fc.integer({ min: -50, max: 50 }), (pellets) => {
      const weapon = validWeapon();
      weapon.fireKind = 'pellet';
      weapon.pellets = pellets;
      const valid = pellets >= 2 && pellets <= 12;
      expect(validateWeaponDefinition(weapon).length === 0).toBe(valid);
    }));
  });
});
