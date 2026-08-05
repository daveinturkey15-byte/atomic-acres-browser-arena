export const GRENADE_AVAILABILITIES = Object.freeze(['shipped', 'retired'] as const);
export const GRENADE_RUNTIME_KINDS = Object.freeze([
  'timed-explosive',
  'smoke-volume',
  'impact-flash',
  'sticky-explosive',
] as const);

export type GrenadeAvailability = (typeof GRENADE_AVAILABILITIES)[number];
export type GrenadeRuntimeKind = (typeof GRENADE_RUNTIME_KINDS)[number];

export type GrenadeCatalogDefinition = Readonly<{
  id: string;
  displayName: string;
  availability: GrenadeAvailability;
  runtimeKind: GrenadeRuntimeKind;
}>;

/**
 * The one shipped grenade-family registry. Protocol, loadout UI and bots all
 * project from this catalog so a content change cannot silently update only
 * one of those consumers.
 */
export const GRENADE_CATALOG = Object.freeze([
  Object.freeze({ id: 'frag', displayName: 'Frag', availability: 'shipped', runtimeKind: 'timed-explosive' }),
  Object.freeze({ id: 'smoke', displayName: 'Smoke', availability: 'shipped', runtimeKind: 'smoke-volume' }),
  Object.freeze({ id: 'flash', displayName: 'Flashbang', availability: 'shipped', runtimeKind: 'impact-flash' }),
  Object.freeze({ id: 'semtex', displayName: 'Semtex', availability: 'shipped', runtimeKind: 'sticky-explosive' }),
] as const satisfies readonly GrenadeCatalogDefinition[]);

export type GrenadeId = (typeof GRENADE_CATALOG)[number]['id'];

export const GRENADE_IDS: readonly GrenadeId[] = Object.freeze(
  GRENADE_CATALOG
    .filter((definition) => definition.availability === 'shipped')
    .map((definition) => definition.id),
);

const GRENADE_ID_SET = new Set<string>(GRENADE_IDS);

export function isGrenadeId(value: unknown): value is GrenadeId {
  return typeof value === 'string' && GRENADE_ID_SET.has(value);
}
