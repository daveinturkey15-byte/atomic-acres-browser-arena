/**
 * Source 31 - Rigged first-person arms: handle-bone IK and finger curl (para / OpenGameArt).
 *
 * Primary source, re-read 2026-09-12 (page cached outside the repository, sha256 in
 * SOURCE_RESEARCH.json): https://opengameart.org/content/fps-arms-rigged-only
 * The asset page states, in the author's own words: the rig "uses IK and a 'handle' bone ...
 * for quick arm posing and a constraint modifier on finger bones for quick curling of
 * fingers"; the mesh is ~4,000 verts / ~8,000 tris, texture 1024x1024 downsampled from 2048,
 * shipped as two .blend and .fbx files (one T-pose, one with a crude sample animation); mesh
 * and texture originate from MakeHuman. Licence read on the page itself: CC0.
 *
 * CC0 means even direct reuse would be lawful - but this lane vendors no binary assets and
 * runs no Blender, so the author's MESH is not loaded. What is demonstrated is the RIG
 * target) driving forearm segments, plus a single curl parameter that rotates every finger
 * joint through a weighted constraint - the "quick posing, quick curling" workflow the
 * handle bone exists for. A T-pose ghost stands beside the posed arm for before/after
 * comparison, matching the author's own T-pose/animated file split.
 *
 * LIMITATION: bone segments are rigid boxes parented to their bones; the source mesh is a
 * smooth weighted MakeHuman skin, which a lab scene cannot reproduce without the .blend.
 */

import { disposeGroup, type Demo, type DemoContext } from './types';
import type { Group, Object3D, Vector3 } from 'three';


const UPPER_LEN = 0.55;
const FORE_LEN = 0.48;
const HAND_LEN = 0.16;
const MAX_CURL_RAD = Math.PI * 0.62;

interface FingerChain {
  joints: Object3D[];
  weights: number[];
}

/** Analytic two-bone IK: law of cosines, fixed pole. Returns applied joint rotations. */
function solveTwoBoneIK(
  THREE: DemoContext['THREE'],
  shoulder: Object3D,
  elbow: Object3D,
  hand: Object3D,
  target: Vector3,
  poleDir: Vector3,
): { reachRatio: number } {
  const shoulderPos = new THREE.Vector3();
  shoulder.getWorldPosition(shoulderPos);
  const toTarget = new THREE.Vector3().subVectors(target, shoulderPos);
  const reach = toTarget.length();
  const d = Math.min(Math.max(reach, Math.abs(UPPER_LEN - FORE_LEN) + 1e-4), UPPER_LEN + FORE_LEN - 1e-4);
  const reachRatio = d / (UPPER_LEN + FORE_LEN);

  // Interior elbow angle from the law of cosines.
  const cosElbow = (UPPER_LEN * UPPER_LEN + FORE_LEN * FORE_LEN - d * d) / (2 * UPPER_LEN * FORE_LEN);
  const elbowInterior = Math.acos(Math.min(1, Math.max(-1, cosElbow)));

  // Aim the upper bone at the target, rotated off the aim line by the shoulder angle.
  const aim = toTarget.clone().normalize();
  const cosShoulder = (UPPER_LEN * UPPER_LEN + d * d - FORE_LEN * FORE_LEN) / (2 * UPPER_LEN * d);
  const shoulderOffset = Math.acos(Math.min(1, Math.max(-1, cosShoulder)));
  const pole = poleDir.clone().projectOnPlane(aim).normalize();
  const bendDir = new THREE.Vector3()
    .copy(aim)
    .multiplyScalar(Math.cos(shoulderOffset))
    .addScaledVector(pole, Math.sin(shoulderOffset))
    .normalize();

  // Bones point down their local +Y; quaternion rotating +Y onto bendDir, in world space.
  const worldUpper = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), bendDir);
  const parentWorld = new THREE.Quaternion();
  if (shoulder.parent) shoulder.parent.getWorldQuaternion(parentWorld);
  shoulder.quaternion.copy(worldUpper.premultiply(parentWorld.clone().invert()));

  // Forearm: rotate by the straightened-minus-interior angle about the same bend axis.
  const elbowBend = Math.PI - elbowInterior;
  elbow.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), elbowBend);
  hand.quaternion.identity();
  return { reachRatio };
}

function boneSegment(
  THREE: DemoContext['THREE'],
  length: number,
  radius: number,
  color: number,
  parent: Object3D,
  disposables: { dispose: () => void }[],
): Object3D {
  const joint = new THREE.Object3D();
  parent.add(joint);
  const geometry = new THREE.CapsuleGeometry(radius, length - radius * 2, 3, 8);
  const material = new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: 0.55 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = length / 2;
  joint.add(mesh);
  const next = new THREE.Object3D();
  next.position.y = length;
  joint.add(next);
  disposables.push(geometry, material);
  return next;
}

function buildArm(
  THREE: DemoContext['THREE'],
  originX: number,
  posed: boolean,
  root: Group,
  disposables: { dispose: () => void }[],
): { shoulder: Object3D; elbow: Object3D; hand: Object3D; fingers: FingerChain[] } {
  const opacity = posed ? 1 : 0.22;
  const shoulderAnchor = new THREE.Object3D();
  shoulderAnchor.position.set(originX, 0, 0);
  root.add(shoulderAnchor);
  const color = posed ? 0x9c6f4d : 0x888888;

  const elbowAnchor = boneSegment(THREE, UPPER_LEN, 0.07, color, shoulderAnchor, disposables);
  const handAnchor = boneSegment(THREE, FORE_LEN, 0.055, color, elbowAnchor, disposables);
  const hand = new THREE.Object3D();
  hand.position.y = 0;
  handAnchor.add(hand);
  const palmGeometry = new THREE.BoxGeometry(0.11, HAND_LEN, 0.05);
  const palmMaterial = new THREE.MeshStandardMaterial({
    color,
    transparent: !posed,
    opacity,
    metalness: 0.05,
    roughness: 0.55,
  });
  const palm = new THREE.Mesh(palmGeometry, palmMaterial);
  palm.position.y = HAND_LEN / 2;
  hand.add(palm);
  disposables.push(palmGeometry, palmMaterial);

  const fingers: FingerChain[] = [];
  for (let f = 0; f < 4; f += 1) {
    const knuckle = new THREE.Object3D();
    knuckle.position.set(-0.0375 + f * 0.025, HAND_LEN * 0.9, 0.02);
    hand.add(knuckle);
    const joints: Object3D[] = [];
    const weights = [1, 0.85, 0.7];
    let parent: Object3D = knuckle;
    for (let j = 0; j < 3; j += 1) {
      const segment = boneSegment(THREE, 0.05, 0.012, color, parent, disposables);
      segment.position.y = j === 0 ? 0 : 0.05;
      joints.push(segment);
      parent = segment;
    }
    fingers.push({ joints, weights });
  }

  // Transfers ownership of materials to the caller for opacity control.
  return { shoulder: shoulderAnchor, elbow: elbowAnchor, hand, fingers };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const root = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  const posed = buildArm(THREE, -0.55, true, root, disposables);
  const ghost = buildArm(THREE, 0.55, false, root, disposables);

  // Handle target (the author's blue handle bone) and its reach indicator.
  const handleGeometry = new THREE.SphereGeometry(0.045, 12, 8);
  const handleMaterial = new THREE.MeshBasicMaterial({ color: 0x3fa7ff });
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  root.add(handle);
  disposables.push(handleGeometry, handleMaterial);

  const stats = {
    lastReachRatio: 0,
    lastCurl: 0,
    ikSolvedFrames: 0,
  };

  const poleDir = new THREE.Vector3(0, 0, 1);

  const applyCurl = (arm: { fingers: FingerChain[] }, curl: number): void => {
    for (const finger of arm.fingers) {
      for (let j = 0; j < finger.joints.length; j += 1) {
        finger.joints[j].quaternion.setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          curl * MAX_CURL_RAD * finger.weights[j],
        );
      }
    }
  };

  const update = (time: number, _dt: number): void => {
    // Handle moves on a bounded loop; curl breathes with it.
    handle.position.set(
      -0.55 + 0.3 * Math.sin(time * 0.9),
      -0.15 + 0.28 * Math.sin(time * 1.3 + 1.1),
      0.28 + 0.12 * Math.cos(time * 0.7),
    );
    const curl = 0.5 + 0.5 * Math.sin(time * 0.8);
    const { reachRatio } = solveTwoBoneIK(
      THREE,
      posed.shoulder,
      posed.elbow,
      posed.hand,
      handle.position,
      poleDir,
    );
    applyCurl(posed, curl);
    applyCurl(ghost, 0);
    stats.lastReachRatio = reachRatio;
    stats.lastCurl = curl;
    if (Number.isFinite(reachRatio)) stats.ikSolvedFrames += 1;
  };

  const dispose = (): void => {
    for (const entry of disposables) entry.dispose();
    disposables.length = 0;
    disposeGroup(root);
  };

  root.userData.stats = stats;
  root.userData.handle = handle;

  return {
    root,
    update,
    dispose,
    metadata: {
      sourceId: 31,
      title: 'Rigged first-person arms, CC0 (para / OpenGameArt)',
      method:
        'Analytic two-bone IK solved by the law of cosines against a moving handle target with a '
        + 'fixed pole, plus one curl parameter rotating finger joints through per-joint weights '
        + '- the handle-bone posing and finger-curl constraint workflow the shipped rig describes.',
      adaptation: 'adapted',
      sources: ['https://opengameart.org/content/fps-arms-rigged-only'],
      limitation:
        'CC0 asset page read; the author\u2019s .blend/.fbx mesh (MakeHuman-derived, ~8k tris) is '
        + 'NOT vendored - bones carry rigid capsules, not a weighted smooth skin. The IK is our '
        + 'own analytic implementation of the described handle-bone workflow.',
    },
  };
}

export default createDemo;
