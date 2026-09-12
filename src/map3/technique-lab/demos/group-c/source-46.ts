/**
 * Source 46 — Three.js Water Pro: Beer-Lambert absorption, broadband bubble
 * backscatter injected UPSTREAM of the absorption integral, and the breaking
 * estimator that is supposed to drive both.
 *
 * Licence position, and why this is the cleanest row in the group: the shipped
 * library is a paid Commercial Software License Agreement v2.2 (DRG Software
 * Solutions LLC, all rights reserved) — read as terms at
 * docs.threejswaterpro.com/license.html. Nothing was purchased, downloaded,
 * unpacked or deobfuscated, and the product repository `dgreenheck/webgpu-water`
 * is 404 (re-verified by this lane). The physics below is published graphics and
 * oceanography, not his expression: Beer-Lambert attenuation, the fact that
 * entrained bubble clouds scatter close to spectrally flat, and the Jacobian
 * fold test that has been the standard breaking criterion for displaced wave
 * surfaces since Tessendorf.
 *
 * THE METHOD — three claims, each now implemented rather than described:
 *
 *   1. WHERE the flat bubble source is injected decides the hue:
 *
 *        CORRECT (after panel)  L = bg·e^(-a·d) + ∫₀^d S·e^(-a·s) ds
 *                                 = bg·e^(-a·d) + (S/a)·(1 - e^(-a·d))
 *              The flat source is filtered BY the absorption on its way out, so
 *              the 1/a factor makes it emerge brighter AND green-shifted,
 *              because a is smallest in the green.
 *
 *        WRONG (before panel)   L = bg·e^(-a·d) + S·d
 *              The SAME source over the SAME path — equal scattered energy —
 *              added as a white tint after the integral instead of inside it.
 *              Flat in, flat out: the water goes pale and grey however much of
 *              it you add. Reproduced on purpose, so the mistake the source
 *              post exists to warn about stays inspectable beside the fix.
 *
 *   2. WHAT drives the source is not a slope proxy. The register (item 7) and
 *      the carrier skill both name the estimator: the determinant of the
 *      HORIZONTAL-DISPLACEMENT JACOBIAN. Where neighbouring surface points are
 *      pushed onto each other the map stops being injective; J falls below 1
 *      under compression and through 0 where the surface folds over itself,
 *      and that fold is where air is entrained. `gerstnerChop` returns the
 *      analytic J of exactly the displacement it applies, so the vertex
 *      crowding you can see IS the number the foam is computed from.
 *
 *   3. HOW LONG it lasts is state, not a threshold. Foam energy accumulates
 *      into a field held per surface point and decays exponentially, so it
 *      rolls off the back of a breaker instead of blinking with the crest. The
 *      bubble source for (1) is the SAME state on the SAME time constant —
 *      "foam is the bubbles that reached the surface, backscatter is the ones
 *      that did not". Surface foam is composited AFTER absorption because it
 *      floats on top of the water; the bubbles go inside the integral because
 *      they are under it. Two consumers, one estimator, one decay.
 *
 * FORGE REUSE, concretely: the spectrum is NOT reimplemented. Directions,
 * wavelengths, dispersion, relative weights and phases all come from
 * `OCEAN_BANDS` in `src/water/ocean-spectrum.ts`, the repository's sole CPU
 * ocean authority, and `sampleOcean` still supplies the vertical field. Two
 * knobs the exhibit declares openly are moved: global amplitude and the Gerstner
 * choppiness Q. See EXHIBIT_* below — and see `shippingJacobianMinimum` in the
 * counters, which is the measured statement that our shipped sea cannot break.
 */

import {
  OCEAN_BANDS,
  OCEAN_CHOP_PRESENTATION_GAIN,
  OCEAN_REFERENCE_AMPLITUDE,
  OCEAN_STEEPNESS_GAIN,
  sampleOcean,
} from '../../../../water/ocean-spectrum';
import {
  beforeAfterPanels,
  countDraws,
  disposeTree,
  type Demo,
  type DemoContext,
} from './shared';

/**
 * Per-channel absorption coefficients, 1/metre. Red is absorbed an order of
 * magnitude harder than green; green sits at the minimum, which is why deep
 * clear water reads blue-green and why flat backscatter comes back green.
 */
export const ABSORPTION = { r: 0.48, g: 0.055, b: 0.11 } as const;

/** Light entering the surface from above, per channel. */
const BACKGROUND = { r: 0.14, g: 0.22, b: 0.27 } as const;

/**
 * Scattering source per unit of accumulated bubble state, per metre of path.
 * Bounded by a real constraint rather than taste: the saturated green return
 * S/a_g must stay inside the displayable range over the whole depth ramp,
 * because a term that clips to white destroys the very hue shift it exists to
 * produce. At this yield the deepest, fully-entrained sample returns g≈0.87.
 */
export const BUBBLE_YIELD = 0.24;

/** Surface foam is capped below a character key, per the carrier skill's rule. */
const FOAM_CEILING = 0.62;
const FOAM_COLOUR = { r: 0.82, g: 0.86, b: 0.87 } as const;

export type WaterColour = { r: number; g: number; b: number };

/**
 * Backscatter injected as a source term inside the absorption integral.
 * `bubbles` in [0,1] is accumulated bubble state, not an instantaneous slope.
 * `foam` in [0,1] is the part of that state sitting ON the surface, composited
 * after absorption because it is not underneath the water column.
 */
export function shadeCorrect(depth: number, bubbles: number, foam = 0): WaterColour {
  const source = bubbles * BUBBLE_YIELD;
  const channel = (absorption: number, background: number): number => {
    const transmitted = Math.exp(-absorption * depth);
    const scattered = (source / absorption) * (1 - transmitted);
    return background * transmitted + scattered;
  };
  return compositeFoam(
    {
      r: channel(ABSORPTION.r, BACKGROUND.r),
      g: channel(ABSORPTION.g, BACKGROUND.g),
      b: channel(ABSORPTION.b, BACKGROUND.b),
    },
    foam,
  );
}

/**
 * The same bubble energy over the same path, added as a white tint AFTER
 * absorption: grey milk. `S·d` is the scattered energy the correct model
 * integrates; here nothing filters it, so no hue shift can occur.
 */
export function shadeTintedAfter(depth: number, bubbles: number, foam = 0): WaterColour {
  const tint = bubbles * BUBBLE_YIELD * depth;
  return compositeFoam(
    {
      r: BACKGROUND.r * Math.exp(-ABSORPTION.r * depth) + tint,
      g: BACKGROUND.g * Math.exp(-ABSORPTION.g * depth) + tint,
      b: BACKGROUND.b * Math.exp(-ABSORPTION.b * depth) + tint,
    },
    foam,
  );
}

function compositeFoam(colour: WaterColour, foam: number): WaterColour {
  if (foam <= 0) return colour;
  const cover = Math.min(1, foam) * FOAM_CEILING;
  return {
    r: colour.r * (1 - cover) + FOAM_COLOUR.r * cover,
    g: colour.g * (1 - cover) + FOAM_COLOUR.g * cover,
    b: colour.b * (1 - cover) + FOAM_COLOUR.b * cover,
  };
}

// --- Breaking detection -----------------------------------------------------

export type ChopSample = {
  /** Horizontal Gerstner displacement, metres. */
  displacementX: number;
  displacementZ: number;
  /** Partial derivatives of that displacement map. */
  dXdx: number;
  dXdz: number;
  dZdx: number;
  dZdz: number;
  /** det(I + ∂D/∂p). 1 is undisturbed, <1 compressed, <0 folded over. */
  jacobian: number;
};

/**
 * Horizontal Gerstner displacement of the frozen band table, and the analytic
 * Jacobian determinant of that same displacement.
 *
 *   D(p)  = Σ  Q·A_i · d_i · cos(φ_i)
 *   φ_i   = k_i (d_i · p) − ω_i t + ϕ_i
 *   ∂D/∂p = −Σ Q·k_i·A_i · (d_i ⊗ d_i) · sin(φ_i)
 *   J     = det(I + ∂D/∂p)
 *
 * `choppiness` is the Gerstner Q. The repository authors it at
 * OCEAN_STEEPNESS_GAIN (0.42) and then presents it at
 * OCEAN_CHOP_PRESENTATION_GAIN of that, which is why the shipping surface is
 * reproduced by `gerstnerChop(x, z, t, OCEAN_REFERENCE_AMPLITUDE,
 * OCEAN_STEEPNESS_GAIN * OCEAN_CHOP_PRESENTATION_GAIN)`.
 *
 * The outer product makes ∂Dx/∂z and ∂Dz/∂x identical — the displacement is a
 * gradient field — and the CPU check asserts that rather than assuming it.
 */
export function gerstnerChop(
  x: number,
  z: number,
  timeSeconds: number,
  amplitude: number,
  choppiness: number,
): ChopSample {
  let displacementX = 0;
  let displacementZ = 0;
  let dXdx = 0;
  let dXdz = 0;
  let dZdz = 0;
  for (const band of OCEAN_BANDS) {
    const bandAmplitude = band.weight * amplitude;
    const phase = (x * band.directionX + z * band.directionZ) * band.waveNumber
      - timeSeconds * band.angularFrequency
      + band.phase;
    const horizontal = choppiness * bandAmplitude;
    const cosPhase = Math.cos(phase);
    const sinPhase = Math.sin(phase);
    displacementX += horizontal * band.directionX * cosPhase;
    displacementZ += horizontal * band.directionZ * cosPhase;
    const fold = horizontal * band.waveNumber * sinPhase;
    dXdx -= fold * band.directionX * band.directionX;
    dXdz -= fold * band.directionX * band.directionZ;
    dZdz -= fold * band.directionZ * band.directionZ;
  }
  return {
    displacementX,
    displacementZ,
    dXdx,
    dXdz,
    dZdx: dXdz,
    dZdz,
    jacobian: (1 + dXdx) * (1 + dZdz) - dXdz * dXdz,
  };
}

/** Compression at which air entrainment starts. 1 is an undisturbed surface. */
export const BREAKING_ONSET = 0.55;

/**
 * Turbulence from the fold, not from the slope. Exactly zero on any surface
 * that is not being compressed past the onset — which is the carrier skill's
 * own acceptance rule, "zero in calm water", made mechanical.
 */
export function breakingTurbulence(jacobian: number): number {
  if (jacobian >= BREAKING_ONSET) return 0;
  return Math.min(1, (BREAKING_ONSET - jacobian) / BREAKING_ONSET);
}

export type FoamParameters = {
  /** Exponential time constant, seconds. Bubbles outlive the crest. */
  decaySeconds: number;
  /** Deposition rate from breaking, per second. */
  crestStrength: number;
  /** Extra deposition on the windward flank, per second. */
  windwardStrength: number;
};

export const FOAM_DEFAULTS: FoamParameters = {
  decaySeconds: 2.4,
  crestStrength: 1.7,
  windwardStrength: 0.9,
};

export type FoamField = {
  readonly energy: Float32Array;
  readonly parameters: FoamParameters;
  /** Adds this step's entrainment at one surface point. */
  deposit: (index: number, turbulence: number, windward: number, dt: number) => void;
  /** Exponential decay of the whole field by one step. */
  decay: (dt: number) => void;
  reset: () => void;
};

/**
 * Foam as accumulated state. A threshold evaluated per frame gives foam that
 * blinks with the wave; this keeps the energy after the crest has moved on and
 * lets it fade, which is the difference between surf and a moving texture.
 */
export function createFoamField(
  count: number,
  parameters: FoamParameters = FOAM_DEFAULTS,
): FoamField {
  const energy = new Float32Array(count);
  return {
    energy,
    parameters,
    deposit: (index, turbulence, windward, dt) => {
      if (turbulence <= 0) return;
      const gained = (parameters.crestStrength
        + parameters.windwardStrength * Math.max(0, windward)) * turbulence * dt;
      energy[index] = Math.min(1, energy[index] + gained);
    },
    decay: (dt) => {
      const retained = Math.exp(-dt / parameters.decaySeconds);
      for (let i = 0; i < energy.length; i += 1) energy[i] *= retained;
    },
    reset: () => energy.fill(0),
  };
}

// --- The exhibit ------------------------------------------------------------

const SEGMENTS = 40;
const EXTENT = 2.4;
/** Panel units to metres: the exhibit is a 1:20 model of a 48 m shore patch. */
const METRES_PER_UNIT = 20;
/**
 * ONE knob is moved, and here is the reason.
 *
 * Wave AMPLITUDE is gameplay authority in this repository and is deliberately
 * left at the authored value — the exhibit sea is exactly the shipped sea's
 * height field. Choppiness Q is the presentation-only lateral term, and there
 * the authored value cannot show the phenomenon: summed Q·k·A at the shipped
 * 0.42 x 0.22 is 0.017, so the Jacobian never leaves the neighbourhood of 1
 * and nothing ever folds. That is a true and useful finding about our forge —
 * reported as `shippingJacobianMinimum` — and not a licence to fake a fold, so
 * the exhibit raises Q, and only Q, to 8. That is past the classical
 * non-self-intersecting bound on purpose: a breaking wave IS a surface that
 * has folded, and a Q held below the bound can never produce one.
 */
const EXHIBIT_AMPLITUDE = OCEAN_REFERENCE_AMPLITUDE;
const EXHIBIT_CHOPPINESS = 8.0;
/** Vertical exaggeration of the DISPLAY only; no physics term is exaggerated. */
const VERTICAL_EXAGGERATION = 3.0;
const WARMUP_STEPS = 120;
const WARMUP_DT = 1 / 60;

/**
 * Sea floor under the patch, metres: a shoaling shelf from 0.4 m to 3.4 m.
 * Shallow on purpose — a 3.1 m wave height breaks at roughly 4 m of depth, so
 * this patch is the surf zone, which is the one place entrained bubbles, foam
 * and a readable absorption ramp all exist at once.
 */
function depthAt(v: number): number {
  return 0.4 + ((v + EXTENT / 2) / EXTENT) * 3.0;
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const root = new THREE.Group();
  root.name = 'source-46-absorption-backscatter-and-breaking';
  const { before, after } = beforeAfterPanels(THREE, 3.0);

  type Panel = {
    geometry: import('three').BufferGeometry;
    colours: Float32Array;
    shade: (depth: number, bubbles: number, foam: number) => WaterColour;
  };
  const panels: Panel[] = [];

  for (const [group, shade] of [
    [before, shadeTintedAfter],
    [after, shadeCorrect],
  ] as const) {
    const geometry = new THREE.PlaneGeometry(EXTENT, EXTENT, SEGMENTS, SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
    const colours = new Float32Array(geometry.getAttribute('position').count * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.22,
        metalness: 0.0,
      }),
    );
    mesh.name = group === before ? 'tint-after-absorption' : 'scatter-before-absorption';
    group.add(mesh);
    panels.push({ geometry, colours, shade });
  }

  // The undisplaced lattice. Both panels are the SAME water: one physics pass
  // feeds two colour models, so the only difference on screen is the shading.
  const vertexCount = panels[0].geometry.getAttribute('position').count;
  const restU = new Float32Array(vertexCount);
  const restV = new Float32Array(vertexCount);
  {
    const position = panels[0].geometry.getAttribute('position');
    for (let i = 0; i < vertexCount; i += 1) {
      restU[i] = position.getX(i);
      restV[i] = position.getZ(i);
    }
  }

  const foam = createFoamField(vertexCount);
  const bubbles = new Float32Array(vertexCount);
  const displacedY = new Float32Array(vertexCount);
  const displacedU = new Float32Array(vertexCount);
  const displacedV = new Float32Array(vertexCount);

  const leadDirectionX = OCEAN_BANDS[0].directionX;
  const leadDirectionZ = OCEAN_BANDS[0].directionZ;

  // Running extremes since construction, NOT this frame's. A single frame can
  // legitimately catch the patch between breakers, and a counter that read
  // zero then would misreport the exhibit rather than the instant.
  let minJacobianSeen = Number.POSITIVE_INFINITY;
  let peakBreakingVertices = 0;

  /** One physics step: surface, fold test, entrainment, decay. */
  function advanceSurface(timeSeconds: number, dt: number): void {
    let breaking = 0;
    for (let i = 0; i < vertexCount; i += 1) {
      const worldX = restU[i] * METRES_PER_UNIT;
      const worldZ = restV[i] * METRES_PER_UNIT;
      const sample = sampleOcean(worldX, worldZ, timeSeconds, EXHIBIT_AMPLITUDE);
      const chop = gerstnerChop(
        worldX,
        worldZ,
        timeSeconds,
        EXHIBIT_AMPLITUDE,
        EXHIBIT_CHOPPINESS,
      );
      displacedU[i] = restU[i] + chop.displacementX / METRES_PER_UNIT;
      displacedV[i] = restV[i] + chop.displacementZ / METRES_PER_UNIT;
      displacedY[i] = (sample.height / METRES_PER_UNIT) * VERTICAL_EXAGGERATION;

      if (chop.jacobian < minJacobianSeen) minJacobianSeen = chop.jacobian;
      const turbulence = breakingTurbulence(chop.jacobian);
      if (turbulence > 0) breaking += 1;
      // Windward flank: the face whose height rises along the lead band's
      // direction of travel. Foam piles up there before the crest throws.
      const slope = Math.hypot(sample.slopeX, sample.slopeZ);
      const windward = slope > 1e-9
        ? (sample.slopeX * leadDirectionX + sample.slopeZ * leadDirectionZ) / slope
        : 0;
      foam.deposit(i, turbulence, windward, dt);
    }
    if (breaking > peakBreakingVertices) peakBreakingVertices = breaking;
    foam.decay(dt);
    // One state, two consumers: what surfaced is foam, what stayed under is the
    // scattering source. They cannot disagree because they are the same number.
    for (let i = 0; i < vertexCount; i += 1) bubbles[i] = foam.energy[i];
  }

  function writePanels(): void {
    for (const panel of panels) {
      const position = panel.geometry.getAttribute('position');
      for (let i = 0; i < vertexCount; i += 1) {
        position.setXYZ(i, displacedU[i], displacedY[i], displacedV[i]);
        const colour = panel.shade(depthAt(restV[i]), bubbles[i], foam.energy[i]);
        panel.colours[i * 3] = colour.r;
        panel.colours[i * 3 + 1] = colour.g;
        panel.colours[i * 3 + 2] = colour.b;
      }
      position.needsUpdate = true;
      panel.geometry.getAttribute('color').needsUpdate = true;
      panel.geometry.computeVertexNormals();
    }
  }

  // Deterministic warm-up: the foam field is state, so a demo that opens at
  // t=0 with an empty field would show the technique only after the host had
  // been running it for a while. Two seconds of fixed steps, always the same.
  let elapsed = 0;
  for (let step = 0; step < WARMUP_STEPS; step += 1) {
    elapsed += WARMUP_DT;
    advanceSurface(elapsed, WARMUP_DT);
  }
  writePanels();

  root.add(before, after);
  const draws = countDraws(root);

  /**
   * The measured statement about our own forge: at the authored amplitude and
   * the authored Q (times the presentation gain), how close does the shipping
   * sea ever come to folding? Sampled over the same patch and a wave period.
   */
  function measureShippingJacobian(): number {
    const shippingChoppiness = OCEAN_STEEPNESS_GAIN * OCEAN_CHOP_PRESENTATION_GAIN;
    let minimum = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 16; step += 1) {
      const time = step * 0.75;
      for (let i = 0; i < vertexCount; i += 4) {
        const chop = gerstnerChop(
          restU[i] * METRES_PER_UNIT,
          restV[i] * METRES_PER_UNIT,
          time,
          OCEAN_REFERENCE_AMPLITUDE,
          shippingChoppiness,
        );
        if (chop.jacobian < minimum) minimum = chop.jacobian;
      }
    }
    return minimum;
  }
  const shippingJacobianMinimum = measureShippingJacobian();

  const deepest = depthAt(EXTENT / 2);
  const peak = shadeCorrect(deepest, 1);
  const peakTinted = shadeTintedAfter(deepest, 1);

  return {
    root,
    update: (_time: number, dt: number) => {
      elapsed += dt;
      advanceSurface(elapsed, dt);
      writePanels();
    },
    dispose: () => {
      foam.reset();
      disposeTree(root);
    },
    metadata: {
      sourceId: 46,
      title: 'Beer-Lambert absorption with broadband backscatter upstream of the integral',
      method:
        'Per-channel Beer-Lambert absorption over a real depth ramp, with a spectrally flat '
        + 'bubble source injected INSIDE the absorption integral — L = bg·e^(-a·d) + (S/a)·(1 - '
        + 'e^(-a·d)) — so the 1/a factor returns it brighter and green-shifted. The before panel '
        + 'adds the identical bubble energy as a white tint AFTER absorption and goes grey. The '
        + 'source is driven by the determinant of the horizontal-displacement Jacobian, the fold '
        + 'test that locates breaking, and accumulates into one decaying field read twice: as '
        + 'surface foam composited after absorption, and as the bubble source inside it.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/dangreenheck/status/2095028187063280085',
        'https://docs.threejswaterpro.com/license.html',
      ],
      limitation:
        'This is items 4, 6 and the breaking-detection half of item 7, and nothing else. There is '
        + 'NO FFT ocean here: the spectrum is the repository\'s existing five-band Gerstner table '
        + 'via OCEAN_BANDS/sampleOcean, and calling it a multi-cascade JONSWAP/Phillips spectrum '
        + 'would be false. The foam field is per-vertex state on a fixed patch, NOT the source\'s '
        + 'world-fixed camera-following foam TEXTURE, and the three foam layers are not separated. '
        + 'No SSR, refraction, caustics, subsurface scattering, Snell window or clipmap LOD. '
        + 'Absorption coefficients are representative constants chosen to sit at a green minimum, '
        + 'NOT a fitted Jerlov water type — no Jerlov table was fetched, so none is claimed. Wave '
        + 'amplitude is the shipped authored value and is untouched; the presentation-only '
        + 'choppiness Q is raised from the shipped 0.42x0.22 to 8, past the non-self-intersecting '
        + 'bound, because a surface held below that bound cannot fold and therefore cannot break. '
        + 'Displayed height is exaggerated x3; the horizontal displacement the Jacobian is computed '
        + 'from is NOT exaggerated. At the shipped Q the same sea never approaches a fold (see '
        + 'shippingJacobianMinimum), so this mechanism would produce no foam at all on the current '
        + 'game ocean. Shading is evaluated per vertex on the CPU so the terms are assertable '
        + 'without a GPU; the shipping form of all of it is TSL in the node material.',
      localLights: [],
      counters: {
        surfaceVertices: vertexCount,
        metresPerUnit: METRES_PER_UNIT,
        exhibitChoppiness: EXHIBIT_CHOPPINESS,
        minJacobianSeen: Math.round(minJacobianSeen * 1000) / 1000,
        peakBreakingVertices,
        shippingJacobianMinimum: Math.round(shippingJacobianMinimum * 1000) / 1000,
        foamDecaySeconds: FOAM_DEFAULTS.decaySeconds,
        peakGreenMinusRed: Math.round((peak.g - peak.r) * 1000) / 1000,
        tintedGreenMinusRed: Math.round((peakTinted.g - peakTinted.r) * 1000) / 1000,
        meshes: draws.meshes,
        triangles: draws.triangles,
      },
    },
  };
}

export default createDemo;
