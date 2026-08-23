/**
 * HF-371 — the engine.
 *
 * Three things silently ruin a particle feature and all three are pinned here:
 * it becoming N meshes instead of one instanced draw, the static batcher eating
 * the instances, and the pool growing or leaking under sustained fire.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { batchStaticMeshes } from '../art-kit';
import { PARTICLE_READABILITY } from './combat-readability';
import { PARTICLE_FAMILIES, familyCapacityCeiling } from './particle-catalog';
import {
  ParticleField,
  createAmbientTemplate,
  createParticleFrameContext,
  type ParticleFrameContext,
} from './particle-field';

function context(overrides: Partial<ParticleFrameContext> = {}): ParticleFrameContext {
  return Object.assign(createParticleFrameContext(), {
    cameraX: 0, cameraY: 1.7, cameraZ: 0,
    forwardX: 0, forwardY: 0, forwardZ: -1,
  }, overrides);
}

function buildField(id: 'motes' | 'drift' | 'puff' | 'grit', seed = 4242) {
  const field = new ParticleField(PARTICLE_FAMILIES[id], seed);
  const parent = new THREE.Group();
  field.build(parent);
  return { field, parent };
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

/** Simulation positions, which are NOT the instance matrices: a suppressed
 *  particle is drawn as a zero matrix while it is alive somewhere else. */
function livePositions(field: ParticleField): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  for (let index = 0; index < field.liveCount; index += 1) {
    positions.push(field.positionAt(index, new THREE.Vector3()));
  }
  return positions;
}

/** Instance world position and whether the guards collapsed it to zero scale. */
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

/** Emits a plain upward puff at a world point, bypassing the recipe layer. */
function emitAt(field: ParticleField, x: number, y: number, z: number, life = 2): void {
  field.emitParticle(x, y, z, 0, 0.2, 0, life, 0.1, 0.4, 1, 1, 1, 0.2, 2, 0.1, 0.5, 0, 0);
}

describe('one family is one instanced draw', () => {
  it('builds exactly one InstancedMesh and zero loose meshes', () => {
    const { field, parent } = buildField('puff');
    expect(meshCensus(parent)).toEqual({ instanced: 1, loose: 0 });
    expect(field.telemetry().instancedDraws).toBe(1);
    field.dispose();
  });

  it('never grows a mesh per particle, however many are emitted', () => {
    const { field, parent } = buildField('puff');
    const frame = context();
    for (let burst = 0; burst < 200; burst += 1) {
      for (let particle = 0; particle < 12; particle += 1) {
        emitAt(field, burst * 0.1, 1, -8 - particle * 0.05);
      }
      field.update(1 / 60, frame, null);
    }
    expect(meshCensus(parent)).toEqual({ instanced: 1, loose: 0 });
    expect(field.telemetry().perFrameAllocations).toBe(0);
    field.dispose();
  });

  it('allocates its instance buffers once at the family ceiling', () => {
    const { field } = buildField('motes');
    const mesh = field.instancedMesh!;
    expect(mesh.instanceMatrix.count).toBe(familyCapacityCeiling('motes'));
    expect(mesh.instanceMatrix.usage).toBe(THREE.DynamicDrawUsage);
    // Colour buffer prewarmed at build, not on first tint, so the first burst
    // does not stall on a fresh attribute upload mid-firefight.
    expect(mesh.instanceColor).not.toBeNull();
    expect(mesh.instanceColor?.usage).toBe(THREE.DynamicDrawUsage);
    expect(mesh.userData.instanceColorPrewarmed).toBe(true);
    field.dispose();
  });

  it('submits only the live population, so an idle arena is nearly free', () => {
    const { field } = buildField('puff');
    const frame = context();
    field.update(1 / 60, frame, null);
    expect(field.instancedMesh!.count).toBe(0);
    emitAt(field, 0, 1, -6);
    emitAt(field, 1, 1, -6);
    field.update(1 / 60, frame, null);
    expect(field.instancedMesh!.count).toBe(2);
    field.dispose();
  });
});

describe('the pool is fixed, and behaves when it is full', () => {
  it('caps at the family ceiling instead of growing', () => {
    const { field } = buildField('grit');
    const ceiling = familyCapacityCeiling('grit');
    for (let particle = 0; particle < ceiling * 3; particle += 1) {
      emitAt(field, particle * 0.01, 1, -6, 5);
    }
    field.update(1 / 60, context(), null);
    expect(field.liveCount).toBe(ceiling);
    expect(field.instancedMesh!.count).toBe(ceiling);
    field.dispose();
  });

  it('lands the newest event rather than dropping it when full', () => {
    // Eviction, not rejection: a burst during a firefight must never silently
    // fail to appear because older dust is still hanging around.
    const { field } = buildField('puff');
    const ceiling = familyCapacityCeiling('puff');
    for (let particle = 0; particle < ceiling; particle += 1) emitAt(field, 0, 1, -20, 30);
    field.update(1 / 60, context(), null);
    emitAt(field, 5, 1, -5, 30);
    field.update(1 / 60, context(), null);
    const found = livePositions(field).some((position) => Math.abs(position.x - 5) < 0.5);
    expect(found).toBe(true);
    field.dispose();
  });

  it('reclaims every particle once its life expires', () => {
    const { field } = buildField('puff');
    const frame = context();
    for (let particle = 0; particle < 40; particle += 1) emitAt(field, particle * 0.2, 1, -9, 0.5);
    field.update(1 / 60, frame, null);
    expect(field.liveCount).toBe(40);
    for (let step = 0; step < 60; step += 1) field.update(1 / 60, frame, null);
    expect(field.liveCount).toBe(0);
    expect(field.instancedMesh!.count).toBe(0);
    field.dispose();
  });

  it('clamps a backgrounded tab\'s multi-second step instead of teleporting', () => {
    const { field } = buildField('grit');
    field.emitParticle(0, 20, -10, 0, 0, 0, 60, 0.02, 0.02, 1, 1, 1, 1, 0, -9.4, 0, 0, 0);
    field.update(30, context(), null);
    const position = field.positionAt(0, new THREE.Vector3());
    // A 30 s step under gravity would put this several kilometres underground.
    expect(position.y).toBeGreaterThan(15);
    field.dispose();
  });
});

describe('the combat guards run inside the engine, for every family', () => {
  it('collapses obscuring particles that sit on the crosshair', () => {
    const { field } = buildField('puff');
    const frame = context();
    // Dead ahead at 8 m: the camera looks down -Z.
    field.emitParticle(0, 1.7, -8, 0, 0, 0, 4, 0.3, 0.3, 1, 1, 1, 0.2, 0, 0, 0, 0, 0);
    // Well off to the side at the same range: must survive.
    field.emitParticle(6, 1.7, -8, 0, 0, 0, 4, 0.3, 0.3, 1, 1, 1, 0.2, 0, 0, 0, 0, 0);
    field.update(1 / 60, frame, null);
    const states = instanceStates(field.instancedMesh!);
    expect(states[0].culled).toBe(true);
    expect(states[1].culled).toBe(false);
    field.dispose();
  });

  it('clears the eye-to-enemy cylinder when sightlines are supplied', () => {
    const { field } = buildField('puff');
    const frame = context();
    // Off the aim axis, so guard one does not already cover it...
    field.emitParticle(9, 1.7, -3, 0, 0, 0, 4, 0.3, 0.3, 1, 1, 1, 0.2, 0, 0, 0, 0, 0);
    field.update(1 / 60, frame, null);
    expect(instanceStates(field.instancedMesh!)[0].culled).toBe(false);
    // ...until an enemy is standing directly behind it.
    frame.protectedTargets[0] = 18;
    frame.protectedTargets[1] = 1.7;
    frame.protectedTargets[2] = -6;
    frame.protectedCount = 1;
    field.update(1 / 60, frame, null);
    expect(instanceStates(field.instancedMesh!)[0].culled).toBe(true);
    field.dispose();
  });

  it('culls anything at blindfold range from the lens', () => {
    const { field } = buildField('puff');
    field.emitParticle(0.1, 1.75, -0.2, 0, 0, 0, 4, 0.3, 0.3, 1, 1, 1, 0.2, 0, 0, 0, 0, 0);
    field.update(1 / 60, context(), null);
    expect(instanceStates(field.instancedMesh!)[0].culled).toBe(true);
    field.dispose();
  });

  it('never exceeds the family opacity ceiling, whatever an emitter asks for', () => {
    const { field } = buildField('puff');
    const frame = context();
    for (let particle = 0; particle < 20; particle += 1) {
      // Ask for full opacity, which no recipe does, to prove the clamp is in
      // the engine and not merely in the authored numbers.
      field.emitParticle(4 + particle * 0.05, 1.7, -7, 0, 0, 0, 4, 0.3, 0.3, 1, 1, 1, 1, 0, 0, 0, 0, 0);
    }
    for (let step = 0; step < 20; step += 1) field.update(1 / 60, frame, null);
    expect(field.telemetry().peakOpacity).toBeLessThanOrEqual(PARTICLE_FAMILIES.puff.maxOpacity);
    expect(field.telemetry().peakOpacity).toBeLessThanOrEqual(PARTICLE_READABILITY.obscuringMaxOpacity);
    field.dispose();
  });

  it('applies the guards to the alpha-tested family through scale', () => {
    // `grit` has no per-instance alpha, so if the guard did not act on scale it
    // would be the one family that could sit on the crosshair at full strength.
    const { field } = buildField('grit');
    field.emitParticle(0, 1.7, -6, 0, 0, 0, 4, 0.02, 0.02, 1, 1, 1, 1, 0, 0, 0, 0, 0);
    field.update(1 / 60, context(), null);
    expect(instanceStates(field.instancedMesh!)[0].culled).toBe(true);
    field.dispose();
  });
});

describe('ambient families ride the camera', () => {
  it('maintains its target population and keeps it around the player', () => {
    const { field } = buildField('motes');
    const template = createAmbientTemplate();
    const frame = context();
    field.setVolume(12, 6, 3);
    field.setAmbientTarget(150);
    field.update(1 / 60, frame, template);
    expect(field.liveCount).toBe(150);

    // Walk 200 m. Nothing is respawned by distance: the volume wraps.
    for (let step = 0; step < 400; step += 1) {
      frame.cameraX += 0.5;
      field.update(1 / 60, frame, template);
    }
    expect(field.liveCount).toBe(150);
    for (const position of livePositions(field)) {
      expect(Math.abs(position.x - frame.cameraX)).toBeLessThanOrEqual(12.5);
      expect(Math.abs(position.z - frame.cameraZ)).toBeLessThanOrEqual(12.5);
    }
    field.dispose();
  });

  it('churns rather than dying out, so the field never reads as a fixed lattice', () => {
    const { field } = buildField('motes');
    const template = createAmbientTemplate();
    template.lifeSeconds = 0.4;
    const frame = context();
    field.setAmbientTarget(80);
    field.update(1 / 60, frame, template);
    const before = livePositions(field);
    for (let step = 0; step < 120; step += 1) {
      frame.elapsedSeconds += 1 / 60;
      field.update(1 / 60, frame, template);
    }
    expect(field.liveCount).toBe(80);
    const moved = livePositions(field).filter((position, index) => position.distanceTo(before[index]) > 0.5);
    expect(moved.length).toBeGreaterThan(20);
    field.dispose();
  });

  it('lowers and raises its population without touching the buffers', () => {
    const { field } = buildField('drift');
    const template = createAmbientTemplate();
    const frame = context();
    const bufferSize = field.instancedMesh!.instanceMatrix.array.length;
    field.setAmbientTarget(200);
    field.update(1 / 60, frame, template);
    expect(field.liveCount).toBe(200);
    field.setAmbientTarget(20);
    field.update(1 / 60, frame, template);
    expect(field.liveCount).toBe(20);
    field.setAmbientTarget(240);
    field.update(1 / 60, frame, template);
    expect(field.liveCount).toBe(240);
    expect(field.instancedMesh!.instanceMatrix.array.length).toBe(bufferSize);
    field.dispose();
  });

  it('carries the shared wind rather than inventing its own', () => {
    const { field } = buildField('drift');
    const template = createAmbientTemplate();
    template.windPull = 1;
    template.dragPerSecond = 8;
    const frame = context({ windX: 9, windZ: 0 });
    field.setVolume(400, 40, 40);
    field.setAmbientTarget(1);
    field.update(1 / 60, frame, template);
    const start = field.positionAt(0, new THREE.Vector3()).x;
    for (let step = 0; step < 60; step += 1) field.update(1 / 60, frame, template);
    const end = field.positionAt(0, new THREE.Vector3()).x;
    expect(end - start).toBeGreaterThan(2);
    field.dispose();
  });
});

describe('determinism and lifecycle', () => {
  it('scatters identically from an identical seed, and differently from another', () => {
    // The ambient scatter is where the seeded stream actually shows: two peers
    // on the same seed must not start with visibly different air.
    const run = (seed: number) => {
      const { field } = buildField('motes', seed);
      const template = createAmbientTemplate();
      const frame = context();
      field.setAmbientTarget(60);
      field.update(1 / 60, frame, template);
      const positions = livePositions(field);
      field.dispose();
      return positions;
    };
    const a = run(0x5eed);
    const b = run(0x5eed);
    const c = run(0xc0ffee);
    expect(a).toHaveLength(60);
    for (let index = 0; index < a.length; index += 1) {
      expect(a[index].distanceTo(b[index])).toBeLessThan(1e-6);
    }
    const differing = a.filter((position, index) => position.distanceTo(c[index]) > 0.5);
    expect(differing.length).toBeGreaterThan(40);
  });

  it('is left completely alone by batchStaticMeshes', () => {
    // The Farcrysis regression: the batcher treated InstancedMesh as a plain
    // Mesh, cloned its geometry and hid the source, collapsing every instance
    // to one stray at the origin.
    const { field, parent } = buildField('motes');
    const template = createAmbientTemplate();
    field.setAmbientTarget(120);
    field.update(1 / 60, context(), template);
    const mesh = field.instancedMesh!;
    const before = mesh.count;
    const matrixBefore = Float32Array.from(mesh.instanceMatrix.array);

    // A genuinely batchable static mesh, so the batcher really does run.
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0x808080 }));
    parent.add(wall);
    batchStaticMeshes(parent, new THREE.Group());

    expect(wall.visible).toBe(false); // proof the batcher actually ran
    expect(mesh.visible).toBe(true);
    expect(mesh.count).toBe(before);
    expect(Float32Array.from(mesh.instanceMatrix.array)).toEqual(matrixBefore);
    field.dispose();
  });

  it('marks the instanced mesh so nothing mistakes it for world geometry', () => {
    const { field } = buildField('puff');
    const mesh = field.instancedMesh!;
    expect(mesh.userData.dynamic).toBe(true);
    expect(mesh.userData.presentationOnly).toBe(true);
    expect(mesh.userData.blocksShots).toBe(false);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.castShadow).toBe(false);
    field.dispose();
  });

  it('releases its GPU resources and stops updating once disposed', () => {
    const { field, parent } = buildField('puff');
    emitAt(field, 0, 1, -9);
    field.update(1 / 60, context(), null);
    field.dispose();
    expect(field.instancedMesh).toBeNull();
    expect(meshCensus(parent)).toEqual({ instanced: 0, loose: 0 });
    // A late update after teardown must be a no-op, not a crash.
    expect(() => field.update(1 / 60, context(), null)).not.toThrow();
    field.dispose();
  });

  it('holds the near-cull distance the contract states', () => {
    expect(PARTICLE_READABILITY.nearCullM).toBeGreaterThan(0.2);
    expect(PARTICLE_READABILITY.nearCullM).toBeLessThan(0.6);
  });
});
describe('rain loads the ambient air', () => {
  it('drives an ambient particle downward in proportion to the shared rain rate', () => {
    // One suspended drift mote: no buoyancy, no wind pull, no flutter, so any
    // vertical travel over the minute is the rain sink and nothing else.
    const yAfter = (rainRate: number): number => {
      const { field } = buildField('drift');
      field.setVolume(30, 12, 6);
      field.emitParticle(0, 0, 0, 0, 0, 0, 10, 0.05, 0.05, 1, 1, 1, 0.5, 1.4, 0, 0, 0, 0);
      const frame = context({ rainRate });
      for (let tick = 0; tick < 60; tick += 1) field.update(1 / 60, frame, null);
      const y = field.positionAt(0, new THREE.Vector3()).y;
      field.dispose();
      return y;
    };
    expect(yAfter(0)).toBe(0);
    const drizzle = yAfter(0.4);
    const storm = yAfter(1);
    expect(drizzle).toBeLessThan(-0.05);
    expect(storm).toBeLessThan(drizzle);
    // Bounded: even a storm must not turn suspended dust into sleet.
    expect(storm).toBeGreaterThan(-1);
  });

  it('leaves event families untouched — their recipes own their motion', () => {
    const { field } = buildField('puff');
    field.emitParticle(0, 0, 0, 0, 0, 0, 10, 0.1, 0.4, 1, 1, 1, 0.5, 2, 0, 0.5, 0, 0);
    const frame = context({ rainRate: 1 });
    for (let tick = 0; tick < 30; tick += 1) field.update(1 / 60, frame, null);
    expect(field.positionAt(0, new THREE.Vector3()).y).toBe(0);
    field.dispose();
  });
});
