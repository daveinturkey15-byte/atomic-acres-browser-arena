export const CARE_PACKAGE_KILLSTREAK_ID = 'care-package';
export const NUKE_KILLSTREAK_ID = 'nuke';
export const CARE_PACKAGE_FIXED_DENOMINATOR = 100;
export const CARE_PACKAGE_NON_NUKE_SCALE = CARE_PACKAGE_FIXED_DENOMINATOR - 1;

export type KillstreakAvailability = 'selectable' | 'care-only' | 'retired';
export type KillstreakTier = 'low' | 'mid' | 'high' | 'top';
export type KillstreakActivation = 'instant' | 'target-point' | 'target-line' | 'possession';

export type KillstreakCatalogSourceDefinition<Id extends string = string> = Readonly<{
  id: Id;
  displayName: string;
  cost: number;
  tier: KillstreakTier;
  availability: KillstreakAvailability;
  carePackageBaseWeightUnits: number;
  relationship: string;
  activation: KillstreakActivation;
  durationMs: number;
  repeatable: boolean;
}>;

export type KillstreakDefinition<Id extends string = string> = KillstreakCatalogSourceDefinition<Id> & Readonly<{
  /** Derived by the catalog formula. This value is never independently authored. */
  carePackageWeightUnits: number;
}>;

export type CarePackagePoolEntry<Id extends string = string> = Readonly<{
  id: Id;
  weightUnits: number;
  startInclusive: number;
  endExclusive: number;
}>;

export type KillstreakCatalog<Id extends string = string> = Readonly<{
  definitions: readonly KillstreakDefinition<Id>[];
  carePackagePool: Readonly<{
    entries: readonly CarePackagePoolEntry<Id>[];
    nonNukeBaseWeightTotal: number;
    totalWeightUnits: number;
    fixedNukeProbability: Readonly<{ numerator: 1; denominator: 100 }>;
  }>;
}>;

const SOURCE_KEYS = Object.freeze([
  'id',
  'displayName',
  'cost',
  'tier',
  'availability',
  'carePackageBaseWeightUnits',
  'relationship',
  'activation',
  'durationMs',
  'repeatable',
] as const);
const TIERS: readonly KillstreakTier[] = ['low', 'mid', 'high', 'top'];
const AVAILABILITIES: readonly KillstreakAvailability[] = ['selectable', 'care-only', 'retired'];
const ACTIVATIONS: readonly KillstreakActivation[] = ['instant', 'target-point', 'target-line', 'possession'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(`${label} keys invalid; unknown=[${unknown.join(',')}] missing=[${missing.join(',')}]`);
  }
}

function safeMultiply(left: number, right: number, label: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new Error(`${label} exceeds safe-integer range`);
  return result;
}

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error(`${label} exceeds safe-integer range`);
  return result;
}

function validateSourceDefinition(value: unknown, index: number): asserts value is KillstreakCatalogSourceDefinition {
  if (!isPlainObject(value)) throw new Error(`catalog[${index}] must be an object`);
  exactKeys(value, SOURCE_KEYS, `catalog[${index}]`);
  const label = typeof value.id === 'string' ? value.id : `catalog[${index}]`;
  if (typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value.id)) throw new Error(`${label} has invalid ID`);
  if (typeof value.displayName !== 'string' || value.displayName.trim().length === 0 || value.displayName.length > 80) {
    throw new Error(`${label} has invalid display name`);
  }
  if (!Number.isSafeInteger(value.cost) || (value.cost as number) < 1 || (value.cost as number) > 100) {
    throw new Error(`${label} has invalid cost`);
  }
  if (!TIERS.includes(value.tier as KillstreakTier)) throw new Error(`${label} has invalid tier`);
  if (!AVAILABILITIES.includes(value.availability as KillstreakAvailability)) throw new Error(`${label} has invalid availability`);
  if (!Number.isSafeInteger(value.carePackageBaseWeightUnits) || (value.carePackageBaseWeightUnits as number) < 0) {
    throw new Error(`${label} has invalid care-package base weight`);
  }
  if (typeof value.relationship !== 'string' || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value.relationship)) {
    throw new Error(`${label} has invalid relationship`);
  }
  if (!ACTIVATIONS.includes(value.activation as KillstreakActivation)) throw new Error(`${label} has invalid activation`);
  if (!Number.isSafeInteger(value.durationMs) || (value.durationMs as number) < 0 || (value.durationMs as number) > 600_000) {
    throw new Error(`${label} has invalid duration`);
  }
  if (typeof value.repeatable !== 'boolean') throw new Error(`${label} has invalid repeatable policy`);
}

function freezeSourceDefinitions<const Sources extends readonly KillstreakCatalogSourceDefinition[]>(sources: Sources): Sources {
  for (const source of sources) Object.freeze(source);
  Object.freeze(sources);
  return sources;
}

/**
 * Builds the immutable catalog and care pool from one authored definition list.
 * Adding, renaming, retiring, repricing, or reweighting an entry necessarily
 * reruns this projection; callers cannot provide a second eligible-ID list or
 * independently authored derived weight.
 */
export function createKillstreakCatalog<const Id extends string>(
  rawSources: readonly KillstreakCatalogSourceDefinition<Id>[],
): KillstreakCatalog<Id> {
  if (!Array.isArray(rawSources) || rawSources.length === 0) throw new Error('killstreak catalog must be a non-empty array');
  rawSources.forEach((source, index) => validateSourceDefinition(source, index));
  const sources = rawSources as readonly KillstreakCatalogSourceDefinition<Id>[];
  const ids = sources.map((source) => source.id);
  if (new Set(ids).size !== ids.length) throw new Error('killstreak catalog IDs must be unique');

  const carePackage = sources.find((source) => source.id === CARE_PACKAGE_KILLSTREAK_ID);
  const nuke = sources.find((source) => source.id === NUKE_KILLSTREAK_ID);
  if (!carePackage) throw new Error('care-package definition is required');
  if (!nuke) throw new Error('nuke definition is required');
  if (carePackage.availability !== 'selectable' || carePackage.carePackageBaseWeightUnits !== 0) {
    throw new Error('care-package must be selectable with zero recursive base weight');
  }
  if (nuke.availability !== 'selectable' || nuke.carePackageBaseWeightUnits !== 0) {
    throw new Error('nuke must be selectable with its fixed-probability base weight set to zero');
  }

  let nonNukeBaseWeightTotal = 0;
  for (const source of sources) {
    const eligible = source.availability !== 'retired' && source.id !== CARE_PACKAGE_KILLSTREAK_ID;
    if (!eligible || source.id === NUKE_KILLSTREAK_ID) {
      if (source.carePackageBaseWeightUnits !== 0) {
        throw new Error(`${source.id} must have zero care-package base weight`);
      }
      continue;
    }
    if (source.carePackageBaseWeightUnits <= 0) {
      throw new Error(`${source.id} is care-package eligible and requires positive base weight`);
    }
    nonNukeBaseWeightTotal = safeAdd(
      nonNukeBaseWeightTotal,
      source.carePackageBaseWeightUnits,
      'care-package non-Nuke base total',
    );
  }
  if (nonNukeBaseWeightTotal <= 0) throw new Error('care-package pool requires a positive non-Nuke base total');

  const weightFor = (source: KillstreakCatalogSourceDefinition<Id>): number => {
    if (source.availability === 'retired' || source.id === CARE_PACKAGE_KILLSTREAK_ID) return 0;
    if (source.id === NUKE_KILLSTREAK_ID) return nonNukeBaseWeightTotal;
    return safeMultiply(source.carePackageBaseWeightUnits, CARE_PACKAGE_NON_NUKE_SCALE, `${source.id} derived care weight`);
  };

  const definitions = Object.freeze(sources.map((source) => Object.freeze({
    ...source,
    carePackageWeightUnits: weightFor(source),
  }))) as readonly KillstreakDefinition<Id>[];
  let cursor = 0;
  const entries: CarePackagePoolEntry<Id>[] = [];
  for (const definition of definitions) {
    if (definition.carePackageWeightUnits === 0) continue;
    const startInclusive = cursor;
    cursor = safeAdd(cursor, definition.carePackageWeightUnits, 'care-package derived total');
    entries.push(Object.freeze({
      id: definition.id,
      weightUnits: definition.carePackageWeightUnits,
      startInclusive,
      endExclusive: cursor,
    }));
  }
  const expectedTotal = safeMultiply(nonNukeBaseWeightTotal, CARE_PACKAGE_FIXED_DENOMINATOR, 'care-package expected total');
  if (cursor !== expectedTotal) throw new Error(`care-package formula mismatch ${cursor}/${expectedTotal}`);
  const nukeEntry = entries.find((entry) => entry.id === NUKE_KILLSTREAK_ID);
  if (!nukeEntry || nukeEntry.weightUnits * CARE_PACKAGE_FIXED_DENOMINATOR !== cursor) {
    throw new Error('nuke must equal exactly one percent of the care-package pool');
  }

  return Object.freeze({
    definitions,
    carePackagePool: Object.freeze({
      entries: Object.freeze(entries),
      nonNukeBaseWeightTotal,
      totalWeightUnits: cursor,
      fixedNukeProbability: Object.freeze({ numerator: 1 as const, denominator: 100 as const }),
    }),
  });
}

export function rewardForCarePackageUnit<Id extends string>(
  catalog: KillstreakCatalog<Id>,
  unit: number,
): Id {
  if (!Number.isSafeInteger(unit) || unit < 0 || unit >= catalog.carePackagePool.totalWeightUnits) {
    throw new Error(`care-package roll unit ${unit} is out of range`);
  }
  const reward = catalog.carePackagePool.entries.find((entry) => unit < entry.endExclusive);
  if (!reward) throw new Error('care-package pool has no reward for admitted unit');
  return reward.id;
}

export const PASS65_KILLSTREAK_SOURCES = freezeSourceDefinitions([
  { id: 'scout-sweep', displayName: 'Scout Sweep', cost: 3, tier: 'low', availability: 'selectable', carePackageBaseWeightUnits: 24, relationship: 'retained-slot-1', activation: 'instant', durationMs: 12_000, repeatable: false },
  { id: 'adrenaline', displayName: 'Adrenaline Boost', cost: 3, tier: 'low', availability: 'selectable', carePackageBaseWeightUnits: 24, relationship: 'scout-sweep-slot-alternative', activation: 'instant', durationMs: 15_000, repeatable: false },
  { id: 'care-package', displayName: 'Care Package', cost: 4, tier: 'low', availability: 'selectable', carePackageBaseWeightUnits: 0, relationship: 'nonrecursive-slot-1', activation: 'instant', durationMs: 60_000, repeatable: false },
  { id: 'yardhawk', displayName: 'Yardhawk', cost: 5, tier: 'mid', availability: 'selectable', carePackageBaseWeightUnits: 16, relationship: 'retained-slot-2', activation: 'instant', durationMs: 15_000, repeatable: false },
  { id: 'piloted-drone', displayName: 'Piloted Drone', cost: 5, tier: 'mid', availability: 'selectable', carePackageBaseWeightUnits: 16, relationship: 'yardhawk-slot-alternative', activation: 'possession', durationMs: 30_000, repeatable: false },
  { id: 'tri-pass', displayName: 'Tri-Pass Strike', cost: 7, tier: 'high', availability: 'selectable', carePackageBaseWeightUnits: 12, relationship: 'retained-slot-3-or-4', activation: 'target-line', durationMs: 12_000, repeatable: false },
  { id: 'carpet-bomber', displayName: 'Carpet Bomber', cost: 7, tier: 'high', availability: 'selectable', carePackageBaseWeightUnits: 12, relationship: 'slot-3-or-4-alternative', activation: 'target-point', durationMs: 12_000, repeatable: false },
  { id: 'hunter-swarm', displayName: 'Hunter Swarm', cost: 8, tier: 'high', availability: 'selectable', carePackageBaseWeightUnits: 9, relationship: 'retained-slot-3-or-4', activation: 'instant', durationMs: 20_000, repeatable: false },
  { id: 'chopper', displayName: 'Chopper Gunner', cost: 8, tier: 'high', availability: 'selectable', carePackageBaseWeightUnits: 9, relationship: 'slot-3-or-4-alternative', activation: 'instant', durationMs: 30_000, repeatable: false },
  { id: 'drone-swarm', displayName: 'Drone Swarm', cost: 15, tier: 'top', availability: 'selectable', carePackageBaseWeightUnits: 1, relationship: 'nuke-slot-alternative', activation: 'instant', durationMs: 60_000, repeatable: false },
  { id: 'nuke', displayName: 'Nuke', cost: 15, tier: 'top', availability: 'selectable', carePackageBaseWeightUnits: 0, relationship: 'drone-swarm-slot-alternative-and-one-percent-care-reward', activation: 'instant', durationMs: 0, repeatable: false },
] as const satisfies readonly KillstreakCatalogSourceDefinition[]);

export type Pass65KillstreakId = typeof PASS65_KILLSTREAK_SOURCES[number]['id'];
export const PASS65_KILLSTREAK_CATALOG = createKillstreakCatalog(PASS65_KILLSTREAK_SOURCES);

export type KillstreakSlotDefinition = Readonly<{
  slot: 1 | 2 | 3 | 4 | 5;
  allowedIds: readonly Pass65KillstreakId[];
}>;

export const PASS65_KILLSTREAK_SLOT_DEFINITIONS: readonly KillstreakSlotDefinition[] = Object.freeze([
  Object.freeze({ slot: 1, allowedIds: Object.freeze(['scout-sweep', 'adrenaline', 'care-package'] as const) }),
  Object.freeze({ slot: 2, allowedIds: Object.freeze(['yardhawk', 'piloted-drone'] as const) }),
  Object.freeze({ slot: 3, allowedIds: Object.freeze(['tri-pass', 'carpet-bomber', 'hunter-swarm', 'chopper'] as const) }),
  Object.freeze({ slot: 4, allowedIds: Object.freeze(['tri-pass', 'carpet-bomber', 'hunter-swarm', 'chopper'] as const) }),
  Object.freeze({ slot: 5, allowedIds: Object.freeze(['nuke', 'drone-swarm'] as const) }),
]);

export type KillstreakLoadoutV1 = Readonly<{
  schemaVersion: 1;
  slots: readonly [Pass65KillstreakId, Pass65KillstreakId, Pass65KillstreakId, Pass65KillstreakId, Pass65KillstreakId];
}>;

export type KillstreakLoadoutValidation = Readonly<{
  valid: boolean;
  errors: readonly string[];
}>;

export function validateKillstreakLoadout(value: unknown): KillstreakLoadoutValidation {
  const errors: string[] = [];
  if (!isPlainObject(value)) return Object.freeze({ valid: false, errors: Object.freeze(['loadout must be an object']) });
  const actualKeys = Object.keys(value);
  for (const key of actualKeys) if (!['schemaVersion', 'slots'].includes(key)) errors.push(`loadout has unknown key ${key}`);
  for (const key of ['schemaVersion', 'slots']) if (!Object.hasOwn(value, key)) errors.push(`loadout is missing key ${key}`);
  if (value.schemaVersion !== 1) errors.push('loadout schemaVersion must equal 1');
  if (!Array.isArray(value.slots) || value.slots.length !== 5) {
    errors.push('loadout must contain exactly five ordered slots');
    return Object.freeze({ valid: false, errors: Object.freeze(errors) });
  }

  const slots = value.slots as unknown[];
  const ids = new Set<unknown>();
  for (const [index, id] of slots.entries()) {
    if (typeof id !== 'string') {
      errors.push(`slot ${index + 1} must contain a killstreak ID`);
      continue;
    }
    if (ids.has(id)) errors.push(`duplicate killstreak ${id}`);
    ids.add(id);
    const definition = PASS65_KILLSTREAK_CATALOG.definitions.find((entry) => entry.id === id);
    if (!definition) errors.push(`slot ${index + 1} contains unknown killstreak ${id}`);
    else if (definition.availability !== 'selectable') errors.push(`slot ${index + 1} contains non-selectable killstreak ${id}`);
    const slotDefinition = PASS65_KILLSTREAK_SLOT_DEFINITIONS[index];
    if (!slotDefinition.allowedIds.includes(id as Pass65KillstreakId)) {
      errors.push(`slot ${index + 1} does not allow ${id}`);
    }
  }
  if (slots[2] === slots[3]) errors.push('slots 3 and 4 must be distinct');
  if (slots.includes('nuke') && slots.includes('drone-swarm')) errors.push('nuke and drone-swarm are mutually exclusive slot-5 alternatives');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function parseKillstreakLoadout(value: unknown): KillstreakLoadoutV1 {
  const validation = validateKillstreakLoadout(value);
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  const source = value as { slots: Pass65KillstreakId[] };
  return Object.freeze({
    schemaVersion: 1,
    slots: Object.freeze([...source.slots]) as unknown as KillstreakLoadoutV1['slots'],
  });
}
