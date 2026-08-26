export type OperatorSkinAvailability = 'selectable' | 'retired';

/**
 * The skeleton-and-clips identity a skin GLB must share for clip retargeting
 * to be sound. Enforcement used to live only in the Blender pipeline; the
 * catalog now refuses any entry that diverges from the canonical rig, so a
 * mis-authored delivery fails at module load instead of silently breaking
 * animation at runtime.
 */
export type OperatorSkinRigContract = Readonly<{
  rigId: string;
  jointCount: number;
  animationClipCount: number;
}>;

export type OperatorSkinCatalogSourceDefinition<Id extends string = string> = Readonly<{
  id: Id;
  displayName: string;
  archetype: string;
  assetId: string;
  availability: OperatorSkinAvailability;
  rigContract: OperatorSkinRigContract;
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
  'rigContract',
] as const);

const RIG_CONTRACT_KEYS = Object.freeze(['rigId', 'jointCount', 'animationClipCount'] as const);

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
  if (!isPlainObject(value.rigContract)) throw new Error(`${label} has invalid rig contract`);
  const rig = value.rigContract;
  exactKeys(rig, RIG_CONTRACT_KEYS, `${label}.rigContract`);
  if (typeof rig.rigId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(rig.rigId)) throw new Error(`${label} has invalid rig id`);
  if (!Number.isSafeInteger(rig.jointCount) || Number(rig.jointCount) < 1 || Number(rig.jointCount) > 500) throw new Error(`${label} has invalid rig joint count`);
  if (!Number.isSafeInteger(rig.animationClipCount) || Number(rig.animationClipCount) < 1 || Number(rig.animationClipCount) > 500) throw new Error(`${label} has invalid rig clip count`);
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

  // One rig family for the whole catalog: every skin must share the default's
  // skeleton and clip identity, or its animations cannot retarget.
  const canonicalRig = defaultEntry.rigContract;
  for (const source of sources) {
    if (source.rigContract.rigId !== canonicalRig.rigId
      || source.rigContract.jointCount !== canonicalRig.jointCount
      || source.rigContract.animationClipCount !== canonicalRig.animationClipCount) {
      throw new Error(`${source.id} rig contract diverges from the canonical rig; clips cannot retarget`);
    }
  }

  const definitions = Object.freeze(sources.map((source) => Object.freeze({
    ...source,
    rigContract: Object.freeze({ ...source.rigContract }),
  }))) as readonly OperatorSkinDefinition<Id>[];

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

/**
 * Wire-safe membership check for the canonical catalog: exactly the currently
 * SELECTABLE ids. Retired ids fail here, so a stale client cannot force a
 * retired skin back onto other peers' screens.
 */
export function isSelectableOperatorSkinId(value: unknown): value is Pass74OperatorSkinId {
  return typeof value === 'string' && validateOperatorSkinId(OPERATOR_SKIN_CATALOG, value);
}

export const OPERATOR_SKIN_SOURCES = freezeSourceDefinitions([
  { id: 'default', displayName: 'Standard Operator', archetype: 'standard', assetId: 'pass65-third-person-operator-family-v1', availability: 'selectable', rigContract: { rigId: 'pass65-third-person-operator-family-v1', jointCount: 62, animationClipCount: 24 } },
  { id: 'explorer', displayName: 'Sunspire Wayfarer', archetype: 'explorer', assetId: 'explorer-trailworn-canvas-v1', availability: 'selectable', rigContract: { rigId: 'pass65-third-person-operator-family-v1', jointCount: 62, animationClipCount: 24 } },
  { id: 'symbiote', displayName: 'Carapace Bulwark', archetype: 'symbiote', assetId: 'symbiote-graftplate-composite-v1', availability: 'selectable', rigContract: { rigId: 'pass65-third-person-operator-family-v1', jointCount: 62, animationClipCount: 24 } },
  { id: 'navalops', displayName: 'Tidewrack Operative', archetype: 'navalops', assetId: 'navalops-bluewater-lowprofile-v1', availability: 'selectable', rigContract: { rigId: 'pass65-third-person-operator-family-v1', jointCount: 62, animationClipCount: 24 } },
] as const satisfies readonly OperatorSkinCatalogSourceDefinition[]);

export type Pass74OperatorSkinId = typeof OPERATOR_SKIN_SOURCES[number]['id'];

export const OPERATOR_SKIN_CATALOG = createOperatorSkinCatalog(OPERATOR_SKIN_SOURCES);

/**
 * HF-366 (2026-08-23 HITL): "i picked a skin but they all looked greyed out i
 * have no idea what i look like ... and the arms should look diff too?"
 *
 * The skin GLBs each carry their own Swat / Swat_Black / Visor / Skin PBR set,
 * but those atlases are UV-mapped for the FULL BODY. The first-person arms are
 * one shared delivery with its own arm-only atlas, so sampling a body atlas
 * through arm UVs would land on the wrong regions. The palette below is
 * therefore the arms' (and the menu's) view of each skin's material set: a
 * per-role multiply tint plus the surface response that actually distinguishes
 * canvas from chitin from wet neoprene. Tints are authored light on purpose -
 * they MULTIPLY the authored arm base-colour map, so the licensed albedo,
 * normal and ORM detail stays the dominant signal and only the hue changes.
 *
 * The `card` half is the same identity expressed as 2D menu art. One palette
 * drives both, so the portrait a player picks in the menu is the colour their
 * own arms take in first person - which is the whole of what the owner asked
 * for.
 */
export type OperatorSkinArmPalette = Readonly<{
  /** Multiply tints for the four authored first-person arm material roles. */
  sleeve: number;
  glove: number;
  fingerGlove: number;
  accent: number;
  sleeveRoughness: number;
  gloveRoughness: number;
  accentMetalness: number;
  /** Low, bounded accent glow so the wrist band reads in dark arenas. */
  accentEmissive: number;
}>;

export type OperatorSkinCardPalette = Readonly<{
  backdropTop: number;
  backdropBottom: number;
  torso: number;
  webbing: number;
  trim: number;
  visor: number;
  skin: number;
  ink: number;
  /** One-word material read shown on the card, e.g. CANVAS or CHITIN. */
  materialLabel: string;
}>;

/**
 * HF-366 (second pass, 2026-08-23): the THIRD-PERSON half, which the first
 * attempt never had.
 *
 * Measured from the running build before this row: every skin GLB is authored
 * on the canonical family, so all four carry the SAME material names - `Swat`,
 * `Swat_Black`, `Visor`, `Skin`. `materialForTeam` matched on those names and
 * stamped one hard team colour over every one of them, so the four skins came
 * out of the material resolver byte-identical:
 *
 *     default / explorer / symbiote / navalops
 *     Swat        #2d7882   #2d7882   #2d7882   #2d7882
 *     Swat_Black  #1d292d   #1d292d   #1d292d   #1d292d
 *
 * The skin GLB loaded, the right file was fetched, and then its identity was
 * painted out one function later. That is literally "they all looked greyed
 * out": there was nothing left to look at.
 *
 * This palette is the body's own colour. The team is applied on top as a
 * BOUNDED wash (see OPERATOR_TEAM_IDENTITY_BLEND) rather than a replacement,
 * so aqua still reads as aqua at range while the skin still reads as itself.
 */
export type OperatorSkinBodyPalette = Readonly<{
  /** Main garment - the largest area on screen and the skin's primary read. */
  swat: number;
  /** Under-suit, webbing and boots. */
  swatBlack: number;
  /** Belts and hard trim where the source uses a grey material. */
  grey: number;
  /** Visor/lens tint; kept bright so the head reads at range. */
  visor: number;
  swatRoughness: number;
  swatBlackRoughness: number;
  /**
   * Flat, palette-hued fill added on top of the authored albedo, sized to how
   * dark that skin's own atlas actually is. Measured from the shipped PNGs on
   * 2026-08-23 (mean RGB over the whole 512x512 Swat base-colour map):
   *
   *   default  (135,159,173)   explorer (94,85,65)
   *   symbiote (40,44,48)      navalops (38,45,52)
   *
   * A multiply tint cannot lift a 40/255 garment - white is the brightest
   * multiplier there is, and 40 x 1.0 is still 40 - so symbiote and navalops
   * could never have read as anything but dark grey, whatever colour the menu
   * card promised. The lift closes that gap without discarding the authored
   * albedo, normal and roughness detail the way dropping the map would.
   */
  lift: number;
}>;

export type OperatorSkinPalette = Readonly<{
  id: string;
  arm: OperatorSkinArmPalette;
  body: OperatorSkinBodyPalette;
  card: OperatorSkinCardPalette;
}>;

/**
 * Team colours, and how much of one is washed over the body palette.
 *
 * 0.34 was chosen against the falsifier in operator-skin-appearance.test.ts:
 * it is high enough that the same skin on the two teams stays separable, and
 * low enough that four skins on the SAME team stay separable from each other.
 * Both halves are asserted; neither may be traded for the other.
 */
export const OPERATOR_TEAM_TINTS: Readonly<Record<0 | 1, number>> = Object.freeze({ 0: 0x2d7882, 1: 0xb34d3f });
export const OPERATOR_TEAM_IDENTITY_BLEND = 0.34;
/** The under-suit carries a heavier team wash: it is dark either way, so it
 * costs the skin little and buys the team read back at distance. */
export const OPERATOR_TEAM_UNDERSUIT_BLEND = 0.46;

const PALETTES: Readonly<Record<Pass74OperatorSkinId, OperatorSkinPalette>> = Object.freeze({
  default: Object.freeze({
    id: 'default',
    arm: Object.freeze({
      sleeve: 0x9fc6cc, glove: 0x8fa3a9, fingerGlove: 0x9aaeb4, accent: 0x7fe6ee,
      sleeveRoughness: 0.86, gloveRoughness: 0.72, accentMetalness: 0.22, accentEmissive: 0x0d3a3f,
    }),
    body: Object.freeze({
      swat: 0x74b3bc, swatBlack: 0x33474d, grey: 0x8fb6ba, visor: 0x5fe0ea,
      swatRoughness: 0.78, swatBlackRoughness: 0.86, lift: 0.06,
    }),
    card: Object.freeze({
      backdropTop: 0x1d3a40, backdropBottom: 0x0c1e23, torso: 0x2f5a60, webbing: 0x16282d,
      trim: 0x12a7b1, visor: 0x3fd3dd, skin: 0xc59a76, ink: 0xdff3f4, materialLabel: 'ISSUE WEAVE',
    }),
  }),
  explorer: Object.freeze({
    id: 'explorer',
    arm: Object.freeze({
      sleeve: 0xe8c48f, glove: 0xc79a6b, fingerGlove: 0xd2a97c, accent: 0xffc46a,
      sleeveRoughness: 0.95, gloveRoughness: 0.8, accentMetalness: 0.06, accentEmissive: 0x3a2408,
    }),
    body: Object.freeze({
      swat: 0xd7ad6d, swatBlack: 0x6d4a26, grey: 0xc9a878, visor: 0xffd48a,
      swatRoughness: 0.94, swatBlackRoughness: 0.96, lift: 0.11,
    }),
    card: Object.freeze({
      backdropTop: 0x3d2f1c, backdropBottom: 0x17110a, torso: 0xb08a52, webbing: 0x55381f,
      trim: 0xf0a63c, visor: 0xffd48a, skin: 0xc08a5e, ink: 0xfaeed8, materialLabel: 'CANVAS',
    }),
  }),
  symbiote: Object.freeze({
    id: 'symbiote',
    arm: Object.freeze({
      sleeve: 0xbda9cc, glove: 0x9d8fae, fingerGlove: 0xa897b8, accent: 0xcf9bff,
      sleeveRoughness: 0.62, gloveRoughness: 0.48, accentMetalness: 0.34, accentEmissive: 0x2c123f,
    }),
    body: Object.freeze({
      swat: 0xa678d6, swatBlack: 0x4a3560, grey: 0xbf9ae0, visor: 0xd2a6ff,
      swatRoughness: 0.52, swatBlackRoughness: 0.6, lift: 0.2,
    }),
    card: Object.freeze({
      backdropTop: 0x2c1c3b, backdropBottom: 0x110a17, torso: 0x5a4f63, webbing: 0x241d2c,
      trim: 0x9d5ce0, visor: 0xd2a6ff, skin: 0xb08f7e, ink: 0xf0e2ff, materialLabel: 'CHITIN',
    }),
  }),
  navalops: Object.freeze({
    id: 'navalops',
    arm: Object.freeze({
      sleeve: 0x93b6d8, glove: 0x8496a8, fingerGlove: 0x8ea3b5, accent: 0x8fc8f5,
      sleeveRoughness: 0.74, gloveRoughness: 0.58, accentMetalness: 0.28, accentEmissive: 0x0d2740,
    }),
    body: Object.freeze({
      swat: 0x5c93c8, swatBlack: 0x24384b, grey: 0x7fb0d4, visor: 0x9fd4ff,
      swatRoughness: 0.62, swatBlackRoughness: 0.7, lift: 0.19,
    }),
    card: Object.freeze({
      backdropTop: 0x16293c, backdropBottom: 0x070d14, torso: 0x24405e, webbing: 0x10171f,
      trim: 0x4f9bd8, visor: 0x9fd4ff, skin: 0xb98d6c, ink: 0xdcecfa, materialLabel: 'WET SHELL',
    }),
  }),
});

// A skin with no palette would silently fall back to the standard operator and
// reproduce exactly the "they all looked greyed out" failure this row exists to
// fix, so an unpainted selectable skin is a load-time error, not a runtime
// surprise.
for (const definition of OPERATOR_SKIN_CATALOG.definitions) {
  if (definition.availability !== 'selectable') continue;
  if (!Object.hasOwn(PALETTES, definition.id)) {
    throw new Error(`selectable operator skin ${definition.id} has no palette; the menu and first-person arms cannot show it`);
  }
}

export const OPERATOR_SKIN_PALETTES = PALETTES;

/** Unknown/retired ids resolve to the standard operator rather than throwing:
 * a stale peer selection must never leave a player with untinted arms. */
export function operatorSkinPalette(id: string): OperatorSkinPalette {
  return PALETTES[id as Pass74OperatorSkinId] ?? PALETTES.default;
}

/**
 * HF-366: the player's own operator-skin choice, as a value the PRESENTATION
 * layer can read.
 *
 * Why this lives here. The lobby owns the authoritative selection and writes it
 * to this key; the first-person viewmodel needs to know it so the arms can wear
 * it. Before this row `WeaponPresentation.setOperatorSkin()` existed, was fully
 * tested, and had ZERO callers anywhere in `src` - so the arms were pinned to
 * 'default' for every player, in every match, no matter which card they pressed.
 * That is why "the arms should look diff too?" was still true after the last
 * attempt: the paint function was fine and nothing ever called it.
 *
 * This is a READER, never a second writer: the lobby remains the only thing
 * that stores a selection or puts one on the wire.
 */
export const LOCAL_OPERATOR_SKIN_STORAGE_KEY = 'atomic-acres-operator-skin';

export function readLocalOperatorSkinId(storage?: Pick<Storage, 'getItem'> | null): string {
  const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
  if (!store) return 'default';
  try {
    const stored = store.getItem(LOCAL_OPERATOR_SKIN_STORAGE_KEY);
    return stored !== null && isSelectableOperatorSkinId(stored) ? stored : 'default';
  } catch {
    return 'default';
  }
}

/**
 * Calls back with the selected skin id whenever it changes, and once up front.
 *
 * A same-document `localStorage.setItem` does NOT raise a `storage` event -
 * that fires only in OTHER tabs - so listening for `storage` alone would have
 * been another silently-dead path. The skin cards are the one place a player
 * can change this, so their click is the signal; `storage` is kept as well for
 * a change made in a second tab.
 */
export function observeLocalOperatorSkinId(
  onChange: (skinId: string) => void,
  target: (Pick<EventTarget, 'addEventListener' | 'removeEventListener'>) | null =
    typeof document === 'undefined' ? null : document,
): () => void {
  let current = readLocalOperatorSkinId();
  onChange(current);
  // A viewmodel must never fail to build because a cosmetic subscription could
  // not attach. Harnesses and headless runtimes stub `document` as a bare
  // object, and the arms are far more important than the listener.
  if (!target || typeof target.addEventListener !== 'function'
    || typeof target.removeEventListener !== 'function') return () => undefined;
  const publish = (next: string): void => {
    if (next === current) return;
    current = next;
    onChange(next);
  };
  const onClick = (event: Event): void => {
    const node = (event.target as Element | null)?.closest?.('[data-operator-skin]');
    const chosen = (node as HTMLElement | null)?.dataset?.operatorSkin;
    if (chosen !== undefined && isSelectableOperatorSkinId(chosen)) publish(chosen);
  };
  const onStorage = (event: Event): void => {
    if ((event as StorageEvent).key !== LOCAL_OPERATOR_SKIN_STORAGE_KEY) return;
    publish(readLocalOperatorSkinId());
  };
  target.addEventListener('click', onClick);
  const windowTarget = typeof window === 'undefined' || typeof window.addEventListener !== 'function'
    ? null
    : window;
  windowTarget?.addEventListener('storage', onStorage);
  return () => {
    target.removeEventListener('click', onClick);
    windowTarget?.removeEventListener('storage', onStorage);
  };
}

/**
 * The team's own colour blended over a skin's body colour. Exported so the test
 * can assert BOTH halves of the compromise on real numbers: four skins on one
 * team must stay separable from each other, and one skin on the two teams must
 * stay separable from itself.
 */
export function operatorBodyColour(skinId: string, team: 0 | 1, role: 'swat' | 'swatBlack' | 'grey'): number {
  const body = operatorSkinPalette(skinId).body;
  const blend = role === 'swatBlack' ? OPERATOR_TEAM_UNDERSUIT_BLEND : OPERATOR_TEAM_IDENTITY_BLEND;
  const skin = body[role];
  const teamTint = OPERATOR_TEAM_TINTS[team];
  const mix = (shift: number): number => {
    const a = (skin >> shift) & 0xff;
    const b = (teamTint >> shift) & 0xff;
    return Math.round(a + (b - a) * blend) & 0xff;
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
