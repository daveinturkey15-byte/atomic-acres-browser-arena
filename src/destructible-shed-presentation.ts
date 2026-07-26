import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ARENA_MAX_AWAKE_SHED_BODIES,
  SHED_ANGLE_Q,
  SHED_MAX_APERTURES,
  SHED_MAX_DENTS,
  SHED_MAX_MAJOR_CHUNKS,
  SHED_PANEL_COORD_Q,
  WORLD_COLLISION_CONSUMERS,
  type BallisticAperture,
  type DamageableSheetSurfaceState,
  type DestructibleShedDefinition,
  type SheetSurfaceDefinition,
  type ShedPlacement,
  type ShedState,
} from './destructible-world';

const ROOF_COS = Math.sqrt(3) / 2;
const ROOF_SIN = 0.5;

export const FIELD_SHED_DEFINITION: DestructibleShedDefinition = Object.freeze({
  schemaVersion: 1,
  id: 'field-shed-v1',
  doorSurfaceId: 'door-south',
  surfaces: Object.freeze([
    Object.freeze({
      id: 'door-south', role: 'door' as const, detachableChunkId: 'chunk-door',
      frame: Object.freeze({ centre: { x: 0, y: 1.1, z: 2.1 }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 0.72, halfV: 1.1 }),
    }),
    Object.freeze({
      id: 'wall-north', role: 'wall' as const, detachableChunkId: 'chunk-north',
      frame: Object.freeze({ centre: { x: 0, y: 1.2, z: -2.1 }, uAxis: { x: -1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 1.8, halfV: 1.2 }),
    }),
    Object.freeze({
      id: 'wall-east', role: 'wall' as const, detachableChunkId: 'chunk-east',
      frame: Object.freeze({ centre: { x: 1.8, y: 1.2, z: 0 }, uAxis: { x: 0, y: 0, z: -1 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 2.1, halfV: 1.2 }),
    }),
    Object.freeze({
      id: 'wall-west', role: 'wall' as const, detachableChunkId: 'chunk-west',
      frame: Object.freeze({ centre: { x: -1.8, y: 1.2, z: 0 }, uAxis: { x: 0, y: 0, z: 1 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 2.1, halfV: 1.2 }),
    }),
    Object.freeze({
      id: 'wall-south-left', role: 'wall' as const, detachableChunkId: null,
      frame: Object.freeze({ centre: { x: -1.26, y: 1.2, z: 2.1 }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 0.54, halfV: 1.2 }),
    }),
    Object.freeze({
      id: 'wall-south-right', role: 'wall' as const, detachableChunkId: null,
      frame: Object.freeze({ centre: { x: 1.26, y: 1.2, z: 2.1 }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 0.54, halfV: 1.2 }),
    }),
    Object.freeze({
      id: 'wall-south-header', role: 'wall' as const, detachableChunkId: null,
      frame: Object.freeze({ centre: { x: 0, y: 2.3, z: 2.1 }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 0.72, halfV: 0.1 }),
    }),
    Object.freeze({
      id: 'roof-east', role: 'roof' as const, detachableChunkId: 'chunk-roof-east',
      frame: Object.freeze({ centre: { x: 0.9, y: 2.92, z: 0 }, uAxis: { x: 0, y: 0, z: -1 }, vAxis: { x: ROOF_COS, y: ROOF_SIN, z: 0 }, halfU: 2.22, halfV: 1.04 }),
    }),
    Object.freeze({
      id: 'roof-west', role: 'roof' as const, detachableChunkId: 'chunk-roof-west',
      frame: Object.freeze({ centre: { x: -0.9, y: 2.92, z: 0 }, uAxis: { x: 0, y: 0, z: 1 }, vAxis: { x: -ROOF_COS, y: ROOF_SIN, z: 0 }, halfU: 2.22, halfV: 1.04 }),
    }),
  ]),
  preauthoredChunkIds: Object.freeze([
    'chunk-door', 'chunk-north', 'chunk-east', 'chunk-west', 'chunk-roof-east', 'chunk-roof-west',
  ]),
  thresholds: Object.freeze({ dentDamageQ: 20, perforateEnergyQ: 45, detachDamageQ: 220 }),
  caps: Object.freeze({
    apertures: SHED_MAX_APERTURES,
    dents: SHED_MAX_DENTS,
    majorChunks: SHED_MAX_MAJOR_CHUNKS,
    arenaAwakeMajorBodies: ARENA_MAX_AWAKE_SHED_BODIES,
  }),
  consumers: WORLD_COLLISION_CONSUMERS,
});

function ridgedMetalBumpTexture(): THREE.DataTexture {
  const width = 64;
  const data = new Uint8Array(width * 4);
  for (let x = 0; x < width; x += 1) {
    const ridge = Math.round(128 + Math.sin(x / width * Math.PI * 16) * 112);
    data[x * 4] = ridge;
    data[x * 4 + 1] = ridge;
    data[x * 4 + 2] = ridge;
    data[x * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  texture.name = 'field-shed-ridged-metal-bump';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 1);
  texture.needsUpdate = true;
  return texture;
}

function panelShape(surface: SheetSurfaceDefinition, state: DamageableSheetSurfaceState): THREE.Shape {
  const { halfU, halfV } = surface.frame;
  const shape = new THREE.Shape();
  shape.moveTo(-halfU, -halfV);
  shape.lineTo(halfU, -halfV);
  shape.lineTo(halfU, halfV);
  shape.lineTo(-halfU, halfV);
  shape.closePath();
  for (const aperture of state.apertures) {
    const hole = new THREE.Path();
    hole.absellipse(
      aperture.uQ / SHED_PANEL_COORD_Q * halfU,
      aperture.vQ / SHED_PANEL_COORD_Q * halfV,
      aperture.radiusUQ / SHED_PANEL_COORD_Q * halfU,
      aperture.radiusVQ / SHED_PANEL_COORD_Q * halfV,
      0,
      Math.PI * 2,
      true,
    );
    shape.holes.push(hole);
  }
  return shape;
}

function panelBasis(surface: SheetSurfaceDefinition): THREE.Matrix4 {
  const u = new THREE.Vector3(surface.frame.uAxis.x, surface.frame.uAxis.y, surface.frame.uAxis.z);
  const v = new THREE.Vector3(surface.frame.vAxis.x, surface.frame.vAxis.y, surface.frame.vAxis.z);
  const normal = new THREE.Vector3().crossVectors(u, v).normalize();
  return new THREE.Matrix4().makeBasis(u, v, normal).setPosition(
    surface.frame.centre.x,
    surface.frame.centre.y,
    surface.frame.centre.z,
  );
}

function transformedPanelGeometry(
  surface: SheetSurfaceDefinition,
  state: DamageableSheetSurfaceState,
): THREE.BufferGeometry {
  const geometry = new THREE.ShapeGeometry(panelShape(surface, state), 18);
  geometry.applyMatrix4(panelBasis(surface));
  geometry.computeVertexNormals();
  return geometry;
}

function localPanelGeometry(surface: SheetSurfaceDefinition, state: DamageableSheetSurfaceState): THREE.BufferGeometry {
  const geometry = new THREE.ShapeGeometry(panelShape(surface, state), 18);
  geometry.computeVertexNormals();
  return geometry;
}

function placeBoxInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  position: THREE.Vector3,
  scale: THREE.Vector3,
  rotation = new THREE.Quaternion(),
): void {
  mesh.setMatrixAt(index, new THREE.Matrix4().compose(position, rotation, scale));
}

function createFrame(material: THREE.Material): THREE.InstancedMesh {
  const placements: ReadonlyArray<readonly [THREE.Vector3, THREE.Vector3, THREE.Quaternion?]> = [
    ...[-1.8, 1.8].flatMap((x) => [-2.1, 2.1].map((z) => [new THREE.Vector3(x, 1.3, z), new THREE.Vector3(0.11, 1.3, 0.11)] as const)),
    [new THREE.Vector3(0, 3.45, 0), new THREE.Vector3(0.09, 0.09, 2.22)] as const,
    ...[-2.1, 2.1].flatMap((z) => [-1.8, 1.8].map((x) => [new THREE.Vector3(x, 2.43, z), new THREE.Vector3(0.1, 0.1, 0.12)] as const)),
    [new THREE.Vector3(-0.78, 1.1, 2.13), new THREE.Vector3(0.07, 1.1, 0.07)] as const,
    [new THREE.Vector3(0.78, 1.1, 2.13), new THREE.Vector3(0.07, 1.1, 0.07)] as const,
  ];
  const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 2, 2), material, placements.length);
  frame.name = 'field-shed-structural-frame';
  placements.forEach(([position, scale, rotation], index) => placeBoxInstance(frame, index, position, scale, rotation));
  frame.instanceMatrix.needsUpdate = true;
  frame.castShadow = true;
  frame.receiveShadow = true;
  return frame;
}

function apertureLocalPosition(surface: SheetSurfaceDefinition, aperture: BallisticAperture): THREE.Vector3 {
  return new THREE.Vector3(
    surface.frame.centre.x
      + surface.frame.uAxis.x * aperture.uQ / SHED_PANEL_COORD_Q * surface.frame.halfU
      + surface.frame.vAxis.x * aperture.vQ / SHED_PANEL_COORD_Q * surface.frame.halfV,
    surface.frame.centre.y
      + surface.frame.uAxis.y * aperture.uQ / SHED_PANEL_COORD_Q * surface.frame.halfU
      + surface.frame.vAxis.y * aperture.vQ / SHED_PANEL_COORD_Q * surface.frame.halfV,
    surface.frame.centre.z
      + surface.frame.uAxis.z * aperture.uQ / SHED_PANEL_COORD_Q * surface.frame.halfU
      + surface.frame.vAxis.z * aperture.vQ / SHED_PANEL_COORD_Q * surface.frame.halfV,
  );
}

function panelQuaternion(surface: SheetSurfaceDefinition): THREE.Quaternion {
  return new THREE.Quaternion().setFromRotationMatrix(panelBasis(surface));
}

export type ShedPresentationTelemetry = Readonly<{
  revision: number;
  activeDraws: number;
  apertures: number;
  dents: number;
  detachedChunks: number;
}>;

export class DestructibleShedPresentation {
  readonly root = new THREE.Group();
  private readonly sheetMaterial: THREE.MeshStandardMaterial;
  private readonly frameMaterial = new THREE.MeshStandardMaterial({ color: 0x17251e, metalness: 0.82, roughness: 0.3 });
  private readonly rimMaterial = new THREE.MeshStandardMaterial({ color: 0xc2b69e, metalness: 0.92, roughness: 0.22 });
  private readonly dentMaterial = new THREE.MeshStandardMaterial({ color: 0x26392f, metalness: 0.72, roughness: 0.46, side: THREE.DoubleSide });
  private readonly debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x304d3b, metalness: 0.74, roughness: 0.42 });
  private readonly bumpTexture = ridgedMetalBumpTexture();
  private shell: THREE.Mesh;
  private readonly doorHinge = new THREE.Group();
  private door: THREE.Mesh;
  private readonly apertureRims: THREE.InstancedMesh;
  private readonly dents: THREE.InstancedMesh;
  private readonly debris: THREE.InstancedMesh;
  private revision = -1;
  private disposed = false;

  constructor(
    readonly definition: DestructibleShedDefinition,
    readonly placement: ShedPlacement,
    initialState: ShedState,
  ) {
    if (initialState.placementId !== placement.id || placement.definitionId !== definition.id) {
      throw new TypeError('Shed presentation identity mismatch');
    }
    this.root.name = `destructible-shed:${placement.id}`;
    this.root.position.set(placement.position.x, placement.position.y, placement.position.z);
    this.root.rotation.y = placement.yaw;
    this.root.userData.interactiveWorldKind = 'destructible-shed';
    this.root.userData.placementId = placement.id;

    this.sheetMaterial = new THREE.MeshStandardMaterial({
      color: 0x294a37,
      metalness: 0.76,
      roughness: 0.36,
      side: THREE.DoubleSide,
      bumpMap: this.bumpTexture,
      bumpScale: 0.055,
    });
    this.shell = new THREE.Mesh(new THREE.BufferGeometry(), this.sheetMaterial);
    this.shell.name = 'field-shed-damageable-shell';
    this.shell.castShadow = true;
    this.shell.receiveShadow = true;
    this.root.add(this.shell);

    this.doorHinge.name = 'field-shed-door-hinge';
    this.door = new THREE.Mesh(new THREE.BufferGeometry(), this.sheetMaterial);
    this.door.name = 'field-shed-door-leaf';
    this.door.castShadow = true;
    this.door.receiveShadow = true;
    this.doorHinge.add(this.door);
    this.root.add(this.doorHinge);

    const frame = createFrame(this.frameMaterial);
    this.root.add(frame);
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.1, 4.1),
      new THREE.MeshStandardMaterial({ color: 0x3f4741, metalness: 0.22, roughness: 0.82 }),
    );
    floor.name = 'field-shed-floor';
    floor.position.y = 0.05;
    floor.receiveShadow = true;
    this.root.add(floor);

    this.apertureRims = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.12, 6, 16), this.rimMaterial, SHED_MAX_APERTURES);
    this.apertureRims.name = 'field-shed-aperture-rims';
    this.apertureRims.count = 0;
    this.root.add(this.apertureRims);
    this.dents = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 12), this.dentMaterial, SHED_MAX_DENTS);
    this.dents.name = 'field-shed-dents';
    this.dents.count = 0;
    this.root.add(this.dents);
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1.25, 0.12, 1.75), this.debrisMaterial, SHED_MAX_MAJOR_CHUNKS);
    this.debris.name = 'field-shed-major-debris';
    this.debris.count = 0;
    this.debris.castShadow = true;
    this.debris.receiveShadow = true;
    this.root.add(this.debris);
    this.sync(initialState);
  }

  sync(state: ShedState): void {
    if (this.disposed || state.revision === this.revision) return;
    if (state.placementId !== this.placement.id) throw new TypeError('Shed state placement mismatch');
    const doorDefinition = this.definition.surfaces.find((surface) => surface.id === this.definition.doorSurfaceId);
    const doorState = state.surfaces.find((surface) => surface.surfaceId === this.definition.doorSurfaceId);
    if (!doorDefinition || !doorState) throw new TypeError('Shed door definition missing');

    const staticGeometries: THREE.BufferGeometry[] = [];
    for (const surfaceDefinition of this.definition.surfaces) {
      if (surfaceDefinition.role === 'door') continue;
      const surfaceState = state.surfaces.find((surface) => surface.surfaceId === surfaceDefinition.id);
      if (!surfaceState || surfaceState.stage === 'detached') continue;
      staticGeometries.push(transformedPanelGeometry(surfaceDefinition, surfaceState));
    }
    const shellGeometry = mergeGeometries(staticGeometries, false) ?? new THREE.BufferGeometry();
    staticGeometries.forEach((geometry) => geometry.dispose());
    const oldShellGeometry = this.shell.geometry;
    this.shell.geometry = shellGeometry;
    oldShellGeometry.dispose();

    const oldDoorGeometry = this.door.geometry;
    this.door.geometry = doorState.stage === 'detached'
      ? new THREE.BufferGeometry()
      : localPanelGeometry(doorDefinition, doorState);
    oldDoorGeometry.dispose();
    this.doorHinge.position.set(-doorDefinition.frame.halfU, doorDefinition.frame.centre.y, doorDefinition.frame.centre.z);
    this.door.position.set(doorDefinition.frame.halfU, 0, 0);
    this.doorHinge.rotation.y = -state.door.angleQ / SHED_ANGLE_Q * Math.PI / 2;

    let apertureIndex = 0;
    let dentIndex = 0;
    for (const surfaceState of state.surfaces) {
      const surfaceDefinition = this.definition.surfaces.find((surface) => surface.id === surfaceState.surfaceId);
      if (!surfaceDefinition || surfaceState.stage === 'detached') continue;
      const rotation = panelQuaternion(surfaceDefinition);
      for (const aperture of surfaceState.apertures) {
        if (apertureIndex >= SHED_MAX_APERTURES) break;
        const scale = new THREE.Vector3(
          aperture.radiusUQ / SHED_PANEL_COORD_Q * surfaceDefinition.frame.halfU,
          aperture.radiusVQ / SHED_PANEL_COORD_Q * surfaceDefinition.frame.halfV,
          Math.min(surfaceDefinition.frame.halfU, surfaceDefinition.frame.halfV) * 0.035,
        );
        placeBoxInstance(this.apertureRims, apertureIndex, apertureLocalPosition(surfaceDefinition, aperture), scale, rotation);
        apertureIndex += 1;
      }
      for (const dent of surfaceState.dents) {
        if (dentIndex >= SHED_MAX_DENTS) break;
        const apertureLike: BallisticAperture = {
          id: dent.id,
          surfaceId: dent.surfaceId,
          uQ: dent.uQ,
          vQ: dent.vQ,
          radiusUQ: dent.radiusQ,
          radiusVQ: dent.radiusQ,
        };
        const radius = dent.radiusQ / SHED_PANEL_COORD_Q * Math.min(surfaceDefinition.frame.halfU, surfaceDefinition.frame.halfV);
        placeBoxInstance(this.dents, dentIndex, apertureLocalPosition(surfaceDefinition, apertureLike), new THREE.Vector3(radius, radius, 1), rotation);
        dentIndex += 1;
      }
    }
    this.apertureRims.count = apertureIndex;
    this.apertureRims.instanceMatrix.needsUpdate = true;
    this.dents.count = dentIndex;
    this.dents.instanceMatrix.needsUpdate = true;

    this.debris.count = Math.min(state.majorDebris.length, SHED_MAX_MAJOR_CHUNKS);
    state.majorDebris.slice(0, SHED_MAX_MAJOR_CHUNKS).forEach((chunk, index) => {
      const position = new THREE.Vector3(chunk.poseQ.position.xQ / 1_000, chunk.poseQ.position.yQ / 1_000, chunk.poseQ.position.zQ / 1_000);
      const rotation = new THREE.Quaternion(
        chunk.poseQ.rotation.xQ / SHED_PANEL_COORD_Q,
        chunk.poseQ.rotation.yQ / SHED_PANEL_COORD_Q,
        chunk.poseQ.rotation.zQ / SHED_PANEL_COORD_Q,
        chunk.poseQ.rotation.wQ / SHED_PANEL_COORD_Q,
      ).normalize();
      placeBoxInstance(this.debris, index, position, new THREE.Vector3(1, 1, 1), rotation);
    });
    this.debris.instanceMatrix.needsUpdate = true;
    this.revision = state.revision;
    this.root.userData.worldRevision = state.revision;
  }

  telemetry(state: ShedState): ShedPresentationTelemetry {
    const optionalDraws = Number(this.apertureRims.count > 0) + Number(this.dents.count > 0) + Number(this.debris.count > 0);
    return Object.freeze({
      revision: this.revision,
      activeDraws: 4 + optionalDraws,
      apertures: state.surfaces.reduce((sum, surface) => sum + surface.apertures.length, 0),
      dents: state.surfaces.reduce((sum, surface) => sum + surface.dents.length, 0),
      detachedChunks: state.detachedChunkIds.length,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      geometries.add(node.geometry);
      const entries = Array.isArray(node.material) ? node.material : [node.material];
      entries.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.bumpTexture.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}

export function createFieldShedPresentation(placement: ShedPlacement, state: ShedState): DestructibleShedPresentation {
  return new DestructibleShedPresentation(FIELD_SHED_DEFINITION, placement, state);
}
