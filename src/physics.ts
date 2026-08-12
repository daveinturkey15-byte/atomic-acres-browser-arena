import type * as RapierTypes from '@dimforge/rapier3d-compat';
import type { Box2, Point3 } from './collision';
import type { Stance } from './gameplay';
import { SIMULATION_HZ } from './gameplay';
import { MAX_MAJOR_DEBRIS_BODIES } from './major-debris-budget';

export { MAX_MAJOR_DEBRIS_BODIES } from './major-debris-budget';

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
  prone: { halfHeight: 0.02, radius: 0.36, eyeFromCenter: 0.23 },
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

export type DynamicWorldCollider = Readonly<{
  id: string;
  bounds: Box2;
}>;

export type MajorDebrisBodyDefinition = Readonly<{
  id: string;
  position: Point3;
  rotation: Readonly<{ x: number; y: number; z: number; w: number }>;
  halfExtents: Point3;
  linearVelocity: Point3;
  angularVelocity: Point3;
  sleeping: boolean;
}>;

export type MajorDebrisBodyPrewarmDefinition = Readonly<{
  id: string;
  halfExtents: Point3;
}>;

export type MajorDebrisBodySnapshot = Readonly<{
  id: string;
  position: Point3;
  rotation: Readonly<{ x: number; y: number; z: number; w: number }>;
  linearVelocity: Point3;
  angularVelocity: Point3;
  sleeping: boolean;
  flat: boolean;
}>;

function boxRotation(box: Box2): { x: number; y: number; z: number; w: number } {
  if (!box.rotation) return { x: 0, y: 0, z: 0, w: 1 };
  const [x, y, z] = box.rotation;
  const [sx, cx] = [Math.sin(x / 2), Math.cos(x / 2)];
  const [sy, cy] = [Math.sin(y / 2), Math.cos(y / 2)];
  const [sz, cz] = [Math.sin(z / 2), Math.cos(z / 2)];
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

function boxShape(box: Box2): Readonly<{
  centre: Point3;
  halfExtents: Point3;
  rotation: Readonly<{ x: number; y: number; z: number; w: number }>;
}> {
  const minY = box.minY ?? 0;
  const maxY = box.maxY ?? 8;
  return Object.freeze({
    centre: Object.freeze({
      x: (box.minX + box.maxX) / 2,
      y: (minY + maxY) / 2,
      z: (box.minZ + box.maxZ) / 2,
    }),
    halfExtents: Object.freeze({
      x: Math.max(0.01, (box.maxX - box.minX) / 2),
      y: Math.max(0.01, (maxY - minY) / 2),
      z: Math.max(0.01, (box.maxZ - box.minZ) / 2),
    }),
    rotation: Object.freeze(boxRotation(box)),
  });
}

/** Rapier-backed kinematic FPS character with stairs, slopes, sliding and ground snap. */
export class CharacterPhysics {
  readonly world: RapierTypes.World;
  private readonly body: RapierTypes.RigidBody;
  private readonly collider: RapierTypes.Collider;
  private readonly controller: RapierTypes.KinematicCharacterController;
  private readonly dynamicColliders = new Map<string, RapierTypes.Collider>();
  private readonly majorDebrisBodies = new Map<string, {
    readonly body: RapierTypes.RigidBody;
    readonly halfExtents: Point3;
    readonly prewarmed: boolean;
    active: boolean;
  }>();
  private stance: Stance = 'stand';

  private constructor(
    world: RapierTypes.World,
    body: RapierTypes.RigidBody,
    collider: RapierTypes.Collider,
    private readonly makeCapsule: (halfHeight: number, radius: number) => RapierTypes.Shape,
    private readonly makeCuboidDescriptor: (halfX: number, halfY: number, halfZ: number) => RapierTypes.ColliderDesc,
    private readonly makeDynamicBodyDescriptor: () => RapierTypes.RigidBodyDesc,
  ) {
    this.world = world;
    this.body = body;
    this.collider = collider;
    this.controller = world.createCharacterController(CHARACTER_PHYSICS_CONFIG.controllerOffset);
    this.controller.setSlideEnabled(true);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(78);
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
      const shape = boxShape(box);
      const descriptor = RAPIER.ColliderDesc.cuboid(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z)
        .setTranslation(shape.centre.x, shape.centre.y, shape.centre.z)
        .setRotation(shape.rotation);
      world.createCollider(descriptor);
    }

    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(CHARACTER_PHYSICS_CONFIG.playerHalfHeight, CHARACTER_PHYSICS_CONFIG.playerRadius)
        .setFriction(0)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL),
      body,
    );
    const physics = new CharacterPhysics(
      world,
      body,
      collider,
      (halfHeight, radius) => new RAPIER.Capsule(halfHeight, radius),
      (halfX, halfY, halfZ) => RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ),
      () => RAPIER.RigidBodyDesc.dynamic(),
    );
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
      // Test just above the supporting surface so normal floor contact is not
      // mistaken for overhead cover. The committed pose still preserves the
      // exact foot position below.
      const clearanceCandidate = { ...candidate, y: candidate.y + 0.015 };
      this.world.intersectionsWithShape(
        clearanceCandidate,
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

  /**
   * Reconciles one revisioned dynamic collision view without rebuilding the
   * Rapier world. Doors and authored shed panels therefore move/disappear in
   * the same simulation tick as their ballistic authority.
   */
  syncDynamicColliders(entries: readonly DynamicWorldCollider[]): void {
    const ids = entries.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length || ids.some((id) => !/^[a-z0-9][a-z0-9:-]{0,127}$/.test(id))) {
      throw new TypeError('Dynamic collider IDs must be unique canonical identifiers');
    }
    const retained = new Set(ids);
    for (const [id, collider] of this.dynamicColliders) {
      if (retained.has(id)) continue;
      this.world.removeCollider(collider, true);
      this.dynamicColliders.delete(id);
    }
    for (const entry of entries) {
      const shape = boxShape(entry.bounds);
      let collider = this.dynamicColliders.get(entry.id);
      if (!collider) {
        collider = this.world.createCollider(
          this.makeCuboidDescriptor(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z)
            .setTranslation(shape.centre.x, shape.centre.y, shape.centre.z)
            .setRotation(shape.rotation),
        );
        this.dynamicColliders.set(entry.id, collider);
        continue;
      }
      const cuboid = collider.shape;
      if ('halfExtents' in cuboid) {
        const halfExtents = cuboid.halfExtents as { x: number; y: number; z: number };
        if (Math.abs(halfExtents.x - shape.halfExtents.x) > 1e-6
          || Math.abs(halfExtents.y - shape.halfExtents.y) > 1e-6
          || Math.abs(halfExtents.z - shape.halfExtents.z) > 1e-6) {
          this.world.removeCollider(collider, true);
          collider = this.world.createCollider(
            this.makeCuboidDescriptor(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z)
              .setTranslation(shape.centre.x, shape.centre.y, shape.centre.z)
              .setRotation(shape.rotation),
          );
          this.dynamicColliders.set(entry.id, collider);
          continue;
        }
      }
      collider.setTranslation(shape.centre);
      collider.setRotation(shape.rotation);
    }
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  dynamicColliderCount(): number {
    return this.dynamicColliders.size;
  }

  /**
   * Owns exact disabled rigid-body/collider pairs before gameplay begins. A
   * later sync with the same identity and bounds only writes pose/velocity and
   * enables the retained pair; it does not enter Rapier's allocation path on
   * the first live fracture. The batch commits transactionally.
   */
  prewarmMajorDebrisBodies(entries: readonly MajorDebrisBodyPrewarmDefinition[]): void {
    const ids = entries.map((entry) => entry.id);
    if (entries.length > MAX_MAJOR_DEBRIS_BODIES
      || new Set(ids).size !== ids.length
      || ids.some((id) => !/^[a-z0-9][a-z0-9:-]{0,127}$/.test(id))
      || entries.some((entry) => ![
        entry.halfExtents.x, entry.halfExtents.y, entry.halfExtents.z,
      ].every(Number.isFinite)
        || entry.halfExtents.x <= 0 || entry.halfExtents.y <= 0 || entry.halfExtents.z <= 0)) {
      throw new TypeError('Major debris prewarm exceeds cap or uses invalid identities/bounds');
    }
    for (const entry of entries) {
      const existing = this.majorDebrisBodies.get(entry.id);
      if (!existing) continue;
      if (!existing.prewarmed
        || Math.abs(existing.halfExtents.x - entry.halfExtents.x) > 1e-6
        || Math.abs(existing.halfExtents.y - entry.halfExtents.y) > 1e-6
        || Math.abs(existing.halfExtents.z - entry.halfExtents.z) > 1e-6) {
        throw new TypeError(`Major debris prewarm identity ${entry.id} is already owned by incompatible physics`);
      }
    }
    const created: Array<{ id: string; body: RapierTypes.RigidBody }> = [];
    try {
      for (const [index, entry] of entries.entries()) {
        if (this.majorDebrisBodies.has(entry.id)) continue;
        const body = this.world.createRigidBody(
          this.makeDynamicBodyDescriptor()
            .setTranslation(0, -64 - index * 2, 0)
            .setLinearDamping(1.35)
            .setAngularDamping(1.8)
            .setCanSleep(true)
            .setSleeping(true)
            .setSoftCcdPrediction(0.4)
            .setEnabled(false),
        );
        created.push({ id: entry.id, body });
        this.world.createCollider(
          this.makeCuboidDescriptor(entry.halfExtents.x, entry.halfExtents.y, entry.halfExtents.z)
            .setDensity(42)
            .setFriction(0.78)
            .setRestitution(0.08),
          body,
        );
        this.majorDebrisBodies.set(entry.id, {
          body,
          halfExtents: Object.freeze({ ...entry.halfExtents }),
          prewarmed: true,
          active: false,
        });
      }
    } catch (error) {
      for (const entry of created.reverse()) {
        this.majorDebrisBodies.delete(entry.id);
        try { this.world.removeRigidBody(entry.body); } catch { /* partially-created Rapier body */ }
      }
      throw error;
    }
  }

  /** Creates/removes bounded host-simulated major debris without arbitrary fracture bodies. */
  syncMajorDebrisBodies(entries: readonly MajorDebrisBodyDefinition[], authoritativeResync = false): void {
    const ids = entries.map((entry) => entry.id);
    if (entries.length > MAX_MAJOR_DEBRIS_BODIES
      || new Set(ids).size !== ids.length
      || ids.some((id) => !/^[a-z0-9][a-z0-9:-]{0,127}$/.test(id))) {
      throw new TypeError('Major debris bodies exceed cap or use invalid identities');
    }
    const retained = new Set(ids);
    for (const [id, entry] of this.majorDebrisBodies) {
      if (retained.has(id)) continue;
      if (entry.prewarmed) {
        if (entry.active) {
          entry.body.setEnabled(false);
          entry.active = false;
        }
        continue;
      }
      this.world.removeRigidBody(entry.body);
      this.majorDebrisBodies.delete(id);
    }
    for (const entry of entries) {
      if (![entry.position.x, entry.position.y, entry.position.z,
        entry.rotation.x, entry.rotation.y, entry.rotation.z, entry.rotation.w,
        entry.halfExtents.x, entry.halfExtents.y, entry.halfExtents.z,
        entry.linearVelocity.x, entry.linearVelocity.y, entry.linearVelocity.z,
        entry.angularVelocity.x, entry.angularVelocity.y, entry.angularVelocity.z].every(Number.isFinite)
        || entry.halfExtents.x <= 0 || entry.halfExtents.y <= 0 || entry.halfExtents.z <= 0) {
        throw new TypeError('Major debris body contains invalid pose or bounds');
      }
      const existing = this.majorDebrisBodies.get(entry.id);
      if (existing) {
        if (Math.abs(existing.halfExtents.x - entry.halfExtents.x) > 1e-6
          || Math.abs(existing.halfExtents.y - entry.halfExtents.y) > 1e-6
          || Math.abs(existing.halfExtents.z - entry.halfExtents.z) > 1e-6) {
          throw new TypeError(`Major debris body ${entry.id} changed its immutable bounds`);
        }
        if (!existing.active || authoritativeResync) {
          existing.body.setTranslation(entry.position, !entry.sleeping);
          existing.body.setRotation(entry.rotation, !entry.sleeping);
          existing.body.setLinvel(entry.linearVelocity, !entry.sleeping);
          existing.body.setAngvel(entry.angularVelocity, !entry.sleeping);
          if (!existing.active) existing.body.setEnabled(true);
          if (entry.sleeping) existing.body.sleep();
          else existing.body.wakeUp();
          existing.active = true;
        }
        continue;
      }
      const body = this.world.createRigidBody(
        this.makeDynamicBodyDescriptor()
          .setTranslation(entry.position.x, entry.position.y, entry.position.z)
          .setRotation(entry.rotation)
          .setLinvel(entry.linearVelocity.x, entry.linearVelocity.y, entry.linearVelocity.z)
          .setAngvel(entry.angularVelocity)
          .setLinearDamping(1.35)
          .setAngularDamping(1.8)
          .setCanSleep(true)
          .setSleeping(entry.sleeping)
          .setSoftCcdPrediction(0.4),
      );
      this.world.createCollider(
        this.makeCuboidDescriptor(entry.halfExtents.x, entry.halfExtents.y, entry.halfExtents.z)
          .setDensity(42)
          .setFriction(0.78)
          .setRestitution(0.08),
        body,
      );
      this.majorDebrisBodies.set(entry.id, {
        body,
        halfExtents: Object.freeze({ ...entry.halfExtents }),
        prewarmed: false,
        active: true,
      });
    }
  }

  applyMajorDebrisImpulse(id: string, impulse: Point3, point?: Point3): boolean {
    const entry = this.majorDebrisBodies.get(id);
    if (!entry?.active || ![impulse.x, impulse.y, impulse.z].every(Number.isFinite)) return false;
    const magnitude = Math.hypot(impulse.x, impulse.y, impulse.z);
    if (magnitude <= 0 || magnitude > 80) return false;
    if (point && [point.x, point.y, point.z].every(Number.isFinite)) entry.body.applyImpulseAtPoint(impulse, point, true);
    else entry.body.applyImpulse(impulse, true);
    return true;
  }

  majorDebrisSnapshots(): readonly MajorDebrisBodySnapshot[] {
    return Object.freeze([...this.majorDebrisBodies.entries()]
      .filter(([, entry]) => entry.active)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, entry]) => {
        const position = entry.body.translation();
        const rotation = entry.body.rotation();
        const linearVelocity = entry.body.linvel();
        const angularVelocity = entry.body.angvel();
        const localUpWorldY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
        const settled = Math.hypot(linearVelocity.x, linearVelocity.y, linearVelocity.z) < 0.12
          && Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z) < 0.18;
        return Object.freeze({
          id,
          position: Object.freeze({ x: position.x, y: position.y, z: position.z }),
          rotation: Object.freeze({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }),
          linearVelocity: Object.freeze({ x: linearVelocity.x, y: linearVelocity.y, z: linearVelocity.z }),
          angularVelocity: Object.freeze({ x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z }),
          sleeping: entry.body.isSleeping(),
          flat: settled && Math.abs(localUpWorldY) >= Math.cos(15 * Math.PI / 180),
        });
      }));
  }

  majorDebrisBodyCount(): number {
    let active = 0;
    for (const entry of this.majorDebrisBodies.values()) if (entry.active) active += 1;
    return active;
  }

  prewarmedMajorDebrisBodyCount(): number {
    let prewarmed = 0;
    for (const entry of this.majorDebrisBodies.values()) if (entry.prewarmed) prewarmed += 1;
    return prewarmed;
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
    this.dynamicColliders.clear();
    this.majorDebrisBodies.clear();
    this.world.free();
  }
}
