import { describe, expect, it } from 'vitest';
import { definition as nuketown2VisualDefinition } from './rendering/arenas/nuketown2';

describe('nuketown2 review-camera roster', () => {
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
