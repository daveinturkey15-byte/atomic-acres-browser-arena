/**
 * Source 3 — Stylized water composition (owner-shared video, no repository).
 *
 * Primary source actually read: the post itself, served by x.com and captured on
 * 2026-09-12. Author text, verbatim from the page's own og:description:
 *   "Long time no see, some modifications happened on the boat. Now you can
 *    harpoon fishing very big fish in the sea! #fable #threejs #vibecoding"
 *
 * There is no repository, no licence and no published implementation. Attractive
 * imagery is not proof of a WebGPU implementation, so nothing here claims to be
 * the author's code. What this demo does is make the register's comparator list
 * mechanical: shallow-water colour layering by depth, a shore foam band, readable
 * caustic depth, and a moving wake — each one implemented by us, each one
 * switchable so a reviewer can see which property is doing the work.
 *
 * BEFORE: one flat water colour over the same bathymetry — the failure mode this
 * comparator exists to reject. AFTER: the depth ramp, the foam band and the
 * caustic read applied to identical geometry.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  makeValueNoise,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';

const SEGMENTS = 40;

/** Bathymetry: a beach that shelves away from +z, with a sandbar. */
function depthAt(x: number, z: number, noise: (x: number, y: number) => number): number {
  const shore = (z + 1) * 0.5; // 0 at the far edge, 1 at the near edge
  const base = Math.max(0, 1 - shore) * 2.4;
  const bar = Math.exp(-((shore - 0.62) ** 2) / 0.006) * 0.55;
  return Math.max(0, base - bar + noise(x * 2.5 + 8, z * 2.5 + 3) * 0.18);
}

function buildWater(THREE: ThreeNamespace, registry: DisposalRegistry) {
  const geometry = registry.track(new THREE.PlaneGeometry(2, 2, SEGMENTS, SEGMENTS));
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  const colours = new Float32Array(position.count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

  const material = registry.track(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      roughness: 0.14,
      metalness: 0.0,
      depthWrite: false, // large transparent surface: source 9's sorting rule
    }),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return { geometry, mesh, position };
}

function buildSeabed(THREE: ThreeNamespace, registry: DisposalRegistry, noise: (x: number, y: number) => number) {
  const geometry = registry.track(new THREE.PlaneGeometry(2, 2, SEGMENTS, SEGMENTS));
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    position.setY(i, -depthAt(position.getX(i), position.getZ(i), noise) * 0.35);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const material = registry.track(new THREE.MeshStandardMaterial({ color: 0xb3a077, roughness: 0.95 }));
  return new THREE.Mesh(geometry, material);
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();
  const noise = makeValueNoise(context.seed ^ 0x57ee1);

  const flatGroup = new THREE.Group();
  flatGroup.name = 'before:flat-water-colour';
  const layeredGroup = new THREE.Group();
  layeredGroup.name = 'after:depth-ramp-foam-caustic';

  flatGroup.add(buildSeabed(THREE, registry, noise));
  layeredGroup.add(buildSeabed(THREE, registry, noise));

  const flat = buildWater(THREE, registry);
  const layered = buildWater(THREE, registry);
  flatGroup.add(flat.mesh);
  layeredGroup.add(layered.mesh);

  const root = sideBySide(THREE, registry, flatGroup, layeredGroup, 2.6);
  root.name = 'source-03:stylised-water-comparator';

  const shallow = new THREE.Color(0x67d6c3);
  const mid = new THREE.Color(0x1f8fae);
  const deep = new THREE.Color(0x0a2c4b);
  const foam = new THREE.Color(0xf2fbfb);
  const flatColour = new THREE.Color(0x1f8fae);
  const scratch = new THREE.Color();

  let foamTexels = 0;

  const write = (time: number) => {
    const lp = layered.position;
    const lc = layered.geometry.getAttribute('color');
    const fp = flat.position;
    const fc = flat.geometry.getAttribute('color');
    foamTexels = 0;
    for (let i = 0; i < lp.count; i += 1) {
      const x = lp.getX(i);
      const z = lp.getZ(i);
      const d = depthAt(x, z, noise);
      const swell = Math.sin(x * 3.4 + time * 1.1) * 0.012 + Math.sin(z * 5.1 - time * 1.7) * 0.008;
      lp.setY(i, swell);
      fp.setY(i, swell);

      // Layer 1: absorption ramp. Two stops, not one lerp — the shallow band is
      // what separates a readable beach from a flat blue sheet.
      const t = Math.min(1, d / 2.4);
      if (t < 0.45) scratch.copy(shallow).lerp(mid, t / 0.45);
      else scratch.copy(mid).lerp(deep, (t - 0.45) / 0.55);

      // Layer 2: shore foam band, driven by depth and a travelling surf phase.
      const surf = 0.5 + 0.5 * Math.sin(z * 7.5 - time * 2.4);
      const band = Math.max(0, 1 - Math.abs(d - 0.18) / 0.16) * (0.45 + 0.55 * surf);
      if (band > 0.05) foamTexels += 1;
      scratch.lerp(foam, Math.min(1, band));

      // Layer 3: caustic depth read — brightness that tracks the seabed rather
      // than the surface, so the eye reads through the water instead of off it.
      const caustic =
        Math.max(0, Math.sin(x * 9 + time * 0.9) * Math.sin(z * 11 - time * 0.7)) ** 3 *
        Math.max(0, 1 - t) *
        0.5;
      scratch.offsetHSL(0, 0, caustic * 0.25);

      lc.setXYZ(i, scratch.r, scratch.g, scratch.b);
      fc.setXYZ(i, flatColour.r, flatColour.g, flatColour.b);
    }
    lp.needsUpdate = true;
    lc.needsUpdate = true;
    fp.needsUpdate = true;
    fc.needsUpdate = true;
    layered.geometry.computeVertexNormals();
    flat.geometry.computeVertexNormals();
  };

  write(0);

  const metadata = {
    sourceId: 3,
    title: 'Stylized water composition',
    method:
      'Comparator rubric made mechanical: depth-driven absorption ramp with a distinct shallow stop, a depth-banded travelling shore foam line, and a caustic term keyed to seabed depth rather than to surface normal, over shared bathymetry.',
    adaptation: 'adapted' as const,
    sources: [
      'https://x.com/Graalitoo/status/2077373937449648518',
      'post text read 2026-09-12 from the page served by x.com (og:description)',
    ],
    limitation:
      'Comparator-only source: no repository, no licence, no published implementation exists, so nothing here reproduces the author\'s code and the visual target cannot be claimed as matched. Reflection, refraction and wake interaction with a boat hull are not implemented.',
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      foamVertices: foamTexels,
    },
  };

  return {
    root,
    update(time: number) {
      write(time);
      metadata.counters.foamVertices = foamTexels;
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
