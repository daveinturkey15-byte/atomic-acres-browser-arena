import { describe, expect, it } from 'vitest';
import { createHostTimeMapping, guestMonoToHostTime, hostTimeToGuestMono, monotonicMappedHostNow, observeHostClock } from './host-time';

describe('monotonic guest-to-host time mapping', () => {
  it('uses all four monotonic timestamps and estimates RTT and offset', () => {
    const observation = observeHostClock(createHostTimeMapping(), {
      guestSentMonoMs: 1_000,
      hostReceivedMonoMs: 5_012,
      hostSentMonoMs: 5_014,
      guestReceivedMonoMs: 1_026,
    });
    expect(observation.accepted).toBe(true);
    expect(observation.sampleRttMs).toBe(24);
    expect(observation.sampleOffsetMs).toBe(4_000);
    expect(guestMonoToHostTime(observation.mapping, 1_100)).toBe(5_100);
  });

  it('rejects an isolated offset spike without moving the mapping', () => {
    let mapping = createHostTimeMapping();
    for (let index = 0; index < 4; index += 1) {
      mapping = observeHostClock(mapping, {
        guestSentMonoMs: 1_000 + index * 100,
        hostReceivedMonoMs: 5_010 + index * 100,
        hostSentMonoMs: 5_011 + index * 100,
        guestReceivedMonoMs: 1_021 + index * 100,
      }).mapping;
    }
    const spike = observeHostClock(mapping, {
      guestSentMonoMs: 1_500,
      hostReceivedMonoMs: 6_500,
      hostSentMonoMs: 6_501,
      guestReceivedMonoMs: 1_521,
    });
    expect(spike.reason).toBe('outlier');
    expect(spike.mapping.offsetMs).toBe(mapping.offsetMs);
    expect(spike.mapping.rejectedOutliers).toBe(1);
  });

  it('favours low-RTT samples when asymmetric high-RTT samples bias offset', () => {
    let mapping = createHostTimeMapping();
    const probes = [
      { guestSentMonoMs: 0, hostReceivedMonoMs: 4_070, hostSentMonoMs: 4_071, guestReceivedMonoMs: 101 },
      { guestSentMonoMs: 200, hostReceivedMonoMs: 4_210, hostSentMonoMs: 4_211, guestReceivedMonoMs: 221 },
      { guestSentMonoMs: 400, hostReceivedMonoMs: 4_410, hostSentMonoMs: 4_411, guestReceivedMonoMs: 421 },
      { guestSentMonoMs: 600, hostReceivedMonoMs: 4_610, hostSentMonoMs: 4_611, guestReceivedMonoMs: 621 },
    ];
    for (const probe of probes) mapping = observeHostClock(mapping, probe).mapping;
    expect(mapping.bestRttMs).toBe(20);
    expect(mapping.offsetMs).toBeCloseTo(4_000, 0);
    expect(mapping.uncertaintyMs).toBeLessThan(20);
  });

  it('tracks slow monotonic clock drift without allowing a sudden mapping jump', () => {
    let mapping = createHostTimeMapping();
    for (let index = 0; index < 12; index += 1) {
      const guestSentMonoMs = index * 1_000;
      const offsetMs = 4_000 + index * 0.1;
      mapping = observeHostClock(mapping, {
        guestSentMonoMs,
        hostReceivedMonoMs: guestSentMonoMs + offsetMs + 10,
        hostSentMonoMs: guestSentMonoMs + offsetMs + 11,
        guestReceivedMonoMs: guestSentMonoMs + 21,
      }).mapping;
    }
    expect(mapping.driftPpm).toBeGreaterThan(20);
    expect(mapping.driftPpm).toBeLessThan(150);
    const before = mapping.offsetMs;
    const jump = observeHostClock(mapping, {
      guestSentMonoMs: 13_000,
      hostReceivedMonoMs: 18_010,
      hostSentMonoMs: 18_011,
      guestReceivedMonoMs: 13_021,
    });
    expect(jump.reason).toBe('outlier');
    expect(jump.mapping.offsetMs).toBe(before);
  });

  it('never regresses mapped host time when wall time changes are irrelevant', () => {
    let mapping = { ...createHostTimeMapping(), offsetMs: 4_000, sampleCount: 1 };
    mapping = monotonicMappedHostNow(mapping, 2_000);
    expect(mapping.lastHostTimeMs).toBe(6_000);
    mapping = monotonicMappedHostNow({ ...mapping, offsetMs: 3_500 }, 2_100);
    expect(mapping.lastHostTimeMs).toBe(6_000);
  });

  it('maps host-monotonic match starts without using wall-clock time', () => {
    const unsynchronized = createHostTimeMapping();
    expect(hostTimeToGuestMono(unsynchronized, 4_000, 1_050, 3_000)).toBe(2_050);
    const synchronized = { ...unsynchronized, sampleCount: 3, offsetMs: 1_975 };
    expect(hostTimeToGuestMono(synchronized, 4_000, 1_050, 3_000)).toBe(2_025);
  });
});
