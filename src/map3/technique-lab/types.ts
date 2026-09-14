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

/**
 * Optional control-vs-technique legend for paired demos. Only demo-provided
 * metadata may name the sides; the host never invents left/right meanings.
 */
export interface DemoComparison {
  control: string;
  technique: string;
  /** Which side the control sits on in the demo's default view. */
  controlPosition?: 'left' | 'right';
}

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
  /** Optional paired-scene legend; absent means the host renders none. */
  comparison?: DemoComparison;
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
  comparison?: DemoComparison;
}

/** Shape of a dynamically imported `./demos/group-N/index.ts` module. */
export interface GroupModule {
  manifest?: unknown;
  /**
   * Optional group-honesty flag (shipped by group B): stable source IDs whose
   * primary source was recovered and read in the group's lane but which still
   * carries no honest demo. The host surfaces these rows; it never invents
   * content for them.
   */
  notDeliveredSourceIds?: readonly number[];
}

/**
 * Structural surface of the renderer the host actually drives. The production
 * host passes a real `THREE.WebGPURenderer`; focused CPU tests may pass a stub
 * with the same surface so mount/switch/teardown transitions are exercised
 * without a GPU. This is a test seam only — the default path never changes.
 */
export interface LabRendererLike {
  init(): Promise<unknown>;
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: THREE.Scene, camera: THREE.Camera): unknown;
  dispose(): void;
  backend?: unknown;
  info?: { render?: { drawCalls?: number; calls?: number; triangles?: number } };
}

/** Optional host wiring overrides. Defaults keep the production behaviour. */
export interface LabHostOptions {
  /**
   * Demo-group module loaders. Defaults to the host's vite glob over
   * demos/group-star/index.ts modules; tests supply fake loaders so manifest
   * validation, mounting and teardown run against actual code.
   */
  groupLoaders?: Record<string, () => Promise<GroupModule>>;
  /** Renderer factory. Defaults to a real WebGPURenderer on the host canvas. */
  createRenderer?: (canvas: HTMLCanvasElement) => LabRendererLike;
  /**
   * Research-record loaders for the group SOURCE_RESEARCH.json files under
   * docs/technique-lab (one per group-N directory). Defaults to the host's
   * vite glob (empty in trees without group research); tests inject bounded
   * real-shape fixtures. Absent records keep the research stages open.
   */
  researchLoaders?: Record<string, () => Promise<unknown>>;
  /**
   * Sources-lane catalog loader (public/assets/skills-lab/source-catalog.json).
   * Defaults to a runtime fetch that tolerates 404; tests inject fixtures.
   */
  sourceCatalogLoader?: () => Promise<unknown>;
  /**
   * Per-lane Blender catalog loaders keyed by glob path. Defaults to the
   * host's vite glob over public/assets/world-studio/blender/star/catalog.json.
   */
  blenderCatalogLoaders?: Record<string, () => Promise<unknown>>;
  /** GLB loader seam for the Blender gallery; defaults to the installed GLTFLoader. */
  modelLoader?: { loadAsync(url: string): Promise<{ scene: THREE.Object3D }> };
}
