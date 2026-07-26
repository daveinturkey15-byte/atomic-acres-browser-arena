import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS } from './map-selection';
import { WEAPON_IDS } from './protocol';
import {
  AUDIO_BUS_IDS,
  PASS64_WEAPON_AUDIO_VARIANTS,
  REQUIRED_SOUND_EVENT_IDS,
  SOUND_EVENT_FAMILIES,
  SOUND_EVENT_INVENTORY,
  SOUND_EVENT_INVENTORY_SHA256,
  canonicalSoundEventInventoryJson,
  verifySoundEventInventory,
} from './sound-event-inventory';

const NON_EVENT_AUDIO_METHODS = new Set(['unlock', 'telemetry']);

function observedArenaAudioEmitters(source: string): string[] {
  return [...new Set([...source.matchAll(/\baudio\.([A-Za-z][A-Za-z0-9]*)\s*\(/g)]
    .map((match) => match[1]!)
    .filter((symbol) => !NON_EVENT_AUDIO_METHODS.has(symbol)))].sort();
}

describe('Pass 65 sound-event inventory', () => {
  it('satisfies the complete typed policy contract', () => {
    expect(verifySoundEventInventory(SOUND_EVENT_INVENTORY)).toEqual([]);
    expect(new Set(SOUND_EVENT_INVENTORY.map((event) => event.family))).toEqual(new Set(SOUND_EVENT_FAMILIES));
    expect(SOUND_EVENT_INVENTORY.every((event) => AUDIO_BUS_IDS.includes(event.bus))).toBe(true);
  });

  it('rejects an intentionally missing event fixture', () => {
    const missingId = 'shed.damage';
    const fixture = SOUND_EVENT_INVENTORY.filter((event) => event.id !== missingId);
    expect(fixture).toHaveLength(SOUND_EVENT_INVENTORY.length - 1);
    expect(verifySoundEventInventory(fixture)).toContain(`missing sound event: ${missingId}`);
  });

  it('covers every current audible ArenaAudio call site and resolves every emitter symbol', () => {
    const gameplaySource = readFileSync('src/legacy-main.ts', 'utf8');
    const audioSource = readFileSync('src/audio.ts', 'utf8');
    const observed = observedArenaAudioEmitters(gameplaySource);
    const covered = [...new Set(SOUND_EVENT_INVENTORY.flatMap((event) => event.source.runtimeEmitterSymbols))].sort();

    expect(covered).toEqual(observed);
    expect(verifySoundEventInventory(SOUND_EVENT_INVENTORY, { observedRuntimeEmitterSymbols: observed })).toEqual([]);
    for (const symbol of covered) expect(audioSource).toMatch(new RegExp(`\\n  ${symbol}\\(`));
  });

  it('pins current weapon variants and all four planned arena ambience identities', () => {
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
    expect(SOUND_EVENT_INVENTORY_SHA256).toBe('16d5f51f82a65d9e469cb85b6f16300a5a9ccb224cba802fd8abec658b82618b');
    expect(digest).toBe(SOUND_EVENT_INVENTORY_SHA256);
  });
});
