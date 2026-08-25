import type { SelectableKillstreakId } from '../killstreak-catalog';
import { killstreakDemoPosterPath, killstreakDemoVideoPath } from '../killstreak-demo-capture-contract';

export type KillstreakDemoKind =
  | 'radar-sweep'
  | 'adrenaline-pulse'
  | 'cargo-drop'
  | 'yardhawk-orbit'
  | 'pilot-feed'
  | 'tri-pass'
  | 'carpet-run'
  | 'hunter-cluster'
  | 'chopper-orbit'
  | 'nuke-warning'
  | 'drone-cloud';

export type KillstreakDemoMedia = Readonly<{
  posterPath: string;
  videoPath: string;
}>;

export type KillstreakDemoDefinition = Readonly<{
  id: SelectableKillstreakId;
  kind: KillstreakDemoKind;
  eyebrow: string;
  title: string;
  summary: string;
  accent: string;
  beats: readonly [string, string, string];
  media: KillstreakDemoMedia;
}>;

function definition(value: KillstreakDemoDefinition): KillstreakDemoDefinition {
  return Object.freeze({ ...value, beats: Object.freeze([...value.beats]) as KillstreakDemoDefinition['beats'], media: Object.freeze(value.media) });
}

export const KILLSTREAK_DEMO_MEDIA: Readonly<Record<SelectableKillstreakId, KillstreakDemoDefinition>> = Object.freeze({
  'scout-sweep': definition({
    id: 'scout-sweep', kind: 'radar-sweep', eyebrow: 'RECON PULSE', title: 'SCOUT SWEEP',
    summary: 'A verified test-bay clip shows the real short reveal cadence without starting a menu gameplay renderer.',
    accent: '#f5d4bd', beats: ['Emit tactical sweep', 'Resolve enemy pings', 'Expire after scan window'],
    media: { posterPath: killstreakDemoPosterPath('scout-sweep'), videoPath: killstreakDemoVideoPath('scout-sweep') },
  }),
  adrenaline: definition({
    id: 'adrenaline', kind: 'adrenaline-pulse', eyebrow: 'MOMENTUM SURGE', title: 'ADRENALINE BOOST',
    summary: 'A verified test-bay clip shows the timed operator boost and its clear recovery phase.',
    accent: '#ffb44f', beats: ['Inject boost', 'Hold timed advantage', 'Recover to baseline'],
    media: { posterPath: killstreakDemoPosterPath('adrenaline'), videoPath: killstreakDemoVideoPath('adrenaline') },
  }),
  'care-package': definition({
    id: 'care-package', kind: 'cargo-drop', eyebrow: 'CARGO DELIVERY', title: 'CARE PACKAGE',
    summary: 'The real test-bay recording follows aircraft ingress, parachute descent and the collection window.',
    accent: '#ffca57', beats: ['Mark delivery point', 'Aircraft crosses theatre', 'Parachute crate for collection'],
    media: { posterPath: killstreakDemoPosterPath('care-package'), videoPath: killstreakDemoVideoPath('care-package') },
  }),
  yardhawk: definition({
    id: 'yardhawk', kind: 'yardhawk-orbit', eyebrow: 'AUTONOMOUS HUNTER', title: 'YARDHAWK',
    summary: 'The real test-bay recording shows a single hunter orbiting before it commits to a target.',
    accent: '#f4d0b8', beats: ['Spawn above map centre', 'Acquire visible target', 'Attack then re-form orbit'],
    media: { posterPath: killstreakDemoPosterPath('yardhawk'), videoPath: killstreakDemoVideoPath('yardhawk') },
  }),
  'piloted-drone': definition({
    id: 'piloted-drone', kind: 'pilot-feed', eyebrow: 'OPTIONAL POSSESSION', title: 'PILOTED DRONE',
    summary: 'The real test-bay recording distinguishes autonomous patrol from the optional gun-control window.',
    accent: '#f3d0b9', beats: ['Deploy at map centre', 'Patrol autonomously', 'Press its assigned key again to operate'],
    media: { posterPath: killstreakDemoPosterPath('piloted-drone'), videoPath: killstreakDemoVideoPath('piloted-drone') },
  }),
  'tri-pass': definition({
    id: 'tri-pass', kind: 'tri-pass', eyebrow: 'THREE-LANE STRIKE', title: 'TRI-PASS STRIKE',
    summary: 'The real test-bay recording shows three attack lanes crossing the selected line with readable spacing.',
    accent: '#ff735f', beats: ['Author target line', 'Commit three passes', 'Clear strike corridor'],
    media: { posterPath: killstreakDemoPosterPath('tri-pass'), videoPath: killstreakDemoVideoPath('tri-pass') },
  }),
  'carpet-bomber': definition({
    id: 'carpet-bomber', kind: 'carpet-run', eyebrow: 'DIRECTIONAL PAYLOAD', title: 'CARPET BOMBER',
    summary: 'The real test-bay recording shows caller-relative direction, the red corridor and the payload run.',
    accent: '#ff685d', beats: ['Place target X', 'Confirm away-facing corridor', 'Aircraft releases ordered payload'],
    media: { posterPath: killstreakDemoPosterPath('carpet-bomber'), videoPath: killstreakDemoVideoPath('carpet-bomber') },
  }),
  'hunter-swarm': definition({
    id: 'hunter-swarm', kind: 'hunter-cluster', eyebrow: 'CLUSTERED HUNTERS', title: 'HUNTER SWARM',
    summary: 'The real test-bay recording shows the spread formation separating into target clusters.',
    accent: '#f6d6c1', beats: ['Spawn spread formation', 'Assign target clusters', 'Maintain separation while engaging'],
    media: { posterPath: killstreakDemoPosterPath('hunter-swarm'), videoPath: killstreakDemoVideoPath('hunter-swarm') },
  }),
  chopper: definition({
    id: 'chopper', kind: 'chopper-orbit', eyebrow: 'AIRBORNE GUN PLATFORM', title: 'CHOPPER GUNNER',
    summary: 'The real test-bay recording shows the elevated orbit, damage and optional gunner-control sightline.',
    accent: '#f4d0b8', beats: ['Enter authored orbit', 'Track visible targets', 'Press its assigned key again to operate'],
    media: { posterPath: killstreakDemoPosterPath('chopper'), videoPath: killstreakDemoVideoPath('chopper') },
  }),
  nuke: definition({
    id: 'nuke', kind: 'nuke-warning', eyebrow: 'ULTIMATE WARNING', title: 'NUKE',
    summary: 'The real test-bay recording carries the global warning and visible countdown from normal activation.',
    accent: '#ff5f4c', beats: ['Broadcast global warning', 'Run visible countdown', 'Resolve match-ending strike'],
    media: { posterPath: killstreakDemoPosterPath('nuke'), videoPath: killstreakDemoVideoPath('nuke') },
  }),
  'drone-swarm': definition({
    id: 'drone-swarm', kind: 'drone-cloud', eyebrow: 'ULTIMATE AIRSPACE', title: 'DRONE SWARM',
    summary: 'The real test-bay recording shows separated clusters holding altitude while distributing targets.',
    accent: '#f8dfce', beats: ['Fill centre airspace', 'Spread into clusters', 'Engage without ground-hugging'],
    media: { posterPath: killstreakDemoPosterPath('drone-swarm'), videoPath: killstreakDemoVideoPath('drone-swarm') },
  }),
});

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function beatsMarkup(definitionValue: KillstreakDemoDefinition): string {
  return definitionValue.beats.map((beat, index) => `<li><i>0${index + 1}</i><span>${escapeHtml(beat)}</span></li>`).join('');
}

export function killstreakDemoRailMarkup(initialId: SelectableKillstreakId): string {
  const initial = KILLSTREAK_DEMO_MEDIA[initialId];
  return `<aside id="killstreak-demo-rail" class="killstreak-demo-rail" aria-labelledby="killstreak-demo-title" data-demo-id="${initial.id}" data-demo-kind="${initial.kind}" data-motion="inactive" data-media="poster" style="--killstreak-demo-accent:${initial.accent}">
    <header><small data-demo-eyebrow>${initial.eyebrow}</small><strong id="killstreak-demo-title" data-demo-title>${initial.title}</strong></header>
    <div class="killstreak-demo-viewport">
      <img data-demo-poster src="${initial.media.posterPath}" alt="${escapeHtml(`${initial.title} real Gun Range test-bay capture`)}" width="960" height="540" loading="lazy" decoding="async">
      <video data-demo-video muted loop playsinline preload="metadata" poster="${initial.media.posterPath}" aria-hidden="true"></video>
      <span class="killstreak-demo-mode" data-demo-mode>VERIFIED REAL TEST BAY MEDIA</span>
      <button class="killstreak-demo-toggle" type="button" data-demo-toggle aria-label="Pause killstreak demonstration" hidden>PAUSE</button>
    </div>
    <p data-demo-summary>${escapeHtml(initial.summary)}</p>
    <ol data-demo-beats>${beatsMarkup(initial)}</ol>
    <footer><span data-demo-footer-media>VERIFIED LOCAL POSTER</span><b>NO LIVE MENU RENDER</b></footer>
  </aside>`;
}

export type KillstreakDemoRailBinding = Readonly<{
  show: (id: SelectableKillstreakId) => void;
  syncMotion: () => void;
  dispose: () => void;
}>;

export function bindKillstreakDemoRail(root: ParentNode, initialId: SelectableKillstreakId): KillstreakDemoRailBinding {
  const rail = root.querySelector<HTMLElement>('#killstreak-demo-rail');
  if (!rail) return Object.freeze({ show: () => undefined, syncMotion: () => undefined, dispose: () => undefined });
  const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  const panel = rail.closest<HTMLElement>('[data-menu-panel="streaks"]');
  const video = rail.querySelector<HTMLVideoElement>('video[data-demo-video]');
  const poster = rail.querySelector<HTMLImageElement>('[data-demo-poster]');
  const mode = rail.querySelector<HTMLElement>('[data-demo-mode]');
  const footerMedia = rail.querySelector<HTMLElement>('[data-demo-footer-media]');
  const toggle = rail.querySelector<HTMLButtonElement>('[data-demo-toggle]');
  let currentId = initialId;
  let sourceGeneration = 0;
  let manualPaused = false;
  let activeSourceUrl = '';

  const reducedMotion = (): boolean => motionMedia.matches || document.documentElement.dataset.reducedMotion === 'true';
  const panelVisible = (): boolean => document.visibilityState === 'visible' && (panel === null || !panel.hidden);
  const setPosterState = (label: string): void => {
    rail.dataset.media = 'poster';
    if (mode) mode.textContent = label;
    if (footerMedia) footerMedia.textContent = 'VERIFIED LOCAL POSTER';
    if (toggle) toggle.hidden = true;
  };
  const releaseDecoder = (): void => {
    sourceGeneration += 1;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    delete video.dataset.demoId;
    activeSourceUrl = '';
    video.load();
  };
  const playCurrent = (): void => {
    const next = KILLSTREAK_DEMO_MEDIA[currentId];
    if (!video || reducedMotion() || !panelVisible()) {
      releaseDecoder();
      setPosterState(reducedMotion() ? 'REDUCED MOTION / REAL POSTER' : 'VERIFIED REAL TEST BAY MEDIA');
      return;
    }
    const sourceChanged = video.getAttribute('src') !== next.media.videoPath || video.dataset.demoId !== currentId;
    if (sourceChanged) {
      sourceGeneration += 1;
      video.pause();
      video.poster = next.media.posterPath;
      video.src = next.media.videoPath;
      video.dataset.demoId = currentId;
      activeSourceUrl = new URL(next.media.videoPath, document.baseURI).href;
      video.load();
      setPosterState('LOADING VERIFIED LOCAL VIDEO');
    }
    rail.dataset.motion = 'video';
    if (manualPaused) {
      rail.dataset.media = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? 'video' : 'poster';
      if (mode) mode.textContent = 'VERIFIED REAL TEST BAY VIDEO / PAUSED';
      if (footerMedia) footerMedia.textContent = 'VERIFIED LOCAL VIDEO';
      if (toggle) {
        toggle.hidden = false;
        toggle.textContent = 'PLAY';
        toggle.setAttribute('aria-label', 'Play killstreak demonstration');
      }
      return;
    }
    const generation = sourceGeneration;
    void video.play().catch(() => {
      if (generation !== sourceGeneration || video.dataset.demoId !== currentId) return;
      setPosterState('REAL POSTER / VIDEO UNAVAILABLE');
    });
  };
  const syncMotion = (): void => {
    rail.dataset.motion = reducedMotion() ? 'poster' : panelVisible() ? 'video' : 'inactive';
    playCurrent();
  };

  const show = (id: SelectableKillstreakId): void => {
    currentId = id;
    manualPaused = false;
    const next = KILLSTREAK_DEMO_MEDIA[id];
    rail.dataset.demoId = id;
    rail.dataset.demoKind = next.kind;
    rail.style.setProperty('--killstreak-demo-accent', next.accent);
    const eyebrow = rail.querySelector<HTMLElement>('[data-demo-eyebrow]');
    const title = rail.querySelector<HTMLElement>('[data-demo-title]');
    const summary = rail.querySelector<HTMLElement>('[data-demo-summary]');
    const beats = rail.querySelector<HTMLOListElement>('[data-demo-beats]');
    if (eyebrow) eyebrow.textContent = next.eyebrow;
    if (title) title.textContent = next.title;
    if (summary) summary.textContent = next.summary;
    if (poster) {
      poster.src = next.media.posterPath;
      poster.alt = `${next.title} real Gun Range test-bay capture`;
    }
    if (beats) beats.innerHTML = beatsMarkup(next);

    syncMotion();
  };

  const onMotionChange = (): void => syncMotion();
  const onPlaying = (): void => {
    if (!video || video.dataset.demoId !== currentId || video.currentSrc !== activeSourceUrl
      || reducedMotion() || !panelVisible()) return;
    rail.dataset.media = 'video';
    if (mode) mode.textContent = 'VERIFIED REAL GUN RANGE VIDEO';
    if (footerMedia) footerMedia.textContent = 'VERIFIED LOCAL VIDEO';
    if (toggle) {
      toggle.hidden = false;
      toggle.textContent = 'PAUSE';
      toggle.setAttribute('aria-label', 'Pause killstreak demonstration');
    }
  };
  const onVideoError = (): void => {
    if (!video || video.dataset.demoId !== currentId || video.src !== activeSourceUrl) return;
    setPosterState('REAL POSTER / VIDEO UNAVAILABLE');
  };
  const onToggle = (): void => {
    if (!video || reducedMotion() || !panelVisible()) return;
    manualPaused = !video.paused;
    if (manualPaused) {
      video.pause();
      rail.dataset.media = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? 'video' : 'poster';
      if (mode) mode.textContent = 'VERIFIED REAL TEST BAY VIDEO / PAUSED';
      if (toggle) {
        toggle.textContent = 'PLAY';
        toggle.setAttribute('aria-label', 'Play killstreak demonstration');
      }
    } else {
      playCurrent();
    }
  };
  motionMedia.addEventListener('change', onMotionChange);
  document.addEventListener('visibilitychange', onMotionChange);
  video?.addEventListener('playing', onPlaying);
  video?.addEventListener('error', onVideoError);
  toggle?.addEventListener('click', onToggle);
  const observer = new MutationObserver(() => syncMotion());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
  if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  show(initialId);
  return Object.freeze({
    show,
    syncMotion,
    dispose: () => {
      observer.disconnect();
      motionMedia.removeEventListener('change', onMotionChange);
      document.removeEventListener('visibilitychange', onMotionChange);
      video?.removeEventListener('playing', onPlaying);
      video?.removeEventListener('error', onVideoError);
      toggle?.removeEventListener('click', onToggle);
      releaseDecoder();
    },
  });
}
