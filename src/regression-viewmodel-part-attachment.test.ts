/**
 * REGRESSION GATE — a visible weapon model is never left deep-frozen, and no
 * authored part ever leaves the weapon group it belongs to.
 *
 * Owner 2026-08-30: "randomly top of shotgun detached ... m14 scope part is
 * flying in the air above the gun".
 *
 * Root cause: hidden viewmodels are DEEP-FROZEN for performance —
 * `matrixAutoUpdate` is cleared across the whole subtree and the model root's
 * `updateMatrixWorld` is replaced with a no-op, so even a forced matrix pass
 * skips it. Any path that reveals a model without re-running the freeze
 * therefore renders it, and every part under it, at the world transform it was
 * parked at. That reads exactly as a rib or an optic hanging in the air beside
 * the receiver, and it is intermittent because it depends on which of several
 * reveal paths ran.
 *
 * Why it shipped: the freeze was applied at each KNOWN reveal site. Nothing
 * pinned the INVARIANT, so a new reveal path was one edit away from being
 * wrong again, silently, and only on some equips.
 *
 * These gates state the invariant instead of enumerating call sites:
 *   1. after a frame, whatever is visible is unfrozen;
 *   2. a model revealed by a bypassing path is repaired by the next frame;
 *   3. no authored part is ever parented outside its own weapon group.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_IDS, type WeaponId } from './protocol';
import { WeaponPresentation, type WeaponPose } from './weapon-presentation';

const REST_POSE: WeaponPose = Object.freeze({
  dt: 1 / 60,
  moving: false,
  sprinting: false,
  crouched: false,
  prone: false,
  ads: false,
  phase: 0,
  landingImpulse: 0,
  lateralSpeed: 0,
  reloadProgress: null,
});

function createPresentation(): WeaponPresentation {
  return new WeaponPresentation(new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250), false);
}

/**
 * The per-weapon model roots WeaponPresentation mounts under its own root.
 * Found by weapon id rather than by an authored suffix, because the suffix
 * differs between the authored and procedural deliveries and a suffix rename
 * would silently empty this map.
 */
function weaponModels(presentation: WeaponPresentation): ReadonlyMap<WeaponId, THREE.Object3D> {
  const models = new Map<WeaponId, THREE.Object3D>();
  for (const id of WEAPON_IDS) {
    const model = presentation.root.children.find((child) => (
      child.name.startsWith(`${id}-`) && child.name.endsWith('-weapon')
    ));
    if (model) models.set(id, model);
  }
  return models;
}

/**
 * Deep-frozen exactly as `deepFreezeSubtreeMatrices` leaves a subtree: the
 * root carries its own no-op `updateMatrixWorld`, and every node below has
 * `matrixAutoUpdate` cleared.
 */
function frozenNodes(model: THREE.Object3D): string[] {
  const frozen: string[] = [];
  if (Object.prototype.hasOwnProperty.call(model, 'updateMatrixWorld')) {
    frozen.push(`${model.name || model.uuid}:updateMatrixWorld`);
  }
  model.traverse((node) => {
    if (!node.matrixAutoUpdate) frozen.push(`${node.name || node.uuid}:matrixAutoUpdate`);
  });
  return frozen;
}

/**
 * Where a node's own transform chain says it is, composed by hand from the
 * stored LOCAL matrices. Freezing composes those once and then stops the
 * per-frame world pass, so this stays truthful while `matrixWorld` — the
 * matrix the renderer actually draws with — goes stale.
 */
function composedWorldPosition(part: THREE.Object3D, top: THREE.Object3D): THREE.Vector3 {
  const chain: THREE.Object3D[] = [];
  for (let node: THREE.Object3D | null = part; node && node !== top; node = node.parent) chain.push(node);
  const matrix = top.matrixWorld.clone();
  for (const node of chain.reverse()) matrix.multiply(node.matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
}

/**
 * The position the RENDERER draws at: `matrixWorld` as stored, read without
 * touching it. `getWorldPosition` walks the chain upward and silently
 * recomputes, which repairs the very staleness this gate exists to catch.
 */
function renderedWorldPosition(part: THREE.Object3D): THREE.Vector3 {
  return new THREE.Vector3().setFromMatrixPosition(part.matrixWorld);
}

function meshUuids(model: THREE.Object3D): string[] {
  const uuids: string[] = [];
  model.traverse((node) => { if (node instanceof THREE.Mesh) uuids.push(node.uuid); });
  return uuids.sort();
}

describe('visible viewmodels are never left frozen', () => {
  it('unfreezes exactly the mounted weapon and freezes the rest, every frame', async () => {
    const presentation = createPresentation();
    await presentation.load();
    const models = weaponModels(presentation);
    // A gate that found no models would pass every assertion below it.
    expect(models.size).toBe(WEAPON_IDS.length);

    for (const id of WEAPON_IDS) {
      presentation.setWeapon(id, true);
      presentation.update({ ...REST_POSE });
      for (const [weaponId, model] of models) {
        if (weaponId === id) {
          expect(model.visible, `${id} should be mounted`).toBe(true);
          // A visible model with a single frozen node renders that node, and
          // everything under it, at a stale world transform.
          expect(frozenNodes(model), `${id} is visible but frozen`).toEqual([]);
        } else {
          expect(model.visible, `${weaponId} should be parked`).toBe(false);
          // The freeze must still be doing its job for parked rigs, or this
          // gate has been "fixed" by deleting the optimisation instead.
          expect(frozenNodes(model).length, `${weaponId} is parked but unfrozen`).toBeGreaterThan(0);
        }
      }
    }
  });

  /**
   * The defect itself, reproduced through the mechanism rather than through
   * whichever reveal path happened to be wrong: reveal a parked model without
   * re-running the freeze, then move the viewmodel. The revealed parts stay
   * where they were parked — that is the floating rib — and the next frame
   * must repair it with no call-site knowledge at all.
   */
  it('repairs a model revealed by a path that bypassed the freeze', async () => {
    const presentation = createPresentation();
    await presentation.load();
    const models = weaponModels(presentation);
    presentation.setWeapon('carbine', true);
    presentation.update({ ...REST_POSE });
    presentation.root.updateMatrixWorld(true);

    const bypassed = models.get('m14-ebr')!;
    expect(frozenNodes(bypassed).length).toBeGreaterThan(0);
    const parts: THREE.Object3D[] = [];
    bypassed.traverse((node) => { if (node instanceof THREE.Mesh) parts.push(node); });
    expect(parts.length).toBeGreaterThan(1);

    // A reveal that does not re-run the freeze — the shape of every path the
    // owner's floating optic came through — followed by the viewmodel moving.
    bypassed.visible = true;
    presentation.root.position.x += 5;
    presentation.root.updateMatrixWorld(true);
    // Freezing composes each node's LOCAL matrix once, so the truth is still
    // recoverable by hand; what is stale is the matrixWorld the renderer reads.
    const stale = parts.map((part) => (
      renderedWorldPosition(part).distanceTo(composedWorldPosition(part, presentation.root))
    ));
    expect(Math.max(...stale), 'the frozen reveal is no longer reproducible').toBeGreaterThan(4.9);

    presentation.update({ ...REST_POSE });
    presentation.root.updateMatrixWorld(true);

    expect(frozenNodes(bypassed), 'a revealed model is still frozen after a frame').toEqual([]);
    for (const part of parts) {
      // Every part now renders where its own transform chain says it is. This
      // is the whole invariant: no rib, no optic, left behind in world space.
      expect(
        renderedWorldPosition(part).distanceTo(composedWorldPosition(part, presentation.root)),
        `${part.name} still renders at a stale world transform`,
      ).toBeLessThan(1e-9);
    }
  });

  it('keeps a mounted weapon rigid under the freeze/unfreeze cycle', async () => {
    const presentation = createPresentation();
    await presentation.load();
    const models = weaponModels(presentation);
    const model = models.get('slug-shotgun')!;
    presentation.setWeapon('slug-shotgun', true);
    presentation.update({ ...REST_POSE });
    presentation.root.updateMatrixWorld(true);
    const parts: THREE.Mesh[] = [];
    model.traverse((node) => { if (node instanceof THREE.Mesh) parts.push(node); });
    // Local-to-model offsets, which no equip cycle may change. World positions
    // legitimately move with the viewmodel sway; the part's place ON THE GUN
    // does not, and that displacement is exactly what the owner watched.
    const offsets = parts.map((part) => model.worldToLocal(renderedWorldPosition(part)));

    for (const id of ['carbine', 'm14-ebr', 'slug-shotgun', 'pistol', 'slug-shotgun'] as const) {
      presentation.setWeapon(id, true);
      presentation.update({ ...REST_POSE });
    }
    presentation.root.updateMatrixWorld(true);

    for (const [index, part] of parts.entries()) {
      const now = model.worldToLocal(renderedWorldPosition(part));
      expect(now.distanceTo(offsets[index]), `${part.name} drifted off the receiver`).toBeLessThan(1e-6);
    }
  });
});

describe('no authored weapon part leaves its weapon group', () => {
  it('mounts every model directly under the viewmodel root and shares no part', async () => {
    const presentation = createPresentation();
    await presentation.load();
    const models = weaponModels(presentation);
    const seen = new Map<string, WeaponId>();
    for (const [id, model] of models) {
      // One hop: a model re-parented under another model would inherit that
      // weapon's pose and animate with the wrong gun.
      expect(model.parent, `${id} is not mounted on the viewmodel root`).toBe(presentation.root);
      for (const uuid of meshUuids(model)) {
        const owner = seen.get(uuid);
        // The purest form of the detach defect: one Mesh added to two groups.
        // three keeps only the last parent, so the other weapon renders a hole.
        expect(owner, `${uuid} is shared by ${owner} and ${id}`).toBeUndefined();
        seen.set(uuid, id);
      }
    }
    expect(seen.size).toBeGreaterThan(models.size);
  });

  it('never migrates a part between weapons across a full equip sweep', async () => {
    const presentation = createPresentation();
    await presentation.load();
    const models = weaponModels(presentation);
    const before = new Map([...models].map(([id, model]) => [id, meshUuids(model)] as const));

    // Every weapon, twice, with a frame between each: the equip/reveal/freeze
    // paths all run, in both the cold and the already-resident order.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const id of WEAPON_IDS) {
        presentation.setWeapon(id, pass === 0);
        presentation.update({ ...REST_POSE });
      }
    }

    for (const [id, model] of models) {
      expect(meshUuids(model), `${id} lost or gained a part`).toEqual(before.get(id));
      // And nothing escaped upward into the shared viewmodel root, where it
      // would render at the arms' transform instead of the weapon's.
      for (const uuid of before.get(id)!) {
        const part = model.getObjectByProperty('uuid', uuid);
        expect(part, `${id} part ${uuid} is no longer inside its weapon group`).toBeDefined();
      }
    }
  });
});
