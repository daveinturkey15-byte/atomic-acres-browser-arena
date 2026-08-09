import releaseChannelsJson from '../release-channels.json';
import { CHANGELOG, PENDING_PRODUCTION_RELEASE } from './changelog';
import './style.css';
import './ui/tactical-ui.css';
import './ui/pass66-readability.css';
import './ui/pass66-overhaul.css';
import {
  releaseChannelDecision,
  stableReleaseUrl,
  type ReleaseChannelConfig,
} from './release-channel';

const releaseChannels: ReleaseChannelConfig = releaseChannelsJson;
const newestBuildIsPublished = CHANGELOG[0]?.releasedAt !== PENDING_PRODUCTION_RELEASE;
const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('Missing #app root');
const app = appElement;

async function loadLatestBuild(): Promise<void> {
  document.title = 'Nuke Town — Browser Arena FPS';
  app.replaceChildren();
  await import('./main');
}

function openStableBuild(): void {
  window.location.assign(stableReleaseUrl(document.baseURI, releaseChannels.stable.path));
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
            <span>${releaseChannels.latest.description}</span>
          </button>
          <button type="button" class="release-channel-option" data-release-choice="stable">
            <small>${releaseChannels.stable.pass} · PINNED COPY</small>
            <strong>${releaseChannels.stable.label}</strong>
            <span>${releaseChannels.stable.description}</span>
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
