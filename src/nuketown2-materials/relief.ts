/**
 * nuketown2-materials/relief.ts — the dimension every family was missing.
 *
 * WHY THIS FILE EXISTS. The owner's verdict on the 2026-09-06 build was that
 * the map "looks very poor, more like Roblox or something 20 years old". The
 * families in this directory were not short of DETAIL: asphalt already had tar
 * seams and wheel paths, siding already had lap courses and drip shadows,
 * blockwork already had mortar joints, the roof already had shingle courses.
 * Every one of those features was authored as an ALBEDO step and nothing else.
 *
 * An albedo step does not behave like a surface. It is the same shade from
 * every direction, at every sun angle, so a mortar joint painted into the
 * colour reads as a printed line on a flat card - which is exactly what a
 * 2005-era game looked like, and exactly the tell the owner is naming. What
 * makes a real wall read as a wall under this arena's low golden-hour key is
 * that the mortar is RECESSED: the joint's upper lip is in shadow, its lower
 * lip catches the sun, and the pair of them flips as the sun moves. That is a
 * NORMAL, and no family in this directory had one:
 *
 *     $ grep -rn 'normalNode' src/nuketown2-materials   ->   no matches
 *
 * So this file adds one term, shared by every family, and each family declares
 * its own height field in METRES - the same millimetre authoring discipline
 * `spec.ts` already pins for albedo (R16: a 4 mm feature is 2 px at 1080p from
 * 3 m; if the crop cannot show it, it does not exist).
 *
 * WHY NOT `bumpMap()` OR `normalMap()`. Three's own `bumpMap()` node
 * (`nodes/display/BumpMapNode.js`) takes a TEXTURE node and re-samples it at
 * `uv + dFdx(uv)`; it cannot be handed a composed expression, and our height
 * is a composition of a dozen procedural terms. `normalMap()` needs a tangent
 * frame and a baked RG map - a sampler per family, which the device-limit
 * gotcha (`gotcha-silent-arena-rollback-device-limit`: silent requestDevice
 * rejection at 17 samplers) makes the most expensive way possible to buy
 * something we can compute. This is Mikkelsen's surface-gradient bump
 * (mm_sfgrad_bump.pdf, listing 2) - the identical maths three uses in
 * `perturbNormalArb` - evaluated on an arbitrary scalar node instead of a
 * texture fetch. Zero new samplers, zero new textures, zero load time.
 *
 * WORLD-RATE GRADIENTS, NOT SCREEN-RATE. Three's own bump node divides nothing
 * by the pixel footprint, so its strength drifts with distance and resolution.
 * Here the screen-space derivative of the height is divided by the world-space
 * size of one pixel (`|dFdx(positionView)|`), so `dH/dx` is a true slope in
 * m/m. That is what lets a family author "the mortar joint is 5 mm deep" and
 * get a 5 mm joint at every range, and what lets a unit test pin the number.
 *
 * SLOPE CLAMP. A lap-siding course or a shingle butt is a genuine STEP in the
 * height field, and a step differentiated across one pixel is an unbounded
 * slope: at 2 m a 10 mm step spans a 1.2 mm pixel, i.e. a slope of 8. Left
 * unclamped that flips the normal past grazing and sparkles. `MAX_RELIEF_SLOPE`
 * caps it at 2.5 (68 deg), which keeps the step reading as a hard lit/shadow
 * pair without ever inverting the facing.
 */
import * as TSL from 'three/tsl';

const { clamp, faceDirection, float, length, max, normalView, positionView } =
  TSL as unknown as Record<string, any>;

/**
 * Steepest surface gradient any relief term may produce, in m/m.
 *
 * 2.5 is tan(68 deg). Chosen as the largest slope that still leaves the
 * perturbed normal on the same side of the geometric one at the grazing angles
 * this arena's key light throws (sun bearing (-0.853, +0.522), elevation ~14
 * deg at `tod=authored`), so a step can never render as a hole.
 */
export const MAX_RELIEF_SLOPE = 2.5;

/**
 * Below this world-space pixel size the derivative is trusted; below it the
 * divide is guarded. Purely a divide-by-zero guard (degenerate triangles,
 * the first pixel of a quad), never a look control.
 */
const MIN_PIXEL_FOOTPRINT_M = 1e-5;

/**
 * A view-space normal perturbed by a procedural height field.
 *
 * @param heightM a scalar node whose value is a surface height in METRES,
 *                positive OUT of the surface. Constant zero returns the
 *                geometric normal exactly, which is how a family switches the
 *                term off for a variant (a backdrop, a flat pane) without a
 *                second program.
 */
export function reliefNormal(heightM: any): any {
  const px = positionView.dFdx();
  const py = positionView.dFdy();
  // Metres per pixel along each screen axis. This is the conversion that makes
  // the authored height a physical depth rather than a screen-space effect.
  const invX = float(1).div(max(length(px), float(MIN_PIXEL_FOOTPRINT_M)));
  const invY = float(1).div(max(length(py), float(MIN_PIXEL_FOOTPRINT_M)));
  const gx = clamp(heightM.dFdx().mul(invX), float(-MAX_RELIEF_SLOPE), float(MAX_RELIEF_SLOPE));
  const gy = clamp(heightM.dFdy().mul(invY), float(-MAX_RELIEF_SLOPE), float(MAX_RELIEF_SLOPE));

  // Mikkelsen surface gradient, listing 2, verbatim in structure so it stays
  // recognisable against three's own perturbNormalArb.
  const sigmaX = px.normalize();
  const sigmaY = py.normalize();
  const vN = normalView;
  const r1 = sigmaY.cross(vN);
  const r2 = vN.cross(sigmaX);
  const fDet = sigmaX.dot(r1).mul(faceDirection);
  const vGrad = fDet.sign().mul(gx.mul(r1).add(gy.mul(r2)));
  const perturbed = fDet.abs().mul(vN).sub(vGrad);

  // DEGENERATE-FRAME GUARD, and it is not defensive padding. Three's own
  // `perturbNormalArb` ends on a bare `.normalize()`, and `normalize(vec3(0))`
  // is NaN. `fDet` is the determinant of the screen-space tangent frame, so it
  // is exactly zero on a degenerate triangle, on a face seen perfectly
  // edge-on, and on the first quad of a freshly-resized target - and a NaN
  // normal is a black pixel that spreads with the lighting, which is precisely
  // the failure class this arena has been chasing all day
  // (gotcha-nuketown2-black-roofs-shader-program-set: an exact-zero NaN whose
  // victim moves with the program set). Falling back to the geometric normal
  // costs one compare and closes the class.
  const len = length(perturbed);
  return len.greaterThan(float(1e-6)).select(perturbed.div(len), vN);
}
