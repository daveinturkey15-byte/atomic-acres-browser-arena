(() => {
  // The channel set arrives two ways, and BOTH are first-paint only.
  //
  //   1. inlined into index.html by the publish script (current shape), or
  //   2. from the legacy ./release-channel-config.js script tag (index.html generations
  //      cached before 2026-08-31 still ask for it, so publish keeps writing it).
  //
  // Neither is trusted as the final answer. GitHub Pages serves every root file with a
  // fixed `Cache-Control: max-age=600` and no way to override it, index.html and the
  // config were separately cached URLs, and nothing tied one generation of the two
  // together - so a browser could hold a shell from one publish and a channel list from
  // another and draw a set that never existed. Two people on the same link saw different
  // builds offered, which is the one thing numbered channels exist to prevent.
  //
  // So after first paint this file goes and ASKS, over a URL neither cache can answer
  // staleley, and redraws. See reconcile() at the bottom.
  let config = window.__ATOMIC_ACRES_RELEASE_CHANNELS__;
  if (!config) throw new Error('Release channel configuration is missing');
  const bakedGeneration = String(window.__ATOMIC_ACRES_RELEASE_GENERATION__ ?? '');

  const safePath = (path) => {
    const clean = String(path ?? '').replace(/^\/+|\/+$/g, '');
    if (!clean || clean.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Unsafe release channel path');
    return clean;
  };
  const profileKey = 'atomic-acres.player-profile.v1';
  const legacyControlKeys = {
    mouseSensitivity: 'atomic-acres-sensitivity',
    controllerSensitivity: 'atomic-acres-controller-sensitivity',
    fieldOfView: 'atomic-acres-fov',
  };
  const bounded = (value, minimum, maximum) => Number.isFinite(value) && value >= minimum && value <= maximum;
  const readCanonicalControls = () => {
    const raw = localStorage.getItem(profileKey);
    if (!raw || raw.length > 131072) return null;
    const profile = JSON.parse(raw);
    const controls = profile?.controls;
    if (profile?.schemaVersion !== 1 || !Number.isSafeInteger(profile?.revision) || profile.revision < 1
      || controls?.schemaVersion !== 1
      || !bounded(controls.mouseSensitivity, .6, 2)
      || !bounded(controls.controllerSensitivity, .5, 1.8)
      || !bounded(controls.fieldOfView, 70, 100)) return null;
    return { raw, profile, controls };
  };
  const bridgeControls = (destination) => {
    try {
      const canonical = readCanonicalControls();
      if (!canonical) return;
      if (destination === 'stable') {
        for (const [field, key] of Object.entries(legacyControlKeys)) localStorage.setItem(key, String(canonical.controls[field]));
        return;
      }
      const projected = {
        schemaVersion: 1,
        mouseSensitivity: Number(localStorage.getItem(legacyControlKeys.mouseSensitivity)),
        controllerSensitivity: Number(localStorage.getItem(legacyControlKeys.controllerSensitivity)),
        fieldOfView: Number(localStorage.getItem(legacyControlKeys.fieldOfView)),
      };
      const valid = bounded(projected.mouseSensitivity, .6, 2)
        && bounded(projected.controllerSensitivity, .5, 1.8)
        && bounded(projected.fieldOfView, 70, 100);
      if (valid && Object.keys(legacyControlKeys).some((field) => projected[field] !== canonical.controls[field])) {
        const next = { ...canonical.profile, revision: canonical.profile.revision + 1, controls: projected };
        localStorage.setItem(profileKey, JSON.stringify(next));
      }
      for (const key of Object.values(legacyControlKeys)) localStorage.removeItem(key);
    } catch {
      // Storage-disabled contexts still retain direct channel navigation.
    }
  };
  const route = (key) => {
    const channel = config[key];
    bridgeControls(key === 'stable' ? 'stable' : 'latest');
    const target = new URL(`./${safePath(channel.path)}/`, document.baseURI);
    const source = new URL(window.location.href);
    for (const [name, value] of source.searchParams) if (name !== 'release') target.searchParams.append(name, value);
    target.searchParams.set('release', 'latest');
    window.location.assign(target);
    return true;
  };

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('release')?.trim().toLowerCase();
  // Returns truthy when it navigated. Called once now against the baked channel list, and
  // again after reconcile() if the baked list was too old to know the key that was asked
  // for - which is exactly what happens when the owner shares a link to a pass that was
  // published after the recipient's browser last cached index.html.
  const routeRequested = () => {
    if (params.get('room')?.trim() || requested === 'latest' || requested === 'normal') return route('experimental');
    if (requested === 'stable' || requested === 'rollback') return route('previous');
    if (requested === 'previous' || requested === 'pass72') return route('previous');
    if (requested === 'pass70') return route('retained');
    if (requested === 'pass69') return route('historical');
    if (requested === 'experimental') return route('experimental');
    // Any channel the config knows is addressable by its own key, so a newly published pass
    // is linkable the moment it exists. This sits AFTER the legacy remaps above so they keep
    // winning - notably ?release=stable, which has always meant PASS 72, not the stable key.
    if (requested && Object.prototype.hasOwnProperty.call(config, requested) && config[requested]?.path) {
      return route(requested);
    }
    return false;
  };
  if (routeRequested()) return;

  const options = document.querySelector('#release-channel-options');
  const hardRefreshButton = document.querySelector('#release-hard-refresh');
  const status = document.querySelector('#release-status');
  const say = (message) => { if (status) status.textContent = message; };
  hardRefreshButton?.addEventListener('click', async () => {
    hardRefreshButton.disabled = true;
    say('Clearing cached game files…');
    try {
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((key) => window.caches.delete(key)));
      }
    } finally {
      const url = new URL(window.location.href);
      url.searchParams.set('cachebust', String(Date.now()));
      window.location.replace(url.toString());
    }
  });
  // The internal channel pass code (e.g. PASS 66) is not player-facing branding;
  // show the public version from the label (e.g. v67.1) on the live card.
  const displayPass = (key, channel) => {
    if (key !== 'experimental') return channel.pass;
    const version = String(channel.label || '').match(/v\d+(?:\.\d+)+/);
    return version ? `PASS ${version[0].slice(1)}` : channel.pass;
  };
  // Every channel the config carries gets a card, newest pass first.
  //
  // This deliberately has no hardcoded key list any more. The previous one named exactly
  // four keys, so PASS 80 and PASS 63 were published, sat in this very config, and were
  // never drawn - the owner could deploy a build, open the site, be offered PASS 73 and
  // reasonably conclude nothing had changed. A list of keys is something a person has to
  // remember to update on every release; the config is the thing that already knows.
  const passNumber = (channel) => {
    const match = String(channel?.pass ?? '').match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : Number.NEGATIVE_INFINITY;
  };
  const RETAINED_BADGES = {
    previous: 'PREVIOUS LIVE',
    retained: 'RETAINED LIVE',
    historical: 'RETAINED STABLE',
    stable: 'STABLE WEBGL',
    rollback: 'STABLE WEBGL',
  };

  // Redrawable on purpose: reconcile() calls this a second time with the authoritative
  // list. `config` is the parameter name so the ordering below reads against whichever
  // list it was handed rather than closing over a stale one.
  const drawCards = (config) => {
    if (!options) return [];
    // replaceChildren is feature-detected so a partially-rendered or stubbed container
    // (the unit test drives this file with a bare { append }) still works.
    if (typeof options.replaceChildren === 'function') options.replaceChildren();
    // Sort by pass number so a new channel lands in the right place without being told
    // where. Ties fall back to the key so the order is stable rather than hash-dependent.
    const orderedKeys = Object.keys(config)
      .filter((key) => config[key]?.path)
      .sort((a, b) => passNumber(config[b]) - passNumber(config[a]) || a.localeCompare(b));

    for (const key of orderedKeys) {
      const channel = config[key];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `release-channel-option ${key}`;
      button.dataset.releaseChoice = key;
      // Badge vocabulary is unchanged: a retained channel names what it is retained as, and
      // anything else is LIVE or RELEASE CANDIDATE off its own deploymentState. A newly
      // published pass has no deploymentState, so it reads RELEASE CANDIDATE - which is
      // exactly what it is until the owner has played it.
      const badge = RETAINED_BADGES[key]
        ?? (channel.deploymentState === 'live' ? 'LIVE' : 'RELEASE CANDIDATE');
      // Built as text nodes rather than innerHTML: these three fields are the only place a
      // channel's authored strings reach the page, and a card is not worth an HTML sink.
      const eyebrow = document.createElement('small');
      eyebrow.textContent = `${displayPass(key, channel)} · ${badge}`;
      const title = document.createElement('strong');
      title.textContent = String(channel.label ?? '');
      const blurb = document.createElement('span');
      blurb.textContent = String(channel.description ?? '');
      button.append(eyebrow, title, blurb);
      button.addEventListener('click', () => route(key));
      options.append(button);
    }
    return orderedKeys;
  };

  drawCards(config);

  // ---------------------------------------------------------------------------------
  // Freshness. Measured on the live host 2026-08-31, not assumed:
  //
  //   * every root file is served `Cache-Control: max-age=600`, and GitHub Pages offers
  //     no way to change that (no _headers, no per-file directives);
  //   * a request-side `Cache-Control: no-cache` does NOT defeat the Fastly edge - the
  //     same object came back with Age: 109;
  //   * the query string is STRIPPED from the edge cache key - `?ts=<random>` returned
  //     Age: 82, i.e. cache-busting by query does nothing at the CDN;
  //   * a path never requested before is always an edge miss (Age: 0).
  //
  // So the only primitive that is reliably fresh on this host is a NEW PATH. Publish
  // writes the channel list to release-manifest.<generation>.json - a path that exists
  // only for that generation - and a small stable pointer, release-index.json, naming it.
  // A no-store fetch with a unique query defeats the BROWSER cache (that is the dimension
  // that was unbounded: two browsers, two profiles, two arbitrary generations); the fresh
  // manifest path defeats the EDGE. The pointer itself can be up to 600 s behind, which is
  // the one bounded window that remains, and it closes on its own.
  const freshJson = async (path) => {
    const url = new URL(path, document.baseURI);
    url.searchParams.set('cb', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
    return response.json();
  };

  const reconcile = async () => {
    if (typeof fetch !== 'function') return;
    const pointer = await freshJson('./release-index.json');
    const generation = String(pointer?.generation ?? '');
    if (!generation || generation === bakedGeneration) return;
    const manifestName = String(pointer?.manifest ?? '');
    // Only ever a sibling file of the known shape - the pointer is data, not a URL to obey.
    if (!/^release-manifest\.[A-Za-z0-9_-]+\.json$/.test(manifestName)) return;
    const manifest = await freshJson(`./${manifestName}`);
    const channels = manifest?.channels;
    if (!channels || typeof channels !== 'object' || Array.isArray(channels)) return;
    const usable = Object.keys(channels).filter((key) => channels[key]?.path);
    if (!usable.length) return;
    config = channels;
    // The link may have named a pass this page was too old to know. Now it knows.
    if (requested && routeRequested()) return;
    const drawn = drawCards(config);
    say(`This page was cached from an earlier publish. Updated to the current ${drawn.length} build${drawn.length === 1 ? '' : 's'}.`);
  };

  // Failure is silent by design: offline, a blocked fetch or a 404 leaves the baked cards
  // on screen rather than emptying the chooser. The manual HARD RESET button stays as a
  // last resort, but nobody has to find it any more.
  reconcile().catch(() => {});
  // Returning from the bfcache re-runs nothing, so re-ask there too.
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pageshow', (event) => { if (event?.persisted) reconcile().catch(() => {}); });
  }
})();
