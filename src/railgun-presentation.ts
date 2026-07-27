import * as THREE from 'three';
import { buildWeaponModel } from './art-kit';
import {
  RAILGUN_BEAM_LENGTH_M,
  isRailgunBeamAuthority,
  type RailgunAuthorityState,
  type RailgunBeamAuthority,
  type RailgunShotResultMessage,
} from './railgun-authority';
import { createPass65WeaponModel, loadPass65WeaponAsset } from './weapon-model';

export type RailgunThermalContact = Readonly<{
  id: string;
  kind: 'player' | 'bot';
  position: THREE.Vector3;
}>;

export const RAILGUN_BOLT_PRESENTATION = Object.freeze({
  minimumLengthM: RAILGUN_BEAM_LENGTH_M,
  visibleDurationMs: 900,
  coreRadiusM: 0.32,
  haloRadiusM: 1,
  shooterCoreRadiusM: 0.045,
  shooterHaloRadiusM: 0.15,
  shooterStartOffsetM: 2.4,
  poolCapacity: 6,
});

type RailgunBeamViewer = 'shooter' | 'peer';

export class RailgunPresentation {
  readonly root = new THREE.Group();
  private readonly weapon: THREE.Group;
  private readonly thermalRoot: HTMLElement;
  private readonly thermalWorldRoot = new THREE.Group();
  private readonly thermalWorldContacts: THREE.Group[] = [];
  private readonly thermalDomContacts: HTMLElement[] = [];
  private readonly beamRoot = new THREE.Group();
  private readonly beams: Array<{
    root: THREE.Group;
    core: THREE.Mesh;
    bloom: THREE.Mesh;
    expiresAt: number;
    authorityKey: string | null;
    viewer: RailgunBeamViewer;
  }> = [];
  private readonly acceptedBeamKeys = new Set<string>();
  private beamCursor = 0;
  private beamPresentations = 0;
  private lastBeamLengthM = 0;
  private lastAcceptedBeam: RailgunBeamAuthority | null = null;
  private lastPresentationStartOffsetM = 0;
  private lastViewer: RailgunBeamViewer = 'peer';
  private visibleThermalContacts = 0;
  private weaponLoad: Promise<void> | null = null;
  private weaponLoadAttempts = 0;
  private weaponLoadRetryAt = 0;
  private readonly flattenMaterials: boolean;

  constructor(scene: THREE.Scene, thermalRoot: HTMLElement, flattenMaterials: boolean) {
    this.thermalRoot = thermalRoot;
    this.flattenMaterials = flattenMaterials;
    this.root.name = 'railgun-world-pickup';
    this.root.userData.presentationOnly = true;
    this.root.userData.weapon = 'railgun';

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.78, 0.12, 24),
      flattenMaterials
        ? new THREE.MeshBasicMaterial({ color: 0x163f49 })
        : new THREE.MeshStandardMaterial({ color: 0x163f49, emissive: 0x0a6675, emissiveIntensity: 1.35, metalness: 0.72, roughness: 0.28 }),
    );
    pedestal.name = 'railgun-pickup-pedestal';
    pedestal.position.y = -0.42;
    this.root.add(pedestal);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.028, 10, 36),
      new THREE.MeshBasicMaterial({ color: 0x73f6ff, transparent: true, opacity: 0.82, depthWrite: false, toneMapped: false }),
    );
    halo.name = 'railgun-pickup-halo';
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.3;
    this.root.add(halo);

    this.weapon = new THREE.Group();
    this.weapon.name = 'railgun-world-weapon';
    this.weapon.scale.setScalar(0.58);
    this.weapon.rotation.set(0.08, Math.PI / 2, -0.08);
    if (typeof window === 'undefined') {
      const fallback = buildWeaponModel('railgun', flattenMaterials, false);
      this.weapon.userData.weaponModelId = fallback.userData.weaponModelId;
      this.weapon.add(fallback);
    }
    this.root.add(this.weapon);
    this.root.visible = false;
    this.thermalWorldRoot.name = 'railgun-through-wall-silhouettes';
    this.thermalWorldRoot.userData.presentationOnly = true;
    this.thermalWorldRoot.visible = false;
    this.beamRoot.name = 'railgun-replicated-beams';
    this.beamRoot.userData.presentationOnly = true;
    for (let index = 0; index < RAILGUN_BOLT_PRESENTATION.poolCapacity; index += 1) {
      const beam = new THREE.Group();
      beam.name = `railgun-massive-beam-${index + 1}`;
      beam.visible = false;
      beam.userData.presentationOnly = true;
      const geometry = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
      const core = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xc9fbff,
        transparent: true,
        opacity: 0.94,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      const bloom = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0x25cfff,
        transparent: true,
        opacity: 0.38,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      core.name = 'railgun-beam-core';
      bloom.name = 'railgun-beam-bloom';
      core.renderOrder = 18;
      bloom.renderOrder = 17;
      core.frustumCulled = false;
      bloom.frustumCulled = false;
      beam.add(core, bloom);
      this.beamRoot.add(beam);
      this.beams.push({ root: beam, core, bloom, expiresAt: 0, authorityKey: null, viewer: 'peer' });
    }
    scene.add(this.root, this.thermalWorldRoot, this.beamRoot);
  }

  updateWorld(state: RailgunAuthorityState, now: number): void {
    this.updateBeams(now);
    this.root.visible = state.status === 'available' && state.pickupPosition !== null;
    if (!this.root.visible || !state.pickupPosition) return;
    this.ensureAuthoredWeapon(now);
    this.root.position.set(...state.pickupPosition);
    this.root.position.y += 0.28 + Math.sin(now * 0.0032) * 0.07;
    this.root.rotation.y = now * 0.00055;
  }

  private ensureAuthoredWeapon(now: number): void {
    if (this.weapon.children.length > 0 || this.weaponLoad
      || this.weaponLoadAttempts >= 3 || now < this.weaponLoadRetryAt) return;
    this.weaponLoadAttempts += 1;
    this.weaponLoad = loadPass65WeaponAsset('railgun', 'world').then(() => {
      const authored = createPass65WeaponModel('railgun', this.flattenMaterials, 'world');
      if (!authored) throw new Error('Pass 65 authored railgun pickup model unavailable after load');
      authored.name = 'railgun-world-authored-visual';
      this.weapon.add(authored);
      this.weapon.userData.weaponModelId = authored.userData.weaponModelId;
      this.weapon.userData.projectOriginalWeapon = true;
    }).catch((error: unknown) => {
      this.weaponLoadRetryAt = now + 5_000 * this.weaponLoadAttempts;
      this.root.userData.pass65RailgunWorldLoadError = error instanceof Error ? error.message : String(error);
      console.error('Pass 65 authored railgun pickup load failed', error);
    }).finally(() => {
      this.weaponLoad = null;
    });
  }

  /** The only beam admission hook: a host-accepted result with canonical endpoints. */
  presentAcceptedResult(result: RailgunShotResultMessage, now: number, viewer: RailgunBeamViewer = 'peer'): boolean {
    const authority = result.beam;
    if (result.status === 'rejected' || result.reason !== 'accepted' || !isRailgunBeamAuthority(authority)
      || authority.generation !== result.generation || authority.shotId !== result.shotId) return false;
    const authorityKey = `${authority.generation}:${authority.shotId}`;
    if (this.acceptedBeamKeys.has(authorityKey)) return false;
    const start = new THREE.Vector3(...authority.start);
    const end = new THREE.Vector3(...authority.end);
    const authoritativeDelta = end.clone().sub(start);
    const length = authoritativeDelta.length();
    if (!Number.isFinite(length) || Math.abs(length - RAILGUN_BEAM_LENGTH_M) > 1e-4) return false;
    this.acceptedBeamKeys.add(authorityKey);
    while (this.acceptedBeamKeys.size > 128) this.acceptedBeamKeys.delete(this.acceptedBeamKeys.values().next().value!);
    const beam = this.beams[this.beamCursor++ % this.beams.length];
    const direction = authoritativeDelta.clone().normalize();
    const startOffsetM = viewer === 'shooter' ? RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM : 0;
    const presentationStart = start.clone().addScaledVector(direction, startOffsetM);
    const presentationDelta = end.clone().sub(presentationStart);
    const presentationLength = presentationDelta.length();
    beam.root.position.copy(presentationStart).addScaledVector(presentationDelta, 0.5);
    beam.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    const coreRadius = viewer === 'shooter'
      ? RAILGUN_BOLT_PRESENTATION.shooterCoreRadiusM
      : RAILGUN_BOLT_PRESENTATION.coreRadiusM;
    const haloRadius = viewer === 'shooter'
      ? RAILGUN_BOLT_PRESENTATION.shooterHaloRadiusM
      : RAILGUN_BOLT_PRESENTATION.haloRadiusM;
    beam.core.scale.set(coreRadius, presentationLength, coreRadius);
    beam.bloom.scale.set(haloRadius, presentationLength, haloRadius);
    // The camera starts outside the open tube. Rendering its back faces turns
    // the near circular wall into a cyan tunnel that fills the shooter view.
    (beam.core.material as THREE.MeshBasicMaterial).side = THREE.FrontSide;
    (beam.bloom.material as THREE.MeshBasicMaterial).side = THREE.FrontSide;
    beam.root.visible = true;
    beam.expiresAt = now + RAILGUN_BOLT_PRESENTATION.visibleDurationMs;
    beam.authorityKey = authorityKey;
    beam.viewer = viewer;
    beam.root.userData.authorityKey = authorityKey;
    beam.root.userData.authoritativeStart = [...authority.start];
    beam.root.userData.authoritativeEnd = [...authority.end];
    beam.root.userData.presentationStartOffsetM = startOffsetM;
    beam.root.userData.presentationCoreRadiusM = coreRadius;
    beam.root.userData.presentationHaloRadiusM = haloRadius;
    beam.root.userData.viewer = viewer;
    this.beamPresentations += 1;
    this.lastBeamLengthM = length;
    this.lastPresentationStartOffsetM = startOffsetM;
    this.lastViewer = viewer;
    this.lastAcceptedBeam = Object.freeze({
      generation: authority.generation,
      shotId: authority.shotId,
      start: Object.freeze([...authority.start]) as unknown as readonly [number, number, number],
      end: Object.freeze([...authority.end]) as unknown as readonly [number, number, number],
    });
    return true;
  }

  private updateBeams(now: number): void {
    for (const beam of this.beams) {
      if (!beam.root.visible) continue;
      const remaining = beam.expiresAt - now;
      if (remaining <= 0) {
        beam.root.visible = false;
        beam.authorityKey = null;
        continue;
      }
      const fade = THREE.MathUtils.clamp(remaining / RAILGUN_BOLT_PRESENTATION.visibleDurationMs, 0, 1);
      const attack = THREE.MathUtils.smoothstep(1 - fade, 0, 0.08);
      (beam.core.material as THREE.MeshBasicMaterial).opacity = 0.94 * fade * attack;
      (beam.bloom.material as THREE.MeshBasicMaterial).opacity = 0.38 * Math.sqrt(fade) * attack;
    }
  }

  private createThermalSilhouette(index: number): THREE.Group {
    const group = new THREE.Group();
    group.name = `railgun-thermal-silhouette-${index + 1}`;
    group.userData.presentationOnly = true;
    const material = new THREE.MeshBasicMaterial({
      color: 0x2bdcff,
      transparent: true,
      opacity: 0.74,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const part = (name: string, geometry: THREE.BufferGeometry, position: [number, number, number], rotationZ = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(...position);
      mesh.rotation.z = rotationZ;
      mesh.renderOrder = 10;
      mesh.raycast = () => undefined;
      group.add(mesh);
    };
    part('thermal-head', new THREE.SphereGeometry(0.2, 10, 7), [0, 0.68, 0]);
    part('thermal-torso', new THREE.CapsuleGeometry(0.27, 0.48, 3, 8), [0, 0.18, 0]);
    part('thermal-arm-left', new THREE.CapsuleGeometry(0.09, 0.48, 2, 6), [-0.3, 0.18, 0], -0.18);
    part('thermal-arm-right', new THREE.CapsuleGeometry(0.09, 0.48, 2, 6), [0.3, 0.18, 0], 0.18);
    part('thermal-leg-left', new THREE.CapsuleGeometry(0.11, 0.58, 2, 6), [-0.14, -0.53, 0], 0.05);
    part('thermal-leg-right', new THREE.CapsuleGeometry(0.11, 0.58, 2, 6), [0.14, -0.53, 0], -0.05);
    group.visible = false;
    this.thermalWorldRoot.add(group);
    return group;
  }

  private thermalDomContact(index: number): HTMLElement {
    const existing = this.thermalDomContacts[index];
    if (existing) return existing;
    const marker = document.createElement('i');
    this.thermalDomContacts.push(marker);
    this.thermalRoot.append(marker);
    return marker;
  }

  updateThermal(camera: THREE.Camera, contacts: readonly RailgunThermalContact[], active: boolean): void {
    this.thermalRoot.hidden = !active;
    this.thermalWorldRoot.visible = active;
    this.visibleThermalContacts = 0;
    for (const marker of this.thermalDomContacts) marker.hidden = true;
    for (const silhouette of this.thermalWorldContacts) silhouette.visible = false;
    if (!active) return;
    for (const [index, contact] of contacts.entries()) {
      const silhouette = this.thermalWorldContacts[index] ?? this.createThermalSilhouette(index);
      if (!this.thermalWorldContacts[index]) this.thermalWorldContacts[index] = silhouette;
      silhouette.visible = true;
      silhouette.position.copy(contact.position);
      silhouette.userData.contactId = contact.id;
      silhouette.userData.contactKind = contact.kind;
      silhouette.scale.setScalar(contact.kind === 'bot' ? 0.96 : 1);
      silhouette.traverse((node) => {
        if (node instanceof THREE.Mesh) (node.material as THREE.MeshBasicMaterial).opacity = contact.kind === 'bot' ? 0.37 : 0.74;
      });
      const projected = contact.position.clone().project(camera);
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.18 || Math.abs(projected.y) > 1.18) continue;
      const marker = this.thermalDomContact(index);
      marker.hidden = false;
      marker.className = `thermal-contact ${contact.kind}`;
      marker.dataset.contactKind = contact.kind;
      marker.style.left = `${(projected.x * 0.5 + 0.5) * 100}%`;
      marker.style.top = `${(-projected.y * 0.5 + 0.5) * 100}%`;
      const distance = Math.max(2, camera.position.distanceTo(contact.position));
      marker.style.setProperty('--thermal-scale', String(THREE.MathUtils.clamp(18 / distance, 0.42, 1.35)));
      this.visibleThermalContacts += 1;
    }
  }

  telemetry(): Readonly<{
    worldVisible: boolean;
    thermalActive: boolean;
    thermalContacts: number;
    worldSilhouettes: number;
    activeBeams: number;
    beamPresentations: number;
    lastBeamLengthM: number;
    visibleDurationMs: number;
    coreRadiusM: number;
    haloRadiusM: number;
    shooterCoreRadiusM: number;
    shooterHaloRadiusM: number;
    poolCapacity: number;
    throughGeometry: boolean;
    openEnded: boolean;
    lastPresentationStartOffsetM: number;
    lastViewer: RailgunBeamViewer;
    lastAcceptedBeam: Readonly<{
      generation: number;
      shotId: string;
      start: readonly [number, number, number];
      end: readonly [number, number, number];
      lengthM: number;
    }> | null;
    modelId: string;
    authoredWorldModel: boolean;
  }> {
    const throughGeometry = this.beams.every(({ core, bloom }) => {
      const coreMaterial = core.material as THREE.MeshBasicMaterial;
      const bloomMaterial = bloom.material as THREE.MeshBasicMaterial;
      return coreMaterial.depthTest === false && coreMaterial.depthWrite === false
        && bloomMaterial.depthTest === false && bloomMaterial.depthWrite === false;
    });
    const openEnded = this.beams.every(({ core, bloom }) => (
      (core.geometry as THREE.CylinderGeometry).parameters.openEnded === true
      && (bloom.geometry as THREE.CylinderGeometry).parameters.openEnded === true
    ));
    return {
      worldVisible: this.root.visible,
      thermalActive: !this.thermalRoot.hidden,
      thermalContacts: this.visibleThermalContacts,
      worldSilhouettes: this.thermalWorldContacts.filter((contact) => contact.visible).length,
      activeBeams: this.beams.filter((beam) => beam.root.visible).length,
      beamPresentations: this.beamPresentations,
      lastBeamLengthM: this.lastBeamLengthM,
      visibleDurationMs: RAILGUN_BOLT_PRESENTATION.visibleDurationMs,
      coreRadiusM: RAILGUN_BOLT_PRESENTATION.coreRadiusM,
      haloRadiusM: RAILGUN_BOLT_PRESENTATION.haloRadiusM,
      shooterCoreRadiusM: RAILGUN_BOLT_PRESENTATION.shooterCoreRadiusM,
      shooterHaloRadiusM: RAILGUN_BOLT_PRESENTATION.shooterHaloRadiusM,
      poolCapacity: this.beams.length,
      throughGeometry,
      openEnded,
      lastPresentationStartOffsetM: this.lastPresentationStartOffsetM,
      lastViewer: this.lastViewer,
      lastAcceptedBeam: this.lastAcceptedBeam ? Object.freeze({
        generation: this.lastAcceptedBeam.generation,
        shotId: this.lastAcceptedBeam.shotId,
        start: Object.freeze([...this.lastAcceptedBeam.start]) as unknown as readonly [number, number, number],
        end: Object.freeze([...this.lastAcceptedBeam.end]) as unknown as readonly [number, number, number],
        lengthM: this.lastBeamLengthM,
      }) : null,
      modelId: String(this.weapon.userData.weaponModelId ?? 'railgun-authored-v1'),
      authoredWorldModel: this.weapon.userData.projectOriginalWeapon === true,
    };
  }

  resetBeams(): void {
    for (const beam of this.beams) {
      beam.root.visible = false;
      beam.expiresAt = 0;
      beam.authorityKey = null;
    }
    this.acceptedBeamKeys.clear();
    this.beamCursor = 0;
    this.beamPresentations = 0;
    this.lastBeamLengthM = 0;
    this.lastAcceptedBeam = null;
    this.lastPresentationStartOffsetM = 0;
    this.lastViewer = 'peer';
  }
}
