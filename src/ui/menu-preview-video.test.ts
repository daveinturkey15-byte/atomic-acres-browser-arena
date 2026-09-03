import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
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

/**
 * HF-372: two cache families now ship side by side. The retained four keep the
 * locked v15 key; the two arenas captured afterwards get their own, so accepted
 * bytes and new bytes can never share a key.
 */
const EXPECTED_CACHE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  'atomic-acres': 'pass66-runtime-preview-v15',
  'skyline-terminal': 'pass66-runtime-preview-v15',
  'rustworks-1v1': 'pass66-runtime-preview-v15',
  'gun-range': 'pass66-runtime-preview-v15',
  farcrysis: 'pass77-arena-preview-v1',
  'high-seas': 'pass77-arena-preview-v1',
  // owner 2026-08-30: Test1/Test2 arenas added. They briefly shipped placeholder
  // byte-copies under 'pass79-test-arena-placeholder-v1'; their own captures
  // landed the same day under this key.
  test1: 'pass79-test-arena-preview-v1',
  test2: 'pass79-test-arena-preview-v1',
  // MAP3 (owner 2026-09-02, HF-405): its own additive family. Map 3 shipped
  // standby (no media, empty URLs) for one commit and then captured its own
  // flyover; it never carried another arena's bytes under any key.
  map3: 'pass84-map3-preview-v1',
  // NUKETOWN2 (owner 2026-09-02, HF-407): its own additive family, same story.
  // The rebuild shipped standby (no media, empty URLs) for one commit and then
  // captured its own flyover; it never carried another arena's bytes under any
  // key, and finalize-pass85-nuketown2-menu-preview.mjs proves that on the
  // installed bytes rather than asserting it.
  nuketown2: 'pass85-nuketown2-preview-v1',
  // RAID2 (owner 2026-09-02, HF-408): its own additive family, the fifth. Same
  // history as map3 - standby for one pass, then its own capture - and the same
  // rule: new bytes never ship under an accepted family's key.
  raid2: 'pass87-raid2-preview-v1',
});

/**
 * Arenas that are registered and selectable but whose offline flyover has NOT
 * been captured yet, and which therefore render the PREVIEW STANDBY card.
 *
 * MAP3 (owner 2026-09-02, HF-405) put map3 on this list for exactly one commit
 * and then took it off by capturing the flyover, which is the whole point of
 * the mechanism: a newly registered arena has an honest place to stand that is
 * NOT "point at another arena's bytes", the failure Test1 and Test2 actually
 * shipped on 2026-08-30.
 *
 * It is an ALLOWLIST, not a relaxation. Everything below still asserts, for
 * every arena outside it, exactly what it asserted before: real media, its own
 * cache key, distinct URLs, real bytes on disk. What the list adds is a second,
 * different obligation for the arenas inside it - empty URLs, mediaAvailable
 * false, and the standby markup. Adding an id here is a deliberate, reviewable
 * act; forgetting to remove one fails `has no arena stuck in standby that
 * already ships media` below. It is empty, and should stay empty.
 */
// HF-407: 'nuketown2' was on this list for one commit, while its arena existed
// and its flyover did not. The capture landed on 2026-09-02 (240 frames,
// headless, canonical WebGPU route; encoded by
// scripts/assets/finalize-pass85-nuketown2-menu-preview.mjs into the
// pass85-nuketown2-preview-v1 family), so it came off in the same commit - which
// is the rule this list is written to enforce. The list is empty again, and
// should stay empty.
const MEDIA_PENDING_ARENAS: ReadonlySet<string> = new Set<string>([
  // RAID2 (HF-408) sat here for one pass and has been REMOVED by capturing the
  // flyover, exactly as map3 was before it. That is the mechanism working: a
  // newly registered arena gets an honest place to stand, and it leaves by
  // shipping its own bytes rather than by pointing at somebody else's.
]);

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
      if (MEDIA_PENDING_ARENAS.has(id)) {
        // A pending arena must declare NO media at all. An empty string can
        // never collide with a shipped path, so it cannot become another
        // arena's flyover by accident.
        expect(definition.mediaAvailable).toBe(false);
        expect([definition.webm, definition.mp4, definition.poster]).toEqual(['', '', '']);
        return [];
      }
      // HF-372 (Pass 77): every selectable arena now ships real media. The two
      // arenas authored after the Pass 66 family carry their own cache key --
      // reusing v15 for new bytes is exactly what the cache-family lock forbids.
      expect(definition.mediaAvailable).toBe(true);
      const cacheKey = EXPECTED_CACHE_KEYS[id];
      expect(definition.webm).toMatch(new RegExp(`${id}\\.webm\\?v=${cacheKey}$`));
      expect(definition.mp4).toMatch(new RegExp(`${id}\\.mp4\\?v=${cacheKey}$`));
      expect(definition.poster).toMatch(new RegExp(`${id}\\.webp\\?v=${cacheKey}$`));
      // Stricter than before: a declared URL that does not resolve to a real
      // shipped file is exactly the blank card the owner reported, so the bytes
      // themselves are checked, not just the string.
      for (const url of [definition.webm, definition.mp4, definition.poster]) {
        const file = resolve(process.cwd(), 'public', url.split('?')[0]!.replace(/^\.\//, ''));
        expect(statSync(file).size, `${url} must ship real bytes`).toBeGreaterThan(1_000);
      }
      return [definition.webm, definition.mp4, definition.poster];
    });
    expect(new Set(assets).size).toBe(assets.length);
    // owner 2026-08-30: Test1/Test2 arenas added. owner 2026-09-02 (HF-405):
    // Map 3 added and pending capture, so the count is derived from the two
    // rosters rather than written down again.
    expect(assets).toHaveLength((ARENA_SELECTIONS.length - MEDIA_PENDING_ARENAS.size) * 3);
    // owner 2026-09-02 (HF-405): eight arenas shipping media became nine.
    // owner 2026-09-02 (HF-407): nine became TEN when the Nuke Town Rebuild's
    // own flyover landed. This pin is RAISED, never lowered - it is the second,
    // hand-written half of the count above, and its whole job is to fail if a
    // new arena is quietly parked in MEDIA_PENDING_ARENAS instead of captured.
    // HF-408 the same day: raid2 left standby by capturing its own flyover.
    // At the PASS 87 integration merge this pin read 30 from BOTH sides for
    // different reasons - ten arenas with farcrysis un-hidden (HF-423) and ten
    // with raid2 registered (HF-408) - so git merged the literal without a
    // conflict and it had to be re-counted by hand. The union is ELEVEN arenas
    // shipping media, so 33. Pinned as a literal on purpose - deriving it from
    // ARENA_SELECTIONS alone would silently accept a build where an arena
    // quietly stopped shipping media.
    expect(assets).toHaveLength(33);
  });

  // MAP3 (HF-405). Two obligations the allowlist above would otherwise leave
  // unguarded: a pending arena must actually render the standby card, and an
  // arena that ships media must never be left on the list.
  it('renders the standby card for every arena whose flyover is still pending', () => {
    for (const id of MEDIA_PENDING_ARENAS) {
      const markup = menuPreviewVideoMarkup(id as Parameters<typeof menuPreviewVideoMarkup>[0]);
      expect(markup).toContain(`data-arena="${id}"`);
      expect(markup).toContain('data-media-state="poster-fallback"');
      expect(markup).toContain('PREVIEW STANDBY');
      expect(markup).not.toContain('<source');
      expect(markup).toContain('data-renderer-submissions="0"');
      expect(markup).not.toContain('<canvas');
    }
  });

  it('has no arena stuck in standby that already ships media', () => {
    for (const id of MEDIA_PENDING_ARENAS) {
      expect(ARENA_SELECTIONS.map((arena) => String(arena.id))).toContain(id);
      expect(menuPreviewVideoDefinition(id as Parameters<typeof menuPreviewVideoDefinition>[0]).mediaAvailable)
        .toBe(false);
    }
    for (const arena of ARENA_SELECTIONS) {
      if (MEDIA_PENDING_ARENAS.has(arena.id)) continue;
      expect(menuPreviewVideoDefinition(arena.id).mediaAvailable).toBe(true);
    }
  });

  it('keeps helicopter flyovers and the cat POV semantically explicit', () => {
    expect(menuPreviewVideoDefinition('atomic-acres').frame).toBe('helicopter');
    expect(menuPreviewVideoDefinition('skyline-terminal').frame).toBe('helicopter');
    expect(menuPreviewVideoDefinition('rustworks-1v1').frame).toBe('helicopter');
    expect(menuPreviewVideoDefinition('gun-range').frame).toBe('cat');
    expect(menuPreviewVideoDefinition('gun-range').motionLabel).toContain('FIRST-PERSON');
    expect(menuPreviewVideoDefinition('farcrysis').frame).toBe('helicopter'); // HF-359
    expect(menuPreviewVideoDefinition('high-seas').frame).toBe('helicopter');
    // HF-372: both were stuck on the standby placeholder; they now ship media.
    expect(menuPreviewVideoDefinition('farcrysis').mediaAvailable).toBe(true);
    expect(menuPreviewVideoDefinition('high-seas').mediaAvailable).toBe(true);
    for (const arenaId of ['farcrysis', 'high-seas'] as const) {
      expect(menuPreviewVideoDefinition(arenaId).motionLabel).not.toMatch(/PENDING/);
      expect(menuPreviewVideoDefinition(arenaId).reducedMotionLabel).not.toMatch(/PENDING/);
    }
  });

  it('serves the HF-372 arenas real media instead of the standby placeholder', async () => {
    for (const arenaId of ['farcrysis', 'high-seas'] as const) {
      const markup = menuPreviewVideoMarkup(arenaId);
      expect(markup).toContain(`data-arena="${arenaId}"`);
      // The standby branch is what the owner saw as a blank card, so the shipped
      // markup must now name the real poster and both decoder sources.
      expect(markup).toContain('data-media-state="poster"');
      expect(markup).not.toContain('data-media-state="poster-fallback"');
      expect(markup).toContain(`menu-previews/${arenaId}.webp?v=pass77-arena-preview-v1`);
      expect(markup).toContain(`menu-previews/${arenaId}.webm?v=pass77-arena-preview-v1`);
      expect(markup).toContain(`menu-previews/${arenaId}.mp4?v=pass77-arena-preview-v1`);
      expect(markup.match(/<source/g)).toHaveLength(2);
    }

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
    expect(snapshot.mediaState).toBe('loading');
    expect(snapshot.sources.poster).toContain('farcrysis.webp');
    expect(poster.hidden).toBe(false);
    expect(video.hidden).toBe(false);
    expect(label.textContent).toBe('PRERECORDED HELO // FARCRYSIS');
    expect(motion.textContent).not.toContain('PENDING');

    // Rapid switching still hands the surface to exactly one generation.
    controller.select('high-seas', false);
    const highSeasSnapshot = controller.snapshot();
    expect(highSeasSnapshot).toMatchObject({ arenaId: 'high-seas', mediaState: 'loading' });
    expect(highSeasSnapshot.generation).toBe(snapshot.generation + 1);
    expect(highSeasSnapshot.sources.webm).toContain('high-seas.webm');
    expect(highSeasSnapshot.sources.mp4).toContain('high-seas.mp4');
    expect(label.textContent).toBe('PRERECORDED HELO // HIGH SEAS');
    expect(motion.textContent).not.toContain('PENDING');

    // Reduced motion is still poster-only with no decoder sources attached.
    controller.select('high-seas', true);
    const reducedSnapshot = controller.snapshot();
    expect(reducedSnapshot.mediaState).toBe('reduced-motion-poster');
    expect(reducedSnapshot.reducedMotion).toBe(true);
    expect(video.hidden).toBe(true);
    expect(await controller.whenFirstFramePresented()).toBe(reducedSnapshot.generation);

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
