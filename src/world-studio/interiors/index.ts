import { BufferGeometry, CylinderGeometry, Euler, Group, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Box2 } from '../../collision';
import type { BallisticMaterialId } from '../../ballistics';
import { createInteriorPalette, type InteriorRole } from './materials';

export type StudioInteriorAnchor = { id: string; room: string; position: [number, number, number]; yaw: number; footprint: [number, number] };
export type StudioInteriorSolid = { id: string; mesh: Object3D; bounds: Box2; material: BallisticMaterialId };
export const STUDIO_INTERIOR_BUDGET = Object.freeze({ triangles: 60_000, drawGroups: 70 });
type V3 = [number, number, number];

/** Original midcentury furniture. Dimensions are local to each authority-authored footprint. */
export function createStudioInteriors(anchors: readonly StudioInteriorAnchor[]): { root: Group; solids: StudioInteriorSolid[] } {
  const ids = new Set<string>();
  for (const a of anchors) {
    if (!a.id || ids.has(a.id) || ![...a.position, a.yaw, ...a.footprint].every(Number.isFinite)
      || a.footprint.some(n => n <= 0)) throw new Error('Invalid or duplicate interior anchor');
    ids.add(a.id);
  }
  const root = new Group();
  root.name = 'world-studio-interiors';
  const palette = createInteriorPalette();
  const buckets = new Map<InteriorRole, BufferGeometry[]>();
  const solids: StudioInteriorSolid[] = [];
  const solidRoles = new Map<string, InteriorRole>();
  const components: { id: string; anchorId: string; role: InteriorRole; size: V3; local: V3 }[] = [];
  for (const a of anchors) {
    const [w, d] = a.footprint;
    const rotation = new Quaternion().setFromEuler(new Euler(0, a.yaw, 0));
    const anchorPosition = new Vector3(...a.position);
    const emit = (name: string, role: InteriorRole, p: V3, size: V3, solid = false, radius = 0.008, cylinder = false) => {
      // Every authored part remains within its local circulation envelope.
      if (Math.abs(p[0]) + size[0] / 2 > w / 2 + 1e-6 || Math.abs(p[2]) + size[2] / 2 > d / 2 + 1e-6)
        throw new Error(`Furniture exceeds anchor footprint: ${a.id}/${name}`);
      const geometry = cylinder ? new CylinderGeometry(size[0] * 0.36, size[0] * 0.5, size[1], 8)
        : new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map(n => n / 3)));
      const tile = palette[role].userData.tileMetres as number | undefined;
      if (tile) {
        const pos = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
        for (let i = 0; i < pos.count; i++) {
          const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i));
          uv.setXY(i, (nx > 0.7 ? pos.getZ(i) : pos.getX(i)) / tile,
            (ny > 0.7 ? pos.getZ(i) : pos.getY(i)) / tile);
        }
      }
      const centre = new Vector3(...p).applyQuaternion(rotation).add(anchorPosition);
      const matrix = new Matrix4().compose(centre, rotation, new Vector3(1, 1, 1));
      geometry.applyMatrix4(matrix);
      const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
      if (normalized !== geometry) geometry.dispose();
      normalized.clearGroups();
      const bucket = buckets.get(role) ?? [];
      bucket.push(normalized); buckets.set(role, bucket);
      const id = `${a.id}-${name}`;
      components.push({ id, anchorId: a.id, role, size, local: p });
      if (solid) {
        // Explicit structural-part OBB: never close the empty space under a table.
        solidRoles.set(id, role);
        solids.push({ id, mesh: root, material: role === 'metal' ? 'thin-metal' : 'wood', bounds: {
          minX: centre.x - size[0] / 2, maxX: centre.x + size[0] / 2,
          minY: centre.y - size[1] / 2, maxY: centre.y + size[1] / 2,
          minZ: centre.z - size[2] / 2, maxZ: centre.z + size[2] / 2, rotation: [0, a.yaw, 0],
        } });
      }
    };
    const legs = (height: number, inset = 0.1) => {
      for (const x of [-1, 1]) for (const z of [-1, 1])
        emit(`leg-${x}-${z}`, 'walnut', [x * (w / 2 - inset), height / 2, z * (d / 2 - inset)], [0.065, height, 0.065], true, 0, true);
    };
    const book = (x: number, y: number, z: number, width = 0.24) => {
      emit('book-pages', 'cream', [x, y, z], [width, 0.035, 0.19]);
      emit('book-cover', 'ochre', [x, y + 0.023, z], [width + 0.008, 0.008, 0.198]);
    };
    if (a.id.endsWith('-sofa')) {
      legs(0.18, 0.13);
      emit('seat-frame', 'walnut', [0, 0.23, 0], [w - 0.04, 0.13, d - 0.04], true);
      emit('back-frame', 'fabric', [0, 0.66, -d / 2 + 0.115], [w - 0.09, 0.7, 0.2], true, 0.05);
      for (const side of [-1, 1]) emit(`arm-${side}`, 'fabric', [side * (w / 2 - 0.11), 0.54, 0], [0.21, 0.48, d - 0.025], true, 0.06);
      const cw = (w - 0.48) / 3;
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * (cw + 0.012);
        emit(`seat-cushion-${i}`, 'fabric', [x, 0.425, 0.09], [cw, 0.2, d - 0.27], true, 0.07);
        emit(`back-cushion-${i}`, 'fabric', [x, 0.77, -d / 2 + 0.25], [cw, 0.43, 0.16], false, 0.065);
        emit(`welt-${i}`, 'cream', [x, 0.423, d / 2 - 0.039], [cw - 0.035, 0.005, 0.005], false, 0.002);
      }
    } else if (a.id.endsWith('-bed') || a.id.endsWith('-bed2')) {
      legs(0.18, 0.12);
      emit('bed-frame', 'walnut', [0, 0.27, 0], [w - 0.03, 0.2, d - 0.025], true);
      emit('headboard', 'walnut', [0, 0.67, -d / 2 + 0.04], [w, 0.92, 0.08], true, 0.015);
      emit('mattress', 'cream', [0, 0.49, 0.025], [w - 0.1, 0.26, d - 0.14], true, 0.07);
      emit('duvet', 'quilt', [0, 0.65, d * 0.13], [w - 0.07, 0.12, d * 0.66], false, 0.055);
      emit('folded-sheet', 'cream', [0, 0.709, -d * 0.165], [w - 0.12, 0.032, 0.17], false, 0.01);
      for (const s of [-1, 1]) emit(`pillow-${s}`, 'cream', [s * w * 0.225, 0.675, -d * 0.32], [w * 0.4, 0.15, d * 0.23], false, 0.065);
    } else if (a.id.endsWith('-kitchen-run')) {
      emit('toe-kick', 'dark', [0, 0.065, -0.015], [w - 0.1, 0.13, d - 0.1], true);
      emit('cabinet-body', 'walnut', [0, 0.5, -0.018], [w - 0.035, 0.74, d - 0.055], true);
      // Full-width counter uses four pieces around a genuinely recessed sink.
      const sx = w * 0.23, sw = 0.6, sd = d * 0.65;
      const leftW = sx - sw / 2 + w / 2, rightW = w / 2 - sx - sw / 2;
      emit('counter-left', 'porcelain', [-w / 2 + leftW / 2, 0.89, 0], [leftW, 0.055, d], true);
      emit('counter-right', 'porcelain', [sx + sw / 2 + rightW / 2, 0.89, 0], [rightW, 0.055, d], true);
      for (const sign of [-1, 1]) emit(`sink-rim-${sign}`, 'porcelain', [sx, 0.89, sign * (d + sd) / 4], [sw, 0.055, (d - sd) / 2], true);
      emit('sink-basin', 'metal', [sx, 0.883, 0], [sw - 0.02, 0.02, sd - 0.015]);
      emit('tap-stem', 'metal', [sx, 1.015, -d * 0.39], [0.025, 0.25, 0.025], false, 0, true);
      emit('tap-spout', 'metal', [sx, 1.13, -d * 0.26], [0.025, 0.025, d * 0.3]);
      const panels = 7, pw = (w - 0.06) / panels;
      for (let i = 0; i < panels; i++) {
        const x = (i - 3) * pw;
        emit(`cabinet-door-${i}`, 'ochre', [x, 0.5, d / 2 - 0.014], [pw - 0.012, 0.70, 0.025]);
        emit(`cabinet-pull-${i}`, 'metal', [x + pw * 0.3, 0.66, d / 2 - 0.003], [0.012, 0.12, 0.006]);
      }
      emit('hob', 'metal', [-w * 0.25, 0.93, 0], [0.7, 0.018, d * 0.8]);
      for (const x of [-1, 1]) for (const z of [-1, 1])
        emit(`burner-${x}-${z}`, 'dark', [-w * 0.25 + x * 0.18, 0.95, z * d * 0.19], [0.18, 0.018, 0.18], false, 0, true);
    } else if (a.id.endsWith('-wardrobe') || a.id.endsWith('-tv-unit')) {
      const wardrobe = a.id.endsWith('-wardrobe'), h = wardrobe ? 1.95 : 0.58;
      legs(0.15, 0.09);
      emit('carcass', 'walnut', [0, h / 2 + 0.15, -0.01], [w, h, d - 0.025], true);
      for (const s of [-1, 1]) {
        emit(`door-${s}`, 'walnut', [s * w * 0.25, h / 2 + 0.15, d / 2 - 0.006], [w / 2 - 0.018, h - 0.035, 0.012]);
        emit(`handle-${s}`, 'metal', [s * 0.06, h / 2 + 0.15, d / 2 - 0.002], [0.012, 0.12, 0.004]);
      }
      if (!wardrobe) {
        emit('television-case', 'walnut', [-0.15, 1.02, 0], [0.75, 0.54, d - 0.07], true, 0.035);
        emit('television-glass', 'dark', [-0.20, 1.035, d / 2 - 0.024], [0.54, 0.39, 0.025], false, 0.045);
        emit('television-dial', 'metal', [0.16, 1.05, d / 2 - 0.008], [0.046, 0.046, 0.012]);
      }
    } else if (a.id.endsWith('-coffee-table') || a.id.endsWith('-dining-table') || a.id.endsWith('-desk') || a.id.endsWith('-workbench')) {
      const coffee = a.id.endsWith('-coffee-table'), bench = a.id.endsWith('-workbench');
      const h = coffee ? 0.43 : bench ? 0.9 : 0.75;
      legs(h - 0.035, 0.09);
      emit('tabletop', 'walnut', [0, h, 0], [w, 0.07, d], true, 0.025);
      if (a.id.endsWith('-desk') || bench) {
        emit('drawer-box', bench ? 'ochre' : 'walnut', [w * 0.3, h - 0.2, 0], [w * 0.31, 0.3, d - 0.06], true);
        for (let i = 0; i < 2; i++) emit(`drawer-pull-${i}`, 'metal', [w * 0.3, h - 0.12 - i * 0.15, d / 2 - 0.02], [0.18, 0.018, 0.025]);
      }
      book(-w * 0.17, h + 0.055, 0);
      if (bench) {
        emit('toolbox', 'ochre', [w * 0.24, h + 0.17, -d * 0.1], [0.48, 0.25, 0.3], false, 0.02);
        emit('toolbox-handle', 'metal', [w * 0.24, h + 0.32, -d * 0.1], [0.18, 0.025, 0.025]);
      }
    } else throw new Error(`Unsupported interior anchor: ${a.id}`);
  }
  let triangles = 0;
  for (const [role, geometries] of buckets) {
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error(`Interior merge failed: ${role}`);
    for (const part of geometries) part.dispose();
    const mesh = new Mesh(geometry, palette[role]);
    mesh.name = `world-studio-interiors-${role}`;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.worldStudioInterior = true;
    root.add(mesh);
    // The caller deduplicates these visible meshes for raycasts while keeping
    // each structural OBB as an independent authoritative shot surface.
    for (const solid of solids) if (solidRoles.get(solid.id) === role) solid.mesh = mesh;
    triangles += geometry.getAttribute('position').count / 3;
  }
  root.userData.components = components;
  root.userData.cost = { triangles, drawGroups: buckets.size };
  if (triangles > STUDIO_INTERIOR_BUDGET.triangles || buckets.size > STUDIO_INTERIOR_BUDGET.drawGroups)
    throw new Error('World Studio interior budget exceeded');
  return { root, solids };
}
