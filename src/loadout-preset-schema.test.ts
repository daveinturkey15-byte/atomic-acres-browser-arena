import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CURATED_KIT_IDS,
  DEFAULT_LOADOUT_PRESET_NAMES,
  LOADOUT_GRENADE_IDS,
  LOADOUT_LEGACY_V1_KEY,
  LOADOUT_PRESET_IDS,
  LOADOUT_SCHEMA_DEFINITION_V2,
  LOADOUT_SECOND_ROW_TILES,
  LOADOUT_STORAGE_SCHEMA_VERSION,
  LOADOUT_STORAGE_V2_KEY,
  LOADOUT_STORAGE_V2_STAGE_KEY,
  LoadoutEligibilityError,
  LoadoutSchemaValidationError,
  MAX_LOADOUT_PRESET_NAME_CODE_POINTS,
  createDefaultCustomPresets,
  createLoadoutItemEligibility,
  decodeLegacyFieldKitSelectionV1,
  decodeLoadoutStorageV2,
  deploymentSelectionFromPreset,
  loadLoadoutStorageV2,
  migrateLegacyFieldKitStorageV1,
  parseLoadoutPresetV2,
  parseLoadoutStorageV2,
  parseSelectedLoadoutRef,
  sanitizeLoadoutPresetName,
  serializeLoadoutStorageV2,
  validateLoadoutPresetV2,
  validateLoadoutStorageV2,
  validateSelectedLoadoutRef,
  writeLoadoutStorageV2Transaction,
  type LoadoutItemEligibility,
  type LoadoutPresetId,
  type LoadoutStorageAdapter,
  type LoadoutWriteCheckpoint,
} from './loadout-preset-schema';

const fixturePath = fileURLToPath(new URL(
  '../.agents/skills/atomic-acres-combat-registry/scripts/fixtures/known-good.json',
  import.meta.url,
));
const weaponFixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { weapons: unknown };
const ELIGIBILITY = createLoadoutItemEligibility(weaponFixture.weapons);
const decisionReceiptPath = fileURLToPath(new URL('../docs/PASS65_DECISION_RECEIPTS.json', import.meta.url));
const decisionReceipts = JSON.parse(readFileSync(decisionReceiptPath, 'utf8')) as {
  receipts: Array<{
    id: string;
    status: string;
    value: null | {
      customPresetCount?: number;
      secondRowTiles?: string[];
      renameablePresetIds?: string[];
    };
  }>;
};

function preset(id: LoadoutPresetId, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: LOADOUT_STORAGE_SCHEMA_VERSION,
    id,
    displayName: DEFAULT_LOADOUT_PRESET_NAMES[id],
    primary: 'carbine',
    secondary: 'pistol',
    grenade: 'frag',
    ...overrides,
  };
}

function validStorage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: LOADOUT_STORAGE_SCHEMA_VERSION,
    selected: { kind: 'curated', kitId: 'balanced' },
    customPresets: LOADOUT_PRESET_IDS.map((id) => preset(id)),
    ...overrides,
  };
}

function expectSchemaFailure(run: () => unknown): LoadoutSchemaValidationError {
  let captured: unknown;
  try {
    run();
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeInstanceOf(LoadoutSchemaValidationError);
  return captured as LoadoutSchemaValidationError;
}

class MemoryStorage implements LoadoutStorageAdapter {
  readonly data = new Map<string, string>();
  readonly events: string[] = [];
  onGet?: (key: string, value: string | null) => string | null;
  onSet?: (key: string, value: string) => void;
  onRemove?: (key: string) => void;

  getItem(key: string): string | null {
    this.events.push(`get:${key}`);
    const value = this.data.get(key) ?? null;
    return this.onGet ? this.onGet(key, value) : value;
  }

  setItem(key: string, value: string): void {
    this.events.push(`set:${key}`);
    this.onSet?.(key, value);
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.events.push(`remove:${key}`);
    this.onRemove?.(key);
    this.data.delete(key);
  }

  seed(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function canonical(value: unknown): string {
  return serializeLoadoutStorageV2(value, ELIGIBILITY);
}

describe('frozen DEC-01 loadout surface contract', () => {
  it('matches the canonical FROZEN DEC-01 receipt instead of a stale sketch default', () => {
    const receipt = decisionReceipts.receipts.find((entry) => entry.id === 'DEC-01');
    expect(receipt).toEqual(expect.objectContaining({ status: 'FROZEN' }));
    expect(receipt?.value).toEqual({
      customPresetCount: LOADOUT_PRESET_IDS.length,
      secondRowTiles: LOADOUT_SECOND_ROW_TILES.map((tile) => tile.label),
      renameablePresetIds: LOADOUT_PRESET_IDS,
    });
  });

  it('exposes exactly three renameable preset IDs and the exact second row', () => {
    expect(LOADOUT_PRESET_IDS).toEqual(['custom-1', 'custom-2', 'custom-3']);
    expect(LOADOUT_SECOND_ROW_TILES).toEqual([
      { kind: 'custom-preset', presetId: 'custom-1', label: 'Custom 1' },
      { kind: 'custom-preset', presetId: 'custom-2', label: 'Custom 2' },
      { kind: 'custom-preset', presetId: 'custom-3', label: 'Custom 3' },
      { kind: 'manage-rename', label: 'Manage/Rename' },
    ]);
    expect(LOADOUT_SCHEMA_DEFINITION_V2).toEqual({
      schemaVersion: 2,
      enabledCustomPresetIds: ['custom-1', 'custom-2', 'custom-3'],
      showManageRenameTile: true,
      decisionReceiptId: 'DEC-01',
    });
  });

  it('preserves the exact valid legacy curated kit ID order', () => {
    expect(CURATED_KIT_IDS).toEqual(['balanced', 'runner', 'breacher', 'marksman']);
  });

  it('does not make Manage/Rename or the obsolete custom-4 sketch selectable', () => {
    expect(validateSelectedLoadoutRef({ kind: 'manage-rename' })).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.kind', code: 'unsupported-value' }),
    ]));
    expect(validateSelectedLoadoutRef({ kind: 'custom', presetId: 'custom-4' })).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.presetId', code: 'unsupported-value' }),
    ]));
    expect(() => parseSelectedLoadoutRef({ kind: 'manage-rename' })).toThrow(LoadoutSchemaValidationError);
  });

  it('derives custom-slot eligibility from validated F01 slot and policy metadata', () => {
    expect(ELIGIBILITY).toEqual({
      primaryIds: ['carbine', 'smg', 'lmg', 'scattergun', 'sniper'],
      secondaryIds: ['pistol', 'machine-pistol'],
    });
    expect(ELIGIBILITY.secondaryIds).not.toContain('magnum');
    expect(ELIGIBILITY.primaryIds).not.toContain('railgun');
    expect(Object.isFrozen(ELIGIBILITY.primaryIds)).toBe(true);
    expect(Object.isFrozen(ELIGIBILITY.secondaryIds)).toBe(true);
  });

  it('refuses an F01 catalog without both eligible weapon slots', () => {
    const fixture = structuredClone(weaponFixture) as { weapons: Array<{ policies: { loadout: string } }> };
    for (const weapon of fixture.weapons) weapon.policies.loadout = 'never';
    expect(() => createLoadoutItemEligibility(fixture.weapons)).toThrow(LoadoutEligibilityError);
  });

  it('rejects forged or mutable eligibility objects at runtime', () => {
    const forged = {
      primaryIds: ['carbine'],
      secondaryIds: ['pistol'],
    } as LoadoutItemEligibility;
    expect(() => parseLoadoutStorageV2(validStorage(), forged)).toThrow(LoadoutEligibilityError);
  });
});

describe('strict LoadoutPresetV2 and storage parsing', () => {
  it('parses a complete document into independent deeply frozen data', () => {
    const source = validStorage({ selected: { kind: 'custom', presetId: 'custom-2' } });
    const parsed = parseLoadoutStorageV2(source, ELIGIBILITY);
    (source.customPresets as Array<Record<string, unknown>>)[1].displayName = 'Changed later';

    expect(parsed.selected).toEqual({ kind: 'custom', presetId: 'custom-2' });
    expect(parsed.customPresets[1].displayName).toBe('Custom 2');
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.selected)).toBe(true);
    expect(Object.isFrozen(parsed.customPresets)).toBe(true);
    expect(Object.isFrozen(parsed.customPresets[0])).toBe(true);
  });

  it('round-trips canonical storage without changing the discriminated selection', () => {
    const source = validStorage({ selected: { kind: 'custom', presetId: 'custom-3' } });
    const encoded = serializeLoadoutStorageV2(source, ELIGIBILITY);
    const decoded = decodeLoadoutStorageV2(encoded, ELIGIBILITY);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.selected).toEqual({ kind: 'custom', presetId: 'custom-3' });
    expect(serializeLoadoutStorageV2(decoded.value, ELIGIBILITY)).toBe(encoded);
  });

  it('keeps local display names out of the deployment value', () => {
    const parsed = parseLoadoutPresetV2(preset('custom-1', { displayName: 'Night Shift' }), ELIGIBILITY);
    expect(deploymentSelectionFromPreset(parsed)).toEqual({
      primary: 'carbine',
      secondary: 'pistol',
      grenade: 'frag',
    });
    expect(deploymentSelectionFromPreset(parsed)).not.toHaveProperty('displayName');
    expect(deploymentSelectionFromPreset(parsed)).not.toHaveProperty('id');
  });

  it('creates all and only the frozen custom defaults from an explicit legal selection', () => {
    const defaults = createDefaultCustomPresets({
      primary: 'smg',
      secondary: 'machine-pistol',
      grenade: 'smoke',
    }, ELIGIBILITY);

    expect(defaults.map((entry) => entry.id)).toEqual(LOADOUT_PRESET_IDS);
    expect(defaults.map((entry) => entry.displayName)).toEqual(['Custom 1', 'Custom 2', 'Custom 3']);
    expect(defaults.every((entry) => entry.primary === 'smg')).toBe(true);
    expect(Object.isFrozen(defaults)).toBe(true);
  });

  it.each([
    ['wrong primary slot', '$.primary', { primary: 'pistol' }],
    ['non-loadout primary', '$.primary', { primary: 'railgun' }],
    ['disabled secondary', '$.secondary', { secondary: 'magnum' }],
    ['unknown secondary', '$.secondary', { secondary: 'laser-pistol' }],
    ['unknown grenade', '$.grenade', { grenade: 'incendiary' }],
    ['wrong version', '$.schemaVersion', { schemaVersion: 3 }],
    ['disabled preset', '$.id', { id: 'custom-4' }],
  ])('rejects %s at the strict preset boundary', (_name, path, overrides) => {
    expect(validateLoadoutPresetV2(preset('custom-1', overrides), ELIGIBILITY)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path }),
    ]));
  });

  it('rejects duplicate, reordered, missing, and extra custom presets', () => {
    const duplicate = validStorage();
    duplicate.customPresets = [preset('custom-1'), preset('custom-1'), preset('custom-3')];
    expect(validateLoadoutStorageV2(duplicate, ELIGIBILITY)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.customPresets[1].id', code: 'duplicate' }),
      expect.objectContaining({ path: '$.customPresets[1].id', code: 'cross-field' }),
    ]));

    const reordered = validStorage();
    reordered.customPresets = [preset('custom-2'), preset('custom-1'), preset('custom-3')];
    expect(validateLoadoutStorageV2(reordered, ELIGIBILITY)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.customPresets[0].id', code: 'cross-field' }),
      expect.objectContaining({ path: '$.customPresets[1].id', code: 'cross-field' }),
    ]));

    const missing = validStorage();
    missing.customPresets = [preset('custom-1'), preset('custom-2')];
    expect(validateLoadoutStorageV2(missing, ELIGIBILITY)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.customPresets', code: 'bounds' }),
    ]));

    const extra = validStorage();
    extra.customPresets = [...(extra.customPresets as unknown[]), preset('custom-3')];
    expect(validateLoadoutStorageV2(extra, ELIGIBILITY)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.customPresets', code: 'bounds' }),
    ]));
  });

  it.each([
    ['storage', (value: Record<string, unknown>) => { value.unexpected = true; }, '$.unexpected'],
    ['selection', (value: Record<string, unknown>) => {
      (value.selected as Record<string, unknown>).legacy = true;
    }, '$.selected.legacy'],
    ['preset', (value: Record<string, unknown>) => {
      (value.customPresets as Array<Record<string, unknown>>)[0].legacy = true;
    }, '$.customPresets[0].legacy'],
    ['array', (value: Record<string, unknown>) => {
      (value.customPresets as unknown[] & { legacy?: boolean }).legacy = true;
    }, '$.customPresets.legacy'],
  ])('rejects unknown keys on %s objects', (_name, mutate, path) => {
    const value = validStorage();
    mutate(value);
    expect(validateLoadoutStorageV2(value, ELIGIBILITY)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path, code: 'unknown-key' }),
    ]));
    expect(() => parseLoadoutStorageV2(value, ELIGIBILITY)).toThrow(LoadoutSchemaValidationError);
  });

  it('rejects sparse custom preset arrays', () => {
    const value = validStorage();
    const sparse = new Array(3);
    sparse[0] = preset('custom-1');
    sparse[2] = preset('custom-3');
    value.customPresets = sparse;

    expect(validateLoadoutStorageV2(value, ELIGIBILITY)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.customPresets[1]', code: 'missing-key' }),
    ]));
    expect(() => parseLoadoutStorageV2(value, ELIGIBILITY)).toThrow(LoadoutSchemaValidationError);
  });

  it('rejects accessors without invoking them', () => {
    const value = validStorage();
    let reads = 0;
    Object.defineProperty((value.customPresets as unknown[])[0], 'displayName', {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        return 'Must Not Run';
      },
    });

    const error = expectSchemaFailure(() => parseLoadoutStorageV2(value, ELIGIBILITY));
    expect(reads).toBe(0);
    expect(error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.customPresets[0].displayName', code: 'type' }),
    ]));
  });

  it('normalizes throwing Proxy traps to typed schema failures', () => {
    const ownKeysProxy = new Proxy(validStorage(), {
      ownKeys: () => { throw new Error('ownKeys'); },
    });
    expect(() => validateLoadoutStorageV2(ownKeysProxy, ELIGIBILITY)).not.toThrow();
    expect(() => parseLoadoutStorageV2(ownKeysProxy, ELIGIBILITY)).toThrow(LoadoutSchemaValidationError);

    let getCalls = 0;
    const getProxy = new Proxy(validStorage(), {
      get: () => {
        getCalls += 1;
        throw new Error('get');
      },
    });
    expect(validateLoadoutStorageV2(getProxy, ELIGIBILITY)).toEqual([]);
    expect(parseLoadoutStorageV2(getProxy, ELIGIBILITY).selected).toEqual({ kind: 'curated', kitId: 'balanced' });
    expect(getCalls).toBe(0);
  });

  it('rejects a Proxy that changes a descriptor during the snapshot', () => {
    const target = validStorage();
    let descriptorReads = 0;
    const value = new Proxy(target, {
      getOwnPropertyDescriptor: (proxiedTarget, key) => {
        const descriptor = Reflect.getOwnPropertyDescriptor(proxiedTarget, key);
        if (key !== 'schemaVersion' || !descriptor) return descriptor;
        descriptorReads += 1;
        return descriptorReads % 2 === 0
          ? descriptor
          : { configurable: true, enumerable: true, writable: true, value: 999 };
      },
    });

    expect(validateLoadoutStorageV2(value, ELIGIBILITY)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.schemaVersion', code: 'cross-field' }),
    ]));
  });

  it('caps hostile key floods', () => {
    const value = validStorage();
    for (let index = 0; index < 10_000; index += 1) value[`unknown${index}`] = true;
    const issues = validateLoadoutStorageV2(value, ELIGIBILITY);
    expect(issues.length).toBeLessThanOrEqual(96);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$', code: 'bounds' }),
    ]));
  });
});

describe('local custom preset name sanitation', () => {
  it('normalizes Unicode safely and preserves useful international text and emoji', () => {
    expect(sanitizeLoadoutPresetName('  Cafe\u0301   🚁  ', 'custom-1')).toBe('Café 🚁');
    expect(sanitizeLoadoutPresetName('طيار 👩‍🚀', 'custom-1')).toBe('طيار 👩‍🚀');
    expect(sanitizeLoadoutPresetName('👩‍🚀', 'custom-1')).toBe('👩‍🚀');
    expect(sanitizeLoadoutPresetName('Ace\u115f', 'custom-1')).toBe('Ace\u115f');
    expect(Array.from(sanitizeLoadoutPresetName('🚁'.repeat(100), 'custom-1'))).toHaveLength(32);
  });

  it('removes control, bidi override, invisible, and markup metacharacters', () => {
    const sanitized = sanitizeLoadoutPresetName('<b>\u202eAce\u0000\ud800</b>&"\'`', 'custom-2');
    expect(sanitized).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/u);
    expect(sanitized).not.toMatch(/[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u);
    expect(sanitized).not.toMatch(/[\ud800-\udfff]/u);
    expect(sanitized).not.toMatch(/[<>&"'`]/u);
    expect(parseLoadoutPresetV2(preset('custom-2', { displayName: sanitized }), ELIGIBILITY).displayName).toBe(sanitized);
  });

  it('uses the exact slot default when sanitation would produce an empty name', () => {
    expect(sanitizeLoadoutPresetName('\u202e<>&\u0000', 'custom-3')).toBe('Custom 3');
    expect(sanitizeLoadoutPresetName('\u200d\u200d', 'custom-1')).toBe('Custom 1');
    expect(sanitizeLoadoutPresetName('\ufe0f\ufe0f', 'custom-2')).toBe('Custom 2');
    expect(sanitizeLoadoutPresetName('\u115f\u1160', 'custom-1')).toBe('Custom 1');
    expect(sanitizeLoadoutPresetName('\u3164\uffa0', 'custom-2')).toBe('Custom 2');
    expect(sanitizeLoadoutPresetName(null, 'custom-2')).toBe('Custom 2');
    expect(() => sanitizeLoadoutPresetName('', 'custom-4' as LoadoutPresetId)).toThrow(LoadoutSchemaValidationError);
  });

  it.each([
    '  Leading space',
    'Trailing space  ',
    'Double  space',
    '<script>alert(1)</script>',
    'Ace\u202eName',
    'Ace\u0000Name',
    '\u200d\u200d',
    '\ufe0f\ufe0f',
    '\u115f\u1160',
    '\u3164\uffa0',
    'x'.repeat(MAX_LOADOUT_PRESET_NAME_CODE_POINTS + 1),
    '',
  ])('rejects an unsanitized persisted name %j', (displayName) => {
    expect(validateLoadoutPresetV2(preset('custom-1', { displayName }), ELIGIBILITY)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.displayName', code: 'format' }),
    ]));
  });

  it('is idempotent, bounded, and always produces parser-safe text', () => {
    fc.assert(fc.property(fc.string({ unit: 'binary' }), fc.constantFrom(...LOADOUT_PRESET_IDS), (value, id) => {
      const first = sanitizeLoadoutPresetName(value, id);
      const second = sanitizeLoadoutPresetName(first, id);
      expect(second).toBe(first);
      expect(Array.from(first).length).toBeLessThanOrEqual(MAX_LOADOUT_PRESET_NAME_CODE_POINTS);
      expect(validateLoadoutPresetV2(preset(id, { displayName: first }), ELIGIBILITY)).toEqual([]);
    }));
  });
});

describe('legacy v1 selection decoding', () => {
  it('preserves every exact valid curated kit without remapping', () => {
    fc.assert(fc.property(fc.constantFrom(...CURATED_KIT_IDS), (kitId) => {
      expect(decodeLegacyFieldKitSelectionV1(JSON.stringify({ version: 1, selected: kitId }))).toEqual({
        kind: 'valid',
        kitId,
      });
    }));
  });

  it.each([
    ['unknown ID', JSON.stringify({ version: 1, selected: 'balanced-plus' })],
    ['wrong version', JSON.stringify({ version: 2, selected: 'runner' })],
    ['unknown key', JSON.stringify({ version: 1, selected: 'runner', fallback: 'balanced' })],
    ['malformed JSON', '{'],
    ['wrong shape', JSON.stringify(['runner'])],
  ])('rejects %s instead of silently mapping it', (_name, serialized) => {
    expect(decodeLegacyFieldKitSelectionV1(serialized).kind).toBe('invalid');
  });

  it('distinguishes a genuinely missing legacy key from corrupt data', () => {
    expect(decodeLegacyFieldKitSelectionV1(null)).toEqual({ kind: 'missing' });
    expect(decodeLegacyFieldKitSelectionV1('')).toEqual(expect.objectContaining({ kind: 'invalid' }));
  });
});

describe('verified staged v2 storage transaction', () => {
  it('stages, reads back, normalizes, commits atomically, and cleans only the stage key', () => {
    const storage = new MemoryStorage();
    storage.seed(LOADOUT_LEGACY_V1_KEY, JSON.stringify({ version: 1, selected: 'marksman' }));
    const candidate = validStorage({ selected: { kind: 'custom', presetId: 'custom-2' } });
    const result = writeLoadoutStorageV2Transaction(storage, candidate, ELIGIBILITY);

    expect(result).toEqual(expect.objectContaining({ ok: true, stageCleanup: 'removed' }));
    expect(storage.data.get(LOADOUT_STORAGE_V2_KEY)).toBe(canonical(candidate));
    expect(storage.data.has(LOADOUT_STORAGE_V2_STAGE_KEY)).toBe(false);
    expect(storage.data.has(LOADOUT_LEGACY_V1_KEY)).toBe(true);
    expect(storage.events).toEqual([
      `set:${LOADOUT_STORAGE_V2_STAGE_KEY}`,
      `get:${LOADOUT_STORAGE_V2_STAGE_KEY}`,
      `set:${LOADOUT_STORAGE_V2_KEY}`,
      `remove:${LOADOUT_STORAGE_V2_STAGE_KEY}`,
    ]);
  });

  it('accepts semantically equal noncanonical stage read-back and commits canonical bytes', () => {
    const storage = new MemoryStorage();
    const candidate = validStorage({ selected: { kind: 'custom', presetId: 'custom-1' } });
    storage.onGet = (key, value) => {
      if (key !== LOADOUT_STORAGE_V2_STAGE_KEY || value === null) return value;
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return JSON.stringify({
        customPresets: parsed.customPresets,
        selected: parsed.selected,
        schemaVersion: parsed.schemaVersion,
      }, null, 2);
    };

    const result = writeLoadoutStorageV2Transaction(storage, candidate, ELIGIBILITY);
    expect(result.ok).toBe(true);
    expect(storage.data.get(LOADOUT_STORAGE_V2_KEY)).toBe(canonical(candidate));
  });

  it.each([
    'before-stage',
    'after-stage',
    'before-readback',
    'after-readback',
    'before-commit',
    'after-commit',
  ] satisfies readonly LoadoutWriteCheckpoint[])('survives an injected %s failure', (failurePoint) => {
    const storage = new MemoryStorage();
    const previous = validStorage({ selected: { kind: 'custom', presetId: 'custom-1' } });
    const candidate = validStorage({ selected: { kind: 'custom', presetId: 'custom-3' } });
    storage.seed(LOADOUT_STORAGE_V2_KEY, canonical(previous));

    const result = writeLoadoutStorageV2Transaction(storage, candidate, ELIGIBILITY, {
      checkpoint: (point) => {
        if (point === failurePoint) throw new Error('injected crash');
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      code: 'checkpoint-failed',
      checkpoint: failurePoint,
      committed: failurePoint === 'after-commit',
    }));
    const surviving = decodeLoadoutStorageV2(storage.data.get(LOADOUT_STORAGE_V2_KEY)!, ELIGIBILITY);
    expect(surviving.ok).toBe(true);
    if (!surviving.ok) return;
    expect(surviving.value.selected).toEqual(
      failurePoint === 'after-commit'
        ? { kind: 'custom', presetId: 'custom-3' }
        : { kind: 'custom', presetId: 'custom-1' },
    );
  });

  it('does not commit a corrupt or unequal staged read-back', () => {
    const previous = validStorage({ selected: { kind: 'custom', presetId: 'custom-1' } });

    const corrupt = new MemoryStorage();
    corrupt.seed(LOADOUT_STORAGE_V2_KEY, canonical(previous));
    corrupt.onGet = (key, value) => key === LOADOUT_STORAGE_V2_STAGE_KEY ? '{' : value;
    expect(writeLoadoutStorageV2Transaction(corrupt, validStorage(), ELIGIBILITY)).toEqual(expect.objectContaining({
      ok: false,
      code: 'stage-invalid',
      committed: false,
    }));
    expect(corrupt.data.get(LOADOUT_STORAGE_V2_KEY)).toBe(canonical(previous));

    const unequal = new MemoryStorage();
    unequal.seed(LOADOUT_STORAGE_V2_KEY, canonical(previous));
    unequal.onGet = (key, value) => key === LOADOUT_STORAGE_V2_STAGE_KEY
      ? canonical(validStorage({ selected: { kind: 'curated', kitId: 'runner' } }))
      : value;
    expect(writeLoadoutStorageV2Transaction(unequal, validStorage(), ELIGIBILITY)).toEqual(expect.objectContaining({
      ok: false,
      code: 'stage-mismatch',
      committed: false,
    }));
    expect(unequal.data.get(LOADOUT_STORAGE_V2_KEY)).toBe(canonical(previous));
  });

  it('does not commit when the staged value disappears before read-back', () => {
    const storage = new MemoryStorage();
    const previous = validStorage({ selected: { kind: 'custom', presetId: 'custom-1' } });
    storage.seed(LOADOUT_STORAGE_V2_KEY, canonical(previous));
    storage.onGet = (key, value) => key === LOADOUT_STORAGE_V2_STAGE_KEY ? null : value;

    expect(writeLoadoutStorageV2Transaction(storage, validStorage(), ELIGIBILITY)).toEqual(expect.objectContaining({
      ok: false,
      code: 'stage-missing',
      phase: 'readback',
      committed: false,
    }));
    expect(storage.data.get(LOADOUT_STORAGE_V2_KEY)).toBe(canonical(previous));
  });

  it('handles quota and throwing storage without erasing the committed document', () => {
    const previous = validStorage({ selected: { kind: 'custom', presetId: 'custom-1' } });
    const candidate = validStorage({ selected: { kind: 'custom', presetId: 'custom-3' } });

    const stageQuota = new MemoryStorage();
    stageQuota.seed(LOADOUT_STORAGE_V2_KEY, canonical(previous));
    stageQuota.onSet = (key) => {
      if (key === LOADOUT_STORAGE_V2_STAGE_KEY) throw new DOMException('quota', 'QuotaExceededError');
    };
    expect(writeLoadoutStorageV2Transaction(stageQuota, candidate, ELIGIBILITY)).toEqual(expect.objectContaining({
      ok: false,
      code: 'storage-failed',
      phase: 'stage',
    }));
    expect(stageQuota.data.get(LOADOUT_STORAGE_V2_KEY)).toBe(canonical(previous));

    const commitQuota = new MemoryStorage();
    commitQuota.seed(LOADOUT_STORAGE_V2_KEY, canonical(previous));
    commitQuota.onSet = (key) => {
      if (key === LOADOUT_STORAGE_V2_KEY) throw new DOMException('quota', 'QuotaExceededError');
    };
    expect(writeLoadoutStorageV2Transaction(commitQuota, candidate, ELIGIBILITY)).toEqual(expect.objectContaining({
      ok: false,
      code: 'storage-failed',
      phase: 'commit',
    }));
    expect(commitQuota.data.get(LOADOUT_STORAGE_V2_KEY)).toBe(canonical(previous));

    const readFailure = new MemoryStorage();
    readFailure.seed(LOADOUT_STORAGE_V2_KEY, canonical(previous));
    readFailure.onGet = (key, value) => {
      if (key === LOADOUT_STORAGE_V2_STAGE_KEY) throw new Error('read failure');
      return value;
    };
    expect(writeLoadoutStorageV2Transaction(readFailure, candidate, ELIGIBILITY)).toEqual(expect.objectContaining({
      ok: false,
      code: 'storage-failed',
      phase: 'readback',
    }));
    expect(readFailure.data.get(LOADOUT_STORAGE_V2_KEY)).toBe(canonical(previous));
  });

  it('treats stage cleanup failure as committed success', () => {
    const storage = new MemoryStorage();
    storage.onRemove = (key) => {
      if (key === LOADOUT_STORAGE_V2_STAGE_KEY) throw new Error('remove failure');
    };
    const result = writeLoadoutStorageV2Transaction(storage, validStorage(), ELIGIBILITY);
    expect(result).toEqual(expect.objectContaining({ ok: true, stageCleanup: 'retained-remove-failure' }));
    expect(decodeLoadoutStorageV2(storage.data.get(LOADOUT_STORAGE_V2_KEY)!, ELIGIBILITY).ok).toBe(true);
    expect(storage.data.has(LOADOUT_STORAGE_V2_STAGE_KEY)).toBe(true);
  });

  it('performs no storage I/O for an invalid candidate', () => {
    const storage = new MemoryStorage();
    const invalid = validStorage();
    (invalid.customPresets as Array<Record<string, unknown>>)[0].primary = 'unknown';
    expect(writeLoadoutStorageV2Transaction(storage, invalid, ELIGIBILITY)).toEqual(expect.objectContaining({
      ok: false,
      code: 'invalid-candidate',
      phase: 'validate',
    }));
    expect(storage.events).toEqual([]);
  });
});

describe('v1 to v2 migration and delayed legacy cleanup', () => {
  const defaults = createDefaultCustomPresets({
    primary: 'carbine',
    secondary: 'pistol',
    grenade: 'frag',
  }, ELIGIBILITY);

  it('preserves every valid v1 curated ID and retains v1 after the verified commit', () => {
    fc.assert(fc.property(fc.constantFrom(...CURATED_KIT_IDS), (kitId) => {
      const storage = new MemoryStorage();
      const legacy = JSON.stringify({ version: 1, selected: kitId });
      storage.seed(LOADOUT_LEGACY_V1_KEY, legacy);

      const result = migrateLegacyFieldKitStorageV1(storage, defaults, ELIGIBILITY);
      expect(result).toEqual(expect.objectContaining({
        ok: true,
        status: 'migrated',
        legacySource: 'valid',
      }));
      if (!result.ok) return;
      expect(result.value.selected).toEqual({ kind: 'curated', kitId });
      expect(storage.data.get(LOADOUT_LEGACY_V1_KEY)).toBe(legacy);
    }));
  });

  it.each([
    ['missing', null, 'missing'],
    ['malformed', '{', 'invalid'],
    ['unknown', JSON.stringify({ version: 1, selected: 'mystery' }), 'invalid'],
    ['stale', JSON.stringify({ version: 0, selected: 'runner' }), 'invalid'],
  ])('uses the documented safe curated default for %s v1 input', (_name, serialized, legacySource) => {
    const storage = new MemoryStorage();
    if (serialized !== null) storage.seed(LOADOUT_LEGACY_V1_KEY, serialized);
    const result = migrateLegacyFieldKitStorageV1(storage, defaults, ELIGIBILITY);

    expect(result).toEqual(expect.objectContaining({ ok: true, status: 'migrated', legacySource }));
    if (!result.ok) return;
    expect(result.value.selected).toEqual({ kind: 'curated', kitId: 'balanced' });
    if (serialized !== null) expect(storage.data.get(LOADOUT_LEGACY_V1_KEY)).toBe(serialized);
  });

  it('is idempotent and never overwrites an already-valid custom v2 selection', () => {
    const storage = new MemoryStorage();
    storage.seed(LOADOUT_LEGACY_V1_KEY, JSON.stringify({ version: 1, selected: 'marksman' }));
    const first = migrateLegacyFieldKitStorageV1(storage, defaults, ELIGIBILITY);
    expect(first.ok).toBe(true);
    const custom = validStorage({
      selected: { kind: 'custom', presetId: 'custom-3' },
      customPresets: [
        preset('custom-1'),
        preset('custom-2'),
        preset('custom-3', { displayName: 'Silent Running', primary: 'sniper', secondary: 'machine-pistol' }),
      ],
    });
    storage.seed(LOADOUT_STORAGE_V2_KEY, canonical(custom));
    const writesBefore = storage.events.filter((event) => event.startsWith('set:')).length;

    const second = migrateLegacyFieldKitStorageV1(storage, defaults, ELIGIBILITY);
    expect(second).toEqual(expect.objectContaining({
      ok: true,
      status: 'already-v2',
      legacySource: 'not-read',
    }));
    if (!second.ok) return;
    expect(second.value.selected).toEqual({ kind: 'custom', presetId: 'custom-3' });
    expect(second.value.customPresets[2].displayName).toBe('Silent Running');
    expect(storage.events.filter((event) => event.startsWith('set:'))).toHaveLength(writesBefore);
    expect(storage.data.has(LOADOUT_LEGACY_V1_KEY)).toBe(true);
  });

  it('recovers a corrupt v2 value from an exact valid retained v1 selection', () => {
    const storage = new MemoryStorage();
    storage.seed(LOADOUT_STORAGE_V2_KEY, '{corrupt');
    storage.seed(LOADOUT_LEGACY_V1_KEY, JSON.stringify({ version: 1, selected: 'breacher' }));

    const result = migrateLegacyFieldKitStorageV1(storage, defaults, ELIGIBILITY);
    expect(result).toEqual(expect.objectContaining({ ok: true, status: 'migrated', legacySource: 'valid' }));
    if (!result.ok) return;
    expect(result.value.selected).toEqual({ kind: 'curated', kitId: 'breacher' });
    expect(storage.data.has(LOADOUT_LEGACY_V1_KEY)).toBe(true);
  });

  it('removes a valid v1 only after a later successful strict v2 load', () => {
    const storage = new MemoryStorage();
    storage.seed(LOADOUT_LEGACY_V1_KEY, JSON.stringify({ version: 1, selected: 'runner' }));
    expect(migrateLegacyFieldKitStorageV1(storage, defaults, ELIGIBILITY).ok).toBe(true);
    expect(storage.data.has(LOADOUT_LEGACY_V1_KEY)).toBe(true);

    const loaded = loadLoadoutStorageV2(storage, ELIGIBILITY);
    expect(loaded).toEqual(expect.objectContaining({ ok: true, legacyCleanup: 'removed-valid' }));
    expect(storage.data.has(LOADOUT_LEGACY_V1_KEY)).toBe(false);
  });

  it('never deletes v1 when the v2 load or the legacy parse fails', () => {
    const corruptV2 = new MemoryStorage();
    corruptV2.seed(LOADOUT_STORAGE_V2_KEY, '{');
    corruptV2.seed(LOADOUT_LEGACY_V1_KEY, JSON.stringify({ version: 1, selected: 'runner' }));
    expect(loadLoadoutStorageV2(corruptV2, ELIGIBILITY)).toEqual(expect.objectContaining({ ok: false, reason: 'json' }));
    expect(corruptV2.data.has(LOADOUT_LEGACY_V1_KEY)).toBe(true);

    const corruptV1 = new MemoryStorage();
    corruptV1.seed(LOADOUT_STORAGE_V2_KEY, canonical(validStorage()));
    corruptV1.seed(LOADOUT_LEGACY_V1_KEY, '{');
    expect(loadLoadoutStorageV2(corruptV1, ELIGIBILITY)).toEqual(expect.objectContaining({
      ok: true,
      legacyCleanup: 'retained-invalid',
    }));
    expect(corruptV1.data.get(LOADOUT_LEGACY_V1_KEY)).toBe('{');

    const missingV2 = new MemoryStorage();
    missingV2.seed(LOADOUT_LEGACY_V1_KEY, JSON.stringify({ version: 1, selected: 'runner' }));
    expect(loadLoadoutStorageV2(missingV2, ELIGIBILITY)).toEqual({ ok: false, reason: 'missing' });
    expect(missingV2.data.has(LOADOUT_LEGACY_V1_KEY)).toBe(true);
  });

  it('retains v1 when cleanup storage reads or deletes throw', () => {
    const readFailure = new MemoryStorage();
    readFailure.seed(LOADOUT_STORAGE_V2_KEY, canonical(validStorage()));
    readFailure.seed(LOADOUT_LEGACY_V1_KEY, JSON.stringify({ version: 1, selected: 'runner' }));
    readFailure.onGet = (key, value) => {
      if (key === LOADOUT_LEGACY_V1_KEY) throw new Error('blocked');
      return value;
    };
    expect(loadLoadoutStorageV2(readFailure, ELIGIBILITY)).toEqual(expect.objectContaining({
      ok: true,
      legacyCleanup: 'retained-read-failure',
    }));
    expect(readFailure.data.has(LOADOUT_LEGACY_V1_KEY)).toBe(true);

    const removeFailure = new MemoryStorage();
    removeFailure.seed(LOADOUT_STORAGE_V2_KEY, canonical(validStorage()));
    removeFailure.seed(LOADOUT_LEGACY_V1_KEY, JSON.stringify({ version: 1, selected: 'runner' }));
    removeFailure.onRemove = (key) => {
      if (key === LOADOUT_LEGACY_V1_KEY) throw new Error('blocked');
    };
    expect(loadLoadoutStorageV2(removeFailure, ELIGIBILITY)).toEqual(expect.objectContaining({
      ok: true,
      legacyCleanup: 'retained-remove-failure',
    }));
    expect(removeFailure.data.has(LOADOUT_LEGACY_V1_KEY)).toBe(true);
  });

  it('retains v1 through every migration checkpoint failure, including a known post-commit result', () => {
    for (const failurePoint of [
      'before-stage',
      'after-stage',
      'before-readback',
      'after-readback',
      'before-commit',
      'after-commit',
    ] satisfies readonly LoadoutWriteCheckpoint[]) {
      const storage = new MemoryStorage();
      const legacy = JSON.stringify({ version: 1, selected: 'marksman' });
      storage.seed(LOADOUT_LEGACY_V1_KEY, legacy);
      const result = migrateLegacyFieldKitStorageV1(storage, defaults, ELIGIBILITY, {
        checkpoint: (point) => {
          if (point === failurePoint) throw new Error('crash');
        },
      });

      expect(result).toEqual(expect.objectContaining({
        ok: false,
        status: 'failed',
        phase: 'write',
        committed: failurePoint === 'after-commit',
      }));
      expect(storage.data.get(LOADOUT_LEGACY_V1_KEY)).toBe(legacy);
      if (failurePoint === 'after-commit') {
        expect(decodeLoadoutStorageV2(storage.data.get(LOADOUT_STORAGE_V2_KEY)!, ELIGIBILITY)).toEqual(expect.objectContaining({ ok: true }));
      } else {
        expect(storage.data.has(LOADOUT_STORAGE_V2_KEY)).toBe(false);
      }
    }
  });

  it('fails closed when the storage adapter throws before migration can establish source state', () => {
    const throwing: LoadoutStorageAdapter = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(migrateLegacyFieldKitStorageV1(throwing, defaults, ELIGIBILITY)).toEqual({
      ok: false,
      status: 'failed',
      phase: 'read-current',
      committed: false,
    });
    expect(loadLoadoutStorageV2(throwing, ELIGIBILITY)).toEqual({ ok: false, reason: 'storage-failed' });
  });
});

describe('loadout schema properties', () => {
  it('accepts every allowlisted primary/secondary/grenade combination', () => {
    fc.assert(fc.property(
      fc.constantFrom(...ELIGIBILITY.primaryIds),
      fc.constantFrom(...ELIGIBILITY.secondaryIds),
      fc.constantFrom(...LOADOUT_GRENADE_IDS),
      (primary, secondary, grenade) => {
        expect(validateLoadoutPresetV2(preset('custom-1', { primary, secondary, grenade }), ELIGIBILITY)).toEqual([]);
      },
    ));
  });

  it('makes canonical serialization idempotent across arbitrary legal documents', () => {
    fc.assert(fc.property(
      fc.constantFrom(...LOADOUT_PRESET_IDS),
      fc.constantFrom(...ELIGIBILITY.primaryIds),
      fc.constantFrom(...ELIGIBILITY.secondaryIds),
      fc.constantFrom(...LOADOUT_GRENADE_IDS),
      (selectedId, primary, secondary, grenade) => {
        const value = validStorage({
          selected: { kind: 'custom', presetId: selectedId },
          customPresets: LOADOUT_PRESET_IDS.map((id) => preset(id, { primary, secondary, grenade })),
        });
        const first = canonical(value);
        const decoded = decodeLoadoutStorageV2(first, ELIGIBILITY);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) return;
        expect(canonical(decoded.value)).toBe(first);
      },
    ));
  });

  it('rejects arbitrary weapon IDs outside the explicit eligibility registry', () => {
    fc.assert(fc.property(
      fc.stringMatching(/^[a-z][a-z0-9-]{0,24}$/).filter((id) => !ELIGIBILITY.primaryIds.includes(id)),
      (primary) => {
        expect(validateLoadoutPresetV2(preset('custom-1', { primary }), ELIGIBILITY)).toEqual(expect.arrayContaining([
          expect.objectContaining({ path: '$.primary', code: 'unsupported-value' }),
        ]));
      },
    ));
  });
});

void (ELIGIBILITY satisfies LoadoutItemEligibility);
