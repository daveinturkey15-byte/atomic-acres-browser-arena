/**
 * Source 11 — Scaffold in code, generate the hero asset.
 *
 * Primary source read 2026-09-12: the post, served by x.com. Author text
 * verbatim from the page's own og:description:
 *   "I reverse engineered how to make 3d games like this / You first scaffold a
 *    project in @threejs. this will create the environment, game actions, etc. /
 *    then use AI to generate a 3d .glb file of a hero object like a person, a
 *    car, etc. / you mix them together and voila.. you got it."
 *
 * No repository, no licence, nothing to pin. The register's decision keeps the
 * separation of concerns and carries the replies' caveat: the hard part is
 * harmonising the asset with the world, not producing a GLB. That caveat is the
 * demo, because "you mix them together and voila" is precisely the step that
 * does not happen by itself.
 *
 * BEFORE: the hero dropped into the scaffolded world as generated — authored in
 * centimetres, pivot at its centroid, facing +X while the world's verb axis is
 * -Z. It floats, it is the wrong size, and it faces the wrong way.
 * AFTER: the same object through a harmonisation pass — measure bounds, scale to
 * the declared character height, re-seat the pivot on the contact plane, rotate
 * facing onto the verb axis. The action socket on the world then lines up.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  makeRng,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';
import type * as THREE_NS from 'three';

/** Target contract the scaffolded world declares before any asset exists. */
const WORLD_CONTRACT = {
  characterHeightMetres: 0.62,
  contactPlaneY: 0,
  verbAxis: new Float32Array([0, 0, -1]),
} as const;

/** The "generated hero": deliberately mis-authored in the three usual ways. */
function buildHero(THREE: ThreeNamespace, registry: DisposalRegistry): THREE_NS.Group {
  const hero = new THREE.Group();
  hero.name = 'hero-asset';
  const bodyGeometry = registry.track(new THREE.BoxGeometry(18, 44, 12));
  const headGeometry = registry.track(new THREE.SphereGeometry(9, 10, 8));
  const noseGeometry = registry.track(new THREE.ConeGeometry(4, 10, 8));
  const material = registry.track(new THREE.MeshStandardMaterial({ color: 0xb46a3f, roughness: 0.6 }));

  const body = new THREE.Mesh(bodyGeometry, material);
  hero.add(body);
  const head = new THREE.Mesh(headGeometry, material);
  head.position.y = 30;
  hero.add(head);
  // The nose points +X: the asset's forward, which is not the world's forward.
  const nose = new THREE.Mesh(noseGeometry, material);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(12, 30, 0);
  nose.name = 'hero-forward-marker';
  hero.add(nose);
  return hero;
}

function buildWorld(THREE: ThreeNamespace, registry: DisposalRegistry, seed: number): THREE_NS.Group {
  const rng = makeRng(seed);
  const world = new THREE.Group();
  world.name = 'code-generated-world';

  const groundGeometry = registry.track(new THREE.PlaneGeometry(2, 2, 1, 1));
  groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = registry.track(new THREE.MeshStandardMaterial({ color: 0x53614a, roughness: 0.95 }));
  world.add(new THREE.Mesh(groundGeometry, groundMaterial));

  // The "verbs": a marked interaction volume the hero must face and reach.
  const markGeometry = registry.track(new THREE.RingGeometry(0.16, 0.2, 20));
  const markMaterial = registry.track(
    new THREE.MeshBasicMaterial({ color: 0xe0c15a, side: THREE.DoubleSide, toneMapped: false }),
  );
  const mark = new THREE.Mesh(markGeometry, markMaterial);
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(0, 0.004, -0.55);
  mark.name = 'verb:interact-here';
  world.add(mark);

  const propGeometry = registry.track(new THREE.BoxGeometry(0.12, 0.2, 0.12));
  const propMaterial = registry.track(new THREE.MeshStandardMaterial({ color: 0x6d5b46, roughness: 0.9 }));
  for (let i = 0; i < 5; i += 1) {
    const prop = new THREE.Mesh(propGeometry, propMaterial);
    prop.position.set((rng() - 0.5) * 1.6, 0.1, (rng() - 0.5) * 1.6);
    prop.rotation.y = rng() * Math.PI;
    world.add(prop);
  }
  return world;
}

export interface HarmonisationReport {
  measuredHeight: number;
  appliedScale: number;
  pivotDropMetres: number;
  facingCorrectionRadians: number;
}

/** The step the post skips. Everything here is measured, nothing is guessed. */
function harmonise(THREE: ThreeNamespace, hero: THREE_NS.Object3D): HarmonisationReport {
  const box = new THREE.Box3().setFromObject(hero);
  const size = new THREE.Vector3();
  box.getSize(size);
  const measuredHeight = size.y;
  const scale = WORLD_CONTRACT.characterHeightMetres / Math.max(1e-6, measuredHeight);
  hero.scale.setScalar(scale);

  // Re-seat the pivot: after scaling, the lowest point must sit on the plane.
  hero.updateMatrixWorld(true);
  const scaled = new THREE.Box3().setFromObject(hero);
  const drop = scaled.min.y - WORLD_CONTRACT.contactPlaneY;
  hero.position.y -= drop;

  // Align the asset's +X forward onto the world's -Z verb axis.
  const facing = -Math.PI / 2;
  hero.rotation.y = facing;

  return {
    measuredHeight,
    appliedScale: scale,
    pivotDropMetres: drop,
    facingCorrectionRadians: facing,
  };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();

  const naiveWorld = buildWorld(THREE, registry, context.seed);
  const fixedWorld = buildWorld(THREE, registry, context.seed);
  naiveWorld.name = 'before:hero-dropped-in-as-generated';
  fixedWorld.name = 'after:hero-harmonised-to-the-world-contract';

  const naiveHero = buildHero(THREE, registry);
  naiveWorld.add(naiveHero);

  const fixedHero = buildHero(THREE, registry);
  fixedWorld.add(fixedHero);
  const report = harmonise(THREE, fixedHero);

  const root = sideBySide(THREE, registry, naiveWorld, fixedWorld, 3.0);
  root.name = 'source-11:scaffold-world-generate-hero';
  root.userData.harmonisation = report;

  const metadata = {
    sourceId: 11,
    title: 'Scaffold in code, generate the hero asset',
    method:
      'Code-generate the world and its verbs; generate only the hero prop. Then do the step the post omits: measure the delivered bounds, scale to the declared character height, re-seat the pivot on the contact plane, and rotate the asset forward axis onto the world verb axis.',
    adaptation: 'adapted' as const,
    sources: [
      'https://x.com/filiksyos/status/2089297181026951425',
      'post text read 2026-09-12 from the page served by x.com (og:description)',
    ],
    limitation:
      'Opinion post with no repository and no licence; nothing upstream to pin or verify. No AI generator was invoked and no GLB was produced or loaded - the hero here is locally authored with deliberately wrong units, pivot and facing so the harmonisation pass has real defects to fix. Producing the asset is not the hard part, and this demo does not claim to have solved animation, gameplay or difficulty harmonisation.',
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      appliedScale: Number(report.appliedScale.toFixed(5)),
      pivotDropMetres: Number(report.pivotDropMetres.toFixed(5)),
    },
  };

  return {
    root,
    update(time: number) {
      // Walk both heroes toward the verb marker. Only the harmonised one arrives
      // facing it and standing on the ground.
      const t = (Math.sin(time * 0.6) + 1) / 2;
      naiveHero.position.z = -t * 0.5;
      fixedHero.position.z = -t * 0.5;
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
