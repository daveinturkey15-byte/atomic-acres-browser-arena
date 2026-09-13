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
import { NO_LIGHTNING, clearWeatherSample, sampleWeather, type WeatherSample } from './weather-state';
import { calmWind, createWindField, sampleWind, type WindSample } from './wind-field';
import {
  RAIN_BUDGET,
  RAIN_LIGHTNING,
  RAIN_MAX_SIGHTLINE_OBSCURATION,
  RAIN_MAX_SPLASHES,
  RAIN_MAX_STREAKS,
  RAIN_READABILITY,
  RAIN_SHEETS,
  RAIN_STRATA,
  RAIN_VOLUME,
  RainPresentation,
  WETNESS_MAX_ADOPTED_SURFACES,
  WETNESS_RESPONSE,
  OVERCAST_FILL,
  WEATHER_FOG,
  WEATHER_FOG_MAX_ADDED_EXTINCTION,
  assertRainCombatSafety,
  assertWeatherFogCombatSafety,
  linearFogFactor,
  overcastFillIntensity,
  rainBypassReason,
  weatherFogAddedExtinction,
  weatherFogFar,
  rainSightlineObscuration,
  wetSurfaceResponse,
  type RainQualityTier,
} from './rain-presentation';
import { resolveWeatherPresentation } from './weather-settings';

const STORM: WeatherSample = Object.freeze({
  arenaId: 'high-seas',
  state: 'storm',
  previousState: 'storm',
  simulatedState: 'storm',
  severity: 4,
  presentationCeiling: 'storm',
  phaseIndex: 3,
  transitionBlend: 1,
  intensity: 1,
  rainRate: 1,
  windMultiplier: 1.78,
  wetness: 1,
  fogDensityMultiplier: 2.15,
  skyDarkenAmount: 0.58,
  raining: true,
  lightning: NO_LIGHTNING,
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
    // 90 frames x 1400 drops is 126,000 comparisons, so the findings are
    // collected and asserted ONCE rather than through a quarter of a million
    // expect() calls. The claim is unchanged - an empty findings list is
    // exactly "every drop agreed" - and a failure still names the drop.
    const findings: string[] = [];

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
          if (!adsStates[index].culled) findings.push(`frame ${frame} index ${index} resurrected a culled drop`);
          continue;
        }
        comparedDrops += 1;
        relative.copy(hipStates[index].position).sub(eye);
        const forwardDistance = relative.dot(forward);
        const perpendicular = Math.sqrt(Math.max(0, relative.lengthSq() - forwardDistance * forwardDistance));
        const insideAimCylinder = forwardDistance > 0.2
          && forwardDistance < RAIN_READABILITY.adsClearRangeM
          && perpendicular < RAIN_READABILITY.adsClearRadiusM;
        if (adsStates[index].culled !== insideAimCylinder) {
          findings.push(
            `frame ${frame} index ${index} fwd ${forwardDistance.toFixed(3)} perp ${perpendicular.toFixed(3)}`
            + ` expected culled=${insideAimCylinder}`,
          );
        }
        if (insideAimCylinder) {
          clearedByAds += 1;
        } else if (adsStates[index].position.distanceTo(hipStates[index].position) >= 1e-6) {
          // A drop ADS kept must be the SAME drop, or the two runs have drifted
          // and the culling comparison above would be meaningless.
          findings.push(`frame ${frame} index ${index} drifted between the two runs`);
        }
      }
    }
    expect(findings.slice(0, 5)).toEqual([]);
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

/** Per-instance basis lengths, so size stratification is measurable. */
function instanceScales(mesh: THREE.InstancedMesh): { width: number; length: number }[] {
  const matrix = new THREE.Matrix4();
  const scales: { width: number; length: number }[] = [];
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    const e = matrix.elements;
    scales.push({
      width: Math.hypot(e[0], e[1], e[2]),
      length: Math.hypot(e[4], e[5], e[6]),
    });
  }
  return scales;
}

function markedSurface(name: string, impactSurface: string | null): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.82, metalness: 0.04 });
  material.name = name + '-material';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  if (impactSurface !== null) mesh.userData.impactSurface = impactSurface;
  return mesh;
}

describe('rain readability is arithmetic, not taste', () => {
  it('passes its own fail-closed combat-safety assertion', () => {
    expect(() => assertRainCombatSafety()).not.toThrow();
  });

  it('removes under the stated fraction of a sightline at the worst settings', () => {
    // THE BOUND THIS LANE ENFORCES. At the instance ceiling and the opacity
    // ceiling - i.e. with every weather setting at maximum - the whole rain
    // volume removes this much of the light between the player and a target.
    const worst = rainSightlineObscuration(RAIN_MAX_STREAKS, RAIN_READABILITY.maxOpacity);
    expect(worst).toBeLessThanOrEqual(RAIN_MAX_SIGHTLINE_OBSCURATION);
    // The shipped figure, pinned in BOTH directions rather than merely bounded:
    // a budget or geometry edit has to come and argue with this number, and an
    // accidental collapse toward zero is as much a regression as a breach.
    expect(worst).toBeCloseTo(0.0386, 4);
    // And it is a real function of the inputs, not a constant that happens to
    // be small: doubling the drops doubles the obscuration.
    expect(rainSightlineObscuration(2 * 400, RAIN_READABILITY.maxOpacity))
      .toBeCloseTo(2 * rainSightlineObscuration(400, RAIN_READABILITY.maxOpacity), 9);
    expect(rainSightlineObscuration(0, RAIN_READABILITY.maxOpacity)).toBe(0);
  });

  it('cannot be pushed past the instance ceiling by the density slider', () => {
    const { rain } = build({ quality: 'ultra' });
    const view = camera();
    rain.update(1 / 60, view, STORM, STIFF_WIND, {
      presentation: resolveWeatherPresentation({ rainDensity: 1.5 }),
    });
    const telemetry = rain.telemetry();
    expect(telemetry.streakInstances).toBeLessThanOrEqual(RAIN_BUDGET.ultra.streaks);
    expect(telemetry.sightlineObscuration).toBeLessThanOrEqual(RAIN_MAX_SIGHTLINE_OBSCURATION);
    expect(telemetry.streakOpacity).toBeLessThanOrEqual(RAIN_READABILITY.maxOpacity);
    rain.dispose();
  });
});

describe('the player density setting', () => {
  it('thins the rain out and fills it back in', () => {
    const { rain } = build({ quality: 'ultra' });
    const view = camera();
    const countAt = (rainDensity: number) => {
      rain.update(1 / 60, view, { ...STORM, rainRate: 0.5 }, STIFF_WIND, {
        presentation: resolveWeatherPresentation({ rainDensity }),
      });
      return rain.telemetry().streakInstances;
    };
    const quarter = countAt(0.25);
    const authored = countAt(1);
    const most = countAt(1.5);
    expect(quarter).toBeGreaterThan(0);
    expect(authored).toBeGreaterThan(quarter * 3);
    expect(most).toBeGreaterThan(authored);
    rain.dispose();
  });

  it('lets a deliberate push above authored density raise the instance ceiling', () => {
    // The tier is pinned by the caller, not by the player, so without this the
    // top half of the slider was inert in heavy rain. It may only ever go UP,
    // only above 1.00x, and never past the ceiling the readability proof uses.
    const { rain } = build({ quality: 'high' });
    const view = camera();
    const countAt = (rainDensity: number) => {
      rain.update(1 / 60, view, STORM, STIFF_WIND, { presentation: resolveWeatherPresentation({ rainDensity }) });
      return rain.telemetry().streakInstances;
    };
    expect(countAt(1)).toBeLessThanOrEqual(RAIN_BUDGET.high.streaks);
    const pushed = countAt(1.5);
    expect(pushed).toBeGreaterThan(RAIN_BUDGET.high.streaks);
    expect(pushed).toBeLessThanOrEqual(RAIN_BUDGET.ultra.streaks);
    expect(rain.telemetry().sightlineObscuration).toBeLessThanOrEqual(RAIN_MAX_SIGHTLINE_OBSCURATION);
    // ...and a pinned tier is still a floor the player cannot fall below.
    expect(countAt(0.25)).toBeLessThan(RAIN_BUDGET.high.streaks);
    rain.dispose();
  });

  it('reports the player settings in telemetry so a receipt can show them', () => {
    const { rain } = build();
    rain.update(1 / 60, camera(), STORM, STIFF_WIND, {
      presentation: resolveWeatherPresentation({
        weatherIntensity: 'moderate', rainDensity: 0.6, windStrength: 1.35, lightning: false,
      }),
    });
    expect(rain.telemetry()).toMatchObject({
      weatherIntensity: 'moderate',
      rainDensity: 0.6,
      windStrength: 1.35,
      lightningEnabled: false,
    });
    rain.dispose();
  });
});

describe('rain reads as a volume, not an overlay', () => {
  it('gives drops a spread of sizes instead of one printed streak', () => {
    const { rain } = build({ quality: 'ultra' });
    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    const streaks = rain.root.children[0] as THREE.InstancedMesh;
    const scales = instanceScales(streaks).filter(({ width }) => width > 1e-6);
    expect(scales.length).toBeGreaterThan(100);
    const widths = scales.map(({ width }) => width);
    const thinnest = Math.min(...widths);
    const fattest = Math.max(...widths);
    // A volume of identical drops is exactly what the audit called a flat
    // overlay; the size ratio here is the depth cue that fixes it.
    expect(fattest / thinnest).toBeGreaterThan(2);
    expect(fattest).toBeLessThanOrEqual(RAIN_STRATA.maxSizeScale * 0.028 + 1e-6);
    rain.dispose();
  });

  it('arrives in sheets - a gust empties gaps a calm sky keeps filled', () => {
    const view = camera();
    const gusting = build({ quality: 'ultra', seed: 99 });
    const calm = build({ quality: 'ultra', seed: 99 });
    gusting.rain.update(1 / 60, view, STORM, { ...STIFF_WIND, gust: 1 });
    calm.rain.update(1 / 60, view, STORM, { ...STIFF_WIND, gust: 0 });
    const culledIn = (rain: RainPresentation) => instanceStates(rain.root.children[0] as THREE.InstancedMesh)
      .filter(({ culled }) => culled).length;
    // A deep gust carves real gaps; a lull leaves the volume nearly full.
    expect(culledIn(gusting.rain)).toBeGreaterThan(culledIn(calm.rain));
    expect(RAIN_SHEETS.gustDepth).toBeGreaterThan(RAIN_SHEETS.calmDepth);
    gusting.rain.dispose();
    calm.rain.dispose();
  });

  it('travels the sheets downwind instead of leaving a fixed stencil', () => {
    const { rain } = build({ quality: 'ultra', seed: 5 });
    const view = camera();
    const streaks = rain.root.children[0] as THREE.InstancedMesh;
    rain.update(1 / 60, view, STORM, { ...STIFF_WIND, gust: 1 });
    const first = instanceStates(streaks).map(({ culled }) => culled);
    // The camera does not move; only the sheet phase advances.
    for (let frame = 0; frame < 45; frame += 1) rain.update(1 / 60, view, STORM, { ...STIFF_WIND, gust: 1 });
    const later = instanceStates(streaks).map(({ culled }) => culled);
    let changed = 0;
    for (let index = 0; index < Math.min(first.length, later.length); index += 1) {
      if (first[index] !== later[index]) changed += 1;
    }
    expect(changed).toBeGreaterThan(20);
    rain.dispose();
  });
});

describe('lightning presentation', () => {
  it('lights the sky with shadowless lights, by name, and never more than the cap', () => {
    // RE-PINNED IN PASS 79, STRICTER. This used to assert `lights.length === 1`
    // and then index `lights[0]`, which passes just as happily if the one light
    // present is the WRONG light. It now pins the exact SET of lights the root
    // is allowed to carry, by name, and holds every light in it to a cap - so
    // both a third light and a silently renamed one fail here.
    const { rain } = build();
    const lights = rain.root.children.filter((child) => (child as THREE.Light).isLight) as THREE.HemisphereLight[];
    expect(lights.map((light) => light.name).sort()).toEqual([
      'pass78-weather-lightning-flash',
      'pass79-weather-overcast-fill',
    ]);
    const flashLight = lights.find((light) => light.name === 'pass78-weather-lightning-flash') as THREE.HemisphereLight;
    const overcastLight = lights.find((light) => light.name === 'pass79-weather-overcast-fill') as THREE.HemisphereLight;
    for (const light of lights) {
      // No light this system owns may ever cast a shadow: a shadow-casting
      // light is the one way an added light could DARKEN something and hide a
      // player in it.
      expect(light.castShadow, light.name).toBe(false);
      expect(light.intensity, light.name).toBe(0);
    }
    // Still exactly two instanced draws and no loose meshes: a light is not a
    // draw call, which is why the flash is free.
    expect(meshCensus(rain.root)).toEqual({ instanced: 2, loose: 0 });

    for (const flash of [0, 0.15, 0.4, RAIN_LIGHTNING.peakLightIntensity, 1]) {
      rain.update(1 / 60, camera(), { ...STORM, lightning: { ...STORM.lightning, flash, active: flash > 0 } }, STIFF_WIND);
      expect(flashLight.intensity, 'flash ' + flash).toBeLessThanOrEqual(RAIN_LIGHTNING.peakLightIntensity + 1e-9);
      expect(flashLight.intensity, 'flash ' + flash).toBeCloseTo(
        Math.min(1, flash) * RAIN_LIGHTNING.peakLightIntensity,
        9,
      );
      // The overcast channel is separate and separately capped: a flash may not
      // leak into it and it may not leak into a flash.
      expect(overcastLight.intensity, 'flash ' + flash).toBeLessThanOrEqual(OVERCAST_FILL.peakIntensity + 1e-9);
      expect(overcastLight.intensity, 'flash ' + flash)
        .toBeCloseTo(overcastFillIntensity(STORM.skyDarkenAmount), 9);
    }
    // And the total this system can ever add is the sum of its two caps, which
    // is what bounds the whole feature's effect on the picture.
    const total = flashLight.intensity + overcastLight.intensity;
    expect(total).toBeLessThanOrEqual(RAIN_LIGHTNING.peakLightIntensity + OVERCAST_FILL.peakIntensity + 1e-9);
    rain.dispose();
  });

  it('brightens the rain without touching the alpha that hides a target', () => {
    const { rain } = build();
    const streaks = rain.root.children[0] as THREE.InstancedMesh;
    const material = streaks.material as THREE.MeshBasicMaterial;
    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    const darkOpacity = material.opacity;
    expect(material.color.r).toBe(1);

    rain.update(1 / 60, camera(), { ...STORM, lightning: { ...STORM.lightning, flash: 1, active: true } }, STIFF_WIND);
    // Brighter: the rain in front of you is what a strike most obviously lights.
    expect(material.color.r).toBeCloseTo(1 + RAIN_LIGHTNING.streakBrightnessLift, 9);
    // ...and NOT more opaque. Alpha is what attenuates whatever is behind the
    // streak, so it is the one channel a flash may never touch.
    expect(material.opacity).toBe(darkOpacity);
    expect(rain.telemetry().streakOpacity).toBeLessThanOrEqual(RAIN_READABILITY.maxOpacity);
    rain.dispose();
  });

  it('stays dark when the player turns it off', () => {
    const { rain } = build();
    // Addressed by name rather than by "the first light that happens to be
    // there", so this cannot start silently checking a different light.
    const light = rain.root.getObjectByName('pass78-weather-lightning-flash') as THREE.HemisphereLight;
    rain.update(1 / 60, camera(), { ...STORM, lightning: { ...STORM.lightning, flash: 1, active: true } }, STIFF_WIND, {
      presentation: resolveWeatherPresentation({ lightning: false }),
    });
    expect(light.intensity).toBe(0);
    expect(rain.telemetry().lightningFlash).toBe(0);
    // Turning LIGHTNING off must not turn the overcast sky off with it: they
    // are two separate rows in Options and two separate channels here.
    const fill = rain.root.getObjectByName('pass79-weather-overcast-fill') as THREE.HemisphereLight;
    expect(fill.intensity).toBeCloseTo(overcastFillIntensity(STORM.skyDarkenAmount), 9);
    rain.dispose();
  });
});

describe('wet surfaces find themselves', () => {
  it('adopts world geometry and leaves the viewmodel alone', () => {
    const { rain, scene } = build();
    const ground = markedSurface('ground', 'concrete');
    const wall = markedSurface('wall', 'metal');
    const viewmodel = markedSurface('weapon-viewmodel', null);
    const glass = markedSurface('window', 'glass');
    (glass.material as THREE.MeshStandardMaterial).transparent = true;
    scene.add(ground, wall, viewmodel, glass);

    // Nothing is touched while the ground is dry.
    rain.update(1 / 60, camera(), { ...STORM, wetness: 0, rainRate: 0 }, calmWind());
    expect(rain.telemetry().wetSurfaces).toBe(0);

    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    expect(rain.telemetry().wetSurfaces).toBe(2);
    expect(rain.telemetry().autoAdoptedWetSurfaces).toBe(2);
    // Marked world geometry darkens and glosses; nothing else moves.
    expect((ground.material as THREE.MeshStandardMaterial).color.r).toBeLessThan(0.9);
    expect((ground.material as THREE.MeshStandardMaterial).roughness).toBeLessThan(0.82);
    expect((viewmodel.material as THREE.MeshStandardMaterial).roughness).toBe(0.82);
    expect((glass.material as THREE.MeshStandardMaterial).roughness).toBe(0.82);
    rain.dispose();
  });

  it('restores every adopted surface when the arena is torn down', () => {
    const { rain, scene } = build();
    const ground = markedSurface('ground', 'concrete');
    const material = ground.material as THREE.MeshStandardMaterial;
    const dry = { color: material.color.clone(), roughness: material.roughness, metalness: material.metalness };
    scene.add(ground);
    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    expect(material.color.equals(dry.color)).toBe(false);
    rain.dispose();
    expect(material.color.equals(dry.color)).toBe(true);
    expect(material.roughness).toBe(dry.roughness);
    expect(material.metalness).toBe(dry.metalness);
  });

  it('is bounded - a huge arena cannot make the scan unbounded work', () => {
    const { rain, scene } = build();
    for (let index = 0; index < WETNESS_MAX_ADOPTED_SURFACES + 40; index += 1) {
      scene.add(markedSurface('ground-' + index, 'concrete'));
    }
    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    expect(rain.telemetry().wetSurfaces).toBe(WETNESS_MAX_ADOPTED_SURFACES);
    rain.dispose();
  });

  it('does not re-scan the scene on every frame', () => {
    const { rain, scene } = build();
    scene.add(markedSurface('ground', 'concrete'));
    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    expect(rain.telemetry().wetSurfaces).toBe(1);
    // A surface added a frame later must NOT be picked up until the next scan
    // window - that is the whole point of the throttle.
    scene.add(markedSurface('tarmac', 'concrete'));
    rain.update(1 / 60, camera(), STORM, STIFF_WIND);
    expect(rain.telemetry().wetSurfaces).toBe(1);
    // The frame delta is clamped to 0.1 s before anything integrates, so the
    // scan window is walked in real frames rather than one giant step.
    for (let frame = 0; frame < 30; frame += 1) rain.update(0.1, camera(), STORM, STIFF_WIND);
    expect(rain.telemetry().wetSurfaces).toBe(2);
    rain.dispose();
  });
});

describe('weather reaches the world behind the rain', () => {
  // THE DEFECT THIS SUITE EXISTS FOR. `fogDensityMultiplier` and
  // `skyDarkenAmount` were computed by the weather model from Pass 76 and read
  // by NOTHING outside tests, so heavy rain fell through an untouched sunny
  // sky and read as an overlay. Every assertion below is on what the SCENE
  // ends up holding, never on the value we handed the system.
  const AUTHORED_NEAR = 58;
  const AUTHORED_FAR = 148;

  function withFog() {
    const built = build();
    built.scene.fog = new THREE.Fog(0xb1c0be, AUTHORED_NEAR, AUTHORED_FAR);
    return built;
  }

  it('pulls the fog far plane in when it rains and hands it back when it clears', () => {
    const { rain, scene } = withFog();
    const fog = scene.fog as THREE.Fog;
    rain.update(0.016, camera(), clearWeatherSample('high-seas'), calmWind());
    expect(fog.near).toBe(AUTHORED_NEAR);
    expect(fog.far).toBe(AUTHORED_FAR);

    rain.update(0.016, camera(), STORM, STIFF_WIND);
    expect(fog.near).toBe(AUTHORED_NEAR);
    expect(fog.far).toBeLessThan(AUTHORED_FAR);
    const stormFar = fog.far;

    // Idempotent: a second storm frame must not compound onto our own output.
    rain.update(0.016, camera(), STORM, STIFF_WIND);
    expect(fog.far).toBeCloseTo(stormFar, 9);

    rain.update(0.016, camera(), clearWeatherSample('high-seas'), calmWind());
    expect(fog.far).toBe(AUTHORED_FAR);
  });

  it('re-adopts the arena baseline when something else rewrites the fog', () => {
    // legacy-main sets fog.near/far on arena change and on lighting re-apply.
    // Compounding our multiplier onto our own previous output would walk the
    // far plane in a little further on every arena load.
    const { rain, scene } = withFog();
    const fog = scene.fog as THREE.Fog;
    rain.update(0.016, camera(), STORM, STIFF_WIND);
    const firstStormFar = fog.far;

    fog.near = 70;
    fog.far = 260;
    rain.update(0.016, camera(), STORM, STIFF_WIND);
    expect(fog.near).toBe(70);
    expect(fog.far).toBeGreaterThan(firstStormFar);
    expect(fog.far).toBe(weatherFogFar(70, 260, STORM.fogDensityMultiplier));

    rain.dispose();
    expect(fog.far).toBe(260);
  });

  it('never moves the near plane, so it adds nothing at fighting range', () => {
    const { rain, scene } = withFog();
    const fog = scene.fog as THREE.Fog;
    rain.update(0.016, camera(), STORM, STIFF_WIND);
    for (let distance = 0; distance <= AUTHORED_NEAR; distance += 1) {
      expect(linearFogFactor(distance, fog.near, fog.far)).toBe(0);
      expect(linearFogFactor(distance, AUTHORED_NEAR, AUTHORED_FAR)).toBe(0);
    }
    expect(weatherFogAddedExtinction(30, AUTHORED_NEAR, AUTHORED_FAR, STORM.fogDensityMultiplier)).toBe(0);
  });

  it('leaves an arena that already hazes at fighting range completely alone', () => {
    const near = WEATHER_FOG.minAuthoredNearM - 1;
    expect(weatherFogFar(near, near + 200, 2.15)).toBe(near + 200);
    // And a span already at or under the floor is never shortened further.
    expect(weatherFogFar(80, 80 + WEATHER_FOG.minSpanM, 2.15)).toBe(80 + WEATHER_FOG.minSpanM);
  });

  it('holds the added-extinction ceiling across every fog geometry an arena could author', () => {
    expect(() => assertWeatherFogCombatSafety()).not.toThrow();
    let worst = 0;
    for (let near = WEATHER_FOG.minAuthoredNearM; near <= 200; near += 1) {
      for (let span = 1; span <= 400; span += 1) {
        worst = Math.max(worst, weatherFogAddedExtinction(
          near + WEATHER_FOG.guardRangeBeyondNearM, near, near + span, 2.15,
        ));
      }
    }
    expect(worst).toBeLessThanOrEqual(WEATHER_FOG_MAX_ADDED_EXTINCTION);
    // Pin the measured worst case, not just the ceiling: a change that doubled
    // the effect but stayed under the cap would otherwise pass unnoticed.
    expect(worst).toBeLessThan(0.19);
  });

  it('answers an overcast sky by ADDING fill, never by taking light away', () => {
    const { rain, scene } = withFog();
    const fill = scene.getObjectByName('pass79-weather-overcast-fill') as THREE.HemisphereLight;
    expect(fill).toBeInstanceOf(THREE.HemisphereLight);
    expect(fill.castShadow).toBe(false);

    rain.update(0.016, camera(), clearWeatherSample('high-seas'), calmWind());
    expect(fill.intensity).toBe(0);

    rain.update(0.016, camera(), STORM, STIFF_WIND);
    expect(fill.intensity).toBeGreaterThan(0);
    expect(fill.intensity).toBe(overcastFillIntensity(STORM.skyDarkenAmount));
    // Monotone, bounded, and never negative - the whole safety claim.
    let previous = -1;
    for (let darken = 0; darken <= 1.0001; darken += 0.05) {
      const value = overcastFillIntensity(darken);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(OVERCAST_FILL.peakIntensity);
      previous = value;
    }
    expect(overcastFillIntensity(9)).toBe(OVERCAST_FILL.peakIntensity);
    expect(overcastFillIntensity(Number.NaN)).toBe(0);
  });

  it('reports the fog it actually wrote, not the multiplier it was handed', () => {
    const { rain, scene } = withFog();
    rain.update(0.016, camera(), STORM, STIFF_WIND);
    const telemetry = rain.telemetry();
    expect(telemetry.fogNear).toBe(AUTHORED_NEAR);
    expect(telemetry.authoredFogFar).toBe(AUTHORED_FAR);
    expect(telemetry.fogFar).toBe((scene.fog as THREE.Fog).far);
    expect(telemetry.fogFar).toBeLessThan(AUTHORED_FAR);
    expect(telemetry.fogDensityMultiplier).toBeCloseTo(STORM.fogDensityMultiplier, 9);
    expect(telemetry.fogAddedExtinctionAt30M).toBe(0);
    expect(telemetry.overcastFillIntensity).toBeGreaterThan(0);
    // Still exactly two instanced draws and no loose meshes: the gloom is two
    // uniform writes, not a third pass.
    expect(telemetry.instancedDraws).toBe(2);
    expect(telemetry.looseMeshes).toBe(0);
  });

  it('honours WEATHER: OFF - a player who turned weather off gets no gloom either', () => {
    const { rain, scene } = withFog();
    const fog = scene.fog as THREE.Fog;
    const fill = scene.getObjectByName('pass79-weather-overcast-fill') as THREE.HemisphereLight;
    rain.update(0.016, camera(), STORM, STIFF_WIND, {
      presentation: resolveWeatherPresentation({ weatherIntensity: 'off' }),
    });
    expect(fog.far).toBe(AUTHORED_FAR);
    expect(fill.intensity).toBe(0);
  });

  it('does not touch a bypassed profile at all', () => {
    const rain = new RainPresentation({
      profile: 'compat', rendererLabel: 'ANGLE (Software)', quality: 'ultra', seed: 7,
    });
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xb1c0be, AUTHORED_NEAR, AUTHORED_FAR);
    rain.build(scene);
    rain.update(0.016, camera(), STORM, STIFF_WIND);
    expect((scene.fog as THREE.Fog).far).toBe(AUTHORED_FAR);
    expect(rain.telemetry().overcastFillIntensity).toBe(0);
  });

  it('is a pure function of the sample, so two peers write identical fog', () => {
    const left = withFog();
    const right = withFog();
    for (let frame = 0; frame < 40; frame += 1) {
      left.rain.update(0.016, camera(3, 1.7, -2), STORM, STIFF_WIND);
      right.rain.update(0.016, camera(3, 1.7, -2), STORM, STIFF_WIND);
    }
    expect((left.scene.fog as THREE.Fog).far).toBe((right.scene.fog as THREE.Fog).far);
    expect(left.rain.telemetry().overcastFillIntensity)
      .toBe(right.rain.telemetry().overcastFillIntensity);
  });
});

describe('the wet surfaces row reaches the arena materials', () => {
  // Asserting the OUTPUT: every check below reads the MATERIAL the system
  // wrote, never the boolean it was handed. The skin system passed for months
  // by asserting its own input; this family does not get to repeat that.
  function scene(): { rain: RainPresentation; material: THREE.MeshStandardMaterial } {
    const rain = new RainPresentation({
      profile: 'blender', rendererLabel: 'NVIDIA GeForce RTX 5080', quality: 'ultra', seed: 99,
    });
    const root = new THREE.Scene();
    rain.build(root);
    const material = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.9, metalness: 0 });
    rain.registerWetSurface(material);
    return { rain, material };
  }

  it('darkens and glosses the ground when it is on', () => {
    const { rain, material } = scene();
    rain.update(0.016, camera(), STORM, STIFF_WIND);
    expect(material.roughness).toBeLessThan(0.9);
    expect(material.color.r).toBeLessThan(0.5);
    expect(material.roughness).toBeCloseTo(wetSurfaceResponse(0.9, 0, 1).roughness, 9);
    rain.dispose();
  });

  it('leaves the arena exactly as it found it when the row is off', () => {
    const { rain, material } = scene();
    const off = resolveWeatherPresentation({ wetSurfaces: false });
    rain.update(0.016, camera(), STORM, STIFF_WIND, { presentation: off });
    expect(material.roughness).toBe(0.9);
    expect(material.metalness).toBe(0);
    expect(material.color.getHex()).toBe(0x808080);
    // ...and the wetness itself is still SIMULATED and still reported, because
    // every peer agrees on it whatever this screen chooses to draw.
    expect(rain.telemetry().wetness).toBe(STORM.wetness);
    rain.dispose();
  });

  it('puts an already-wet world back when the player turns the row off mid-storm', () => {
    // The bug this pins: gating only the WRITE would freeze every adopted
    // surface at whatever gloss it happened to be holding.
    const { rain, material } = scene();
    rain.update(0.016, camera(), STORM, STIFF_WIND);
    expect(material.roughness).toBeLessThan(0.9);
    rain.update(0.016, camera(), STORM, STIFF_WIND, {
      presentation: resolveWeatherPresentation({ wetSurfaces: false }),
    });
    expect(material.roughness).toBe(0.9);
    expect(material.color.getHex()).toBe(0x808080);
    rain.dispose();
  });

  it('does no scene scanning at all while the row is off', () => {
    const rain = new RainPresentation({
      profile: 'blender', rendererLabel: 'NVIDIA GeForce RTX 5080', quality: 'ultra', seed: 99,
    });
    const root = new THREE.Scene();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.8, metalness: 0 }),
    );
    root.add(mesh);
    rain.build(root);
    const off = resolveWeatherPresentation({ wetSurfaces: false });
    for (let frame = 0; frame < 400; frame += 1) {
      rain.update(0.05, camera(), STORM, STIFF_WIND, { presentation: off });
    }
    expect(rain.telemetry().autoAdoptedWetSurfaces).toBe(0);
    expect(rain.telemetry().wetSurfaces).toBe(0);
    rain.dispose();
  });
});
