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
