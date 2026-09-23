import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PRESENTATION_OBSTRUCTION_AABB_VOLUME_RATIO_CAP,
  collectPresentationObstructionBoxes,
  presentationObstructionVolumeRatio,
} from './presentation-obstruction';
import { NUKETOWN2_HOUSE_STAIR, NUKETOWN2_STAIRWELL } from './nuketown2-arena';

/**
 * HF-536. The owner's sentence was "the gun still lifts up and looks bad and
 * hard to use on stairs", and the cause was this collector handing the
 * viewmodel fold the AXIS-ALIGNED bounding box of a rotated stair slab. These
 * pin the shape of the rule so it cannot be relaxed back into the defect.
 */
describe('presentation obstruction boxes', () => {
  const meshWithRotation = (size: [number, number, number], rotationX: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial());
    mesh.rotation.set(rotationX, 0, 0);
    mesh.updateMatrixWorld(true);
    return mesh;
  };

  it('keeps a square prop: its AABB is exactly its own volume', () => {
    const root = new THREE.Group();
    root.add(meshWithRotation([0.4, 2.4, 0.4], 0));
    expect(collectPresentationObstructionBoxes([root])).toHaveLength(1);
  });

  it('keeps a prop leaning a few degrees', () => {
    const root = new THREE.Group();
    root.add(meshWithRotation([0.4, 2.4, 0.4], 0.05));
    expect(collectPresentationObstructionBoxes([root])).toHaveLength(1);
  });

  it('rejects a stair-pitched slab, whose AABB fills the stairwell it leaves free', () => {
    const rise = NUKETOWN2_STAIRWELL.rampRise;
    const run = NUKETOWN2_STAIRWELL.rampRun;
    const length = Math.hypot(rise, run);
    const slab = meshWithRotation(
      [NUKETOWN2_HOUSE_STAIR.width, NUKETOWN2_STAIRWELL.rampThickness, length],
      -NUKETOWN2_STAIRWELL.rampAngleRadians,
    );
    const root = new THREE.Group();
    root.add(slab);
    expect(collectPresentationObstructionBoxes([root])).toHaveLength(0);
  });

  it('the rejected stair slab claims an order of magnitude more volume than it has', () => {
    const rise = NUKETOWN2_STAIRWELL.rampRise;
    const run = NUKETOWN2_STAIRWELL.rampRun;
    const length = Math.hypot(rise, run);
    const local = new THREE.Vector3(NUKETOWN2_HOUSE_STAIR.width, NUKETOWN2_STAIRWELL.rampThickness, length);
    const scale = new THREE.Vector3(1, 1, 1);
    const angle = NUKETOWN2_STAIRWELL.rampAngleRadians;
    const aabb = new THREE.Vector3(
      NUKETOWN2_HOUSE_STAIR.width,
      Math.abs(length * Math.sin(angle)) + Math.abs(NUKETOWN2_STAIRWELL.rampThickness * Math.cos(angle)),
      Math.abs(length * Math.cos(angle)) + Math.abs(NUKETOWN2_STAIRWELL.rampThickness * Math.sin(angle)),
    );
    const ratio = presentationObstructionVolumeRatio(local, scale, aabb);
    expect(ratio).toBeGreaterThan(10);
    expect(ratio).toBeGreaterThan(PRESENTATION_OBSTRUCTION_AABB_VOLUME_RATIO_CAP);
  });

  it('degenerate geometry is judged by the thickness filter, never by a divide by zero', () => {
    expect(presentationObstructionVolumeRatio(
      new THREE.Vector3(1, 0, 1),
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(1, 1, 1),
    )).toBe(1);
  });
});
