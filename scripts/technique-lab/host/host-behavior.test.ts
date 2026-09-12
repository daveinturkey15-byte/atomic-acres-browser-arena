/**
 * scripts/technique-lab/host/host-behavior.test.ts — behavioural regression
 * falsifiers for the Technique Lab HOST. Exercises the ACTUAL runtime module
 * (real three 0.185.1 math, OrbitControls, manifest validation, mounting,
 * teardown and generation guards) through a bounded fake DOM and a stub
 * renderer. No GPU, no browser, no wall-clock waits. These tests fail on
 * plausible host bugs: factory/update/dispose exceptions leaking, duplicate
 * or blocked manifest entries mounting, alias rows passing as distinct
 * techniques, missing not-delivered surfacing, and non-exactly-once disposal.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  LAB_SEED,
  boundedBoundingSphere,
  clampDelta,
  computeFrameFit,
  mountTechniqueLab,
} from '../../../src/map3/technique-lab/runtime';
import type {
  DemoManifestEntry,
  GroupModule,
  LabHostOptions,
} from '../../../src/map3/technique-lab/types';

/* ------------------------------------------------------------------ */
/* Bounded fake DOM                                                    */
/* ------------------------------------------------------------------ */

type Listener = (event?: unknown) => void;

class FakeElement {
  tagName: string;
  get className(): string {
    return [...this.classes].join(' ');
  }

  set className(value: string) {
    this.classes = new Set(value.split(/\s+/).filter(Boolean));
  }

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
  // OrbitControls' connect/disconnect touches domElement.ownerDocument.
  ownerDocument = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  /** OrbitControls disconnect resolves the event root via getRootNode. */
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

function click(element: FakeElement): void {
  element.dispatch('click');
}

/** Depth-first collection of descendants matching a tag or class selector. */
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

/* ------------------------------------------------------------------ */
/* DOM/window globals for the runtime under test                       */
/* ------------------------------------------------------------------ */

interface FakeWindow {
  location: { search: string; hash: string };
  history: { replaceState: (state: unknown, title: string, url: string) => void };
  devicePixelRatio: number;
  addEventListener: (type: string, listener: Listener) => void;
  removeEventListener: (type: string, listener: Listener) => void;
}

const rafQueue: Array<(time: number) => void> = [];
let container!: FakeElement;
let fakeWindow!: FakeWindow;

beforeEach(() => {
  container = new FakeElement('div');
  fakeWindow = {
    location: { search: '', hash: '' },
    history: { replaceState: (_state, _title, url: string) => void url },
    devicePixelRatio: 1,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const globalScope = globalThis as unknown as Record<string, unknown>;
  globalScope.document = {
    createElement: (tag: string) => new FakeElement(tag),
    createDocumentFragment: () => new FakeElement('#fragment'),
    createTextNode: (value: string) => {
      const node = new FakeElement('#text');
      node.text = value;
      return node;
    },
  };
  globalScope.window = fakeWindow;
  globalScope.ResizeObserver = undefined;
  // Deterministic frame loop: the host's rAF callbacks run only when a test
  // pumps them, never on a wall clock.
  globalScope.requestAnimationFrame = (cb: (time: number) => void) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  globalScope.cancelAnimationFrame = () => undefined;
});

afterEach(() => {
  rafQueue.length = 0;
});

/** Pump one animation frame through the real host loop. */
function pumpFrame(): void {
  const tick = rafQueue.shift();
  if (tick) tick(performance.now());
}

/**
 * Drain pending microtasks (renderer init, module loader continuations)
 * deterministically — pure microtask yields, no timers.
 */
async function flushTasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

/* ------------------------------------------------------------------ */
/* Stub renderer + demo fixtures                                       */
/* ------------------------------------------------------------------ */

interface StubRendererState {
  inits: number;
  renders: number;
  disposed: number;
}

function makeRendererStub(
  state: StubRendererState,
  backend: unknown = { isWebGPUBackend: true },
) {
  return () => ({
    init: () => {
      state.inits += 1;
      return Promise.resolve();
    },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    render: () => {
      state.renders += 1;
    },
    dispose: () => {
      state.disposed += 1;
    },
    backend,
    info: { render: { drawCalls: 3, triangles: 120 } },
  });
}

function makeEntry(
  sourceId: number,
  overrides: Partial<DemoManifestEntry> = {},
): DemoManifestEntry {
  return {
    sourceId,
    title: `Demo ${sourceId}`,
    method: `Method ${sourceId}`,
    adaptation: 'adapted',
    sources: [`https://example.com/source-${sourceId}`],
    ...overrides,
  };
}

/** Real demo instance: actual THREE.Group with finite bounds, per contract. */
function makeDemo(
  sourceId: number,
  overrides: {
    root?: THREE.Group;
    update?: (time: number, dt: number) => void;
    dispose?: () => void;
  } = {},
) {
  const root: THREE.Group = overrides.root ?? new THREE.Group();
  if (overrides.root === undefined) {
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
  }
  return {
    root,
    update: overrides.update,
    dispose: overrides.dispose ?? (() => undefined),
    metadata: {
      sourceId,
      title: `Demo ${sourceId}`,
      method: `Method ${sourceId}`,
      adaptation: 'adapted' as const,
      sources: [`https://example.com/source-${sourceId}`],
    },
  };
}

function groupModule(entries: DemoManifestEntry[], notDelivered?: number[]): GroupModule {
  const module: GroupModule & { notDeliveredSourceIds?: number[] } = { manifest: entries };
  if (notDelivered) module.notDeliveredSourceIds = notDelivered;
  return module;
}

async function mountHost(options: LabHostOptions, rendererState: StubRendererState) {
  const host = await mountTechniqueLab(container as unknown as HTMLElement, {
    ...options,
    createRenderer: makeRendererStub(rendererState),
  });
  await flushTasks();
  return host;
}

function detailText(): string {
  return container.querySelector('.tl-detail')?.textContent ?? '';
}

function stageText(): string {
  const empty = container.querySelector('.tl-empty');
  // The overlay may keep a stale message after being hidden; only visible
  // stage text counts.
  return empty && !empty.hidden ? empty.textContent : '';
}

function errorText(): string {
  return container.querySelector('.tl-error')?.textContent ?? '';
}

function galleryButton(sourceId: number): FakeElement | null {
  for (const li of allMatching(container, 'li')) {
    if (li.dataset.sourceId === String(sourceId)) {
      return li.querySelector('button');
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Behavioural falsifiers                                              */
/* ------------------------------------------------------------------ */

describe('technique lab host behaviour', () => {
  it('keeps all 50 records pending and shows Missing/not delivered with no groups', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost({ groupLoaders: {} }, renderer);
    expect(detailText()).toContain('Pending / Not yet delivered');
    expect(stageText()).toContain('Missing / not delivered');
    expect(renderer.inits).toBe(1);
    host.dispose();
  });

  it('reports a throwing factory, flags the row, and keeps the host alive', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([
              makeEntry(2, {
                createDemo: () => {
                  throw new Error('boom');
                },
              }),
            ]),
        },
      },
      renderer,
    );
    click(galleryButton(2) as FakeElement);
    expect(stageText()).toContain('factory threw');
    expect(stageText()).toContain('boom');
    const badge = (galleryButton(2) as FakeElement).querySelector('.tl-badge');
    expect(badge?.classes.has('is-error')).toBe(true);
    expect(detailText()).toContain('factory threw');
    pumpFrame();
    expect(renderer.renders).toBeGreaterThan(0);
    host.dispose();
  });

  it('refuses to mount a factory whose root is not a THREE.Group', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([
              makeEntry(3, {
                createDemo: () =>
                  ({
                    root: {},
                    dispose: () => undefined,
                    metadata: makeDemo(3).metadata,
                  }) as never,
              }),
            ]),
        },
      },
      renderer,
    );
    click(galleryButton(3) as FakeElement);
    expect(stageText()).toContain('did not return a THREE.Group root');
    host.dispose();
  });

  it('flags a metadata sourceId mismatch but still mounts', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([makeEntry(4, { createDemo: () => makeDemo(99) })]),
        },
      },
      renderer,
    );
    click(galleryButton(4) as FakeElement);
    expect(detailText()).toContain('does not match manifest/URL id 4');
    expect(stageText()).not.toContain('Missing / not delivered');
    host.dispose();
  });

  it('stops only the throwing demo update and keeps the loop alive', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    let calls = 0;
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([
              makeEntry(5, {
                createDemo: () =>
                  makeDemo(5, {
                    update: () => {
                      calls += 1;
                      throw new Error('update exploded');
                    },
                  }),
              }),
            ]),
        },
      },
      renderer,
    );
    click(galleryButton(5) as FakeElement);
    pumpFrame();
    expect(calls).toBe(1);
    expect(stageText()).toContain('update threw and was stopped');
    const rendersAfterTeardown = renderer.renders;
    pumpFrame();
    expect(renderer.renders).toBeGreaterThan(rendersAfterTeardown);
    host.dispose();
  });

  it('survives a demo dispose that throws during selection switch', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([
              makeEntry(6, {
                createDemo: () =>
                  makeDemo(6, {
                    dispose: () => {
                      throw new Error('dispose blew up');
                    },
                  }),
              }),
              makeEntry(7, { createDemo: () => makeDemo(7) }),
            ]),
        },
      },
      renderer,
    );
    click(galleryButton(6) as FakeElement);
    click(galleryButton(7) as FakeElement);
    expect(errorText()).toContain('dispose threw');
    expect(errorText()).toContain('dispose blew up');
    expect(detailText()).toContain('7. Demo 7');
    host.dispose();
  });

  it('keeps the first group on duplicate sourceId conflict', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-a/index.ts': async () =>
            groupModule([makeEntry(8, { title: 'First' })]),
          './demos/group-b/index.ts': async () =>
            groupModule([makeEntry(8, { title: 'Second' })]),
        },
      },
      renderer,
    );
    click(galleryButton(8) as FakeElement);
    expect(detailText()).toContain('First');
    expect(detailText()).toContain('Duplicate sourceId 8: kept group-a, ignored group-b');
    host.dispose();
  });

  it('strips the factory of a blocked entry and never mounts it', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([
              makeEntry(9, {
                adaptation: 'blocked',
                createDemo: () => makeDemo(9),
              }),
            ]),
        },
      },
      renderer,
    );
    click(galleryButton(9) as FakeElement);
    expect(detailText()).toContain('blocked entry carried a factory');
    expect(detailText()).toContain('blocked — no honest demo delivered');
    expect(stageText()).toContain('no demo factory delivered yet');
    host.dispose();
  });

  it('marks alias row 21 as a non-distinct credit', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([makeEntry(21, { createDemo: () => makeDemo(21) })]),
        },
      },
      renderer,
    );
    click(galleryButton(21) as FakeElement);
    expect(detailText()).toContain('aliases row 19');
    expect(detailText()).toContain('not a distinct technique credit');
    host.dispose();
  });

  it('surfaces group notDeliveredSourceIds honestly in both directions', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([makeEntry(10, { createDemo: () => makeDemo(10) })], [10, 11]),
        },
      },
      renderer,
    );
    click(galleryButton(10) as FakeElement);
    expect(detailText()).toContain(
      'marks source 10 as not delivered but also shipped a factory',
    );
    click(galleryButton(11) as FakeElement);
    expect(detailText()).toContain('marks source 11 as not delivered in its lane');
    host.dispose();
  });

  it('ignores group results that resolve after dispose (generation guard)', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    // Executor form: the project's TS lib predates Promise.withResolvers.
    let release!: (module: GroupModule) => void;
    const gate = new Promise<GroupModule>((resolve) => {
      release = resolve;
    });
    const host = await mountTechniqueLab(
      container as unknown as HTMLElement,
      {
        groupLoaders: {
          './demos/group-slow/index.ts': () => gate,
        },
        createRenderer: makeRendererStub(renderer),
      },
    );
    await flushTasks(4);
    host.dispose();
    release(groupModule([makeEntry(12, { createDemo: () => makeDemo(12) })]));
    await flushTasks(10);
    pumpFrame();
    expect(renderer.disposed).toBe(1);
    expect(renderer.renders).toBe(0);
  });

  it('disposes exactly once and tears the renderer down with the host', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([makeEntry(13, { createDemo: () => makeDemo(13) })]),
        },
      },
      renderer,
    );
    click(galleryButton(13) as FakeElement);
    pumpFrame();
    expect(renderer.renders).toBeGreaterThan(0);
    host.dispose();
    host.dispose();
    expect(renderer.disposed).toBe(1);
    const framesAfter = renderer.renders;
    pumpFrame();
    expect(renderer.renders).toBe(framesAfter);
  });

  it('reads backend honesty from live renderer flags', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost({ groupLoaders: {} }, renderer);
    expect(container.querySelector('.tl-metrics')?.textContent).toContain('backend WebGPU');
    host.dispose();

    const renderer2 = { inits: 0, renders: 0, disposed: 0 };
    const container2 = new FakeElement('div');
    const host2 = await mountTechniqueLab(container2 as unknown as HTMLElement, {
      groupLoaders: {},
      // Explicit null (not undefined) so the stub default does not re-apply.
      createRenderer: makeRendererStub(renderer2, null),
    });
    await flushTasks();
    expect(container2.querySelector('.tl-metrics')?.textContent).toContain(
      'backend unknown',
    );
    host2.dispose();
  });

  it('renders non-http sources as unlinked text only', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([
              makeEntry(14, {
                sources: ['javascript:alert(1)', 'https://ok.example/a'],
              }),
            ]),
        },
      },
      renderer,
    );
    click(galleryButton(14) as FakeElement);
    const detail = container.querySelector('.tl-detail') as FakeElement;
    const links = allMatching(detail, 'a');
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('https://ok.example/a');
    expect(detail.textContent).toContain('not linked');
    expect(detail.textContent).toContain('javascript:alert(1)');
    host.dispose();
  });

  it('hands the fixed deterministic seed to demo factories', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const seeds: number[] = [];
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([
              makeEntry(15, {
                createDemo: (context) => {
                  seeds.push(context.seed);
                  return makeDemo(15);
                },
              }),
            ]),
        },
      },
      renderer,
    );
    click(galleryButton(15) as FakeElement);
    expect(seeds).toEqual([LAB_SEED]);
    host.dispose();
  });
});

describe('source evidence honesty', () => {
  it('replaces the false never-fetched sources heading with the honest one', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost({ groupLoaders: {} }, renderer);
    click(galleryButton(1) as FakeElement);
    const detail = detailText();
    expect(detail).toContain('the host never fetches them');
    expect(detail).not.toContain('links only, never fetched');
    expect(detail).toContain('No research records loadable in this tree');
    host.dispose();
  });

  it('downgrades a demo-title mismatch to an informational notice, not a load issue', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([makeEntry(2, { createDemo: () => makeDemo(2) })]),
        },
      },
      renderer,
    );
    click(galleryButton(2) as FakeElement);
    expect(detailText()).toContain('Demo title differs from public record');
    const status = container.querySelector('.tl-status')?.textContent ?? '';
    expect(status).toContain('implementation loaded');
    expect(status).not.toContain('load issue');
    const badge = (galleryButton(2) as FakeElement).querySelector('.tl-badge');
    expect(badge?.classes.has('is-error')).toBe(false);
    host.dispose();
  });

  it('maps a group-a research record onto inspected/extracted stages with pin, sha and date', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {},
        researchLoaders: {
          '../../../docs/technique-lab/group-a/SOURCE_RESEARCH.json': async () => ({
            group: 'group-a',
            records: [
              {
                sourceId: 3,
                title: 'Stylized water',
                adaptation: 'adapted',
                urls: [
                  {
                    url: 'https://example.com/a',
                    outcome: 'ok',
                    status: 200,
                    readDepth: 'repository page read',
                  },
                ],
                pin: '00dfd5385506022d533c84f6737a09f5f4392623 (resolves; committed 2026-08-18T13:22:54Z)',
                licence: 'MIT read at the pinned revision',
                methodExtracted: true,
                cpuCheck: { passed: true, note: 'focused vitest' },
              },
            ],
          }),
        },
      },
      renderer,
    );
    click(galleryButton(3) as FakeElement);
    const detail = detailText();
    expect(detail).toContain('● Source inspected');
    expect(detail).toContain('● Technique extracted');
    expect(detail).toContain('○ Result tested');
    expect(detail).toContain('00dfd5385506022d533c84f6737a09f5f4392623');
    expect(detail).toContain('commit date: 2026-08-18');
    expect(detail).toContain('MIT read at the pinned revision');
    expect(detail).toContain('cpuCheck:');
    expect(detail).toContain('not machine-checked test receipts');
    host.dispose();
  });

  it('parses the heterogeneous group-b records[] and group-c rows[] shapes', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {},
        researchLoaders: {
          '../../../docs/technique-lab/group-b/SOURCE_RESEARCH.json': async () => ({
            records: [
              {
                sourceId: 4,
                title: 'Procedural grass',
                status: 'demo',
                canonical:
                  'CK42BB/procedural-grass-threejs@26f072308df12caac68a474cb40300ef576793e1',
                readDepth: 'SKILL.md read in full (22,187 bytes)',
                method: 'Tapered triangle-strip blade swept along a quadratic Bezier',
              },
            ],
          }),
          '../../../docs/technique-lab/group-c/SOURCE_RESEARCH.json': async () => ({
            rows: [
              {
                sourceId: 5,
                registerTitle: 'gas-station-highway',
                canonical:
                  'Canonical:** `StarKnightt/gas-station-highway` @ `3e1b7cbb1f46bb0b0601b4d06ceef63438ae132c`',
                decision: 'one-page-brief pattern only, no code reuse',
                carrierReadComplete: true,
                renderedAcceptance: 'captured stills reviewed',
              },
            ],
          }),
        },
      },
      renderer,
    );
    click(galleryButton(4) as FakeElement);
    expect(detailText()).toContain('● Source inspected');
    expect(detailText()).toContain('● Technique extracted');
    expect(detailText()).toContain('26f072308df12caac68a474cb40300ef576793e1');
    click(galleryButton(5) as FakeElement);
    expect(detailText()).toContain('● Source inspected');
    expect(detailText()).toContain('● Technique extracted');
    expect(detailText()).toContain('3e1b7cbb1f46bb0b0601b4d06ceef63438ae132c');
    expect(detailText()).toContain('renderedAcceptance: captured stills reviewed');
    host.dispose();
  });

  it('tolerates malformed and failed research files without faking stages', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {},
        researchLoaders: {
          '../../../docs/technique-lab/group-x/SOURCE_RESEARCH.json': async () => ({
            records: 'nope',
          }),
          '../../../docs/technique-lab/group-y/SOURCE_RESEARCH.json': () =>
            Promise.reject(new Error('disk gone')),
        },
      },
      renderer,
    );
    const detail = detailText();
    expect(detail).toContain('unrecognized shape');
    expect(detail).toContain('failed to load: disk gone');
    expect(detail).toContain('0 file(s) read');
    expect(detail).toContain('No research record for source 1');
    expect(detail).toContain('○ Source inspected');
    host.dispose();
  });

  it('counts research rows without a usable sourceId instead of guessing', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {},
        researchLoaders: {
          '../../../docs/technique-lab/group-a/SOURCE_RESEARCH.json': async () => ({
            records: [{ title: 'no id here' }, 42, null],
          }),
        },
      },
      renderer,
    );
    const detail = detailText();
    expect(detail).toContain('3 record(s) without usable sourceId');
    expect(detail).toContain('No research record for source 1');
    host.dispose();
  });

  it('renders the comparison legend only from validated demo metadata', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([
              makeEntry(6, {
                createDemo: () => makeDemo(6),
                comparison: {
                  control: 'Raw plane',
                  technique: 'Deformed plane',
                  controlPosition: 'right',
                },
              }),
              makeEntry(7, { createDemo: () => makeDemo(7) }),
            ]),
        },
      },
      renderer,
    );
    click(galleryButton(6) as FakeElement);
    const legend = container.querySelector('.tl-comparison') as FakeElement;
    expect(legend.hidden).toBe(false);
    expect(legend.textContent).toContain('Right — control: Raw plane');
    expect(legend.textContent).toContain('Left — technique: Deformed plane');
    click(galleryButton(7) as FakeElement);
    expect(legend.hidden).toBe(true);
    host.dispose();
  });

  it('rejects malformed comparison metadata instead of inventing labels', async () => {
    const renderer = { inits: 0, renders: 0, disposed: 0 };
    const host = await mountHost(
      {
        groupLoaders: {
          './demos/group-x/index.ts': async () =>
            groupModule([
              makeEntry(8, {
                createDemo: () => makeDemo(8),
                comparison: { control: '', technique: 'x' },
              } as Partial<DemoManifestEntry>),
            ]),
        },
      },
      renderer,
    );
    expect(errorText()).toContain('bad comparison');
    click(galleryButton(8) as FakeElement);
    expect(detailText()).toContain('Pending / Not yet delivered');
    const legend = container.querySelector('.tl-comparison') as FakeElement;
    expect(legend.hidden).toBe(true);
    host.dispose();
  });
});

describe('stage framing helpers', () => {
  it('clamps non-finite, negative and oversized frame deltas', () => {
    expect(clampDelta(Number.NaN)).toBe(0);
    expect(clampDelta(-1)).toBe(0);
    expect(clampDelta(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampDelta(5)).toBe(0.1);
    expect(clampDelta(0.016)).toBe(0.016);
  });

  it('frames planar bounds from above and tall bounds from lower down', () => {
    const planar = new THREE.Box3(
      new THREE.Vector3(-5, 0, -5),
      new THREE.Vector3(5, 0.1, 5),
    );
    const tall = new THREE.Box3(
      new THREE.Vector3(-0.5, 0, -0.5),
      new THREE.Vector3(0.5, 10, 0.5),
    );
    const planarFit = computeFrameFit(planar, 45, 1.6);
    const tallFit = computeFrameFit(tall, 45, 1.6);
    expect(planarFit).not.toBeNull();
    expect(tallFit).not.toBeNull();
    const elevation = (fit: { position: THREE.Vector3; target: THREE.Vector3 }) => {
      const run = Math.hypot(
        fit.position.x - fit.target.x,
        fit.position.z - fit.target.z,
      );
      return (Math.atan2(fit.position.y - fit.target.y, run) * 180) / Math.PI;
    };
    expect(elevation(planarFit!)).toBeGreaterThan(45);
    expect(elevation(tallFit!)).toBeLessThan(30);
  });

  it('aims at the real centre of offset bounds and fits narrow aspects wider', () => {
    const offset = new THREE.Box3(
      new THREE.Vector3(8, 1, -6),
      new THREE.Vector3(12, 3, -2),
    );
    const fit = computeFrameFit(offset, 45, 1.6);
    expect(fit?.target.x).toBeCloseTo(10, 5);
    expect(fit?.target.z).toBeCloseTo(-4, 5);
    const box = new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1),
    );
    const narrow = computeFrameFit(box, 45, 0.5);
    const wide = computeFrameFit(box, 45, 2);
    expect(narrow).not.toBeNull();
    expect(wide).not.toBeNull();
    expect(narrow!.position.distanceTo(narrow!.target)).toBeGreaterThan(
      wide!.position.distanceTo(wide!.target),
    );
  });

  it('returns null for empty or non-finite bounds and clamps absurd radii finitely', () => {
    expect(computeFrameFit(new THREE.Box3(), 45, 1.6)).toBeNull();
    const nanBox = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Number.NaN, 2, 2),
    );
    expect(computeFrameFit(nanBox, 45, 1.6)).toBeNull();
    const huge = new THREE.Box3(
      new THREE.Vector3(-1e9, -1e9, -1e9),
      new THREE.Vector3(1e9, 1e9, 1e9),
    );
    const fit = computeFrameFit(huge, 45, 1.6);
    expect(fit).not.toBeNull();
    expect(Number.isFinite(fit!.far)).toBe(true);
    expect(fit!.far).toBeLessThan(1e7);
  });

  it('bounds only visible geometry and rejects empty or invisible roots', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.add(new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000)));
    root.add(hidden);
    const sphere = boundedBoundingSphere(root);
    expect(sphere).not.toBeNull();
    expect(sphere!.radius).toBeLessThan(5);
    expect(boundedBoundingSphere(new THREE.Group())).toBeNull();
    const invisibleOnly = new THREE.Group();
    invisibleOnly.add(hidden);
    expect(boundedBoundingSphere(invisibleOnly)).toBeNull();
  });
});
