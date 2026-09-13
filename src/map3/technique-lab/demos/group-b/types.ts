/**
 * Shared types for technique-lab group B (stable source IDs 18-34).
 *
 * Every demo in this folder is a *presentation-only* factory: it builds a bounded
 * `THREE.Group`, optionally advances it from an externally-driven clock, and disposes
 * everything it allocated. A demo owns no renderer, no animation loop, no event listener,
 * no global light/fog/camera/tone-mapping state. The host (root's HTML lab) owns all of
 * that and calls `update(time, dt)` itself.
 */

export interface DemoContext {
  /** The host's Three.js module instance. Demos never import `three` for runtime values. */
  THREE: typeof import('three');
  /** Deterministic seed. The same seed must always produce the same scene. */
  seed: number;
}

/** How faithfully the demo reproduces the primary source's method. */
export type Adaptation = 'exact' | 'adapted' | 'blocked';

export interface DemoMetadata {
  /** Stable register row ID. Must equal the manifest entry's `sourceId`. */
  sourceId: number;
  title: string;
  /** The actual named method the scene demonstrates, in our own words. */
  method: string;
  adaptation: Adaptation;
  /** Primary-source URLs this demo was built from. */
  sources: string[];
  /** Precise statement of what this demo does NOT establish. */
  limitation?: string;
  /**
   * Local positioned lights the demo adds, when the technique itself requires them.
   * Empty or absent means the demo adds no light of its own and relies on the host.
   */
  localLights?: string[];
}

export interface Demo {
  root: import('three').Group;
  update?: (time: number, dt: number) => void;
  dispose: () => void;
  metadata: DemoMetadata;
}

export type DemoFactory = (context: DemoContext) => Demo;

/** One row of the group manifest. A blocked row carries no factory. */
export interface ManifestEntry {
  sourceId: number;
  title: string;
  method: string;
  adaptation: Adaptation;
  sources: string[];
  limitation?: string;
  createDemo?: DemoFactory;
}

/**
 * Disposal helper. Three does not dispose recursively, and a leaked geometry or material
 * in a lab that instantiates 17 scenes is a real leak, so every demo routes through this.
 */
export function disposeGroup(root: import('three').Group): void {
  root.traverse((object) => {
    const mesh = object as import('three').Mesh;
    if (mesh.geometry && typeof mesh.geometry.dispose === 'function') {
      mesh.geometry.dispose();
    }
    const material = (mesh as { material?: unknown }).material;
    if (Array.isArray(material)) {
      for (const entry of material) disposeMaterial(entry);
    } else if (material) {
      disposeMaterial(material);
    }
  });
  root.clear();
}

function disposeMaterial(material: unknown): void {
  const record = material as Record<string, unknown> & { dispose?: () => void };
  for (const key of Object.keys(record)) {
    const value = record[key] as { isTexture?: boolean; dispose?: () => void } | null;
    if (value && typeof value === 'object' && value.isTexture && typeof value.dispose === 'function') {
      value.dispose();
    }
  }
  if (typeof record.dispose === 'function') record.dispose();
}
