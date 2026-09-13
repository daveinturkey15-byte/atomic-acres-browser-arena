/**
 * Source 7 — Code-only procedural scene authoring (`StarKnightt/night-street`).
 *
 * Read at pin `333f064778105640588a95d2c2d150780044e7bf`: `docs/TECHNIQUE.md`
 * (58,960 bytes; section index read in full, sections 3.1-3.4 and 5.4 read for
 * method) and `PROMPTS.md`. The post text, from the page x.com served on
 * 2026-09-12: "claude built a city street you can walk in the browser / nothing
 * downloaded. everything generated in code."
 *
 * Licence at that pin: MIT (LICENSE read, 1,080 bytes).
 *
 * Two things in TECHNIQUE.md are worth more than the street itself, and both are
 * what this demo implements:
 *   3.1/3.2 "Start by measuring what the removed rig cost" and "Budget" — the
 *           lighting method is a measured budget, not a taste call.
 *   3.4     "Emissive geometry versus a real light" — the shopfront and the sign
 *           are emissive surfaces; only the lamp earns an actual light object.
 * Its own withdrawn section (`## ~~display = 0.284 * L^0.4545~~ — WITHDRAWN, do
 * not use`) is the reason the numbers below are ours and not quoted from it.
 *
 * BEFORE: the same street cell with every glowing surface given its own real
 * light — the budget failure the document warns about. AFTER: emissive geometry
 * everywhere plus exactly ONE positioned light, at the lamp.
 *
 * This demo creates a local light. It is named in metadata.localLights and it is
 * the technique, not decoration.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  makeDataTexture,
  makeRng,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';
import type * as THREE_NS from 'three';

interface Cell {
  group: THREE_NS.Group;
  lights: THREE_NS.PointLight[];
  emissiveMaterials: THREE_NS.MeshStandardMaterial[];
}

function buildCell(
  THREE: ThreeNamespace,
  registry: DisposalRegistry,
  seed: number,
  realLightPerGlow: boolean,
): Cell {
  const rng = makeRng(seed);
  const group = new THREE.Group();
  const lights: THREE_NS.PointLight[] = [];
  const emissiveMaterials: THREE_NS.MeshStandardMaterial[] = [];

  // Procedural asphalt: value-noise grain plus a lighter wear strip down the
  // camber. Zero external assets is the whole claim of this row.
  const asphalt = makeDataTexture(THREE, registry, 64, (x, y, out) => {
    const grain = ((x * 31 + y * 17 + ((x * y) % 13)) % 23) / 23;
    const wear = Math.exp(-(((x - 32) / 14) ** 2)) * 26;
    const v = 38 + grain * 22 + wear;
    out[0] = Math.round(v);
    out[1] = Math.round(v * 0.98);
    out[2] = Math.round(v * 1.02);
  });
  asphalt.repeat.set(2, 4);

  const roadGeometry = registry.track(new THREE.PlaneGeometry(1.6, 2.4));
  roadGeometry.rotateX(-Math.PI / 2);
  const roadMaterial = registry.track(
    new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.86, metalness: 0.02 }),
  );
  const road = new THREE.Mesh(roadGeometry, roadMaterial);
  road.name = 'road';
  group.add(road);

  const kerbGeometry = registry.track(new THREE.BoxGeometry(0.16, 0.05, 2.4));
  const kerbMaterial = registry.track(new THREE.MeshStandardMaterial({ color: 0x8d8a82, roughness: 0.9 }));
  for (const side of [-1, 1]) {
    const kerb = new THREE.Mesh(kerbGeometry, kerbMaterial);
    kerb.position.set(side * 0.88, 0.025, 0);
    kerb.name = side < 0 ? 'kerb-left' : 'kerb-right';
    group.add(kerb);
  }

  const facadeGeometry = registry.track(new THREE.BoxGeometry(0.5, 1.3, 2.2));
  const facadeMaterial = registry.track(new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.88 }));
  const facade = new THREE.Mesh(facadeGeometry, facadeMaterial);
  facade.position.set(-1.2, 0.65, 0);
  facade.name = 'facade';
  group.add(facade);

  // Shopfront: emissive geometry. TECHNIQUE.md 3.4's point is that this reads as
  // a light source without costing a light.
  const shopGeometry = registry.track(new THREE.PlaneGeometry(0.9, 0.5));
  const shopMaterial = registry.track(
    new THREE.MeshStandardMaterial({
      color: 0x2a2620,
      emissive: new THREE.Color(0xffc98a),
      emissiveIntensity: 1.5,
      roughness: 0.6,
    }),
  );
  emissiveMaterials.push(shopMaterial);
  const shop = new THREE.Mesh(shopGeometry, shopMaterial);
  shop.rotation.y = Math.PI / 2;
  shop.position.set(-0.945, 0.55, 0.2);
  shop.name = 'shopfront-glow';
  group.add(shop);

  // Sign: a second emissive surface, different hue, so the contrast is readable.
  const signGeometry = registry.track(new THREE.PlaneGeometry(0.36, 0.14));
  const signMaterial = registry.track(
    new THREE.MeshStandardMaterial({
      color: 0x10131a,
      emissive: new THREE.Color(0x4fd8ff),
      emissiveIntensity: 2.2,
      roughness: 0.4,
    }),
  );
  emissiveMaterials.push(signMaterial);
  const sign = new THREE.Mesh(signGeometry, signMaterial);
  sign.rotation.y = Math.PI / 2;
  sign.position.set(-0.94, 1.05, -0.5);
  sign.name = 'neon-sign';
  group.add(sign);

  // The lamp: the one glow that earns a real light, because it is the only one
  // that has to put a pool on the road the player walks through.
  const postGeometry = registry.track(new THREE.CylinderGeometry(0.02, 0.025, 1.1, 8));
  const postMaterial = registry.track(new THREE.MeshStandardMaterial({ color: 0x25262a, roughness: 0.7 }));
  const post = new THREE.Mesh(postGeometry, postMaterial);
  post.position.set(0.86, 0.55, 0.6);
  post.name = 'lamp-post';
  group.add(post);

  const headGeometry = registry.track(new THREE.SphereGeometry(0.055, 10, 8));
  const headMaterial = registry.track(
    new THREE.MeshStandardMaterial({
      color: 0x141310,
      emissive: new THREE.Color(0xffd9a0),
      emissiveIntensity: 3.0,
      roughness: 0.3,
    }),
  );
  emissiveMaterials.push(headMaterial);
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.set(0.86, 1.12, 0.6);
  head.name = 'lamp-head';
  group.add(head);

  const lamp = new THREE.PointLight(0xffd2a0, 1.6, 2.6, 2);
  lamp.name = 'local:lamp';
  lamp.position.copy(head.position);
  group.add(lamp);
  lights.push(lamp);

  if (realLightPerGlow) {
    // The failure case: give the shopfront and the sign their own lights too.
    const shopLight = new THREE.PointLight(0xffc98a, 1.2, 2.2, 2);
    shopLight.name = 'local:shopfront (budget failure)';
    shopLight.position.set(-0.8, 0.55, 0.2);
    const signLight = new THREE.PointLight(0x4fd8ff, 1.0, 1.6, 2);
    signLight.name = 'local:sign (budget failure)';
    signLight.position.set(-0.8, 1.05, -0.5);
    group.add(shopLight, signLight);
    lights.push(shopLight, signLight);
  }

  // Deterministic street litter, so the seed is consumed and two runs match.
  const litterGeometry = registry.track(new THREE.BoxGeometry(0.04, 0.01, 0.06));
  const litterMaterial = registry.track(new THREE.MeshStandardMaterial({ color: 0x6b6257, roughness: 1 }));
  for (let i = 0; i < 8; i += 1) {
    const litter = new THREE.Mesh(litterGeometry, litterMaterial);
    litter.position.set((rng() - 0.5) * 1.5, 0.006, (rng() - 0.5) * 2.2);
    litter.rotation.y = rng() * Math.PI;
    litter.name = `litter-${i}`;
    group.add(litter);
  }

  return { group, lights, emissiveMaterials };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();

  const overLit = buildCell(THREE, registry, context.seed, true);
  const budgeted = buildCell(THREE, registry, context.seed, false);
  overLit.group.name = 'before:one-real-light-per-glow';
  budgeted.group.name = 'after:emissive-geometry-plus-one-lamp';

  const root = sideBySide(THREE, registry, overLit.group, budgeted.group, 3.0);
  root.name = 'source-07:code-only-street-cell';

  const metadata = {
    sourceId: 7,
    title: 'Code-only procedural scene authoring',
    method:
      'Zero-external-asset street cell: procedurally generated asphalt albedo, and the emissive-geometry-versus-real-light budget rule - every glow is emissive surface, only the lamp that must cast a pool on walkable road earns a positioned light.',
    adaptation: 'adapted' as const,
    sources: [
      'https://x.com/prasenx/status/2087604022849184080',
      'https://github.com/StarKnightt/night-street',
      'StarKnightt/night-street@333f064778105640588a95d2c2d150780044e7bf docs/TECHNIQUE.md sections 3.1-3.4, 5.4; PROMPTS.md (MIT)',
    ],
    limitation:
      'One street cell, not the map, and no post chain: god rays, dust motes, the LUT-free golden-hour grade, bloom, DoF and grain all belong to the host renderer, which this lane may not touch. TECHNIQUE.md itself withdraws its display-transform section, so no number is quoted from it - the budget rule is adopted, the constants are ours.',
    localLights: budgeted.lights.map((light) => light.name),
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      beforeLights: overLit.lights.length,
      afterLights: budgeted.lights.length,
      emissiveSurfaces: budgeted.emissiveMaterials.length,
    },
  };

  return {
    root,
    update(time: number) {
      // A slow flicker on the neon only; the lamp is steady, because a flickering
      // real light is the expensive half and buys nothing.
      const flicker = 2.0 + Math.sin(time * 9.1) * 0.12 + Math.sin(time * 23.7) * 0.06;
      budgeted.emissiveMaterials[1].emissiveIntensity = flicker;
      overLit.emissiveMaterials[1].emissiveIntensity = flicker;
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
