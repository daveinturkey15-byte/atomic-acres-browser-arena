import { describe, expect, it } from 'vitest';
import { ShotTimingTelemetry } from './shot-timing-telemetry';

describe('shot timing telemetry', () => {
  it('separates authored, receipt, resolution and delivery spacing', () => {
    const telemetry = new ShotTimingTelemetry();
    telemetry.recordHostResolution({ fireTimeMs: 1_000, receivedAtHostTimeMs: 1_120, resolvedAtHostTimeMs: 1_121, appliedRewindMs: 60, rejected: false, eventLaneBufferedBytes: 120 });
    telemetry.recordHostResolution({ fireTimeMs: 1_066.67, receivedAtHostTimeMs: 1_121, resolvedAtHostTimeMs: 1_122, appliedRewindMs: 60, rejected: false, eventLaneBufferedBytes: 240 });
    telemetry.recordResultDelivery(1_150);
    telemetry.recordResultDelivery(1_153);
    expect(telemetry.snapshot()).toMatchObject({
      authoredSpacing: { count: 1, lastMs: 66.67 },
      packetReceiptSpacing: { count: 1, lastMs: 1 },
      resolutionSpacing: { count: 1, lastMs: 1 },
      resultDeliverySpacing: { count: 1, lastMs: 3 },
      appliedRewindHistogram: { '50-130': 2, rejected: 0 },
      eventLaneBufferedBytes: { last: 240, maximum: 240 },
    });
  });

  it('uses the required rewind bands and records rejection separately', () => {
    const telemetry = new ShotTimingTelemetry();
    for (const appliedRewindMs of [0, 49.9, 50, 129.9, 130, 179.9, 180, 250]) {
      telemetry.recordHostResolution({
        fireTimeMs: 1_000 + appliedRewindMs,
        receivedAtHostTimeMs: 2_000 + appliedRewindMs,
        resolvedAtHostTimeMs: 3_000 + appliedRewindMs,
        appliedRewindMs,
        rejected: false,
      });
    }
    telemetry.recordHostResolution({ fireTimeMs: 4_000, receivedAtHostTimeMs: 4_001, resolvedAtHostTimeMs: 4_002, appliedRewindMs: 0, rejected: true });
    expect(telemetry.snapshot().appliedRewindHistogram).toEqual({
      '0-50': 2, '50-130': 2, '130-180': 2, '180-250': 2, rejected: 1,
    });
  });

  it('reconstructs authored spacing independently from reordered packet receipt', () => {
    const telemetry = new ShotTimingTelemetry();
    for (const fireTimeMs of [1_133.34, 1_000, 1_066.67]) {
      telemetry.recordHostResolution({
        fireTimeMs,
        receivedAtHostTimeMs: 2_000,
        resolvedAtHostTimeMs: 2_001,
        appliedRewindMs: 60,
        rejected: false,
      });
    }
    expect(telemetry.snapshot().authoredSpacing).toMatchObject({
      count: 2,
      minimumMs: 66.67,
      maximumMs: 66.67,
    });
  });
});
