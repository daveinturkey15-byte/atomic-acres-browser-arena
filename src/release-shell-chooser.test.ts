import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// The chooser used to iterate a hardcoded ['experimental','previous','retained','historical'].
// PASS 80 was built, published to channels/pass80, written into release-channel-config.js by
// the publish script - and never drawn, because it was not one of those four names. The owner
// deployed a build, opened the site, was offered PASS 73, and had every reason to conclude the
// work had not landed. PASS 63 was invisible the same way.
//
// Every gate agreed, because every gate had been told the answer was four: the unit test pinned
// the literal key list, the static verifier required the config keys to equal it exactly, and
// the browser verifier asserted `buttons.count() === 4`. A hardcoded expectation cannot catch a
// hardcoded defect.
//
// So this file does not pin source text. It RUNS the shipped shell against a synthetic config
// and asserts what a player would see. Adding a channel to the config must add a card, with no
// edit to the shell and no edit to this test.
const shellSource = readFileSync('release-shell/release-shell.js', 'utf8');

interface Card {
  key: string;
  className: string;
  eyebrow: string;
  label: string;
  description: string;
}

interface StubElement {
  tagName: string;
  dataset: Record<string, string>;
  children: StubElement[];
  textContent: string;
  className: string;
  type: string;
  append: (...kids: StubElement[]) => void;
  addEventListener: (event: string, handler: () => void) => void;
}

/** Render the real shell against `channels` and report the cards a player would be offered. */
function renderChooser(channels: Record<string, unknown>, search = ''): Card[] {
  const rendered: StubElement[] = [];

  const element = (tagName: string): StubElement => {
    const el: StubElement = {
      tagName,
      dataset: {},
      children: [],
      textContent: '',
      className: '',
      type: '',
      append: (...kids) => { el.children.push(...kids); },
      addEventListener: () => {},
    };
    return el;
  };

  const options = { append: (el: StubElement) => { rendered.push(el); } };
  const document = {
    baseURI: 'https://example.invalid/atomic-acres-browser-arena/',
    // Only the options container exists. The hard-refresh button and status line are absent on
    // purpose: the shell reaches for both and must tolerate their absence, which is the same
    // resilience a partially-rendered page needs.
    querySelector: (selector: string) => (selector === '#release-channel-options' ? options : null),
    createElement: element,
  };
  const store = new Map<string, string>();
  const sandbox = {
    window: {
      __ATOMIC_ACRES_RELEASE_CHANNELS__: channels,
      location: {
        search,
        href: `https://example.invalid/atomic-acres-browser-arena/${search}`,
        assign: () => {},
        replace: () => {},
      },
    },
    document,
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
    URL,
    URLSearchParams,
  };

  runInNewContext(shellSource, sandbox);

  return rendered.map((button) => ({
    key: button.dataset.releaseChoice ?? '',
    className: button.className,
    eyebrow: button.children.find((child) => child.tagName === 'small')?.textContent ?? '',
    label: button.children.find((child) => child.tagName === 'strong')?.textContent ?? '',
    description: button.children.find((child) => child.tagName === 'span')?.textContent ?? '',
  }));
}

/** The shape the live gh-pages config has carried since Pass 80 was first published. */
const LIVE_SHAPED_CONFIG = {
  experimental: { label: 'PASS 73', description: 'live', pass: 'PASS 73', path: 'channels/the-big-one', deploymentState: 'live' },
  previous: { label: 'PASS 72 · PREVIOUS LIVE', description: 'previous', pass: 'PASS 72', path: 'channels/pass72-retained' },
  retained: { label: 'PASS 70 · RETAINED LIVE', description: 'retained', pass: 'PASS 70', path: 'channels/pass70-retained' },
  historical: { label: 'PASS 69 · RETAINED STABLE', description: 'historical', pass: 'PASS 69', path: 'channels/pass69-retained' },
  stable: { label: 'PASS 63 · STABLE WEBGL', description: 'rollback', pass: 'PASS 63', path: 'channels/pass63-rollback' },
  pass80: { label: 'PASS 80', description: 'newest', pass: 'PASS 80', path: 'channels/pass80' },
};

describe('release chooser renders every published pass', () => {
  it('draws one card per configured channel, not a fixed four', () => {
    const cards = renderChooser(LIVE_SHAPED_CONFIG);
    expect(cards).toHaveLength(Object.keys(LIVE_SHAPED_CONFIG).length);
    expect(cards.map((card) => card.key).sort()).toEqual(Object.keys(LIVE_SHAPED_CONFIG).sort());
  });

  it('offers PASS 80 and PASS 63 - the two the hardcoded list silently dropped', () => {
    const keys = renderChooser(LIVE_SHAPED_CONFIG).map((card) => card.key);
    expect(keys).toContain('pass80');
    expect(keys).toContain('stable');
  });

  it('orders newest pass first so the build to test is the first thing offered', () => {
    const cards = renderChooser(LIVE_SHAPED_CONFIG);
    expect(cards.map((card) => card.label)).toEqual([
      'PASS 80',
      'PASS 73',
      'PASS 72 · PREVIOUS LIVE',
      'PASS 70 · RETAINED LIVE',
      'PASS 69 · RETAINED STABLE',
      'PASS 63 · STABLE WEBGL',
    ]);
  });

  it('adds a card for a pass the shell has never heard of', () => {
    // The actual regression guard. A future PASS 81 must appear with no edit to the shell.
    const withFuturePass = {
      ...LIVE_SHAPED_CONFIG,
      pass81: { label: 'PASS 81', description: 'future', pass: 'PASS 81', path: 'channels/pass81' },
    };
    const cards = renderChooser(withFuturePass);
    expect(cards).toHaveLength(7);
    expect(cards[0]).toMatchObject({ key: 'pass81', label: 'PASS 81', description: 'future' });
  });

  it('keeps the retained badge vocabulary and calls an unplayed pass a release candidate', () => {
    const byKey = new Map(renderChooser(LIVE_SHAPED_CONFIG).map((card) => [card.key, card.eyebrow]));
    expect(byKey.get('experimental')).toBe('PASS 73 · LIVE');
    expect(byKey.get('previous')).toBe('PASS 72 · PREVIOUS LIVE');
    expect(byKey.get('retained')).toBe('PASS 70 · RETAINED LIVE');
    expect(byKey.get('historical')).toBe('PASS 69 · RETAINED STABLE');
    expect(byKey.get('stable')).toBe('PASS 63 · STABLE WEBGL');
    expect(byKey.get('pass80')).toBe('PASS 80 · RELEASE CANDIDATE');
  });

  it('carries the channel key onto the element the browser gate selects on', () => {
    // verify-release-topology-browser.mjs locates cards by [data-release-choice="<key>"].
    for (const card of renderChooser(LIVE_SHAPED_CONFIG)) {
      expect(card.className).toContain(card.key);
      expect(card.key).not.toBe('');
    }
  });

  it('skips a channel with no path rather than offering a card that would 404', () => {
    const cards = renderChooser({
      ...LIVE_SHAPED_CONFIG,
      broken: { label: 'PASS 99', description: 'no path', pass: 'PASS 99' },
    });
    expect(cards.map((card) => card.key)).not.toContain('broken');
    expect(cards).toHaveLength(Object.keys(LIVE_SHAPED_CONFIG).length);
  });

  it('renders authored strings as text, never as markup', () => {
    // label and description are the only authored strings that reach the page.
    const cards = renderChooser({
      solo: { label: '<img src=x onerror=alert(1)>', description: '<script>alert(2)</script>', pass: 'PASS 1', path: 'channels/solo' },
    });
    expect(cards[0].label).toBe('<img src=x onerror=alert(1)>');
    expect(cards[0].description).toBe('<script>alert(2)</script>');
  });

  it('renders the chooser rather than routing when no release is requested', () => {
    expect(renderChooser(LIVE_SHAPED_CONFIG, '')).not.toHaveLength(0);
  });

  it('routes instead of rendering when a release is requested, including a new pass key', () => {
    // A `?release=` the config knows must short-circuit before any card is built, so a direct
    // link to a freshly published pass works the moment that pass exists.
    expect(renderChooser(LIVE_SHAPED_CONFIG, '?release=pass80')).toHaveLength(0);
    expect(renderChooser(LIVE_SHAPED_CONFIG, '?release=latest')).toHaveLength(0);
    expect(renderChooser(LIVE_SHAPED_CONFIG, '?release=pass69')).toHaveLength(0);
  });

  it('still renders when asked for a release that does not exist', () => {
    // An unknown ?release must fall through to the chooser, not route to undefined.
    expect(renderChooser(LIVE_SHAPED_CONFIG, '?release=pass404').length).toBeGreaterThan(0);
  });
});
