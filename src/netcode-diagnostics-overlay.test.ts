import { describe, expect, it } from 'vitest';
import {
  NETCODE_OVERLAY_ELEMENT_ID,
  NETCODE_OVERLAY_REPAINT_INTERVAL_MS,
  NETCODE_OVERLAY_TOGGLE_CODE,
  createNetcodeOverlay,
  isNetcodeOverlayToggle,
} from './netcode-diagnostics-overlay';
import { createNetcodeDiagnosticsModel, recordInboundSnapshot, recordRttSample } from './netcode-diagnostics';

/**
 * The repository's vitest run has NO DOM environment (see vite.config.ts: no
 * `environment: 'jsdom'`, and jsdom is not a dependency). Rather than add one
 * for a <pre> tag, the overlay is written against the structural Document type
 * and tested against this fake. The fake counts textContent WRITES, which is
 * the property the module actually promises.
 */
type FakeElement = {
  id: string;
  hidden: boolean;
  textContent: string;
  attributes: Map<string, string>;
  writeCount: number;
  parent: FakeElement | null;
  children: FakeElement[];
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  appendChild(child: FakeElement): FakeElement;
  remove(): void;
};

function makeElement(tag: string): FakeElement {
  const attributes = new Map<string, string>();
  let text = '';
  const element: FakeElement = {
    id: tag === 'pre' ? '' : tag,
    hidden: false,
    get textContent() {
      return text;
    },
    set textContent(next: string) {
      text = next;
      element.writeCount += 1;
    },
    attributes,
    writeCount: 0,
    parent: null,
    children: [],
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    },
    appendChild(child: FakeElement) {
      child.parent = element;
      element.children.push(child);
      return child;
    },
    remove() {
      const parent = element.parent;
      if (!parent) return;
      parent.children = parent.children.filter((candidate: FakeElement) => candidate !== element);
      element.parent = null;
    },
  } as unknown as FakeElement;
  return element;
}

function makeDocument(): { doc: Document; body: FakeElement } {
  const body = makeElement('body');
  const doc = {
    body,
    documentElement: body,
    createElement: (tag: string) => makeElement(tag),
    getElementById: (id: string) => body.children.find((child) => child.id === id) ?? null,
  } as unknown as Document;
  return { doc, body };
}

describe('netcode overlay toggle predicate', () => {
  it('toggles on a bare F3 press only', () => {
    expect(NETCODE_OVERLAY_TOGGLE_CODE).toBe('F3');
    expect(isNetcodeOverlayToggle({ code: 'F3', repeat: false })).toBe(true);
    // Held down must not strobe the overlay.
    expect(isNetcodeOverlayToggle({ code: 'F3', repeat: true })).toBe(false);
    expect(isNetcodeOverlayToggle({ code: 'F4', repeat: false })).toBe(false);
    // Modified F3 belongs to the browser/OS, not to us.
    expect(isNetcodeOverlayToggle({ code: 'F3', repeat: false, ctrlKey: true })).toBe(false);
    expect(isNetcodeOverlayToggle({ code: 'F3', repeat: false, metaKey: true })).toBe(false);
    expect(isNetcodeOverlayToggle({ code: 'F3', repeat: false, altKey: true })).toBe(false);
  });
});

describe('netcode overlay element', () => {
  it('mounts one hidden, non-interactive, aria-hidden element', () => {
    const { doc, body } = makeDocument();
    const overlay = createNetcodeOverlay(doc);
    const element = overlay.element as unknown as FakeElement;
    expect(body.children).toHaveLength(1);
    expect(element.id).toBe(NETCODE_OVERLAY_ELEMENT_ID);
    expect(element.hidden).toBe(true);
    expect(element.getAttribute('aria-hidden')).toBe('true');
    // It must never eat a click during a firefight, and must never be read out
    // over the match by a screen reader.
    expect(element.getAttribute('style')).toContain('pointer-events:none');
  });

  it('adopts an existing element instead of stacking a second overlay', () => {
    const { doc, body } = makeDocument();
    const first = createNetcodeOverlay(doc);
    const second = createNetcodeOverlay(doc);
    expect(body.children).toHaveLength(1);
    expect(second.element).toBe(first.element);
  });

  it('writes nothing at all while hidden, however often it is updated', () => {
    const { doc } = makeDocument();
    const overlay = createNetcodeOverlay(doc);
    const element = overlay.element as unknown as FakeElement;
    const model = createNetcodeDiagnosticsModel('host', 'h', 'ROOM');
    for (let frame = 0; frame < 600; frame += 1) {
      recordRttSample(model, 'g1', 40 + frame);
      expect(overlay.update(model, frame * 16)).toBe(false);
    }
    expect(element.writeCount).toBe(0);
  });

  it('repaints at most once per interval no matter the caller cadence', () => {
    const { doc } = makeDocument();
    const overlay = createNetcodeOverlay(doc);
    const element = overlay.element as unknown as FakeElement;
    const model = createNetcodeDiagnosticsModel('host', 'h', 'ROOM');
    overlay.setVisible(true);

    // A 300 Hz caller over one second: ~3.3 ms per call.
    let now = 0;
    for (let frame = 0; frame < 300; frame += 1) {
      now = frame * (1_000 / 300);
      recordRttSample(model, 'g1', 40 + (frame % 7));
      recordInboundSnapshot(model, 'g1', frame, now);
      overlay.update(model, now);
    }
    const expectedCeiling = Math.ceil(1_000 / NETCODE_OVERLAY_REPAINT_INTERVAL_MS) + 1;
    expect(element.writeCount).toBeGreaterThan(0);
    expect(element.writeCount).toBeLessThanOrEqual(expectedCeiling);
  });

  it('skips the DOM write when the rendered text is unchanged', () => {
    const { doc } = makeDocument();
    const overlay = createNetcodeOverlay(doc);
    const element = overlay.element as unknown as FakeElement;
    const model = createNetcodeDiagnosticsModel('host', 'h', 'ROOM');
    overlay.setVisible(true);
    expect(overlay.update(model, 0)).toBe(true);
    const afterFirst = element.writeCount;
    // Model mutates (revision moves) but every rendered field rounds to the
    // same text: no write.
    model.revision += 1;
    expect(overlay.update(model, 1_000)).toBe(false);
    expect(element.writeCount).toBe(afterFirst);
  });

  it('paints immediately after being shown even if the model did not move', () => {
    const { doc } = makeDocument();
    const overlay = createNetcodeOverlay(doc);
    const element = overlay.element as unknown as FakeElement;
    const model = createNetcodeDiagnosticsModel('guest', 'g', 'ROOM');
    overlay.setVisible(true);
    overlay.update(model, 0);
    overlay.setVisible(false);
    recordRttSample(model, 'host-1', 60, 'host');
    overlay.setVisible(true);
    expect(overlay.update(model, 10)).toBe(true);
    expect(element.textContent).toContain('host-1');
  });

  it('toggles visibility and reports the new state', () => {
    const { doc } = makeDocument();
    const overlay = createNetcodeOverlay(doc);
    const element = overlay.element as unknown as FakeElement;
    expect(overlay.visible).toBe(false);
    expect(overlay.toggle()).toBe(true);
    expect(overlay.visible).toBe(true);
    expect(element.hidden).toBe(false);
    expect(overlay.toggle()).toBe(false);
    expect(element.hidden).toBe(true);
  });

  it('detaches cleanly', () => {
    const { doc, body } = makeDocument();
    const overlay = createNetcodeOverlay(doc);
    overlay.destroy();
    expect(body.children).toHaveLength(0);
  });
});

describe('netcode overlay source contract', () => {
  it('never touches a canvas, a renderer or three.js', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('./netcode-diagnostics-overlay.ts', import.meta.url), 'utf8');
    // Comments are stripped first: the header DESCRIBES the rule ("never asks
    // three.js for anything") and a naive substring scan would fail on its own
    // documentation, which is the classic way this kind of tripwire gets
    // deleted instead of fixed.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/(^|[^:])\/\/.*$/gmu, '$1');
    // AGENTS.md forbids active native-WebGPU gameplay reading the presented
    // canvas. A diagnostics overlay is exactly the sort of thing that grows a
    // canvas readback later; this is the tripwire that stops it.
    for (const forbidden of ['getContext', 'toDataURL', 'drawImage', 'requestAnimationFrame', 'canvas', "from 'three"]) {
      expect(code.toLowerCase(), `overlay source must not contain ${forbidden}`).not.toContain(forbidden.toLowerCase());
    }
  });
});
