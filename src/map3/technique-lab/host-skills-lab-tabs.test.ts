/**
 * src/map3/technique-lab/host-skills-lab-tabs.test.ts — host-level falsifiers
 * for the Skills Lab worker pass, driven through the REAL host
 * (mountTechniqueLab) with a bounded fake DOM, a stub renderer and injected
 * fixtures. No GPU, no network, no wall-clock waits. Proves: the Lighting &
 * Environment tab mounts a CPU preview with only supported controls enabled
 * (unsupported states disabled and rejected); the URL menu filters unmapped
 * rows without inventing targets; mapped rows navigate same-host to their
 * skill demo or catalog-identified Blender asset; skills, URL rows and Blender
 * cards sort newest-first with unknown dates last and labelled.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mountTechniqueLab } from './runtime';
import { disposeObject } from './gallery/blender-viewer';

type Listener = (event?: unknown) => void;

class FakeElement {
  tagName: string;
  text = '';
  href = '';
  children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  classes = new Set<string>();
  listeners = new Map<string, Listener[]>();
  style: Record<string, string> = {};
  hidden = false;
  value = '';
  disabled = false;
  id = '';
  clientWidth = 640;
  clientHeight = 360;
  ownerDocument = { addEventListener: () => undefined, removeEventListener: () => undefined };

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get className(): string {
    return [...this.classes].join(' ');
  }

  set className(value: string) {
    this.classes = new Set(value.split(/\s+/).filter(Boolean));
  }

  get parentElement(): FakeElement | null {
    return this.parentNode;
  }

  getRootNode(): FakeElement {
    return this;
  }

  get classList() {
    const classes = this.classes;
    return {
      add: (...names: string[]) => names.forEach((n) => classes.add(n)),
      remove: (...names: string[]) => names.forEach((n) => classes.delete(n)),
      toggle: (name: string, force?: boolean) => {
        const next = force ?? !classes.has(name);
        if (next) classes.add(name);
        else classes.delete(name);
      },
      contains: (name: string) => classes.has(name),
    };
  }

  get textContent(): string {
    if (this.children.length === 0) return this.text;
    return this.children.map((c) => c.textContent).join('');
  }

  set textContent(value: string) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.text = value;
  }

  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parentNode?.children.splice(node.parentNode.children.indexOf(node), 1);
      node.parentNode = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }

  remove(): void {
    if (this.parentNode) {
      const siblings = this.parentNode.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentNode = null;
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    const index = list.indexOf(listener);
    if (index >= 0) list.splice(index, 1);
  }

  focus(): void {}

  dispatch(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({});
  }

  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      const matches = selector.startsWith('.')
        ? child.classes.has(selector.slice(1))
        : child.tagName === selector.toUpperCase();
      if (matches) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
}

function allMatching(root: FakeElement, selector: string): FakeElement[] {
  const found: FakeElement[] = [];
  const visit = (node: FakeElement): void => {
    for (const child of node.children) {
      const matches = selector.startsWith('.')
        ? child.classes.has(selector.slice(1))
        : child.tagName === selector.toUpperCase();
      if (matches) found.push(child);
      visit(child);
    }
  };
  visit(root);
  return found;
}

const rafQueue: Array<(time: number) => void> = [];
let container!: FakeElement;

beforeEach(() => {
  container = new FakeElement('div');
  const globalScope = globalThis as unknown as Record<string, unknown>;
  globalScope.document = {
    baseURI: 'http://localhost/map3.html',
    activeElement: null,
    createElement: (tag: string) => new FakeElement(tag),
    createDocumentFragment: () => new FakeElement('#fragment'),
    createTextNode: (value: string) => {
      const node = new FakeElement('#text');
      node.text = value;
      return node;
    },
  };
  globalScope.window = {
    location: { search: '', hash: '', href: 'http://localhost/map3.html' },
    history: { replaceState: () => undefined },
    devicePixelRatio: 1,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  globalScope.ResizeObserver = undefined;
  globalScope.requestAnimationFrame = (cb: (time: number) => void) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  globalScope.cancelAnimationFrame = () => undefined;
});

afterEach(() => {
  rafQueue.length = 0;
});

async function flushTasks(times = 20): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function rendererStub() {
  const state = { inits: 0, renders: 0, disposed: 0 };
  const create = () => ({
    init: () => {
      state.inits += 1;
      return Promise.resolve();
    },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    render: () => void (state.renders += 1),
    dispose: () => void (state.disposed += 1),
    backend: { isWebGPUBackend: true },
    info: { render: { drawCalls: 3, triangles: 120 } },
  });
  return { state, create };
}

function demoFactory(sourceId: number) {
  return () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    return {
      root,
      dispose: () => disposeObject(root),
      metadata: { sourceId, title: 'Demo one', method: 'm', adaptation: 'adapted' as const, sources: [] },
    };
  };
}

const catalogFixture = {
  updatedAt: '2026-09-12',
  sources: [
    {
      sourceId: 1,
      title: 'Demo one',
      urls: ['https://example.com/one'],
      skillMappings: [{ skill: 'game-animation-asset-pipeline', relation: 'informs', sourceReference: 'docs/RIG.md' }],
      evidence: [{ url: 'https://example.com/one', pin: null, inspectedAt: '2026-09-02', observation: 'o' }],
      demo: { revision: 'r1', status: 'implemented' },
    },
    {
      sourceId: 2,
      title: 'Row two',
      urls: ['https://example.com/two'],
      skillMappings: [],
      evidence: [],
      demo: null,
    },
    {
      sourceId: 3,
      title: 'Row three',
      urls: ['https://example.com/three'],
      skillMappings: [],
      evidence: [{ url: 'https://example.com/three', pin: null, inspectedAt: '2026-09-12', observation: 'o' }],
      demo: null,
    },
    {
      sourceId: 5,
      title: 'Row five',
      urls: ['https://example.com/five'],
      skillMappings: [
        {
          skill: 'atomic-acres-procedural-art-authoring',
          relation: 'uses',
          sourceReference: 'built from assets/world-studio/blender/nature/rock.glb',
        },
      ],
      evidence: [],
      demo: null,
    },
  ],
};

const rockLaneKey = '/public/assets/world-studio/blender/nature/catalog.json';

function gatedLoader() {
  const pending = new Map<string, { resolve: (m: { scene: THREE.Object3D }) => void; reject: (e: Error) => void }>();
  const loader = {
    loadAsync: (url: string) =>
      new Promise<{ scene: THREE.Object3D }>((resolve, reject) => pending.set(url, { resolve, reject })),
  };
  return { loader, pending };
}

async function mountWithFixtures(modelLoader: { loadAsync(url: string): Promise<{ scene: THREE.Object3D }> }) {
  const renderer = rendererStub();
  const host = await mountTechniqueLab(container as unknown as HTMLElement, {
    groupLoaders: {
      './demos/group-a/index.ts': async () => ({
        manifest: [
          {
            sourceId: 1,
            title: 'Demo one',
            method: 'm',
            adaptation: 'adapted',
            sources: ['https://example.com/one'],
            createDemo: demoFactory(1),
          },
        ],
      }),
    },
    researchLoaders: {},
    sourceCatalogLoader: async () => catalogFixture,
    blenderCatalogLoaders: {
      [rockLaneKey]: async () => ({
        assets: [{ id: 'rock', assetUrl: 'assets/world-studio/blender/nature/rock.glb', createdAt: '2026-09-10' }],
      }),
    },
    modelLoader,
    createRenderer: renderer.create as never,
  });
  await flushTasks();
  return { host, renderer: renderer.state };
}

function tabButton(id: string): FakeElement {
  const button = allMatching(container, 'button').find((b) => b.dataset.tab === id);
  if (!button) throw new Error(`no tab button ${id}`);
  return button;
}

function panel(id: string): FakeElement {
  const found = allMatching(container, 'section').find((s) => s.id === `tl-panel-${id}`);
  if (!found) throw new Error(`no panel ${id}`);
  return found;
}

function stage(): { text: string; hidden: boolean } {
  const empty = container.querySelector('.tl-empty');
  return { text: empty?.textContent ?? '', hidden: empty?.hidden ?? true };
}

function click(element: FakeElement): void {
  element.dispatch('click');
}

function selects(): FakeElement[] {
  return allMatching(container, 'select');
}

function selectWithOption(optionValue: string): FakeElement {
  const found = selects().find((s) =>
    s.children.some((o) => o.value === optionValue || o.textContent === optionValue),
  );
  if (!found) throw new Error(`no select with option ${optionValue}`);
  return found;
}

function urlRows(): FakeElement[] {
  return allMatching(container, '.tl-url-row');
}

function galleryItems(): FakeElement[] {
  const list = container.querySelector('.tl-list');
  if (!list) throw new Error('no gallery list');
  return list.children;
}

function cards(): FakeElement[] {
  return allMatching(container, '.tl-card');
}

describe('Lighting & Environment tab through the host', () => {
  it('offers only implemented time/weather states and mounts a CPU preview', async () => {
    const gate = gatedLoader();
    const { host } = await mountWithFixtures(gate.loader);
    const button = tabButton('lighting');
    expect(button.textContent).toContain('Lighting & Environment');
    expect(panel('lighting').hidden).toBe(true);

    click(button);
    await flushTasks();
    expect(panel('lighting').hidden).toBe(false);
    expect(panel('skills').hidden).toBe(true);
    expect(stage().hidden).toBe(true);

    const time = selectWithOption('dusk');
    const timeOptions = time.children.map((o) => ({ value: o.value, label: o.textContent, disabled: o.disabled }));
    expect(timeOptions.filter((o) => !o.disabled).map((o) => o.value)).toEqual(['morning', 'noon', 'dusk']);
    const night = timeOptions.find((o) => o.value === 'night');
    expect(night?.disabled).toBe(true);
    expect(night?.label).toContain('unavailable');

    const weather = selectWithOption('overcast');
    const weatherOptions = weather.children.map((o) => ({ value: o.value, disabled: o.disabled }));
    expect(weatherOptions.filter((o) => !o.disabled).map((o) => o.value)).toEqual(['clear', 'overcast']);
    expect(weatherOptions.find((o) => o.value === 'rain')?.disabled).toBe(true);
    expect(weatherOptions.find((o) => o.value === 'storm')?.disabled).toBe(true);

    const detail = panel('lighting').textContent;
    expect(detail).toContain('implemented: morning, noon, dusk');
    expect(detail).toContain('OPEN');
    host.dispose();
  });

  it('applies supported states and rejects unsupported ones without changing state', async () => {
    const gate = gatedLoader();
    const { host } = await mountWithFixtures(gate.loader);
    click(tabButton('lighting'));
    await flushTasks();

    const time = selectWithOption('dusk');
    time.value = 'dusk';
    time.dispatch('change');
    expect(panel('lighting').textContent).toContain('dusk, clear');
    time.value = 'night';
    time.dispatch('change');
    expect(panel('lighting').textContent).toContain('dusk, clear');
    host.dispose();
  });

  it('frees the preview on leave and remounts cleanly on return', async () => {
    const gate = gatedLoader();
    const { host } = await mountWithFixtures(gate.loader);
    click(tabButton('lighting'));
    await flushTasks();
    expect(stage().hidden).toBe(true);

    // Count geometry disposals across the leave transition: the preview owns
    // 7 geometries (ground, road, blade, walls, 2 roof slabs, door) and the
    // host must free all of them when the tab is left.
    const origDispose = THREE.BufferGeometry.prototype.dispose;
    let freedGeometries = 0;
    THREE.BufferGeometry.prototype.dispose = function (this: THREE.BufferGeometry): void {
      freedGeometries += 1;
      Reflect.apply(origDispose, this, []);
    };
    click(tabButton('skills'));
    await flushTasks();
    THREE.BufferGeometry.prototype.dispose = origDispose;
    expect(freedGeometries).toBeGreaterThanOrEqual(6);
    expect(panel('skills').hidden).toBe(false);
    expect(stage().hidden).toBe(true);

    click(tabButton('lighting'));
    await flushTasks();
    expect(stage().hidden).toBe(true);
    expect(panel('lighting').textContent).toContain('Lighting preview ready');
    host.dispose();
    host.dispose();
  });
});

describe('URL menu mapping filter and same-host targets', () => {
  it('filters to explicitly unmapped rows without inventing targets', async () => {
    const gate = gatedLoader();
    const { host } = await mountWithFixtures(gate.loader);
    click(tabButton('urls'));
    await flushTasks();

    const mapping = selectWithOption('Unmapped URLs');
    expect(mapping.children.map((o) => o.textContent)).toContain('Unmapped URLs');
    expect(urlRows()).toHaveLength(50);

    mapping.value = 'unmapped';
    mapping.dispatch('change');
    const rows = urlRows();
    expect(rows).toHaveLength(48);
    for (const row of rows) {
      expect(row.textContent).not.toContain('mapped to skill');
      expect(row.textContent).toMatch(/ingestion needed|experiment needed|blocked/);
    }
    const targets = allMatching(container, 'button').filter(
      (b) => b.dataset.action === 'open-demo' || b.dataset.action === 'open-blender',
    );
    expect(targets).toHaveLength(0);

    mapping.value = 'mapped';
    mapping.dispatch('change');
    expect(urlRows().map((row) => row.dataset.sourceId).sort()).toEqual(['1', '5']);

    mapping.value = 'all';
    mapping.dispatch('change');
    expect(urlRows()).toHaveLength(50);
    host.dispose();
  });

  it('mapped demo buttons navigate same-host to the numbered skill demo', async () => {
    const gate = gatedLoader();
    const { host } = await mountWithFixtures(gate.loader);
    click(tabButton('urls'));
    await flushTasks();

    const open = allMatching(container, 'button').find((b) => b.dataset.action === 'open-demo');
    if (!open) throw new Error('no open-demo button for the mapped row');
    expect(open.dataset.sourceId).toBe('1');
    click(open);
    await flushTasks();
    expect(tabButton('skills').classList.contains('is-active')).toBe(true);
    expect(panel('skills').hidden).toBe(false);
    expect(stage().hidden).toBe(true);
    host.dispose();
  });

  it('mapped blender buttons open the catalog-identified asset card', async () => {
    const gate = gatedLoader();
    const { host } = await mountWithFixtures(gate.loader);
    click(tabButton('urls'));
    await flushTasks();

    const open = allMatching(container, 'button').find((b) => b.dataset.action === 'open-blender');
    if (!open) throw new Error('no open-blender button for the catalog-mapped row');
    click(open);
    await flushTasks();
    expect(tabButton('blender').classList.contains('is-active')).toBe(true);
    const rockUrls = [...gate.pending.keys()].filter((u) => u.includes('rock.glb'));
    expect(rockUrls).toHaveLength(1);

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
    gate.pending.get(rockUrls[0])?.resolve({ scene });
    await flushTasks();
    const blenderPanel = panel('blender');
    expect(blenderPanel.textContent).toContain('Loaded assets/world-studio/blender/nature/rock.glb');
    expect(stage().hidden).toBe(true);
    host.dispose();
  });
});

describe('newest-first ordering with labelled unknown dates', () => {
  it('sorts the skills gallery newest-first, unknowns last and labelled', async () => {
    const gate = gatedLoader();
    const { host } = await mountWithFixtures(gate.loader);
    const items = galleryItems();
    expect(items.slice(0, 3).map((li) => li.dataset.sourceId)).toEqual(['3', '1', '2']);
    const unknown = items.find((li) => li.dataset.sourceId === '2');
    expect(unknown?.textContent).toContain('date unknown');
    const dated = items.find((li) => li.dataset.sourceId === '3');
    expect(dated?.textContent).toContain('2026-09-12');
    expect(container.querySelector('.tl-count')?.textContent).toContain('newest first');
    host.dispose();
  });

  it('sorts URL rows newest-first with the same unknown-date rule', async () => {
    const gate = gatedLoader();
    const { host } = await mountWithFixtures(gate.loader);
    click(tabButton('urls'));
    await flushTasks();
    expect(urlRows().slice(0, 3).map((row) => row.dataset.sourceId)).toEqual(['3', '1', '2']);
    host.dispose();
  });

  it('sorts Blender cards newest-first, keeping curated order for undated assets', async () => {
    const gate = gatedLoader();
    const { host } = await mountWithFixtures(gate.loader);
    click(tabButton('blender'));
    await flushTasks();
    const keys = cards().map((card) => card.dataset.assetKey);
    expect(keys[0]).toBe('nature/rock');
    expect(keys.slice(1)).toEqual(['shipped/hero-bus', 'shipped/hero-truck']);
    expect(cards()[0].textContent).toContain('2026-09-10');
    expect(cards()[1].textContent).toContain('date unknown');
    host.dispose();
  });
});
