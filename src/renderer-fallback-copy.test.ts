import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRenderRuntimeRequest } from './rendering/render-runtime';

/**
 * PASS 87 Lane AR, item 7 - the blocked screen may not offer a retired route.
 *
 * The owner retired the WebGL2 fallback on 2026-08-30 ("retire all webgl2
 * stuff, full webgpu, no fallback"). `resolveRenderRuntimeRequest` was changed
 * to void its `search` argument, so `?renderer=webgl2` has been inert ever
 * since - but `src/main.ts` kept telling the player to use it, on the one
 * screen they only ever see when the game refuses to start.
 *
 * That is worse than useless: the player follows the instruction, gets the
 * same screen, and concludes the game is broken beyond the documented
 * workaround. Nothing caught it because no test read the player-facing string
 * and no test connected it to the resolver.
 *
 * This connects them. The first assertion measures that the route really is
 * dead (behaviour, not a source scan); the second forbids any player-facing
 * copy in the blocked screen from advertising a `?renderer=` parameter while
 * that stays true. Restore the fallback and the first assertion fails,
 * telling you to re-read this test rather than silently permitting the copy.
 */
const MAIN_SOURCE = readFileSync(resolve(__dirname, 'main.ts'), 'utf8');

describe('renderer fallback copy (Lane AR item 7)', () => {
  it('measures that ?renderer=webgl2 is genuinely inert', () => {
    for (const search of ['', '?renderer=webgl2', '?renderer=webgpu', '?renderer=nonsense']) {
      expect(resolveRenderRuntimeRequest(search, true), search).toEqual({
        requestedBackend: 'webgpu',
        requireWebGPU: true,
      });
      // ...including on a browser that reports no WebGPU at all, which is
      // exactly the player who reaches the blocked screen.
      expect(resolveRenderRuntimeRequest(search, false), `${search} (no adapter)`).toEqual({
        requestedBackend: 'webgpu',
        requireWebGPU: true,
      });
    }
  });

  it('does not offer the retired route on the renderer-blocked screen', () => {
    const screen = /webgpu-gameplay-blocked[\s\S]*?<\/main>/u.exec(MAIN_SOURCE);
    expect(screen, 'src/main.ts must still compose the renderer-blocked screen').not.toBeNull();
    const copy = screen![0];
    expect(
      copy,
      'The blocked screen advertises a ?renderer= parameter that resolveRenderRuntimeRequest ignores. '
        + 'Either restore the route or tell the player the truth.',
    ).not.toMatch(/\?renderer=/u);
    // Naming the retirement is fine and wanted; OFFERING it is not.
    expect(copy).not.toMatch(/use\s+<code>/iu);
    // The honest requirement sentence, kept identical to the one the WebGPU
    // requirement path composes in src/legacy-main.ts so a player never sees
    // two different explanations of the same failure.
    expect(copy).toContain('This game needs WebGPU.');
    expect(copy).toContain('There is no WebGL2 fallback.');
  });

  it('keeps the blocked screen and the requirement path telling the same story', () => {
    const legacy = readFileSync(resolve(__dirname, 'legacy-main.ts'), 'utf8');
    expect(legacy).toContain('This game needs WebGPU. Use a current Chrome, Edge or Firefox (Windows)');
    expect(MAIN_SOURCE).toContain('Use a current Chrome, Edge or Firefox (Windows)');
  });
});
