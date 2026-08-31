/**
 * map3/sky.ts — the backdrop: dome, sun, planet, clouds.
 *
 * Four layers, one clock, one uniform set:
 *
 *   1. DOME    — an inverted sphere whose colour is a function of the VIEW
 *                DIRECTION, not of a texture. Horizon haze -> zenith, a ground
 *                tint below the horizon, and a glow that follows the real sun.
 *   2. SUN     — a raymarched SDF body. Not a sprite, not a lens flare: a
 *                displaced sphere marched per pixel, with granulation, limb
 *                darkening and a corona that falls off with distance.
 *   3. PLANET  — a second SDF body, banded and slowly spinning, LIT BY THE SUN
 *                so the two bodies share one lighting story.
 *   4. CLOUDS  — a few hundred instanced billboard puffs in ~12 clusters,
 *                drifting, with a slow plasma tint over sun-side shading.
 *
 * Everything is procedural. No texture, no image, no imported mesh.
 *
 * THE INTEGRATION THAT MATTERS. `sunDirection` and `sunColor` are mutated IN
 * PLACE every frame from the orbit, and they are the same objects the sky's own
 * uniforms hold. So pointing the scene's DirectionalLight and the foliage
 * transmission uniforms at them makes the lighting follow the VISIBLE sun for
 * free — there is no second source of truth to drift out of sync.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CLOUDS ARE NOT `THREE.Points`.
 *
 * The brief asked for a THREE.Points field with a sized, attenuated
 * PointsNodeMaterial. On the WebGPU backend that silently does not work, and
 * three says so itself (PointsNodeMaterial's own docs): "Since WebGPU only
 * supports point primitives with a pixel size of 1, it's not possible to define
 * a size." The backend maps `object.isPoints` to the `point-list` topology
 * (WebGPUPipelineUtils), and `PointsNodeMaterial.setupVertex()` takes the
 * no-size branch for a Points object — `sizeNode` and `sizeAttenuation` are
 * both dead. It works under the WebGL2 fallback (gl_PointSize) and then
 * degrades to 1-pixel confetti on the real target, which is the worst possible
 * failure mode: correct on the fallback, wrong on the hardware.
 *
 * So the clouds are the route three's docs point at instead: ONE instanced
 * quad, billboarded in the vertex graph from `cameraPosition`. Same single draw
 * call, same per-particle vertex animation, and the size is in METRES rather
 * than pixels — so attenuation is perspective itself and cannot be ignored by a
 * backend. (The rain in corridors-extra.ts has the same latent issue; see the
 * report, not this file — nothing here edits it.)
 * ---------------------------------------------------------------------------
 *
 * Repo contract: no ShaderMaterial, no RawShaderMaterial, no onBeforeCompile.
 * Every graph below is a three/webgpu NodeMaterial. `Fn` appears exactly twice,
 * for the two raymarchers, because `Loop()` genuinely needs statement scope —
 * everything else is a built node EXPRESSION assigned directly, which is the
 * pattern the rest of this directory uses and the one that survives WGSL.
 */
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

/** One cast boundary; see the note in foliage-material.ts. */
const {
  Break, Fn, If, Loop, abs, attribute, cameraPosition, clamp, cos, cross, dot,
  float, length, max, mix, normalize, positionWorld, pow, sin, smoothstep,
  uniform, uv, vec3, vec4,
} = TSL as unknown as Record<string, any>;

import { rgb } from './foliage-material';
import { hash11 } from './leaf-geometry';

/* ================================================================== */
/* Tunables                                                            */
/* ================================================================== */

/**
 * Seconds for one full revolution.
 *
 * Dave's ask was "every 90 degrees takes about ten seconds", i.e. a quarter
 * turn per ten seconds. Everything downstream — the sun, the planet, the sun
 * colour ramp — is derived from this one number, so retuning the pace is a
 * one-line change and nothing can fall out of step with anything else.
 */
export const ORBIT_PERIOD_SECONDS = 40;

/** Distance from the world origin to the sun body, in metres. */
export const SUN_ORBIT_RADIUS = 190;
/** Distance from the world origin to the planet, in metres. */
export const PLANET_ORBIT_RADIUS = 158;
/**
 * Radius of the sky dome.
 *
 * Sized against main.ts's camera far plane of 400, not chosen for looks: the
 * dome has no parallax cues at all (its colour is a pure function of view
 * direction), so the only thing its radius decides is when the far plane starts
 * slicing a hole in the sky. At 265 a player 95 m from the origin is still
 * inside it with margin; the corridors reach about 75. If the world grows,
 * raise `camera.far` or lower this — a hole in the sky is what you will see.
 */
export const SKY_DOME_RADIUS = 265;

/**
 * The sun's elevation swings but never approaches the horizon.
 *
 * The brief is explicit that the sun must not pass under the world: it is the
 * scene's key light, and a key light that sets leaves every corridor black. So
 * the AZIMUTH sweeps a full circle (that is the "rotation" you see) while the
 * ELEVATION only breathes between these two angles. 0.28..0.96 rad = 16..55
 * degrees — low enough for the leaf transmission in foliage-material.ts to
 * read, high enough that the sun is never occluded by the corridor treeline.
 */
const SUN_ELEV_MID = 0.62;
const SUN_ELEV_SWING = 0.34;

/** The planet trails the sun by this much of the orbit, in radians. */
const PLANET_PHASE = 2.35;
const PLANET_ELEV_MID = 0.52;
const PLANET_ELEV_SWING = 0.28;
/** Radians per second of the planet's own spin — a turn every ~35 s. */
const PLANET_SPIN_RATE = 0.18;

/** Sun body radius. ~7.8 degrees across at the orbit radius: dramatic, not real. */
const SUN_R = 13;
/** Bounding proxy radius. Must contain the corona, which fades out by ~3.2 R. */
const SUN_BOUND = 46;
const SUN_STEPS = 18;
/**
 * Lipschitz damping for the sun march.
 *
 * The surface is displaced by A = 0.12 R over directions at frequencies 4.2 and
 * 8.8, so the tangential gradient is about A(0.5*4.2 + 0.25*8.8)*1.2 / R ~ 0.62,
 * giving a worst-case field gradient of sqrt(1 + 0.62^2) = 1.18. A step of
 * 1/1.18 = 0.85 of the reported distance is the theoretical safe maximum; 0.78
 * keeps margin. Speckled holes in a marched surface are ALWAYS this number
 * being too large, never the step count being too small.
 */
const SUN_DAMP = 0.78;
/** Radiance multiplier for the disc. ACES clips the granule centres to white. */
const SUN_INTENSITY = 3.4;
const CORONA_INTENSITY = 1.7;

const PLANET_R = 5.0;
const PLANET_BOUND = 8.4;
const PLANET_STEPS = 14;
/** Gas giants are visibly oblate; 0.93 is about Jupiter's flattening, doubled. */
const PLANET_FLATTEN = 0.93;

/** Cloud field: clusters, puffs per cluster, and the wrap domain. */
const CLOUD_CLUSTERS = 12;
const CLOUD_PUFFS_PER_CLUSTER = 68;
/**
 * Half the wrap domain, and it is deliberately WIDER than the placement disc
 * below (120 m). A cluster therefore starts well inside the domain and only
 * approaches the seam after it has drifted there, so the seam fade never dims
 * a cloud that has not moved yet.
 */
const CLOUD_HALF = 170;
const CLOUD_SPAN = CLOUD_HALF * 2;
/** Metres per second the whole field drifts along +X. */
const CLOUD_DRIFT = 1.35;

/** Sun tint at the bottom of its elevation swing, and at the top. */
const SUN_LOW = new THREE.Color(0xff9a4a);
const SUN_HIGH = new THREE.Color(0xfff2d8);

/* ================================================================== */
/* The uniform set                                                     */
/* ================================================================== */

/**
 * ONE uniform set drives the dome, both bodies and the clouds.
 *
 * That is the whole point of collecting them here: a weather system or a
 * time-of-day curve writes these and every layer moves together. Nothing in
 * this file reads a colour from anywhere else, so there is no way for the
 * clouds to be lit by one sun and the dome by another.
 */
export interface SkyUniforms {
  time: ReturnType<typeof uniform>;
  /** Direction FROM the world TOWARD the sun — the DirectionalLight convention. */
  sunDirection: ReturnType<typeof uniform>;
  sunColor: ReturnType<typeof uniform>;
  /** World-space centre of the sun body, for the marcher. */
  sunCentre: ReturnType<typeof uniform>;
  planetCentre: ReturnType<typeof uniform>;
  /** Direction from the planet toward the sun; lights the planet's day side. */
  planetSunDir: ReturnType<typeof uniform>;
  planetSpin: ReturnType<typeof uniform>;
  horizonColor: ReturnType<typeof uniform>;
  zenithColor: ReturnType<typeof uniform>;
  groundColor: ReturnType<typeof uniform>;
  cloudLight: ReturnType<typeof uniform>;
  cloudShadow: ReturnType<typeof uniform>;
  hazeStrength: ReturnType<typeof uniform>;
  sunGlow: ReturnType<typeof uniform>;
  skyIntensity: ReturnType<typeof uniform>;
  cloudDensity: ReturnType<typeof uniform>;
  plasmaStrength: ReturnType<typeof uniform>;
}

export function createSkyUniforms(): SkyUniforms {
  return {
    time: uniform(0),
    sunDirection: uniform(new THREE.Vector3(0.42, 0.62, -0.66).normalize()),
    sunColor: uniform(new THREE.Color().copy(SUN_HIGH)),
    sunCentre: uniform(new THREE.Vector3(0, SUN_ORBIT_RADIUS, 0)),
    planetCentre: uniform(new THREE.Vector3(0, PLANET_ORBIT_RADIUS, 0)),
    planetSunDir: uniform(new THREE.Vector3(0, 1, 0)),
    planetSpin: uniform(0),
    horizonColor: uniform(new THREE.Color(0x9dc0d2)),
    zenithColor: uniform(new THREE.Color(0x2c66a8)),
    groundColor: uniform(new THREE.Color(0x4a5346)),
    cloudLight: uniform(new THREE.Color(0xf3f0ea)),
    cloudShadow: uniform(new THREE.Color(0x5c6f8c)),
    hazeStrength: uniform(0.55),
    sunGlow: uniform(1.0),
    skyIntensity: uniform(1.0),
    cloudDensity: uniform(0.42),
    plasmaStrength: uniform(0.14),
  };
}

/** A whole sky look in one literal. Weather and time-of-day write these. */
export interface SkyPalette {
  horizon: THREE.ColorRepresentation;
  zenith: THREE.ColorRepresentation;
  ground: THREE.ColorRepresentation;
  cloudLight: THREE.ColorRepresentation;
  cloudShadow: THREE.ColorRepresentation;
  haze: number;
  sunGlow: number;
  intensity: number;
  density: number;
  plasma: number;
}

export const DAY_SKY: SkyPalette = {
  horizon: 0x9dc0d2, zenith: 0x2c66a8, ground: 0x4a5346,
  cloudLight: 0xf3f0ea, cloudShadow: 0x5c6f8c,
  haze: 0.55, sunGlow: 1.0, intensity: 1.0, density: 0.42, plasma: 0.14,
};

export const GOLDEN_SKY: SkyPalette = {
  horizon: 0xe8a464, zenith: 0x2a4c86, ground: 0x3d3a33,
  cloudLight: 0xffd7a8, cloudShadow: 0x6b5570,
  haze: 0.78, sunGlow: 1.6, intensity: 0.92, density: 0.5, plasma: 0.22,
};

export const OVERCAST_SKY: SkyPalette = {
  horizon: 0xa8b2ba, zenith: 0x77858f, ground: 0x454a45,
  cloudLight: 0xc9cdd2, cloudShadow: 0x596070,
  haze: 0.9, sunGlow: 0.25, intensity: 0.78, density: 0.72, plasma: 0.05,
};

/** Write a whole look into the uniform set. Safe to call every frame. */
export function applySkyPalette(u: SkyUniforms, p: SkyPalette): void {
  const col = (n: ReturnType<typeof uniform>) => (n as unknown as { value: THREE.Color }).value;
  const num = (n: ReturnType<typeof uniform>) => n as unknown as { value: number };
  col(u.horizonColor).set(p.horizon);
  col(u.zenithColor).set(p.zenith);
  col(u.groundColor).set(p.ground);
  col(u.cloudLight).set(p.cloudLight);
  col(u.cloudShadow).set(p.cloudShadow);
  num(u.hazeStrength).value = p.haze;
  num(u.sunGlow).value = p.sunGlow;
  num(u.skyIntensity).value = p.intensity;
  num(u.cloudDensity).value = p.density;
  num(u.plasmaStrength).value = p.plasma;
}

/* ================================================================== */
/* Noise — sin/cos composition, no texture, no gradient table          */
/* ================================================================== */

/**
 * One octave of smooth 3D noise in roughly [-1, 1].
 *
 * Three sin*cos pairs on deliberately incommensurate frequencies. Harmonically
 * related ones (2x, 4x) line up into visible stripes along the axes, which is
 * the classic tell of a hand-rolled noise; 1.37 / 1.17 / 1.31 never do.
 */
function noise3(q: any): any {
  return sin(q.x.add(q.z.mul(0.71))).mul(cos(q.y.mul(1.37).sub(q.z.mul(0.43))))
    .add(sin(q.y.mul(1.17).add(q.x.mul(0.53))).mul(cos(q.z.mul(0.91))))
    .add(sin(q.z.mul(1.31).sub(q.y.mul(0.29))).mul(cos(q.x.mul(1.09))))
    .mul(1 / 3);
}

/** Octave sum. Kept a plain JS helper: it unrolls, so no statement scope. */
function fbm3(q: any, octaves: number): any {
  let sum: any = noise3(q).mul(0.5);
  let amp = 0.25;
  let freq = 2.13;
  for (let i = 1; i < octaves; i++) {
    sum = sum.add(noise3(q.mul(freq)).mul(amp));
    amp *= 0.5;
    freq *= 2.13;
  }
  return sum;
}

/* ================================================================== */
/* Public shape                                                        */
/* ================================================================== */

export interface Sky {
  group: THREE.Group;
  update(elapsed: number, dt: number): void;
  dispose(): void;
  /**
   * Unit direction from the world toward the sun, REWRITTEN IN PLACE each
   * frame. Point the DirectionalLight and the foliage uniforms at this object
   * once and the lighting tracks the visible sun forever.
   */
  sunDirection: THREE.Vector3;
  /** Sun tint, warm at low elevation, rewritten in place. */
  sunColor: THREE.Color;
  /** World position of the sun body — handy for placing a shadow camera. */
  sunPosition: THREE.Vector3;
  /** The one uniform set. Drive weather and time-of-day through this. */
  uniforms: SkyUniforms;
}

export interface SkyOptions {
  /** Override the cloud puff count; 0 disables the cloud layer entirely. */
  cloudPuffs?: number;
  palette?: SkyPalette;
}

/**
 * Build the sky.
 *
 * The returned group is meant to be added to the scene at the ORIGIN with no
 * rotation or scale: the cloud billboards are assembled in the vertex graph
 * from world-space `cameraPosition`, so a transformed group would shear them.
 */
export function createSky(options: SkyOptions = {}): Sky {
  const group = new THREE.Group();
  group.name = 'sky';
  const disposables: Array<{ dispose(): void }> = [];

  const uniforms = createSkyUniforms();
  if (options.palette) applySkyPalette(uniforms, options.palette);

  // These ARE the uniform payloads, not copies of them. Mutating the vector
  // mutates what the shader reads on the next frame — the same trick the maths
  // corridor uses for its proxy centres.
  const sunDirection = (uniforms.sunDirection as unknown as { value: THREE.Vector3 }).value;
  const sunColor = (uniforms.sunColor as unknown as { value: THREE.Color }).value;
  const sunCentre = (uniforms.sunCentre as unknown as { value: THREE.Vector3 }).value;
  const planetCentre = (uniforms.planetCentre as unknown as { value: THREE.Vector3 }).value;
  const planetSunDir = (uniforms.planetSunDir as unknown as { value: THREE.Vector3 }).value;
  const sunPosition = new THREE.Vector3();

  /* ---------------------------------------------------------------- */
  /* 1. THE DOME                                                       */
  /* ---------------------------------------------------------------- */

  const domeMat = new MeshBasicNodeMaterial();
  domeMat.side = THREE.BackSide;
  // No depth write: the dome is a backdrop, so it must never occlude anything
  // and never take part in sorting. renderOrder puts it first in the pass.
  domeMat.depthWrite = false;
  // The scene's linear fog would eat a surface 300 m away entirely. The dome
  // carries its OWN horizon haze instead, which is the thing fog was faking.
  domeMat.fog = false;
  {
    // The gradient is a function of the direction from the EYE to the fragment,
    // not of the fragment's height. That difference is what keeps the horizon
    // at eye level as you walk, instead of sliding as you approach the shell.
    const dir = normalize(positionWorld.sub(cameraPosition));
    const up = clamp(dir.y, float(-1), float(1));

    const sky = mix(uniforms.horizonColor, uniforms.zenithColor,
      pow(clamp(up, float(0), float(1)), float(0.55)));
    const withGround = mix(sky, uniforms.groundColor, smoothstep(float(0), float(-0.22), up));

    // Haze: a pale band hugging the horizon in both directions. Power 7 keeps
    // it a band rather than a wash over the whole lower sky.
    const haze = pow(clamp(float(1).sub(abs(up)), float(0), float(1)), float(7))
      .mul(uniforms.hazeStrength);
    const hazed = mix(withGround, uniforms.horizonColor.mul(1.2).add(0.035), haze);

    // The sky warms around the real sun. This single term is most of what ties
    // the dome to the orbit: the bright quarter of the sky MOVES.
    const sd = clamp(dot(dir, uniforms.sunDirection), float(0), float(1));
    const glow = pow(sd, float(8)).mul(0.5).add(pow(sd, float(2.2)).mul(0.085));

    // A sky gradient is the one place 8-bit banding is always visible. A few
    // thousandths of noise costs nothing and removes every ring.
    const dither = noise3(dir.mul(140)).mul(0.0035);

    domeMat.colorNode = hazed
      .add(uniforms.sunColor.mul(glow).mul(uniforms.sunGlow))
      .mul(uniforms.skyIntensity)
      .add(dither);
  }

  const domeGeo = new THREE.SphereGeometry(SKY_DOME_RADIUS, 32, 20);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  group.add(dome);
  disposables.push(domeGeo, domeMat);

  /* ---------------------------------------------------------------- */
  /* 2. THE SUN — a raymarched SDF body                                */
  /* ---------------------------------------------------------------- */

  /**
   * Displaced sphere.
   *
   * `normalize(p)` rather than `p` scaled: the displacement must be a function
   * of DIRECTION only, or the field varies along the ray and the reported
   * distance stops bounding anything. p is never near the origin here — the
   * march starts on the bounding hull and stops at the surface — so the
   * normalize is safe.
   */
  const sunSDF = (p: any) => {
    const dir = normalize(p);
    const drift = uniforms.time.mul(0.05);
    const n = noise3(dir.mul(4.2).add(drift)).mul(0.5)
      .add(noise3(dir.mul(8.8).sub(drift)).mul(0.25));
    return length(p).sub(float(SUN_R).add(n.mul(SUN_R * 0.12)));
  };

  const sunMat = new MeshBasicNodeMaterial();
  // BackSide proxy: every fragment sits on the FAR wall of the hull. Marching
  // from the fragment would start outside the volume on the way OUT and miss
  // every time — this cost a debugging round on the maths corridor. March from
  // `cameraPosition`, always.
  sunMat.side = THREE.BackSide;
  sunMat.transparent = true;
  sunMat.depthWrite = false;
  sunMat.blending = THREE.AdditiveBlending;
  sunMat.fog = false;

  sunMat.colorNode = Fn(() => {
    const centre = vec3(uniforms.sunCentre);
    const ro = cameraPosition.sub(centre).toVar();
    const rd = normalize(positionWorld.sub(cameraPosition)).toVar();
    const rlen = length(ro).toVar();

    // Start ON the bounding hull, not at the eye. The sun is 190 m away; 18
    // steps spent crossing empty space would be 18 steps not spent on the
    // surface, and the first one would swallow the whole budget anyway.
    const tt = max(rlen.sub(float(SUN_BOUND)), float(0)).toVar();
    const tEnd = rlen.add(float(SUN_BOUND));
    const hit = float(0).toVar();
    const p = vec3(0).toVar();

    Loop(SUN_STEPS, () => {
      p.assign(ro.add(rd.mul(tt)));
      const d = sunSDF(p);
      If(d.lessThan(float(0.0012).mul(max(tt, float(1)))), () => {
        hit.assign(1.0);
        Break();
      });
      tt.addAssign(d.mul(float(SUN_DAMP)));
      If(tt.greaterThan(tEnd), () => { Break(); });
    });

    // Tetrahedron gradient. The sun NEEDS this rather than a closed form: the
    // surface is displaced, and the bumps in the normal are the granulation.
    const h = float(0.06);
    const k1 = vec3(1, -1, -1); const k2 = vec3(-1, -1, 1);
    const k3 = vec3(-1, 1, -1); const k4 = vec3(1, 1, 1);
    const n = normalize(
      k1.mul(sunSDF(p.add(k1.mul(h))))
        .add(k2.mul(sunSDF(p.add(k2.mul(h)))))
        .add(k3.mul(sunSDF(p.add(k3.mul(h)))))
        .add(k4.mul(sunSDF(p.add(k4.mul(h))))),
    );

    const view = rd.negate();
    const mu = clamp(dot(n, view), float(0), float(1));
    // Limb darkening, the real law: I(mu) = 1 - u(1 - mu), u ~ 0.62 in the
    // visible band. It is why a photograph of the sun has a soft edge and a
    // flat disc does not.
    const limb = float(1).sub(float(0.62).mul(float(1).sub(mu)));

    // Granulation. |p| is R at the surface, so p/R is the unit direction
    // without a second normalize.
    const cell = p.mul(1 / SUN_R);
    const g = clamp(fbm3(cell.mul(9.5).add(uniforms.time.mul(0.08)), 3).mul(0.5).add(0.5),
      float(0), float(1));
    const lanes = smoothstep(float(0.34), float(0.72), g);
    const core = mix(rgb(0x8f1c02), rgb(0xffe6b4), lanes);
    const surface = core.mul(uniforms.sunColor).mul(limb).mul(SUN_INTENSITY);

    // --- corona ---------------------------------------------------------
    // Analytic, not marched: the perpendicular distance from the ray to the
    // centre is one dot product, and a missed ray converges so slowly that
    // marching the corona would burn the whole step budget on empty sky.
    const b = dot(ro, rd).negate();
    const cp = ro.add(rd.mul(b));
    const perp = length(cp);
    const k = clamp(float(SUN_R).div(max(perp, float(SUN_R))), float(0), float(1));
    const wob = fbm3(cp.mul(3.4 / SUN_R).add(uniforms.time.mul(0.22)), 2).mul(0.5).add(0.5);
    const inner = pow(k, float(3.4)).mul(float(0.55).add(wob.mul(0.75)));
    const outer = pow(k, float(1.5)).mul(0.14);
    // Fade to nothing BEFORE the proxy wall. Without this the corona is sliced
    // off at the hull and reads as a faint ring drawn round the sun.
    const edge = smoothstep(float(SUN_BOUND), float(SUN_BOUND * 0.72), perp);
    const corona = mix(rgb(0xff7a1e), uniforms.sunColor, float(0.45))
      .mul(inner.add(outer)).mul(edge).mul(CORONA_INTENSITY);

    return mix(corona, surface, hit);
  })();

  const sunGeo = new THREE.SphereGeometry(SUN_BOUND, 16, 12);
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.renderOrder = -900;
  group.add(sunMesh);
  disposables.push(sunGeo, sunMat);

  /* ---------------------------------------------------------------- */
  /* 3. THE PLANET — a second SDF body, in a different key             */
  /* ---------------------------------------------------------------- */

  /**
   * Oblate ellipsoid. `(length(p/r) - 1) * min(r)` is the standard conservative
   * bound: it under-reports, which is exactly the direction a marcher wants, so
   * this one takes near-full steps where the sun cannot.
   */
  const planetSDF = (p: any) => {
    const q = vec3(
      p.x.mul(1 / PLANET_R),
      p.y.mul(1 / (PLANET_R * PLANET_FLATTEN)),
      p.z.mul(1 / PLANET_R),
    );
    return length(q).sub(float(1)).mul(PLANET_R * PLANET_FLATTEN);
  };

  const planetMat = new MeshBasicNodeMaterial();
  planetMat.side = THREE.BackSide;
  planetMat.transparent = true;
  planetMat.depthWrite = false;
  planetMat.fog = false;

  const planetShade = Fn(() => {
    const centre = vec3(uniforms.planetCentre);
    const ro = cameraPosition.sub(centre).toVar();
    const rd = normalize(positionWorld.sub(cameraPosition)).toVar();
    const rlen = length(ro).toVar();

    const tt = max(rlen.sub(float(PLANET_BOUND)), float(0)).toVar();
    const tEnd = rlen.add(float(PLANET_BOUND));
    const hit = float(0).toVar();
    const p = vec3(0).toVar();

    Loop(PLANET_STEPS, () => {
      p.assign(ro.add(rd.mul(tt)));
      const d = planetSDF(p);
      If(d.lessThan(float(0.0009).mul(max(tt, float(1)))), () => {
        hit.assign(1.0);
        Break();
      });
      // 0.95, not 0.78: an undisplaced ellipsoid field is metric, so damping it
      // hard would only cost steps. Damping is per-FIELD, never a global habit.
      tt.addAssign(d.mul(0.95));
      If(tt.greaterThan(tEnd), () => { Break(); });
    });

    // Closed-form gradient of the ellipsoid — no 4-tap tetrahedron needed when
    // the field is analytic. The sun pays for four extra evaluations because
    // its field is displaced; this one does not.
    const n = normalize(vec3(p.x, p.y.mul(1 / (PLANET_FLATTEN * PLANET_FLATTEN)), p.z));
    const view = rd.negate();

    // Spin about the body's own axis. Latitude is preserved by a Y rotation, so
    // the BANDS stay put while their turbulence travels — which is what a gas
    // giant actually does.
    const cs = cos(uniforms.planetSpin);
    const sn = sin(uniforms.planetSpin);
    const pr = vec3(p.x.mul(cs).sub(p.z.mul(sn)), p.y, p.x.mul(sn).add(p.z.mul(cs)));
    const unit = pr.mul(1 / PLANET_R);
    const lat = clamp(unit.y, float(-1), float(1));

    const turb = fbm3(unit.mul(2.4).add(vec3(0, uniforms.time.mul(0.04), 0)), 3);
    // ~6 belts across the disc. Any finer and they alias: the planet is only
    // about 3.6 degrees wide, so a band has to be worth more than two pixels.
    const band = sin(lat.mul(6.2).add(turb.mul(2.6))).mul(0.5).add(0.5);
    const belt = smoothstep(float(0.3), float(0.85), band);
    const banded = mix(
      mix(rgb(0x400a06), rgb(0xb83a15), belt),
      rgb(0xe69152),
      pow(belt, float(4)).mul(0.75),
    );

    // One storm, oval because Coriolis stretches them along latitude.
    const dv = unit.sub(vec3(0.62, 0.28, 0.73));
    const oval = length(vec3(dv.x, dv.y.mul(2.4), dv.z));
    const spot = smoothstep(float(0.46), float(0.12), oval);
    const surface = mix(banded, rgb(0xf0c08a), spot.mul(0.75));

    // Lit by the REAL sun. A terminator across a banded ball is what makes it
    // read as a body in the same world rather than a decal on the sky.
    const lam = clamp(dot(n, uniforms.planetSunDir), float(0), float(1));
    const lit = mix(float(0.16), float(1.15), pow(lam, float(0.75)));
    const rim = pow(float(1).sub(clamp(dot(n, view), float(0), float(1))), float(3.2));
    const body = surface.mul(lit)
      .add(rgb(0xff6a3a).mul(rim).mul(lam.mul(0.6).add(0.15)));

    // Thin atmosphere outside the silhouette, faded before the proxy wall.
    const b = dot(ro, rd).negate();
    const perp = length(ro.add(rd.mul(b)));
    const k = clamp(float(PLANET_R).div(max(perp, float(PLANET_R))), float(0), float(1));
    const halo = pow(k, float(5)).mul(0.5)
      .mul(smoothstep(float(PLANET_BOUND), float(PLANET_BOUND * 0.7), perp));

    // RGB and coverage come out together in one vec4. An `Fn` must return a
    // NODE — handing it a JS object of two nodes does not fail loudly, it
    // produces a broken graph — and calling the marcher twice, once for colour
    // and once for alpha, would build the whole loop twice for the same pixel.
    return vec4(
      mix(rgb(0xff5a2a).mul(0.7), body, hit),
      clamp(hit.add(halo.mul(float(1).sub(hit))), float(0), float(1)),
    );
  });

  // A vec4 colorNode carries its own alpha: NodeMaterial does
  // `diffuseColor.assign( vec4( colorNode ) )`, so `.w` IS the coverage and no
  // separate opacityNode is needed. That keeps the marcher to one evaluation.
  planetMat.colorNode = planetShade();

  const planetGeo = new THREE.SphereGeometry(PLANET_BOUND, 16, 12);
  const planetMesh = new THREE.Mesh(planetGeo, planetMat);
  planetMesh.renderOrder = -890;
  group.add(planetMesh);
  disposables.push(planetGeo, planetMat);

  /* ---------------------------------------------------------------- */
  /* 4. CLOUDS — instanced billboards, one draw call                   */
  /* ---------------------------------------------------------------- */

  const requested = options.cloudPuffs ?? CLOUD_CLUSTERS * CLOUD_PUFFS_PER_CLUSTER;

  if (requested > 0) {
    const clusters = Math.max(1, Math.round(requested / CLOUD_PUFFS_PER_CLUSTER));
    const perCluster = Math.max(1, Math.round(requested / clusters));
    const count = clusters * perCluster;

    const clusterArr = new Float32Array(count * 3);
    const offsetArr = new Float32Array(count * 3);
    const infoArr = new Float32Array(count * 2);

    let w = 0;
    for (let c = 0; c < clusters; c++) {
      // Clusters, not a uniform scatter. A field of evenly spread puffs reads
      // as fog; discrete lumps with gaps between them read as CLOUDS, and that
      // is the entire difference for the same particle count.
      // Stratified in angle, jittered within its slice: 12 clusters drawn from
      // a raw hash will leave a quarter of the sky empty and stack two clouds
      // in the same place. One division buys an even ring for free.
      const ang = (c / clusters) * Math.PI * 2 + (hash11(c * 3.7 + 1.3) - 0.5) * 0.42;
      // An annulus, never the middle: a cluster overhead at 50 m would fill the
      // screen with one puff the moment you look up.
      const rad = 48 + hash11(c * 7.1 + 5.9) * 72;
      const cx = Math.cos(ang) * rad;
      const cz = Math.sin(ang) * rad;
      const cy = 44 + hash11(c * 11.3) * 52;
      // Flattened: clouds have a bottom. 0.26 vertical is what makes a lump of
      // puffs read as a cumulus rather than a cotton ball.
      const ex = 20 + hash11(c * 13.9) * 14;
      const ey = ex * 0.26;
      const ez = 16 + hash11(c * 17.3) * 12;

      for (let i = 0; i < perCluster; i++) {
        const s = c * 131.7 + i * 5.31;
        const h0 = hash11(s);
        const h1 = hash11(s * 1.7 + 3.1);
        const h2 = hash11(s * 2.3 + 9.7);
        const h3 = hash11(s * 3.9 + 17.9);

        // Direction on a sphere, radius biased outward by a cube root so the
        // puffs do not pile up in the middle. Floored at 0.18 so the offset is
        // never zero — it doubles as the puff's surface normal below.
        const theta = h0 * Math.PI * 2;
        const cosPhi = h1 * 2 - 1;
        const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
        const rn = 0.18 + 0.82 * Math.cbrt(h2);

        offsetArr[w * 3] = Math.cos(theta) * sinPhi * rn * ex;
        offsetArr[w * 3 + 1] = cosPhi * rn * ey;
        offsetArr[w * 3 + 2] = Math.sin(theta) * sinPhi * rn * ez;

        clusterArr[w * 3] = cx;
        clusterArr[w * 3 + 1] = cy;
        clusterArr[w * 3 + 2] = cz;

        // Puffs shrink toward the cluster edge, so the silhouette is soft
        // without needing more of them.
        infoArr[w * 2] = (6 + h3 * 8) * (1 - rn * 0.45);
        infoArr[w * 2 + 1] = h0 * 61 + h3 * 23;
        w++;
      }
    }

    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3,
    ));
    quad.setAttribute('normal', new THREE.Float32BufferAttribute(
      [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3,
    ));
    quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    quad.setIndex([0, 1, 2, 2, 1, 3]);
    quad.setAttribute('aCluster', new THREE.InstancedBufferAttribute(clusterArr, 3));
    quad.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsetArr, 3));
    quad.setAttribute('aInfo', new THREE.InstancedBufferAttribute(infoArr, 2));
    quad.instanceCount = count;

    const cloudMat = new MeshBasicNodeMaterial();
    cloudMat.transparent = true;
    cloudMat.depthWrite = false;
    cloudMat.side = THREE.DoubleSide;
    cloudMat.fog = false;

    const cluster = attribute('aCluster', 'vec3');
    const offset = attribute('aOffset', 'vec3');
    const info = attribute('aInfo', 'vec2');
    const seed = info.y;
    const t = uniforms.time;

    // Drift, wrapped on the CLUSTER rather than the puff. Wrapping each puff
    // independently tears a cloud in half the moment its leading edge crosses
    // the seam while its trailing edge has not.
    const raw = cluster.x.add(t.mul(CLOUD_DRIFT)).add(CLOUD_HALF);
    const wrapped = raw.sub(raw.mul(1 / CLOUD_SPAN).floor().mul(CLOUD_SPAN)).sub(CLOUD_HALF);

    const wander = vec3(
      sin(t.mul(0.09).add(seed)).mul(1.6),
      sin(t.mul(0.14).add(seed.mul(1.7))).mul(0.7),
      cos(t.mul(0.11).add(seed.mul(0.7))).mul(1.6),
    );
    const centre = vec3(wrapped, cluster.y, cluster.z).add(offset).add(wander);

    {
      // --- billboard ----------------------------------------------------
      // Built from `cameraPosition` alone, so it needs no matrix plumbing and
      // works identically in both backends. The reference axis is per-puff and
      // SWAPS smoothly when it lines up with the view: cross() of two parallel
      // vectors is zero, normalize(0) is NaN, and one NaN vertex stretches a
      // quad across the whole screen.
      const toCam = normalize(cameraPosition.sub(centre));
      const ax = sin(seed.mul(1.7));
      const az = cos(seed.mul(2.3));
      const refA = normalize(vec3(ax, float(0.64), az));
      // refB is refA turned, NOT an independent random axis. Two independent
      // axes can land antiparallel for some seed, and then the blend below
      // passes through zero — the one input normalize() cannot survive. Built
      // this way the raw pair always dots to exactly -0.4544, so they are 117
      // degrees apart for every seed and the blend can never vanish.
      const refB = normalize(vec3(az, float(-0.71), ax.negate()));
      const swap = smoothstep(float(0.86), float(0.97), abs(dot(refA, toCam)));
      const ref = normalize(mix(refA, refB, swap));
      const right = normalize(cross(ref, toCam));
      const upv = cross(toCam, right);

      const breathe = sin(t.mul(0.23).add(seed.mul(2.1))).mul(0.09).add(1);
      const halfSize = info.x.mul(breathe);
      const corner = uv().sub(0.5);

      // Size is in METRES, so attenuation is the perspective divide itself —
      // nothing for a backend to ignore.
      cloudMat.positionNode = centre
        .add(right.mul(corner.x.mul(halfSize).mul(2)))
        .add(upv.mul(corner.y.mul(halfSize).mul(2)));
    }

    {
      // --- shading ------------------------------------------------------
      // The puff's offset from its cluster centre IS its normal. That is the
      // cheapest correct lighting a particle cloud can have: the sunward side
      // of every lump lights up and the far side stays blue, from an attribute
      // that already had to exist.
      const nrm = normalize(offset.add(vec3(0, 0.001, 0)));
      const lam = clamp(dot(nrm, uniforms.sunDirection), float(0), float(1));
      const base = mix(uniforms.cloudShadow, uniforms.cloudLight, pow(lam, float(0.7)));
      const rimGlow = uniforms.sunColor.mul(pow(lam, float(4.5))).mul(0.85);

      // Plasma: a slow, large-scale field the clouds drift THROUGH, so the
      // colour crawls across the field instead of riding on each puff.
      const plasma = fbm3(cluster.add(offset).mul(0.014)
        .add(vec3(t.mul(0.05), t.mul(0.02), float(0))), 2);
      const iris = mix(rgb(0x2a3f66), rgb(0x6b3a58), plasma.mul(0.5).add(0.5))
        .mul(uniforms.plasmaStrength);

      // Distance haze into the dome's own horizon colour, so the far edge of
      // the field dissolves instead of ending.
      const far = smoothstep(float(150), float(330), length(cameraPosition.sub(centre)));
      cloudMat.colorNode = mix(base.add(rimGlow).add(iris), uniforms.horizonColor, far.mul(0.75));

      // Round, soft, and wispy at the rim: a square particle is the one thing
      // that instantly gives away a billboard.
      const r = length(uv().sub(0.5)).mul(2);
      const wisp = noise3(vec3(uv().x.mul(5.1), uv().y.mul(5.1), seed)).mul(0.22);
      const soft = smoothstep(float(1), float(0.12), r.add(wisp));
      // Fade out before the wrap seam so a cluster never teleports in view.
      const seam = smoothstep(float(CLOUD_HALF), float(CLOUD_HALF - 40), abs(wrapped));
      cloudMat.opacityNode = clamp(
        soft.mul(uniforms.cloudDensity).mul(seam).mul(float(1).sub(far.mul(0.35))),
        float(0), float(1),
      );
    }

    const puffs = new THREE.Mesh(quad, cloudMat);
    // The quad's own bounds are half a metre wide; every puff is placed in the
    // vertex graph, so the culler has nothing true to test.
    puffs.frustumCulled = false;
    puffs.renderOrder = -800;
    group.add(puffs);
    disposables.push(quad, cloudMat);
  }

  /* ---------------------------------------------------------------- */
  /* The orbit                                                         */
  /* ---------------------------------------------------------------- */

  const setTime = (n: ReturnType<typeof uniform>, v: number) => {
    (n as unknown as { value: number }).value = v;
  };

  return {
    group,
    sunDirection,
    sunColor,
    sunPosition,
    uniforms,

    update(elapsed: number) {
      setTime(uniforms.time, elapsed);

      const a = (elapsed / ORBIT_PERIOD_SECONDS) * Math.PI * 2;

      // Azimuth sweeps the full circle; elevation only breathes. See the note
      // on SUN_ELEV_MID for why the sun never sets.
      const el = SUN_ELEV_MID + SUN_ELEV_SWING * Math.sin(a);
      sunPosition.set(
        Math.cos(el) * Math.sin(a),
        Math.sin(el),
        Math.cos(el) * Math.cos(a),
      ).multiplyScalar(SUN_ORBIT_RADIUS);

      sunDirection.copy(sunPosition).normalize();
      sunCentre.copy(sunPosition);
      sunMesh.position.copy(sunPosition);

      // Warm when low, white when high — the same ramp the dome's glow and the
      // foliage transmission read, because it is the same object.
      sunColor.copy(SUN_LOW).lerp(SUN_HIGH, THREE.MathUtils.smoothstep(el, 0.26, 0.8));

      const a2 = a + PLANET_PHASE;
      const el2 = PLANET_ELEV_MID + PLANET_ELEV_SWING * Math.sin(a2 * 1.3);
      planetCentre.set(
        Math.cos(el2) * Math.sin(a2),
        Math.sin(el2),
        Math.cos(el2) * Math.cos(a2),
      ).multiplyScalar(PLANET_ORBIT_RADIUS);
      planetMesh.position.copy(planetCentre);
      planetSunDir.copy(sunPosition).sub(planetCentre).normalize();
      setTime(uniforms.planetSpin, elapsed * PLANET_SPIN_RATE);
    },

    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}
