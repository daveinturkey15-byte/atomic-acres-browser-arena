/**
 * src/map3/technique-lab/types.ts — shared contracts for the Technique Lab HOST.
 *
 * The host owns the gallery/stage/sidebar UI, the single renderer and the frame
 * loop. Demo groups (arriving later under `./demos/group-N/index.ts`) only supply
 * manifest entries plus an optional demo factory each. This file is the frozen
 * factory contract both sides program against.
 */

import type * as THREE from 'three';

/** How a demo relates to its public source. Set only by the demo author. */
export type Adaptation = 'exact' | 'adapted' | 'blocked';

/** Context handed to every demo factory. Fixed deterministic seed. */
export interface DemoContext {
  THREE: typeof import('three');
  seed: number;
}

/** Live demo instance owned by the host until selection change or dispose. */
export interface DemoInstance {
  root: THREE.Group;
  update?: (time: number, dt: number) => void;
  dispose: () => void;
  metadata: DemoMetadata;
}

/** Provenance block every demo must carry (and the host must display). */
export interface DemoMetadata {
  sourceId: number;
  title: string;
  method: string;
  adaptation: Adaptation;
  sources: string[];
  limitation?: string;
}

/** Factory demos expose. Synchronous; the host guards throws. */
export type DemoFactory = (context: DemoContext) => DemoInstance;

/**
 * One row of a group manifest. `createDemo` is optional: a group may register
 * provenance (link saved) before any implementation exists. A missing factory
 * must render as Missing/not delivered, never as a placeholder scene.
 */
export interface DemoManifestEntry {
  sourceId: number;
  title: string;
  method: string;
  adaptation: Adaptation;
  sources: string[];
  limitation?: string;
  createDemo?: DemoFactory;
}

/** Shape of a dynamically imported `./demos/group-N/index.ts` module. */
export interface GroupModule {
  manifest?: unknown;
}
