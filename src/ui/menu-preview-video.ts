import { ARENA_SELECTIONS, type ArenaId } from '../map-selection';

export type MenuPreviewFrame = 'helicopter' | 'cat';

export type MenuPreviewVideoDefinition = Readonly<{
  arenaId: ArenaId;
  frame: MenuPreviewFrame;
  label: string;
  motionLabel: string;
  reducedMotionLabel: string;
  presentationId: string;
  webm: string;
  mp4: string;
  poster: string;
  durationSeconds: 8;
  width: 960;
  height: 540;
}>;

const ROOT = './assets/original/menu-previews';
const CACHE_KEY = 'pass65-runtime-preview-v7';

export const MENU_PREVIEW_VIDEO_DEFINITIONS = Object.freeze({
  'atomic-acres': Object.freeze({
    arenaId: 'atomic-acres',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // NUKE TOWN',
    motionLabel: 'AUTHORED COCKPIT FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    presentationId: 'menu-video-runtime-helo-nuke-town-v5',
    webm: `${ROOT}/atomic-acres.webm?v=${CACHE_KEY}`,
    mp4: `${ROOT}/atomic-acres.mp4?v=${CACHE_KEY}`,
    poster: `${ROOT}/atomic-acres.webp?v=${CACHE_KEY}`,
    durationSeconds: 8,
    width: 960,
    height: 540,
  }),
  'skyline-terminal': Object.freeze({
    arenaId: 'skyline-terminal',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // TERMINAL',
    motionLabel: 'AUTHORED COCKPIT FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    presentationId: 'menu-video-runtime-helo-terminal-v5',
    webm: `${ROOT}/skyline-terminal.webm?v=${CACHE_KEY}`,
    mp4: `${ROOT}/skyline-terminal.mp4?v=${CACHE_KEY}`,
    poster: `${ROOT}/skyline-terminal.webp?v=${CACHE_KEY}`,
    durationSeconds: 8,
    width: 960,
    height: 540,
  }),
  'rustworks-1v1': Object.freeze({
    arenaId: 'rustworks-1v1',
    frame: 'helicopter',
    label: 'PRERECORDED HELO // RUSTRIG',
    motionLabel: 'AUTHORED COCKPIT FLYOVER',
    reducedMotionLabel: 'STABILIZED PREVIEW FRAME',
    presentationId: 'menu-video-runtime-helo-rustrig-v5',
    webm: `${ROOT}/rustworks-1v1.webm?v=${CACHE_KEY}`,
    mp4: `${ROOT}/rustworks-1v1.mp4?v=${CACHE_KEY}`,
    poster: `${ROOT}/rustworks-1v1.webp?v=${CACHE_KEY}`,
    durationSeconds: 8,
    width: 960,
    height: 540,
  }),
  'gun-range': Object.freeze({
    arenaId: 'gun-range',
    frame: 'cat',
    label: 'PRERECORDED CAT-CAM // GUN RANGE',
    motionLabel: 'JOYFUL FIRST-PERSON PROWL',
    reducedMotionLabel: 'CURIOUS CAT-CAM HOLD',
    presentationId: 'menu-video-runtime-cat-gun-range-v4',
    webm: `${ROOT}/gun-range.webm?v=${CACHE_KEY}`,
    mp4: `${ROOT}/gun-range.mp4?v=${CACHE_KEY}`,
    poster: `${ROOT}/gun-range.webp?v=${CACHE_KEY}`,
    durationSeconds: 8,
    width: 960,
    height: 540,
  }),
} satisfies Record<ArenaId, MenuPreviewVideoDefinition>);

export function menuPreviewVideoDefinition(arenaId: ArenaId): MenuPreviewVideoDefinition {
  return MENU_PREVIEW_VIDEO_DEFINITIONS[arenaId];
}

export function menuPreviewVideoMarkup(arenaId: ArenaId = 'atomic-acres'): string {
  const definition = menuPreviewVideoDefinition(arenaId);
  return `<div id="menu-preview-frame" data-frame="${definition.frame}" data-arena="${definition.arenaId}" data-motion="video" data-presentation="${definition.presentationId}" data-renderer-submissions="0" data-media-state="poster">
    <img id="menu-preview-poster" src="${definition.poster}" width="${definition.width}" height="${definition.height}" alt="" decoding="async" fetchpriority="high">
    <video id="menu-preview-video" width="${definition.width}" height="${definition.height}" autoplay loop muted playsinline preload="metadata" poster="${definition.poster}" aria-hidden="true">
      <source src="${definition.webm}" type="video/webm; codecs=vp9,opus">
      <source src="${definition.mp4}" type="video/mp4; codecs=avc1.64001f,mp4a.40.2">
    </video>
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
    if (!active || this.reducedMotion) {
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

    if (reducedMotion) {
      video.removeAttribute('src');
      video.load();
      return;
    }

    for (const source of [
      { src: definition.webm, type: 'video/webm; codecs="vp9,opus"' },
      { src: definition.mp4, type: 'video/mp4; codecs="avc1.64001f,mp4a.40.2"' },
    ]) {
      const element = document.createElement('source');
      element.src = source.src;
      element.type = source.type;
      video.append(element);
    }
    video.addEventListener('loadeddata', () => {
      if (generation !== this.generation || definition.arenaId !== this.selected.arenaId) return;
      frame.dataset.mediaState = 'ready';
      if (this.active) this.requestPlay(generation);
    }, { once: true, signal: this.switchAbort.signal });
    video.addEventListener('playing', () => {
      if (generation !== this.generation || definition.arenaId !== this.selected.arenaId) return;
      const revealPresentedFrame = () => {
        if (!this.active || generation !== this.generation || definition.arenaId !== this.selected.arenaId) return;
        frame.dataset.mediaState = 'playing';
        poster.hidden = true;
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

  private requestPlay(generation: number): void {
    if (!this.active || this.reducedMotion || generation !== this.generation) return;
    const attempted = this.elements.video.play();
    if (!attempted) return;
    void attempted.catch(() => {
      if (generation !== this.generation) return;
      this.elements.frame.dataset.mediaState = 'poster-fallback';
      this.elements.poster.hidden = false;
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
    for (const path of [definition.webm, definition.mp4, definition.poster]) {
      if (paths.has(path)) throw new Error(`Menu preview asset is not distinct: ${path}`);
      paths.add(path);
    }
  }
}

assertMenuPreviewVideoInventory();
