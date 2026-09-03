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
// Owner 2026-08-31: "i dont want pass 63, stable webgl, i want the previous 1/2
// versions we had". This chooser - the one a DIRECT LINK or bookmark lands on,
// distinct from the root release shell - offered `rollback`, which is
// channels/pass63-rollback. That tree is not on gh-pages and 404s live, so the
// second card was a dead link.
//
// HF-400, owner 2026-09-02: "pin this version and remove all past versions, this
// can be the safe backup". After the pass87 publish the ONLY trees on gh-pages
// are channels/pass87 and channels/pass86, so the second card must be the PASS 86
// safe backup; `stable` (recent-stable) is retired by that publish and stays here
// only as a last resort the publish guard will refuse. `rollback` is deliberately
// not consulted; it stays in release-channels.json because project-map.ts
// documents it, but it must not be offered to a player until its tree exists.
// scripts/orchestration/publish_pass87.py parses this line and refuses to publish
// unless it resolves to channels/pass86.
const stableFallback = releaseChannels.pass86Backup ?? releaseChannels.stable;
const newestBuildIsPublished = CHANGELOG[0]?.releasedAt !== PENDING_PRODUCTION_RELEASE;
// The pass name used to be hand-written into both of these strings, and had been stale for
// ten passes: the shipped chooser introduced PASS 80 as "the local Pass 70 HITL candidate"
// and told the owner publication was disabled while he was reading it on a published URL.
// Every other field in this chooser already comes from release-channels.json; this one now
// does too, so the description cannot drift from the build it describes.
const latestDescription = newestBuildIsPublished
  ? releaseChannels.latest.description
  : `${releaseChannels.latest.description} Release candidate - not yet published.`;
const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('Missing #app root');
const app = appElement;


/**
 * Failure path only. The renderer fails closed with a friendly sentence the
 * player cannot act on ("This game needs WebGPU ... no GPU adapter was
 * available at all"), and from outside the browser nobody can see WHY the
 * adapter was refused. When the failure carries a diagnostics report, put the
 * observations on screen underneath that sentence; when it carries none - any
 * other crash - leave the screen exactly as it was rather than inventing a
 * graphics diagnosis for an unrelated bug.
 */
async function presentRendererFailureDiagnostics(error: unknown): Promise<void> {
  try {
    const [{ webGpuDiagnosticsFromError }, { presentWebGpuDiagnostics }] = await Promise.all([
      import('./rendering/webgpu-adapter-diagnostics'),
      import('./rendering/webgpu-diagnostics-screen'),
    ]);
    const report = webGpuDiagnosticsFromError(error);
    if (report) presentWebGpuDiagnostics(report, document);
  } catch {
    // The screen already shows the real failure; never let the explanation of
    // it become a second failure.
  }
}

async function loadLatestBuild(): Promise<void> {
  document.title = 'Nuke Town — Browser Arena FPS';
  app.replaceChildren();
  try {
    await import('./main');
  } catch (error) {
    await presentRendererFailureDiagnostics(error);
    // Rethrown unchanged: the existing failure reporting, logging and QA
    // signals all key off this rejection.
    throw error;
  }
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
            <small>${stableFallback.pass} · SAFE BACKUP</small>
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
