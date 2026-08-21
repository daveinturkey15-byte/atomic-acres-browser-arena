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
  if (requested === 'stable' || requested === 'rollback') return route('stable');
  if (requested === 'previous' || requested === 'pass72') return route('previous');
  if (requested === 'pass70') return route('retained');
  if (requested === 'pass69') return route('historical');
  if (requested === 'experimental') return route('experimental');

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
  for (const key of ['experimental', 'previous', 'retained', 'historical', 'stable']) {
    const channel = config[key];
    if (!channel) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `release-channel-option ${key}`;
    button.dataset.releaseChoice = key;
    const badge = key === 'stable'
      ? 'STABLE WEBGL'
      : key === 'previous'
        ? 'PREVIOUS LIVE'
        : key === 'retained'
          ? 'RETAINED LIVE'
          : key === 'historical'
            ? 'RETAINED STABLE'
            : channel.deploymentState === 'live' ? 'LIVE' : 'RELEASE CANDIDATE';
    button.innerHTML = `<small>${displayPass(key, channel)} · ${badge}</small><strong>${channel.label}</strong><span>${channel.description}</span>`;
    button.addEventListener('click', () => route(key));
    options.append(button);
  }
})();
