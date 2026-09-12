/**
 * Technique lab - group B manifest (stable register source IDs 18-34).
 *
 * Every entry keeps its ORIGINAL register ID. Row 21 is a numbered alias of row 19 and is
 * present so that references to 21 resolve; it is not a distinct technique and must never be
 * counted as one. Rows that could not be honestly demonstrated carry `adaptation: 'blocked'`
 * and no factory, with the precise limitation recorded rather than a placeholder scene.
 *
 * Imports are restricted to this group's own modules. Root owns the HTML lab and router.
 */

import type { ManifestEntry } from './types';
import { createDemo as createSource18 } from './source-18';

export type { Adaptation, Demo, DemoContext, DemoFactory, DemoMetadata, ManifestEntry } from './types';

export const manifest: ManifestEntry[] = [
  {
    sourceId: 18,
    title: 'Procedural grass and landscape systems for Three.js',
    method:
      'Instanced quadratic-Bezier tapered blades on a jittered grid with slope/height/density '
      + 'rejection, layered wind, and concentric LOD rings that thin density and simplify blades.',
    adaptation: 'adapted',
    sources: ['https://github.com/CK42BB/procedural-grass-threejs'],
    limitation:
      'CPU rigid-blade wind on MeshStandardMaterial instead of the source GLSL per-vertex bend; '
      + 'emissive stand-in for subsurface scattering; bounded lab blade budget.',
    createDemo: createSource18,
  },
];

export default manifest;
