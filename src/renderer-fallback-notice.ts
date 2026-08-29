/**
 * renderer-fallback-notice.ts — player-visible state for the sticky WebGL2
 * fallback (owner 2026-08-29: "why is it still locked to 60 fps").
 *
 * The Chrome 153 Tint defence quietly routes broken browsers onto the WebGL2
 * compatibility renderer and leaves a sticky per-user-agent record so later
 * sessions skip the ~90 s of doomed WebGPU attempts. Right, and invisible:
 * the player only sees roughly half the frame rate with no explanation and
 * no way back short of DevTools. This module is the honest surface for that
 * state - a pure decision the menu renders as a banner with a RETRY button.
 */

export const RENDERER_FALLBACK_STORAGE_KEY = 'atomic-acres:renderer-fallback:v1';

export type RendererFallbackRecord = Readonly<{
  userAgent: string;
  at: string;
  reason: string;
}>;

/** Parse the sticky record; null when absent, malformed, or from another browser build. */
export function parseRendererFallbackRecord(raw: string | null, userAgent: string): RendererFallbackRecord | null {
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as Partial<RendererFallbackRecord>;
    if (typeof record.userAgent !== 'string' || record.userAgent !== userAgent) return null;
    return {
      userAgent: record.userAgent,
      at: typeof record.at === 'string' ? record.at : '',
      reason: typeof record.reason === 'string' ? record.reason : '',
    };
  } catch {
    return null;
  }
}

export type RendererFallbackNotice = Readonly<{
  show: boolean;
  message: string;
  retryLabel: string;
}>;

/**
 * The banner is shown only when BOTH are true: the sticky record matches this
 * browser build, and the session is actually running the compatibility
 * renderer (an explicit ?renderer=webgpu override means the player is already
 * retrying, and showing the banner over a WebGPU session would be a lie).
 */
export function rendererFallbackNotice(
  record: RendererFallbackRecord | null,
  activeBackend: string | null,
): RendererFallbackNotice {
  if (!record || activeBackend !== 'webgl2') {
    return { show: false, message: '', retryLabel: '' };
  }
  return {
    show: true,
    message: 'COMPATIBILITY RENDERER - WebGPU failed repeatedly in this browser build '
      + '(a known Chrome 153 driver-compiler bug), so the game switched to a slower '
      + 'renderer and frame rate is roughly halved. A browser update fixes it '
      + 'automatically; Microsoft Edge runs the fast renderer today.',
    retryLabel: 'RETRY WEBGPU',
  };
}
