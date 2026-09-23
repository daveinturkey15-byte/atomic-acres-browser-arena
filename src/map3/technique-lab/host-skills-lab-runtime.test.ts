/**
 * src/map3/technique-lab/host-skills-lab-runtime.test.ts — Blender gallery
 * lifecycle falsifiers driven through the REAL host (mountTechniqueLab) with a
 * bounded fake DOM, a stub renderer and an injected gated GLB loader. No GPU,
 * no network, no wall-clock waits. Proves: A->B then reject(A) leaves B's
 * status intact; a load pending across a switch to the Skills tab never
 * attaches, never touches the Skills stage, and frees its model exactly once;
 * host teardown frees the attached model exactly once.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mountTechniqueLab } from './runtime';

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

  focus(): void {
    // Focus tracking is not under test; the runtime only calls it on keyboard navigation.
  }

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

async function flushTasks(times = 12): Promise<void> {
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

type Settle = { resolve: (m: { scene: THREE.Object3D }) => void; reject: (e: Error) => void };

function gatedLoader() {
  const pending = new Map<string, Settle>();
  const loader = {
    loadAsync: (url: string) => new Promise<{ scene: THREE.Object3D }>((resolve, reject) => pending.set(url, { resolve, reject })),
  };
  const entry = (needle: string): Settle => {
    for (const [url, settle] of pending) if (url.includes(needle)) return settle;
    throw new Error(`no pending load containing "${needle}"; pending: ${[...pending.keys()].join(', ') || 'none'}`);
  };
  const urls = (needle: string): string[] => [...pending.keys()].filter((u) => u.includes(needle));
  return { loader, pending, entry, urls };
}

function countingModel() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const tex = new THREE.Texture();
  const mat = new THREE.MeshStandardMaterial({ map: tex });
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geo, mat));
  const counts = { geo: 0, mat: 0, tex: 0 };
  geo.dispose = () => void (counts.geo += 1);
  mat.dispose = () => void (counts.mat += 1);
  tex.dispose = () => void (counts.tex += 1);
  return { scene, counts };
}

async function mountHost(loader: { loadAsync(url: string): Promise<{ scene: THREE.Object3D }> }) {
  const renderer = rendererStub();
  const host = await mountTechniqueLab(container as unknown as HTMLElement, {
    groupLoaders: {},
    researchLoaders: {},
    sourceCatalogLoader: async () => null,
    blenderCatalogLoaders: {},
    modelLoader: loader,
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

function cards(): FakeElement[] {
  return allMatching(container, '.tl-card');
}

/** Status line inside the tab panel that owns the Blender cards. */
function blenderStatus(): string {
  let node: FakeElement | null = cards()[0] ?? null;
  while (node && node.getAttribute('role') !== 'tabpanel') node = node.parentNode;
  if (!node) throw new Error('Blender panel not found');
  return allMatching(node, '.tl-status').map((e) => e.textContent).join(' | ');
}

function stage(): { text: string; hidden: boolean } {
  const empty = container.querySelector('.tl-empty');
  return { text: empty?.textContent ?? '', hidden: empty?.hidden ?? true };
}

function errorText(): string {
  return container.querySelector('.tl-error')?.textContent ?? '';
}

function click(element: FakeElement): void {
  element.dispatch('click');
}

describe('Blender gallery lifecycle through the host', () => {
  it('A->B then reject(A) keeps B as the current request: status stays B, only B attaches, B freed once on teardown', async () => {
    const gate = gatedLoader();
    const { host } = await mountHost(gate.loader);
    click(tabButton('blender'));
    await flushTasks();
    const [bus, truck] = cards();
    expect(bus.dataset.assetKey).toContain('hero-bus');
    expect(truck.dataset.assetKey).toContain('hero-truck');

    click(bus);
    await flushTasks();
    click(truck);
    await flushTasks();
    expect(gate.urls('hero-bus.glb')).toHaveLength(1);
    expect(gate.urls('hero-truck.glb')).toHaveLength(1);
    expect(blenderStatus()).toContain('Loading assets/world-studio/blender/hero-truck.glb');

    gate.entry('hero-bus.glb').reject(new Error('bus 404'));
    await flushTasks();
    expect(errorText()).toContain('Load failed for assets/world-studio/blender/hero-bus.glb: bus 404');
    expect(blenderStatus()).toContain('Loading assets/world-studio/blender/hero-truck.glb');
    expect(blenderStatus()).not.toContain('Load failed');
    expect(stage().text).toContain('hero-truck.glb');
    expect(stage().hidden).toBe(false);

    const truckModel = countingModel();
    gate.entry('hero-truck.glb').resolve({ scene: truckModel.scene });
    await flushTasks();
    expect(blenderStatus()).toContain('Loaded assets/world-studio/blender/hero-truck.glb');
    expect(blenderStatus()).not.toContain('Load failed');
    expect(truckModel.scene.parent).not.toBeNull();
    expect(stage().hidden).toBe(true);
    expect(truckModel.counts).toEqual({ geo: 0, mat: 0, tex: 0 });

    host.dispose();
    host.dispose();
    expect(truckModel.scene.parent).toBeNull();
    expect(truckModel.counts).toEqual({ geo: 1, mat: 1, tex: 1 });
  });

  it('reject(A) after B attached leaves B loaded and attached', async () => {
    const gate = gatedLoader();
    const { host } = await mountHost(gate.loader);
    click(tabButton('blender'));
    await flushTasks();
    const [bus, truck] = cards();
    click(bus);
    await flushTasks();
    click(truck);
    await flushTasks();
    const truckModel = countingModel();
    gate.entry('hero-truck.glb').resolve({ scene: truckModel.scene });
    await flushTasks();
    expect(blenderStatus()).toContain('Loaded assets/world-studio/blender/hero-truck.glb');
    gate.entry('hero-bus.glb').reject(new Error('late bus failure'));
    await flushTasks();
    expect(blenderStatus()).toContain('Loaded assets/world-studio/blender/hero-truck.glb');
    expect(blenderStatus()).not.toContain('Load failed');
    expect(errorText()).toContain('late bus failure');
    expect(truckModel.scene.parent).not.toBeNull();
    expect(stage().hidden).toBe(true);
    expect(truckModel.counts).toEqual({ geo: 0, mat: 0, tex: 0 });
    host.dispose();
    expect(truckModel.counts).toEqual({ geo: 1, mat: 1, tex: 1 });
  });

  it('a load pending across a switch to Skills never attaches, never touches the Skills stage, frees once, and reloads on return', async () => {
    const gate = gatedLoader();
    const { host } = await mountHost(gate.loader);
    click(tabButton('blender'));
    await flushTasks();
    click(cards()[0]);
    await flushTasks();
    expect(gate.urls('hero-bus.glb')).toHaveLength(1);

    click(tabButton('skills'));
    await flushTasks();
    const skillsStage = stage();
    expect(skillsStage.hidden).toBe(false);
    expect(skillsStage.text).toContain('Missing / not delivered');

    const stale = countingModel();
    gate.entry('hero-bus.glb').resolve({ scene: stale.scene });
    await flushTasks();
    expect(stale.scene.parent).toBeNull();
    expect(stale.counts).toEqual({ geo: 1, mat: 1, tex: 1 });
    expect(stage()).toEqual(skillsStage); // the stale resolve did not hide or rewrite the Skills overlay

    // Returning to the gallery re-issues the selected asset as a fresh request.
    gate.pending.clear();
    click(tabButton('blender'));
    await flushTasks();
    expect(gate.urls('hero-bus.glb')).toHaveLength(1);
    expect(blenderStatus()).toContain('Loading assets/world-studio/blender/hero-bus.glb');
    const fresh = countingModel();
    gate.entry('hero-bus.glb').resolve({ scene: fresh.scene });
    await flushTasks();
    expect(blenderStatus()).toContain('Loaded assets/world-studio/blender/hero-bus.glb');
    expect(fresh.scene.parent).not.toBeNull();
    expect(stage().hidden).toBe(true);
    expect(stale.counts).toEqual({ geo: 1, mat: 1, tex: 1 });

    host.dispose();
    expect(fresh.counts).toEqual({ geo: 1, mat: 1, tex: 1 });
    expect(stale.counts).toEqual({ geo: 1, mat: 1, tex: 1 });
  });

  it('a rejection pending across a switch to Skills is logged but never rewrites the Skills stage or Blender status', async () => {
    const gate = gatedLoader();
    const { host } = await mountHost(gate.loader);
    click(tabButton('blender'));
    await flushTasks();
    click(cards()[0]);
    await flushTasks();
    click(tabButton('skills'));
    await flushTasks();
    const skillsStage = stage();
    gate.entry('hero-bus.glb').reject(new Error('network gone'));
    await flushTasks();
    expect(errorText()).toContain('network gone');
    expect(stage()).toEqual(skillsStage);
    expect(blenderStatus()).not.toContain('Load failed');
    host.dispose();
  });
});
