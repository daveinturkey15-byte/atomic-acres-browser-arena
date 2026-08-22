import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  MenuPreviewVideoController,
  assertMenuPreviewVideoInventory,
  menuPreviewVideoDefinition,
  menuPreviewVideoMarkup,
} from './menu-preview-video';
import { menuPreviewDefinition } from './menu-preview-camera';

const ACCEPTED_COCKPIT_SOURCE_SHA256 = '25a2556e5eccddf53e8214acbe71386820e818e359f35aa5b6a074cc3b4142c5';
const ACCEPTED_COCKPIT_EVIDENCE_SHA256 = '8882a597f015d5e16a731b88c6167bd4eb93fe811992f8424754df5dbd753e8b';

function sha256(relativePath: string): string {
  return createHash('sha256').update(readFileSync(resolve(process.cwd(), relativePath))).digest('hex');
}

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
      // HF-359 (Pass 74): farcrysis declares mediaAvailable: false while offline flyover render is pending
      if (!definition.mediaAvailable) {
        expect(definition.webm).toBe('');
        expect(definition.mp4).toBe('');
        expect(definition.poster).toBe('');
        return [];
      }
      expect(definition.webm).toMatch(new RegExp(`${id}\\.webm\\?v=pass66-runtime-preview-v15$`));
      expect(definition.mp4).toMatch(new RegExp(`${id}\\.mp4\\?v=pass66-runtime-preview-v15$`));
      expect(definition.poster).toMatch(new RegExp(`${id}\\.webp\\?v=pass66-runtime-preview-v15$`));
      return [definition.webm, definition.mp4, definition.poster];
    });
    expect(new Set(assets).size).toBe(assets.length);
    expect(assets).toHaveLength(12);
  });

  it('keeps helicopter flyovers and the cat POV semantically explicit', () => {
    expect(menuPreviewVideoDefinition('atomic-acres').frame).toBe('helicopter');
    expect(menuPreviewVideoDefinition('skyline-terminal').frame).toBe('helicopter');
    expect(menuPreviewVideoDefinition('rustworks-1v1').frame).toBe('helicopter');
    expect(menuPreviewVideoDefinition('gun-range').frame).toBe('cat');
    expect(menuPreviewVideoDefinition('gun-range').motionLabel).toContain('FIRST-PERSON');
    expect(menuPreviewVideoDefinition('farcrysis').frame).toBe('helicopter'); // HF-359
  });

  it('honestly degrades farcrysis to a deliberate standby placeholder without network requests', async () => {
    // HF-359: test markup and controller degradation for farcrysis
    const markup = menuPreviewVideoMarkup('farcrysis');
    expect(markup).toContain('data-arena="farcrysis"');
    expect(markup).toContain('data-media-state="poster-fallback"');
    expect(markup).toContain('PREVIEW STANDBY');
    expect(markup).not.toContain('<source');

    const attributes = new Map<string, string>();
    const createMockElement = (): any => {
      const el: any = {
        dataset: {} as Record<string, string>,
        hidden: false,
        src: '',
        poster: '',
        width: 0,
        height: 0,
        textContent: '',
        volume: 1,
        muted: false,
        autoplay: false,
        loop: false,
        playsInline: false,
        preload: '',
        complete: false,
        decode: () => Promise.resolve(),
        setAttribute: (k: string, v: string) => attributes.set(k, v),
        getAttribute: (k: string) => attributes.get(k) ?? null,
        hasAttribute: (k: string) => attributes.has(k),
        removeAttribute: (k: string) => attributes.delete(k),
        querySelectorAll: () => [],
        append: () => {},
        pause: () => {},
        play: () => Promise.resolve(),
        load: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        ownerDocument: null as any,
      };
      el.ownerDocument = { createElement: () => createMockElement() };
      return el;
    };

    const frame = createMockElement();
    const video = createMockElement();
    const poster = createMockElement();
    const label = createMockElement();
    const motion = createMockElement();

    const controller = new MenuPreviewVideoController({ frame, video, poster, label, motion }, 'atomic-acres');
    controller.setActive(true);

    controller.select('farcrysis', false);
    const snapshot = controller.snapshot();
    expect(snapshot.arenaId).toBe('farcrysis');
    expect(snapshot.mediaState).toBe('poster-fallback');
    expect(snapshot.sourceCount).toBe(0);
    expect(poster.hidden).toBe(true);
    expect(video.hidden).toBe(true);
    expect(label.textContent).toBe('PRERECORDED HELO // FARCRYSIS');
    expect(motion.textContent).toContain('PENDING');

    const gen = await controller.whenFirstFramePresented();
    expect(gen).toBe(snapshot.generation);

    controller.dispose();
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

  it('binds runtime playback to the native-1440p v15 authoring and encoding contract', () => {
    expect(choreography).toMatchObject({
      schemaVersion: 4,
      recipeId: 'pass66-authoritative-runtime-menu-preview-v2',
      captureId: 'pass66-authoritative-runtime-menu-preview-capture-v2',
      generatedAt: '2026-08-11',
      fps: 30,
      durationSeconds: 8,
      frameCount: 240,
      capture: {
        viewport: [2560, 1440],
        overlayReferenceViewport: [1280, 720],
        overlayOutputScale: 2,
      },
      media: {
        cacheKey: 'pass66-runtime-preview-v15',
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
    expect(RETAINED_CACHE_FAMILY_BASELINE.families.at(-1)).toEqual({
      cacheKey: 'pass66-runtime-preview-v14',
      recipeId: 'pass66-authoritative-runtime-menu-preview-v2',
      finalMediaSetSha256: 'a6bbb232f86099e760e68ad8ac83675c0bd672920eb0addd7f72e204da37d76b',
      fileCount: 12,
      totalBytes: 55288644,
      recordedAt: '2026-08-11',
    });
    expect(cacheFamilyLock.families.some((family) => family.cacheKey === 'pass66-runtime-preview-v4')).toBe(false);
    const v15Families = cacheFamilyLock.families.filter((family) => family.cacheKey === 'pass66-runtime-preview-v15');
    expect(v15Families.length).toBeLessThanOrEqual(1);
    if (v15Families.length === 1) {
      expect(cacheFamilyLock.families.indexOf(v15Families[0]!)).toBeGreaterThanOrEqual(RETAINED_CACHE_FAMILY_BASELINE.families.length);
      expect(v15Families[0]?.recipeId).toBe(choreography.recipeId);
    }
  });

  it('pins v15 to the integrated v7 authored cockpit source and reviewed evidence bytes', () => {
    expect(sha256('source-assets/blender/pass65-chopper-gunner.blend')).toBe(ACCEPTED_COCKPIT_SOURCE_SHA256);
    expect(sha256('docs/assets/pass65-vehicles/chopper/pass65-chopper-first-person-instruments-16x9.png')).toBe(ACCEPTED_COCKPIT_EVIDENCE_SHA256);
    for (const relativePath of [
      'scripts/assets/finalize_pass65_menu_previews.mjs',
      'scripts/qa/verify-pass65-menu-preview-production.mjs',
    ]) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      expect(source).toContain(`acceptedCockpitSourceDigest = '${ACCEPTED_COCKPIT_SOURCE_SHA256}'`);
      expect(source).toContain(`acceptedCockpitEvidenceDigest = '${ACCEPTED_COCKPIT_EVIDENCE_SHA256}'`);
    }
  });
});
