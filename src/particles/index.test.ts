/**
 * HF-371 — the runtime, and the promises it makes to the rest of the game.
 *
 * The owner asked for dust, particles and atmosphere everywhere. The two ways
 * that request goes wrong are a frame-rate collapse and a player losing a
 * gunfight to their own smoke, so those are what these tests are about: the
 * draw count is fixed and provable, and no family can put anything drawable
 * where the player is looking.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA_IDS, type ArenaId } from '../arena-identity';
import { calmWind, createWindField, sampleWind } from '../weather/wind-field';
import {
  PARTICLE_READABILITY,
  centreConeRadius,
} from './combat-readability';
import { PARTICLE_INSTANCED_DRAWS, totalCapacity } from './particle-catalog';
import { ParticleRuntime, particleBypassReason, particleQualityForProfile } from './index';

function camera(x = 0, y = 1.7, z = 0, yaw = 0): THREE.PerspectiveCamera {
  const view = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 500);
  view.position.set(x, y, z);
  view.rotation.set(0, yaw, 0);
  view.updateMatrixWorld(true);
  return view;
}

function build(overrides: Partial<{ quality: 'low' | 'high' | 'ultra'; profile: 'performance' | 'blender' | 'compat'; rendererLabel: string; arenaId: ArenaId; query: string | null }> = {}) {
  const runtime = new ParticleRuntime({
    profile: overrides.profile ?? 'blender',
    rendererLabel: overrides.rendererLabel ?? 'NVIDIA GeForce RTX 5080',
    quality: overrides.quality ?? 'ultra',
    seed: 0x371,
    arenaId: overrides.arenaId ?? 'farcrysis',
    query: overrides.query ?? null,
  });
  const scene = new THREE.Scene();
  runtime.build(scene);
  return { runtime, scene };
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

function familyMesh(runtime: ParticleRuntime, id: string): THREE.InstancedMesh {
  const mesh = runtime.root.getObjectByName(`hf371-particles-${id}`);
  return mesh as THREE.InstancedMesh;
}

/** Every instance the GPU would actually see: non-degenerate scale. */
function drawnInstances(mesh: THREE.InstancedMesh): THREE.Vector3[] {
  const matrix = new THREE.Matrix4();
  const drawn: THREE.Vector3[] = [];
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    const scaleSquared = matrix.elements[0] ** 2 + matrix.elements[1] ** 2 + matrix.elements[2] ** 2;
    if (scaleSquared < 1e-12) continue;
    drawn.push(new THREE.Vector3(matrix.elements[12], matrix.elements[13], matrix.elements[14]));
  }
  return drawn;
}

function run(runtime: ParticleRuntime, view: THREE.Camera, frames: number, ads = 0): void {
  for (let frame = 0; frame < frames; frame += 1) {
    runtime.update(1 / 60, view, { wind: calmWind(), adsProgress: ads });
  }
}

describe('the draw-call count is fixed and provable', () => {
  it('submits exactly four instanced draws and zero loose meshes', () => {
    const { runtime } = build();
    run(runtime, camera(), 30);
    expect(meshCensus(runtime.root)).toEqual({ instanced: PARTICLE_INSTANCED_DRAWS, loose: 0 });
    const telemetry = runtime.telemetry();
    expect(telemetry.instancedDraws).toBe(4);
    expect(telemetry.looseMeshes).toBe(0);
    expect(telemetry.families).toHaveLength(4);
    // ...carrying real populations, so four draws is instancing and not four
    // particles that trivially satisfy the count.
    expect(telemetry.liveParticles).toBeGreaterThan(300);
    expect(telemetry.perFrameAllocations).toBe(0);
    runtime.dispose();
  });

  it('stays at four through every arena, quality and burst of activity', () => {
    const { runtime } = build();
    const view = camera();
    for (const arenaId of ARENA_IDS) {
      runtime.setArena(arenaId);
      for (const quality of ['low', 'high', 'ultra'] as const) {
        runtime.setQuality(quality);
        for (let burst = 0; burst < 6; burst += 1) {
          runtime.emitFootfall(burst, 0, -3 - burst, 'land');
          runtime.emitSurfaceImpact(
            new THREE.Vector3(6 + burst, 1.5, -9),
            new THREE.Vector3(0, 0, 1),
            'concrete',
          );
          runtime.emitMuzzleSmoke(new THREE.Vector3(0.2, 1.5, -0.6), new THREE.Vector3(0, 0, -1));
        }
        run(runtime, view, 10);
        expect(meshCensus(runtime.root), `${arenaId}/${quality}`)
          .toEqual({ instanced: PARTICLE_INSTANCED_DRAWS, loose: 0 });
      }
    }
    runtime.dispose();
  });

  it('holds every family inside its instance budget at the active quality', () => {
    const { runtime } = build({ quality: 'low' });
    const view = camera();
    run(runtime, view, 20);
    expect(runtime.telemetry().capacityAtQuality).toBe(totalCapacity('low'));
    expect(runtime.telemetry().liveParticles).toBeLessThanOrEqual(totalCapacity('low'));
    // Raising quality takes effect live, with no rebuild and no reallocation.
    const buffers = familyMesh(runtime, 'motes').instanceMatrix.array.length;
    runtime.setQuality('ultra');
    run(runtime, view, 20);
    expect(runtime.telemetry().liveParticles).toBeGreaterThan(totalCapacity('low') * 0.5);
    expect(familyMesh(runtime, 'motes').instanceMatrix.array.length).toBe(buffers);
    expect(meshCensus(runtime.root)).toEqual({ instanced: PARTICLE_INSTANCED_DRAWS, loose: 0 });
    runtime.dispose();
  });
});

describe('every arena has air in it', () => {
  it('populates ambient life on all six arenas', () => {
    const { runtime } = build();
    const view = camera();
    for (const arenaId of ARENA_IDS) {
      runtime.setArena(arenaId);
      run(runtime, view, 5);
      const telemetry = runtime.telemetry();
      expect(telemetry.arenaId, `${arenaId}:selected`).toBe(arenaId);
      expect(telemetry.arenaLabel.length, `${arenaId}:label`).toBeGreaterThan(0);
      expect(telemetry.liveParticles, `${arenaId}:populated`).toBeGreaterThan(50);
    }
    runtime.dispose();
  });

  it('does not carry the retired arena\'s air into the new one', () => {
    const { runtime } = build({ arenaId: 'farcrysis' });
    const view = camera();
    runtime.emitMuzzleSmoke(new THREE.Vector3(0.2, 1.5, -0.6), new THREE.Vector3(0, 0, -1));
    run(runtime, view, 5);
    expect(familyMesh(runtime, 'puff').count).toBeGreaterThan(0);
    runtime.setArena('gun-range');
    expect(familyMesh(runtime, 'puff').count).toBe(0);
    runtime.dispose();
  });

  it('carries the shared wind field rather than inventing its own', () => {
    const { runtime } = build({ arenaId: 'high-seas' });
    const view = camera();
    const field = createWindField('high-seas', 17);
    const wind = sampleWind(field, 0, 0, 12, 1.4);
    // Blowing hard enough to matter, which is the point of coupling to it.
    expect(wind.speed).toBeGreaterThan(0.5);
    for (let frame = 0; frame < 60; frame += 1) {
      runtime.update(1 / 60, view, { wind });
    }
    expect(runtime.telemetry().liveParticles).toBeGreaterThan(50);
    runtime.dispose();
  });
});

describe('nothing this system draws can sit on the crosshair', () => {
  it('keeps muzzle smoke out of the sight line for its whole lifetime', () => {
    // The case that looks like it needs an exception to the guard: the muzzle
    // points exactly where the player is looking. It does not get one - the
    // smoke is emitted outboard and rises out of the cone instead.
    const { runtime } = build();
    const view = camera();
    const muzzle = new THREE.Vector3(0.18, 1.55, -0.55);
    const aim = new THREE.Vector3(0, 0, -1);
    const up = new THREE.Vector3(0, 1, 0);
    const puff = familyMesh(runtime, 'puff');
    for (let frame = 0; frame < 240; frame += 1) {
      if (frame % 6 === 0) runtime.emitMuzzleSmoke(muzzle, aim, up, 1);
      runtime.update(1 / 60, view, { wind: calmWind() });
      for (const position of drawnInstances(puff)) {
        const relX = position.x - view.position.x;
        const relY = position.y - view.position.y;
        const relZ = position.z - view.position.z;
        const along = -relZ; // the camera looks down -Z
        const distance = Math.hypot(relX, relY, relZ);
        expect(distance, `frame ${frame}: inside the near-lens cull`)
          .toBeGreaterThanOrEqual(PARTICLE_READABILITY.nearCullM);
        if (along <= 0) continue;
        const perp = Math.hypot(relX, relY);
        expect(perp, `frame ${frame}: drawn inside the protected cone`)
          .toBeGreaterThan(centreConeRadius(along) * PARTICLE_READABILITY.centreCoreFraction);
      }
    }
    // ...and it really was emitting, so this is not a vacuous pass.
    expect(runtime.telemetry().guardSuppressed).toBeGreaterThan(0);
    runtime.dispose();
  });

  it('clears dust out of the aim path the moment the player aims', () => {
    // Two identical seeded runs that differ only in ADS. The cloud sits just
    // outside the hip cone at 20 m - legal to draw - and inside the widened
    // cone the instant the player commits to the shot.
    const drawnAt = (ads: number): number => {
      const { runtime } = build();
      const view = camera();
      runtime.emitSurfaceImpact(
        new THREE.Vector3(2.45, 1.7, -20),
        new THREE.Vector3(1, 0, 0),
        'earth',
      );
      run(runtime, view, 6, ads);
      const count = drawnInstances(familyMesh(runtime, 'puff')).length;
      runtime.dispose();
      return count;
    };
    const hip = drawnAt(0);
    expect(hip).toBeGreaterThan(0);
    expect(drawnAt(1)).toBeLessThan(hip);
  });

  it('clears smoke standing between the player and a supplied enemy', () => {
    const { runtime } = build();
    const view = camera();
    // Far off the aim axis, so it is the sightline guard being tested and not
    // the centre cone: the cloud sits on the midpoint of eye-to-enemy.
    runtime.emitSurfaceImpact(new THREE.Vector3(8, 1.6, -4), new THREE.Vector3(0, 1, 0), 'earth');
    run(runtime, view, 6);
    const puff = familyMesh(runtime, 'puff');
    const before = drawnInstances(puff).length;
    expect(before).toBeGreaterThan(0);

    for (let frame = 0; frame < 6; frame += 1) {
      runtime.beginProtectedTargets();
      runtime.addProtectedTarget(16, 1.5, -8);
      runtime.update(1 / 60, view, { wind: calmWind() });
    }
    expect(drawnInstances(puff).length).toBeLessThan(before);
    runtime.dispose();
  });

  it('forgets a stale sightline instead of clearing smoke forever', () => {
    const { runtime } = build();
    const view = camera();
    runtime.beginProtectedTargets();
    runtime.addProtectedTarget(14, 1.7, -4);
    expect(runtime.telemetry().protectedSightlines).toBe(1);
    runtime.update(1 / 60, view, { wind: calmWind() });
    // Cleared at the end of every update: a caller that stops feeding targets
    // must not leave a dead enemy's position permanently deleting smoke.
    expect(runtime.telemetry().protectedSightlines).toBe(0);
    runtime.dispose();
  });

  it('bounds the sightline list rather than letting the cost grow', () => {
    const { runtime } = build();
    runtime.beginProtectedTargets();
    for (let target = 0; target < 40; target += 1) {
      runtime.addProtectedTarget(target, 1.7, -10);
    }
    expect(runtime.telemetry().protectedSightlines).toBe(PARTICLE_READABILITY.maxProtectedTargets);
    runtime.dispose();
  });

  it('thins the pile-up when too much obscuring matter stacks at once', () => {
    const { runtime } = build();
    const view = camera();
    // A dust bowl: forty landings in a ring around the player, placed behind
    // and beside them so it is the aggregate budget doing the thinning and not
    // the centre cone.
    for (let burst = 0; burst < 40; burst += 1) {
      const angle = Math.PI * 0.5 + (burst / 40) * Math.PI;
      runtime.emitFootfall(Math.cos(angle) * 1.5, 0.1, Math.sin(angle) * 1.5 + 0.6, 'land', 1);
    }
    run(runtime, view, 20);
    expect(runtime.telemetry().loadScale).toBeLessThan(1);
    expect(runtime.telemetry().loadScale).toBeGreaterThanOrEqual(PARTICLE_READABILITY.minLoadScale);
    runtime.dispose();
  });
});

describe('events produce the right matter', () => {
  it('kicks dust and grit on a landing, and much less on a step', () => {
    const { runtime } = build();
    const view = camera();
    runtime.emitFootfall(5, 0.1, -6, 'land', 1);
    run(runtime, view, 2);
    const landing = familyMesh(runtime, 'puff').count + familyMesh(runtime, 'grit').count;
    runtime.setArena('gun-range'); // clears both pools
    runtime.setArena('farcrysis');
    runtime.emitFootfall(5, 0.1, -6, 'step', 1);
    run(runtime, view, 2);
    const step = familyMesh(runtime, 'puff').count + familyMesh(runtime, 'grit').count;
    expect(landing).toBeGreaterThan(step);
    expect(step).toBeGreaterThan(0);
    runtime.dispose();
  });

  it('throws dust proportional to what the surface is made of', () => {
    const { runtime } = build();
    const view = camera();
    const point = new THREE.Vector3(8, 1.4, -9);
    const normal = new THREE.Vector3(-1, 0, 0);
    runtime.emitSurfaceImpact(point, normal, 'earth');
    run(runtime, view, 1);
    const soil = familyMesh(runtime, 'puff').count;
    runtime.setArena('gun-range');
    runtime.setArena('farcrysis');
    runtime.emitSurfaceImpact(point, normal, 'glass');
    run(runtime, view, 1);
    const glass = familyMesh(runtime, 'puff').count;
    expect(soil).toBeGreaterThan(glass);
    runtime.dispose();
  });

  it('accepts both spellings of a surface', () => {
    const { runtime } = build();
    const point = new THREE.Vector3(8, 1.4, -9);
    const normal = new THREE.Vector3(-1, 0, 0);
    expect(() => runtime.emitSurfaceImpact(point, normal, 'metal')).not.toThrow();
    expect(() => runtime.emitSurfaceImpact(point, normal, 'structural-metal')).not.toThrow();
    runtime.dispose();
  });

  it('survives a degenerate normal instead of emitting NaN', () => {
    const { runtime } = build();
    const view = camera();
    runtime.emitSurfaceImpact(new THREE.Vector3(4, 1, -7), new THREE.Vector3(0, 0, 0), 'concrete');
    run(runtime, view, 3);
    const matrix = new THREE.Matrix4();
    const puff = familyMesh(runtime, 'puff');
    for (let index = 0; index < puff.count; index += 1) {
      puff.getMatrixAt(index, matrix);
      for (const element of matrix.elements) expect(Number.isFinite(element)).toBe(true);
    }
    runtime.dispose();
  });

  it('registers light shafts for motes to brighten in, and bounds them', () => {
    const { runtime } = build();
    runtime.setLightShafts(Array.from({ length: 20 }, (_entry, index) => ({
      x: index, y: 6, z: -index,
      axisX: 0.3, axisY: -1, axisZ: 0.1,
      radiusM: 2,
    })));
    expect(runtime.telemetry().lightShafts).toBeLessThanOrEqual(6);
    expect(runtime.telemetry().lightShafts).toBeGreaterThan(0);
    run(runtime, camera(), 5);
    runtime.dispose();
  });
});

describe('lifecycle and bypass', () => {
  it('gives the compat profile less air rather than none', () => {
    // Unlike rain, which an arena can simply do without, air is the thing this
    // work exists to add - so compat drops a tier instead of bypassing.
    expect(particleQualityForProfile('compat', 'ultra')).toBe('low');
    expect(particleQualityForProfile('performance', 'ultra')).toBe('high');
    expect(particleQualityForProfile('blender', 'ultra')).toBe('ultra');
    expect(particleBypassReason('compat', 'NVIDIA GeForce RTX 5080', null)).toBeNull();
  });

  it('stands down on a software rasteriser or an explicit query', () => {
    expect(particleBypassReason('blender', 'Google SwiftShader', null)).toBe('software-renderer');
    expect(particleBypassReason('blender', 'NVIDIA GeForce RTX 5080', 'off')).toBe('query-disabled');
    // ...and can be forced back on for diagnosis.
    expect(particleBypassReason('blender', 'Google SwiftShader', 'on')).toBeNull();
  });

  it('builds nothing at all when bypassed, and updates are inert', () => {
    const { runtime, scene } = build({ query: 'off' });
    run(runtime, camera(), 10);
    expect(meshCensus(runtime.root)).toEqual({ instanced: 0, loose: 0 });
    expect(scene.children).not.toContain(runtime.root);
    const telemetry = runtime.telemetry();
    expect(telemetry.enabled).toBe(false);
    expect(telemetry.bypassReason).toBe('query-disabled');
    expect(telemetry.instancedDraws).toBe(0);
    runtime.dispose();
  });

  it('marks its root so the static batcher and the shot world both skip it', () => {
    const { runtime } = build();
    expect(runtime.root.userData.dynamic).toBe(true);
    expect(runtime.root.userData.presentationOnly).toBe(true);
    expect(runtime.root.userData.blocksShots).toBe(false);
    runtime.dispose();
  });

  it('re-flags its instance buffers after a context restore', () => {
    const { runtime } = build();
    run(runtime, camera(), 3);
    const motes = familyMesh(runtime, 'motes');
    // `needsUpdate` is a write-only setter in three: it bumps `version`, and
    // `version` is the only readable evidence the re-upload was requested.
    const matrixVersion = motes.instanceMatrix.version;
    const colorVersion = motes.instanceColor?.version ?? -1;
    runtime.handleContextRestored();
    expect(motes.instanceMatrix.version).toBeGreaterThan(matrixVersion);
    expect(motes.instanceColor?.version ?? -1).toBeGreaterThan(colorVersion);
    runtime.dispose();
  });

  it('tears down completely and tolerates a late frame', () => {
    const { runtime, scene } = build();
    run(runtime, camera(), 3);
    runtime.dispose();
    expect(scene.children).not.toContain(runtime.root);
    expect(meshCensus(runtime.root)).toEqual({ instanced: 0, loose: 0 });
    expect(() => runtime.update(1 / 60, camera(), { wind: calmWind() })).not.toThrow();
  });

  it('survives a hidden tab handing back a multi-second frame', () => {
    const { runtime } = build();
    const view = camera();
    run(runtime, view, 5);
    expect(() => runtime.update(9, view, { wind: calmWind() })).not.toThrow();
    expect(meshCensus(runtime.root)).toEqual({ instanced: PARTICLE_INSTANCED_DRAWS, loose: 0 });
    expect(runtime.telemetry().liveParticles).toBeGreaterThan(0);
    runtime.dispose();
  });
});
