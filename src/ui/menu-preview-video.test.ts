import { describe, expect, it } from 'vitest';
import choreography from '../../source-assets/menu/pass65-preview-masters/choreography.json';
import cacheFamilyLock from '../../source-assets/menu/pass65-preview-masters/cache-family-lock.json';
import {
  RETAINED_CACHE_FAMILY_BASELINE,
  cacheFamilyLockFailures,
} from '../../scripts/assets/pass65-menu-preview-integrity.mjs';
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
      expect(definition.width).toBe(2560);
      expect(definition.height).toBe(1440);
      expect(definition.webm).toMatch(new RegExp(`${id}\\.webm\\?v=pass66-runtime-preview-v11$`));
      expect(definition.mp4).toMatch(new RegExp(`${id}\\.mp4\\?v=pass66-runtime-preview-v11$`));
      expect(definition.poster).toMatch(new RegExp(`${id}\\.webp\\?v=pass66-runtime-preview-v11$`));
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
    expect(markup).toContain('type=\'video/webm; codecs="vp9,opus"\'');
    expect(markup).toContain('type=\'video/mp4; codecs="avc1.640032,mp4a.40.2"\'');
    expect(markup).toContain('id="menu-preview-poster"');
    expect(markup).toContain('data-renderer-submissions="0"');
    expect(markup).not.toContain('<canvas');
  });

  it('binds runtime playback to the native-1440p v7 authoring and encoding contract', () => {
    expect(choreography).toMatchObject({
      schemaVersion: 4,
      recipeId: 'pass66-authoritative-runtime-menu-preview-v2',
      captureId: 'pass66-authoritative-runtime-menu-preview-capture-v2',
      generatedAt: '2026-08-02',
      fps: 30,
      durationSeconds: 8,
      frameCount: 240,
      capture: {
        viewport: [2560, 1440],
        overlayReferenceViewport: [1280, 720],
        overlayOutputScale: 2,
      },
      media: {
        cacheKey: 'pass66-runtime-preview-v11',
        encodingBudget: {
          minimumAverageBitrateKbps: 3000,
          maximumAverageBitrateKbps: 9000,
          maximumBytesPerVideo: 9500000,
          maximumPosterBytes: 1500000,
          maximumReviewSheetBytes: 1200000,
        },
        encodingProfiles: {
          mp4: {
            videoCodec: 'h264',
            profile: 'high',
            level: '5.0',
            codecTag: 'avc1',
            rfc6381: 'avc1.640032',
            mimeType: 'video/mp4; codecs="avc1.640032,mp4a.40.2"',
          },
          webm: {
            videoCodec: 'vp9',
            mimeType: 'video/webm; codecs="vp9,opus"',
          },
          colour: {
            pixelFormat: 'yuv420p',
            primaries: 'bt709',
            transfer: 'bt709',
            space: 'bt709',
            range: 'tv',
          },
        },
      },
      helicopter: {
        rotorPresentation: {
          mainMinimumProjectedBladeLengthPixels: 600,
          mainMinimumProjectedSweepSpanPixels: 1520,
          mainMinimumProjectedArcSpanPixels: 1400,
          mainMinimumHubDiameterPixels: 36,
          mainMinimumMastCanopyOverlapPixels: 16,
        },
      },
    });
    expect(cacheFamilyLockFailures(cacheFamilyLock, RETAINED_CACHE_FAMILY_BASELINE)).toEqual([]);
    expect(cacheFamilyLock.families.some((family) => family.cacheKey === 'pass66-runtime-preview-v4')).toBe(false);
    const v5Families = cacheFamilyLock.families.filter((family) => family.cacheKey === 'pass66-runtime-preview-v5');
    expect(v5Families).toEqual([expect.objectContaining({
      finalMediaSetSha256: 'b4c9ea1b7898b433dddbec780df9fa03e0f05cf7e23bc5e05fd4fea66bd6ac20',
      fileCount: 12,
      totalBytes: 55328027,
    })]);
    const v10Families = cacheFamilyLock.families.filter((family) => family.cacheKey === 'pass66-runtime-preview-v11');
    expect(v10Families).toHaveLength(1);
    expect(v10Families[0]).toEqual(expect.objectContaining({
      cacheKey: 'pass66-runtime-preview-v11',
      fileCount: 12,
    }));
    expect(v10Families[0].finalMediaSetSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(v10Families[0].totalBytes).toBeGreaterThan(0);
  });
});
