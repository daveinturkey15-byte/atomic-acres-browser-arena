/**
 * src/map3/technique-lab/runtime.ts — Technique Lab HOST UI (not the demos).
 *
 * Standalone gallery host for Map 3 · Technique Lab. Owns exactly one renderer
 * (`THREE.WebGPURenderer` from 'three/webgpu'), one RAF loop, one OrbitControls
 * and a small isolated scene with host-owned helper lights. Demo groups arriving
 * later under `./demos/group-N/index.ts` overlay manifest entries onto the 50
 * public records; nothing is fabricated for absent groups.
 *
 * Honesty rules (enforced, not aspirational):
 * - Association with this manifest or a URL only supports `Link saved`.
 * - `Source inspected`, `Technique extracted` and `Result tested` stay open:
 *   no validated evidence pipeline exists yet, so missing evidence renders as
 *   unknown/pending, never as green.
 * - A successfully mounted factory only proves the implementation loaded. It
 *   proves nothing about source research, visual quality or result testing.
 * - With no factory, the stage shows Missing/not delivered — never an unrelated
 *   placeholder scene and never a wrong-index fallback.
 * - Backend is read from the real renderer flags after init: WebGPU, WebGL
 *   fallback, or unknown. Renderer failure stays visible in the stage.
 */

import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PUBLIC_RECORDS } from './manifest';
import type {
  Adaptation,
  DemoComparison,
  DemoFactory,
  DemoInstance,
  DemoManifestEntry,
  GroupModule,
  LabHostOptions,
  LabRendererLike,
} from './types';

/** Fixed deterministic seed handed to every demo factory. */
export const LAB_SEED = 20260912;

export interface TechniqueLabHandle {
  dispose(): void;
}

export async function mountTechniqueLab(
  container: HTMLElement,
  options: LabHostOptions = {},
): Promise<TechniqueLabHandle> {
  const state = createState(container);
  buildDom(state);
  wireControls(state);

  const initial = readUrlSelection();
  mountSelection(state, validId(initial) ? initial : 1);

  // Renderer init and demo-group discovery race each other and dispose;
  // both re-check the generation guard before touching host state.
  const gen = state.generation;
  void initRenderer(state, gen, options).then(() => {
    if (state.disposed || gen !== state.generation) return;
    if (state.renderer) {
      startLoop(state);
      // Re-mount: the first pass ran before the renderer existed.
      mountSelection(state, state.selectedId);
    }
  });
  void refreshGroups(state, gen, options);
  void loadResearch(state, gen, options).then(() => {
    if (state.disposed || gen !== state.generation) return;
    renderDetail(state, state.records[state.selectedId - 1]);
  });

  return {
    dispose: () => disposeLab(state),
  };
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

type BackendLabel = 'WebGPU' | 'WebGL fallback' | 'unknown';

interface ResolvedRecord {
  id: number;
  title: string;
  sources: string[];
  aliasOf: number | null;
  entry: DemoManifestEntry | null;
  group: string | null;
  problems: string[];
  /** Informational notices (alias, title difference): shown, never a fault. */
  notices: string[];
  /** Operational problems that turn the gallery badge red (notices excluded). */
  alerts: number;
}

interface ActiveDemo {
  demo: DemoInstance;
  id: number;
}

interface LabState {
  container: HTMLElement;
  disposed: boolean;
  generation: number;
  records: ResolvedRecord[];
  selectedId: number;
  query: string;
  statusFilter: string;
  adaptationFilter: string;
  // Renderer / scene.
  canvas: HTMLCanvasElement;
  renderer: LabRendererLike | null;
  rendererError: string | null;
  backend: BackendLabel;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls | null;
  lights: THREE.Light[];
  // Frame loop.
  raf: number;
  lastTime: number;
  elapsed: number;
  frames: number;
  fpsWindowStart: number;
  fps: number;
  active: ActiveDemo | null;
  // Research records (group-authored SOURCE_RESEARCH.json), keyed by sourceId.
  research: Map<number, ResearchEvidence>;
  researchSummary: string;
  researchIgnored: string[];
  // DOM refs.
  root: HTMLElement;
  list: HTMLOListElement;
  count: HTMLParagraphElement;
  search: HTMLInputElement;
  statusSelect: HTMLSelectElement;
  adaptationSelect: HTMLSelectElement;
  wrap: HTMLElement;
  empty: HTMLElement;
  metrics: HTMLElement;
  errorBox: HTMLElement;
  detail: HTMLElement;
  statusLine: HTMLElement;
  comparisonLegend: HTMLElement;
  resizeObserver: ResizeObserver | null;
  onFallbackResize: () => void;
  onWindowError: (event: ErrorEvent) => void;
  onWindowRejection: (event: PromiseRejectionEvent) => void;
}

function createState(container: HTMLElement): LabState {
  const canvas = document.createElement('canvas');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x22262c);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  camera.position.set(4, 3, 6);
  return {
    container,
    disposed: false,
    generation: 0,
    records: PUBLIC_RECORDS.map((r) => ({
      id: r.sourceId,
      title: r.title,
      sources: [...r.sources],
      aliasOf: r.aliasOf,
      entry: null,
      group: null,
      problems: [],
      notices: [],
      alerts: 0,
    })),
    selectedId: 1,
    query: '',
    statusFilter: 'all',
    adaptationFilter: 'all',
    canvas,
    renderer: null,
    rendererError: null,
    backend: 'unknown',
    scene,
    camera,
    controls: null,
    lights: [],
    raf: 0,
    lastTime: 0,
    elapsed: 0,
    frames: 0,
    fpsWindowStart: 0,
    fps: 0,
    active: null,
    research: new Map(),
    researchSummary: 'Research records: not loaded yet.',
    researchIgnored: [],
    root: document.createElement('div'),
    list: document.createElement('ol'),
    count: document.createElement('p'),
    search: document.createElement('input'),
    statusSelect: document.createElement('select'),
    adaptationSelect: document.createElement('select'),
    wrap: document.createElement('div'),
    empty: document.createElement('div'),
    metrics: document.createElement('div'),
    errorBox: document.createElement('div'),
    detail: document.createElement('aside'),
    statusLine: document.createElement('p'),
    comparisonLegend: document.createElement('div'),
    resizeObserver: null,
    onFallbackResize: () => undefined,
    onWindowError: () => undefined,
    onWindowRejection: () => undefined,
  };
}

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */

function text<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  value: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = value;
  return node;
}

function buildDom(state: LabState): void {
  const s = state;
  s.root.className = 'tl-root';

  const header = document.createElement('header');
  header.className = 'tl-header';
  header.append(
    text('h1', 'tl-title', 'Map 3 · Technique Lab'),
    text(
      'p',
      'tl-sub',
      'Host gallery for 50 public sources. Demos arrive separately; ' +
        'missing work stays missing — nothing here is a placeholder render.',
    ),
  );

  const layout = document.createElement('div');
  layout.className = 'tl-layout';

  // Gallery.
  const gallery = document.createElement('nav');
  gallery.className = 'tl-gallery';
  gallery.setAttribute('aria-label', 'Technique gallery');
  gallery.append(text('h2', 'tl-section-title', 'Gallery 1–50'));

  s.search.className = 'tl-search';
  s.search.type = 'search';
  s.search.placeholder = 'Search title, method or id…';
  s.search.setAttribute('aria-label', 'Search techniques');

  const filters = document.createElement('div');
  filters.className = 'tl-filters';
  const statusLabel = document.createElement('label');
  statusLabel.append(document.createTextNode('Status'));
  fillSelect(s.statusSelect, [
    'all',
    'pending',
    'loaded',
    'manifest',
    'blocked',
    'error',
  ]);
  statusLabel.append(s.statusSelect);
  const adaptLabel = document.createElement('label');
  adaptLabel.append(document.createTextNode('Adaptation'));
  fillSelect(s.adaptationSelect, [
    'all',
    'exact',
    'adapted',
    'blocked',
    'pending',
  ]);
  adaptLabel.append(s.adaptationSelect);
  filters.append(statusLabel, adaptLabel);

  s.count.className = 'tl-count';
  s.list.className = 'tl-list';
  for (const record of s.records) {
    s.list.append(galleryItem(s, record));
  }
  gallery.append(s.search, filters, s.count, s.list);

  // Stage.
  const stage = document.createElement('section');
  stage.className = 'tl-stage';
  stage.setAttribute('aria-label', 'Demo stage');
  stage.append(text('h2', 'tl-section-title', 'Stage'));
  s.wrap.className = 'tl-canvas-wrap';
  s.wrap.append(s.canvas);
  s.empty.className = 'tl-empty';
  s.empty.textContent = 'Starting renderer…';
  s.wrap.append(s.empty);
  s.comparisonLegend.className = 'tl-comparison';
  s.comparisonLegend.hidden = true;
  s.wrap.append(s.comparisonLegend);
  const toolbar = document.createElement('div');
  toolbar.className = 'tl-toolbar';
  const recenter = text('button', 'tl-btn', 'Recenter');
  recenter.type = 'button';
  recenter.addEventListener('click', () => frameSelection(s));
  toolbar.append(recenter);
  s.metrics.className = 'tl-metrics';
  s.metrics.textContent = 'backend unknown · awaiting first render';
  toolbar.append(s.metrics);
  s.errorBox.className = 'tl-error';
  s.errorBox.setAttribute('role', 'alert');
  stage.append(s.wrap, toolbar, s.errorBox);

  // Detail sidebar.
  s.detail.className = 'tl-detail';
  s.detail.setAttribute('aria-label', 'Selection detail');
  s.statusLine.className = 'tl-status';

  const legend = document.createElement('footer');
  legend.className = 'tl-legend';
  const legendTitle = text('strong', '', 'State legend. ');
  const legendBody = text(
    'span',
    '',
    'Link saved = manifest/URL association only. Source inspected, Technique ' +
      'extracted and Result tested stay open until validated evidence exists. ' +
      'Implementation loaded means the factory mounted — not that research, ' +
      'quality or testing is proven. Visual/FPS acceptance: OPEN.',
  );
  legend.append(legendTitle, legendBody);

  layout.append(gallery, stage, s.detail);
  s.root.append(header, layout, legend);
  s.container.append(s.root);
}

function fillSelect(select: HTMLSelectElement, values: string[]): void {
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function badgeFor(record: ResolvedRecord): { label: string; cls: string } {
  const entry = record.entry;
  if (entry?.adaptation === 'blocked') {
    return { label: 'blocked', cls: 'is-blocked' };
  }
  if (record.alerts > 0) return { label: 'error', cls: 'is-error' };
  if (entry?.createDemo) return { label: 'loaded', cls: 'is-loaded' };
  if (entry) return { label: 'manifest', cls: '' };
  return { label: 'pending', cls: '' };
}

function galleryItem(state: LabState, record: ResolvedRecord): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.sourceId = String(record.id);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tl-item';
  button.dataset.sourceId = String(record.id);
  const num = document.createElement('span');
  num.className = 'tl-num';
  num.textContent = String(record.id).padStart(2, '0');
  const name = document.createElement('span');
  name.className = 'tl-name';
  name.textContent = record.title;
  const badge = document.createElement('span');
  const b = badgeFor(record);
  badge.className = `tl-badge ${b.cls}`.trim();
  badge.textContent = b.label;
  button.append(num, name, badge);
  button.addEventListener('click', () => mountSelection(state, record.id));
  li.append(button);
  return li;
}

function refreshGallery(state: LabState): void {
  let shown = 0;
  for (const li of Array.from(state.list.children)) {
    const item = li as HTMLLIElement;
    const id = Number(item.dataset.sourceId);
    const record = state.records[id - 1];
    const button = item.querySelector('button');
    const badge = item.querySelector('.tl-badge');
    if (record && button && badge) {
      const b = badgeFor(record);
      badge.textContent = b.label;
      badge.className = `tl-badge ${b.cls}`.trim();
      const selected = id === state.selectedId;
      button.classList.toggle('is-selected', selected);
      if (selected) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      const visible = recordVisible(state, record);
      item.hidden = !visible;
      if (visible) shown += 1;
    }
  }
  state.count.textContent = `Showing ${shown} of ${state.records.length}`;
}

function recordVisible(state: LabState, record: ResolvedRecord): boolean {
  const q = state.query.trim().toLowerCase();
  if (q) {
    const hay = `${record.id} ${record.title} ${record.entry?.method ?? ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const b = badgeFor(record).label;
  if (state.statusFilter !== 'all' && b !== state.statusFilter) return false;
  const adaptation = record.entry?.adaptation ?? 'pending';
  if (state.adaptationFilter !== 'all' && adaptation !== state.adaptationFilter) {
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Detail panel                                                        */
/* ------------------------------------------------------------------ */

const STAGE_LABELS = [
  'Link saved',
  'Source fetched',
  'Source inspected',
  'Technique extracted',
  'Implemented',
  'Result tested',
] as const;

function stagesFor(
  record: ResolvedRecord,
  evidence: ResearchEvidence | undefined,
): Array<{ label: string; done: boolean }> {
  return [
    { label: STAGE_LABELS[0], done: record.sources.length > 0 },
    { label: STAGE_LABELS[1], done: evidence?.fetched === true },
    { label: STAGE_LABELS[2], done: evidence?.inspected === true },
    { label: STAGE_LABELS[3], done: evidence?.extracted === true },
    { label: STAGE_LABELS[4], done: record.entry?.createDemo != null },
    { label: STAGE_LABELS[5], done: false },
  ];
}

function statusText(record: ResolvedRecord): string {
  if (record.entry?.adaptation === 'blocked') {
    return `Source ${record.id} · blocked — no honest demo delivered; limitation recorded below.`;
  }
  if (record.alerts > 0) {
    return `Source ${record.id} · load issue — see notices below.`;
  }
  if (record.entry?.createDemo) {
    return `Source ${record.id} · implementation loaded — untested, acceptance OPEN.`;
  }
  if (record.entry) {
    return `Source ${record.id} · manifest only (no factory) — not yet delivered.`;
  }
  return `Source ${record.id} · Pending / Not yet delivered.`;
}

function renderDetail(state: LabState, record: ResolvedRecord): void {
  const d = state.detail;
  d.replaceChildren();
  d.append(text('h2', '', `${record.id}. ${record.title}`));
  state.statusLine.textContent = statusText(record);
  d.append(state.statusLine);

  const method = record.entry?.method ?? 'Pending / Not yet delivered — no method recorded.';
  const methodP = text('p', 'tl-method', method);
  d.append(methodP);

  const meta = document.createElement('dl');
  meta.className = 'tl-meta';
  const adaptation: string = record.entry?.adaptation ?? 'unknown (pending)';
  meta.append(
    metaRow('Adaptation', adaptation),
    metaRow(
      'Limitation',
      record.entry?.limitation ??
        (record.entry
          ? 'No limitation recorded.'
          : 'Pending / Not yet delivered.'),
    ),
  );
  if (record.aliasOf !== null) {
    meta.append(
      metaRow(
        'Alias',
        `Aliases row ${record.aliasOf} — shares its technique, not a distinct technique.`,
      ),
    );
  }
  if (record.group) meta.append(metaRow('Demo group', record.group));
  d.append(meta);

  d.append(text('h2', 'tl-section-title', 'Original source links'));
  const list = document.createElement('ul');
  list.className = 'tl-sources';
  if (record.sources.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No source URL recorded for this row.';
    list.append(li);
  }
  for (const url of record.sources) {
    const li = document.createElement('li');
    if (isHttpUrl(url)) {
      const a = document.createElement('a');
      a.href = url;
      a.textContent = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.append(a);
    } else {
      li.textContent =
        `${url} — not linked (non-http(s) or unverified served path; ` +
        `shown as text only).`;
    }
    list.append(li);
  }
  d.append(list);

  d.append(text('h2', 'tl-section-title', 'Stages'));
  const stages = document.createElement('ul');
  stages.className = 'tl-stages';
  for (const stage of stagesFor(record, state.research.get(record.id))) {
    const li = document.createElement('li');
    li.className = stage.done ? 'tl-stage-done' : 'tl-stage-open';
    li.textContent = `${stage.done ? '●' : '○'} ${stage.label}`;
    stages.append(li);
  }
  d.append(stages);

  d.append(text('h2', 'tl-section-title', 'Research records'));
  d.append(text('p', 'tl-research-note', 'Research stages below report group-authored read and extraction records; they are not independent attestations or owner approval.'));
  d.append(text('p', 'tl-research-summary', state.researchSummary));
  for (const line of state.researchIgnored) {
    d.append(text('p', 'tl-research-ignored', line));
  }
  const evidence = state.research.get(record.id);
  if (!evidence) {
    d.append(
      text(
        'p',
        'tl-research-missing',
        `No research record for source ${record.id} in the loaded files — ` +
          `Source inspected and Technique extracted stay open.`,
      ),
    );
  } else {
    const researchMeta = document.createElement('dl');
    researchMeta.className = 'tl-meta';
    researchMeta.append(metaRow('Record group', evidence.group));
    for (const line of evidence.inspectedDetail) {
      researchMeta.append(metaRow('Inspection evidence', line));
    }
    for (const line of evidence.extractedDetail) {
      researchMeta.append(metaRow('Extraction record', line));
    }
    d.append(researchMeta);
    if (evidence.claims.length > 0) {
      d.append(
        text(
          'p',
          'tl-research-note',
          'Group-authored record assertions below — not machine-checked test receipts in this lane:',
        ),
      );
      const claims = document.createElement('ul');
      claims.className = 'tl-stages';
      for (const claim of evidence.claims) {
        claims.append(text('li', 'tl-claim', claim));
      }
      d.append(claims);
    }
  }
  d.append(
    text(
      'p',
      'tl-stage-note',
      'Result tested stays open until a machine-checked test receipt matches ' +
        'this source in this lane; visual/FPS acceptance stays with the owner.',
    ),
  );

  if (record.problems.length > 0 || record.notices.length > 0) {
    d.append(text('h2', 'tl-section-title', 'Notices'));
    const probs = document.createElement('ul');
    probs.className = 'tl-stages';
    for (const problem of record.problems) {
      probs.append(text('li', 'tl-fault', problem));
    }
    for (const notice of record.notices) {
      probs.append(text('li', 'tl-notice', notice));
    }
    d.append(probs);
  }
}

function metaRow(term: string, value: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  frag.append(dt, dd);
  return frag;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Stage overlay legend, rendered only from validated demo-provided metadata. */
function updateComparisonLegend(state: LabState, record: ResolvedRecord): void {
  const el = state.comparisonLegend;
  const comparison = record.entry?.comparison;
  if (!comparison) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  const controlLeft = (comparison.controlPosition ?? 'left') === 'left';
  el.replaceChildren(
    text(
      'span',
      'tl-comparison-cell',
      `${controlLeft ? 'Left' : 'Right'} — control: ${comparison.control}`,
    ),
    text(
      'span',
      'tl-comparison-cell',
      `${controlLeft ? 'Right' : 'Left'} — technique: ${comparison.technique}`,
    ),
  );
  el.hidden = false;
}

/* ------------------------------------------------------------------ */
/* Selection + URL                                                     */
/* ------------------------------------------------------------------ */

function validId(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 50
  );
}

function readUrlSelection(): number | null {
  try {
    const param = new URLSearchParams(window.location.search).get('source');
    if (param !== null) {
      const id = Number(param);
      return validId(id) ? id : null;
    }
    const hash = window.location.hash.match(/source-(\d{1,2})/);
    if (hash) {
      const id = Number(hash[1]);
      return validId(id) ? id : null;
    }
  } catch {
    // URL unreadable: fall back to the first record, never a wrong index.
  }
  return null;
}

function writeUrlSelection(id: number): void {
  try {
    window.history.replaceState(null, '', `#source-${id}`);
  } catch {
    // Hash sync is a nicety; selection state lives in the host.
  }
}

function mountSelection(state: LabState, id: number): void {
  if (!validId(id) || state.disposed) return;
  state.selectedId = id;
  const record = state.records[id - 1];
  teardownActive(state);
  renderDetail(state, record);
  updateComparisonLegend(state, record);
  refreshGallery(state);
  writeUrlSelection(id);

  const factory: DemoFactory | null = record.entry?.createDemo ?? null;
  if (!state.renderer) {
    showEmpty(
      state,
      state.rendererError
        ? `Renderer failed: ${state.rendererError}`
        : 'Renderer starting…',
    );
    refreshMetrics(state);
    return;
  }
  if (!factory) {
    showEmpty(
      state,
      record.entry
        ? `Source ${id} · manifest registered but no demo factory delivered yet.`
        : `Source ${id} · Missing / not delivered — no demo factory for this source.`,
    );
    refreshMetrics(state);
    return;
  }
  let demo: DemoInstance;
  try {
    demo = factory({ THREE, seed: LAB_SEED });
  } catch (err) {
    const message = `Source ${id} · factory threw: ${toMessage(err)}`;
    addProblem(record, message, true);
    reportError(state, message);
    renderDetail(state, record);
    showEmpty(state, message);
    refreshGallery(state);
    return;
  }
  if (!(demo.root instanceof THREE.Group)) {
    const message = `Source ${id} · factory did not return a THREE.Group root; not mounted.`;
    addProblem(record, message, true);
    reportError(state, message);
    renderDetail(state, record);
    showEmpty(state, message);
    refreshGallery(state);
    return;
  }
  if (demo.metadata.sourceId !== id) {
    const message =
      `Source ${id} · metadata.sourceId ${String(demo.metadata.sourceId)} ` +
      `does not match manifest/URL id ${id}; mounted but flagged.`;
    addProblem(record, message, true);
    reportError(state, message);
  }
  state.scene.add(demo.root);
  state.active = { demo, id };
  hideEmpty(state);
  // A post-mount flag (e.g. sourceId mismatch) must reach the detail panel
  // too, not only the gallery badge and the error box.
  if (record.problems.length > 0) renderDetail(state, record);
  frameSelection(state);
  refreshGallery(state);
  refreshMetrics(state);
}


/* ------------------------------------------------------------------ */
/* Renderer, loop, framing                                             */
/* ------------------------------------------------------------------ */

function readBackend(renderer: LabRendererLike): BackendLabel {
  const backend = renderer.backend as { isWebGPUBackend?: boolean } | undefined;
  if (backend?.isWebGPUBackend === true) return 'WebGPU';
  if (backend) return 'WebGL fallback';
  return 'unknown';
}

async function initRenderer(
  state: LabState,
  gen: number,
  options: LabHostOptions,
): Promise<void> {
  const hemi = new THREE.HemisphereLight(0xdfeff0, 0x0a1113, 0.9);
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(4, 6, 3);
  // Neutral ambient floor: demos whose materials rely on scene lights never
  // disappear into pure black from below; host-owned and disposed with the rig.
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  state.lights = [hemi, dir, ambient];

  let renderer: LabRendererLike;
  try {
    renderer = options.createRenderer
      ? options.createRenderer(state.canvas)
      : new WebGPURenderer({ canvas: state.canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    sizeToWrap(state, renderer);
    await renderer.init();
  } catch (err) {
    for (const light of [hemi, dir, ambient]) light.dispose();
    if (state.disposed || gen !== state.generation) return;
    state.rendererError = toMessage(err);
    reportError(
      state,
      `Renderer failed and stays visible: ${state.rendererError}`,
    );
    showEmpty(state, `Renderer failed: ${state.rendererError}`);
    refreshMetrics(state);
    return;
  }
  if (state.disposed || gen !== state.generation) {
    for (const light of [hemi, dir, ambient]) light.dispose();
    try {
      renderer.dispose();
    } catch {
      // Already torn down; dispose is best-effort here.
    }
    return;
  }
  state.renderer = renderer;
  state.backend = readBackend(renderer);
  state.scene.add(hemi, dir, ambient);
  state.controls = new OrbitControls(state.camera, state.canvas);
  state.controls.enableDamping = true;
  sizeToWrap(state, renderer);
  observeResize(state);
  refreshMetrics(state);
}

function sizeToWrap(state: LabState, renderer: LabRendererLike): void {
  const w = Math.max(1, Math.floor(state.wrap.clientWidth || 640));
  const h = Math.max(1, Math.floor(state.wrap.clientHeight || 360));
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
}

function observeResize(state: LabState): void {
  const onResize = (): void => {
    if (state.disposed || !state.renderer) return;
    sizeToWrap(state, state.renderer);
    // An aspect change can invalidate the horizontal fit — refit once per
    // resize event (never per frame).
    if (state.active) frameSelection(state);
  };
  state.onFallbackResize = onResize;
  if (typeof ResizeObserver !== 'undefined') {
    state.resizeObserver = new ResizeObserver(onResize);
    state.resizeObserver.observe(state.wrap);
  }
  window.addEventListener('resize', onResize);
}

function startLoop(state: LabState): void {
  state.lastTime = performance.now() / 1000;
  state.fpsWindowStart = state.lastTime;
  state.frames = 0;
  const tick = (): void => {
    if (state.disposed || !state.renderer) return;
    state.raf = requestAnimationFrame(tick);
    const now = performance.now() / 1000;
    const dt = clampDelta(now - state.lastTime);
    state.lastTime = now;
    state.elapsed += dt;
    state.controls?.update();

    const active = state.active;
    if (active) {
      const update = active.demo.update;
      if (update) {
        try {
          update(state.elapsed, dt);
        } catch (err) {
          const message = `Source ${active.id} · update threw and was stopped: ${toMessage(err)} — host stays usable.`;
          reportError(state, message);
          const record = state.records[active.id - 1];
          addProblem(record, message, true);
          teardownActive(state);
          showEmpty(state, message);
          refreshGallery(state);
        }
      }
    }

    state.renderer.render(state.scene, state.camera);
    state.frames += 1;
    if (now - state.fpsWindowStart >= 0.5) {
      state.fps = state.frames / (now - state.fpsWindowStart);
      state.frames = 0;
      state.fpsWindowStart = now;
      refreshMetrics(state);
    }
  };
  state.raf = requestAnimationFrame(tick);
}

/**
 * Frame the active demo once per mount / explicit Recenter. The fit
 * satisfies BOTH frustum extents (vertical fov and horizontal fov at the
 * current aspect), aims at the content's real centre, and the radius/centre
 * are sanity-bounded against NaN and absurd scale.
 */
function frameSelection(state: LabState): void {
  if (!state.controls) return;
  const active = state.active;
  const box = active ? visibleGeometryBox(active.demo.root) : null;
  const fit = box ? computeFrameFit(box, state.camera.fov, state.camera.aspect) : null;
  if (!fit) {
    homeCamera(state);
    return;
  }
  state.camera.position.copy(fit.position);
  state.camera.near = fit.near;
  state.camera.far = fit.far;
  state.camera.updateProjectionMatrix();
  state.camera.lookAt(fit.target);
  state.controls.target.copy(fit.target);
  state.controls.update();
}

/** Clamps a frame delta to a finite, bounded, non-negative value. */
export function clampDelta(dt: number): number {
  if (!Number.isFinite(dt) || dt < 0) return 0;
  if (dt > 0.1) dt = 0.1; // clamped delta
  return dt;
}

/** A computed camera fit; positions/targets are in world space. */
export interface FrameFit {
  position: THREE.Vector3;
  target: THREE.Vector3;
  near: number;
  far: number;
}

/** Margin around the fitted sphere (was 1.2 — captures showed excess air). */
const FIT_MARGIN = 1.1;

/**
 * Pure framing math so focused tests exercise the exact fit: both frustum
 * extents, a shape-adaptive viewing elevation (planar from above, tall from
 * lower down) and finite, clamped near/far planes. Null when the bounds are
 * empty, degenerate or non-finite — the caller must fall back to homeCamera.
 */
export function computeFrameFit(
  box: THREE.Box3,
  fovDeg: number,
  aspect: number,
): FrameFit | null {
  if (box.isEmpty()) return null;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return null;
  if (
    !Number.isFinite(sphere.center.x) ||
    !Number.isFinite(sphere.center.y) ||
    !Number.isFinite(sphere.center.z)
  ) {
    return null;
  }
  sphere.radius = Math.min(Math.max(sphere.radius, 1e-3), 1e4);
  const halfFov = THREE.MathUtils.degToRad(fovDeg / 2);
  const vertical = sphere.radius / Math.tan(halfFov);
  const horizontal = sphere.radius / (Math.tan(halfFov) * Math.max(aspect, 1e-3));
  const distance = Math.max(vertical, horizontal) * FIT_MARGIN;
  const size = box.getSize(new THREE.Vector3());
  const heightRatio = size.y / Math.max(size.x, size.z, 1e-6);
  const elevationDeg = heightRatio < 0.15 ? 50 : heightRatio > 1.2 ? 25 : 35;
  const elevation = THREE.MathUtils.degToRad(elevationDeg);
  const dir = new THREE.Vector3(1, 0, 1)
    .normalize()
    .multiplyScalar(Math.cos(elevation));
  dir.y = Math.sin(elevation);
  dir.normalize();
  return {
    position: sphere.center.clone().addScaledVector(dir, distance),
    target: sphere.center.clone(),
    near: Math.max(distance / 1000, 0.01),
    far: Math.max(distance * 100, 10),
  };
}

/**
 * Bounds over VISIBLE geometry only — invisible helper objects must not
 * inflate the fit (captures showed small content lost in a huge stage).
 * Null when the root has no finite, positive-volume visible bounds.
 */
function visibleGeometryBox(root: THREE.Object3D): THREE.Box3 | null {
  const box = new THREE.Box3();
  root.traverseVisible((obj) => {
    if ('geometry' in obj) box.expandByObject(obj);
  });
  if (box.isEmpty()) return null;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (
    !Number.isFinite(sphere.radius) ||
    sphere.radius <= 0 ||
    !Number.isFinite(sphere.center.x) ||
    !Number.isFinite(sphere.center.y) ||
    !Number.isFinite(sphere.center.z)
  ) {
    return null;
  }
  return box;
}

/** Bounding sphere of the visible geometry; null when unframeable. */
export function boundedBoundingSphere(root: THREE.Group): THREE.Sphere | null {
  const box = visibleGeometryBox(root);
  return box ? box.getBoundingSphere(new THREE.Sphere()) : null;
}

/** Stable default framing used when there is nothing finite to frame. */
function homeCamera(state: LabState): void {
  state.camera.position.set(4, 3, 6);
  state.camera.near = 0.01;
  state.camera.far = 1000;
  state.camera.updateProjectionMatrix();
  if (state.controls) {
    state.controls.target.set(0, 0, 0);
    state.controls.update();
  }
}


/**
 * Record one row notice. Operational failures (alert=true) also turn the
 * gallery badge red; informational notices (alias, not-delivered markers)
 * stay visible in the detail panel without crying wolf in the gallery.
 */
function addProblem(record: ResolvedRecord, message: string, alert = false): void {
  if (record.problems.includes(message)) return;
  record.problems.push(message);
  if (alert) record.alerts += 1;
}

function refreshMetrics(state: LabState): void {
  const info = state.renderer?.info?.render as
    | { drawCalls?: number; calls?: number; triangles?: number }
    | undefined;
  const draws = info?.drawCalls ?? info?.calls ?? 0;
  const tris = info?.triangles ?? 0;
  const triLabel =
    tris >= 1000 ? `${(tris / 1000).toFixed(1)}k` : String(tris);
  const fpsLabel = state.raf === 0 ? '—' : String(Math.round(state.fps));
  state.metrics.textContent =
    `backend ${state.backend} · ${fpsLabel} fps · ` +
    `${draws} draws · ${triLabel} tris (last render)`;
}

/* ------------------------------------------------------------------ */
/* Demo groups                                                         */
/* ------------------------------------------------------------------ */

function isAdaptation(value: unknown): value is Adaptation {
  return value === 'exact' || value === 'adapted' || value === 'blocked';
}

async function refreshGroups(
  state: LabState,
  gen: number,
  options: LabHostOptions,
): Promise<void> {
  // Group modules arrive after root cherry-picks them; an empty match is a
  // normal pending state, never a build-time or runtime error.
  const loaders =
    options.groupLoaders ??
    import.meta.glob<GroupModule>('./demos/group-*/index.ts');
  const keys = Object.keys(loaders);
  if (keys.length === 0) {
    reportError(
      state,
      'Notice: no demo groups delivered yet (./demos/group-*/index.ts matched nothing). All 50 records stay Pending / Not yet delivered.',
    );
    return;
  }
  const seen = new Map<number, string>();
  for (const key of keys.sort()) {
    if (state.disposed || gen !== state.generation) return;
    const group = key.replace(/^\.\/demos\//, '').replace(/\/index\.ts$/, '');
    let module: GroupModule;
    try {
      module = await loaders[key]();
    } catch (err) {
      reportError(state, `Group ${group} failed to import: ${toMessage(err)}`);
      continue;
    }
    if (state.disposed || gen !== state.generation) return;
    const manifest = (module as GroupModule).manifest;
    if (!Array.isArray(manifest)) {
      reportError(state, `Group ${group} has no array manifest; ignored.`);
      continue;
    }
    for (const raw of manifest) {
      const checked = validateEntry(raw);
      if (!checked.entry) {
        reportError(
          state,
          `Group ${group} ignored a bad manifest entry (${checked.problems.join(', ')}); nothing fabricated for it.`,
        );
        continue;
      }
      const entry = checked.entry;
      if (!validId(entry.sourceId)) {
        reportError(
          state,
          `Group ${group} entry has out-of-range sourceId ${String((raw as { sourceId?: unknown }).sourceId)}; ignored, no fallback applied.`,
        );
        continue;
      }
      const prior = seen.get(entry.sourceId);
      const record = state.records[entry.sourceId - 1];
      if (prior) {
        const message = `Duplicate sourceId ${entry.sourceId}: kept ${prior}, ignored ${group}; no silent overwrite.`;
        addProblem(record, message, true);
        reportError(state, message);
        continue;
      }
      seen.set(entry.sourceId, group);
      // Honesty guards applied at adoption time, before any mount can happen.
      if (entry.adaptation === 'blocked' && entry.createDemo) {
        entry.createDemo = undefined;
        addProblem(
          record,
          `Source ${entry.sourceId} · blocked entry carried a factory; the ` +
            `factory was ignored (a blocked row has no honest demo).`,
          true,
        );
      }
      if (record.aliasOf !== null) {
        addProblem(
          record,
          `Source ${entry.sourceId} · aliases row ${record.aliasOf}; any ` +
            `factory here is a convenience alias, not a distinct technique credit.`,
        );
      }
      record.entry = entry;
      record.group = group;
      // An adapted technique can have a more specific demonstration title.
      // Identity is bound to sourceId, not text equality with the source title.
      record.title = entry.title;
      record.sources = [...entry.sources];
    }
    const notDelivered = module.notDeliveredSourceIds;
    if (Array.isArray(notDelivered)) {
      for (const rawId of notDelivered) {
        if (typeof rawId !== 'number' || !validId(rawId)) continue;
        const record = state.records[rawId - 1];
        if (!record) continue;
        if (record.entry?.createDemo) {
          addProblem(
            record,
            `Group ${group} marks source ${rawId} as not delivered but also ` +
              `shipped a factory; the factory stays mounted and this ` +
              `inconsistency is flagged.`,
            true,
          );
        } else {
          addProblem(
            record,
            `Group ${group} marks source ${rawId} as not delivered in its ` +
              `lane (source recovered/read, no honest demo).`,
          );
        }
      }
    }
  }
  if (state.disposed || gen !== state.generation) return;
  // Rebuild gallery labels (titles may come from demos) and re-render.
  state.list.replaceChildren();
  for (const record of state.records) {
    state.list.append(galleryItem(state, record));
  }
  mountSelection(state, state.selectedId);
}

function validateEntry(raw: unknown): { entry: DemoManifestEntry | null; problems: string[] } {
  if (typeof raw !== 'object' || raw === null) {
    return { entry: null, problems: ['non-object entry'] };
  }
  const candidate = raw as Record<string, unknown>;
  const problems: string[] = [];
  if (!validId(candidate.sourceId)) problems.push('bad sourceId');
  if (typeof candidate.title !== 'string' || candidate.title.trim() === '') {
    problems.push('bad title');
  }
  if (typeof candidate.method !== 'string' || candidate.method.trim() === '') {
    problems.push('bad method');
  }
  if (!isAdaptation(candidate.adaptation)) problems.push('bad adaptation');
  if (
    !Array.isArray(candidate.sources) ||
    !candidate.sources.every((s) => typeof s === 'string')
  ) {
    problems.push('bad sources');
  }
  if (
    candidate.limitation !== undefined &&
    typeof candidate.limitation !== 'string'
  ) {
    problems.push('bad limitation');
  }
  if (
    candidate.createDemo !== undefined &&
    typeof candidate.createDemo !== 'function'
  ) {
    problems.push('bad createDemo');
  }
  let comparison: DemoComparison | undefined;
  const rawComparison = candidate.comparison;
  if (rawComparison !== undefined) {
    const position =
      typeof rawComparison === 'object' &&
      rawComparison !== null &&
      'controlPosition' in rawComparison
        ? rawComparison.controlPosition
        : undefined;
    if (
      typeof rawComparison !== 'object' ||
      rawComparison === null ||
      !('control' in rawComparison) ||
      !('technique' in rawComparison) ||
      typeof rawComparison.control !== 'string' ||
      rawComparison.control.trim() === '' ||
      typeof rawComparison.technique !== 'string' ||
      rawComparison.technique.trim() === '' ||
      !(position === undefined || position === 'left' || position === 'right')
    ) {
      problems.push('bad comparison');
    } else {
      comparison = {
        control: rawComparison.control.trim(),
        technique: rawComparison.technique.trim(),
        controlPosition: position,
      };
    }
  }
  if (problems.length > 0) {
    return { entry: null, problems };
  }
  return {
    entry: {
      sourceId: candidate.sourceId as number,
      title: (candidate.title as string).trim(),
      method: (candidate.method as string).trim(),
      adaptation: candidate.adaptation as Adaptation,
      sources: [...(candidate.sources as string[])],
      limitation:
        typeof candidate.limitation === 'string' ? candidate.limitation : undefined,
      createDemo: (candidate.createDemo as DemoFactory | undefined) ?? undefined,
      comparison,
    },
    problems,
  };
}

/* ------------------------------------------------------------------ */
/* Research records (group SOURCE_RESEARCH.json)                       */
/* ------------------------------------------------------------------ */

/** Validated, bounded evidence taken from one group's research record. */
interface ResearchEvidence {
  group: string;
  fetched: boolean;
  inspected: boolean;
  inspectedDetail: string[];
  extracted: boolean;
  extractedDetail: string[];
  claims: string[];
}

function researchRows(data: unknown): unknown[] | null {
  if (typeof data !== 'object' || data === null) return null;
  const candidate = data as { records?: unknown; rows?: unknown };
  if (Array.isArray(candidate.records)) return candidate.records;
  if (Array.isArray(candidate.rows)) return candidate.rows;
  return null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function printClaim(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Absorb one heterogeneous research row (groups A/B use `records[]`, group C
 * uses `rows[]`; field names differ per group schema). Only real recorded
 * evidence moves a stage; nothing is inferred from a URL, an HTTP status or a
 * loaded file alone. Rows without a usable sourceId are counted, never guessed.
 */
function absorbResearchRow(
  row: unknown,
  group: string,
  into: Map<number, ResearchEvidence>,
): 'absorbed' | 'duplicate' | 'unkeyed' {
  if (typeof row !== 'object' || row === null) return 'unkeyed';
  const r = row as Record<string, unknown>;
  const id = r.sourceId;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > 50) {
    return 'unkeyed';
  }
  if (into.has(id)) return 'duplicate';
  const evidence: ResearchEvidence = {
    group: nonEmpty(r.group) ?? group,
    fetched: false,
    inspected: false,
    inspectedDetail: [],
    extracted: false,
    extractedDetail: [],
    claims: [],
  };
  // Pinned revision (group A `pin`, groups B/C `canonical`).
  const pin = nonEmpty(r.pin) ?? nonEmpty(r.canonical);
  if (pin) {
    evidence.inspectedDetail.push(`pin: ${truncate(pin, 200)}`);
    const sha = pin.match(/[0-9a-f]{40}/i);
    if (sha) evidence.inspectedDetail.push(`git sha: ${sha[0].toLowerCase()}`);
    const committed = pin.match(/committed (\d{4}-\d{2}-\d{2})T/);
    if (committed) evidence.inspectedDetail.push(`commit date: ${committed[1]}`);
  }
  // Recorded read depth (evidence kind: an actual read, not a saved link).
  const readDepth = nonEmpty(r.readDepth);
  if (readDepth && !/not read|not inspected|unread|fetched only|^none|^unknown|nothing was retrieved|no technique content/i.test(readDepth)) {
    evidence.inspected = true;
    evidence.inspectedDetail.push(`read depth: ${truncate(readDepth, 160)}`);
  }
  if (Array.isArray(r.urls)) {
    const okReads = r.urls.filter((u) => {
      if (typeof u !== 'object' || u === null || !('outcome' in u)) return false;
      return u.outcome === 'ok';
    }).length;
    if (okReads > 0) {
      evidence.fetched = true;
      evidence.inspectedDetail.push(`${okReads} successful source fetch(es); fetching alone is not inspection`);
    }
  }
  if (Array.isArray(r.urls) && r.urls.some((u) => {
    if (typeof u !== 'object' || u === null) return false;
    const depth = nonEmpty((u as Record<string, unknown>).readDepth);
    return depth !== null && !/not read|not inspected|unread|fetched only|^none|^unknown|nothing was retrieved|no technique content/i.test(depth);
  })) evidence.inspected = true;
  if (Array.isArray(r.filesRead) && r.filesRead.some((file) =>
    typeof file === 'string' && /full|lines|inspected|\bread\b/i.test(file) && !/not read|not inspected|unread|fetched only/i.test(file))) {
    evidence.inspected = true;
    evidence.inspectedDetail.push(`${r.filesRead.length} source file(s) read`);
  }
  if (r.carrierReadComplete === true) {
    evidence.inspected = true;
    evidence.inspectedDetail.push('carrier skill read recorded complete; not a full upstream-source read claim');
  }
  const licence = nonEmpty(r.licence);
  if (licence) evidence.inspectedDetail.push(`licence: ${truncate(licence, 160)}`);
  // Method extraction (the carrying field differs per group schema).
  const method = nonEmpty(r.method) ?? nonEmpty(r.methodExtracted);
  const decision = nonEmpty(r.decision);
  if (r.methodExtracted === true) evidence.extracted = true;
  if (method) {
    evidence.extracted = !/^(not determined|not an implementation|none|unknown)/i.test(method);
    evidence.extractedDetail.push(`method: ${truncate(method, 200)}`);
  }
  if (decision) {
    evidence.extractedDetail.push(`decision: ${truncate(decision, 200)}`);
  }
  const consumer = nonEmpty(r.methodConsumer);
  if (consumer) {
    evidence.extracted = true;
    evidence.extractedDetail.push(`method consumer: ${truncate(consumer, 200)}`);
  }
  // Group-authored claims — recorded assertions, never test receipts here.
  for (const key of [
    'cpuCheck',
    'cpuChecks',
    'pixelValidation',
    'renderedAcceptance',
  ]) {
    const claim = r[key];
    if (claim === undefined || claim === null) continue;
    evidence.claims.push(`${key}: ${truncate(printClaim(claim), 160)}`);
  }
  into.set(id, evidence);
  return 'absorbed';
}

/**
 * Load group research records when the tree ships them (root cherry-picks the
 * group lanes). An empty glob is the honest pending state; malformed or failed
 * files are reported and the affected stages stay open. Snapshot provenance
 * (private machine paths) is never displayed — only in-record pins/sha/dates.
 */
async function loadResearch(
  state: LabState,
  gen: number,
  options: LabHostOptions,
): Promise<void> {
  const loaders =
    options.researchLoaders ??
    import.meta.glob<unknown>(
      '../../../scripts/technique-lab/host/public-research.json',
    );
  const keys = Object.keys(loaders);
  if (keys.length === 0) {
    state.researchSummary =
      'No research records loadable in this tree — Source inspected and ' +
      'Technique extracted stay open (honest unknown).';
    return;
  }
  let files = 0;
  let ignored = 0;
  let unkeyed = 0;
  let duplicates = 0;
  for (const key of keys.sort()) {
    if (state.disposed || gen !== state.generation) return;
    const name = key.replace(/^.*group-/, 'group-').replace(/\.json$/, '');
    let data: unknown;
    try {
      data = await loaders[key]();
    } catch (err) {
      state.researchIgnored.push(
        `Research file ${name} failed to load: ${toMessage(err)}; its stages stay open.`,
      );
      ignored += 1;
      continue;
    }
    const normalized = typeof data === 'object' && data !== null && 'default' in data
      ? data.default : data;
    const rows = researchRows(normalized);
    if (!rows) {
      state.researchIgnored.push(
        `Research file ${name} has an unrecognized shape (expected records[] or rows[]); ignored, nothing inferred.`,
      );
      ignored += 1;
      continue;
    }
    files += 1;
    for (const row of rows) {
      const outcome = absorbResearchRow(row, name, state.research);
      if (outcome === 'unkeyed') unkeyed += 1;
      else if (outcome === 'duplicate') duplicates += 1;
    }
  }
  if (state.disposed || gen !== state.generation) return;
  state.researchSummary =
    `Research records: ${files} file(s) read, ${state.research.size} source(s) ` +
    `with records, ${unkeyed} record(s) without usable sourceId, ` +
    `${duplicates} duplicate record(s) ignored, ${ignored} file(s) ignored.`;
}

/* ------------------------------------------------------------------ */
/* Wiring, errors, teardown                                            */
/* ------------------------------------------------------------------ */

function wireControls(state: LabState): void {
  state.search.addEventListener('input', () => {
    state.query = state.search.value;
    refreshGallery(state);
  });
  state.statusSelect.addEventListener('change', () => {
    state.statusFilter = state.statusSelect.value;
    refreshGallery(state);
  });
  state.adaptationSelect.addEventListener('change', () => {
    state.adaptationFilter = state.adaptationSelect.value;
    refreshGallery(state);
  });
  // Capture relevant renderer/demo failures plus page-level error events.
  // Only short message strings are displayed — no stacks, URLs or objects —
  // so unrelated private data never lands in the error box.
  state.onWindowError = (event: ErrorEvent) => {
    if (state.disposed) return;
    reportError(state, `Page error: ${truncate(event.message || 'unknown error', 240)}`);
  };
  state.onWindowRejection = (event: PromiseRejectionEvent) => {
    if (state.disposed) return;
    const reason =
      event.reason instanceof Error ? event.reason.message : String(event.reason);
    reportError(state, `Unhandled rejection: ${truncate(reason, 240)}`);
  };
  window.addEventListener('error', state.onWindowError);
  window.addEventListener('unhandledrejection', state.onWindowRejection);
}

function showEmpty(state: LabState, message: string): void {
  state.empty.textContent = message;
  state.empty.hidden = false;
}

function hideEmpty(state: LabState): void {
  state.empty.hidden = true;
}

function reportError(state: LabState, message: string): void {
  const line = text('p', '', truncate(message, 500));
  state.errorBox.append(line);
  while (state.errorBox.children.length > 50) {
    state.errorBox.firstElementChild?.remove();
  }
}

function teardownActive(state: LabState): void {
  const active = state.active;
  state.active = null;
  if (!active) return;
  state.scene.remove(active.demo.root);
  try {
    active.demo.dispose();
  } catch (err) {
    reportError(
      state,
      `Source ${active.id} · dispose threw: ${toMessage(err)} — host stays usable.`,
    );
  }
}

function disposeLab(state: LabState): void {
  if (state.disposed) return; // exactly-once teardown
  state.disposed = true;
  state.generation += 1;
  if (state.raf !== 0) {
    cancelAnimationFrame(state.raf);
    state.raf = 0;
  }
  state.resizeObserver?.disconnect();
  state.resizeObserver = null;
  window.removeEventListener('resize', state.onFallbackResize);
  window.removeEventListener('error', state.onWindowError);
  window.removeEventListener('unhandledrejection', state.onWindowRejection);
  teardownActive(state);
  state.controls?.dispose();
  state.controls = null;
  for (const light of state.lights) {
    state.scene.remove(light);
    light.dispose();
  }
  state.lights = [];
  if (state.renderer) {
    try {
      state.renderer.dispose();
    } catch {
      // Best-effort: init/dispose races may already have torn down.
    }
    state.renderer = null;
  }
  state.root.remove();
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
