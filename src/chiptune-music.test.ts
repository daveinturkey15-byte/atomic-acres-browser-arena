import { describe, expect, it } from 'vitest';
import {
  CHIPTUNE_TRACKS,
  CHIPTUNE_TRACK_IDS,
  ChiptuneRotation,
  GAME_MUSIC_BUS_GAIN,
  PREVIOUS_GAME_MUSIC_BUS_GAIN,
  advanceChiptuneSchedule,
  advanceMultiTrackSchedule,
  chiptuneBarSeconds,
  chiptuneLoopEvents,
  chiptuneLoopSeconds,
  chiptuneMaxConcurrency,
  createDeterministicRng,
  midiToFrequency,
  nextBarBoundarySeconds,
  selectChiptuneTrack,
  shuffleTracks,
  type ChiptuneTrackId,
} from './chiptune-music';
import { AUDIO_RUNTIME_BUDGET } from './spatial-audio';

function pitchClassRelativeToTonic(frequencyHz: number, tonicMidi: number): number {
  const midi = Math.round(69 + 12 * Math.log2(frequencyHz / 440));
  return ((midi - tonicMidi) % 12 + 12) % 12;
}

describe.each(CHIPTUNE_TRACK_IDS)('background chiptune: %s', (id: ChiptuneTrackId) => {
  const track = CHIPTUNE_TRACKS[id];
  const events = chiptuneLoopEvents(id);

  it('fits the two-voice game-music budget without widening it', () => {
    const peak = chiptuneMaxConcurrency(events);
    expect(peak.lead).toBe(1);
    expect(peak.bass).toBe(1);
    expect(peak.lead + peak.bass).toBeLessThanOrEqual(AUDIO_RUNTIME_BUDGET.perBus['game-music']);
  });

  it('stays in key - no note can be an accidental', () => {
    const scaleSet = new Set(track.scaleSemitones);
    for (const event of events) {
      const tonic = event.channel === 'lead' ? track.leadTonicMidi : track.bassTonicMidi;
      const degree = pitchClassRelativeToTonic(event.frequencyHz, tonic);
      expect(scaleSet.has(degree), `${id} ${event.channel} ${event.frequencyHz.toFixed(2)}Hz out of key`).toBe(true);
    }
  });

  it('is AUDIBLE at the default slider and sits under gameplay audio (HF-430 halved gain)', () => {
    const DEFAULT_MUSIC_SLIDER = 0.5;
    for (const event of events) expect(event.gain).toBeGreaterThan(0);
    const effectivePeak = Math.max(...events.map((event) => event.gain)) * GAME_MUSIC_BUS_GAIN * DEFAULT_MUSIC_SLIDER;
    // HF-430: music gain halved (-6 dB) from 0.054 to 0.027.
    // The previous audibility band [0.00375, 0.01125] halves proportionally to [0.0018, 0.006].
    expect(effectivePeak).toBeGreaterThanOrEqual(0.0018);
    expect(effectivePeak).toBeLessThanOrEqual(0.006);
  });

  it('never overruns its loop, so it can repeat seamlessly', () => {
    const loop = chiptuneLoopSeconds(id);
    expect(loop).toBeCloseTo(chiptuneBarSeconds(id) * track.progression.length, 10);
    for (const event of events) {
      expect(event.offsetSeconds).toBeGreaterThanOrEqual(0);
      expect(event.offsetSeconds + event.durationSeconds).toBeLessThanOrEqual(loop + 1e-9);
    }
  });

  it('uses both channels in every bar so the loop never thins out', () => {
    const bar = chiptuneBarSeconds(id);
    for (let index = 0; index < track.progression.length; index += 1) {
      const start = index * bar;
      const inBar = events.filter((event) =>
        event.offsetSeconds >= start - 1e-9 && event.offsetSeconds < start + bar - 1e-9);
      expect(inBar.some((event) => event.channel === 'lead'), `${id} bar ${index} has no lead`).toBe(true);
      expect(inBar.some((event) => event.channel === 'bass'), `${id} bar ${index} has no bass`).toBe(true);
    }
  });

  it('is deterministic, so any loop iteration can be rescheduled from scratch', () => {
    expect(chiptuneLoopEvents(id)).toEqual(events);
  });
});

describe('HF-430: ten distinct tracks in the ~90s duration band', () => {
  it('has exactly ten authored tracks', () => {
    expect(CHIPTUNE_TRACK_IDS.length).toBe(10);
    expect(new Set(CHIPTUNE_TRACK_IDS).size).toBe(10);
    expect(Object.keys(CHIPTUNE_TRACKS).length).toBe(10);
  });

  it('keeps every track in the ~90s duration band (85 s to 95 s)', () => {
    for (const id of CHIPTUNE_TRACK_IDS) {
      const duration = chiptuneLoopSeconds(id);
      expect(duration, `${id} duration ${duration.toFixed(2)}s outside [85, 95] band`).toBeGreaterThanOrEqual(85);
      expect(duration, `${id} duration ${duration.toFixed(2)}s outside [85, 95] band`).toBeLessThanOrEqual(95);
    }
  });

  it('features distinct tempos, scales/keys, and densities across the roster', () => {
    const tempos = new Set(CHIPTUNE_TRACK_IDS.map((id) => CHIPTUNE_TRACKS[id].tempoBpm));
    expect(tempos.size).toBeGreaterThanOrEqual(8);

    const tonics = new Set(CHIPTUNE_TRACK_IDS.map((id) => CHIPTUNE_TRACKS[id].leadTonicMidi % 12));
    expect(tonics.size).toBeGreaterThanOrEqual(7);

    const densities = CHIPTUNE_TRACK_IDS.map((id) => chiptuneLoopEvents(id).length / chiptuneLoopSeconds(id));
    const minDensity = Math.min(...densities);
    const maxDensity = Math.max(...densities);
    expect(maxDensity - minDensity).toBeGreaterThan(0.5);
  });
});

describe('HF-430: music gain halving (-6 dB)', () => {
  it('pins the previous and halved gain constants', () => {
    expect(PREVIOUS_GAME_MUSIC_BUS_GAIN).toBe(0.054);
    expect(GAME_MUSIC_BUS_GAIN).toBe(0.027);
    expect(GAME_MUSIC_BUS_GAIN).toBe(PREVIOUS_GAME_MUSIC_BUS_GAIN / 2);
    const dbChange = 20 * Math.log10(GAME_MUSIC_BUS_GAIN / PREVIOUS_GAME_MUSIC_BUS_GAIN);
    expect(dbChange).toBeCloseTo(-6.0206, 2);
  });

  it('keeps the RUNTIME bus coefficient on the halved constant through the PASS 95 level table', async () => {
    // PASS 95 moved every bus coefficient into AUDIO_BUS_LEVEL_TABLE
    // (audio-buses.ts); audio.ts now reads the table for creation AND for
    // configure(), so the two-places regression this test guards cannot recur.
    const { AUDIO_BUS_LEVEL_TABLE, audioBusBaseGain } = await import('./audio-buses');
    expect(AUDIO_BUS_LEVEL_TABLE['game-music'].gain).toBe(GAME_MUSIC_BUS_GAIN);
    expect(audioBusBaseGain('game-music')).toBe(GAME_MUSIC_BUS_GAIN);
    const { readFile } = await import('node:fs/promises');
    const source = await readFile('src/audio.ts', 'utf8');
    expect(source).toContain('return audioBusBaseGain(id);');
    expect(source).toContain("this.createBus('game-music');");
    expect(source).not.toMatch(/createBus\('game-music',\s*[0-9.]+\)/);
  });
});

describe('HF-430: shuffle rotation & no-repeat property', () => {
  it('plays all ten tracks before any track repeats (no repeat until all 10 have played)', () => {
    const rotation = new ChiptuneRotation({ seed: 42 });
    const firstCycle: ChiptuneTrackId[] = [];
    for (let i = 0; i < 10; i += 1) firstCycle.push(rotation.nextTrack());

    expect(new Set(firstCycle).size).toBe(10);
    for (const id of CHIPTUNE_TRACK_IDS) {
      expect(firstCycle).toContain(id);
    }

    const secondCycle: ChiptuneTrackId[] = [];
    for (let i = 0; i < 10; i += 1) secondCycle.push(rotation.nextTrack());

    expect(new Set(secondCycle).size).toBe(10);
    for (const id of CHIPTUNE_TRACK_IDS) {
      expect(secondCycle).toContain(id);
    }
  });

  it('never repeats the same track back to back (no immediate repeat across cycles)', () => {
    const rotation = new ChiptuneRotation({ seed: 999 });
    const played: ChiptuneTrackId[] = [];
    for (let i = 0; i < 50; i += 1) {
      played.push(rotation.nextTrack());
    }
    for (let i = 1; i < played.length; i += 1) {
      expect(played[i], `immediate repeat at index ${i}: ${played[i]}`).not.toBe(played[i - 1]);
    }
  });

  it('is deterministic under a seed for tests', () => {
    const rotA = new ChiptuneRotation({ seed: 12345 });
    const rotB = new ChiptuneRotation({ seed: 12345 });
    const seqA = Array.from({ length: 25 }, () => rotA.nextTrack());
    const seqB = Array.from({ length: 25 }, () => rotB.nextTrack());
    expect(seqA).toEqual(seqB);

    const rotC = new ChiptuneRotation({ seed: 54321 });
    const seqC = Array.from({ length: 25 }, () => rotC.nextTrack());
    expect(seqA).not.toEqual(seqC);
  });

  it('shuffleTracks helper avoids immediate repeat against previous track', () => {
    const rng = createDeterministicRng(777);
    for (const prev of CHIPTUNE_TRACK_IDS) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const shuffled = shuffleTracks(CHIPTUNE_TRACK_IDS, rng, prev);
        expect(shuffled[0]).not.toBe(prev);
        expect(new Set(shuffled).size).toBe(10);
      }
    }
  });

  it('selectChiptuneTrack fallback avoids immediate repeat', () => {
    for (const prev of CHIPTUNE_TRACK_IDS) {
      const next = selectChiptuneTrack(prev, 0.5);
      expect(next).not.toBe(prev);
    }
    const initial = selectChiptuneTrack(null, 0.25);
    expect(CHIPTUNE_TRACK_IDS).toContain(initial);
  });

  it('advanceChiptuneSchedule schedules events within horizon window', () => {
    const track = 'fallout-drift' as const;
    const step = advanceChiptuneSchedule(track, 0, 0, 10.0);
    expect(step.events.length).toBeGreaterThan(0);
    expect(step.scheduledUntilSeconds).toBeGreaterThan(0);
    for (const item of step.events) {
      expect(item.atSeconds).toBeGreaterThanOrEqual(0);
      expect(item.atSeconds).toBeLessThan(10.0);
    }
  });
});

describe('HF-430: seamless swap on bar boundary', () => {
  it('calculates the next bar boundary exactly', () => {
    const trackId: ChiptuneTrackId = 'siren-groves';
    const bar = chiptuneBarSeconds(trackId);
    expect(bar).toBeCloseTo(1.93548387, 6);

    const boundary = nextBarBoundarySeconds(trackId, 0, 3.0);
    expect(boundary).toBeCloseTo(bar * 2, 6);

    const boundaryAtStart = nextBarBoundarySeconds(trackId, 0, 0);
    expect(boundaryAtStart).toBeCloseTo(bar, 6);
  });

  it('swaps tracks seamlessly on bar boundaries without voice collisions', () => {
    const rotation = new ChiptuneRotation({ seed: 888 });
    const firstTrack = rotation.nextTrack();
    const duration = chiptuneLoopSeconds(firstTrack);

    const state = {
      currentTrackId: firstTrack,
      trackStartedAtSeconds: 0,
      scheduledUntilSeconds: 0,
      rotation,
    };

    // Schedule through the first track until past its duration (past ~90s)
    const result = advanceMultiTrackSchedule(state, duration + 5);
    expect(result.swaps.length).toBeGreaterThanOrEqual(1);

    const swap = result.swaps[0];
    expect(swap.from).toBe(firstTrack);
    expect(swap.atSeconds).toBeCloseTo(duration, 6);

    // Verify swap occurs at an exact integer multiple of the bar seconds
    const bar = chiptuneBarSeconds(firstTrack);
    const barsPlayed = swap.atSeconds / bar;
    expect(Math.abs(barsPlayed - Math.round(barsPlayed))).toBeLessThan(1e-5);

    // Verify notes before boundary are from firstTrack, and notes at/after are from next track
    const beforeSwap = result.events.filter((e) => e.atSeconds < swap.atSeconds - 1e-6);
    const afterSwap = result.events.filter((e) => e.atSeconds >= swap.atSeconds - 1e-6);
    expect(beforeSwap.every((e) => e.trackId === firstTrack)).toBe(true);
    expect(afterSwap.every((e) => e.trackId === swap.to)).toBe(true);
  });

  it('supports forced mid-track swap on a bar boundary', () => {
    const rotation = new ChiptuneRotation({ seed: 777 });
    const trackA = rotation.nextTrack();
    const barA = chiptuneBarSeconds(trackA);
    const targetBoundary = barA * 4; // swap at bar 4

    const state = {
      currentTrackId: trackA,
      trackStartedAtSeconds: 0,
      scheduledUntilSeconds: 0,
      rotation,
    };

    const result = advanceMultiTrackSchedule(state, targetBoundary + 3, targetBoundary);
    expect(result.swaps.length).toBe(1);
    expect(result.swaps[0].atSeconds).toBeCloseTo(targetBoundary, 6);
    expect(result.swaps[0].from).toBe(trackA);
  });
});

describe('pitch conversion', () => {
  it('converts MIDI to frequency at concert pitch', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 9);
    expect(midiToFrequency(57)).toBeCloseTo(220, 9);
    expect(midiToFrequency(81)).toBeCloseTo(880, 9);
  });
});
