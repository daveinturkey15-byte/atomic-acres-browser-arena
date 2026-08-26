import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';
import {
  SHED_ANGLE_Q,
  SHED_DAMAGE_REGION_RADIUS_Q,
  SHED_MAX_APERTURES,
  SHED_MAX_DENTS,
  SHED_MAX_MAJOR_CHUNKS,
  SHED_MAJOR_DEBRIS_HALF_THICKNESS,
  SHED_PANEL_COORD_Q,
  type BallisticAperture,
  type DamageableSheetSurfaceState,
  type DestructibleShedDefinition,
  type SheetSurfaceDefinition,
  type ShedPlacement,
  type ShedState,
  shedMajorChunkExtents,
  shedRegionalDamageAt,
} from './destructible-world';
import {
  FIELD_SHED_DEFINITION,
  FIELD_SHED_MATERIAL_IDS,
  FIELD_SHED_MATERIAL_POLICY_ID,
} from './destructible-shed-definition';

export { FIELD_SHED_DEFINITION } from './destructible-shed-definition';

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

/**
 * A bounded pressed-metal dimple. Unlike the retired flat circle decal, this
 * mesh has a depressed centre, a raised crease ring and real normals/depth, so
 * it participates in the colour, depth and shadow passes on WebGPU/WebGL.
 */
function pressedMetalDentGeometry(radialSegments = 20): THREE.BufferGeometry {
  const rings = Object.freeze([
    Object.freeze({ radius: 0.32, height: 0.2 }),
    Object.freeze({ radius: 0.7, height: 0.78 }),
    Object.freeze({ radius: 1, height: 0.04 }),
  ]);
  const positions: number[] = [0, 0, 0.1];
  const uvs: number[] = [0.5, 0.5];
  for (const ring of rings) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = segment / radialSegments * Math.PI * 2;
      const x = Math.cos(angle) * ring.radius;
      const y = Math.sin(angle) * ring.radius;
      positions.push(x, y, ring.height);
      uvs.push(x * 0.5 + 0.5, y * 0.5 + 0.5);
    }
  }
  const indices: number[] = [];
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    indices.push(0, 1 + segment, 1 + next);
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    const innerStart = 1 + ring * radialSegments;
    const outerStart = innerStart + radialSegments;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const inner = innerStart + segment;
      const innerNext = innerStart + next;
      const outer = outerStart + segment;
      const outerNext = outerStart + next;
      indices.push(inner, outer, outerNext, inner, outerNext, innerNext);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'field-shed-pressed-metal-dent-geometry';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * One normalized, closed corrugated sheet geometry. Per-chunk canonical
 * half-extents provide the distinct door/wall/roof silhouettes without adding
 * draw calls or inventing presentation-only collision dimensions.
 */
function corrugatedSheetDebrisGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(2, 2, 0.12, 10, 10, 1);
  geometry.name = 'field-shed-corrugated-sheet-debris-geometry';
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index += 1) {
    const z = positions.getZ(index);
    if (Math.abs(z) < 0.055) continue;
    const x = positions.getX(index);
    const y = positions.getY(index);
    const corrugation = 0.012 * (0.5 + 0.5 * Math.sin((x + 1) * Math.PI * 7 + y * 0.7));
    const crease = 0.007 * Math.exp(-Math.pow(x - y * 0.22, 2) / 0.045);
    positions.setZ(index, Math.sign(z) * (0.06 - corrugation - crease));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
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
  const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 2, 2), material, SHED_FRAME_PLACEMENTS.length);
  frame.name = 'field-shed-structural-frame';
  SHED_FRAME_PLACEMENTS.forEach(([position, scale, rotation], index) => placeBoxInstance(frame, index, position, scale, rotation));
  frame.instanceMatrix.needsUpdate = true;
  frame.castShadow = true;
  frame.receiveShadow = true;
  return frame;
}

const SHED_FRAME_PLACEMENTS: ReadonlyArray<readonly [THREE.Vector3, THREE.Vector3, THREE.Quaternion?]> = [
  ...[-1.8, 1.8].flatMap((x) => [-2.1, 2.1].map((z) => [new THREE.Vector3(x, 1.3, z), new THREE.Vector3(0.11, 1.3, 0.11)] as const)),
  [new THREE.Vector3(0, 3.45, 0), new THREE.Vector3(0.09, 0.09, 2.22)] as const,
  ...[-2.1, 2.1].map((z) => [new THREE.Vector3(0, 2.43, z), new THREE.Vector3(1.8, 0.09, 0.09)] as const),
  ...[-1.8, 1.8].map((x) => [new THREE.Vector3(x, 2.43, 0), new THREE.Vector3(0.09, 0.09, 2.1)] as const),
  ...[-2.1, 2.1].map((z) => [new THREE.Vector3(0, 0.12, z), new THREE.Vector3(1.8, 0.08, 0.08)] as const),
  ...[-1.8, 1.8].map((x) => [new THREE.Vector3(x, 0.12, 0), new THREE.Vector3(0.08, 0.08, 2.1)] as const),
  [new THREE.Vector3(-0.78, 1.1, 2.13), new THREE.Vector3(0.07, 1.1, 0.07)] as const,
  [new THREE.Vector3(0.78, 1.1, 2.13), new THREE.Vector3(0.07, 1.1, 0.07)] as const,
];

/**
 * Deterministic toppled layout for a fully obliterated shed. Each frame member
 * ends lying flat near where it stood, fanned outward with a seeded yaw, so the
 * skeleton reads as broken wreckage on the ground rather than disappearing.
 */
function placeToppledFrame(frame: THREE.InstancedMesh): void {
  SHED_FRAME_PLACEMENTS.forEach(([position, scale], index) => {
    const unit = deterministicFrameUnit(index);
    const longest = Math.max(scale.x, scale.y, scale.z);
    const yaw = Math.atan2(position.x, position.z) + (unit - 0.5) * 1.4;
    const fallen = new THREE.Vector3(
      position.x * 1.18 + Math.sin(yaw) * 0.35,
      Math.min(scale.x, scale.y, scale.z) + 0.02 + index * 0.012,
      position.z * 1.18 + Math.cos(yaw) * 0.35,
    );
    // Lie along the member's longest axis on the ground plane.
    const flatScale = new THREE.Vector3(Math.min(scale.x, 0.12), Math.min(scale.y, scale.z, 0.12), longest);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, (unit - 0.5) * 0.18));
    placeBoxInstance(frame, index, fallen, flatScale, rotation);
  });
  frame.instanceMatrix.needsUpdate = true;
}

function deterministicFrameUnit(index: number): number {
  let hash = 0x811c9dc5 ^ (index + 1);
  hash = Math.imul(hash, 0x01000193);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 0x1_0000_0000;
}

function damageableSheetMesh(
  name: 'field-shed-damageable-shell' | 'field-shed-door-leaf',
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.topologyOwnedMesh = true;
  return mesh;
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

function rotateY(point: THREE.Vector3, angle: number): THREE.Vector3 {
  return point.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
}

function presentationSurfaceDefinition(
  surface: SheetSurfaceDefinition,
  doorAngleQ: number,
): SheetSurfaceDefinition {
  if (surface.role !== 'door') return surface;
  const angle = -doorAngleQ / SHED_ANGLE_Q * Math.PI / 2;
  const u = new THREE.Vector3(surface.frame.uAxis.x, surface.frame.uAxis.y, surface.frame.uAxis.z);
  const v = new THREE.Vector3(surface.frame.vAxis.x, surface.frame.vAxis.y, surface.frame.vAxis.z);
  const hinge = new THREE.Vector3(surface.frame.centre.x, surface.frame.centre.y, surface.frame.centre.z)
    .addScaledVector(u, -surface.frame.halfU);
  const centre = hinge.clone().add(rotateY(u.multiplyScalar(surface.frame.halfU), angle));
  const rotatedU = rotateY(new THREE.Vector3(surface.frame.uAxis.x, surface.frame.uAxis.y, surface.frame.uAxis.z), angle);
  const rotatedV = rotateY(v, angle);
  return Object.freeze({
    ...surface,
    frame: Object.freeze({
      ...surface.frame,
      centre: Object.freeze({ x: centre.x, y: centre.y, z: centre.z }),
      uAxis: Object.freeze({ x: rotatedU.x, y: rotatedU.y, z: rotatedU.z }),
      vAxis: Object.freeze({ x: rotatedV.x, y: rotatedV.y, z: rotatedV.z }),
    }),
  });
}

function detachedPresentationSurfaceDefinition(
  surface: SheetSurfaceDefinition,
  state: ShedState,
): SheetSurfaceDefinition | null {
  if (!surface.detachableChunkId) return null;
  const body = state.majorDebris.find((candidate) => candidate.chunkId === surface.detachableChunkId);
  if (!body) return null;
  const rotation = new THREE.Quaternion(
    body.poseQ.rotation.xQ / SHED_PANEL_COORD_Q,
    body.poseQ.rotation.yQ / SHED_PANEL_COORD_Q,
    body.poseQ.rotation.zQ / SHED_PANEL_COORD_Q,
    body.poseQ.rotation.wQ / SHED_PANEL_COORD_Q,
  ).normalize();
  const uAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
  const vAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
  const normal = new THREE.Vector3().crossVectors(uAxis, vAxis).normalize();
  const centre = new THREE.Vector3(
    body.poseQ.position.xQ / 1_000,
    body.poseQ.position.yQ / 1_000,
    body.poseQ.position.zQ / 1_000,
  ).addScaledVector(normal, SHED_MAJOR_DEBRIS_HALF_THICKNESS);
  return Object.freeze({
    ...surface,
    frame: Object.freeze({
      ...surface.frame,
      centre: Object.freeze({
        x: centre.x,
        y: centre.y,
        z: centre.z,
      }),
      uAxis: Object.freeze({ x: uAxis.x, y: uAxis.y, z: uAxis.z }),
      vAxis: Object.freeze({ x: vAxis.x, y: vAxis.y, z: vAxis.z }),
    }),
  });
}

function debrisTint(chunkId: string): THREE.Color {
  const palette = [0x294a37, 0x315640, 0x254333, 0x395c45, 0x2c4f3a, 0x22402f];
  let hash = 0;
  for (let index = 0; index < chunkId.length; index += 1) hash = (hash * 31 + chunkId.charCodeAt(index)) >>> 0;
  return new THREE.Color(palette[hash % palette.length]!);
}

function regionalDamageTint(markCount: number): THREE.Color {
  const palette = [0x26392f, 0x46503a, 0x755d43, 0xb19a78];
  return new THREE.Color(palette[Math.max(0, Math.min(palette.length - 1, markCount - 1))]!);
}

export type ShedPresentationTelemetry = Readonly<{
  revision: number;
  activeDraws: number;
  apertures: number;
  dents: number;
  detachedChunks: number;
  retiredGeometries: number;
  frameCollapsed: boolean;
  prewarmed: boolean;
}>;

function presentationTopologySignature(state: ShedState): string {
  return state.surfaces.map((surface) => `${surface.surfaceId}:${surface.stage}:${surface.apertures
    .map((aperture) => `${aperture.uQ},${aperture.vQ},${aperture.radiusUQ},${aperture.radiusVQ}`)
    .join(';')}`).join('|');
}

export class DestructibleShedPresentation {
  readonly root = new THREE.Group();
  private readonly sheetMaterial: THREE.MeshStandardMaterial;
  private readonly frameMaterial = new THREE.MeshStandardMaterial({ color: 0x17251e, metalness: 0.82, roughness: 0.3 });
  private readonly rimMaterial = new THREE.MeshStandardMaterial({ color: 0xc2b69e, metalness: 0.92, roughness: 0.22 });
  private readonly dentMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.72, roughness: 0.46, side: THREE.DoubleSide });
  private readonly debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x304d3b, metalness: 0.74, roughness: 0.42 });
  private readonly bumpTexture = ridgedMetalBumpTexture();
  private shell: THREE.Mesh;
  private readonly doorHinge = new THREE.Group();
  private door: THREE.Mesh;
  private readonly structuralFrame: THREE.InstancedMesh;
  private frameToppled = false;
  private readonly apertureRims: THREE.InstancedMesh;
  private readonly dents: THREE.InstancedMesh;
  private readonly debris: THREE.InstancedMesh;
  private readonly retiredGeometries = new Set<THREE.BufferGeometry>();
  private topologySignature = '';
  private revision = -1;
  private disposed = false;
  // HF-332: Per-group prewarm generation and promise for interactive-destruction / collapse-debris
  private gpuPrewarmGeneration: number | null = null;
  private gpuPrewarmPromise: Promise<void> | null = null;

  constructor(
    readonly definition: DestructibleShedDefinition,
    readonly placement: ShedPlacement,
    initialState: ShedState,
    private readonly retireGeometryAfterFence?: (geometry: THREE.BufferGeometry) => void,
  ) {
    if (initialState.placementId !== placement.id || placement.definitionId !== definition.id) {
      throw new TypeError('Shed presentation identity mismatch');
    }
    this.root.name = `destructible-shed:${placement.id}`;
    this.root.position.set(placement.position.x, placement.position.y, placement.position.z);
    this.root.rotation.y = placement.yaw;
    this.root.userData.interactiveWorldKind = 'destructible-shed';
    this.root.userData.placementId = placement.id;
    this.root.userData.definitionId = definition.id;
    this.root.userData.materialPolicyId = FIELD_SHED_MATERIAL_POLICY_ID;
    this.root.userData.qualityInvariantMajorFragments = true;

    this.sheetMaterial = new THREE.MeshStandardMaterial({
      color: 0x294a37,
      metalness: 0.76,
      roughness: 0.36,
      side: THREE.DoubleSide,
      bumpMap: this.bumpTexture,
      bumpScale: 0.055,
    });
    this.sheetMaterial.name = FIELD_SHED_MATERIAL_IDS.sheet;
    this.frameMaterial.name = FIELD_SHED_MATERIAL_IDS.frame;
    this.rimMaterial.name = FIELD_SHED_MATERIAL_IDS.apertureRim;
    this.dentMaterial.name = FIELD_SHED_MATERIAL_IDS.dent;
    this.debrisMaterial.name = FIELD_SHED_MATERIAL_IDS.debris;
    this.shell = damageableSheetMesh('field-shed-damageable-shell', new THREE.BufferGeometry(), this.sheetMaterial);
    this.root.add(this.shell);

    this.doorHinge.name = 'field-shed-door-hinge';
    this.door = damageableSheetMesh('field-shed-door-leaf', new THREE.BufferGeometry(), this.sheetMaterial);
    this.doorHinge.add(this.door);
    this.root.add(this.doorHinge);

    const frame = createFrame(this.frameMaterial);
    this.structuralFrame = frame;
    this.root.add(frame);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x3f4741, metalness: 0.22, roughness: 0.82 });
    floorMaterial.name = FIELD_SHED_MATERIAL_IDS.floor;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.1, 4.1), floorMaterial);
    floor.name = 'field-shed-floor';
    floor.position.y = 0.05;
    floor.receiveShadow = true;
    this.root.add(floor);

    this.apertureRims = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.12, 6, 16), this.rimMaterial, SHED_MAX_APERTURES);
    this.apertureRims.name = 'field-shed-aperture-rims';
    this.apertureRims.count = 0;
    this.root.add(this.apertureRims);
    this.dents = new THREE.InstancedMesh(pressedMetalDentGeometry(), this.dentMaterial, SHED_MAX_DENTS);
    this.dents.name = 'field-shed-dents';
    this.dents.userData.deformationModel = 'pressed-metal-geometry-v1';
    this.dents.userData.regionalDamageModel = 'persistent-neighbour-density-v1';
    this.dents.userData.regionalRadiusQ = SHED_DAMAGE_REGION_RADIUS_Q;
    this.dents.setColorAt(0, regionalDamageTint(1));
    this.dents.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.dents.instanceColor!.needsUpdate = true;
    this.dents.userData.instanceColorPrewarmed = true;
    this.dents.count = 0;
    this.dents.castShadow = true;
    this.dents.receiveShadow = true;
    this.root.add(this.dents);
    this.debris = new THREE.InstancedMesh(corrugatedSheetDebrisGeometry(), this.debrisMaterial, SHED_MAX_MAJOR_CHUNKS);
    this.debris.name = 'field-shed-major-debris';
    this.debris.userData.geometryKind = 'definition-scaled-corrugated-sheet-v1';
    this.debris.userData.authorityClass = 'round-persistent-major-fragment';
    this.debris.userData.qualityInvariant = true;
    this.debris.setColorAt(0, debrisTint(definition.preauthoredChunkIds[0]!));
    this.debris.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.debris.instanceColor!.needsUpdate = true;
    this.debris.userData.instanceColorPrewarmed = true;
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

    const topologySignature = presentationTopologySignature(state);
    if (topologySignature !== this.topologySignature) {
      const staticGeometries: THREE.BufferGeometry[] = [];
      for (const surfaceDefinition of this.definition.surfaces) {
        if (surfaceDefinition.role === 'door') continue;
        const surfaceState = state.surfaces.find((surface) => surface.surfaceId === surfaceDefinition.id);
        if (!surfaceState || surfaceState.stage === 'detached') continue;
        staticGeometries.push(transformedPanelGeometry(surfaceDefinition, surfaceState));
      }
      // BufferGeometryUtils assumes at least one source geometry. A structural
      // Carpet Bomber blast legitimately detaches every static panel in one
      // transaction, so preserve an empty shell without entering the merge
      // helper's first-geometry attribute path.
      const shellGeometry = staticGeometries.length > 0
        ? mergeGeometries(staticGeometries, false) ?? new THREE.BufferGeometry()
        : new THREE.BufferGeometry();
      staticGeometries.forEach((geometry) => geometry.dispose());
      const oldShell = this.shell;
      const oldShellGeometry = oldShell.geometry;
      const nextShell = damageableSheetMesh('field-shed-damageable-shell', shellGeometry, this.sheetMaterial);

      const oldDoor = this.door;
      if (oldShellGeometry.getAttribute('position')) this.retireGeometry(oldShellGeometry);
      else oldShellGeometry.dispose();
      const oldDoorGeometry = oldDoor.geometry;
      const nextDoor = damageableSheetMesh(
        'field-shed-door-leaf',
        localPanelGeometry(doorDefinition, doorState),
        this.sheetMaterial,
      );
      nextDoor.visible = doorState.stage !== 'detached';
      if (oldDoorGeometry.getAttribute('position')) this.retireGeometry(oldDoorGeometry);
      else oldDoorGeometry.dispose();

      // Three r185 WebGPU caches vertex buffers on RenderObject identity. Swap
      // the complete Mesh objects synchronously so no stale/empty attribute set
      // can survive a perforate, detach or rematch topology transition.
      this.root.add(nextShell);
      this.doorHinge.add(nextDoor);
      oldShell.removeFromParent();
      oldDoor.removeFromParent();
      this.shell = nextShell;
      this.door = nextDoor;
      this.topologySignature = topologySignature;
    }
    this.doorHinge.position.set(-doorDefinition.frame.halfU, doorDefinition.frame.centre.y, doorDefinition.frame.centre.z);
    this.door.position.set(doorDefinition.frame.halfU, 0, 0);
    this.doorHinge.rotation.y = -state.door.angleQ / SHED_ANGLE_Q * Math.PI / 2;

    let apertureIndex = 0;
    let dentIndex = 0;
    for (const surfaceState of state.surfaces) {
      const canonicalSurface = this.definition.surfaces.find((surface) => surface.id === surfaceState.surfaceId);
      if (!canonicalSurface) continue;
      const surfaceDefinition = surfaceState.stage === 'detached'
        ? detachedPresentationSurfaceDefinition(canonicalSurface, state)
        : presentationSurfaceDefinition(canonicalSurface, state.door.angleQ);
      if (!surfaceDefinition) continue;
      const rotation = panelQuaternion(surfaceDefinition);
      if (surfaceState.stage !== 'detached') {
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
        const regionalDamage = shedRegionalDamageAt(surfaceState, dent.uQ, dent.vQ);
        const severity = Math.max(1, Math.min(4, regionalDamage.markCount));
        const position = apertureLocalPosition(surfaceDefinition, apertureLike);
        if (severity > 1) {
          const spread = radius * Math.min(0.24, (severity - 1) * 0.07);
          const angle = dent.id * Math.PI * (3 - Math.sqrt(5));
          position.addScaledVector(
            new THREE.Vector3(
              surfaceDefinition.frame.uAxis.x,
              surfaceDefinition.frame.uAxis.y,
              surfaceDefinition.frame.uAxis.z,
            ),
            Math.cos(angle) * spread,
          ).addScaledVector(
            new THREE.Vector3(
              surfaceDefinition.frame.vAxis.x,
              surfaceDefinition.frame.vAxis.y,
              surfaceDefinition.frame.vAxis.z,
            ),
            Math.sin(angle) * spread,
          );
        }
        const warpedRadius = radius * (1 + (severity - 1) * 0.09);
        const depth = (0.018 + dent.depthQ / 2_500 * 0.082) * (1 + (severity - 1) * 0.14);
        placeBoxInstance(
          this.dents,
          dentIndex,
          position,
          new THREE.Vector3(warpedRadius, warpedRadius, depth),
          rotation,
        );
        this.dents.setColorAt(dentIndex, regionalDamageTint(severity));
        dentIndex += 1;
      }
    }
    this.apertureRims.count = apertureIndex;
    this.apertureRims.instanceMatrix.needsUpdate = true;
    this.dents.count = dentIndex;
    this.dents.instanceMatrix.needsUpdate = true;
    if (this.dents.instanceColor) this.dents.instanceColor.needsUpdate = true;

    this.debris.visible = true;
    this.debris.count = Math.min(state.majorDebris.length, SHED_MAX_MAJOR_CHUNKS);
    state.majorDebris.slice(0, SHED_MAX_MAJOR_CHUNKS).forEach((chunk, index) => {
      const position = new THREE.Vector3(chunk.poseQ.position.xQ / 1_000, chunk.poseQ.position.yQ / 1_000, chunk.poseQ.position.zQ / 1_000);
      const rotation = new THREE.Quaternion(
        chunk.poseQ.rotation.xQ / SHED_PANEL_COORD_Q,
        chunk.poseQ.rotation.yQ / SHED_PANEL_COORD_Q,
        chunk.poseQ.rotation.zQ / SHED_PANEL_COORD_Q,
        chunk.poseQ.rotation.wQ / SHED_PANEL_COORD_Q,
      ).normalize();
      const extents = shedMajorChunkExtents(this.definition, chunk.chunkId);
      placeBoxInstance(this.debris, index, position, new THREE.Vector3(extents.halfU, extents.halfV, 1), rotation);
      this.debris.setColorAt(index, debrisTint(chunk.chunkId));
    });
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
    // The structural frame is not a separate damage body, but leaving the bare
    // skeleton floating after every panel detaches read as broken geometry.
    // Owner direction: the frame must break too - once the shed is fully
    // obliterated its members topple and lie on the ground as wreckage.
    const staticSurfaces = this.definition.surfaces.filter((surface) => surface.role !== 'door');
    const allStaticDetached = staticSurfaces.length > 0 && staticSurfaces.every((surfaceDefinition) => (
      state.surfaces.find((surface) => surface.surfaceId === surfaceDefinition.id)?.stage === 'detached'
    ));
    if (allStaticDetached && !this.frameToppled) {
      placeToppledFrame(this.structuralFrame);
      this.frameToppled = true;
    } else if (!allStaticDetached && this.frameToppled) {
      SHED_FRAME_PLACEMENTS.forEach(([position, scale, rotation], index) => (
        placeBoxInstance(this.structuralFrame, index, position, scale, rotation)
      ));
      this.structuralFrame.instanceMatrix.needsUpdate = true;
      this.frameToppled = false;
    }
    this.revision = state.revision;
    this.root.userData.worldRevision = state.revision;
  }

  private retireGeometry(geometry: THREE.BufferGeometry): void {
    if (this.retireGeometryAfterFence) this.retireGeometryAfterFence(geometry);
    else this.retiredGeometries.add(geometry);
  }

  // HF-332: Prewarms all presentation resources (sheet, frame, rims, dents, debris) for interactive destruction
  async prewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration = 0,
  ): Promise<void> {
    if (this.gpuPrewarmGeneration === sceneGeneration) return;
    while (this.gpuPrewarmPromise) {
      const pending = this.gpuPrewarmPromise;
      try {
        await pending;
      } catch {
        if (this.gpuPrewarmPromise === pending) this.gpuPrewarmPromise = null;
      }
      if (this.gpuPrewarmGeneration === sceneGeneration) return;
    }
    const operation = this.performGpuPrewarm(runtime, camera, sceneGeneration);
    this.gpuPrewarmPromise = operation;
    try {
      await operation;
    } finally {
      if (this.gpuPrewarmPromise === operation) this.gpuPrewarmPromise = null;
    }
  }

  private async performGpuPrewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration: number,
  ): Promise<void> {
    const parentScene = this.root.parent;
    if (!(parentScene instanceof THREE.Scene)) {
      throw new Error('Destructible shed presentation must be attached to a scene before prewarm');
    }
    const previousRimsCount = this.apertureRims.count;
    const previousDentsCount = this.dents.count;
    const previousDebrisCount = this.debris.count;

    if (this.apertureRims.count === 0) {
      placeBoxInstance(this.apertureRims, 0, new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0.5, 0.5, 0.05));
      this.apertureRims.count = 1;
      this.apertureRims.instanceMatrix.needsUpdate = true;
    }
    if (this.dents.count === 0) {
      placeBoxInstance(this.dents, 0, new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0.5, 0.5, 0.05));
      this.dents.setColorAt(0, regionalDamageTint(1));
      this.dents.count = 1;
      this.dents.instanceMatrix.needsUpdate = true;
      if (this.dents.instanceColor) this.dents.instanceColor.needsUpdate = true;
    }
    if (this.debris.count === 0) {
      placeBoxInstance(this.debris, 0, new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(1, 1, 1));
      this.debris.setColorAt(0, debrisTint(this.definition.preauthoredChunkIds[0] ?? 'chunk-0'));
      this.debris.count = 1;
      this.debris.instanceMatrix.needsUpdate = true;
      if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
    }
    try {
      await runtime.compileAndRender(this.root, camera, parentScene);
      this.gpuPrewarmGeneration = sceneGeneration;
    } finally {
      this.apertureRims.count = previousRimsCount;
      this.apertureRims.instanceMatrix.needsUpdate = true;
      this.dents.count = previousDentsCount;
      this.dents.instanceMatrix.needsUpdate = true;
      if (this.dents.instanceColor) this.dents.instanceColor.needsUpdate = true;
      this.debris.count = previousDebrisCount;
      this.debris.instanceMatrix.needsUpdate = true;
      if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
    }
  }

  telemetry(state: ShedState): ShedPresentationTelemetry {
    const optionalDraws = Number(this.apertureRims.count > 0) + Number(this.dents.count > 0) + Number(this.debris.count > 0);
    return Object.freeze({
      revision: this.revision,
      activeDraws: 4 + optionalDraws,
      apertures: state.surfaces.reduce((sum, surface) => sum + surface.apertures.length, 0),
      dents: state.surfaces.reduce((sum, surface) => sum + surface.dents.length, 0),
      detachedChunks: state.detachedChunkIds.length,
      retiredGeometries: this.retiredGeometries.size,
      frameCollapsed: this.frameToppled,
      prewarmed: this.gpuPrewarmGeneration !== null,
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
    this.retiredGeometries.forEach((geometry) => geometry.dispose());
    this.retiredGeometries.clear();
    materials.forEach((material) => material.dispose());
    this.bumpTexture.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}

export function createFieldShedPresentation(placement: ShedPlacement, state: ShedState): DestructibleShedPresentation {
  return new DestructibleShedPresentation(FIELD_SHED_DEFINITION, placement, state);
}
