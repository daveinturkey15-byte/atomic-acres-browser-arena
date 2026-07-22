import releaseChannelsJson from '../release-channels.json';
import './style.css';
import { latestChangelogEntry } from './changelog';
import {
  releaseChannelDecision,
  stableReleaseUrl,
  type ReleaseChannelConfig,
} from './release-channel';

const releaseChannels: ReleaseChannelConfig = releaseChannelsJson;
const latestRelease = latestChangelogEntry();
const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('Missing #app root');
const app = appElement;

async function loadLatestBuild(): Promise<void> {
  document.title = 'Atomic Acres — Browser Arena FPS';
  app.replaceChildren();
  await import('./main');
}

function openStableBuild(): void {
  window.location.assign(stableReleaseUrl(document.baseURI, releaseChannels.stable.path));
}

function showReleaseChooser(): void {
  document.title = 'Choose build — Atomic Acres';
  app.innerHTML = `
    <main id="release-channel-gate" aria-labelledby="release-channel-title">
      <section class="release-channel-card">
        <div class="release-channel-eyebrow">ATOMIC ACRES · BUILD SELECT</div>
        <h1 id="release-channel-title">CHOOSE YOUR <span>DEPLOYMENT</span></h1>
        <p>Load the newest approved build, or keep playing the preserved version people already know.</p>
        <div class="release-channel-options">
          <button type="button" class="release-channel-option primary" data-release-choice="latest">
            <small>${latestRelease.pass} · LATEST APPROVED</small>
            <strong>${releaseChannels.latest.label}</strong>
            <span>${releaseChannels.latest.description}</span>
          </button>
          <button type="button" class="release-channel-option" data-release-choice="stable">
            <small>${releaseChannels.stable.pass} · PINNED COPY</small>
            <strong>${releaseChannels.stable.label}</strong>
            <span>${releaseChannels.stable.description}</span>
          </button>
        </div>
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
}

const decision = releaseChannelDecision(
  window.location.search,
  window.location.hostname,
  releaseChannels.canonicalHostname,
);

if (decision === 'choose') showReleaseChooser();
else if (decision === 'stable') openStableBuild();
else void loadLatestBuild();
