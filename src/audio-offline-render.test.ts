import { describe, expect, it } from 'vitest';
import {
  OFFLINE_CATEGORY_TARGETS,
  OFFLINE_RENDER_SAMPLE_RATE,
  renderLegacyOfflineAudioCategory,
  renderOfflineAudioCategory,
  renderOfflineWeaponShot,
  measureOfflineAudio,
  type OfflineAudioCategory,
} from './audio-offline-render';

const CATEGORIES: readonly OfflineAudioCategory[] = ['weapons', 'movement', 'impacts', 'ui', 'music'];

describe('procedural audio offline render acceptance', () => {
  it('renders every category deterministically inside its fixed peak/RMS band', () => {
    const metrics = Object.fromEntries(CATEGORIES.map((category) => {
      const first = renderOfflineAudioCategory(category);
      const second = renderOfflineAudioCategory(category);
      expect(second).toEqual(first);
      const measured = measureOfflineAudio(first);
      const target = OFFLINE_CATEGORY_TARGETS[category];
      expect(measured.sampleCount).toBe(20 * OFFLINE_RENDER_SAMPLE_RATE);
      expect(measured.finite).toBe(true);
      expect(measured.clipped).toBe(false);
      expect(measured.peak).toBeGreaterThanOrEqual(target.peakMin);
      expect(measured.peak).toBeLessThanOrEqual(target.peakMax);
      expect(measured.rms).toBeGreaterThanOrEqual(target.rmsMin);
      expect(measured.rms).toBeLessThanOrEqual(target.rmsMax);
      return [category, { peak: Number(measured.peak.toFixed(6)), rms: Number(measured.rms.toFixed(6)) }];
    })) as Record<OfflineAudioCategory, { peak: number; rms: number }>;
    // The target bands must also preserve the combat mix hierarchy; otherwise
    // a loud UI cue or unducked music bed can pass in isolation.
    expect(metrics.weapons.peak).toBeGreaterThan(metrics.impacts.peak);
    expect(metrics.impacts.peak).toBeGreaterThan(metrics.movement.peak);
    expect(metrics.movement.peak).toBeGreaterThan(metrics.ui.peak);
    expect(metrics.music.rms * 0.24).toBeLessThan(metrics.movement.rms);
    // Kept as a compact receipt when this focused gate is run by a reviewer.
    console.info(`OFFLINE_AUDIO_METRICS ${JSON.stringify(metrics)}`);
    const baseline = Object.fromEntries(CATEGORIES.map((category) => {
      const measured = measureOfflineAudio(renderLegacyOfflineAudioCategory(category));
      return [category, { peak: Number(measured.peak.toFixed(6)), rms: Number(measured.rms.toFixed(6)) }];
    }));
    console.info(`OFFLINE_AUDIO_BASELINE ${JSON.stringify(baseline)}`);
  });

  it('does not render two consecutive weapon shots into identical buffers', () => {
    const first = renderOfflineWeaponShot(0);
    const second = renderOfflineWeaponShot(1);
    expect(second).not.toEqual(first);
    const firstMetrics = measureOfflineAudio(first);
    const secondMetrics = measureOfflineAudio(second);
    expect(firstMetrics.finite && secondMetrics.finite).toBe(true);
    expect(firstMetrics.clipped || secondMetrics.clipped).toBe(false);
  });
});
