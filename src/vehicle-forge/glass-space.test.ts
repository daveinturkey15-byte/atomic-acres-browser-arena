import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { createForgeGlassMaterial } from './materials';

function containsNode(root: unknown, target: unknown, seen = new Set<object>()): boolean {
  if (root === target) return true;
  if (!root || typeof root !== 'object' || seen.has(root)) return false;
  seen.add(root);
  if (Array.isArray(root)) return root.some(value => containsNode(value, target, seen));
  if ((root as { isNode?: boolean }).isNode !== true) return false;
  return Object.values(root).some(value => containsNode(value, target, seen));
}

describe('vehicle glazing coordinate-space contract', () => {
  it('uses view-space normal and view direction in the actual opacity graph', () => {
    const material = createForgeGlassMaterial('space-proof');
    expect(containsNode(material.opacityNode, TSL.normalView)).toBe(true);
    expect(containsNode(material.opacityNode, TSL.positionViewDirection)).toBe(true);
    expect(containsNode(material.opacityNode, TSL.normalWorld)).toBe(false);
  });

  it('preserves the existing dielectric, tint and render-state choices', () => {
    const material = createForgeGlassMaterial('preserved-proof', 0x243036);
    expect(material.metalness).toBe(0);
    expect(material.roughness).toBe(0.06);
    expect(material.clearcoat).toBe(1);
    expect(material.clearcoatRoughness).toBe(0.04);
    expect(material.ior).toBe(1.52);
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('shows why matching spaces preserves physical angle under a camera rotation', () => {
    const normal = new THREE.Vector3(0, 0, 1);
    const towardCamera = new THREE.Vector3(0.6, 0, 0.8);
    const cameraRotation = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    const viewNormal = normal.clone().transformDirection(cameraRotation);
    const viewDirection = towardCamera.clone().transformDirection(cameraRotation);
    expect(viewNormal.dot(viewDirection)).toBeCloseTo(normal.dot(towardCamera), 12);
    expect(Math.abs(normal.dot(viewDirection) - normal.dot(towardCamera))).toBeGreaterThan(0.5);
  });
});
