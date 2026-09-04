/**
 * PASS 94 / HF-422 follow-up — the procedural OPERATOR LOOK registry.
 *
 * What this replaces, measured at HEAD rather than guessed
 * (`src/operator-model.ts` `skinPaintedBodyMaterial`, and its own comment):
 * every third-person operator garment is painted by one `color.setHex()` over
 * the skin GLB's authored base-colour atlas, plus an `emissive` fill of the
 * SAME hue at `body.lift` intensity. `THREE.Color` multiplies that atlas, and
 * two of the four shipped skin atlases have a mean around 40/255, so no
 * multiply - "not even white" - can make them read as a colour. The emissive
 * fill exists purely to do the part multiply cannot, and it does it by adding
 * unlit flat light, which is why operators read as a single matte silhouette:
 * one hue, no pattern, no cloth, no equipment separation.
 *
 * So a "skin" today is one flat colour per material name. This module is the
 * authored half of the replacement: a frozen registry of LOOKS, each of which
 * is a full procedural material description - garment palette, camouflage
 * field, cloth weave, webbing and hard-armour separation, and wear - that
 * `operator-skin-tsl-materials.ts` compiles into a shared TSL node graph.
 *
 * Nothing here imports THREE. Every number is data, every rule is checked at
 * module load by `createOperatorLookRegistry`, and two properties the owner
 * actually cares about are mechanically enforced rather than claimed:
 *
 *   1. TEAM SEPARATION - a look on team 0 must stay perceptually distinct from
 *      every look on team 1, so friend/foe stays readable at range. That is the
 *      one thing the flat team wash did well and a pattern must not lose.
 *   2. WITHIN-TEAM DISTINCTNESS - two looks on the SAME team must differ by
 *      more than a hue nudge, so "two distinct looks per team" is a test, not a
 *      sentence in a report.
 */

export type OperatorLookTeam = 0 | 1;

/** The three garment material roles the authored operator GLBs actually carry. */
export type OperatorLookRole = 'garment' | 'garmentDark' | 'webbing';

export type OperatorCamoKind = 'blotch' | 'digital' | 'stripe';

export type OperatorLookPalette = Readonly<{
  /** Dominant garment colour. This is real albedo, not a multiply tint. */
  garmentBase: number;
  /** Deeper shade the camouflage field mixes toward. */
  garmentShade: number;
  /** Primary camouflage blob colour. */
  camoBlotch: number;
  /** Secondary, smaller-scale camouflage colour. */
  camoAccent: number;
  /** Load-bearing webbing, pouches, straps. */
  webbing: number;
  /** Plate carrier / hard armour. */
  hardArmour: number;
  /** Faction trim: the readable team stripe on shoulder and helmet band. */
  trim: number;
}>;

export type OperatorCamoProfile = Readonly<{
  kind: OperatorCamoKind;
  /** Blob size in METRES of body space, so the pattern does not swim with UVs. */
  primaryScaleM: number;
  /** Secondary field scale in metres; must be smaller than the primary. */
  secondaryScaleM: number;
  /** 0 = no pattern, 1 = hard-edged two-tone. */
  contrast: number;
  /** Fraction of the garment the blotch colour covers, 0..1. */
  coverage: number;
}>;

export type OperatorClothProfile = Readonly<{
  /** Weave repeat in metres. Fabric is ~1-3 mm; webbing is coarser. */
  weaveScaleM: number;
  /** Peak-to-peak albedo modulation from the weave, 0..0.35. */
  weaveDepth: number;
  roughness: number;
  metalness: number;
}>;

export type OperatorWearProfile = Readonly<{
  /** How much upward-facing cloth is bleached by sun and abrasion, 0..1. */
  edgeWear: number;
  /** How much grime darkens the garment toward the boots, 0..1. */
  grime: number;
  /** Height in metres above the feet at which grime has fully faded out. */
  grimeHeightM: number;
}>;

export type OperatorLookDefinition = Readonly<{
  id: string;
  displayName: string;
  team: OperatorLookTeam;
  palette: OperatorLookPalette;
  camo: OperatorCamoProfile;
  cloth: OperatorClothProfile;
  wear: OperatorWearProfile;
}>;

export type OperatorLookRegistry = Readonly<{
  looks: readonly OperatorLookDefinition[];
}>;

const PALETTE_KEYS = Object.freeze([
  'garmentBase', 'garmentShade', 'camoBlotch', 'camoAccent', 'webbing', 'hardArmour', 'trim',
] as const);

/**
 * Minimum redmean distance between the SIGNATURE colour of a team-0 look and a
 * team-1 look. 0..~765. 90 is roughly "obviously a different colour under
 * arena lighting at 40 m"; the shipped aqua/coral wash sits far above it and
 * must stay there.
 */
export const OPERATOR_LOOK_TEAM_SEPARATION_MIN = 90;

/**
 * Minimum distance between two looks on the SAME team. Lower than the team
 * bar - teammates should read as one faction - but high enough that "two
 * distinct looks" cannot be satisfied by a 5 % hue nudge.
 */
export const OPERATOR_LOOK_WITHIN_TEAM_MIN = 42;

/** Looks required per team. The owner asked for "at least two distinct looks per team". */
export const OPERATOR_LOOKS_PER_TEAM_MIN = 2;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertHexColour(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 0xffffff) {
    throw new Error(`${label} must be a 24-bit hex colour`);
  }
}

function assertRange(value: unknown, label: string, min: number, max: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a finite number in [${min}, ${max}]`);
  }
}

/** sRGB byte channels of a packed hex colour. */
export function unpackHex(hex: number): Readonly<{ r: number; g: number; b: number }> {
  return Object.freeze({ r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff });
}

/**
 * "Redmean" colour distance. A cheap, widely used low-cost approximation of
 * perceptual difference that behaves far better than plain RGB Euclid at the
 * dark end - which is exactly the end the operator garments live at. Range is
 * 0 .. ~765.
 */
export function perceptualColourDistance(a: number, b: number): number {
  const ca = unpackHex(a);
  const cb = unpackHex(b);
  const rMean = (ca.r + cb.r) / 2;
  const dr = ca.r - cb.r;
  const dg = ca.g - cb.g;
  const db = ca.b - cb.b;
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr
    + 4 * dg * dg
    + (2 + (255 - rMean) / 256) * db * db,
  );
}

/**
 * The colour an observer actually reads at range: the garment mixed with its
 * camouflage at the authored coverage, then pulled toward the faction trim by
 * the fraction of the silhouette trim occupies. Distinctness is judged on THIS
 * rather than on `garmentBase`, because two looks can share a base and still be
 * unmistakable, and two looks can differ in base and still read the same.
 */
export function lookSignatureColour(look: OperatorLookDefinition): number {
  const base = unpackHex(look.palette.garmentBase);
  const blotch = unpackHex(look.palette.camoBlotch);
  const trim = unpackHex(look.palette.trim);
  const c = look.camo.coverage;
  const TRIM_SILHOUETTE_SHARE = 0.14;
  const mix = (x: number, y: number, t: number): number => x + (y - x) * t;
  const r = mix(mix(base.r, blotch.r, c), trim.r, TRIM_SILHOUETTE_SHARE);
  const g = mix(mix(base.g, blotch.g, c), trim.g, TRIM_SILHOUETTE_SHARE);
  const b = mix(mix(base.b, blotch.b, c), trim.b, TRIM_SILHOUETTE_SHARE);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function validateLook(value: unknown, index: number): asserts value is OperatorLookDefinition {
  if (!isPlainObject(value)) throw new Error(`look[${index}] must be an object`);
  const label = typeof value.id === 'string' ? value.id : `look[${index}]`;
  if (typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(value.id)) {
    throw new Error(`${label} has an invalid id`);
  }
  if (typeof value.displayName !== 'string' || value.displayName.trim().length === 0 || value.displayName.length > 60) {
    throw new Error(`${label} has an invalid display name`);
  }
  if (value.team !== 0 && value.team !== 1) throw new Error(`${label} has an invalid team`);

  if (!isPlainObject(value.palette)) throw new Error(`${label} has an invalid palette`);
  const paletteKeys = Object.keys(value.palette);
  if (paletteKeys.length !== PALETTE_KEYS.length || PALETTE_KEYS.some((k) => !Object.hasOwn(value.palette as object, k))) {
    throw new Error(`${label} palette keys invalid`);
  }
  for (const key of PALETTE_KEYS) assertHexColour((value.palette as Record<string, unknown>)[key], `${label}.palette.${key}`);

  if (!isPlainObject(value.camo)) throw new Error(`${label} has an invalid camo profile`);
  const camo = value.camo;
  if (camo.kind !== 'blotch' && camo.kind !== 'digital' && camo.kind !== 'stripe') {
    throw new Error(`${label} has an invalid camo kind`);
  }
  assertRange(camo.primaryScaleM, `${label}.camo.primaryScaleM`, 0.04, 1.2);
  assertRange(camo.secondaryScaleM, `${label}.camo.secondaryScaleM`, 0.01, 1.2);
  if ((camo.secondaryScaleM as number) >= (camo.primaryScaleM as number)) {
    throw new Error(`${label} secondary camo scale must be finer than the primary`);
  }
  assertRange(camo.contrast, `${label}.camo.contrast`, 0, 1);
  assertRange(camo.coverage, `${label}.camo.coverage`, 0, 1);

  if (!isPlainObject(value.cloth)) throw new Error(`${label} has an invalid cloth profile`);
  assertRange(value.cloth.weaveScaleM, `${label}.cloth.weaveScaleM`, 0.0005, 0.05);
  assertRange(value.cloth.weaveDepth, `${label}.cloth.weaveDepth`, 0, 0.35);
  assertRange(value.cloth.roughness, `${label}.cloth.roughness`, 0.05, 1);
  assertRange(value.cloth.metalness, `${label}.cloth.metalness`, 0, 0.6);

  if (!isPlainObject(value.wear)) throw new Error(`${label} has an invalid wear profile`);
  assertRange(value.wear.edgeWear, `${label}.wear.edgeWear`, 0, 1);
  assertRange(value.wear.grime, `${label}.wear.grime`, 0, 1);
  assertRange(value.wear.grimeHeightM, `${label}.wear.grimeHeightM`, 0.05, 1.8);
}

/**
 * Builds the immutable look registry from one authored list, refusing anything
 * that would silently degrade readability. This is the single source of
 * procedural operator appearance; callers cannot maintain a second list.
 */
export function createOperatorLookRegistry(
  rawLooks: readonly OperatorLookDefinition[],
): OperatorLookRegistry {
  if (!Array.isArray(rawLooks) || rawLooks.length === 0) throw new Error('operator look registry must be a non-empty array');
  rawLooks.forEach((look, index) => validateLook(look, index));

  const ids = rawLooks.map((look) => look.id);
  if (new Set(ids).size !== ids.length) throw new Error('operator look ids must be unique');

  for (const team of [0, 1] as const) {
    const teamLooks = rawLooks.filter((look) => look.team === team);
    if (teamLooks.length < OPERATOR_LOOKS_PER_TEAM_MIN) {
      throw new Error(`team ${team} needs at least ${OPERATOR_LOOKS_PER_TEAM_MIN} looks; found ${teamLooks.length}`);
    }
    for (let i = 0; i < teamLooks.length; i += 1) {
      for (let j = i + 1; j < teamLooks.length; j += 1) {
        const distance = perceptualColourDistance(
          lookSignatureColour(teamLooks[i]!),
          lookSignatureColour(teamLooks[j]!),
        );
        if (distance < OPERATOR_LOOK_WITHIN_TEAM_MIN) {
          throw new Error(
            `${teamLooks[i]!.id} and ${teamLooks[j]!.id} are not distinct enough (${distance.toFixed(1)} < ${OPERATOR_LOOK_WITHIN_TEAM_MIN})`,
          );
        }
      }
    }
  }

  const team0 = rawLooks.filter((look) => look.team === 0);
  const team1 = rawLooks.filter((look) => look.team === 1);
  for (const a of team0) {
    for (const b of team1) {
      const distance = perceptualColourDistance(lookSignatureColour(a), lookSignatureColour(b));
      if (distance < OPERATOR_LOOK_TEAM_SEPARATION_MIN) {
        throw new Error(
          `${a.id} and ${b.id} are on opposite teams but read alike (${distance.toFixed(1)} < ${OPERATOR_LOOK_TEAM_SEPARATION_MIN})`,
        );
      }
    }
  }

  const looks = Object.freeze(rawLooks.map((look) => Object.freeze({
    ...look,
    palette: Object.freeze({ ...look.palette }),
    camo: Object.freeze({ ...look.camo }),
    cloth: Object.freeze({ ...look.cloth }),
    wear: Object.freeze({ ...look.wear }),
  }))) as readonly OperatorLookDefinition[];

  return Object.freeze({ looks });
}

/**
 * The authored looks. Two per team, deliberately: each look is one shared TSL
 * node graph per garment role, and the WebGPU backend compiles one pipeline per
 * distinct graph (see `farcrysis-tsl-foliage.ts` HF-374, where 86 unique graphs
 * stopped an arena booting). Four looks x three garment roles is twelve graphs
 * for every operator in the game, built once and shared.
 *
 * Team 0 keeps the shipped aqua identity, team 1 the coral one; the camouflage
 * is what changes, not the faction read.
 */
export const OPERATOR_LOOK_SOURCES: readonly OperatorLookDefinition[] = Object.freeze([
  {
    id: 'vanguard-woodland',
    displayName: 'Vanguard Woodland',
    team: 0,
    palette: {
      garmentBase: 0x3f6f63,
      garmentShade: 0x24413b,
      camoBlotch: 0x223a33,
      camoAccent: 0x6fae9c,
      webbing: 0x2b3a37,
      hardArmour: 0x2f423d,
      trim: 0x35d7c8,
    },
    camo: { kind: 'blotch', primaryScaleM: 0.34, secondaryScaleM: 0.11, contrast: 0.72, coverage: 0.44 },
    cloth: { weaveScaleM: 0.0035, weaveDepth: 0.13, roughness: 0.84, metalness: 0.03 },
    wear: { edgeWear: 0.32, grime: 0.4, grimeHeightM: 0.62 },
  },
  {
    id: 'vanguard-urban',
    displayName: 'Vanguard Urban',
    team: 0,
    palette: {
      garmentBase: 0x8fa7ab,
      garmentShade: 0x53696e,
      camoBlotch: 0x39494e,
      camoAccent: 0xc4d6d8,
      webbing: 0x3d4a4d,
      hardArmour: 0x39474b,
      trim: 0x35d7c8,
    },
    camo: { kind: 'digital', primaryScaleM: 0.19, secondaryScaleM: 0.055, contrast: 0.88, coverage: 0.5 },
    cloth: { weaveScaleM: 0.0026, weaveDepth: 0.09, roughness: 0.72, metalness: 0.05 },
    wear: { edgeWear: 0.22, grime: 0.3, grimeHeightM: 0.5 },
  },
  {
    id: 'marauder-arid',
    displayName: 'Marauder Arid',
    team: 1,
    palette: {
      garmentBase: 0xb9834f,
      garmentShade: 0x7a5230,
      camoBlotch: 0x8a5a34,
      camoAccent: 0xe4c08a,
      webbing: 0x5c4028,
      hardArmour: 0x4a3728,
      trim: 0xff6b4a,
    },
    camo: { kind: 'blotch', primaryScaleM: 0.4, secondaryScaleM: 0.13, contrast: 0.6, coverage: 0.46 },
    cloth: { weaveScaleM: 0.0038, weaveDepth: 0.15, roughness: 0.88, metalness: 0.02 },
    wear: { edgeWear: 0.44, grime: 0.52, grimeHeightM: 0.72 },
  },
  {
    id: 'marauder-nightfall',
    displayName: 'Marauder Nightfall',
    team: 1,
    palette: {
      // Desaturated after looking at the first capture: the authored pinks read
      // as confectionery on a soldier, and a night look has no business being
      // the brightest garment on the sheet.
      garmentBase: 0x5c3740,
      garmentShade: 0x331d24,
      camoBlotch: 0x241419,
      camoAccent: 0x8a5a66,
      webbing: 0x2f1c22,
      hardArmour: 0x241a1d,
      trim: 0xff6b4a,
    },
    camo: { kind: 'stripe', primaryScaleM: 0.31, secondaryScaleM: 0.075, contrast: 0.66, coverage: 0.4 },
    cloth: { weaveScaleM: 0.0022, weaveDepth: 0.1, roughness: 0.66, metalness: 0.08 },
    wear: { edgeWear: 0.26, grime: 0.36, grimeHeightM: 0.55 },
  },
]);

export const OPERATOR_LOOK_REGISTRY = createOperatorLookRegistry(OPERATOR_LOOK_SOURCES);

export function getOperatorLook(id: string): OperatorLookDefinition | undefined {
  return OPERATOR_LOOK_REGISTRY.looks.find((look) => look.id === id);
}

export function operatorLooksForTeam(team: OperatorLookTeam): readonly OperatorLookDefinition[] {
  return OPERATOR_LOOK_REGISTRY.looks.filter((look) => look.team === team);
}

/**
 * Which authored skin wears which of its team's looks. Explicit rather than
 * hashed so a skin's identity is stable across releases and reviewable in one
 * table: canvas-and-webbing skins take the field look, low-profile technical
 * skins take the harder-edged one.
 */
const SKIN_LOOK_VARIANT: Readonly<Record<string, 0 | 1>> = Object.freeze({
  default: 0,
  explorer: 0,
  symbiote: 1,
  navalops: 1,
});

/**
 * Resolves (skin, team) to exactly one authored look. Unknown skin ids fall to
 * variant 0 rather than throwing: an operator with an unrecognised skin must
 * still be painted, and a hard failure here would be a black character.
 */
export function resolveOperatorLook(skinId: string, team: OperatorLookTeam): OperatorLookDefinition {
  const teamLooks = operatorLooksForTeam(team);
  const variant = SKIN_LOOK_VARIANT[skinId] ?? 0;
  return teamLooks[Math.min(variant, teamLooks.length - 1)]!;
}

/** Every (skin, team) pair the runtime can ask for, for prewarm and tests. */
export function allResolvableOperatorLookIds(skinIds: readonly string[]): readonly string[] {
  const ids = new Set<string>();
  for (const skinId of skinIds) {
    ids.add(resolveOperatorLook(skinId, 0).id);
    ids.add(resolveOperatorLook(skinId, 1).id);
  }
  return Object.freeze([...ids].sort());
}
