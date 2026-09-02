/**
 * HF-418 — the RTX explainer. The one place the letters RTX appear in the
 * player-facing build, and it is deliberately NOT a renderer preset.
 *
 * WHY THIS EXISTS.
 * Owner, 2026-09-02 ~17:50: "Is RTX above or below max, and is it just based
 * off quality but then only works on nvidia cards?" — and at ~19:10: "for RTX
 * then make it really clear what it is when you select it, something pops up,
 * it tells you and guides you about the runtime ... RTX mode is in a different
 * runtime app or something you can download with a click or 2".
 *
 * The honest answer he was owed is two separate facts that a single menu entry
 * had been blurring:
 *
 *  1. The web build's RAY TRACED preset is genuine classic recursive ray
 *     tracing computed in shaders. It is real, it is shipped, and it touches
 *     no RT core, because no shipping browser exposes a ray-query or
 *     acceleration-structure API. It runs on any WebGPU adapter, AMD and Intel
 *     included. It is NOT "RTX", and it is NOT NVIDIA-only.
 *  2. Hardware RTX rendering needs a NATIVE runtime — Three.js/TSL on top,
 *     native Vulkan and the GPU's ray-tracing cores underneath, with the
 *     browser removed from the picture. That is a separate downloadable
 *     application, not a graphics mode. It does not exist yet for this game.
 *
 * THE RULE THIS MODULE ENFORCES: selecting the explainer changes NOTHING. It
 * does not stage a preset, does not touch the advanced controls, does not
 * reload the renderer. The select is put straight back to whatever profile was
 * already active, and then the dialog opens. A menu entry that silently
 * altered the renderer while claiming to be information would be the exact
 * defect the ledger's "no preset silently switches" clause exists to stop.
 *
 * Everything here is a pure string plus a small binder over a `<dialog>`, so
 * the copy is unit-testable without a browser, and the audit doc and this copy
 * cannot drift apart without the test noticing.
 */

/**
 * The `<select>` value for the explainer row. It is deliberately NOT a member
 * of `GraphicsPreset`: nothing in the settings pipeline can accept it, so a
 * bug that let it through would fail loudly at normalization instead of
 * quietly persisting an invented preset.
 */
export const RTX_NATIVE_RUNTIME_OPTION_VALUE = 'rtx-native-runtime-info';

/** DOM ids, exported so the binder, legacy-main and the tests agree on them. */
export const RTX_EXPLAINER_DIALOG_ID = 'rtx-native-runtime-explainer';
export const RTX_EXPLAINER_CLOSE_ID = 'rtx-native-runtime-explainer-close';

/**
 * Availability. `false` until a desktop build actually exists; the copy reads
 * "COMING SOON" and offers no download, because offering a link to a binary
 * that does not exist is the same class of untruth as a preset named after
 * hardware it does not use.
 */
export const RTX_NATIVE_RUNTIME_AVAILABLE = false;

/**
 * Where the download will live once the owner decides to ship a desktop build.
 * Held as an explicit null rather than a placeholder URL so no surface can
 * render a dead link by accident.
 */
export const RTX_NATIVE_RUNTIME_DOWNLOAD_URL: string | null = null;

export type RtxNativeRuntimeCopy = Readonly<{
  title: string;
  lead: string;
  whatItIs: readonly string[];
  whyNotInBrowser: readonly string[];
  whatYouHaveInstead: readonly string[];
  howToGetIt: string;
  reassurance: string;
}>;

/**
 * The copy. Plain, checkable statements only — no marketing, no benchmark
 * claim, no "up to". Every line here is either a fact about the WebGPU
 * specification as it stands, a fact about this build, or a statement about
 * what has not been built yet.
 */
export const RTX_NATIVE_RUNTIME_COPY: RtxNativeRuntimeCopy = Object.freeze({
  title: 'RTX NATIVE RUNTIME',
  lead: 'This is not a graphics mode. It is a separate desktop application, and it does not exist yet.',
  whatItIs: Object.freeze([
    'The same game scene, materials and lighting, running on a native renderer instead of a browser tab: JavaScript and Three.js on top, native Vulkan underneath, talking straight to your GPU driver.',
    'That is what makes your card’s dedicated ray-tracing cores reachable at all — hardware-traced reflections, shadows and bounced light over the whole scene rather than only what is on screen.',
    'It would ship as a download you install, with its own updates and its own visual baseline. It is a second product, not a fifth entry in this list.',
  ]),
  whyNotInBrowser: Object.freeze([
    'No shipping browser exposes a ray-tracing pipeline. WebGPU has no ray-query and no acceleration-structure API, so a web page cannot address ray-tracing cores on any GPU, from any vendor.',
    'This is not a setting we have switched off and not a driver flag you can turn on. There is nothing in the browser to call.',
  ]),
  whatYouHaveInstead: Object.freeze([
    'RAY TRACED, in the list above, is genuine recursive ray tracing computed in shaders: real reflections and refractions off real geometry, including geometry that is off screen.',
    'It runs on any WebGPU graphics card — AMD, Intel and NVIDIA alike. It is not NVIDIA-only and it is not using RTX hardware.',
    'It sits between QUALITY and MAX in cost: it pays for the trace by dropping 4x multisampling and screen-space reflections rather than by adding to MAX.',
  ]),
  howToGetIt: 'COMING SOON — no desktop build has been released. Nothing to download yet, and this screen will carry the link when there is.',
  reassurance: 'Closing this changes nothing. Your graphics profile has not been altered.',
});

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const list = (items: readonly string[]): string =>
  `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;

/** The dialog markup. Rendered once into the shell; hidden until selected. */
export function rtxNativeRuntimeExplainerMarkup(): string {
  const copy = RTX_NATIVE_RUNTIME_COPY;
  return `<dialog id="${RTX_EXPLAINER_DIALOG_ID}" class="rtx-runtime-dialog" aria-labelledby="${RTX_EXPLAINER_DIALOG_ID}-title">
    <article class="rtx-runtime-body">
      <header><b id="${RTX_EXPLAINER_DIALOG_ID}-title">${escapeHtml(copy.title)}</b><span>${escapeHtml(copy.howToGetIt)}</span></header>
      <p class="rtx-runtime-lead">${escapeHtml(copy.lead)}</p>
      <section><h4>WHAT IT IS</h4>${list(copy.whatItIs)}</section>
      <section><h4>WHY IT CANNOT RUN IN A BROWSER</h4>${list(copy.whyNotInBrowser)}</section>
      <section><h4>WHAT THIS BUILD GIVES YOU TODAY</h4>${list(copy.whatYouHaveInstead)}</section>
      <footer><small>${escapeHtml(copy.reassurance)}</small><button id="${RTX_EXPLAINER_CLOSE_ID}" type="button">CLOSE</button></footer>
    </article>
  </dialog>`;
}

export type RtxExplainerBinding = Readonly<{
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** How many times the explainer has been opened this session. Test hook. */
  openCount(): number;
}>;

type DialogLike = HTMLElement & {
  showModal?: () => void;
  close?: () => void;
  open?: boolean;
};

/**
 * Binds the dialog. Deliberately tolerant of a document without `<dialog>`
 * support (jsdom, and older embedded webviews): it falls back to the `hidden`
 * attribute so the copy is still reachable rather than silently absent.
 */
export function bindRtxNativeRuntimeExplainer(doc: Document): RtxExplainerBinding {
  const dialog = doc.getElementById(RTX_EXPLAINER_DIALOG_ID) as DialogLike | null;
  const closeButton = doc.getElementById(RTX_EXPLAINER_CLOSE_ID);
  let opens = 0;
  let fallbackOpen = false;

  const close = (): void => {
    fallbackOpen = false;
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open === true) dialog.close();
    dialog.hidden = true;
  };
  const open = (): void => {
    opens += 1;
    fallbackOpen = true;
    if (!dialog) return;
    dialog.hidden = false;
    if (typeof dialog.showModal === 'function' && dialog.open !== true) {
      try { dialog.showModal(); } catch { /* already open, or unsupported */ }
    }
  };

  closeButton?.addEventListener('click', close);
  dialog?.addEventListener('cancel', () => { fallbackOpen = false; });

  return Object.freeze({
    open,
    close,
    isOpen: () => (dialog && typeof dialog.open === 'boolean' ? dialog.open || fallbackOpen : fallbackOpen),
    openCount: () => opens,
  });
}
