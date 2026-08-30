import * as THREE from 'three';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';
import { optimizeAttachedWeapon } from './art-kit';
import {
  createPass65CrossbowModel,
  createPass65WeaponModel,
  disposePass65WeaponModel,
  loadPass65WeaponPresentation,
  releasePass65WeaponModel,
} from './weapon-model';
import { PRIMARY_WEAPON_IDS, type WeaponId } from './protocol';

export type DeathDropPresentationTelemetry = {
  capacity: number;
  active: number;
  prewarmed: boolean;
  dynamicLights: 0;
  /** Authored drop models constructed since the pool was created. */
  authoredBuilt: number;
  /** Constructed models parked for re-use (built once, shown many times). */
  authoredIdle: number;
};

type DeathDropSlot = {
  root: THREE.Group;
  weapon: THREE.Group;
  active: boolean;
  request: number;
  weaponId: WeaponId | null;
};

/**
 * Idle authored drops retained PER WEAPON. Constructing one is a SkeletonUtils
 * clone, a material clone per mesh, an owner geometry clone and
 * optimizeAttachedWeapon's second clone + toNonIndexed + mergeGeometries — the
 * work behind the owner's "just killed a bot and froze for 0.5 seconds"
 * (2026-08-30), which ran at least twice on every kill frame. Two covers the
 * common simultaneous-duplicate case (two bots carrying the same gun die
 * together) without retaining capacity x arsenal clones for a whole match.
 */
const AUTHORED_IDLE_PER_WEAPON = 2;

type IdleScope = typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

/**
 * Resolve OFF the current frame. Every 'drop' GLB is decoded during the shared
 * asset prewarm, so loadPass65WeaponPresentation returns an already-resolved
 * promise and its .then body would otherwise run as a MICROTASK on the frame
 * that asked — the kill frame. A macrotask/idle hop cannot land there.
 */
function whenIdle(timeoutMs = 120): Promise<void> {
  return new Promise((resolve) => {
    const scope = globalThis as IdleScope;
    if (typeof scope.requestIdleCallback === 'function') scope.requestIdleCallback(() => resolve(), { timeout: timeoutMs });
    else setTimeout(resolve, 0);
  });
}

export class DeathDropPresentationPool {
  readonly root = new THREE.Group();
  private readonly slots: DeathDropSlot[];
  private wasPrewarmed = false;
  /** Built-once authored drops, parked by weapon id while nothing shows them. */
  private readonly idleAuthored = new Map<WeaponId, THREE.Group[]>();
  private authoredBuilt = 0;

  constructor(
    scene: THREE.Scene,
    capacity: number,
    private readonly retireModel?: (root: THREE.Object3D, afterFence?: () => void) => void,
  ) {
    this.root.name = 'death-drop-presentation-pool';
    this.root.userData.presentationOnly = true;
    this.root.raycast = () => undefined;
    scene.add(this.root);
    this.slots = Array.from({ length: capacity }, (_, index) => this.createSlot(index));
  }

  private retireAuthoredModel(model: THREE.Object3D): void {
    model.removeFromParent();
    if (this.retireModel) this.retireModel(model, () => releasePass65WeaponModel(model));
    else disposePass65WeaponModel(model);
  }

  private createSlot(index: number): DeathDropSlot {
    const root = new THREE.Group();
    root.name = `death-drop-pool-slot-${index}`;
    root.visible = false;
    root.userData.presentationOnly = true;
    root.userData.deathDropPoolSlot = index;
    root.raycast = () => undefined;

    const weapon = new THREE.Group();
    weapon.name = 'death-drop-weapon';
    weapon.scale.setScalar(typeof document === 'undefined' ? 0.3 : 0.68);
    weapon.rotation.set(0.12, 0, Math.PI / 2);
    if (typeof document === 'undefined') {
      const weaponMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 0.36), weaponMaterial);
      receiver.name = 'death-drop-pooled-receiver';
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.45, 8), weaponMaterial);
      barrel.name = 'death-drop-pooled-barrel';
      barrel.rotation.z = Math.PI / 2;
      barrel.position.x = 1.35;
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.46, 0.3), weaponMaterial);
      stock.name = 'death-drop-pooled-stock';
      stock.position.x = -1.05;
      const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.65, 0.28), weaponMaterial);
      magazine.name = 'death-drop-pooled-magazine';
      magazine.position.set(-0.05, -0.38, 0);
      magazine.rotation.z = 0.2;
      weapon.add(receiver, barrel, stock, magazine);
    }

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.72, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
    );
    ring.name = 'death-drop-ring';
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.08;

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.07, 1.1, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }),
    );
    beacon.name = 'death-drop-beacon';
    beacon.position.y = 0.55;

    root.add(weapon, ring, beacon);
    root.traverse((node) => {
      node.userData.presentationOnly = true;
      node.userData.blocksShots = false;
      node.raycast = () => undefined;
    });
    this.root.add(root);
    return { root, weapon, active: false, request: 0, weaponId: null };
  }

  private createAuthoredDrop(weaponId: WeaponId): THREE.Group | null {
    const model = weaponId === 'explosive-crossbow'
      ? createPass65CrossbowModel(false, 'drop')
      : createPass65WeaponModel(weaponId, false, 'drop');
    if (!model) return null;
    optimizeAttachedWeapon(model, 'texture-lit');
    model.name = `death-drop-authored-${weaponId}`;
    model.userData.weaponId = weaponId;
    model.traverse((node) => {
      node.userData.presentationOnly = true;
      node.userData.blocksShots = false;
      node.raycast = () => undefined;
    });
    this.authoredBuilt += 1;
    return model;
  }

  /** Pop a previously constructed drop for this weapon, or null if none is parked. */
  private takeAuthoredModel(weaponId: WeaponId): THREE.Group | null {
    return this.idleAuthored.get(weaponId)?.pop() ?? null;
  }

  /**
   * Park a shown drop back under its weapon id instead of destroying it. This
   * is the whole fix: the pool now owns the constructed presentation for the
   * match, so a kill re-shows an existing object. Overflow past the per-weapon
   * cap (and anything without a weapon identity) still retires behind the GPU
   * fence, so the retained set stays bounded.
   */
  private stashAuthoredModel(model: THREE.Object3D): void {
    const weaponId = model.userData.weaponId as WeaponId | undefined;
    if (!weaponId || !(model instanceof THREE.Group)) {
      this.retireAuthoredModel(model);
      return;
    }
    const idle = this.idleAuthored.get(weaponId) ?? [];
    if (idle.length >= AUTHORED_IDLE_PER_WEAPON) {
      this.retireAuthoredModel(model);
      return;
    }
    model.removeFromParent();
    idle.push(model);
    this.idleAuthored.set(weaponId, idle);
  }

  private clearSlotWeapon(slot: DeathDropSlot): void {
    for (const previous of [...slot.weapon.children]) {
      this.stashAuthoredModel(previous);
    }
  }

  /**
   * Show `weaponId` on `slot`. A weapon that has been dropped before is
   * re-shown SYNCHRONOUSLY — one add(), no clone, no merge — because on a kill
   * frame this runs inside processDeath -> spawnDeathDrop. Only a weapon
   * nobody has dropped yet still needs construction, and that is pushed off
   * the frame entirely; after prewarm the whole primary set is already built,
   * so this fallback should never fire mid-match.
   */
  private installWeapon(slot: DeathDropSlot, weaponId: WeaponId, request: number): void {
    const parked = this.takeAuthoredModel(weaponId);
    if (parked) {
      slot.weapon.add(parked);
      return;
    }
    void loadPass65WeaponPresentation(weaponId, 'drop').then(() => whenIdle()).then(() => {
      if (!slot.active || slot.request !== request || slot.weaponId !== weaponId) return;
      const model = this.takeAuthoredModel(weaponId) ?? this.createAuthoredDrop(weaponId);
      if (!model) throw new Error(`Pass 65 authored death-drop model unavailable after load: ${weaponId}`);
      this.clearSlotWeapon(slot);
      slot.weapon.add(model);
    }).catch((error: unknown) => {
      slot.root.userData.pass65DropWeaponLoadError = error instanceof Error ? error.message : String(error);
      console.error(`Pass 65 authored death-drop load failed for ${weaponId}`, error);
    });
  }

  /**
   * Tint the pooled markers only. The authored gun keeps its own authored
   * materials — it used to escape this traverse purely because it arrived a
   * microtask after acquire() returned, and a re-used model must not
   * accumulate drop colours across the kills it serves.
   */
  private tintPooledMarkers(slot: DeathDropSlot, color: number): void {
    slot.root.traverse((node) => {
      if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshBasicMaterial) node.material.color.setHex(color);
    });
  }

  acquire(id: string, color: number, position: THREE.Vector3, weaponId: WeaponId = 'carbine'): THREE.Group {
    const slot = this.slots.find((candidate) => !candidate.active);
    if (!slot) throw new Error('Death-drop presentation pool exhausted');
    slot.active = true;
    slot.root.visible = true;
    slot.root.scale.setScalar(1);
    slot.root.position.copy(position);
    slot.root.userData.deathDropId = id;
    slot.weaponId = weaponId;
    slot.request += 1;
    if (typeof document !== 'undefined') this.clearSlotWeapon(slot);
    this.tintPooledMarkers(slot, color);
    if (typeof document !== 'undefined') this.installWeapon(slot, weaponId, slot.request);
    return slot.root;
  }

  release(root: THREE.Object3D): void {
    const slot = this.slots.find((candidate) => candidate.root === root);
    if (!slot) return;
    slot.active = false;
    slot.root.visible = false;
    slot.root.userData.deathDropId = null;
    slot.weaponId = null;
    slot.request += 1;
    if (typeof document !== 'undefined') this.clearSlotWeapon(slot);
  }

  /**
   * Swap the visible weapon model on an active drop. Used when a player picks a
   * gun up and their old one takes its place, so the ground model always matches
   * what is actually in the drop.
   */
  setWeapon(root: THREE.Object3D, weaponId: WeaponId, color: number): void {
    const slot = this.slots.find((candidate) => candidate.root === root);
    if (!slot || !slot.active || slot.weaponId === weaponId) return;
    slot.weaponId = weaponId;
    slot.request += 1;
    if (typeof document !== 'undefined') this.clearSlotWeapon(slot);
    this.tintPooledMarkers(slot, color);
    if (typeof document !== 'undefined') this.installWeapon(slot, weaponId, slot.request);
  }

  async prewarm(runtime: PresentationPrewarmRuntime, camera: THREE.Camera, weaponId: WeaponId = 'carbine'): Promise<void> {
    if (this.wasPrewarmed) return;
    const parentScene = this.root.parent;
    if (!(parentScene instanceof THREE.Scene)) throw new Error('Death-drop presentation must be attached to a scene before prewarm');
    const prewarmModels: THREE.Group[] = [];
    if (typeof document !== 'undefined') {
      // A corpse only ever drops a primary (spawnDeathDrop gates on
      // isPrimaryWeaponId), so the primary set IS the match's drop corpus.
      // Building all of it here — one model per slot, riding the single
      // compile pass below — means the first kill of every weapon costs an
      // add() instead of a clone/merge. The slice keeps the loop inside the
      // pool's own capacity, which is the number of models the compile pass
      // can host at once (MAX_DEATH_DROPS 12 == 12 primaries today).
      const corpus: WeaponId[] = [weaponId, ...PRIMARY_WEAPON_IDS.filter((id) => id !== weaponId)];
      for (const id of corpus.slice(0, this.slots.length)) {
        await loadPass65WeaponPresentation(id, 'drop');
        const model = this.createAuthoredDrop(id);
        if (!model) {
          if (id === weaponId) throw new Error(`Pass 65 authored death-drop prewarm unavailable: ${id}`);
          continue;
        }
        this.slots[prewarmModels.length].weapon.add(model);
        prewarmModels.push(model);
        // Bootstrap owns the frame here, but 12 clones back to back is a long
        // task; hand the browser a beat between them.
        await whenIdle(16);
      }
    }
    for (const slot of this.slots) {
      slot.root.visible = true;
      slot.root.scale.setScalar(0.0001);
    }
    try {
      await runtime.compileAndRender(this.root, camera, parentScene);
      this.wasPrewarmed = true;
    } finally {
      for (const model of prewarmModels) {
        this.stashAuthoredModel(model);
      }
      for (const slot of this.slots) {
        slot.root.visible = slot.active;
        slot.root.scale.setScalar(1);
      }
    }
  }

  telemetry(): DeathDropPresentationTelemetry {
    let authoredIdle = 0;
    for (const parked of this.idleAuthored.values()) authoredIdle += parked.length;
    return {
      capacity: this.slots.length,
      active: this.slots.filter((slot) => slot.active).length,
      prewarmed: this.wasPrewarmed,
      dynamicLights: 0,
      authoredBuilt: this.authoredBuilt,
      authoredIdle,
    };
  }
}
