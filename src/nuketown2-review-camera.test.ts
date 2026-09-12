import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildNuketown2 } from './nuketown2-arena';
import { isBlocked } from './collision';
import { NUKETOWN2_CENTRAL_TRUCK as truck, nuketown2HandedX as hx } from './nuketown2-layout';
import { definition as nuketown2VisualDefinition } from './rendering/arenas/nuketown2';

describe('nuketown2 review-camera roster', () => {
  it('frames the current truck cab from an unobstructed standing position', () => {
    const station = nuketown2VisualDefinition.reviewCameras.find(({ id }) => id === 'nuketown2-truck-cab-near')!;
    const eye = new THREE.Vector3(...station.position);
    const target = new THREE.Vector3(...station.target);
    const centre = new THREE.Vector3(hx(truck.cabX), truck.cabRoofY / 2, truck.z);
    const cab = new THREE.Box3().setFromCenterAndSize(centre, new THREE.Vector3(truck.cabLength, truck.cabRoofY, truck.width));
    expect(cab.containsPoint(target), 'review target remains inside the actual cab').toBe(true);
    expect(cab.distanceToPoint(eye), 'eye remains outside the vehicle').toBeGreaterThan(1);
    expect(eye.distanceTo(target), 'close-up remains a close-up').toBeLessThan(7);
    const map = buildNuketown2(new THREE.Scene());
    map.root.updateMatrixWorld(true);
    expect(isBlocked(eye, map.colliders), 'the reviewer can stand at the eye').toBe(false);
    const hits = new THREE.Raycaster(eye, target.clone().sub(eye).normalize(), 0, eye.distanceTo(target))
      .intersectObjects(map.raycastMeshes, true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.object.name, 'first authoritative surface is the truck, not an intervening car').toMatch(/truck cab/);
  });

  it('keeps every catalog station registered in the authored runtime set', async () => {
    // The catalog is executable QA JavaScript; keep this test's contract typed
    // locally without adding a second hand-maintained roster declaration.
    // @ts-expect-error The .mjs catalog intentionally has no generated .d.ts.
    const { VIEWPOINT_CATALOG } = await import('../scripts/qa/viewpoint-catalog.mjs') as unknown as {
      VIEWPOINT_CATALOG: Readonly<{ nuketown2: readonly string[] }>;
    };
    const catalogStations = VIEWPOINT_CATALOG.nuketown2;
    const authoredCameraIds = new Set(nuketown2VisualDefinition.reviewCameras.map((camera) => camera.id));

    expect(catalogStations).toBeDefined();
    expect(catalogStations.every((cameraId) => authoredCameraIds.has(cameraId))).toBe(true);
    expect([...authoredCameraIds].every((cameraId) => catalogStations.includes(cameraId))).toBe(true);
  });
});
