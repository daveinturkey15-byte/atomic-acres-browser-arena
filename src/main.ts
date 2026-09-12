import './style.css';
import { PASS66_RELEASE_IDENTITY } from './release-identity';

// Pass 66 is one playable application. Renderer selection happens at the
// gameplay composition root so WebGPU can never drift into a disconnected
// review-only scene. There is exactly one route: hardware WebGPU, failing
// closed during bootstrap.
//
// PASS 87 Lane AR, item 7. Until now both this comment and the blocked screen
// below told the player to "use ?renderer=webgl2 for the explicit
// rollback-compatible renderer". That instruction stopped being true on
// 2026-08-30, when the owner retired the fallback:
// `resolveRenderRuntimeRequest` (src/rendering/render-runtime.ts) now voids
// its `search` argument and returns `{ requestedBackend: 'webgpu',
// requireWebGPU: true }` unconditionally. So the one screen a player reaches
// only when the game will not start handed them a query parameter that does
// nothing, and the player's reasonable conclusion - "I tried the documented
// workaround and it also failed" - was manufactured by us.
//
// The honest message is the one the requirement path already composes
// (src/legacy-main.ts, "This game needs WebGPU..."), so this screen says the
// same thing rather than inventing a second, weaker wording.
try {
  await import('./legacy-main');
} catch (error) {
  document.documentElement.dataset.renderBackend = 'blocked';
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app) {
    const message = error instanceof Error ? error.message : String(error);
    app.innerHTML = `<main id="webgpu-gameplay-blocked"><small>${PASS66_RELEASE_IDENTITY.pass} · ${PASS66_RELEASE_IDENTITY.label} · WEBGPU / TSL</small><h1>GAMEPLAY RENDERER BLOCKED</h1><p></p><p>This game needs WebGPU. Use a current Chrome, Edge or Firefox (Windows), or check that graphics acceleration is enabled in your browser settings. There is no WebGL2 fallback.</p></main>`;
    const paragraph = app.querySelector('p');
    if (paragraph) paragraph.textContent = message;
  }
  throw error;
}
