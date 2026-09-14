/**
 * Source 20 - Plate-level armour and ballistics (Claude of Tanks).
 *
 * Primary source, re-read at the pinned revision on 2026-09-12 (files cached outside the
 * repository, sha256 recorded in SOURCE_RESEARCH.json):
 *   https://github.com/Kevin-Liu-01/Claude-of-Tanks @ 9004ce65a9be52793a3f4130bde034ec4a857f32
 *   src/sim/armor.js (21,262 B, all 590 lines read) and src/sim/ballistics.js (10,838 B, all
 *   276 lines read). MIT root LICENSE + NOTICE.md positions re-confirmed by the prior lane;
 *   first-party code only, the commercial typeface carve-out is untouched here.
 *
 * THE METHOD, restated from reading the source (MIT - method restated in our own code):
 *   - a tank is FOUR RIGID FRAMES, not one box: hull local (YXZ yaw/pitch/roll exactly
 *     inverse to the visual root), turret local (hull translated to the turret pivot then
 *     rotated by turret yaw), gun-follow (turret pitched about the trunnion, for gunFollow
 *     plates) and barrel (translation + pitch, cylinder along +Z) - armor.js lines 9-20,
 *     98-131;
 *   - every world-space shell segment is LOCALIZED into all four frames once, then tested
 *     with cheap local tests: convex-quad plate intersection front-face-only (denominator
 *     >= -1e-9 is a miss - lines 155-177), AABB slab boxes for modules/crew with entry and
 *     exit parameters (lines 203-228), and an analytic cylinder for the barrel (301-317);
 *   - hits from every frame are merged and SORTED BY t, producing ordered intersections
 *     that damage resolution walks (lines 490-491);
 *   - penetration is a LINE INTERPOLATION against true arc length flown, pen@100m to
 *     pen@1000m clamped outside the range (ballistics.js penAtDistanceMm, lines 199-206),
 *     fed by a shell integrator that keeps prevPos so callers can sweep the segment
 *     without tunneling (lines 141-150);
 *   - gun dispersion is a 2D Gaussian from an injected rng whose rolls outside the 2-sigma
 *     reticle are re-placed UNIFORMLY inside the circle (r = 2*sqrt(u)), not re-rolled
 *     (lines 241-266).
 *
 * COMPATIBILITY DIFFERENCE: the source resolver (damage.js) applies normalization tables,
 * module rolls and ERA spend on top of these hits; this demo resolves the simplest honest
 * subset - effective thickness = plate thickness divided by the impact-angle cosine, versus
 * and dispersion rule, driven by a seeded PRNG instead of an injected rng closure.
 */

import { createRng } from './rng';
import { disposeGroup, type Demo, type DemoContext } from './types';
import type {
  BufferGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';


const SHELL_SPEED_MPS = 220;
const SHELL_GRAVITY = 9.81;
const PEN_100_MM = 180;
const PEN_1000_MM = 140;
const FIRE_INTERVAL_S = 1.1;
const SHELL_LIFE_S = 3;
const TURRET_PIVOT_Y = 0.62;
const TRUNNION_Y = 0.18;

interface PlateDef {
  name: string;
  kind: 'main' | 'spaced';
  frame: 'hull' | 'turret';
  thicknessMm: number;
  /** Four CCW-from-outside vertices in the plate's frame. */
  verts: [number, number, number][];
  color: number;
}

interface PlateHit {
  t: number;
  plate: PlateDef;
  point: { x: number; y: number; z: number };
  impactAngleDeg: number;
}

interface Shell {
  pos: { x: number; y: number; z: number };
  prev: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  ageS: number;
  distM: number;
  dead: boolean;
}

/** Four rigid frames for one pose, mirroring the source's buildFrames layout. */
interface Frames {
  hull: Matrix4;
  hullInv: Matrix4;
  turret: Matrix4;
  turretInv: Matrix4;
}

function composeFrames(
  THREE: DemoContext['THREE'],
  pos: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  roll: number,
  turretYaw: number,
): Frames {
  // Hull: the source locks rotation order 'YXZ' with x = -pitch; invert for world->local.
  const euler = new THREE.Euler(-pitch, yaw, roll, 'YXZ');
  const quat = new THREE.Quaternion().setFromEuler(euler);
  const hull = new THREE.Matrix4().compose(
    new THREE.Vector3(pos.x, pos.y, pos.z),
    quat,
    new THREE.Vector3(1, 1, 1),
  );
  const turret = new THREE.Matrix4().makeRotationY(turretYaw);
  turret.setPosition(0, TURRET_PIVOT_Y, 0);
  turret.premultiply(hull);
  return {
    hull,
    hullInv: hull.clone().invert(),
    turret,
    turretInv: turret.clone().invert(),
  };
}

/** Segment vs convex quad, front face only - restated from armor.js intersectQuad. */
function intersectQuad(
  THREE: DemoContext['THREE'],
  fromL: Vector3,
  dirL: Vector3,
  verts: [number, number, number][],
  outPoint: Vector3,
): { t: number; normal: Vector3 } | null {
  const v0 = new THREE.Vector3(...verts[0]);
  const v1 = new THREE.Vector3(...verts[1]);
  const v3 = new THREE.Vector3(...verts[3]);
  const e1 = new THREE.Vector3().subVectors(v1, v0);
  const e2 = new THREE.Vector3().subVectors(v3, v0);
  const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
  const denom = dirL.dot(n);
  if (denom >= -1e-9) return null; // parallel or back face
  const t = new THREE.Vector3().subVectors(v0, fromL).dot(n) / denom;
  if (t < 0 || t > 1) return null;
  const pt = new THREE.Vector3().copy(fromL).addScaledVector(dirL, t);
  // Inside test: every CCW edge must keep the point on its interior side.
  const edge = new THREE.Vector3();
  const toPt = new THREE.Vector3();
  const cross = new THREE.Vector3();
  for (let i = 0; i < 4; i += 1) {
    const a = new THREE.Vector3(...verts[i]);
    const b = new THREE.Vector3(...verts[(i + 1) % 4]);
    edge.subVectors(b, a);
    toPt.subVectors(pt, a);
    cross.crossVectors(edge, toPt);
    if (cross.dot(n) < -1e-6) return null;
  }
  outPoint.copy(pt);
  return { t, normal: n.clone() };
}

/** Segment vs AABB slabs - restated from armor.js intersectAABB. */
function intersectAABB(
  fromL: Vector3,
  dirL: Vector3,
  min: [number, number, number],
  max: [number, number, number],
): { t0: number; t1: number } | null {
  let t0 = 0;
  let t1 = 1;
  const f = [fromL.x, fromL.y, fromL.z];
  const d = [dirL.x, dirL.y, dirL.z];
  for (let ax = 0; ax < 3; ax += 1) {
    if (Math.abs(d[ax]) < 1e-12) {
      if (f[ax] < min[ax] || f[ax] > max[ax]) return null;
    } else {
      let ta = (min[ax] - f[ax]) / d[ax];
      let tb = (max[ax] - f[ax]) / d[ax];
      if (ta > tb) {
        const s = ta;
        ta = tb;
        tb = s;
      }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
  }
  return { t0, t1 };
}

/** penAtDistanceMm - restated linear interpolation from ballistics.js lines 199-206. */
function penAtDistanceMm(distM: number): number {
  const f = Math.min(1, Math.max(0, (distM - 100) / 900));
  return PEN_100_MM + (PEN_1000_MM - PEN_100_MM) * f;
}

/** Dispersion: Box-Muller pair, rolls outside 2-sigma re-placed uniformly - ballistics.js 241-266. */
function applyDispersion(
  THREE: DemoContext['THREE'],
  dir: Vector3,
  sigmaRad: number,
  rng: () => number,
): void {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  let x = r * Math.cos(2 * Math.PI * u2);
  let y = r * Math.sin(2 * Math.PI * u2);
  if (x * x + y * y > 4) {
    const rr = 2 * Math.sqrt(rng());
    const th = 2 * Math.PI * rng();
    x = rr * Math.cos(th);
    y = rr * Math.sin(th);
  }
  const basis = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, basis).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  dir.addScaledVector(right, Math.tan(x * sigmaRad)).addScaledVector(up, Math.tan(y * sigmaRad)).normalize();
}

/** Hull/turret plate set. Our own tank layout, same schema as the source's ArmorModel. */
function buildPlates(): PlateDef[] {
  return [
    {
      name: 'glacis', kind: 'main', frame: 'hull', thicknessMm: 150, color: 0x5a6f4a,
      verts: [[-0.9, 0.15, 1.35], [0.9, 0.15, 1.35], [0.9, 0.75, 0.85], [-0.9, 0.75, 0.85]],
    },
    {
      name: 'rear', kind: 'main', frame: 'hull', thicknessMm: 45, color: 0x4a6f5a,
      verts: [[0.9, 0.2, -1.3], [-0.9, 0.2, -1.3], [-0.9, 0.75, -1.1], [0.9, 0.75, -1.1]],
    },
    {
      name: 'turretFront', kind: 'main', frame: 'turret', thicknessMm: 120, color: 0x6f5a4a,
      verts: [[-0.55, 0.0, 0.55], [0.55, 0.0, 0.55], [0.55, 0.45, 0.35], [-0.55, 0.45, 0.35]],
    },
    {
      name: 'turretSide', kind: 'spaced', frame: 'turret', thicknessMm: 60, color: 0x4a6f5a,
      verts: [[0.55, 0.0, 0.55], [0.55, 0.0, -0.6], [0.55, 0.45, -0.6], [0.55, 0.45, 0.35]],
    },
  ];
}

function quadGeometry(
  THREE: DemoContext['THREE'],
  verts: [number, number, number][],
): BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(12);
  verts.forEach((v, i) => v.forEach((c, j) => {
    positions[i * 3 + j] = c;
  }));
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const rng = createRng(seed ^ 0x20a17c0f);
  const root = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  const stats = {
    shellsFired: 0,
    plateHits: 0,
    penetrations: 0,
    bounces: 0,
    lastResolution: '' as string,
  };

  // Tank: plate meshes (double side so misses-through show), module box, barrel.
  const plates = buildPlates();
  const plateMaterials: MeshStandardMaterial[] = [];
  for (const plate of plates) {
    const geometry = quadGeometry(THREE, plate.verts);
    const material = new THREE.MeshStandardMaterial({
      color: plate.color,
      side: THREE.DoubleSide,
      metalness: 0.25,
      roughness: 0.65,
    });
    const mesh = new THREE.Mesh(geometry, material);
    if (plate.frame === 'turret') mesh.position.set(0, TURRET_PIVOT_Y, 0);
    plateMaterials.push(material);
    root.add(mesh);
    disposables.push(geometry, material);
  }

  // Turret roof cap so the turret reads as a volume, not a floating pair of quads.
  const roofGeometry = new THREE.BoxGeometry(1.1, 0.08, 1.1);
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x59614d, metalness: 0.2, roughness: 0.7 });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.set(0, TURRET_PIVOT_Y + 0.47, 0);
  root.add(roof);
  disposables.push(roofGeometry, roofMaterial);

  // Barrel in the gun-follow frame: parented under a pivot at the trunnion.
  const gunPivot = new THREE.Group();
  gunPivot.position.set(0, TURRET_PIVOT_Y + TRUNNION_Y, 0.3);
  const barrelGeometry = new THREE.CylinderGeometry(0.055, 0.07, 1.5, 10);
  barrelGeometry.rotateX(Math.PI / 2);
  barrelGeometry.translate(0, 0, 0.75);
  const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x3d4237, metalness: 0.5, roughness: 0.5 });
  const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
  gunPivot.add(barrel);
  root.add(gunPivot);
  disposables.push(barrelGeometry, barrelMaterial);

  // Ammo module box (wireframe box) - the AABB the resolver also tests.
  const ammoBox: { min: [number, number, number]; max: [number, number, number] } = {
    min: [-0.35, 0.18, -0.7],
    max: [0.35, 0.55, 0.2],
  };
  const ammoGeometry = new THREE.BoxGeometry(
    ammoBox.max[0] - ammoBox.min[0],
    ammoBox.max[1] - ammoBox.min[1],
    ammoBox.max[2] - ammoBox.min[2],
  );
  const ammoMaterial = new THREE.MeshBasicMaterial({ color: 0xff8844, wireframe: true });
  const ammoMesh = new THREE.Mesh(ammoGeometry, ammoMaterial);
  ammoMesh.position.set(
    (ammoBox.min[0] + ammoBox.max[0]) / 2,
    (ammoBox.min[1] + ammoBox.max[1]) / 2,
    (ammoBox.min[2] + ammoBox.max[2]) / 2,
  );
  root.add(ammoMesh);
  disposables.push(ammoGeometry, ammoMaterial);

  // Impact markers: pooled small boxes colored by resolution (red pen, blue bounce).
  const markerGeometry = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  const markerPool: { mesh: Mesh; material: MeshBasicMaterial; life: number }[] = [];
  for (let i = 0; i < 12; i += 1) {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    const mesh = new THREE.Mesh(markerGeometry, material);
    mesh.visible = false;
    markerPool.push({ mesh, material, life: 0 });
    root.add(mesh);
  }
  disposables.push(markerGeometry, ...markerPool.map((m) => m.material));

  // Tracer for the in-flight shell.
  const tracerGeometry = new THREE.SphereGeometry(0.05, 8, 6);
  const tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xffe28a });
  const tracer = new THREE.Mesh(tracerGeometry, tracerMaterial);
  tracer.visible = false;
  root.add(tracer);
  disposables.push(tracerGeometry, tracerMaterial);

  // Resolver state.
  const muzzle = new THREE.Vector3(0, 1.05, 3.6);
  let shell: Shell | null = null;
  let fireTimer = 0.35;
  let time = 0;
  let resolvedThisVolley = false;

  const flashPlate = (plate: PlateDef, penetrated: boolean): void => {
    const material = plateMaterials[plates.indexOf(plate)];
    material.emissive.setHex(penetrated ? 0xaa1a1a : 0x1a3caa);
  };

  /** One resolver pass: localize the swept segment and walk ordered hits. */
  const resolveShell = (s: Shell): void => {
    const frames = composeFrames(THREE, { x: 0, y: 0, z: 0 }, 0.35 * Math.sin(time * 0.4), 0, 0, Math.sin(time * 0.3) * 1.2);
    const hits: PlateHit[] = [];
    for (const plate of plates) {
      const inv = plate.frame === 'turret' ? frames.turretInv : frames.hullInv;
      const fwd = plate.frame === 'turret' ? frames.turret : frames.hull;
      const localFrom = new THREE.Vector3(s.prev.x, s.prev.y, s.prev.z).applyMatrix4(inv);
      const localTo = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z).applyMatrix4(inv);
      const dirL = new THREE.Vector3().subVectors(localTo, localFrom);
      const localPoint = new THREE.Vector3();
      const hit = intersectQuad(THREE, localFrom, dirL, plate.verts, localPoint);
      if (!hit) continue;
      const segT = hit.t;
      const worldPoint = localPoint.clone().applyMatrix4(fwd);
      const dirN = dirL.clone().normalize();
      const cosI = Math.min(1, Math.max(0, -dirN.dot(hit.normal)));
      hits.push({
        t: segT,
        plate,
        point: { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
        impactAngleDeg: (Math.acos(cosI) * 180) / Math.PI,
      });
    }
    const moduleHits: { t: number; name: string; point: { x: number; y: number; z: number } }[] = [];
    {
      const localFrom = new THREE.Vector3(s.prev.x, s.prev.y, s.prev.z).applyMatrix4(frames.hullInv);
      const localTo = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z).applyMatrix4(frames.hullInv);
      const dirL = new THREE.Vector3().subVectors(localTo, localFrom);
      const box = intersectAABB(localFrom, dirL, ammoBox.min, ammoBox.max);
      if (box) {
        const worldPoint = localFrom.clone().addScaledVector(dirL, box.t0).applyMatrix4(frames.hull);
        moduleHits.push({ t: box.t0, name: 'ammo', point: { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z } });
      }
    }
    const ordered = [
      ...hits.map((h) => ({ kind: 'plate' as const, ...h })),
      ...moduleHits.map((m) => ({ kind: 'module' as const, plate: null, impactAngleDeg: 0, ...m })),
    ].sort((a, b) => a.t - b.t);
    stats.plateHits += ordered.length;
    if (ordered.length === 0 || resolvedThisVolley) return;
    const first = ordered[0];
    resolvedThisVolley = true;
    const marker = markerPool.find((m) => m.life <= 0) ?? markerPool[0];
    if (first.kind === 'module') {
      stats.lastResolution = `${first.name}:module`;
      marker.mesh.position.set(first.point.x, first.point.y, first.point.z);
      marker.material.color.setHex(0xff8844);
      marker.material.opacity = 1;
      marker.mesh.visible = true;
      marker.life = 0.9;
      return;
    }
    const penetration = penAtDistanceMm(s.distM);
    const effective = first.plate.thicknessMm / Math.max(0.05, Math.cos((first.impactAngleDeg * Math.PI) / 180));
    const penetrated = penetration > effective;
    if (penetrated) stats.penetrations += 1;
    else stats.bounces += 1;
    stats.lastResolution = `${first.plate.name}:${penetrated ? 'pen' : 'bounce'}@${Math.round(first.impactAngleDeg)}deg`;
    flashPlate(first.plate, penetrated);
    marker.mesh.position.set(first.point.x, first.point.y, first.point.z);
    marker.material.color.setHex(penetrated ? 0xff3333 : 0x4466ff);
    marker.material.opacity = 1;
    marker.mesh.visible = true;
    marker.life = 0.9;
  };

  const fireShell = (): void => {
    // Elevation jitter spans the glacis auto-bounce angle so both resolutions occur.
    const elevation = -(0.16 + 0.1 * rng());
    const dir = new THREE.Vector3(-0.12, elevation, -1).normalize();
    applyDispersion(THREE, dir, 0.012, rng);
    shell = {
      pos: { x: muzzle.x, y: muzzle.y, z: muzzle.z },
      prev: { x: muzzle.x, y: muzzle.y, z: muzzle.z },
      vel: { x: dir.x * SHELL_SPEED_MPS, y: dir.y * SHELL_SPEED_MPS, z: dir.z * SHELL_SPEED_MPS },
      ageS: 0,
      distM: 0,
      dead: false,
    };
    stats.shellsFired += 1;
    resolvedThisVolley = false;
    tracer.visible = true;
  };

  const update = (timeS: number, dt: number): void => {
    time = timeS;
    for (const material of plateMaterials) {
      material.emissive.multiplyScalar(Math.max(0, 1 - dt * 4));
    }
    for (const marker of markerPool) {
      if (marker.life > 0) {
        marker.life -= dt;
        marker.material.opacity = Math.max(0, marker.life / 0.9);
        if (marker.life <= 0) marker.mesh.visible = false;
      }
    }
    // Turret sweep + gun pitch keep the frames live while shells resolve.
    gunPivot.rotation.x = -0.06 + 0.03 * Math.sin(timeS * 0.7);
    fireTimer -= dt;
    if (!shell && fireTimer <= 0) {
      fireShell();
      fireTimer = FIRE_INTERVAL_S;
    }
    if (shell) {
      shell.prev = { ...shell.pos };
      shell.pos.x += shell.vel.x * dt;
      shell.pos.y += shell.vel.y * dt - 0.5 * SHELL_GRAVITY * dt * dt;
      shell.pos.z += shell.vel.z * dt;
      shell.distM += Math.hypot(shell.pos.x - shell.prev.x, shell.pos.y - shell.prev.y, shell.pos.z - shell.prev.z);
      shell.vel.y -= SHELL_GRAVITY * dt;
      shell.ageS += dt;
      tracer.position.set(shell.pos.x, shell.pos.y, shell.pos.z);
      resolveShell(shell);
      if (shell.ageS > SHELL_LIFE_S || shell.pos.y < -0.5) {
        shell = null;
        tracer.visible = false;
      }
    }
  };

  const dispose = (): void => {
    for (const entry of disposables) entry.dispose();
    disposables.length = 0;
    disposeGroup(root);
  };

  root.userData.stats = stats;
  root.userData.penAtDistanceMm = penAtDistanceMm;

  return {
    root,
    update,
    dispose,
    metadata: {
      sourceId: 20,
      title: 'Engine-free Three.js armour, ballistics and destructible battlefields (Claude of Tanks)',
      method:
        'Shell segments localized into four rigid frames (hull/turret/gun/barrel), resolved against '
        + 'convex quad plates front-face-only plus AABB module boxes in ordered t order, with '
        + 'penetration linearly interpolated against true flight distance and 2-sigma-clamped '
        + 'Gaussian dispersion.',
      adaptation: 'adapted',
      sources: [
        'https://cot.kevinliu.studio/',
        'https://github.com/Kevin-Liu-01/Claude-of-Tanks',
      ],
      limitation:
        'MIT source read in full at 9004ce6; independent implementation. Damage normalization '
        + 'tables, module rolls, ERA spend and track prisms from the source resolver are NOT '
        + 'modelled - resolution here is thickness/cos(impact angle) vs pen@distance. No '
        + 'spotting, physics or destructible battlefields.',
    },
  };
}

export default createDemo;
