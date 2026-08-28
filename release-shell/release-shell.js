(() => {
  const config = window.__ATOMIC_ACRES_RELEASE_CHANNELS__;
  if (!config) throw new Error('Release channel configuration is missing');

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
  };

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('release')?.trim().toLowerCase();
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

  const options = document.querySelector('#release-channel-options');
  const hardRefreshButton = document.querySelector('#release-hard-refresh');
  const status = document.querySelector('#release-status');
  hardRefreshButton?.addEventListener('click', async () => {
    hardRefreshButton.disabled = true;
    if (status) status.textContent = 'Clearing cached game files…';
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
})();
