/** Keep the original walkable Map 3 available alongside the numbered source lab. */
async function boot(): Promise<void> {
  if (new URLSearchParams(location.search).get('lab') !== 'techniques') {
    await import('./main');
    return;
  }
  await import('./technique-lab/lab.css');
  const { mountTechniqueLab } = await import('./technique-lab/runtime');
  document.getElementById('status')?.remove();
  document.getElementById('hud')?.remove();
  document.title = 'Atomic Acres · Skills Lab';
  const container = document.createElement('main');
  container.style.height = '100%';
  document.body.append(container);
  const handle = await mountTechniqueLab(container);
  window.addEventListener('pagehide', () => handle.dispose(), { once: true });
}

void boot().catch((error: unknown) => {
  const status = document.getElementById('status') ?? document.body.appendChild(document.createElement('p'));
  status.textContent = `Showcase could not start: ${error instanceof Error ? error.message : String(error)}`;
});
