export type OperatorSkinAvailability = 'selectable' | 'retired';

export type OperatorSkinCatalogSourceDefinition<Id extends string = string> = Readonly<{
  id: Id;
  displayName: string;
  archetype: string;
  assetId: string;
  availability: OperatorSkinAvailability;
}>;

export type OperatorSkinDefinition<Id extends string = string> = OperatorSkinCatalogSourceDefinition<Id>;

export type OperatorSkinCatalog<Id extends string = string> = Readonly<{
  definitions: readonly OperatorSkinDefinition<Id>[];
}>;

const SOURCE_KEYS = Object.freeze([
  'id',
  'displayName',
  'archetype',
  'assetId',
  'availability',
] as const);

const AVAILABILITIES: readonly OperatorSkinAvailability[] = ['selectable', 'retired'];

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

function validateSourceDefinition(value: unknown, index: number): asserts value is OperatorSkinCatalogSourceDefinition {
  if (!isPlainObject(value)) throw new Error(`catalog[${index}] must be an object`);
  exactKeys(value, SOURCE_KEYS, `catalog[${index}]`);
  const label = typeof value.id === 'string' ? value.id : `catalog[${index}]`;
  if (typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value.id)) throw new Error(`${label} has invalid ID`);
  if (typeof value.displayName !== 'string' || value.displayName.trim().length === 0 || value.displayName.length > 80) {
    throw new Error(`${label} has invalid display name`);
  }
  if (typeof value.archetype !== 'string' || value.archetype.trim().length === 0 || value.archetype.length > 80) {
    throw new Error(`${label} has invalid archetype`);
  }
  if (typeof value.assetId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value.assetId)) {
    throw new Error(`${label} has invalid assetId`);
  }
  if (!AVAILABILITIES.includes(value.availability as OperatorSkinAvailability)) throw new Error(`${label} has invalid availability`);
}

function freezeSourceDefinitions<const Sources extends readonly OperatorSkinCatalogSourceDefinition[]>(sources: Sources): Sources {
  for (const source of sources) Object.freeze(source);
  Object.freeze(sources);
  return sources;
}

/**
 * Builds the immutable operator skin catalog from one authored definition list.
 * This is the SINGLE canonical source of selectable operator skins.
 * Adding, renaming, or retiring an entry necessarily reruns this projection;
 * callers cannot provide a second parallel eligibility list.
 */
export function createOperatorSkinCatalog<const Id extends string>(
  rawSources: readonly OperatorSkinCatalogSourceDefinition<Id>[],
): OperatorSkinCatalog<Id> {
  if (!Array.isArray(rawSources) || rawSources.length === 0) throw new Error('operator skin catalog must be a non-empty array');
  rawSources.forEach((source, index) => validateSourceDefinition(source, index));
  const sources = rawSources as readonly OperatorSkinCatalogSourceDefinition<Id>[];
  const ids = sources.map((source) => source.id);
  if (new Set(ids).size !== ids.length) throw new Error('operator skin catalog IDs must be unique');

  // default must always be present and selectable
  const defaultEntry = sources.find((source) => source.id === 'default');
  if (!defaultEntry) throw new Error('default operator skin is required');
  if (defaultEntry.availability !== 'selectable') throw new Error('default must be selectable');

  const definitions = Object.freeze(sources.map((source) => Object.freeze({ ...source }))) as readonly OperatorSkinDefinition<Id>[];

  return Object.freeze({
    definitions,
  });
}

export function validateOperatorSkinId(catalog: OperatorSkinCatalog, id: string): boolean {
  return catalog.definitions.some((def) => def.id === id && def.availability === 'selectable');
}

export function getOperatorSkinDefinition<Id extends string>(catalog: OperatorSkinCatalog<Id>, id: Id): OperatorSkinDefinition<Id> | undefined {
  return catalog.definitions.find((def) => def.id === id);
}

export const OPERATOR_SKIN_SOURCES = freezeSourceDefinitions([
  { id: 'default', displayName: 'Standard Operator', archetype: 'standard', assetId: 'pass65-third-person-operator-family-v1', availability: 'selectable' },
  { id: 'explorer', displayName: 'Sunspire Wayfarer', archetype: 'explorer', assetId: 'explorer-trailworn-canvas-v1', availability: 'selectable' },
  { id: 'symbiote', displayName: 'Carapace Bulwark', archetype: 'symbiote', assetId: 'symbiote-graftplate-composite-v1', availability: 'selectable' },
  { id: 'navalops', displayName: 'Tidewrack Operative', archetype: 'navalops', assetId: 'navalops-bluewater-lowprofile-v1', availability: 'selectable' },
] as const satisfies readonly OperatorSkinCatalogSourceDefinition[]);

export type Pass74OperatorSkinId = typeof OPERATOR_SKIN_SOURCES[number]['id'];

export const OPERATOR_SKIN_CATALOG = createOperatorSkinCatalog(OPERATOR_SKIN_SOURCES);