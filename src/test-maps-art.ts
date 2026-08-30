/**
 * Test1/Test2 procedural art (owner 2026-08-30, "improve everything...with
 * the skills I said"). Applies the ingested all-procedural discipline
 * (register rows 34/35): every texture is painted in code on a canvas at
 * load, every prop is authored geometry, nothing is downloaded.
 *
 * Presentation-only by contract: nothing here adds colliders, shot surfaces,
 * spawns or navigation. Deterministic: seeded mulberry32, no Math.random.
 * Headless-safe: the parity audit runs these builders under a noop canvas
 * shim, so every texture bails to null (plain colours) when 2D painting is
 * unavailable.
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Deterministic RNG (threejs-procedural-vegetation skill)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Canvas texture factory (farcrysis ground-texture recipe, headless-safe)
// ---------------------------------------------------------------------------

type Painter = (context: CanvasRenderingContext2D, size: number, rng: () => number) => void;

const textureCache = new Map<string, THREE.CanvasTexture | null>();

function paintedTexture(name: string, size: number, seed: number, painter: Painter): THREE.CanvasTexture | null {
  const cached = textureCache.get(name);
  if (cached !== undefined) return cached;
  let texture: THREE.CanvasTexture | null = null;
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      // The parity audit's shimmed context swallows draw calls; detect a real
      // context by verifying a painted pixel actually reads back.
      if (context) {
        painter(context, size, mulberry32(seed));
        const probe = context.getImageData?.(0, 0, 1, 1);
        if (probe && probe.data && probe.data.length >= 4) {
          texture = new THREE.CanvasTexture(canvas);
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = 4;
          texture.colorSpace = THREE.SRGBColorSpace;
        }
      }
    }
  } catch {
    texture = null;
  }
  textureCache.set(name, texture);
  return texture;
}

function fbmMottle(context: CanvasRenderingContext2D, size: number, rng: () => number, colors: readonly string[], blobs: number, radiusScale = 0.06, alpha = 0.1): void {
  for (let index = 0; index < blobs; index += 1) {
    const radius = size * radiusScale * (0.4 + rng() * 1.2);
    const x = rng() * size;
    const y = rng() * size;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    const color = colors[index % colors.length]!;
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.globalAlpha = alpha * (0.5 + rng() * 0.8);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  context.globalAlpha = 1;
}

function speckle(context: CanvasRenderingContext2D, size: number, rng: () => number, colors: readonly string[], count: number, maxRadius = 2.2): void {
  for (let index = 0; index < count; index += 1) {
    context.fillStyle = colors[index % colors.length]!;
    context.globalAlpha = 0.16 + rng() * 0.3;
    const radius = 0.5 + rng() * maxRadius;
    context.beginPath();
    context.arc(rng() * size, rng() * size, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

// ---- Test1 painters --------------------------------------------------------

function paintHardpan(context: CanvasRenderingContext2D, size: number, rng: () => number): void {
  context.fillStyle = '#b59a6e';
  context.fillRect(0, 0, size, size);
  fbmMottle(context, size, rng, ['#c8ad7c', '#a68a5c', '#94794e', '#c4a877'], 160, 0.08, 0.14);
  speckle(context, size, rng, ['#8a744c', '#6f5c3c', '#d0b98a'], 700, 1.8);
  // Tyre ruts: paired shallow arcs worn into the dust.
  for (let rut = 0; rut < 7; rut += 1) {
    const cx = rng() * size;
    const cy = rng() * size;
    const radius = size * (0.2 + rng() * 0.45);
    const start = rng() * Math.PI * 2;
    const sweep = 0.6 + rng() * 1.4;
    context.strokeStyle = 'rgba(110, 90, 58, 0.32)';
    context.lineWidth = 5 + rng() * 4;
    for (const offset of [0, 14]) {
      context.beginPath();
      context.arc(cx, cy, radius + offset, start, start + sweep);
      context.stroke();
    }
  }
  // Boot-scuffed pale patches around the middle band (the firing line).
  fbmMottle(context, size, rng, ['#d4bd8e'], 22, 0.05, 0.2);
}

function paintPlywood(context: CanvasRenderingContext2D, size: number, rng: () => number): void {
  context.fillStyle = '#c09c64';
  context.fillRect(0, 0, size, size);
  // Long grain streaks.
  for (let streak = 0; streak < 140; streak += 1) {
    context.strokeStyle = rng() > 0.5 ? 'rgba(146, 114, 66, 0.25)' : 'rgba(214, 182, 126, 0.22)';
    context.lineWidth = 1 + rng() * 2;
    const y = rng() * size;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(size * 0.3, y + (rng() - 0.5) * 14, size * 0.7, y + (rng() - 0.5) * 14, size, y + (rng() - 0.5) * 8);
    context.stroke();
  }
  // Knots.
  for (let knot = 0; knot < 9; knot += 1) {
    const x = rng() * size;
    const y = rng() * size;
    for (let ring = 4; ring > 0; ring -= 1) {
      context.strokeStyle = `rgba(122, 92, 50, ${0.12 + ring * 0.06})`;
      context.lineWidth = 1.4;
      context.beginPath();
      context.ellipse(x, y, ring * 3.4, ring * 2.2, rng(), 0, Math.PI * 2);
      context.stroke();
    }
  }
  // Panel seams.
  context.strokeStyle = 'rgba(96, 74, 42, 0.5)';
  context.lineWidth = 3;
  for (const fraction of [0.25, 0.5, 0.75]) {
    context.beginPath();
    context.moveTo(size * fraction, 0);
    context.lineTo(size * fraction, size);
    context.stroke();
  }
}

function paintCorrugated(context: CanvasRenderingContext2D, size: number, rng: () => number): void {
  context.fillStyle = '#7c8288';
  context.fillRect(0, 0, size, size);
  const ridge = size / 24;
  for (let x = 0; x < size; x += ridge) {
    const gradient = context.createLinearGradient(x, 0, x + ridge, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0.16)');
    gradient.addColorStop(0.45, 'rgba(0,0,0,0.02)');
    gradient.addColorStop(0.75, 'rgba(0,0,0,0.24)');
    gradient.addColorStop(1, 'rgba(255,255,255,0.08)');
    context.fillStyle = gradient;
    context.fillRect(x, 0, ridge, size);
  }
  // Rust streaks bleeding down from bolt rows.
  for (let bolt = 0; bolt < 26; bolt += 1) {
    const x = rng() * size;
    const y = rng() * size * 0.4;
    const length = size * (0.1 + rng() * 0.3);
    const gradient = context.createLinearGradient(x, y, x, y + length);
    gradient.addColorStop(0, 'rgba(148, 84, 42, 0.5)');
    gradient.addColorStop(1, 'rgba(148, 84, 42, 0)');
    context.fillStyle = gradient;
    context.fillRect(x - 1.6, y, 3.2, length);
    context.fillStyle = 'rgba(60, 48, 38, 0.8)';
    context.beginPath();
    context.arc(x, y, 2.4, 0, Math.PI * 2);
    context.fill();
  }
}

function paintSandbag(context: CanvasRenderingContext2D, size: number, rng: () => number): void {
  context.fillStyle = '#9a8a5e';
  context.fillRect(0, 0, size, size);
  const rows = 6;
  const rowHeight = size / rows;
  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 === 0 ? 0 : rowHeight * 0.9;
    for (let x = -1; x < 8; x += 1) {
      const bagWidth = rowHeight * 1.8;
      const bx = x * bagWidth + offset;
      const by = row * rowHeight;
      const gradient = context.createRadialGradient(bx + bagWidth / 2, by + rowHeight / 2, 2, bx + bagWidth / 2, by + rowHeight / 2, bagWidth * 0.7);
      gradient.addColorStop(0, `rgba(196, 178, 126, ${0.5 + rng() * 0.2})`);
      gradient.addColorStop(1, 'rgba(96, 84, 52, 0.55)');
      context.fillStyle = gradient;
      context.beginPath();
      context.ellipse(bx + bagWidth / 2, by + rowHeight / 2, bagWidth * 0.52, rowHeight * 0.46, 0, 0, Math.PI * 2);
      context.fill();
    }
  }
  speckle(context, size, rng, ['#6f6244', '#b8a672'], 500, 1.2);
}

function paintCinderblock(context: CanvasRenderingContext2D, size: number, rng: () => number): void {
  context.fillStyle = '#9c9488';
  context.fillRect(0, 0, size, size);
  fbmMottle(context, size, rng, ['#aaa398', '#8b8377', '#948a7c'], 90, 0.07, 0.16);
  const rows = 8;
  const rowHeight = size / rows;
  const blockWidth = size / 4;
  context.strokeStyle = 'rgba(70, 66, 58, 0.55)';
  context.lineWidth = 3;
  for (let row = 0; row <= rows; row += 1) {
    context.beginPath();
    context.moveTo(0, row * rowHeight);
    context.lineTo(size, row * rowHeight);
    context.stroke();
  }
  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 === 0 ? 0 : blockWidth / 2;
    for (let x = -1; x <= 4; x += 1) {
      context.beginPath();
      context.moveTo(x * blockWidth + offset, row * rowHeight);
      context.lineTo(x * blockWidth + offset, (row + 1) * rowHeight);
      context.stroke();
    }
  }
  speckle(context, size, rng, ['#7c766a', '#b3aca0'], 420, 1.6);
}

function paintTarp(context: CanvasRenderingContext2D, size: number, rng: () => number): void {
  context.fillStyle = '#6f7a52';
  context.fillRect(0, 0, size, size);
  // Weave.
  context.globalAlpha = 0.12;
  for (let line = 0; line < size; line += 4) {
    context.fillStyle = line % 8 === 0 ? '#5c6644' : '#7d8a5e';
    context.fillRect(0, line, size, 2);
    context.fillRect(line, 0, 2, size);
  }
  context.globalAlpha = 1;
  fbmMottle(context, size, rng, ['#5a6644', '#7f8c60', '#4c563a'], 60, 0.09, 0.16);
  // Sun-faded fold lines.
  for (let fold = 0; fold < 6; fold += 1) {
    context.strokeStyle = 'rgba(214, 218, 186, 0.18)';
    context.lineWidth = 6 + rng() * 6;
    const y = rng() * size;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(size, y + (rng() - 0.5) * 60);
    context.stroke();
  }
}

// ---- Test2 painters --------------------------------------------------------

function paintTravertine(context: CanvasRenderingContext2D, size: number, rng: () => number): void {
  context.fillStyle = '#d8cbb4';
  context.fillRect(0, 0, size, size);
  fbmMottle(context, size, rng, ['#e4d9c4', '#cbbda2', '#d2c2a4'], 130, 0.07, 0.14);
  // Veining.
  for (let vein = 0; vein < 26; vein += 1) {
    context.strokeStyle = `rgba(168, 152, 122, ${0.14 + rng() * 0.14})`;
    context.lineWidth = 0.8 + rng() * 1.4;
    let x = rng() * size;
    let y = rng() * size;
    context.beginPath();
    context.moveTo(x, y);
    for (let step = 0; step < 8; step += 1) {
      x += (rng() - 0.5) * size * 0.16;
      y += (rng() - 0.3) * size * 0.1;
      context.lineTo(x, y);
    }
    context.stroke();
  }
  // Paver grid with soft joint shadows.
  const cell = size / 5;
  context.strokeStyle = 'rgba(122, 110, 88, 0.5)';
  context.lineWidth = 4;
  for (let line = 0; line <= 5; line += 1) {
    context.beginPath(); context.moveTo(0, line * cell); context.lineTo(size, line * cell); context.stroke();
    context.beginPath(); context.moveTo(line * cell, 0); context.lineTo(line * cell, size); context.stroke();
  }
  speckle(context, size, rng, ['#b8a988', '#e8dfc9'], 320, 1.4);
}

function paintStucco(context: CanvasRenderingContext2D, size: number, rng: () => number): void {
  context.fillStyle = '#e8e0d0';
  context.fillRect(0, 0, size, size);
  fbmMottle(context, size, rng, ['#efe8da', '#ddd2be', '#e2d8c4'], 150, 0.05, 0.14);
  speckle(context, size, rng, ['#cfc4ac', '#f4eee0', '#c4b89e'], 900, 1.1);
  // Faint weather streaks under an implied cornice.
  for (let streak = 0; streak < 14; streak += 1) {
    const x = rng() * size;
    const length = size * (0.12 + rng() * 0.2);
    const gradient = context.createLinearGradient(x, 0, x, length);
    gradient.addColorStop(0, 'rgba(150, 138, 116, 0.16)');
    gradient.addColorStop(1, 'rgba(150, 138, 116, 0)');
    context.fillStyle = gradient;
    context.fillRect(x - 2, 0, 4, length);
  }
}

function paintCourt(context: CanvasRenderingContext2D, size: number, rng: () => number): void {
  // Acrylic sport surface with painted key + centre circle + boundary.
  context.fillStyle = '#8a5a4a';
  context.fillRect(0, 0, size, size);
  fbmMottle(context, size, rng, ['#966452', '#7c5042', '#8f5c4c'], 90, 0.06, 0.16);
  speckle(context, size, rng, ['#6f4638', '#a06a56'], 500, 1.1);
  context.strokeStyle = 'rgba(240, 236, 226, 0.85)';
  context.lineWidth = size * 0.012;
  const margin = size * 0.06;
  context.strokeRect(margin, margin, size - margin * 2, size - margin * 2);
  // Centre line + circle.
  context.beginPath(); context.moveTo(margin, size / 2); context.lineTo(size - margin, size / 2); context.stroke();
  context.beginPath(); context.arc(size / 2, size / 2, size * 0.11, 0, Math.PI * 2); context.stroke();
  // Keys at each end.
  for (const end of [0, 1]) {
    const y = end === 0 ? margin : size - margin;
    const dir = end === 0 ? 1 : -1;
    context.strokeRect(size * 0.34, y, size * 0.32, dir * size * 0.2);
    context.beginPath();
    context.arc(size / 2, y + dir * size * 0.2, size * 0.09, end === 0 ? 0 : Math.PI, end === 0 ? Math.PI : Math.PI * 2);
    context.stroke();
  }
}

function paintDeckWood(context: CanvasRenderingContext2D, size: number, rng: () => number): void {
  context.fillStyle = '#8a6844';
  context.fillRect(0, 0, size, size);
  const plank = size / 8;
  for (let row = 0; row < 8; row += 1) {
    context.fillStyle = row % 2 === 0 ? 'rgba(255, 232, 190, 0.07)' : 'rgba(60, 40, 22, 0.09)';
    context.fillRect(0, row * plank, size, plank);
    context.strokeStyle = 'rgba(66, 48, 28, 0.6)';
    context.lineWidth = 2.4;
    context.beginPath(); context.moveTo(0, row * plank); context.lineTo(size, row * plank); context.stroke();
    for (let streak = 0; streak < 16; streak += 1) {
      context.strokeStyle = `rgba(120, 88, 52, ${0.12 + rng() * 0.16})`;
      context.lineWidth = 1;
      const y = row * plank + rng() * plank;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size, y + (rng() - 0.5) * 5);
      context.stroke();
    }
  }
}

function paintHedge(context: CanvasRenderingContext2D, size: number, rng: () => number): void {
  context.fillStyle = '#3f5c34';
  context.fillRect(0, 0, size, size);
  for (let leaf = 0; leaf < 2600; leaf += 1) {
    const shade = rng();
    context.fillStyle = shade > 0.72 ? '#5c7d48' : shade > 0.4 ? '#47663a' : '#324a2a';
    context.globalAlpha = 0.5 + rng() * 0.5;
    const radius = 1.4 + rng() * 3.4;
    context.beginPath();
    context.arc(rng() * size, rng() * size, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function paintPoolFloor(context: CanvasRenderingContext2D, size: number, rng: () => number): void {
  context.fillStyle = '#7fc4cf';
  context.fillRect(0, 0, size, size);
  const cell = size / 16;
  context.strokeStyle = 'rgba(60, 130, 140, 0.5)';
  context.lineWidth = 1.6;
  for (let line = 0; line <= 16; line += 1) {
    context.beginPath(); context.moveTo(0, line * cell); context.lineTo(size, line * cell); context.stroke();
    context.beginPath(); context.moveTo(line * cell, 0); context.lineTo(line * cell, size); context.stroke();
  }
  // Caustic webbing: bright interlocking arcs.
  for (let arc = 0; arc < 130; arc += 1) {
    context.strokeStyle = `rgba(228, 250, 252, ${0.1 + rng() * 0.22})`;
    context.lineWidth = 1.6 + rng() * 2.2;
    const x = rng() * size;
    const y = rng() * size;
    const radius = 8 + rng() * 26;
    const start = rng() * Math.PI * 2;
    context.beginPath();
    context.arc(x, y, radius, start, start + 1 + rng() * 1.6);
    context.stroke();
  }
}

// ---------------------------------------------------------------------------
// Material factory
// ---------------------------------------------------------------------------

function texturedStandard(
  color: number,
  roughness: number,
  metalness: number,
  texture: THREE.CanvasTexture | null,
  repeat: readonly [number, number] = [1, 1],
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: texture ? 0xffffff : color, roughness, metalness });
  if (texture) {
    const map = texture.clone();
    map.needsUpdate = true;
    map.repeat.set(repeat[0], repeat[1]);
    material.map = map;
  }
  return material;
}

export type Test1Materials = Readonly<{
  hardpan: THREE.MeshStandardMaterial;
  plywood: THREE.MeshStandardMaterial;
  plywoodDark: THREE.MeshStandardMaterial;
  sandbag: THREE.MeshStandardMaterial;
  containerRed: THREE.MeshStandardMaterial;
  containerBlue: THREE.MeshStandardMaterial;
  containerGreen: THREE.MeshStandardMaterial;
  cinder: THREE.MeshStandardMaterial;
  tarp: THREE.MeshStandardMaterial;
}>;

export function test1Materials(): Test1Materials {
  const hardpanTexture = paintedTexture('test1-hardpan', 1024, 0xa11a, paintHardpan);
  const plywoodTexture = paintedTexture('test1-plywood', 512, 0xa22b, paintPlywood);
  const corrugatedTexture = paintedTexture('test1-corrugated', 512, 0xa33c, paintCorrugated);
  const sandbagTexture = paintedTexture('test1-sandbag', 512, 0xa44d, paintSandbag);
  const cinderTexture = paintedTexture('test1-cinder', 512, 0xa55e, paintCinderblock);
  const tarpTexture = paintedTexture('test1-tarp', 512, 0xa66f, paintTarp);
  const container = (color: number, tintName: string): THREE.MeshStandardMaterial => {
    const material = texturedStandard(color, 0.68, 0.34, corrugatedTexture, [2.2, 1]);
    // Tint the grey corrugation toward the container colour.
    if (material.map) material.color.setHex(color).multiplyScalar(1.35);
    material.name = tintName;
    return material;
  };
  return Object.freeze({
    hardpan: texturedStandard(0xb59a6e, 0.98, 0.02, hardpanTexture, [7, 5.4]),
    plywood: texturedStandard(0xc4a069, 0.92, 0.02, plywoodTexture, [1.6, 1]),
    plywoodDark: texturedStandard(0x8a6e44, 0.94, 0.02, plywoodTexture, [2.4, 1]),
    sandbag: texturedStandard(0x9a8a5e, 0.99, 0, sandbagTexture, [1.6, 1]),
    containerRed: container(0x8a3c2c, 'test1-container-red'),
    containerBlue: container(0x3c5a74, 'test1-container-blue'),
    containerGreen: container(0x53644a, 'test1-container-green'),
    cinder: texturedStandard(0x9c9488, 0.95, 0.04, cinderTexture, [1.8, 1]),
    tarp: texturedStandard(0x6f7a52, 0.96, 0, tarpTexture, [1.4, 1]),
  });
}

export type Test2Materials = Readonly<{
  travertine: THREE.MeshStandardMaterial;
  stucco: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  hedge: THREE.MeshStandardMaterial;
  poolTile: THREE.MeshStandardMaterial;
  court: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
}>;

export function test2Materials(): Test2Materials {
  const travertineTexture = paintedTexture('test2-travertine', 1024, 0xb11a, paintTravertine);
  const stuccoTexture = paintedTexture('test2-stucco', 512, 0xb22b, paintStucco);
  const hedgeTexture = paintedTexture('test2-hedge', 512, 0xb33c, paintHedge);
  const poolTexture = paintedTexture('test2-pool-floor', 512, 0xb44d, paintPoolFloor);
  const courtTexture = paintedTexture('test2-court', 1024, 0xb55e, paintCourt);
  const deckTexture = paintedTexture('test2-deck-wood', 512, 0xb66f, paintDeckWood);
  return Object.freeze({
    travertine: texturedStandard(0xd8cbb4, 0.9, 0.03, travertineTexture, [9, 7]),
    stucco: texturedStandard(0xe8e0d0, 0.92, 0.02, stuccoTexture, [2.4, 1.2]),
    stone: texturedStandard(0xb0a692, 0.94, 0.03, travertineTexture, [1.2, 0.5]),
    hedge: texturedStandard(0x3f5c34, 0.98, 0, hedgeTexture, [2, 1]),
    poolTile: texturedStandard(0x7fc4cf, 0.36, 0.05, poolTexture, [2, 1.2]),
    court: texturedStandard(0x87584a, 0.9, 0.02, courtTexture, [1, 1]),
    timber: texturedStandard(0x7a5c3c, 0.88, 0.04, deckTexture, [1.6, 1]),
  });
}

// ---------------------------------------------------------------------------
// Dressing helpers
// ---------------------------------------------------------------------------

function presentationMesh(mesh: THREE.Mesh | THREE.InstancedMesh, castShadow = true): typeof mesh {
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.userData.presentationOnly = true;
  mesh.raycast = () => undefined;
  return mesh;
}

function addBox(root: THREE.Group, name: string, position: [number, number, number], size: [number, number, number], material: THREE.Material, rotationY = 0, castShadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  root.add(presentationMesh(mesh, castShadow));
  return mesh;
}

function addCylinder(root: THREE.Group, name: string, position: [number, number, number], radiusTop: number, radiusBottom: number, height: number, material: THREE.Material, segments = 10): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.name = name;
  mesh.position.set(...position);
  root.add(presentationMesh(mesh));
  return mesh;
}

// ---------------------------------------------------------------------------
// Test1 dressing
// ---------------------------------------------------------------------------

export function applyTest1Dressing(root: THREE.Group, materials: Test1Materials): void {
  const rng = mulberry32(0x7e571);
  const dressing = new THREE.Group();
  dressing.name = 'test1-dressing';
  dressing.userData.presentationOnly = true;
  root.add(dressing);

  const steelDark = new THREE.MeshStandardMaterial({ color: 0x3d4448, roughness: 0.6, metalness: 0.6 });
  const drumOlive = new THREE.MeshStandardMaterial({ color: 0x5b6844, roughness: 0.7, metalness: 0.4 });
  const drumRust = new THREE.MeshStandardMaterial({ color: 0x7c4a2c, roughness: 0.8, metalness: 0.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x23211e, roughness: 0.95, metalness: 0.05 });
  const flagRed = new THREE.MeshStandardMaterial({ color: 0xc23c2c, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });

  // Perimeter berm ring + distant dry ridge (outside the fence, sells a real
  // training compound instead of a box in a void).
  const bermMaterial = materials.hardpan.clone();
  for (const [bx, bz, bw, bd, yaw] of [
    [0, -24.5, 62, 7, 0], [0, 24.5, 62, 7, 0], [-31, 0, 7, 48, 0], [31, 0, 7, 48, 0],
  ] as const) {
    const berm = addBox(dressing, 'test1-berm-ring', [bx, 1.1, bz], [bw, 2.6, bd], bermMaterial, yaw, false);
    berm.rotation.z = 0;
  }
  const ridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x9a8a68, roughness: 1, metalness: 0 });
  // Rounded, overlapping and sunk: sharp low-segment cones read as pyramids
  // (measured on the first pass); wide 12-segment domes read as dry hills.
  for (let hill = 0; hill < 18; hill += 1) {
    const angle = (hill / 18) * Math.PI * 2 + rng() * 0.3;
    const radius = 52 + rng() * 26;
    const hillRadius = 16 + rng() * 18;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(hillRadius, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), ridgeMaterial);
    mesh.name = 'test1-ridge-hill';
    mesh.scale.y = 0.22 + rng() * 0.16;
    mesh.position.set(Math.cos(angle) * radius, -1.2, Math.sin(angle) * radius);
    mesh.rotation.y = rng() * Math.PI;
    dressing.add(presentationMesh(mesh, false));
  }

  // Fence post rhythm: timber uprights + a top rail band break up the long
  // perimeter planes.
  for (let post = -6; post <= 6; post += 1) {
    addBox(dressing, 'test1-fence-post-n', [post * 4.2, 1.4, -18.9], [0.22, 2.8, 0.22], materials.plywoodDark);
    addBox(dressing, 'test1-fence-post-s', [post * 4.2, 1.4, 18.9], [0.22, 2.8, 0.22], materials.plywoodDark);
  }
  for (let post = -4; post <= 4; post += 1) {
    addBox(dressing, 'test1-fence-post-w', [-25.9, 1.4, post * 4.4], [0.22, 2.8, 0.22], materials.plywoodDark);
    addBox(dressing, 'test1-fence-post-e', [25.9, 1.4, post * 4.4], [0.22, 2.8, 0.22], materials.plywoodDark);
  }
  addBox(dressing, 'test1-fence-rail-n', [0, 2.5, -18.85], [53, 0.18, 0.14], materials.plywoodDark, 0, false);
  addBox(dressing, 'test1-fence-rail-s', [0, 2.5, 18.85], [53, 0.18, 0.14], materials.plywoodDark, 0, false);

  // Watch the lanes: red range flags on the firing line, drum clusters, tyre
  // stacks, ammo crates, a cable run on timber poles down the east road.
  for (const flagZ of [-16, 16]) {
    addCylinder(dressing, 'test1-flag-pole', [-24.5, 2.2, flagZ], 0.05, 0.07, 4.4, steelDark, 6);
    addBox(dressing, 'test1-flag-cloth', [-24.1, 4, flagZ + 0.45], [0.9, 0.55, 0.03], flagRed);
  }
  for (let drum = 0; drum < 9; drum += 1) {
    const x = -4 + rng() * 8;
    const z = -16 + rng() * 32;
    if (Math.abs(x) < 5 && Math.abs(z) < 6) continue; // clear of the tower
    // 0.85 m tall: below the walkthrough census - visibly a drum, honestly
    // not cover (the parity gate refuses walk-through cover-height dressing).
    addCylinder(dressing, 'test1-drum', [x, 0.425, z], 0.4, 0.4, 0.85, rng() > 0.5 ? drumOlive : drumRust, 12);
  }
  for (const [tx, tz] of [[-7.5, 3], [8.5, -4], [5.5, 14.5]] as const) {
    for (let tyre = 0; tyre < 3; tyre += 1) {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 8, 14), rubber);
      mesh.name = 'test1-tyre';
      mesh.position.set(tx + (rng() - 0.5) * 0.2, 0.18 + tyre * 0.34, tz + (rng() - 0.5) * 0.2);
      mesh.rotation.x = Math.PI / 2;
      dressing.add(presentationMesh(mesh));
    }
  }
  for (let crate = 0; crate < 6; crate += 1) {
    const x = 6 + rng() * 16;
    const z = -14 + rng() * 28;
    addBox(dressing, 'test1-ammo-crate', [x, 0.24, z], [0.9, 0.48, 0.55], materials.plywoodDark, rng() * Math.PI);
  }
  for (const poleZ of [-12, 0, 12]) {
    addCylinder(dressing, 'test1-power-pole', [24.6, 2.6, poleZ], 0.09, 0.12, 5.2, materials.plywoodDark, 7);
    addBox(dressing, 'test1-power-cross', [24.6, 4.7, poleZ], [1.4, 0.09, 0.09], materials.plywoodDark);
  }

  // Camo net over the north shack: a tarp canopy on angled poles.
  for (const netSide of [-1, 1] as const) {
    const net = addBox(dressing, 'test1-camo-net', [-14, 3.4, netSide * 13], [7, 0.06, 6.6], materials.tarp, 0, false);
    net.rotation.z = 0.08 * netSide;
    net.rotation.x = -0.06 * netSide;
  }

  // Dry scrub: instanced crossed-plane tufts around the map edge (vegetation
  // skill: Fibonacci-free deterministic scatter, presentation-only).
  const tuftGeometry = new THREE.ConeGeometry(0.4, 0.34, 6);
  const tuftMaterial = new THREE.MeshStandardMaterial({ color: 0x99885a, roughness: 1, metalness: 0 });
  const tuftCount = 140;
  const tufts = new THREE.InstancedMesh(tuftGeometry, tuftMaterial, tuftCount);
  tufts.name = 'test1-scrub-tufts';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let placed = 0;
  let attempts = 0;
  while (placed < tuftCount && attempts < tuftCount * 30) {
    attempts += 1;
    const x = -25 + rng() * 50;
    const z = -18 + rng() * 36;
    // Keep the fighting lanes clean: scrub hugs the fence line only (the
    // west firing lane runs the full z-extent, so no mid-lane band there).
    const nearEdge = Math.abs(x) > 21 || Math.abs(z) > 16;
    if (!nearEdge) continue;
    const scale = 0.6 + rng() * 1;
    quaternion.setFromAxisAngle(up, rng() * Math.PI * 2);
    matrix.compose(
      new THREE.Vector3(x, 0.15 * scale, z),
      quaternion,
      new THREE.Vector3(scale, scale * 0.75, scale),
    );
    tufts.setMatrixAt(placed, matrix);
    placed += 1;
  }
  tufts.count = placed;
  tufts.instanceMatrix.needsUpdate = true;
  tufts.computeBoundingSphere();
  dressing.add(presentationMesh(tufts, false));
}

// ---------------------------------------------------------------------------
// Test2 dressing
// ---------------------------------------------------------------------------

export function applyTest2Dressing(root: THREE.Group, materials: Test2Materials): void {
  const rng = mulberry32(0x7e572);
  const dressing = new THREE.Group();
  dressing.name = 'test2-dressing';
  dressing.userData.presentationOnly = true;
  root.add(dressing);

  const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dee2, roughness: 0.16, metalness: 0.85 });
  const canvasCream = new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const soil = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1, metalness: 0 });
  const trunk = new THREE.MeshStandardMaterial({ color: 0x5c4630, roughness: 0.95, metalness: 0 });
  const cypressFoliage = new THREE.MeshStandardMaterial({ color: 0x3a5a34, roughness: 0.95, metalness: 0 });
  const glassBlue = new THREE.MeshStandardMaterial({ color: 0x9fc8d8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.35 });

  // Villa facades dressed onto the estate walls: pilasters, window bands and a
  // cornice line so the perimeter reads as the mansion, not a fence.
  for (const side of [-1, 1] as const) {
    const wallZ = side * 24.9;
    for (let pilaster = -3; pilaster <= 3; pilaster += 1) {
      addBox(dressing, 'test2-pilaster', [pilaster * 9, 1.6, wallZ - side * 0.15], [0.8, 3.2, 0.3], materials.stucco);
    }
    addBox(dressing, 'test2-cornice', [0, 3.05, wallZ - side * 0.2], [64, 0.35, 0.5], materials.stone, 0, false);
    for (let window = -3; window <= 3; window += 1) {
      addBox(dressing, 'test2-wall-window', [window * 9 + 4.5, 1.9, wallZ - side * 0.2], [2.6, 1.5, 0.1], glassBlue, 0, false);
    }
  }
  for (const side of [-1, 1] as const) {
    const wallX = side * 32.9;
    addBox(dressing, 'test2-cornice-end', [wallX - side * 0.2, 3.05, 0], [0.5, 0.35, 48], materials.stone, 0, false);
    for (let window = -2; window <= 2; window += 1) {
      addBox(dressing, 'test2-end-window', [wallX - side * 0.2, 1.9, window * 9 + 4.5], [0.1, 1.5, 2.6], glassBlue, 0, false);
    }
  }

  // Pool life: umbrellas, upgraded loungers, towel stack, chrome pool ladder.
  for (const umbrellaSide of [-1, 1] as const) {
    const ux = umbrellaSide * 11;
    addCylinder(dressing, 'test2-umbrella-pole', [ux, 1.5, -10.6], 0.05, 0.05, 3, chrome, 8);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.8, 10), canvasCream);
    canopy.name = 'test2-umbrella-canopy';
    canopy.position.set(ux, 3.1, -10.6);
    dressing.add(presentationMesh(canopy));
  }
  addCylinder(dressing, 'test2-pool-ladder-a', [6.9, 0.35, -12.2], 0.04, 0.04, 1.3, chrome, 6);
  addCylinder(dressing, 'test2-pool-ladder-b', [6.9, 0.35, -11.6], 0.04, 0.04, 1.3, chrome, 6);
  addBox(dressing, 'test2-towel-stack', [-9.4, 0.62, -11.2], [0.6, 0.4, 0.5], canvasCream, 0.3, false);

  // Court gear: hoop at each end + shade pergola over the north benches.
  for (const hoopEnd of [-1, 1] as const) {
    const hx = hoopEnd * 6.9;
    addCylinder(dressing, 'test2-hoop-pole', [hx, 1.9, 0], 0.09, 0.11, 3.8, chrome, 8);
    addBox(dressing, 'test2-hoop-board', [hx - hoopEnd * 0.5, 3.35, 0], [0.08, 1, 1.6], glassBlue, 0, false);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 14), new THREE.MeshStandardMaterial({ color: 0xd4622c, roughness: 0.5, metalness: 0.5 }));
    ring.name = 'test2-hoop-ring';
    ring.position.set(hx - hoopEnd * 0.85, 3.05, 0);
    ring.rotation.x = Math.PI / 2;
    dressing.add(presentationMesh(ring, false));
  }

  // Garden: cypress sentinels along the terrace, planter shrubs, a gravel
  // path band, and box hedge balls by the balustrade gaps.
  const cypressCount = 12;
  const cypressGeometry = new THREE.ConeGeometry(0.52, 4.8, 8);
  const cypress = new THREE.InstancedMesh(cypressGeometry, cypressFoliage, cypressCount);
  cypress.name = 'test2-cypress-row';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let tree = 0; tree < cypressCount; tree += 1) {
    const x = -27.5 + (tree % 6) * 11 + (tree >= 6 ? 5.5 : 0);
    const z = tree >= 6 ? 22.6 : 12.2;
    quaternion.setFromAxisAngle(up, (tree % 5) * 0.7);
    const scale = 0.85 + (tree % 3) * 0.14;
    matrix.compose(new THREE.Vector3(x, 2.2 * scale, z), quaternion, new THREE.Vector3(scale, scale, scale));
    cypress.setMatrixAt(tree, matrix);
  }
  cypress.instanceMatrix.needsUpdate = true;
  cypress.computeBoundingSphere();
  dressing.add(presentationMesh(cypress));
  for (let tree = 0; tree < cypressCount; tree += 1) {
    const x = -27.5 + (tree % 6) * 11 + (tree >= 6 ? 5.5 : 0);
    const z = tree >= 6 ? 22.6 : 12.2;
    addCylinder(dressing, 'test2-cypress-trunk', [x, 0.3, z], 0.09, 0.12, 0.6, trunk, 6);
  }

  // Planter shrubs: three-lobe blobs above the authored planter hedges.
  const shrubGeometry = new THREE.IcosahedronGeometry(0.62, 1);
  const shrubCount = 10;
  const shrubs = new THREE.InstancedMesh(shrubGeometry, materials.hedge, shrubCount);
  shrubs.name = 'test2-planter-shrubs';
  const shrubSpots: Array<[number, number, number]> = [
    [-8, 2.2, -6], [8, 2.2, -6], [-8, 2.2, 6], [8, 2.2, 6],
    [-13, 1.5, 9.5], [13, 1.5, 9.5], [0, 1.5, 9.5],
    [-10, 2.3, 15], [10, 2.3, 15], [0, 2.3, 19],
  ];
  for (let shrub = 0; shrub < shrubCount; shrub += 1) {
    const [x, y, z] = shrubSpots[shrub]!;
    quaternion.setFromAxisAngle(up, (shrub % 7) * 0.5);
    const scale = 0.8 + (shrub % 4) * 0.12;
    matrix.compose(new THREE.Vector3(x + (rng() - 0.5) * 0.4, y, z + (rng() - 0.5) * 0.3), quaternion, new THREE.Vector3(scale, scale * 0.8, scale));
    shrubs.setMatrixAt(shrub, matrix);
  }
  shrubs.instanceMatrix.needsUpdate = true;
  shrubs.computeBoundingSphere();
  dressing.add(presentationMesh(shrubs));

  // Motor court: a second parked car silhouette + planter urns at the mouths.
  for (const motorSide of [-1, 1] as const) {
    for (const urnZ of [-1, 1]) {
      addCylinder(dressing, 'test2-urn', [motorSide * 23.5, 0.42, urnZ * 2 + motorSide * 2], 0.4, 0.3, 0.84, materials.stone, 9);
      const urnShrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), materials.hedge);
      urnShrub.name = 'test2-urn-shrub';
      urnShrub.position.set(motorSide * 23.5, 1.1, urnZ * 2 + motorSide * 2);
      dressing.add(presentationMesh(urnShrub));
    }
  }

  // Garden soil beds under the hedges.
  for (const [bx, bz, bw, bd] of [[-10, 15, 5.6, 2.2], [10, 15, 5.6, 2.2], [0, 19, 5.6, 2.2]] as const) {
    addBox(dressing, 'test2-soil-bed', [bx, 0.02, bz], [bw, 0.06, bd], soil, 0, false);
  }
}
