import * as THREE from 'three';

export type DeathDropPresentationTelemetry = {
  capacity: number;
  active: number;
  prewarmed: boolean;
  dynamicLights: 0;
};

type DeathDropSlot = {
  root: THREE.Group;
  active: boolean;
};

export class DeathDropPresentationPool {
  readonly root = new THREE.Group();
  private readonly slots: DeathDropSlot[];
  private wasPrewarmed = false;

  constructor(scene: THREE.Scene, capacity: number) {
    this.root.name = 'death-drop-presentation-pool';
    this.root.userData.presentationOnly = true;
    this.root.raycast = () => undefined;
    scene.add(this.root);
    this.slots = Array.from({ length: capacity }, (_, index) => this.createSlot(index));
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
    weapon.scale.setScalar(0.3);
    weapon.rotation.set(0.12, 0, Math.PI / 2);
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
    return { root, active: false };
  }

  acquire(id: string, color: number, position: THREE.Vector3): THREE.Group {
    const slot = this.slots.find((candidate) => !candidate.active);
    if (!slot) throw new Error('Death-drop presentation pool exhausted');
    slot.active = true;
    slot.root.visible = true;
    slot.root.scale.setScalar(1);
    slot.root.position.copy(position);
    slot.root.userData.deathDropId = id;
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
  }

  async prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): Promise<void> {
    if (this.wasPrewarmed) return;
    for (const slot of this.slots) {
      slot.root.visible = true;
      slot.root.scale.setScalar(0.0001);
    }
    try {
      await renderer.compileAsync(this.root.parent as THREE.Scene, camera);
      renderer.render(this.root.parent as THREE.Scene, camera);
      this.wasPrewarmed = true;
    } finally {
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
