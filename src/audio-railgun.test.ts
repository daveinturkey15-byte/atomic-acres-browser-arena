import { describe, expect, it, vi } from 'vitest';
import { ArenaAudio, RAILGUN_REPORT_PROFILE, railgunReportAttenuation } from './audio';

describe('railgun report presentation', () => {
  it('uses a large layered pressure profile that remains audible at replicated map distance', () => {
    expect(RAILGUN_REPORT_PROFILE).toMatchObject({ layerCount: 8, pressureDuration: 0.62, tailDuration: 0.9 });
    expect(RAILGUN_REPORT_PROFILE.duration).toBeGreaterThan(0.4);
    expect(RAILGUN_REPORT_PROFILE.crack).toBeGreaterThan(5_000);
    expect(railgunReportAttenuation(false, 180)).toBe(1);
    expect(railgunReportAttenuation(true, 60)).toBeGreaterThan(0.3);
    expect(railgunReportAttenuation(true, 180)).toBe(0.1);
  });

  it('routes both local and replicated hooks through the same bounded weapon report', () => {
    const audio = new ArenaAudio();
    const shot = vi.spyOn(audio, 'shot').mockImplementation(() => undefined);
    audio.railgunReport(false, 0);
    audio.railgunReport(true, { x: 20, y: 0, z: -48 });
    expect(shot).toHaveBeenNthCalledWith(1, 'railgun', false, 0, undefined);
    expect(shot).toHaveBeenNthCalledWith(2, 'railgun', true, 52, { x: 20, y: 0, z: -48 });
    expect(audio.telemetry().railgun).toMatchObject({
      local: 1,
      replicated: 1,
      lastDistanceM: 52,
      lastSpatial: true,
      lastEmitter: { x: 20, y: 0, z: -48 },
      layerCount: 8,
      pressureDuration: 0.62,
    });
  });
});
