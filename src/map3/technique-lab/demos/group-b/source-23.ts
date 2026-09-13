/**
 * Source 23 - Hand-written GLSL combat sim with deforming terrain (Battle of Hoth).
 *
 * Primary source, read at the pinned revision on 2026-09-12:
 *   https://github.com/csanz/battle-of-the-hoth-simulator @ bc057e2ce52254bc2e3c2bd6feaaaf4625dddee8
 *   src/terrain/deformation.js (11,649 bytes), src/shaders/lib/deform.glsl (3,706 bytes).
 *
 * LICENCE POSITION - load-bearing. Our own probe of `LICENSE` at the pinned revision returned
 * HTTP 404 (recorded in url-attempts.json), independently confirming the register's finding:
 * there is no licence, so under default copyright the repository is all rights reserved. It
 * was read to learn the method and NOTHING of its expression is reproduced here - no code, no
 * shader body, no constants table. This implementation is our own.
 *
 * The method, restated from reading deformation.js:
 *   - deformation is PERSISTENT STATE, not a per-frame effect: two float targets ping-ponged
 *     by one full-screen pass, with no clear, no copy and no readback (file header, lines 1-19);
 *   - the field covers a fixed window of world metres at a fixed resolution, centred on the
 *     player and SNAPPED TO TEXEL BOUNDARIES so the field does not swim under the surface,
 *     with toroidal addressing so following the player costs nothing (lines 26-34, 48-54);
 *   - everything that touches the surface writes through one shared brush path, which is what
 *     makes effects part of the terrain instead of decals floating above it (lines 12-15);
 *   - slow recovery is BANKED and spent in discrete steps, because a per-frame decay term is
 *     smaller than one unit in the last place of a half-float store and silently rounds to a
 *     much faster decay (lines 40-41, 107-115). That is a genuinely non-obvious finding and it
 *     is the detail most likely to be lost in a naive reimplementation.
 *
 * COMPATIBILITY DIFFERENCE: the source runs the simulation in a GLSL fragment pass over
 * RGBA16F render targets. A lab demo owns no renderer and this repository forbids GLSL on the
 * WebGPU path, so the field here is a CPU Float32Array applied to displaced vertices. The
 * state machine - accumulate, scroll toroidally, snap, bank relaxation - is the same; the
 * execution target, resolution and cost are not.
 */

import { fbm2 } from './rng';
import { disposeGroup, type Demo, type DemoContext } from './types';

/** Field window in metres, and its resolution. Bounded hard for a lab scene. */
const COVERAGE = 8;
const RESOLUTION = 96;
const TEXEL = COVERAGE / RESOLUTION;
const MAX_DEPTH = 0.34;
/** Seconds of recovery banked before it is worth spending. The source banks for a precision
 *  reason; we bank for the same reason and because a tiny per-frame decay is untestable. */
const RELAX_STEP = 0.4;
const RELAX_RATE = 0.05;

class DeformationField {
  readonly depth: Float32Array;
  /** Window centre, texel-snapped. */
  centreX = 0;
  centreZ = 0;
  private relaxOwed = 0;

  constructor(readonly remembers: boolean) {
    this.depth = new Float32Array(RESOLUTION * RESOLUTION);
  }

  private index(ix: number, iz: number): number {
    // Toroidal addressing: the array is a window on an infinite field, so moving the centre
    // costs one modulo rather than a scroll-and-copy of every texel.
    const wx = ((ix % RESOLUTION) + RESOLUTION) % RESOLUTION;
    const wz = ((iz % RESOLUTION) + RESOLUTION) % RESOLUTION;
    return wz * RESOLUTION + wx;
  }

  /** Snap the window centre to whole texels so the field does not swim under the surface. */
  recentre(x: number, z: number): void {
    this.centreX = Math.round(x / TEXEL) * TEXEL;
    this.centreZ = Math.round(z / TEXEL) * TEXEL;
  }

  /** The one shared write path. Feet, tracks and impacts all arrive here. */
  brush(worldX: number, worldZ: number, radius: number, depth: number): void {
    const radiusTexels = Math.ceil(radius / TEXEL);
    const centreIx = Math.round(worldX / TEXEL);
    const centreIz = Math.round(worldZ / TEXEL);
    for (let dz = -radiusTexels; dz <= radiusTexels; dz += 1) {
      for (let dx = -radiusTexels; dx <= radiusTexels; dx += 1) {
        const distance = Math.hypot(dx, dz) * TEXEL;
        if (distance > radius) continue;
        const falloff = 1 - distance / radius;
        const slot = this.index(centreIx + dx, centreIz + dz);
        // Additive and clamped: a second pass over the same ground deepens the groove
        // instead of replacing it, which is what "remembers" means here.
        this.depth[slot] = Math.min(MAX_DEPTH, this.depth[slot] + depth * falloff * falloff);
      }
    }
  }

  /** Banked relaxation: spend time only in steps large enough to change the stored value. */
  relax(dt: number): void {
    if (!this.remembers) {
      this.depth.fill(0);
      return;
    }
    this.relaxOwed += dt;
    if (this.relaxOwed < RELAX_STEP) return;
    const spent = this.relaxOwed;
    this.relaxOwed = 0;
    const factor = Math.max(0, 1 - RELAX_RATE * spent);
    for (let i = 0; i < this.depth.length; i += 1) this.depth[i] *= factor;
  }

  sample(worldX: number, worldZ: number): number {
    return this.depth[this.index(Math.round(worldX / TEXEL), Math.round(worldZ / TEXEL))];
  }
}

function buildPlate(
  THREE: DemoContext['THREE'],
  seed: number,
): { mesh: import('three').Mesh; base: Float32Array } {
  const geometry = new THREE.PlaneGeometry(COVERAGE, COVERAGE, RESOLUTION - 1, RESOLUTION - 1);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  const base = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    // A little undulation so a groove reads against something rather than against a flat void.
    base[i] = fbm2(position.getX(i) * 0.5 + 3, position.getZ(i) * 0.5 + 9, seed, 3) * 0.12;
    position.setY(i, base[i]);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.86, metalness: 0 }),
  );
  return { mesh, base };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const root = new THREE.Group();
  root.name = 'source-23-deforming-terrain-that-remembers';

  const halfGap = COVERAGE * 0.56;
  const forgetting = buildPlate(THREE, seed);
  const remembering = buildPlate(THREE, seed);
  forgetting.mesh.position.x = -halfGap;
  forgetting.mesh.name = 'plate-without-memory';
  remembering.mesh.position.x = halfGap;
  remembering.mesh.name = 'plate-with-memory';
  root.add(forgetting.mesh, remembering.mesh);

  const fieldWithoutMemory = new DeformationField(false);
  const fieldWithMemory = new DeformationField(true);

  // The "walker" whose passage is recorded. Two markers, one over each plate, so the
  // before/after is the same path driven into two fields with different retention.
  const markerGeometry = new THREE.SphereGeometry(0.22, 16, 12);
  const markerMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.4 });
  const markerA = new THREE.Mesh(markerGeometry, markerMaterial);
  const markerB = new THREE.Mesh(markerGeometry, markerMaterial);
  markerA.name = 'walker-without-memory';
  markerB.name = 'walker-with-memory';
  root.add(markerA, markerB);

  const plates: { plate: { mesh: import('three').Mesh; base: Float32Array }; field: DeformationField }[] = [
    { plate: forgetting, field: fieldWithoutMemory },
    { plate: remembering, field: fieldWithMemory },
  ];

  function applyField(
    plate: { mesh: import('three').Mesh; base: Float32Array },
    field: DeformationField,
  ): void {
    const position = plate.mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      const depth = field.sample(position.getX(i), position.getZ(i));
      position.setY(i, plate.base[i] - depth);
    }
    position.needsUpdate = true;
    plate.mesh.geometry.computeVertexNormals();
  }

  function update(time: number, dt: number): void {
    // A deterministic lissajous path so the accumulated groove is a recognisable shape and
    // the same at any two inspections of the same time value.
    const x = Math.sin(time * 0.7) * COVERAGE * 0.32;
    const z = Math.sin(time * 0.47 + 1.1) * COVERAGE * 0.32;
    const step = Math.max(0, Math.min(dt, 0.1));

    for (const { plate, field } of plates) {
      field.recentre(x, z);
      field.relax(step);
      field.brush(x, z, 0.34, 1.9 * step);
      applyField(plate, field);
    }

    const depthA = fieldWithoutMemory.sample(x, z);
    const depthB = fieldWithMemory.sample(x, z);
    markerA.position.set(-halfGap + x, 0.22 - depthA, z);
    markerB.position.set(halfGap + x, 0.22 - depthB, z);
  }

  return {
    root,
    update,
    dispose: () => {
      disposeGroup(root);
      markerGeometry.dispose();
      markerMaterial.dispose();
    },
    metadata: {
      sourceId: 23,
      title: 'Hand-written GLSL combat sim with deforming terrain (Battle of Hoth)',
      method:
        'Terrain deformation held as persistent accumulating state rather than a per-frame '
        + 'effect: one shared additive brush path, a fixed world-metre window snapped to whole '
        + 'texels and addressed toroidally so it follows the subject without a scroll-copy, and '
        + 'recovery banked into discrete steps instead of applied per frame. Left plate clears '
        + 'its field every frame; right plate remembers, so the path accumulates into a groove.',
      adaptation: 'adapted',
      sources: [
        'https://github.com/csanz/battle-of-the-hoth-simulator',
        'https://battle-of-the-hoth-simulator.vercel.app/',
      ],
      limitation:
        'Source is ALL RIGHTS RESERVED - our LICENSE probe at the pinned revision returned '
        + 'HTTP 404 - so this is an independent implementation of the described method and '
        + 'reproduces none of its expression. The field is a CPU Float32Array over displaced '
        + 'vertices at 96x96 over 8 m, not the source\'s ping-ponged RGBA16F render targets at '
        + '2048 over 80 m; there is no GPU pass, no float-render-target capability gate, and no '
        + 'snow shading, compression or berm model.',
      localLights: [],
    },
  };
}

export default createDemo;
