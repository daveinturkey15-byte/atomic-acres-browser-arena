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
import type { ThermalGhostTelemetry } from './thermal-ghost-presentation';

export type RailgunThermalContact = Readonly<{
  id: string;
  kind: 'player' | 'bot';
  position: THREE.Vector3;
}>;

export const RAILGUN_BOLT_PRESENTATION = Object.freeze({
  minimumLengthM: RAILGUN_BEAM_LENGTH_M,
  visibleDurationMs: 1_000,
  coreRadiusM: 0.32,
  haloRadiusM: 1,
  shockRadiusM: 1.6,
  filamentRadiusM: 0.075,
  filamentOrbitRadiusM: 0.44,
  filamentCount: 3,
  shooterCoreRadiusM: 0.32,
  shooterHaloRadiusM: 1,
  shooterStartOffsetM: 2.4,
  shooterLaunchOffsetM: 0.72,
  launchDurationMs: 280,
  launchCoreRadiusM: 0.2,
  launchCoronaRadiusM: 0.52,
  launchRingRadiusM: 0.78,
  launchBridgeRadiusM: 0.14,
  launchSparkCount: 6,
  poolCapacity: 6,
});

type RailgunBeamViewer = 'shooter' | 'peer';

export class RailgunPresentation {
  readonly root = new THREE.Group();
  private readonly weapon: THREE.Group;
  private readonly thermalRoot: HTMLElement;
  private readonly beamRoot = new THREE.Group();
  private readonly beams: Array<{
    root: THREE.Group;
    core: THREE.Mesh;
    bloom: THREE.Mesh;
    shock: THREE.Mesh;
    filamentRoot: THREE.Group;
    filaments: THREE.Mesh[];
    launchRoot: THREE.Group;
    launchCore: THREE.Mesh;
    launchCorona: THREE.Mesh;
    launchRing: THREE.Mesh;
    launchBridge: THREE.Mesh;
    launchSparks: THREE.Mesh[];
    startsAt: number;
    expiresAt: number;
    authorityKey: string | null;
    viewer: RailgunBeamViewer;
  }> = [];
  private readonly acceptedBeamKeys = new Set<string>();
  private beamCursor = 0;
  private beamPresentations = 0;
  private lastBeamLengthM = 0;
  private lastAcceptedBeam: RailgunBeamAuthority | null = null;
  private lastAcceptedOutcomes: RailgunShotResultMessage['outcomes'] = [];
  private lastPresentationStartOffsetM = 0;
  private lastViewer: RailgunBeamViewer = 'peer';
  private visibleThermalContacts = 0;
  private exactOperatorModels = 0;
  private exactOperatorHalos = 0;
  private exactOperatorThroughGeometry = false;
  private exactOperatorGeometryIdentity = false;
  private exactOperatorSkeletonIdentity = false;
  private exactOperatorOrangeHalo = false;
  private exactOperatorComplete = false;
  private exactOperatorMaterialBudgetExceeded = false;
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
    this.beamRoot.name = 'railgun-replicated-beams';
    this.beamRoot.userData.presentationOnly = true;
    const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    const launchSphereGeometry = new THREE.IcosahedronGeometry(1, 2);
    const launchRingGeometry = new THREE.TorusGeometry(1, 0.055, 8, 36);
    const launchBridgeGeometry = new THREE.ConeGeometry(1, 1, 16, 1, true);
    const launchSparkGeometry = new THREE.ConeGeometry(1, 1, 7, 1, true);
    for (let index = 0; index < RAILGUN_BOLT_PRESENTATION.poolCapacity; index += 1) {
      const beam = new THREE.Group();
      beam.name = `railgun-massive-beam-${index + 1}`;
      beam.visible = false;
      beam.userData.presentationOnly = true;
      const core = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({
        color: 0xc9fbff,
        transparent: true,
        opacity: 0.94,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      const bloom = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({
        color: 0x25cfff,
        transparent: true,
        opacity: 0.38,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      const shock = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({
        color: 0x7f5cff,
        transparent: true,
        opacity: 0.14,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      const filamentRoot = new THREE.Group();
      const filaments = Array.from({ length: RAILGUN_BOLT_PRESENTATION.filamentCount }, (_, filamentIndex) => {
        const filament = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({
          color: filamentIndex === 1 ? 0xffffff : 0x49e8ff,
          transparent: true,
          opacity: 0.72,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }));
        const phase = filamentIndex / RAILGUN_BOLT_PRESENTATION.filamentCount * Math.PI * 2;
        filament.position.set(
          Math.cos(phase) * RAILGUN_BOLT_PRESENTATION.filamentOrbitRadiusM,
          0,
          Math.sin(phase) * RAILGUN_BOLT_PRESENTATION.filamentOrbitRadiusM,
        );
        filament.name = `railgun-beam-filament-${filamentIndex + 1}`;
        filament.renderOrder = 20;
        filament.frustumCulled = false;
        filamentRoot.add(filament);
        return filament;
      });
      const launchRoot = new THREE.Group();
      launchRoot.name = 'railgun-launch-origin';
      const additiveMaterial = (color: number, opacity: number) => new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const launchCore = new THREE.Mesh(launchSphereGeometry, additiveMaterial(0xf2feff, 0.98));
      const launchCorona = new THREE.Mesh(launchSphereGeometry, additiveMaterial(0x39dcff, 0.5));
      const launchRing = new THREE.Mesh(launchRingGeometry, additiveMaterial(0x94f8ff, 0.76));
      const launchBridge = new THREE.Mesh(launchBridgeGeometry, additiveMaterial(0xbafaff, 0.68));
      const launchSparks = Array.from({ length: RAILGUN_BOLT_PRESENTATION.launchSparkCount }, (_, sparkIndex) => {
        const spark = new THREE.Mesh(
          launchSparkGeometry,
          additiveMaterial(sparkIndex % 2 === 0 ? 0xffffff : 0x48e7ff, 0.72),
        );
        const phase = sparkIndex / RAILGUN_BOLT_PRESENTATION.launchSparkCount * Math.PI * 2;
        spark.position.set(Math.cos(phase) * 0.24, 0.18, Math.sin(phase) * 0.24);
        spark.rotation.x = Math.sin(phase) * 0.34;
        spark.rotation.z = -Math.cos(phase) * 0.34;
        spark.name = `railgun-launch-spark-${sparkIndex + 1}`;
        spark.renderOrder = 24;
        spark.frustumCulled = false;
        launchRoot.add(spark);
        return spark;
      });
      launchCore.name = 'railgun-launch-core';
      launchCorona.name = 'railgun-launch-corona';
      launchRing.name = 'railgun-launch-shock-ring';
      launchBridge.name = 'railgun-launch-bridge';
      launchRing.rotation.x = Math.PI / 2;
      launchCore.renderOrder = 25;
      launchCorona.renderOrder = 23;
      launchRing.renderOrder = 22;
      launchBridge.renderOrder = 21;
      launchCore.frustumCulled = false;
      launchCorona.frustumCulled = false;
      launchRing.frustumCulled = false;
      launchBridge.frustumCulled = false;
      launchRoot.add(launchCorona, launchCore, launchRing, launchBridge);
      core.name = 'railgun-beam-core';
      bloom.name = 'railgun-beam-bloom';
      shock.name = 'railgun-beam-shock-sheath';
      filamentRoot.name = 'railgun-beam-energy-filaments';
      core.renderOrder = 18;
      bloom.renderOrder = 17;
      shock.renderOrder = 16;
      core.frustumCulled = false;
      bloom.frustumCulled = false;
      shock.frustumCulled = false;
      beam.add(shock, bloom, core, filamentRoot, launchRoot);
      this.beamRoot.add(beam);
      this.beams.push({
        root: beam,
        core,
        bloom,
        shock,
        filamentRoot,
        filaments,
        launchRoot,
        launchCore,
        launchCorona,
        launchRing,
        launchBridge,
        launchSparks,
        startsAt: 0,
        expiresAt: 0,
        authorityKey: null,
        viewer: 'peer',
      });
    }
    scene.add(this.root, this.beamRoot);
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
    // A shot id is unique only within one shooter connection. Including both
    // message owners prevents a later holder who reuses the same id from
    // suppressing the shared beam and report for every observer.
    const authorityKey = `${result.by}:${result.forPlayerId}:${authority.generation}:${authority.shotId}`;
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
    beam.shock.scale.set(RAILGUN_BOLT_PRESENTATION.shockRadiusM, presentationLength, RAILGUN_BOLT_PRESENTATION.shockRadiusM);
    for (const filament of beam.filaments) {
      filament.scale.set(
        RAILGUN_BOLT_PRESENTATION.filamentRadiusM,
        presentationLength,
        RAILGUN_BOLT_PRESENTATION.filamentRadiusM,
      );
    }
    const launchOffsetM = viewer === 'shooter' ? RAILGUN_BOLT_PRESENTATION.shooterLaunchOffsetM : 0;
    const launchBridgeLengthM = Math.max(0, startOffsetM - launchOffsetM);
    beam.launchRoot.position.set(
      0,
      -presentationLength * 0.5 - startOffsetM + launchOffsetM,
      0,
    );
    beam.launchCore.scale.setScalar(RAILGUN_BOLT_PRESENTATION.launchCoreRadiusM);
    beam.launchCorona.scale.setScalar(RAILGUN_BOLT_PRESENTATION.launchCoronaRadiusM);
    beam.launchRing.scale.setScalar(RAILGUN_BOLT_PRESENTATION.launchRingRadiusM);
    beam.launchBridge.visible = launchBridgeLengthM > 0.05;
    beam.launchBridge.position.set(0, launchBridgeLengthM * 0.5, 0);
    beam.launchBridge.scale.set(
      RAILGUN_BOLT_PRESENTATION.launchBridgeRadiusM,
      Math.max(0.001, launchBridgeLengthM),
      RAILGUN_BOLT_PRESENTATION.launchBridgeRadiusM,
    );
    for (const spark of beam.launchSparks) spark.scale.set(0.045, 0.62, 0.045);
    // The camera starts outside the open tube. Rendering its back faces turns
    // the near circular wall into a cyan tunnel that fills the shooter view.
    (beam.core.material as THREE.MeshBasicMaterial).side = THREE.FrontSide;
    (beam.bloom.material as THREE.MeshBasicMaterial).side = THREE.FrontSide;
    (beam.shock.material as THREE.MeshBasicMaterial).side = THREE.FrontSide;
    for (const filament of beam.filaments) (filament.material as THREE.MeshBasicMaterial).side = THREE.FrontSide;
    (beam.launchBridge.material as THREE.MeshBasicMaterial).side = THREE.FrontSide;
    beam.root.visible = true;
    beam.launchRoot.visible = true;
    beam.startsAt = now;
    beam.expiresAt = now + RAILGUN_BOLT_PRESENTATION.visibleDurationMs;
    beam.authorityKey = authorityKey;
    beam.viewer = viewer;
    beam.root.userData.authorityKey = authorityKey;
    beam.root.userData.authoritativeStart = [...authority.start];
    beam.root.userData.authoritativeEnd = [...authority.end];
    beam.root.userData.presentationStartOffsetM = startOffsetM;
    beam.root.userData.presentationCoreRadiusM = coreRadius;
    beam.root.userData.presentationHaloRadiusM = haloRadius;
    beam.root.userData.presentationLaunchOffsetM = launchOffsetM;
    beam.root.userData.presentationLaunchBridgeLengthM = launchBridgeLengthM;
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
    this.lastAcceptedOutcomes = Object.freeze(result.outcomes.map((outcome) => Object.freeze({ ...outcome })));
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
      const age = now - beam.startsAt;
      const pulse = 0.86 + Math.sin(age * 0.052) * 0.14;
      beam.filamentRoot.rotation.y = age * 0.019;
      (beam.core.material as THREE.MeshBasicMaterial).opacity = 0.96 * fade * attack;
      (beam.bloom.material as THREE.MeshBasicMaterial).opacity = 0.44 * Math.sqrt(fade) * attack * pulse;
      (beam.shock.material as THREE.MeshBasicMaterial).opacity = 0.16 * Math.sqrt(fade) * attack * (1.1 - pulse * 0.35);
      for (const [index, filament] of beam.filaments.entries()) {
        (filament.material as THREE.MeshBasicMaterial).opacity = (0.58 + index * 0.08) * fade * attack * pulse;
      }
      const launchProgress = THREE.MathUtils.clamp(age / RAILGUN_BOLT_PRESENTATION.launchDurationMs, 0, 1);
      const launchFade = 1 - THREE.MathUtils.smoothstep(launchProgress, 0.18, 1);
      beam.launchRoot.visible = launchFade > 0;
      if (beam.launchRoot.visible) {
        const ignitionPulse = 0.88 + Math.sin(age * 0.11) * 0.12;
        beam.launchCore.scale.setScalar(
          RAILGUN_BOLT_PRESENTATION.launchCoreRadiusM * (0.85 + launchProgress * 0.55),
        );
        beam.launchCorona.scale.setScalar(
          RAILGUN_BOLT_PRESENTATION.launchCoronaRadiusM * (0.75 + launchProgress * 1.45),
        );
        beam.launchRing.scale.setScalar(
          RAILGUN_BOLT_PRESENTATION.launchRingRadiusM * (0.68 + launchProgress * 1.8),
        );
        beam.launchRing.rotation.z = age * 0.018;
        (beam.launchCore.material as THREE.MeshBasicMaterial).opacity = 0.98 * launchFade * ignitionPulse;
        (beam.launchCorona.material as THREE.MeshBasicMaterial).opacity = 0.52 * launchFade * ignitionPulse;
        (beam.launchRing.material as THREE.MeshBasicMaterial).opacity = 0.76 * launchFade;
        (beam.launchBridge.material as THREE.MeshBasicMaterial).opacity = 0.68 * launchFade * ignitionPulse;
        for (const [index, spark] of beam.launchSparks.entries()) {
          const stagger = 0.78 + index * 0.035;
          spark.scale.set(0.045 * launchFade, (0.62 + launchProgress * 0.82) * stagger, 0.045 * launchFade);
          (spark.material as THREE.MeshBasicMaterial).opacity = 0.72 * launchFade * ignitionPulse;
        }
      }
    }
  }

  /**
   * Owns only the Railgun optic lifecycle and compatibility telemetry. The
   * shared exact-operator reveal receives the same already-authorized contact
   * set in legacy-main; no pawn geometry or DOM body marker is created here.
   */
  updateThermal(_camera: THREE.Camera, contacts: readonly RailgunThermalContact[], active: boolean): void {
    this.thermalRoot.hidden = !active;
    this.visibleThermalContacts = active ? contacts.length : 0;
    if (!active) this.syncExactOperatorReveal(false, null);
  }

  /** Bind Railgun compatibility telemetry to the actual shared render layers. */
  syncExactOperatorReveal(active: boolean, telemetry: ThermalGhostTelemetry | null): void {
    const complete = active
      && telemetry !== null
      && telemetry.completeOperatorModels
      && !telemetry.materialBudgetExceeded
      && telemetry.activeModelLayers > 0
      && telemetry.activeModelLayers === telemetry.activeHaloLayers;
    this.exactOperatorModels = complete ? telemetry.activeModelLayers : 0;
    this.exactOperatorHalos = complete ? telemetry.activeHaloLayers : 0;
    this.exactOperatorThroughGeometry = complete && telemetry.throughGeometry;
    this.exactOperatorGeometryIdentity = complete && telemetry.geometryIdentity;
    this.exactOperatorSkeletonIdentity = complete && telemetry.skeletonIdentity;
    this.exactOperatorOrangeHalo = complete && telemetry.orangeHalo;
    this.exactOperatorComplete = complete;
    this.exactOperatorMaterialBudgetExceeded = active && telemetry?.materialBudgetExceeded === true;
  }

  telemetry(): Readonly<{
    worldVisible: boolean;
    thermalActive: boolean;
    thermalContacts: number;
    worldSilhouettes: number;
    thermalThroughGeometry: boolean;
    revealPresentation: 'shared-exact-animated-operator-plus-orange-halo';
    proxyMeshes: 0;
    domBodyMarkers: 0;
    exactOperatorModels: number;
    exactOperatorHalos: number;
    exactGeometryIdentity: boolean;
    exactSkeletonIdentity: boolean;
    orangeHalo: boolean;
    exactOperatorComplete: boolean;
    exactOperatorMaterialBudgetExceeded: boolean;
    activeBeams: number;
    beamPresentations: number;
    lastBeamLengthM: number;
    visibleDurationMs: number;
    coreRadiusM: number;
    haloRadiusM: number;
    shockRadiusM: number;
    filamentCount: number;
    shooterCoreRadiusM: number;
    shooterHaloRadiusM: number;
    shooterLaunchOffsetM: number;
    launchDurationMs: number;
    launchSparkCount: number;
    launchLayerCount: number;
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
    lastAcceptedOutcomes: RailgunShotResultMessage['outcomes'];
    modelId: string;
    authoredWorldModel: boolean;
  }> {
    const thermalThroughGeometry = this.exactOperatorThroughGeometry;
    const throughGeometry = this.beams.every(({
      core, bloom, shock, filaments, launchCore, launchCorona, launchRing, launchBridge, launchSparks,
    }) => {
      const coreMaterial = core.material as THREE.MeshBasicMaterial;
      const bloomMaterial = bloom.material as THREE.MeshBasicMaterial;
      const shockMaterial = shock.material as THREE.MeshBasicMaterial;
      return coreMaterial.depthTest === false && coreMaterial.depthWrite === false
        && bloomMaterial.depthTest === false && bloomMaterial.depthWrite === false
        && shockMaterial.depthTest === false && shockMaterial.depthWrite === false
        && [launchCore, launchCorona, launchRing, launchBridge, ...launchSparks].every((mesh) => {
          const material = mesh.material as THREE.MeshBasicMaterial;
          return material.depthTest === false && material.depthWrite === false;
        })
        && filaments.every((filament) => {
          const material = filament.material as THREE.MeshBasicMaterial;
          return material.depthTest === false && material.depthWrite === false;
        });
    });
    const openEnded = this.beams.every(({ core, bloom, shock, filaments }) => (
      (core.geometry as THREE.CylinderGeometry).parameters.openEnded === true
      && (bloom.geometry as THREE.CylinderGeometry).parameters.openEnded === true
      && (shock.geometry as THREE.CylinderGeometry).parameters.openEnded === true
      && filaments.every((filament) => (filament.geometry as THREE.CylinderGeometry).parameters.openEnded === true)
    ));
    return {
      worldVisible: this.root.visible,
      thermalActive: !this.thermalRoot.hidden,
      thermalContacts: this.visibleThermalContacts,
      // Compatibility field retained for exact-SHA browser receipts. It now
      // counts shared exact operator models, never generated silhouettes.
      worldSilhouettes: this.exactOperatorModels,
      thermalThroughGeometry,
      revealPresentation: 'shared-exact-animated-operator-plus-orange-halo',
      proxyMeshes: 0,
      domBodyMarkers: 0,
      exactOperatorModels: this.exactOperatorModels,
      exactOperatorHalos: this.exactOperatorHalos,
      exactGeometryIdentity: this.exactOperatorGeometryIdentity,
      exactSkeletonIdentity: this.exactOperatorSkeletonIdentity,
      orangeHalo: this.exactOperatorOrangeHalo,
      exactOperatorComplete: this.exactOperatorComplete,
      exactOperatorMaterialBudgetExceeded: this.exactOperatorMaterialBudgetExceeded,
      activeBeams: this.beams.filter((beam) => beam.root.visible).length,
      beamPresentations: this.beamPresentations,
      lastBeamLengthM: this.lastBeamLengthM,
      visibleDurationMs: RAILGUN_BOLT_PRESENTATION.visibleDurationMs,
      coreRadiusM: RAILGUN_BOLT_PRESENTATION.coreRadiusM,
      haloRadiusM: RAILGUN_BOLT_PRESENTATION.haloRadiusM,
      shockRadiusM: RAILGUN_BOLT_PRESENTATION.shockRadiusM,
      filamentCount: RAILGUN_BOLT_PRESENTATION.filamentCount,
      shooterCoreRadiusM: RAILGUN_BOLT_PRESENTATION.shooterCoreRadiusM,
      shooterHaloRadiusM: RAILGUN_BOLT_PRESENTATION.shooterHaloRadiusM,
      shooterLaunchOffsetM: RAILGUN_BOLT_PRESENTATION.shooterLaunchOffsetM,
      launchDurationMs: RAILGUN_BOLT_PRESENTATION.launchDurationMs,
      launchSparkCount: RAILGUN_BOLT_PRESENTATION.launchSparkCount,
      launchLayerCount: 4 + RAILGUN_BOLT_PRESENTATION.launchSparkCount,
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
      lastAcceptedOutcomes: Object.freeze(this.lastAcceptedOutcomes.map((outcome) => Object.freeze({ ...outcome }))),
      modelId: String(this.weapon.userData.weaponModelId ?? 'railgun-authored-v1'),
      authoredWorldModel: this.weapon.userData.projectOriginalWeapon === true,
    };
  }

  resetBeams(): void {
    for (const beam of this.beams) {
      beam.root.visible = false;
      beam.startsAt = 0;
      beam.expiresAt = 0;
      beam.authorityKey = null;
      beam.launchRoot.visible = false;
    }
    this.acceptedBeamKeys.clear();
    this.beamCursor = 0;
    this.beamPresentations = 0;
    this.lastBeamLengthM = 0;
    this.lastAcceptedBeam = null;
    this.lastAcceptedOutcomes = [];
    this.lastPresentationStartOffsetM = 0;
    this.lastViewer = 'peer';
  }
}
