/**
 * HF-405 - the compact-optic ADS overlay.
 *
 * The owner asked for "a better scope 1.5x on the crossbow". The
 * magnification half of that was already fixed in ads-sight-profile.ts; this
 * is the half that makes the weapon LOOK like it has an optic, and it is
 * deliberately not the sniper's treatment. The sniper hides the viewmodel and
 * blacks out the frame, which is right at 3x and wrong at 1.5x on a
 * close-to-mid range launcher. Here the crossbow stays in shot, the periphery
 * stays readable, and the overlay only adds what the authored geometry cannot
 * carry on its own: housing framing, a lit reticle and the magnification
 * legend that answers "does this scope do anything".
 *
 * OWNERSHIP. This module owns its element and its stylesheet outright,
 * including creating the element on first use. legacy-main.ts feeds it one
 * pure state object per frame and owns nothing else about it.
 */
import './compact-optic-sight.css';
import { adsSightProfile, type CompactOpticSightPicture } from '../ads-sight-profile';

export const COMPACT_OPTIC_OVERLAY_ID = 'compact-optic';
export const COMPACT_OPTIC_ACTIVE_CLASS = 'compact-optic-active';

/**
 * Creates the overlay under `hudRoot` on first call and returns it thereafter.
 * The markup is fixed; only the CSS custom properties and the legend change.
 */
export function ensureCompactOpticOverlay(hudRoot: HTMLElement): HTMLElement {
  const existing = hudRoot.querySelector<HTMLElement>(`#${COMPACT_OPTIC_OVERLAY_ID}`);
  if (existing) return existing;
  const overlay = hudRoot.ownerDocument.createElement('div');
  overlay.id = COMPACT_OPTIC_OVERLAY_ID;
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = '<div class="compact-optic-housing"></div>'
    + '<div class="compact-optic-bloom"></div>'
    + '<div class="compact-optic-glass"></div>'
    + '<div class="compact-optic-reticle"><i></i><b></b><span></span><em></em></div>'
    + '<small></small>';
  hudRoot.append(overlay);
  return overlay;
}

/**
 * Applies one frame of compact-optic state. Called every frame, so every write
 * is guarded: an unchanged frame touches no DOM at all.
 */
export function applyCompactOpticSightPicture(
  hudRoot: HTMLElement,
  picture: CompactOpticSightPicture,
): HTMLElement {
  const overlay = ensureCompactOpticOverlay(hudRoot);
  if (overlay.hidden !== !picture.active) overlay.hidden = !picture.active;
  hudRoot.classList.toggle(COMPACT_OPTIC_ACTIVE_CLASS, picture.active);
  if (!picture.active) return overlay;

  // Quantised: the blend drives an opacity and a scale, and a hundredth of
  // either is below perception. Writing the raw float every frame would
  // invalidate style on frames that cannot look different.
  const blend = (Math.round(picture.glassBlend * 100) / 100).toFixed(2);
  if (overlay.dataset.blend !== blend) {
    overlay.dataset.blend = blend;
    overlay.style.setProperty('--compact-optic-blend', blend);
  }
  if (picture.weapon !== null && overlay.dataset.weapon !== picture.weapon) {
    overlay.dataset.weapon = picture.weapon;
    overlay.style.setProperty('--compact-optic-color', adsSightProfile(picture.weapon).color);
  }
  const legend = overlay.querySelector('small');
  if (legend && picture.label !== null && legend.textContent !== picture.label) legend.textContent = picture.label;
  return overlay;
}
