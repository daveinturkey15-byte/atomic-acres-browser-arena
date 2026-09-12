import * as THREE from 'three';

export interface MeshComponent {
  readonly bounds: THREE.Box3;
  readonly vertexCount: number;
  /** Original world-space triangles, retained in complete triples for exact coverage. */
  readonly worldVertices?: readonly THREE.Vector3[];
}

/** Conservatively join touching piece bounds, including unwelded intersecting
 * surfaces. Only original pairs establish contact; a union's empty interior
 * cannot bridge a new component. This prevents tiled solid cover from being
 * reclassified as many individually small decorations. */
export function mergeTouchingComponentBounds(parts: readonly MeshComponent[]): MeshComponent[] {
  const parents = parts.map((_, i) => i);
  const triangleBounds = new Map<MeshComponent, THREE.Box3[]>();
  const triangles = (part: MeshComponent): THREE.Box3[] | null => {
    if (!part.worldVertices) return null;
    if (part.worldVertices.length !== part.vertexCount || part.vertexCount % 3 !== 0) {
      throw new Error('Touching component triangle retention mismatch');
    }
    if (!triangleBounds.has(part)) {
      const boxes: THREE.Box3[] = [];
      for (let i = 0; i < part.worldVertices.length; i += 3) {
        boxes.push(new THREE.Box3().setFromPoints(part.worldVertices.slice(i, i + 3)).expandByScalar(1e-5));
      }
      triangleBounds.set(part, boxes);
    }
    return triangleBounds.get(part)!;
  };
  const mayTouch = (a: MeshComponent, b: MeshComponent): boolean => {
    const aTriangles = triangles(a); const bTriangles = triangles(b);
    // Bounds-only callers remain conservative. For retained geometry, reject
    // contact established solely by the empty centre of a frame's envelope.
    // Triangle AABBs can over-report contact but cannot miss real contact.
    return !aTriangles || !bTriangles || aTriangles.some(at => bTriangles.some(bt => at.intersectsBox(bt)));
  };
  function find(i: number): number {
    while (parents[i] !== i) { parents[i] = parents[parents[i]!]!; i = parents[i]!; }
    return i;
  }
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i]!.bounds.clone().expandByScalar(1e-5);
    for (let j = i + 1; j < parts.length; j++) {
      if (a.intersectsBox(parts[j]!.bounds) && mayTouch(parts[i]!, parts[j]!)) parents[find(j)] = find(i);
    }
  }
  const grouped = new Map<number, { bounds: THREE.Box3; vertexCount: number; worldVertices?: THREE.Vector3[] }>();
  parts.forEach((part, i) => {
    const key = find(i);
    if (!grouped.has(key)) grouped.set(key, { bounds: new THREE.Box3(), vertexCount: 0, worldVertices: [] });
    const group = grouped.get(key)!;
    group.bounds.union(part.bounds); group.vertexCount += part.vertexCount;
    if (group.worldVertices && part.worldVertices) {
      for (const vertex of part.worldVertices) group.worldVertices.push(vertex);
    } else group.worldVertices = undefined;
  });
  return [...grouped.values()];
}

/**
 * Connected triangle components, with 10-micrometre world-space welding for
 * Float32 seams. Unlike moving-centroid clustering, membership does not depend
 * on vertex order or assume a maximum wheel radius. Every vertex is accounted
 * for; unsupported or unmeasurable geometry is an error, never an empty census.
 */
export function meshComponentCensus(meshes: readonly THREE.Mesh[]): MeshComponent[] {
  const vertices: THREE.Vector3[] = [];
  const parents: number[] = [];
  const welded = new Map<string, number>();
  function find(index: number): number {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]!]!;
      index = parents[index]!;
    }
    return index;
  }
  function join(a: number, b: number): void {
    a = find(a); b = find(b);
    if (a !== b) parents[b] = a;
  }
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.getAttribute('position');
    if (mesh.geometry.index || !position || position.itemSize !== 3 || position.count === 0 || position.count % 3 !== 0) {
      throw new Error(`${mesh.name}: component census requires nonempty non-indexed XYZ triangles`);
    }
    if (!mesh.matrixWorld.elements.every(Number.isFinite)) throw new Error(`${mesh.name}: non-finite world transform`);
    for (let i = 0; i < position.count; i++) {
      const vertex = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      if (!vertex.toArray().every(Number.isFinite)) throw new Error(`${mesh.name}: non-finite position at ${i}`);
      const index = vertices.length;
      vertices.push(vertex); parents.push(index);
      const key = vertex.toArray().map(value => Math.round(value * 1e5)).join(',');
      const previous = welded.get(key);
      if (previous !== undefined) join(index, previous);
      else welded.set(key, index);
      if (i % 3 !== 0) join(index, index - 1);
    }
  }
  const components = new Map<number, { bounds: THREE.Box3; vertexCount: number; worldVertices: THREE.Vector3[] }>();
  vertices.forEach((vertex, index) => {
    const root = find(index);
    let component = components.get(root);
    if (!component) {
      component = { bounds: new THREE.Box3(), vertexCount: 0, worldVertices: [] };
      components.set(root, component);
    }
    component.bounds.expandByPoint(vertex);
    component.vertexCount++;
    component.worldVertices.push(vertex);
  });
  return [...components.values()].sort((a, b) =>
    a.bounds.min.x - b.bounds.min.x || a.bounds.min.y - b.bounds.min.y || a.bounds.min.z - b.bounds.min.z);
}
