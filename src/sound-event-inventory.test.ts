import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS } from './map-selection';
import { WEAPON_IDS } from './protocol';
import {
  AUDIO_BUS_IDS,
  CURRENT_RUNTIME_SOUND_CALLSITE_CONTRACT,
  PASS64_WEAPON_AUDIO_VARIANTS,
  REQUIRED_SOUND_EVENT_IDS,
  RUNTIME_AUDIO_NON_EVENT_METHODS,
  SOUND_AGGREGATE_VOICE_POOL_IDS,
  SOUND_AGGREGATE_VOICE_POOLS,
  SOUND_CONCURRENCY_OVERFLOW_POLICIES,
  SOUND_CONCURRENCY_SCOPES,
  SOUND_DELIVERY_POLICIES,
  SOUND_EVENT_COVERAGE_STATUSES,
  SOUND_EVENT_FAMILIES,
  SOUND_EVENT_INVENTORY,
  SOUND_EVENT_INVENTORY_SHA256,
  SOUND_LIFECYCLE_OWNERS,
  SOUND_PROVENANCE_DIGEST_AUTHORITIES,
  SOUND_PROVENANCE_POLICIES,
  SOUND_PROVENANCE_STATUSES,
  SOUND_VARIANT_MODES,
  canonicalSoundEventInventoryJson,
  runtimeSoundCallsiteIdentity,
  verifySoundEventInventory,
  type RuntimeSoundCallsiteContractEntry,
  type SoundEventId,
  type SoundEventInventoryEntry,
} from './sound-event-inventory';

type ObservedRuntimeSoundCallsite = Omit<RuntimeSoundCallsiteContractEntry, 'eventIds'>;
type EventMutation = readonly [
  label: string,
  mutate: (event: SoundEventInventoryEntry) => SoundEventInventoryEntry,
  expectedError: string,
];

const ALLOWED_VALUE_REGISTRIES: readonly (readonly [string, readonly string[]])[] = [
  ['bus', AUDIO_BUS_IDS],
  ['family', SOUND_EVENT_FAMILIES],
  ['delivery', SOUND_DELIVERY_POLICIES],
  ['variant mode', SOUND_VARIANT_MODES],
  ['coverage status', SOUND_EVENT_COVERAGE_STATUSES],
  ['lifecycle owner', SOUND_LIFECYCLE_OWNERS],
  ['concurrency scope', SOUND_CONCURRENCY_SCOPES],
  ['concurrency overflow', SOUND_CONCURRENCY_OVERFLOW_POLICIES],
  ['provenance policy', SOUND_PROVENANCE_POLICIES],
  ['provenance status', SOUND_PROVENANCE_STATUSES],
  ['provenance digest authority', SOUND_PROVENANCE_DIGEST_AUTHORITIES],
  ['aggregate voice pool', SOUND_AGGREGATE_VOICE_POOL_IDS],
];

const INVALID_DISCRIMINANT_MUTATIONS: readonly EventMutation[] = [
  ['family', (event) => ({ ...event, family: 'invalid-family' }) as unknown as SoundEventInventoryEntry, 'unknown family invalid-family'],
  ['bus', (event) => ({ ...event, bus: 'invalid-bus' }) as unknown as SoundEventInventoryEntry, 'unknown bus invalid-bus'],
  ['delivery', (event) => ({ ...event, delivery: 'invalid-delivery' }) as unknown as SoundEventInventoryEntry, 'unknown delivery invalid-delivery'],
  ['variant mode', (event) => ({
    ...event, variants: { ...event.variants, mode: 'invalid-variant-mode' },
  }) as unknown as SoundEventInventoryEntry, 'unknown variant mode invalid-variant-mode'],
  ['coverage status', (event) => ({
    ...event, coverage: { ...event.coverage, status: 'invalid-coverage' },
  }) as unknown as SoundEventInventoryEntry, 'unknown coverage status invalid-coverage'],
  ['lifecycle owner', (event) => ({
    ...event, lifecycleOwner: 'invalid-lifecycle-owner',
  }) as unknown as SoundEventInventoryEntry, 'unknown lifecycle owner invalid-lifecycle-owner'],
  ['concurrency scope', (event) => ({
    ...event, concurrency: { ...event.concurrency, scope: 'invalid-scope' },
  }) as unknown as SoundEventInventoryEntry, 'unknown concurrency scope invalid-scope'],
  ['concurrency overflow', (event) => ({
    ...event, concurrency: { ...event.concurrency, overflow: 'invalid-overflow' },
  }) as unknown as SoundEventInventoryEntry, 'unknown concurrency overflow invalid-overflow'],
  ['provenance policy', (event) => ({
    ...event, provenance: { ...event.provenance, policy: 'invalid-provenance-policy' },
  }) as unknown as SoundEventInventoryEntry, 'unknown provenance policy invalid-provenance-policy'],
  ['provenance status', (event) => ({
    ...event, provenance: { ...event.provenance, status: 'invalid-provenance-status' },
  }) as unknown as SoundEventInventoryEntry, 'unknown provenance status invalid-provenance-status'],
  ['provenance digest authority', (event) => ({
    ...event, provenance: { ...event.provenance, digestAuthority: 'invalid-digest-authority' },
  }) as unknown as SoundEventInventoryEntry, 'unknown provenance digest authority invalid-digest-authority'],
  ['aggregate voice pool', (event) => ({
    ...event, concurrency: { ...event.concurrency, aggregatePoolId: 'invalid-pool' },
  }) as unknown as SoundEventInventoryEntry, 'unknown aggregate voice pool invalid-pool'],
];

function replaceEvent(
  id: SoundEventId,
  mutate: (event: SoundEventInventoryEntry) => SoundEventInventoryEntry,
): readonly SoundEventInventoryEntry[] {
  return SOUND_EVENT_INVENTORY.map((event) => event.id === id ? mutate(event) : event);
}

function runtimeTypeScriptPaths(directory = 'src'): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...runtimeTypeScriptPaths(path));
    else if (entry.isFile()
      && path.endsWith('.ts')
      && !path.endsWith('.d.ts')
      && !/\.(?:test|spec)\.ts$/.test(path)) paths.push(path.replaceAll('\\', '/'));
  }
  return paths.sort();
}

function normalizeAstArgument(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function scanRuntimeSoundCallsites(): ObservedRuntimeSoundCallsite[] {
  const groups = new Map<string, ObservedRuntimeSoundCallsite>();
  for (const sourcePath of runtimeTypeScriptPaths()) {
    const source = readFileSync(sourcePath, 'utf8');
    const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'audio') {
        const emitterSymbol = node.expression.name.text;
        if (!(RUNTIME_AUDIO_NON_EVENT_METHODS as readonly string[]).includes(emitterSymbol)) {
          const argumentSignature = node.arguments
            .map((argument) => normalizeAstArgument(argument.getText(sourceFile)))
            .join(',');
          const candidate: ObservedRuntimeSoundCallsite = {
            sourcePath,
            emitterSymbol,
            argumentSignature,
            occurrences: 1,
          };
          const identity = runtimeSoundCallsiteIdentity(candidate);
          const previous = groups.get(identity);
          groups.set(identity, { ...candidate, occurrences: (previous?.occurrences ?? 0) + 1 });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return [...groups.values()].sort((left, right) =>
    runtimeSoundCallsiteIdentity(left).localeCompare(runtimeSoundCallsiteIdentity(right)));
}

describe('Pass 65 sound-event inventory', () => {
  it('satisfies the complete typed policy and independent exact-ID contract', () => {
    const inventoryIds = SOUND_EVENT_INVENTORY.map((event) => event.id);
    expect(verifySoundEventInventory(SOUND_EVENT_INVENTORY)).toEqual([]);
    expect(inventoryIds).toEqual(REQUIRED_SOUND_EVENT_IDS);
    expect(new Set(REQUIRED_SOUND_EVENT_IDS).size).toBe(REQUIRED_SOUND_EVENT_IDS.length);
    expect(new Set(inventoryIds).size).toBe(inventoryIds.length);
    expect(new Set(SOUND_EVENT_INVENTORY.map((event) => event.family))).toEqual(new Set(SOUND_EVENT_FAMILIES));
  });

  it.each(REQUIRED_SOUND_EVENT_IDS)('rejects deletion of required event %s', (missingId) => {
    const fixture = SOUND_EVENT_INVENTORY.filter((event) => event.id !== missingId);
    expect(fixture).toHaveLength(SOUND_EVENT_INVENTORY.length - 1);
    expect(verifySoundEventInventory(fixture)).toContain(`missing sound event: ${missingId}`);
  });

  it('rejects extra and duplicate event IDs against the exact contract', () => {
    const first = SOUND_EVENT_INVENTORY[0]!;
    const extra = { ...first, id: 'unregistered.extra' } as unknown as SoundEventInventoryEntry;
    expect(verifySoundEventInventory([...SOUND_EVENT_INVENTORY, extra]))
      .toContain('unregistered sound event: unregistered.extra');
    expect(verifySoundEventInventory([...SOUND_EVENT_INVENTORY, first]))
      .toContain(`duplicate sound event: ${first.id}`);
  });

  it.each(ALLOWED_VALUE_REGISTRIES)('exports an immutable unique %s registry', (_label, registry) => {
    expect(Object.isFrozen(registry)).toBe(true);
    expect(registry.length).toBeGreaterThan(0);
    expect(new Set(registry).size).toBe(registry.length);
  });

  it.each(INVALID_DISCRIMINANT_MUTATIONS)('rejects invalid %s discriminants', (_label, mutate, expectedError) => {
    const firstId = REQUIRED_SOUND_EVENT_IDS[0];
    const errors = verifySoundEventInventory(replaceEvent(firstId, mutate));
    expect(errors.some((error) => error.includes(expectedError))).toBe(true);
  });

  it('enforces one voice per world-loop source plus hard aggregate pool caps', () => {
    const expectedWorldLoopIds: readonly SoundEventId[] = [
      'ordnance.smoke-loop',
      'support.care-aircraft',
      'support.care-crate-descent',
      'support.chopper-rotor',
      'support.carpet-aircraft',
      'support.drone-rotor',
      'shed.door-motion',
      'ambience.arena-bed',
    ];
    const worldLoops = SOUND_EVENT_INVENTORY.filter((event) =>
      event.concurrency.aggregatePoolId === 'world-continuous');
    expect(worldLoops.map((event) => event.id)).toEqual(expectedWorldLoopIds);
    expect(worldLoops.every((event) => event.concurrency.scope === 'per-source'
      && event.concurrency.maximumVoices === 1)).toBe(true);
    expect(SOUND_AGGREGATE_VOICE_POOLS['world-continuous'].maximumVoices).toBe(12);
    expect(Object.isFrozen(SOUND_AGGREGATE_VOICE_POOLS)).toBe(true);
    expect(Object.values(SOUND_AGGREGATE_VOICE_POOLS).every(Object.isFrozen)).toBe(true);
    expect(new Set(SOUND_EVENT_INVENTORY.map((event) => event.concurrency.aggregatePoolId)))
      .toEqual(new Set(SOUND_AGGREGATE_VOICE_POOL_IDS));
    for (const event of SOUND_EVENT_INVENTORY) {
      expect(event.concurrency.maximumVoices)
        .toBeLessThanOrEqual(SOUND_AGGREGATE_VOICE_POOLS[event.concurrency.aggregatePoolId].maximumVoices);
    }
  });

  it('rejects ambiguous or aggregate-overbudget per-source loop mutations', () => {
    const id: SoundEventId = 'ordnance.smoke-loop';
    const perSourceFixture = replaceEvent(id, (event) => ({
      ...event, concurrency: { ...event.concurrency, maximumVoices: 2 },
    }));
    expect(verifySoundEventInventory(perSourceFixture))
      .toContain(`${id}: per-source concurrency must allow exactly one voice`);

    const poolCap = SOUND_AGGREGATE_VOICE_POOLS['world-continuous'].maximumVoices;
    const aggregateFixture = replaceEvent(id, (event) => ({
      ...event, concurrency: { ...event.concurrency, maximumVoices: poolCap + 1 },
    }));
    expect(verifySoundEventInventory(aggregateFixture))
      .toContain(`${id}: maximumVoices exceeds aggregate pool world-continuous cap ${poolCap}`);
  });

  it('matches every semantic runtime audio call across all non-test TypeScript sources', () => {
    const expected: ObservedRuntimeSoundCallsite[] = CURRENT_RUNTIME_SOUND_CALLSITE_CONTRACT.map((entry) => ({
      sourcePath: entry.sourcePath,
      emitterSymbol: entry.emitterSymbol,
      argumentSignature: entry.argumentSignature,
      occurrences: entry.occurrences,
    })).sort((left, right) => runtimeSoundCallsiteIdentity(left).localeCompare(runtimeSoundCallsiteIdentity(right)));
    const observed = scanRuntimeSoundCallsites();

    expect(runtimeTypeScriptPaths().length).toBeGreaterThan(1);
    expect(observed).toEqual(expected);
    expect(verifySoundEventInventory(SOUND_EVENT_INVENTORY, {
      observedRuntimeEmitterSymbols: observed.map((callsite) => callsite.emitterSymbol),
    })).toEqual([]);
  });

  it('resolves every observed emitter symbol and maps every current event to semantic callsites', () => {
    const audioSource = readFileSync('src/audio.ts', 'utf8');
    const currentEvents = SOUND_EVENT_INVENTORY.filter((event) => event.coverage.status !== 'planned');
    const mappedEventIds = new Set(CURRENT_RUNTIME_SOUND_CALLSITE_CONTRACT.flatMap((entry) => entry.eventIds));
    const emitterSymbols = new Set(CURRENT_RUNTIME_SOUND_CALLSITE_CONTRACT.map((entry) => entry.emitterSymbol));

    expect(currentEvents.every((event) => mappedEventIds.has(event.id))).toBe(true);
    for (const symbol of emitterSymbols) expect(audioSource).toMatch(new RegExp(`\\n  ${symbol}\\(`));
  });

  // HF-359: 5 implemented arena ambience identities
  it('pins current weapon variants and all five implemented arena ambience identities', () => {
    expect(PASS64_WEAPON_AUDIO_VARIANTS).toEqual(WEAPON_IDS);
    const ambience = SOUND_EVENT_INVENTORY.find((event) => event.id === 'ambience.arena-bed');
    expect(ambience).toBeDefined();
    const coveredArenaIds = new Set(ambience!.variants.ids.map((variant) => variant.split('.')[0]));
    expect(coveredArenaIds).toEqual(new Set(ARENA_SELECTIONS.map((arena) => arena.id)));
  });

  it('keeps observed and planned provenance claims mechanically distinct', () => {
    const observed = SOUND_EVENT_INVENTORY.filter((event) => event.coverage.status !== 'planned');
    const planned = SOUND_EVENT_INVENTORY.filter((event) => event.coverage.status === 'planned');

    expect(observed.length).toBeGreaterThan(0);
    expect(planned.length).toBeGreaterThan(0);
    expect(observed.every((event) => event.provenance.status === 'verified-existing-source'
      && event.source.runtimeEmitterSymbols.length > 0)).toBe(true);
    expect(planned.every((event) => event.provenance.status === 'required-before-runtime'
      && event.source.runtimeEmitterSymbols.length === 0)).toBe(true);
  });

  it('has a stable inventory digest', () => {
    const digest = createHash('sha256').update(canonicalSoundEventInventoryJson()).digest('hex');
    expect(REQUIRED_SOUND_EVENT_IDS).toHaveLength(SOUND_EVENT_INVENTORY.length);
    // HF-337: updated expected digest for positional chopper and drone gun sound events
    expect(SOUND_EVENT_INVENTORY_SHA256).toBe('a5503dba3f6fed6eab7ac91a2dfa96c9f21f9191f3d4fb280efd8278449750c7');
    expect(digest).toBe(SOUND_EVENT_INVENTORY_SHA256);
  });
});
