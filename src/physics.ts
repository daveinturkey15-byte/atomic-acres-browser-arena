import type * as RapierTypes from '@dimforge/rapier3d-compat';
import type { Box2, Point3 } from './collision';
import type { Stance } from './gameplay';
import { SIMULATION_HZ } from './gameplay';

export const CHARACTER_PHYSICS_CONFIG = Object.freeze({
  controllerOffset: 0.025,
  autostepHeight: 0.42,
  autostepMinimumWidth: 0.22,
  snapToGround: 0.24,
  maximumSlopeClimbDegrees: 50,
  minimumSlopeSlideDegrees: 55,
  gravity: -22,
  playerRadius: 0.38,
  playerHalfHeight: 0.53,
});
export const STANCE_SHAPES: Readonly<Record<Stance, { halfHeight: number; radius: number; eyeFromCenter: number }>> = {
  stand: { halfHeight: CHARACTER_PHYSICS_CONFIG.playerHalfHeight, radius: CHARACTER_PHYSICS_CONFIG.playerRadius, eyeFromCenter: 0.79 },
  crouch: { halfHeight: 0.22, radius: 0.36, eyeFromCenter: 0.58 },
  prone: { halfHeight: 0.04, radius: 0.31, eyeFromCenter: 0.15 },
};

export const WORLD_BOUNDARY_THICKNESS = 0.5;
export const WORLD_BOUNDARY_MIN_Y = -2;
export const WORLD_BOUNDARY_MAX_Y = 14;

/** Physics-only perimeter walls. Their inner faces exactly match playable bounds. */
export function worldBoundaryColliders(bounds: Box2): readonly Box2[] {
  return [
    { minX: bounds.minX - WORLD_BOUNDARY_THICKNESS, maxX: bounds.minX, minZ: bounds.minZ, maxZ: bounds.maxZ, minY: WORLD_BOUNDARY_MIN_Y, maxY: WORLD_BOUNDARY_MAX_Y },
    { minX: bounds.maxX, maxX: bounds.maxX + WORLD_BOUNDARY_THICKNESS, minZ: bounds.minZ, maxZ: bounds.maxZ, minY: WORLD_BOUNDARY_MIN_Y, maxY: WORLD_BOUNDARY_MAX_Y },
    { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ - WORLD_BOUNDARY_THICKNESS, maxZ: bounds.minZ, minY: WORLD_BOUNDARY_MIN_Y, maxY: WORLD_BOUNDARY_MAX_Y },
    { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.maxZ, maxZ: bounds.maxZ + WORLD_BOUNDARY_THICKNESS, minY: WORLD_BOUNDARY_MIN_Y, maxY: WORLD_BOUNDARY_MAX_Y },
  ];
}

export type CharacterMoveResult = {
  position: Point3;
  grounded: boolean;
  blockedX: boolean;
  blockedY: boolean;
  blockedZ: boolean;
  slopeAdjusted: boolean;
  appliedDelta: Point3;
};

/** Rapier-backed kinematic FPS character with stairs, slopes, sliding and ground snap. */
export class CharacterPhysics {
  readonly world: RapierTypes.World;
  private readonly body: RapierTypes.RigidBody;
  private readonly collider: RapierTypes.Collider;
  private readonly controller: RapierTypes.KinematicCharacterController;
  private stance: Stance = 'stand';

  private constructor(
    world: RapierTypes.World,
    body: RapierTypes.RigidBody,
    collider: RapierTypes.Collider,
    private readonly makeCapsule: (halfHeight: number, radius: number) => RapierTypes.Shape,
  ) {
    this.world = world;
    this.body = body;
    this.collider = collider;
    this.controller = world.createCharacterController(CHARACTER_PHYSICS_CONFIG.controllerOffset);
    this.controller.setSlideEnabled(true);
    this.controller.enableAutostep(CHARACTER_PHYSICS_CONFIG.autostepHeight, CHARACTER_PHYSICS_CONFIG.autostepMinimumWidth, false);
    this.controller.enableSnapToGround(CHARACTER_PHYSICS_CONFIG.snapToGround);
    this.controller.setMaxSlopeClimbAngle(CHARACTER_PHYSICS_CONFIG.maximumSlopeClimbDegrees * Math.PI / 180);
    this.controller.setMinSlopeSlideAngle(CHARACTER_PHYSICS_CONFIG.minimumSlopeSlideDegrees * Math.PI / 180);
  }

  static async create(colliders: readonly Box2[], bounds: Box2): Promise<CharacterPhysics> {
    const { default: RAPIER } = await import('@dimforge/rapier3d-compat');
    // Rapier 0.19.3's compatibility bundle calls its own wasm-bindgen loader with
    // the legacy positional form and emits a warning even though the public
    // RAPIER.init() API takes no arguments. Suppress only that upstream message
    // during initialization; preserve every other warning and restore immediately.
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (args.length === 1 && args[0] === 'using deprecated parameters for the initialization function; pass a single object instead') return;
      originalWarn(...args);
    };
    try {
      await RAPIER.init();
    } finally {
      console.warn = originalWarn;
    }
    const world = new RAPIER.World({ x: 0, y: CHARACTER_PHYSICS_CONFIG.gravity, z: 0 });
    world.timestep = 1 / SIMULATION_HZ;

    // The world floor and four thin boundary walls make falling out impossible even if
    // an authored visual mesh is missing or still loading.
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        (bounds.maxX - bounds.minX) / 2,
        0.1,
        (bounds.maxZ - bounds.minZ) / 2,
      ).setTranslation(
        (bounds.minX + bounds.maxX) / 2,
        -0.1,
        (bounds.minZ + bounds.maxZ) / 2,
      ),
    );

    for (const box of [...worldBoundaryColliders(bounds), ...colliders]) {
      const minY = box.minY ?? 0;
      const maxY = box.maxY ?? 8;
      const halfX = Math.max(0.01, (box.maxX - box.minX) / 2);
      const halfY = Math.max(0.01, (maxY - minY) / 2);
      const halfZ = Math.max(0.01, (box.maxZ - box.minZ) / 2);
      const descriptor = RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ).setTranslation(
        (box.minX + box.maxX) / 2,
        (minY + maxY) / 2,
        (box.minZ + box.maxZ) / 2,
      );
      if (box.rotation) {
        const [x, y, z] = box.rotation;
        const [sx, cx] = [Math.sin(x / 2), Math.cos(x / 2)];
        const [sy, cy] = [Math.sin(y / 2), Math.cos(y / 2)];
        const [sz, cz] = [Math.sin(z / 2), Math.cos(z / 2)];
        descriptor.setRotation({
          x: sx * cy * cz + cx * sy * sz,
          y: cx * sy * cz - sx * cy * sz,
          z: cx * cy * sz + sx * sy * cz,
          w: cx * cy * cz - sx * sy * sz,
        });
      }
      world.createCollider(descriptor);
    }

    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(CHARACTER_PHYSICS_CONFIG.playerHalfHeight, CHARACTER_PHYSICS_CONFIG.playerRadius)
        .setFriction(0)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL),
      body,
    );
    const physics = new CharacterPhysics(world, body, collider, (halfHeight, radius) => new RAPIER.Capsule(halfHeight, radius));
    physics.teleportEye({ x: 0, y: 1.7, z: 0 });
    return physics;
  }

  teleportEye(position: Point3): void {
    const eyeFromCenter = STANCE_SHAPES[this.stance].eyeFromCenter;
    this.body.setTranslation(
      { x: position.x, y: position.y - eyeFromCenter, z: position.z },
      true,
    );
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  eyePosition(): Point3 {
    const position = this.body.translation();
    return { x: position.x, y: position.y + STANCE_SHAPES[this.stance].eyeFromCenter, z: position.z };
  }

  /** Changes the real player collider while preserving foot position. Raising fails under hard cover. */
  setStance(next: Stance): boolean {
    if (next === this.stance) return true;
    const currentShape = STANCE_SHAPES[this.stance];
    const nextShape = STANCE_SHAPES[next];
    const current = this.body.translation();
    const currentExtent = currentShape.halfHeight + currentShape.radius;
    const nextExtent = nextShape.halfHeight + nextShape.radius;
    const footY = current.y - currentExtent;
    const candidate = { x: current.x, y: footY + nextExtent, z: current.z };
    const shape = this.makeCapsule(nextShape.halfHeight, nextShape.radius);

    if (nextExtent > currentExtent) {
      let blocked = false;
      this.world.intersectionsWithShape(
        candidate,
        { x: 0, y: 0, z: 0, w: 1 },
        shape,
        () => { blocked = true; return false; },
        undefined,
        undefined,
        this.collider,
      );
      if (blocked) return false;
    }

    this.collider.setShape(shape);
    this.body.setTranslation(candidate, true);
    this.world.propagateModifiedBodyPositionsToColliders();
    this.stance = next;
    if (next === 'prone') this.controller.disableAutostep();
    else this.controller.enableAutostep(CHARACTER_PHYSICS_CONFIG.autostepHeight, CHARACTER_PHYSICS_CONFIG.autostepMinimumWidth, false);
    return true;
  }

  currentStance(): Stance {
    return this.stance;
  }

  move(desiredDelta: Point3, dt: number): CharacterMoveResult {
    this.world.timestep = dt;
    this.controller.computeColliderMovement(this.collider, desiredDelta);
    const allowed = this.controller.computedMovement();
    const current = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: current.x + allowed.x,
      y: current.y + allowed.y,
      z: current.z + allowed.z,
    });
    this.world.step();
    const position = this.eyePosition();
    const epsilon = 0.0005;
    const grounded = this.controller.computedGrounded();
    const slopeAdjusted = grounded
      && Math.abs(allowed.y - desiredDelta.y) > epsilon
      && Math.hypot(allowed.x, allowed.z) > epsilon;
    return {
      position,
      grounded,
      blockedX: Math.abs(allowed.x - desiredDelta.x) > epsilon,
      blockedY: Math.abs(allowed.y - desiredDelta.y) > epsilon,
      blockedZ: Math.abs(allowed.z - desiredDelta.z) > epsilon,
      slopeAdjusted,
      appliedDelta: { x: allowed.x, y: allowed.y, z: allowed.z },
    };
  }

  dispose(): void {
    this.world.free();
  }
}
