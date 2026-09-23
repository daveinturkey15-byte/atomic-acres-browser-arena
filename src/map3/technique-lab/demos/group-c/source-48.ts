/**
 * Source 48 — the dark-interior look bought with no lighting technology.
 *
 * The register's finding, established by falsifier rather than assertion: the
 * source frames show no sampling noise (not path traced), no colour bleed from
 * saturated props onto grey concrete (no real-time GI), and no cast shadows at
 * all (no lightmap — a bake gives those away for free). So the look is bought
 * with emissive fixtures above the bloom threshold, a handful of short-range
 * lights on VISIBLE fixtures only, heavy distance darkening to near-black,
 * flat matte grime decals, a sparse mote field, and one exposure event.
 *
 * Carrier skill read for this demo: `threejs-webgpu-interior-lighting-look`
 * v1.0.0 (read in full, sha256 f0a9ebbe...e732), whose recipe is ordered by
 * payoff: (1) correct repetitive architecture at human scale, (2) value
 * composition — ~85% of the frame in a narrow desaturated mid-dark band with a
 * few blown highlights and three or four saturated accents, (3) emissive
 * fixtures, (4) a few real lights only, (5) aggressive distance darkening,
 * (6) flat non-reflective grime, (7) motes, (8) exactly one exposure event.
 *
 * BEFORE is the same corridor lit flat and evenly — every surface in the middle
 * of the range, no accents, no falloff. AFTER applies items 2, 3, 5, 6 and 8.
 * The two fences the skill names are respected and are the reason this exhibit
 * darkens the way it does: the halo is NOT earned by lowering a bloom threshold
 * (this demo owns no post chain and changes no threshold), and the black far
 * end is NOT earned with a vignette — it comes from distance darkening and from
 * simply not lighting the far end, which is how the source does it.
 */

import { hash11 } from '../../../noise';
import {
  beforeAfterPanels,
  countDraws,
  disposeTree,
  paintVertices,
  type Demo,
  type DemoContext,
} from './shared';

const LENGTH = 7.0;
const WIDTH = 1.9;
const HEIGHT = 1.5;
/** Distance darkening reaches near-black by the end of the corridor. */
const FALLOFF_END = LENGTH * 0.86;

/** Depth darkening evaluated locally, never as scene fog. */
function depthFactor(z: number): number {
  const distance = Math.max(0, z + LENGTH / 2);
  return Math.max(0.03, 1 - distance / FALLOFF_END);
}

/** Flat, matte, non-reflective grime: stains and damp blotches, no gloss. */
function grime(x: number, y: number, z: number): number {
  const stain = hash11(Math.floor(x * 3.1) * 71.3 + Math.floor(z * 3.1) * 13.7);
  const damp = 0.5 + 0.5 * Math.sin(z * 1.7 + y * 2.3) * Math.cos(x * 2.9 - z * 0.8);
  return 0.78 + stain * 0.16 + damp * 0.06;
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const root = new THREE.Group();
  root.name = 'source-48-interior-look-without-gi';
  const { before, after } = beforeAfterPanels(THREE, 3.2);

  const localLights: string[] = [];

  function buildCorridor(group: import('three').Group, graded: boolean): void {
    // (1) Correct, repetitive architecture at human scale: floor, two walls, a
    // beamed ceiling and columns on a regular pitch. Boxes and planes only.
    const surfaces: Array<{
      name: string;
      geometry: import('three').BufferGeometry;
      base: [number, number, number];
    }> = [];

    const floor = new THREE.PlaneGeometry(WIDTH, LENGTH, 6, 40);
    floor.rotateX(-Math.PI / 2);
    surfaces.push({ name: 'floor', geometry: floor, base: [0.30, 0.31, 0.30] });

    for (const side of [-1, 1]) {
      const wall = new THREE.PlaneGeometry(LENGTH, HEIGHT, 40, 6);
      wall.rotateY((side * Math.PI) / 2);
      wall.translate((side * WIDTH) / 2, HEIGHT / 2, 0);
      surfaces.push({ name: `wall${side}`, geometry: wall, base: [0.33, 0.34, 0.33] });
    }

    const ceiling = new THREE.PlaneGeometry(WIDTH, LENGTH, 6, 40);
    ceiling.rotateX(Math.PI / 2);
    ceiling.translate(0, HEIGHT, 0);
    surfaces.push({ name: 'ceiling', geometry: ceiling, base: [0.26, 0.27, 0.27] });

    for (const surface of surfaces) {
      if (graded) {
        // (2) value composition + (5) distance darkening + (6) grime, all as
        // one per-vertex evaluation. The band is deliberately narrow and
        // desaturated: nothing here is allowed a saturated colour.
        paintVertices(THREE, surface.geometry, (x, y, z) => {
          const fade = depthFactor(z);
          const dirt = grime(x, y, z);
          // A green-grey shadow tint and a faintly warm highlight tint.
          const level = surface.base[1] * dirt * fade;
          return [level * 0.92, level * 1.0, level * 0.94];
        });
      } else {
        paintVertices(THREE, surface.geometry, () => [0.52, 0.52, 0.53]);
      }
      const mesh = new THREE.Mesh(
        surface.geometry,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: graded ? 0.97 : 0.75,
          metalness: 0,
        }),
      );
      mesh.name = surface.name;
      group.add(mesh);
    }

    // Columns on a regular pitch — the repetition that reads as "built".
    const columnGeometry = new THREE.BoxGeometry(0.16, HEIGHT, 0.16);
    const columnMaterial = new THREE.MeshStandardMaterial({
      color: graded ? 0x2b2e2c : 0x868a8c,
      roughness: 0.95,
      metalness: 0,
    });
    for (let i = 0; i < 6; i += 1) {
      const z = -LENGTH / 2 + 0.8 + i * 1.15;
      for (const side of [-1, 1]) {
        const column = new THREE.Mesh(columnGeometry, columnMaterial);
        column.position.set((side * (WIDTH / 2 - 0.14)), HEIGHT / 2, z);
        column.name = `column-${i}-${side}`;
        group.add(column);
      }
    }

    // (3) Emissive fixture bars. The face is flat emissive; in the shipped
    // renderer the halo is the existing post chain's bloom, not geometry and
    // not a lowered threshold.
    const fixtureGeometry = new THREE.BoxGeometry(0.5, 0.04, 0.09);
    const fixtureMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: graded ? 0xffe899 : 0x8a8a80,
      emissiveIntensity: graded ? 2.5 : 0.4,
      roughness: 0.4,
    });
    // Only the near fixtures exist. The far end is not lit at all, which is
    // where the darkness comes from.
    const fixtureCount = 3;
    for (let i = 0; i < fixtureCount; i += 1) {
      const fixture = new THREE.Mesh(fixtureGeometry, fixtureMaterial);
      fixture.position.set(0, HEIGHT - 0.05, -LENGTH / 2 + 1.0 + i * 1.5);
      fixture.name = `fixture-${i}`;
      group.add(fixture);

      // (4) A few real lights only, and only at VISIBLE fixtures. Two, short
      // range, unshadowed, inverse-square. Declared in metadata.
      if (graded && i < 2) {
        const light = new THREE.PointLight(0xffe2a8, 1.5, 2.6, 2);
        light.name = `fixture-local-${i}`;
        light.position.copy(fixture.position);
        light.position.y -= 0.12;
        group.add(light);
        localLights.push(light.name);
      }
    }

    // (2, accents) three or four small saturated accents against the grey.
    if (graded) {
      const accentGeometry = new THREE.BoxGeometry(0.09, 0.28, 0.03);
      const accentMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: 0xd23b2a,
        emissiveIntensity: 1.1,
        roughness: 0.6,
      });
      for (let i = 0; i < 3; i += 1) {
        const accent = new THREE.Mesh(accentGeometry, accentMaterial);
        accent.position.set(
          (i % 2 === 0 ? -1 : 1) * (WIDTH / 2 - 0.04),
          0.7,
          -LENGTH / 2 + 1.4 + i * 1.6,
        );
        accent.name = `accent-${i}`;
        group.add(accent);
      }

      // (6) Flat, matte, hard-edged dark wet patches. No reflection at all,
      // and they still read as wet — the source's own trick.
      const patchGeometry = new THREE.CircleGeometry(0.26, 12);
      patchGeometry.rotateX(-Math.PI / 2);
      const patchMaterial = new THREE.MeshStandardMaterial({
        color: 0x14100d,
        roughness: 1,
        metalness: 0,
      });
      for (let i = 0; i < 4; i += 1) {
        const patch = new THREE.Mesh(patchGeometry, patchMaterial);
        patch.position.set(
          (hash11(i * 5.1) - 0.5) * (WIDTH - 0.5),
          0.002,
          -LENGTH / 2 + 1.0 + i * 1.3,
        );
        patch.scale.setScalar(0.7 + hash11(i * 9.7) * 0.5);
        patch.name = `wet-patch-${i}`;
        group.add(patch);
      }
    }
  }

  buildCorridor(before, false);
  buildCorridor(after, true);

  // (7) A sparse mote field, densest inside the lit volume, and (8) exactly ONE
  // exposure event: a single bright emissive that travels the corridor.
  const moteCount = 140;
  const motePositions = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i += 1) {
    // Bias toward the lit near end: motes sell air where light exists.
    const bias = hash11(i * 3.3) ** 1.8;
    motePositions[i * 3] = (hash11(i * 7.7) - 0.5) * (WIDTH - 0.2);
    motePositions[i * 3 + 1] = 0.15 + hash11(i * 11.1) * (HEIGHT - 0.3);
    motePositions[i * 3 + 2] = -LENGTH / 2 + bias * LENGTH * 0.55;
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const moteMaterial = new THREE.PointsMaterial({
    color: 0xdcd6c4,
    size: 0.018,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
  });
  const motes = new THREE.Points(moteGeometry, moteMaterial);
  motes.name = 'mote-field';
  after.add(motes);

  const exposureGeometry = new THREE.BoxGeometry(0.34, 0.22, 0.06);
  const exposure = new THREE.Mesh(
    exposureGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xfff4d8,
      emissiveIntensity: 6,
      roughness: 0.3,
    }),
  );
  exposure.name = 'exposure-event';
  exposure.position.set(0, 0.75, LENGTH / 2);
  after.add(exposure);

  root.add(before, after);
  const draws = countDraws(root);

  let elapsed = 0;
  return {
    root,
    update: (_time: number, dt: number) => {
      elapsed += dt;
      // One event, travelling the dark far end toward the lit near end.
      const cycle = (elapsed % 9) / 9;
      exposure.position.z = LENGTH / 2 - cycle * LENGTH;
      const near = Math.max(0, 1 - Math.abs(exposure.position.z + LENGTH / 4) / 2.2);
      (exposure.material as any).emissiveIntensity = 2 + near * 9;
    },
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 48,
      title: 'Dark interior look with no GI, lightmaps or ray tracing',
      method:
        'Repetitive human-scale architecture, ~85% of surfaces held in a narrow desaturated '
        + 'mid-dark band, emissive fixture bars, exactly two short-range unshadowed lights on '
        + 'visible fixtures only, distance darkening to near-black evaluated per vertex, flat '
        + 'matte non-reflective wet patches and grime, a mote field biased to the lit volume, '
        + 'and exactly one travelling exposure event. The far end is dark because nothing lights '
        + 'it, not because a vignette or a lowered bloom threshold made it dark.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/bijanbowen/status/2094931925513261273',
        'https://api.fxtwitter.com/bijanbowen/status/2094931925513261273',
      ],
      limitation:
        'The source is an unpublished localhost build with no licence and no code; nothing is '
        + 'copied — not frames, signage, station identity or HUD. This exhibit owns no post '
        + 'chain, so the bloom halo and filmic grade that carry items 3 and 8 in the shipped '
        + 'renderer are ABSENT: the fixtures are emissive geometry without their halo, and the '
        + 'exposure event does not blow the frame or throw shafts. Distance darkening is baked '
        + 'per vertex because a lab exhibit may not set global fog. Graded vertex colour is not '
        + 'a tonemap. Readability/silhouette-separation parity is not measured here.',
      localLights,
      counters: {
        realLights: localLights.length,
        shadowedLights: 0,
        emissiveFixtures: 3,
        saturatedAccents: 3,
        motes: moteCount,
        exposureEvents: 1,
        meshes: draws.meshes,
        triangles: draws.triangles,
      },
    },
  };
}

export default createDemo;
