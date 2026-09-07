/**
 * The failure screen's technical half.
 *
 * The friendly first line already exists and is not ours: the WebGPU
 * requirement path composes it ("This game needs WebGPU. Use a current Chrome,
 * Edge or Firefox (Windows) ...") and renders it into a fixed overlay. This
 * module puts the observations BENEATH that line, in the same overlay, so the
 * player reads one screen: what the game needs, then what this browser
 * actually reported, then what to try. Nothing here rewrites or removes the
 * existing text.
 *
 * FAILURE PATH ONLY. Reached exclusively through a dynamic `import()` in a
 * catch block, and it renders nothing at all unless the error it was handed
 * carries a diagnostics report - an unrelated crash must not be dressed up as
 * a graphics diagnosis.
 */

import {
  deriveWebGpuNextSteps,
  formatWebGpuDiagnostics,
  formatWebGpuObservations,
  type WebGpuDiagnosticsReport,
} from './webgpu-adapter-diagnostics';

/** Id of the block, so a second presentation cannot duplicate it. */
export const WEBGPU_DIAGNOSTICS_ELEMENT_ID = 'webgpu-diagnostics';

/**
 * Hosts we are willing to append to, most specific first: the pre-init fatal
 * overlay owned by the requirement path, then the renderer-blocked screen. Both
 * already carry the friendly sentence.
 */
const HOST_ELEMENT_IDS: readonly string[] = ['pre-init-fatal', 'webgpu-gameplay-blocked'];

const PANEL_STYLE = 'margin:20px auto 0;max-width:min(940px,94vw);width:100%;text-align:left;';

const TEXT_STYLE = 'margin:0;padding:12px 14px;text-align:left;white-space:pre-wrap;overflow:auto;'
  + 'max-height:52vh;user-select:text;-webkit-user-select:text;border-radius:8px;'
  + 'border:1px solid rgba(244,236,226,0.28);background:rgba(0,0,0,0.35);color:#f4ece2;'
  + 'font:400 13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;';

const CAPTION_STYLE = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;'
  + 'margin:0 0 8px;text-align:left;'
  + 'font:600 13px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#f4ece2;opacity:0.85;';

const STEPS_STYLE = 'margin:12px 0 0;padding:0 0 0 22px;text-align:left;color:#f4ece2;'
  + 'font:400 14px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;';

const STEP_STYLE = 'margin:0 0 8px;';

const BUTTON_STYLE ='cursor:pointer;padding:6px 12px;border-radius:6px;border:1px solid rgba(244,236,226,0.4);'
  + 'background:rgba(244,236,226,0.08);color:#f4ece2;'
  + 'font:600 12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;';

const OVERLAY_STYLE = 'position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;'
  + 'align-items:center;justify-content:center;padding:6vh 5vw;margin:0;overflow:auto;'
  + 'background:#140f0c;color:#f4ece2;text-align:center;'
  + 'font:600 clamp(15px,2.2vw,22px)/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;';

/** Only used when no existing failure screen was found to append to. */
const STANDALONE_HEADLINE = 'This game needs WebGPU, and this browser could not provide a GPU adapter.';

function resolveHost(doc: Document): HTMLElement {
  for (const id of HOST_ELEMENT_IDS) {
    const existing = doc.getElementById(id);
    if (existing) return existing;
  }
  const overlay = doc.createElement('div');
  overlay.id = 'webgpu-diagnostics-fatal';
  overlay.setAttribute('role', 'alert');
  overlay.style.cssText = OVERLAY_STYLE;
  const headline = doc.createElement('p');
  headline.style.cssText = 'margin:0 0 4px;max-width:min(940px,94vw);';
  headline.textContent = STANDALONE_HEADLINE;
  overlay.appendChild(headline);
  doc.body.appendChild(overlay);
  return overlay;
}

function copyHandler(doc: Document, text: string, button: HTMLElement): () => void {
  return () => {
    // Best effort, in this order: the clipboard, then a selection the player
    // can copy by hand. Either way the text is already on screen.
    let copied = false;
    try {
      const view = doc.defaultView as (Window & { navigator?: Navigator }) | null;
      const clipboard = view?.navigator?.clipboard;
      if (clipboard && typeof clipboard.writeText === 'function') {
        copied = true;
        void clipboard.writeText(text).catch(() => {
          button.textContent = 'SELECT THE TEXT AND PRESS CTRL+C';
        });
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      try {
        const view = doc.defaultView;
        const selection = view?.getSelection();
        const node = doc.getElementById(`${WEBGPU_DIAGNOSTICS_ELEMENT_ID}-text`);
        if (selection && node) {
          const range = doc.createRange();
          range.selectNodeContents(node);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } catch {
        // Nothing left to try; the text is visible and selectable anyway.
      }
    }
    button.textContent = copied ? 'COPIED' : 'SELECTED - PRESS CTRL+C';
  };
}

/**
 * Appends the observations and the derived next steps beneath whichever failure
 * screen is already on the page. Returns false when there was nothing to do:
 * already presented, or no document to present into.
 */
export function presentWebGpuDiagnostics(
  report: WebGpuDiagnosticsReport,
  doc: Document,
): boolean {
  if (!doc || typeof doc.createElement !== 'function' || !doc.body) return false;
  if (doc.getElementById(WEBGPU_DIAGNOSTICS_ELEMENT_ID)) return false;
  const text = formatWebGpuDiagnostics(report);
  const host = resolveHost(doc);
  // The pre-init overlay is a centring flex row; a block appended into it would
  // sit BESIDE the sentence instead of under it.
  host.style.flexDirection = 'column';
  host.style.overflow = 'auto';

  const panel = doc.createElement('section');
  panel.id = WEBGPU_DIAGNOSTICS_ELEMENT_ID;
  panel.style.cssText = PANEL_STYLE;

  const caption = doc.createElement('div');
  caption.style.cssText = CAPTION_STYLE;
  const captionText = doc.createElement('span');
  captionText.textContent = 'WHAT THIS BROWSER REPORTED - select and send this to whoever is helping';
  const button = doc.createElement('button');
  button.type = 'button';
  button.style.cssText = BUTTON_STYLE;
  button.textContent = 'COPY';
  button.addEventListener('click', copyHandler(doc, text, button));
  caption.appendChild(captionText);
  caption.appendChild(button);

  const body = doc.createElement('pre');
  body.id = `${WEBGPU_DIAGNOSTICS_ELEMENT_ID}-text`;
  body.style.cssText = TEXT_STYLE;
  // Observations only. The advice below is the actionable half and must not be
  // the half that ends up scrolled out of sight inside this panel; the copy
  // button still hands over both, in one block.
  body.textContent = formatWebGpuObservations(report);

  panel.appendChild(caption);
  panel.appendChild(body);

  const steps = deriveWebGpuNextSteps(report);
  if (steps.length > 0) {
    const heading = doc.createElement('div');
    heading.style.cssText = CAPTION_STYLE.replace('margin:0 0 8px', 'margin:16px 0 0');
    heading.textContent = 'WHAT TO TRY - from those observations, nothing else';
    panel.appendChild(heading);
    const list = doc.createElement('ol');
    list.id = `${WEBGPU_DIAGNOSTICS_ELEMENT_ID}-steps`;
    list.style.cssText = STEPS_STYLE;
    for (const step of steps) {
      const item = doc.createElement('li');
      item.style.cssText = STEP_STYLE;
      item.textContent = step;
      list.appendChild(item);
    }
    panel.appendChild(list);
  }

  host.appendChild(panel);
  return true;
}
