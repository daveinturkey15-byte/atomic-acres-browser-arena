import { parseWeaponDefinitions, type WeaponDefinitionId } from './combat/weapon-schema';
import {
  DEFAULT_FIELD_KIT,
  FIELD_KITS,
  FIELD_KIT_STORAGE_KEY,
  type FieldKitId,
} from './loadout';

export const LOADOUT_STORAGE_SCHEMA_VERSION = 2 as const;
export const LOADOUT_STORAGE_V2_KEY = 'atomic-acres.loadout.v2' as const;
export const LOADOUT_STORAGE_V2_STAGE_KEY = 'atomic-acres.loadout.v2.stage' as const;
export const LOADOUT_LEGACY_V1_KEY = FIELD_KIT_STORAGE_KEY;
export const LOADOUT_DECISION_RECEIPT_ID = 'DEC-01' as const;
export const MAX_LOADOUT_PRESET_NAME_CODE_POINTS = 32;
export const MAX_SERIALIZED_LOADOUT_LENGTH = 16_384;

export const LOADOUT_PRESET_IDS = Object.freeze([
  'custom-1',
  'custom-2',
  'custom-3',
] as const);
export const LOADOUT_GRENADE_IDS = Object.freeze(['frag', 'smoke', 'flash'] as const);
export const CURATED_KIT_IDS = Object.freeze(FIELD_KITS.map((kit) => kit.id));

export type LoadoutPresetId = (typeof LOADOUT_PRESET_IDS)[number];
export type GrenadeId = (typeof LOADOUT_GRENADE_IDS)[number];

export const DEFAULT_LOADOUT_PRESET_NAMES: Readonly<Record<LoadoutPresetId, string>> = Object.freeze({
  'custom-1': 'Custom 1',
  'custom-2': 'Custom 2',
  'custom-3': 'Custom 3',
});

export type CustomPresetTile = Readonly<{
  kind: 'custom-preset';
  presetId: LoadoutPresetId;
  label: string;
}>;

export type ManageRenameTile = Readonly<{
  kind: 'manage-rename';
  label: 'Manage/Rename';
}>;

export type LoadoutSecondRowTile = CustomPresetTile | ManageRenameTile;

export const LOADOUT_SECOND_ROW_TILES: readonly LoadoutSecondRowTile[] = Object.freeze([
  Object.freeze({ kind: 'custom-preset', presetId: 'custom-1', label: DEFAULT_LOADOUT_PRESET_NAMES['custom-1'] }),
  Object.freeze({ kind: 'custom-preset', presetId: 'custom-2', label: DEFAULT_LOADOUT_PRESET_NAMES['custom-2'] }),
  Object.freeze({ kind: 'custom-preset', presetId: 'custom-3', label: DEFAULT_LOADOUT_PRESET_NAMES['custom-3'] }),
  Object.freeze({ kind: 'manage-rename', label: 'Manage/Rename' }),
]);

export type LoadoutSchemaDefinitionV2 = Readonly<{
  schemaVersion: typeof LOADOUT_STORAGE_SCHEMA_VERSION;
  enabledCustomPresetIds: readonly LoadoutPresetId[];
  showManageRenameTile: true;
  decisionReceiptId: typeof LOADOUT_DECISION_RECEIPT_ID;
}>;

export const LOADOUT_SCHEMA_DEFINITION_V2: LoadoutSchemaDefinitionV2 = Object.freeze({
  schemaVersion: LOADOUT_STORAGE_SCHEMA_VERSION,
  enabledCustomPresetIds: LOADOUT_PRESET_IDS,
  showManageRenameTile: true,
  decisionReceiptId: LOADOUT_DECISION_RECEIPT_ID,
});

export type LoadoutPresetV2 = Readonly<{
  schemaVersion: typeof LOADOUT_STORAGE_SCHEMA_VERSION;
  id: LoadoutPresetId;
  displayName: string;
  primary: WeaponDefinitionId;
  secondary: WeaponDefinitionId;
  grenade: GrenadeId;
}>;

export type SelectedLoadoutRef =
  | Readonly<{ kind: 'curated'; kitId: FieldKitId }>
  | Readonly<{ kind: 'custom'; presetId: LoadoutPresetId }>;

export type DeploymentSelection = Readonly<{
  primary: WeaponDefinitionId;
  secondary: WeaponDefinitionId;
  grenade: GrenadeId;
}>;

export type LoadoutStorageV2 = Readonly<{
  schemaVersion: typeof LOADOUT_STORAGE_SCHEMA_VERSION;
  selected: SelectedLoadoutRef;
  customPresets: readonly LoadoutPresetV2[];
}>;

export type LoadoutItemEligibility = Readonly<{
  primaryIds: readonly WeaponDefinitionId[];
  secondaryIds: readonly WeaponDefinitionId[];
}>;

export type LoadoutSchemaIssueCode =
  | 'bounds'
  | 'cross-field'
  | 'duplicate'
  | 'format'
  | 'issue-limit'
  | 'missing-key'
  | 'type'
  | 'unknown-key'
  | 'unsupported-value';

export type LoadoutSchemaIssue = Readonly<{
  path: string;
  code: LoadoutSchemaIssueCode;
  message: string;
}>;

export class LoadoutSchemaValidationError extends Error {
  readonly issues: readonly LoadoutSchemaIssue[];

  constructor(issues: readonly LoadoutSchemaIssue[]) {
    super(`Invalid loadout schema: ${issues.map((entry) => `${entry.path} ${entry.message}`).join('; ')}`);
    this.name = 'LoadoutSchemaValidationError';
    this.issues = Object.freeze([...issues]);
  }
}

export class LoadoutEligibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoadoutEligibilityError';
  }
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const MAX_SCHEMA_ISSUES = 96;
const MAX_SNAPSHOT_KEYS = 64;
const MAX_SNAPSHOT_DEPTH = 8;
const MAX_SNAPSHOT_ARRAY_LENGTH = 16;
const trustedEligibilityValues = new WeakSet<object>();
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/gu;
const BIDI_OR_INVISIBLE_CONTROL_PATTERN = /[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\u206a-\u206f\ufeff]/gu;
const LONE_SURROGATE_PATTERN = /[\ud800-\udfff]/gu;
const MARKUP_META_PATTERN = /[<>&"'`]/gu;
const WHITESPACE_PATTERN = /\s+/gu;
const DEFAULT_IGNORABLE_CODE_POINT_PATTERN = /\p{Default_Ignorable_Code_Point}/gu;
const VISIBLE_PRESET_NAME_PATTERN = /[\p{L}\p{N}\p{P}\p{S}]/u;

const PRESET_KEYS = Object.freeze([
  'schemaVersion',
  'id',
  'displayName',
  'primary',
  'secondary',
  'grenade',
] as const);
const STORAGE_KEYS = Object.freeze(['schemaVersion', 'selected', 'customPresets'] as const);
const DEPLOYMENT_KEYS = Object.freeze(['primary', 'secondary', 'grenade'] as const);

function addIssue(
  issues: LoadoutSchemaIssue[],
  path: string,
  code: LoadoutSchemaIssueCode,
  message: string,
): void {
  if (issues.length >= MAX_SCHEMA_ISSUES) {
    if (issues[MAX_SCHEMA_ISSUES - 1]?.code !== 'issue-limit') {
      issues[MAX_SCHEMA_ISSUES - 1] = Object.freeze({
        path: '$',
        code: 'issue-limit',
        message: `validation stopped after ${MAX_SCHEMA_ISSUES - 1} detailed issues`,
      });
    }
    return;
  }
  issues.push(Object.freeze({ path, code, message }));
}

function sortedIssues(issues: readonly LoadoutSchemaIssue[]): readonly LoadoutSchemaIssue[] {
  return Object.freeze([...issues].sort((left, right) => (
    left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message)
  )));
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function snapshotFailure(issues: LoadoutSchemaIssue[], path: string, operation: string): void {
  addIssue(issues, path, 'type', `${operation} could not be read safely`);
}

function snapshotOwnKeys(
  value: object,
  path: string,
  issues: LoadoutSchemaIssue[],
): readonly PropertyKey[] | null {
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_SNAPSHOT_KEYS) {
      addIssue(issues, path, 'bounds', `must not expose more than ${MAX_SNAPSHOT_KEYS} own properties`);
    }
    return keys.slice(0, MAX_SNAPSHOT_KEYS);
  } catch {
    snapshotFailure(issues, path, 'own property keys');
    return null;
  }
}

function snapshotDescriptor(
  value: object,
  key: PropertyKey,
  path: string,
  issues: LoadoutSchemaIssue[],
): PropertyDescriptor | null {
  try {
    const first = Reflect.getOwnPropertyDescriptor(value, key);
    const second = Reflect.getOwnPropertyDescriptor(value, key);
    if (!first || !second) {
      snapshotFailure(issues, path, 'own property descriptor');
      return null;
    }
    const firstIsData = Object.hasOwn(first, 'value');
    const secondIsData = Object.hasOwn(second, 'value');
    const stable = firstIsData === secondIsData
      && first.configurable === second.configurable
      && first.enumerable === second.enumerable
      && (firstIsData
        ? first.writable === second.writable && Object.is(first.value, second.value)
        : first.get === second.get && first.set === second.set);
    if (!stable) {
      addIssue(issues, path, 'cross-field', 'own property descriptor changed during snapshot');
      return null;
    }
    return first;
  } catch {
    snapshotFailure(issues, path, 'own property descriptor');
    return null;
  }
}

function snapshotArray(
  value: object,
  path: string,
  issues: LoadoutSchemaIssue[],
  active: WeakSet<object>,
  depth: number,
): unknown[] {
  const lengthDescriptor = snapshotDescriptor(value, 'length', `${path}.length`, issues);
  if (!lengthDescriptor) return [];
  if (!Object.hasOwn(lengthDescriptor, 'value')) {
    addIssue(issues, `${path}.length`, 'type', 'accessor properties are forbidden');
    return [];
  }
  const length = lengthDescriptor.value;
  if (
    typeof length !== 'number'
    || !Number.isSafeInteger(length)
    || length < 0
    || length > MAX_SNAPSHOT_ARRAY_LENGTH
  ) {
    addIssue(
      issues,
      `${path}.length`,
      'bounds',
      `must be a safe integer from 0 through ${MAX_SNAPSHOT_ARRAY_LENGTH}`,
    );
    return [];
  }
  const snapshot = new Array<unknown>(length);
  const keys = snapshotOwnKeys(value, path, issues);
  if (!keys) return snapshot;
  for (const key of keys) {
    if (key === 'length') continue;
    if (typeof key === 'symbol') {
      addIssue(issues, `${path}[${String(key)}]`, 'unknown-key', 'symbol array properties are forbidden');
      continue;
    }
    const index = Number(key);
    const isIndex = Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
    if (!isIndex) {
      addIssue(issues, `${path}.${key}`, 'unknown-key', 'non-index array properties are forbidden');
      continue;
    }
    const propertyPath = `${path}[${index}]`;
    const descriptor = snapshotDescriptor(value, key, propertyPath, issues);
    if (!descriptor) continue;
    if (!descriptor.enumerable) {
      addIssue(issues, propertyPath, 'unknown-key', 'non-enumerable array entries are forbidden');
      continue;
    }
    if (!Object.hasOwn(descriptor, 'value')) {
      addIssue(issues, propertyPath, 'type', 'accessor properties are forbidden');
      continue;
    }
    snapshot[index] = snapshotValue(descriptor.value, propertyPath, issues, active, depth + 1);
  }
  return snapshot;
}

function snapshotRecord(
  value: object,
  path: string,
  issues: LoadoutSchemaIssue[],
  active: WeakSet<object>,
  depth: number,
): UnknownRecord {
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const keys = snapshotOwnKeys(value, path, issues);
  if (!keys) return snapshot;
  for (const key of keys) {
    if (typeof key === 'symbol') {
      addIssue(issues, `${path}[${String(key)}]`, 'unknown-key', 'symbol object properties are forbidden');
      continue;
    }
    const propertyPath = `${path}.${key}`;
    const descriptor = snapshotDescriptor(value, key, propertyPath, issues);
    if (!descriptor) continue;
    if (!descriptor.enumerable) {
      addIssue(issues, propertyPath, 'unknown-key', 'non-enumerable object properties are forbidden');
      continue;
    }
    if (!Object.hasOwn(descriptor, 'value')) {
      addIssue(issues, propertyPath, 'type', 'accessor properties are forbidden');
      continue;
    }
    snapshot[key] = snapshotValue(descriptor.value, propertyPath, issues, active, depth + 1);
  }
  return snapshot;
}

function snapshotValue(
  value: unknown,
  path: string,
  issues: LoadoutSchemaIssue[],
  active: WeakSet<object>,
  depth: number,
): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth > MAX_SNAPSHOT_DEPTH) {
    addIssue(issues, path, 'bounds', `must not exceed snapshot depth ${MAX_SNAPSHOT_DEPTH}`);
    return null;
  }
  if (active.has(value)) {
    addIssue(issues, path, 'cross-field', 'cyclic values are forbidden');
    return null;
  }
  let array: boolean;
  try {
    array = Array.isArray(value);
  } catch {
    snapshotFailure(issues, path, 'value kind');
    return null;
  }
  active.add(value);
  try {
    return array
      ? snapshotArray(value, path, issues, active, depth)
      : snapshotRecord(value, path, issues, active, depth);
  } catch {
    snapshotFailure(issues, path, 'value snapshot');
    return null;
  } finally {
    active.delete(value);
  }
}

function snapshotInput(value: unknown, issues: LoadoutSchemaIssue[]): unknown {
  try {
    return snapshotValue(value, '$', issues, new WeakSet<object>(), 0);
  } catch {
    snapshotFailure(issues, '$', 'input snapshot');
    return null;
  }
}

function exactRecord(
  value: unknown,
  path: string,
  keys: readonly string[],
  issues: LoadoutSchemaIssue[],
): UnknownRecord | null {
  if (!isRecord(value)) {
    addIssue(issues, path, 'type', 'must be an object');
    return null;
  }
  const allowed = new Set(keys);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) addIssue(issues, `${path}.${key}`, 'missing-key', 'is required');
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) addIssue(issues, `${path}.${key}`, 'unknown-key', 'is not allowed');
  }
  return value;
}

function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
  issues: LoadoutSchemaIssue[],
): value is T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    addIssue(issues, path, 'unsupported-value', `must be one of ${values.join(', ')}`);
    return false;
  }
  return true;
}

function validateDenseArray(value: readonly unknown[], path: string, issues: LoadoutSchemaIssue[]): void {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      addIssue(issues, `${path}[${index}]`, 'missing-key', 'sparse array slots are forbidden');
    }
  }
}

function canonicalizePresetName(value: string): string {
  let normalized = value.normalize('NFKC');
  normalized = normalized.replace(CONTROL_CHARACTER_PATTERN, ' ');
  normalized = normalized.replace(BIDI_OR_INVISIBLE_CONTROL_PATTERN, ' ');
  normalized = normalized.replace(LONE_SURROGATE_PATTERN, ' ');
  normalized = normalized.replace(MARKUP_META_PATTERN, ' ');
  normalized = normalized.replace(WHITESPACE_PATTERN, ' ').trim();
  normalized = Array.from(normalized).slice(0, MAX_LOADOUT_PRESET_NAME_CODE_POINTS).join('').trim();
  const visibilityProbe = normalized.replace(DEFAULT_IGNORABLE_CODE_POINT_PATTERN, '');
  return VISIBLE_PRESET_NAME_PATTERN.test(visibilityProbe) ? normalized : '';
}

export function sanitizeLoadoutPresetName(value: unknown, presetId: LoadoutPresetId): string {
  if (!LOADOUT_PRESET_IDS.includes(presetId)) {
    throw new LoadoutSchemaValidationError(Object.freeze([Object.freeze({
      path: '$.presetId',
      code: 'unsupported-value',
      message: `must be one of ${LOADOUT_PRESET_IDS.join(', ')}`,
    })]));
  }
  if (typeof value !== 'string') return DEFAULT_LOADOUT_PRESET_NAMES[presetId];
  const normalized = canonicalizePresetName(value);
  return normalized.length > 0 ? normalized : DEFAULT_LOADOUT_PRESET_NAMES[presetId];
}

function validatePresetName(value: unknown, path: string, issues: LoadoutSchemaIssue[]): void {
  if (typeof value !== 'string') {
    addIssue(issues, path, 'type', 'must be a string');
    return;
  }
  const length = Array.from(value).length;
  if (length < 1 || length > MAX_LOADOUT_PRESET_NAME_CODE_POINTS || canonicalizePresetName(value) !== value) {
    addIssue(
      issues,
      path,
      'format',
      `must be canonical plain text from 1 through ${MAX_LOADOUT_PRESET_NAME_CODE_POINTS} Unicode code points`,
    );
  }
}

function validateEligibleWeapon(
  value: unknown,
  allowedIds: readonly WeaponDefinitionId[],
  path: string,
  issues: LoadoutSchemaIssue[],
): void {
  if (typeof value !== 'string') {
    addIssue(issues, path, 'type', 'must be a weapon identifier');
    return;
  }
  if (!allowedIds.includes(value)) {
    addIssue(issues, path, 'unsupported-value', 'must name an eligible weapon in the required slot');
  }
}

function collectPresetIssues(
  value: unknown,
  path: string,
  eligibility: LoadoutItemEligibility,
  issues: LoadoutSchemaIssue[],
): void {
  const preset = exactRecord(value, path, PRESET_KEYS, issues);
  if (!preset) return;
  if (preset.schemaVersion !== LOADOUT_STORAGE_SCHEMA_VERSION) {
    addIssue(issues, `${path}.schemaVersion`, 'unsupported-value', 'must equal 2');
  }
  oneOf(preset.id, LOADOUT_PRESET_IDS, `${path}.id`, issues);
  validatePresetName(preset.displayName, `${path}.displayName`, issues);
  validateEligibleWeapon(preset.primary, eligibility.primaryIds, `${path}.primary`, issues);
  validateEligibleWeapon(preset.secondary, eligibility.secondaryIds, `${path}.secondary`, issues);
  oneOf(preset.grenade, LOADOUT_GRENADE_IDS, `${path}.grenade`, issues);
}

function collectSelectedRefIssues(
  value: unknown,
  path: string,
  issues: LoadoutSchemaIssue[],
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, 'type', 'must be an object');
    return;
  }
  if (value.kind === 'curated') {
    const selected = exactRecord(value, path, ['kind', 'kitId'], issues);
    if (selected) oneOf(selected.kitId, CURATED_KIT_IDS, `${path}.kitId`, issues);
    return;
  }
  if (value.kind === 'custom') {
    const selected = exactRecord(value, path, ['kind', 'presetId'], issues);
    if (selected) oneOf(selected.presetId, LOADOUT_PRESET_IDS, `${path}.presetId`, issues);
    return;
  }
  exactRecord(value, path, ['kind'], issues);
  addIssue(issues, `${path}.kind`, 'unsupported-value', 'must be curated or custom');
}

function collectCustomPresetArrayIssues(
  value: unknown,
  path: string,
  eligibility: LoadoutItemEligibility,
  issues: LoadoutSchemaIssue[],
): void {
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'type', 'must be an array');
    return;
  }
  if (value.length !== LOADOUT_PRESET_IDS.length) {
    addIssue(issues, path, 'bounds', `must contain exactly ${LOADOUT_PRESET_IDS.length} presets`);
  }
  validateDenseArray(value, path, issues);
  const seen = new Set<string>();
  const checkedLength = Math.min(value.length, LOADOUT_PRESET_IDS.length);
  for (let index = 0; index < checkedLength; index += 1) {
    if (!Object.hasOwn(value, index)) continue;
    const preset = value[index];
    collectPresetIssues(preset, `${path}[${index}]`, eligibility, issues);
    if (!isRecord(preset) || typeof preset.id !== 'string') continue;
    if (seen.has(preset.id)) {
      addIssue(issues, `${path}[${index}].id`, 'duplicate', `duplicates ${preset.id}`);
    }
    seen.add(preset.id);
    if (preset.id !== LOADOUT_PRESET_IDS[index]) {
      addIssue(
        issues,
        `${path}[${index}].id`,
        'cross-field',
        `must preserve frozen preset order ${LOADOUT_PRESET_IDS.join(', ')}`,
      );
    }
  }
}

function collectStorageIssues(
  value: unknown,
  eligibility: LoadoutItemEligibility,
  issues: LoadoutSchemaIssue[],
): void {
  const storage = exactRecord(value, '$', STORAGE_KEYS, issues);
  if (!storage) return;
  if (storage.schemaVersion !== LOADOUT_STORAGE_SCHEMA_VERSION) {
    addIssue(issues, '$.schemaVersion', 'unsupported-value', 'must equal 2');
  }
  collectSelectedRefIssues(storage.selected, '$.selected', issues);
  collectCustomPresetArrayIssues(storage.customPresets, '$.customPresets', eligibility, issues);
}

function collectDeploymentIssues(
  value: unknown,
  eligibility: LoadoutItemEligibility,
  issues: LoadoutSchemaIssue[],
): void {
  const selection = exactRecord(value, '$', DEPLOYMENT_KEYS, issues);
  if (!selection) return;
  validateEligibleWeapon(selection.primary, eligibility.primaryIds, '$.primary', issues);
  validateEligibleWeapon(selection.secondary, eligibility.secondaryIds, '$.secondary', issues);
  oneOf(selection.grenade, LOADOUT_GRENADE_IDS, '$.grenade', issues);
}

function throwIfIssues(issues: readonly LoadoutSchemaIssue[]): void {
  if (issues.length > 0) throw new LoadoutSchemaValidationError(sortedIssues(issues));
}

function freezePreset(value: UnknownRecord): LoadoutPresetV2 {
  return Object.freeze({
    schemaVersion: LOADOUT_STORAGE_SCHEMA_VERSION,
    id: value.id as LoadoutPresetId,
    displayName: value.displayName as string,
    primary: value.primary as WeaponDefinitionId,
    secondary: value.secondary as WeaponDefinitionId,
    grenade: value.grenade as GrenadeId,
  });
}

function freezeSelected(value: UnknownRecord): SelectedLoadoutRef {
  return value.kind === 'curated'
    ? Object.freeze({ kind: 'curated', kitId: value.kitId as FieldKitId })
    : Object.freeze({ kind: 'custom', presetId: value.presetId as LoadoutPresetId });
}

function freezeStorage(value: UnknownRecord): LoadoutStorageV2 {
  const presets = (value.customPresets as readonly UnknownRecord[]).map(freezePreset);
  return Object.freeze({
    schemaVersion: LOADOUT_STORAGE_SCHEMA_VERSION,
    selected: freezeSelected(value.selected as UnknownRecord),
    customPresets: Object.freeze(presets),
  });
}

export function createLoadoutItemEligibility(definitions: unknown): LoadoutItemEligibility {
  const parsed = parseWeaponDefinitions(definitions);
  const primaryIds = parsed
    .filter((weapon) => weapon.slot === 'primary' && weapon.policies.loadout === 'eligible')
    .map((weapon) => weapon.id);
  const secondaryIds = parsed
    .filter((weapon) => weapon.slot === 'secondary' && weapon.policies.loadout === 'eligible')
    .map((weapon) => weapon.id);
  if (primaryIds.length === 0 || secondaryIds.length === 0) {
    throw new LoadoutEligibilityError('Loadout eligibility requires at least one eligible primary and secondary');
  }
  const eligibility = Object.freeze({
    primaryIds: Object.freeze(primaryIds),
    secondaryIds: Object.freeze(secondaryIds),
  });
  trustedEligibilityValues.add(eligibility);
  return eligibility;
}

function assertTrustedEligibility(eligibility: LoadoutItemEligibility): void {
  if (!trustedEligibilityValues.has(eligibility)) {
    throw new LoadoutEligibilityError('Loadout eligibility must come from createLoadoutItemEligibility');
  }
}

export function validateLoadoutPresetV2(
  value: unknown,
  eligibility: LoadoutItemEligibility,
): readonly LoadoutSchemaIssue[] {
  assertTrustedEligibility(eligibility);
  const issues: LoadoutSchemaIssue[] = [];
  const snapshot = snapshotInput(value, issues);
  collectPresetIssues(snapshot, '$', eligibility, issues);
  return sortedIssues(issues);
}

export function parseLoadoutPresetV2(value: unknown, eligibility: LoadoutItemEligibility): LoadoutPresetV2 {
  assertTrustedEligibility(eligibility);
  const issues: LoadoutSchemaIssue[] = [];
  const snapshot = snapshotInput(value, issues);
  collectPresetIssues(snapshot, '$', eligibility, issues);
  throwIfIssues(issues);
  return freezePreset(snapshot as UnknownRecord);
}

export function validateSelectedLoadoutRef(value: unknown): readonly LoadoutSchemaIssue[] {
  const issues: LoadoutSchemaIssue[] = [];
  const snapshot = snapshotInput(value, issues);
  collectSelectedRefIssues(snapshot, '$', issues);
  return sortedIssues(issues);
}

export function parseSelectedLoadoutRef(value: unknown): SelectedLoadoutRef {
  const issues: LoadoutSchemaIssue[] = [];
  const snapshot = snapshotInput(value, issues);
  collectSelectedRefIssues(snapshot, '$', issues);
  throwIfIssues(issues);
  return freezeSelected(snapshot as UnknownRecord);
}

export function validateLoadoutStorageV2(
  value: unknown,
  eligibility: LoadoutItemEligibility,
): readonly LoadoutSchemaIssue[] {
  assertTrustedEligibility(eligibility);
  const issues: LoadoutSchemaIssue[] = [];
  const snapshot = snapshotInput(value, issues);
  collectStorageIssues(snapshot, eligibility, issues);
  return sortedIssues(issues);
}

export function parseLoadoutStorageV2(value: unknown, eligibility: LoadoutItemEligibility): LoadoutStorageV2 {
  assertTrustedEligibility(eligibility);
  const issues: LoadoutSchemaIssue[] = [];
  const snapshot = snapshotInput(value, issues);
  collectStorageIssues(snapshot, eligibility, issues);
  throwIfIssues(issues);
  const parsed = freezeStorage(snapshot as UnknownRecord);
  const invariantIssues: LoadoutSchemaIssue[] = [];
  collectStorageIssues(parsed, eligibility, invariantIssues);
  throwIfIssues(invariantIssues);
  return parsed;
}

export function deploymentSelectionFromPreset(preset: LoadoutPresetV2): DeploymentSelection {
  return Object.freeze({
    primary: preset.primary,
    secondary: preset.secondary,
    grenade: preset.grenade,
  });
}

export function createDefaultCustomPresets(
  selection: unknown,
  eligibility: LoadoutItemEligibility,
): readonly LoadoutPresetV2[] {
  assertTrustedEligibility(eligibility);
  const issues: LoadoutSchemaIssue[] = [];
  const snapshot = snapshotInput(selection, issues);
  collectDeploymentIssues(snapshot, eligibility, issues);
  throwIfIssues(issues);
  const deployment = snapshot as UnknownRecord;
  return Object.freeze(LOADOUT_PRESET_IDS.map((id) => Object.freeze({
    schemaVersion: LOADOUT_STORAGE_SCHEMA_VERSION,
    id,
    displayName: DEFAULT_LOADOUT_PRESET_NAMES[id],
    primary: deployment.primary as WeaponDefinitionId,
    secondary: deployment.secondary as WeaponDefinitionId,
    grenade: deployment.grenade as GrenadeId,
  })));
}

export type LoadoutDecodeFailureReason = 'too-large' | 'json' | 'schema';

export type LoadoutDecodeResult =
  | Readonly<{ ok: true; value: LoadoutStorageV2 }>
  | Readonly<{
    ok: false;
    reason: LoadoutDecodeFailureReason;
    issues: readonly LoadoutSchemaIssue[];
  }>;

export function decodeLoadoutStorageV2(
  serialized: string,
  eligibility: LoadoutItemEligibility,
): LoadoutDecodeResult {
  assertTrustedEligibility(eligibility);
  if (serialized.length > MAX_SERIALIZED_LOADOUT_LENGTH) {
    return Object.freeze({
      ok: false,
      reason: 'too-large',
      issues: Object.freeze([Object.freeze({
        path: '$',
        code: 'bounds' as const,
        message: `serialized value must not exceed ${MAX_SERIALIZED_LOADOUT_LENGTH} characters`,
      })]),
    });
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(serialized) as unknown;
  } catch {
    return Object.freeze({
      ok: false,
      reason: 'json',
      issues: Object.freeze([Object.freeze({
        path: '$',
        code: 'format' as const,
        message: 'must be valid JSON',
      })]),
    });
  }
  try {
    return Object.freeze({ ok: true, value: parseLoadoutStorageV2(decoded, eligibility) });
  } catch (error) {
    if (!(error instanceof LoadoutSchemaValidationError)) throw error;
    return Object.freeze({ ok: false, reason: 'schema', issues: error.issues });
  }
}

export function serializeLoadoutStorageV2(
  value: unknown,
  eligibility: LoadoutItemEligibility,
): string {
  return JSON.stringify(parseLoadoutStorageV2(value, eligibility));
}

export type LegacyFieldKitSelectionResult =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'valid'; kitId: FieldKitId }>
  | Readonly<{
    kind: 'invalid';
    reason: LoadoutDecodeFailureReason;
    issues: readonly LoadoutSchemaIssue[];
  }>;

export function decodeLegacyFieldKitSelectionV1(serialized: string | null): LegacyFieldKitSelectionResult {
  if (serialized === null) return Object.freeze({ kind: 'missing' });
  if (serialized.length > MAX_SERIALIZED_LOADOUT_LENGTH) {
    return Object.freeze({
      kind: 'invalid',
      reason: 'too-large',
      issues: Object.freeze([Object.freeze({
        path: '$',
        code: 'bounds' as const,
        message: `serialized value must not exceed ${MAX_SERIALIZED_LOADOUT_LENGTH} characters`,
      })]),
    });
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(serialized) as unknown;
  } catch {
    return Object.freeze({
      kind: 'invalid',
      reason: 'json',
      issues: Object.freeze([Object.freeze({ path: '$', code: 'format' as const, message: 'must be valid JSON' })]),
    });
  }
  const issues: LoadoutSchemaIssue[] = [];
  const snapshot = snapshotInput(decoded, issues);
  const legacy = exactRecord(snapshot, '$', ['version', 'selected'], issues);
  if (legacy) {
    if (legacy.version !== 1) addIssue(issues, '$.version', 'unsupported-value', 'must equal 1');
    oneOf(legacy.selected, CURATED_KIT_IDS, '$.selected', issues);
  }
  if (issues.length > 0 || !legacy) {
    return Object.freeze({ kind: 'invalid', reason: 'schema', issues: sortedIssues(issues) });
  }
  return Object.freeze({ kind: 'valid', kitId: legacy.selected as FieldKitId });
}

export interface LoadoutStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadoutWriteCheckpoint =
  | 'before-stage'
  | 'after-stage'
  | 'before-readback'
  | 'after-readback'
  | 'before-commit'
  | 'after-commit';

export type LoadoutWriteFailureCode =
  | 'invalid-candidate'
  | 'checkpoint-failed'
  | 'storage-failed'
  | 'stage-missing'
  | 'stage-invalid'
  | 'stage-mismatch';

export type LoadoutWritePhase = 'validate' | 'stage' | 'readback' | 'commit';

export type LoadoutWriteResult =
  | Readonly<{
    ok: true;
    value: LoadoutStorageV2;
    stageCleanup: 'removed' | 'retained-remove-failure';
  }>
  | Readonly<{
    ok: false;
    code: LoadoutWriteFailureCode;
    phase: LoadoutWritePhase;
    checkpoint?: LoadoutWriteCheckpoint;
    committed: boolean;
    issues?: readonly LoadoutSchemaIssue[];
  }>;

export type LoadoutWriteOptions = Readonly<{
  checkpoint?: (point: LoadoutWriteCheckpoint) => void;
}>;

function checkpointFailure(
  checkpoint: LoadoutWriteCheckpoint,
  phase: LoadoutWritePhase,
  committed: boolean,
): LoadoutWriteResult {
  return Object.freeze({ ok: false, code: 'checkpoint-failed', phase, checkpoint, committed });
}

function runCheckpoint(
  options: LoadoutWriteOptions | undefined,
  checkpoint: LoadoutWriteCheckpoint,
  phase: LoadoutWritePhase,
  committed: boolean,
): LoadoutWriteResult | null {
  try {
    options?.checkpoint?.(checkpoint);
    return null;
  } catch {
    return checkpointFailure(checkpoint, phase, committed);
  }
}

export function writeLoadoutStorageV2Transaction(
  storage: LoadoutStorageAdapter,
  candidate: unknown,
  eligibility: LoadoutItemEligibility,
  options?: LoadoutWriteOptions,
): LoadoutWriteResult {
  let parsed: LoadoutStorageV2;
  try {
    parsed = parseLoadoutStorageV2(candidate, eligibility);
  } catch (error) {
    if (!(error instanceof LoadoutSchemaValidationError)) throw error;
    return Object.freeze({
      ok: false,
      code: 'invalid-candidate',
      phase: 'validate',
      committed: false,
      issues: error.issues,
    });
  }
  const canonical = JSON.stringify(parsed);

  const beforeStage = runCheckpoint(options, 'before-stage', 'stage', false);
  if (beforeStage) return beforeStage;
  try {
    storage.setItem(LOADOUT_STORAGE_V2_STAGE_KEY, canonical);
  } catch {
    return Object.freeze({ ok: false, code: 'storage-failed', phase: 'stage', committed: false });
  }
  const afterStage = runCheckpoint(options, 'after-stage', 'stage', false);
  if (afterStage) return afterStage;

  const beforeReadback = runCheckpoint(options, 'before-readback', 'readback', false);
  if (beforeReadback) return beforeReadback;
  let stagedSerialized: string | null;
  try {
    stagedSerialized = storage.getItem(LOADOUT_STORAGE_V2_STAGE_KEY);
  } catch {
    return Object.freeze({ ok: false, code: 'storage-failed', phase: 'readback', committed: false });
  }
  if (stagedSerialized === null) {
    return Object.freeze({ ok: false, code: 'stage-missing', phase: 'readback', committed: false });
  }
  const staged = decodeLoadoutStorageV2(stagedSerialized, eligibility);
  if (!staged.ok) {
    return Object.freeze({
      ok: false,
      code: 'stage-invalid',
      phase: 'readback',
      committed: false,
      issues: staged.issues,
    });
  }
  const normalizedStaged = JSON.stringify(staged.value);
  if (normalizedStaged !== canonical) {
    return Object.freeze({ ok: false, code: 'stage-mismatch', phase: 'readback', committed: false });
  }
  const afterReadback = runCheckpoint(options, 'after-readback', 'readback', false);
  if (afterReadback) return afterReadback;

  const beforeCommit = runCheckpoint(options, 'before-commit', 'commit', false);
  if (beforeCommit) return beforeCommit;
  try {
    storage.setItem(LOADOUT_STORAGE_V2_KEY, normalizedStaged);
  } catch {
    return Object.freeze({ ok: false, code: 'storage-failed', phase: 'commit', committed: false });
  }
  const afterCommit = runCheckpoint(options, 'after-commit', 'commit', true);
  if (afterCommit) return afterCommit;

  let stageCleanup: 'removed' | 'retained-remove-failure' = 'removed';
  try {
    storage.removeItem(LOADOUT_STORAGE_V2_STAGE_KEY);
  } catch {
    stageCleanup = 'retained-remove-failure';
  }
  return Object.freeze({ ok: true, value: staged.value, stageCleanup });
}

export type LoadoutMigrationResult =
  | Readonly<{
    ok: true;
    status: 'already-v2' | 'migrated';
    value: LoadoutStorageV2;
    legacySource: 'not-read' | 'valid' | 'invalid' | 'missing';
    write?: LoadoutWriteResult;
  }>
  | Readonly<{
    ok: false;
    status: 'failed';
    phase: 'read-current' | 'read-legacy' | 'write';
    committed: boolean;
    write?: LoadoutWriteResult;
  }>;

export function migrateLegacyFieldKitStorageV1(
  storage: LoadoutStorageAdapter,
  initialCustomPresets: unknown,
  eligibility: LoadoutItemEligibility,
  options?: LoadoutWriteOptions,
): LoadoutMigrationResult {
  let currentSerialized: string | null;
  try {
    currentSerialized = storage.getItem(LOADOUT_STORAGE_V2_KEY);
  } catch {
    return Object.freeze({ ok: false, status: 'failed', phase: 'read-current', committed: false });
  }
  if (currentSerialized !== null) {
    const current = decodeLoadoutStorageV2(currentSerialized, eligibility);
    if (current.ok) {
      return Object.freeze({
        ok: true,
        status: 'already-v2',
        value: current.value,
        legacySource: 'not-read',
      });
    }
  }

  let legacySerialized: string | null;
  try {
    legacySerialized = storage.getItem(LOADOUT_LEGACY_V1_KEY);
  } catch {
    return Object.freeze({ ok: false, status: 'failed', phase: 'read-legacy', committed: false });
  }
  const legacy = decodeLegacyFieldKitSelectionV1(legacySerialized);
  const legacySource = legacy.kind;
  const kitId = legacy.kind === 'valid' ? legacy.kitId : DEFAULT_FIELD_KIT;
  const candidate = {
    schemaVersion: LOADOUT_STORAGE_SCHEMA_VERSION,
    selected: { kind: 'curated', kitId },
    customPresets: initialCustomPresets,
  };
  const write = writeLoadoutStorageV2Transaction(storage, candidate, eligibility, options);
  if (!write.ok) {
    return Object.freeze({
      ok: false,
      status: 'failed',
      phase: 'write',
      committed: write.committed,
      write,
    });
  }
  return Object.freeze({ ok: true, status: 'migrated', value: write.value, legacySource, write });
}

export type LegacyCleanupStatus =
  | 'absent'
  | 'removed-valid'
  | 'retained-invalid'
  | 'retained-read-failure'
  | 'retained-remove-failure';

export type LoadoutLoadResult =
  | Readonly<{
    ok: true;
    value: LoadoutStorageV2;
    legacyCleanup: LegacyCleanupStatus;
  }>
  | Readonly<{
    ok: false;
    reason: 'missing' | 'storage-failed' | LoadoutDecodeFailureReason;
    issues?: readonly LoadoutSchemaIssue[];
  }>;

export function loadLoadoutStorageV2(
  storage: LoadoutStorageAdapter,
  eligibility: LoadoutItemEligibility,
): LoadoutLoadResult {
  let serialized: string | null;
  try {
    serialized = storage.getItem(LOADOUT_STORAGE_V2_KEY);
  } catch {
    return Object.freeze({ ok: false, reason: 'storage-failed' });
  }
  if (serialized === null) return Object.freeze({ ok: false, reason: 'missing' });
  const decoded = decodeLoadoutStorageV2(serialized, eligibility);
  if (!decoded.ok) {
    return Object.freeze({ ok: false, reason: decoded.reason, issues: decoded.issues });
  }

  let legacySerialized: string | null;
  try {
    legacySerialized = storage.getItem(LOADOUT_LEGACY_V1_KEY);
  } catch {
    return Object.freeze({
      ok: true,
      value: decoded.value,
      legacyCleanup: 'retained-read-failure',
    });
  }
  const legacy = decodeLegacyFieldKitSelectionV1(legacySerialized);
  if (legacy.kind === 'missing') {
    return Object.freeze({ ok: true, value: decoded.value, legacyCleanup: 'absent' });
  }
  if (legacy.kind === 'invalid') {
    return Object.freeze({ ok: true, value: decoded.value, legacyCleanup: 'retained-invalid' });
  }
  try {
    storage.removeItem(LOADOUT_LEGACY_V1_KEY);
  } catch {
    return Object.freeze({
      ok: true,
      value: decoded.value,
      legacyCleanup: 'retained-remove-failure',
    });
  }
  return Object.freeze({ ok: true, value: decoded.value, legacyCleanup: 'removed-valid' });
}
