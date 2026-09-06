/**
 * vehicle-forge/wheels.ts - lathe wheels, tyres and lamps.
 *
 * PRESENTATION ONLY, DETERMINISTIC, HEADLESS-SAFE - the same contract as
 * `./geometry`, which this file's header does not repeat.
 *
 * A wheel is the single cheapest place to lose a vehicle. Three failures are
 * designed out here rather than tuned out later:
 *
 *   1. A FLAT chrome dish at wheel height is a horizontal mirror of the tarmac
 *      and goes near-black under every sky. The cover profile is CONCAVE, which
 *      is what puts sky into its upper half.
 *   2. A stock lathe averages normals across every profile step, so a stepped
 *      dish gets normals that rotate across each step and the reflection swirls
 *      as you walk past. `latheGeometry` joins hard above 40 degrees.
 *   3. A tyre revolved as a perfect torus floats: real rubber flattens into a
 *      contact patch and bulges at the sidewall, and without that the car looks
 *      like it is hovering a centimetre off the road.
 */
import * as THREE from 'three';
import { type Vec2, latheGeometry } from './geometry';

export type WheelStyle = 'cover' | 'steel' | 'whitewall';

export interface WheelParts {
  /** Tyre carcass and tread. */
  readonly tyre: THREE.BufferGeometry;
  /** Outboard cover or spider face - the bright part. */
  readonly face: THREE.BufferGeometry;
  /** Inboard disc and the bead-gap annulus - matte dark, never a mirror. */
  readonly dark: THREE.BufferGeometry;
  /** A raised sidewall ring used by the 1950s saloon. */
  readonly whitewall: THREE.BufferGeometry | null;
}

/** Bottom of the tyre squashed into a contact patch, metres. */
const CONTACT_SQUASH = 0.035;

/** Sidewall bulge over the contact patch, as a fraction of the half width. */
const CONTACT_BULGE = 0.07;

/**
 * 20 segments on a 0.34 m wheel is a 107 mm chord: under 2 px of deviation at
 * the 3 m a player ever stands from a parked car, and four wheels per body is
 * where a vehicle's triangle budget actually goes.
 */
const RADIAL_SEGMENTS = 20;

/**
 * HF-536 detail pass (Muse): 10 segments for the parts nobody inspects - the
 * inboard dark disc (arch shadow, matte) and the 1 mm whitewall rib (edge-on).
 * The tyre silhouette and the outboard chrome face stay at 20.
 */
const TRIM_SEGMENTS = 10;

/** The inboard disc faces away from every camera under the arch: 8 is plenty. */
const DARK_SEGMENTS = 8;
/**
 * Turn a lathe built about +Y into a wheel whose axle runs along +X, with the
 * outboard face at +x. `rotateZ(-90 deg)` maps `(x, y, z) -> (y, -x, z)`, so the
 * profile's axis coordinate becomes the world x it was authored as.
 */
function toAxleFrame(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
  return geometry;
}

function applyContactPatch(geometry: THREE.BufferGeometry, radius: number): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const floor = -radius + CONTACT_SQUASH;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y >= floor) continue;
    position.setY(i, floor);
    position.setX(i, position.getX(i) * (1 + CONTACT_BULGE));
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/**
 * One wheel, centred on its own axle, axis along +X, ground at `y = -radius`.
 *
 * `v` runs ACROSS the section on the tyre, so a tread band lands on the tread
 * rather than being smeared around the circumference.
 */
export function wheelParts(radius: number, halfWidth: number, style: WheelStyle): WheelParts {
  const rim = radius * 0.62;
  const face = halfWidth * 0.72;

  const tyreProfile: Vec2[] = [
    [rim, -face],
    [radius * 0.80, -halfWidth],
    [radius * 0.965, -halfWidth * 0.92],
    [radius, -halfWidth * 0.72],
    [radius, halfWidth * 0.72],
    [radius * 0.965, halfWidth * 0.92],
    // A raised decorative rib on the OUTER sidewall only, 1 mm proud: the band
    // that catches a rim light and tells the eye this is rubber, not a disc.
    [radius * 0.885, halfWidth * 0.995],
    [radius * 0.870, halfWidth * 0.975],
    [radius * 0.80, halfWidth],
    [rim, face],
  ];
  const tyre = toAxleFrame(latheGeometry(tyreProfile, RADIAL_SEGMENTS, 40));
  applyContactPatch(tyre, radius);
  tyre.name = 'vehicle-forge-tyre';

  const coverProfile: Vec2[] = style === 'steel'
    ? [
      // A steel wheel: rolled lip, then a spider face dished ~60 mm inside the
      // sidewall, then a small centre cap.
      [rim, face + 0.002],
      [rim * 0.90, face - 0.030],
      [rim * 0.55, face - 0.042],
      [rim * 0.22, face - 0.038],
      [rim * 0.10, face - 0.020],
      [0, face - 0.016],
    ] : [
      [rim, face + 0.004],
      [rim * 0.95, face + 0.010],
      [rim * 0.66, face - 0.004],
      [rim * 0.34, face - 0.010],
      [rim * 0.14, face + 0.002],
      [rim * 0.05, face + 0.010],
      [0, face + 0.012],
    ];
  const outboard = toAxleFrame(latheGeometry(coverProfile, RADIAL_SEGMENTS, 40));
  outboard.name = 'vehicle-forge-wheel-face';

  // The inboard disc and the bead-gap annulus against the tyre: matte dark, so
  // neither ever renders as a second mirror inside the arch shadow.
  const darkProfile: Vec2[] = [
    [rim, -face],
    [rim * 0.55, -face - 0.012],
    [0, -face - 0.016],
  ];
  const dark = toAxleFrame(latheGeometry(darkProfile, DARK_SEGMENTS, 40));
  dark.name = 'vehicle-forge-wheel-dark';

  const whitewall = style === 'whitewall'
    ? toAxleFrame(latheGeometry([
      [rim * 1.02, face + 0.012],
      [radius * 0.91, face + 0.012],
      [radius * 0.91, face + 0.020],
      [rim * 1.02, face + 0.020],
    ], TRIM_SEGMENTS, 40))
    : null;
  if (whitewall) whitewall.name = 'vehicle-forge-whitewall';

  return { tyre, face: outboard, dark, whitewall };
}

export interface LampParts {
  readonly bezel: THREE.BufferGeometry;
  readonly lens: THREE.BufferGeometry;
}

/**
 * A flush lamp, axis along +Z, its face at `z = 0`.
 *
 * LAYER ORDER IS DEPTH ORDER: bezel face, then reveal, then lens, each a
 * fraction of a millimetre further out. Recessing a lens by pushing it INTO
 * the bezel puts it behind the bezel's own solid front face, and it renders
 * black no matter how bright the emissive is.
 */
export function lampParts(radius: number, depth: number): LampParts {
  const bezelProfile: Vec2[] = [
    [radius, -depth],
    [radius, 0],
    [radius * 0.86, 0.0015],
    [radius * 0.84, -0.004],
  ];
  const bezel = latheGeometry(bezelProfile, 18, 40);
  bezel.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  bezel.name = 'vehicle-forge-lamp-bezel';

  const lensProfile: Vec2[] = [
    [radius * 0.84, 0.0025],
    [radius * 0.60, 0.0045],
    [0, 0.0055],
  ];
  const lens = latheGeometry(lensProfile, 18, 40);
  lens.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  lens.name = 'vehicle-forge-lamp-lens';

  return { bezel, lens };
}

/**
 * HF-536 detail pass (Muse): a 12-gon hubcap dome for a dished steel face,
 * in the axle frame (+x outboard) like every other wheel part, so the caller's
 * existing place/mirror logic puts it on the outboard face on both sides.
 * Full-cover and whitewall faces already carry a domed centre in their lathe
 * profile, so they do not take one; a dome on a dome is triangle moss.
 */
export function hubcapDome(rimRadius: number, faceX: number): THREE.BufferGeometry {
  const dome = toAxleFrame(latheGeometry([
    [0.001, faceX],
    [rimRadius * 0.45, faceX + 0.003],
    [rimRadius * 0.3, faceX + 0.02],
    [0.001, faceX + 0.028],
  ], 12, 40));
  dome.name = 'vehicle-forge-hubcap';
  return dome;
}
