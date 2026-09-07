import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ALL_ARENA_IDS,
  installHeadlessArenaShims,
  loadArenaFactories,
} from '../scripts/qa/collider-visual-parity-core';
import {
  BALLISTIC_MATERIAL_CLASS,
  BALLISTIC_MATERIALS,
  BALLISTIC_STOP_MINIMUM_THICKNESS_METERS,
  ballisticMaterialClass,
  classifyBallisticMaterial,
  createBallisticSurface,
  penetrationEnergyRetention,
  traceBallisticPath,
  applyObstructionSpreadPenalty,
  applyPenetrationDamage,
  weaponPenetrationEnergy,
  type BallisticMaterialClass,
  type BallisticMaterialId,
  type WeaponPenetrationProfile,
} from './ballistics';
import { WEAPONS } from './gameplay';

/**
 * HF-467: ballistic surfaces with no raycast mesh behind them.
 *
 * Measured 2026-09-04 while the six-builder roster above was replaced with the
 * registry-derived one. Ten of the eleven arenas are exactly zero. `map3`
 * authors 205 surfaces (its godrays colonnade, physics kerbs, guide rails and
 * grammar clusters) directly rather than through `box()`, so the trace charges
 * for cover whose mesh the impact path cannot resolve. That is a real,
 * OUT-OF-LANE finding owned by the Map 3 lane; recording the exact count is
 * strictly more coverage than the literal that never built Map 3 at all. It
 * may only ever go DOWN.
 */
const ACCEPTED_UNBACKED_SHOT_SURFACES: Readonly<Record<string, number>> = Object.freeze({
  'atomic-acres': 0,
  'skyline-terminal': 0,
  'rustworks-1v1': 0,
  'gun-range': 0,
  farcrysis: 0,
  'high-seas': 0,
  nuketown2: 0,
  test1: 0,
  test2: 0,
  raid2: 0,
  map3: 205,
});

/**
 * HF-467 fallback ratchet.
 *
 * `classification: 'fallback'` is not a material choice, it is the classifier
 * reporting that NOTHING rated this surface, so it was given `reinforced`
 * (entryCost 1000) to fail safe. A sniper carries 10.90 energy. A fallback
 * surface is therefore a prop the player can see, can take cover behind, and
 * can never shoot through with any weapon in the catalogue - which is exactly
 * what the owner reported on Nuke Town Rebuild's yard "stores" and buttresses.
 *
 * Every arena that is clean is pinned at 0 and must stay there. The four
 * arenas below carry a measured, named debt count from the sweep on
 * 2026-09-04: they are OUT of this lane's scope (other lanes own that
 * geometry) and pinning their real number is strictly more coverage than the
 * six-builder literal that never measured them at all. These ceilings may only
 * ever go DOWN, and a new arena that is not named here fails the ledger test
 * rather than entering silently.
 */
const ACCEPTED_BALLISTIC_FALLBACK: Readonly<Record<string, number>> = Object.freeze({
  'atomic-acres': 0,
  'skyline-terminal': 0,
  'rustworks-1v1': 0,
  'gun-range': 0,
  farcrysis: 0,
  'high-seas': 0,
  // HF-467 lane I1 rated every one of Nuke Town Rebuild's 30 fallback surfaces
  // (15 templates x the 180-degree fairness involution). It enters the ledger
  // at the strictest floor and must stay there.
  nuketown2: 0,
  // OPEN debt, measured 2026-09-04 and owned by the lanes that build these
  // arenas. Recorded as the exact count so a regression is visible on the next
  // run instead of hiding inside a round number.
  test1: 58,
  test2: 135,
  map3: 21,
  raid2: 105,
});

const origin = { x: 0, y: 1.5, z: 0 };
const direction = { x: 1, y: 0, z: 0 };

function surface(
  material: BallisticMaterialId,
  x: number,
  thickness: number,
  id = `${material}-${x}`,
) {
  return createBallisticSurface(
    id,
    id,
    { minX: x, maxX: x + thickness, minY: 0, maxY: 3, minZ: -20, maxZ: 20 },
    { material },
  );
}

describe('shared wall-penetration authority', () => {
  it('keeps the material table physically ordered for gameplay', () => {
    const cost = (material: BallisticMaterialId, thickness: number) => {
      const rule = BALLISTIC_MATERIALS[material];
      return rule.entryCost + rule.costPerMeter * thickness;
    };
    expect(cost('glass', 0.2)).toBeLessThan(cost('fence', 0.2));
    expect(cost('fence', 0.42)).toBeLessThan(cost('interior-wall', 0.42));
    expect(cost('interior-wall', 0.42)).toBeLessThan(cost('brick', 0.42));
    expect(cost('brick', 0.42)).toBeLessThan(cost('concrete', 0.42));
    expect(cost('container', 2.6)).toBeGreaterThan(cost('concrete', 0.42));
  });

  it('gives every weapon a bounded calibre, distance, FMJ, and residual-damage profile', () => {
    const noWallPenetration = new Set(['explosive-crossbow', 'flamethrower', 'crimson-flamethrower', 'flare-gun']);
    expect(Object.values(WEAPONS)
      .filter((weapon) => weapon.penetration.maxPenetratedSurfaces === 0)
      .map((weapon) => weapon.id)
      .sort()).toEqual([...noWallPenetration].sort());
    for (const weapon of Object.values(WEAPONS)) {
      const profile = weapon.penetration;
      expect(profile.caliber.length, weapon.id).toBeGreaterThan(2);
      if (noWallPenetration.has(weapon.id)) {
        expect(profile.penetrationPower, weapon.id).toBe(0);
        expect(profile.maxPenetratedSurfaces, weapon.id).toBe(0);
        expect(profile.minimumEnergyRetention, weapon.id).toBe(0);
        expect(profile.minimumWallDamageMultiplier, weapon.id).toBe(0);
      } else {
        expect(profile.penetrationPower, weapon.id).toBeGreaterThan(0);
        expect(profile.maxPenetratedSurfaces, weapon.id).toBeGreaterThanOrEqual(1);
        expect(profile.minimumEnergyRetention, weapon.id).toBeGreaterThan(0);
        expect(profile.minimumWallDamageMultiplier, weapon.id).toBeGreaterThan(0);
      }
      expect(profile.fmjMultiplier, weapon.id).toBeGreaterThanOrEqual(1);
      expect(profile.energyFalloffEnd, weapon.id).toBeGreaterThan(profile.energyFalloffStart);
      expect(profile.minimumEnergyRetention, weapon.id).toBeLessThanOrEqual(1);
      expect(profile.minimumWallDamageMultiplier, weapon.id).toBeLessThanOrEqual(1);
    }
  });

  it('makes close-range fire retain more penetration energy than long-range fire', () => {
    const profile = WEAPONS.smg.penetration;
    expect(penetrationEnergyRetention(profile, 4)).toBe(1);
    expect(penetrationEnergyRetention(profile, 30)).toBeLessThan(0.5);
    expect(traceBallisticPath(origin, direction, 10, profile, [surface('wood', 5, 1.5)]).reachedDistance).toBe(true);
    expect(traceBallisticPath(origin, direction, 40, profile, [surface('wood', 30, 1.5)]).reachedDistance).toBe(false);
  });

  it('lets rifle-calibre weapons beat SMGs through brick at range', () => {
    const wall = surface('brick', 25, 0.42);
    const smg = traceBallisticPath(origin, direction, 35, WEAPONS.smg.penetration, [wall]);
    const carbine = traceBallisticPath(origin, direction, 35, WEAPONS.carbine.penetration, [wall]);
    const sniper = traceBallisticPath(origin, direction, 35, WEAPONS.sniper.penetration, [wall]);
    expect(smg.reachedDistance).toBe(false);
    expect(carbine.reachedDistance).toBe(true);
    expect(sniper.reachedDistance).toBe(true);
    expect(sniper.remainingEnergy).toBeGreaterThan(carbine.remainingEnergy);
  });

  it('passes thin fence and interior cover but stops on a thick container', () => {
    const weapon = WEAPONS.carbine.penetration;
    const fence = traceBallisticPath(origin, direction, 12, weapon, [surface('fence', 5, 0.2)]);
    const interior = traceBallisticPath(origin, direction, 12, weapon, [surface('interior-wall', 5, 0.42)]);
    const container = traceBallisticPath(origin, direction, 12, weapon, [surface('container', 5, 2.6)]);
    expect(fence.reachedDistance).toBe(true);
    expect(interior.reachedDistance).toBe(true);
    expect(fence.damageMultiplier).toBeGreaterThan(interior.damageMultiplier);
    expect(container.reachedDistance).toBe(false);
    expect(container.stoppedBy?.material).toBe('container');
  });

  it('charges oblique shots for their longer path through a surface', () => {
    const tightProfile: WeaponPenetrationProfile = {
      caliber: 'test', penetrationPower: 1.6, fmjMultiplier: 1,
      energyFalloffStart: 100, energyFalloffEnd: 200, minimumEnergyRetention: 1,
      minimumWallDamageMultiplier: 0.2, maxPenetratedSurfaces: 1,
    };
    const wall = surface('interior-wall', 5, 1);
    const square = traceBallisticPath(origin, direction, 12, tightProfile, [wall]);
    const oblique = traceBallisticPath(origin, { x: 1, y: 0, z: 0.75 }, 16, tightProfile, [wall]);
    expect(square.reachedDistance).toBe(true);
    expect(oblique.reachedDistance).toBe(false);
  });

  it('bounds repeated wallbangs and reduces damage after every accepted surface', () => {
    const profile = WEAPONS.sniper.penetration;
    const one = traceBallisticPath(origin, direction, 20, profile, [surface('interior-wall', 4, 0.42)]);
    const three = traceBallisticPath(origin, direction, 20, profile, [
      surface('interior-wall', 4, 0.42, 'wall-1'),
      surface('interior-wall', 8, 0.42, 'wall-2'),
      surface('interior-wall', 12, 0.42, 'wall-3'),
    ]);
    const four = traceBallisticPath(origin, direction, 20, profile, [
      surface('glass', 2, 0.08, 'pane'),
      surface('interior-wall', 4, 0.42, 'wall-1'),
      surface('interior-wall', 8, 0.42, 'wall-2'),
      surface('interior-wall', 12, 0.42, 'wall-3'),
    ]);
    expect(one.reachedDistance).toBe(true);
    expect(three.reachedDistance).toBe(true);
    expect(three.damageMultiplier).toBeLessThan(one.damageMultiplier);
    expect(four.reachedDistance).toBe(false);
  });

  it('fails unknown future materials closed instead of granting accidental penetration', () => {
    expect(classifyBallisticMaterial({ name: 'mystery-new-asset' })).toEqual({
      material: 'reinforced',
      classification: 'fallback',
    });
    const unknown = createBallisticSurface(
      'unknown',
      'mystery-new-asset',
      { minX: 5, maxX: 5.1, minY: 0, maxY: 3, minZ: -1, maxZ: 1 },
    );
    expect(traceBallisticPath(origin, direction, 10, WEAPONS.sniper.penetration, [unknown]).reachedDistance).toBe(false);
  });

  it('passes only through a canonical dynamic aperture at the exact entry point', () => {
    const sheet = surface('reinforced', 5, 0.08, 'shed-sheet');
    const blocked = traceBallisticPath(origin, direction, 10, WEAPONS.carbine.penetration, [sheet], () => false);
    const aperture = traceBallisticPath(origin, direction, 10, WEAPONS.carbine.penetration, [sheet], (candidate, entry) => (
      candidate.id === 'shed-sheet' && Math.hypot(entry.y - 1.5, entry.z) <= 0.1
    ));
    const outside = traceBallisticPath(
      { ...origin, y: 1.8 }, direction, 10, WEAPONS.carbine.penetration, [sheet],
      (_candidate, entry) => Math.hypot(entry.y - 1.5, entry.z) <= 0.1,
    );
    expect(blocked.reachedDistance).toBe(false);
    expect(aperture).toMatchObject({ reachedDistance: true, impacts: [] });
    expect(outside.reachedDistance).toBe(false);
  });

  it('classifies every REGISTERED arena shot blocker with unique authority', async () => {
    // HF-390 wrote this as a six-builder literal - `buildArena`,
    // `buildRustworks1v1`, `buildGunRange`, `buildSkylineTerminal`,
    // `buildFarcrysis`, `buildHighSeas` - on a day when six was the whole
    // game. `test1`, `test2`, `map3`, `nuketown2` and `raid2` then shipped and
    // this assertion never looked at any of them: HF-467's 30 unshootable
    // `reinforced` surfaces on Nuke Town Rebuild sat behind a green run of
    // exactly this test. That is the same hardcoded-roster failure
    // `scripts/qa/arena-roster.mjs` already documents three prior instances
    // of, so the roster is now DERIVED from the canonical arena registry
    // (`ARENA_IDS` -> `loadArenaFactories`) - the same source the collider,
    // walkable and ballistic-parity audits use. Registering an arena enrols it
    // here on the same commit; there is no second list to remember.
    installHeadlessArenaShims();
    const factories = await loadArenaFactories();
    expect(Object.keys(factories).sort(), 'every registered arena id needs a builder').toEqual([...ALL_ARENA_IDS].sort());
    for (const arenaId of ALL_ARENA_IDS) {
      const arena = factories[arenaId]!.build(new THREE.Scene());
      const dynamicTargetMeshes = arena.raycastMeshes.filter((mesh) => (
        typeof mesh.userData.ballisticSurfaceId !== 'string'
      ));
      expect(dynamicTargetMeshes.every((mesh) => (
        typeof mesh.userData.targetId === 'string'
        && mesh.userData.targetRoot instanceof THREE.Group
        && (mesh.userData.hitZone === 'head' || mesh.userData.hitZone === 'body' || mesh.userData.hitZone === 'limb')
      )), `${arenaId}: a raycast mesh with no ballistic surface must be a dynamic target`).toBe(true);
      expect(new Set(arena.shotSurfaces.map((entry) => entry.id)).size, `${arenaId}: duplicate ballistic surface id`).toBe(arena.shotSurfaces.length);
      expect(arena.raycastMeshes.every((mesh) => (
        typeof mesh.userData.ballisticSurfaceId === 'string' || dynamicTargetMeshes.includes(mesh)
      )), `${arenaId}: unrated raycast mesh`).toBe(true);
      // The reverse direction of the census, which the six-builder literal
      // never asked of the five arenas it did not build: a BallisticSurface
      // with no raycast mesh behind it is cover the trace charges for but the
      // impact/decal/audio path can never resolve a mesh for. Every arena that
      // is clean is pinned at 0; map3 carries a measured, named debt.
      const backedSurfaceIds = new Set(arena.raycastMeshes
        .map((mesh) => mesh.userData.ballisticSurfaceId)
        .filter((id): id is string => typeof id === 'string'));
      const unbacked = arena.shotSurfaces.filter((entry) => !backedSurfaceIds.has(entry.id));
      const unbackedCeiling = ACCEPTED_UNBACKED_SHOT_SURFACES[arenaId]!;
      expect(
        unbacked.length,
        `${arenaId}: ${unbacked.length} ballistic surface(s) with no raycast mesh over ceiling ${unbackedCeiling}: `
        + `${[...new Set(unbacked.map((entry) => entry.name.replace(/\d+/g, '#')))].sort().slice(0, 10).join(' | ')}`,
      ).toBeLessThanOrEqual(unbackedCeiling);
      expect(arena.shotSurfaces.length - unbacked.length + dynamicTargetMeshes.length, `${arenaId}: shot surface + dynamic target census`).toBe(arena.raycastMeshes.length);
    }
  }, 300_000);

  it('gives every registered arena an explicit fallback ceiling that only shrinks', async () => {
    installHeadlessArenaShims();
    const factories = await loadArenaFactories();
    for (const arenaId of ALL_ARENA_IDS) {
      expect(ACCEPTED_BALLISTIC_FALLBACK[arenaId], `${arenaId} must have an explicit fallback ceiling`).toBeDefined();
    }
    expect(Object.keys(ACCEPTED_BALLISTIC_FALLBACK).sort()).toEqual([...ALL_ARENA_IDS].sort());
    expect(Object.keys(ACCEPTED_UNBACKED_SHOT_SURFACES).sort()).toEqual([...ALL_ARENA_IDS].sort());
    for (const arenaId of ALL_ARENA_IDS) {
      const arena = factories[arenaId]!.build(new THREE.Scene());
      const fallbacks = arena.shotSurfaces.filter((entry) => entry.classification === 'fallback');
      const ceiling = ACCEPTED_BALLISTIC_FALLBACK[arenaId]!;
      expect(
        fallbacks.length,
        `${arenaId}: ${fallbacks.length} unshootable reinforced fallback surface(s) over ceiling ${ceiling}: `
        + `${[...new Set(fallbacks.map((entry) => entry.name))].sort().join(' | ')}`,
      ).toBeLessThanOrEqual(ceiling);
    }
  }, 300_000);
});

describe('HF-467 material classes: the owner statement, made mechanical', () => {
  // "glass or blocks have no penetration; metal and glass should be shot
  // through, glass breaks; thin metal (the shed) should get a hole with no
  // collision after" - owner, docs/PASS84_OWNER_FEEDBACK_2026-09-02.md.
  const strongestBudget = weaponPenetrationEnergy(WEAPONS.sniper.penetration);
  const weakestBudget = Math.min(...Object.values(WEAPONS)
    .map((weapon) => weaponPenetrationEnergy(weapon.penetration))
    .filter((value) => value > 0));

  it('classifies every material exactly once, with no unclassified id', () => {
    const ids = (Object.keys(BALLISTIC_MATERIALS) as BallisticMaterialId[]).sort();
    expect(Object.keys(BALLISTIC_MATERIAL_CLASS).sort()).toEqual(ids);
    const valid: readonly BallisticMaterialClass[] = ['shatter', 'perforate', 'penetrate', 'stop'];
    for (const id of ids) expect(valid).toContain(ballisticMaterialClass(id));
  });

  it('names glass the only shatter class and thin metal the only perforate class', () => {
    const byClass = (target: BallisticMaterialClass) => (Object.keys(BALLISTIC_MATERIAL_CLASS) as BallisticMaterialId[])
      .filter((id) => BALLISTIC_MATERIAL_CLASS[id] === target).sort();
    // The owner named exactly these two behaviours; the shipped authorities
    // that implement them - glass-authority.ts and the shed's aperture model -
    // are single-material by construction, so a second id in either class
    // would be a surface with a promise and no authority behind it.
    expect(byClass('shatter')).toEqual(['glass']);
    expect(byClass('perforate')).toEqual(['thin-metal']);
  });

  it('pins the whole class map, so a re-rating is a deliberate two-file edit', () => {
    // The mirror pin this repository already uses for its ballistic ceilings.
    // Moving a material between classes changes what the owner's statement
    // means, so it must fail here and be argued in review rather than land as
    // a one-word diff inside ballistics.ts.
    expect(BALLISTIC_MATERIAL_CLASS).toEqual({
      glass: 'shatter',
      'thin-metal': 'perforate',
      fence: 'penetrate',
      wood: 'penetrate',
      'interior-wall': 'penetrate',
      vehicle: 'penetrate',
      container: 'penetrate',
      'structural-metal': 'penetrate',
      brick: 'stop',
      concrete: 'stop',
      earth: 'stop',
      reinforced: 'stop',
    });
  });

  it('never lets a shatter or perforate material be priced like structural cover', () => {
    // This is the guard that has teeth. R3's draft asserted that no catalogue
    // firearm can enter a `stop` material; the shipped table does not say that
    // (brick entryCost 1.7 against the sniper's 10.90 budget - a half-metre
    // brick wallbang is intended and separately measured), so asserting it
    // would have been a false gate. What IS true, and what the owner's
    // statement depends on, is the SEPARATION: the two materials he named as
    // shoot-through must always be cheaper to enter than the cheapest thing
    // he named as cover. Re-rating glass or sheet metal upward fails here.
    const stopEntry = (Object.keys(BALLISTIC_MATERIAL_CLASS) as BallisticMaterialId[])
      .filter((id) => BALLISTIC_MATERIAL_CLASS[id] === 'stop')
      .map((id) => BALLISTIC_MATERIALS[id].entryCost);
    const cheapestCover = Math.min(...stopEntry);
    for (const [id, klass] of Object.entries(BALLISTIC_MATERIAL_CLASS) as [BallisticMaterialId, BallisticMaterialClass][]) {
      if (klass !== 'shatter' && klass !== 'perforate') continue;
      expect(
        BALLISTIC_MATERIALS[id].entryCost,
        `${id} is class '${klass}' but costs as much to enter as structural cover (${cheapestCover})`,
      ).toBeLessThan(cheapestCover);
    }
  });

  it('charges a stop-class minimum depth so thin concrete stops small arms', () => {
    const thinConcrete = surface('concrete', 5, 0.12);
    expect(BALLISTIC_STOP_MINIMUM_THICKNESS_METERS).toBeGreaterThan(0.12);
    for (const weapon of [WEAPONS.pistol, WEAPONS.carbine]) {
      const trace = traceBallisticPath(origin, direction, 20, weapon.penetration, [thinConcrete]);
      expect(trace.reachedDistance, weapon.id).toBe(false);
      expect(trace.stoppedBy?.material, weapon.id).toBe('concrete');
    }
  });

  it('keeps stop-class concrete penetrable by a sniper when its budget clears the floor', () => {
    // The class comment defines stop as priced structural cover, not absolute
    // immunity. A sniper may still clear the effective toll, just as the
    // retained rifle-through-brick wallbang does.
    expect(BALLISTIC_MATERIAL_CLASS.concrete).toBe('stop');
    expect(BALLISTIC_MATERIAL_CLASS.brick).toBe('stop');
    const trace = traceBallisticPath(
      origin, direction, 20, WEAPONS.sniper.penetration, [surface('concrete', 5, 0.12)],
    );
    expect(trace.reachedDistance).toBe(true);
    expect(trace.stoppedBy).toBeUndefined();
  });

  it('leaves thick concrete on its original physical thickness charge', () => {
    const thickness = 0.8;
    const trace = traceBallisticPath(origin, direction, 20, WEAPONS.carbine.penetration, [
      surface('concrete', 5, thickness),
    ]);
    const expectedStopDepth = Math.min(
      thickness,
      (weaponPenetrationEnergy(WEAPONS.carbine.penetration) - BALLISTIC_MATERIALS.concrete.entryCost)
        / BALLISTIC_MATERIALS.concrete.costPerMeter,
    );
    expect(trace.reachedDistance).toBe(false);
    expect(trace.impacts[0]!.thickness).toBeCloseTo(expectedStopDepth, 10);
  });

  it('does not apply the stop floor to penetrate, perforate, or shatter materials', () => {
    const profile = {
      ...WEAPONS.carbine.penetration,
      energyFalloffStart: 100,
      energyFalloffEnd: 200,
    };
    for (const material of ['wood', 'thin-metal', 'glass'] as const) {
      const thickness = 0.12;
      const trace = traceBallisticPath(origin, direction, 20, profile, [surface(material, 5, thickness)]);
      const resistance = BALLISTIC_MATERIALS[material];
      const expectedRemaining = weaponPenetrationEnergy(profile)
        - resistance.entryCost - resistance.costPerMeter * thickness;
      expect(trace.reachedDistance, material).toBe(true);
      expect(trace.remainingEnergy, material).toBeCloseTo(expectedRemaining, 10);
    }
  });

  it('lets every firearm break glass and every shotgun-and-up perforate sheet metal', () => {
    // The owner's two "should be shot through" cases, at the thicknesses this
    // arena actually authors: a 6 cm pane and the shed's 6 cm sheet.
    const cost = (id: BallisticMaterialId, thickness: number) => (
      BALLISTIC_MATERIALS[id].entryCost + BALLISTIC_MATERIALS[id].costPerMeter * thickness
    );
    expect(cost('glass', 0.06), 'the weakest firearm must break a 6 cm pane').toBeLessThan(weakestBudget);
    // The shed's own perforate threshold was set so the 12ga pellet clears it
    // (src/destructible-shed-definition.ts). Sheet metal must therefore be
    // crossable from the scattergun upward - and it deliberately is NOT
    // crossable by the m14-ebr's 0.957 marksman budget, which is the weakest
    // firearm in the catalogue.
    expect(cost('thin-metal', 0.06)).toBeLessThan(weaponPenetrationEnergy(WEAPONS.scattergun.penetration));
    expect(cost('thin-metal', 0.06)).toBeGreaterThan(weakestBudget);
  });

  it('keeps the reinforced sentinel unreachable by every catalogue firearm', () => {
    // `reinforced` is the only member of `stop` that really is absolute, and
    // that is the whole reason a `fallback` surface is a defect and not a
    // material choice: it is cover no weapon in the game can answer.
    expect(BALLISTIC_MATERIALS.reinforced.entryCost).toBeGreaterThan(strongestBudget);
    for (const weapon of Object.values(WEAPONS)) {
      const budget = weaponPenetrationEnergy(weapon.penetration);
      // The railgun's sentinel budget is deliberately above everything; it is
      // the map-clearing killstreak weapon, not a firearm the owner carries.
      if (budget > 1_000) continue;
      expect(budget).toBeLessThan(BALLISTIC_MATERIALS.reinforced.entryCost);
    }
  });
});

describe('HF-467 perforation energy comes from the trace, not the muzzle', () => {
  const PELLET = WEAPONS.scattergun.penetration;

  it('reports the remaining energy at each surface entry face', () => {
    const sheet = surface('thin-metal', 4, 0.06);
    const trace = traceBallisticPath(origin, direction, 20, PELLET, [sheet]);
    expect(trace.impacts).toHaveLength(1);
    // The shed's frozen perforate threshold is 21Q. A point-blank pellet must
    // still clear it after the input fix, which is what pins that this change
    // corrected the INPUT and did not retune the threshold.
    expect(trace.impacts[0]!.energyAtEntryQ).toBeGreaterThanOrEqual(21);
  });

  it('charges the same shot LESS energy once it has already crossed a wall', () => {
    const plank = surface('wood', 2, 0.24);
    const sheet = surface('thin-metal', 4, 0.06);
    const clear = traceBallisticPath(origin, direction, 20, PELLET, [sheet]);
    const throughWood = traceBallisticPath(origin, direction, 20, PELLET, [plank, sheet]);
    const sheetImpact = throughWood.impacts.find((impact) => impact.surface.material === 'thin-metal');
    expect(sheetImpact, 'the pellet must still reach the sheet through 24 cm of wood').toBeDefined();
    expect(sheetImpact!.energyAtEntryQ).toBeLessThan(clear.impacts[0]!.energyAtEntryQ);
  });

  it('falls off with distance, which the muzzle constant could never do', () => {
    const near = surface('thin-metal', 4, 0.06, 'near-sheet');
    const far = surface('thin-metal', 90, 0.06, 'far-sheet');
    const nearTrace = traceBallisticPath(origin, direction, 200, WEAPONS.carbine.penetration, [near]);
    const farTrace = traceBallisticPath(origin, direction, 200, WEAPONS.carbine.penetration, [far]);
    expect(farTrace.impacts[0]!.energyAtEntryQ).toBeLessThan(nearTrace.impacts[0]!.energyAtEntryQ);
  });
});

describe('HF-368 per-weapon wall-penetration multiplier', () => {
  /** The owner's tune must ride on the weapon, never on the shared material table. */
  const preHf368 = (profile: typeof WEAPONS['m14-ebr']['penetration']) => ({
    ...profile,
    wallPenetrationMultiplier: 1,
  });

  it('gives the M14 EBR exactly 1.5 and leaves every other weapon on the 1.0 default', () => {
    expect(WEAPONS['m14-ebr'].penetration.wallPenetrationMultiplier).toBe(1.5);
    for (const weapon of Object.values(WEAPONS)) {
      if (weapon.id === 'm14-ebr') continue;
      expect(weapon.penetration.wallPenetrationMultiplier, weapon.id).toBe(1);
    }
  });

  it('scales only the energy budget, and defaults an unauthored profile to 1', () => {
    const ebr = WEAPONS['m14-ebr'].penetration;
    expect(weaponPenetrationEnergy(ebr)).toBeCloseTo(0.55 * 1.16 * 1.5, 10);
    expect(weaponPenetrationEnergy(preHf368(ebr))).toBeCloseTo(0.55 * 1.16, 10);
    const { wallPenetrationMultiplier: _omitted, ...unauthored } = ebr;
    expect(weaponPenetrationEnergy(unauthored)).toBeCloseTo(0.55 * 1.16, 10);
  });

  it('leaves every other weapon bit-identical through the same cover', () => {
    const cover = [
      surface('interior-wall', 5, 0.42, 'shared-wall'),
      surface('glass', 9, 0.08, 'shared-pane'),
    ];
    for (const weapon of Object.values(WEAPONS)) {
      if (weapon.id === 'm14-ebr') continue;
      const shipped = traceBallisticPath(origin, direction, 20, weapon.penetration, cover);
      const before = traceBallisticPath(origin, direction, 20, preHf368(weapon.penetration), cover);
      expect(shipped.reachedDistance, weapon.id).toBe(before.reachedDistance);
      expect(shipped.damageMultiplier, weapon.id).toBe(before.damageMultiplier);
      expect(shipped.remainingEnergy, weapon.id).toBe(before.remainingEnergy);
    }
  });

  it('turns a 0.25 m interior wall from a hard stop into reduced damage', () => {
    const wall = [surface('interior-wall', 5, 0.25, 'representative-wall')];
    const before = traceBallisticPath(origin, direction, 20, preHf368(WEAPONS['m14-ebr'].penetration), wall);
    const after = traceBallisticPath(origin, direction, 20, WEAPONS['m14-ebr'].penetration, wall);
    // Pass 64 budget 0.638 could not pay the 0.6825 traversal toll at all.
    expect(before.reachedDistance).toBe(false);
    expect(before.stoppedBy?.id).toBe('representative-wall');
    expect(applyPenetrationDamage(WEAPONS['m14-ebr'].damage, before.damageMultiplier)).toBe(0);
    // 0.957 pays it and keeps the remainder - reduced, never free.
    expect(after.reachedDistance).toBe(true);
    expect(after.damageMultiplier).toBeCloseTo(0.28683, 4);
    expect(after.damageMultiplier).toBeLessThan(1);
    expect(applyPenetrationDamage(WEAPONS['m14-ebr'].damage, after.damageMultiplier)).toBe(15); // HF-398: 52.1 * 0.28683
  });

  it('raises but never removes attenuation on a wall the EBR already passed', () => {
    const wall = [surface('interior-wall', 5, 0.15, 'thin-wall')];
    const before = traceBallisticPath(origin, direction, 20, preHf368(WEAPONS['m14-ebr'].penetration), wall);
    const after = traceBallisticPath(origin, direction, 20, WEAPONS['m14-ebr'].penetration, wall);
    expect(before.reachedDistance).toBe(true);
    expect(after.reachedDistance).toBe(true);
    expect(applyPenetrationDamage(WEAPONS['m14-ebr'].damage, before.damageMultiplier)).toBe(6); // HF-398 envelope
    expect(applyPenetrationDamage(WEAPONS['m14-ebr'].damage, after.damageMultiplier)).toBe(21);
    expect(after.damageMultiplier).toBeGreaterThan(before.damageMultiplier);
    // Still strictly attenuated: a crossed surface is never free damage.
    expect(after.damageMultiplier).toBeLessThan(1);
    expect(applyPenetrationDamage(WEAPONS['m14-ebr'].damage, after.damageMultiplier))
      .toBeLessThan(WEAPONS['m14-ebr'].damage);
  });

  it('keeps an unobstructed EBR shot on exactly the canonical damage', () => {
    const clear = traceBallisticPath(origin, direction, 20, WEAPONS['m14-ebr'].penetration, []);
    expect(clear).toMatchObject({ reachedDistance: true, damageMultiplier: 1, impacts: [] });
    expect(applyPenetrationDamage(WEAPONS['m14-ebr'].damage, clear.damageMultiplier)).toBe(52.1); // HF-398 canonical base
  });

  it('still stops the EBR on brick, concrete and reinforced cover', () => {
    for (const material of ['brick', 'concrete', 'container', 'earth', 'reinforced'] as const) {
      const trace = traceBallisticPath(
        origin, direction, 20, WEAPONS['m14-ebr'].penetration, [surface(material, 5, 0.2)],
      );
      expect(trace.reachedDistance, material).toBe(false);
      expect(trace.damageMultiplier, material).toBe(0);
    }
  });
});

describe('HF-343 obstruction spread penalty', () => {
  it('applies an additive spread penalty in radians for partially raised weapons', () => {
    const baseSpread = 0.012; // carbine hip spread
    const penalty = 0.007; // half raised
    const result = applyObstructionSpreadPenalty(baseSpread, penalty);
    expect(result).toBeCloseTo(0.019, 6);
    // Monotonic: larger penalty means larger spread
    expect(applyObstructionSpreadPenalty(baseSpread, 0.01)).toBeGreaterThan(result);
  });

  it('saturates at the maximum penalty when the weapon is fully raised (fireBlocked)', () => {
    const baseSpread = 0.012;
    const maxPenalty = 0.014; // VIEWMODEL_FIRE_MAXIMUM_SPREAD_PENALTY_RADIANS
    const result = applyObstructionSpreadPenalty(baseSpread, maxPenalty);
    expect(result).toBeCloseTo(0.026, 6);
  });

  it('returns the base spread unchanged for zero or negative penalty', () => {
    expect(applyObstructionSpreadPenalty(0.012, 0)).toBe(0.012);
    expect(applyObstructionSpreadPenalty(0.012, -0.01)).toBe(0.012);
    expect(applyObstructionSpreadPenalty(0.012, NaN)).toBe(0.012);
  });

  it('returns the base spread unchanged for non-finite or non-positive base', () => {
    expect(applyObstructionSpreadPenalty(NaN, 0.01)).toBe(NaN);
    expect(applyObstructionSpreadPenalty(0, 0.01)).toBe(0);
    expect(applyObstructionSpreadPenalty(-0.01, 0.01)).toBe(-0.01);
  });
});
