import './style.css';
import { resolveRenderRuntimeRequest } from './rendering/render-runtime';

const request = resolveRenderRuntimeRequest(window.location.search);

if (request.requestedBackend === 'webgpu') {
  try {
    const { startWebGpuReview } = await import('./rendering/webgpu-review-entry');
    await startWebGpuReview(request);
  } catch (error) {
    document.documentElement.dataset.renderBackend = 'blocked';
    const app = document.querySelector<HTMLDivElement>('#app');
    if (app) {
      const message = error instanceof Error ? error.message : String(error);
      app.innerHTML = `<main id="webgpu-review-blocked"><small>PASS 64 WEBGPU / TSL</small><h1>REVIEW BLOCKED</h1><p></p></main>`;
      const paragraph = app.querySelector('p');
      if (paragraph) paragraph.textContent = message;
    }
    throw error;
  }
} else {
  await import('./legacy-main');
}
