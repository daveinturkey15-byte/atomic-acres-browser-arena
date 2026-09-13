/**
 * Source 4 — Underwater volume and waterline cutting (owner-shared video, no repo).
 *
 * Primary source actually read: the post, served by x.com, captured 2026-09-12.
 * Author text verbatim from the page's own og:description:
 *   "There's something in the water... Playing with how the underwater mesh
 *    distorts the ocean surface with domes and laminar flow around the front.
 *    Still need to get the cutting of the surface to be better, but coming along."
 *
 * That last clause is the whole reason this row is valuable: the source itself
 * has NOT solved the waterline cut. This demo therefore implements the half that
 * is solved and shows the half that is not, rather than pretending both work.
 *
 *   Implemented: a submerged body displaces the surface as a dome, with a laminar
 *   deflection ahead of its travel direction, computed per vertex from the body's
 *   position and heading.
 *   Shown as unsolved: the waterline cut. The right-hand half applies a naive
 *   depth-test cut and the artefact it produces — a stair-stepped tear at grid
 *   resolution, with no cap — is left visible and counted, not hidden.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';
import type * as THREE_NS from 'three';

const SEG = 44;

interface Surface {
  group: THREE_NS.Group;
  geometry: THREE_NS.BufferGeometry;
  rest: THREE_NS.BufferAttribute | THREE_NS.InterleavedBufferAttribute;
  body: THREE_NS.Mesh;
}

function buildSurface(THREE: ThreeNamespace, registry: DisposalRegistry, name: string): Surface {
  const group = new THREE.Group();
  group.name = name;

  const geometry = registry.track(new THREE.PlaneGeometry(2, 2, SEG, SEG));
  geometry.rotateX(-Math.PI / 2);
  const colours = new Float32Array(geometry.getAttribute('position').count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const material = registry.track(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      roughness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const water = new THREE.Mesh(geometry, material);
  water.name = 'water-surface';
  water.renderOrder = 2;
  group.add(water);

  const bodyGeometry = registry.track(new THREE.CapsuleGeometry(0.11, 0.34, 6, 12));
  bodyGeometry.rotateZ(Math.PI / 2);
  const bodyMaterial = registry.track(new THREE.MeshStandardMaterial({ color: 0x4b5b63, roughness: 0.55 }));
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = 'submerged-body';
  group.add(body);

  return { group, geometry, rest: geometry.getAttribute('position').clone(), body };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();

  const domed = buildSurface(THREE, registry, 'before:dome-and-laminar-only');
  const cut = buildSurface(THREE, registry, 'after:dome-plus-naive-waterline-cut');

  const root = sideBySide(THREE, registry, domed.group, cut.group, 2.6);
  root.name = 'source-04:underwater-volume-and-waterline-cut';

  const surfaceColour = new THREE.Color(0x1c6f8c);
  const domeColour = new THREE.Color(0x8fd4e0);
  const tearColour = new THREE.Color(0xd94f3d); // the artefact is marked, not hidden
  const scratch = new THREE.Color();

  const bodyPos = new THREE.Vector3();
  const heading = new THREE.Vector2(1, 0);

  let tornVertices = 0;

  const write = (time: number) => {
    // Deterministic path: a slow circuit, so the laminar term has a real heading.
    const angle = time * 0.55;
    bodyPos.set(Math.cos(angle) * 0.5, -0.16, Math.sin(angle) * 0.5);
    heading.set(-Math.sin(angle), Math.cos(angle));

    tornVertices = 0;
    for (const [surface, applyCut] of [
      [domed, false],
      [cut, true],
    ] as Array<[Surface, boolean]>) {
      surface.body.position.copy(bodyPos);
      surface.body.rotation.y = -angle;

      const position = surface.geometry.getAttribute('position');
      const colour = surface.geometry.getAttribute('color');
      for (let i = 0; i < position.count; i += 1) {
        const x = surface.rest.getX(i);
        const z = surface.rest.getZ(i);
        const dx = x - bodyPos.x;
        const dz = z - bodyPos.z;
        const r = Math.hypot(dx, dz);

        // Dome: displaced volume pushed up, falling off with radius and depth.
        const depth = Math.max(0.02, -bodyPos.y);
        const dome = (0.075 / depth) * Math.exp(-(r * r) / 0.045);

        // Laminar deflection: the surface is pushed forward of the body and drawn
        // in behind it, keyed on the component of the offset along the heading.
        const along = (dx * heading.x + dz * heading.y) / Math.max(1e-3, r);
        const laminar = dome * along * 0.85;

        const swell = Math.sin(x * 4.1 + time) * 0.006;
        const y = swell + dome * 0.55 + laminar * 0.4;
        position.setXYZ(i, x, y, z);

        scratch.copy(surfaceColour).lerp(domeColour, Math.min(1, dome * 6));

        if (applyCut) {
          // The naive cut: any vertex whose surface height falls below the body's
          // top is pulled to the body silhouette. At grid resolution this tears.
          const bodyTop = bodyPos.y + 0.11;
          if (r < 0.22 && y < bodyTop) {
            position.setY(i, bodyTop);
            scratch.copy(tearColour);
            tornVertices += 1;
          }
        }
        colour.setXYZ(i, scratch.r, scratch.g, scratch.b);
      }
      position.needsUpdate = true;
      colour.needsUpdate = true;
      surface.geometry.computeVertexNormals();
    }
  };

  write(0);

  const metadata = {
    sourceId: 4,
    title: 'Underwater volume and waterline cutting',
    method:
      'Submerged-body surface interaction: a displaced-volume dome falling off with radius and body depth, plus a laminar deflection term keyed to the component of the surface offset along the body heading. The waterline cut is deliberately shown in its naive, failing form.',
    adaptation: 'adapted' as const,
    sources: [
      'https://x.com/gruberbuilds/status/2090235767922512234',
      'post text read 2026-09-12 from the page served by x.com (og:description)',
    ],
    limitation:
      'Comparator-only source: no repository or licence exists and the author states the surface cutting is still not good. The right-hand half exposes a real unsolved problem - a grid-resolution stair-stepped tear with no cap and no refraction through the cut - and must not be read as a solved waterline. Vertex count marked as torn is reported in counters so the failure is measurable.',
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      tornVertices,
    },
  };

  return {
    root,
    update(time: number) {
      write(time);
      metadata.counters.tornVertices = tornVertices;
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
