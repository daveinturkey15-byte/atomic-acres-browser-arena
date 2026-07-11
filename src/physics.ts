import type * as RapierTypes from '@dimforge/rapier3d-compat';
import type { Box2, Point3 } from './collision';

const PLAYER_RADIUS = 0.38;
const PLAYER_HALF_HEIGHT = 0.53;
const EYE_FROM_CENTER = 0.72;

export type CharacterMoveResult = {
  position: Point3;
  grounded: boolean;
  blockedX: boolean;
  blockedY: boolean;
  blockedZ: boolean;
};

/** Rapier-backed kinematic FPS character with stairs, slopes, sliding and ground snap. */
export class CharacterPhysics {
  readonly world: RapierTypes.World;
  private readonly body: RapierTypes.RigidBody;
  private readonly collider: RapierTypes.Collider;
  private readonly controller: RapierTypes.KinematicCharacterController;

  private constructor(world: RapierTypes.World, body: RapierTypes.RigidBody, collider: RapierTypes.Collider) {
    this.world = world;
    this.body = body;
    this.collider = collider;
    this.controller = world.createCharacterController(0.025);
    this.controller.setSlideEnabled(true);
    this.controller.enableAutostep(0.42, 0.22, false);
    this.controller.enableSnapToGround(0.24);
    this.controller.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    this.controller.setMinSlopeSlideAngle(55 * Math.PI / 180);
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
    const world = new RAPIER.World({ x: 0, y: -22, z: 0 });
    world.timestep = 1 / 120;

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

    for (const box of colliders) {
      const minY = box.minY ?? 0;
      const maxY = box.maxY ?? 8;
      const halfX = Math.max(0.01, (box.maxX - box.minX) / 2);
      const halfY = Math.max(0.01, (maxY - minY) / 2);
      const halfZ = Math.max(0.01, (box.maxZ - box.minZ) / 2);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ).setTranslation(
          (box.minX + box.maxX) / 2,
          (minY + maxY) / 2,
          (box.minZ + box.maxZ) / 2,
        ),
      );
    }

    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS)
        .setFriction(0)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL),
      body,
    );
    const physics = new CharacterPhysics(world, body, collider);
    physics.teleportEye({ x: 0, y: 1.7, z: 0 });
    return physics;
  }

  teleportEye(position: Point3): void {
    this.body.setTranslation(
      { x: position.x, y: position.y - EYE_FROM_CENTER, z: position.z },
      true,
    );
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  eyePosition(): Point3 {
    const position = this.body.translation();
    return { x: position.x, y: position.y + EYE_FROM_CENTER, z: position.z };
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
    return {
      position,
      grounded: this.controller.computedGrounded(),
      blockedX: Math.abs(allowed.x - desiredDelta.x) > epsilon,
      blockedY: Math.abs(allowed.y - desiredDelta.y) > epsilon,
      blockedZ: Math.abs(allowed.z - desiredDelta.z) > epsilon,
    };
  }

  dispose(): void {
    this.world.free();
  }
}
