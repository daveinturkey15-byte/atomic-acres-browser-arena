import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { buildWorldStudio } from '../arena';
import { CharacterPhysics } from '../../physics';
import { authoredElevationAt } from '../../vertical-navigation';
import { collidersOverlappingVerticalSpan, resolveHorizontalMove, type Box2 } from '../../collision';
import type { ArenaMap } from '../../map';
import type { ArenaVerticalNavigation } from '../../vertical-navigation';

let arena: ArenaMap;
let physics: CharacterPhysics;
let navigation: ArenaVerticalNavigation;
const dt = 1 / 60;
beforeAll(async () => {
  arena = buildWorldStudio(new Scene());
  navigation = arena.root.userData.verticalNavigation;
  physics = await CharacterPhysics.create(arena.physicsColliders, arena.bounds, arena.physicsSafetyFloorY);
});
afterAll(() => physics?.dispose());

async function walk(start: readonly number[], target: readonly number[]): Promise<{ reached: boolean; eyeY: number }> {
  physics.teleportEye({ x: start[0], y: start[1] + 1.7, z: start[2] });
  let vy = 0, grounded = false;
  for (let i = 0; i < 60; i++) {
    vy -= 22 * dt;
    const result = physics.move({ x: 0, y: vy * dt, z: 0 }, dt);
    grounded = result.grounded;
    if (grounded) vy = 0;
  }
  for (let i = 0; i < 900; i++) {
    const eye = physics.eyePosition();
    const dx = target[0] - eye.x, dz = target[2] - eye.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.18) return { reached: true, eyeY: eye.y };
    vy -= 22 * dt;
    if (grounded) vy = Math.max(0, vy); // actual gameplay grounded velocity contract
    const result = physics.move({ x: dx / distance * 3.6 * dt, y: vy * dt, z: dz / distance * 3.6 * dt }, dt);
    grounded = result.grounded;
    if (grounded || result.blockedY) vy = 0;
  }
  return { reached: false, eyeY: physics.eyePosition().y };
}

describe('New World actual traversal boundaries', () => {
  it('registers every intact pane with canonical unique dynamic IDs and no permanent glass', () => {
    const glass = arena.shotSurfaces.filter(s => s.breakableWindowId);
    expect(glass.length).toBeGreaterThan(8);
    expect(() => physics.syncDynamicColliders(glass.map(s => ({ id: `glass:${s.breakableWindowId}`, bounds: s.bounds })))).not.toThrow();
    for (const pane of glass) expect(arena.colliders).not.toContainEqual(pane.bounds);
    expect(() => physics.syncDynamicColliders([])).not.toThrow();
  });

  it('walks the actual capsule up and down both flights in both houses', async () => {
    for (const route of navigation.routes.filter(r => /interior-stair|external-stair/.test(r.id))) {
      const direction = Math.sign(route.top[2] - route.foot[2]);
      const foot = [route.foot[0], route.foot[1], route.foot[2] - direction * 0.8];
      const top = [route.top[0], route.top[1], route.top[2] + direction * 0.65];
      const up = await walk(foot, top);
      expect(up.reached, `${route.id}: capsule must clear the balcony rail`).toBe(true);
      expect(up.eyeY).toBeGreaterThan(route.top[1] + 1.6);
      expect((await walk(top, foot)).reached, `${route.id}: descent`).toBe(true);
    }
  });

  it('walks through the open slider half onto the garage roof with intact glass', async () => {
    const glass = arena.shotSurfaces.filter(s => s.breakableWindowId);
    physics.syncDynamicColliders(glass.map(s => ({ id: `glass:${s.breakableWindowId}`, bounds: s.bounds })));
    try {
      for (const route of navigation.routes.filter(r => r.id.endsWith('-garage-roof-door'))) {
        expect((await walk(route.foot, route.top)).reached, route.id).toBe(true);
        expect((await walk(route.top, route.foot)).reached, `${route.id}: return`).toBe(true);
      }
    } finally { physics.syncDynamicColliders([]); }
  });

  it('keeps exact physical tread authority while allowing the bot solver onto authored ramps', () => {
    const steps = arena.root.userData.worldStudioBotStepColliders as ReadonlySet<Box2>;
    expect(steps.size).toBe(64);
    for (const step of steps) {
      expect(arena.colliders).toContain(step);
      expect(arena.physicsColliders).toContain(step);
      expect(arena.shotSurfaces.map(s => s.bounds)).toContainEqual(step);
    }
    const source = readFileSync(new URL('../../legacy-main.ts', import.meta.url), 'utf8');
    expect(source).toContain("activeArena.id === 'world-studio'");
    expect(source).toContain('if (studioSteps?.has(box)) return false');
    const navigationColliders = arena.colliders.filter(box => !steps.has(box)
      && !((box.maxY! - box.minY! <= 0.5) && (box.minY! > 2 || Boolean(box.rotation))));
    for (const route of navigation.routes.filter(r => /interior-stair|external-stair/.test(r.id))) {
      const direction = Math.sign(route.top[2] - route.foot[2]);
      let position = { x: route.foot[0], y: route.foot[1], z: route.foot[2] - direction * 0.8 };
      for (let i = 0; i < 200; i++) {
        const span = collidersOverlappingVerticalSpan(navigationColliders, position.y, position.y + 1.7);
        const eye = { ...position, y: position.y + 1.7 };
        const moved = resolveHorizontalMove(eye, { ...eye, z: eye.z + direction * 3.6 * dt }, span, arena.bounds, 0.44);
        position = { x: moved.x, y: authoredElevationAt(navigation, moved, position.y), z: moved.z };
        if ((position.z - route.top[2]) * direction >= 0) break;
      }
      expect(Math.abs(position.z - route.top[2]), `${route.id}: no invisible riser wall`).toBeLessThan(0.3);
      expect(position.y).toBeGreaterThan(3.1);
    }
  });

  it('does not retain upstairs bot elevation over the unsupported stairwell margin', () => {
    for (const x of [-18.55, 18.55]) {
      expect(authoredElevationAt(navigation, { x, y: 3.3, z: 4 }, 3.3)).toBeCloseTo(0.08);
    }
    for (const x of [-16, 16]) expect(authoredElevationAt(navigation, { x, y: 3.3, z: -2 }, 3.3)).toBe(3.3);
  });
});
