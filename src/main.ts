import './style.css';
import { PASS66_RELEASE_IDENTITY } from './release-identity';

// Pass 66 is one playable application. Renderer selection happens at the
// gameplay composition root so WebGPU can never drift into a disconnected
// review-only scene. `renderer=webgl2` is the explicit rollback/compatibility
// route; the normal route is hardware WebGPU and fails closed during bootstrap.
try {
  await import('./legacy-main');
} catch (error) {
  document.documentElement.dataset.renderBackend = 'blocked';
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app) {
    const message = error instanceof Error ? error.message : String(error);
    app.innerHTML = `<main id="webgpu-gameplay-blocked"><small>${PASS66_RELEASE_IDENTITY.pass} · ${PASS66_RELEASE_IDENTITY.label} · WEBGPU / TSL</small><h1>GAMEPLAY RENDERER BLOCKED</h1><p></p><p>Use <code>?renderer=webgl2</code> only for the explicit rollback-compatible renderer.</p></main>`;
    const paragraph = app.querySelector('p');
    if (paragraph) paragraph.textContent = message;
  }
  throw error;
}
