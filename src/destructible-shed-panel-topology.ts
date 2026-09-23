import {
  SHED_PANEL_COORD_Q,
  type BallisticAperture,
  type SheetSurfaceDefinition,
} from './destructible-world';

/**
 * Presentation-only aperture hygiene.
 *
 * The authoritative state deliberately remains unchanged: this module only
 * prevents invalid/redundant Path holes from reaching ShapeGeometry. In
 * particular, three.js r185 can triangulate coincident holes to an empty
 * indexed geometry even though the source panel and aperture state are valid.
 */

const CONTAINMENT_SAMPLES = 256;

function pointInOutline(
  uQ: number,
  vQ: number,
  outline: readonly Readonly<{ uQ: number; vQ: number }>[],
): boolean {
  let inside = false;
  for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
    const current = outline[index]!;
    const prior = outline[previous]!;
    const cross = (current.uQ - prior.uQ) * (vQ - prior.vQ)
      - (current.vQ - prior.vQ) * (uQ - prior.uQ);
    const onEdge = Math.abs(cross) <= 1e-9
      && uQ >= Math.min(prior.uQ, current.uQ)
      && uQ <= Math.max(prior.uQ, current.uQ)
      && vQ >= Math.min(prior.vQ, current.vQ)
      && vQ <= Math.max(prior.vQ, current.vQ);
    if (onEdge) return true;
    const crossesRay = (current.vQ > vQ) !== (prior.vQ > vQ);
    if (crossesRay && uQ < (prior.uQ - current.uQ) * (vQ - current.vQ) / (prior.vQ - current.vQ) + current.uQ) {
      inside = !inside;
    }
  }
  return inside;
}

function centreIsInRenderedOutline(surface: SheetSurfaceDefinition, aperture: BallisticAperture): boolean {
  const { uQ, vQ } = aperture;
  if (surface.frame.outlineUVQ && surface.frame.outlineUVQ.length >= 3) {
    return pointInOutline(uQ, vQ, surface.frame.outlineUVQ);
  }
  return Math.abs(uQ) <= SHED_PANEL_COORD_Q && Math.abs(vQ) <= SHED_PANEL_COORD_Q;
}

/**
 * Conservative ellipse containment test. A hole is removed only after a
 * bounded derivative estimate proves every sampled point and the intervening
 * arcs remain inside the earlier ellipse. This intentionally prefers keeping
 * a possibly-overlapping hole over silently removing one that is not wholly
 * contained.
 */
function ellipseContains(outer: BallisticAperture, inner: BallisticAperture): boolean {
  if (outer.radiusUQ <= 0 || outer.radiusVQ <= 0 || inner.radiusUQ <= 0 || inner.radiusVQ <= 0) return false;
  const dx = inner.uQ - outer.uQ;
  const dy = inner.vQ - outer.vQ;
  const outerU = outer.radiusUQ;
  const outerV = outer.radiusVQ;
  const innerU = inner.radiusUQ;
  const innerV = inner.radiusVQ;
  const a = (innerU / outerU) ** 2;
  const b = (innerV / outerV) ** 2;
  const c = 2 * dx * innerU / (outerU * outerU);
  const d = 2 * dy * innerV / (outerV * outerV);
  const e = (dx / outerU) ** 2 + (dy / outerV) ** 2;
  const step = Math.PI * 2 / CONTAINMENT_SAMPLES;
  const derivativeBound = Math.abs(a - b) + Math.abs(c) + Math.abs(d);
  let maximum = 0;
  for (let sample = 0; sample < CONTAINMENT_SAMPLES; sample += 1) {
    const theta = sample * step;
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    const value = e + a * cosine * cosine + b * sine * sine + c * cosine + d * sine;
    maximum = Math.max(maximum, value);
  }
  return maximum + derivativeBound * step * 0.5 <= 1 + 1e-12;
}

export function normaliseApertures(
  surface: SheetSurfaceDefinition,
  apertures: readonly BallisticAperture[],
): readonly BallisticAperture[] {
  const kept: BallisticAperture[] = [];
  for (const aperture of apertures) {
    if (!centreIsInRenderedOutline(surface, aperture)) continue;
    if (kept.some((earlier) => ellipseContains(earlier, aperture))) continue;
    kept.push(aperture);
  }
  return kept.length === apertures.length ? apertures : Object.freeze(kept);
}
