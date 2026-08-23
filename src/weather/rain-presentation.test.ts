/**
 * Pass 76 - rain presentation.
 *
 * Three things can silently ruin this feature and all three are pinned here:
 * it becoming N meshes instead of one instanced draw, the static batcher eating
 * the instances, and rain quietly costing the player a gunfight.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { batchStaticMeshes } from '../art-kit';
import { clearWeatherSample, sampleWeather, type WeatherSample } from './weather-state';
import { calmWind, createWindField, sampleWind, type WindSample } from './wind-field';
import {
  RAIN_BUDGET,
  RAIN_MAX_SPLASHES,
  RAIN_MAX_STREAKS,
  RAIN_READABILITY,
  RAIN_VOLUME,
  RainPresentation,
  WETNESS_RESPONSE,
  rainBypassReason,
  wetSurfaceResponse,
  type RainQualityTier,
} from './rain-presentation';

const STORM: WeatherSample = Object.freeze({
  arenaId: 'high-seas',
  state: 'storm',
  previousState: 'storm',
  phaseIndex: 3,
  transitionBlend: 1,
  intensity: 1,
  rainRate: 1,
  windMultiplier: 1.78,
  wetness: 1,
  fogDensityMultiplier: 2.15,
  skyDarkenAmount: 0.58,
  raining: true,
});

const STIFF_WIND: WindSample = Object.freeze({
  x: 8.4,
  z: -3.1,
  speed: Math.hypot(8.4, -3.1),
  bearingRadians: Math.atan2(-3.1, 8.4),
  gust: 0.8,
});

function build(options: Partial<{ quality: RainQualityTier; seed: number; profile: 'performance' | 'blender' | 'compat'; rendererLabel: string }> = {}) {
  const rain = new RainPresentation({
    profile: options.profile ?? 'blender',
    rendererLabel: options.rendererLabel ?? 'NVIDIA GeForce RTX 4090',
    quality: options.quality ?? 'ultra',
    seed: options.seed ?? 1234,
  });
  const scene = new THREE.Scene();
  rain.build(scene);
  return { rain, scene };
}

function camera(x = 0, y = 1.7, z = 0, yaw = 0): THREE.PerspectiveCamera {
  const view = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 500);
  view.position.set(x, y, z);
  view.rotation.set(0, yaw, 0);
  view.updateMatrixWorld(true);
  return view;
}

/** Instance world positions, and which instances were culled to zero scale. */
function instanceStates(mesh: THREE.InstancedMesh): { position: THREE.Vector3; culled: boolean }[] {
  const matrix = new THREE.Matrix4();
  const states: { position: THREE.Vector3; culled: boolean }[] = [];
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    const scaleSquared = matrix.elements[0] ** 2 + matrix.elements[1] ** 2 + matrix.elements[2] ** 2;
    states.push({
      position: new THREE.Vector3(matrix.elements[12], matrix.elements[13], matrix.elements[14]),
      culled: scaleSquared < 1e-12,
    });
  }
  return states;
}

function meshCensus(root: THREE.Object3D): { instanced: number; loose: number } {
  let instanced = 0;
  let loose = 0;
  root.traverse((node) => {
    if ((node as THREE.InstancedMesh).isInstancedMesh) instanced += 1;
    else if ((node as THREE.Mesh).isMesh) loose += 1;
  });
  return { instanced, loose };
}

describe('rain is instanced, not multiplied', () => {
  it('draws ALL rain in exactly two instanced draws and zero loose meshes', () => {
    const { rain } = build({ quality: 'ultra' });
    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    const census = meshCensus(rain.root);
    // One InstancedMesh of streaks, one of splash rings. That is the ceiling.
    expect(census.instanced).toBe(2);
    expect(census.loose).toBe(0);
    const telemetry = rain.telemetry();
    expect(telemetry.instancedDraws).toBe(2);
    expect(telemetry.looseMeshes).toBe(0);
    // ...carrying hundreds of drops, so this is really instancing and not a
    // two-drop rain that trivially satisfies the count.
    expect(telemetry.streakInstances).toBeGreaterThan(500);
    expect(telemetry.splashInstances).toBeGreaterThan(20);
    rain.dispose();
  });

  it('never grows a mesh per drop, however long it runs', () => {
    const { rain } = build();
    const view = camera();
    for (let frame = 0; frame < 400; frame += 1) {
      view.position.x += 0.05;
      view.updateMatrixWorld(true);
      rain.update(1 / 60, view, STORM, STIFF_WIND);
    }
    expect(meshCensus(rain.root)).toEqual({ instanced: 2, loose: 0 });
    expect(rain.telemetry().perFrameAllocations).toBe(0);
    rain.dispose();
  });

  it('allocates its instance buffers once at the ceiling so quality stays live', () => {
    const { rain } = build({ quality: 'low' });
    const streaks = rain.root.children[0] as THREE.InstancedMesh;
    const splashes = rain.root.children[1] as THREE.InstancedMesh;
    expect(streaks.instanceMatrix.count).toBe(RAIN_MAX_STREAKS);
    expect(splashes.instanceMatrix.count).toBe(RAIN_MAX_SPLASHES);
    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    expect(rain.telemetry().streakInstances).toBeLessThanOrEqual(RAIN_BUDGET.low.streaks);
    // Raising quality must take effect without a rebuild.
    rain.setQuality('ultra');
    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    expect(rain.telemetry().streakInstances).toBeGreaterThan(RAIN_BUDGET.low.streaks);
    rain.dispose();
  });

  it('scales instance count with rain rate and costs nothing when clear', () => {
    const { rain } = build({ quality: 'ultra' });
    const view = camera();
    rain.update(1 / 60, view, clearWeatherSample('high-seas'), calmWind());
    expect(rain.telemetry().streakInstances).toBe(0);
    expect(rain.telemetry().splashInstances).toBe(0);
    expect((rain.root.children[0] as THREE.InstancedMesh).count).toBe(0);

    const light = sampleWeather('high-seas', 1, 0);
    rain.update(1 / 60, view, { ...light, rainRate: 0.34, wetness: 0.4, raining: true }, STIFF_WIND);
    const lightCount = rain.telemetry().streakInstances;
    rain.update(1 / 60, view, STORM, STIFF_WIND);
    expect(rain.telemetry().streakInstances).toBeGreaterThan(lightCount);
    rain.dispose();
  });
});

describe('rain survives the static batcher', () => {
  it('marks its root dynamic the way every other dynamic root does', () => {
    const { rain } = build();
    expect(rain.root.userData.dynamic).toBe(true);
    expect(rain.root.userData.presentationOnly).toBe(true);
    expect(rain.root.userData.blocksShots).toBe(false);
    rain.dispose();
  });

  it('is left completely alone by batchStaticMeshes', () => {
    // The Farcrysis regression: the batcher treated InstancedMesh as a plain
    // Mesh, cloned its geometry and hid the source, collapsing 2000+ instances
    // to one stray at the origin. Rain must be untouchable by that path.
    const { rain } = build({ quality: 'ultra' });
    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    const streaks = rain.root.children[0] as THREE.InstancedMesh;
    const splashes = rain.root.children[1] as THREE.InstancedMesh;
    const streakCount = streaks.count;
    const splashCount = splashes.count;
    const matrixBefore = Float32Array.from(streaks.instanceMatrix.array);

    const arena = new THREE.Group();
    // A genuinely batchable static mesh, so the batcher really does run.
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0x808080 }));
    arena.add(wall);
    arena.add(rain.root);
    const destination = new THREE.Group();
    batchStaticMeshes(arena, destination);

    expect(wall.visible).toBe(false); // proof the batcher actually ran
    expect(streaks.visible).toBe(true);
    expect(splashes.visible).toBe(true);
    expect(streaks.count).toBe(streakCount);
    expect(splashes.count).toBe(splashCount);
    expect(Float32Array.from(streaks.instanceMatrix.array)).toEqual(matrixBefore);
    expect(rain.root.parent).toBe(arena);
    expect(meshCensus(rain.root)).toEqual({ instanced: 2, loose: 0 });
    rain.dispose();
  });
});

describe('rain determinism', () => {
  it('gives two independent presentations identical instances from one seed', () => {
    const first = build({ seed: 0x5eed, quality: 'ultra' });
    const second = build({ seed: 0x5eed, quality: 'ultra' });
    expect(first.rain).not.toBe(second.rain);
    const left = camera();
    const right = camera();
    const field = createWindField('high-seas', 42);
    for (let frame = 0; frame < 90; frame += 1) {
      const time = frame / 60;
      const wind = sampleWind(field, 0, 0, time);
      for (const [rain, view] of [[first.rain, left], [second.rain, right]] as const) {
        view.position.set(Math.sin(time) * 4, 1.7, Math.cos(time) * 4);
        view.updateMatrixWorld(true);
        rain.update(1 / 60, view, STORM, wind);
      }
    }
    const leftStreaks = first.rain.root.children[0] as THREE.InstancedMesh;
    const rightStreaks = second.rain.root.children[0] as THREE.InstancedMesh;
    expect(rightStreaks.count).toBe(leftStreaks.count);
    expect(Float32Array.from(rightStreaks.instanceMatrix.array))
      .toEqual(Float32Array.from(leftStreaks.instanceMatrix.array));
    const leftSplashes = first.rain.root.children[1] as THREE.InstancedMesh;
    const rightSplashes = second.rain.root.children[1] as THREE.InstancedMesh;
    expect(Float32Array.from(rightSplashes.instanceMatrix.array))
      .toEqual(Float32Array.from(leftSplashes.instanceMatrix.array));
    expect(Float32Array.from(rightSplashes.instanceColor!.array))
      .toEqual(Float32Array.from(leftSplashes.instanceColor!.array));
    first.rain.dispose();
    second.rain.dispose();
  });

  it('scatters differently on a different seed', () => {
    const first = build({ seed: 1 });
    const second = build({ seed: 2 });
    first.rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    second.rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    expect(Float32Array.from((second.rain.root.children[0] as THREE.InstancedMesh).instanceMatrix.array))
      .not.toEqual(Float32Array.from((first.rain.root.children[0] as THREE.InstancedMesh).instanceMatrix.array));
    first.rain.dispose();
    second.rain.dispose();
  });
});

describe('rain keeps the volume around the player', () => {
  it('wraps every drop inside the camera-riding volume, however far the player walks', () => {
    const { rain } = build({ quality: 'ultra' });
    const view = camera();
    for (let frame = 0; frame < 600; frame += 1) {
      // Sprint 600 m away from the origin; the rain must come along.
      view.position.set(frame * 1.0, 1.7, frame * -0.6);
      view.updateMatrixWorld(true);
      rain.update(1 / 60, view, STORM, STIFF_WIND);
    }
    const streaks = rain.root.children[0] as THREE.InstancedMesh;
    let live = 0;
    for (const state of instanceStates(streaks)) {
      if (state.culled) continue;
      live += 1;
      expect(Math.abs(state.position.x - view.position.x)).toBeLessThanOrEqual(RAIN_VOLUME.radiusM + 1e-3);
      expect(Math.abs(state.position.z - view.position.z)).toBeLessThanOrEqual(RAIN_VOLUME.radiusM + 1e-3);
      expect(state.position.y - view.position.y).toBeLessThanOrEqual(RAIN_VOLUME.aboveM + 1e-3);
      expect(state.position.y - view.position.y).toBeGreaterThanOrEqual(-RAIN_VOLUME.belowM - 1e-3);
    }
    expect(live).toBeGreaterThan(500);
    rain.dispose();
  });

  it('clamps a hidden-tab dt so drops cannot teleport through the floor', () => {
    const { rain } = build();
    const view = camera();
    rain.update(1 / 60, view, STORM, STIFF_WIND);
    rain.update(9, view, STORM, STIFF_WIND); // tab was hidden for nine seconds
    for (const state of instanceStates(rain.root.children[0] as THREE.InstancedMesh)) {
      if (state.culled) continue;
      expect(Number.isFinite(state.position.y)).toBe(true);
      expect(state.position.y - view.position.y).toBeGreaterThanOrEqual(-RAIN_VOLUME.belowM - 1e-3);
    }
    rain.dispose();
  });
});

describe('rain never costs a gunfight', () => {
  it('caps streak opacity at the readability ceiling for every rate and ADS state', () => {
    const { rain } = build({ quality: 'ultra' });
    const view = camera();
    for (let rate = 0; rate <= 1.0001; rate += 0.05) {
      for (const ads of [0, 0.5, 1]) {
        rain.update(1 / 60, view, { ...STORM, rainRate: rate }, STIFF_WIND, { adsProgress: ads });
        const opacity = rain.telemetry().streakOpacity;
        expect(opacity, `rate ${rate} ads ${ads}`).toBeLessThanOrEqual(RAIN_READABILITY.maxOpacity + 1e-9);
        expect(opacity, `rate ${rate} ads ${ads}`).toBeGreaterThanOrEqual(0);
      }
    }
    // And ADS really does cut it, rather than the cap being the only guard.
    rain.update(1 / 60, view, STORM, STIFF_WIND, { adsProgress: 0 });
    const hipOpacity = rain.telemetry().streakOpacity;
    rain.update(1 / 60, view, STORM, STIFF_WIND, { adsProgress: 1 });
    const adsOpacity = rain.telemetry().streakOpacity;
    expect(adsOpacity).toBeCloseTo(hipOpacity * RAIN_READABILITY.adsOpacityScale, 6);
    rain.dispose();
  });

  it('empties the ADS centre - exactly the drops in the aim cylinder, and no others', () => {
    // Two presentations are stepped in lockstep, one hip-fire and one at full
    // ADS. Drop integration happens before any culling decision, so both carry
    // identical drop positions every frame and the entire difference in culling
    // is attributable to the ADS guard. Checked across many frames because the
    // aim cylinder is a small volume - a single frame holds only a few drops.
    const hip = build({ seed: 909, quality: 'ultra' });
    const ads = build({ seed: 909, quality: 'ultra' });
    const view = camera(3, 1.7, -2, 0.6);
    const eye = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const relative = new THREE.Vector3();
    let clearedByAds = 0;
    let comparedDrops = 0;

    for (let frame = 0; frame < 90; frame += 1) {
      view.rotation.y = 0.6 + frame * 0.02;
      view.updateMatrixWorld(true);
      hip.rain.update(1 / 60, view, STORM, STIFF_WIND, { adsProgress: 0 });
      ads.rain.update(1 / 60, view, STORM, STIFF_WIND, { adsProgress: 1 });
      view.getWorldPosition(eye);
      view.getWorldDirection(forward);

      const hipStates = instanceStates(hip.rain.root.children[0] as THREE.InstancedMesh);
      const adsStates = instanceStates(ads.rain.root.children[0] as THREE.InstancedMesh);
      expect(adsStates).toHaveLength(hipStates.length);

      for (let index = 0; index < hipStates.length; index += 1) {
        if (hipStates[index].culled) {
          // ADS may only ever remove drops, never add them back.
          expect(adsStates[index].culled, `frame ${frame} index ${index}`).toBe(true);
          continue;
        }
        comparedDrops += 1;
        relative.copy(hipStates[index].position).sub(eye);
        const forwardDistance = relative.dot(forward);
        const perpendicular = Math.sqrt(Math.max(0, relative.lengthSq() - forwardDistance * forwardDistance));
        const insideAimCylinder = forwardDistance > 0.2
          && forwardDistance < RAIN_READABILITY.adsClearRangeM
          && perpendicular < RAIN_READABILITY.adsClearRadiusM;
        expect(adsStates[index].culled, `frame ${frame} index ${index} fwd ${forwardDistance} perp ${perpendicular}`)
          .toBe(insideAimCylinder);
        if (insideAimCylinder) {
          clearedByAds += 1;
        } else {
          // A drop ADS kept must be the SAME drop, or the two runs have drifted
          // and the culling comparison above would be meaningless.
          expect(adsStates[index].position.distanceTo(hipStates[index].position)).toBeLessThan(1e-6);
        }
      }
    }
    expect(comparedDrops).toBeGreaterThan(50_000);
    expect(clearedByAds).toBeGreaterThan(20);
    hip.rain.dispose();
    ads.rain.dispose();
  });

  it('culls drops on the lens instead of smearing the whole screen', () => {
    const { rain } = build({ quality: 'ultra' });
    const view = camera();
    for (let frame = 0; frame < 40; frame += 1) rain.update(1 / 60, view, STORM, STIFF_WIND);
    const eye = new THREE.Vector3();
    view.getWorldPosition(eye);
    for (const state of instanceStates(rain.root.children[0] as THREE.InstancedMesh)) {
      if (state.culled) continue;
      expect(state.position.distanceTo(eye)).toBeGreaterThanOrEqual(RAIN_READABILITY.nearCullM - 1e-6);
    }
    rain.dispose();
  });

  it('keeps splash rings far quieter than the streaks', () => {
    expect(RAIN_READABILITY.splashMaxOpacity).toBeLessThan(RAIN_READABILITY.maxOpacity);
  });
});

describe('wetness response', () => {
  it('darkens the surface and raises its specular response, not its roughness', () => {
    // Water fills the microstructure: albedo down, roughness DOWN. Raising
    // roughness with wetness makes wet tarmac chalkier than dry tarmac.
    const dry = wetSurfaceResponse(0.9, 0.02, 0);
    const soaked = wetSurfaceResponse(0.9, 0.02, 1);
    expect(dry.albedoScale).toBe(1);
    expect(dry.roughness).toBe(0.9);
    expect(soaked.albedoScale).toBeLessThan(dry.albedoScale);
    expect(soaked.roughness).toBeLessThan(dry.roughness);
    expect(soaked.metalness).toBeGreaterThan(dry.metalness);
    expect(soaked.roughness).toBeGreaterThanOrEqual(WETNESS_RESPONSE.minRoughness);
  });

  it('is monotonic and never produces a mirror floor or a black one', () => {
    let previous = wetSurfaceResponse(0.5, 0, 0);
    for (let wetness = 0.05; wetness <= 1.0001; wetness += 0.05) {
      const current = wetSurfaceResponse(0.5, 0, wetness);
      expect(current.albedoScale).toBeLessThanOrEqual(previous.albedoScale);
      expect(current.roughness).toBeLessThanOrEqual(previous.roughness);
      expect(current.albedoScale).toBeGreaterThan(0.3);
      expect(current.roughness).toBeGreaterThanOrEqual(WETNESS_RESPONSE.minRoughness);
      expect(current.metalness).toBeLessThanOrEqual(1);
      previous = current;
    }
    // Out-of-range wetness must clamp rather than invert the response.
    expect(wetSurfaceResponse(0.5, 0, 4).roughness).toBe(wetSurfaceResponse(0.5, 0, 1).roughness);
    expect(wetSurfaceResponse(0.5, 0, -3).roughness).toBe(0.5);
  });

  it('drives registered ground materials and restores them on dispose', () => {
    const { rain } = build();
    const ground = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.85, metalness: 0.03 });
    const dryColor = ground.color.clone();
    rain.registerWetSurface(ground);
    // Registering twice must not snapshot the already-wet values as "dry".
    rain.registerWetSurface(ground);
    expect(rain.telemetry().wetSurfaces).toBe(1);

    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    expect(ground.roughness).toBeLessThan(0.85);
    expect(ground.color.r).toBeLessThan(dryColor.r);
    expect(rain.telemetry().wetness).toBe(1);

    // Wetness outlives the rain: a cleared sky with wet ground stays wet.
    rain.update(1 / 60, camera(), { ...clearWeatherSample('high-seas'), wetness: 0.6 }, calmWind());
    expect(ground.roughness).toBeLessThan(0.85);
    expect(rain.telemetry().rainRate).toBe(0);

    rain.dispose();
    expect(ground.roughness).toBe(0.85);
    expect(ground.metalness).toBe(0.03);
    expect(ground.color.getHex()).toBe(dryColor.getHex());
  });
});

describe('rain compatibility guard', () => {
  it('bypasses exactly where bloom and ambient occlusion bypass', () => {
    expect(rainBypassReason('compat', 'NVIDIA GeForce RTX 4090', null)).toBe('compat-profile');
    expect(rainBypassReason('blender', 'NVIDIA GeForce RTX 4090', 'off')).toBe('query-disabled');
    expect(rainBypassReason('blender', 'Google SwiftShader', null)).toBe('software-renderer');
    expect(rainBypassReason('blender', 'Google SwiftShader', 'on')).toBeNull();
    expect(rainBypassReason('blender', 'NVIDIA GeForce RTX 4090', null)).toBeNull();
    expect(rainBypassReason('performance', 'Apple M3 Pro', null)).toBeNull();
  });

  it('degrades to nothing on the WebGL2 compat route without throwing a frame', () => {
    const { rain, scene } = build({ profile: 'compat' });
    // The root still attaches, so arena teardown has one thing to find either
    // way - the AtmosphereSystem bypass contract.
    expect(scene.children).toContain(rain.root);
    expect(meshCensus(rain.root)).toEqual({ instanced: 0, loose: 0 });
    const telemetry = rain.telemetry();
    expect(telemetry.enabled).toBe(false);
    expect(telemetry.bypassReason).toBe('compat-profile');
    expect(() => rain.update(1 / 60, camera(), STORM, STIFF_WIND)).not.toThrow();
    expect(() => rain.handleContextRestored()).not.toThrow();
    expect(rain.telemetry().streakInstances).toBe(0);
    expect(() => rain.dispose()).not.toThrow();
  });

  it('still drives wetness when the streak pass is bypassed', () => {
    // The compat player gets no rain, but the arena must not look bone dry
    // while everyone else is fighting in a downpour.
    const { rain } = build({ profile: 'compat' });
    const ground = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.85, metalness: 0.03 });
    rain.registerWetSurface(ground);
    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    expect(ground.roughness).toBeLessThan(0.85);
    rain.dispose();
    expect(ground.roughness).toBe(0.85);
  });
});

describe('rain lifecycle', () => {
  it('builds once, detaches on dispose, and tolerates repeat calls', () => {
    const { rain, scene } = build();
    rain.build(scene); // idempotent
    expect(scene.children.filter((child) => child === rain.root)).toHaveLength(1);
    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    rain.dispose();
    rain.dispose();
    expect(scene.children).not.toContain(rain.root);
    expect(rain.root.children).toHaveLength(0);
    expect(() => rain.update(1 / 60, camera(), STORM, STIFF_WIND)).not.toThrow();
    expect(rain.telemetry().enabled).toBe(false);
  });

  it('accepts real weather and wind samples end to end', () => {
    const { rain } = build();
    const field = createWindField('farcrysis', 8);
    const view = camera();
    for (let elapsed = 0; elapsed < 600; elapsed += 0.25) {
      const weather = sampleWeather('farcrysis', 8, elapsed);
      const wind = sampleWind(field, view.position.x, view.position.z, elapsed, weather.windMultiplier);
      expect(() => rain.update(0.25, view, weather, wind, { groundY: 0.5, densityScale: 0.8 })).not.toThrow();
    }
    for (const state of instanceStates(rain.root.children[0] as THREE.InstancedMesh)) {
      expect(Number.isFinite(state.position.x)).toBe(true);
      expect(Number.isFinite(state.position.y)).toBe(true);
      expect(Number.isFinite(state.position.z)).toBe(true);
    }
    rain.dispose();
  });

  it('survives a garbage update without producing NaN instances', () => {
    const { rain } = build();
    const view = camera();
    rain.update(Number.NaN, view, { ...STORM, rainRate: Number.NaN, wetness: Number.NaN }, {
      x: Number.NaN, z: Number.NaN, speed: Number.NaN, bearingRadians: 0, gust: 0,
    });
    for (const state of instanceStates(rain.root.children[0] as THREE.InstancedMesh)) {
      expect(Number.isFinite(state.position.x)).toBe(true);
    }
    expect(Number.isFinite(rain.telemetry().wetness)).toBe(true);
    rain.dispose();
  });
});
