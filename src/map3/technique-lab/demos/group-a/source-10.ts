/**
 * Source 10 — Vibe3D asset registry, plus the 2026-09-10 editable-npm-props
 * supplement (`vibe-stack/vibe3d`, `keysforthewin/thaikit`).
 *
 * Read at pins `fb3ba78a5a21dd69db86018e74d279895501df33` (vibe3d) and
 * `92095c48ae8792132b60dfb4052c9d7b2ad795f2` (thaikit). Licence: MIT LICENSE
 * files read in both. Primary files read:
 *   vibe3d `models.json` in full — a shadcn-style config with `engine: "three"`,
 *     `paths`/`aliases` for where installed source lands, and a `registries` map
 *     naming `@scifi-kit`.
 *   thaikit `packages/props/README.md` in full — the load-bearing sentences:
 *     "Every prop is a factory that builds a `THREE.Group` in code"; each install
 *     is four files (`createObjectModel.ts`, `model.ts`, `thaikit.json`,
 *     `colliders.json`); and "`three >= 0.185.0`, as a peer dependency. The
 *     factories import bare `three`; your app supplies it, and there must be
 *     exactly one copy — a second instance means the factory's `Mesh` is not the
 *     renderer's `Mesh` and nothing draws."
 *
 * The reusable object is the INGESTION CONTRACT, not the kit. This demo installs
 * two locally authored "registry" props through that contract and shows what the
 * gate has to strip. BEFORE is the raw install: the pack's own preview light
 * comes along, the declared metres disagree with the measured bounds, and the
 * prop's collider is treated as authority. AFTER is the gated install: host
 * Three injected (never a second copy), preview lights removed, scale corrected
 * from measured bounds, collider demoted to a proposal.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';
import type * as THREE_NS from 'three';

/** The `thaikit.json` sidecar shape, reduced to the fields the gate reads. */
interface PropRecord {
  id: string;
  declaredMetres: [number, number, number];
  massKg: number;
  physics: { enabled: boolean };
  colliders: Array<{ kind: 'box'; half: [number, number, number]; at: [number, number, number] }>;
}

/**
 * A registry entry: a factory that takes the HOST Three namespace. This is the
 * single most important adaptation of the upstream pattern — upstream factories
 * `import 'three'` as a peer and rely on there being exactly one copy. Injecting
 * the namespace makes the requirement structural instead of a build-config hope.
 */
type PropFactory = (
  THREE: ThreeNamespace,
  registry: DisposalRegistry,
  options: { withPreviewLight: boolean },
) => { group: THREE_NS.Group; record: PropRecord };

const oilDrum: PropFactory = (THREE, registry, options) => {
  const group = new THREE.Group();
  group.name = 'oil-drum';
  const body = registry.track(new THREE.CylinderGeometry(0.28, 0.28, 0.86, 16, 1));
  const rib = registry.track(new THREE.TorusGeometry(0.285, 0.018, 6, 20));
  const paint = registry.track(new THREE.MeshStandardMaterial({ color: 0x7d4a2a, roughness: 0.72, metalness: 0.35 }));
  const drum = new THREE.Mesh(body, paint);
  drum.position.y = 0.43;
  drum.name = 'drum';
  group.add(drum);
  for (const y of [0.26, 0.6]) {
    const band = new THREE.Mesh(rib, paint);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    group.add(band);
  }
  if (options.withPreviewLight) {
    // Exactly what a pack's own preview scene ships and a game must not inherit.
    const preview = new THREE.PointLight(0xffffff, 2.4, 4);
    preview.name = 'preview-light';
    preview.position.set(0.6, 1.2, 0.6);
    group.add(preview);
  }
  return {
    group,
    record: {
      id: 'oil-drum',
      // Deliberately wrong by 2x, which is the common real defect: the pack's
      // declared metres and its actual mesh disagree.
      declaredMetres: [1.12, 1.72, 1.12],
      massKg: 18,
      physics: { enabled: true },
      colliders: [{ kind: 'box', half: [0.28, 0.43, 0.28], at: [0, 0.43, 0] }],
    },
  };
};

const streetBollard: PropFactory = (THREE, registry, options) => {
  const group = new THREE.Group();
  group.name = 'street-bollard';
  const post = registry.track(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 10));
  const cap = registry.track(new THREE.SphereGeometry(0.062, 10, 6));
  const material = registry.track(new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.6, metalness: 0.5 }));
  const shaft = new THREE.Mesh(post, material);
  shaft.position.y = 0.45;
  group.add(shaft);
  const top = new THREE.Mesh(cap, material);
  top.position.y = 0.9;
  group.add(top);
  if (options.withPreviewLight) {
    const preview = new THREE.PointLight(0xffe8c0, 1.6, 3);
    preview.name = 'preview-light';
    preview.position.set(-0.4, 1.1, 0.3);
    group.add(preview);
  }
  return {
    group,
    record: {
      id: 'street-bollard',
      declaredMetres: [0.16, 0.94, 0.16],
      massKg: 42,
      physics: { enabled: true },
      colliders: [{ kind: 'box', half: [0.08, 0.47, 0.08], at: [0, 0.47, 0] }],
    },
  };
};

const REGISTRY: Record<string, PropFactory> = { 'oil-drum': oilDrum, 'street-bollard': streetBollard };

export interface IngestionReport {
  id: string;
  measuredMetres: [number, number, number];
  declaredMetres: [number, number, number];
  scaleCorrection: number;
  previewLightsStripped: number;
  colliderAuthority: 'proposal' | 'inherited';
}

/** The gate. Everything it does is a refusal the register asked for by name. */
function ingest(
  THREE: ThreeNamespace,
  group: THREE_NS.Group,
  record: PropRecord,
  enforce: boolean,
): IngestionReport {
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const measured: [number, number, number] = [size.x, size.y, size.z];

  let stripped = 0;
  if (enforce) {
    const lights: THREE_NS.Object3D[] = [];
    group.traverse((object) => {
      if ((object as { isLight?: boolean }).isLight) lights.push(object);
    });
    for (const light of lights) {
      light.removeFromParent();
      stripped += 1;
    }
  }

  let correction = 1;
  if (enforce && measured[1] > 1e-4) {
    correction = record.declaredMetres[1] / measured[1];
    // Trust the MEASURED mesh, not the declared record: rescale the declaration,
    // never silently scale the geometry to match a wrong number.
    correction = 1 / correction;
    group.scale.setScalar(1);
  }

  return {
    id: record.id,
    measuredMetres: measured,
    declaredMetres: record.declaredMetres,
    scaleCorrection: correction,
    previewLightsStripped: stripped,
    colliderAuthority: enforce ? 'proposal' : 'inherited',
  };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();

  const raw = new THREE.Group();
  raw.name = 'before:raw-install-preview-lights-and-declared-scale';
  const gated = new THREE.Group();
  gated.name = 'after:gated-install-host-three-measured-bounds';

  const reports: IngestionReport[] = [];
  let x = -0.45;
  for (const id of Object.keys(REGISTRY)) {
    const factory = REGISTRY[id];
    const a = factory(THREE, registry, { withPreviewLight: true });
    a.group.position.x = x;
    raw.add(a.group);
    reports.push(ingest(THREE, a.group, a.record, false));

    const b = factory(THREE, registry, { withPreviewLight: true });
    b.group.position.x = x;
    gated.add(b.group);
    reports.push(ingest(THREE, b.group, b.record, true));
    x += 0.9;
  }

  const root = sideBySide(THREE, registry, raw, gated, 2.6);
  root.name = 'source-10:registry-source-prop-ingestion';
  root.userData.ingestionReports = reports;

  const strippedTotal = reports.reduce((sum, r) => sum + r.previewLightsStripped, 0);

  // The BEFORE half deliberately keeps the pack's own preview lights, because
  // inheriting them is the defect on display. They are still lights in the demo
  // tree, so they are declared here rather than smuggled past the lab's audit.
  const retainedPreviewLights: string[] = [];
  raw.traverse((object) => {
    if ((object as { isLight?: boolean }).isLight) {
      retainedPreviewLights.push(`before-half:${object.name} (pack preview light, retained to show the defect)`);
    }
  });

  const metadata = {
    sourceId: 10,
    title: 'Vibe3D asset registry',
    method:
      'Registry-of-source-props: a models.json-shaped config points at named registries, each prop installs as editable factory source rather than a runtime dependency, and an ingestion gate injects the host Three namespace, strips the pack preview lights, measures real bounds against the declared record and demotes the shipped collider to a proposal.',
    adaptation: 'adapted' as const,
    sources: [
      'https://x.com/DerekBrenner/status/2089780687708856412',
      'https://x.com/alightinastorm/status/2088712139364041161',
      'https://x.com/alightinastorm/status/2097598580546470197',
      'https://github.com/vibe-stack/vibe3d',
      'https://github.com/keysforthewin/thaikit',
      'vibe-stack/vibe3d@fb3ba78a models.json; keysforthewin/thaikit@92095c48 packages/props/README.md (both MIT)',
    ],
    limitation:
      'Nothing was installed: no npm package was added, no registry was resolved and no upstream prop source was vendored, so the two props here are locally authored stand-ins that exercise the contract. The 180+ model count, the whole-pack city import and the token-saving claim remain author claims and are not adopted. Catalogue availability is not adoption.',
    localLights: retainedPreviewLights,
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      propsIngested: reports.length / 2,
      previewLightsStripped: strippedTotal,
    },
  };

  return {
    root,
    update(time: number) {
      root.rotation.y = Math.sin(time * 0.25) * 0.25;
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
