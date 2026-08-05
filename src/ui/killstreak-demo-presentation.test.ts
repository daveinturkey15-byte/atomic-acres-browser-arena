import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PASS65_KILLSTREAK_CATALOG } from '../killstreak-catalog';
import { killstreakDemoPosterPath, killstreakDemoVideoPath } from '../killstreak-demo-capture-contract';
import {
  KILLSTREAK_DEMO_MEDIA,
  killstreakDemoRailMarkup,
} from './killstreak-demo-presentation';

describe('HF-184/HF-185 killstreak demo media registry', () => {
  it('covers every canonical killstreak with truthful local poster/video metadata', () => {
    expect(Object.keys(KILLSTREAK_DEMO_MEDIA).sort())
      .toEqual(PASS65_KILLSTREAK_CATALOG.definitions.map(({ id }) => id).sort());
    for (const definition of Object.values(KILLSTREAK_DEMO_MEDIA)) {
      expect(definition.media.posterPath).toBe(killstreakDemoPosterPath(definition.id));
      expect(definition.media.posterPath).toMatch(/^\.\/assets\/original\/killstreak-demo\/.+\.jpg$/u);
      expect(definition.media.videoPath).toBe(killstreakDemoVideoPath(definition.id));
      expect(definition.media.videoPath).toMatch(/^\.\/assets\/original\/killstreak-demo\/.+\.mp4$/u);
      expect(definition.beats).toHaveLength(3);
      expect(definition.summary.length).toBeGreaterThan(40);
    }
    expect(new Set(Object.values(KILLSTREAK_DEMO_MEDIA).map(({ media }) => media.videoPath)).size)
      .toBe(PASS65_KILLSTREAK_CATALOG.definitions.length);
  });

  it('ships one bounded decoder with a poster fallback and no live renderer', () => {
    const markup = killstreakDemoRailMarkup('scout-sweep');
    expect(markup).toContain('id="killstreak-demo-rail"');
    expect(markup).toContain('VERIFIED REAL TEST BAY MEDIA');
    expect(markup).toContain('NO LIVE MENU RENDER');
    expect(markup.match(/<video\b/gu)).toHaveLength(1);
    expect(markup).toContain('data-demo-toggle');
    expect(markup).not.toContain('<canvas');
  });

  it('teaches the shipped slot-key re-press control without stale hold-to-operate copy', () => {
    expect(KILLSTREAK_DEMO_MEDIA['piloted-drone'].beats).toContain('Press its assigned key again to operate');
    expect(KILLSTREAK_DEMO_MEDIA.chopper.beats).toContain('Press its assigned key again to operate');
    const allCopy = Object.values(KILLSTREAK_DEMO_MEDIA)
      .flatMap((definition) => [definition.summary, ...definition.beats])
      .join(' ');
    expect(allCopy).not.toMatch(/hold (?:to possess|to gun)/iu);
  });

  it('binds hover/focus preview and enforces reduced-motion poster mode', () => {
    const menuSource = readFileSync(new URL('./killstreak-loadout-menu.ts', import.meta.url), 'utf8');
    const demoSource = readFileSync(new URL('./killstreak-demo-presentation.ts', import.meta.url), 'utf8');
    expect(menuSource).toContain("addEventListener('pointerenter'");
    expect(menuSource).toContain("addEventListener('focusin'");
    expect(demoSource).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(demoSource).toContain("rail.dataset.motion = reducedMotion() ? 'poster' : panelVisible() ? 'video' : 'inactive'");
    expect(demoSource).toContain("video.removeAttribute('src')");
    expect(demoSource).toContain("document.addEventListener('visibilitychange'");
    expect(demoSource).not.toContain("document.createElement('video')");
    expect(demoSource).not.toMatch(/from ['"](?:three|\.\.\/legacy-main|\.\.\/rendering)/u);
  });
});
