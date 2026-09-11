/** Built profiles for the existing house kit, not another layer of scenery. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  NUKETOWN2_HANDEDNESS, NUKETOWN2_HOUSE_CENTRE_X,
  NUKETOWN2_HOUSE_DEPTH, NUKETOWN2_HOUSE_FRONT_Z,
} from '../nuketown2-layout';

export const ARCHITECTURAL_PROFILE_TRIANGLE_BUDGET = 4000;
export const CLAPBOARD_FACE_TAPER_M = 0.010;
type Axis = 'x' | 'z';
type Candidate = { mesh: THREE.Mesh<THREE.BoxGeometry>; kind: 'clapboard' | 'edge'; axis: Axis; out: number };

const EDGE_NAMES = /^(house (front window (sill nose|lintel trim) [01]|front door pediment trim|back door pediment trim|front roof fascia|upper window sill nose|upper back sill nose)|porch canopy (wing [01]|head))$/;

function candidates(root: THREE.Object3D): Candidate[] {
  const result: Candidate[] = [];
  for (const object of root.children) {
    if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BoxGeometry)) continue;
    const match = /^nuketown2 (north|south) (.+)$/.exec(object.name);
    if (!match) continue;
    const side = match[1] === 'north' ? 1 : -1;
    const name = match[2];
    if (EDGE_NAMES.test(name)) {
      result.push({ mesh: object, kind: 'edge', axis: 'z', out: side });
    } else if (/^(house|garage) .*siding.* board \d+$/.test(name)) {
      const { width, depth } = object.geometry.parameters;
      const axis: Axis = width < depth ? 'x' : 'z';
      // Geometry and anchors are already in world axes. Compare with the
      // house centre rather than assuming authored 'west' is world -X.
      const centre = axis === 'x'
        ? side * NUKETOWN2_HANDEDNESS * NUKETOWN2_HOUSE_CENTRE_X
        : side * (NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_HOUSE_DEPTH / 2);
      result.push({ mesh: object, kind: 'clapboard', axis, out: Math.sign(object.position[axis] - centre) });
    }
  }
  return result;
}

/** Same 12 triangles and exact AABB; the painted face now has an actual lap slope. */
export function createClapboardProfile(source: THREE.BoxGeometry, axis: Axis, out: number): THREE.BoxGeometry {
  if (out !== 1 && out !== -1) throw new Error('Clapboard needs a signed outward axis');
  const geometry = source.clone();
  const position = geometry.getAttribute('position');
  const { height, width, depth } = source.parameters;
  const thickness = axis === 'x' ? width : depth;
  const taper = Math.min(CLAPBOARD_FACE_TAPER_M, thickness / 4);
  for (let index = 0; index < position.count; index += 1) {
    const outward = axis === 'x' ? position.getX(index) : position.getZ(index);
    if (outward * out <= 0) continue;
    const vertical = (position.getY(index) + height / 2) / height;
    const coordinate = outward - out * taper * vertical;
    if (axis === 'x') position.setX(index, coordinate);
    else position.setZ(index, coordinate);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A 16 mm maximum edge radius, inside the existing visible/physics envelope. */
export function createArchitecturalEdgeProfile(source: THREE.BoxGeometry): THREE.BoxGeometry {
  const { width, height, depth } = source.parameters;
  const radius = Math.min(0.016, width / 5, height / 5, depth / 5);
  const geometry = new RoundedBoxGeometry(width, height, depth, 1, radius);
  // The existing box batcher expects indexed sources. Keep that contract while
  // retaining RoundedBoxGeometry's independent normals on its bevel faces.
  geometry.setIndex(Array.from({ length: geometry.getAttribute('position').count }, (_, index) => index));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function inspectNuketownArchitecturalProfiles(root: THREE.Object3D): Readonly<{ clapboards: number; edges: number; addedTriangles: number }> {
  const selected = candidates(root);
  const edges = selected.filter((entry) => entry.kind === 'edge').length;
  return { clapboards: selected.length - edges, edges, addedTriangles: edges * (108 - 12) };
}

/**
 * Invoke once BEFORE batchPresentationOnlyBoxes. Existing meshes, materials,
 * positions and shot/collider records survive; only their geometry is profiled.
 * Both profile geometries remain BoxGeometry instances, so existing batching
 * combines them with the same material and shadow families: zero extra draws.
 */
export function applyNuketownArchitecturalProfiles(root: THREE.Object3D): ReturnType<typeof inspectNuketownArchitecturalProfiles> {
  const selected = candidates(root);
  const report = inspectNuketownArchitecturalProfiles(root);
  if (report.addedTriangles > ARCHITECTURAL_PROFILE_TRIANGLE_BUDGET) throw new Error('Architectural profile triangle budget exceeded');
  if (selected.some(({ mesh }) => mesh.userData.staticBatchRendered || mesh.userData.architecturalProfile)) {
    throw new Error('Architectural profiles must be applied exactly once before presentation batching');
  }
  for (const { mesh, kind, axis, out } of selected) {
    const previous = mesh.geometry;
    mesh.geometry = kind === 'clapboard' ? createClapboardProfile(previous, axis, out) : createArchitecturalEdgeProfile(previous);
    mesh.userData.architecturalProfile = kind;
    previous.dispose();
  }
  root.userData.architecturalProfiles = report;
  return report;
}
