import * as THREE from 'three';
import {
  RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS,
  type RenderedVertexInfluenceTelemetry,
  type RiggedOperatorCanonicalEvidenceManifest,
  type RiggedOperatorHandEvidenceIdentity,
} from './operator-model';

export const RIGGED_EVIDENCE_OCCLUDER_MINIMUM_OPACITY = 0.75;

export const RIGGED_HAND_SELF_OCCLUSION_CONTRACT = Object.freeze({
  contract: 'submitted-frame-hand-self-occlusion-v3',
  actorSelfOcclusionIncluded: true,
  actorAttachmentsIncluded: true,
  heldWeaponTerminalHitAccepted: false,
  terminalHandToleranceM: 0.06,
  cameraInsideOpaqueDistanceM: 0.1,
  sentinelNames: Object.freeze(['wrist-hand', 'thumb', 'index', 'middle', 'ring', 'pinky'] as const),
});

export type RiggedEvidenceCaptureTarget = Readonly<{
  kind: 'bot' | 'training-dummy';
  id: string;
}>;

export const RIGGED_EVIDENCE_MAIN_CAMERA_DRAW_CONTRACT = 'rigged-main-camera-draw-stamp-v2';
export const RIGGED_EVIDENCE_HAND_DRAW_ADMISSION_CONTRACT = 'rigged-hand-main-camera-draw-admission-v1';
export const RIGGED_EVIDENCE_PRINCIPAL_WRITE_CONTROL_CONTRACT = 'rigged-principal-write-control-v1';
export const RIGGED_EVIDENCE_RASTER_ROI_CONTRACT = 'rigged-live-deformed-raster-roi-v1';

export type RiggedEvidencePrincipalWriteMode =
  | 'visible-observe'
  | 'principal-write-suppressed'
  | 'visible-restored';

type RiggedEvidenceDrawRange = Readonly<{
  start: number;
  count: number | 'infinity';
  effectiveCount: number;
  positionCount: number;
  indexCount: number | null;
  group: Readonly<{ start: number; count: number; materialIndex: number }> | null;
}>;

type RiggedEvidenceDrawMaterial = Readonly<{
  uuid: string;
  name: string;
  type: string;
  visible: boolean;
  colorWrite: boolean;
  depthWrite: boolean;
  stencilWrite: boolean;
  transparent: boolean;
  opacity: number;
}>;

type RiggedEvidenceDrawWorld = Readonly<{
  attachedToGameplayScene: boolean;
  effectivelyVisible: boolean;
  matrixFinite: boolean;
  determinant: number;
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
}>;

type RiggedEvidenceDrawFrustum = Readonly<{
  frustumCulled: boolean;
  intersectsMainCameraFrustum: boolean;
  boundingSphere: Readonly<{
    center: readonly [number, number, number];
    radius: number;
    finite: boolean;
  }> | null;
}>;

export type RiggedEvidenceMainCameraDrawStamp = Readonly<{
  frame: number;
  captureRevision: number;
  meshUuid: string;
  geometryUuid: string;
  meshName: string;
  actorRootUuid: string;
  operatorRootUuid: string;
  descendsFromActorRoot: boolean;
  descendsFromOperatorRoot: boolean;
  meshLayerMask: number;
  sceneUuid: string;
  cameraUuid: string;
  cameraLayerMask: number;
  sceneOverrideMaterialUuid: string | null;
  material: RiggedEvidenceDrawMaterial;
  materialSlotUuids: readonly string[];
  materialUuidSet: readonly string[];
  materialMatchesMeshSlot: boolean;
  drawRange: RiggedEvidenceDrawRange;
  world: RiggedEvidenceDrawWorld;
  frustum: RiggedEvidenceDrawFrustum;
  stateValid: boolean;
}>;

export type RiggedEvidenceMainCameraMeshDrawReceipt = Readonly<{
  meshUuid: string;
  geometryUuid: string;
  meshName: string;
  materialSlotUuids: readonly string[];
  materialUuidSet: readonly string[];
  meshLayerMask: number;
  beforeCount: number;
  afterCount: number;
  beforeStamps: readonly RiggedEvidenceMainCameraDrawStamp[];
  afterStamps: readonly RiggedEvidenceMainCameraDrawStamp[];
  before: RiggedEvidenceMainCameraDrawStamp | null;
  after: RiggedEvidenceMainCameraDrawStamp | null;
  complete: boolean;
}>;

export type RiggedEvidenceHandDrawBoneReceipt = Readonly<{
  sentinel: 'wrist-hand' | 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
  kind: 'arm' | 'finger';
  side: 'left' | 'right';
  role: 'wrist-hand' | null;
  digit: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky' | null;
  bone: string;
  vertexInfluence: RenderedVertexInfluenceTelemetry | null;
  admittedMeshes: readonly Readonly<{
    mesh: string;
    meshUuid: string;
    geometryUuid: string;
    influencedVertexCount: number;
    maximumNormalizedWeight: number;
    currentFrameBalancedStateValidDraw: boolean;
    meetsThresholds: boolean;
  }>[];
  admittedInfluencedVertexCount: number;
  admittedMaximumNormalizedWeight: number;
  complete: boolean;
}>;

export type RiggedEvidenceTerminalDrawBinding = Readonly<{
  sentinel: string;
  bone: string;
  mesh: string;
  meshUuid: string;
  geometryUuid: string;
  faceIndex: number | null;
  faceElementStart: number | null;
  face: Readonly<{ a: number; b: number; c: number }> | null;
  materialIndex: number | null;
  materialUuid: string | null;
  beforeInvocationKey: string | null;
  afterInvocationKey: string | null;
  drawRange: RiggedEvidenceDrawRange | null;
  complete: boolean;
  failure: string | null;
}>;

export type RiggedEvidenceHandDrawAdmissionReceipt = Readonly<{
  contract: typeof RIGGED_EVIDENCE_HAND_DRAW_ADMISSION_CONTRACT;
  pixelProof: false;
  scope: 'hand';
  actor: RiggedEvidenceCaptureTarget;
  side: 'left' | 'right';
  frame: number;
  captureRevision: number;
  gameplaySceneUuid: string;
  gameplayCameraUuid: string;
  actorRootUuid: string;
  operatorRootUuid: string;
  canonicalManifestContract: 'runtime-canonical-operator-skin-manifest-v1' | null;
  mainCameraDrawContract: typeof RIGGED_EVIDENCE_MAIN_CAMERA_DRAW_CONTRACT;
  influenceContract: 'rendered-joints0-weights0-influence-v2';
  thresholds: typeof RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS;
  expectedBoneCount: 6;
  bones: readonly RiggedEvidenceHandDrawBoneReceipt[];
  admittedMeshCount: number;
  rawExactCanonicalMeshIdentity: boolean;
  rawCallbacksAreCompleteOrExactZero: boolean;
  terminalSurfaceCount: number;
  terminalDrawBindings: readonly RiggedEvidenceTerminalDrawBinding[];
  allRequiredBonesAdmitted: boolean;
  allTerminalSurfacesBound: boolean;
  complete: boolean;
}>;

export type RiggedEvidenceMainCameraActorDrawReceipt = Readonly<{
  contract: typeof RIGGED_EVIDENCE_MAIN_CAMERA_DRAW_CONTRACT;
  pixelProof: false;
  actor: RiggedEvidenceCaptureTarget;
  frame: number;
  captureRevision: number;
  gameplaySceneUuid: string;
  gameplayCameraUuid: string;
  actorRootUuid: string;
  operatorRootUuid: string;
  expectedMeshNames: readonly string[];
  expectedMeshUuids: readonly string[];
  beforeMeshNames: readonly string[];
  afterMeshNames: readonly string[];
  ignoredCallbacks: Readonly<{
    wrongScene: number;
    wrongCamera: number;
    nonWorldCameraLayer: number;
  }>;
  meshes: readonly RiggedEvidenceMainCameraMeshDrawReceipt[];
  exactExpectedMeshNames: boolean;
  exactExpectedMeshUuids: boolean;
  complete: boolean;
}>;

export type RiggedEvidencePrincipalWriteManifestEntry = Readonly<{
  meshUuid: string;
  meshName: string;
  materialUuid: string;
  materialIndex: number | null;
  groupStart: number | null;
  groupCount: number | null;
}>;

export type RiggedEvidencePrincipalWriteControlReceipt = Readonly<{
  contract: typeof RIGGED_EVIDENCE_PRINCIPAL_WRITE_CONTROL_CONTRACT;
  sessionId: string;
  actor: RiggedEvidenceCaptureTarget;
  frame: number;
  captureRevision: number;
  mode: RiggedEvidencePrincipalWriteMode;
  drawManifest: readonly RiggedEvidencePrincipalWriteManifestEntry[];
  suppressionEntries: readonly Readonly<{
    draw: RiggedEvidencePrincipalWriteManifestEntry;
    before: Readonly<{ colorWrite: boolean; depthWrite: boolean; stencilWrite: boolean }>;
    suppressed: Readonly<{ colorWrite: false; depthWrite: false; stencilWrite: false }>;
    suppressedExactly: boolean;
    restoredBy: 'after-render' | 'render-finally' | 'abort' | 'dispose' | null;
    after: Readonly<{ colorWrite: boolean; depthWrite: boolean; stencilWrite: boolean }>;
    restoredExactly: boolean;
  }>[];
  observedDrawCount: number;
  suppressionAppliedCount: number;
  suppressionRestoredAfterCount: number;
  suppressionRestoredFinallyCount: number;
  outstandingSuppressionCount: number;
  renderCallFinalized: boolean;
  suppressionAppliedCountExact: boolean;
  materialStateRestored: boolean;
  failures: readonly string[];
  complete: boolean;
}>;

export type RiggedEvidenceRasterRoiReceipt = Readonly<{
  contract: typeof RIGGED_EVIDENCE_RASTER_ROI_CONTRACT;
  viewport: Readonly<{
    cssWidth: 1600;
    cssHeight: 900;
    devicePixelRatio: 1;
    drawingBufferWidth: 1600;
    drawingBufferHeight: 900;
  }>;
  meshNames: readonly string[];
  meshUuids: readonly string[];
  deformedVertexCount: number;
  frontVertexCount: number;
  inFrameVertexCount: number;
  rounding: 'floor-min-ceil-max-half-open';
  paddingPixels: 0;
  projectedPixelExtrema: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;
  deformedVertexProjectionDigest: Readonly<{
    algorithm: 'fnv1a32-pair-ordered-float64-v1';
    value: string;
  }>;
  roi: Readonly<{ minX: number; minY: number; maxXExclusive: number; maxYExclusive: number }>;
  anchor: Readonly<{
    worldPosition: readonly [number, number, number];
    ndc: readonly [number, number, number];
    pixel: readonly [number, number];
    inside: boolean;
  }>;
  joints: readonly Readonly<{
    kind: unknown;
    side: unknown;
    role: unknown;
    digit: unknown;
    joint: unknown;
    bone: unknown;
    worldPosition: readonly [number, number, number];
    ndc: readonly [number, number, number];
    pixel: readonly [number, number];
    inside: boolean;
  }>[];
  anchorAndSixteenJointsInside: boolean;
}>;

export type RiggedEvidenceMainCameraDrawSession = Readonly<{
  sessionId: string;
  actorReceipt: (
    actor: RiggedEvidenceCaptureTarget,
    actorRoot: THREE.Object3D,
    operatorRoot: THREE.Object3D,
    frame: number,
    captureRevision: number,
  ) => RiggedEvidenceMainCameraActorDrawReceipt | null;
  configurePrincipalWriteControl: (request: Readonly<{
    sessionId: string;
    actor: RiggedEvidenceCaptureTarget;
    captureRevision: number;
    mode: RiggedEvidencePrincipalWriteMode;
  }>) => boolean;
  principalWriteControlReceipt: (
    actor: RiggedEvidenceCaptureTarget,
    frame: number,
    captureRevision: number,
  ) => RiggedEvidencePrincipalWriteControlReceipt | null;
  restorePrincipalWritesAfterRenderCall: () => void;
  abortPrincipalWriteControl: () => void;
  dispose: () => void;
}>;

type MutableRiggedEvidenceMeshDraw = {
  frame: number;
  captureRevision: number;
  beforeCount: number;
  afterCount: number;
  beforeStamps: RiggedEvidenceMainCameraDrawStamp[];
  afterStamps: RiggedEvidenceMainCameraDrawStamp[];
  before: RiggedEvidenceMainCameraDrawStamp | null;
  after: RiggedEvidenceMainCameraDrawStamp | null;
};

type RiggedEvidenceInstrumentedMesh = {
  actor: RiggedEvidenceCaptureTarget;
  actorRoot: THREE.Object3D;
  operatorRoot: THREE.Object3D;
  mesh: THREE.SkinnedMesh;
  originalBeforeRender: THREE.Object3D['onBeforeRender'];
  originalAfterRender: THREE.Object3D['onAfterRender'];
  beforeRender: THREE.Object3D['onBeforeRender'];
  afterRender: THREE.Object3D['onAfterRender'];
  draw: MutableRiggedEvidenceMeshDraw;
};

type MutablePrincipalWriteInvocation = {
  record: RiggedEvidenceInstrumentedMesh;
  material: THREE.Material;
  manifest: RiggedEvidencePrincipalWriteManifestEntry;
  originalColorWrite: boolean;
  originalDepthWrite: boolean;
  originalStencilWrite: boolean;
  suppressedExactly: boolean;
  restored: boolean;
  restoredBy: 'after-render' | 'render-finally' | 'abort' | 'dispose' | null;
  restoredExactly: boolean;
};

type MutablePrincipalWriteFrame = {
  frame: number;
  captureRevision: number;
  observed: RiggedEvidencePrincipalWriteManifestEntry[];
  applied: MutablePrincipalWriteInvocation[];
  restoredAfterCount: number;
  restoredFinallyCount: number;
  renderCallFinalized: boolean;
  failures: string[];
};

type RiggedEvidenceCallbackGroup = Readonly<{
  start?: unknown;
  count?: unknown;
  materialIndex?: unknown;
}> | null | undefined;

function sortedStrings(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function objectEffectivelyVisible(node: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor) {
    if (!cursor.visible) return false;
    cursor = cursor.parent;
  }
  return true;
}

function objectDescendsFrom(node: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor) {
    if (cursor === ancestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

function drawRangeReceipt(
  geometry: THREE.BufferGeometry,
  callbackGroup: RiggedEvidenceCallbackGroup,
): RiggedEvidenceDrawRange {
  const positionCount = geometry.getAttribute('position')?.count ?? 0;
  const indexCount = geometry.index?.count ?? null;
  const availableCount = indexCount ?? positionCount;
  const { start, count } = geometry.drawRange;
  const rangeStart = Number.isFinite(start) && start >= 0 ? start : availableCount;
  const finiteCount = Number.isFinite(count) ? Math.max(0, count) : Math.max(0, availableCount - rangeStart);
  const rangeEnd = Math.min(availableCount, rangeStart + finiteCount);
  const groupValid = callbackGroup !== null && callbackGroup !== undefined
    && typeof callbackGroup.start === 'number' && Number.isSafeInteger(callbackGroup.start) && callbackGroup.start >= 0
    && typeof callbackGroup.count === 'number' && Number.isSafeInteger(callbackGroup.count) && callbackGroup.count >= 0
    && typeof callbackGroup.materialIndex === 'number' && Number.isSafeInteger(callbackGroup.materialIndex)
    && callbackGroup.materialIndex >= 0;
  const group = groupValid ? Object.freeze({
    start: Number(callbackGroup!.start),
    count: Number(callbackGroup!.count),
    materialIndex: Number(callbackGroup!.materialIndex),
  }) : null;
  const groupStart = group?.start ?? 0;
  const groupEnd = Math.min(availableCount, groupStart + (group?.count ?? availableCount));
  return Object.freeze({
    start,
    count: Number.isFinite(count) ? count : 'infinity',
    effectiveCount: Math.max(0, Math.min(rangeEnd, groupEnd) - Math.max(rangeStart, groupStart)),
    positionCount,
    indexCount,
    group,
  });
}

function materialReceipt(material: THREE.Material): RiggedEvidenceDrawMaterial {
  return Object.freeze({
    uuid: material.uuid,
    name: material.name,
    type: material.type,
    visible: material.visible,
    colorWrite: material.colorWrite,
    depthWrite: material.depthWrite,
    stencilWrite: material.stencilWrite,
    transparent: material.transparent,
    opacity: material.opacity,
  });
}

function principalWriteManifestEntry(
  mesh: THREE.SkinnedMesh,
  material: THREE.Material,
  callbackGroup: RiggedEvidenceCallbackGroup,
): RiggedEvidencePrincipalWriteManifestEntry {
  const groupValid = callbackGroup !== null && callbackGroup !== undefined
    && typeof callbackGroup.start === 'number' && Number.isSafeInteger(callbackGroup.start)
    && typeof callbackGroup.count === 'number' && Number.isSafeInteger(callbackGroup.count)
    && typeof callbackGroup.materialIndex === 'number' && Number.isSafeInteger(callbackGroup.materialIndex);
  return Object.freeze({
    meshUuid: mesh.uuid,
    meshName: mesh.name,
    materialUuid: material.uuid,
    materialIndex: groupValid ? Number(callbackGroup!.materialIndex) : null,
    groupStart: groupValid ? Number(callbackGroup!.start) : null,
    groupCount: groupValid ? Number(callbackGroup!.count) : null,
  });
}

function samePrincipalWriteManifestEntry(
  left: RiggedEvidencePrincipalWriteManifestEntry,
  right: RiggedEvidencePrincipalWriteManifestEntry,
): boolean {
  return left.meshUuid === right.meshUuid
    && left.meshName === right.meshName
    && left.materialUuid === right.materialUuid
    && left.materialIndex === right.materialIndex
    && left.groupStart === right.groupStart
    && left.groupCount === right.groupCount;
}

function meshMaterialSlotUuids(mesh: THREE.SkinnedMesh): string[] {
  return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(({ uuid }) => uuid);
}

function meshMaterialUuidSet(mesh: THREE.SkinnedMesh): string[] {
  return sortedStrings(new Set(meshMaterialSlotUuids(mesh)));
}

function mainCameraFrustumReceipt(
  mesh: THREE.SkinnedMesh,
  camera: THREE.Camera,
): RiggedEvidenceDrawFrustum {
  let boundingSphere: RiggedEvidenceDrawFrustum['boundingSphere'] = null;
  let intersectsMainCameraFrustum = false;
  try {
    if (mesh.boundingSphere !== null) {
      const worldSphere = mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
      const center = worldSphere.center.toArray() as [number, number, number];
      const finite = center.every(Number.isFinite) && Number.isFinite(worldSphere.radius) && worldSphere.radius >= 0;
      boundingSphere = Object.freeze({ center: Object.freeze(center), radius: worldSphere.radius, finite });
      const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(projection, camera.coordinateSystem);
      intersectsMainCameraFrustum = finite && frustum.intersectsSphere(worldSphere);
    }
  } catch {
    // A malformed skin/bounds path is evidence failure, not a reason to mutate
    // the actor or relax the draw gate.
  }
  return Object.freeze({
    frustumCulled: mesh.frustumCulled,
    intersectsMainCameraFrustum,
    boundingSphere,
  });
}

function mainCameraDrawStamp(
  mesh: THREE.SkinnedMesh,
  actorRoot: THREE.Object3D,
  operatorRoot: THREE.Object3D,
  gameplayScene: THREE.Scene,
  gameplayCamera: THREE.Camera,
  material: THREE.Material,
  callbackGroup: RiggedEvidenceCallbackGroup,
  frame: number,
  captureRevision: number,
): RiggedEvidenceMainCameraDrawStamp {
  const matrix = mesh.matrixWorld.elements;
  const determinant = mesh.matrixWorld.determinant();
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  mesh.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
  const position = worldPosition.toArray() as [number, number, number];
  const scale = worldScale.toArray() as [number, number, number];
  const matrixFinite = matrix.every(Number.isFinite) && position.every(Number.isFinite) && scale.every(Number.isFinite);
  const world = Object.freeze({
    attachedToGameplayScene: objectDescendsFrom(mesh, gameplayScene),
    effectivelyVisible: objectEffectivelyVisible(mesh),
    matrixFinite,
    determinant,
    position: Object.freeze(position),
    scale: Object.freeze(scale),
  });
  const drawRange = drawRangeReceipt(mesh.geometry, callbackGroup);
  const materialState = materialReceipt(material);
  const sceneOverrideMaterialUuid = gameplayScene.overrideMaterial?.uuid ?? null;
  const materialMatchesMeshSlot = Array.isArray(mesh.material)
    ? drawRange.group !== null && mesh.material[drawRange.group.materialIndex] === material
    : mesh.material === material && (drawRange.group === null || drawRange.group.materialIndex === 0);
  const frustum = mainCameraFrustumReceipt(mesh, gameplayCamera);
  const stateValid = world.attachedToGameplayScene
    && world.effectivelyVisible
    && world.matrixFinite
    && Number.isFinite(world.determinant)
    && Math.abs(world.determinant) > 1e-12
    && objectDescendsFrom(mesh, actorRoot)
    && objectDescendsFrom(mesh, operatorRoot)
    && mesh.layers.test(gameplayCamera.layers)
    && sceneOverrideMaterialUuid === null
    && drawRange.effectiveCount > 0
    && materialMatchesMeshSlot
    && materialState.visible
    && materialState.colorWrite
    && (!materialState.transparent || materialState.opacity > 0)
    && frustum.boundingSphere?.finite === true
    && frustum.intersectsMainCameraFrustum;
  return Object.freeze({
    frame,
    captureRevision,
    meshUuid: mesh.uuid,
    geometryUuid: mesh.geometry.uuid,
    meshName: mesh.name,
    actorRootUuid: actorRoot.uuid,
    operatorRootUuid: operatorRoot.uuid,
    descendsFromActorRoot: objectDescendsFrom(mesh, actorRoot),
    descendsFromOperatorRoot: objectDescendsFrom(mesh, operatorRoot),
    meshLayerMask: mesh.layers.mask,
    sceneUuid: gameplayScene.uuid,
    cameraUuid: gameplayCamera.uuid,
    cameraLayerMask: gameplayCamera.layers.mask,
    sceneOverrideMaterialUuid,
    material: materialState,
    materialSlotUuids: Object.freeze(meshMaterialSlotUuids(mesh)),
    materialUuidSet: Object.freeze(meshMaterialUuidSet(mesh)),
    materialMatchesMeshSlot,
    drawRange,
    world,
    frustum,
    stateValid,
  });
}

function resetMutableDraw(
  draw: MutableRiggedEvidenceMeshDraw,
  frame: number,
  captureRevision: number,
): void {
  if (draw.frame === frame && draw.captureRevision === captureRevision) return;
  Object.assign(draw, {
    frame,
    captureRevision,
    beforeCount: 0,
    afterCount: 0,
    beforeStamps: [],
    afterStamps: [],
    before: null,
    after: null,
  });
}

export function riggedEvidenceMainCameraMeshDrawComplete(
  receipt: RiggedEvidenceMainCameraMeshDrawReceipt,
  frame: number,
  captureRevision: number,
): boolean {
  const invocationKey = (stamp: RiggedEvidenceMainCameraDrawStamp): string => JSON.stringify([
    stamp.material.uuid,
    stamp.drawRange.start,
    stamp.drawRange.count,
    stamp.drawRange.effectiveCount,
    stamp.drawRange.positionCount,
    stamp.drawRange.indexCount,
    stamp.drawRange.group?.start ?? null,
    stamp.drawRange.group?.count ?? null,
    stamp.drawRange.group?.materialIndex ?? null,
  ]);
  const expectedMaterialUuidSet = sortedStrings(new Set(receipt.materialSlotUuids));
  return receipt.beforeCount > 0
    && receipt.beforeCount === receipt.afterCount
    && receipt.beforeStamps.length === receipt.beforeCount
    && receipt.afterStamps.length === receipt.afterCount
    && receipt.before !== null
    && receipt.after !== null
    && receipt.before === receipt.beforeStamps.at(-1)
    && receipt.after === receipt.afterStamps.at(-1)
    && receipt.before.frame === frame
    && receipt.after.frame === frame
    && receipt.before.captureRevision === captureRevision
    && receipt.after.captureRevision === captureRevision
    && receipt.before.meshUuid === receipt.meshUuid
    && receipt.after.meshUuid === receipt.meshUuid
    && receipt.before.geometryUuid === receipt.geometryUuid
    && receipt.after.geometryUuid === receipt.geometryUuid
    && receipt.before.meshName === receipt.meshName
    && receipt.after.meshName === receipt.meshName
    && receipt.materialSlotUuids.length > 0
    && sameStrings(receipt.materialUuidSet, expectedMaterialUuidSet)
    && sameStrings(receipt.before.materialSlotUuids, receipt.materialSlotUuids)
    && sameStrings(receipt.after.materialSlotUuids, receipt.materialSlotUuids)
    && sameStrings(receipt.before.materialUuidSet, receipt.materialUuidSet)
    && sameStrings(receipt.after.materialUuidSet, receipt.materialUuidSet)
    && receipt.beforeStamps.every((stamp) => stamp.frame === frame
      && stamp.captureRevision === captureRevision
      && stamp.meshUuid === receipt.meshUuid
      && stamp.geometryUuid === receipt.geometryUuid
      && stamp.meshName === receipt.meshName
      && sameStrings(stamp.materialSlotUuids, receipt.materialSlotUuids)
      && sameStrings(stamp.materialUuidSet, receipt.materialUuidSet)
      && stamp.stateValid)
    && receipt.afterStamps.every((stamp) => stamp.frame === frame
      && stamp.captureRevision === captureRevision
      && stamp.meshUuid === receipt.meshUuid
      && stamp.geometryUuid === receipt.geometryUuid
      && stamp.meshName === receipt.meshName
      && sameStrings(stamp.materialSlotUuids, receipt.materialSlotUuids)
      && sameStrings(stamp.materialUuidSet, receipt.materialUuidSet)
      && stamp.stateValid)
    && sameStrings(
      sortedStrings(receipt.beforeStamps.map(invocationKey)),
      sortedStrings(receipt.afterStamps.map(invocationKey)),
    )
    && new Set(receipt.beforeStamps.map(invocationKey)).size === receipt.beforeStamps.length
    && new Set(receipt.afterStamps.map(invocationKey)).size === receipt.afterStamps.length;
}

export function riggedEvidenceMainCameraActorDrawComplete(
  receipt: RiggedEvidenceMainCameraActorDrawReceipt,
): boolean {
  const expectedNames = sortedStrings(receipt.meshes.map(({ meshName }) => meshName));
  const expectedUuids = sortedStrings(receipt.meshes.map(({ meshUuid }) => meshUuid));
  const beforeNames = sortedStrings(receipt.meshes.filter(({ before }) => before !== null).map(({ meshName }) => meshName));
  const afterNames = sortedStrings(receipt.meshes.filter(({ after }) => after !== null).map(({ meshName }) => meshName));
  return receipt.contract === RIGGED_EVIDENCE_MAIN_CAMERA_DRAW_CONTRACT
    && receipt.pixelProof === false
    && receipt.meshes.length > 0
    && sameStrings(receipt.expectedMeshNames, expectedNames)
    && sameStrings(receipt.expectedMeshUuids, expectedUuids)
    && sameStrings(receipt.beforeMeshNames, beforeNames)
    && sameStrings(receipt.afterMeshNames, afterNames)
    && sameStrings(receipt.expectedMeshNames, receipt.beforeMeshNames)
    && sameStrings(receipt.expectedMeshNames, receipt.afterMeshNames)
    && receipt.exactExpectedMeshNames
    && receipt.exactExpectedMeshUuids
    && receipt.meshes.every((mesh) => (
      [...mesh.beforeStamps, ...mesh.afterStamps].every((stamp) => (
        stamp.actorRootUuid === receipt.actorRootUuid
          && stamp.operatorRootUuid === receipt.operatorRootUuid
          && stamp.descendsFromActorRoot
          && stamp.descendsFromOperatorRoot
          && stamp.sceneUuid === receipt.gameplaySceneUuid
          && stamp.cameraUuid === receipt.gameplayCameraUuid
          && stamp.sceneOverrideMaterialUuid === null
      ))
        && riggedEvidenceMainCameraMeshDrawComplete(mesh, receipt.frame, receipt.captureRevision)
    ));
}

const RIGGED_EVIDENCE_HAND_DRAW_BONES = Object.freeze([
  Object.freeze({ sentinel: 'wrist-hand' as const, kind: 'arm' as const, role: 'wrist-hand' as const, digit: null }),
  Object.freeze({ sentinel: 'thumb' as const, kind: 'finger' as const, role: null, digit: 'thumb' as const }),
  Object.freeze({ sentinel: 'index' as const, kind: 'finger' as const, role: null, digit: 'index' as const }),
  Object.freeze({ sentinel: 'middle' as const, kind: 'finger' as const, role: null, digit: 'middle' as const }),
  Object.freeze({ sentinel: 'ring' as const, kind: 'finger' as const, role: null, digit: 'ring' as const }),
  Object.freeze({ sentinel: 'pinky' as const, kind: 'finger' as const, role: null, digit: 'pinky' as const }),
] as const);

function exactZeroMainCameraMeshDraw(receipt: RiggedEvidenceMainCameraMeshDrawReceipt): boolean {
  return receipt.beforeCount === 0
    && receipt.afterCount === 0
    && receipt.beforeStamps.length === 0
    && receipt.afterStamps.length === 0
    && receipt.before === null
    && receipt.after === null
    && receipt.complete === false;
}

function handDrawInvocationKey(stamp: RiggedEvidenceMainCameraDrawStamp): string {
  return JSON.stringify([
    stamp.material.uuid,
    stamp.drawRange.start,
    stamp.drawRange.count,
    stamp.drawRange.effectiveCount,
    stamp.drawRange.positionCount,
    stamp.drawRange.indexCount,
    stamp.drawRange.group?.start ?? null,
    stamp.drawRange.group?.count ?? null,
    stamp.drawRange.group?.materialIndex ?? null,
  ]);
}

function handDrawStampCoversFace(
  stamp: RiggedEvidenceMainCameraDrawStamp,
  faceIndex: number,
  materialIndex: number,
): boolean {
  if (!Number.isSafeInteger(faceIndex) || faceIndex < 0
    || !Number.isSafeInteger(materialIndex) || materialIndex < 0) return false;
  const faceElementStart = faceIndex * 3;
  if (!Number.isSafeInteger(faceElementStart)) return false;
  const { drawRange } = stamp;
  const availableCount = drawRange.indexCount ?? drawRange.positionCount;
  if (!Number.isSafeInteger(availableCount) || availableCount < 1
    || !Number.isSafeInteger(drawRange.start) || drawRange.start < 0) return false;
  const drawCount = drawRange.count === 'infinity'
    ? Math.max(0, availableCount - drawRange.start)
    : drawRange.count;
  if (!Number.isSafeInteger(drawCount) || drawCount < 0) return false;
  const drawEnd = Math.min(availableCount, drawRange.start + drawCount);
  const group = drawRange.group;
  const groupStart = group?.start ?? 0;
  const groupCount = group?.count ?? availableCount;
  const groupMaterialIndex = group?.materialIndex ?? 0;
  if (!Number.isSafeInteger(groupStart) || groupStart < 0
    || !Number.isSafeInteger(groupCount) || groupCount < 0
    || groupMaterialIndex !== materialIndex) return false;
  const groupEnd = Math.min(availableCount, groupStart + groupCount);
  const admittedStart = Math.max(drawRange.start, groupStart);
  const admittedEnd = Math.min(drawEnd, groupEnd);
  return faceElementStart >= admittedStart
    && faceElementStart + 3 <= admittedEnd
    && stamp.materialSlotUuids[materialIndex] === stamp.material.uuid;
}

function handDrawExpectedBoneName(
  side: 'left' | 'right',
  sentinel: typeof RIGGED_EVIDENCE_HAND_DRAW_BONES[number]['sentinel'],
): string {
  const suffix = side === 'left' ? 'L' : 'R';
  if (sentinel === 'wrist-hand') return `Wrist${suffix}`;
  return `${sentinel[0].toUpperCase()}${sentinel.slice(1)}2${suffix}`;
}

function handDrawBoneDescendsFromWrist(
  skeletonBones: RiggedOperatorCanonicalEvidenceManifest['skinnedMeshes'][number]['skeletonBones'],
  boneName: string,
  boneUuid: string,
  wristUuid: string,
): boolean {
  const matchingIndices = skeletonBones.flatMap((bone, index) => (
    bone.name === boneName && bone.uuid === boneUuid && bone.index === index ? [index] : []
  ));
  if (matchingIndices.length !== 1) return false;
  const visited = new Set<number>();
  let cursor = matchingIndices[0];
  while (Number.isSafeInteger(cursor) && cursor >= 0 && cursor < skeletonBones.length
    && !visited.has(cursor)) {
    visited.add(cursor);
    const bone = skeletonBones[cursor];
    if (bone.uuid === wristUuid) return true;
    cursor = bone.parentIndex;
  }
  return false;
}

export function buildRiggedEvidenceHandDrawAdmission(
  draw: RiggedEvidenceMainCameraActorDrawReceipt | null,
  manifest: RiggedOperatorCanonicalEvidenceManifest | null,
  side: 'left' | 'right',
  joints: readonly Readonly<Record<string, unknown>>[],
  selfOcclusionSentinels: readonly Readonly<Record<string, unknown>>[],
): RiggedEvidenceHandDrawAdmissionReceipt {
  const manifestNames = manifest ? sortedStrings(manifest.skinnedMeshes.map(({ name }) => name)) : [];
  const manifestUuids = manifest ? sortedStrings(manifest.skinnedMeshes.map(({ uuid }) => uuid)) : [];
  const rawExactCanonicalMeshIdentity = draw !== null && manifest !== null
    && draw.contract === RIGGED_EVIDENCE_MAIN_CAMERA_DRAW_CONTRACT
    && draw.meshes.length === manifest.skinnedMeshes.length
    && sameStrings(draw.expectedMeshNames, manifestNames)
    && sameStrings(draw.expectedMeshUuids, manifestUuids)
    && new Set(draw.meshes.map(({ meshName }) => meshName)).size === draw.meshes.length
    && new Set(draw.meshes.map(({ meshUuid }) => meshUuid)).size === draw.meshes.length
    && draw.meshes.every((mesh) => manifest.skinnedMeshes.some((candidate) => (
      candidate.name === mesh.meshName
        && candidate.uuid === mesh.meshUuid
        && candidate.geometryUuid === mesh.geometryUuid
    )));
  const stampBindsRawDraw = (stamp: RiggedEvidenceMainCameraDrawStamp): boolean => draw !== null
    && stamp.actorRootUuid === draw.actorRootUuid
    && stamp.operatorRootUuid === draw.operatorRootUuid
    && stamp.descendsFromActorRoot
    && stamp.descendsFromOperatorRoot
    && stamp.sceneUuid === draw.gameplaySceneUuid
    && stamp.cameraUuid === draw.gameplayCameraUuid
    && stamp.sceneOverrideMaterialUuid === null;
  const rawCallbacksAreCompleteOrExactZero = draw !== null && draw.meshes.every((mesh) => {
    const recomputedComplete = riggedEvidenceMainCameraMeshDrawComplete(mesh, draw.frame, draw.captureRevision);
    const canonicalMatches = manifest?.skinnedMeshes.filter((candidate) => (
      candidate.name === mesh.meshName
        && candidate.uuid === mesh.meshUuid
        && candidate.geometryUuid === mesh.geometryUuid
    )) ?? [];
    return canonicalMatches.length === 1
      && [...mesh.beforeStamps, ...mesh.afterStamps].every((stamp) => (
        stamp.drawRange.positionCount === canonicalMatches[0].positionCount
      ))
      && mesh.complete === recomputedComplete
      && [...mesh.beforeStamps, ...mesh.afterStamps].every(stampBindsRawDraw)
      && (recomputedComplete || exactZeroMainCameraMeshDraw(mesh));
  }) && sameStrings(
    draw.beforeMeshNames,
    sortedStrings(draw.meshes.filter(({ beforeCount }) => beforeCount > 0).map(({ meshName }) => meshName)),
  ) && sameStrings(
    draw.afterMeshNames,
    sortedStrings(draw.meshes.filter(({ afterCount }) => afterCount > 0).map(({ meshName }) => meshName)),
  ) && draw.exactExpectedMeshNames === (
    sameStrings(draw.expectedMeshNames, draw.beforeMeshNames)
      && sameStrings(draw.expectedMeshNames, draw.afterMeshNames)
  ) && draw.exactExpectedMeshUuids === draw.meshes.every((mesh) => (
    riggedEvidenceMainCameraMeshDrawComplete(mesh, draw.frame, draw.captureRevision)
  )) && draw.complete === riggedEvidenceMainCameraActorDrawComplete(draw)
    && Number.isSafeInteger(draw.ignoredCallbacks.wrongScene) && draw.ignoredCallbacks.wrongScene >= 0
    && Number.isSafeInteger(draw.ignoredCallbacks.wrongCamera) && draw.ignoredCallbacks.wrongCamera >= 0
    && Number.isSafeInteger(draw.ignoredCallbacks.nonWorldCameraLayer)
    && draw.ignoredCallbacks.nonWorldCameraLayer >= 0;
  const admittedMeshCount = draw?.meshes.filter((mesh) => (
    riggedEvidenceMainCameraMeshDrawComplete(mesh, draw.frame, draw.captureRevision)
  )).length ?? 0;

  const bones = Object.freeze(RIGGED_EVIDENCE_HAND_DRAW_BONES.map((expected): RiggedEvidenceHandDrawBoneReceipt => {
    const expectedBone = handDrawExpectedBoneName(side, expected.sentinel);
    const expectedWristName = `Wrist${side === 'left' ? 'L' : 'R'}`;
    const expectedWristUuids = manifest?.wrists.filter((wrist) => (
      wrist.side === side && wrist.name === expectedWristName
    )).map(({ uuid }) => uuid) ?? [];
    const matches = joints.filter((joint) => joint.side === side
      && joint.kind === expected.kind
      && joint.role === expected.role
      && joint.digit === expected.digit
      && joint.bone === expectedBone);
    const influence = matches.length === 1
      ? matches[0].vertexInfluence as RenderedVertexInfluenceTelemetry | null | undefined
      : null;
    const thresholdsMatch = influence?.thresholds?.minimumNormalizedWeight
        === RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumNormalizedWeight
      && influence?.thresholds?.minimumInfluencedVertices
        === RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumInfluencedVertices
      && influence?.thresholds?.minimumMaximumNormalizedWeight
        === RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumMaximumNormalizedWeight;
    const influenceEntriesValid = Array.isArray(influence?.meshes)
      && influence.meshes.every((entry) => typeof entry.mesh === 'string' && entry.mesh.length > 0
        && typeof entry.meshUuid === 'string' && entry.meshUuid.length > 0
        && typeof entry.geometryUuid === 'string' && entry.geometryUuid.length > 0
        && Number.isSafeInteger(entry.influencedVertexCount) && entry.influencedVertexCount >= 0
        && Number.isFinite(entry.maximumNormalizedWeight) && entry.maximumNormalizedWeight >= 0
        && entry.maximumNormalizedWeight <= 1
        && (entry.influencedVertexCount > 0 || entry.maximumNormalizedWeight > 0)
        && (entry.influencedVertexCount > 0) === (
          entry.maximumNormalizedWeight
            >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumNormalizedWeight
        )
        && expectedWristUuids.length === 1
        && manifest?.skinnedMeshes.filter((candidate) => candidate.name === entry.mesh
          && candidate.uuid === entry.meshUuid
          && candidate.geometryUuid === entry.geometryUuid
          && handDrawBoneDescendsFromWrist(
            candidate.skeletonBones,
            expectedBone,
            influence?.boneUuid ?? '',
            expectedWristUuids[0],
          )
          && entry.influencedVertexCount <= candidate.positionCount).length === 1);
    const recomputedInfluencedVertexCount = influenceEntriesValid
      ? influence!.meshes.reduce((sum, entry) => sum + entry.influencedVertexCount, 0)
      : -1;
    const recomputedMaximumNormalizedWeight = influenceEntriesValid && influence!.meshes.length > 0
      ? Math.max(...influence!.meshes.map(({ maximumNormalizedWeight }) => maximumNormalizedWeight))
      : 0;
    const recomputedPasses = recomputedInfluencedVertexCount
        >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumInfluencedVertices
      && recomputedMaximumNormalizedWeight
        >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumMaximumNormalizedWeight;
    const influenceShapeValid = influence?.contract === 'rendered-joints0-weights0-influence-v2'
      && influence.bone === expectedBone
      && typeof influence.boneUuid === 'string' && influence.boneUuid.length > 0
      && expectedWristUuids.length === 1
      && (expected.sentinel !== 'wrist-hand' || expectedWristUuids[0] === influence.boneUuid)
      && thresholdsMatch
      && influenceEntriesValid
      && Number.isSafeInteger(recomputedInfluencedVertexCount)
      && influence.passes === recomputedPasses
      && Number.isSafeInteger(influence.influencedVertexCount)
      && influence.influencedVertexCount === recomputedInfluencedVertexCount
      && Number.isFinite(influence.maximumNormalizedWeight)
      && influence.maximumNormalizedWeight === recomputedMaximumNormalizedWeight
      && new Set(influence.meshes.map(({ meshUuid, geometryUuid }) => `${meshUuid}:${geometryUuid}`)).size
        === influence.meshes.length;
    const admittedMeshes = Object.freeze((influenceShapeValid ? influence!.meshes : []).flatMap((entry) => {
      const canonicalMatches = manifest?.skinnedMeshes.filter((candidate) => (
        candidate.name === entry.mesh
          && candidate.uuid === entry.meshUuid
          && candidate.geometryUuid === entry.geometryUuid
      )) ?? [];
      const drawMatches = draw?.meshes.filter((candidate) => (
        candidate.meshName === entry.mesh
          && candidate.meshUuid === entry.meshUuid
          && candidate.geometryUuid === entry.geometryUuid
      )) ?? [];
      const currentFrameBalancedStateValidDraw = canonicalMatches.length === 1
        && drawMatches.length === 1
        && draw !== null
        && riggedEvidenceMainCameraMeshDrawComplete(drawMatches[0], draw.frame, draw.captureRevision);
      if (!currentFrameBalancedStateValidDraw) return [];
      const meetsThresholds = Number.isSafeInteger(entry.influencedVertexCount)
        && entry.influencedVertexCount >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumInfluencedVertices
        && Number.isFinite(entry.maximumNormalizedWeight)
        && entry.maximumNormalizedWeight
          >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumMaximumNormalizedWeight;
      return [Object.freeze({
        ...entry,
        currentFrameBalancedStateValidDraw,
        meetsThresholds,
      })];
    }));
    const admittedInfluencedVertexCount = admittedMeshes.reduce((sum, entry) => (
      sum + entry.influencedVertexCount
    ), 0);
    const admittedMaximumNormalizedWeight = admittedMeshes.length > 0
      ? Math.max(...admittedMeshes.map(({ maximumNormalizedWeight }) => maximumNormalizedWeight))
      : 0;
    return Object.freeze({
      sentinel: expected.sentinel,
      kind: expected.kind,
      side,
      role: expected.role,
      digit: expected.digit,
      bone: expectedBone,
      vertexInfluence: influenceShapeValid ? influence! : null,
      admittedMeshes,
      admittedInfluencedVertexCount,
      admittedMaximumNormalizedWeight,
      complete: matches.length === 1
        && influenceShapeValid
        && admittedMeshes.length > 0
        && Number.isSafeInteger(admittedInfluencedVertexCount)
        && admittedInfluencedVertexCount
          >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumInfluencedVertices
        && admittedMaximumNormalizedWeight
          >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumMaximumNormalizedWeight,
    });
  }));

  const terminalSentinels = selfOcclusionSentinels.filter((sentinel) => {
    const blocker = sentinel.blocker as Readonly<Record<string, unknown>> | null | undefined;
    return blocker?.reason === 'terminal-hand-surface';
  });
  const terminalDrawBindings = Object.freeze(terminalSentinels.map((sentinel): RiggedEvidenceTerminalDrawBinding => {
    const blocker = sentinel.blocker as Readonly<Record<string, unknown>>;
    const meshName = typeof blocker.mesh === 'string' ? blocker.mesh : '';
    const meshUuid = typeof blocker.meshUuid === 'string' ? blocker.meshUuid : '';
    const geometryUuid = typeof blocker.geometryUuid === 'string' ? blocker.geometryUuid : '';
    const faceIndex = Number.isSafeInteger(blocker.faceIndex) ? blocker.faceIndex as number : null;
    const materialIndex = Number.isSafeInteger(blocker.materialIndex) ? blocker.materialIndex as number : null;
    const faceValue = blocker.face as Readonly<Record<string, unknown>> | null | undefined;
    const face = faceValue && [faceValue.a, faceValue.b, faceValue.c].every((value) => (
      Number.isSafeInteger(value) && (value as number) >= 0
    )) ? Object.freeze({
        a: faceValue.a as number,
        b: faceValue.b as number,
        c: faceValue.c as number,
      }) : null;
    const faceElementStart = faceIndex === null ? null : faceIndex * 3;
    const canonicalMatches = manifest?.skinnedMeshes.filter((candidate) => (
      candidate.name === meshName && candidate.uuid === meshUuid && candidate.geometryUuid === geometryUuid
    )) ?? [];
    const drawMatches = draw?.meshes.filter((candidate) => (
      candidate.meshName === meshName
        && candidate.meshUuid === meshUuid
        && candidate.geometryUuid === geometryUuid
    )) ?? [];
    const meshDraw = drawMatches.length === 1 ? drawMatches[0] : null;
    const meshComplete = meshDraw !== null && draw !== null
      && riggedEvidenceMainCameraMeshDrawComplete(meshDraw, draw.frame, draw.captureRevision);
    const beforeMatches = meshComplete && faceIndex !== null && materialIndex !== null
      ? meshDraw.beforeStamps.filter((stamp) => handDrawStampCoversFace(stamp, faceIndex, materialIndex))
      : [];
    const afterMatches = meshComplete && faceIndex !== null && materialIndex !== null
      ? meshDraw.afterStamps.filter((stamp) => handDrawStampCoversFace(stamp, faceIndex, materialIndex))
      : [];
    const before = beforeMatches.length === 1 ? beforeMatches[0] : null;
    const after = afterMatches.length === 1 ? afterMatches[0] : null;
    const beforeInvocationKey = before ? handDrawInvocationKey(before) : null;
    const afterInvocationKey = after ? handDrawInvocationKey(after) : null;
    const beforeAfterDrawRangeMatches = before !== null && after !== null
      && JSON.stringify(before.drawRange) === JSON.stringify(after.drawRange);
    const faceWithinCanonicalPositions = face !== null && canonicalMatches.length === 1
      && [face.a, face.b, face.c].every((vertex) => vertex < canonicalMatches[0].positionCount);
    const complete = canonicalMatches.length === 1
      && meshComplete
      && faceIndex !== null && faceIndex >= 0 && Number.isSafeInteger(faceElementStart)
      && faceWithinCanonicalPositions
      && materialIndex !== null && materialIndex >= 0
      && before !== null && after !== null
      && beforeAfterDrawRangeMatches
      && beforeInvocationKey === afterInvocationKey;
    const failure = complete ? null
      : canonicalMatches.length !== 1 ? 'terminal-mesh-not-canonical'
        : !meshComplete ? 'terminal-mesh-not-current-frame-balanced-draw'
          : faceIndex === null || faceIndex < 0 ? 'terminal-face-index-invalid'
            : face === null ? 'terminal-face-invalid'
              : !faceWithinCanonicalPositions ? 'terminal-face-outside-canonical-geometry'
              : materialIndex === null || materialIndex < 0 ? 'terminal-material-index-invalid'
                : beforeMatches.length !== 1 || afterMatches.length !== 1
                  ? 'terminal-face-not-in-exact-draw-range-group'
                  : !beforeAfterDrawRangeMatches ? 'terminal-before-after-draw-range-mismatch'
                  : 'terminal-before-after-invocation-mismatch';
    return Object.freeze({
      sentinel: typeof sentinel.name === 'string' ? sentinel.name : '',
      bone: typeof sentinel.bone === 'string' ? sentinel.bone : '',
      mesh: meshName,
      meshUuid,
      geometryUuid,
      faceIndex,
      faceElementStart: Number.isSafeInteger(faceElementStart) ? faceElementStart : null,
      face,
      materialIndex,
      materialUuid: before?.material.uuid ?? null,
      beforeInvocationKey,
      afterInvocationKey,
      drawRange: before?.drawRange ?? null,
      complete,
      failure,
    });
  }));
  const allRequiredBonesAdmitted = bones.length === 6 && bones.every(({ complete }) => complete);
  const allTerminalSurfacesBound = terminalDrawBindings.length === terminalSentinels.length
    && terminalSentinels.length > 0
    && terminalDrawBindings.every(({ complete }) => complete);
  const complete = draw !== null
    && manifest !== null
    && draw.actor.kind.length > 0 && draw.actor.id.length > 0
    && rawExactCanonicalMeshIdentity
    && rawCallbacksAreCompleteOrExactZero
    && admittedMeshCount > 0
    && allRequiredBonesAdmitted
    && allTerminalSurfacesBound;
  return Object.freeze({
    contract: RIGGED_EVIDENCE_HAND_DRAW_ADMISSION_CONTRACT,
    pixelProof: false,
    scope: 'hand',
    actor: Object.freeze({ ...(draw?.actor ?? { kind: 'bot' as const, id: '' }) }),
    side,
    frame: draw?.frame ?? -1,
    captureRevision: draw?.captureRevision ?? -1,
    gameplaySceneUuid: draw?.gameplaySceneUuid ?? '',
    gameplayCameraUuid: draw?.gameplayCameraUuid ?? '',
    actorRootUuid: draw?.actorRootUuid ?? '',
    operatorRootUuid: draw?.operatorRootUuid ?? '',
    canonicalManifestContract: manifest?.contract ?? null,
    mainCameraDrawContract: RIGGED_EVIDENCE_MAIN_CAMERA_DRAW_CONTRACT,
    influenceContract: 'rendered-joints0-weights0-influence-v2',
    thresholds: RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS,
    expectedBoneCount: 6,
    bones,
    admittedMeshCount,
    rawExactCanonicalMeshIdentity,
    rawCallbacksAreCompleteOrExactZero,
    terminalSurfaceCount: terminalSentinels.length,
    terminalDrawBindings,
    allRequiredBonesAdmitted,
    allTerminalSurfacesBound,
    complete,
  });
}

export function projectRiggedEvidenceLiveDeformedRasterRoi(
  operatorRoot: THREE.Object3D,
  gameplayCamera: THREE.Camera,
  expectedMeshNames: readonly string[],
  anchorWorldPosition: readonly number[],
  jointScreenPositions: readonly Readonly<Record<string, unknown>>[],
): RiggedEvidenceRasterRoiReceipt | null {
  const viewport = Object.freeze({
    cssWidth: 1600 as const,
    cssHeight: 900 as const,
    devicePixelRatio: 1 as const,
    drawingBufferWidth: 1600 as const,
    drawingBufferHeight: 900 as const,
  });
  const meshes: THREE.SkinnedMesh[] = [];
  operatorRoot.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh
      && node.userData.authoritativeProxy !== true
      && objectEffectivelyVisible(node)) meshes.push(node);
  });
  meshes.sort((left, right) => left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid));
  const sortedExpectedNames = sortedStrings(expectedMeshNames);
  if (meshes.length < 1
    || !sameStrings(sortedStrings(meshes.map(({ name }) => name)), sortedExpectedNames)
    || new Set(meshes.map(({ name }) => name)).size !== meshes.length
    || !Array.isArray(anchorWorldPosition)
    || anchorWorldPosition.length !== 3
    || !anchorWorldPosition.every((value) => typeof value === 'number' && Number.isFinite(value))
    || jointScreenPositions.length !== 16) return null;

  const minimumNdcDepth = gameplayCamera.coordinateSystem === THREE.WebGPUCoordinateSystem
    ? 0
    : gameplayCamera.coordinateSystem === THREE.WebGLCoordinateSystem
      ? -1
      : null;
  if (minimumNdcDepth === null) return null;

  const projectWorld = (world: THREE.Vector3) => {
    const ndcVector = world.clone().project(gameplayCamera);
    const ndc = ndcVector.toArray() as [number, number, number];
    const pixel = [
      (ndc[0] + 1) * 0.5 * viewport.drawingBufferWidth,
      (1 - ndc[1]) * 0.5 * viewport.drawingBufferHeight,
    ] as [number, number];
    return { ndc, pixel };
  };
  const finiteInViewport = ({ ndc, pixel }: Readonly<{
    ndc: readonly number[];
    pixel: readonly number[];
  }>) => ndc.length === 3
    && pixel.length === 2
    && [...ndc, ...pixel].every(Number.isFinite)
    && ndc[2] >= minimumNdcDepth && ndc[2] <= 1
    && pixel[0] >= 0 && pixel[0] < viewport.drawingBufferWidth
    && pixel[1] >= 0 && pixel[1] < viewport.drawingBufferHeight;

  const projectedVertices: Array<{ ndc: [number, number, number]; pixel: [number, number] }> = [];
  let vertexDigestA = 0x811c9dc5;
  let vertexDigestB = 0x9e3779b9;
  const digestBytes = new DataView(new ArrayBuffer(8));
  const digestByte = (value: number) => {
    vertexDigestA = Math.imul(vertexDigestA ^ value, 0x01000193) >>> 0;
    vertexDigestB = Math.imul(vertexDigestB ^ value, 0x85ebca6b) >>> 0;
  };
  const digestUint32 = (value: number) => {
    digestBytes.setUint32(0, value, true);
    for (let byte = 0; byte < 4; byte += 1) digestByte(digestBytes.getUint8(byte));
  };
  const digestFloat64 = (value: number) => {
    digestBytes.setFloat64(0, value, true);
    for (let byte = 0; byte < 8; byte += 1) digestByte(digestBytes.getUint8(byte));
  };
  const digestString = (value: string) => {
    digestUint32(value.length);
    for (let index = 0; index < value.length; index += 1) digestUint32(value.charCodeAt(index));
  };
  const localVertex = new THREE.Vector3();
  for (const mesh of meshes) {
    const positionCount = mesh.geometry.getAttribute('position')?.count ?? 0;
    if (positionCount < 1 || !mesh.matrixWorld.elements.every(Number.isFinite)) return null;
    digestString(mesh.name);
    digestString(mesh.uuid);
    digestUint32(positionCount);
    for (let index = 0; index < positionCount; index += 1) {
      // getVertexPosition evaluates morph targets and the live skeleton. Applying
      // the already-submitted matrixWorld avoids touching renderer-owned bounds.
      mesh.getVertexPosition(index, localVertex);
      const worldVertex = localVertex.clone().applyMatrix4(mesh.matrixWorld);
      const projected = projectWorld(worldVertex);
      if (!finiteInViewport(projected)) return null;
      digestUint32(index);
      worldVertex.toArray().forEach(digestFloat64);
      projected.ndc.forEach(digestFloat64);
      projectedVertices.push(projected);
    }
  }
  if (projectedVertices.length < 1) return null;
  const minProjectedX = Math.min(...projectedVertices.map(({ pixel }) => pixel[0]));
  const minProjectedY = Math.min(...projectedVertices.map(({ pixel }) => pixel[1]));
  const maxProjectedX = Math.max(...projectedVertices.map(({ pixel }) => pixel[0]));
  const maxProjectedY = Math.max(...projectedVertices.map(({ pixel }) => pixel[1]));
  const roi = Object.freeze({
    minX: Math.floor(minProjectedX),
    minY: Math.floor(minProjectedY),
    maxXExclusive: Math.ceil(maxProjectedX),
    maxYExclusive: Math.ceil(maxProjectedY),
  });
  const projectedPixelExtrema = Object.freeze({
    minX: minProjectedX,
    minY: minProjectedY,
    maxX: maxProjectedX,
    maxY: maxProjectedY,
  });
  const deformedVertexProjectionDigest = Object.freeze({
    algorithm: 'fnv1a32-pair-ordered-float64-v1' as const,
    value: `${vertexDigestA.toString(16).padStart(8, '0')}${vertexDigestB.toString(16).padStart(8, '0')}`,
  });
  const pointInside = (pixel: readonly number[]) => pixel[0] >= roi.minX
    && pixel[0] < roi.maxXExclusive
    && pixel[1] >= roi.minY
    && pixel[1] < roi.maxYExclusive;
  const anchorProjected = projectWorld(new THREE.Vector3().fromArray(anchorWorldPosition as number[]));
  if (!finiteInViewport(anchorProjected)) return null;
  const anchor = Object.freeze({
    worldPosition: Object.freeze([...anchorWorldPosition] as [number, number, number]),
    ndc: Object.freeze(anchorProjected.ndc),
    pixel: Object.freeze(anchorProjected.pixel),
    inside: pointInside(anchorProjected.pixel),
  });
  const joints = jointScreenPositions.map((joint) => {
    const ndcValue = joint.ndc;
    const worldPositionValue = joint.worldPosition;
    if (!Array.isArray(ndcValue) || ndcValue.length !== 3
      || !ndcValue.every((value) => typeof value === 'number' && Number.isFinite(value))
      || !Array.isArray(worldPositionValue) || worldPositionValue.length !== 3
      || !worldPositionValue.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
    const projected = projectWorld(new THREE.Vector3().fromArray(worldPositionValue as number[]));
    if (!projected.ndc.every((value, index) => value === ndcValue[index])) return null;
    if (!finiteInViewport(projected)) return null;
    return Object.freeze({
      kind: joint.kind ?? null,
      side: joint.side ?? null,
      role: joint.role ?? null,
      digit: joint.digit ?? null,
      joint: joint.joint ?? null,
      bone: joint.bone ?? null,
      worldPosition: Object.freeze([...worldPositionValue] as [number, number, number]),
      ndc: Object.freeze(projected.ndc),
      pixel: Object.freeze(projected.pixel),
      inside: pointInside(projected.pixel),
    });
  });
  if (joints.some((joint) => joint === null)) return null;
  const exactJoints = joints as RiggedEvidenceRasterRoiReceipt['joints'];
  const anchorAndSixteenJointsInside = anchor.inside && exactJoints.every(({ inside }) => inside);
  if (!anchorAndSixteenJointsInside) return null;
  return Object.freeze({
    contract: RIGGED_EVIDENCE_RASTER_ROI_CONTRACT,
    viewport,
    meshNames: Object.freeze(meshes.map(({ name }) => name)),
    meshUuids: Object.freeze(meshes.map(({ uuid }) => uuid)),
    deformedVertexCount: projectedVertices.length,
    frontVertexCount: projectedVertices.length,
    inFrameVertexCount: projectedVertices.length,
    rounding: 'floor-min-ceil-max-half-open',
    paddingPixels: 0,
    projectedPixelExtrema,
    deformedVertexProjectionDigest,
    roi,
    anchor,
    joints: Object.freeze([...exactJoints]),
    anchorAndSixteenJointsInside,
  });
}

let riggedEvidenceMainCameraDrawSessionSequence = 0;

export function installRiggedEvidenceMainCameraDrawSession(
  actors: readonly Readonly<{
    actor: RiggedEvidenceCaptureTarget;
    root: THREE.Object3D;
    operatorRoot: THREE.Object3D;
  }>[],
  gameplayScene: THREE.Scene,
  gameplayCamera: THREE.Camera,
  currentFrame: () => number,
  currentCaptureRevision: () => number,
  expectedMeshNames: readonly string[],
  worldLayer = 0,
): RiggedEvidenceMainCameraDrawSession | null {
  const sortedExpectedMeshNames = sortedStrings(expectedMeshNames);
  if (actors.length < 1
    || sortedExpectedMeshNames.length < 1
    || sortedExpectedMeshNames.some((name) => name.length < 1)
    || new Set(sortedExpectedMeshNames).size !== sortedExpectedMeshNames.length) return null;
  const records: RiggedEvidenceInstrumentedMesh[] = [];
  const actorKeys = new Set<string>();
  const registeredRootObjects = new Set<THREE.Object3D>();
  const registeredRootUuids = new Set<string>();
  const instrumentedMeshes = new Set<THREE.SkinnedMesh>();
  const instrumentedMeshUuids = new Set<string>();
  for (const { actor, root, operatorRoot } of actors) {
    const actorKey = `${actor.kind}:${actor.id}`;
    if (actorKeys.has(actorKey)
      || registeredRootObjects.has(root)
      || registeredRootObjects.has(operatorRoot)
      || registeredRootUuids.has(root.uuid)
      || registeredRootUuids.has(operatorRoot.uuid)
      || (root !== operatorRoot && root.uuid === operatorRoot.uuid)
      || !objectDescendsFrom(operatorRoot, root)) return null;
    actorKeys.add(actorKey);
    registeredRootObjects.add(root);
    registeredRootObjects.add(operatorRoot);
    registeredRootUuids.add(root.uuid);
    registeredRootUuids.add(operatorRoot.uuid);
    const meshes: THREE.SkinnedMesh[] = [];
    let unexpectedHiddenMesh = false;
    operatorRoot.traverse((node) => {
      if (!(node instanceof THREE.SkinnedMesh) || node.userData.authoritativeProxy === true) return;
      if (objectEffectivelyVisible(node)) meshes.push(node);
      else unexpectedHiddenMesh = true;
    });
    const visibleNames = sortedStrings(meshes.map(({ name }) => name));
    if (unexpectedHiddenMesh
      || !sameStrings(visibleNames, sortedExpectedMeshNames)
      || new Set(visibleNames).size !== visibleNames.length) return null;
    for (const mesh of meshes) {
      if (instrumentedMeshes.has(mesh) || instrumentedMeshUuids.has(mesh.uuid)) return null;
      instrumentedMeshes.add(mesh);
      instrumentedMeshUuids.add(mesh.uuid);
      records.push({
        actor,
        actorRoot: root,
        operatorRoot,
        mesh,
        originalBeforeRender: mesh.onBeforeRender,
        originalAfterRender: mesh.onAfterRender,
        beforeRender: mesh.onBeforeRender,
        afterRender: mesh.onAfterRender,
        draw: {
          frame: -1,
          captureRevision: -1,
          beforeCount: 0,
          afterCount: 0,
          beforeStamps: [],
          afterStamps: [],
          before: null,
          after: null,
        },
      });
    }
  }

  const sessionId = `rigged-main-camera-draw-session-${++riggedEvidenceMainCameraDrawSessionSequence}`;
  let activePrincipalControl: Readonly<{
    actor: RiggedEvidenceCaptureTarget;
    captureRevision: number;
    mode: RiggedEvidencePrincipalWriteMode;
  }> | null = null;
  let highestConfiguredPrincipalRevision = -1;
  let principalControlSequenceStage = 0;
  let principalFrame: MutablePrincipalWriteFrame = {
    frame: -1,
    captureRevision: -1,
    observed: [],
    applied: [],
    restoredAfterCount: 0,
    restoredFinallyCount: 0,
    renderCallFinalized: false,
    failures: [],
  };
  const outstandingPrincipalInvocations = () => principalFrame.applied.filter(({ restored }) => !restored);
  const notePrincipalFailure = (failure: string): void => {
    if (!principalFrame.failures.includes(failure)) principalFrame.failures.push(failure);
  };
  const restorePrincipalInvocation = (
    invocation: MutablePrincipalWriteInvocation,
    restoredBy: NonNullable<MutablePrincipalWriteInvocation['restoredBy']>,
  ): void => {
    if (invocation.restored) return;
    const suppressedStateIntact = invocation.material.colorWrite === false
      && invocation.material.depthWrite === false
      && invocation.material.stencilWrite === false;
    if (!suppressedStateIntact) notePrincipalFailure('suppressed-material-state-mutated-before-restore');
    invocation.material.colorWrite = invocation.originalColorWrite;
    invocation.material.depthWrite = invocation.originalDepthWrite;
    invocation.material.stencilWrite = invocation.originalStencilWrite;
    invocation.restoredExactly = invocation.material.colorWrite === invocation.originalColorWrite
      && invocation.material.depthWrite === invocation.originalDepthWrite
      && invocation.material.stencilWrite === invocation.originalStencilWrite;
    invocation.restored = true;
    invocation.restoredBy = restoredBy;
    if (!invocation.restoredExactly) notePrincipalFailure('material-state-not-restored-exactly');
    if (restoredBy === 'after-render') principalFrame.restoredAfterCount += 1;
    if (restoredBy === 'render-finally') principalFrame.restoredFinallyCount += 1;
  };
  const restoreOutstandingPrincipalInvocations = (
    restoredBy: NonNullable<MutablePrincipalWriteInvocation['restoredBy']>,
  ): void => {
    for (const invocation of [...outstandingPrincipalInvocations()].reverse()) {
      restorePrincipalInvocation(invocation, restoredBy);
    }
  };
  const resetPrincipalFrame = (frame: number, captureRevision: number): void => {
    if (principalFrame.frame === frame && principalFrame.captureRevision === captureRevision) return;
    if (outstandingPrincipalInvocations().length > 0) {
      restoreOutstandingPrincipalInvocations('render-finally');
    }
    principalFrame = {
      frame,
      captureRevision,
      observed: [],
      applied: [],
      restoredAfterCount: 0,
      restoredFinallyCount: 0,
      renderCallFinalized: false,
      failures: [],
    };
  };
  const principalControlMatchesRecord = (
    record: RiggedEvidenceInstrumentedMesh,
    captureRevision: number,
  ): boolean => activePrincipalControl !== null
    && activePrincipalControl.captureRevision === captureRevision
    && activePrincipalControl.actor.kind === record.actor.kind
    && activePrincipalControl.actor.id === record.actor.id;
  const principalFrameComplete = (): boolean => {
    if (!activePrincipalControl
      || principalFrame.captureRevision !== activePrincipalControl.captureRevision
      || principalFrame.observed.length < 1
      || !principalFrame.renderCallFinalized
      || outstandingPrincipalInvocations().length !== 0
      || principalFrame.failures.length !== 0) return false;
    if (activePrincipalControl.mode === 'principal-write-suppressed') {
      return principalFrame.applied.length === principalFrame.observed.length
        && principalFrame.applied.every(({ suppressedExactly, restored, restoredExactly }) => (
          suppressedExactly && restored && restoredExactly
        ))
        && principalFrame.restoredAfterCount === principalFrame.applied.length
        && principalFrame.restoredFinallyCount === 0;
    }
    return principalFrame.applied.length === 0
      && principalFrame.restoredAfterCount === 0
      && principalFrame.restoredFinallyCount === 0;
  };

  let disposed = false;
  let ignoredFrame = -1;
  let ignoredCaptureRevision = -1;
  const ignoredCallbacks = { wrongScene: 0, wrongCamera: 0, nonWorldCameraLayer: 0 };
  const resetIgnoredCallbacks = (frame: number, captureRevision: number): void => {
    if (ignoredFrame === frame && ignoredCaptureRevision === captureRevision) return;
    ignoredFrame = frame;
    ignoredCaptureRevision = captureRevision;
    ignoredCallbacks.wrongScene = 0;
    ignoredCallbacks.wrongCamera = 0;
    ignoredCallbacks.nonWorldCameraLayer = 0;
  };
  const qualifyMainCameraDraw = (renderScene: THREE.Scene, renderCamera: THREE.Camera): boolean => {
    const frame = currentFrame();
    const captureRevision = currentCaptureRevision();
    resetIgnoredCallbacks(frame, captureRevision);
    if (renderScene !== gameplayScene) {
      ignoredCallbacks.wrongScene += 1;
      return false;
    }
    if (renderCamera !== gameplayCamera) {
      ignoredCallbacks.wrongCamera += 1;
      return false;
    }
    if (!renderCamera.layers.isEnabled(worldLayer)) {
      ignoredCallbacks.nonWorldCameraLayer += 1;
      return false;
    }
    return true;
  };

  for (const record of records) {
    const { mesh, originalBeforeRender, originalAfterRender } = record;
    const beforeRender: THREE.Object3D['onBeforeRender'] = function (
      this: THREE.Object3D,
      ...args
    ): void {
      originalBeforeRender.apply(this, args);
      const [, renderScene, renderCamera, , material, callbackGroup] = args;
      if (disposed || !qualifyMainCameraDraw(renderScene, renderCamera)) return;
      const frame = currentFrame();
      const captureRevision = currentCaptureRevision();
      resetMutableDraw(record.draw, frame, captureRevision);
      record.draw.beforeCount += 1;
      const stamp = mainCameraDrawStamp(
        mesh,
        record.actorRoot,
        record.operatorRoot,
        gameplayScene,
        gameplayCamera,
        material,
        callbackGroup as unknown as RiggedEvidenceCallbackGroup,
        frame,
        captureRevision,
      );
      record.draw.beforeStamps.push(stamp);
      record.draw.before = stamp;
      if (principalControlMatchesRecord(record, captureRevision)) {
        resetPrincipalFrame(frame, captureRevision);
        const manifest = principalWriteManifestEntry(
          mesh,
          material,
          callbackGroup as unknown as RiggedEvidenceCallbackGroup,
        );
        principalFrame.observed.push(manifest);
        if (activePrincipalControl?.mode === 'principal-write-suppressed') {
          if (!stamp.stateValid) {
            notePrincipalFailure('suppression-refused-for-invalid-admitted-draw');
          } else if (outstandingPrincipalInvocations().some(({ record: candidate }) => candidate === record)) {
            notePrincipalFailure('unbalanced-before-render-callback');
            restoreOutstandingPrincipalInvocations('render-finally');
          } else {
            const invocation: MutablePrincipalWriteInvocation = {
              record,
              material,
              manifest,
              originalColorWrite: material.colorWrite,
              originalDepthWrite: material.depthWrite,
              originalStencilWrite: material.stencilWrite,
              suppressedExactly: false,
              restored: false,
              restoredBy: null,
              restoredExactly: false,
            };
            material.colorWrite = false;
            material.depthWrite = false;
            material.stencilWrite = false;
            invocation.suppressedExactly = material.colorWrite === false
              && material.depthWrite === false
              && material.stencilWrite === false;
            if (!invocation.suppressedExactly) notePrincipalFailure('material-state-not-suppressed-exactly');
            principalFrame.applied.push(invocation);
          }
        }
      }
    };
    const afterRender: THREE.Object3D['onAfterRender'] = function (
      this: THREE.Object3D,
      ...args
    ): void {
      const [, renderScene, renderCamera, , material, callbackGroup] = args;
      let restoredSuppression = false;
      if (!disposed) {
        const outstanding = [...outstandingPrincipalInvocations()].reverse().find((invocation) => (
          invocation.record === record && invocation.material === material
        ));
        if (outstanding) {
          restorePrincipalInvocation(outstanding, 'after-render');
          restoredSuppression = true;
        }
      }
      if (!disposed && qualifyMainCameraDraw(renderScene, renderCamera)) {
        const frame = currentFrame();
        const captureRevision = currentCaptureRevision();
        resetMutableDraw(record.draw, frame, captureRevision);
        record.draw.afterCount += 1;
        const stamp = mainCameraDrawStamp(
          mesh,
          record.actorRoot,
          record.operatorRoot,
          gameplayScene,
          gameplayCamera,
          material,
          callbackGroup as unknown as RiggedEvidenceCallbackGroup,
          frame,
          captureRevision,
        );
        record.draw.afterStamps.push(stamp);
        record.draw.after = stamp;
        if (principalControlMatchesRecord(record, captureRevision)
          && activePrincipalControl?.mode === 'principal-write-suppressed'
          && !restoredSuppression) notePrincipalFailure('after-render-without-suppressed-before-render');
      }
      originalAfterRender.apply(this, args);
    };
    record.beforeRender = beforeRender;
    record.afterRender = afterRender;
    mesh.onBeforeRender = beforeRender;
    mesh.onAfterRender = afterRender;
  }

  const actorReceipt = (
    actor: RiggedEvidenceCaptureTarget,
    actorRoot: THREE.Object3D,
    operatorRoot: THREE.Object3D,
    frame: number,
    captureRevision: number,
  ): RiggedEvidenceMainCameraActorDrawReceipt | null => {
    if (disposed) return null;
    const actorRecords = records.filter((record) => (
      record.actor.kind === actor.kind && record.actor.id === actor.id
    ));
    if (actorRecords.length < 1 || actorRecords.some((record) => (
      record.actorRoot !== actorRoot || record.operatorRoot !== operatorRoot
    ))) return null;
    const meshes = Object.freeze(actorRecords
      .map((record): RiggedEvidenceMainCameraMeshDrawReceipt => {
        const exactFrame = record.draw.frame === frame && record.draw.captureRevision === captureRevision;
        const beforeStamps = Object.freeze(exactFrame ? [...record.draw.beforeStamps] : []);
        const afterStamps = Object.freeze(exactFrame ? [...record.draw.afterStamps] : []);
        const before = beforeStamps.at(-1) ?? null;
        const after = afterStamps.at(-1) ?? null;
        const meshReceipt: RiggedEvidenceMainCameraMeshDrawReceipt = Object.freeze({
          meshUuid: record.mesh.uuid,
          geometryUuid: record.mesh.geometry.uuid,
          meshName: record.mesh.name,
          materialSlotUuids: Object.freeze(meshMaterialSlotUuids(record.mesh)),
          materialUuidSet: Object.freeze(meshMaterialUuidSet(record.mesh)),
          meshLayerMask: record.mesh.layers.mask,
          beforeCount: beforeStamps.length,
          afterCount: afterStamps.length,
          beforeStamps,
          afterStamps,
          before,
          after,
          complete: false,
        });
        return Object.freeze({
          ...meshReceipt,
          complete: riggedEvidenceMainCameraMeshDrawComplete(meshReceipt, frame, captureRevision),
        });
      })
      .sort((left, right) => left.meshName.localeCompare(right.meshName) || left.meshUuid.localeCompare(right.meshUuid)));
    const expectedMeshNames = Object.freeze([...sortedExpectedMeshNames]);
    const expectedMeshUuids = Object.freeze(sortedStrings(meshes.map(({ meshUuid }) => meshUuid)));
    const beforeMeshNames = Object.freeze(sortedStrings(meshes.filter(({ before }) => before !== null).map(({ meshName }) => meshName)));
    const afterMeshNames = Object.freeze(sortedStrings(meshes.filter(({ after }) => after !== null).map(({ meshName }) => meshName)));
    const partial: RiggedEvidenceMainCameraActorDrawReceipt = Object.freeze({
      contract: RIGGED_EVIDENCE_MAIN_CAMERA_DRAW_CONTRACT,
      pixelProof: false,
      actor: Object.freeze({ ...actor }),
      frame,
      captureRevision,
      gameplaySceneUuid: gameplayScene.uuid,
      gameplayCameraUuid: gameplayCamera.uuid,
      actorRootUuid: actorRecords[0].actorRoot.uuid,
      operatorRootUuid: actorRecords[0].operatorRoot.uuid,
      expectedMeshNames,
      expectedMeshUuids,
      beforeMeshNames,
      afterMeshNames,
      ignoredCallbacks: Object.freeze(
        ignoredFrame === frame && ignoredCaptureRevision === captureRevision
          ? { ...ignoredCallbacks }
          : { wrongScene: 0, wrongCamera: 0, nonWorldCameraLayer: 0 },
      ),
      meshes,
      exactExpectedMeshNames: sameStrings(expectedMeshNames, beforeMeshNames)
        && sameStrings(expectedMeshNames, afterMeshNames),
      exactExpectedMeshUuids: meshes.every(({ complete }) => complete),
      complete: false,
    });
    return Object.freeze({ ...partial, complete: riggedEvidenceMainCameraActorDrawComplete(partial) });
  };

  return Object.freeze({
    sessionId,
    actorReceipt,
    configurePrincipalWriteControl: (request) => {
      if (disposed
        || request.sessionId !== sessionId
        || !Number.isSafeInteger(request.captureRevision)
        || request.captureRevision !== currentCaptureRevision()
        || request.captureRevision <= highestConfiguredPrincipalRevision
        || !['visible-observe', 'principal-write-suppressed', 'visible-restored'].includes(request.mode)
        || !actorKeys.has(`${request.actor.kind}:${request.actor.id}`)) return false;
      const expectedMode = (['visible-observe', 'principal-write-suppressed', 'visible-restored'] as const)[
        principalControlSequenceStage
      ];
      if (request.mode !== expectedMode
        || (activePrincipalControl !== null && !principalFrameComplete())) return false;
      restoreOutstandingPrincipalInvocations('abort');
      activePrincipalControl = Object.freeze({
        actor: Object.freeze({ ...request.actor }),
        captureRevision: request.captureRevision,
        mode: request.mode,
      });
      highestConfiguredPrincipalRevision = request.captureRevision;
      principalControlSequenceStage += 1;
      principalFrame = {
        frame: -1,
        captureRevision: request.captureRevision,
        observed: [],
        applied: [],
        restoredAfterCount: 0,
        restoredFinallyCount: 0,
        renderCallFinalized: false,
        failures: [],
      };
      return true;
    },
    principalWriteControlReceipt: (actor, frame, captureRevision) => {
      if (disposed
        || !activePrincipalControl
        || activePrincipalControl.actor.kind !== actor.kind
        || activePrincipalControl.actor.id !== actor.id
        || activePrincipalControl.captureRevision !== captureRevision
        || principalFrame.frame !== frame
        || principalFrame.captureRevision !== captureRevision) return null;
      const drawManifest = Object.freeze(principalFrame.observed.map((entry) => Object.freeze({ ...entry })));
      const suppressionEntries = Object.freeze(principalFrame.applied.map((invocation) => Object.freeze({
        draw: Object.freeze({ ...invocation.manifest }),
        before: Object.freeze({
          colorWrite: invocation.originalColorWrite,
          depthWrite: invocation.originalDepthWrite,
          stencilWrite: invocation.originalStencilWrite,
        }),
        suppressed: Object.freeze({
          colorWrite: false as const,
          depthWrite: false as const,
          stencilWrite: false as const,
        }),
        suppressedExactly: invocation.suppressedExactly,
        restoredBy: invocation.restoredBy,
        after: Object.freeze({
          colorWrite: invocation.material.colorWrite,
          depthWrite: invocation.material.depthWrite,
          stencilWrite: invocation.material.stencilWrite,
        }),
        restoredExactly: invocation.restoredExactly,
      })));
      const outstandingSuppressionCount = outstandingPrincipalInvocations().length;
      const suppressionAppliedCountExact = activePrincipalControl.mode === 'principal-write-suppressed'
        ? principalFrame.applied.length === principalFrame.observed.length
          && principalFrame.applied.every(({ manifest }, index) => (
            samePrincipalWriteManifestEntry(manifest, principalFrame.observed[index])
          ))
        : principalFrame.applied.length === 0;
      const materialStateRestored = principalFrame.applied.every((invocation) => (
        invocation.suppressedExactly
        && invocation.restored
        && invocation.restoredExactly
        && invocation.material.colorWrite === invocation.originalColorWrite
        && invocation.material.depthWrite === invocation.originalDepthWrite
        && invocation.material.stencilWrite === invocation.originalStencilWrite
      ));
      const partial = {
        contract: RIGGED_EVIDENCE_PRINCIPAL_WRITE_CONTROL_CONTRACT,
        sessionId,
        actor: Object.freeze({ ...actor }),
        frame,
        captureRevision,
        mode: activePrincipalControl.mode,
        drawManifest,
        suppressionEntries,
        observedDrawCount: drawManifest.length,
        suppressionAppliedCount: principalFrame.applied.length,
        suppressionRestoredAfterCount: principalFrame.restoredAfterCount,
        suppressionRestoredFinallyCount: principalFrame.restoredFinallyCount,
        outstandingSuppressionCount,
        renderCallFinalized: principalFrame.renderCallFinalized,
        suppressionAppliedCountExact,
        materialStateRestored,
        failures: Object.freeze([...principalFrame.failures]),
        complete: false,
      } satisfies Omit<RiggedEvidencePrincipalWriteControlReceipt, 'complete'> & { complete: false };
      return Object.freeze({ ...partial, complete: principalFrameComplete() });
    },
    restorePrincipalWritesAfterRenderCall: () => {
      if (disposed || !activePrincipalControl) return;
      const frame = currentFrame();
      const captureRevision = currentCaptureRevision();
      if (captureRevision !== activePrincipalControl.captureRevision) return;
      resetPrincipalFrame(frame, captureRevision);
      if (outstandingPrincipalInvocations().length > 0) {
        notePrincipalFailure('render-call-ended-with-unbalanced-callbacks');
        restoreOutstandingPrincipalInvocations('render-finally');
      }
      principalFrame.renderCallFinalized = true;
    },
    abortPrincipalWriteControl: () => {
      if (!activePrincipalControl) return;
      restoreOutstandingPrincipalInvocations('abort');
      notePrincipalFailure('principal-write-control-aborted');
      principalFrame.renderCallFinalized = true;
      activePrincipalControl = null;
    },
    dispose: () => {
      if (disposed) return;
      restoreOutstandingPrincipalInvocations('dispose');
      activePrincipalControl = null;
      disposed = true;
      for (const record of records) {
        if (record.mesh.onBeforeRender === record.beforeRender) {
          record.mesh.onBeforeRender = record.originalBeforeRender;
        }
        if (record.mesh.onAfterRender === record.afterRender) {
          record.mesh.onAfterRender = record.originalAfterRender;
        }
      }
    },
  });
}

export function validateRiggedEvidenceCaptureTargets(
  input: unknown,
  actorExists: (kind: RiggedEvidenceCaptureTarget['kind'], id: string) => boolean,
  maximumTargets = 4,
): Readonly<{ valid: boolean; targets: readonly RiggedEvidenceCaptureTarget[] | null }> {
  if (!Array.isArray(input) || input.length > maximumTargets) {
    return Object.freeze({ valid: false, targets: null });
  }
  if (input.length === 0) return Object.freeze({ valid: true, targets: null });
  const identities = new Set<string>();
  const targets: RiggedEvidenceCaptureTarget[] = [];
  for (const candidate of input) {
    if (candidate === null || typeof candidate !== 'object') {
      return Object.freeze({ valid: false, targets: null });
    }
    const { kind, id } = candidate as { kind?: unknown; id?: unknown };
    if ((kind !== 'bot' && kind !== 'training-dummy') || typeof id !== 'string' || id.length === 0) {
      return Object.freeze({ valid: false, targets: null });
    }
    const identity = `${kind}:${id}`;
    if (identities.has(identity) || !actorExists(kind, id)) {
      return Object.freeze({ valid: false, targets: null });
    }
    identities.add(identity);
    targets.push(Object.freeze({ kind, id }));
  }
  return Object.freeze({ valid: true, targets: Object.freeze(targets) });
}

export function riggedEvidenceMaterialCanOcclude(material: THREE.Material | undefined): boolean {
  return material !== undefined
    && material.visible
    && material.colorWrite
    && (!material.transparent || material.opacity >= RIGGED_EVIDENCE_OCCLUDER_MINIMUM_OPACITY);
}

export function riggedEvidenceIntersectionCanOcclude(intersection: THREE.Intersection): boolean {
  if (!(intersection.object instanceof THREE.Mesh)) return false;
  const { material } = intersection.object;
  if (!Array.isArray(material)) return riggedEvidenceMaterialCanOcclude(material);
  const materialIndex = intersection.face?.materialIndex;
  return Number.isInteger(materialIndex)
    && riggedEvidenceMaterialCanOcclude(material[materialIndex!]);
}

export function firstRiggedEvidenceOccluder(
  intersections: readonly THREE.Intersection[],
): THREE.Intersection | null {
  return intersections.find(riggedEvidenceIntersectionCanOcclude) ?? null;
}

/**
 * Operator presentation meshes intentionally replace `raycast` with a no-op so
 * combat can only hit authoritative proxies. Evidence rays still need rendered
 * triangles, so invoke Three's native implementations without changing that
 * live combat boundary. Current-pose skinned bounds are scoped to this call.
 */
export function intersectRiggedEvidencePresentationObjects(
  raycaster: THREE.Raycaster,
  candidates: readonly THREE.Object3D[],
): THREE.Intersection[] {
  const intersections: THREE.Intersection[] = [];
  for (const candidate of candidates) {
    if (!(candidate instanceof THREE.Mesh) || !candidate.layers.test(raycaster.layers)) continue;
    if (candidate instanceof THREE.SkinnedMesh) {
      const previousBoundingBox = candidate.boundingBox;
      const previousBoundingSphere = candidate.boundingSphere;
      Reflect.set(candidate, 'boundingBox', null);
      Reflect.set(candidate, 'boundingSphere', null);
      try {
        THREE.SkinnedMesh.prototype.raycast.call(candidate, raycaster, intersections);
      } finally {
        Reflect.set(candidate, 'boundingBox', previousBoundingBox);
        Reflect.set(candidate, 'boundingSphere', previousBoundingSphere);
      }
    } else if (candidate instanceof THREE.InstancedMesh) {
      const previousBoundingSphere = candidate.boundingSphere;
      Reflect.set(candidate, 'boundingSphere', null);
      try {
        THREE.InstancedMesh.prototype.raycast.call(candidate, raycaster, intersections);
      } finally {
        Reflect.set(candidate, 'boundingSphere', previousBoundingSphere);
      }
    } else if (candidate instanceof THREE.BatchedMesh) {
      const previousBoundingBox = candidate.boundingBox;
      const previousBoundingSphere = candidate.boundingSphere;
      try {
        THREE.BatchedMesh.prototype.raycast.call(candidate, raycaster, intersections);
      } finally {
        Reflect.set(candidate, 'boundingBox', previousBoundingBox);
        Reflect.set(candidate, 'boundingSphere', previousBoundingSphere);
      }
    } else {
      THREE.Mesh.prototype.raycast.call(candidate, raycaster, intersections);
    }
  }
  return intersections.sort((left, right) => left.distance - right.distance);
}

export function riggedEvidenceObjectDescendsFrom(
  node: THREE.Object3D,
  ancestor: THREE.Object3D,
): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor) {
    if (cursor === ancestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

export function collectRiggedEvidenceOccluders(
  scene: THREE.Object3D,
  camera: THREE.Camera,
  actorRoot: THREE.Object3D,
  isRenderableOccluder: (node: THREE.Object3D) => boolean,
): THREE.Object3D[] {
  const occluders: THREE.Object3D[] = [];
  scene.traverse((node) => {
    if (!isRenderableOccluder(node)
      || riggedEvidenceObjectDescendsFrom(node, actorRoot)
      || riggedEvidenceObjectDescendsFrom(node, camera)) return;
    occluders.push(node);
  });
  return occluders;
}

export function collectRiggedEvidenceSelfOccluders(
  scene: THREE.Object3D,
  camera: THREE.Camera,
  isRenderableOccluder: (node: THREE.Object3D) => boolean,
): THREE.Object3D[] {
  const occluders: THREE.Object3D[] = [];
  scene.traverse((node) => {
    if (!isRenderableOccluder(node) || riggedEvidenceObjectDescendsFrom(node, camera)) return;
    occluders.push(node);
  });
  return occluders;
}

export function classifyRiggedHandSelfOcclusionHit(
  intersection: THREE.Intersection | null,
  origin: THREE.Vector3,
  target: THREE.Vector3,
  actorRoot: THREE.Object3D,
  weaponRoot: THREE.Object3D | null,
  requestedSide: 'left' | 'right',
  canonicalOperator: RiggedOperatorHandEvidenceIdentity,
): Readonly<Record<string, unknown>> | null {
  if (!intersection) return null;
  const {
    operatorRoot, visual, wrist: requestedWrist, skinnedMeshes: canonicalSkinnedMeshes, manifest,
  } = canonicalOperator;
  const targetDistanceM = origin.distanceTo(target);
  const rawTerminalDeltaM = targetDistanceM - intersection.distance;
  const rawHitPointToSentinelM = intersection.point.distanceTo(target);
  const cameraToHitDistanceM = origin.distanceTo(intersection.point);
  const cameraToTarget = target.clone().sub(origin);
  const cameraToHit = intersection.point.clone().sub(origin);
  const rayParameter = targetDistanceM > 0
    ? cameraToHit.dot(cameraToTarget) / (targetDistanceM * targetDistanceM)
    : Number.NaN;
  const rayProjection = origin.clone().addScaledVector(cameraToTarget, rayParameter);
  const rayLateralDistanceM = intersection.point.distanceTo(rayProjection);
  const terminalBoundaryDistanceM = targetDistanceM
    - RIGGED_HAND_SELF_OCCLUSION_CONTRACT.terminalHandToleranceM;
  const terminalDistanceWithinTolerance = intersection.distance >= terminalBoundaryDistanceM
    && intersection.distance <= targetDistanceM;
  const representationScale = Math.max(
    1,
    targetDistanceM,
    intersection.distance,
    ...origin.toArray().map(Math.abs),
    ...target.toArray().map(Math.abs),
    ...intersection.point.toArray().map(Math.abs),
  );
  const representationTolerance = Number.EPSILON * 16 * representationScale;
  const hitPointMatchesTerminalDelta = Math.abs(rawHitPointToSentinelM - rawTerminalDeltaM)
    <= representationTolerance;
  const hitPointWithinTolerance = hitPointMatchesTerminalDelta
    && (rawHitPointToSentinelM <= RIGGED_HAND_SELF_OCCLUSION_CONTRACT.terminalHandToleranceM
      || (terminalDistanceWithinTolerance
      && Math.abs(rawHitPointToSentinelM - rawTerminalDeltaM) <= representationTolerance
      && rawTerminalDeltaM - RIGGED_HAND_SELF_OCCLUSION_CONTRACT.terminalHandToleranceM
        <= representationTolerance));
  const cameraToHitDistanceMatches = Math.abs(cameraToHitDistanceM - intersection.distance)
    <= representationTolerance;
  const raySegmentValid = Number.isFinite(rayParameter) && rayParameter >= 0 && rayParameter <= 1
    && rayLateralDistanceM <= representationTolerance
    && cameraToHitDistanceMatches;
  const terminalBoundaryComparisonM = terminalDistanceWithinTolerance
      && rawTerminalDeltaM > RIGGED_HAND_SELF_OCCLUSION_CONTRACT.terminalHandToleranceM
    ? RIGGED_HAND_SELF_OCCLUSION_CONTRACT.terminalHandToleranceM
    : rawTerminalDeltaM;
  const hitPointBoundaryComparisonM = hitPointWithinTolerance
      && rawHitPointToSentinelM > RIGGED_HAND_SELF_OCCLUSION_CONTRACT.terminalHandToleranceM
    ? RIGGED_HAND_SELF_OCCLUSION_CONTRACT.terminalHandToleranceM
    : rawHitPointToSentinelM;
  const sameActor = riggedEvidenceObjectDescendsFrom(intersection.object, actorRoot);
  const heldWeapon = weaponRoot !== null
    && riggedEvidenceObjectDescendsFrom(intersection.object, weaponRoot);
  const mesh = intersection.object;
  const expectedWristName = requestedSide === 'left' ? 'WristL' : 'WristR';
  const manifestWrist = manifest.wrists.find(({ side }) => side === requestedSide);
  const requestedWristMatchesSide = canonicalOperator.side === requestedSide
    && requestedWrist.name === expectedWristName
    && manifestWrist?.name === expectedWristName
    && manifestWrist.uuid === requestedWrist.uuid
    && riggedEvidenceObjectDescendsFrom(requestedWrist, visual);
  const canonicalMeshIndex = mesh instanceof THREE.SkinnedMesh
    ? canonicalSkinnedMeshes.indexOf(mesh)
    : -1;
  const canonicalMeshIdentity = canonicalMeshIndex >= 0 ? manifest.skinnedMeshes[canonicalMeshIndex] : undefined;
  const canonicalOperatorSkinnedMesh = requestedWristMatchesSide && mesh instanceof THREE.SkinnedMesh
    && canonicalMeshIndex >= 0
    && canonicalSkinnedMeshes.length === manifest.skinnedMeshes.length
    && canonicalMeshIdentity?.name === mesh.name
    && canonicalMeshIdentity.uuid === mesh.uuid
    && manifest.visual.name === visual.name
    && manifest.visual.uuid === visual.uuid
    && riggedEvidenceObjectDescendsFrom(visual, operatorRoot)
    && riggedEvidenceObjectDescendsFrom(mesh, visual)
    && mesh.skeleton.bones.includes(requestedWrist)
    && riggedEvidenceObjectDescendsFrom(operatorRoot, actorRoot);
  const face = intersection.face;
  const position = mesh instanceof THREE.SkinnedMesh ? mesh.geometry.getAttribute('position') : undefined;
  const skinIndex = mesh instanceof THREE.SkinnedMesh ? mesh.geometry.getAttribute('skinIndex') : undefined;
  const skinWeight = mesh instanceof THREE.SkinnedMesh ? mesh.geometry.getAttribute('skinWeight') : undefined;
  const skinAttributesValid = canonicalOperatorSkinnedMesh
    && position !== undefined && skinIndex !== undefined && skinWeight !== undefined
    && skinIndex.itemSize === 4 && skinWeight.itemSize === 4
    && skinIndex.normalized === false
    && skinIndex.count === position.count && skinWeight.count === position.count;
  const skinAttributeProvenance = Object.freeze({
    positionCount: position?.count ?? null,
    skinIndexCount: skinIndex?.count ?? null,
    skinIndexItemSize: skinIndex?.itemSize ?? null,
    skinIndexNormalized: skinIndex?.normalized ?? null,
    skinWeightCount: skinWeight?.count ?? null,
    skinWeightItemSize: skinWeight?.itemSize ?? null,
    skinWeightNormalized: skinWeight?.normalized ?? null,
    valid: skinAttributesValid,
  });
  const dominantBones = canonicalOperatorSkinnedMesh && face
    ? [face.a, face.b, face.c].map((vertexIndex) => {
      const component = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, slot: number) => {
        if (slot === 0) return attribute.getX(vertexIndex);
        if (slot === 1) return attribute.getY(vertexIndex);
        if (slot === 2) return attribute.getZ(vertexIndex);
        return attribute.getW(vertexIndex);
      };
      if (!skinAttributesValid || !skinIndex || !skinWeight || !position
        || !Number.isSafeInteger(vertexIndex) || vertexIndex < 0
        || vertexIndex >= position.count) return Object.freeze({
        vertexIndex,
        skinIndices: null,
        skinWeights: null,
        normalizedWeights: null,
        slot: null,
        skinIndex: null,
        normalizedWeight: null,
        bone: null,
        boneUuid: null,
        handOwned: false,
      });
      const indices = [0, 1, 2, 3].map((slot) => component(skinIndex, slot));
      const weights = [0, 1, 2, 3].map((slot) => component(skinWeight, slot));
      const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
      if (!indices.every((index) => Number.isSafeInteger(index)
          && index >= 0 && index < mesh.skeleton.bones.length)
        || !weights.every((weight) => Number.isFinite(weight) && weight >= 0)
        || !Number.isFinite(weightSum) || !(weightSum > 0)) {
        return Object.freeze({
          vertexIndex,
          skinIndices: Object.freeze(indices),
          skinWeights: Object.freeze(weights),
          normalizedWeights: null,
          slot: null,
          skinIndex: null,
          normalizedWeight: null,
          bone: null,
          boneUuid: null,
          handOwned: false,
        });
      }
      const normalizedWeights = weights.map((weight) => weight / weightSum);
      let dominantSlot = 0;
      for (let slot = 1; slot < 4; slot += 1) {
        if (weights[slot] > weights[dominantSlot]) dominantSlot = slot;
      }
      const dominantSkinIndex = component(skinIndex, dominantSlot);
      const dominantBone = Number.isSafeInteger(dominantSkinIndex) && dominantSkinIndex >= 0
        ? mesh.skeleton.bones[dominantSkinIndex] ?? null
        : null;
      const handOwned = dominantBone !== null
        && (dominantBone === requestedWrist || riggedEvidenceObjectDescendsFrom(dominantBone, requestedWrist));
      return Object.freeze({
        vertexIndex,
        skinIndices: Object.freeze(indices),
        skinWeights: Object.freeze(weights),
        normalizedWeights: Object.freeze(normalizedWeights),
        slot: dominantSlot,
        skinIndex: dominantSkinIndex,
        normalizedWeight: normalizedWeights[dominantSlot],
        bone: dominantBone?.name ?? null,
        boneUuid: dominantBone?.uuid ?? null,
        handOwned,
      });
    })
    : [];
  const handOwnedDominantBoneCount = dominantBones.filter(({ handOwned }) => handOwned).length;
  const faceInfluenceProvenanceValid = dominantBones.length === 3 && dominantBones.every((dominant) => (
    Array.isArray(dominant.skinIndices) && dominant.skinIndices.length === 4
    && Array.isArray(dominant.skinWeights) && dominant.skinWeights.length === 4
    && Array.isArray(dominant.normalizedWeights) && dominant.normalizedWeights.length === 4
    && Number.isSafeInteger(dominant.slot) && Number.isSafeInteger(dominant.skinIndex)
    && typeof dominant.bone === 'string' && typeof dominant.boneUuid === 'string'
  )) && new Set(dominantBones.map(({ vertexIndex }) => vertexIndex)).size === 3;
  const faceHandOwned = faceInfluenceProvenanceValid && handOwnedDominantBoneCount >= 2;
  const cameraInsideOpaqueGeometry = intersection.distance
    <= RIGGED_HAND_SELF_OCCLUSION_CONTRACT.cameraInsideOpaqueDistanceM;
  const terminalHandSurface = sameActor && canonicalOperatorSkinnedMesh && faceHandOwned
    && !heldWeapon && !cameraInsideOpaqueGeometry
    && terminalDistanceWithinTolerance && raySegmentValid
    && hitPointWithinTolerance;
  return Object.freeze({
    name: intersection.object.name || intersection.object.type,
    mesh: intersection.object.name || intersection.object.type,
    meshUuid: intersection.object.uuid,
    geometryUuid: mesh instanceof THREE.Mesh ? mesh.geometry.uuid : null,
    faceIndex: Number.isSafeInteger(intersection.faceIndex) ? intersection.faceIndex : null,
    face: face ? Object.freeze({ a: face.a, b: face.b, c: face.c }) : null,
    materialIndex: face?.materialIndex ?? null,
    hitPointWorld: Object.freeze(intersection.point.toArray()),
    distanceM: intersection.distance,
    cameraToHitDistanceM,
    rayParameter,
    rayLateralDistanceM,
    raySegmentValid,
    targetDistanceM,
    terminalDeltaM: rawTerminalDeltaM,
    hitPointToSentinelM: rawHitPointToSentinelM,
    terminalBoundaryComparisonM,
    hitPointBoundaryComparisonM,
    boundaryUlpAllowanceM: representationTolerance,
    sameActor,
    heldWeapon,
    canonicalOperatorSkinnedMesh,
    requestedSide,
    requestedWrist: requestedWrist.name,
    requestedWristUuid: requestedWrist.uuid,
    requestedWristMatchesSide,
    skinAttributeProvenance,
    dominantBones: Object.freeze(dominantBones),
    faceInfluenceProvenanceValid,
    handOwnedDominantBoneCount,
    faceHandOwned,
    cameraInsideOpaqueGeometry,
    clear: terminalHandSurface,
    reason: cameraInsideOpaqueGeometry
      ? 'camera-inside-opaque-geometry'
      : heldWeapon
        ? 'held-weapon-before-hand-sentinel'
        : terminalHandSurface
          ? 'terminal-hand-surface'
          : sameActor
            ? 'actor-self-occlusion-before-hand-sentinel'
            : 'world-occlusion-before-hand-sentinel',
  });
}
