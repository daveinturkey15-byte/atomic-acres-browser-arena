import releaseChannelsJson from '../release-channels.json';
import { CHANGELOG, PENDING_PRODUCTION_RELEASE } from './changelog';
import './style.css';
import './ui/tactical-ui.css';
import './ui/pass66-readability.css';
import './ui/pass66-overhaul.css';
import './ui/pass74-killstreak-selector.css';
// HF-362: intentionally LAST and unlayered so it can override
// pass66-readability.css, which is itself unlayered and outranks every @layer.
import './ui/pass74-visual-refresh.css';
// Pass 75 HUD stylisation redesign - after the Pass 74 sheet, same unlayered
// reason: pass66-readability.css is unlayered and outranks every @layer.
import './ui/pass75-hud-redesign.css';
import './ui/pass75-menu-redesign.css';
// HF-370: Pass 77 material + diegetic-motion reskin. Last and unlayered, same
// documented reason as every sheet above it - pass66-readability.css is
// unlayered and outranks every @layer, so a layered sheet could not land.
import './ui/pass77-instrument-hud.css';
import './ui/pass77-command-shell.css';
import {
  releaseChannelDecision,
  stableReleaseUrl,
  type ReleaseChannelConfig,
} from './release-channel';

const releaseChannels: ReleaseChannelConfig = releaseChannelsJson;
const stableFallback = releaseChannels.rollback ?? releaseChannels.stable;
const newestBuildIsPublished = CHANGELOG[0]?.releasedAt !== PENDING_PRODUCTION_RELEASE;
// The pass name used to be hand-written into both of these strings, and had been stale for
// ten passes: the shipped chooser introduced PASS 80 as "the local Pass 70 HITL candidate"
// and told the owner publication was disabled while he was reading it on a published URL.
// Every other field in this chooser already comes from release-channels.json; this one now
// does too, so the description cannot drift from the build it describes.
const latestDescription = newestBuildIsPublished
  ? releaseChannels.latest.description
  : `${releaseChannels.latest.description} Local HITL candidate - not yet published.`;
const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('Missing #app root');
const app = appElement;

/**
 * Steer a browser with a KNOWN-broken WebGPU compiler straight onto the compat route.
 *
 * The record is written by the in-game fallback after two failed deploys (measured:
 * Chrome 153 fails 9/9 un-instrumented WebGPU deploys with an internal Tint error, on
 * old builds and new alike). Without this, every session replays ~90 seconds of failed
 * attempts before recovering - which reads as "the game doesn't work", because for a
 * minute and a half it doesn't. Keyed to the FULL user agent so any browser update
 * clears it and WebGPU is tried again; an explicit ?renderer= always wins.
 */
function applyStickyRendererFallback(): void {
  try {
    const raw = localStorage.getItem('atomic-acres:renderer-fallback:v1');
    if (!raw) return;
    const record = JSON.parse(raw) as { userAgent?: string; at?: string; shimGeneration?: number };
    if (record.userAgent !== navigator.userAgent) {
      localStorage.removeItem('atomic-acres:renderer-fallback:v1');
      return;
    }
    // 2026-08-30: the Tint failure's ROOT CAUSE is fixed (chained-swizzle
    // shader shim, src/webgpu-tint-swizzle-shim.ts - deterministic repro went
    // 10-failures-then-fallback to 0-failures on stock Chrome 153). Records
    // written by pre-shim builds carry no shimGeneration; ignore them so the
    // shimmed WebGPU route gets its one honest retry. A post-shim failure
    // writes shimGeneration >= 1 and sticks as before.
    if ((record.shimGeneration ?? 0) < 1) {
      localStorage.removeItem('atomic-acres:renderer-fallback:v1');
      return;
    }
    // 2026-08-29: the Chrome 153 Tint race is intermittent and timing-
    // dependent (cold network 3/3 fail, warm cache 0/4), so a fallback older
    // than 24 h retries WebGPU rather than pinning the player to half the
    // frame rate until a browser update happens to land.
    const recordedAt = Date.parse(record.at ?? '');
    if (!Number.isFinite(recordedAt) || Date.now() - recordedAt > 24 * 60 * 60 * 1_000) {
      localStorage.removeItem('atomic-acres:renderer-fallback:v1');
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has('renderer')) return;
    url.searchParams.set('renderer', 'webgl2');
    window.history.replaceState(null, '', url);
  } catch { /* Storage-less contexts keep the per-session recovery. */ }
}

async function loadLatestBuild(): Promise<void> {
  document.title = 'Nuke Town — Browser Arena FPS';
  applyStickyRendererFallback();
  app.replaceChildren();
  await import('./main');
}

function openStableBuild(): void {
  window.location.assign(stableReleaseUrl(document.baseURI, stableFallback.path));
}

function showReleaseChooser(): void {
  document.title = 'Choose build — Nuke Town';
  app.innerHTML = `
    <main id="release-channel-gate" aria-labelledby="release-channel-title">
      <section class="release-channel-card">
        <div class="release-channel-eyebrow">NUKE TOWN · BUILD SELECT</div>
        <h1 id="release-channel-title">CHOOSE YOUR <span>DEPLOYMENT</span></h1>
        <p>${newestBuildIsPublished ? 'Load the newest approved build' : 'Review the current release candidate'}, or keep playing the preserved version people already know.</p>
        <div class="release-channel-options">
          <button type="button" class="release-channel-option primary" data-release-choice="latest">
            <small>${releaseChannels.experimental.pass} · ${newestBuildIsPublished ? 'LIVE' : 'RELEASE CANDIDATE'}</small>
            <strong>${releaseChannels.latest.label}</strong>
            <span>${latestDescription}</span>
          </button>
          <button type="button" class="release-channel-option" data-release-choice="stable">
            <small>${stableFallback.pass} · STABLE WEBGL</small>
            <strong>${stableFallback.label}</strong>
            <span>${stableFallback.description}</span>
          </button>
        </div>
        <section class="release-channel-refresh" aria-label="Refresh this version chooser">
          <div><strong>VERSION NOT UPDATED?</strong><span>Press Ctrl+Shift+R, or use the same hard game refresh available in Options.</span></div>
          <button id="release-channel-hard-refresh" type="button">HARD RESET / REFRESH</button>
        </section>
        <footer>The stable copy stays frozen while new releases move forward. You can use your browser's Back button to switch again.</footer>
      </section>
    </main>
  `;

  app.querySelector<HTMLButtonElement>('[data-release-choice="latest"]')?.addEventListener('click', () => {
    const next = new URL(window.location.href);
    next.searchParams.set('release', 'latest');
    window.history.replaceState(null, '', next);
    void loadLatestBuild();
  });
  app.querySelector<HTMLButtonElement>('[data-release-choice="stable"]')?.addEventListener('click', openStableBuild);
  app.querySelector<HTMLButtonElement>('#release-channel-hard-refresh')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((key) => window.caches.delete(key)));
      }
    } finally {
      const url = new URL(window.location.href);
      url.searchParams.set('cachebust', String(Date.now()));
      window.location.replace(url.toString());
    }
  });
}

const decision = releaseChannelDecision(
  window.location.search,
  window.location.hostname,
  releaseChannels.canonicalHostname,
);

if (decision === 'choose') showReleaseChooser();
else if (decision === 'stable') openStableBuild();
else void loadLatestBuild();
