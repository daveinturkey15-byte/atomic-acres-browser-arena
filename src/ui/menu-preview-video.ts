import { ARENA_SELECTIONS, type ArenaId } from '../map-selection';

export type MenuPreviewFrame = 'helicopter' | 'cat';

export type MenuPreviewVideoDefinition = Readonly<{
  arenaId: ArenaId;
  frame: MenuPreviewFrame;
  label: string;
  motionLabel: string;
  reducedMotionLabel: string;
  presentationId: string;
  mediaAvailable: boolean; // HF-359: genuine offline flyover media is authored and shipped
  webm: string;
  mp4: string;
  poster: string;
  durationSeconds: 8;
  width: 2560;
  height: 1440;
}>;

const ROOT = './assets/original/menu-previews';
const CACHE_KEY = 'pass66-runtime-preview-v15';
// HF-372: farcrysis and high-seas were captured after the Pass 66 family was
// locked, so they carry their own cache key. Reusing v15 for new bytes is exactly
// what the cache-family lock exists to prevent.
const PASS77_CACHE_KEY = 'pass77-arena-preview-v1';
// Test1/Test2 (owner 2026-08-30). These shipped for a few hours as placeholder
// byte-copies of the gun-range and high-seas media under
// 'pass79-test-arena-placeholder-v1', which meant hovering Test1 played the Gun
// Range flyover. They now carry their own captured media, so the key is bumped
// off the placeholder family - a new byte under an old key is exactly what the
// cache-family lock exists to prevent.
const PASS79_CACHE_KEY = 'pass79-test-arena-preview-v1';
// MAP3 (owner 2026-09-02, HF-405): the fourth additive family. Map 3's own
// flyover, captured from its own authoritative WebGPU runtime arena by
// scripts/assets/generate-pass65-runtime-menu-previews.ts and encoded by
// scripts/assets/finalize-pass84-map3-menu-preview.mjs with the Pass 66
// profiles. It gets its own key rather than riding an existing one for the
// reason the comment above records: a new byte under an old key is exactly
// what the cache-family lock exists to prevent.
const PASS84_CACHE_KEY = 'pass84-map3-preview-v1';
// NUKETOWN2 (owner 2026-09-02, HF-407): the fifth additive family, same reason
// again. The Nuke Town Rebuild's own flyover, captured from its own
// authoritative WebGPU runtime arena by
// scripts/assets/generate-pass65-runtime-menu-previews.ts and encoded by
// scripts/assets/finalize-pass85-nuketown2-menu-preview.mjs with the Pass 66
// profiles.
const PASS85_CACHE_KEY = 'pass85-nuketown2-preview-v1';
// RAID2 (HF-408): its own family key, same rule again - the bytes under it were
// encoded by scripts/assets/finalize-pass87-raid2-menu-preview.mjs from raid2's
// own authoritative runtime capture, and no other arena's key is reused.
const PASS87_CACHE_KEY = 'pass87-raid2-preview-v1';
const WEBM_MIME_TYPE = 'video/webm; codecs="vp9,opus"';
const MP4_MIME_TYPE = 'video/mp4; codecs="avc1.640032,mp4a.40.2"';

export const MENU_PREVIEW_VIDEO_DEFINITIONS = Object.freeze({
  'atomic-acres': Object.freeze({
    arenaId: 'atomic-acres',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // NUKE TOWN',
    motionLabel: 'AUTHORED COCKPIT FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    presentationId: 'menu-video-runtime-helo-nuke-town-v7',
    mediaAvailable: true,
    webm: `${ROOT}/atomic-acres.webm?v=${CACHE_KEY}`,
    mp4: `${ROOT}/atomic-acres.mp4?v=${CACHE_KEY}`,
    poster: `${ROOT}/atomic-acres.webp?v=${CACHE_KEY}`,
    durationSeconds: 8,
    width: 2560,
    height: 1440,
  }),
  'skyline-terminal': Object.freeze({
    arenaId: 'skyline-terminal',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // TERMINAL',
    motionLabel: 'AUTHORED COCKPIT FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    presentationId: 'menu-video-runtime-helo-terminal-v7',
    mediaAvailable: true,
    webm: `${ROOT}/skyline-terminal.webm?v=${CACHE_KEY}`,
    mp4: `${ROOT}/skyline-terminal.mp4?v=${CACHE_KEY}`,
    poster: `${ROOT}/skyline-terminal.webp?v=${CACHE_KEY}`,
    durationSeconds: 8,
    width: 2560,
    height: 1440,
  }),
  'rustworks-1v1': Object.freeze({
    arenaId: 'rustworks-1v1',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // RUSTRIG',
    motionLabel: 'AUTHORED COCKPIT FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    presentationId: 'menu-video-runtime-helo-rustrig-v7',
    mediaAvailable: true,
    webm: `${ROOT}/rustworks-1v1.webm?v=${CACHE_KEY}`,
    mp4: `${ROOT}/rustworks-1v1.mp4?v=${CACHE_KEY}`,
    poster: `${ROOT}/rustworks-1v1.webp?v=${CACHE_KEY}`,
    durationSeconds: 8,
    width: 2560,
    height: 1440,
  }),
  'gun-range': Object.freeze({
    arenaId: 'gun-range',
    frame: 'cat',
    label: 'PRERECORDED CAT-CAM // GUN RANGE',
    motionLabel: 'JOYFUL FIRST-PERSON PROWL',
    reducedMotionLabel: 'CURIOUS CAT-CAM HOLD',
    presentationId: 'menu-video-runtime-cat-gun-range-v5',
    mediaAvailable: true,
    webm: `${ROOT}/gun-range.webm?v=${CACHE_KEY}`,
    mp4: `${ROOT}/gun-range.mp4?v=${CACHE_KEY}`,
    poster: `${ROOT}/gun-range.webp?v=${CACHE_KEY}`,
    durationSeconds: 8,
    width: 2560,
    height: 1440,
  }),
  // HF-372 (Pass 77): the outstanding deliverable HF-359 left open is now met.
  // Both arenas were captured from their actual authoritative runtime arena by
  // the same offline recipe the first four used, then encoded by
  // scripts/assets/finalize-pass77-arena-menu-previews.mjs into their own
  // additive cache family. Until this landed, both map cards showed a labelled
  // "PREVIEW STANDBY" placeholder AND their deployment loading screen was blank,
  // because that surface reuses this poster and this video element.
  'farcrysis': Object.freeze({
    arenaId: 'farcrysis',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // FARCRYSIS',
    motionLabel: 'AUTHORED ISLAND FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    presentationId: 'menu-video-runtime-helo-farcrysis-v1',
    mediaAvailable: true,
    webm: `${ROOT}/farcrysis.webm?v=${PASS77_CACHE_KEY}`,
    mp4: `${ROOT}/farcrysis.mp4?v=${PASS77_CACHE_KEY}`,
    poster: `${ROOT}/farcrysis.webp?v=${PASS77_CACHE_KEY}`,
    durationSeconds: 8,
    width: 2560,
    height: 1440,
  }),
  'high-seas': Object.freeze({
    arenaId: 'high-seas',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // HIGH SEAS',
    motionLabel: 'AUTHORED SHIP FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    presentationId: 'menu-video-runtime-helo-high-seas-v1',
    mediaAvailable: true,
    webm: `${ROOT}/high-seas.webm?v=${PASS77_CACHE_KEY}`,
    mp4: `${ROOT}/high-seas.mp4?v=${PASS77_CACHE_KEY}`,
    poster: `${ROOT}/high-seas.webp?v=${PASS77_CACHE_KEY}`,
    durationSeconds: 8,
    width: 2560,
    height: 1440,
  }),
  // owner 2026-08-30: Test1/Test2 now ship their own captures, taken from their
  // actual authoritative runtime arenas on the canonical WebGPU route by the
  // same offline recipe the first six used, then encoded by
  // scripts/assets/finalize-pass79-test-arena-menu-previews.mjs.
  'test1': Object.freeze({
    arenaId: 'test1',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // FIRING RANGE',
    motionLabel: 'AUTHORED RANGE FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    presentationId: 'menu-video-runtime-helo-test1-v1',
    mediaAvailable: true,
    webm: `${ROOT}/test1.webm?v=${PASS79_CACHE_KEY}`,
    mp4: `${ROOT}/test1.mp4?v=${PASS79_CACHE_KEY}`,
    poster: `${ROOT}/test1.webp?v=${PASS79_CACHE_KEY}`,
    durationSeconds: 8,
    width: 2560,
    height: 1440,
  }),
  'test2': Object.freeze({
    arenaId: 'test2',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // RAID',
    motionLabel: 'AUTHORED ESTATE FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    presentationId: 'menu-video-runtime-helo-test2-v1',
    mediaAvailable: true,
    webm: `${ROOT}/test2.webm?v=${PASS79_CACHE_KEY}`,
    mp4: `${ROOT}/test2.mp4?v=${PASS79_CACHE_KEY}`,
    poster: `${ROOT}/test2.webp?v=${PASS79_CACHE_KEY}`,
    durationSeconds: 8,
    width: 2560,
    height: 1440,
  }),
  // MAP3 (PREVIEW), owner 2026-09-02 via HF-405. Map 3 shipped for exactly one
  // commit (45f45cc2) with mediaAvailable FALSE and a labelled PREVIEW STANDBY
  // card, which was the honest state while its flyover did not exist. It now
  // has one: 240 frames captured from the actual Map 3 authoritative runtime
  // arena on the canonical WebGPU route, encoded with the Pass 66 profiles into
  // its own cache family. What it never did, at any point, was point at another
  // arena's bytes - which is what Test1 and Test2 shipped on 2026-08-30.
  'map3': Object.freeze({
    arenaId: 'map3',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // MAP 3',
    motionLabel: 'CORRIDOR GALLERY FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    presentationId: 'menu-video-runtime-helo-map3-v1',
    mediaAvailable: true,
    webm: `${ROOT}/map3.webm?v=${PASS84_CACHE_KEY}`,
    mp4: `${ROOT}/map3.mp4?v=${PASS84_CACHE_KEY}`,
    poster: `${ROOT}/map3.webp?v=${PASS84_CACHE_KEY}`,
    durationSeconds: 8,
    width: 2560,
    height: 1440,
  }),
  // NUKETOWN2 (PREVIEW), owner 2026-09-02 via HF-407. This card shipped for one
  // commit with mediaAvailable FALSE and a labelled PREVIEW STANDBY, which was
  // the honest state while its flyover did not exist. It now has one: 240 frames
  // captured headless from the actual Nuke Town Rebuild authoritative runtime
  // arena on the canonical WebGPU route (nvidia adapter, no software fallback),
  // encoded with the Pass 66 profiles into its own cache family. What it never
  // did, at any point, was point at another arena's bytes - which is what Test1
  // and Test2 shipped on 2026-08-30, and which
  // finalize-pass85-nuketown2-menu-preview.mjs asserts against the bytes it
  // wrote.
  'nuketown2': Object.freeze({
    arenaId: 'nuketown2',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // NUKE TOWN REBUILD',
    motionLabel: 'STREET AND BACK-YARD FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    // The presentation id names the CHOREOGRAPHY RECIPE, not the bytes, and it
    // must equal the one in source-assets/menu/pass85-nuketown2-preview - the
    // test pins those two together.
    presentationId: 'menu-video-runtime-helo-nuketown2-v1',
    mediaAvailable: true,
    webm: `${ROOT}/nuketown2.webm?v=${PASS85_CACHE_KEY}`,
    mp4: `${ROOT}/nuketown2.mp4?v=${PASS85_CACHE_KEY}`,
    poster: `${ROOT}/nuketown2.webp?v=${PASS85_CACHE_KEY}`,
    durationSeconds: 8,
    width: 2560,
    height: 1440,
  }),
  // RAID2 (PREVIEW, HF-408). This entry shipped `mediaAvailable: false` with
  // three empty strings for one pass - the honest standby state - and the
  // repair pass took it off standby the only legitimate way: by capturing
  // raid2's OWN flyover through the sanctioned generator
  // (AA_PREVIEW_REVIEW_ONLY=1 AA_PREVIEW_ARENAS=raid2, 240 frames at 2560x1440
  // on the WebGPU route, hardware adapter, one resident arena root, raid2
  // constructed first) and encoding it with the Pass 66 profiles through
  // scripts/assets/finalize-pass87-raid2-menu-preview.mjs, which asserts the
  // encoded bytes are byte-distinct from all nine other arenas before they are
  // allowed near public/.
  'raid2': Object.freeze({
    arenaId: 'raid2',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // RAID REBUILD',
    motionLabel: 'AUTHORED ESTATE FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    presentationId: 'menu-video-runtime-helo-raid2-v1',
    mediaAvailable: true,
    webm: `${ROOT}/raid2.webm?v=${PASS87_CACHE_KEY}`,
    mp4: `${ROOT}/raid2.mp4?v=${PASS87_CACHE_KEY}`,
    poster: `${ROOT}/raid2.webp?v=${PASS87_CACHE_KEY}`,
    durationSeconds: 8,
    width: 2560,
    height: 1440,
  }),
} satisfies Record<ArenaId, MenuPreviewVideoDefinition>);

export function menuPreviewVideoDefinition(arenaId: ArenaId): MenuPreviewVideoDefinition {
  return MENU_PREVIEW_VIDEO_DEFINITIONS[arenaId];
}

export function menuPreviewVideoMarkup(arenaId: ArenaId = 'atomic-acres'): string {
  const definition = menuPreviewVideoDefinition(arenaId);
  // HF-359: render deliberate standby placeholder when offline flyover media is unavailable
  if (!definition.mediaAvailable) {
    return `<div id="menu-preview-frame" data-frame="${definition.frame}" data-arena="${definition.arenaId}" data-motion="static" data-presentation="${definition.presentationId}" data-renderer-submissions="0" data-media-state="poster-fallback">
    <img id="menu-preview-poster" src="" width="${definition.width}" height="${definition.height}" alt="" decoding="async" fetchpriority="high" hidden>
    <video id="menu-preview-video" width="${definition.width}" height="${definition.height}" autoplay loop muted playsinline preload="none" aria-hidden="true" hidden>
    </video>
    <div class="preview-cockpit-hud" aria-hidden="true">
      <div class="cockpit-heading"><span>33</span><b>N</b><span>03</span></div>
      <div class="cockpit-instruments"><span><small>ALT</small><b>024 M</b></span><span><small>HDG</small><b>049</b></span><span><small>ROTOR</small><b>ARMED</b></span></div>
    </div>
    <span class="menu-preview-fallback" aria-hidden="true">PREVIEW STANDBY</span>
  </div>`;
  }
  return `<div id="menu-preview-frame" data-frame="${definition.frame}" data-arena="${definition.arenaId}" data-motion="video" data-presentation="${definition.presentationId}" data-renderer-submissions="0" data-media-state="poster">
    <img id="menu-preview-poster" src="${definition.poster}" width="${definition.width}" height="${definition.height}" alt="" decoding="async" fetchpriority="high">
    <video id="menu-preview-video" width="${definition.width}" height="${definition.height}" autoplay loop muted playsinline preload="metadata" poster="${definition.poster}" aria-hidden="true">
      <source src="${definition.webm}" type='${WEBM_MIME_TYPE}'>
      <source src="${definition.mp4}" type='${MP4_MIME_TYPE}'>
    </video>
    <div class="preview-cockpit-hud" aria-hidden="true">
      <div class="cockpit-heading"><span>33</span><b>N</b><span>03</span></div>
      <div class="cockpit-instruments"><span><small>ALT</small><b>024 M</b></span><span><small>HDG</small><b>049</b></span><span><small>ROTOR</small><b>ARMED</b></span></div>
    </div>
    <span class="menu-preview-fallback" aria-hidden="true">PREVIEW STANDBY</span>
  </div>`;
}

export type MenuPreviewVideoSnapshot = Readonly<{
  active: boolean;
  arenaId: ArenaId;
  generation: number;
  mediaState: string;
  sourceCount: number;
  reducedMotion: boolean;
  rendererSubmissions: 0;
  sources: Readonly<{ webm: string; mp4: string; poster: string }>;
  audioUnlocked: boolean;
  videoMuted: boolean;
  videoVolume: number;
  firstFramePresentedGeneration: number;
}>;

type MenuPreviewVideoElements = Readonly<{
  frame: HTMLElement;
  video: HTMLVideoElement;
  poster: HTMLImageElement;
  label: HTMLElement;
  motion: HTMLElement;
}>;

/**
 * Owns the single selected prerecorded preview. Sources for the previous map
 * are detached before the next pair is admitted, so rapid map switching cannot
 * keep four decoders or let an older play promise claim the current surface.
 */
export class MenuPreviewVideoController {
  private generation = 0;
  private selected: MenuPreviewVideoDefinition;
  private active = false;
  private reducedMotion = false;
  private audioUnlocked = false;
  private audioMutedBySettings = false;
  private audioVolume = 0.12;
  private switchAbort = new AbortController();
  private firstFramePresentedGeneration = -1;
  private readonly firstFrameWaiters = new Set<(generation: number) => void>();

  constructor(private readonly elements: MenuPreviewVideoElements, initialArena: ArenaId = 'atomic-acres') {
    this.selected = menuPreviewVideoDefinition(initialArena);
    this.elements.video.autoplay = true;
    this.elements.video.loop = true;
    this.elements.video.muted = true;
    this.elements.video.playsInline = true;
    this.elements.video.preload = 'metadata';
    this.applyAudioMix();
    this.applyDefinition(this.selected, false);
  }

  configureAudio(volume: number, muted: boolean): void {
    this.audioVolume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));
    this.audioMutedBySettings = muted;
    this.applyAudioMix();
  }

  unlockAudio(): void {
    this.audioUnlocked = true;
    this.applyAudioMix();
  }

  setActive(active: boolean): void {
    this.active = active;
    this.elements.frame.dataset.active = String(active);
    if (!active || this.reducedMotion || !this.selected.mediaAvailable) {
      this.elements.video.pause();
      return;
    }
    this.requestPlay(this.generation);
  }

  select(arenaId: ArenaId, reducedMotion: boolean): void {
    if (arenaId === this.selected.arenaId && reducedMotion === this.reducedMotion) return;
    this.generation += 1;
    this.selected = menuPreviewVideoDefinition(arenaId);
    this.reducedMotion = reducedMotion;
    this.applyDefinition(this.selected, reducedMotion);
  }

  /** Resolves only after the selected generation has presented video or its poster fallback. */
  whenFirstFramePresented(): Promise<number> {
    const generation = this.generation;
    if (this.firstFramePresentedGeneration === generation) return Promise.resolve(generation);
    return new Promise<number>((resolve) => {
      this.firstFrameWaiters.add(resolve);
    });
  }

  snapshot(): MenuPreviewVideoSnapshot {
    return Object.freeze({
      active: this.active,
      arenaId: this.selected.arenaId,
      generation: this.generation,
      mediaState: this.elements.frame.dataset.mediaState ?? 'unknown',
      sourceCount: this.elements.video.querySelectorAll('source').length,
      reducedMotion: this.reducedMotion,
      rendererSubmissions: 0,
      sources: Object.freeze({
        webm: this.selected.webm,
        mp4: this.selected.mp4,
        poster: this.selected.poster,
      }),
      audioUnlocked: this.audioUnlocked,
      videoMuted: this.elements.video.muted,
      videoVolume: this.elements.video.volume,
      firstFramePresentedGeneration: this.firstFramePresentedGeneration,
    });
  }

  dispose(): void {
    this.switchAbort.abort();
    this.elements.video.pause();
    this.elements.video.muted = true;
    this.detachSources();
    this.active = false;
  }

  private applyDefinition(definition: MenuPreviewVideoDefinition, reducedMotion: boolean): void {
    this.switchAbort.abort();
    this.switchAbort = new AbortController();
    const generation = this.generation;
    const { frame, video, poster, label, motion } = this.elements;

    video.pause();
    this.detachSources();

    // HF-359 (Pass 74): if media is unavailable (e.g. farcrysis pending offline flyover render),
    // cleanly degrade to labelled standby placeholder without issuing failing network requests.
    if (!definition.mediaAvailable) {
      poster.removeAttribute('src');
      poster.hidden = true;
      video.removeAttribute('poster');
      video.removeAttribute('src');
      video.hidden = true;
      frame.dataset.frame = definition.frame;
      frame.dataset.arena = definition.arenaId;
      frame.dataset.motion = 'static';
      frame.dataset.presentation = definition.presentationId;
      frame.dataset.mediaState = 'poster-fallback';
      frame.dataset.generation = String(generation);
      frame.dataset.rendererSubmissions = '0';
      label.textContent = definition.label;
      motion.textContent = definition.motionLabel;
      queueMicrotask(() => this.resolveFirstFrame(generation));
      return;
    }

    poster.src = definition.poster;
    poster.width = definition.width;
    poster.height = definition.height;
    video.poster = definition.poster;
    frame.dataset.frame = definition.frame;
    frame.dataset.arena = definition.arenaId;
    frame.dataset.motion = reducedMotion ? 'static' : 'video';
    frame.dataset.presentation = definition.presentationId;
    frame.dataset.mediaState = reducedMotion ? 'reduced-motion-poster' : 'loading';
    frame.dataset.generation = String(generation);
    frame.dataset.rendererSubmissions = '0';
    label.textContent = definition.label;
    motion.textContent = reducedMotion ? definition.reducedMotionLabel : definition.motionLabel;
    poster.hidden = false;
    video.hidden = reducedMotion;

    // Safari/WebKit can visibly present the poster while never dispatching a
    // usable video loadeddata/playing event for the selected codec. The poster
    // is a valid first frame, so it must release deployment preparation instead
    // of leaving weaponReady false forever. Video playback may still replace it
    // later without changing generation ownership.
    const resolvePresentedPoster = () => {
      if (generation !== this.generation || definition.arenaId !== this.selected.arenaId) return;
      if (frame.dataset.mediaState === 'loading') frame.dataset.mediaState = 'poster-ready';
      this.resolveFirstFrame(generation);
    };
    if (poster.complete) queueMicrotask(resolvePresentedPoster);
    else {
      poster.addEventListener('load', resolvePresentedPoster, { once: true, signal: this.switchAbort.signal });
      poster.addEventListener('error', resolvePresentedPoster, { once: true, signal: this.switchAbort.signal });
    }
    void poster.decode().then(resolvePresentedPoster).catch(() => {});

    if (reducedMotion) {
      video.removeAttribute('src');
      video.load();
      return;
    }

    const doc = video.ownerDocument ?? globalThis.document;
    for (const source of [
      { src: definition.webm, type: WEBM_MIME_TYPE },
      { src: definition.mp4, type: MP4_MIME_TYPE },
    ]) {
      const element = doc.createElement('source');
      element.src = source.src;
      element.type = source.type;
      video.append(element);
    }
    video.addEventListener('loadeddata', () => {
      if (generation !== this.generation || definition.arenaId !== this.selected.arenaId) return;
      frame.dataset.mediaState = 'ready';
      this.resolveFirstFrame(generation);
      if (this.active) this.requestPlay(generation);
    }, { once: true, signal: this.switchAbort.signal });
    video.addEventListener('playing', () => {
      if (generation !== this.generation || definition.arenaId !== this.selected.arenaId) return;
      const revealPresentedFrame = () => {
        if (!this.active || generation !== this.generation || definition.arenaId !== this.selected.arenaId) return;
        frame.dataset.mediaState = 'playing';
        poster.hidden = true;
        this.resolveFirstFrame(generation);
      };
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => revealPresentedFrame());
      } else {
        requestAnimationFrame(() => requestAnimationFrame(revealPresentedFrame));
      }
    }, { signal: this.switchAbort.signal });
    video.addEventListener('error', () => {
      if (generation !== this.generation || definition.arenaId !== this.selected.arenaId) return;
      frame.dataset.mediaState = 'poster-fallback';
      poster.hidden = false;
      video.hidden = true;
      this.resolveFirstFrame(generation);
    }, { once: true, signal: this.switchAbort.signal });
    video.load();
    if (this.active) this.requestPlay(generation);
  }

  private detachSources(): void {
    this.elements.video.removeAttribute('src');
    for (const source of this.elements.video.querySelectorAll('source')) source.remove();
  }

  private applyAudioMix(): void {
    this.elements.video.volume = this.audioVolume;
    this.elements.video.muted = !this.audioUnlocked || this.audioMutedBySettings || this.audioVolume <= 0;
  }

  private resolveFirstFrame(generation: number): void {
    if (generation !== this.generation) return;
    this.firstFramePresentedGeneration = generation;
    const waiters = [...this.firstFrameWaiters];
    this.firstFrameWaiters.clear();
    for (const resolve of waiters) resolve(generation);
  }

  private requestPlay(generation: number): void {
    if (!this.active || this.reducedMotion || !this.selected.mediaAvailable || generation !== this.generation) return;
    const attempted = this.elements.video.play();
    if (!attempted) return;
    void attempted.catch(() => {
      if (generation !== this.generation) return;
      this.elements.frame.dataset.mediaState = 'poster-fallback';
      this.elements.poster.hidden = false;
      this.resolveFirstFrame(generation);
    });
  }
}

export function assertMenuPreviewVideoInventory(): void {
  const configured = Object.keys(MENU_PREVIEW_VIDEO_DEFINITIONS).sort();
  const selectable = ARENA_SELECTIONS.map((arena) => arena.id).sort();
  if (configured.length !== selectable.length || configured.some((id, index) => id !== selectable[index])) {
    throw new Error(`Menu preview video inventory drift: configured=${configured.join(',')} selectable=${selectable.join(',')}`);
  }
  const paths = new Set<string>();
  for (const definition of Object.values(MENU_PREVIEW_VIDEO_DEFINITIONS)) {
    // HF-359: only assert path distinctness for definitions with available media
    if (!definition.mediaAvailable) continue;
    for (const path of [definition.webm, definition.mp4, definition.poster]) {
      if (paths.has(path)) throw new Error(`Menu preview asset is not distinct: ${path}`);
      paths.add(path);
    }
  }
}

assertMenuPreviewVideoInventory();
