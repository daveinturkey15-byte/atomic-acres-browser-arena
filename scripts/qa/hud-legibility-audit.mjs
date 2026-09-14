// Objective legibility + layout audit of whatever is currently on screen.
//
// Lifted verbatim out of capture-visual-review.mjs so that the cross-browser
// matrix judges the HUD by the SAME rule the visual review does. Two copies of
// this function would have drifted the moment either one learned a new check,
// and a matrix that measured a different floor than the review would be
// evidence of nothing.
//
// Hard constraint: no imports, no closure references. It is shipped into a page
// two different ways - Playwright serializes it for page.evaluate(), and the
// cross-browser probe page imports it as a plain ES module over the dev server -
// so it must be self-contained in both.

/**
 * @returns {{ belowNinePx: Array<{ tag: string, cls: string, px: number, sample: string }>,
 *             pageOverflowX: number, devicePixelRatio: number }}
 */
export const auditLegibility = () => {
  const tooSmall = [];
  const seen = new Set();
  for (const element of document.querySelectorAll('body *')) {
    const text = (element.textContent || '').trim();
    if (!text) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const size = Number.parseFloat(style.fontSize);
    if (size > 0 && size < 9) {
      const key = `${element.tagName}.${element.className || '-'}:${size}`;
      if (!seen.has(key)) {
        seen.add(key);
        tooSmall.push({ tag: element.tagName, cls: String(element.className || '-').slice(0, 60), px: size, sample: text.slice(0, 40) });
      }
    }
  }
  const root = document.documentElement;
  return {
    belowNinePx: tooSmall,
    pageOverflowX: root.scrollWidth - root.clientWidth,
    devicePixelRatio: window.devicePixelRatio,
  };
};
