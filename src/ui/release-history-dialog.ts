import {
  CHANGELOG,
  PENDING_PRODUCTION_RELEASE,
  formatChangelogTimestampDetail,
  lastUpdatedButtonLabel,
  type ChangelogEntry,
} from '../changelog';
import { bindDialog, type DialogController } from './dialog-controller';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function releaseHistoryButtonMarkup(entry: ChangelogEntry = CHANGELOG[0]!): string {
  return `<button id="last-updated-btn" type="button" aria-haspopup="dialog" aria-controls="changelog-panel" aria-expanded="false">${escapeHtml(lastUpdatedButtonLabel(entry))}</button>`;
}

export function releaseHistoryDialogMarkup(entries: readonly ChangelogEntry[] = CHANGELOG): string {
  return `
    <div id="changelog-backdrop" class="menu-modal-backdrop" hidden></div>
    <section id="changelog-panel" class="panel menu-modal-panel" hidden role="dialog" aria-modal="true" aria-labelledby="changelog-title">
      <header class="changelog-header menu-modal-header">
        <div>
          <small>PUBLIC RELEASE HISTORY</small>
          <strong id="changelog-title">RECENT CHANGES</strong>
        </div>
        <button id="changelog-close" type="button" aria-label="Close changelog">CLOSE</button>
      </header>
      <p class="changelog-lede">Player-facing production releases only. <b>PUBLISHED</b> is the first successful live release time, shown in UK local time and with its UTC offset. Newest first.</p>
      <ol id="changelog-list">
        ${entries.map((entry, index) => `
          <li data-changelog-id="${escapeHtml(entry.id)}">
            <div class="changelog-entry-head">
              <div class="changelog-entry-pass"><span>${escapeHtml(entry.pass)}</span>${index === 0 ? `<b>${entry.releasedAt === PENDING_PRODUCTION_RELEASE ? 'CURRENT BUILD' : 'CURRENT LIVE'}</b>` : ''}</div>
              <time datetime="${escapeHtml(entry.releasedAt)}"><small>PUBLISHED</small>${escapeHtml(formatChangelogTimestampDetail(entry.releasedAt))}</time>
            </div>
            <strong>${escapeHtml(entry.title)}</strong>
            <div class="changelog-areas">${entry.areas.map((area) => `<span>${escapeHtml(area)}</span>`).join('')}</div>
            <p>${escapeHtml(entry.summary)}</p>
            <ul>${entry.highlights.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
          </li>
        `).join('')}
      </ol>
    </section>`;
}

export function bindReleaseHistoryDialog(root: ParentNode = document): DialogController {
  const button = root.querySelector<HTMLButtonElement>('#last-updated-btn');
  const panel = root.querySelector<HTMLElement>('#changelog-panel');
  const backdrop = root.querySelector<HTMLElement>('#changelog-backdrop');
  const closeButton = root.querySelector<HTMLButtonElement>('#changelog-close');
  if (!button || !panel || !backdrop || !closeButton) throw new Error('Release history dialog is incomplete');
  return bindDialog({ button, panel, backdrop, closeButton });
}
