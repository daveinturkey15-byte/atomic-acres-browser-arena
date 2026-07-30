import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PASS65_KILLSTREAK_CATALOG } from '../killstreak-catalog';
import {
  KILLSTREAK_DEMO_MEDIA,
  killstreakDemoRailMarkup,
} from './killstreak-demo-presentation';

describe('HF-184/HF-185 killstreak demo media registry', () => {
  it('covers every canonical killstreak with truthful local poster/presentation metadata', () => {
    expect(Object.keys(KILLSTREAK_DEMO_MEDIA).sort())
      .toEqual(PASS65_KILLSTREAK_CATALOG.definitions.map(({ id }) => id).sort());
    for (const definition of Object.values(KILLSTREAK_DEMO_MEDIA)) {
      expect(definition.media.posterPath).toMatch(/^\.\/assets\/original\/menu-previews\/.+\.webp$/u);
      expect(definition.media.videoPath).toBeNull();
      expect(definition.beats).toHaveLength(3);
      expect(definition.summary.length).toBeGreaterThan(40);
    }
  });

  it('ships a bounded poster/DOM rail and makes no fabricated video or renderer claim', () => {
    const markup = killstreakDemoRailMarkup('scout-sweep');
    expect(markup).toContain('id="killstreak-demo-rail"');
    expect(markup).toContain('PREAUTHORED LOCAL PRESENTATION');
    expect(markup).toContain('NO LIVE GAMEPLAY RENDER');
    expect(markup).not.toContain('<video');
    expect(markup).not.toContain('<canvas');
  });

  it('binds hover/focus preview and enforces reduced-motion poster mode', () => {
    const menuSource = readFileSync(new URL('./killstreak-loadout-menu.ts', import.meta.url), 'utf8');
    const demoSource = readFileSync(new URL('./killstreak-demo-presentation.ts', import.meta.url), 'utf8');
    expect(menuSource).toContain("addEventListener('pointerenter'");
    expect(menuSource).toContain("addEventListener('focusin'");
    expect(demoSource).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(demoSource).toContain("rail.dataset.motion = posterOnly ? 'poster' : 'animated'");
    expect(demoSource).toContain("videoPath !== null && !reducedMotion()");
  });
});
