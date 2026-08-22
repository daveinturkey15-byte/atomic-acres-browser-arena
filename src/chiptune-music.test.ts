import { describe, expect, it } from 'vitest';
import {
  CHIPTUNE_BARS,
  CHIPTUNE_BAR_SECONDS,
  CHIPTUNE_BASS_GAIN,
  CHIPTUNE_LEAD_GAIN,
  CHIPTUNE_LOOP_SECONDS,
  chiptuneLoopEvents,
  chiptuneMaxConcurrency,
  midiToFrequency,
} from './chiptune-music';
import { AUDIO_RUNTIME_BUDGET } from './spatial-audio';

const events = chiptuneLoopEvents();

describe('Atomic Acres background chiptune', () => {
  it('fits the two-voice game-music budget without widening it', () => {
    // The budget is the constraint the composition was written around, so assert
    // against the real value rather than a copy of it. If someone ever raises the
    // cap this test keeps passing; if someone writes a chord that needs a third
    // simultaneous voice, it fails here instead of stealing a voice at runtime.
    const peak = chiptuneMaxConcurrency(events);
    expect(peak.lead).toBe(1);
    expect(peak.bass).toBe(1);
    expect(peak.lead + peak.bass).toBeLessThanOrEqual(AUDIO_RUNTIME_BUDGET.perBus['game-music']);
  });

  it('stays in A natural minor - no note can be out of key', () => {
    // Every pitch must land on a semitone of the A-minor scale. Authoring by scale
    // degree makes this true by construction; the test pins that it STAYS true if
    // the pattern data is edited later.
    const inKey = new Set([0, 2, 3, 5, 7, 8, 10]);
    for (const event of events) {
      const midi = Math.round(69 + 12 * Math.log2(event.frequencyHz / 440));
      // A = MIDI 9 (mod 12), so shift into scale space before testing membership.
      const degree = ((midi - 9) % 12 + 12) % 12;
      expect(inKey.has(degree), `${event.channel} ${event.frequencyHz.toFixed(2)}Hz is out of key`).toBe(true);
    }
  });

  it('is quiet enough to sit under gameplay audio', () => {
    // The owner asked for background music that does not overpower game sounds.
    // These peaks are pre-bus; the game-music bus multiplies by 0.16 and the user
    // volume by up to 1.0, so the loudest note reaches roughly 0.017 at the master.
    for (const event of events) {
      expect(event.gain).toBeLessThanOrEqual(Math.max(CHIPTUNE_LEAD_GAIN, CHIPTUNE_BASS_GAIN));
      expect(event.gain).toBeGreaterThan(0);
    }
    const loudest = Math.max(...events.map((event) => event.gain));
    expect(loudest).toBeLessThan(0.12);
  });

  it('never overruns the loop, so it can repeat seamlessly', () => {
    expect(CHIPTUNE_LOOP_SECONDS).toBeCloseTo(CHIPTUNE_BAR_SECONDS * CHIPTUNE_BARS, 10);
    for (const event of events) {
      expect(event.offsetSeconds).toBeGreaterThanOrEqual(0);
      // A note that ran past the loop boundary would collide with the first note
      // of the next iteration on the same channel, which is exactly the case the
      // concurrency assertion above would not catch across the seam.
      expect(event.offsetSeconds + event.durationSeconds).toBeLessThanOrEqual(CHIPTUNE_LOOP_SECONDS + 1e-9);
    }
  });

  it('is deterministic, so any loop iteration can be rescheduled from scratch', () => {
    expect(chiptuneLoopEvents()).toEqual(events);
  });

  it('uses both channels in every bar so the loop never thins out', () => {
    for (let bar = 0; bar < CHIPTUNE_BARS; bar += 1) {
      const start = bar * CHIPTUNE_BAR_SECONDS;
      const inBar = events.filter((event) =>
        event.offsetSeconds >= start - 1e-9 && event.offsetSeconds < start + CHIPTUNE_BAR_SECONDS - 1e-9);
      expect(inBar.some((event) => event.channel === 'lead'), `bar ${bar} has no lead`).toBe(true);
      expect(inBar.some((event) => event.channel === 'bass'), `bar ${bar} has no bass`).toBe(true);
    }
  });

  it('converts MIDI to frequency at concert pitch', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 9);
    expect(midiToFrequency(57)).toBeCloseTo(220, 9);
    expect(midiToFrequency(81)).toBeCloseTo(880, 9);
  });
});
