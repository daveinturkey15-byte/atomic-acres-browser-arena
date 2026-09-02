/**
 * HF-410 - FIT THE RIG INSIDE THE BODY THAT CARRIES IT.
 *
 * THE DEFECT, measured (2026-09-02, `scripts/qa/measure-viewmodel-body-fit-cdp.mjs`,
 * 60/60 valid rows on atomic-acres, WebGPU, 2560x1440):
 *
 *   weapon   stance  hold  forward from eye   radial from player axis   capsule margin
 *   carbine  crouch  hip        1.795 m               1.973 m              -1.593 m
 *   mini-uzi stand   hip        1.769 m               1.950 m              -1.570 m
 *   m4a1     crouch  hip        1.675 m               1.897 m              -1.517 m
 *   lmg      stand   hip        1.521 m               1.789 m              -1.409 m
 *   minigun  prone   hip        1.523 m               1.565 m              -1.185 m
 *
 * The standing capsule radius is 0.38 m. EVERY graded row was negative: the
 * first-person rig lived between 1.2 m and 1.6 m OUTSIDE the player's own
 * collision body, and the lowest visible vertex sat 0.776 m BELOW the surface
 * the player was standing on. A body that is 0.38 m wide cannot carry a rig
 * that is 1.97 m wide. Every wall, floor and corner the capsule is allowed to
 * touch therefore contains the weapon, and that is why six passes of retreat,
 * high-ready fold, contact clip planes and a depth-cleared overlay could not
 * fix it: they were all treating a size mismatch as a rendering problem.
 *
 * THE FIX, and why it does not change what the player sees.
 *
 * A perspective projection is invariant under a uniform scale about its own
 * centre. For any camera-space point p, the point k*p projects to exactly the
 * same screen position, because the projection divides by depth:
 *
 *     ndc(k*p) = (f * k*p.x / (k*p.z), f * k*p.y / (k*p.z)) = ndc(p)
 *
 * So scaling the WHOLE first-person rig - position, rotation origin and size -
 * about the eye by one factor k leaves the rendered image pixel-identical while
 * dividing its world footprint by 1/k. The rig keeps its framing, its sight
 * picture, its silhouette and its perspective; it simply stops being a
 * two-metre object bolted to the outside of a 0.38 m body.
 *
 * That invariance holds for geometry. Three things are NOT scale-invariant and
 * are compensated here rather than left to drift:
 *
 *  1. THE NEAR PLANE. Every rig point moves k times closer to the eye, so the
 *     gameplay camera's 0.08 m near plane would slice the rig in half. The
 *     first-person overlay is already a separate depth-cleared submission, so
 *     it gets its own near plane (`VIEWMODEL_OVERLAY_NEAR_METERS`) for that
 *     submission only. A perspective matrix's x/y mapping does not depend on
 *     `near` (the frustum extents scale with it), so this changes the depth
 *     range and nothing else on screen.
 *  2. THE VIEWMODEL-ONLY LIGHTS. Three's point lights are physical: irradiance
 *     is intensity / r^2 and `distance` is a world-space cutoff. Moving a light
 *     k times closer to the surface it lights would brighten it by 1/k^2, so
 *     viewmodel-only fills carry `viewmodelBodyFitLightDistance` and
 *     `viewmodelBodyFitLightIntensity` and the rig is lit exactly as before.
 *  3. THE UNITS OF EVERY WORLD-SPACE MEASUREMENT that enters the rig's own
 *     frame. The contact probe, the fold solve and the near-plane admission all
 *     compare metres of world against metres of rig. `viewmodelWorldToRigMeters`
 *     and `viewmodelRigToWorldMeters` are the only sanctioned conversions.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: it does not weaken one gate, threshold or
 * ceiling. The contact fold keeps its 1.5 rad ceiling and the surface clip
 * planes stay armed. They simply stop engaging, because the geometry they were
 * defending is no longer outside the body.
 */

/** The identity of this fit, carried on telemetry so a silent revert is visible. */
export const VIEWMODEL_BODY_FIT_CONTRACT = 'viewmodel-body-fit-inside-capsule-v1';

/**
 * The capsule radius the fit is sized against, from
 * `CHARACTER_PHYSICS_CONFIG.playerRadius`. Duplicated as a literal on purpose:
 * this module must not import the physics runtime, and the anatomy contract
 * asserts the two agree.
 */
export const VIEWMODEL_BODY_FIT_CAPSULE_RADIUS_METERS = 0.38;

/**
 * Metres of capsule radius the fitted rig must leave unused. The character
 * controller keeps its own 0.025 m offset, and an authored wall can sit exactly
 * on the capsule surface, so the rig stops short of the boundary rather than on
 * it.
 */
export const VIEWMODEL_BODY_FIT_MARGIN_METERS = 0.06;

/**
 * THE FACTOR. Solved, not authored:
 *
 *     k = (capsuleRadius - margin) / worstMeasuredExtent
 *       = (0.38 - 0.06) / 2.438
 *       = 0.1312
 *
 * rounded DOWN to 0.13. Two rigs have to fit, and the budget is sized on the
 * larger of them:
 *
 *   - the SHIPPED GLB rig, measured in installed Chrome on WebGPU: worst radial
 *     extent 1.973 m (carbine, crouch, hip), which the fit lands at 0.256 m
 *     with 0.124 m of capsule to spare;
 *   - the HEADLESS PROCEDURAL fallback rig the unit gates mount, which is the
 *     larger mesh: worst forward extent 2.438 m (sniper and LMG), landing at
 *     0.317 m inside the 0.32 m budget.
 *
 * Lowering k further is free on screen - the projection is invariant under it -
 * and costs only overlay near-plane margin, of which there is 3x here
 * (the nearest measured rig vertex lands at 0.016 m against a 0.005 m plane).
 * Raising it puts the weapon back outside the body, which is the defect.
 */
export const VIEWMODEL_BODY_FIT_SCALE = 0.13;

/**
 * The first-person overlay's own near plane, in metres.
 *
 * The gameplay camera keeps its 0.08 m plane for the world: depth precision at
 * 180 m is a shared budget and this lane does not get to spend it. The overlay
 * is a separate depth-cleared submission of one small object, so it can afford
 * a plane the world cannot.
 *
 * SIZED FROM MEASUREMENT, not chosen for comfort. The nearest visible rig point
 * across every graded pose is 0.0031 m from the eye under the fit (m4a1, deep
 * wall-and-floor contact, headless rig; 0.0164 m on the shipped GLB rig in
 * Chrome), so 0.002 m keeps the complete rig drawn. Depth resolution over the
 * rig's 0.002-0.32 m span is around a micrometre, which is four orders of
 * magnitude finer than any feature on a weapon.
 *
 * This is strictly MORE of the rig than shipped before the fit: the arms'
 * off-frame shoulder end measured 0.024 m from the eye and was already being
 * cut by the world's 0.08 m plane.
 */
export const VIEWMODEL_OVERLAY_NEAR_METERS = 0.002;

/** World metres expressed in the unfitted rig frame the presentation composes in. */
export function viewmodelWorldToRigMeters(worldMeters: number): number {
  return worldMeters / VIEWMODEL_BODY_FIT_SCALE;
}

/** Rig-frame metres expressed as the world metres the fitted rig really occupies. */
export function viewmodelRigToWorldMeters(rigMeters: number): number {
  return rigMeters * VIEWMODEL_BODY_FIT_SCALE;
}

/**
 * A viewmodel-only light's cutoff radius under the fit. `distance` is world
 * space, so it shrinks with everything else.
 */
export function viewmodelBodyFitLightDistance(authoredMeters: number): number {
  return authoredMeters * VIEWMODEL_BODY_FIT_SCALE;
}

/**
 * A viewmodel-only light's intensity under the fit. Irradiance is
 * intensity / r^2 and every r has shrunk by k, so intensity must shrink by k^2
 * for the rig to be lit exactly as it was before the fit.
 */
export function viewmodelBodyFitLightIntensity(authoredIntensity: number): number {
  return authoredIntensity * VIEWMODEL_BODY_FIT_SCALE * VIEWMODEL_BODY_FIT_SCALE;
}
