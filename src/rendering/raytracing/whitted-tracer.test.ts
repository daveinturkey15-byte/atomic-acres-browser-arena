import { describe, expect, it } from 'vitest';
import {
  ABOVE_COMBAT_BAND_M,
  DIELECTRIC_NORMAL_REFLECTANCE,
  GLASS_INDEX_OF_REFRACTION,
  MIRROR_ROUGHNESS_CEILING,
  classifySurface,
  dielectricFresnel,
  materialForClassification,
  reflect,
  refract,
  schlickFresnel,
  vec3,
} from './whitted-materials';
import {
  DEFAULT_PROXY_EXTRACTION,
  PROXY_FLOATS_PER_SHAPE,
  finaliseProxyScene,
  groundPlaneProxy,
  intersectBox,
  intersectScene,
  intersectSphere,
  occluded,
  packProxyScene,
  unpackProxyShape,
  type ProxyShape,
} from './analytic-proxy-scene';
import {
  type ThinLensCamera,
  type TraceLight,
  type TraceOptions,
  type TraceSurfaceContext,
  apertureBlurCircleDiameterPx,
  shadowVisibility,
  thinLensRay,
  traceRay,
} from './whitted-tracer';

function box(
  centre: readonly [number, number, number],
  half: readonly [number, number, number],
  overrides: Partial<ProxyShape> = {},
): ProxyShape {
  return Object.freeze({
    kind: 'box' as const,
    centre: vec3(...centre),
    halfExtents: vec3(...half),
    yaw: 0,
    normal: vec3(0, 0, 0),
    albedo: vec3(0.5, 0.5, 0.5),
    metalness: 0,
    roughness: 1,
    name: 'test-box',
    ...overrides,
  });
}

const CONTEXT: TraceSurfaceContext = Object.freeze({
  floorHeightM: 0,
  screenAreaFor: () => 0.01,
  wet: false,
});

const SUN: TraceLight = Object.freeze({
  direction: vec3(0, 1, 0),
  colour: vec3(1, 0.96, 0.9),
  distanceM: Number.POSITIVE_INFINITY,
  castsShadows: true,
});

function options(overrides: Partial<TraceOptions> = {}): TraceOptions {
  return Object.freeze({
    maximumDepth: 2,
    refractionsEnabled: false,
    causticsEnabled: false,
    maximumAdditiveGain: 0.2,
    environmentRadiance: vec3(0.04, 0.045, 0.06),
    ...overrides,
  });
}

describe('HF-398 Fresnel', () => {
  it('returns the normal-incidence reflectance head-on and unity at grazing', () => {
    expect(schlickFresnel(1, DIELECTRIC_NORMAL_REFLECTANCE)).toBeCloseTo(DIELECTRIC_NORMAL_REFLECTANCE, 6);
    expect(schlickFresnel(0, DIELECTRIC_NORMAL_REFLECTANCE)).toBeCloseTo(1, 6);
    // Monotonic between the two, which is what makes a clear coat read as a
    // rim rather than as a flat wash.
    let previous = -1;
    for (let index = 10; index >= 0; index -= 1) {
      const value = schlickFresnel(index / 10, DIELECTRIC_NORMAL_REFLECTANCE);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('matches the exact dielectric solution head-on and reaches total internal reflection', () => {
    const expected = ((GLASS_INDEX_OF_REFRACTION - 1) / (GLASS_INDEX_OF_REFRACTION + 1)) ** 2;
    expect(dielectricFresnel(1, GLASS_INDEX_OF_REFRACTION)).toBeCloseTo(expected, 4);
    // Leaving glass for air, past the critical angle, everything comes back.
    expect(dielectricFresnel(0.2, 1 / GLASS_INDEX_OF_REFRACTION)).toBe(1);
  });

  it('reflects and refracts with the geometry the shading model assumes', () => {
    const reflected = reflect(vec3(0, -1, 0), vec3(0, 1, 0));
    expect(reflected[1]).toBeCloseTo(1, 6);
    const bent = refract(vec3(0.6, -0.8, 0), vec3(0, 1, 0), 1 / GLASS_INDEX_OF_REFRACTION);
    expect(bent).not.toBeNull();
    // Snell: entering a denser medium bends the ray TOWARD the normal, so the
    // horizontal component must shrink.
    expect(Math.abs(bent![0])).toBeLessThan(0.6);
    // And past the critical angle in the other direction there is no
    // transmitted ray at all, which callers must handle rather than receive a
    // zero vector for.
    expect(refract(vec3(0.99, -0.14, 0), vec3(0, 1, 0), GLASS_INDEX_OF_REFRACTION)).toBeNull();
  });
});

describe('HF-398 analytic intersection', () => {
  it('hits a box on the near face with the outward normal', () => {
    const hit = intersectBox(vec3(0, 0, -10), vec3(0, 0, 1), box([0, 0, 0], [1, 1, 1]));
    expect(hit.t).toBeCloseTo(9, 5);
    expect(hit.normal[2]).toBeCloseTo(-1, 5);
  });

  it('misses a box the ray passes beside, and misses one behind the origin', () => {
    expect(intersectBox(vec3(5, 0, -10), vec3(0, 0, 1), box([0, 0, 0], [1, 1, 1])).t)
      .toBe(Number.POSITIVE_INFINITY);
    expect(intersectBox(vec3(0, 0, 10), vec3(0, 0, 1), box([0, 0, 0], [1, 1, 1])).t)
      .toBe(Number.POSITIVE_INFINITY);
  });

  it('solves a sphere in closed form, so the silhouette is exact at any zoom', () => {
    const sphere = box([0, 0, 0], [2, 2, 2], { kind: 'sphere' });
    const hit = intersectSphere(vec3(0, 0, -10), vec3(0, 0, 1), sphere);
    expect(hit.t).toBeCloseTo(8, 5);
    // A tessellated sphere would show a facet here; an analytic one cannot.
    const grazing = intersectSphere(vec3(1.9999, 0, -10), vec3(0, 0, 1), sphere);
    expect(grazing.t).toBeGreaterThan(0);
    expect(Math.hypot(grazing.normal[0], grazing.normal[1], grazing.normal[2])).toBeCloseTo(1, 6);
  });

  it('respects a box yaw rather than treating every proxy as axis aligned', () => {
    const rotated = box([0, 0, 0], [4, 1, 0.5], { yaw: Math.PI / 2 });
    // Rotated 90 degrees, the long axis now runs along Z, so a ray down +Z
    // meets the box 4 m out rather than 0.5 m out.
    const hit = intersectBox(vec3(0, 0, -10), vec3(0, 0, 1), rotated);
    expect(hit.t).toBeCloseTo(6, 4);
  });

  it('returns the nearest of several shapes, not merely the first that hits', () => {
    const scene = finaliseProxyScene([
      box([0, 0, 20], [1, 1, 1]),
      box([0, 0, 5], [1, 1, 1]),
      box([0, 0, 40], [1, 1, 1]),
    ], 3);
    const hit = intersectScene(vec3(0, 0, 0), vec3(0, 0, 1), scene);
    expect(hit.shapeIndex).toBe(1);
    expect(hit.t).toBeCloseTo(4, 5);
  });

  it('reports occlusion only for a blocker inside the light distance', () => {
    const scene = finaliseProxyScene([box([0, 5, 0], [2, 0.2, 2])], 1);
    expect(occluded(vec3(0, 0, 0), vec3(0, 1, 0), 100, scene)).toBe(true);
    expect(occluded(vec3(0, 0, 0), vec3(0, 1, 0), 2, scene)).toBe(false);
    expect(occluded(vec3(0, 0, 0), vec3(1, 0, 0), 100, scene)).toBe(false);
  });
});

describe('HF-398 proxy packing', () => {
  it('round-trips every field a shape carries', () => {
    const shapes = [
      box([1, 2, 3], [4, 5, 6], { yaw: 0.75, albedo: vec3(0.2, 0.4, 0.6), metalness: 0.8, roughness: 0.15 }),
      box([-7, 8, -9], [1, 2, 3], { kind: 'sphere', metalness: 0, roughness: 0.9 }),
    ];
    const scene = finaliseProxyScene(shapes, shapes.length);
    const packed = packProxyScene(scene, 4);
    expect(packed.length).toBe(4 * PROXY_FLOATS_PER_SHAPE);
    for (let index = 0; index < shapes.length; index += 1) {
      const restored = unpackProxyShape(packed, index);
      expect(restored.kind).toBe(shapes[index].kind);
      expect(restored.centre.map((value) => Math.round(value * 1e4) / 1e4))
        .toEqual(shapes[index].centre.map((value) => Math.round(value * 1e4) / 1e4));
      expect(restored.yaw).toBeCloseTo(shapes[index].yaw, 5);
      expect(restored.metalness).toBeCloseTo(shapes[index].metalness, 5);
      expect(restored.roughness).toBeCloseTo(shapes[index].roughness, 5);
    }
  });

  it('reports the cap it applied rather than silently dropping geometry', () => {
    const many = Array.from({ length: 40 }, (_value, index) => box([index, 0, 0], [1, 1, 1]));
    const scene = finaliseProxyScene(many.slice(0, DEFAULT_PROXY_EXTRACTION.maximumShapes), many.length);
    expect(scene.shapes.length).toBe(DEFAULT_PROXY_EXTRACTION.maximumShapes);
    expect(scene.capReason).toContain(String(DEFAULT_PROXY_EXTRACTION.maximumShapes));
    expect(scene.capReason).toContain('40');
  });

  it('bounds the whole set, including a ground plane', () => {
    const scene = finaliseProxyScene([box([0, 3, 0], [2, 3, 2]), groundPlaneProxy(0, vec3(0.2, 0.2, 0.2))], 2);
    expect(scene.boundsMin[1]).toBeLessThanOrEqual(0);
    expect(scene.boundsMax[1]).toBeGreaterThanOrEqual(6);
  });
});

describe('HF-398 surface classification', () => {
  const sample = (overrides: Partial<Parameters<typeof classifySurface>[0]> = {}) => classifySurface({
    metalness: 0,
    roughness: 1,
    worldNormal: vec3(0, 1, 0),
    heightM: 1,
    screenAreaFraction: 0.001,
    wet: false,
    ...overrides,
  });

  it('defaults the world to Phong, which spawns no reflection ray at all', () => {
    const classified = sample();
    expect(classified.type).toBe('phong');
    expect(materialForClassification(classified, vec3(0.4, 0.4, 0.4)).spawnsReflectionRay).toBe(false);
  });

  it('demotes a large smooth metal wall inside the combat search band', () => {
    const classified = sample({
      metalness: 1,
      roughness: 0.05,
      worldNormal: vec3(1, 0, 0),
      heightM: 1.5,
      screenAreaFraction: 0.3,
    });
    expect(classified.type).toBe('clearcoat');
    expect(classified.readabilityDemotion).toBe(true);
    // The same wall ABOVE the band keeps its mirror: a player is not searching
    // a third storey for a torso, so nothing is being protected up there.
    const high = sample({
      metalness: 1,
      roughness: 0.05,
      worldNormal: vec3(1, 0, 0),
      heightM: ABOVE_COMBAT_BAND_M + 2,
      screenAreaFraction: 0.3,
    });
    expect(high.type).toBe('metal');
    expect(high.readabilityDemotion).toBe(false);
  });

  it('never lets a walkable floor become a mirror', () => {
    const classified = sample({ metalness: 1, roughness: 0.02, worldNormal: vec3(0, 1, 0), heightM: 0.1 });
    expect(classified.type).toBe('clearcoat');
    expect(classified.readabilityDemotion).toBe(true);
  });

  it('gives wet surfaces the coat, and small polished conductors the mirror', () => {
    expect(sample({ wet: true, roughness: 0.3 }).type).toBe('clearcoat');
    expect(sample({ metalness: 0.9, roughness: 0.05, heightM: 6, screenAreaFraction: 0.002 }).type).toBe('metal');
  });

  it('keeps transparent surfaces small enough that they cannot be mistaken for cover', () => {
    expect(sample({ metalness: 0, roughness: 0.01, screenAreaFraction: 0.001 }).type).toBe('transparent');
    // Body-sized and above: whatever it is, it is not allowed to be an
    // ambiguous half-transparent thing in a combat space.
    expect(sample({ metalness: 0, roughness: 0.01, screenAreaFraction: 0.4 }).type).not.toBe('transparent');
  });

  it('spawns no reflection ray above the mirror roughness ceiling', () => {
    const justRough = sample({ metalness: 1, roughness: MIRROR_ROUGHNESS_CEILING + 0.01, heightM: 6, screenAreaFraction: 0.002 });
    expect(justRough.type).toBe('clearcoat');
    const justSmooth = sample({ metalness: 1, roughness: MIRROR_ROUGHNESS_CEILING - 0.01, heightM: 6, screenAreaFraction: 0.002 });
    expect(justSmooth.type).toBe('metal');
  });
});

describe('HF-398 recursive tracing', () => {
  it('returns the environment for a ray that leaves the scene', () => {
    const scene = finaliseProxyScene([], 0);
    const radiance = traceRay(vec3(0, 1, 0), vec3(0, 1, 0), scene, [SUN], CONTEXT, options());
    expect(radiance[0]).toBeGreaterThan(0);
    expect(radiance[0]).toBeCloseTo(0.04, 6);
  });

  it('casts a real shadow ray: an occluder between surface and sun removes the direct term', () => {
    const floor = box([0, 0, 0], [20, 0.1, 20], { albedo: vec3(0.8, 0.8, 0.8) });
    const lit = finaliseProxyScene([floor], 1);
    const shaded = finaliseProxyScene([floor, box([0, 5, 0], [4, 0.3, 4])], 2);
    const point = vec3(0, 0.1, 0);
    const normal = vec3(0, 1, 0);
    const openVisibility = shadowVisibility(point, normal, SUN, lit, CONTEXT, options());
    const blockedVisibility = shadowVisibility(point, normal, SUN, shaded, CONTEXT, options());
    expect(openVisibility[0]).toBeCloseTo(1, 6);
    expect(blockedVisibility[0]).toBe(0);
  });

  it('lets light survive a transparent occluder as a tinted caustic when caustics are on', () => {
    const glass = box([0, 5, 0], [1, 1, 1], { metalness: 0, roughness: 0.01, albedo: vec3(0.7, 0.9, 0.8) });
    const scene = finaliseProxyScene([glass], 1);
    const transparentContext: TraceSurfaceContext = { ...CONTEXT, screenAreaFor: () => 0.001 };
    const withCaustics = shadowVisibility(
      vec3(0, 0, 0), vec3(0, 1, 0), SUN, scene, transparentContext,
      options({ causticsEnabled: true, refractionsEnabled: true }),
    );
    const withoutCaustics = shadowVisibility(
      vec3(0, 0, 0), vec3(0, 1, 0), SUN, scene, transparentContext, options(),
    );
    // Off: the glass is treated as an opaque blocker, which is a hard shadow.
    expect(withoutCaustics[0]).toBe(0);
    // On: some light survives, and it is TINTED by the glass, which is what
    // makes the pattern read as light through glass rather than as a grey hole.
    expect(withCaustics[0]).toBeGreaterThan(0);
    expect(withCaustics[1]).toBeGreaterThan(withCaustics[0]);
  });

  it('honours the recursion depth it was given', () => {
    // Two facing mirrors: the classic case that eats any depth offered.
    const facing = finaliseProxyScene([
      box([0, 1, 6], [4, 4, 0.2], { metalness: 1, roughness: 0.01, albedo: vec3(0.9, 0.9, 0.9) }),
      box([0, 1, -6], [4, 4, 0.2], { metalness: 1, roughness: 0.01, albedo: vec3(0.9, 0.9, 0.9) }),
    ], 2);
    const mirrorContext: TraceSurfaceContext = { ...CONTEXT, screenAreaFor: () => 0.001 };
    const shallow = traceRay(vec3(0, 5, 0), vec3(0, 0, 1), facing, [SUN], mirrorContext, options({ maximumDepth: 1 }));
    const deep = traceRay(vec3(0, 5, 0), vec3(0, 0, 1), facing, [SUN], mirrorContext, options({ maximumDepth: 3 }));
    expect(Number.isFinite(shallow[0])).toBe(true);
    expect(Number.isFinite(deep[0])).toBe(true);
    // Depth 0 must terminate rather than recurse, which is the guard that keeps
    // two facing mirrors from being an infinite loop.
    const none = traceRay(vec3(0, 5, 0), vec3(0, 0, 1), facing, [SUN], mirrorContext, options({ maximumDepth: 0 }));
    expect(none).toEqual(vec3(0, 0, 0));
  });

  it('never returns more than the additive ceiling it was given, in any channel', () => {
    const blinding: TraceLight = { ...SUN, colour: vec3(50, 50, 50) };
    const scene = finaliseProxyScene([
      box([0, 0, 0], [20, 0.1, 20], { albedo: vec3(1, 1, 1) }),
      box([0, 2, 8], [3, 2, 0.3], { metalness: 1, roughness: 0.01, albedo: vec3(1, 1, 1) }),
    ], 2);
    for (const ceiling of [0.05, 0.2, 1]) {
      const radiance = traceRay(
        vec3(0, 1.6, -8), vec3(0, -0.2, 1), scene, [blinding], CONTEXT,
        options({ maximumAdditiveGain: ceiling, maximumDepth: 3 }),
      );
      for (const channel of radiance) {
        expect(channel).toBeLessThanOrEqual(ceiling + 1e-9);
        expect(channel).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('HF-398 aperture depth of field', () => {
  const camera = (apertureRadiusM: number, focalDistanceM = 26): ThinLensCamera => Object.freeze({
    position: vec3(0, 1.6, 0),
    forward: vec3(0, 0, -1),
    right: vec3(1, 0, 0),
    up: vec3(0, 1, 0),
    // 82 degrees horizontal on 16:9 is the project's authored field of view.
    tanHalfFovY: Math.tan((82 * Math.PI) / 180 / 2) / (16 / 9),
    aspect: 16 / 9,
    apertureRadiusM,
    focalDistanceM,
  });

  it('is a pinhole at zero aperture: every ray leaves the same point', () => {
    const pinhole = thinLensRay(camera(0), 0.5, -0.25, 1, -1);
    const same = thinLensRay(camera(0), 0.5, -0.25, -1, 1);
    expect(pinhole.origin).toEqual(same.origin);
    expect(pinhole.direction).toEqual(same.direction);
  });

  it('spreads rays across the aperture and still converges on the focal plane', () => {
    const lens = camera(0.02);
    const left = thinLensRay(lens, 0, 0, -1, 0);
    const right = thinLensRay(lens, 0, 0, 1, 0);
    expect(left.origin[0]).toBeLessThan(right.origin[0]);
    const leftPoint = left.origin.map((value, axis) => value + left.direction[axis] * lens.focalDistanceM);
    const rightPoint = right.origin.map((value, axis) => value + right.direction[axis] * lens.focalDistanceM);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(leftPoint[axis]).toBeCloseTo(rightPoint[axis], 3);
    }
  });

  it('produces exactly zero blur at the focal plane and more further from it', () => {
    const lens = camera(6e-3);
    expect(apertureBlurCircleDiameterPx(lens, lens.focalDistanceM, 1080)).toBeCloseTo(0, 9);
    const near = apertureBlurCircleDiameterPx(lens, 2, 1080);
    const far = apertureBlurCircleDiameterPx(lens, 90, 1080);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
    // Near-field defocus dominates, which is why a wide aperture reads as a
    // foreground element separating rather than as a soft background.
    expect(near).toBeGreaterThan(far);
  });
});
