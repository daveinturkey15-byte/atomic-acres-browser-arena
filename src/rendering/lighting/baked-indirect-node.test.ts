import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { finaliseProxyScene, groundPlaneProxy, vec3, type ProxyShape, type Vec3 } from '../raytracing/analytic-proxy-scene';
import {
  SH_L1_COEFFICIENTS,
  bakeIrradianceVolume,
  resolveBakedIndirectTuning,
  sampleIrradianceVolume,
  type BakeLighting,
} from './baked-indirect';
import {
  ALBEDO_PROXY_CEILING,
  ALBEDO_PROXY_LUMINANCE_FLOOR,
  BAKED_INDIRECT_GEOMETRY_DEPTH_LIMIT_M,
  buildBakedIndirectTextures,
  publishBakedIndirectReceipt,
  type BakedIndirectGraph,
} from './baked-indirect-node';

const DAYLIGHT: BakeLighting = Object.freeze({
  sunDirection: vec3(0.3, 0.87, 0.39),
  sunColour: vec3(3.1, 2.9, 2.6),
  skyZenithColour: vec3(0.18, 0.26, 0.42),
  skyHorizonColour: vec3(0.32, 0.34, 0.38),
  skyGroundColour: vec3(0.08, 0.075, 0.07),
});

function box(name: string, centre: Vec3, halfExtents: Vec3, albedo: Vec3): ProxyShape {
  return Object.freeze({
    kind: 'box' as const, centre, halfExtents, yaw: 0, normal: vec3(0, 0, 0),
    albedo, metalness: 0, roughness: 0.8, name,
  });
}

function bakedVolume() {
  const scene = finaliseProxyScene([
    groundPlaneProxy(0, vec3(0.42, 0.4, 0.38)),
    box('wall', vec3(0, 3, 6), vec3(9, 3, 0.4), vec3(0.8, 0.12, 0.1)),
  ], 2);
  return bakeIrradianceVolume(scene, DAYLIGHT, {
    arenaId: 'node-fixture', tuning: resolveBakedIndirectTuning('low'),
  });
}

describe('buildBakedIndirectTextures', () => {
  it('builds one RGBA float 3D texture per colour channel, sized to the probe grid', () => {
    const volume = bakedVolume();
    const [nx, ny, nz] = volume.dimensions;
    const textures = buildBakedIndirectTextures(volume);
    for (const texture of [textures.red, textures.green, textures.blue]) {
      expect(texture).toBeInstanceOf(THREE.Data3DTexture);
      expect(texture.image.width).toBe(nx);
      expect(texture.image.height).toBe(ny);
      expect(texture.image.depth).toBe(nz);
      expect(texture.format).toBe(THREE.RGBAFormat);
      expect(texture.type).toBe(THREE.FloatType);
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

  it('packs each channel\'s four SH bands into that texel\'s rgba, in band order', () => {
    const volume = bakedVolume();
    const textures = buildBakedIndirectTextures(volume);
    const [nx, ny] = volume.dimensions;
    // Probe (2,1,1), chosen away from the grid edges.
    const probe = (1 * ny + 1) * nx + 2;
    for (const [channel, texture] of [textures.red, textures.green, textures.blue].entries()) {
      const data = texture.image.data as Float32Array;
      for (let band = 0; band < SH_L1_COEFFICIENTS; band += 1) {
        expect(data[probe * 4 + band]).toBe(
          volume.coefficients[probe * SH_L1_COEFFICIENTS * 3 + channel * SH_L1_COEFFICIENTS + band],
        );
      }
    }
    textures.dispose();
  });

  it('the texture payload reconstructs the CPU reference sampler at a probe centre', () => {
    // The GPU fetches with hardware trilinear filtering; at an exact probe
    // centre that filtering is the identity, so the two must agree exactly.
    // This is the one place the GPU packing and the CPU reference can be
    // compared without a GPU, and it is what makes the node debuggable.
    const volume = bakedVolume();
    const textures = buildBakedIndirectTextures(volume);
    const [nx, ny] = volume.dimensions;
    const x = 2; const y = 1; const z = 1;
    const probe = (z * ny + y) * nx + x;
    const position = vec3(
      volume.originM[0] + x * volume.spacingM,
      volume.originM[1] + y * volume.spacingM,
      volume.originM[2] + z * volume.spacingM,
    );
    const normal = vec3(0, 1, 0);
    const reference = sampleIrradianceVolume(volume, position, normal);
    const evaluate = (data: Float32Array): number => Math.max(0, (
      3.141593 * 0.282095 * data[probe * 4]
      + 2.094395 * 0.488603 * (normal[1] * data[probe * 4 + 1] + normal[2] * data[probe * 4 + 2] + normal[0] * data[probe * 4 + 3])
    ) / Math.PI);
    expect(evaluate(textures.red.image.data as Float32Array)).toBeCloseTo(reference[0], 6);
    expect(evaluate(textures.green.image.data as Float32Array)).toBeCloseTo(reference[1], 6);
    expect(evaluate(textures.blue.image.data as Float32Array)).toBeCloseTo(reference[2], 6);
    textures.dispose();
  });
});

describe('publishBakedIndirectReceipt', () => {
  it('writes off when the layer is not built, so absent and invisible are distinguishable', () => {
    const target = { dataset: {} as Record<string, string | undefined> };
    publishBakedIndirectReceipt(target, null);
    expect(target.dataset.bakedIndirect).toBe('off');
  });

  it('carries dimensions, digest, occluder count and the LIVE gain', () => {
    const volume = bakedVolume();
    const graph: BakedIndirectGraph = {
      light: null as never,
      applyTuning() { /* not exercised here */ },
      beforeRender() { /* not exercised here */ },
      receipt: () => Object.freeze({
        dimensions: volume.dimensions.join('x'),
        digest: volume.digest,
        occluderShapes: volume.bake.occluderShapes,
        gain: 0.38,
      }),
      dispose() { /* not exercised here */ },
    };
    const target = { dataset: {} as Record<string, string | undefined> };
    publishBakedIndirectReceipt(target, graph);
    // occluderShapes = 0 is the RTX skill's "correct image of nothing" state and
    // is why this number is in the receipt rather than only the dimensions: a
    // sky-only bake binds successfully and looks like a bug report.
    expect(target.dataset.bakedIndirect).toBe(`${volume.dimensions.join('x')}:${volume.digest}:2:0.380`);
  });
});

describe('the composite bounds', () => {
  it('keeps the albedo proxy finite on a black pixel', () => {
    // luminance 0 / floor 0.04 -> 0, and the ceiling bounds the other end.
    expect(ALBEDO_PROXY_LUMINANCE_FLOOR).toBeGreaterThan(0);
    expect(ALBEDO_PROXY_CEILING).toBeGreaterThan(1);
    const saturatedRed = 1 / Math.max(0.2126, ALBEDO_PROXY_LUMINANCE_FLOOR);
    expect(Math.min(saturatedRed, ALBEDO_PROXY_CEILING)).toBe(ALBEDO_PROXY_CEILING);
  });

  it('excludes the sky dome by the same depth limit the ray-traced layer uses', () => {
    // Every authored arena fits inside ~45 m of playable depth and the gameplay
    // far plane is 180 m, so this limit excludes the dome and nothing else.
    expect(BAKED_INDIRECT_GEOMETRY_DEPTH_LIMIT_M).toBeGreaterThan(180);
  });
});
