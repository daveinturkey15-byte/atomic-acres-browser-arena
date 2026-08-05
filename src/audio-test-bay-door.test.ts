import { describe, expect, it, vi } from 'vitest';
import { ArenaAudio, TEST_BAY_DOOR_THUMP_PROFILE } from './audio';

type AudioInternals = {
  tone: (...args: unknown[]) => void;
  sweep: (...args: unknown[]) => void;
  noise: (...args: unknown[]) => void;
  impact: (...args: unknown[]) => void;
  shedDoorMotion: (...args: unknown[]) => void;
};

describe('Gun Range secure test-bay door audio', () => {
  it('owns a bounded semantic thump identity instead of reusing shed motion', () => {
    expect(TEST_BAY_DOOR_THUMP_PROFILE).toMatchObject({
      maximumDistanceM: 42,
      maximumDurationSeconds: 0.24,
      shedEmitterReused: false,
    });
    expect(TEST_BAY_DOOR_THUMP_PROFILE.layers.latch.wave).toBe('square');
    expect(TEST_BAY_DOOR_THUMP_PROFILE.layers.pressure.frequencyHz).toBeLessThan(100);
    expect(TEST_BAY_DOOR_THUMP_PROFILE.layers.mechanism.endFrequencyHz).toBeLessThan(
      TEST_BAY_DOOR_THUMP_PROFILE.layers.mechanism.startFrequencyHz,
    );

    const audio = new ArenaAudio();
    const internals = audio as unknown as AudioInternals;
    const tone = vi.spyOn(internals, 'tone').mockImplementation(() => undefined);
    const sweep = vi.spyOn(internals, 'sweep').mockImplementation(() => undefined);
    const noise = vi.spyOn(internals, 'noise').mockImplementation(() => undefined);
    const impact = vi.spyOn(internals, 'impact').mockImplementation(() => undefined);
    const shed = vi.spyOn(internals, 'shedDoorMotion').mockImplementation(() => undefined);

    audio.testBayDoorThump(0);
    expect(tone).toHaveBeenCalledTimes(2);
    expect(tone.mock.calls.map((call) => call[0])).toEqual([
      TEST_BAY_DOOR_THUMP_PROFILE.layers.latch.frequencyHz,
      TEST_BAY_DOOR_THUMP_PROFILE.layers.pressure.frequencyHz,
    ]);
    expect(sweep).toHaveBeenCalledOnce();
    expect(noise).toHaveBeenCalledOnce();
    expect(impact).not.toHaveBeenCalled();
    expect(shed).not.toHaveBeenCalled();
  });

  it('attenuates all four layers against the authored 42 m range', () => {
    const audio = new ArenaAudio();
    const internals = audio as unknown as AudioInternals;
    const tone = vi.spyOn(internals, 'tone').mockImplementation(() => undefined);
    const sweep = vi.spyOn(internals, 'sweep').mockImplementation(() => undefined);
    const noise = vi.spyOn(internals, 'noise').mockImplementation(() => undefined);
    audio.testBayDoorThump(TEST_BAY_DOOR_THUMP_PROFILE.maximumDistanceM);
    const floor = 0.08;
    expect(tone.mock.calls[0]?.[2]).toBeCloseTo(TEST_BAY_DOOR_THUMP_PROFILE.layers.latch.volume * floor, 12);
    expect(tone.mock.calls[1]?.[2]).toBeCloseTo(TEST_BAY_DOOR_THUMP_PROFILE.layers.pressure.volume * floor, 12);
    expect(sweep.mock.calls[0]?.[3]).toBeCloseTo(TEST_BAY_DOOR_THUMP_PROFILE.layers.mechanism.volume * floor, 12);
    expect((noise.mock.calls[0]?.[0] as { volume: number }).volume).toBeCloseTo(
      TEST_BAY_DOOR_THUMP_PROFILE.layers.body.volume * floor,
      12,
    );
  });
});
