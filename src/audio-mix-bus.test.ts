import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_BUS_IDS,
  AUDIO_BUS_LEVEL_TABLE,
  AUDIO_MIX_GROUP_IDS,
  audioBusBaseGain,
  audioBusLevelDb,
  audioBusesInGroup,
} from './audio-buses';
import { GAME_MUSIC_BUS_GAIN } from './chiptune-music';
import { ArenaAudio, MASTER_LIMITER_PROFILE, SHARED_REVERB_PROFILE } from './audio';
import { FakeAudioContext, FakeDynamicsCompressorNode, FakeGainNode } from './audio-test-fake-context';

/**
 * PASS 95 audio-polish: the mix bus architecture is a contract, not a
 * convention. Master / music / sfx / ui / voice, one level table, and a
 * safety limiter on master - checked against the graph the runtime builds,
 * not against comments.
 */
describe('PASS 95 mix bus architecture', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeAudioContext.instances.length = 0;
  });

  it('assigns every runtime bus to exactly one of the five mix groups, and no group is empty', () => {
    expect([...AUDIO_MIX_GROUP_IDS]).toEqual(['master', 'music', 'sfx', 'ui', 'voice']);
    for (const id of AUDIO_BUS_IDS) {
      expect(AUDIO_MIX_GROUP_IDS).toContain(AUDIO_BUS_LEVEL_TABLE[id].group);
      expect(AUDIO_BUS_LEVEL_TABLE[id].gain).toBeGreaterThan(0);
      expect(AUDIO_BUS_LEVEL_TABLE[id].gain).toBeLessThanOrEqual(1);
      expect(AUDIO_BUS_LEVEL_TABLE[id].carries.length).toBeGreaterThan(8);
    }
    for (const group of AUDIO_MIX_GROUP_IDS) expect(audioBusesInGroup(group).length).toBeGreaterThan(0);
    expect(audioBusesInGroup('master')).toEqual(['master']);
    expect([...audioBusesInGroup('music')].sort()).toEqual(['game-music', 'menu-music']);
    expect([...audioBusesInGroup('sfx')].sort()).toEqual(['ambience', 'movement', 'sfx']);
    expect(audioBusesInGroup('ui')).toEqual(['ui']);
    expect(audioBusesInGroup('voice')).toEqual(['announcements']);
  });

  it('keeps the owner-set music levels and a restrained UI below gunfire', () => {
    expect(AUDIO_BUS_LEVEL_TABLE['game-music'].gain).toBe(GAME_MUSIC_BUS_GAIN);
    // Owner 2026-08-30: third halving. The old busBaseGain() fallthrough
    // answered 0.18 and silently overrode this at configure() time.
    expect(AUDIO_BUS_LEVEL_TABLE['menu-music'].gain).toBe(0.045);
    expect(audioBusBaseGain('ui')).toBeLessThan(audioBusBaseGain('sfx'));
    expect(audioBusBaseGain('movement')).toBeLessThan(audioBusBaseGain('sfx'));
    expect(audioBusBaseGain('ambience')).toBeLessThan(audioBusBaseGain('movement'));
    for (const id of audioBusesInGroup('music')) expect(audioBusBaseGain(id)).toBeLessThan(audioBusBaseGain('ambience'));
    expect(audioBusLevelDb('sfx')).toBeCloseTo(-2.2, 1);
    expect(audioBusLevelDb('master')).toBeCloseTo(-9.4, 1);
  });

  it('builds the graph from the table and re-applies it from the table at configure()', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new ArenaAudio();
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    expect(context).toBeDefined();
    const buses = audio.telemetry().buses;
    for (const id of AUDIO_BUS_IDS) {
      expect(buses[id].effectiveGain).toBeCloseTo(audioBusBaseGain(id), 6);
    }
    // A full-scale slider re-applies the same coefficient; a half slider halves it.
    const gains = Object.fromEntries(AUDIO_BUS_IDS.map((id) => [id, id === 'ui' ? 50 : 100])) as Record<typeof AUDIO_BUS_IDS[number], number>;
    const mutes = Object.fromEntries(AUDIO_BUS_IDS.map((id) => [id, false])) as Record<typeof AUDIO_BUS_IDS[number], boolean>;
    audio.configure({ schemaVersion: 1, gameMusicRetuned: true, gains, mutes });
    const after = audio.telemetry().buses;
    expect(after.ui.effectiveGain).toBeCloseTo(audioBusBaseGain('ui') * 0.5, 6);
    expect(after.sfx.effectiveGain).toBeCloseTo(audioBusBaseGain('sfx'), 6);
    expect(after['menu-music'].effectiveGain).toBeCloseTo(0.045, 6);
    audio.dispose();
  });

  it('routes every bus into one master gain that feeds a -1 dB 20:1 limiter before the destination', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new ArenaAudio();
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    expect(context.compressors).toHaveLength(1);
    const limiter = context.compressors[0]! as FakeDynamicsCompressorNode;
    expect(limiter.threshold.value).toBe(MASTER_LIMITER_PROFILE.thresholdDb);
    expect(limiter.ratio.value).toBe(MASTER_LIMITER_PROFILE.ratio);
    expect(limiter.threshold.value).toBeLessThanOrEqual(-1);
    expect(limiter.ratio.value).toBeGreaterThanOrEqual(20);
    expect(limiter.attack.value).toBeLessThanOrEqual(0.002);
    expect(limiter.reaches(context.destination)).toBe(true);
    // The master gain is the only gain that feeds the limiter directly, and
    // every bus reaches the destination only THROUGH it.
    const master = context.gains.find((gain) => gain.outputs.includes(limiter)) as FakeGainNode | undefined;
    expect(master).toBeDefined();
    expect(master!.gain.value).toBeCloseTo(audioBusBaseGain('master'), 6);
    const buses = context.gains.filter((gain) => AUDIO_BUS_IDS.some((id) => id !== 'master' && Math.abs(gain.gain.value - audioBusBaseGain(id)) < 1e-9));
    expect(buses.length).toBeGreaterThanOrEqual(AUDIO_BUS_IDS.length - 1);
    for (const bus of buses) {
      expect(bus.reaches(master!)).toBe(true);
      expect(bus.outputs.includes(limiter)).toBe(false);
      expect(bus.outputs.includes(context.destination)).toBe(false);
    }
    // The shared reverb return also lands on master, never on the destination.
    expect(SHARED_REVERB_PROFILE.returnGain).toBeGreaterThan(0);
    for (const delay of context.delays) expect(delay.reaches(master!)).toBe(true);
    audio.dispose();
  });
});
