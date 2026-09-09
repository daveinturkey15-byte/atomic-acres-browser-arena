/**
 * HF-536 facade kit.
 *
 * A presentation-only, code-native house front. The factories deliberately
 * return ordinary Groups so an arena can place them through its existing
 * pair()/centred() helpers without importing a mesh, texture, font or collider.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

import { createGlassMaterial } from '../nuketown2-materials/families/glass';
import { createPaintedMetalMaterial } from '../nuketown2-materials/families/painted-metal';
import { createRoofMaterial } from '../nuketown2-materials/families/roof';
import { createSidingMaterial } from '../nuketown2-materials/families/siding';
import { createTimberMaterial } from '../nuketown2-materials/families/timber';

const { bumpMap, float, fract, mx_fractal_noise_float, positionWorld, smoothstep, vec3 } =
  TSL as unknown as Record<string, any>;

export type FacadeRole = 'siding' | 'trim' | 'glass' | 'roof' | 'painted-metal' | 'inset';

export interface FacadeMaterials {
  readonly siding: THREE.Material;
  readonly trim: THREE.Material;
  readonly glass: THREE.Material;
  readonly roof: THREE.Material;
  readonly paintedMetal: THREE.Material;
  readonly inset: THREE.Material;
}

/** Role materials are shared by every part of one facade. */
export function createFacadeMaterials(): FacadeMaterials {
  const siding = createSidingMaterial(0xe0b58d, 'facade-siding-role');
  // Integer periods are intentional: 1100/micro grain, 14/wear. The existing
  // siding graph supplies three albedo bands and wear-driven roughness; this
  // adds the missing TSL height response without a sampler.
  const grain = mx_fractal_noise_float(
    vec3(positionWorld.x.mul(float(1100)), positionWorld.y.mul(float(1100)), positionWorld.z.mul(float(1100))),
    2, 2, 0.5,
  ).sub(float(0.5));
  const paintWear = mx_fractal_noise_float(
    vec3(positionWorld.x.mul(float(14)), positionWorld.y.mul(float(14)), positionWorld.z.mul(float(14))),
    2, 2, 0.5,
  );
  const course = fract(positionWorld.y.div(float(0.22)));
  const courseEdge = smoothstep(float(0.12), float(0.0), course)
    .add(smoothstep(float(0.88), float(1.0), course));
  const heightField = courseEdge.mul(float(0.004))
    .add(grain.mul(float(0.0012)))
    .add(paintWear.mul(float(0.0025)));
  const sidingNode = siding as THREE.Material & { normalNode?: unknown; userData: Record<string, unknown> };
  sidingNode.normalNode = bumpMap(heightField, float(0.35));
  sidingNode.userData.facadeHeightField = {
    courseEdgeMillimetres: 4,
    woodGrainMillimetres: 1.2,
    paintWearMillimetres: 2.5,
    integerNoisePeriods: [1100, 14],
  };

  const inset = new MeshStandardNodeMaterial({ color: 0x11171b, roughness: 0.94, metalness: 0.02 });
  inset.name = 'facade-dark-inset-role';
  inset.type = 'MeshStandardMaterial';

  return Object.freeze({
    siding,
    trim: createTimberMaterial('facade-trim-role', 0xf0e2c6, 'painted-trim'),
    glass: createGlassMaterial('facade-glass-role', 0x648a92, { opacity: 0.48 }),
    roof: createRoofMaterial('facade-roof-role'),
    paintedMetal: createPaintedMetalMaterial('facade-painted-metal-role', 0x657277, { roughness: 0.38 }),
    inset,
  });
}

function addBox(
  root: THREE.Group,
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: THREE.Material,
  role: FacadeRole,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.facadeRole = role;
  mesh.userData.presentationOnly = true;
  root.add(mesh);
  return mesh;
}

function addMesh(root: THREE.Group, name: string, mesh: THREE.Mesh, role: FacadeRole): THREE.Mesh {
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.facadeRole = role;
  mesh.userData.presentationOnly = true;
  root.add(mesh);
  return mesh;
}

/** Lap courses with a real recessed dark line between every course. */
export function lapSiding(
  width: number,
  height: number,
  courseHeight = 0.22,
  materials = createFacadeMaterials(),
): THREE.Group {
  if (!(width > 0 && height > 0 && courseHeight > 0)) throw new Error('lapSiding dimensions must be positive');
  const root = new THREE.Group();
  root.name = 'facade-lap-siding';
  root.userData.facadeRole = 'siding';
  root.userData.courseHeight = courseHeight;
  const courses = Math.ceil(height / courseHeight);
  const gap = Math.min(0.012, courseHeight * 0.08);
  const boardHeight = courseHeight - gap;
  for (let index = 0; index < courses; index += 1) {
    const remaining = height - index * courseHeight;
    const actualHeight = Math.min(boardHeight, remaining);
    if (actualHeight <= 0) continue;
    addBox(root, `siding-course-${index}`, [width, actualHeight, 0.16], [0, index * courseHeight + actualHeight / 2, 0], materials.siding, 'siding');
    if (index < courses - 1 && index * courseHeight + courseHeight < height + 0.001) {
      addBox(root, `siding-shadow-gap-${index}`, [width + 0.012, gap, 0.018], [0, (index + 1) * courseHeight - gap / 2, -0.074], materials.inset, 'inset');
    }
  }
  return root;
}

/** A recessed domestic window, with a 150 mm dark interior bed. */
export function windowUnit(w: number, h: number, materials = createFacadeMaterials()): THREE.Group {
  if (!(w > 0 && h > 0)) throw new Error('windowUnit dimensions must be positive');
  const root = new THREE.Group();
  root.name = 'facade-window-unit';
  const frame = 0.06;
  const innerW = Math.max(0.12, w - frame * 2);
  const innerH = Math.max(0.12, h - frame * 2);
  addBox(root, 'window-frame-left', [frame, h, 0.18], [-w / 2 + frame / 2, h / 2, 0.05], materials.trim, 'trim');
  addBox(root, 'window-frame-right', [frame, h, 0.18], [w / 2 - frame / 2, h / 2, 0.05], materials.trim, 'trim');
  addBox(root, 'window-frame-head', [w, frame, 0.18], [0, h - frame / 2, 0.05], materials.trim, 'trim');
  addBox(root, 'window-frame-sill', [w, frame, 0.24], [0, frame / 2, 0.08], materials.trim, 'trim');
  addBox(root, 'window-glass', [innerW, innerH, 0.035], [0, h / 2, 0.14], materials.glass, 'glass');
  addBox(root, 'window-interior-depth', [innerW * 0.92, innerH * 0.92, 0.012], [0, h / 2, -0.01], materials.inset, 'inset').position.z = -0.01;
  addBox(root, 'window-mullion-left', [0.045, innerH, 0.08], [-w / 4, h / 2, 0.17], materials.trim, 'trim');
  addBox(root, 'window-mullion-right', [0.045, innerH, 0.08], [w / 4, h / 2, 0.17], materials.trim, 'trim');
  addBox(root, 'window-meeting-rail', [innerW, 0.05, 0.08], [0, h * 0.52, 0.17], materials.trim, 'trim');
  addBox(root, 'window-sill-drip', [w + 0.12, 0.035, 0.28], [0, -0.015, 0.12], materials.trim, 'trim');
  return root;
}

/** Panelled entry door with a visible handle and threshold step. */
export function doorUnit(w: number, h: number, materials = createFacadeMaterials()): THREE.Group {
  if (!(w > 0 && h > 0)) throw new Error('doorUnit dimensions must be positive');
  const root = new THREE.Group();
  root.name = 'facade-door-unit';
  const frame = 0.08;
  addBox(root, 'door-leaf', [w - frame * 2, h - frame, 0.10], [0, h / 2, 0.08], materials.paintedMetal, 'painted-metal');
  addBox(root, 'door-frame-left', [frame, h, 0.18], [-w / 2 + frame / 2, h / 2, 0.07], materials.trim, 'trim');
  addBox(root, 'door-frame-right', [frame, h, 0.18], [w / 2 - frame / 2, h / 2, 0.07], materials.trim, 'trim');
  addBox(root, 'door-frame-head', [w, frame, 0.18], [0, h - frame / 2, 0.07], materials.trim, 'trim');
  for (let index = 0; index < 3; index += 1) {
    const panelH = Math.min(0.55, (h - 0.42) / 3);
    addBox(root, `door-panel-${index}`, [w - 0.34, panelH, 0.018], [0, 0.22 + index * (panelH + 0.09) + panelH / 2, 0.14], materials.trim, 'trim');
  }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), materials.paintedMetal);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(w / 2 - 0.22, h * 0.52, 0.17);
  addMesh(root, 'door-handle', handle, 'painted-metal');
  addBox(root, 'door-threshold', [w + 0.12, 0.08, 0.30], [0, -0.04, 0.09], materials.trim, 'trim');
  return root;
}

/** A half-round gutter with 900 mm bracket spacing. */
export function gutterRun(length: number, materials = createFacadeMaterials()): THREE.Group {
  if (!(length > 0)) throw new Error('gutterRun length must be positive');
  const root = new THREE.Group();
  root.name = 'facade-gutter-run';
  const gutter = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, length, 16, 1, false, 0, Math.PI), materials.paintedMetal);
  gutter.rotation.z = Math.PI / 2;
  addMesh(root, 'gutter-half-round', gutter, 'painted-metal');
  const brackets = Math.max(2, Math.floor(length / 0.9) + 1);
  for (let index = 0; index < brackets; index += 1) {
    const x = -length / 2 + (length * index) / Math.max(1, brackets - 1);
    addBox(root, `gutter-bracket-${index}`, [0.05, 0.20, 0.08], [x, -0.06, 0], materials.paintedMetal, 'painted-metal');
  }
  return root;
}

/** Vertical downpipe with a low shoe turned toward the wall. */
export function downpipe(height: number, materials = createFacadeMaterials()): THREE.Group {
  if (!(height > 0)) throw new Error('downpipe height must be positive');
  const root = new THREE.Group();
  root.name = 'facade-downpipe';
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, height, 12), materials.paintedMetal);
  addMesh(root, 'downpipe-shaft', pipe, 'painted-metal');
  const shoe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.28, 12), materials.paintedMetal);
  shoe.rotation.z = Math.PI / 2;
  shoe.position.set(0.12, -height / 2 + 0.14, 0.05);
  addMesh(root, 'downpipe-shoe', shoe, 'painted-metal');
  return root;
}

/** Two pitched slopes of 300 mm shingle courses and a ridge cap. */
export function shingleRoofSlab(w: number, d: number, pitch: number, materials = createFacadeMaterials()): THREE.Group {
  if (!(w > 0 && d > 0 && pitch > 0 && pitch < Math.PI / 2)) throw new Error('shingleRoofSlab dimensions are invalid');
  const root = new THREE.Group();
  root.name = 'facade-shingle-roof-slab';
  const course = 0.30;
  const count = Math.ceil((d / 2) / course);
  for (const side of [-1, 1] as const) {
    const slope = new THREE.Group();
    slope.rotation.x = side * pitch;
    slope.position.z = 0;
    for (let index = 0; index < count; index += 1) {
      const run = Math.min(course, d / 2 - index * course);
      if (run <= 0) continue;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.075, run), materials.roof);
      strip.position.z = side * (index * course + run / 2);
      strip.name = `roof-shingle-${side > 0 ? 'front' : 'back'}-${index}`;
      strip.castShadow = true;
      strip.receiveShadow = true;
      strip.userData.facadeRole = 'roof';
      strip.userData.presentationOnly = true;
      slope.add(strip);
    }
    root.add(slope);
  }
  addBox(root, 'roof-ridge-cap', [w + 0.18, 0.16, 0.28], [0, 0.045, 0], materials.trim, 'trim');
  root.userData.courseHeight = course;
  root.userData.pitch = pitch;
  return root;
}

export interface HouseFacadeOptions {
  readonly width?: number;
  readonly height?: number;
  readonly materials?: FacadeMaterials;
}

/** Full proof asset: two storeys, six windows, one door, gutter, pipe and roof. */
export function buildNorthHouseFacade(options: HouseFacadeOptions = {}): THREE.Group {
  const width = options.width ?? 11;
  const height = options.height ?? 6.2;
  const materials = options.materials ?? createFacadeMaterials();
  const root = new THREE.Group();
  root.name = 'facade-north-house-front';
  root.userData.colliderParity = 'presentation-only; arena colliders unchanged';
  root.userData.materialRoles = ['siding', 'trim', 'glass', 'roof', 'painted-metal', 'inset'];
  root.add(lapSiding(width, height, 0.22, materials));

  const groundWindows = [-3.95, -1.55, 2.95];
  for (const [index, x] of groundWindows.entries()) {
    const unit = windowUnit(1.85, 2.15, materials);
    unit.position.set(x, 0.62, 0.16);
    unit.name = `facade-ground-window-${index}`;
    root.add(unit);
  }
  const upperWindows = [-3.75, 0, 3.75];
  for (const [index, x] of upperWindows.entries()) {
    const unit = windowUnit(2.20, 2.35, materials);
    unit.position.set(x, 3.62, 0.16);
    unit.name = `facade-upper-window-${index}`;
    root.add(unit);
  }
  const door = doorUnit(1.20, 2.55, materials);
  door.position.set(0.05, 0, 0.18);
  root.add(door);

  const gutter = gutterRun(width + 0.35, materials);
  gutter.position.set(0, height + 0.08, 0.24);
  root.add(gutter);
  const pipe = downpipe(height - 0.30, materials);
  pipe.position.set(width / 2 - 0.22, (height - 0.30) / 2, 0.22);
  root.add(pipe);
  const roof = shingleRoofSlab(width + 0.45, 4.8, 0.34, materials);
  roof.position.set(0, height + 0.18, 0.02);
  root.add(roof);
  return root;
}

export function facadeTriangleCount(root: THREE.Object3D): number {
  let triangles = 0;
  root.traverse((object) => {
    const geometry = (object as THREE.Mesh).geometry;
    if (!geometry) return;
    triangles += geometry.index ? geometry.index.count / 3 : (geometry.getAttribute('position')?.count ?? 0) / 3;
  });
  return triangles;
}

// ---------------------------------------------------------------------------
// PARTS API - HF-536 night-facade-port
// ---------------------------------------------------------------------------
/**
 * THE ARENA CANNOT EAT A GROUP. The factories above return `THREE.Group`s that
 * own their own materials, which is exactly what a standalone proof page wants
 * and exactly what an arena must never be handed: a Group bypasses `pair()`
 * (so the south house stops being the north house's exact partner), and
 * `createFacadeMaterials()` mints six materials the Nuke Town registry already
 * has under other names.
 *
 * So the same recipe - the same course pitch, the same board thickness, the
 * same reveal depth, the same shingle lap - is published a second time as
 * PARTS: offsets, sizes and a material ROLE, in the forge-kit convention
 * (`ForgeKitBox`). The arena emits them through its own `pair()`/`centred()`
 * helpers, resolves every role onto its own registry, and stamps
 * presentation-only on all of them. Nothing here constructs a material, a
 * collider or a mesh.
 *
 * The constants below are the single source of truth for BOTH APIs.
 */

/** Which way the elevation faces, in the caller's AUTHORED frame. */
export type FacadeFacing = 'z+' | 'z-' | 'x+' | 'x-';

/** Course pitch of the lap siding, metres (220 mm exposure - the module default). */
export const FACADE_COURSE_H = 0.22;
/** Board face height, metres. The 20 mm left over is the shadow gap. */
export const FACADE_BOARD_H = 0.20;
/** Board thickness, metres. */
export const FACADE_BOARD_T = 0.06;
/** How far a board beds INTO the wall it dresses, metres (no coplanar faces). */
export const FACADE_BOARD_BED = 0.01;
/** Maximum a facade part may stand proud of its wall body, metres (parity rule). */
export const FACADE_MAX_PROUD = 0.05;
/** Reveal-strip thickness, metres. */
export const FACADE_REVEAL_T = 0.05;
/** How far the reveal strip's face sits BEHIND the board face, metres. */
export const FACADE_REVEAL_SETBACK = 0.03;
/** Shingle course depth on a roof slab, metres (300 mm exposure). */
export const FACADE_SHINGLE_COURSE = 0.30;

/** Material roles a facade part may ask its host arena for. */
export type FacadePartRole =
  | 'siding' | 'sidingUpper' | 'garageSiding'
  | 'trim' | 'reveal' | 'roof' | 'roofPair' | 'interior' | 'panel';

/** One box, in the forge-kit convention. Structurally a `ForgeKitBox`. */
export interface FacadePart {
  readonly suffix: string;
  readonly offset: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly role: FacadePartRole;
}

/**
 * Resolve an ALONG/UP/OUT triple into the authored frame for one facing.
 *
 * `along` runs left-to-right across the elevation, `up` is +y, `out` is the
 * outward normal. Authoring every part once in elevation space and rotating
 * here is what stops the four elevations from drifting apart by hand.
 */
function place(
  facing: FacadeFacing,
  along: number, up: number, out: number,
  runSize: number, upSize: number, outSize: number,
): { offset: readonly [number, number, number]; size: readonly [number, number, number] } {
  switch (facing) {
    case 'z+': return { offset: [along, up, out], size: [runSize, upSize, outSize] };
    case 'z-': return { offset: [along, up, -out], size: [runSize, upSize, outSize] };
    case 'x+': return { offset: [out, up, along], size: [outSize, upSize, runSize] };
    case 'x-': default: return { offset: [-out, up, along], size: [outSize, upSize, runSize] };
  }
}

export interface LapSidingPartsOptions {
  /** Length of the wall run this elevation covers, metres. */
  readonly run: number;
  /** Height of the storey band the courses fill, metres. */
  readonly height: number;
  readonly facing: FacadeFacing;
  readonly role?: FacadePartRole;
  readonly courseHeight?: number;
  /** Course index the run starts on, so neighbouring runs line up. */
  readonly courseOffset?: number;
}

/**
 * Lap siding as parts: one board per course, one recessed reveal strip per
 * joint.
 *
 * WHY A SEPARATE REVEAL BOX AND NOT A SHADOW. Every part here is authored
 * `cast:false` on purpose: nine hundred 60 mm boards standing 50 mm off a wall
 * that also casts is the classic shadow-acne generator, and the owner's live
 * complaint tonight is z-fighting. The reveal strip is a dark box set 30 mm
 * BEHIND the board faces and overlapping the boards above and below it by
 * 20 mm, so there is no coplanar pair anywhere in the construction and the
 * dark line is geometric rather than lit - it reads identically at every hour
 * of the authored day and in both render profiles.
 */
export function lapSidingParts(options: LapSidingPartsOptions): FacadePart[] {
  const { run, height, facing } = options;
  if (!(run > 0 && height > 0)) throw new Error('lapSidingParts run and height must be positive');
  const pitch = options.courseHeight ?? FACADE_COURSE_H;
  const role = options.role ?? 'siding';
  const base = options.courseOffset ?? 0;
  const boardOut = FACADE_BOARD_T / 2 - FACADE_BOARD_BED;
  const revealOut = FACADE_REVEAL_T / 2 - (FACADE_BOARD_T - FACADE_BOARD_BED - FACADE_REVEAL_SETBACK);
  const parts: FacadePart[] = [];
  const courses = Math.max(1, Math.ceil(height / pitch));
  for (let index = 0; index < courses; index += 1) {
    const y0 = index * pitch;
    const boardH = Math.min(FACADE_BOARD_H, height - y0);
    if (boardH <= 0.02) continue;
    parts.push({
      suffix: `board ${base + index}`,
      role,
      ...place(facing, 0, y0 + boardH / 2, boardOut, run, boardH, FACADE_BOARD_T),
    });
    const jointY = y0 + FACADE_BOARD_H;
    if (jointY + 0.01 >= height) continue;
    parts.push({
      suffix: `reveal ${base + index}`,
      role: 'reveal',
      ...place(facing, 0, jointY + (pitch - FACADE_BOARD_H) / 2, revealOut,
        run - 0.004, (pitch - FACADE_BOARD_H) + 0.04, FACADE_REVEAL_T),
    });
  }
  return parts;
}

export interface WindowRevealPartsOptions {
  /** Clear width of the opening, metres. */
  readonly width: number;
  /** Clear height of the opening, metres. */
  readonly height: number;
  readonly facing: FacadeFacing;
  /** Thickness of the wall the opening is cut through, metres. */
  readonly wallThickness: number;
  /** Liner width, metres. */
  readonly liner?: number;
}

/**
 * THE DARK ROOM INSET, done as a REVEAL LINER rather than a backing plane.
 *
 * The module's proof asset puts an opaque dark plate behind the glass because
 * it has no room behind it. Nuke Town's houses DO have rooms - floor, ceiling,
 * partitions and a stair - and the front windows are the map's power
 * positions, so an opaque plate would both hide the interior the arena already
 * builds and make a shoot-through opening read as a wall. What is actually
 * missing is the DEPTH: the opening is cut through 300 mm of wall and the
 * inside of that cut was never surfaced, so the eye gets a paper-thin hole.
 *
 * These four liners surface it, set fully INSIDE the wall body (never proud),
 * which is also why they cannot open a see-through gap: every box here is
 * contained by the wall it lines.
 */
export function windowRevealParts(options: WindowRevealPartsOptions): FacadePart[] {
  const { width, height, facing, wallThickness } = options;
  if (!(width > 0 && height > 0 && wallThickness > 0)) {
    throw new Error('windowRevealParts dimensions must be positive');
  }
  const liner = options.liner ?? 0.05;
  const depth = Math.max(0.06, wallThickness - 0.06);
  const out = 0;
  return [
    { suffix: 'reveal head', role: 'reveal', ...place(facing, 0, height / 2 - liner / 2, out, width, liner, depth) },
    { suffix: 'reveal sill', role: 'reveal', ...place(facing, 0, -height / 2 + liner / 2, out, width, liner, depth) },
    { suffix: 'reveal jamb 0', role: 'reveal', ...place(facing, -width / 2 + liner / 2, 0, out, liner, height - liner * 2, depth) },
    { suffix: 'reveal jamb 1', role: 'reveal', ...place(facing, width / 2 - liner / 2, 0, out, liner, height - liner * 2, depth) },
  ];
}

export interface PanelDoorPartsOptions {
  /** Leaf width, metres. */
  readonly width: number;
  /** Leaf height, metres. */
  readonly height: number;
  readonly facing: FacadeFacing;
  /** How many raised panels the leaf carries. */
  readonly panels?: number;
  readonly role?: FacadePartRole;
  /** Thickness of the leaf, metres. */
  readonly thickness?: number;
}

/**
 * A PANELLED LEAF, anchored at the leaf's bottom centre on its face plane.
 *
 * The house doorways are ROUTES - a player walks through both of them every
 * round - so the leaf this returns is meant to be parked OPEN against the wall
 * beside its opening, not hung in it. The panels are the point: three raised
 * rails and stiles are what separates a door from a painted rectangle at 8 m,
 * and they cost 12 triangles each.
 */
export function panelDoorParts(options: PanelDoorPartsOptions): FacadePart[] {
  const { width, height, facing } = options;
  if (!(width > 0 && height > 0)) throw new Error('panelDoorParts dimensions must be positive');
  const panels = options.panels ?? 3;
  const role = options.role ?? 'panel';
  const t = options.thickness ?? 0.05;
  const stile = 0.14;
  const parts: FacadePart[] = [
    { suffix: 'leaf', role, ...place(facing, 0, height / 2, t / 2, width, height, t) },
  ];
  const clearH = height - stile * 2;
  const panelH = (clearH - stile * (panels - 1)) / panels;
  for (let index = 0; index < panels; index += 1) {
    const y = stile + index * (panelH + stile) + panelH / 2;
    parts.push({
      suffix: `panel ${index}`,
      role: 'reveal',
      ...place(facing, 0, y, t + 0.005, width - stile * 2, panelH, 0.010),
    });
  }
  parts.push({ suffix: 'rail top', role, ...place(facing, 0, height - stile / 2, t + 0.006, width, stile, 0.014) });
  parts.push({ suffix: 'rail bottom', role, ...place(facing, 0, stile / 2, t + 0.006, width, stile, 0.014) });
  return parts;
}

export interface ShingleRoofPartsOptions {
  /** Width of the slab across the courses, metres. */
  readonly width: number;
  /** Depth of the slab along the courses, metres. */
  readonly depth: number;
  /** Top face of the slab relative to the anchor, metres. */
  readonly slabTop?: number;
  /** Eaves overhang beyond the slab on all four sides, metres. */
  readonly overhang?: number;
  readonly courseDepth?: number;
  readonly role?: FacadePartRole;
}

/**
 * SHINGLE COURSES AND AN EAVES OVERHANG on a flat roof slab.
 *
 * Anchored at the slab's CENTRE. The courses are 300 mm strips laid across the
 * depth with a 20 mm gap between them and 5 mm proud of the deck, so the deck
 * itself is the dark line between courses - the same construction as the wall
 * reveal, and again with no coplanar face. The overhang is the other half: a
 * roof that stops exactly on the wall line is the strongest single tell that a
 * building was extruded rather than built, and 250 mm of eave with a fascia
 * band under it is what the reference boards show at `overhead` and from the
 * street.
 */
export function shingleRoofParts(options: ShingleRoofPartsOptions): FacadePart[] {
  const { width, depth } = options;
  if (!(width > 0 && depth > 0)) throw new Error('shingleRoofParts dimensions must be positive');
  const course = options.courseDepth ?? FACADE_SHINGLE_COURSE;
  const overhang = options.overhang ?? 0.25;
  const slabTop = options.slabTop ?? 0;
  const role = options.role ?? 'roofPair';
  const parts: FacadePart[] = [];
  const courses = Math.max(1, Math.floor(depth / course));
  const strip = course - 0.02;
  const start = -depth / 2;
  for (let index = 0; index < courses; index += 1) {
    const z = start + index * course + strip / 2;
    parts.push({
      suffix: `shingle ${index}`,
      role,
      offset: [0, slabTop + 0.005, z],
      size: [width, 0.05, strip],
    });
  }
  // THE COURSES STOP ON THE SLAB LINE, DELIBERATELY. These strips merge into
  // one static presentation batch, and `scripts/qa/audit-walkable-surface-
  // parity.ts` censuses a batch by its AABB: any course hanging past the deck
  // is an unsupported top face over thin air, and its floors are tight
  // (2% share, 0.5 m2 hole). A 250 mm shingle overhang trips both. The eave is
  // carried by the boxed band below instead, which is where a real eave's
  // silhouette and its shadow line both come from anyway.
  //
  // The band is a BOXED EAVE - soffit and fascia in one - tucked 20 mm under
  // the deck's top face so the deck edge laps over it and there is no slot to
  // see through from above.
  const band = 0.16;
  const bandY = slabTop - 0.02 - band / 2;
  const reach = overhang + 0.06;
  parts.push({
    suffix: 'eaves front', role: 'trim',
    offset: [0, bandY, depth / 2 + overhang / 2 - 0.02], size: [width + overhang * 2, band, reach],
  });
  parts.push({
    suffix: 'eaves back', role: 'trim',
    offset: [0, bandY, -(depth / 2 + overhang / 2 - 0.02)], size: [width + overhang * 2, band, reach],
  });
  parts.push({
    suffix: 'eaves left', role: 'trim',
    offset: [-(width / 2 + overhang / 2 - 0.02), bandY, 0], size: [reach, band, depth],
  });
  parts.push({
    suffix: 'eaves right', role: 'trim',
    offset: [width / 2 + overhang / 2 - 0.02, bandY, 0], size: [reach, band, depth],
  });
  return parts;
}

/** Triangles a parts list adds once emitted as boxes (12 per box). */
export function facadePartsTriangles(parts: readonly FacadePart[]): number {
  return parts.length * 12;
}
