import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaAudio } from './audio';
import { ARENA_ACOUSTIC_SPACES } from './audio-immersion';
import { REVERB_ZONE_PROFILES } from './audio-world-positional';
import { ACOUSTIC_ZONE_VOLUMES, acousticSpaceOverrideFor, classifyAcousticZone } from './audio-zone-map';
import { ARENA_SELECTIONS } from './map-selection';
import { NUKETOWN2_HOUSE_LAYOUT, NUKETOWN2_UPPER_Y0, nuketown2HandedX } from './nuketown2-layout';
import { FakeAudioContext } from './audio-test-fake-context';

/**
 * PASS 95 audio-polish: the acoustic zone map. Walking into a Nuke Town house
 * must read as a room; the street must stay the arena's yard; every other
 * arena keeps its authored default.
 */
describe('acoustic zone map', () => {
  it('authors four Nuke Town interiors (two houses, two garages), all interior-room', () => {
    const volumes = ACOUSTIC_ZONE_VOLUMES.nuketown2!;
    expect(volumes.map((volume) => volume.id).sort()).toEqual([
      'nuketown2:north-garage', 'nuketown2:north-house', 'nuketown2:south-garage', 'nuketown2:south-house',
    ]);
    for (const volume of volumes) {
      expect(volume.space).toBe('interior-room');
      expect(volume.maxX).toBeGreaterThan(volume.minX);
      expect(volume.maxY).toBeGreaterThan(volume.minY);
      expect(volume.maxZ).toBeGreaterThan(volume.minZ);
    }
    // The two houses are 180-degree images: same footprint size, opposite z.
    const north = volumes.find((volume) => volume.id === 'nuketown2:north-house')!;
    const south = volumes.find((volume) => volume.id === 'nuketown2:south-house')!;
    expect(north.maxX - north.minX).toBeCloseTo(south.maxX - south.minX, 6);
    expect(north.minZ).toBeCloseTo(-south.maxZ, 6);
  });

  it('reads the centre of each house as a room on both storeys, and the roof and street as the yard', () => {
    for (const house of NUKETOWN2_HOUSE_LAYOUT) {
      const x = nuketown2HandedX(house.x);
      expect(classifyAcousticZone('nuketown2', { x, y: 1.6, z: house.z })).toEqual({ space: 'interior-room', volumeId: `nuketown2:${house.id}-house` });
      expect(classifyAcousticZone('nuketown2', { x, y: NUKETOWN2_UPPER_Y0 + 1.6, z: house.z }).space).toBe('interior-room');
      expect(classifyAcousticZone('nuketown2', { x, y: NUKETOWN2_UPPER_Y0 + 4.5, z: house.z }).volumeId).toBeNull();
    }
    const street = classifyAcousticZone('nuketown2', { x: 0, y: 1.6, z: 0 });
    expect(street).toEqual({ space: ARENA_ACOUSTIC_SPACES.nuketown2, volumeId: null });
    expect(acousticSpaceOverrideFor('nuketown2', { x: 0, y: 1.6, z: 0 })).toBeNull();
    expect(acousticSpaceOverrideFor('nuketown2', { x: nuketown2HandedX(NUKETOWN2_HOUSE_LAYOUT[0]!.x), y: 1.6, z: NUKETOWN2_HOUSE_LAYOUT[0]!.z })).toBe('interior-room');
  });

  it('gives every shipped arena its authored default outside any volume and tolerates bad input', () => {
    for (const arena of ARENA_SELECTIONS) {
      expect(classifyAcousticZone(arena.id, { x: 1_000, y: 1.6, z: 1_000 }).space).toBe(ARENA_ACOUSTIC_SPACES[arena.id]);
      expect(classifyAcousticZone(arena.id, { x: Number.NaN, y: 1.6, z: 0 }).volumeId).toBeNull();
    }
    expect(classifyAcousticZone(null, { x: 0, y: 0, z: 0 }).volumeId).toBeNull();
  });
});

describe('ArenaAudio zone-keyed reverb', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeAudioContext.instances.length = 0;
  });

  it('retunes the shared return when the listener walks indoors, and back when they leave', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new ArenaAudio();
    audio.setArena('nuketown2');
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    // The return gain is the gain node whose output is master and whose value is the yard return.
    const yard = REVERB_ZONE_PROFILES['urban-yard'];
    const room = REVERB_ZONE_PROFILES['interior-room'];
    const returnGain = context.gains.find((gain) => gain.gain.writes.some((write) => write.kind === 'target' && Math.abs(write.value - yard.returnGain) < 1e-9))!;
    expect(returnGain).toBeDefined();
    expect(audio.telemetry().immersion).toMatchObject({ space: 'urban-yard', overridden: false });

    const house = NUKETOWN2_HOUSE_LAYOUT[0]!;
    audio.updateListener({ x: nuketown2HandedX(house.x), y: 1.6, z: house.z }, 0);
    expect(audio.telemetry().immersion).toMatchObject({ space: 'interior-room', overridden: true });
    expect(returnGain.gain.value).toBeCloseTo(room.returnGain, 9);
    const delaysAfter = context.delays.map((delay) => delay.delayTime.value).sort((a, b) => a - b);
    expect(delaysAfter[0]).toBeCloseTo(room.earlyDelaySeconds, 9);
    expect(delaysAfter[1]).toBeCloseTo(room.lateDelaySeconds, 9);

    audio.updateListener({ x: 0, y: 1.6, z: 0 }, 0);
    expect(audio.telemetry().immersion).toMatchObject({ space: 'urban-yard', overridden: false });
    expect(returnGain.gain.value).toBeCloseTo(yard.returnGain, 9);
    audio.dispose();
  });
});
