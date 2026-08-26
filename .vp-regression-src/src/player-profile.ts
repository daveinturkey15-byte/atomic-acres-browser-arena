import {
  PASS65_SETTINGS_STORAGE_KEY,
  createDefaultPass65Settings,
  normalizePass65Settings,
  parsePass65Settings,
  type CapabilityHints,
  type Pass65Settings,
} from './pass65-settings';
import {
  LOADOUT_LEGACY_V1_KEY,
  LOADOUT_STORAGE_SCHEMA_VERSION,
  LOADOUT_STORAGE_V2_KEY,
  LOADOUT_STORAGE_V2_STAGE_KEY,
  decodeLegacyFieldKitSelectionV1,
  decodeLoadoutStorageV2,
  parseLoadoutStorageV2,
  type LoadoutItemEligibility,
  type LoadoutStorageV2,
} from './loadout-preset-schema';
import {
  DEFAULT_KILLSTREAK_LOADOUT,
  KILLSTREAK_LOADOUT_STORAGE_KEY,
} from './killstreak-loadout';
import { parseKillstreakLoadout, type KillstreakLoadoutV1 } from './killstreak-catalog';
import { RENDER_PROFILE_STORAGE_KEY } from './render-profile';

export const PLAYER_PROFILE_SCHEMA_VERSION = 1 as const;
export const PLAYER_PROFILE_STORAGE_KEY = 'atomic-acres.player-profile.v1' as const;
export const LEGACY_MOUSE_SENSITIVITY_STORAGE_KEY = 'atomic-acres-sensitivity' as const;
export const LEGACY_CONTROLLER_SENSITIVITY_STORAGE_KEY = 'atomic-acres-controller-sensitivity' as const;
export const LEGACY_FOV_STORAGE_KEY = 'atomic-acres-fov' as const;
export const MAX_SERIALIZED_PLAYER_PROFILE_LENGTH = 131_072;

export const PLAYER_PROFILE_LEGACY_KEYS = Object.freeze([
  PASS65_SETTINGS_STORAGE_KEY,
  RENDER_PROFILE_STORAGE_KEY,
  LOADOUT_STORAGE_V2_KEY,
  LOADOUT_STORAGE_V2_STAGE_KEY,
  LOADOUT_LEGACY_V1_KEY,
  KILLSTREAK_LOADOUT_STORAGE_KEY,
  LEGACY_MOUSE_SENSITIVITY_STORAGE_KEY,
  LEGACY_CONTROLLER_SENSITIVITY_STORAGE_KEY,
  LEGACY_FOV_STORAGE_KEY,
] as const);

export type PlayerControlPreferencesV1 = Readonly<{
  schemaVersion: 1;
  mouseSensitivity: number;
  controllerSensitivity: number;
  fieldOfView: number;
}>;

export type PlayerProfileV1 = Readonly<{
  schemaVersion: typeof PLAYER_PROFILE_SCHEMA_VERSION;
  revision: number;
  settings: Pass65Settings;
  controls: PlayerControlPreferencesV1;
  loadout: LoadoutStorageV2;
  killstreakLoadout: KillstreakLoadoutV1;
}>;

export type PlayerProfileContext = Readonly<{
  capabilityHints?: CapabilityHints;
  loadoutEligibility: LoadoutItemEligibility;
  defaultLoadout: LoadoutStorageV2;
}>;

export interface PlayerProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type PlayerProfileDecodeResult =
  | Readonly<{ ok: true; value: PlayerProfileV1 }>
  | Readonly<{ ok: false; reason: 'too-large' | 'json' | 'schema' | 'future-version'; futureVersion?: number }>;

export type PlayerProfileWriteCheckpoint = 'before-write' | 'after-write' | 'before-readback' | 'after-readback';

export type PlayerProfileWriteResult =
  | Readonly<{ ok: true; value: PlayerProfileV1 }>
  | Readonly<{
    ok: false;
    reason: 'invalid-candidate' | 'storage-unavailable' | 'storage-failed' | 'readback-mismatch' | 'checkpoint-failed';
    checkpoint?: PlayerProfileWriteCheckpoint;
    rollback: 'not-needed' | 'restored' | 'removed' | 'failed';
  }>;

export type PlayerProfileWriteFailureReason = Extract<PlayerProfileWriteResult, { ok: false }>['reason'];

export type PlayerProfileWriteOptions = Readonly<{
  checkpoint?: (point: PlayerProfileWriteCheckpoint) => void;
}>;

export type PlayerProfileCleanup = Readonly<{
  removed: readonly string[];
  failed: readonly string[];
}>;

export type PlayerProfileLoadResult = Readonly<{
  profile: PlayerProfileV1;
  source: 'persisted' | 'migrated' | 'default-created' | 'recovered-corrupt' | 'future-default' | 'storage-unavailable';
  writeProtected: boolean;
  canonicalWrite: PlayerProfileWriteResult | null;
  legacyCleanup: PlayerProfileCleanup;
  futureVersion?: number;
}>;

export type PlayerProfilePatch = Readonly<{
  settings?: Pass65Settings;
  controls?: PlayerControlPreferencesV1;
  loadout?: LoadoutStorageV2;
  killstreakLoadout?: KillstreakLoadoutV1;
}>;

export type PlayerProfileUpdateResult =
  | Readonly<{ ok: true; persisted: true; value: PlayerProfileV1 }>
  | Readonly<{
    ok: false;
    persisted: false;
    reason: 'future-version' | PlayerProfileWriteFailureReason;
    value: PlayerProfileV1;
  }>;

const PROFILE_KEYS = Object.freeze(['schemaVersion', 'revision', 'settings', 'controls', 'loadout', 'killstreakLoadout'] as const);
const CONTROL_KEYS = Object.freeze(['schemaVersion', 'mouseSensitivity', 'controllerSensitivity', 'fieldOfView'] as const);

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length && actual.every((key, index) => key === canonical[index]);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedNumber(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

function parseControls(value: unknown): PlayerControlPreferencesV1 {
  const record = objectRecord(value);
  if (!record || !exactKeys(record, CONTROL_KEYS) || record.schemaVersion !== 1) throw new Error('invalid controls');
  const mouseSensitivity = boundedNumber(record.mouseSensitivity, 0.6, 2);
  const controllerSensitivity = boundedNumber(record.controllerSensitivity, 0.5, 1.8);
  const fieldOfView = boundedNumber(record.fieldOfView, 70, 100);
  if (mouseSensitivity === null || controllerSensitivity === null || fieldOfView === null) throw new Error('invalid controls');
  return Object.freeze({ schemaVersion: 1, mouseSensitivity, controllerSensitivity, fieldOfView });
}

function cloneKillstreakLoadout(value: KillstreakLoadoutV1): KillstreakLoadoutV1 {
  return parseKillstreakLoadout({ schemaVersion: 1, slots: [...value.slots] });
}

export function createDefaultPlayerControls(): PlayerControlPreferencesV1 {
  return Object.freeze({ schemaVersion: 1, mouseSensitivity: 1, controllerSensitivity: 1, fieldOfView: 82 });
}

export function parsePlayerProfile(value: unknown, context: PlayerProfileContext): PlayerProfileV1 {
  const record = objectRecord(value);
  if (!record || !exactKeys(record, PROFILE_KEYS)) throw new Error('invalid player profile');
  if (record.schemaVersion !== PLAYER_PROFILE_SCHEMA_VERSION) throw new Error('unsupported player profile version');
  if (!Number.isSafeInteger(record.revision) || (record.revision as number) < 1) throw new Error('invalid player profile revision');
  const settingsRecord = objectRecord(record.settings);
  if (!settingsRecord || settingsRecord.version !== 1) throw new Error('invalid settings profile');
  const settings = normalizePass65Settings(settingsRecord, context.capabilityHints);
  const controls = parseControls(record.controls);
  const loadout = parseLoadoutStorageV2(record.loadout, context.loadoutEligibility);
  const killstreakLoadout = parseKillstreakLoadout(record.killstreakLoadout);
  return Object.freeze({
    schemaVersion: PLAYER_PROFILE_SCHEMA_VERSION,
    revision: record.revision as number,
    settings,
    controls,
    loadout,
    killstreakLoadout,
  });
}

export function decodePlayerProfile(serialized: string, context: PlayerProfileContext): PlayerProfileDecodeResult {
  if (serialized.length > MAX_SERIALIZED_PLAYER_PROFILE_LENGTH) return Object.freeze({ ok: false, reason: 'too-large' });
  let decoded: unknown;
  try {
    decoded = JSON.parse(serialized) as unknown;
  } catch {
    return Object.freeze({ ok: false, reason: 'json' });
  }
  const record = objectRecord(decoded);
  if (record && typeof record.schemaVersion === 'number' && Number.isSafeInteger(record.schemaVersion)
    && record.schemaVersion > PLAYER_PROFILE_SCHEMA_VERSION) {
    return Object.freeze({ ok: false, reason: 'future-version', futureVersion: record.schemaVersion });
  }
  try {
    return Object.freeze({ ok: true, value: parsePlayerProfile(decoded, context) });
  } catch {
    return Object.freeze({ ok: false, reason: 'schema' });
  }
}

export function createDefaultPlayerProfile(context: PlayerProfileContext): PlayerProfileV1 {
  return parsePlayerProfile({
    schemaVersion: PLAYER_PROFILE_SCHEMA_VERSION,
    revision: 1,
    settings: createDefaultPass65Settings(context.capabilityHints),
    controls: createDefaultPlayerControls(),
    loadout: context.defaultLoadout,
    killstreakLoadout: DEFAULT_KILLSTREAK_LOADOUT,
  }, context);
}

export function createNextPlayerProfile(
  current: PlayerProfileV1,
  patch: PlayerProfilePatch,
  context: PlayerProfileContext,
): PlayerProfileV1 {
  if (current.revision >= Number.MAX_SAFE_INTEGER) throw new Error('player profile revision exhausted');
  return parsePlayerProfile({
    schemaVersion: PLAYER_PROFILE_SCHEMA_VERSION,
    revision: current.revision + 1,
    settings: patch.settings ?? current.settings,
    controls: patch.controls ?? current.controls,
    loadout: patch.loadout ?? current.loadout,
    killstreakLoadout: patch.killstreakLoadout ?? current.killstreakLoadout,
  }, context);
}

function rollbackProfileWrite(
  storage: PlayerProfileStorage,
  prior: string | null,
): Extract<PlayerProfileWriteResult, { ok: false }>['rollback'] {
  try {
    if (prior === null) {
      storage.removeItem(PLAYER_PROFILE_STORAGE_KEY);
      return 'removed';
    }
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, prior);
    return 'restored';
  } catch {
    return 'failed';
  }
}

export function writePlayerProfile(
  storage: PlayerProfileStorage | null,
  candidate: unknown,
  context: PlayerProfileContext,
  options?: PlayerProfileWriteOptions,
): PlayerProfileWriteResult {
  if (!storage) return Object.freeze({ ok: false, reason: 'storage-unavailable', rollback: 'not-needed' });
  let profile: PlayerProfileV1;
  try {
    profile = parsePlayerProfile(candidate, context);
  } catch {
    return Object.freeze({ ok: false, reason: 'invalid-candidate', rollback: 'not-needed' });
  }
  const canonical = JSON.stringify(profile);
  let prior: string | null;
  try {
    prior = storage.getItem(PLAYER_PROFILE_STORAGE_KEY);
  } catch {
    return Object.freeze({ ok: false, reason: 'storage-failed', rollback: 'not-needed' });
  }
  const checkpoint = (point: PlayerProfileWriteCheckpoint, wrote: boolean): PlayerProfileWriteResult | null => {
    try {
      options?.checkpoint?.(point);
      return null;
    } catch {
      return Object.freeze({
        ok: false,
        reason: 'checkpoint-failed',
        checkpoint: point,
        rollback: wrote ? rollbackProfileWrite(storage, prior) : 'not-needed',
      });
    }
  };
  const beforeWrite = checkpoint('before-write', false);
  if (beforeWrite) return beforeWrite;
  try {
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, canonical);
  } catch {
    return Object.freeze({ ok: false, reason: 'storage-failed', rollback: rollbackProfileWrite(storage, prior) });
  }
  const afterWrite = checkpoint('after-write', true);
  if (afterWrite) return afterWrite;
  const beforeReadback = checkpoint('before-readback', true);
  if (beforeReadback) return beforeReadback;
  let readBack: string | null;
  try {
    readBack = storage.getItem(PLAYER_PROFILE_STORAGE_KEY);
  } catch {
    return Object.freeze({ ok: false, reason: 'storage-failed', rollback: rollbackProfileWrite(storage, prior) });
  }
  if (readBack !== canonical) {
    return Object.freeze({ ok: false, reason: 'readback-mismatch', rollback: rollbackProfileWrite(storage, prior) });
  }
  const decoded = decodePlayerProfile(readBack, context);
  if (!decoded.ok || JSON.stringify(decoded.value) !== canonical) {
    return Object.freeze({ ok: false, reason: 'readback-mismatch', rollback: rollbackProfileWrite(storage, prior) });
  }
  const afterReadback = checkpoint('after-readback', true);
  if (afterReadback) return afterReadback;
  return Object.freeze({ ok: true, value: decoded.value });
}

function cleanupLegacyProfileKeys(storage: PlayerProfileStorage | null): PlayerProfileCleanup {
  if (!storage) return Object.freeze({ removed: Object.freeze([]), failed: Object.freeze([]) });
  const removed: string[] = [];
  const failed: string[] = [];
  for (const key of PLAYER_PROFILE_LEGACY_KEYS) {
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      failed.push(key);
    }
  }
  return Object.freeze({ removed: Object.freeze(removed), failed: Object.freeze(failed) });
}

class ProfileStorageReadError extends Error {}

function readLegacy(storage: PlayerProfileStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    throw new ProfileStorageReadError(`Unable to read ${key}`);
  }
}

function legacySettings(storage: PlayerProfileStorage, context: PlayerProfileContext): Pass65Settings {
  const serialized = readLegacy(storage, PASS65_SETTINGS_STORAGE_KEY);
  if (serialized !== null) {
    try {
      const decoded = JSON.parse(serialized) as unknown;
      const record = objectRecord(decoded);
      if (record?.version === 1) return parsePass65Settings(serialized, context.capabilityHints);
    } catch { /* Invalid legacy state falls through to privacy-safe defaults. */ }
    return createDefaultPass65Settings(context.capabilityHints);
  }
  const legacyRenderProfile = readLegacy(storage, RENDER_PROFILE_STORAGE_KEY);
  if (legacyRenderProfile === 'performance' || legacyRenderProfile === 'blender') {
    const defaults = createDefaultPass65Settings(context.capabilityHints);
    return normalizePass65Settings({
      ...defaults,
      graphics: { preset: legacyRenderProfile === 'performance' ? 'performance' : 'high' },
    }, context.capabilityHints);
  }
  return createDefaultPass65Settings(context.capabilityHints);
}

function legacyLoadout(storage: PlayerProfileStorage, context: PlayerProfileContext): LoadoutStorageV2 {
  const serialized = readLegacy(storage, LOADOUT_STORAGE_V2_KEY);
  if (serialized !== null) {
    const decoded = decodeLoadoutStorageV2(serialized, context.loadoutEligibility);
    if (decoded.ok) return decoded.value;
  }
  const legacy = decodeLegacyFieldKitSelectionV1(readLegacy(storage, LOADOUT_LEGACY_V1_KEY));
  if (legacy.kind !== 'valid') return parseLoadoutStorageV2(context.defaultLoadout, context.loadoutEligibility);
  return parseLoadoutStorageV2({
    schemaVersion: LOADOUT_STORAGE_SCHEMA_VERSION,
    selected: { kind: 'curated', kitId: legacy.kitId },
    customPresets: context.defaultLoadout.customPresets,
  }, context.loadoutEligibility);
}

function legacyKillstreakLoadout(storage: PlayerProfileStorage): KillstreakLoadoutV1 {
  const serialized = readLegacy(storage, KILLSTREAK_LOADOUT_STORAGE_KEY);
  if (serialized !== null) {
    try {
      return parseKillstreakLoadout(JSON.parse(serialized) as unknown);
    } catch { /* Invalid legacy state falls through to the legal default. */ }
  }
  return cloneKillstreakLoadout(DEFAULT_KILLSTREAK_LOADOUT);
}

function legacyRange(serialized: string | null, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(serialized);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function legacyControls(storage: PlayerProfileStorage): PlayerControlPreferencesV1 {
  const defaults = createDefaultPlayerControls();
  return Object.freeze({
    schemaVersion: 1,
    mouseSensitivity: legacyRange(readLegacy(storage, LEGACY_MOUSE_SENSITIVITY_STORAGE_KEY), defaults.mouseSensitivity, 0.6, 2),
    controllerSensitivity: legacyRange(readLegacy(storage, LEGACY_CONTROLLER_SENSITIVITY_STORAGE_KEY), defaults.controllerSensitivity, 0.5, 1.8),
    fieldOfView: legacyRange(readLegacy(storage, LEGACY_FOV_STORAGE_KEY), defaults.fieldOfView, 70, 100),
  });
}

function hasAnyLegacyProfileValue(storage: PlayerProfileStorage): boolean {
  for (const key of PLAYER_PROFILE_LEGACY_KEYS) {
    if (readLegacy(storage, key) !== null) return true;
  }
  return false;
}

function migrateLegacyProfile(storage: PlayerProfileStorage, context: PlayerProfileContext): PlayerProfileV1 {
  return parsePlayerProfile({
    schemaVersion: PLAYER_PROFILE_SCHEMA_VERSION,
    revision: 1,
    settings: legacySettings(storage, context),
    controls: legacyControls(storage),
    loadout: legacyLoadout(storage, context),
    killstreakLoadout: legacyKillstreakLoadout(storage),
  }, context);
}

const EMPTY_CLEANUP: PlayerProfileCleanup = Object.freeze({ removed: Object.freeze([]), failed: Object.freeze([]) });

export function loadPlayerProfile(
  storage: PlayerProfileStorage | null,
  context: PlayerProfileContext,
): PlayerProfileLoadResult {
  const defaults = createDefaultPlayerProfile(context);
  if (!storage) {
    return Object.freeze({
      profile: defaults,
      source: 'storage-unavailable',
      writeProtected: false,
      canonicalWrite: null,
      legacyCleanup: EMPTY_CLEANUP,
    });
  }
  let canonical: string | null;
  try {
    canonical = storage.getItem(PLAYER_PROFILE_STORAGE_KEY);
  } catch {
    return Object.freeze({
      profile: defaults,
      source: 'storage-unavailable',
      writeProtected: false,
      canonicalWrite: null,
      legacyCleanup: EMPTY_CLEANUP,
    });
  }
  if (canonical !== null) {
    const decoded = decodePlayerProfile(canonical, context);
    if (decoded.ok) {
      return Object.freeze({
        profile: decoded.value,
        source: 'persisted',
        writeProtected: false,
        canonicalWrite: null,
        legacyCleanup: cleanupLegacyProfileKeys(storage),
      });
    }
    if (decoded.reason === 'future-version') {
      return Object.freeze({
        profile: defaults,
        source: 'future-default',
        writeProtected: true,
        canonicalWrite: null,
        legacyCleanup: EMPTY_CLEANUP,
        futureVersion: decoded.futureVersion,
      });
    }
  }
  let hadLegacy = false;
  let migrated: PlayerProfileV1;
  try {
    hadLegacy = hasAnyLegacyProfileValue(storage);
    migrated = migrateLegacyProfile(storage, context);
  } catch (error) {
    if (!(error instanceof ProfileStorageReadError)) throw error;
    return Object.freeze({
      profile: defaults,
      source: 'storage-unavailable',
      writeProtected: false,
      canonicalWrite: null,
      legacyCleanup: EMPTY_CLEANUP,
    });
  }
  const write = writePlayerProfile(storage, migrated, context);
  const source = canonical !== null ? 'recovered-corrupt' : hadLegacy ? 'migrated' : 'default-created';
  return Object.freeze({
    profile: write.ok ? write.value : migrated,
    source,
    writeProtected: false,
    canonicalWrite: write,
    legacyCleanup: write.ok ? cleanupLegacyProfileKeys(storage) : EMPTY_CLEANUP,
  });
}

export class PlayerProfileStore {
  readonly loadResult: PlayerProfileLoadResult;
  private currentProfile: PlayerProfileV1;

  constructor(
    private readonly storage: PlayerProfileStorage | null,
    private readonly context: PlayerProfileContext,
  ) {
    this.loadResult = loadPlayerProfile(storage, context);
    this.currentProfile = this.loadResult.profile;
  }

  get current(): PlayerProfileV1 {
    return this.currentProfile;
  }

  update(
    patch: PlayerProfilePatch,
    options: Readonly<{ sessionOnFailure?: boolean }> = {},
  ): PlayerProfileUpdateResult {
    let next: PlayerProfileV1;
    try {
      next = createNextPlayerProfile(this.currentProfile, patch, this.context);
    } catch {
      return Object.freeze({ ok: false, persisted: false, reason: 'invalid-candidate', value: this.currentProfile });
    }
    if (this.loadResult.writeProtected) {
      if (options.sessionOnFailure) this.currentProfile = next;
      return Object.freeze({ ok: false, persisted: false, reason: 'future-version', value: this.currentProfile });
    }
    const result = writePlayerProfile(this.storage, next, this.context);
    if (result.ok) {
      this.currentProfile = result.value;
      return Object.freeze({ ok: true, persisted: true, value: result.value });
    }
    if (options.sessionOnFailure) this.currentProfile = next;
    return Object.freeze({ ok: false, persisted: false, reason: result.reason, value: this.currentProfile });
  }
}
