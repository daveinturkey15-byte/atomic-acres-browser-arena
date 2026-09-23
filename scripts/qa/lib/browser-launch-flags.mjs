// The one description of how a browser this repo launches is allowed to appear
// on the owner's desktop.
//
// Owner, 2026-08-31, verbatim: "is there a way to stop all these chrome etc
// sessions popping up on my screen, its good you turned the audio off but it
// interupts my PC use alot". He works at dave-gaming-pc while QA runs. A QA
// browser that takes the foreground, covers his windows, or steals his keyboard
// is a defect in the harness, not a cost of doing business.
//
// There are exactly two acceptable presentations, in preference order:
//
//   1. HEADLESS. A headless browser cannot appear at all, so it is strictly
//      better than a hidden one. Measured on this machine 2026-08-31: headless
//      Chrome launched with `channel: 'chrome'` acquires a real WebGPU adapter
//      AND device (nvidia / blackwell), renders a full 1280x720 frame, and
//      paces requestAnimationFrame at 60.4 Hz. The historical reason these
//      scripts were headed - "headless cannot do WebGPU" - no longer holds.
//
//   2. HEADED, PARKED OFF-SCREEN at -32000,-32000. For the lanes that genuinely
//      need a composited, focusable window: pointer lock, real input delivery,
//      focus-dependent behaviour.
//
// Both presentations always mute.
//
// THE OFF-SCREEN TRAP (read this before moving a measurement lane):
// a window parked at -32000,-32000 can stop being composited, and an
// uncomposited window's requestAnimationFrame FREE-RUNS instead of tracking
// vsync. Naive fps sampling in that state reports a number that means nothing -
// usually a flatteringly high one. So a lane that measures frame pacing or
// presentation must NOT be quietly parked off-screen. Make it headless and
// count presented frames, or leave it on-screen and declare it. See
// browser-visibility-contract.test.mjs, which refuses to let a measurement lane
// be parked off-screen without a written reason.

/** Every browser this repo launches stays silent while the owner is at the PC. */
export const MUTE_AUDIO = '--mute-audio';

/**
 * Far enough off the virtual desktop that no monitor arrangement can show it.
 * Chromium clamps a window to the nearest display only when it is asked to
 * restore, which QA never does.
 */
export const OFFSCREEN_POSITION = '--window-position=-32000,-32000';

/** Large enough that layout matches a real desktop; the page viewport still wins. */
export const DEFAULT_OFFSCREEN_WINDOW_SIZE = '--window-size=1600,1000';

/** Chromium flags for a lane that does not need a window at all. */
export const SILENT_ARGS = Object.freeze([MUTE_AUDIO]);

/** Chromium flags for a lane that needs a real window the owner must never see. */
export const OFFSCREEN_ARGS = Object.freeze([
  MUTE_AUDIO,
  OFFSCREEN_POSITION,
  DEFAULT_OFFSCREEN_WINDOW_SIZE,
]);

/**
 * Build the presentation flags for a launch.
 *
 * @param {object} [options]
 * @param {boolean} [options.headless] true for a lane that needs no window.
 * @param {[number, number]} [options.windowSize] override the off-screen size.
 * @param {string[]} [options.extra] lane-specific flags appended after these.
 * @returns {string[]}
 */
export function presentationArgs({ headless = true, windowSize, extra = [] } = {}) {
  if (headless) return [MUTE_AUDIO, ...extra];
  const size = windowSize
    ? `--window-size=${windowSize[0]},${windowSize[1]}`
    : DEFAULT_OFFSCREEN_WINDOW_SIZE;
  return [MUTE_AUDIO, OFFSCREEN_POSITION, size, ...extra];
}

/**
 * Firefox has no --window-position, so an off-screen headed Firefox is not
 * available. Firefox lanes must be headless; this exists so a caller asking for
 * the wrong thing fails loudly instead of silently showing a window.
 */
export function firefoxPresentationArgs({ headless = true } = {}) {
  if (!headless) {
    throw new Error(
      'Firefox cannot be parked off-screen (-headless is the only hidden presentation). '
      + 'Run this lane headless, or declare it in browser-visibility-contract.test.mjs.',
    );
  }
  return [];
}
