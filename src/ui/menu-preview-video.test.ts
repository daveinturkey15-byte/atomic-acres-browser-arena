import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS } from '../map-selection';
import {
  MENU_PREVIEW_VIDEO_DEFINITIONS,
  assertMenuPreviewVideoInventory,
  menuPreviewVideoDefinition,
  menuPreviewVideoMarkup,
} from './menu-preview-video';
import { menuPreviewDefinition } from './menu-preview-camera';

describe('prerecorded map-selection previews', () => {
  it('defines one distinct WebM, MP4, and poster for every selectable arena', () => {
    expect(() => assertMenuPreviewVideoInventory()).not.toThrow();
    expect(Object.keys(MENU_PREVIEW_VIDEO_DEFINITIONS)).toHaveLength(ARENA_SELECTIONS.length);
    const assets = ARENA_SELECTIONS.flatMap(({ id }) => {
      const definition = menuPreviewVideoDefinition(id);
      expect(definition.arenaId).toBe(id);
      expect(definition.durationSeconds).toBe(8);
      expect(definition.width / definition.height).toBeCloseTo(16 / 9, 5);
      expect(definition.width).toBe(1280);
      expect(definition.height).toBe(720);
      expect(definition.webm).toMatch(new RegExp(`${id}\\.webm\\?v=pass66-runtime-preview-v4$`));
      expect(definition.mp4).toMatch(new RegExp(`${id}\\.mp4\\?v=pass66-runtime-preview-v4$`));
      expect(definition.poster).toMatch(new RegExp(`${id}\\.webp\\?v=pass66-runtime-preview-v4$`));
      return [definition.webm, definition.mp4, definition.poster];
    });
    expect(new Set(assets).size).toBe(assets.length);
  });

  it('keeps helicopter flyovers and the cat POV semantically explicit', () => {
    expect(menuPreviewVideoDefinition('atomic-acres').frame).toBe('helicopter');
    expect(menuPreviewVideoDefinition('skyline-terminal').frame).toBe('helicopter');
    expect(menuPreviewVideoDefinition('rustworks-1v1').frame).toBe('helicopter');
    expect(menuPreviewVideoDefinition('gun-range').frame).toBe('cat');
    expect(menuPreviewVideoDefinition('gun-range').motionLabel).toContain('FIRST-PERSON');
  });

  it('keeps runtime presentation identities aligned with the offline choreography recipe', () => {
    for (const arena of ARENA_SELECTIONS) {
      expect(menuPreviewVideoDefinition(arena.id).presentationId)
        .toBe(menuPreviewDefinition(arena.id).presentationId);
    }
  });

  it('renders browser-safe autoplay markup with a poster fallback and no renderer ownership', () => {
    const markup = menuPreviewVideoMarkup();
    expect(markup).toContain('<video id="menu-preview-video"');
    expect(markup).toContain('autoplay loop muted playsinline preload="metadata"');
    expect(markup).toContain('type="video/webm; codecs=vp9,opus"');
    expect(markup).toContain('type="video/mp4; codecs=avc1.64001f,mp4a.40.2"');
    expect(markup).toContain('id="menu-preview-poster"');
    expect(markup).toContain('data-renderer-submissions="0"');
    expect(markup).not.toContain('<canvas');
  });
});
