import {
  createProjectMapBundle,
  projectMapJson,
  projectMapMarkdown,
  type ProjectMapBundle,
  type ProjectMapNode,
} from '../project-map';
import { bindDialog, type DialogController } from './dialog-controller';
import './project-map-dialog.css';

export type ProjectMapDialogController = DialogController & Readonly<{
  selectPage: (page: ProjectMapPage) => void;
}>;

type ProjectMapPage = 'overview' | 'structure' | 'changes' | 'archive';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function projectTreeMarkup(nodes: readonly ProjectMapNode[]): string {
  return `<ul class="project-tree">${nodes.map((node) => `
    <li data-project-node="${escapeHtml(node.id)}">
      <div class="project-node-heading"><strong>${escapeHtml(node.title)}</strong><span>${escapeHtml(node.status.replaceAll('-', ' '))}</span></div>
      <p>${escapeHtml(node.summary)}</p>
      <small>${escapeHtml(node.authority)}</small>
      ${node.paths?.length ? `<div class="project-node-paths">${node.paths.map((path) => `<code>${escapeHtml(path)}</code>`).join('')}</div>` : ''}
      ${node.children?.length ? projectTreeMarkup(node.children) : ''}
    </li>
  `).join('')}</ul>`;
}

export function projectMapButtonMarkup(): string {
  return '<button id="project-map-btn" type="button" aria-haspopup="dialog" aria-controls="project-map-panel" aria-expanded="false">PROJECT MAP</button>';
}

export function projectMapDialogMarkup(bundle: ProjectMapBundle = createProjectMapBundle()): string {
  const current = bundle.current.release;
  return `
    <div id="project-map-backdrop" class="menu-modal-backdrop" hidden></div>
    <section id="project-map-panel" class="panel menu-modal-panel" hidden role="dialog" aria-modal="true" aria-labelledby="project-map-title">
      <header class="menu-modal-header project-map-header">
        <div>
          <small>LIVE PROJECT DOCUMENTATION</small>
          <strong id="project-map-title">PROJECT MAP</strong>
        </div>
        <button id="project-map-close" type="button" aria-label="Close project map">CLOSE</button>
      </header>
      <div class="project-map-meta"><span>${escapeHtml(current.pass)}</span><b>${escapeHtml(current.title)}</b><i>${escapeHtml(bundle.current.releaseState.replaceAll('-', ' '))}</i></div>
      <nav id="project-map-tabs" role="tablist" aria-label="Project map pages">
        ${(['overview', 'structure', 'changes', 'archive'] as const).map((page, index) => `<button type="button" role="tab" data-project-page="${page}" aria-controls="project-map-page-${page}" aria-selected="${index === 0}">${page.toUpperCase()}</button>`).join('')}
      </nav>
      <div class="project-map-pages">
        <section id="project-map-page-overview" role="tabpanel" data-project-map-page="overview">
          <div class="project-map-intro"><span><small>CURRENT LIVE TARGET</small><strong>${escapeHtml(current.pass)}</strong></span><p>${escapeHtml(current.summary)}</p></div>
          <div class="project-channel-state"><span><small>LIVE TARGET · ${escapeHtml(bundle.publishedChannels.liveTarget.state.toUpperCase())}</small><b>${escapeHtml(bundle.publishedChannels.liveTarget.pass)}</b></span><span><small>STABLE FALLBACK · BYTE-EXACT</small><b>${escapeHtml(bundle.publishedChannels.stable.pass)}</b></span></div>
          <h3>AUTHORITY BOUNDARIES</h3>
          <ul class="project-boundaries">${bundle.operatingBoundaries.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
          <div class="project-downloads">
            <button id="project-map-download-human" type="button">DOWNLOAD HUMAN DOCS · MD</button>
            <button id="project-map-download-agent" type="button">DOWNLOAD FULL DATA · JSON</button>
          </div>
        </section>
        <section id="project-map-page-structure" role="tabpanel" data-project-map-page="structure" hidden>
          <p class="project-page-lede">Stable product domains first; real source paths beneath them. Progressive migration marks boundaries being extracted from the runtime shell.</p>
          ${projectTreeMarkup(bundle.architecture)}
        </section>
        <section id="project-map-page-changes" role="tabpanel" data-project-map-page="changes" hidden>
          <p class="project-page-lede">Current and recent player-facing changes, derived from the same release record as Last Release.</p>
          <ol class="project-change-list">${bundle.changes.slice(0, 5).map((entry) => `<li><span>${escapeHtml(entry.pass)}</span><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.summary)}</p><div>${entry.areas.map((area) => `<i>${escapeHtml(area)}</i>`).join('')}</div></li>`).join('')}</ol>
        </section>
        <section id="project-map-page-archive" role="tabpanel" data-project-map-page="archive" hidden>
          <p class="project-page-lede">Older project states remain available for provenance. They are history, not current implementation instructions.</p>
          <ol class="project-archive-list">${bundle.archive.map((entry) => `<li><span>${escapeHtml(entry.pass)}</span><strong>${escapeHtml(entry.title)}</strong><time datetime="${escapeHtml(entry.releasedAt)}">${escapeHtml(entry.releasedAt)}</time></li>`).join('')}</ol>
        </section>
      </div>
    </section>`;
}

function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function bindProjectMapDialog(
  root: ParentNode = document,
  bundleFactory: () => ProjectMapBundle = () => createProjectMapBundle(),
): ProjectMapDialogController {
  const button = root.querySelector<HTMLButtonElement>('#project-map-btn');
  const panel = root.querySelector<HTMLElement>('#project-map-panel');
  const backdrop = root.querySelector<HTMLElement>('#project-map-backdrop');
  const closeButton = root.querySelector<HTMLButtonElement>('#project-map-close');
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-project-page]')];
  const pages = [...root.querySelectorAll<HTMLElement>('[data-project-map-page]')];
  const humanDownload = root.querySelector<HTMLButtonElement>('#project-map-download-human');
  const agentDownload = root.querySelector<HTMLButtonElement>('#project-map-download-agent');
  if (!button || !panel || !backdrop || !closeButton || !humanDownload || !agentDownload || tabs.length !== 4 || pages.length !== 4) {
    throw new Error('Project map dialog is incomplete');
  }

  const selectPage = (page: ProjectMapPage): void => {
    for (const tab of tabs) {
      const selected = tab.dataset.projectPage === page;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const section of pages) section.hidden = section.dataset.projectMapPage !== page;
  };

  const tabHandlers = tabs.map((tab) => {
    const handler = (): void => selectPage(tab.dataset.projectPage as ProjectMapPage);
    tab.addEventListener('click', handler);
    return [tab, handler] as const;
  });
  const downloadHuman = (): void => downloadText('atomic-acres-project-map.md', projectMapMarkdown(bundleFactory()), 'text/markdown;charset=utf-8');
  const downloadAgent = (): void => downloadText('atomic-acres-project-map.json', projectMapJson(bundleFactory()), 'application/json;charset=utf-8');
  humanDownload.addEventListener('click', downloadHuman);
  agentDownload.addEventListener('click', downloadAgent);
  selectPage('overview');

  const dialog = bindDialog({ button, panel, backdrop, closeButton, initialFocus: tabs[0] });
  return {
    ...dialog,
    selectPage,
    destroy: () => {
      dialog.destroy();
      for (const [tab, handler] of tabHandlers) tab.removeEventListener('click', handler);
      humanDownload.removeEventListener('click', downloadHuman);
      agentDownload.removeEventListener('click', downloadAgent);
    },
  };
}
