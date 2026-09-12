/**
 * world-studio/gardens — original midcentury backyard dressing for the two authored houses.
 *
 *   createStudioGardens(options?): { root, solids, reviewPoints, stats, dispose }
 *
 * Every prop is authored in YARD-LOCAL metres: `lx` is depth behind the house rear wall
 * (0 = the wall face, positive = deeper into the yard), `z` is world Z (the houses are not
 * mirrored in Z), `y` is world height. The yard frame is derived from the architecture
 * lane's `STUDIO_HOUSES` (centreX, frontSign) and `HOUSE_HALF_WIDTH`, so the kit follows the
 * houses if root moves them; a caller may pass explicit yards instead.
 *
 * Authority: solids are conservative axis-aligned boxes (yaw-rotated OBBs for turned
 * furniture) around real structural mass only — decks, posts, walls, seats, table tops,
 * planters, bins, utilities. Cloth, slats, rafters, hoses, lids, foliage and pavers are
 * presentation-only. The factory refuses its own output if any solid enters a required
 * access lane or a spawn clearance disc (see STUDIO_GARDEN_CLEAR_LANES).
 *
 * Geometry is merged per material role into one draw group each (same batching contract as
 * `interiors/`), so the whole kit is about a dozen draw calls. No Math.random: one seeded
 * stream from `nature/seeded.ts`.
 */
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Euler, Group, IcosahedronGeometry, Matrix4, Mesh, Object3D, Quaternion, TorusGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Box2 } from '../../collision';
import type { BallisticMaterialId } from '../../ballistics';
import { HOUSE_HALF_WIDTH, STUDIO_HOUSES } from '../architecture';
import { studioSpawnPositions } from '../layout';
import { mulberry32 } from '../nature/seeded';
import { createGardenPalette, type GardenRole } from './materials';

export type StudioGardenSolid = { id: string; mesh: Object3D; bounds: Box2; material: BallisticMaterialId };
export type StudioGardenYard = Readonly<{ id: string; side: 'teal' | 'yellow'; centreX: number; frontSign: 1 | -1 }>;
export type StudioGardenReviewPoint = Readonly<{ id: string; position: [number, number, number]; target: [number, number, number] }>;
export type StudioGardenComponent = Readonly<{ id: string; yard: string; prop: string; role: GardenRole; solid: boolean; triangles: number }>;
export type StudioGardensOptions = Readonly<{
  yards?: readonly StudioGardenYard[];
  /** World (x, z) points that stay clear of every solid by `spawnClearanceM`. Default: the arena spawns. */
  spawns?: ReadonlyArray<readonly [number, number]>;
  spawnClearanceM?: number;
}>;
export type StudioGardenStats = Readonly<{
  triangles: number;
  drawGroups: number;
  solids: number;
  components: number;
  textures: number;
  perYard: Readonly<Record<string, Readonly<{ components: number; solids: number; triangles: number }>>>;
}>;
export type StudioGardens = Readonly<{
  root: Group;
  solids: StudioGardenSolid[];
  reviewPoints: StudioGardenReviewPoint[];
  stats: StudioGardenStats;
  dispose: () => void;
}>;

export const STUDIO_GARDEN_BUDGET = Object.freeze({ triangles: 60_000, drawGroups: 16 });
export const STUDIO_GARDEN_SPAWN_CLEARANCE_M = 1;
/** Yard-local extent every part must stay inside (lx behind the rear wall, world z). */
export const STUDIO_GARDEN_YARD_EXTENT = Object.freeze({ minLx: -3.6, maxLx: 12.6, minZ: -33, maxZ: 33 });

/** Default yards follow the architecture lane's house records. */
export const STUDIO_GARDEN_YARDS: readonly StudioGardenYard[] = Object.freeze(STUDIO_HOUSES.map((house) => Object.freeze({
  id: house.side, side: house.side, centreX: house.centreX, frontSign: house.frontSign,
})));

/**
 * World rectangles no garden solid may enter, for both yard signs: the rear-door corridor
 * under the balcony, the external-stair foot, the concrete side path, the yard cross path
 * and both garden-exit lanes around the house ends (matching the nature lane's HEDGE_LANES).
 */
export const STUDIO_GARDEN_CLEAR_LANES: readonly (Box2 & { id: string })[] = Object.freeze([-1, 1].flatMap((s) => {
  const x = (a: number, b: number) => ({ minX: Math.min(s * a, s * b), maxX: Math.max(s * a, s * b) });
  return [
    { id: `rear-corridor-${s}`, ...x(27, 31), minZ: -6, maxZ: 0 },
    { id: `stair-foot-${s}`, ...x(27.6, 29.7), minZ: 3.5, maxZ: 4.6 },
    { id: `side-path-${s}`, ...x(28.15, 29.85), minZ: -19, maxZ: 19 },
    { id: `cross-path-${s}`, ...x(13, 37), minZ: -13.9, maxZ: -12.1 },
    { id: `exit-lane-north-${s}`, ...x(11, 40), minZ: -14.5, maxZ: -9.5 },
    { id: `exit-lane-south-${s}`, ...x(11, 40), minZ: 18.5, maxZ: 23.5 },
  ];
}));

type V3 = [number, number, number];
type Shape = 'box' | 'cylinder' | 'cone' | 'torus' | 'clump' | 'sheet';
type PartOptions = Readonly<{
  /** Yard-local XYZ Euler (radians) about the part's own centre. */
  rotation?: V3;
  /** Emit an authoritative collider: `true` picks a material from the role, or name one. */
  solid?: boolean | BallisticMaterialId;
  shape?: Shape;
  segments?: number;
  /** Cylinder/cone top radius as a fraction of the bottom radius. */
  taper?: number;
}>;

const DEFAULT_SOLID_MATERIAL: Partial<Record<GardenRole, BallisticMaterialId>> = {
  galvanised: 'thin-metal', blackSteel: 'thin-metal', plasticGreen: 'thin-metal', concrete: 'concrete', terracotta: 'concrete',
};

function overlaps(a: Box2, b: Box2): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** Projects world-metre UVs so shared tiles keep their physical size on every part. */
function projectUvs(geometry: BufferGeometry, tile: number, size: V3, seed: number): void {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  if (!normal || !uv) return;
  const grainAxis = size.indexOf(Math.max(...size));
  const offset = seed * 0.37;
  for (let i = 0; i < position.count; i += 1) {
    const n = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i)), Math.abs(normal.getZ(i))];
    const p = [position.getX(i), position.getY(i), position.getZ(i)];
    const dominant = n.indexOf(Math.max(...n));
    const inPlane = [0, 1, 2].filter((axis) => axis !== dominant) as [number, number];
    const vAxis = inPlane.includes(grainAxis) ? grainAxis : (size[inPlane[0]] >= size[inPlane[1]] ? inPlane[0] : inPlane[1]);
    const uAxis = inPlane[0] === vAxis ? inPlane[1] : inPlane[0];
    uv.setXY(i, p[uAxis]! / tile + offset, p[vAxis]! / tile + offset);
  }
}

function billow(geometry: BufferGeometry, width: number, drop: number, amount: number): void {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i) / width + 0.5;
    const t = 1 - (position.getY(i) + drop / 2) / drop;
    const bulge = Math.sin(Math.PI * x) * Math.pow(Math.max(0, t), 0.7) * amount;
    position.setZ(i, position.getZ(i) + bulge);
    position.setY(i, position.getY(i) - (t > 0.95 ? Math.abs(Math.sin(x * Math.PI * 3)) * 0.02 : 0));
  }
  geometry.computeVertexNormals();
}

export function createStudioGardens(options: StudioGardensOptions = {}): StudioGardens {
  const yards = options.yards ?? STUDIO_GARDEN_YARDS;
  const spawns = options.spawns ?? ([0, 1] as const).flatMap((team) => studioSpawnPositions(team).map(([x, , z]) => [x, z] as const));
  const clearance = options.spawnClearanceM ?? STUDIO_GARDEN_SPAWN_CLEARANCE_M;
  const ids = new Set<string>();
  for (const yard of yards) {
    if (!yard.id || ids.has(yard.id) || !Number.isFinite(yard.centreX) || Math.abs(yard.frontSign) !== 1) throw new Error('Invalid or duplicate garden yard');
    ids.add(yard.id);
  }

  const root = new Group();
  root.name = 'world-studio-gardens';
  const palette = createGardenPalette();
  const buckets = new Map<GardenRole, BufferGeometry[]>();
  const solids: StudioGardenSolid[] = [];
  const solidRoles = new Map<string, GardenRole>();
  const components: StudioGardenComponent[] = [];
  const reviewPoints: StudioGardenReviewPoint[] = [];
  const rng = mulberry32(0x6a7d_e211);
  const partIds = new Set<string>();

  for (const yard of yards) {
    const mirrored = yard.frontSign === 1;
    const wx = (lx: number): number => yard.centreX - yard.frontSign * (HOUSE_HALF_WIDTH + lx);
    const worldEuler = (r: V3): Euler => new Euler(r[0], mirrored ? -r[1] : r[1], mirrored ? -r[2] : r[2]);
    let prop = 'yard';
    const paint: GardenRole = yard.side === 'teal' ? 'paintedTeal' : 'paintedYellow';
    const trim: GardenRole = yard.side === 'teal' ? 'paintedWhite' : 'paintedGreen';

    const part = (name: string, role: GardenRole, centre: V3, size: V3, opts: PartOptions = {}): void => {
      const id = `${yard.id}-${prop}-${name}`.toLowerCase();
      if (partIds.has(id)) throw new Error(`Duplicate garden part id: ${id}`);
      if (![...centre, ...size].every(Number.isFinite) || size.some((n) => n <= 0)) throw new Error(`Invalid garden part: ${id}`);
      const [lx, y, z] = centre;
      if (lx - size[0] / 2 < STUDIO_GARDEN_YARD_EXTENT.minLx || lx + size[0] / 2 > STUDIO_GARDEN_YARD_EXTENT.maxLx
        || z - size[2] / 2 < STUDIO_GARDEN_YARD_EXTENT.minZ || z + size[2] / 2 > STUDIO_GARDEN_YARD_EXTENT.maxZ) throw new Error(`Garden part leaves the yard: ${id}`);
      partIds.add(id);
      const shape = opts.shape ?? 'box';
      const segments = opts.segments ?? 12;
      let geometry: BufferGeometry;
      if (shape === 'cylinder') geometry = new CylinderGeometry(size[0] / 2 * (opts.taper ?? 1), size[0] / 2, size[1], segments);
      else if (shape === 'cone') geometry = new ConeGeometry(size[0] / 2, size[1], segments);
      else if (shape === 'torus') geometry = new TorusGeometry(size[0] / 2, size[1] / 2, 8, segments);
      else if (shape === 'clump') {
        geometry = new IcosahedronGeometry(size[0] / 2, 1);
        const p = geometry.getAttribute('position');
        for (let i = 0; i < p.count; i += 1) {
          const k = 0.82 + rng() * 0.36;
          p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * (size[1] / size[0]), p.getZ(i) * k * (size[2] / size[0]));
        }
        geometry.computeVertexNormals();
      } else if (shape === 'sheet') {
        geometry = new BoxGeometry(size[0], size[1], size[2], 10, 5, 1);
        billow(geometry, size[0], size[1], 0.05 + rng() * 0.04);
      } else geometry = new BoxGeometry(size[0], size[1], size[2]);
      const tile = palette.tileMetres(role);
      if (tile) projectUvs(geometry, tile, size, partIds.size);
      const rotation = opts.rotation ?? [0, 0, 0];
      const worldCentre = new Vector3(wx(lx), y, z);
      const quaternion = new Quaternion().setFromEuler(worldEuler(rotation));
      geometry.applyMatrix4(new Matrix4().compose(worldCentre, quaternion, new Vector3(1, 1, 1)));
      const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
      if (normalized !== geometry) geometry.dispose();
      normalized.clearGroups();
      const bucket = buckets.get(role) ?? [];
      bucket.push(normalized);
      buckets.set(role, bucket);
      const triangles = normalized.getAttribute('position').count / 3;
      components.push({ id, yard: yard.id, prop, role, solid: Boolean(opts.solid), triangles });
      if (opts.solid) {
        const material: BallisticMaterialId = typeof opts.solid === 'string' ? opts.solid : (DEFAULT_SOLID_MATERIAL[role] ?? 'wood');
        const yaw = mirrored ? -rotation[1] : rotation[1];
        const bounds: Box2 = {
          minX: worldCentre.x - size[0] / 2, maxX: worldCentre.x + size[0] / 2,
          minY: worldCentre.y - size[1] / 2, maxY: worldCentre.y + size[1] / 2,
          minZ: worldCentre.z - size[2] / 2, maxZ: worldCentre.z + size[2] / 2,
        };
        if (yaw !== 0) bounds.rotation = [0, yaw, 0];
        solidRoles.set(id, role);
        solids.push({ id, mesh: root, material, bounds });
      }
    };
    /** Straight member from a to b (yard-local), square section `thick`. */
    const segment = (name: string, role: GardenRole, a: V3, b: V3, thick: number, opts: PartOptions = {}): void => {
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const length = Math.hypot(d[0]!, d[1]!, d[2]!);
      const yaw = Math.atan2(-d[2]!, d[0]!);
      const pitch = Math.asin(d[1]! / length);
      part(name, role, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [length, thick, thick], { ...opts, rotation: [0, yaw, pitch] });
    };
    /** Rotates a prop-local offset by the prop yaw about its origin. */
    const at = (origin: V3, yaw: number, o: V3): V3 => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      return [origin[0] + o[0] * c + o[2] * s, origin[1] + o[1], origin[2] - o[0] * s + o[2] * c];
    };

    // ------------------------------------------------------------------ paved patio
    prop = 'patio';
    for (let i = 0; i < 7; i += 1) for (let j = 0; j < 8; j += 1) {
      const dark = rng() > 0.7;
      part(`paver-${i}-${j}`, 'concrete', [0.65 + i * 0.6, 0.045 + (dark ? 0.004 : 0), 4.75 + j * 0.6], [0.586, 0.05, 0.586]);
    }

    // Stepping stones link the patio to the laundry and shed, skipping the concrete cross path.
    prop = 'stepping-stones';
    for (let k = 0; k < 30; k += 1) {
      const z = 3.6 - k * 0.72;
      if (z < -18.4 || (z > -14.3 && z < -11.7)) continue;
      part(`stone-${k}`, 'concrete', [4.6 + (rng() - 0.5) * 0.12, 0.02 + (rng() > 0.6 ? 0.006 : 0), z], [0.44 + rng() * 0.06, 0.04, 0.44 + rng() * 0.06], { shape: 'cylinder', segments: 11 });
    }

    // ------------------------------------------------------------------ deck
    prop = 'deck';
    const DECK_Y = 0.3;
    part('platform', 'cedar', [3.75, DECK_Y / 2, 7.1], [1.5, DECK_Y, 4.2], { solid: 'wood' });
    for (const [name, c, s] of [['rim-yard', [4.485, 0.19, 7.1], [0.03, 0.2, 4.2]], ['rim-house', [3.015, 0.19, 7.1], [0.03, 0.2, 4.2]], ['rim-north', [3.75, 0.19, 5.015], [1.5, 0.2, 0.03]], ['rim-south', [3.75, 0.19, 9.185], [1.5, 0.2, 0.03]]] as const)
      part(name, 'cedar', [...c], [...s]);
    for (let b = 0; b < 9; b += 1) {
      const lx = 3.0 + 0.076 + 0.152 * b + 0.06;
      part(`board-${b}`, 'cedar', [lx, DECK_Y + 0.014 + (rng() - 0.5) * 0.003, 7.1], [0.14, 0.028, 4.2]);
    }
    for (const [k, z] of [4.84, 9.36].entries()) part(`step-${k}`, 'cedar', [3.75, 0.075, z], [0.9, 0.15, 0.32], { solid: 'wood' });
    for (const [k, z] of [4.84, 9.36].entries()) for (let b = 0; b < 2; b += 1) part(`step-${k}-tread-${b}`, 'cedar', [3.75, 0.165, z + (b - 0.5) * 0.15], [0.9, 0.03, 0.14]);

    if (yard.side === 'teal') {
      // White pergola over the sun deck, free-standing (the side path runs between deck and house).
      prop = 'pergola';
      const posts: Array<[number, number]> = [[3.12, 5.12], [3.12, 9.08], [4.38, 5.12], [4.38, 9.08]];
      for (const [k, [lx, z]] of posts.entries()) part(`post-${k}`, 'paintedWhite', [lx, DECK_Y + 1.1, z], [0.12, 2.2, 0.12], { solid: 'wood' });
      for (const [k, lx] of [3.12, 4.38].entries()) part(`beam-${k}`, 'paintedWhite', [lx, 2.6, 7.1], [0.09, 0.2, 4.7]);
      for (const [k, [lx, z]] of posts.entries()) {
        const dz = z < 7 ? 1 : -1;
        segment(`brace-${k}`, 'paintedWhite', [lx, DECK_Y + 1.7, z + dz * 0.06], [lx, 2.5, z + dz * 0.5], 0.05);
      }
      for (let r = 0; r < 8; r += 1) part(`rafter-${r}`, 'paintedWhite', [3.75, 2.78, 5.0 + r * 0.6], [1.9, 0.16, 0.05]);
      for (let s = 0; s < 6; s += 1) part(`slat-${s}`, 'paintedWhite', [3.05 + s * 0.28, 2.88, 7.1], [0.04, 0.04, 4.7]);
    } else {
      // Cedar guard rail along the yard edge of the deck, both ends open to the steps.
      prop = 'rail';
      part('barrier', 'cedar', [4.5, DECK_Y + 0.5, 7.1], [0.12, 1.0, 4.2], { solid: 'wood' });
      for (const [k, z] of [5.05, 7.1, 9.15].entries()) part(`post-${k}`, 'cedar', [4.5, DECK_Y + 0.5, z], [0.09, 1.0, 0.09]);
      part('top-rail', 'cedar', [4.5, DECK_Y + 0.97, 7.1], [0.11, 0.06, 4.24]);
      part('bottom-rail', 'cedar', [4.5, DECK_Y + 0.15, 7.1], [0.06, 0.06, 4.1]);
      for (let b = 0; b < 33; b += 1) part(`baluster-${b}`, 'cedar', [4.5, DECK_Y + 0.56, 5.16 + b * 0.121], [0.03, 0.76, 0.03]);
    }

    // ------------------------------------------------------------------ seating
    const chair = (name: string, origin: V3, yaw: number, frame: GardenRole, slats: GardenRole, lounge: boolean): void => {
      prop = name;
      const seatY = origin[1] + (lounge ? 0.36 : 0.44);
      for (const [k, [ox, oz]] of ([[-0.2, -0.24], [-0.2, 0.24], [0.2, -0.24], [0.2, 0.24]] as const).entries())
        part(`leg-${k}`, frame, at(origin, yaw, [ox, (seatY - origin[1]) / 2, oz]), [0.035, seatY - origin[1], 0.035], { rotation: [0, yaw, 0] });
      for (let s = 0; s < 5; s += 1) part(`seat-slat-${s}`, slats, at(origin, yaw, [-0.2 + s * 0.1, seatY + 0.012, 0]), [0.08, 0.024, 0.52], { rotation: [0, yaw, 0] });
      const lean = lounge ? 0.42 : 0.16;
      for (let s = 0; s < 3; s += 1) {
        const h = 0.12 + s * 0.13;
        part(`back-slat-${s}`, slats, at(origin, yaw, [-0.24 - Math.sin(lean) * h, seatY + Math.cos(lean) * h + 0.05, 0]), [0.024, 0.09, 0.52], { rotation: [0, yaw, -lean] });
      }
      for (const [k, oz] of [-0.26, 0.26].entries()) {
        part(`back-post-${k}`, frame, at(origin, yaw, [-0.24 - Math.sin(lean) * 0.25, seatY + Math.cos(lean) * 0.25 + 0.02, oz]), [0.035, 0.5, 0.035], { rotation: [0, yaw, -lean] });
        part(`arm-${k}`, slats, at(origin, yaw, [-0.02, seatY + 0.24, oz]), [0.48, 0.03, 0.05], { rotation: [0, yaw, 0] });
        part(`arm-post-${k}`, frame, at(origin, yaw, [0.18, seatY + 0.12, oz]), [0.03, 0.22, 0.03], { rotation: [0, yaw, 0] });
      }
      part('seat-mass', slats, at(origin, yaw, [-0.05, seatY / 2 + origin[1] / 2 + 0.02, 0]), [0.55, seatY - origin[1] + 0.06, 0.56], { rotation: [0, yaw, 0], solid: 'wood' });
    };
    if (yard.side === 'teal') {
      chair('lounge-chair-0', [3.72, DECK_Y, 6.0], 0, 'paintedWhite', 'paintedWhite', true);
      chair('lounge-chair-1', [3.72, DECK_Y, 8.25], 0, 'paintedWhite', 'paintedWhite', true);
      prop = 'side-table';
      part('top', 'cedar', [3.72, DECK_Y + 0.49, 7.12], [0.46, 0.03, 0.46], { shape: 'cylinder', segments: 20 });
      for (let k = 0; k < 3; k += 1) {
        const a = k * Math.PI * 2 / 3;
        segment(`leg-${k}`, 'paintedWhite', [3.72 + Math.cos(a) * 0.12, DECK_Y + 0.47, 7.12 + Math.sin(a) * 0.12], [3.72 + Math.cos(a) * 0.2, DECK_Y + 0.01, 7.12 + Math.sin(a) * 0.2], 0.03);
      }
      part('mass', 'cedar', [3.72, DECK_Y + 0.25, 7.12], [0.46, 0.5, 0.46], { solid: 'wood' });
    } else {
      prop = 'table';
      part('top', 'cedar', [3.75, DECK_Y + 0.72, 7.1], [0.95, 0.04, 0.95], { shape: 'cylinder', segments: 24, solid: 'wood' });
      part('top-edge', 'blackSteel', [3.75, DECK_Y + 0.72, 7.1], [0.97, 0.03, 0.97], { shape: 'torus', segments: 24 });
      part('pedestal', 'blackSteel', [3.75, DECK_Y + 0.36, 7.1], [0.07, 0.7, 0.07], { shape: 'cylinder', segments: 10, solid: 'thin-metal' });
      part('base', 'blackSteel', [3.75, DECK_Y + 0.015, 7.1], [0.55, 0.03, 0.55], { shape: 'cylinder', segments: 20 });
      chair('dining-chair-0', [3.75, DECK_Y, 6.25], -Math.PI / 2, 'blackSteel', 'cedar', false);
      chair('dining-chair-1', [3.75, DECK_Y, 7.95], Math.PI / 2, 'blackSteel', 'cedar', false);
      prop = 'umbrella';
      part('pole', 'galvanised', [3.75, DECK_Y + 1.25, 7.1], [0.04, 2.5, 0.04], { shape: 'cylinder', segments: 8, solid: 'thin-metal' });
      part('canopy', 'canvasRed', [3.75, DECK_Y + 2.35, 7.1], [2.4, 0.36, 2.4], { shape: 'cone', segments: 8 });
      part('valance', 'canvasRed', [3.75, DECK_Y + 2.11, 7.1], [2.42, 0.12, 2.42], { shape: 'cylinder', segments: 8, taper: 1 });
      part('finial', 'blackSteel', [3.75, DECK_Y + 2.57, 7.1], [0.05, 0.08, 0.05], { shape: 'cylinder', segments: 8, taper: 0.4 });
      for (let r = 0; r < 8; r += 1) {
        const a = r * Math.PI / 4 + Math.PI / 8;
        segment(`rib-${r}`, 'blackSteel', [3.75, DECK_Y + 2.5, 7.1], [3.75 + Math.cos(a) * 1.15, DECK_Y + 2.16, 7.1 + Math.sin(a) * 1.15], 0.018);
      }
    }

    // ------------------------------------------------------------------ barbecue
    if (yard.side === 'teal') {
      prop = 'kettle-bbq';
      const o: V3 = [3.75, 0, 10.2];
      part('bowl', 'blackSteel', [o[0], 0.75, o[2]], [0.58, 0.26, 0.58], { shape: 'cylinder', segments: 18, taper: 1 });
      part('bowl-base', 'blackSteel', [o[0], 0.62, o[2]], [0.58, 0.02, 0.58], { shape: 'cylinder', segments: 18, taper: 0.5 });
      part('lid', 'blackSteel', [o[0], 0.98, o[2]], [0.58, 0.2, 0.58], { shape: 'cylinder', segments: 18, taper: 0.35 });
      part('lid-handle', 'cedar', [o[0], 1.12, o[2]], [0.16, 0.03, 0.03]);
      part('lid-vent', 'galvanised', [o[0], 1.085, o[2]], [0.08, 0.01, 0.08], { shape: 'cylinder', segments: 10 });
      for (let k = 0; k < 3; k += 1) {
        const a = k * Math.PI * 2 / 3 + 0.5;
        segment(`leg-${k}`, 'galvanised', [o[0] + Math.cos(a) * 0.2, 0.66, o[2] + Math.sin(a) * 0.2], [o[0] + Math.cos(a) * 0.29, 0.02, o[2] + Math.sin(a) * 0.29], 0.022);
      }
      part('ash-catcher', 'blackSteel', [o[0], 0.3, o[2]], [0.28, 0.04, 0.28], { shape: 'cylinder', segments: 14 });
      part('side-shelf', 'cedar', [o[0] + 0.42, 0.72, o[2]], [0.3, 0.025, 0.36]);
      part('mass', 'blackSteel', [o[0], 0.55, o[2]], [0.62, 1.1, 0.62], { solid: 'structural-metal' });
    } else {
      prop = 'hooded-bbq';
      const o: V3 = [3.75, 0, 10.3];
      part('body', 'blackSteel', [o[0], 0.8, o[2]], [0.52, 0.34, 0.9]);
      part('hood', 'blackSteel', [o[0], 1.1, o[2]], [0.5, 0.24, 0.9]);
      part('hood-handle', 'galvanised', [o[0] - 0.26, 1.16, o[2]], [0.03, 0.03, 0.62]);
      part('hood-lip', 'galvanised', [o[0], 0.985, o[2]], [0.53, 0.02, 0.92]);
      for (const [k, dz] of [-0.63, 0.63].entries()) part(`shelf-${k}`, 'cedar', [o[0], 0.79, o[2] + dz], [0.46, 0.03, 0.32]);
      for (const [k, [dx, dz]] of ([[-0.22, -0.42], [-0.22, 0.42], [0.22, -0.42], [0.22, 0.42]] as const).entries())
        part(`leg-${k}`, 'galvanised', [o[0] + dx, 0.34, o[2] + dz], [0.03, 0.62, 0.03]);
      part('lower-shelf', 'galvanised', [o[0], 0.12, o[2]], [0.48, 0.02, 0.86]);
      part('gas-bottle', 'galvanised', [o[0] + 0.05, 0.36, o[2] - 0.15], [0.3, 0.44, 0.3], { shape: 'cylinder', segments: 14 });
      for (const [k, dz] of [-0.42, 0.42].entries()) part(`wheel-${k}`, 'blackSteel', [o[0] + 0.26, 0.1, o[2] + dz], [0.2, 0.04, 0.2], { shape: 'cylinder', segments: 14, rotation: [0, 0, Math.PI / 2] });
      part('mass', 'blackSteel', [o[0], 0.62, o[2]], [0.56, 1.24, 1.56], { solid: 'structural-metal' });
    }

    // ------------------------------------------------------------------ shed (4 x 3.5 m brief slot at X +/-34, Z -21)
    prop = 'shed';
    const S = { lx0: 5.35, lx1: 8.55, z0: -22.5, z1: -19.5, eave: 2.25, ridge: 3.15 };
    const sz = (S.z0 + S.z1) / 2;
    part('slab', 'concrete', [(S.lx0 + S.lx1) / 2, 0.06, sz], [S.lx1 - S.lx0 + 0.1, 0.12, S.z1 - S.z0 + 0.1]);
    part('apron', 'concrete', [S.lx0 - 0.55, 0.03, sz], [1.0, 0.05, 1.5]);
    const wallH = S.eave - 0.12;
    part('wall-door-end', paint, [S.lx0 + 0.05, 0.12 + wallH / 2, sz], [0.1, wallH, S.z1 - S.z0], { solid: 'wood' });
    part('wall-back-end', paint, [S.lx1 - 0.05, 0.12 + wallH / 2, sz], [0.1, wallH, S.z1 - S.z0], { solid: 'wood' });
    part('wall-north', paint, [(S.lx0 + S.lx1) / 2, 0.12 + wallH / 2, S.z0 + 0.05], [S.lx1 - S.lx0, wallH, 0.1], { solid: 'wood' });
    part('wall-south', paint, [(S.lx0 + S.lx1) / 2, 0.12 + wallH / 2, S.z1 - 0.05], [S.lx1 - S.lx0, wallH, 0.1], { solid: 'wood' });
    // Lap cladding: 0.19 m courses stepping outward, doorway courses cut around the door.
    const doorW = yard.side === 'teal' ? 0.95 : 1.5;
    for (let k = 0; k < 11; k += 1) {
      const y = 0.12 + 0.095 + k * 0.19;
      const proud = 0.012 + (k % 2) * 0.004;
      part(`clad-n-${k}`, paint, [(S.lx0 + S.lx1) / 2, y, S.z0 - proud], [S.lx1 - S.lx0 + 0.02, 0.18, 0.022]);
      part(`clad-s-${k}`, paint, [(S.lx0 + S.lx1) / 2, y, S.z1 + proud], [S.lx1 - S.lx0 + 0.02, 0.18, 0.022]);
      part(`clad-back-${k}`, paint, [S.lx1 + proud, y, sz], [0.022, 0.18, S.z1 - S.z0 + 0.02]);
      if (y > 2.02) part(`clad-door-${k}`, paint, [S.lx0 - proud, y, sz], [0.022, 0.18, S.z1 - S.z0 + 0.02]);
      else for (const [j, side] of [-1, 1].entries()) {
        const run = (S.z1 - S.z0 - doorW - 0.16) / 2;
        part(`clad-door-${k}-${j}`, paint, [S.lx0 - proud, y, sz + side * (doorW / 2 + 0.08 + run / 2)], [0.022, 0.18, run + 0.01]);
      }
    }
    for (let k = 0; k < 5; k += 1) {
      const y = S.eave + 0.09 + k * 0.18;
      const width = (S.z1 - S.z0) * (1 - (y - S.eave) / (S.ridge - S.eave));
      if (width < 0.2) break;
      part(`gable-door-${k}`, paint, [S.lx0 - 0.012, y, sz], [0.022, 0.17, width]);
      part(`gable-back-${k}`, paint, [S.lx1 + 0.012, y, sz], [0.022, 0.17, width]);
    }
    for (const [k, [lx, z]] of ([[S.lx0, S.z0], [S.lx0, S.z1], [S.lx1, S.z0], [S.lx1, S.z1]] as const).entries())
      part(`corner-trim-${k}`, trim, [lx, 0.12 + wallH / 2, z], [0.07, wallH, 0.07]);
    // Door(s) with frame, ledges and a diagonal brace; strap hinges on the yellow pair.
    for (const [k, side] of (yard.side === 'teal' ? [0] : [-1, 1]).entries()) {
      const dz = sz + side * (doorW / 4 + 0.01);
      const leafW = yard.side === 'teal' ? doorW - 0.06 : doorW / 2 - 0.04;
      part(`door-${k}`, yard.side === 'teal' ? 'paintedWhite' : 'paintedGreen', [S.lx0 - 0.04, 0.12 + 0.98, dz], [0.04, 1.96, leafW]);
      for (const [j, y] of [0.45, 1.12, 1.8].entries()) part(`door-${k}-ledge-${j}`, trim, [S.lx0 - 0.075, y, dz], [0.03, 0.09, leafW - 0.06]);
      segment(`door-${k}-brace`, trim, [S.lx0 - 0.075, 0.5, dz - (leafW / 2 - 0.08)], [S.lx0 - 0.075, 1.76, dz + (leafW / 2 - 0.08)], 0.05);
      // Strap hinges hang off the outer jamb of each yellow leaf; handles sit at the meeting edge.
      if (yard.side === 'yellow') for (const [j, y] of [0.5, 1.75].entries()) part(`door-${k}-hinge-${j}`, 'blackSteel', [S.lx0 - 0.1, y, dz + side * (leafW / 2 - 0.17)], [0.012, 0.04, 0.3]);
      const handleZ = yard.side === 'teal' ? dz + leafW / 2 - 0.12 : dz - side * (leafW / 2 - 0.1);
      part(`door-${k}-handle`, 'galvanised', [S.lx0 - 0.1, 1.05, handleZ], [0.03, 0.12, 0.03], { shape: 'cylinder', segments: 8 });
    }
    part('door-jamb-0', trim, [S.lx0 - 0.035, 0.12 + 1.0, sz - doorW / 2 - 0.04], [0.07, 2.0, 0.08]);
    part('door-jamb-1', trim, [S.lx0 - 0.035, 0.12 + 1.0, sz + doorW / 2 + 0.04], [0.07, 2.0, 0.08]);
    part('door-head', trim, [S.lx0 - 0.035, 2.16, sz], [0.07, 0.08, doorW + 0.16]);
    // Small side window with a dark pane and sill.
    part('window-pane', 'blackSteel', [S.lx0 + 1.2, 1.6, S.z1 + 0.035], [0.6, 0.5, 0.01]);
    part('window-frame-l', trim, [S.lx0 + 0.87, 1.6, S.z1 + 0.05], [0.06, 0.6, 0.04]);
    part('window-frame-r', trim, [S.lx0 + 1.53, 1.6, S.z1 + 0.05], [0.06, 0.6, 0.04]);
    part('window-frame-t', trim, [S.lx0 + 1.2, 1.88, S.z1 + 0.05], [0.72, 0.06, 0.04]);
    part('window-sill', trim, [S.lx0 + 1.2, 1.32, S.z1 + 0.06], [0.72, 0.05, 0.08]);
    // Gable roof: two pitched slabs, ridge cap, fascias and barge boards, gutter and downpipe.
    const run = (S.z1 - S.z0) / 2 + 0.3, rise = S.ridge - S.eave + 0.18;
    const pitch = Math.atan2(rise, run), slope = Math.hypot(run, rise);
    const roofLen = S.lx1 - S.lx0 + 0.5;
    for (const [k, side] of [-1, 1].entries()) {
      const zc = sz + side * run / 2, yc = S.ridge - rise / 2 + 0.03;
      part(`roof-${k}`, 'shingle', [(S.lx0 + S.lx1) / 2, yc, zc], [roofLen, 0.05, slope], { rotation: [side * pitch, 0, 0] });
      part(`fascia-${k}`, trim, [(S.lx0 + S.lx1) / 2, S.eave - 0.2, sz + side * (run + 0.02)], [roofLen, 0.15, 0.025]);
      for (const [j, lx] of [S.lx0 - 0.25, S.lx1 + 0.25].entries())
        part(`barge-${k}-${j}`, trim, [lx, yc - 0.03, zc], [0.025, 0.15, slope], { rotation: [side * pitch, 0, 0] });
    }
    part('ridge-cap', 'shingle', [(S.lx0 + S.lx1) / 2, S.ridge + 0.06, sz], [roofLen, 0.04, 0.24]);
    part('roof-mass', paint, [(S.lx0 + S.lx1) / 2, (S.eave + S.ridge) / 2 - 0.05, sz], [roofLen, S.ridge - S.eave + 0.2, S.z1 - S.z0 + 0.6], { solid: 'wood' });
    part('gutter', 'galvanised', [(S.lx0 + S.lx1) / 2, S.eave - 0.3, S.z1 + 0.37], [roofLen, 0.07, 0.09]);
    part('downpipe', 'galvanised', [S.lx0 - 0.2, 1.55, S.z1 + 0.37], [0.065, 1.4, 0.065], { shape: 'cylinder', segments: 8 });
    part('downpipe-elbow', 'galvanised', [S.lx0 - 0.3, 0.86, S.z1 + 0.37], [0.24, 0.06, 0.06]);
    prop = 'water-butt';
    part('barrel', 'plasticGreen', [S.lx0 - 0.45, 0.45, S.z1 + 0.37], [0.6, 0.9, 0.6], { shape: 'cylinder', segments: 16, taper: 0.94, solid: 'thin-metal' });
    part('lid', 'plasticGreen', [S.lx0 - 0.45, 0.915, S.z1 + 0.37], [0.58, 0.03, 0.58], { shape: 'cylinder', segments: 16 });
    part('tap', 'galvanised', [S.lx0 - 0.45, 0.12, S.z1 + 0.66], [0.025, 0.12, 0.025], { shape: 'cylinder', segments: 8, rotation: [Math.PI / 2, 0, 0] });
    if (yard.side === 'teal') {
      prop = 'dustbin';
      part('can', 'galvanised', [4.55, 0.35, -22.0], [0.48, 0.7, 0.48], { shape: 'cylinder', segments: 16, taper: 0.92, solid: 'thin-metal' });
      part('lid', 'galvanised', [4.55, 0.725, -22.0], [0.52, 0.05, 0.52], { shape: 'cylinder', segments: 16, taper: 0.7 });
      part('lid-handle', 'galvanised', [4.55, 0.77, -22.0], [0.12, 0.02, 0.02], { shape: 'torus', segments: 10, rotation: [Math.PI / 2, 0, 0] });
      for (const [k, y] of [0.2, 0.5].entries()) part(`rib-${k}`, 'galvanised', [4.55, y, -22.0], [0.5, 0.015, 0.5], { shape: 'torus', segments: 16, rotation: [Math.PI / 2, 0, 0] });
    } else {
      prop = 'door-pots';
      for (const [k, [lx, z, r]] of ([[4.55, -22.1, 0.34], [4.75, -21.75, 0.26]] as const).entries()) {
        part(`pot-${k}`, 'terracotta', [lx, r * 0.45, z], [r, r * 0.9, r], { shape: 'cylinder', segments: 14, taper: 1.18, solid: 'concrete' });
        part(`pot-${k}-rim`, 'terracotta', [lx, r * 0.9, z], [r * 1.22, 0.03, r * 1.22], { shape: 'cylinder', segments: 14 });
        part(`pot-${k}-plant`, 'foliage', [lx, r * 0.9 + r * 0.42, z], [r * 1.1, r * 0.8, r * 1.1], { shape: 'clump' });
      }
    }

    // ------------------------------------------------------------------ laundry
    const peg = (name: string, c: V3, yaw: number): void => part(name, 'paintedGreen', c, [0.012, 0.07, 0.02], { rotation: [0, yaw, 0] });
    if (yard.side === 'teal') {
      prop = 'clothesline';
      const lineX = 7.6, z0 = -17.7, z1 = -14.7, top = 1.9;
      for (const [k, z] of [z0, z1].entries()) {
        part(`post-${k}`, 'galvanised', [lineX, top / 2, z], [0.06, top, 0.06], { shape: 'cylinder', segments: 10, solid: 'thin-metal' });
        part(`crossbar-${k}`, 'galvanised', [lineX, top - 0.02, z], [1.1, 0.04, 0.04]);
        segment(`stay-${k}-0`, 'galvanised', [lineX - 0.5, top - 0.04, z], [lineX, top - 0.45, z], 0.02);
        segment(`stay-${k}-1`, 'galvanised', [lineX + 0.5, top - 0.04, z], [lineX, top - 0.45, z], 0.02);
      }
      for (const [k, dx] of [-0.45, 0, 0.45].entries()) part(`line-${k}`, 'galvanised', [lineX + dx, top - 0.02, (z0 + z1) / 2], [0.006, 0.006, z1 - z0]);
      const items: Array<[number, number, number, number]> = [[0.45, -16.3, 1.45, 1.15], [-0.45, -15.6, 1.2, 1.0], [0, -17.0, 0.7, 0.5]];
      for (const [k, [dx, zc, w, drop]] of items.entries()) {
        part(`sheet-${k}`, 'linen', [lineX + dx, top - 0.03 - drop / 2, zc], [w, drop, 0.012], { shape: 'sheet', rotation: [0, Math.PI / 2, 0] });
        for (const [j, dz] of [-w / 2 + 0.08, 0, w / 2 - 0.08].entries()) peg(`peg-${k}-${j}`, [lineX + dx, top + 0.01, zc + dz], Math.PI / 2);
      }
    } else {
      prop = 'rotary-hoist';
      const o: V3 = [8.0, 0, -16.0], top = 1.82, tilt = 0.14, arm = 1.75;
      part('pole', 'galvanised', [o[0], top / 2, o[2]], [0.06, top, 0.06], { shape: 'cylinder', segments: 10, solid: 'thin-metal' });
      part('ground-socket', 'galvanised', [o[0], 0.15, o[2]], [0.1, 0.3, 0.1], { shape: 'cylinder', segments: 10 });
      part('hub', 'galvanised', [o[0], top + 0.03, o[2]], [0.12, 0.14, 0.12], { shape: 'cylinder', segments: 10 });
      const tip = (k: number, r: number): V3 => {
        const a = k * Math.PI / 2 + Math.PI / 4;
        return [o[0] + Math.cos(a) * r, top + Math.sin(tilt) * r, o[2] - Math.sin(a) * r];
      };
      for (let k = 0; k < 4; k += 1) segment(`arm-${k}`, 'galvanised', [o[0], top, o[2]], tip(k, arm), 0.032);
      for (const [r, f] of [0.98, 0.78, 0.58].entries()) for (let k = 0; k < 4; k += 1)
        segment(`line-${r}-${k}`, 'galvanised', tip(k, arm * f), tip((k + 1) % 4, arm * f), 0.006);
      const hung: Array<[number, number, number]> = [[0, 1.3, 1.0], [1, 0.6, 0.85], [2, 1.2, 0.95], [3, 0.55, 0.8]];
      for (const [k, w, drop] of hung) {
        const a = tip(k, arm * 0.98), b = tip((k + 1) % 4, arm * 0.98);
        const yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
        const c: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.03 - drop / 2, (a[2] + b[2]) / 2];
        part(`sheet-${k}`, 'linen', c, [w, drop, 0.012], { shape: 'sheet', rotation: [0, yaw, 0] });
        for (const [j, t] of [-0.4, 0, 0.4].entries()) peg(`peg-${k}-${j}`, at([c[0], a[1] + 0.005, c[2]], yaw, [t * w, 0, 0]), yaw);
      }
    }

    // ------------------------------------------------------------------ planting
    if (yard.side === 'teal') {
      for (const [k, zc] of [1.0, 17.0].entries()) {
        prop = `raised-bed-${k}`;
        const c: V3 = [9.15, 0, zc];
        part('mass', 'cedar', [c[0], 0.19, c[2]], [0.9, 0.38, 2.0], { solid: 'wood' });
        for (let course = 0; course < 2; course += 1) {
          const y = 0.1 + course * 0.19;
          for (const [j, dx] of [-0.43, 0.43].entries()) part(`sleeper-long-${course}-${j}`, 'cedar', [c[0] + dx, y, c[2]], [0.045, 0.19, 2.02 + course * 0.02]);
          for (const [j, dz] of [-1.0, 1.0].entries()) part(`sleeper-short-${course}-${j}`, 'cedar', [c[0], y, c[2] + dz], [0.86, 0.19, 0.045]);
        }
        for (const [j, [dx, dz]] of ([[-0.43, -1.0], [-0.43, 1.0], [0.43, -1.0], [0.43, 1.0]] as const).entries()) part(`post-${j}`, 'cedar', [c[0] + dx, 0.23, c[2] + dz], [0.07, 0.46, 0.07]);
        part('soil', 'soil', [c[0], 0.3, c[2]], [0.8, 0.06, 1.9]);
        for (let row = 0; row < 2; row += 1) for (let n = 0; n < 5; n += 1)
          part(`plant-${row}-${n}`, 'foliage', [c[0] - 0.2 + row * 0.4, 0.44 + rng() * 0.05, c[2] - 0.76 + n * 0.38], [0.3, 0.26, 0.3], { shape: 'clump' });
      }
    } else {
      for (const [k, [lx, zc]] of ([[3.4, 4.35], [3.4, 11.9]] as const).entries()) {
        prop = `barrel-planter-${k}`;
        part('barrel', 'cedar', [lx, 0.25, zc], [0.6, 0.5, 0.6], { shape: 'cylinder', segments: 16, taper: 1.08, solid: 'wood' });
        for (const [j, y] of [0.1, 0.4].entries()) part(`hoop-${j}`, 'galvanised', [lx, y, zc], [0.63 + j * 0.02, 0.02, 0.63 + j * 0.02], { shape: 'torus', segments: 16, rotation: [Math.PI / 2, 0, 0] });
        part('soil', 'soil', [lx, 0.47, zc], [0.56, 0.02, 0.56], { shape: 'cylinder', segments: 16 });
        part('shrub', 'foliage', [lx, 0.8, zc], [0.7, 0.62, 0.7], { shape: 'clump' });
        part('shrub-crown', 'foliage', [lx + 0.08, 1.05, zc - 0.05], [0.42, 0.36, 0.42], { shape: 'clump' });
      }
    }

    // ------------------------------------------------------------------ utilities
    prop = 'condenser';
    part('pad', 'concrete', [0.3, 0.03, 1.65], [0.5, 0.06, 1.0]);
    part('unit', 'galvanised', [0.28, 0.5, 1.65], [0.36, 0.8, 0.9], { solid: 'thin-metal' });
    part('fan-grille', 'blackSteel', [0.28, 0.905, 1.65], [0.6, 0.012, 0.6], { shape: 'cylinder', segments: 20 });
    part('fan-hub', 'galvanised', [0.28, 0.915, 1.65], [0.1, 0.02, 0.1], { shape: 'cylinder', segments: 10 });
    for (let k = 0; k < 6; k += 1) part(`louvre-${k}`, 'blackSteel', [0.465, 0.28 + k * 0.1, 1.65], [0.008, 0.02, 0.84]);
    for (const [k, y] of [0.32, 0.4].entries()) segment(`pipe-${k}`, 'galvanised', [0.1, y, 2.14], [0.06, y + 0.35, 2.14], 0.024);
    prop = 'meter';
    part('box', 'paintedWhite', [0.13, 1.55, 3.1], [0.16, 0.42, 0.32]);
    part('box-lid', 'galvanised', [0.215, 1.55, 3.1], [0.01, 0.36, 0.26]);
    part('conduit', 'galvanised', [0.08, 0.68, 3.1], [0.025, 1.34, 0.025], { shape: 'cylinder', segments: 8 });
    prop = 'hose-reel';
    part('bracket', 'galvanised', [0.1, 0.9, -8.3], [0.12, 0.22, 0.3]);
    part('reel', 'plasticGreen', [0.3, 0.9, -8.3], [0.4, 0.13, 0.4], { shape: 'torus', segments: 18, rotation: [0, Math.PI / 2, 0] });
    part('reel-hub', 'galvanised', [0.3, 0.9, -8.3], [0.14, 0.1, 0.14], { shape: 'cylinder', segments: 10, rotation: [0, 0, Math.PI / 2] });
    part('tap-body', 'galvanised', [0.1, 1.18, -8.3], [0.03, 0.12, 0.03], { shape: 'cylinder', segments: 8, rotation: [0, 0, Math.PI / 2] });
    part('tap-handle', 'galvanised', [0.13, 1.23, -8.3], [0.07, 0.015, 0.07], { shape: 'torus', segments: 8, rotation: [Math.PI / 2, 0, 0] });
    part('tap-spout', 'galvanised', [0.19, 1.15, -8.3], [0.022, 0.08, 0.022], { shape: 'cylinder', segments: 8 });
    prop = 'bins';
    for (const [k, zc] of [10.5, 11.25].entries()) {
      const lx = -2.65;
      part(`bin-${k}-body`, 'plasticGreen', [lx, 0.63, zc], [0.58, 0.96, 0.54], { solid: 'thin-metal' });
      part(`bin-${k}-lid`, 'plasticGreen', [lx - 0.01, 1.135, zc], [0.62, 0.05, 0.58], { rotation: [0, 0, 0.04] });
      part(`bin-${k}-handle`, 'galvanised', [lx - 0.3, 1.02, zc], [0.03, 0.03, 0.44]);
      for (const [j, dz] of [-0.22, 0.22].entries()) part(`bin-${k}-wheel-${j}`, 'blackSteel', [lx - 0.24, 0.1, zc + dz], [0.2, 0.04, 0.2], { shape: 'cylinder', segments: 12, rotation: [Math.PI / 2, 0, 0] });
    }

    reviewPoints.push(
      { id: `${yard.id}-garden-deck`, position: [wx(6.4), 1.6, 12.6], target: [wx(3.7), 1.0, 7.0] },
      { id: `${yard.id}-garden-shed`, position: [wx(2.6), 1.6, -15.6], target: [wx(7.0), 1.4, -21.0] },
    );
  }

  // ---- self-check: every solid finite, unique and clear of lanes and spawn discs ----------
  for (const solid of solids) {
    const b = solid.bounds;
    if (![b.minX, b.maxX, b.minZ, b.maxZ, b.minY!, b.maxY!].every(Number.isFinite)) throw new Error(`Non-finite bounds: ${solid.id}`);
    // Rotated seats are checked on their circumscribed footprint (conservative).
    const half = b.rotation ? Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 : 0;
    const foot: Box2 = b.rotation
      ? { minX: (b.minX + b.maxX) / 2 - half, maxX: (b.minX + b.maxX) / 2 + half, minZ: (b.minZ + b.maxZ) / 2 - half, maxZ: (b.minZ + b.maxZ) / 2 + half }
      : b;
    for (const lane of STUDIO_GARDEN_CLEAR_LANES) if (overlaps(foot, lane)) throw new Error(`Garden solid ${solid.id} enters access lane ${lane.id}`);
    for (const [sx, sz] of spawns) {
      const dx = Math.max(foot.minX - sx, 0, sx - foot.maxX), dz = Math.max(foot.minZ - sz, 0, sz - foot.maxZ);
      if (Math.hypot(dx, dz) < clearance) throw new Error(`Garden solid ${solid.id} inside spawn clearance at ${sx},${sz}`);
    }
  }

  // ---- merge one draw group per role ---------------------------------------------------------
  let triangles = 0;
  for (const [role, geometries] of buckets) {
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error(`Garden merge failed: ${role}`);
    for (const g of geometries) g.dispose();
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, palette.materials[role]);
    mesh.name = `world-studio-gardens-${role}`;
    mesh.castShadow = role !== 'concrete';
    mesh.receiveShadow = true;
    mesh.userData.worldStudioGarden = true;
    root.add(mesh);
    for (const solid of solids) if (solidRoles.get(solid.id) === role) solid.mesh = mesh;
    triangles += geometry.getAttribute('position').count / 3;
  }
  const perYard: Record<string, { components: number; solids: number; triangles: number }> = {};
  for (const yard of yards) {
    const mine = components.filter((c) => c.yard === yard.id);
    perYard[yard.id] = Object.freeze({ components: mine.length, solids: mine.filter((c) => c.solid).length, triangles: mine.reduce((sum, c) => sum + c.triangles, 0) });
  }
  const stats: StudioGardenStats = Object.freeze({
    triangles, drawGroups: buckets.size, solids: solids.length, components: components.length, textures: palette.textures.length, perYard: Object.freeze(perYard),
  });
  if (triangles > STUDIO_GARDEN_BUDGET.triangles || buckets.size > STUDIO_GARDEN_BUDGET.drawGroups) throw new Error('World Studio garden budget exceeded');
  root.userData.components = components;
  root.userData.gardenStats = stats;
  root.userData.presentationOnly = false;

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    root.traverse((object) => { if (object instanceof Mesh) object.geometry.dispose(); });
    palette.dispose();
    root.clear();
  };
  root.userData.dispose = dispose;
  return Object.freeze({ root, solids, reviewPoints, stats, dispose });
}
