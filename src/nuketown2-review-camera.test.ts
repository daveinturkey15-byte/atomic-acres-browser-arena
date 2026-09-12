import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildNuketown2, NUKETOWN2_SECTION } from './nuketown2-arena';
import { isBlocked } from './collision';
import { NUKETOWN2_CENTRAL_TRUCK as truck, NUKETOWN2_GARAGE_SPAN as garage, NUKETOWN2_HOUSE_FRONT_Z, nuketown2HandedX as hx } from './nuketown2-layout';
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

  it.each(['nuketown2-garage-exterior-close', 'nuketown2-trailer-rear-frame'])(
    '%s frames its full subject from a clear eye with the intended first surface', (id) => {
      const station = nuketown2VisualDefinition.reviewCameras.find((camera) => camera.id === id)!;
      expect(station).toBeDefined();
      const eye = new THREE.Vector3(...station.position);
      const target = new THREE.Vector3(...station.target);
      const garageZ = NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_SECTION.garageSetback;
      const rearX = hx(truck.x - truck.boxLength / 2 - .006);
      const isGarage = id === 'nuketown2-garage-exterior-close';
      const corners = isGarage
        ? [garage.x0, garage.x1].flatMap(x => [0, 3.6].map(y => new THREE.Vector3(hx(x), y, garageZ)))
        : [.645, 2.755].flatMap(y => [-.92, .92].map(z => new THREE.Vector3(rearX, y, truck.z + z)));
      const probe = isGarage
        ? new THREE.Vector3(hx((garage.x0 + garage.x1) / 2), 2.9, garageZ)
        : new THREE.Vector3(rearX, 2.72, truck.z);
      const camera = new THREE.PerspectiveCamera(70, 1280 / 720, .05, 190);
      camera.position.copy(eye); camera.lookAt(target); camera.updateMatrixWorld(true);
      for (const corner of corners) {
        const ndc = corner.project(camera);
        expect(Math.abs(ndc.x), 'subject horizontal extent').toBeLessThanOrEqual(1);
        expect(Math.abs(ndc.y), 'subject vertical extent').toBeLessThanOrEqual(1);
        expect(ndc.z).toBeGreaterThan(-1); expect(ndc.z).toBeLessThan(1);
      }
      const map = buildNuketown2(new THREE.Scene()); map.root.updateMatrixWorld(true);
      expect(isBlocked(eye, map.colliders), 'eye clear of movement authority').toBe(false);
      const first = new THREE.Raycaster(eye, probe.clone().sub(eye).normalize(), 0, eye.distanceTo(probe) + .15)
        .intersectObjects(map.raycastMeshes, true)[0];
      expect(first?.object.name).toBe(isGarage
        ? 'nuketown2 north garage door head' : 'nuketown2 street-vehicle truck rear-frame rail 3');
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
