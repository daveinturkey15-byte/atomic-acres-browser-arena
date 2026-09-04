/**
 * RAID2 reference schematic v2 — the measured numbers, as data.
 *
 * WHY THIS FILE EXISTS. The previous accuracy pass wrote its measurements into
 * a markdown document and then typed them a second time into the arena and a
 * third time into the gate. All three drifted, and the zone table did not
 * reproduce when it was re-measured (docs/raid-rebuild/GLM_PRECHECK_2026-09-03.md
 * D6). Here the measurement is authored ONCE, the arena consumes it, and
 * src/raid2-fidelity.test.ts asserts the built geometry against the same
 * constants — so a number cannot be "corrected" in the arena without the gate
 * seeing it.
 *
 * ORIGINALITY BOUNDARY (unchanged from docs/raid-rebuild/SPATIAL_PLAN.md §0).
 * Nothing here is copied. What is recovered from the first-party artefact is
 * TOPOLOGY and PROPORTION — how wide a thing is relative to the map's long
 * axis, and which side of which it sits on. Every value below is a measurement
 * or a ratio; no geometry, texture, string or trade dress travels.
 *
 * METHOD (re-runnable, and re-run in this lane on 2026-09-04).
 *
 * 1. The nine first-party artefacts were re-fetched with curl. All nine
 *    returned 200 and reproduced the byte counts the previous pass recorded to
 *    the byte. Every one of them is SERVED as `image/webp` despite a `.png`
 *    URL — the same trap the Nuke Town lane recorded, and the reason the
 *    receipt below records the served content type rather than the extension.
 *
 * 2. The minimap (512 x 512 RGBA) was masked on `alpha > 20`. The alpha
 *    envelope reproduces at x = [63, 443], y = [15, 499] — 381 x 485 px,
 *    aspect 1.2730 — identical to the previous pass, to the pixel.
 *
 * 3. THE ENVELOPE IS NOT THE CALIBRATION. It includes out-of-bounds hillside
 *    margin, and it does not include it symmetrically: under the fit below the
 *    envelope corners land at Z -42.7..+31.0 (73.7 m) and X +50.8..-53.0
 *    (103.8 m) against a 76 x 100 m playfield, i.e. the margin is negative on
 *    one axis and positive on the other. Calibrating on it is what put the
 *    previous pass's absolute centres 6-8 m out.
 *
 * 4. The mapping is instead solved as one scale and one offset per axis by
 *    least squares over THREE identifiable anchor pairs whose engine positions
 *    are already authored: the pool water centroid, the drive island centre,
 *    and the sport court enclosure centre.
 *
 *    The plan named exactly two anchors (pool + roundabout). That is not
 *    solvable here and the reason is worth writing down rather than papering
 *    over: in the BUILT arena the pool water centre and the drive island centre
 *    both sit at X = 0, so the X baseline between those two anchors is ZERO
 *    metres and the X scale is unidentifiable from them. The court is therefore
 *    promoted from residual-anchor to fit-anchor, and the residual is published
 *    at every anchor plus two independent features instead.
 *
 *    Fit:  Z = 0.19381 * px_x - 54.864      (0.1938 m per pixel)
 *          X = -0.21441 * px_y + 53.985     (0.2144 m per pixel)
 *
 *    Residuals (built anchor minus predicted), metres:
 *      pool water centroid    dZ -1.00   dX -2.00
 *      drive island centre    dZ -0.06   dX +1.73
 *      court enclosure centre dZ +1.06   dX +0.26
 *
 *    Worst residual 2.00 m, against the plan's 2 m stop condition — PASS, with
 *    no headroom to spare on X. Every X figure below therefore carries a
 *    +/- 2 m uncertainty and none of them is used to move a spawn.
 *
 * 5. ANISOTROPY, published rather than hidden: |ax| / az = 1.106. The fit is
 *    6.6 % coarser per pixel along the map's long axis than across it. Either
 *    the artefact is not isotropic or the arena's 100 x 76 m anchor stretches
 *    the long axis by ~10 % against the reference. The anchor is NOT
 *    re-litigated (HF-426 settled that for Nuke Town and the same argument
 *    holds), so this is recorded as a known bias on X and nothing more.
 *
 * CLAIM-STATES. Everything in `RAID2_MEASURED` was measured by this lane, from
 * the raw image, this session: VERIFIED. Everything in `RAID2_OPEN` was seen
 * but not resolved: OPEN. Nothing here is carried over from another agent's
 * report without re-derivation.
 */

/** Long axis of the playfield, metres. Every ratio below is against this. */
export const RAID2_LONG_AXIS_M = 100;
/** Short axis of the playfield, metres. */
export const RAID2_SHORT_AXIS_M = 76;

/**
 * Fetch receipts, recorded at fetch time (2026-09-04, curl, no browser).
 * `bytes` is `%{size_download}` of a fresh GET; `served` is the response's own
 * content type, which is NOT what the URL extension claims.
 */
export const RAID2_SOURCES = Object.freeze([
  Object.freeze({ id: 'S1', what: 'minimap', http: 200, bytes: 86042, served: 'image/webp', sha256: '579db4c4928921ed' }),
  Object.freeze({ id: 'S2', what: 'aerial view', http: 200, bytes: 860522, served: 'image/webp', sha256: '9cda5804c61a761a' }),
  Object.freeze({ id: 'S3', what: 'sport court', http: 200, bytes: 380350, served: 'image/webp', sha256: '1ee5122522e2b817' }),
  Object.freeze({ id: 'S4', what: 'compound entrance', http: 200, bytes: 673670, served: 'image/webp', sha256: '6966095269afad4e' }),
  Object.freeze({ id: 'S5', what: 'courtyard', http: 200, bytes: 568726, served: 'image/webp', sha256: '2cbcf02e4a065fbc' }),
  Object.freeze({ id: 'S6', what: 'veranda', http: 200, bytes: 317410, served: 'image/webp', sha256: '1656cecf28ed283f' }),
  Object.freeze({ id: 'S7', what: 'garage end', http: 200, bytes: 615574, served: 'image/webp', sha256: 'f2444cb5ee7cb2da' }),
  Object.freeze({ id: 'S8', what: 'garden apron end', http: 200, bytes: 996996, served: 'image/webp', sha256: '2cd85d127ff93221' }),
  Object.freeze({ id: 'S9', what: 'load screen', http: 200, bytes: 516362, served: 'image/webp', sha256: '733eba1061b9d646' }),
]);

/** The pixel -> metre similarity solved in step 4, published so it can be re-run. */
export const RAID2_CALIBRATION = Object.freeze({
  zScale: 0.19381, zOffset: -54.864,
  xScale: -0.21441, xOffset: 53.985,
  worstResidualM: 2.0,
  anisotropy: 1.106,
});

/**
 * The measured reference, in engine metres, with each figure also expressed as
 * a fraction of the long axis so a later rescale of the 100 m anchor is one
 * multiplication.
 *
 * Sign convention (the arena's own, unchanged): +X is the garage end, -X the
 * garden-apron end, -Z the pool/court flank, +Z the drive flank.
 */
export const RAID2_MEASURED = Object.freeze({
  /**
   * The water body, flood-filled from the artefact at 30 <= luma <= 62 inside
   * a window that excludes the courtyard planting. 2,575 px -> 107.0 m2 of
   * water inside a 60 x 109 px envelope -> 11.63 m (Z) x 23.37 m (X), fill
   * 0.394. THE FILL IS THE FINDING: the built pool is a 28 x 8 m rectangle at
   * fill 1.00, and the reference is a narrow northern channel opening into a
   * broad southern lobe that wraps a round basin. Ratio of the water envelope
   * to the long axis: 0.234 long, 0.116 across.
   */
  poolEnvelope: Object.freeze({
    minX: -12.94, maxX: 10.25, minZ: -35.5, maxZ: -24.0,
    waterAreaM2: 107.0, bboxFill: 0.394,
    longRatio: 0.2337, shortRatio: 0.1163,
  }),
  /**
   * The round spa, on the pool's SOUTH-EAST shoulder at the narrow waist of
   * the channel — a bright coping annulus 15 px across Z and 19 px across X
   * around a darker disc. Its position relative to the pool centroid is the
   * mirror falsifier's third relation (see RAID2_MIRROR_RELATIONS).
   */
  spa: Object.freeze({ x: 1.78, z: -26.08, diameterM: 3.45 }),
  /**
   * The round basin inside the southern lobe. The flood fill could not enter
   * it — a bright coping ring separates it from the surrounding water — which
   * is exactly why the reference's water fill is 0.394 and not 0.9.
   */
  plunge: Object.freeze({ x: -8.84, z: -28.51, diameterM: 6.53 }),
  /**
   * The circular carriageway. Measured by radial rays to the outermost bright
   * run: 23.26 m across Z, 25.73 m across X (the anisotropy of step 5, not an
   * ellipse in the artefact). The built drive is a 22 x 14 m RECTANGLE.
   */
  driveCircle: Object.freeze({ x: 1.73, z: 13.94, diameterM: 24.5, longRatio: 0.245 }),
  /** The ring of square blocks on the island, centre to centre. */
  driveBlockRing: Object.freeze({ diameterM: 11.94 }),
  /**
   * The stepped circular plinth at the island's centre, carrying a tall ribbon
   * sculpture. The built plinth is a 4 x 4 m square with a 1.45 m torus.
   */
  drivePlinth: Object.freeze({ diameterM: 5.2 }),
  /**
   * The sport court. TWO numbers, because the previous pass conflated them:
   * the fenced enclosure and the painted surface inside it are not the same
   * rectangle, and the build's court floor is the enclosure.
   */
  courtEnclosure: Object.freeze({ x: -26.74, z: -27.44, sizeX: 14.37, sizeZ: 12.99 }),
  courtPainted: Object.freeze({ x: -28.67, z: -28.25, sizeX: 9.11, sizeZ: 7.87 }),
});

/**
 * THE MIRROR FALSIFIER (HF-461's lesson, made mechanical).
 *
 * Nuke Town's rebuild was very nearly shipped mirrored, and topology agreeing
 * is not handedness verified: the first two relations below survive a mirror
 * intact. The THIRD is what catches it, because it is an asymmetry WITHIN one
 * flank — and it is measured, not assumed: the spa sits at X +1.78 while the
 * pool water centroid sits at X -2.00, so the spa is 3.8 m NORTH of the pool's
 * own centre in the reference. A mirrored build puts it south.
 */
export const RAID2_MIRROR_RELATIONS = Object.freeze({
  garageEndIsPositiveX: true,
  poolAndCourtAreNegativeZ: true,
  spaIsNorthOfPoolCentroid: true,
  poolCentroidX: -2.0,
});

/** Named unknowns. An OPEN item never drives geometry (plan §9, Job 1 gate). */
export const RAID2_OPEN = Object.freeze([
  'garage depth: the artefact\'s bright garage mass is ~10.6 x 12.4 m against the built 16 x 28 m. '
  + 'Moving the garage moves team 1\'s spawns (HF-402\'s scar), so nothing moved. Needs S2 + S7 read together.',
  'south garden pond: a ~7.5 m water feature reads near the garden apron in the artefact and exists in '
  + 'neither the schematic nor the build. It sits in a spawn apron, so it needs a second confirming source.',
  'court surface colour: the artefact\'s court is a cool slate blue, the build paints it 0x386b63 teal-green. '
  + 'A saturated blue must clear fidelity band 22 (no cover family darker than its floor) before it is adopted.',
  'vehicle roster and the dead band: the reference\'s coupes stand ~1.35 m, squarely in the 0.9-1.8 m band this '
  + 'arena forbids. No vehicle was authored in this job.',
  'juice-bar pavilion plan: the reference pavilion is curved; the build is a 5 x 4.5 m rectangle. Re-forming it '
  + 'is an eight-box octagon around a mass that band 8 counts, so it is a cell job, not a layout job.',
  'the reference water fill is 0.394 and the rebuilt pool reaches 0.58: the gap is the reference\'s coping '
  + 'isthmus, which flares 3-6 m around the spa where the rebuild models a 2.2 m band.',
]);
