import * as THREE from 'three';
import type { DroneSensorContact, KillstreakEntitySnapshot, KillstreakImpactEvent, KillstreakRecipientSnapshot } from './killstreak-runtime';

const MAX_PRESENTED_ENTITIES = 32;
const MAX_IMPACT_FLASHES = 20;
const MAX_SENSOR_CONTACTS = 16;

type PresentedEntity = Readonly<{
  root: THREE.Group;
  rotor: THREE.Object3D | null;
  target: THREE.Vector3;
}>;

export type KillstreakPresentationRetireRoot = (root: THREE.Object3D) => void;

function material(color: number, options: { emissive?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: options.emissive ?? 0,
    emissiveIntensity: options.emissive ? 0.55 : 0,
    roughness: 0.45,
    metalness: 0.42,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
}

function mesh(geometry: THREE.BufferGeometry, colour: number, name: string): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material(colour));
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function buildChopper(): PresentedEntity {
  const root = new THREE.Group();
  root.name = 'pass65-chopper-gunner';
  root.userData.pass65KillstreakPresentation = true;
  const fuselage = mesh(new THREE.CapsuleGeometry(0.72, 2.1, 6, 12), 0x18262b, 'chopper-fuselage');
  fuselage.rotation.x = Math.PI / 2;
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.67, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    material(0x316b77, { emissive: 0x0a2932, transparent: true, opacity: 0.82 }),
  );
  canopy.name = 'chopper-sleek-cockpit-canopy';
  canopy.position.set(0, 0.2, -0.98);
  canopy.scale.set(0.88, 0.78, 1.1);
  const glareshield = mesh(new THREE.BoxGeometry(0.76, 0.09, 0.43), 0x071012, 'chopper-cockpit-glareshield');
  glareshield.position.set(0, 0.04, -0.92);
  const tail = mesh(new THREE.BoxGeometry(0.18, 0.18, 2.25), 0x263a3f, 'chopper-tail-boom');
  tail.position.z = 1.95;
  const fin = mesh(new THREE.BoxGeometry(0.08, 0.75, 0.55), 0xe0b94f, 'chopper-tail-fin');
  fin.position.set(0, 0.35, 3.03);
  const gun = mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.95, 10), 0x0b1012, 'chopper-player-gun');
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, -0.58, -0.72);
  const rotor = new THREE.Group();
  rotor.name = 'chopper-main-rotor';
  rotor.position.y = 0.85;
  const hub = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8), 0xa9bbb5, 'chopper-rotor-hub');
  const bladeA = mesh(new THREE.BoxGeometry(5.6, 0.035, 0.13), 0x121a1d, 'chopper-rotor-blade-a');
  const bladeB = mesh(new THREE.BoxGeometry(0.13, 0.035, 5.6), 0x121a1d, 'chopper-rotor-blade-b');
  rotor.add(hub, bladeA, bladeB);
  const skids = [-1, 1].map((side) => {
    const skid = mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.15, 6), 0x778580, `chopper-skid-${side}`);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(side * 0.58, -0.67, 0.15);
    return skid;
  });
  root.add(fuselage, canopy, glareshield, tail, fin, gun, rotor, ...skids);
  root.scale.setScalar(0.82);
  return Object.freeze({ root, rotor, target: new THREE.Vector3() });
}

function buildCareAircraft(): PresentedEntity {
  const root = new THREE.Group();
  root.name = 'pass65-care-package-aircraft';
  root.userData.pass65KillstreakPresentation = true;
  const fuselage = mesh(new THREE.CapsuleGeometry(0.52, 3.6, 6, 12), 0x34464a, 'care-aircraft-fuselage');
  fuselage.rotation.x = Math.PI / 2;
  const nose = mesh(new THREE.SphereGeometry(0.49, 12, 8), 0x64787a, 'care-aircraft-nose');
  nose.scale.set(0.86, 0.74, 1.18);
  nose.position.z = -2.05;
  const wing = mesh(new THREE.BoxGeometry(5.8, 0.11, 1.05), 0x26383c, 'care-aircraft-main-wing');
  wing.position.z = 0.1;
  const tailWing = mesh(new THREE.BoxGeometry(2.2, 0.08, 0.52), 0x26383c, 'care-aircraft-tail-wing');
  tailWing.position.z = 2.05;
  const tailFin = mesh(new THREE.BoxGeometry(0.1, 0.82, 0.72), 0xd5b84d, 'care-aircraft-tail-fin');
  tailFin.position.set(0, 0.42, 2.15);
  const cargoLight = mesh(new THREE.SphereGeometry(0.08, 8, 6), 0x7fe6e0, 'care-aircraft-cargo-light');
  cargoLight.position.set(0, -0.45, -0.15);
  root.add(fuselage, nose, wing, tailWing, tailFin, cargoLight);
  root.scale.setScalar(0.9);
  return Object.freeze({ root, rotor: null, target: new THREE.Vector3() });
}

function buildDrone(mode: 'piloted' | 'swarm' | null): PresentedEntity {
  const root = new THREE.Group();
  root.name = mode === 'piloted' ? 'pass65-piloted-drone' : 'pass65-swarm-drone';
  root.userData.pass65KillstreakPresentation = true;
  const body = mesh(new THREE.SphereGeometry(mode === 'piloted' ? 0.34 : 0.24, 10, 7), mode === 'piloted' ? 0x2f707c : 0x28383d, 'drone-body');
  body.scale.set(1.2, 0.45, 1);
  const eye = mesh(new THREE.SphereGeometry(0.08, 8, 6), 0xff5f4b, 'drone-optic');
  eye.position.z = -0.29;
  const rotor = new THREE.Group();
  rotor.name = 'drone-rotors';
  for (const x of [-0.42, 0.42]) for (const z of [-0.34, 0.34]) {
    const arm = mesh(new THREE.BoxGeometry(0.5, 0.035, 0.04), 0x172126, 'drone-arm');
    arm.position.set(x * 0.55, 0, z * 0.55);
    arm.rotation.y = Math.atan2(z, x);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.014, 12), material(0x0d1417, { transparent: true, opacity: 0.72 }));
    disc.name = 'drone-rotor-disc';
    disc.position.set(x, 0.08, z);
    rotor.add(arm, disc);
  }
  root.add(body, eye, rotor);
  return Object.freeze({ root, rotor, target: new THREE.Vector3() });
}

function buildCareCrate(): PresentedEntity {
  const root = new THREE.Group();
  root.name = 'pass65-care-package';
  root.userData.pass65KillstreakPresentation = true;
  const crate = mesh(new THREE.BoxGeometry(1.05, 0.75, 1.05), 0x4e604d, 'care-package-crate');
  const straps = mesh(new THREE.BoxGeometry(1.1, 0.79, 0.12), 0xe0b94f, 'care-package-straps');
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), material(0xd7dad0, { transparent: true, opacity: 0.82 }));
  canopy.name = 'care-package-parachute';
  canopy.position.y = 2.4;
  canopy.scale.y = 0.45;
  root.add(crate, straps, canopy);
  return Object.freeze({ root, rotor: canopy, target: new THREE.Vector3() });
}

function createPresentedEntity(entity: KillstreakEntitySnapshot): PresentedEntity {
  if (entity.kind === 'aircraft') return buildCareAircraft();
  if (entity.kind === 'chopper') return buildChopper();
  if (entity.kind === 'drone') return buildDrone(entity.mode);
  return buildCareCrate();
}

function buildDroneSensorSilhouette(index: number): THREE.Group {
  const root = new THREE.Group();
  root.name = `piloted-drone-hostile-sensor-${index + 1}`;
  root.userData.presentationOnly = true;
  const sensorMaterial = new THREE.MeshBasicMaterial({
    name: 'piloted-drone-hostile-through-wall',
    color: 0xff674f,
    transparent: true,
    opacity: 0.62,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const part = (name: string, geometry: THREE.BufferGeometry, position: readonly [number, number, number]) => {
    const result = new THREE.Mesh(geometry, sensorMaterial);
    result.name = name;
    result.position.set(...position);
    result.renderOrder = 90;
    root.add(result);
  };
  part('drone-sensor-head', new THREE.SphereGeometry(0.2, 9, 6), [0, 0.68, 0]);
  part('drone-sensor-torso', new THREE.CapsuleGeometry(0.27, 0.48, 3, 8), [0, 0.18, 0]);
  part('drone-sensor-leg-left', new THREE.CapsuleGeometry(0.1, 0.56, 2, 6), [-0.14, -0.51, 0]);
  part('drone-sensor-leg-right', new THREE.CapsuleGeometry(0.1, 0.56, 2, 6), [0.14, -0.51, 0]);
  root.visible = false;
  return root;
}

function disposeRoot(root: THREE.Object3D): void {
  root.removeFromParent();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const entry of materials) entry.dispose();
  });
}

export class KillstreakPresentation {
  readonly root = new THREE.Group();
  private readonly entities = new Map<string, PresentedEntity>();
  private readonly impactFlashes: Array<{ root: THREE.Mesh; expiresAt: number }> = [];
  private readonly prewarmed: PresentedEntity[];
  private readonly sensorRoot = new THREE.Group();
  private readonly sensorSilhouettes: THREE.Group[];
  private visibleSensorContacts = 0;

  constructor(
    scene: THREE.Scene,
    private readonly retireRoot: KillstreakPresentationRetireRoot = disposeRoot,
  ) {
    this.root.name = 'pass65-killstreak-presentations';
    this.root.userData.presentationOnly = true;
    scene.add(this.root);
    // Keep one instance of every material/geometry vocabulary resident so the
    // first earned streak does not discover shaders on a live combat frame.
    this.prewarmed = [buildChopper(), buildCareAircraft(), buildDrone('piloted'), buildDrone('swarm'), buildCareCrate()];
    for (const entry of this.prewarmed) {
      entry.root.name = `prewarmed-${entry.root.name}`;
      entry.root.userData.prewarmed = true;
      entry.root.scale.setScalar(0.0001);
      this.root.add(entry.root);
    }
    this.sensorRoot.name = 'piloted-drone-through-wall-sensor';
    this.sensorRoot.userData.presentationOnly = true;
    this.sensorSilhouettes = Array.from({ length: MAX_SENSOR_CONTACTS }, (_, index) => buildDroneSensorSilhouette(index));
    this.sensorRoot.add(...this.sensorSilhouettes);
    this.root.add(this.sensorRoot);
  }

  sync(snapshot: KillstreakRecipientSnapshot, nowMs: number): void {
    const admitted = snapshot.entities.slice(0, MAX_PRESENTED_ENTITIES);
    const liveIds = new Set(admitted.map((entity) => entity.id));
    for (const [id, presented] of this.entities) {
      if (liveIds.has(id)) continue;
      this.retireRoot(presented.root);
      this.entities.delete(id);
    }
    for (const entity of admitted) {
      let presented = this.entities.get(entity.id);
      if (!presented) {
        presented = createPresentedEntity(entity);
        this.entities.set(entity.id, presented);
        this.root.add(presented.root);
        presented.root.position.fromArray(entity.position);
      }
      presented.target.fromArray(entity.position);
      presented.root.position.lerp(presented.target, 0.38);
      presented.root.rotation.set(entity.attitude[0], entity.attitude[1], entity.attitude[2], 'YXZ');
      if (presented.rotor) presented.rotor.rotation.y += entity.kind === 'chopper' ? 0.72 : 1.1;
      const canopy = presented.root.getObjectByName('care-package-parachute');
      if (canopy) canopy.visible = entity.phase === 'inbound' || entity.phase === 'descending';
      presented.root.userData.health = entity.health;
      presented.root.userData.phase = entity.phase;
      presented.root.userData.gunController = entity.gunController;
    }
    this.syncSensorContacts(snapshot.sensorContacts);
    for (let index = this.impactFlashes.length - 1; index >= 0; index -= 1) {
      const flash = this.impactFlashes[index];
      const remaining = THREE.MathUtils.clamp((flash.expiresAt - nowMs) / 420, 0, 1);
      flash.root.scale.setScalar(1 + (1 - remaining) * 2.8);
      (flash.root.material as THREE.MeshBasicMaterial).opacity = remaining * 0.8;
      if (remaining > 0) continue;
      this.retireRoot(flash.root);
      this.impactFlashes.splice(index, 1);
    }
  }

  private syncSensorContacts(contacts: readonly DroneSensorContact[]): void {
    const admitted = contacts.slice(0, MAX_SENSOR_CONTACTS);
    this.visibleSensorContacts = admitted.length;
    for (const [index, silhouette] of this.sensorSilhouettes.entries()) {
      const contact = admitted[index];
      silhouette.visible = contact !== undefined;
      if (!contact) continue;
      silhouette.position.fromArray(contact.position);
      silhouette.userData.contactId = contact.id;
      silhouette.userData.contactLifeId = contact.lifeId;
      silhouette.userData.relation = contact.relation;
      silhouette.userData.throughWall = contact.throughWall;
    }
  }

  presentImpacts(impacts: readonly KillstreakImpactEvent[], nowMs: number): void {
    for (const impact of impacts.slice(0, Math.max(0, MAX_IMPACT_FLASHES - this.impactFlashes.length))) {
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 10, 7),
        new THREE.MeshBasicMaterial({ color: 0xffb14c, transparent: true, opacity: 0.8, depthWrite: false }),
      );
      flash.name = 'pass65-carpet-impact-flash';
      flash.position.fromArray(impact.position);
      flash.position.y += 0.35;
      this.root.add(flash);
      this.impactFlashes.push({ root: flash, expiresAt: nowMs + 420 });
    }
  }

  entityRoot(id: string): THREE.Group | null {
    return this.entities.get(id)?.root ?? null;
  }

  telemetry(): Readonly<{ entities: number; impactFlashes: number; sensorContacts: number; bounded: boolean }> {
    return Object.freeze({
      entities: this.entities.size,
      impactFlashes: this.impactFlashes.length,
      sensorContacts: this.visibleSensorContacts,
      bounded: this.entities.size <= MAX_PRESENTED_ENTITIES
        && this.impactFlashes.length <= MAX_IMPACT_FLASHES
        && this.visibleSensorContacts <= MAX_SENSOR_CONTACTS,
    });
  }

  clear(): void {
    for (const presented of this.entities.values()) this.retireRoot(presented.root);
    this.entities.clear();
    for (const flash of this.impactFlashes) this.retireRoot(flash.root);
    this.impactFlashes.length = 0;
    this.visibleSensorContacts = 0;
    for (const silhouette of this.sensorSilhouettes) silhouette.visible = false;
  }

  dispose(): void {
    this.clear();
    for (const entry of this.prewarmed) this.retireRoot(entry.root);
    this.retireRoot(this.sensorRoot);
    this.root.removeFromParent();
  }
}
