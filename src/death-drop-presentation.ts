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
import type { WeaponId } from './protocol';

export type DeathDropPresentationTelemetry = {
  capacity: number;
  active: number;
  prewarmed: boolean;
  dynamicLights: 0;
};

type DeathDropSlot = {
  root: THREE.Group;
  weapon: THREE.Group;
  active: boolean;
  request: number;
  weaponId: WeaponId | null;
};

export class DeathDropPresentationPool {
  readonly root = new THREE.Group();
  private readonly slots: DeathDropSlot[];
  private wasPrewarmed = false;

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
    return model;
  }

  private installWeapon(slot: DeathDropSlot, weaponId: WeaponId, request: number): void {
    void loadPass65WeaponPresentation(weaponId, 'drop').then(() => {
      if (!slot.active || slot.request !== request || slot.weaponId !== weaponId) return;
      const model = this.createAuthoredDrop(weaponId);
      if (!model) throw new Error(`Pass 65 authored death-drop model unavailable after load: ${weaponId}`);
      for (const previous of [...slot.weapon.children]) {
        this.retireAuthoredModel(previous);
      }
      slot.weapon.add(model);
    }).catch((error: unknown) => {
      slot.root.userData.pass65DropWeaponLoadError = error instanceof Error ? error.message : String(error);
      console.error(`Pass 65 authored death-drop load failed for ${weaponId}`, error);
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
    if (typeof document !== 'undefined') {
      for (const previous of [...slot.weapon.children]) {
        this.retireAuthoredModel(previous);
      }
      this.installWeapon(slot, weaponId, slot.request);
    }
    slot.root.traverse((node) => {
      if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshBasicMaterial) node.material.color.setHex(color);
    });
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
    if (typeof document !== 'undefined') {
      for (const model of [...slot.weapon.children]) {
        this.retireAuthoredModel(model);
      }
    }
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
    if (typeof document !== 'undefined') {
      for (const previous of [...slot.weapon.children]) {
        this.retireAuthoredModel(previous);
      }
      this.installWeapon(slot, weaponId, slot.request);
    }
    slot.root.traverse((node) => {
      if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshBasicMaterial) node.material.color.setHex(color);
    });
  }

  async prewarm(runtime: PresentationPrewarmRuntime, camera: THREE.Camera, weaponId: WeaponId = 'carbine'): Promise<void> {
    if (this.wasPrewarmed) return;
    const parentScene = this.root.parent;
    if (!(parentScene instanceof THREE.Scene)) throw new Error('Death-drop presentation must be attached to a scene before prewarm');
    let prewarmModel: THREE.Group | null = null;
    if (typeof document !== 'undefined') {
      await loadPass65WeaponPresentation(weaponId, 'drop');
      prewarmModel = this.createAuthoredDrop(weaponId);
      if (!prewarmModel) throw new Error(`Pass 65 authored death-drop prewarm unavailable: ${weaponId}`);
      this.slots[0]?.weapon.add(prewarmModel);
    }
    for (const slot of this.slots) {
      slot.root.visible = true;
      slot.root.scale.setScalar(0.0001);
    }
    try {
      await runtime.compileAndRender(this.root, camera, parentScene);
      this.wasPrewarmed = true;
    } finally {
      if (prewarmModel) {
        this.retireAuthoredModel(prewarmModel);
      }
      for (const slot of this.slots) {
        slot.root.visible = slot.active;
        slot.root.scale.setScalar(1);
      }
    }
  }

  telemetry(): DeathDropPresentationTelemetry {
    return {
      capacity: this.slots.length,
      active: this.slots.filter((slot) => slot.active).length,
      prewarmed: this.wasPrewarmed,
      dynamicLights: 0,
    };
  }
}
