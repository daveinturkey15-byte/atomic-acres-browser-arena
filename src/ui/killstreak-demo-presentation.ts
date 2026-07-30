import type { Pass65KillstreakId } from '../killstreak-catalog';

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
  /** Optional future prerecorded media. Null means the local DOM presentation is authoritative. */
  videoPath: string | null;
}>;

export type KillstreakDemoDefinition = Readonly<{
  id: Pass65KillstreakId;
  kind: KillstreakDemoKind;
  eyebrow: string;
  title: string;
  summary: string;
  accent: string;
  beats: readonly [string, string, string];
  media: KillstreakDemoMedia;
}>;

const ATOMIC_POSTER = './assets/original/menu-previews/atomic-acres.webp';
const TERMINAL_POSTER = './assets/original/menu-previews/skyline-terminal.webp';
const RUSTRIG_POSTER = './assets/original/menu-previews/rustworks-1v1.webp';

function definition(value: KillstreakDemoDefinition): KillstreakDemoDefinition {
  return Object.freeze({ ...value, beats: Object.freeze([...value.beats]) as KillstreakDemoDefinition['beats'], media: Object.freeze(value.media) });
}

export const KILLSTREAK_DEMO_MEDIA: Readonly<Record<Pass65KillstreakId, KillstreakDemoDefinition>> = Object.freeze({
  'scout-sweep': definition({
    id: 'scout-sweep', kind: 'radar-sweep', eyebrow: 'RECON PULSE', title: 'SCOUT SWEEP',
    summary: 'A bounded scan presentation shows the short reveal cadence without starting the arena renderer.',
    accent: '#70eee1', beats: ['Emit tactical sweep', 'Resolve enemy pings', 'Expire after scan window'],
    media: { posterPath: ATOMIC_POSTER, videoPath: null },
  }),
  adrenaline: definition({
    id: 'adrenaline', kind: 'adrenaline-pulse', eyebrow: 'MOMENTUM SURGE', title: 'ADRENALINE BOOST',
    summary: 'A compact pulse deck previews the timed operator boost and its clear recovery phase.',
    accent: '#ffb44f', beats: ['Inject boost', 'Hold timed advantage', 'Recover to baseline'],
    media: { posterPath: RUSTRIG_POSTER, videoPath: null },
  }),
  'care-package': definition({
    id: 'care-package', kind: 'cargo-drop', eyebrow: 'CARGO DELIVERY', title: 'CARE PACKAGE',
    summary: 'The local presentation traces aircraft ingress, parachute descent and the collection window.',
    accent: '#ffca57', beats: ['Mark delivery point', 'Aircraft crosses theatre', 'Parachute crate for collection'],
    media: { posterPath: ATOMIC_POSTER, videoPath: null },
  }),
  yardhawk: definition({
    id: 'yardhawk', kind: 'yardhawk-orbit', eyebrow: 'AUTONOMOUS HUNTER', title: 'YARDHAWK',
    summary: 'A single hunter maintains an elevated orbit before committing to a verified target.',
    accent: '#72e7ff', beats: ['Spawn above map centre', 'Acquire visible target', 'Attack then re-form orbit'],
    media: { posterPath: TERMINAL_POSTER, videoPath: null },
  }),
  'piloted-drone': definition({
    id: 'piloted-drone', kind: 'pilot-feed', eyebrow: 'OPTIONAL POSSESSION', title: 'PILOTED DRONE',
    summary: 'The feed preview distinguishes autonomous patrol from the optional first-person gun control window.',
    accent: '#7be9de', beats: ['Deploy at map centre', 'Patrol autonomously', 'Hold to possess or exit'],
    media: { posterPath: TERMINAL_POSTER, videoPath: null },
  }),
  'tri-pass': definition({
    id: 'tri-pass', kind: 'tri-pass', eyebrow: 'THREE-LANE STRIKE', title: 'TRI-PASS STRIKE',
    summary: 'Three separated attack lanes traverse the selected line with readable spacing and timing.',
    accent: '#ff735f', beats: ['Author target line', 'Commit three passes', 'Clear strike corridor'],
    media: { posterPath: RUSTRIG_POSTER, videoPath: null },
  }),
  'carpet-bomber': definition({
    id: 'carpet-bomber', kind: 'carpet-run', eyebrow: 'DIRECTIONAL PAYLOAD', title: 'CARPET BOMBER',
    summary: 'The presentation previews caller-relative direction, the red corridor and the ordered payload run.',
    accent: '#ff685d', beats: ['Place target X', 'Confirm away-facing corridor', 'Aircraft releases ordered payload'],
    media: { posterPath: ATOMIC_POSTER, videoPath: null },
  }),
  'hunter-swarm': definition({
    id: 'hunter-swarm', kind: 'hunter-cluster', eyebrow: 'CLUSTERED HUNTERS', title: 'HUNTER SWARM',
    summary: 'A spread formation separates into target clusters without stacking individual airframes.',
    accent: '#79efe3', beats: ['Spawn spread formation', 'Assign target clusters', 'Maintain separation while engaging'],
    media: { posterPath: RUSTRIG_POSTER, videoPath: null },
  }),
  chopper: definition({
    id: 'chopper', kind: 'chopper-orbit', eyebrow: 'AIRBORNE GUN PLATFORM', title: 'CHOPPER GUNNER',
    summary: 'An elevated orbit and clean gunner sightline preview autonomous flight with optional weapon control.',
    accent: '#5ce9ff', beats: ['Enter authored orbit', 'Track visible targets', 'Hold to gun; release to exit'],
    media: { posterPath: TERMINAL_POSTER, videoPath: null },
  }),
  nuke: definition({
    id: 'nuke', kind: 'nuke-warning', eyebrow: 'ULTIMATE WARNING', title: 'NUKE',
    summary: 'A static theatre poster carries the global warning and countdown choreography without simulating a match.',
    accent: '#ff5f4c', beats: ['Broadcast global warning', 'Run visible countdown', 'Resolve match-ending strike'],
    media: { posterPath: ATOMIC_POSTER, videoPath: null },
  }),
  'drone-swarm': definition({
    id: 'drone-swarm', kind: 'drone-cloud', eyebrow: 'ULTIMATE AIRSPACE', title: 'DRONE SWARM',
    summary: 'Multiple separated clusters hold a safe terrain-relative altitude while distributing targets.',
    accent: '#8ef6df', beats: ['Fill centre airspace', 'Spread into clusters', 'Engage without ground-hugging'],
    media: { posterPath: RUSTRIG_POSTER, videoPath: null },
  }),
});

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function beatsMarkup(definitionValue: KillstreakDemoDefinition): string {
  return definitionValue.beats.map((beat, index) => `<li><i>0${index + 1}</i><span>${escapeHtml(beat)}</span></li>`).join('');
}

export function killstreakDemoRailMarkup(initialId: Pass65KillstreakId): string {
  const initial = KILLSTREAK_DEMO_MEDIA[initialId];
  return `<aside id="killstreak-demo-rail" class="killstreak-demo-rail" aria-labelledby="killstreak-demo-title" data-demo-id="${initial.id}" data-demo-kind="${initial.kind}" data-motion="animated" style="--killstreak-demo-accent:${initial.accent}">
    <header><small data-demo-eyebrow>${initial.eyebrow}</small><strong id="killstreak-demo-title" data-demo-title>${initial.title}</strong></header>
    <div class="killstreak-demo-viewport">
      <img data-demo-poster src="${initial.media.posterPath}" alt="${escapeHtml(`${initial.title} local presentation poster`)}" width="640" height="360" loading="lazy" decoding="async">
      <div class="killstreak-demo-choreography" aria-hidden="true">
        <i class="demo-scan"></i><i class="demo-path"></i><i class="demo-platform"></i><i class="demo-payload"></i>
        <i class="demo-node demo-node-a"></i><i class="demo-node demo-node-b"></i><i class="demo-node demo-node-c"></i>
      </div>
      <span class="killstreak-demo-mode" data-demo-mode>PREAUTHORED LOCAL PRESENTATION</span>
    </div>
    <p data-demo-summary>${escapeHtml(initial.summary)}</p>
    <ol data-demo-beats>${beatsMarkup(initial)}</ol>
    <footer><span>BOUNDED UI MEDIA</span><b>NO LIVE GAMEPLAY RENDER</b></footer>
  </aside>`;
}

export type KillstreakDemoRailBinding = Readonly<{
  show: (id: Pass65KillstreakId) => void;
  syncMotion: () => void;
}>;

export function bindKillstreakDemoRail(root: ParentNode, initialId: Pass65KillstreakId): KillstreakDemoRailBinding {
  const rail = root.querySelector<HTMLElement>('#killstreak-demo-rail');
  if (!rail) return Object.freeze({ show: () => undefined, syncMotion: () => undefined });
  const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  let currentId = initialId;

  const reducedMotion = (): boolean => motionMedia.matches || document.documentElement.dataset.reducedMotion === 'true';
  const syncMotion = (): void => {
    const posterOnly = reducedMotion();
    rail.dataset.motion = posterOnly ? 'poster' : 'animated';
    const mode = rail.querySelector<HTMLElement>('[data-demo-mode]');
    if (mode) mode.textContent = posterOnly ? 'REDUCED MOTION · POSTER ONLY' : 'PREAUTHORED LOCAL PRESENTATION';
    const video = rail.querySelector<HTMLVideoElement>('video[data-demo-video]');
    if (video) {
      if (posterOnly) video.pause();
      else void video.play().catch(() => undefined);
    }
  };

  const show = (id: Pass65KillstreakId): void => {
    currentId = id;
    const next = KILLSTREAK_DEMO_MEDIA[id];
    rail.dataset.demoId = id;
    rail.dataset.demoKind = next.kind;
    rail.style.setProperty('--killstreak-demo-accent', next.accent);
    const eyebrow = rail.querySelector<HTMLElement>('[data-demo-eyebrow]');
    const title = rail.querySelector<HTMLElement>('[data-demo-title]');
    const summary = rail.querySelector<HTMLElement>('[data-demo-summary]');
    const poster = rail.querySelector<HTMLImageElement>('[data-demo-poster]');
    const beats = rail.querySelector<HTMLOListElement>('[data-demo-beats]');
    if (eyebrow) eyebrow.textContent = next.eyebrow;
    if (title) title.textContent = next.title;
    if (summary) summary.textContent = next.summary;
    if (poster) {
      poster.src = next.media.posterPath;
      poster.alt = `${next.title} local presentation poster`;
    }
    if (beats) beats.innerHTML = beatsMarkup(next);

    rail.querySelector<HTMLVideoElement>('video[data-demo-video]')?.remove();
    if (next.media.videoPath !== null && !reducedMotion()) {
      const video = document.createElement('video');
      video.dataset.demoVideo = '';
      video.src = next.media.videoPath;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      rail.querySelector('.killstreak-demo-viewport')?.prepend(video);
      void video.play().catch(() => undefined);
    }
    syncMotion();
  };

  motionMedia.addEventListener('change', () => { show(currentId); });
  const observer = new MutationObserver(() => syncMotion());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
  show(initialId);
  return Object.freeze({ show, syncMotion });
}
