export const WEAPON_SCHEMA_VERSION = 1 as const;
export const WEAPON_MATERIAL_POLICY_ID = 'pass64-ballistic-materials-v1' as const;

export const WEAPON_SLOTS = Object.freeze(['primary', 'secondary', 'special'] as const);
export const WEAPON_FAMILIES = Object.freeze([
  'assault-rifle',
  'smg',
  'lmg',
  'marksman',
  'shotgun',
  'sidearm',
  'launcher',
] as const);
export const WEAPON_FIRE_KINDS = Object.freeze(['hitscan', 'pellet', 'slug', 'projectile'] as const);
export const WEAPON_FIRE_MODES = Object.freeze(['semi', 'automatic'] as const);

export type WeaponDefinitionId = string;
export type ProjectileDefinitionId = string;
export type WeaponSlot = (typeof WEAPON_SLOTS)[number];
export type WeaponFamily = (typeof WEAPON_FAMILIES)[number];
export type WeaponFireKind = (typeof WEAPON_FIRE_KINDS)[number];
export type WeaponFireMode = (typeof WEAPON_FIRE_MODES)[number];
export type WeaponDamagePolicy = 'standard' | 'head-only';
export type WeaponLoadoutPolicy = 'eligible' | 'curated-only' | 'pickup-only' | 'never';
export type WeaponBotPolicy = 'eligible' | 'diagnostic-only' | 'never';
export type WeaponDropPolicy = 'droppable' | 'map-pickup' | 'never';
export type WeaponReplayPolicy = 'serialized' | 'decode-only';
export type WeaponTelemetryPolicy = 'standard' | 'not-applicable';
export type WeaponStanceAvailability = 'allowed' | 'blocked';
export type WeaponAuthorityPolicy = 'host-shot-v1' | 'host-railgun-v1' | 'host-projectile-v1';

export type WeaponDamageProfile = Readonly<{
  policy: WeaponDamagePolicy;
  base: number;
  minimum: number;
  falloffStartM: number;
  falloffEndM: number;
  headMultiplier: number;
  limbMultiplier: number;
}>;

export type WeaponSpreadProfile = Readonly<{
  hipRadians: number;
  adsMultiplier: number;
  movementMultiplier: number;
  standMultiplier: number;
  crouchMultiplier: number;
  proneMultiplier: number;
  sustainedPerShot: number;
  maximumRadians: number;
}>;

export type WeaponRecoilProfile = Readonly<{
  pitchRadians: number;
  yawRadians: number;
  recoveryPerSecond: number;
  adsMultiplier: number;
  standMultiplier: number;
  crouchMultiplier: number;
  proneMultiplier: number;
  deterministicPatternId: string;
}>;

export type WeaponAmmoProfile = Readonly<{
  magazine: number;
  reserve: number;
  reloadSeconds: number;
  emptyReloadSeconds: number;
  switchSeconds: number;
}>;

export type WeaponPenetrationProfile = Readonly<{
  calibreLabel: string;
  power: number;
  fmjMultiplier: number;
  materialPolicyId: typeof WEAPON_MATERIAL_POLICY_ID;
  energyFalloffStartM: number;
  energyFalloffEndM: number;
  minimumEnergyRetention: number;
  minimumWallDamageMultiplier: number;
  maximumSurfaces: number;
}>;

export type WeaponEffectsProfile = Readonly<{
  tracerColorHex: number;
}>;

export type StandardWeaponOptic = Readonly<{
  kind: 'standard';
  magnification: number;
  solidOcclusion: 'required';
}>;

export type ThermalSmokeOnlyWeaponOptic = Readonly<{
  kind: 'thermal-smoke-only';
  magnification: 2.5;
  solidOcclusion: 'required';
  targetPolicy: 'living-targets-through-smoke';
  authority: 'presentation-only';
}>;

export type SpecialAuthorityWeaponOptic = Readonly<{
  kind: 'special-authority';
  magnification: number;
  solidOcclusion: 'required';
  authorityPolicyId: Exclude<WeaponAuthorityPolicy, 'host-projectile-v1'>;
}>;

export type WeaponOpticProfile =
  | StandardWeaponOptic
  | ThermalSmokeOnlyWeaponOptic
  | SpecialAuthorityWeaponOptic;

export type WeaponRangePolicy =
  | Readonly<{ kind: 'station'; stationId: string }>
  | Readonly<{ kind: 'companion-sidearm'; primaryIds: readonly WeaponDefinitionId[] }>
  | Readonly<{ kind: 'entitlement-only'; entitlementPolicyId: string }>
  | Readonly<{ kind: 'never' }>;

export type WeaponStancePolicy = Readonly<{
  stand: WeaponStanceAvailability;
  crouch: WeaponStanceAvailability;
  prone: WeaponStanceAvailability;
}>;

export type WeaponPolicies = Readonly<{
  loadout: WeaponLoadoutPolicy;
  bot: WeaponBotPolicy;
  drop: WeaponDropPolicy;
  range: WeaponRangePolicy;
  replay: WeaponReplayPolicy;
  telemetry: WeaponTelemetryPolicy;
  stance: WeaponStancePolicy;
  authority: WeaponAuthorityPolicy;
}>;

export type WeaponDefinition = Readonly<{
  id: WeaponDefinitionId;
  displayName: string;
  slot: WeaponSlot;
  family: WeaponFamily;
  fireKind: WeaponFireKind;
  fireMode: WeaponFireMode;
  rpm: number;
  pellets: number;
  spinUpMs: number;
  movementMultiplier: number;
  damage: WeaponDamageProfile;
  spread: WeaponSpreadProfile;
  recoil: WeaponRecoilProfile;
  ammo: WeaponAmmoProfile;
  penetration: WeaponPenetrationProfile;
  effects: WeaponEffectsProfile;
  optic: WeaponOpticProfile | null;
  projectileId: ProjectileDefinitionId | null;
  policies: WeaponPolicies;
  modelSetId: string;
  presentationId: string;
  audioId: string;
  provenanceId: string;
  evidenceIds: readonly string[];
}>;

export type WeaponSchemaIssueCode =
  | 'bounds'
  | 'cross-field'
  | 'duplicate'
  | 'format'
  | 'missing-key'
  | 'type'
  | 'unknown-key'
  | 'unsupported-value';

export type WeaponSchemaIssue = Readonly<{
  path: string;
  code: WeaponSchemaIssueCode;
  message: string;
}>;

export class WeaponSchemaValidationError extends Error {
  readonly issues: readonly WeaponSchemaIssue[];

  constructor(issues: readonly WeaponSchemaIssue[]) {
    super(`Invalid weapon schema: ${issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
    this.name = 'WeaponSchemaValidationError';
    this.issues = Object.freeze([...issues]);
  }
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FORBIDDEN_DISPLAY_NAME_PATTERN = /[\u0000-\u001f\u007f]/;
const MAX_DEFINITION_COUNT = 128;
const MAX_EVIDENCE_ID_COUNT = 64;
const MAX_COMPANION_PRIMARY_COUNT = 64;

const WEAPON_KEYS = Object.freeze([
  'id',
  'displayName',
  'slot',
  'family',
  'fireKind',
  'fireMode',
  'rpm',
  'pellets',
  'spinUpMs',
  'movementMultiplier',
  'damage',
  'spread',
  'recoil',
  'ammo',
  'penetration',
  'effects',
  'optic',
  'projectileId',
  'policies',
  'modelSetId',
  'presentationId',
  'audioId',
  'provenanceId',
  'evidenceIds',
] as const);

function issue(
  issues: WeaponSchemaIssue[],
  path: string,
  code: WeaponSchemaIssueCode,
  message: string,
): void {
  issues.push(Object.freeze({ path, code, message }));
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactRecord(
  value: unknown,
  path: string,
  keys: readonly string[],
  issues: WeaponSchemaIssue[],
): UnknownRecord | null {
  if (!isRecord(value)) {
    issue(issues, path, 'type', 'must be an object');
    return null;
  }
  const allowed = new Set(keys);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) issue(issues, `${path}.${key}`, 'missing-key', 'is required');
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issue(issues, `${path}.${key}`, 'unknown-key', 'is not allowed');
  }
  return value;
}

function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
  issues: WeaponSchemaIssue[],
): value is T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    issue(issues, path, 'unsupported-value', `must be one of ${values.join(', ')}`);
    return false;
  }
  return true;
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
  issues: WeaponSchemaIssue[],
): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issue(issues, path, 'type', 'must be a finite number');
    return false;
  }
  if (value < minimum || value > maximum) {
    issue(issues, path, 'bounds', `must be between ${minimum} and ${maximum}`);
    return false;
  }
  return true;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
  issues: WeaponSchemaIssue[],
): value is number {
  if (!boundedNumber(value, minimum, maximum, path, issues)) return false;
  if (!Number.isInteger(value)) {
    issue(issues, path, 'type', 'must be an integer');
    return false;
  }
  return true;
}

function identifier(value: unknown, path: string, issues: WeaponSchemaIssue[]): value is string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    issue(issues, path, 'format', 'must be a lowercase ASCII slug of at most 64 characters');
    return false;
  }
  return true;
}

function displayName(value: unknown, path: string, issues: WeaponSchemaIssue[]): void {
  if (
    typeof value !== 'string'
    || value.length < 2
    || value.length > 80
    || value.trim() !== value
    || FORBIDDEN_DISPLAY_NAME_PATTERN.test(value)
  ) {
    issue(issues, path, 'format', 'must be a trimmed 2-80 character string without control characters');
  }
}

function validateDenseArray(
  value: readonly unknown[],
  path: string,
  issues: WeaponSchemaIssue[],
): void {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      issue(issues, `${path}[${index}]`, 'missing-key', 'sparse array slots are forbidden');
    }
  }
  for (const key of Reflect.ownKeys(value)) {
    if (!Object.getOwnPropertyDescriptor(value, key)?.enumerable) continue;
    if (typeof key === 'symbol') {
      issue(issues, `${path}[${String(key)}]`, 'unknown-key', 'non-index array properties are forbidden');
      continue;
    }
    const index = Number(key);
    const isDeclaredIndex = Number.isSafeInteger(index)
      && index >= 0
      && index < value.length
      && String(index) === key;
    if (!isDeclaredIndex) issue(issues, `${path}.${key}`, 'unknown-key', 'non-index array properties are forbidden');
  }
}

function uniqueIdentifierArray(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  issues: WeaponSchemaIssue[],
): void {
  if (!Array.isArray(value)) {
    issue(issues, path, 'type', 'must be an array');
    return;
  }
  if (value.length < minimum || value.length > maximum) {
    issue(issues, path, 'bounds', `must contain between ${minimum} and ${maximum} entries`);
  }
  if (value.length > maximum) return;
  validateDenseArray(value, path, issues);
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) continue;
    const entry = value[index];
    if (!identifier(entry, `${path}[${index}]`, issues)) continue;
    if (seen.has(entry)) issue(issues, `${path}[${index}]`, 'duplicate', `duplicates ${entry}`);
    seen.add(entry);
  }
}

function validateDamage(value: unknown, path: string, issues: WeaponSchemaIssue[]): void {
  const damage = exactRecord(
    value,
    path,
    ['policy', 'base', 'minimum', 'falloffStartM', 'falloffEndM', 'headMultiplier', 'limbMultiplier'],
    issues,
  );
  if (!damage) return;
  const policyValid = oneOf(damage.policy, ['standard', 'head-only'], `${path}.policy`, issues);
  const base = damage.base;
  const minimum = damage.minimum;
  const falloffStartM = damage.falloffStartM;
  const falloffEndM = damage.falloffEndM;
  const baseValid = boundedNumber(base, 0, 10_000, `${path}.base`, issues);
  const minimumValid = boundedNumber(minimum, 0, 10_000, `${path}.minimum`, issues);
  const startValid = boundedNumber(falloffStartM, 0, 2_000, `${path}.falloffStartM`, issues);
  const endValid = boundedNumber(falloffEndM, 0, 2_000, `${path}.falloffEndM`, issues);
  boundedNumber(damage.headMultiplier, 0, 10, `${path}.headMultiplier`, issues);
  boundedNumber(damage.limbMultiplier, 0, 10, `${path}.limbMultiplier`, issues);
  if (baseValid && minimumValid && minimum > base) {
    issue(issues, `${path}.minimum`, 'cross-field', 'cannot exceed base damage');
  }
  if (startValid && endValid && falloffEndM < falloffStartM) {
    issue(issues, `${path}.falloffEndM`, 'cross-field', 'cannot precede falloffStartM');
  }
  if (policyValid && damage.policy === 'head-only' && (damage.headMultiplier !== 1 || damage.limbMultiplier !== 0)) {
    issue(issues, path, 'cross-field', 'head-only requires headMultiplier 1 and limbMultiplier 0');
  }
}

function validateSpread(value: unknown, path: string, issues: WeaponSchemaIssue[]): void {
  const spread = exactRecord(
    value,
    path,
    [
      'hipRadians',
      'adsMultiplier',
      'movementMultiplier',
      'standMultiplier',
      'crouchMultiplier',
      'proneMultiplier',
      'sustainedPerShot',
      'maximumRadians',
    ],
    issues,
  );
  if (!spread) return;
  const hipRadians = spread.hipRadians;
  const maximumRadians = spread.maximumRadians;
  const sustainedPerShot = spread.sustainedPerShot;
  const hipValid = boundedNumber(hipRadians, 0, Math.PI / 2, `${path}.hipRadians`, issues);
  const maximumValid = boundedNumber(maximumRadians, 0, Math.PI / 2, `${path}.maximumRadians`, issues);
  for (const key of ['adsMultiplier', 'movementMultiplier', 'standMultiplier', 'crouchMultiplier', 'proneMultiplier'] as const) {
    boundedNumber(spread[key], 0, 4, `${path}.${key}`, issues);
  }
  const sustainedValid = boundedNumber(sustainedPerShot, 0, Math.PI / 2, `${path}.sustainedPerShot`, issues);
  if (spread.standMultiplier !== 1) issue(issues, `${path}.standMultiplier`, 'cross-field', 'must equal 1');
  if (hipValid && maximumValid && maximumRadians < hipRadians) {
    issue(issues, `${path}.maximumRadians`, 'cross-field', 'cannot be less than hipRadians');
  }
  if (sustainedValid && maximumValid && sustainedPerShot > maximumRadians) {
    issue(issues, `${path}.sustainedPerShot`, 'cross-field', 'cannot exceed maximumRadians');
  }
}

function validateRecoil(value: unknown, path: string, issues: WeaponSchemaIssue[]): void {
  const recoil = exactRecord(
    value,
    path,
    [
      'pitchRadians',
      'yawRadians',
      'recoveryPerSecond',
      'adsMultiplier',
      'standMultiplier',
      'crouchMultiplier',
      'proneMultiplier',
      'deterministicPatternId',
    ],
    issues,
  );
  if (!recoil) return;
  boundedNumber(recoil.pitchRadians, 0, Math.PI, `${path}.pitchRadians`, issues);
  boundedNumber(recoil.yawRadians, 0, Math.PI, `${path}.yawRadians`, issues);
  boundedNumber(recoil.recoveryPerSecond, 0.01, 100, `${path}.recoveryPerSecond`, issues);
  for (const key of ['adsMultiplier', 'standMultiplier', 'crouchMultiplier', 'proneMultiplier'] as const) {
    boundedNumber(recoil[key], 0, 4, `${path}.${key}`, issues);
  }
  if (recoil.standMultiplier !== 1) issue(issues, `${path}.standMultiplier`, 'cross-field', 'must equal 1');
  identifier(recoil.deterministicPatternId, `${path}.deterministicPatternId`, issues);
}

function validateAmmo(value: unknown, path: string, issues: WeaponSchemaIssue[]): void {
  const ammo = exactRecord(
    value,
    path,
    ['magazine', 'reserve', 'reloadSeconds', 'emptyReloadSeconds', 'switchSeconds'],
    issues,
  );
  if (!ammo) return;
  boundedInteger(ammo.magazine, 1, 2_000, `${path}.magazine`, issues);
  boundedInteger(ammo.reserve, 0, 10_000, `${path}.reserve`, issues);
  const reloadSeconds = ammo.reloadSeconds;
  const emptyReloadSeconds = ammo.emptyReloadSeconds;
  const reloadValid = boundedNumber(reloadSeconds, 0.05, 30, `${path}.reloadSeconds`, issues);
  const emptyValid = boundedNumber(emptyReloadSeconds, 0.05, 30, `${path}.emptyReloadSeconds`, issues);
  boundedNumber(ammo.switchSeconds, 0.01, 10, `${path}.switchSeconds`, issues);
  if (reloadValid && emptyValid && emptyReloadSeconds < reloadSeconds) {
    issue(issues, `${path}.emptyReloadSeconds`, 'cross-field', 'cannot be shorter than reloadSeconds');
  }
}

function validatePenetration(value: unknown, path: string, issues: WeaponSchemaIssue[]): void {
  const penetration = exactRecord(
    value,
    path,
    [
      'calibreLabel',
      'power',
      'fmjMultiplier',
      'materialPolicyId',
      'energyFalloffStartM',
      'energyFalloffEndM',
      'minimumEnergyRetention',
      'minimumWallDamageMultiplier',
      'maximumSurfaces',
    ],
    issues,
  );
  if (!penetration) return;
  if (
    typeof penetration.calibreLabel !== 'string'
    || penetration.calibreLabel.length < 1
    || penetration.calibreLabel.length > 40
    || penetration.calibreLabel.trim() !== penetration.calibreLabel
    || FORBIDDEN_DISPLAY_NAME_PATTERN.test(penetration.calibreLabel)
  ) {
    issue(issues, `${path}.calibreLabel`, 'format', 'must be a trimmed 1-40 character string without control characters');
  }
  boundedNumber(penetration.power, 0, 100_000, `${path}.power`, issues);
  boundedNumber(penetration.fmjMultiplier, 1, 4, `${path}.fmjMultiplier`, issues);
  if (penetration.materialPolicyId !== WEAPON_MATERIAL_POLICY_ID) {
    issue(issues, `${path}.materialPolicyId`, 'unsupported-value', `must equal ${WEAPON_MATERIAL_POLICY_ID}`);
  }
  const energyFalloffStartM = penetration.energyFalloffStartM;
  const energyFalloffEndM = penetration.energyFalloffEndM;
  const startValid = boundedNumber(
    energyFalloffStartM,
    0,
    2_000,
    `${path}.energyFalloffStartM`,
    issues,
  );
  const endValid = boundedNumber(
    energyFalloffEndM,
    0,
    2_001,
    `${path}.energyFalloffEndM`,
    issues,
  );
  if (startValid && endValid && energyFalloffEndM <= energyFalloffStartM) {
    issue(issues, `${path}.energyFalloffEndM`, 'cross-field', 'must be greater than energyFalloffStartM');
  }
  boundedNumber(penetration.minimumEnergyRetention, 0, 1, `${path}.minimumEnergyRetention`, issues);
  boundedNumber(penetration.minimumWallDamageMultiplier, 0, 1, `${path}.minimumWallDamageMultiplier`, issues);
  boundedInteger(penetration.maximumSurfaces, 0, 64, `${path}.maximumSurfaces`, issues);
}

function validateEffects(value: unknown, path: string, issues: WeaponSchemaIssue[]): void {
  const effects = exactRecord(value, path, ['tracerColorHex'], issues);
  if (!effects) return;
  boundedInteger(effects.tracerColorHex, 0, 0xffffff, `${path}.tracerColorHex`, issues);
}

function validateOptic(value: unknown, path: string, issues: WeaponSchemaIssue[]): void {
  if (value === null) return;
  if (!isRecord(value)) {
    issue(issues, path, 'type', 'must be null or an optic object');
    return;
  }
  if (value.kind === 'standard') {
    const optic = exactRecord(value, path, ['kind', 'magnification', 'solidOcclusion'], issues);
    if (!optic) return;
    boundedNumber(optic.magnification, 1, 16, `${path}.magnification`, issues);
    if (optic.solidOcclusion !== 'required') {
      issue(issues, `${path}.solidOcclusion`, 'unsupported-value', 'must equal required');
    }
    return;
  }
  if (value.kind === 'thermal-smoke-only') {
    const optic = exactRecord(
      value,
      path,
      ['kind', 'magnification', 'solidOcclusion', 'targetPolicy', 'authority'],
      issues,
    );
    if (!optic) return;
    if (optic.magnification !== 2.5) issue(issues, `${path}.magnification`, 'unsupported-value', 'must equal 2.5');
    if (optic.solidOcclusion !== 'required') {
      issue(issues, `${path}.solidOcclusion`, 'unsupported-value', 'must equal required');
    }
    if (optic.targetPolicy !== 'living-targets-through-smoke') {
      issue(issues, `${path}.targetPolicy`, 'unsupported-value', 'must equal living-targets-through-smoke');
    }
    if (optic.authority !== 'presentation-only') {
      issue(issues, `${path}.authority`, 'unsupported-value', 'must equal presentation-only');
    }
    return;
  }
  if (value.kind === 'special-authority') {
    const optic = exactRecord(
      value,
      path,
      ['kind', 'magnification', 'solidOcclusion', 'authorityPolicyId'],
      issues,
    );
    if (!optic) return;
    boundedNumber(optic.magnification, 1, 16, `${path}.magnification`, issues);
    if (optic.solidOcclusion !== 'required') {
      issue(issues, `${path}.solidOcclusion`, 'unsupported-value', 'must equal required');
    }
    oneOf(
      optic.authorityPolicyId,
      ['host-shot-v1', 'host-railgun-v1'],
      `${path}.authorityPolicyId`,
      issues,
    );
    return;
  }
  exactRecord(value, path, ['kind'], issues);
  issue(issues, `${path}.kind`, 'unsupported-value', 'must be standard, thermal-smoke-only, or special-authority');
}

function validateRangePolicy(value: unknown, path: string, issues: WeaponSchemaIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, 'type', 'must be a range policy object');
    return;
  }
  if (value.kind === 'station') {
    const policy = exactRecord(value, path, ['kind', 'stationId'], issues);
    if (policy) identifier(policy.stationId, `${path}.stationId`, issues);
    return;
  }
  if (value.kind === 'companion-sidearm') {
    const policy = exactRecord(value, path, ['kind', 'primaryIds'], issues);
    if (policy) {
      uniqueIdentifierArray(
        policy.primaryIds,
        `${path}.primaryIds`,
        1,
        MAX_COMPANION_PRIMARY_COUNT,
        issues,
      );
    }
    return;
  }
  if (value.kind === 'entitlement-only') {
    const policy = exactRecord(value, path, ['kind', 'entitlementPolicyId'], issues);
    if (policy) identifier(policy.entitlementPolicyId, `${path}.entitlementPolicyId`, issues);
    return;
  }
  if (value.kind === 'never') {
    exactRecord(value, path, ['kind'], issues);
    return;
  }
  exactRecord(value, path, ['kind'], issues);
  issue(
    issues,
    `${path}.kind`,
    'unsupported-value',
    'must be station, companion-sidearm, entitlement-only, or never',
  );
}

function validatePolicies(value: unknown, path: string, issues: WeaponSchemaIssue[]): void {
  const policies = exactRecord(
    value,
    path,
    ['loadout', 'bot', 'drop', 'range', 'replay', 'telemetry', 'stance', 'authority'],
    issues,
  );
  if (!policies) return;
  oneOf(policies.loadout, ['eligible', 'curated-only', 'pickup-only', 'never'], `${path}.loadout`, issues);
  oneOf(policies.bot, ['eligible', 'diagnostic-only', 'never'], `${path}.bot`, issues);
  oneOf(policies.drop, ['droppable', 'map-pickup', 'never'], `${path}.drop`, issues);
  validateRangePolicy(policies.range, `${path}.range`, issues);
  oneOf(policies.replay, ['serialized', 'decode-only'], `${path}.replay`, issues);
  oneOf(policies.telemetry, ['standard', 'not-applicable'], `${path}.telemetry`, issues);
  oneOf(
    policies.authority,
    ['host-shot-v1', 'host-railgun-v1', 'host-projectile-v1'],
    `${path}.authority`,
    issues,
  );
  const stance = exactRecord(policies.stance, `${path}.stance`, ['stand', 'crouch', 'prone'], issues);
  if (!stance) return;
  for (const key of ['stand', 'crouch', 'prone'] as const) {
    oneOf(stance[key], ['allowed', 'blocked'], `${path}.stance.${key}`, issues);
  }
}

function validateCrossFields(weapon: UnknownRecord, path: string, issues: WeaponSchemaIssue[]): void {
  if (weapon.fireKind === 'pellet') {
    if (typeof weapon.pellets === 'number' && weapon.pellets <= 1) {
      issue(issues, `${path}.pellets`, 'cross-field', 'pellet fire requires more than one pellet');
    }
  } else if (
    typeof weapon.fireKind === 'string'
    && WEAPON_FIRE_KINDS.includes(weapon.fireKind as WeaponFireKind)
    && weapon.pellets !== 1
  ) {
    issue(issues, `${path}.pellets`, 'cross-field', 'non-pellet fire requires exactly one ray or projectile');
  }

  const policies = isRecord(weapon.policies) ? weapon.policies : null;
  if (weapon.fireKind === 'projectile') {
    if (!identifier(weapon.projectileId, `${path}.projectileId`, issues)) {
      issue(issues, `${path}.projectileId`, 'cross-field', 'projectile fire requires a projectile ID');
    }
    if (policies && policies.authority !== 'host-projectile-v1') {
      issue(issues, `${path}.policies.authority`, 'cross-field', 'projectile fire requires host-projectile-v1');
    }
  } else if (weapon.projectileId !== null) {
    issue(issues, `${path}.projectileId`, 'cross-field', 'non-projectile fire requires null');
  }
  if (weapon.fireKind !== 'projectile' && policies?.authority === 'host-projectile-v1') {
    issue(issues, `${path}.policies.authority`, 'cross-field', 'host-projectile-v1 requires projectile fire');
  }

  const optic = isRecord(weapon.optic) ? weapon.optic : null;
  if (optic?.kind === 'thermal-smoke-only') {
    if (
      weapon.family !== 'marksman'
      || weapon.slot !== 'primary'
      || weapon.fireMode !== 'semi'
      || weapon.fireKind !== 'hitscan'
    ) {
      issue(
        issues,
        `${path}.optic`,
        'cross-field',
        'thermal-smoke-only is limited to a primary semi-auto marksman hitscan definition',
      );
    }
    if (policies?.authority !== 'host-shot-v1') {
      issue(issues, `${path}.policies.authority`, 'cross-field', 'thermal presentation cannot change shot authority');
    }
  }
  if (
    optic?.kind === 'special-authority'
    && policies
    && typeof optic.authorityPolicyId === 'string'
    && optic.authorityPolicyId !== policies.authority
  ) {
    issue(issues, `${path}.optic.authorityPolicyId`, 'cross-field', 'must match policies.authority');
  }

  const range = policies && isRecord(policies.range) ? policies.range : null;
  if (range?.kind === 'station' && weapon.slot !== 'primary') {
    issue(issues, `${path}.policies.range`, 'cross-field', 'station range policy requires a primary weapon');
  }
  if (range?.kind === 'companion-sidearm' && weapon.slot !== 'secondary') {
    issue(issues, `${path}.policies.range`, 'cross-field', 'companion-sidearm range policy requires a secondary weapon');
  }
}

function collectWeaponDefinitionIssues(
  value: unknown,
  path: string,
  issues: WeaponSchemaIssue[],
): void {
  const weapon = exactRecord(value, path, WEAPON_KEYS, issues);
  if (!weapon) return;
  identifier(weapon.id, `${path}.id`, issues);
  displayName(weapon.displayName, `${path}.displayName`, issues);
  oneOf(weapon.slot, WEAPON_SLOTS, `${path}.slot`, issues);
  oneOf(weapon.family, WEAPON_FAMILIES, `${path}.family`, issues);
  oneOf(weapon.fireKind, WEAPON_FIRE_KINDS, `${path}.fireKind`, issues);
  oneOf(weapon.fireMode, WEAPON_FIRE_MODES, `${path}.fireMode`, issues);
  boundedNumber(weapon.rpm, 1, 3_000, `${path}.rpm`, issues);
  boundedInteger(weapon.pellets, 1, 12, `${path}.pellets`, issues);
  boundedInteger(weapon.spinUpMs, 0, 10_000, `${path}.spinUpMs`, issues);
  boundedNumber(weapon.movementMultiplier, 0.1, 1.5, `${path}.movementMultiplier`, issues);
  validateDamage(weapon.damage, `${path}.damage`, issues);
  validateSpread(weapon.spread, `${path}.spread`, issues);
  validateRecoil(weapon.recoil, `${path}.recoil`, issues);
  validateAmmo(weapon.ammo, `${path}.ammo`, issues);
  validatePenetration(weapon.penetration, `${path}.penetration`, issues);
  validateEffects(weapon.effects, `${path}.effects`, issues);
  validateOptic(weapon.optic, `${path}.optic`, issues);
  if (weapon.projectileId !== null && typeof weapon.projectileId !== 'string') {
    issue(issues, `${path}.projectileId`, 'type', 'must be null or a lowercase ASCII slug');
  }
  validatePolicies(weapon.policies, `${path}.policies`, issues);
  for (const key of ['modelSetId', 'presentationId', 'audioId', 'provenanceId'] as const) {
    identifier(weapon[key], `${path}.${key}`, issues);
  }
  uniqueIdentifierArray(weapon.evidenceIds, `${path}.evidenceIds`, 1, MAX_EVIDENCE_ID_COUNT, issues);
  validateCrossFields(weapon, path, issues);
}

function cloneAndFreeze(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => cloneAndFreeze(entry)));
  if (isRecord(value)) {
    const clone: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) clone[key] = cloneAndFreeze(entry);
    return Object.freeze(clone);
  }
  return value;
}

function sortedIssues(issues: readonly WeaponSchemaIssue[]): readonly WeaponSchemaIssue[] {
  return Object.freeze(
    [...issues].sort((left, right) =>
      left.path.localeCompare(right.path)
      || left.code.localeCompare(right.code)
      || left.message.localeCompare(right.message)),
  );
}

export function validateWeaponDefinition(value: unknown): readonly WeaponSchemaIssue[] {
  const issues: WeaponSchemaIssue[] = [];
  collectWeaponDefinitionIssues(value, '$', issues);
  return sortedIssues(issues);
}

export function parseWeaponDefinition(value: unknown): WeaponDefinition {
  const issues = validateWeaponDefinition(value);
  if (issues.length > 0) throw new WeaponSchemaValidationError(issues);
  return cloneAndFreeze(value) as WeaponDefinition;
}

export function validateWeaponDefinitions(value: unknown): readonly WeaponSchemaIssue[] {
  const issues: WeaponSchemaIssue[] = [];
  if (!Array.isArray(value)) {
    issue(issues, '$', 'type', 'must be an array of weapon definitions');
    return sortedIssues(issues);
  }
  if (value.length < 1 || value.length > MAX_DEFINITION_COUNT) {
    issue(issues, '$', 'bounds', `must contain between 1 and ${MAX_DEFINITION_COUNT} definitions`);
  }
  if (value.length > MAX_DEFINITION_COUNT) return sortedIssues(issues);
  validateDenseArray(value, '$', issues);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) continue;
    collectWeaponDefinitionIssues(value[index], `$[${index}]`, issues);
  }

  const uniqueFields = [
    'id',
    'modelSetId',
    'presentationId',
    'audioId',
    'provenanceId',
  ] as const;
  for (const field of uniqueFields) {
    const firstIndexByValue = new Map<string, number>();
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) continue;
      const entry = value[index];
      if (!isRecord(entry) || typeof entry[field] !== 'string') continue;
      const previousIndex = firstIndexByValue.get(entry[field]);
      if (previousIndex !== undefined) {
        issue(
          issues,
          `$[${index}].${field}`,
          'duplicate',
          `duplicates $[${previousIndex}].${field}`,
        );
      } else {
        firstIndexByValue.set(entry[field], index);
      }
    }
  }
  const firstPatternIndex = new Map<string, number>();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) continue;
    const entry = value[index];
    if (!isRecord(entry) || !isRecord(entry.recoil) || typeof entry.recoil.deterministicPatternId !== 'string') continue;
    const pattern = entry.recoil.deterministicPatternId;
    const previousIndex = firstPatternIndex.get(pattern);
    if (previousIndex !== undefined) {
      issue(
        issues,
        `$[${index}].recoil.deterministicPatternId`,
        'duplicate',
        `duplicates $[${previousIndex}].recoil.deterministicPatternId`,
      );
    } else {
      firstPatternIndex.set(pattern, index);
    }
  }
  return sortedIssues(issues);
}

export function parseWeaponDefinitions(value: unknown): readonly WeaponDefinition[] {
  const issues = validateWeaponDefinitions(value);
  if (issues.length > 0) throw new WeaponSchemaValidationError(issues);
  return cloneAndFreeze(value) as readonly WeaponDefinition[];
}
