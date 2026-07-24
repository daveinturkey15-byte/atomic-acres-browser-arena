(() => {
  const config = window.__ATOMIC_ACRES_RELEASE_CHANNELS__;
  if (!config) throw new Error('Release channel configuration is missing');

  const safePath = (path) => {
    const clean = String(path ?? '').replace(/^\/+|\/+$/g, '');
    if (!clean || clean.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Unsafe release channel path');
    return clean;
  };
  const route = (key) => {
    const channel = config[key];
    const target = new URL(`./${safePath(channel.path)}/`, document.baseURI);
    const source = new URL(window.location.href);
    for (const [name, value] of source.searchParams) if (name !== 'release') target.searchParams.append(name, value);
    target.searchParams.set('release', 'latest');
    window.location.assign(target);
  };

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('release')?.trim().toLowerCase();
  if (params.get('room')?.trim() || requested === 'latest' || requested === 'normal') return route('experimental');
  if (requested === 'stable') return route('stable');
  if (requested === 'experimental') return route('experimental');

  const options = document.querySelector('#release-channel-options');
  for (const key of ['experimental', 'stable']) {
    const channel = config[key];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `release-channel-option ${key}`;
    button.dataset.releaseChoice = key;
    button.innerHTML = `<small>${channel.pass} · ${key === 'stable' ? 'STABLE' : 'LIVE'}</small><strong>${channel.label}</strong><span>${channel.description}</span>`;
    button.addEventListener('click', () => route(key));
    options.append(button);
  }
})();
