import * as THREE from 'three';
import type { BallisticSurface } from './ballistics';
import type { Box2 } from './collision';
import { solidBounds, type HouseSolid } from './house-navigation';
import type { ArenaMap } from './map';

export type AtomicSupportAuthorityEntry = Readonly<{
  id: string;
  team: 0 | 1 | null;
  kind: 'floor' | 'landing' | 'physical-cover' | 'semantic-support';
  visualMeshes: readonly string[];
  movementAuthority: 'direct' | 'implicit-world-floor' | 'missing';
  projectileAuthority: 'direct' | 'implicit-world-ground' | 'missing';
}>;

export type AtomicSupportAuthorityAudit = Readonly<{
  contract: 'atomic-acres/procedural-support-authority-set-equality@1';
  presentation: 'procedural-performance';
  pass: boolean;
  entries: readonly AtomicSupportAuthorityEntry[];
  visibleIds: readonly string[];
  movementIds: readonly string[];
  projectileIds: readonly string[];
  teamIds: Readonly<Record<0 | 1, readonly string[]>>;
  unboundWorldColliders: readonly string[];
  unboundPhysicsColliders: readonly string[];
  unboundBallisticSurfaces: readonly string[];
  issues: readonly string[];
}>;

export type AtomicQualitySupportEntry = Readonly<{
  id: string;
  team: 0 | 1 | null;
  kind: AtomicSupportAuthorityEntry['kind'];
  visibleVertices: number;
  movementAuthority: AtomicSupportAuthorityEntry['movementAuthority'];
  projectileAuthority: AtomicSupportAuthorityEntry['projectileAuthority'];
}>;

export type AtomicQualitySupportAudit = Readonly<{
  contract: 'atomic-acres/quality-support-presentation-authority-binding@1';
  presentation: 'quality-glb';
  pass: boolean;
  proceduralAuthorityHidden: boolean;
  qualityPresentationVisible: boolean;
  expectedIds: readonly string[];
  visibleIds: readonly string[];
  movementIds: readonly string[];
  projectileIds: readonly string[];
  teamIds: Readonly<Record<0 | 1, readonly string[]>>;
  entries: readonly AtomicQualitySupportEntry[];
  issues: readonly string[];
}>;

const SUPPORT_NAME = /(?:floor|platform|canopy|landing|support)/iu;
const PRESENTATION_TRIM = /^floor-seam-/iu;
const BOUNDS_KEYS = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'] as const;
const EPSILON = 1e-4;

function visibleInHierarchy(object: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function canonical(value: number): number {
  const rounded = Math.round(value * 10_000) / 10_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizedAngle(value: number): number {
  const wrapped = ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return Math.abs(wrapped) < EPSILON ? 0 : wrapped;
}

export function atomicAuthorityBoundsFingerprint(bounds: Box2): string {
  const values = BOUNDS_KEYS.map((key) => canonical(bounds[key] ?? (key === 'minY' ? 0 : 8)));
  const rotation = bounds.rotation?.map((value) => canonical(normalizedAngle(value))) ?? [0, 0, 0];
  return [...values, ...rotation].join(',');
}

function sameBounds(left: Box2, right: Box2): boolean {
  return atomicAuthorityBoundsFingerprint(left) === atomicAuthorityBoundsFingerprint(right);
}

function boxMeshBounds(mesh: THREE.Mesh): Box2 | null {
  if (mesh.geometry.type !== 'BoxGeometry') return null;
  mesh.geometry.computeBoundingBox();
  if (!mesh.geometry.boundingBox) return null;
  mesh.updateWorldMatrix(true, false);
  const centre = mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
  const scale = mesh.getWorldScale(new THREE.Vector3());
  size.set(Math.abs(size.x * scale.x), Math.abs(size.y * scale.y), Math.abs(size.z * scale.z));
  const rotation = new THREE.Euler().setFromQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()), 'XYZ');
  const rotationTuple: [number, number, number] = [
    normalizedAngle(rotation.x),
    normalizedAngle(rotation.y),
    normalizedAngle(rotation.z),
  ];
  const hasRotation = rotationTuple.some((value) => Math.abs(value) >= EPSILON);
  return {
    minX: centre.x - size.x / 2,
    maxX: centre.x + size.x / 2,
    minY: centre.y - size.y / 2,
    maxY: centre.y + size.y / 2,
    minZ: centre.z - size.z / 2,
    maxZ: centre.z + size.z / 2,
    ...(hasRotation ? { rotation: rotationTuple } : {}),
  };
}

function collectBoxMeshes(root: THREE.Object3D): Array<{ mesh: THREE.Mesh; bounds: Box2 }> {
  const meshes: Array<{ mesh: THREE.Mesh; bounds: Box2 }> = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const bounds = boxMeshBounds(object);
    if (bounds) meshes.push({ mesh: object, bounds });
  });
  return meshes;
}

function coveringBounds(container: Box2, contained: Box2): boolean {
  const containerMinY = container.minY ?? 0;
  const containerMaxY = container.maxY ?? 8;
  const containedMinY = contained.minY ?? 0;
  const containedMaxY = contained.maxY ?? 8;
  return container.minX <= contained.minX + EPSILON
    && container.maxX >= contained.maxX - EPSILON
    && container.minZ <= contained.minZ + EPSILON
    && container.maxZ >= contained.maxZ - EPSILON
    && containerMinY <= containedMinY + EPSILON
    && containerMaxY >= containedMaxY - EPSILON;
}

function directMovementAuthority(map: ArenaMap, bounds: Box2): boolean {
  return map.colliders.some((candidate) => sameBounds(candidate, bounds))
    && map.physicsColliders.some((candidate) => sameBounds(candidate, bounds));
}

function directProjectileAuthority(map: ArenaMap, bounds: Box2): boolean {
  return map.shotSurfaces.some((surface) => sameBounds(surface.bounds, bounds));
}

function globalGroundSurface(map: ArenaMap): BallisticSurface | undefined {
  return map.shotSurfaces.find((surface) => surface.name === 'atomic-acres-ground');
}

function implicitGroundAuthority(map: ArenaMap, solid: HouseSolid): boolean {
  const bounds = solidBounds(solid);
  const ground = globalGroundSurface(map);
  return solid.name === 'ground-floor-slab'
    && Math.abs((bounds.minY ?? 0)) <= EPSILON
    && Math.abs((bounds.maxY ?? 0) - 0.12) <= EPSILON
    && map.bounds.minX <= bounds.minX
    && map.bounds.maxX >= bounds.maxX
    && map.bounds.minZ <= bounds.minZ
    && map.bounds.maxZ >= bounds.maxZ
    && Boolean(ground && coveringBounds(ground.bounds, {
      ...bounds,
      minY: ground.bounds.minY,
      maxY: Math.min(ground.bounds.maxY ?? 0, bounds.maxY ?? 0),
    }));
}

function identityDifference(expected: readonly string[], actual: readonly string[]): readonly string[] {
  const actualSet = new Set(actual);
  return expected.filter((id) => !actualSet.has(id));
}

function supportIdForHouseSolid(solid: HouseSolid): string {
  return `house-support:${solid.id}`;
}

function meshLabel(mesh: THREE.Mesh, bounds: Box2): string {
  return `${mesh.name || '<unnamed>'}@${atomicAuthorityBoundsFingerprint(bounds)}`;
}

/**
 * Audits the exact visible identity set for Nuke Town's substantial horizontal
 * support mass. Ground-floor slabs explicitly delegate to the global Rapier
 * floor and ballistic ground surface; elevated floors, landings, semantic
 * supports and physical cover must bind direct movement and projectile tuples.
 * The whole-map orphan checks make an unrelated invisible blocker or shot-only
 * surface fail even when it is outside the support catalogue.
 */
export function auditAtomicSupportAuthority(
  map: ArenaMap,
): AtomicSupportAuthorityAudit {
  const issues: string[] = [];
  const entries: AtomicSupportAuthorityEntry[] = [];
  const visibleIds = new Set<string>();
  const movementIds = new Set<string>();
  const projectileIds = new Set<string>();
  const teamIds: Record<0 | 1, string[]> = { 0: [], 1: [] };
  const boxMeshes = collectBoxMeshes(map.root);
  const claimedMeshes = new Set<THREE.Mesh>();
  const allMeshes: THREE.Mesh[] = [];
  map.root.traverse((object) => {
    if (object instanceof THREE.Mesh) allMeshes.push(object);
  });

  for (const house of map.houses) {
    for (const solid of house.solids.filter((candidate) => candidate.kind === 'floor' || candidate.kind === 'landing')) {
      const id = supportIdForHouseSolid(solid);
      const bounds = solidBounds(solid);
      const matchingMeshes = boxMeshes.filter(({ mesh, bounds: meshBounds }) => (
        mesh.name === solid.name && sameBounds(meshBounds, bounds)
      ));
      matchingMeshes.forEach(({ mesh }) => claimedMeshes.add(mesh));
      const visibleMeshes = matchingMeshes.filter(({ mesh }) => visibleInHierarchy(mesh));
      const implicitGround = implicitGroundAuthority(map, solid);
      const movementAuthority = implicitGround
        ? 'implicit-world-floor'
        : directMovementAuthority(map, bounds) ? 'direct' : 'missing';
      const projectileAuthority = implicitGround
        ? 'implicit-world-ground'
        : directProjectileAuthority(map, bounds) ? 'direct' : 'missing';
      if (visibleMeshes.length > 0) visibleIds.add(id);
      if (movementAuthority !== 'missing') movementIds.add(id);
      if (projectileAuthority !== 'missing') projectileIds.add(id);
      teamIds[house.team].push(id);
      entries.push(Object.freeze({
        id,
        team: house.team,
        kind: solid.kind === 'floor' ? 'floor' : 'landing',
        visualMeshes: Object.freeze(visibleMeshes.map(({ mesh, bounds: meshBounds }) => meshLabel(mesh, meshBounds))),
        movementAuthority,
        projectileAuthority,
      }));
    }
  }

  for (const cover of map.physicalCover) {
    const id = `physical-cover:${cover.id}`;
    const directBoxMeshes = boxMeshes.filter(({ bounds }) => sameBounds(bounds, cover.bounds));
    const performanceMeshes = allMeshes.filter((mesh) => mesh.userData.performanceCoverId === cover.id);
    const matchingMeshes = [...new Set([
      ...directBoxMeshes.map(({ mesh }) => mesh),
      ...performanceMeshes,
    ])];
    matchingMeshes.forEach((mesh) => claimedMeshes.add(mesh));
    const visibleMeshes = matchingMeshes.filter(visibleInHierarchy);
    const movementAuthority = directMovementAuthority(map, cover.bounds) ? 'direct' : 'missing';
    const projectileAuthority = directProjectileAuthority(map, cover.bounds) ? 'direct' : 'missing';
    if (visibleMeshes.length > 0) visibleIds.add(id);
    if (movementAuthority !== 'missing') movementIds.add(id);
    if (projectileAuthority !== 'missing') projectileIds.add(id);
    entries.push(Object.freeze({
      id,
      team: null,
      kind: 'physical-cover',
      visualMeshes: Object.freeze(visibleMeshes.map((mesh) => {
        const box = boxMeshes.find((candidate) => candidate.mesh === mesh);
        return box ? meshLabel(mesh, box.bounds) : `${mesh.name || '<unnamed>'}@performance-cover:${cover.id}`;
      })),
      movementAuthority,
      projectileAuthority,
    }));
  }

  for (const { mesh, bounds } of boxMeshes) {
    if (claimedMeshes.has(mesh)
      || !visibleInHierarchy(mesh)
      || !SUPPORT_NAME.test(mesh.name)
      || PRESENTATION_TRIM.test(mesh.name)) continue;
    const id = `semantic-support:${meshLabel(mesh, bounds)}`;
    const movementAuthority = directMovementAuthority(map, bounds) ? 'direct' : 'missing';
    const projectileAuthority = directProjectileAuthority(map, bounds) ? 'direct' : 'missing';
    visibleIds.add(id);
    if (movementAuthority !== 'missing') movementIds.add(id);
    if (projectileAuthority !== 'missing') projectileIds.add(id);
    entries.push(Object.freeze({
      id,
      team: null,
      kind: 'semantic-support',
      visualMeshes: Object.freeze([meshLabel(mesh, bounds)]),
      movementAuthority,
      projectileAuthority,
    }));
  }

  const colliderMeshFingerprints = new Set(boxMeshes.map(({ bounds }) => atomicAuthorityBoundsFingerprint(bounds)));
  const unboundWorldColliders = map.colliders
    .map(atomicAuthorityBoundsFingerprint)
    .filter((fingerprint) => !colliderMeshFingerprints.has(fingerprint));
  const unboundPhysicsColliders = map.physicsColliders
    .map(atomicAuthorityBoundsFingerprint)
    .filter((fingerprint) => !colliderMeshFingerprints.has(fingerprint));
  const ballisticMeshIds = new Set<string>();
  map.root.traverse((object) => {
    const id = object.userData.ballisticSurfaceId;
    if (typeof id === 'string') ballisticMeshIds.add(id);
  });
  const unboundBallisticSurfaces = map.shotSurfaces
    .filter((surface) => !ballisticMeshIds.has(surface.id))
    .map((surface) => `${surface.id}@${atomicAuthorityBoundsFingerprint(surface.bounds)}`);

  const visible = [...visibleIds].sort();
  const movement = [...movementIds].sort();
  const projectile = [...projectileIds].sort();
  for (const id of identityDifference(visible, movement)) issues.push(`${id}:visible-without-movement-authority`);
  for (const id of identityDifference(movement, visible)) issues.push(`${id}:movement-without-visible-support`);
  for (const id of identityDifference(visible, projectile)) issues.push(`${id}:visible-without-projectile-authority`);
  for (const id of identityDifference(projectile, visible)) issues.push(`${id}:projectile-without-visible-support`);
  for (const fingerprint of unboundWorldColliders) issues.push(`world-collider-without-mesh:${fingerprint}`);
  for (const fingerprint of unboundPhysicsColliders) issues.push(`physics-collider-without-mesh:${fingerprint}`);
  for (const surface of unboundBallisticSurfaces) issues.push(`ballistic-surface-without-mesh:${surface}`);

  return Object.freeze({
    contract: 'atomic-acres/procedural-support-authority-set-equality@1',
    presentation: 'procedural-performance',
    pass: issues.length === 0,
    entries: Object.freeze(entries.sort((left, right) => left.id.localeCompare(right.id))),
    visibleIds: Object.freeze(visible),
    movementIds: Object.freeze(movement),
    projectileIds: Object.freeze(projectile),
    teamIds: Object.freeze({
      0: Object.freeze(teamIds[0].sort()),
      1: Object.freeze(teamIds[1].sort()),
    }),
    unboundWorldColliders: Object.freeze(unboundWorldColliders),
    unboundPhysicsColliders: Object.freeze(unboundPhysicsColliders),
    unboundBallisticSurfaces: Object.freeze(unboundBallisticSurfaces),
    issues: Object.freeze(issues.sort()),
  });
}

type QualitySupportTarget = Readonly<{
  id: string;
  team: 0 | 1 | null;
  kind: AtomicSupportAuthorityEntry['kind'];
  bounds: Box2;
  movementAuthority: AtomicSupportAuthorityEntry['movementAuthority'];
  projectileAuthority: AtomicSupportAuthorityEntry['projectileAuthority'];
}>;

function qualitySupportTargets(map: ArenaMap): readonly QualitySupportTarget[] {
  const targets: QualitySupportTarget[] = [];
  const boxMeshes = collectBoxMeshes(map.root);
  const claimedMeshes = new Set<THREE.Mesh>();
  for (const house of map.houses) {
    for (const solid of house.solids.filter((candidate) => candidate.kind === 'floor' || candidate.kind === 'landing')) {
      const bounds = solidBounds(solid);
      boxMeshes
        .filter(({ mesh, bounds: meshBounds }) => mesh.name === solid.name && sameBounds(meshBounds, bounds))
        .forEach(({ mesh }) => claimedMeshes.add(mesh));
      const implicitGround = implicitGroundAuthority(map, solid);
      targets.push(Object.freeze({
        id: supportIdForHouseSolid(solid),
        team: house.team,
        kind: solid.kind === 'floor' ? 'floor' : 'landing',
        bounds,
        movementAuthority: implicitGround
          ? 'implicit-world-floor'
          : directMovementAuthority(map, bounds) ? 'direct' : 'missing',
        projectileAuthority: implicitGround
          ? 'implicit-world-ground'
          : directProjectileAuthority(map, bounds) ? 'direct' : 'missing',
      }));
    }
  }
  for (const cover of map.physicalCover) {
    const matchingMeshes = boxMeshes.filter(({ bounds }) => sameBounds(bounds, cover.bounds));
    matchingMeshes.forEach(({ mesh }) => claimedMeshes.add(mesh));
    map.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData.performanceCoverId === cover.id) claimedMeshes.add(object);
    });
    targets.push(Object.freeze({
      id: `physical-cover:${cover.id}`,
      team: null,
      kind: 'physical-cover',
      bounds: cover.bounds,
      movementAuthority: directMovementAuthority(map, cover.bounds) ? 'direct' : 'missing',
      projectileAuthority: directProjectileAuthority(map, cover.bounds) ? 'direct' : 'missing',
    }));
  }
  for (const { mesh, bounds } of boxMeshes) {
    if (claimedMeshes.has(mesh) || !SUPPORT_NAME.test(mesh.name) || PRESENTATION_TRIM.test(mesh.name)) continue;
    targets.push(Object.freeze({
      id: `semantic-support:${meshLabel(mesh, bounds)}`,
      team: null,
      kind: 'semantic-support',
      bounds,
      movementAuthority: directMovementAuthority(map, bounds) ? 'direct' : 'missing',
      projectileAuthority: directProjectileAuthority(map, bounds) ? 'direct' : 'missing',
    }));
  }
  return Object.freeze(targets.sort((left, right) => left.id.localeCompare(right.id)));
}

function visibleQualityVertices(root: THREE.Object3D, bounds: Box2): number {
  const probe = new THREE.Box3(
    new THREE.Vector3(bounds.minX - 0.08, (bounds.minY ?? 0) - 0.08, bounds.minZ - 0.08),
    new THREE.Vector3(bounds.maxX + 0.08, (bounds.maxY ?? 8) + 0.08, bounds.maxZ + 0.08),
  );
  const world = new THREE.Vector3();
  let vertices = 0;
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !visibleInHierarchy(object)) return;
    const positions = object.geometry.getAttribute('position');
    if (!positions) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const meshBounds = object.geometry.boundingBox?.clone().applyMatrix4(object.matrixWorld);
    if (!meshBounds?.intersectsBox(probe)) return;
    for (let index = 0; index < positions.count; index += 1) {
      world.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      if (probe.containsPoint(world)) vertices += 1;
    }
  });
  return vertices;
}

/**
 * Audits the actual Quality GLB presentation while the procedural world is
 * authority-only and hidden, exactly matching the runtime visibility policy.
 * Every canonical support identity must retain visible generated geometry and
 * the same movement/projectile authority tuple; a profile label alone cannot
 * satisfy this contract.
 */
export function auditAtomicQualitySupportAuthority(
  map: ArenaMap,
  qualityRoot: THREE.Object3D,
): AtomicQualitySupportAudit {
  const targets = qualitySupportTargets(map);
  const proceduralAuthorityHidden = !visibleInHierarchy(map.root);
  const qualityPresentationVisible = visibleInHierarchy(qualityRoot);
  const visibleIds: string[] = [];
  const movementIds: string[] = [];
  const projectileIds: string[] = [];
  const teamIds: Record<0 | 1, string[]> = { 0: [], 1: [] };
  const entries = targets.map((target): AtomicQualitySupportEntry => {
    const visibleVertices = qualityPresentationVisible ? visibleQualityVertices(qualityRoot, target.bounds) : 0;
    if (visibleVertices >= 4) visibleIds.push(target.id);
    if (target.movementAuthority !== 'missing') movementIds.push(target.id);
    if (target.projectileAuthority !== 'missing') projectileIds.push(target.id);
    if (target.team !== null) teamIds[target.team].push(target.id);
    return Object.freeze({
      id: target.id,
      team: target.team,
      kind: target.kind,
      visibleVertices,
      movementAuthority: target.movementAuthority,
      projectileAuthority: target.projectileAuthority,
    });
  });
  const expectedIds = targets.map(({ id }) => id).sort();
  visibleIds.sort();
  movementIds.sort();
  projectileIds.sort();
  const issues: string[] = [];
  if (!proceduralAuthorityHidden) issues.push('procedural-authority-root-visible-during-quality-presentation');
  if (!qualityPresentationVisible) issues.push('quality-presentation-root-hidden');
  for (const id of identityDifference(expectedIds, visibleIds)) issues.push(`${id}:quality-visible-geometry-missing`);
  for (const id of identityDifference(visibleIds, expectedIds)) issues.push(`${id}:quality-visible-geometry-without-authority`);
  for (const id of identityDifference(expectedIds, movementIds)) issues.push(`${id}:quality-without-movement-authority`);
  for (const id of identityDifference(expectedIds, projectileIds)) issues.push(`${id}:quality-without-projectile-authority`);
  return Object.freeze({
    contract: 'atomic-acres/quality-support-presentation-authority-binding@1',
    presentation: 'quality-glb',
    pass: issues.length === 0,
    proceduralAuthorityHidden,
    qualityPresentationVisible,
    expectedIds: Object.freeze(expectedIds),
    visibleIds: Object.freeze(visibleIds),
    movementIds: Object.freeze(movementIds),
    projectileIds: Object.freeze(projectileIds),
    teamIds: Object.freeze({ 0: Object.freeze(teamIds[0].sort()), 1: Object.freeze(teamIds[1].sort()) }),
    entries: Object.freeze(entries),
    issues: Object.freeze(issues.sort()),
  });
}
