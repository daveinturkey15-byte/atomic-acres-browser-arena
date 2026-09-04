/**
 * HF-486 — the GPU half: texture shape, the half-float round trip, the
 * uniform-only off switch, and the grid the Nuke Town Rebuild actually gets.
 *
 * No wall-clock assertion appears in this file. The HF-418 lane learned that
 * lesson in PASS 89 and wrote it down: a bake-time measurement on a shared
 * workstation measures the MACHINE, not the code. Bake time is reported as
 * provenance in the pass evidence, never asserted here.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { NUKETOWN2_BOUNDS } from '../../nuketown2-layout';
import { vec3, type ProxyScene, type ProxyShape } from '../raytracing/analytic-proxy-scene';
import {
  SH_L2_BYTES_PER_PROBE,
  SH_L2_COEFFICIENTS,
  SH_L2_FLOATS_PER_PROBE,
  SH_L2_PLANES,
  bakeShL2Volume,
  deriveShL2Grid,
  evaluateShL2,
  packShL2Volume,
} from './sh-l2-irradiance';
import {
  SH_L2_MAXIMUM_ADDITIVE,
  SH_L2_MAXIMUM_STRENGTH,
  SH_L2_NORMAL_OFFSET_CELLS,
  allocateShL2Textures,
  buildShL2IrradianceNode,
  publishShL2Receipt,
  uploadShL2Volume,
} from './sh-l2-irradiance-node';

const DAYLIGHT = Object.freeze({
  sunDirection: vec3(0.3, 0.87, 0.39),
  sunColour: vec3(3.1, 2.9, 2.6),
  skyZenithColour: vec3(0.18, 0.26, 0.42),
  skyHorizonColour: vec3(0.32, 0.34, 0.38),
  skyGroundColour: vec3(0.08, 0.075, 0.07),
});

function box(name: string, centre: ReturnType<typeof vec3>, halfExtents: ReturnType<typeof vec3>, albedo: ReturnType<typeof vec3>): ProxyShape {
  return Object.freeze({
    kind: 'box' as const, centre, halfExtents, yaw: 0, normal: vec3(0, 0, 0),
    albedo, metalness: 0, roughness: 0.8, name,
  }) as ProxyShape;
}

function scene(shapes: ProxyShape[]): ProxyScene {
  return Object.freeze({
    shapes: Object.freeze(shapes),
    boundsMin: vec3(-40, -1, -50), boundsMax: vec3(40, 20, 50),
    candidatesConsidered: shapes.length, reflectiveMeshCount: 0,
    reflectiveFootprintM2: 0, capReason: 'fixture',
  }) as ProxyScene;
}

const FIXTURE_GRID = deriveShL2Grid(
  { minM: vec3(-8, 0, -8), maxM: vec3(8, 6, 8) },
  { spacingM: 2, heightM: 6 },
);

function fixtureVolume() {
  return bakeShL2Volume({
    arenaId: 'node-fixture', conditionId: 'golden-hour', grid: FIXTURE_GRID,
    lighting: DAYLIGHT,
    occluders: scene([box('wall', vec3(0, 3, 6), vec3(9, 3, 0.4), vec3(0.8, 0.12, 0.1))]),
    raysPerProbe: 48, bounces: 1, seed: 2026,
  });
}

// ---------------------------------------------------------------------------

describe('allocateShL2Textures', () => {
  it('builds seven RGBA16F 3D textures sized to the probe grid', () => {
    const [nx, ny, nz] = FIXTURE_GRID.dimensions;
    const textures = allocateShL2Textures(FIXTURE_GRID.dimensions, 'nuketown2');
    expect(textures.planes).toHaveLength(SH_L2_PLANES);
    for (const texture of textures.planes) {
      expect(texture).toBeInstanceOf(THREE.Data3DTexture);
      expect(texture.image.width).toBe(nx);
      expect(texture.image.height).toBe(ny);
      expect(texture.image.depth).toBe(nz);
      expect(texture.format).toBe(THREE.RGBAFormat);
      // Half float, not full: this is what halves residency and lets two bakes
      // stay resident for the time-of-day blend.
      expect(texture.type).toBe(THREE.HalfFloatType);
      // Linear filtering on all three axes IS the trilinear probe blend. A
      // NearestFilter here would make every surface show the probe grid.
      expect(texture.minFilter).toBe(THREE.LinearFilter);
      expect(texture.magFilter).toBe(THREE.LinearFilter);
      // Clamped wrap: a wrapped fetch at the arena edge would read the probe on
      // the opposite side of the map.
      expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
      expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
      expect(texture.wrapR).toBe(THREE.ClampToEdgeWrapping);
      expect(texture.generateMipmaps).toBe(false);
    }
    textures.dispose();
  });
});

describe('uploadShL2Volume', () => {
  it('round-trips every coefficient through half float within half-float precision', () => {
    // The GPU sees halves. If the packing order were wrong this would be wrong
    // by a whole coefficient rather than by a rounding step, which is what the
    // tolerance below distinguishes.
    const volume = fixtureVolume();
    const textures = allocateShL2Textures(volume.dimensions, 'roundtrip');
    uploadShL2Volume(textures, volume);

    const packed = packShL2Volume(volume);
    for (let plane = 0; plane < SH_L2_PLANES; plane += 1) {
      const data = textures.planes[plane].image.data as Uint16Array;
      for (let index = 0; index < data.length; index += 1) {
        const back = THREE.DataUtils.fromHalfFloat(data[index]);
        const expected = packed[plane][index];
        expect(Math.abs(back - expected)).toBeLessThanOrEqual(Math.abs(expected) * 1e-2 + 1e-4);
      }
    }
    textures.dispose();
  });

  it('refuses a volume whose dimensions do not match the allocated textures', () => {
    const volume = fixtureVolume();
    const textures = allocateShL2Textures([2, 2, 2], 'mismatch');
    expect(() => uploadShL2Volume(textures, volume)).toThrow(/holds 8 texels/u);
    textures.dispose();
  });
});

describe('buildShL2IrradianceNode', () => {
  function graph() {
    return buildShL2IrradianceNode(
      { worldPosition: null as never, worldNormal: null as never },
      FIXTURE_GRID.dimensions,
      'nuketown2',
    );
  }

  it('starts at zero strength, so a built node is invisible until asked for', () => {
    const node = graph();
    expect(node.receipt().strength).toBe(0);
    expect(node.receipt().digest).toBe('unbound');
    node.dispose();
  });

  it('clamps strength at the setter, not only upstream', () => {
    // A value that reaches a live uniform unclamped is not "clamped, not
    // assumed" whatever the caller promises.
    const node = graph();
    node.setStrength(99);
    expect(node.receipt().strength).toBe(SH_L2_MAXIMUM_STRENGTH);
    node.setStrength(-5);
    expect(node.receipt().strength).toBe(0);
    node.dispose();
  });

  it('turns off through a uniform without touching the bound textures', () => {
    // THE capability difference against the HF-418 lane, whose control is
    // applyMode 'pipeline-rebuild'. Off here is a uniform write: the same
    // texture objects stay bound, so the graph, the bindings and the pipeline
    // are untouched and the control is safe to move mid-match (tripwire 0).
    const volume = fixtureVolume();
    const textures = allocateShL2Textures(volume.dimensions, 'offswitch');
    const node = buildShL2IrradianceNode(
      { worldPosition: null as never, worldNormal: null as never },
      volume.dimensions, 'offswitch', textures,
    );
    node.setVolume(volume);
    node.setStrength(0.4);
    const identities = textures.planes.map((plane) => plane.uuid);

    node.setStrength(0);
    expect(node.receipt().strength).toBe(0);
    expect(textures.planes.map((plane) => plane.uuid)).toEqual(identities);
    // Still bound: off is not unbound.
    expect(node.receipt().digest).toBe(volume.digest);
    node.dispose();
  });

  it('refuses a volume of different dimensions rather than rebuilding the pipeline', () => {
    const node = graph();
    const other = bakeShL2Volume({
      arenaId: 'other', conditionId: 'day',
      grid: deriveShL2Grid({ minM: vec3(0, 0, 0), maxM: vec3(4, 4, 4) }, { spacingM: 2, heightM: 4 }),
      lighting: DAYLIGHT, occluders: scene([]), raysPerProbe: 8, bounces: 1, seed: 1,
    });
    expect(() => node.setVolume(other)).toThrow(/node is bound to/u);
    node.dispose();
  });

  it('reports the bound volume on its receipt, including a sky-only bake', () => {
    // An arena whose bake found zero occluders produces a correct, invisible
    // volume. That must be distinguishable from a volume that failed to bind.
    const skyOnly = bakeShL2Volume({
      arenaId: 'sky', conditionId: 'day', grid: FIXTURE_GRID, lighting: DAYLIGHT,
      occluders: scene([]), raysPerProbe: 16, bounces: 1, seed: 3,
    });
    const node = graph();
    node.setVolume(skyOnly);
    const receipt = node.receipt();
    expect(receipt.occluderShapes).toBe(0);
    expect(receipt.band).toBe(FIXTURE_GRID.band);
    expect(receipt.dimensions).toBe(FIXTURE_GRID.dimensions.join('x'));
    expect(receipt.bytes).toBe(FIXTURE_GRID.probeCount * SH_L2_BYTES_PER_PROBE);
    node.dispose();
  });

  it('publishes an off receipt when there is no graph at all', () => {
    const target = { dataset: {} as Record<string, string | undefined> };
    publishShL2Receipt(target, null);
    expect(target.dataset.shL2Irradiance).toBe('off');

    const node = graph();
    node.setVolume(fixtureVolume());
    node.setStrength(0.3);
    publishShL2Receipt(target, node);
    expect(target.dataset.shL2Irradiance).toMatch(/^\d+x\d+x\d+:l2:[0-9a-f]{8}:1:0\.300$/u);
    node.dispose();
  });

  it('keeps the additive ceiling below the strength ceiling', () => {
    // The strength bounds the multiplier; the additive bounds the result. A
    // build in which the second is not the tighter of the two would let a
    // bright bake put a wash across a sightline.
    expect(SH_L2_MAXIMUM_ADDITIVE).toBeLessThan(SH_L2_MAXIMUM_STRENGTH);
    expect(SH_L2_NORMAL_OFFSET_CELLS).toBeGreaterThan(0);
    expect(SH_L2_NORMAL_OFFSET_CELLS).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// The grid the Nuke Town Rebuild actually gets
// ---------------------------------------------------------------------------

describe('Nuke Town Rebuild volume', () => {
  // NUKETOWN2_BOUNDS is an XZ Box2; the vertical extent is this lane's 0-6 m,
  // not the bounds height, for the reason `deriveShL2Grid` states.
  const grid = deriveShL2Grid(
    {
      minM: vec3(NUKETOWN2_BOUNDS.minX, 0, NUKETOWN2_BOUNDS.minZ),
      maxM: vec3(NUKETOWN2_BOUNDS.maxX, 0, NUKETOWN2_BOUNDS.maxZ),
    },
    { spacingM: 2, heightM: 6, paddingM: 1 },
  );

  it('carries the second band at 2 m spacing over the real arena bounds', () => {
    expect(grid.band).toBe('l2');
    expect(grid.spacingM[0]).toBeLessThanOrEqual(2.5);
    expect(grid.spacingM[2]).toBeLessThanOrEqual(2.5);
  });

  it('fits two resident bakes inside the 8 MB lane budget', () => {
    // Day and dusk resident together is what makes a time-of-day change a
    // blend rather than a stall.
    expect(grid.bytes * 2).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it('covers the playable box the arena declares', () => {
    const spanX = NUKETOWN2_BOUNDS.maxX - NUKETOWN2_BOUNDS.minX;
    const spanZ = NUKETOWN2_BOUNDS.maxZ - NUKETOWN2_BOUNDS.minZ;
    expect(grid.spacingM[0] * (grid.dimensions[0] - 1)).toBeGreaterThanOrEqual(spanX);
    expect(grid.spacingM[2] * (grid.dimensions[2] - 1)).toBeGreaterThanOrEqual(spanZ);
  });

  it('darkens a probe inside a house relative to the open street', () => {
    // The lane's headline property, on the real arena footprint rather than a
    // toy box: a probe inside a closed structure must read darker than one on
    // the open street, or the volume is not seeing the arena.
    const house = box('house', vec3(0, 3, 20), vec3(6, 3, 6), vec3(0.55, 0.5, 0.45));
    const single = (centre: ReturnType<typeof vec3>) => {
      const volume = bakeShL2Volume({
        arenaId: 'nuketown2', conditionId: 'golden-hour',
        grid: {
          originM: centre, spacingM: vec3(2, 2, 2),
          dimensions: Object.freeze([1, 1, 1]) as unknown as readonly [number, number, number],
          probeCount: 1, band: 'l2' as const, bytes: SH_L2_BYTES_PER_PROBE,
        },
        lighting: DAYLIGHT, occluders: scene([house]),
        raysPerProbe: 512, bounces: 1, seed: 808,
      });
      let total = 0;
      for (let channel = 0; channel < 3; channel += 1) {
        total += evaluateShL2(volume.coefficients, channel * SH_L2_COEFFICIENTS, vec3(0, 1, 0));
      }
      return total / 3;
    };
    expect(single(vec3(0, 1.6, 20))).toBeLessThan(single(vec3(0, 1.6, 0)) * 0.5);
  });

  it('packs to exactly the byte count the receipt reports', () => {
    expect(grid.bytes).toBe(grid.probeCount * SH_L2_PLANES * 4 * 2);
    expect(SH_L2_FLOATS_PER_PROBE).toBe(27);
  });
});
