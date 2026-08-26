import { OPERATOR_SKIN_CATALOG, operatorSkinPalette } from '../operator-skin-catalog';

/**
 * HF-366 - the 2D half of "Should be a 2d and 3d preview".
 *
 * What the owner actually saw: three authored archetype renders that are all
 * the same dark grey figure on the same dark grey backdrop (they differ by a
 * few accessory polygons and nothing else at card size), plus a typographic
 * STANDARD/ISSUE emblem where the standard operator's render should be. Four
 * cards, none of which tells you what you look like - "they all looked greyed
 * out" is a precise description of that art.
 *
 * These portraits are procedural, drawn from the SAME palette that tints the
 * first-person arms, so the card and the arms agree by construction. Every
 * archetype gets its own silhouette furniture (raised goggles, spine ridge,
 * sealed rebreather, comms boom) and its own high-contrast colour block, so the
 * four cards are separable at a glance and at card size.
 *
 * Inline SVG rather than an image file on purpose: the art is derived from the
 * palette, so it cannot drift out of sync with the arms, it needs no build step
 * and no bytes over the wire, and it carries its own colours - the operator
 * panel's stylesheet is owned by another lane and must not be edited here.
 */

const PORTRAIT_VIEWBOX = Object.freeze({ width: 168, height: 126 });

function hex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/**
 * Per-archetype silhouette furniture. Drawn over the shared bust so the shapes
 * read as the same operator wearing different kit, which is what the skins are.
 */
function archetypeFurniture(id: string, palette: ReturnType<typeof operatorSkinPalette>): string {
  const trim = hex(palette.card.trim);
  const webbing = hex(palette.card.webbing);
  const visor = hex(palette.card.visor);
  if (id === 'explorer') {
    return [
      // Goggles pushed up onto the helmet, and a rolled map case on the shoulder.
      `<rect x="63" y="24" width="42" height="7" rx="3.5" fill="${webbing}"/>`,
      `<circle cx="73" cy="27.5" r="5" fill="${visor}" opacity="0.9"/>`,
      `<circle cx="95" cy="27.5" r="5" fill="${visor}" opacity="0.9"/>`,
      `<rect x="44" y="62" width="30" height="9" rx="4.5" fill="${trim}" opacity="0.9" transform="rotate(-24 59 66)"/>`,
    ].join('');
  }
  if (id === 'symbiote') {
    return [
      // Grafted spine ridge breaking the shoulder line, and chest plates.
      `<path d="M84 30 L92 22 L100 32 L108 24 L114 38" fill="none" stroke="${trim}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<path d="M54 30 L46 22 L38 32 L30 24 L24 38" fill="none" stroke="${trim}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<rect x="58" y="70" width="52" height="12" rx="3" fill="${webbing}"/>`,
      `<rect x="62" y="86" width="44" height="10" rx="3" fill="${webbing}"/>`,
    ].join('');
  }
  if (id === 'navalops') {
    return [
      // Sealed hood with a single wide lens and a rebreather block.
      `<rect x="60" y="22" width="48" height="20" rx="9" fill="${webbing}"/>`,
      `<rect x="66" y="28" width="36" height="9" rx="4.5" fill="${visor}"/>`,
      `<rect x="72" y="48" width="24" height="14" rx="4" fill="${trim}" opacity="0.9"/>`,
      `<path d="M84 62 L84 74" stroke="${trim}" stroke-width="3" stroke-linecap="round"/>`,
    ].join('');
  }
  return [
    // Standard issue: plain helmet band, comms boom, chest rig.
    `<rect x="60" y="26" width="48" height="6" rx="3" fill="${trim}"/>`,
    `<path d="M62 40 Q52 46 54 56" fill="none" stroke="${trim}" stroke-width="3" stroke-linecap="round"/>`,
    `<circle cx="54" cy="57" r="3.5" fill="${trim}"/>`,
    `<rect x="60" y="72" width="48" height="11" rx="3" fill="${webbing}"/>`,
  ].join('');
}

/**
 * One skin portrait as inline SVG. `idSuffix` keeps gradient ids unique when
 * several portraits share a document.
 */
export function operatorSkinPortraitSvg(skinId: string, idSuffix = skinId): string {
  const palette = operatorSkinPalette(skinId);
  const card = palette.card;
  const gradient = `osp-bg-${idSuffix}`;
  return [
    `<svg class="operator-skin-portrait" viewBox="0 0 ${PORTRAIT_VIEWBOX.width} ${PORTRAIT_VIEWBOX.height}"`,
    ' preserveAspectRatio="xMidYMid slice" role="img" focusable="false" aria-hidden="true"',
    ' style="display:block;width:100%;height:100%">',
    `<defs><linearGradient id="${gradient}" x1="0" y1="0" x2="0.35" y2="1">`,
    `<stop offset="0" stop-color="${hex(card.backdropTop)}"/>`,
    `<stop offset="1" stop-color="${hex(card.backdropBottom)}"/>`,
    '</linearGradient></defs>',
    `<rect width="${PORTRAIT_VIEWBOX.width}" height="${PORTRAIT_VIEWBOX.height}" fill="url(#${gradient})"/>`,
    // Floor pool so the figure sits in space rather than floating on flat ink.
    `<ellipse cx="84" cy="122" rx="58" ry="9" fill="${hex(card.trim)}" opacity="0.22"/>`,
    // Torso and shoulders.
    `<path d="M84 44 C102 44 116 54 120 70 L124 126 L44 126 L48 70 C52 54 66 44 84 44 Z" fill="${hex(card.torso)}"/>`,
    // Neck and jaw so the helmet is not a floating block.
    `<rect x="76" y="38" width="16" height="12" rx="5" fill="${hex(card.skin)}"/>`,
    // Helmet.
    `<path d="M60 40 L60 30 C60 20 70 14 84 14 C98 14 108 20 108 30 L108 40 Z" fill="${hex(card.webbing)}"/>`,
    // Visor band - the single brightest element, so each card has a colour anchor.
    `<rect x="63" y="32" width="42" height="10" rx="5" fill="${hex(card.visor)}"/>`,
    archetypeFurniture(skinId, palette),
    // The FIRST-PERSON ARM tints, drawn as the operator's own forearms. This is
    // the literal answer to "the arms should look diff too?" - what you see
    // here is the colour your own arms take in the viewmodel.
    `<path d="M48 74 C34 84 28 100 30 126 L58 126 C56 104 58 92 64 84 Z" fill="${hex(palette.arm.sleeve)}"/>`,
    `<path d="M120 74 C134 84 140 100 138 126 L110 126 C112 104 110 92 104 84 Z" fill="${hex(palette.arm.sleeve)}"/>`,
    `<rect x="28" y="112" width="30" height="8" rx="4" fill="${hex(palette.arm.glove)}"/>`,
    `<rect x="110" y="112" width="30" height="8" rx="4" fill="${hex(palette.arm.glove)}"/>`,
    `<rect x="30" y="106" width="26" height="4" rx="2" fill="${hex(palette.arm.accent)}"/>`,
    `<rect x="112" y="106" width="26" height="4" rx="2" fill="${hex(palette.arm.accent)}"/>`,
    '</svg>',
  ].join('');
}

/** The four palette chips shown under a portrait, as their own markup. */
export function operatorSkinSwatchMarkup(skinId: string): string {
  const palette = operatorSkinPalette(skinId);
  const chips = [palette.card.torso, palette.card.trim, palette.arm.sleeve, palette.arm.accent];
  const dots = chips
    .map((value) => `<i style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${hex(value)};box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)" aria-hidden="true"></i>`)
    .join('');
  return `<span class="operator-skin-swatches" aria-hidden="true" style="display:flex;gap:4px;align-items:center">${dots}<b style="font-size:10px;letter-spacing:.14em;opacity:.72">${palette.card.materialLabel}</b></span>`;
}

/**
 * Guard surface for the "never render a placeholder where a real skin exists"
 * test: every selectable skin must produce a portrait carrying its own palette,
 * and no two selectable skins may produce the same portrait.
 */
export function operatorSkinPortraitAudit(): Readonly<{
  skins: readonly string[];
  distinctPortraits: number;
  missing: readonly string[];
}> {
  const skins = OPERATOR_SKIN_CATALOG.definitions
    .filter((definition) => definition.availability === 'selectable')
    .map((definition) => definition.id);
  const portraits = skins.map((id) => operatorSkinPortraitSvg(id));
  return Object.freeze({
    skins: Object.freeze(skins),
    distinctPortraits: new Set(portraits).size,
    missing: Object.freeze(skins.filter((id, index) => !portraits[index]!.includes(
      `#${operatorSkinPalette(id).card.visor.toString(16).padStart(6, '0')}`,
    ))),
  });
}
