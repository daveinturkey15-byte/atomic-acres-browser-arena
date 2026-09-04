import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2 } from './nuketown2-arena';
import {
  BALLISTIC_MATERIAL_CLASS,
  traceBallisticPath,
  weaponPenetrationEnergy,
} from './ballistics';
import {
  admitGlassImpact,
  createGlassState,
  glassAuthorityProjection,
} from './glass-authority';
import { deriveGlassDynamicColliders } from './glass-collider-bounds';
import { WEAPONS } from './gameplay';
import type { Box2 } from './collision';

/**
 * HF-464 ("the windows upstairs need to be breakable") and HF-467 ("metal and
 * glass should be shot through, glass breaks"), owner 2026-09-02.
 *
 * Nuke Town Rebuild shipped `breakableWindows: []`: it had glazing you could
 * see, and not one pane in the arena could ever break. This suite is the
 * mechanical falsifier for the registration, and it deliberately asserts the
 * SHIPPED mechanism rather than a private one - the same `BreakableWindow`
 * rows `src/map.ts` declares, the same `deriveGlassDynamicColliders` the
 * runtime calls each frame, and the same `admitGlassImpact` phase machine the
 * host runs - so a pane that passes here is a pane the game can actually
 * break.
 *
 * The three things that can silently undo it, each pinned below:
 *   1. a pane authored `solid: true`, which bakes a STATIC collider into
 *      `arena.colliders` that no break can ever remove (bots would also be
 *      permanently blind through that window, because bot line of sight reads
 *      movement colliders);
 *   2. a `pair()` call that mints ONE id for both halves, which makes the two
 *      houses share a pane and break together;
 *   3. a pane whose ballistic material drifts off `glass`, which takes it out
 *      of the shatter class and off the break path entirely.
 */

const EXPECTED_PANE_IDS = [
  'nuketown2-ground-window-0:north',
  'nuketown2-ground-window-0:south',
  'nuketown2-ground-window-1:north',
  'nuketown2-ground-window-1:south',
  'nuketown2-upper-back-window:north',
  'nuketown2-upper-back-window:south',
  'nuketown2-upper-front-window:north',
  'nuketown2-upper-front-window:south',
] as const;

function build() {
  return buildNuketown2(new THREE.Scene());
}

function overlaps(a: Box2, b: Box2): boolean {
  const near = (x: number, y: number) => Math.abs(x - y) <= 0.02;
  return near(a.minX, b.minX) && near(a.maxX, b.maxX) && near(a.minZ, b.minZ) && near(a.maxZ, b.maxZ);
}

describe('HF-464/HF-467 Nuke Town Rebuild glazing is registered breakable glass', () => {
  it('registers every pane on BOTH floors, north and south, with unique ids', () => {
    const arena = build();
    expect(arena.breakableWindows.map((pane) => pane.id).sort()).toEqual([...EXPECTED_PANE_IDS]);
    // Two ground-front panes + one upper-front + one upper-back, per house.
    expect(arena.breakableWindows).toHaveLength(8);
    expect(new Set(arena.breakableWindows.map((pane) => pane.id)).size).toBe(8);
    // Upstairs is the owner's explicit ask, so it is asserted by name rather
    // than left to the count.
    expect(arena.breakableWindows.filter((pane) => pane.id.startsWith('nuketown2-upper-'))).toHaveLength(4);
    for (const pane of arena.breakableWindows) {
      expect(pane.broken, `${pane.id} must start intact`).toBe(false);
      expect(pane.mesh.userData.breakableWindowId, `${pane.id} mesh binding`).toBe(pane.id);
      expect(pane.mesh.userData.dynamic, `${pane.id} must be a dynamic pane`).toBe(true);
    }
  });

  it('gives every pane a glass-class ballistic surface bound to its window id', () => {
    const arena = build();
    for (const pane of arena.breakableWindows) {
      const surface = arena.shotSurfaces.find((entry) => entry.breakableWindowId === pane.id);
      expect(surface, `${pane.id} needs a ballistic surface`).toBeDefined();
      expect(surface!.material).toBe('glass');
      expect(surface!.classification).toBe('explicit');
      expect(BALLISTIC_MATERIAL_CLASS[surface!.material]).toBe('shatter');
    }
    expect(arena.shotSurfaces.filter((entry) => entry.breakableWindowId)).toHaveLength(8);
  });

  it('keeps NO pane in the static collider set, so a break can actually open it', () => {
    // The failure this pins is silent and total: `solid: true` bakes the pane
    // into `arena.colliders` at build time, and static colliders are never
    // removed. The glass would break visually and the frame would stay shut.
    const arena = build();
    for (const pane of arena.breakableWindows) {
      pane.mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(pane.mesh);
      const paneBounds: Box2 = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
      const staticMatch = arena.colliders.find((collider) => overlaps(collider, paneBounds));
      expect(staticMatch, `${pane.id} must not have a static movement collider`).toBeUndefined();
    }
  });

  it('emits a dynamic collider per intact pane and drops exactly the breached one', () => {
    const arena = build();
    const panes = arena.breakableWindows;
    expect(deriveGlassDynamicColliders(panes)).toHaveLength(8);

    // Drive the SHIPPED phase machine to breach, rather than setting a flag.
    const target = panes.find((pane) => pane.id === 'nuketown2-upper-front-window:north')!;
    let state = createGlassState(target.id, 1);
    expect(glassAuthorityProjection(state).movementSolid).toBe(true);
    for (let shot = 0; shot < 4; shot += 1) {
      const admission = admitGlassImpact(state, {
        isHost: true,
        matchEpoch: 1,
        expectedRevision: state.revision,
        impactId: `${target.id}:${shot}`,
        tick: shot + 1,
        profile: 'bullet',
      });
      expect(admission.accepted, `shot ${shot} must be admitted`).toBe(true);
      state = admission.state;
      if (state.phase === 'breached' || state.phase === 'detached') break;
    }
    expect(state.phase === 'breached' || state.phase === 'detached').toBe(true);
    const projection = glassAuthorityProjection(state);
    expect(projection.movementSolid).toBe(false);
    expect(projection.apertureOpen).toBe(true);
    // Bot line of sight reads movement colliders, so this single flag is what
    // opens the window for players, bullets and bots at the same instant.
    expect(projection.aiLineOfSightSolid).toBe(false);

    target.glassState = state;
    expect(deriveGlassDynamicColliders(panes)).toHaveLength(7);
    // The other seven panes must be untouched: the upstairs windows of the two
    // houses are a rotational pair and must not break together.
    for (const pane of panes) {
      if (pane.id === target.id) continue;
      expect(pane.glassState, `${pane.id} must not have been affected`).toBeUndefined();
    }
  });

  it('lets the weakest firearm in the catalogue cross a pane', () => {
    // The owner's "glass should be shot through", measured against the shared
    // trace on the arena's own panes rather than a fixture.
    const arena = build();
    const surfaces = arena.shotSurfaces.filter((entry) => entry.breakableWindowId);
    const weakest = Object.values(WEAPONS)
      .map((weapon) => weapon.penetration)
      .filter((profile) => weaponPenetrationEnergy(profile) > 0)
      .sort((a, b) => weaponPenetrationEnergy(a) - weaponPenetrationEnergy(b))[0]!;
    for (const surface of surfaces) {
      const midX = (surface.bounds.minX + surface.bounds.maxX) / 2;
      const midY = ((surface.bounds.minY ?? 0) + (surface.bounds.maxY ?? 3)) / 2;
      const midZ = (surface.bounds.minZ + surface.bounds.maxZ) / 2;
      // Fire along +Z from 3 m in front of the pane, straight through it.
      const trace = traceBallisticPath(
        { x: midX, y: midY, z: midZ - 3 },
        { x: 0, y: 0, z: 1 },
        6,
        weakest,
        [surface],
      );
      expect(trace.impacts, `${surface.name}: the pane must be hit`).toHaveLength(1);
      expect(trace.impacts[0]!.penetrated, `${surface.name}: the weakest firearm must cross glass`).toBe(true);
      expect(trace.reachedDistance).toBe(true);
    }
  });
});
