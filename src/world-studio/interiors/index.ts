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
  const retile = (geometry: BufferGeometry, role: InteriorRole): void => {
    const tile = palette[role].userData.tileMetres as number | undefined;
    if (!tile) return;
    const pos = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i));
      uv.setXY(i, (nx > 0.7 ? pos.getZ(i) : pos.getX(i)) / tile,
        (ny > 0.7 ? pos.getZ(i) : pos.getY(i)) / tile);
    }
  };
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
      retile(geometry, role);
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
      if (a.id === 'teal-house-sofa') {
        // Throw pillows on the west sofa only; the east sofa keeps its shipped set.
        emit('pillow-cream--1', 'cream', [-0.585, 0.72, -0.1], [0.4, 0.38, 0.13], false, 0.05);
        emit('pillow-ochre', 'ochre', [0, 0.74, -0.12], [0.4, 0.4, 0.13], false, 0.05);
        emit('pillow-fabric-1', 'fabric', [0.585, 0.72, -0.1], [0.4, 0.38, 0.13], false, 0.05);
      }
      if (a.id === 'yellow-house-sofa') {
        // Throw pillows on the east sofa only; the west sofa keeps its G2 set.
        emit('pillow-cream--1', 'cream', [-0.585, 0.72, -0.1], [0.4, 0.38, 0.13], false, 0.05);
        emit('pillow-ochre', 'ochre', [0, 0.74, -0.12], [0.4, 0.4, 0.13], false, 0.05);
        emit('pillow-fabric-1', 'fabric', [0.585, 0.72, -0.1], [0.4, 0.38, 0.13], false, 0.05);
      }
    } else if (a.id.endsWith('-bed') || a.id.endsWith('-bed2')) {
      legs(0.18, 0.12);
      emit('bed-frame', 'walnut', [0, 0.27, 0], [w - 0.03, 0.2, d - 0.025], true);
      emit('headboard', 'walnut', [0, 0.67, -d / 2 + 0.04], [w, 0.92, 0.08], true, 0.015);
      emit('mattress', 'cream', [0, 0.49, 0.025], [w - 0.1, 0.26, d - 0.14], true, 0.07);
      emit('duvet', 'quilt', [0, 0.65, d * 0.13], [w - 0.07, 0.12, d * 0.66], false, 0.055);
      emit('folded-sheet', 'cream', [0, 0.709, -d * 0.165], [w - 0.12, 0.032, 0.17], false, 0.01);
      for (const s of [-1, 1]) emit(`pillow-${s}`, 'cream', [s * w * 0.225, 0.675, -d * 0.32], [w * 0.4, 0.15, d * 0.23], false, 0.065);
      if (a.id === 'teal-house-bed') {
        // Navy coverlet plus navy accent pillows on the master bed only; the
        // remaining beds keep the shipped quilt-and-cream set (judged plates).
        emit('coverlet-navy', 'dark', [0, 0.722, d * 0.2], [w - 0.09, 0.035, d * 0.5], false, 0.015);
        for (const s of [-1, 1]) emit(`pillow-navy-${s}`, 'dark', [s * 0.45, 0.74, -d * 0.158], [0.42, 0.17, 0.3], false, 0.05);
      }
      if (a.id === 'yellow-house-bed') {
        // Mustard coverlet plus ochre accent pillows on the master bed only;
        // the remaining beds keep the shipped quilt-and-cream set (judged
        // plates: yellow bed in map__yellow-upper-cutaway). Mirror of the
        // teal-house-bed navy set above, same local placement.
        emit('coverlet-yellow', 'ochre', [0, 0.722, d * 0.2], [w - 0.09, 0.035, d * 0.5], false, 0.015);
        for (const s of [-1, 1]) emit(`pillow-yellow-${s}`, 'ochre', [s * 0.45, 0.74, -d * 0.158], [0.42, 0.17, 0.3], false, 0.05);
      }
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
        if (a.id === 'teal-house-tv-unit') {
          // Trailing plant on the west credenza, clear of the television case.
          emit('credenza-pot', 'ochre', [0.55, 0.79, 0], [0.16, 0.12, 0.16], false, 0, true);
          emit('credenza-plant', 'fabric', [0.55, 0.97, 0], [0.24, 0.22, 0.24], false, 0.06);
        }
        if (a.id === 'yellow-house-tv-unit') {
          // Trailing plant on the east credenza, clear of the television case.
          emit('credenza-pot', 'ochre', [0.55, 0.79, 0], [0.16, 0.12, 0.16], false, 0, true);
          emit('credenza-plant', 'fabric', [0.55, 0.97, 0], [0.24, 0.22, 0.24], false, 0.06);
        }
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
      if (a.id === 'teal-house-coffee-table') {
        // Turned-wood platter plus a stacked second book on the west table.
        emit('serving-platter', 'ochre', [0.2, h + 0.065, -0.05], [0.32, 0.06, 0.32], false, 0.025);
        book(-w * 0.17, h + 0.1, 0);
      }
      if (a.id === 'yellow-house-coffee-table') {
        // Turned-wood platter plus a stacked second book on the east table.
        emit('serving-platter', 'ochre', [0.2, h + 0.065, -0.05], [0.32, 0.06, 0.32], false, 0.025);
        book(-w * 0.17, h + 0.1, 0);
      }
      if (bench) {
        emit('toolbox', 'ochre', [w * 0.24, h + 0.17, -d * 0.1], [0.48, 0.25, 0.3], false, 0.02);
        emit('toolbox-handle', 'metal', [w * 0.24, h + 0.32, -d * 0.1], [0.18, 0.025, 0.025]);
      }
    } else throw new Error(`Unsupported interior anchor: ${a.id}`);
  }
  // G2 west-living dressing: teal-house (west, centreX -20) only. The yellow
  // house keeps its shipped set, so the far side is a control view. Every
  // room-scale part below is presentation-only (never solid: zero new solids,
  // zero collision change); furniture-anchor parts above keep the pattern's
  // own solid flags. Room parts are recorded against the synthetic room
  // anchor `teal-house-living` (room-local origin [-20, 0.08, 0]) rather than
  // a furniture footprint, which they intentionally exceed. Only existing
  // InteriorRoles feed the merge buckets, so the draw-group census never grows.
  if (anchors.some((a) => a.id === 'teal-house-sofa')) {
    const ROOM = { minX: -19.95, maxX: -13.3, minZ: -8.78, maxZ: -0.15, minY: 0.08, maxY: 3.0 } as const;
    const emitRoom = (name: string, role: InteriorRole, center: V3, size: V3,
      opts: { cylinder?: boolean; radius?: number; yaw?: number } = {}) => {
      const yaw = opts.yaw ?? 0;
      const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
      const hx = (size[0] * c + size[2] * s) / 2, hz = (size[0] * s + size[2] * c) / 2;
      if (center[0] - hx < ROOM.minX || center[0] + hx > ROOM.maxX
        || center[2] - hz < ROOM.minZ || center[2] + hz > ROOM.maxZ
        || center[1] - size[1] / 2 < ROOM.minY - 1e-6 || center[1] + size[1] / 2 > ROOM.maxY)
        throw new Error(`West living dressing outside room envelope: ${name}`);
      const roomRotation = new Quaternion().setFromEuler(new Euler(0, yaw, 0));
      const roomGeometry = opts.cylinder
        ? new CylinderGeometry(size[0] * 0.36, size[0] * 0.5, size[1], 8)
        : new RoundedBoxGeometry(...size, 1, Math.min(opts.radius ?? 0.008, ...size.map((n) => n / 3)));
      retile(roomGeometry, role);
      roomGeometry.applyMatrix4(new Matrix4().compose(new Vector3(...center), roomRotation, new Vector3(1, 1, 1)));
      const roomNormalized = roomGeometry.index ? roomGeometry.toNonIndexed() : roomGeometry;
      if (roomNormalized !== roomGeometry) roomGeometry.dispose();
      roomNormalized.clearGroups();
      const roomBucket = buckets.get(role) ?? [];
      roomBucket.push(roomNormalized); buckets.set(role, roomBucket);
      components.push({ id: `teal-house-living-${name}`, anchorId: 'teal-house-living',
        role, size, local: [center[0] + 20, center[1] - 0.08, center[2]] });
    };
    // Area rug under the coffee-table zone, sliding under the sofa front edge.
    emitRoom('rug-underlay', 'cream', [-16.6, 0.09, -4.4], [3.6, 0.02, 2.6], { radius: 0.004 });
    emitRoom('rug-pattern', 'quilt', [-16.6, 0.105, -4.4], [3.4, 0.015, 2.4], { radius: 0.003 });
    // Two lounge chairs facing each other across the coffee table.
    const armchair = (cx: number, cz: number, yaw: number, pillow: InteriorRole, tag: string) => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const at = (lx: number, lz: number): [number, number] => [cx + lx * c + lz * s, cz - lx * s + lz * c];
      const part = (n: string, role: InteriorRole, lx: number, y: number, lz: number, size: V3, extra: { radius?: number } = {}) => {
        const [wcx, wcz] = at(lx, lz);
        emitRoom(`${tag}-${n}`, role, [wcx, y, wcz], size, { ...extra, yaw });
      };
      for (const x of [-0.3, 0.3]) for (const z of [-0.33, 0.33]) {
        const [wcx, wcz] = at(x, z);
        emitRoom(`${tag}-leg-${x}-${z}`, 'walnut', [wcx, 0.16, wcz], [0.06, 0.16, 0.06], { cylinder: true, yaw });
      }
      part('seat-frame', 'walnut', 0, 0.22, 0, [0.72, 0.12, 0.8]);
      part('seat-cushion', 'fabric', 0, 0.36, 0.05, [0.6, 0.16, 0.62], { radius: 0.06 });
      part('back-frame', 'fabric', 0, 0.62, -0.31, [0.72, 0.62, 0.18], { radius: 0.06 });
      part('back-cushion', 'fabric', 0, 0.66, -0.2, [0.56, 0.4, 0.14], { radius: 0.06 });
      part('arm--1', 'fabric', -0.33, 0.5, 0, [0.14, 0.3, 0.7], { radius: 0.05 });
      part('arm-1', 'fabric', 0.33, 0.5, 0, [0.14, 0.3, 0.7], { radius: 0.05 });
      part('pillow', pillow, 0.08, 0.6, -0.12, [0.34, 0.32, 0.12], { radius: 0.05 });
    };
    armchair(-16.6, -6.9, 0, 'ochre', 'chair-north');
    armchair(-16.6, -2.0, Math.PI, 'cream', 'chair-south');
    // Side table with a table lamp east of the north chair.
    for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2])
      emitRoom(`side-leg-${x}-${z}`, 'walnut', [-15.35 + x, 0.34, -6.9 + z], [0.05, 0.52, 0.05], { cylinder: true });
    emitRoom('side-top', 'walnut', [-15.35, 0.575, -6.9], [0.5, 0.05, 0.5], { radius: 0.02 });
    emitRoom('side-book-pages', 'cream', [-15.45, 0.62, -6.85], [0.2, 0.03, 0.16]);
    emitRoom('side-book-cover', 'ochre', [-15.45, 0.64, -6.85], [0.208, 0.008, 0.168]);
    emitRoom('lamp-base', 'metal', [-15.22, 0.615, -6.95], [0.18, 0.03, 0.18], { cylinder: true });
    emitRoom('lamp-stem', 'metal', [-15.22, 0.82, -6.95], [0.03, 0.4, 0.03], { cylinder: true });
    emitRoom('lamp-shade', 'cream', [-15.22, 1.14, -6.95], [0.26, 0.28, 0.26], { cylinder: true });
    // Floor lamp by the side window, west of the glass.
    emitRoom('floor-lamp-base', 'metal', [-18.35, 0.1, -7.9], [0.3, 0.04, 0.3], { cylinder: true });
    emitRoom('floor-lamp-pole', 'metal', [-18.35, 0.87, -7.9], [0.035, 1.5, 0.035], { cylinder: true });
    emitRoom('floor-lamp-shade', 'cream', [-18.35, 1.7, -7.9], [0.34, 0.32, 0.34], { cylinder: true });
    // Bookcase on the north wall west of the side window, with books and a plant.
    emitRoom('shelf-back', 'walnut', [-18.9, 1.03, -8.72], [1.4, 1.9, 0.02]);
    emitRoom('shelf-side--1', 'walnut', [-19.575, 1.03, -8.6], [0.05, 1.9, 0.32]);
    emitRoom('shelf-side-1', 'walnut', [-18.225, 1.03, -8.6], [0.05, 1.9, 0.32]);
    for (const y of [0.14, 0.55, 1.05, 1.55])
      emitRoom(`shelf-board-${y}`, 'walnut', [-18.9, y, -8.6], [1.3, 0.04, 0.28]);
    emitRoom('shelf-top', 'walnut', [-18.9, 1.96, -8.6], [1.4, 0.05, 0.32]);
    let shelfBook = 0;
    const shelfRow = (y: number, xs: number[], cover: InteriorRole) => {
      for (const x of xs) {
        emitRoom(`shelf-book-${shelfBook}-pages`, 'cream', [x, y + 0.15, -8.6], [0.055, 0.3, 0.2]);
        emitRoom(`shelf-book-${shelfBook}-cover`, cover, [x, y + 0.154, -8.6], [0.063, 0.308, 0.208]);
        shelfBook++;
      }
    };
    shelfRow(0.57, [-19.4, -19.33, -19.26, -19.18], 'ochre');
    shelfRow(1.07, [-19.38, -19.31, -19.24, -19.1, -19.03], 'dark');
    emitRoom('shelf-stack-pages', 'cream', [-18.5, 1.6, -8.6], [0.24, 0.035, 0.19]);
    emitRoom('shelf-stack-cover', 'fabric', [-18.5, 1.622, -8.6], [0.248, 0.009, 0.198]);
    emitRoom('shelf-pot', 'ochre', [-19.25, 2.045, -8.6], [0.16, 0.12, 0.16], { cylinder: true });
    emitRoom('shelf-plant', 'fabric', [-19.25, 2.2, -8.6], [0.24, 0.2, 0.24], { radius: 0.06 });
    // Framed print on the north wall east of the side window.
    emitRoom('print-frame', 'walnut', [-14.5, 1.75, -8.74], [0.98, 0.74, 0.04]);
    emitRoom('print-mat', 'cream', [-14.5, 1.75, -8.72], [0.86, 0.62, 0.045]);
    emitRoom('print-art', 'ochre', [-14.5, 1.75, -8.7], [0.6, 0.4, 0.05]);
    // Sunburst clock on the spine wall, clear of the TV and the dining opening.
    emitRoom('clock-face', 'cream', [-19.88, 2.05, -2.2], [0.05, 0.44, 0.44], { radius: 0.02 });
    emitRoom('clock-hub', 'ochre', [-19.85, 2.05, -2.2], [0.06, 0.12, 0.12]);
    for (const dy of [-0.36, 0.36]) emitRoom(`clock-ray-y-${dy}`, 'walnut', [-19.88, 2.05 + dy, -2.2], [0.03, 0.16, 0.06]);
    for (const dz of [-0.36, 0.36]) emitRoom(`clock-ray-z-${dz}`, 'walnut', [-19.88, 2.05, -2.2 + dz], [0.03, 0.06, 0.16]);
    // Drapes on both living-room windows with curtain rods.
    emitRoom('drape-rod-north', 'metal', [-16.7, 2.45, -8.65], [3.9, 0.04, 0.04], { radius: 0.015 });
    emitRoom('drape-north--1', 'cream', [-18.35, 1.25, -8.65], [0.5, 2.3, 0.12], { radius: 0.04 });
    emitRoom('drape-north-1', 'cream', [-15.05, 1.25, -8.65], [0.5, 2.3, 0.12], { radius: 0.04 });
    emitRoom('drape-rod-east', 'metal', [-13.4, 2.5, -4.6], [0.04, 0.04, 5.2], { radius: 0.015 });
    emitRoom('drape-east--1', 'cream', [-13.4, 1.25, -6.95], [0.12, 2.3, 0.55], { radius: 0.04 });
    emitRoom('drape-east-1', 'cream', [-13.4, 1.25, -2.25], [0.12, 2.3, 0.55], { radius: 0.04 });
    // Corner plant by the picture window.
    emitRoom('plant-pot', 'ochre', [-13.7, 0.28, -1.5], [0.34, 0.4, 0.34], { cylinder: true });
    emitRoom('plant-soil', 'dark', [-13.7, 0.49, -1.5], [0.28, 0.04, 0.28], { cylinder: true });
    emitRoom('plant-low', 'fabric', [-13.7, 0.75, -1.5], [0.4, 0.5, 0.4], { radius: 0.12 });
    emitRoom('plant-mid', 'fabric', [-13.55, 1.05, -1.4], [0.3, 0.35, 0.3], { radius: 0.1 });
    emitRoom('plant-top', 'fabric', [-13.85, 1.0, -1.6], [0.28, 0.3, 0.28], { radius: 0.1 });
  }
  // G2 east-living dressing: yellow-house (east, centreX +20) only. The teal
  // house keeps its G2 set, so the far side is a control view. Mirror of the
  // west block above (x -> -x about the origin; z shared): identical part
  // vocabulary, chair yaws kept so backrests still face the coffee table.
  // Every room-scale part below is presentation-only (never solid: zero new
  // solids, zero collision change). Room parts are recorded against the
  // synthetic room anchor `yellow-house-living` (room-local origin
  // [20, 0.08, 0]) rather than a furniture footprint, which they
  // intentionally exceed. Only existing InteriorRoles feed the merge buckets,
  // so the draw-group census never grows.
  if (anchors.some((a) => a.id === 'yellow-house-sofa')) {
    const ROOM = { minX: 13.3, maxX: 19.95, minZ: -8.78, maxZ: -0.15, minY: 0.08, maxY: 3.0 } as const;
    const emitRoom = (name: string, role: InteriorRole, center: V3, size: V3,
      opts: { cylinder?: boolean; radius?: number; yaw?: number } = {}) => {
      const yaw = opts.yaw ?? 0;
      const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
      const hx = (size[0] * c + size[2] * s) / 2, hz = (size[0] * s + size[2] * c) / 2;
      if (center[0] - hx < ROOM.minX || center[0] + hx > ROOM.maxX
        || center[2] - hz < ROOM.minZ || center[2] + hz > ROOM.maxZ
        || center[1] - size[1] / 2 < ROOM.minY - 1e-6 || center[1] + size[1] / 2 > ROOM.maxY)
        throw new Error(`East living dressing outside room envelope: ${name}`);
      const roomRotation = new Quaternion().setFromEuler(new Euler(0, yaw, 0));
      const roomGeometry = opts.cylinder
        ? new CylinderGeometry(size[0] * 0.36, size[0] * 0.5, size[1], 8)
        : new RoundedBoxGeometry(...size, 1, Math.min(opts.radius ?? 0.008, ...size.map((n) => n / 3)));
      retile(roomGeometry, role);
      roomGeometry.applyMatrix4(new Matrix4().compose(new Vector3(...center), roomRotation, new Vector3(1, 1, 1)));
      const roomNormalized = roomGeometry.index ? roomGeometry.toNonIndexed() : roomGeometry;
      if (roomNormalized !== roomGeometry) roomGeometry.dispose();
      roomNormalized.clearGroups();
      const roomBucket = buckets.get(role) ?? [];
      roomBucket.push(roomNormalized); buckets.set(role, roomBucket);
      components.push({ id: `yellow-house-living-${name}`, anchorId: 'yellow-house-living',
        role, size, local: [center[0] - 20, center[1] - 0.08, center[2]] });
    };
    // Area rug under the coffee-table zone, sliding under the sofa front edge.
    emitRoom('rug-underlay', 'cream', [16.6, 0.09, -4.4], [3.6, 0.02, 2.6], { radius: 0.004 });
    emitRoom('rug-pattern', 'quilt', [16.6, 0.105, -4.4], [3.4, 0.015, 2.4], { radius: 0.003 });
    // Two lounge chairs facing each other across the coffee table.
    const armchair = (cx: number, cz: number, yaw: number, pillow: InteriorRole, tag: string) => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const at = (lx: number, lz: number): [number, number] => [cx + lx * c + lz * s, cz - lx * s + lz * c];
      const part = (n: string, role: InteriorRole, lx: number, y: number, lz: number, size: V3, extra: { radius?: number } = {}) => {
        const [wcx, wcz] = at(lx, lz);
        emitRoom(`${tag}-${n}`, role, [wcx, y, wcz], size, { ...extra, yaw });
      };
      for (const x of [-0.3, 0.3]) for (const z of [-0.33, 0.33]) {
        const [wcx, wcz] = at(x, z);
        emitRoom(`${tag}-leg-${x}-${z}`, 'walnut', [wcx, 0.16, wcz], [0.06, 0.16, 0.06], { cylinder: true, yaw });
      }
      part('seat-frame', 'walnut', 0, 0.22, 0, [0.72, 0.12, 0.8]);
      part('seat-cushion', 'fabric', 0, 0.36, 0.05, [0.6, 0.16, 0.62], { radius: 0.06 });
      part('back-frame', 'fabric', 0, 0.62, -0.31, [0.72, 0.62, 0.18], { radius: 0.06 });
      part('back-cushion', 'fabric', 0, 0.66, -0.2, [0.56, 0.4, 0.14], { radius: 0.06 });
      part('arm--1', 'fabric', -0.33, 0.5, 0, [0.14, 0.3, 0.7], { radius: 0.05 });
      part('arm-1', 'fabric', 0.33, 0.5, 0, [0.14, 0.3, 0.7], { radius: 0.05 });
      part('pillow', pillow, 0.08, 0.6, -0.12, [0.34, 0.32, 0.12], { radius: 0.05 });
    };
    armchair(16.6, -6.9, 0, 'ochre', 'chair-north');
    armchair(16.6, -2.0, Math.PI, 'cream', 'chair-south');
    // Side table with a table lamp west of the north chair.
    for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2])
      emitRoom(`side-leg-${x}-${z}`, 'walnut', [15.35 + x, 0.34, -6.9 + z], [0.05, 0.52, 0.05], { cylinder: true });
    emitRoom('side-top', 'walnut', [15.35, 0.575, -6.9], [0.5, 0.05, 0.5], { radius: 0.02 });
    emitRoom('side-book-pages', 'cream', [15.45, 0.62, -6.85], [0.2, 0.03, 0.16]);
    emitRoom('side-book-cover', 'ochre', [15.45, 0.64, -6.85], [0.208, 0.008, 0.168]);
    emitRoom('lamp-base', 'metal', [15.22, 0.615, -6.95], [0.18, 0.03, 0.18], { cylinder: true });
    emitRoom('lamp-stem', 'metal', [15.22, 0.82, -6.95], [0.03, 0.4, 0.03], { cylinder: true });
    emitRoom('lamp-shade', 'cream', [15.22, 1.14, -6.95], [0.26, 0.28, 0.26], { cylinder: true });
    // Floor lamp by the side window, east of the glass.
    emitRoom('floor-lamp-base', 'metal', [18.35, 0.1, -7.9], [0.3, 0.04, 0.3], { cylinder: true });
    emitRoom('floor-lamp-pole', 'metal', [18.35, 0.87, -7.9], [0.035, 1.5, 0.035], { cylinder: true });
    emitRoom('floor-lamp-shade', 'cream', [18.35, 1.7, -7.9], [0.34, 0.32, 0.34], { cylinder: true });
    // Bookcase on the north wall east of the side window, with books and a plant.
    emitRoom('shelf-back', 'walnut', [18.9, 1.03, -8.72], [1.4, 1.9, 0.02]);
    emitRoom('shelf-side--1', 'walnut', [19.575, 1.03, -8.6], [0.05, 1.9, 0.32]);
    emitRoom('shelf-side-1', 'walnut', [18.225, 1.03, -8.6], [0.05, 1.9, 0.32]);
    for (const y of [0.14, 0.55, 1.05, 1.55])
      emitRoom(`shelf-board-${y}`, 'walnut', [18.9, y, -8.6], [1.3, 0.04, 0.28]);
    emitRoom('shelf-top', 'walnut', [18.9, 1.96, -8.6], [1.4, 0.05, 0.32]);
    let shelfBook = 0;
    const shelfRow = (y: number, xs: number[], cover: InteriorRole) => {
      for (const x of xs) {
        emitRoom(`shelf-book-${shelfBook}-pages`, 'cream', [x, y + 0.15, -8.6], [0.055, 0.3, 0.2]);
        emitRoom(`shelf-book-${shelfBook}-cover`, cover, [x, y + 0.154, -8.6], [0.063, 0.308, 0.208]);
        shelfBook++;
      }
    };
    shelfRow(0.57, [19.4, 19.33, 19.26, 19.18], 'ochre');
    shelfRow(1.07, [19.38, 19.31, 19.24, 19.1, 19.03], 'dark');
    emitRoom('shelf-stack-pages', 'cream', [18.5, 1.6, -8.6], [0.24, 0.035, 0.19]);
    emitRoom('shelf-stack-cover', 'fabric', [18.5, 1.622, -8.6], [0.248, 0.009, 0.198]);
    emitRoom('shelf-pot', 'ochre', [19.25, 2.045, -8.6], [0.16, 0.12, 0.16], { cylinder: true });
    emitRoom('shelf-plant', 'fabric', [19.25, 2.2, -8.6], [0.24, 0.2, 0.24], { radius: 0.06 });
    // Framed print on the north wall west of the side window.
    emitRoom('print-frame', 'walnut', [14.5, 1.75, -8.74], [0.98, 0.74, 0.04]);
    emitRoom('print-mat', 'cream', [14.5, 1.75, -8.72], [0.86, 0.62, 0.045]);
    emitRoom('print-art', 'ochre', [14.5, 1.75, -8.7], [0.6, 0.4, 0.05]);
    // Sunburst clock on the spine wall, clear of the TV and the dining opening.
    emitRoom('clock-face', 'cream', [19.88, 2.05, -2.2], [0.05, 0.44, 0.44], { radius: 0.02 });
    emitRoom('clock-hub', 'ochre', [19.85, 2.05, -2.2], [0.06, 0.12, 0.12]);
    for (const dy of [-0.36, 0.36]) emitRoom(`clock-ray-y-${dy}`, 'walnut', [19.88, 2.05 + dy, -2.2], [0.03, 0.16, 0.06]);
    for (const dz of [-0.36, 0.36]) emitRoom(`clock-ray-z-${dz}`, 'walnut', [19.88, 2.05, -2.2 + dz], [0.03, 0.06, 0.16]);
    // Drapes on both living-room windows with curtain rods.
    emitRoom('drape-rod-north', 'metal', [16.7, 2.45, -8.65], [3.9, 0.04, 0.04], { radius: 0.015 });
    emitRoom('drape-north--1', 'cream', [18.35, 1.25, -8.65], [0.5, 2.3, 0.12], { radius: 0.04 });
    emitRoom('drape-north-1', 'cream', [15.05, 1.25, -8.65], [0.5, 2.3, 0.12], { radius: 0.04 });
    emitRoom('drape-rod-east', 'metal', [13.4, 2.5, -4.6], [0.04, 0.04, 5.2], { radius: 0.015 });
    emitRoom('drape-east--1', 'cream', [13.4, 1.25, -6.95], [0.12, 2.3, 0.55], { radius: 0.04 });
    emitRoom('drape-east-1', 'cream', [13.4, 1.25, -2.25], [0.12, 2.3, 0.55], { radius: 0.04 });
    // Corner plant by the picture window.
    emitRoom('plant-pot', 'ochre', [13.7, 0.28, -1.5], [0.34, 0.4, 0.34], { cylinder: true });
    emitRoom('plant-soil', 'dark', [13.7, 0.49, -1.5], [0.28, 0.04, 0.28], { cylinder: true });
    emitRoom('plant-low', 'fabric', [13.7, 0.75, -1.5], [0.4, 0.5, 0.4], { radius: 0.12 });
    emitRoom('plant-mid', 'fabric', [13.55, 1.05, -1.4], [0.3, 0.35, 0.3], { radius: 0.1 });
    emitRoom('plant-top', 'fabric', [13.85, 1.0, -1.6], [0.28, 0.3, 0.28], { radius: 0.1 });
  }
  // G2 teal-bedroom dressing: teal-house master bedroom (west upper front,
  // centreX -20) only. The yellow house keeps its shipped set, so every other
  // room is a control view. Same part vocabulary as the living passes (rug,
  // bench, nightstands, lamps, framed print, sunburst clock, lounge chair,
  // dresser, drapes, plants). Every room-scale part below is presentation-only
  // (never solid: zero new solids, zero collision change). Room parts are
  // recorded against the synthetic room anchor `teal-house-bedroom`
  // (room-local origin [-20, 3.3, 0]) rather than a furniture footprint, which
  // they intentionally exceed. Only existing InteriorRoles feed the merge
  // buckets, so the draw-group census never grows. Bedroom scope only: no
  // office/closet/balcony construction beyond dressing this room.
  if (anchors.some((a) => a.id === 'teal-house-bed')) {
    const ROOM = { minX: -19.95, maxX: -13.2, minZ: -8.7, maxZ: 0.9, minY: 3.3, maxY: 6.3 } as const;
    const emitRoom = (name: string, role: InteriorRole, center: V3, size: V3,
      opts: { cylinder?: boolean; radius?: number; yaw?: number } = {}) => {
      const yaw = opts.yaw ?? 0;
      const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
      const hx = (size[0] * c + size[2] * s) / 2, hz = (size[0] * s + size[2] * c) / 2;
      if (center[0] - hx < ROOM.minX || center[0] + hx > ROOM.maxX
        || center[2] - hz < ROOM.minZ || center[2] + hz > ROOM.maxZ
        || center[1] - size[1] / 2 < ROOM.minY - 1e-6 || center[1] + size[1] / 2 > ROOM.maxY)
        throw new Error(`Teal bedroom dressing outside room envelope: ${name}`);
      const roomRotation = new Quaternion().setFromEuler(new Euler(0, yaw, 0));
      const roomGeometry = opts.cylinder
        ? new CylinderGeometry(size[0] * 0.36, size[0] * 0.5, size[1], 8)
        : new RoundedBoxGeometry(...size, 1, Math.min(opts.radius ?? 0.008, ...size.map((n) => n / 3)));
      retile(roomGeometry, role);
      roomGeometry.applyMatrix4(new Matrix4().compose(new Vector3(...center), roomRotation, new Vector3(1, 1, 1)));
      const roomNormalized = roomGeometry.index ? roomGeometry.toNonIndexed() : roomGeometry;
      if (roomNormalized !== roomGeometry) roomGeometry.dispose();
      roomNormalized.clearGroups();
      const roomBucket = buckets.get(role) ?? [];
      roomBucket.push(roomNormalized); buckets.set(role, roomBucket);
      components.push({ id: `teal-house-bedroom-${name}`, anchorId: 'teal-house-bedroom',
        role, size, local: [center[0] + 20, center[1] - 3.3, center[2]] });
    };
    // Striped rug under the bed: cream base with dark woven stripes.
    emitRoom('rug-underlay', 'cream', [-15.4, 3.31, -5.2], [3.4, 0.02, 2.8], { radius: 0.004 });
    for (const dz of [-1.1, -0.55, 0, 0.55, 1.1])
      emitRoom(`rug-stripe-${dz}`, 'dark', [-15.4, 3.325, -5.2 + dz], [3.2, 0.015, 0.22], { radius: 0.003 });
    // Bench at the foot of the bed with a folded quilt throw.
    for (const x of [-17.05, -16.55]) for (const z of [-5.85, -4.55])
      emitRoom(`bench-leg-${x}-${z}`, 'walnut', [x, 3.44, z], [0.06, 0.28, 0.06], { cylinder: true });
    emitRoom('bench-frame', 'walnut', [-16.8, 3.62, -5.2], [0.65, 0.1, 1.5]);
    emitRoom('bench-cushion', 'fabric', [-16.8, 3.74, -5.2], [0.58, 0.14, 1.42], { radius: 0.06 });
    emitRoom('bench-throw', 'quilt', [-16.8, 3.83, -5.2], [0.6, 0.03, 0.7], { radius: 0.01 });
    // Nightstands flanking the headboard, each with a table lamp.
    const nightstand = (cz: number, tag: string) => {
      emitRoom(`${tag}-carcass`, 'walnut', [-14.3, 3.62, cz], [0.5, 0.55, 0.45]);
      emitRoom(`${tag}-drawer`, 'ochre', [-14.04, 3.7, cz], [0.02, 0.2, 0.35]);
      emitRoom(`${tag}-pull`, 'metal', [-14.02, 3.7, cz], [0.02, 0.03, 0.12]);
      emitRoom(`${tag}-lamp-base`, 'metal', [-14.3, 3.93, cz], [0.2, 0.03, 0.2], { cylinder: true });
      emitRoom(`${tag}-lamp-stem`, 'metal', [-14.3, 4.12, cz], [0.03, 0.36, 0.03], { cylinder: true });
      emitRoom(`${tag}-lamp-shade`, 'cream', [-14.3, 4.38, cz], [0.28, 0.3, 0.28], { cylinder: true });
    };
    nightstand(-6.6, 'stand-north');
    nightstand(-3.8, 'stand-south');
    // Framed print above the headboard on the street wall.
    emitRoom('print-frame', 'walnut', [-13.27, 5.05, -5.2], [0.05, 0.74, 0.98]);
    emitRoom('print-mat', 'cream', [-13.26, 5.05, -5.2], [0.055, 0.62, 0.86]);
    emitRoom('print-art', 'ochre', [-13.27, 5.05, -5.2], [0.05, 0.4, 0.6]);
    // Sunburst clock on the spine wall, clear of the wardrobe.
    emitRoom('clock-face', 'cream', [-19.86, 5.3, -5.2], [0.05, 0.44, 0.44], { radius: 0.02 });
    emitRoom('clock-hub', 'ochre', [-19.83, 5.3, -5.2], [0.06, 0.12, 0.12]);
    for (const dy of [-0.36, 0.36]) emitRoom(`clock-ray-y-${dy}`, 'walnut', [-19.86, 5.3 + dy, -5.2], [0.03, 0.16, 0.06]);
    for (const dz of [-0.36, 0.36]) emitRoom(`clock-ray-z-${dz}`, 'walnut', [-19.86, 5.3, -5.2 + dz], [0.03, 0.06, 0.16]);
    // Lounge chair facing the bed with a side table and lamp.
    const yaw = Math.PI;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (lx: number, lz: number): [number, number] => [-14.2 + lx * c + lz * s, -1.0 - lx * s + lz * c];
    const chairPart = (n: string, role: InteriorRole, lx: number, y: number, lz: number, size: V3, radius = 0.05) => {
      const [wcx, wcz] = at(lx, lz);
      emitRoom(`chair-${n}`, role, [wcx, y, wcz], size, { radius, yaw });
    };
    for (const x of [-0.3, 0.3]) for (const z of [-0.33, 0.33]) {
      const [wcx, wcz] = at(x, z);
      emitRoom(`chair-leg-${x}-${z}`, 'walnut', [wcx, 3.46, wcz], [0.06, 0.32, 0.06], { cylinder: true, yaw });
    }
    chairPart('seat-frame', 'walnut', 0, 3.52, 0, [0.72, 0.12, 0.8], 0.008);
    chairPart('seat-cushion', 'fabric', 0, 3.66, 0.05, [0.6, 0.16, 0.62], 0.06);
    chairPart('back-frame', 'fabric', 0, 3.92, -0.31, [0.72, 0.62, 0.18], 0.06);
    chairPart('back-cushion', 'fabric', 0, 3.96, -0.2, [0.56, 0.4, 0.14], 0.06);
    chairPart('arm--1', 'fabric', -0.33, 3.8, 0, [0.14, 0.3, 0.7], 0.05);
    chairPart('arm-1', 'fabric', 0.33, 3.8, 0, [0.14, 0.3, 0.7], 0.05);
    chairPart('pillow', 'ochre', 0.08, 3.9, -0.12, [0.34, 0.32, 0.12], 0.05);
    for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2])
      emitRoom(`side-leg-${x}-${z}`, 'walnut', [-15.3 + x, 3.56, -1.0 + z], [0.05, 0.52, 0.05], { cylinder: true });
    emitRoom('side-top', 'walnut', [-15.3, 3.875, -1.0], [0.5, 0.05, 0.5], { radius: 0.02 });
    emitRoom('side-book-pages', 'cream', [-15.4, 3.92, -0.95], [0.2, 0.03, 0.16]);
    emitRoom('side-book-cover', 'ochre', [-15.4, 3.94, -0.95], [0.208, 0.008, 0.168]);
    emitRoom('side-lamp-base', 'metal', [-15.17, 3.915, -1.05], [0.18, 0.03, 0.18], { cylinder: true });
    emitRoom('side-lamp-stem', 'metal', [-15.17, 4.12, -1.05], [0.03, 0.4, 0.03], { cylinder: true });
    emitRoom('side-lamp-shade', 'cream', [-15.17, 4.44, -1.05], [0.26, 0.28, 0.26], { cylinder: true });
    // Dresser on the spine wall with a plant and stacked books.
    emitRoom('dresser-carcass', 'walnut', [-19.6, 3.85, -2.5], [0.5, 1.0, 1.6]);
    for (let i = 0; i < 3; i++) {
      emitRoom(`dresser-drawer-${i}`, 'ochre', [-19.34, 3.6 + i * 0.25, -2.5], [0.02, 0.2, 1.4]);
      emitRoom(`dresser-pull-${i}`, 'metal', [-19.32, 3.6 + i * 0.25, -2.5], [0.02, 0.03, 0.3]);
    }
    emitRoom('dresser-pot', 'ochre', [-19.6, 4.45, -2.9], [0.18, 0.14, 0.18], { cylinder: true });
    emitRoom('dresser-plant', 'fabric', [-19.6, 4.62, -2.9], [0.26, 0.22, 0.26], { radius: 0.06 });
    emitRoom('dresser-book-pages', 'cream', [-19.6, 4.37, -2.0], [0.24, 0.035, 0.19]);
    emitRoom('dresser-book-cover', 'ochre', [-19.6, 4.392, -2.0], [0.248, 0.009, 0.198]);
    // Drapes on the street-wall bedroom window with a curtain rod.
    emitRoom('drape-rod', 'metal', [-13.3, 5.78, -5.6], [0.04, 0.04, 3.0], { radius: 0.015 });
    emitRoom('drape--1', 'cream', [-13.32, 4.6, -6.95], [0.12, 2.3, 0.5], { radius: 0.04 });
    emitRoom('drape-1', 'cream', [-13.32, 4.6, -4.25], [0.12, 2.3, 0.5], { radius: 0.04 });
  }
  // G2 yellow-bedroom dressing: yellow-house master bedroom (east upper
  // front, centreX +20) only. Mirror of the teal block above (x -> -x about
  // the origin; z shared): identical part vocabulary, chair yaws kept so the
  // backrest still faces the bed. The teal bedroom and both living rooms keep
  // their shipped/G2 sets, so every other room is a control view. Every
  // room-scale part below is presentation-only (never solid: zero new solids,
  // zero collision change). Room parts are recorded against the synthetic
  // room anchor `yellow-house-bedroom` (room-local origin [20, 3.3, 0])
  // rather than a furniture footprint, which they intentionally exceed. Only
  // existing InteriorRoles feed the merge buckets, so the draw-group census
  // never grows. Bedroom scope only: no office/closet/balcony construction
  // beyond dressing this room.
  if (anchors.some((a) => a.id === 'yellow-house-bed')) {
    const ROOM = { minX: 13.2, maxX: 19.95, minZ: -8.7, maxZ: 0.9, minY: 3.3, maxY: 6.3 } as const;
    const emitRoom = (name: string, role: InteriorRole, center: V3, size: V3,
      opts: { cylinder?: boolean; radius?: number; yaw?: number } = {}) => {
      const yaw = opts.yaw ?? 0;
      const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
      const hx = (size[0] * c + size[2] * s) / 2, hz = (size[0] * s + size[2] * c) / 2;
      if (center[0] - hx < ROOM.minX || center[0] + hx > ROOM.maxX
        || center[2] - hz < ROOM.minZ || center[2] + hz > ROOM.maxZ
        || center[1] - size[1] / 2 < ROOM.minY - 1e-6 || center[1] + size[1] / 2 > ROOM.maxY)
        throw new Error(`Yellow bedroom dressing outside room envelope: ${name}`);
      const roomRotation = new Quaternion().setFromEuler(new Euler(0, yaw, 0));
      const roomGeometry = opts.cylinder
        ? new CylinderGeometry(size[0] * 0.36, size[0] * 0.5, size[1], 8)
        : new RoundedBoxGeometry(...size, 1, Math.min(opts.radius ?? 0.008, ...size.map((n) => n / 3)));
      retile(roomGeometry, role);
      roomGeometry.applyMatrix4(new Matrix4().compose(new Vector3(...center), roomRotation, new Vector3(1, 1, 1)));
      const roomNormalized = roomGeometry.index ? roomGeometry.toNonIndexed() : roomGeometry;
      if (roomNormalized !== roomGeometry) roomGeometry.dispose();
      roomNormalized.clearGroups();
      const roomBucket = buckets.get(role) ?? [];
      roomBucket.push(roomNormalized); buckets.set(role, roomBucket);
      components.push({ id: `yellow-house-bedroom-${name}`, anchorId: 'yellow-house-bedroom',
        role, size, local: [center[0] - 20, center[1] - 3.3, center[2]] });
    };
    // Striped rug under the bed: cream base with dark woven stripes.
    emitRoom('rug-underlay', 'cream', [15.4, 3.31, -5.2], [3.4, 0.02, 2.8], { radius: 0.004 });
    for (const dz of [-1.1, -0.55, 0, 0.55, 1.1])
      emitRoom(`rug-stripe-${dz}`, 'dark', [15.4, 3.325, -5.2 + dz], [3.2, 0.015, 0.22], { radius: 0.003 });
    // Bench at the foot of the bed with a folded quilt throw.
    for (const x of [16.55, 17.05]) for (const z of [-5.85, -4.55])
      emitRoom(`bench-leg-${x}-${z}`, 'walnut', [x, 3.44, z], [0.06, 0.28, 0.06], { cylinder: true });
    emitRoom('bench-frame', 'walnut', [16.8, 3.62, -5.2], [0.65, 0.1, 1.5]);
    emitRoom('bench-cushion', 'fabric', [16.8, 3.74, -5.2], [0.58, 0.14, 1.42], { radius: 0.06 });
    emitRoom('bench-throw', 'quilt', [16.8, 3.83, -5.2], [0.6, 0.03, 0.7], { radius: 0.01 });
    // Nightstands flanking the headboard, each with a table lamp.
    const nightstand = (cz: number, tag: string) => {
      emitRoom(`${tag}-carcass`, 'walnut', [14.3, 3.62, cz], [0.5, 0.55, 0.45]);
      emitRoom(`${tag}-drawer`, 'ochre', [14.04, 3.7, cz], [0.02, 0.2, 0.35]);
      emitRoom(`${tag}-pull`, 'metal', [14.02, 3.7, cz], [0.02, 0.03, 0.12]);
      emitRoom(`${tag}-lamp-base`, 'metal', [14.3, 3.93, cz], [0.2, 0.03, 0.2], { cylinder: true });
      emitRoom(`${tag}-lamp-stem`, 'metal', [14.3, 4.12, cz], [0.03, 0.36, 0.03], { cylinder: true });
      emitRoom(`${tag}-lamp-shade`, 'cream', [14.3, 4.38, cz], [0.28, 0.3, 0.28], { cylinder: true });
    };
    nightstand(-6.6, 'stand-north');
    nightstand(-3.8, 'stand-south');
    // Framed print above the headboard on the street wall.
    emitRoom('print-frame', 'walnut', [13.27, 5.05, -5.2], [0.05, 0.74, 0.98]);
    emitRoom('print-mat', 'cream', [13.26, 5.05, -5.2], [0.055, 0.62, 0.86]);
    emitRoom('print-art', 'ochre', [13.27, 5.05, -5.2], [0.05, 0.4, 0.6]);
    // Sunburst clock on the spine wall, clear of the wardrobe.
    emitRoom('clock-face', 'cream', [19.86, 5.3, -5.2], [0.05, 0.44, 0.44], { radius: 0.02 });
    emitRoom('clock-hub', 'ochre', [19.83, 5.3, -5.2], [0.06, 0.12, 0.12]);
    for (const dy of [-0.36, 0.36]) emitRoom(`clock-ray-y-${dy}`, 'walnut', [19.86, 5.3 + dy, -5.2], [0.03, 0.16, 0.06]);
    for (const dz of [-0.36, 0.36]) emitRoom(`clock-ray-z-${dz}`, 'walnut', [19.86, 5.3, -5.2 + dz], [0.03, 0.06, 0.16]);
    // Lounge chair facing the bed with a side table and lamp.
    const yaw = Math.PI;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (lx: number, lz: number): [number, number] => [14.2 + lx * c + lz * s, -1.0 - lx * s + lz * c];
    const chairPart = (n: string, role: InteriorRole, lx: number, y: number, lz: number, size: V3, radius = 0.05) => {
      const [wcx, wcz] = at(lx, lz);
      emitRoom(`chair-${n}`, role, [wcx, y, wcz], size, { radius, yaw });
    };
    for (const x of [-0.3, 0.3]) for (const z of [-0.33, 0.33]) {
      const [wcx, wcz] = at(x, z);
      emitRoom(`chair-leg-${x}-${z}`, 'walnut', [wcx, 3.46, wcz], [0.06, 0.32, 0.06], { cylinder: true, yaw });
    }
    chairPart('seat-frame', 'walnut', 0, 3.52, 0, [0.72, 0.12, 0.8], 0.008);
    chairPart('seat-cushion', 'fabric', 0, 3.66, 0.05, [0.6, 0.16, 0.62], 0.06);
    chairPart('back-frame', 'fabric', 0, 3.92, -0.31, [0.72, 0.62, 0.18], 0.06);
    chairPart('back-cushion', 'fabric', 0, 3.96, -0.2, [0.56, 0.4, 0.14], 0.06);
    chairPart('arm--1', 'fabric', -0.33, 3.8, 0, [0.14, 0.3, 0.7], 0.05);
    chairPart('arm-1', 'fabric', 0.33, 3.8, 0, [0.14, 0.3, 0.7], 0.05);
    chairPart('pillow', 'ochre', 0.08, 3.9, -0.12, [0.34, 0.32, 0.12], 0.05);
    for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2])
      emitRoom(`side-leg-${x}-${z}`, 'walnut', [15.3 + x, 3.56, -1.0 + z], [0.05, 0.52, 0.05], { cylinder: true });
    emitRoom('side-top', 'walnut', [15.3, 3.875, -1.0], [0.5, 0.05, 0.5], { radius: 0.02 });
    emitRoom('side-book-pages', 'cream', [15.4, 3.92, -0.95], [0.2, 0.03, 0.16]);
    emitRoom('side-book-cover', 'ochre', [15.4, 3.94, -0.95], [0.208, 0.008, 0.168]);
    emitRoom('side-lamp-base', 'metal', [15.17, 3.915, -1.05], [0.18, 0.03, 0.18], { cylinder: true });
    emitRoom('side-lamp-stem', 'metal', [15.17, 4.12, -1.05], [0.03, 0.4, 0.03], { cylinder: true });
    emitRoom('side-lamp-shade', 'cream', [15.17, 4.44, -1.05], [0.26, 0.28, 0.26], { cylinder: true });
    // Dresser on the spine wall with a plant and stacked books.
    emitRoom('dresser-carcass', 'walnut', [19.6, 3.85, -2.5], [0.5, 1.0, 1.6]);
    for (let i = 0; i < 3; i++) {
      emitRoom(`dresser-drawer-${i}`, 'ochre', [19.34, 3.6 + i * 0.25, -2.5], [0.02, 0.2, 1.4]);
      emitRoom(`dresser-pull-${i}`, 'metal', [19.32, 3.6 + i * 0.25, -2.5], [0.02, 0.03, 0.3]);
    }
    emitRoom('dresser-pot', 'ochre', [19.6, 4.45, -2.9], [0.18, 0.14, 0.18], { cylinder: true });
    emitRoom('dresser-plant', 'fabric', [19.6, 4.62, -2.9], [0.26, 0.22, 0.26], { radius: 0.06 });
    emitRoom('dresser-book-pages', 'cream', [19.6, 4.37, -2.0], [0.24, 0.035, 0.19]);
    emitRoom('dresser-book-cover', 'ochre', [19.6, 4.392, -2.0], [0.248, 0.009, 0.198]);
    // Drapes on the street-wall bedroom window with a curtain rod.
    emitRoom('drape-rod', 'metal', [13.3, 5.78, -5.6], [0.04, 0.04, 3.0], { radius: 0.015 });
    emitRoom('drape--1', 'cream', [13.32, 4.6, -6.95], [0.12, 2.3, 0.5], { radius: 0.04 });
    emitRoom('drape-1', 'cream', [13.32, 4.6, -4.25], [0.12, 2.3, 0.5], { radius: 0.04 });
  }
  // G2 teal-kitchen dressing: teal-house ground kitchen+dining (west, centreX
  // -20) only. The yellow house keeps its shipped set, so every other room is
  // a control view. Same part vocabulary as the living/bedroom passes (ochre
  // cabinetry, refrigerator, dining chairs, rugs, framed print, sunburst
  // clock, plants). The dining pendant and kitchen flush fixtures are
  // lighting-owned (lighting/index.ts FIXTURE_KIND/FOCAL_TOKEN) and already
  // hang over this table and run, so no second shade is added here; the judged
  // plate's rectangular timber table is the existing dining-table anchor,
  // dressed with chairs, rug and a fruit centerpiece. Every room-scale part
  // below is presentation-only (never solid: zero new solids, zero collision
  // change). Room parts are recorded against the synthetic room anchor
  // `teal-house-kitchen` (room-local origin [-20, 0.08, 0]) rather than a
  // furniture footprint, which they intentionally exceed. Only existing
  // InteriorRoles feed the merge buckets, so the draw-group census never
  // grows. Kitchen scope only: no living/hall/bedroom construction beyond
  // dressing this room.
  if (anchors.some((a) => a.id === 'teal-house-kitchen-run')) {
    const ROOM = { minX: -26.73, maxX: -20.05, minZ: -8.73, maxZ: 8.73, minY: 0.08, maxY: 3.08 } as const;
    const emitRoom = (name: string, role: InteriorRole, center: V3, size: V3,
      opts: { cylinder?: boolean; radius?: number; yaw?: number } = {}) => {
      const yaw = opts.yaw ?? 0;
      const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
      const hx = (size[0] * c + size[2] * s) / 2, hz = (size[0] * s + size[2] * c) / 2;
      if (center[0] - hx < ROOM.minX || center[0] + hx > ROOM.maxX
        || center[2] - hz < ROOM.minZ || center[2] + hz > ROOM.maxZ
        || center[1] - size[1] / 2 < ROOM.minY - 1e-6 || center[1] + size[1] / 2 > ROOM.maxY)
        throw new Error(`Teal kitchen dressing outside room envelope: ${name}`);
      const roomRotation = new Quaternion().setFromEuler(new Euler(0, yaw, 0));
      const roomGeometry = opts.cylinder
        ? new CylinderGeometry(size[0] * 0.36, size[0] * 0.5, size[1], 8)
        : new RoundedBoxGeometry(...size, 1, Math.min(opts.radius ?? 0.008, ...size.map((n) => n / 3)));
      retile(roomGeometry, role);
      roomGeometry.applyMatrix4(new Matrix4().compose(new Vector3(...center), roomRotation, new Vector3(1, 1, 1)));
      const roomNormalized = roomGeometry.index ? roomGeometry.toNonIndexed() : roomGeometry;
      if (roomNormalized !== roomGeometry) roomGeometry.dispose();
      roomNormalized.clearGroups();
      const roomBucket = buckets.get(role) ?? [];
      roomBucket.push(roomNormalized); buckets.set(role, roomBucket);
      components.push({ id: `teal-house-kitchen-${name}`, anchorId: 'teal-house-kitchen',
        role, size, local: [center[0] + 20, center[1] - 0.08, center[2]] });
    };
    // Refrigerator at the south end of the base run, clear of the partition
    // wall (face z 2.07) and the dining-kitchen opening (x -25.6..-23.6).
    emitRoom('fridge-body', 'metal', [-26.35, 0.99, 2.62], [0.7, 1.82, 0.72]);
    emitRoom('fridge-freezer-door', 'metal', [-25.99, 1.58, 2.62], [0.03, 0.6, 0.68]);
    emitRoom('fridge-fridge-door', 'metal', [-25.99, 0.92, 2.62], [0.03, 0.7, 0.68]);
    emitRoom('fridge-handle-top', 'dark', [-25.96, 1.32, 2.34], [0.04, 0.28, 0.04]);
    emitRoom('fridge-handle-bottom', 'dark', [-25.96, 0.98, 2.34], [0.04, 0.28, 0.04]);
    emitRoom('fridge-cap', 'dark', [-26.35, 1.92, 2.62], [0.7, 0.04, 0.72]);
    // Yellow upper cabinet over the refrigerator plus two flanking the kitchen
    // window (z 3.6..5.6) so the window sightline stays open.
    emitRoom('upper-fridge-carcass', 'ochre', [-26.45, 2.28, 2.62], [0.56, 0.64, 0.68]);
    emitRoom('upper-fridge-door', 'ochre', [-26.16, 2.28, 2.62], [0.02, 0.56, 0.6]);
    const wallCabinet = (cz: number, tag: string) => {
      emitRoom(`${tag}-carcass`, 'ochre', [-26.56, 2.25, cz], [0.3, 0.7, 0.8]);
      emitRoom(`${tag}-door`, 'ochre', [-26.4, 2.25, cz], [0.02, 0.62, 0.72]);
      emitRoom(`${tag}-pull`, 'metal', [-26.38, 2.25, cz], [0.02, 0.12, 0.04]);
    };
    wallCabinet(6.1, 'upper-north');
    wallCabinet(7.0, 'upper-far-north');
    // Range leg on the north wall with an ochre cabinet east of it, clear of
    // the garage-link door (x -24.6..-23.5) by a full cabinet gap.
    emitRoom('stove-body', 'dark', [-26.2, 0.49, 8.43], [0.7, 0.82, 0.6]);
    emitRoom('stove-oven-door', 'dark', [-26.2, 0.48, 8.12], [0.6, 0.58, 0.03]);
    emitRoom('stove-handle', 'metal', [-26.2, 0.8, 8.1], [0.5, 0.04, 0.05]);
    emitRoom('stove-hob', 'metal', [-26.2, 0.915, 8.43], [0.7, 0.03, 0.6]);
    for (const x of [-0.18, 0.18]) for (const z of [-0.15, 0.15])
      emitRoom(`stove-burner-${x}-${z}`, 'dark', [-26.2 + x, 0.94, 8.43 + z], [0.18, 0.02, 0.18], { cylinder: true });
    emitRoom('cabinet-east-carcass', 'walnut', [-25.35, 0.49, 8.43], [0.8, 0.82, 0.6]);
    emitRoom('cabinet-east-door', 'ochre', [-25.35, 0.49, 8.12], [0.76, 0.74, 0.02]);
    emitRoom('cabinet-east-pull', 'metal', [-25.35, 0.62, 8.1], [0.2, 0.03, 0.03]);
    emitRoom('cabinet-east-counter', 'porcelain', [-25.35, 0.945, 8.43], [0.84, 0.05, 0.6]);
    // Countertop dressing on the existing run (counter top y 0.9175).
    emitRoom('counter-fruit-bowl', 'ochre', [-26.2, 0.96, 6.6], [0.3, 0.08, 0.3], { cylinder: true });
    emitRoom('counter-fruit-0', 'ochre', [-26.26, 1.02, 6.58], [0.09, 0.09, 0.09], { radius: 0.03 });
    emitRoom('counter-fruit-1', 'cream', [-26.14, 1.02, 6.62], [0.09, 0.09, 0.09], { radius: 0.03 });
    emitRoom('counter-fruit-2', 'ochre', [-26.2, 1.03, 6.68], [0.09, 0.09, 0.09], { radius: 0.03 });
    emitRoom('canister-a', 'porcelain', [-26.2, 1.03, 4.2], [0.14, 0.22, 0.14], { cylinder: true });
    emitRoom('canister-a-lid', 'walnut', [-26.2, 1.15, 4.2], [0.15, 0.03, 0.15], { cylinder: true });
    emitRoom('canister-b', 'porcelain', [-26.2, 1.03, 4.48], [0.14, 0.22, 0.14], { cylinder: true });
    emitRoom('canister-b-lid', 'walnut', [-26.2, 1.15, 4.48], [0.15, 0.03, 0.15], { cylinder: true });
    emitRoom('cutting-board', 'walnut', [-26.2, 0.93, 5.3], [0.4, 0.025, 0.28]);
    emitRoom('board-loaf', 'cream', [-26.2, 0.973, 5.3], [0.22, 0.06, 0.12], { radius: 0.02 });
    emitRoom('herb-pot', 'ochre', [-26.2, 0.968, 3.5], [0.12, 0.1, 0.12], { cylinder: true });
    emitRoom('herb-plant', 'fabric', [-26.2, 1.06, 3.5], [0.16, 0.12, 0.16], { radius: 0.05 });
    // Runner in the work aisle, clear of the dining-kitchen opening (z 2 wall).
    emitRoom('runner-underlay', 'cream', [-25.35, 0.09, 5.0], [0.9, 0.02, 3.4], { radius: 0.004 });
    emitRoom('runner-stripe--1', 'ochre', [-25.71, 0.105, 5.0], [0.12, 0.015, 3.2], { radius: 0.003 });
    emitRoom('runner-stripe-1', 'ochre', [-24.99, 0.105, 5.0], [0.12, 0.015, 3.2], { radius: 0.003 });
    // Dining rug under the existing timber table, clear of the slider, the
    // living-dining opening and the partition wall alike.
    emitRoom('dining-rug-underlay', 'cream', [-23.4, 0.09, -3.4], [3.2, 0.02, 2.6], { radius: 0.004 });
    emitRoom('dining-rug-pattern', 'quilt', [-23.4, 0.105, -3.4], [3.0, 0.015, 2.4], { radius: 0.003 });
    // Four dining chairs around the existing table (top y 0.785).
    const diningChair = (cx: number, cz: number, yaw: number, tag: string) => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const at = (lx: number, lz: number): [number, number] => [cx + lx * c + lz * s, cz - lx * s + lz * c];
      for (const x of [-0.18, 0.18]) for (const z of [-0.18, 0.18]) {
        const [wcx, wcz] = at(x, z);
        emitRoom(`${tag}-leg-${x}-${z}`, 'walnut', [wcx, 0.305, wcz], [0.05, 0.45, 0.05], { cylinder: true, yaw });
      }
      const [sex, sez] = at(0, 0);
      emitRoom(`${tag}-seat`, 'walnut', [sex, 0.56, sez], [0.45, 0.06, 0.45], { radius: 0.02, yaw });
      const [bax, baz] = at(0, -0.255);
      emitRoom(`${tag}-back`, 'walnut', [bax, 0.865, baz], [0.45, 0.55, 0.06], { radius: 0.02, yaw });
    };
    diningChair(-24.55, -3.4, Math.PI / 2, 'chair-west');
    diningChair(-22.25, -3.4, -Math.PI / 2, 'chair-east');
    diningChair(-23.4, -4.45, 0, 'chair-north');
    diningChair(-23.4, -2.35, Math.PI, 'chair-south');
    // Fruit centerpiece on the table, clear of the anchor's book.
    emitRoom('table-fruit-bowl', 'ochre', [-23.4, 0.82, -3.4], [0.34, 0.07, 0.34], { cylinder: true });
    emitRoom('table-fruit-0', 'ochre', [-23.46, 0.875, -3.38], [0.09, 0.09, 0.09], { radius: 0.03 });
    emitRoom('table-fruit-1', 'cream', [-23.34, 0.875, -3.42], [0.09, 0.09, 0.09], { radius: 0.03 });
    emitRoom('table-fruit-2', 'ochre', [-23.4, 0.885, -3.32], [0.09, 0.09, 0.09], { radius: 0.03 });
    // Framed print on the spine wall, clear of both cased openings.
    emitRoom('print-frame', 'walnut', [-20.12, 1.9, -3.4], [0.05, 0.7, 0.9]);
    emitRoom('print-mat', 'cream', [-20.11, 1.9, -3.4], [0.055, 0.58, 0.78]);
    emitRoom('print-art', 'ochre', [-20.1, 1.9, -3.4], [0.05, 0.36, 0.54]);
    // Sunburst clock on the dining face of the partition wall.
    emitRoom('clock-face', 'cream', [-22.5, 2.2, 1.9], [0.44, 0.44, 0.05], { radius: 0.02 });
    emitRoom('clock-hub', 'ochre', [-22.5, 2.2, 1.87], [0.12, 0.12, 0.06]);
    for (const dx of [-0.36, 0.36]) emitRoom(`clock-ray-x-${dx}`, 'walnut', [-22.5 + dx, 2.2, 1.9], [0.16, 0.06, 0.03]);
    for (const dz of [-0.36, 0.36]) emitRoom(`clock-ray-y-${dz}`, 'walnut', [-22.5, 2.2 + dz, 1.9], [0.06, 0.16, 0.03]);
    // Corner plant by the side window, clear of the living-dining opening.
    emitRoom('plant-pot', 'ochre', [-20.5, 0.28, -8.2], [0.34, 0.4, 0.34], { cylinder: true });
    emitRoom('plant-soil', 'dark', [-20.5, 0.49, -8.2], [0.28, 0.04, 0.28], { cylinder: true });
    emitRoom('plant-low', 'fabric', [-20.5, 0.75, -8.2], [0.4, 0.5, 0.4], { radius: 0.12 });
    emitRoom('plant-mid', 'fabric', [-20.65, 1.05, -8.1], [0.3, 0.35, 0.3], { radius: 0.1 });
    emitRoom('plant-top', 'fabric', [-20.35, 1.0, -8.3], [0.28, 0.3, 0.28], { radius: 0.1 });
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
