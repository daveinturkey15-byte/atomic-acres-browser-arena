import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Box2 } from './collision';
import type { Stance } from './gameplay';
import { solidBounds, type HouseArchitecture, type HouseSolid } from './house-navigation';
import { InteractiveWorldRuntime } from './interactive-world-runtime';
import { buildArena, type ArenaMap } from './map';
import {
  CharacterPhysics,
  CHARACTER_PHYSICS_CONFIG,
  STANCE_SHAPES,
  type CharacterContactDebugSnapshot,
} from './physics';

const DT = 1 / 120;
const STANCES = ['stand', 'crouch', 'prone'] as const satisfies readonly Stance[];
const SIGNED_DISTANCE_EPSILON = 1e-5;
const POSITION_EPSILON = 1e-3;

type ContactFixture = Readonly<{
  id: 'floor' | 'wall' | 'corner' | 'doorjamb';
  start: Readonly<{ x: number; z: number; floorY: number }>;
  target: Readonly<{ x: number; z: number }>;
  sources: readonly string[];
}>;

function requireSolid(house: HouseArchitecture, name: string): HouseSolid {
  const solid = house.solids.find((candidate) => candidate.name === name);
  if (!solid?.collidable) throw new Error(`Missing shipped collidable ${house.id}:${name}`);
  return solid;
}

function sameBounds(left: Box2, right: Box2): boolean {
  return ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'].every((key) => {
    const axis = key as keyof Pick<Box2, 'minX' | 'maxX' | 'minY' | 'maxY' | 'minZ' | 'maxZ'>;
    return Math.abs((left[axis] ?? 0) - (right[axis] ?? 0)) < 1e-9;
  });
}

function staticSource(map: ArenaMap, solid: HouseSolid): string {
  const index = map.physicsColliders.findIndex((candidate) => sameBounds(candidate, solidBounds(solid)));
  if (index < 0) throw new Error(`Shipped static Rapier collider missing for ${solid.id}`);
  return `static:${index}`;
}

function targetContact(
  snapshot: CharacterContactDebugSnapshot,
  sources: readonly string[],
): CharacterContactDebugSnapshot['contacts'][number] | undefined {
  return snapshot.contacts
    .filter((contact) => sources.includes(contact.source))
    .sort((left, right) => left.distance - right.distance)[0];
}

function driveIntoFixture(
  physics: CharacterPhysics,
  stance: Stance,
  fixture: ContactFixture,
): CharacterContactDebugSnapshot {
  const shape = STANCE_SHAPES[stance];
  physics.teleportEye({
    x: fixture.start.x,
    y: fixture.start.floorY + shape.halfHeight + shape.radius + shape.eyeFromCenter + 0.12,
    z: fixture.start.z,
  });
  let verticalVelocity = 0;
  for (let frame = 0; frame < 240; frame += 1) {
    verticalVelocity += CHARACTER_PHYSICS_CONFIG.gravity * DT;
    const position = physics.eyePosition();
    const dx = fixture.target.x - position.x;
    const dz = fixture.target.z - position.z;
    const distance = Math.hypot(dx, dz);
    const speed = fixture.id === 'floor' ? 0 : 4.8;
    const result = physics.move({
      x: distance > 1e-9 ? dx / distance * speed * DT : 0,
      y: verticalVelocity * DT,
      z: distance > 1e-9 ? dz / distance * speed * DT : 0,
    }, DT);
    if (result.grounded && verticalVelocity < 0) verticalVelocity = 0;
  }
  return physics.debugContactSnapshot();
}

describe('HF-296 shipped player capsule contact evidence', () => {
  it('keeps stand, crouch, and prone Rapier capsules within KCC skin at real wall/floor/corner/doorjamb fixtures', async () => {
    const map = buildArena(new THREE.Scene());
    const house = map.houses.find((candidate) => candidate.id === 'aqua-irrigation-workshop');
    const destruction = map.houseDestruction;
    if (!house || !destruction) throw new Error('Atomic Acres shipped house authority is missing');

    const floor = requireSolid(house, 'upper-floor-main');
    const westWall = requireSolid(house, 'ground-west-wall');
    const frontLeft = requireSolid(house, 'front-ground-far-left');
    const frontCentreDefinition = destruction.definitions.find((definition) =>
      definition.sourceId === `${house.id}:front-ground-centre`);
    if (!frontCentreDefinition) throw new Error('Shipped dynamic front wall return is missing');
    const frontCentreSource = `dynamic:house-fragment:${frontCentreDefinition.id}`;

    const floorTop = floor.position[1] + floor.size[1] / 2;
    const fixtures: readonly ContactFixture[] = [
      {
        id: 'floor',
        start: { x: -14, z: -24.5, floorY: floorTop },
        target: { x: -14, z: -24.5 },
        sources: [staticSource(map, floor)],
      },
      {
        id: 'wall',
        start: { x: -8.65, z: -22, floorY: 0 },
        target: { x: -8.65, z: -19.7 },
        sources: [frontCentreSource],
      },
      {
        id: 'corner',
        start: { x: -17.3, z: -21.4, floorY: 0 },
        target: { x: -19.2, z: -19.6 },
        sources: [staticSource(map, westWall), staticSource(map, frontLeft)],
      },
      {
        id: 'doorjamb',
        start: { x: -12.5, z: -21.2, floorY: 0 },
        target: { x: -11.85, z: -19.6 },
        sources: [frontCentreSource],
      },
    ];

    const runtime = new InteractiveWorldRuntime(
      'atomic-acres', 71, [], true, undefined, undefined, destruction.definitions,
    );
    const observedPenetrations: number[] = [];
    try {
      for (const stance of STANCES) {
        const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
        physics.syncDynamicColliders(runtime.collisions().dynamicColliders);
        try {
          expect(physics.setStance(stance), `${stance}:stance`).toBe(true);
          for (const fixture of fixtures) {
            const snapshot = driveIntoFixture(physics, stance, fixture);
            expect(snapshot.stance, `${fixture.id}:${stance}:reported stance`).toBe(stance);
            expect(snapshot.controllerOffset).toBeCloseTo(CHARACTER_PHYSICS_CONFIG.controllerOffset, 7);
            expect(snapshot.capsule.halfHeight, `${fixture.id}:${stance}:capsule half-height`)
              .toBeCloseTo(STANCE_SHAPES[stance].halfHeight, 6);
            expect(snapshot.capsule.radius, `${fixture.id}:${stance}:capsule radius`)
              .toBeCloseTo(STANCE_SHAPES[stance].radius, 6);
            const capsuleBottom = snapshot.capsule.center.y
              - STANCE_SHAPES[stance].halfHeight - STANCE_SHAPES[stance].radius;
            expect(capsuleBottom - fixture.start.floorY, `${fixture.id}:${stance}:floor penetration`)
              .toBeGreaterThanOrEqual(-CHARACTER_PHYSICS_CONFIG.controllerOffset - POSITION_EPSILON);
            expect(capsuleBottom - fixture.start.floorY, `${fixture.id}:${stance}:lost floor support`)
              .toBeLessThanOrEqual(CHARACTER_PHYSICS_CONFIG.controllerOffset + POSITION_EPSILON);

            for (const source of fixture.sources) {
              expect(snapshot.contacts.some((candidate) => candidate.source === source),
                `${fixture.id}:${stance}:missing signed contact ${source}`).toBe(true);
              expect(snapshot.sweepCollisions.some((collision) => collision.source === source),
                `${fixture.id}:${stance}:missing native KCC collision ${source}`).toBe(true);
            }
            const contact = targetContact(snapshot, fixture.sources);
            expect(contact, `${fixture.id}:${stance}:missing signed target contact ${JSON.stringify(snapshot)}`).toBeDefined();
            if (!contact) continue;
            const penetration = Math.max(0, -contact.distance);
            observedPenetrations.push(penetration);
            expect(contact.distance, `${fixture.id}:${stance}:penetration=${penetration}`)
              .toBeGreaterThanOrEqual(-CHARACTER_PHYSICS_CONFIG.controllerOffset - SIGNED_DISTANCE_EPSILON);
            expect(contact.distance, `${fixture.id}:${stance}:outside contact skin`)
              .toBeLessThanOrEqual(CHARACTER_PHYSICS_CONFIG.controllerOffset + POSITION_EPSILON);
            if (fixture.id === 'doorjamb') {
              expect(Math.abs(contact.normalOnCharacter.x), `${fixture.id}:${stance}:missing jamb-edge X normal`)
                .toBeGreaterThan(0.9);
            }
            const deepestContact = Math.min(...snapshot.contacts.map((candidate) => candidate.distance));
            expect(deepestContact, `${fixture.id}:${stance}:any-world penetration`)
              .toBeGreaterThanOrEqual(-CHARACTER_PHYSICS_CONFIG.controllerOffset - SIGNED_DISTANCE_EPSILON);
          }
        } finally {
          physics.dispose();
        }
      }
      expect(observedPenetrations).toHaveLength(STANCES.length * fixtures.length);
      expect(Math.max(...observedPenetrations)).toBeLessThanOrEqual(
        CHARACTER_PHYSICS_CONFIG.controllerOffset + SIGNED_DISTANCE_EPSILON,
      );
    } finally {
      runtime.dispose();
    }
  });
});
