import { describe, expect, it } from 'vitest';
import {
  CHIPTUNE_TRACKS,
  CHIPTUNE_TRACK_IDS,
  chiptuneBarSeconds,
  chiptuneLoopEvents,
  chiptuneLoopSeconds,
  chiptuneMaxConcurrency,
  midiToFrequency,
  selectChiptuneTrack,
  type ChiptuneTrackId,
  GAME_MUSIC_BUS_GAIN,
  advanceChiptuneSchedule,
} from './chiptune-music';
import { AUDIO_RUNTIME_BUDGET } from './spatial-audio';

/** Semitone classes of a natural-minor scale, used to prove notes stay in key. */
const MINOR_DEGREES = new Set([0, 2, 3, 5, 7, 8, 10]);

function pitchClassRelativeToTonic(frequencyHz: number, tonicMidi: number): number {
  const midi = Math.round(69 + 12 * Math.log2(frequencyHz / 440));
  return ((midi - tonicMidi) % 12 + 12) % 12;
}

describe.each(CHIPTUNE_TRACK_IDS)('background chiptune: %s', (id: ChiptuneTrackId) => {
  const track = CHIPTUNE_TRACKS[id];
  const events = chiptuneLoopEvents(id);

  it('fits the two-voice game-music budget without widening it', () => {
    // Assert against the real budget constant rather than a copy. If someone
    // writes a chord needing a third simultaneous voice, it fails here instead of
    // stealing a voice from gunfire at runtime.
    const peak = chiptuneMaxConcurrency(events);
    expect(peak.lead).toBe(1);
    expect(peak.bass).toBe(1);
    expect(peak.lead + peak.bass).toBeLessThanOrEqual(AUDIO_RUNTIME_BUDGET.perBus['game-music']);
  });

  it('stays in key - no note can be an accidental', () => {
    for (const event of events) {
      const tonic = event.channel === 'lead' ? track.leadTonicMidi : track.bassTonicMidi;
      const degree = pitchClassRelativeToTonic(event.frequencyHz, tonic);
      expect(MINOR_DEGREES.has(degree), `${id} ${event.channel} ${event.frequencyHz.toFixed(2)}Hz out of key`).toBe(true);
    }
  });

  it('is AUDIBLE at the default slider and still sits under gameplay audio', () => {
    // 2026-08-29 re-pin, both directions. The old pin only capped the
    // pre-bus peak, and the full chain (peak x bus 0.16 x default slider
    // 0.68) multiplied out to ~0.009 - the owner was promised background
    // music and NOBODY EVER HEARD IT. The contract now pins the EFFECTIVE
    // peak through the real bus constant: loud enough to exist (>= 0.03,
    // which the old staging fails), quiet enough to stay a bed (<= 0.09,
    // far under weapon SFX amplitudes).
    // Owner-tuned 2026-08-29: 35% of the first audible staging at a 50%
    // default slider. The floor still fails RED against the original
    // never-heard staging (0.105 x 0.16 x 0.68 = 0.011).
    const DEFAULT_MUSIC_SLIDER = 0.5;
    for (const event of events) expect(event.gain).toBeGreaterThan(0);
    const effectivePeak = Math.max(...events.map((event) => event.gain)) * GAME_MUSIC_BUS_GAIN * DEFAULT_MUSIC_SLIDER;
    // Owner 2026-08-30: "half the sound of the music" - second halving
    // (bus 0.214 -> 0.107). The band halves with it; the floor still fails
    // RED against the original never-heard staging.
    // Owner 2026-08-30: band re-pinned for the third halving (0.107 -> 0.054).
    expect(effectivePeak).toBeGreaterThanOrEqual(0.00375);
    expect(effectivePeak).toBeLessThanOrEqual(0.01125);
  });

  it('schedules EVERY loop event across consecutive horizon windows (regression: one blip per loop)', () => {
    // RED against the pre-2026-08-29 pump: it marked a whole ~15 s loop
    // scheduled after emitting only the events inside the 0.75 s horizon, so
    // 95% of every loop was silently skipped. Walk two full loops in 0.75 s
    // pump steps and require exactly two of every event, in order.
    const track = 'fallout-drift' as const;
    const loop = chiptuneLoopSeconds(track);
    const perLoop = chiptuneLoopEvents(track).length;
    let until = 100; // loop started at t=100 on the context clock
    const scheduled: number[] = [];
    const scheduledKeys: string[] = [];
    for (let now = 100; now < 100 + loop * 2 + 1; now += 0.4) {
      const step = advanceChiptuneSchedule(track, until, 100, now + 0.75);
      for (const entry of step.events) scheduled.push(entry.atSeconds);
      for (const entry of step.events) scheduledKeys.push(`${entry.atSeconds.toFixed(6)}|${entry.event.channel}|${entry.event.frequencyHz.toFixed(2)}`);
      until = step.scheduledUntilSeconds;
      expect(until).toBeLessThanOrEqual(now + 0.75 + 1e-9);
    }
    // The final horizon reaches into loop 3; count the first two loops only,
    // and demand exactly one scheduling per event - no gaps, no duplicates.
    // (Uniqueness keys include the channel: simultaneous lead+bass chords
    // are authored and legal.)
    const inWindow = scheduled.filter((at) => at < 100 + loop * 2 - 1e-6);
    expect(inWindow.length).toBe(perLoop * 2);
    const keysInWindow = scheduledKeys.filter((key) => Number(key.split('|')[0]) < 100 + loop * 2 - 1e-6);
    expect(new Set(keysInWindow).size).toBe(keysInWindow.length);
    for (let index = 1; index < scheduled.length; index += 1) {
      expect(scheduled[index]).toBeGreaterThanOrEqual(scheduled[index - 1] - 1e-6);
    }
  });

  it('keeps the RUNTIME bus coefficient on the same constant (regression: the restage was silently reverted)', async () => {
    // The first audibility fix restaged createBus('game-music', 0.45) - and
    // audio.ts's busBaseGain() fallthrough overwrote it back to 0.16 the
    // moment configure() ran at boot. The owner heard nothing, again. Pin
    // the file's own mapping so the two stagings can never diverge.
    const { readFile } = await import('node:fs/promises');
    const source = await readFile('src/audio.ts', 'utf8');
    expect(source).toContain("if (id === 'game-music') return GAME_MUSIC_BUS_GAIN;");
    expect(source).toContain("this.createBus('game-music', GAME_MUSIC_BUS_GAIN);");
  });

  it('never overruns its loop, so it can repeat seamlessly', () => {
    const loop = chiptuneLoopSeconds(id);
    expect(loop).toBeCloseTo(chiptuneBarSeconds(id) * track.progression.length, 10);
    for (const event of events) {
      expect(event.offsetSeconds).toBeGreaterThanOrEqual(0);
      // A note running past the loop boundary would collide with the first note
      // of the next iteration on the same channel - the seam the concurrency
      // check above cannot see.
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

describe('the two tracks are actually distinguishable', () => {
  // Rotation is only worth having if a listener can tell the tracks apart.
  // Asserting the contrast stops a future edit quietly converging them into two
  // sections of the same piece.
  it('differ in tempo, key, loop length and density', () => {
    const [a, b] = CHIPTUNE_TRACK_IDS.map((id) => CHIPTUNE_TRACKS[id]);
    expect(a.tempoBpm).not.toBe(b.tempoBpm);
    expect(a.leadTonicMidi % 12).not.toBe(b.leadTonicMidi % 12);
    expect(a.progression.length).not.toBe(b.progression.length);
    expect(chiptuneLoopSeconds(a.id)).not.toBeCloseTo(chiptuneLoopSeconds(b.id), 2);

    const density = (id: ChiptuneTrackId) => chiptuneLoopEvents(id).length / chiptuneLoopSeconds(id);
    expect(Math.abs(density(a.id) - density(b.id))).toBeGreaterThan(0.5);
  });
});

describe('track rotation', () => {
  it('never repeats the previous track back to back', () => {
    // Straight random selection would replay the same track about half the time,
    // which reads as "the music never changed" rather than as variety.
    for (const previous of CHIPTUNE_TRACK_IDS) {
      for (const roll of [0, 0.25, 0.5, 0.75, 0.999999]) {
        expect(selectChiptuneTrack(previous, roll)).not.toBe(previous);
      }
    }
  });

  it('can pick either track on a cold start', () => {
    const picked = new Set([0, 0.49, 0.5, 0.99].map((roll) => selectChiptuneTrack(null, roll)));
    expect(picked.size).toBe(CHIPTUNE_TRACK_IDS.length);
  });

  it('survives a hostile roll rather than returning undefined', () => {
    // Math.random cannot produce these, but a caller mistake or a stubbed RNG can,
    // and an out-of-range index here would silently start no music at all.
    for (const roll of [-1, 0, 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(CHIPTUNE_TRACK_IDS).toContain(selectChiptuneTrack(null, roll));
      expect(CHIPTUNE_TRACK_IDS).toContain(selectChiptuneTrack('siren-groves', roll));
    }
  });

  it('alternates across a run of matches', () => {
    let previous: ChiptuneTrackId | null = null;
    const played: ChiptuneTrackId[] = [];
    for (let match = 0; match < 8; match += 1) {
      previous = selectChiptuneTrack(previous, (match * 0.37) % 1);
      played.push(previous);
    }
    expect(new Set(played).size).toBe(CHIPTUNE_TRACK_IDS.length);
    for (let i = 1; i < played.length; i += 1) expect(played[i]).not.toBe(played[i - 1]);
  });
});

describe('pitch conversion', () => {
  it('converts MIDI to frequency at concert pitch', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 9);
    expect(midiToFrequency(57)).toBeCloseTo(220, 9);
    expect(midiToFrequency(81)).toBeCloseTo(880, 9);
  });
});
