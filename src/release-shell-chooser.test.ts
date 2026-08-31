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

/**
 * Same shell, driven through its post-paint reconcile.
 *
 * `baked` is the channel list inlined into the cached index.html the browser is executing;
 * `served` is what the origin would hand back right now. The gap between those two is the
 * entire defect: on GitHub Pages a browser can hold index.html for its full 600 s max-age
 * while a newer publish is live, and until 2026-08-31 there was nothing that would tell it.
 */
async function reconcileChooser({
  baked,
  pointer,
  manifests = {},
  generation = 'baked-generation',
  search = '',
}: {
  baked: Record<string, unknown>;
  pointer: unknown;
  manifests?: Record<string, unknown>;
  generation?: string;
  search?: string;
}): Promise<{ cards: string[]; status: string; requested: string[]; navigated: string[] }> {
  let rendered: StubElement[] = [];
  const requested: string[] = [];
  const navigated: string[] = [];

  const element = (tagName: string): StubElement => {
    const el: StubElement = {
      tagName, dataset: {}, children: [], textContent: '', className: '', type: '',
      append: (...kids) => { el.children.push(...kids); },
      addEventListener: () => {},
    };
    return el;
  };
  const status = element('p');
  const options = {
    append: (el: StubElement) => { rendered.push(el); },
    replaceChildren: () => { rendered = []; },
  };
  const document = {
    baseURI: 'https://example.invalid/atomic-acres-browser-arena/',
    querySelector: (selector: string) => {
      if (selector === '#release-channel-options') return options;
      if (selector === '#release-status') return status;
      return null;
    },
    createElement: element,
  };
  const store = new Map<string, string>();
  const sandbox = {
    window: {
      __ATOMIC_ACRES_RELEASE_CHANNELS__: baked,
      __ATOMIC_ACRES_RELEASE_GENERATION__: generation,
      location: {
        search,
        href: `https://example.invalid/atomic-acres-browser-arena/${search}`,
        assign: (target: unknown) => { navigated.push(String(target)); },
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
    fetch: async (url: URL | string) => {
      const path = new URL(String(url)).pathname.split('/').pop() ?? '';
      requested.push(`${path}${new URL(String(url)).search}`);
      const body = path === 'release-index.json' ? pointer : manifests[path];
      if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => body };
    },
  };

  runInNewContext(shellSource, sandbox);
  // Let the reconcile chain (pointer fetch -> manifest fetch -> redraw) drain.
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();

  return {
    cards: rendered.map((button) => `${button.dataset.releaseChoice}=${button.children.find((c) => c.tagName === 'strong')?.textContent ?? ''}`),
    status: status.textContent,
    requested,
    navigated,
  };
}

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

// ---------------------------------------------------------------------------------------
// Freshness. Owner, 2026-08-30: "Once again I cannot play this in chrome ... I just opened
// it in a new chrome I ran as admin and now I see pass 73 and 72 lol, before I only saw 81
// and 63 or something. Defo something odd going on here?"
//
// He was right, and it was not the browser. The chooser used to load its code and its
// channel list from two separately cached root URLs, and GitHub Pages pins every root file
// at `Cache-Control: max-age=600` with no override available (measured 2026-08-31: a
// request-side no-cache came back Age: 109, and `?ts=<random>` came back Age: 82 because
// the CDN strips the query from its cache key). So one profile could hold a shell from one
// publish and a channel list from another and draw a set that was never published, while a
// fresh profile next to it drew the real one.
//
// The shell now treats whatever it booted with as a first paint only, and re-asks over a
// path that exists solely for the current generation. These tests drive that path.
describe('release chooser reconciles a cached page against the live channel set', () => {
  const BAKED = {
    experimental: { label: 'PASS 73', description: 'live', pass: 'PASS 73', path: 'channels/the-big-one' },
    pass81: { label: 'PASS 81', description: 'newest', pass: 'PASS 81', path: 'channels/pass81' },
  };
  const LIVE = {
    experimental: { label: 'PASS 73 · PREVIOUS VERSION', description: 'previous', pass: 'PASS 73', path: 'channels/the-big-one' },
    previous: { label: 'PASS 72 · THE ONE BEFORE THAT', description: 'older', pass: 'PASS 72', path: 'channels/pass72-retained' },
    pass82: { label: 'PASS 82', description: 'published after this page was cached', pass: 'PASS 82', path: 'channels/pass82' },
  };

  it('redraws from the live manifest when the page it is running from is a stale publish', async () => {
    const seen = await reconcileChooser({
      baked: BAKED,
      generation: 'aaaaaaaaaaaa',
      pointer: { generation: 'bbbbbbbbbbbb', manifest: 'release-manifest.bbbbbbbbbbbb.json' },
      manifests: { 'release-manifest.bbbbbbbbbbbb.json': { generation: 'bbbbbbbbbbbb', channels: LIVE } },
    });
    expect(seen.cards).toEqual([
      'pass82=PASS 82',
      'experimental=PASS 73 · PREVIOUS VERSION',
      'previous=PASS 72 · THE ONE BEFORE THAT',
    ]);
    expect(seen.status).toMatch(/cached from an earlier publish/i);
  });

  it('reads the manifest over a generation-addressed path, which is the only fresh primitive this host has', async () => {
    const seen = await reconcileChooser({
      baked: BAKED,
      generation: 'aaaaaaaaaaaa',
      pointer: { generation: 'bbbbbbbbbbbb', manifest: 'release-manifest.bbbbbbbbbbbb.json' },
      manifests: { 'release-manifest.bbbbbbbbbbbb.json': { generation: 'bbbbbbbbbbbb', channels: LIVE } },
    });
    // A path nothing has requested before is always a CDN miss; a query string is not,
    // because GitHub Pages strips it from the cache key. Both requests still carry a unique
    // query because that is what defeats the BROWSER cache, which is the unbounded half.
    expect(seen.requested[0]).toMatch(/^release-index\.json\?cb=/);
    expect(seen.requested[1]).toMatch(/^release-manifest\.bbbbbbbbbbbb\.json\?cb=/);
  });

  it('asks once and stops when the page it is running from is already current', async () => {
    const seen = await reconcileChooser({
      baked: BAKED,
      generation: 'bbbbbbbbbbbb',
      pointer: { generation: 'bbbbbbbbbbbb', manifest: 'release-manifest.bbbbbbbbbbbb.json' },
      manifests: { 'release-manifest.bbbbbbbbbbbb.json': { generation: 'bbbbbbbbbbbb', channels: LIVE } },
    });
    expect(seen.requested).toHaveLength(1);
    expect(seen.cards).toEqual(['pass81=PASS 81', 'experimental=PASS 73']);
    expect(seen.status).toBe('');
  });

  it('keeps the cards it already drew when the freshness check cannot complete', async () => {
    // Offline, a blocked fetch, a 404 on an older channel tree - none of them may empty the
    // chooser. A blank build list is a worse failure than a stale one.
    for (const pointer of [undefined, null, {}, { generation: 'bbbbbbbbbbbb' }, 'not json']) {
      const seen = await reconcileChooser({ baked: BAKED, generation: 'aaaaaaaaaaaa', pointer });
      expect(seen.cards).toEqual(['pass81=PASS 81', 'experimental=PASS 73']);
    }
  });

  it('treats the pointer as data, not as a URL to obey', async () => {
    // release-index.json is fetched content. It names a sibling file and nothing else -
    // no scheme, no host, no traversal - so a compromised or mangled pointer cannot make
    // the chooser read from somewhere the publish did not write.
    for (const manifest of [
      '//evil.test/channels.json',
      'https://evil.test/channels.json',
      '../../release-manifest.x.json',
      'release-manifest.b/../../x.json',
      'channels.json',
    ]) {
      const seen = await reconcileChooser({
        baked: BAKED,
        generation: 'aaaaaaaaaaaa',
        pointer: { generation: 'bbbbbbbbbbbb', manifest },
        manifests: { [manifest]: { generation: 'bbbbbbbbbbbb', channels: LIVE } },
      });
      expect(seen.requested).toEqual([expect.stringMatching(/^release-index\.json\?cb=/)]);
      expect(seen.cards).toEqual(['pass81=PASS 81', 'experimental=PASS 73']);
    }
  });

  it('refuses a live manifest that would leave the player with no build at all', async () => {
    for (const channels of [{}, { broken: { label: 'PASS 99', pass: 'PASS 99' } }, [], null]) {
      const seen = await reconcileChooser({
        baked: BAKED,
        generation: 'aaaaaaaaaaaa',
        pointer: { generation: 'bbbbbbbbbbbb', manifest: 'release-manifest.bbbbbbbbbbbb.json' },
        manifests: { 'release-manifest.bbbbbbbbbbbb.json': { generation: 'bbbbbbbbbbbb', channels } },
      });
      expect(seen.cards).toEqual(['pass81=PASS 81', 'experimental=PASS 73']);
    }
  });

  it('routes a link naming a pass this cached page had never heard of', async () => {
    // The owner shares .../?release=pass82 the moment it is published. The recipient's
    // browser is holding an index.html from before that pass existed, so the baked list
    // cannot resolve the key - it used to fall through to the chooser and offer the old
    // set instead, which reads as "your link is broken".
    const seen = await reconcileChooser({
      baked: BAKED,
      generation: 'aaaaaaaaaaaa',
      search: '?release=pass82',
      pointer: { generation: 'bbbbbbbbbbbb', manifest: 'release-manifest.bbbbbbbbbbbb.json' },
      manifests: { 'release-manifest.bbbbbbbbbbbb.json': { generation: 'bbbbbbbbbbbb', channels: LIVE } },
    });
    // It navigated. The cards on screen are still the stale page's, because that page is
    // on its way out - what matters is that the link resolved to the pass it named.
    expect(seen.navigated).toEqual([
      'https://example.invalid/atomic-acres-browser-arena/channels/pass82/?release=latest',
    ]);
    expect(seen.status).toBe('');
  });
});
