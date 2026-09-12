/**
 * Source 46 — Three.js Water Pro: Beer-Lambert absorption, and broadband
 * bubble backscatter injected UPSTREAM of the absorption integral.
 *
 * Licence position, and why this is the cleanest row in the group: the shipped
 * library is a paid Commercial Software License Agreement v2.2 (DRG Software
 * Solutions LLC, all rights reserved) — read as terms at
 * docs.threejswaterpro.com/license.html. Nothing was purchased, downloaded,
 * unpacked or deobfuscated, and the product repository `dgreenheck/webgpu-water`
 * is 404 (re-verified by this lane). The physics below is published graphics and
 * oceanography, not his expression: Beer-Lambert attenuation, and the fact that
 * entrained bubble clouds scatter close to spectrally flat.
 *
 * THE METHOD, and the one engineering consequence that is the whole point:
 *
 *   Water absorbs per channel, strongly in the red and near its minimum in the
 *   green. Bubbles entrained by breaking water scatter almost spectrally FLAT.
 *   Where you inject that flat source decides whether you get ocean glow or
 *   grey milk:
 *
 *     CORRECT (after panel)  L = bg·e^(-a·d) + ∫₀^d S·e^(-a·s) ds
 *                              = bg·e^(-a·d) + (S/a)·(1 - e^(-a·d))
 *            The flat source is filtered BY the absorption on its way out, so
 *            the 1/a factor makes it emerge brighter AND green-shifted, because
 *            a is smallest in the green.
 *
 *     WRONG (before panel)   L = bg·e^(-a·d) + S
 *            A white tint added after the integral. Spectrally flat in, flat
 *            out: the water just goes pale and grey. This is the mistake the
 *            source post exists to warn about, and it is reproduced here on
 *            purpose so the difference is inspectable rather than asserted.
 *
 * FORGE REUSE, concretely: the surface displacement is NOT reimplemented. This
 * demo calls `sampleOcean` from `src/water/ocean-spectrum.ts` — the repository's
 * sole CPU ocean authority — for height and slope, so the waves here and the
 * waves in the game come from one band table. Only the colour term is new,
 * which is precisely the gap the register records against that forge ("no
 * absorption, no depth-driven colour ... no backscatter").
 */

import { sampleOcean } from '../../../../water/ocean-spectrum';
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

export type WaterColour = { r: number; g: number; b: number };

/**
 * Backscatter injected as a source term inside the absorption integral.
 * `turbulence` in [0,1] drives the bubble density, exactly as it drives foam.
 */
export function shadeCorrect(depth: number, turbulence: number): WaterColour {
  const source = turbulence * 0.22;
  const channel = (absorption: number, background: number): number => {
    const transmitted = Math.exp(-absorption * depth);
    const scattered = (source / absorption) * (1 - transmitted);
    return background * transmitted + scattered;
  };
  return {
    r: channel(ABSORPTION.r, BACKGROUND.r),
    g: channel(ABSORPTION.g, BACKGROUND.g),
    b: channel(ABSORPTION.b, BACKGROUND.b),
  };
}

/** The same bubble energy added as a white tint after absorption: grey milk. */
export function shadeTintedAfter(depth: number, turbulence: number): WaterColour {
  const tint = turbulence * 0.22;
  return {
    r: BACKGROUND.r * Math.exp(-ABSORPTION.r * depth) + tint,
    g: BACKGROUND.g * Math.exp(-ABSORPTION.g * depth) + tint,
    b: BACKGROUND.b * Math.exp(-ABSORPTION.b * depth) + tint,
  };
}

const SEGMENTS = 48;
const EXTENT = 2.4;

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const root = new THREE.Group();
  root.name = 'source-46-absorption-and-backscatter';
  const { before, after } = beforeAfterPanels(THREE, 3.0);

  type Panel = {
    geometry: import('three').BufferGeometry;
    colours: Float32Array;
    shade: (depth: number, turbulence: number) => WaterColour;
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

  /**
   * Depth of the body under a surface point. A sloping floor so one exhibit
   * shows the whole shallow-to-deep ramp, which is where a per-channel
   * absorption model separates from a two-colour lerp.
   */
  function depthAt(x: number, z: number): number {
    return 0.15 + (z + EXTENT / 2) * 2.6;
  }

  let peakGreenShift = 0;

  function refresh(timeSeconds: number): void {
    for (const panel of panels) {
      const position = panel.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i);
        const z = position.getZ(i);
        // Surface shape from the repository's existing ocean authority.
        const sample = sampleOcean(x * 3.2, z * 3.2, timeSeconds, 0.055);
        position.setY(i, sample.height);
        // Turbulence estimator: surface slope magnitude, the same quantity a
        // Jacobian breaking test keys off and the same one that drives foam.
        const slope = Math.hypot(sample.slopeX, sample.slopeZ);
        const turbulence = Math.min(1, slope * 1.15);
        const colour = panel.shade(depthAt(x, z), turbulence);
        panel.colours[i * 3] = colour.r;
        panel.colours[i * 3 + 1] = colour.g;
        panel.colours[i * 3 + 2] = colour.b;
      }
      position.needsUpdate = true;
      panel.geometry.getAttribute('color').needsUpdate = true;
      panel.geometry.computeVertexNormals();
    }
    const correct = shadeCorrect(2.0, 1);
    peakGreenShift = correct.g - correct.r;
  }

  refresh(0);
  root.add(before, after);
  const draws = countDraws(root);

  let elapsed = 0;
  return {
    root,
    update: (_time: number, dt: number) => {
      elapsed += dt;
      refresh(elapsed);
    },
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 46,
      title: 'Beer-Lambert absorption with broadband backscatter upstream of the integral',
      method:
        'Per-channel Beer-Lambert absorption over a real depth ramp, with a spectrally flat '
        + 'bubble source injected INSIDE the absorption integral — L = bg·e^(-a·d) + (S/a)·(1 - '
        + 'e^(-a·d)) — so the 1/a factor returns it brighter and green-shifted. The before panel '
        + 'adds the identical bubble energy as a white tint AFTER absorption and goes grey. '
        + 'Turbulence is estimated from surface slope, the same quantity that drives foam.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/dangreenheck/status/2095028187063280085',
        'https://docs.threejswaterpro.com/license.html',
      ],
      limitation:
        'This is items 4 and 6 of the register\'s thirteen, and nothing else. There is NO FFT '
        + 'ocean here: the surface is the repository\'s existing Gerstner band table via '
        + 'sampleOcean, and calling it a multi-cascade JONSWAP/Phillips spectrum would be false. '
        + 'No persistent Jacobian foam field, no SSR, no refraction, no caustics, no subsurface '
        + 'scattering, no Snell window, no clipmap LOD. Absorption coefficients are '
        + 'representative constants chosen to sit at a green minimum, not a fitted Jerlov water '
        + 'type. Shading is evaluated per vertex on the CPU so the term is assertable without a '
        + 'GPU; the shipping form of this term is TSL in the node material.',
      localLights: [],
      counters: {
        surfaceVertices: (SEGMENTS + 1) * (SEGMENTS + 1),
        peakGreenMinusRed: Math.round(peakGreenShift * 1000) / 1000,
        meshes: draws.meshes,
        triangles: draws.triangles,
      },
    },
  };
}

export default createDemo;
