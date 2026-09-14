/**
 * world-studio/vehicles - street-props vehicle set (native OMP authorship).
 *
 * PRESENTATION ONLY: returns a THREE.Group plus authoritative blocking solids.
 * No builders/registry/listeners/renderer use; no document/window; fully
 * deterministic (fixed-seed grain textures, no Math.random).
 *
 * BUILD_BRIEF placement (in playable bounds X[-40,40] Z[-34,34]):
 *  - school bus: 1950s rounded yellow, centre (X=-3.5, Z=2), length 10 along Z,
 *    width 3, height ~3.2. Arched roof, dark framed rectangular glazing, black
 *    rubber rub rails, twin circular roof lights, tall panelled rear door,
 *    chrome bumpers, chunky tyres.
 *  - red long-nose diesel truck + white ribbed trailer: centre (X=3.5, Z=-2),
 *    length 14 along Z. Chrome vertical-bar grille + inner mesh, inset
 *    headlamps, split sloped windshield, mirrors/stalks, amber roof lamps,
 *    rounded red fenders, black wheels. TrailER rear doors are OPEN: the
 *    walk-through aperture (~2.2m) carries NO solid, so the interior is an
 *    accessible two-way route and no full-box covers the opening.
 *  - teal compact sedan at (X=-21, Z=21), length 4.2.
 *  - optional distant grey car at (X=8, Z=-27), flavour only.
 *
 * GAPS: bus body X[-5,-2]; cab and trailer X[2,5] -> 4 m of open asphalt
 * between them (>= 2 m mandate asserted in the lane test).
 *
 * BUDGET: far below 100k triangles; shared materials keep renderable material
 * groups far below 80. Same-material parts are merged per vehicle with
 * BufferGeometryUtils (repo convention: three/addons/utils).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wheelParts, lampParts, type WheelStyle } from '../../vehicle-forge/wheels';
import type { Box2 } from '../../collision';
import type { BallisticMaterialId } from '../../ballistics';

// ---------------------------------------------------------------------------
// Materials - MeshStandardMaterial only (headless-safe, WebGL + WebGPU both
// render it), with deterministic CPU DataTexture grain.
// ---------------------------------------------------------------------------

/** Deterministic mulberry32 so the grain is byte-identical every run. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 64x64 RGB normal-ish grain + roughness grain mapped to RG so one texture
 * serves normalMap (RGB) and roughnessMap (G). */
function makeGrainTexture(seed: number, scale: number): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const rng = makeRng(seed);
  for (let i = 0; i < data.length; i += 4) {
    const nx = (rng() * 2 - 1) * scale;
    const ny = (rng() * 2 - 1) * scale;
    const rough = 0.5 + rng() * 0.5;
    data[i] = Math.round(128 + nx * 127);
    data[i + 1] = Math.round(128 + ny * 127);
    data[i + 2] = Math.round(128 + rough * 127);
    data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function paintMaterial(
  hex: number,
  name: string,
  grain: THREE.Texture,
  roughness = 0.45,
): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    name,
    color: new THREE.Color(hex),
    roughness,
    metalness: 0.15,
    normalMap: grain,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
  return m;
}

interface StudioMaterials {
  readonly busYellow: THREE.Material;
  readonly truckRed: THREE.Material;
  readonly trailerWhite: THREE.Material;
  readonly compactTeal: THREE.Material;
  readonly distantGrey: THREE.Material;
  readonly chrome: THREE.Material;
  readonly glass: THREE.Material;
  readonly tyre: THREE.Material;
  readonly darkTrim: THREE.Material;
  readonly headLamp: THREE.Material;
  readonly tailLamp: THREE.Material;
  readonly amberLamp: THREE.Material;
  readonly offwhite: THREE.Material;
}

function createMaterials(): StudioMaterials {
  const grainPaint = makeGrainTexture(1234, 0.35);
  const grainMetal = makeGrainTexture(77, 0.12);
  return {
    busYellow: paintMaterial(0xf3c218, 'ws-bus-yellow', grainPaint, 0.42),
    truckRed: paintMaterial(0xb22222, 'ws-truck-red', grainPaint, 0.48),
    trailerWhite: paintMaterial(0xf2efe6, 'ws-trailer-white', grainPaint, 0.6),
    compactTeal: paintMaterial(0x2f6b66, 'ws-compact-teal', grainPaint, 0.36),
    distantGrey: paintMaterial(0x6a6f75, 'ws-distant-grey', grainPaint, 0.55),
    chrome: new THREE.MeshStandardMaterial({
      name: 'ws-chrome',
      color: new THREE.Color(0xd6dce2),
      metalness: 1,
      roughness: 0.28,
      envMapIntensity: 1,
      normalMap: grainMetal,
      normalScale: new THREE.Vector2(0.35, 0.35),
    }),
    glass: new THREE.MeshStandardMaterial({
      name: 'ws-glass',
      color: new THREE.Color(0x1a2733),
      roughness: 0.12,
      metalness: 0.3,
    }),
    tyre: new THREE.MeshStandardMaterial({
      name: 'ws-tyre',
      color: new THREE.Color(0x17191c),
      roughness: 0.95,
      metalness: 0,
    }),
    darkTrim: new THREE.MeshStandardMaterial({
      name: 'ws-dark-trim',
      color: new THREE.Color(0x0e1013),
      roughness: 0.75,
      metalness: 0,
    }),
    headLamp: new THREE.MeshStandardMaterial({
      name: 'ws-head-lamp',
      color: new THREE.Color(0xf7f3e4),
      roughness: 0.1,
      metalness: 0,
    }),
    tailLamp: new THREE.MeshStandardMaterial({
      name: 'ws-tail-lamp',
      color: new THREE.Color(0xd3222e),
      roughness: 0.3,
      metalness: 0,
      emissive: new THREE.Color(0x7a0e16),
      emissiveIntensity: 0.6,
    }),
    amberLamp: new THREE.MeshStandardMaterial({
      name: 'ws-amber-lamp',
      color: new THREE.Color(0xe8a33d),
      roughness: 0.3,
      metalness: 0,
      emissive: new THREE.Color(0x9c620d),
      emissiveIntensity: 0.5,
    }),
    offwhite: new THREE.MeshStandardMaterial({
      name: 'ws-offwhite',
      color: new THREE.Color(0xe8e4d8),
      roughness: 0.8,
      metalness: 0,
    }),
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

interface SolidSpec {
  id: string;
  mesh: THREE.Mesh;
  bounds: Box2;
  material: BallisticMaterialId;
}

interface VehicleResult {
  parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }>;
  solids: SolidSpec[];
}

/** Box at world centre, in metres. */
function box(w: number, h: number, d: number, cx: number, cy: number, cz: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(cx, cy, cz);
  g.name = 'ws-box';
  return g;
}

/** Rounded-box body with a vertical extrusion profile. */
function roundedBox(w: number, h: number, d: number, r: number, cx: number, cy: number, cz: number): THREE.BufferGeometry {
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.quadraticCurveTo(hw + r, -hh, hw + r, -hh + r);
  shape.lineTo(hw + r, hh);
  shape.quadraticCurveTo(hw + r, hh + r, hw, hh + r);
  shape.lineTo(-hw, hh + r);
  shape.quadraticCurveTo(-hw - r, hh + r, -hw - r, hh);
  shape.lineTo(-hw - r, -hh + r);
  shape.quadraticCurveTo(-hw - r, -hh, -hw, -hh);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 6 });
  // ExtrudeGeometry: shape in XY, extruded along +Z. Rotate so depth goes +Y,
  // base at y=0: rotateX(+90deg) maps +Z -> +Y? rotateX(-PI/2): (x,y,z)->(x,z,-y).
  // Want depth along +Y and profile in XZ. Use rotateX(PI/2) then translate.
  g.rotateX(Math.PI / 2);
  // After rotateX(PI/2): shape XY->XZ, depth Z->Y. Base was at z=0 => y=0 now.
  g.translate(cx, cy, cz - d / 2);
  g.name = 'ws-rounded-box';
  return g;
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

const BUS_POS: [number, number] = [-3.5, 2];
const TRUCK_POS: [number, number] = [3.5, -2];
const COMPACT_POS: [number, number] = [-21, 21];
const DISTANT_POS: [number, number] = [8, -27];

// ---------------------------------------------------------------------------
// School bus - 1950s rounded yellow, arched roof, twin roof lights.
// Body length 10 along Z (z from -3 to 7), width 3, height ~3.2.
// ---------------------------------------------------------------------------

function buildBus(mats: StudioMaterials): VehicleResult {
  const parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> = [];
  const solids: SolidSpec[] = [];
  const [cx, cz] = BUS_POS;
  const halfL = 5;

  // Cross-section profile of the body (rounded/arched roof, tumblehome sides).
  // Extruded along +Z after rotateX(-90deg) so profile plane is XZ... Actually
  // build cross-section in XY (x = across bus, y = up), extrude in Z.
  const body = buildBusBody(cx, cz, halfL); // returns one geometry
  parts.push({ geometry: body, material: mats.busYellow });

  // Windows: dark framed rectangular glazing band both sides.
  const winTop = 2.35;
  const winBottom = 1.45;
  const winX = 1.5;
  const glazing: Array<[number, number]> = [];
  for (let i = 0; i < 5; i += 1) {
    const zc = cz - 3.4 + i * 1.62;
    glazing.push([zc, 1.28]);
  }
  for (const [zc, zw] of glazing) {
    const glass = box(0.06, winTop - winBottom, zw, cx - winX, (winTop + winBottom) / 2, zc);
    parts.push({ geometry: glass, material: mats.glass });
    const glassR = box(0.06, winTop - winBottom, zw, cx + winX, (winTop + winBottom) / 2, zc);
    parts.push({ geometry: glassR, material: mats.glass });
    // Frames (dark) around each pane.
    const frame = box(0.1, winTop - winBottom + 0.12, zw + 0.12, cx - winX, (winTop + winBottom) / 2, zc);
    parts.push({ geometry: frame, material: mats.darkTrim });
    const frameR = box(0.1, winTop - winBottom + 0.12, zw + 0.12, cx + winX, (winTop + winBottom) / 2, zc);
    parts.push({ geometry: frameR, material: mats.darkTrim });
  }
  // Windshield band front (rounded front).
  const winshield = box(2.7, 0.85, 0.08, cx, (winBottom + winTop) / 2, cz + halfL - 0.12);
  parts.push({ geometry: winshield, material: mats.glass });

  // Chord over windshield.
  parts.push({ geometry: box(2.9, 0.1, 0.1, cx, winTop + 0.06, cz + halfL - 0.14), material: mats.darkTrim });

  // Black rubber rub rails along the flanks.
  for (const side of [-1, 1] as const) {
    const rail = box(0.09, 0.13, 9.2, cx + side * 1.48, 1.02, cz);
    parts.push({ geometry: rail, material: mats.darkTrim });
    const railLow = box(0.08, 0.1, 9.2, cx + side * 1.46, 0.62, cz);
    parts.push({ geometry: railLow, material: mats.darkTrim });
  }

  // Twin circular warning lights on the roof.
  for (const side of [-1, 1] as const) {
    const lamp = lampParts(0.16, 0.1, 12, true);
    const bezel = lamp.bezel;
    bezel.rotateX(Math.PI / 2); // axis along +Z -> +Y (up)
    bezel.translate(cx + side * 0.5, 3.3, cz + 2.6);
    parts.push({ geometry: bezel, material: mats.chrome });
    const lens = lamp.lens;
    lens.rotateX(Math.PI / 2);
    lens.translate(cx + side * 0.5, 3.34, cz + 2.6);
    parts.push({ geometry: lens, material: mats.amberLamp });
  }

  // Tall panelled rear door at z = cz - halfL.
  const door = box(1.9, 2.5, 0.06, cx, 1.55, cz - halfL + 0.04);
  parts.push({ geometry: door, material: mats.darkTrim });
  const doorPanelL = pane(0.7, 2.0, cx - 0.48, 1.5, cz - halfL + 0.1, 0);
  doorPanelL.rotateY(Math.PI / 2); // face +Z (outward rear)
  parts.push({ geometry: doorPanelL, material: mats.busYellow });
  const doorPanelR = pane(0.7, 2.0, cx + 0.48, 1.5, cz - halfL + 0.1, 0);
  doorPanelR.rotateY(Math.PI / 2);
  parts.push({ geometry: doorPanelR, material: mats.busYellow });
  // Rear door window.
  const rearWin = pane(1.2, 0.5, cx, 2.35, cz - halfL + 0.12, 0);
  rearWin.rotateY(Math.PI / 2);
  parts.push({ geometry: rearWin, material: mats.glass });

  // Weathered chrome bumpers front and rear.
  const bumperFront = roundedBox(3.0, 0.28, 0.2, 0.08, cx, 0.52, cz - halfL + 0.06);
  parts.push({ geometry: bumperFront, material: mats.chrome });
  const bumperRear = roundedBox(3.0, 0.28, 0.2, 0.08, cx, 0.52, cz + halfL - 0.05);
  parts.push({ geometry: bumperRear, material: mats.chrome });

  // Wheels: 4 chunky, radius 0.55, hubcap cover style.
  const wheelStyle: WheelStyle = 'cover';
  const wheelRadius = 0.55;
  const wheelHalf = 0.26;
  const wheelZ: Array<[number, number]> = [
    [-1.08, cz - 3.6],
    [1.08, cz - 3.6],
    [-1.08, cz + 3.4],
    [1.08, cz + 3.4],
  ];
  for (const [wx, wz] of wheelZ) {
    const w = wheelParts(wheelRadius, wheelHalf, wheelStyle, true);
    w.tyre.translate(cx + wx, wheelRadius, wz);
    parts.push({ geometry: w.tyre, material: mats.tyre });
    w.face.translate(cx + wx, wheelRadius, wz);
    parts.push({ geometry: w.face, material: mats.chrome });
    if (w.dark) {
      w.dark.translate(cx + wx, wheelRadius, wz);
      parts.push({ geometry: w.dark, material: mats.darkTrim });
    }
  }

  // Solid: whole bus as one blocking box (material 'vehicle').
  solids.push(solidFromParts('ws-bus', parts, 'vehicle', mats.busYellow));

  return { parts, solids };
}

function buildBusBody(cx: number, cz: number, halfL: number): THREE.BufferGeometry {
  const w = 3.0;
  const h = 3.2;
  const hw = w / 2;
  // Profile: floor deck -> vertical sides up to belt -> tumblehome -> arch roof.
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0.45);
  shape.lineTo(-hw, 1.0);
  // Tumblehome: top of side moves in slightly.
  shape.lineTo(-hw + 0.08, 2.0);
  // Roof arch (1950s rounded): quarter arcs meeting at a crown.
  shape.quadraticCurveTo(-hw + 0.5, h, 0, h);
  shape.quadraticCurveTo(hw - 0.5, h, hw - 0.08, 2.0);
  shape.lineTo(hw, 1.0);
  shape.lineTo(hw, 0.45);
  shape.lineTo(hw - 0.12, 0);
  shape.lineTo(-hw + 0.12, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: halfL * 2,
    bevelEnabled: false,
    curveSegments: 10,
  });
  // Extrude: shape XY, depth +Z. We want profile in XZ (x across, y up) and
  // depth along the bus length = Z. Shape plane already X (across) / Y (up),
  // depth +Z IS the bus length direction. Just translate to centre.
  geo.translate(0, 0, cz - halfL);
  geo.computeVertexNormals();
  // ExtrudeGeometry produces quads in caps? It creates triangles. Fine.
  geo.name = 'ws-bus-body';
  return geo;
}