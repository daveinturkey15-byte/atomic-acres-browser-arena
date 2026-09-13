/**
 * Source 9 — Three.js frame-loop and visual audit (`millionco/react-doctor`).
 *
 * Read at pin `e183c3519010599d929ed14d99a18bf1f8f8a44c`, the whole of
 * `skills/improve-threejs/SKILL.md` (9,128 bytes, 103 lines). Its stated core
 * principle, verbatim (:10): "severity follows the render loop. Code inside
 * `useFrame` or a `requestAnimationFrame` callback runs 60 times per second, so
 * a minor inefficiency there outweighs a major one in a settings panel."
 * HIGH severity list at :34-39; the visual rubric table at :56-67; "Checks the
 * scanner always misses" at :93-103.
 *
 * Licence at that pin: **Modified MIT** (LICENSE read, 1,732 bytes) — the MIT
 * grant plus two carve-outs needing prior written permission from Million
 * Software, Inc.: use as training/fine-tuning/evaluation data or as input to an
 * automated ML-training pipeline, and selling it as a paid hosted product. The
 * upstream skill was NOT installed and React Doctor was NOT executed; installing
 * runs third-party code and is an owner decision.
 *
 * This is a tool technique, so the deliverable is two things, not a pretty scene:
 *   1. A real, usable artefact: `scripts/technique-lab/group-a/frame_loop_audit.mjs`,
 *      a static scanner for the HIGH-severity patterns, runnable on this repo.
 *   2. This before/after scene, which makes the same two defects observable at
 *      runtime rather than argued: the BEFORE subtree allocates a fresh Vector3
 *      and Color on every update and creates a geometry it never disposes; the
 *      AFTER subtree hoists scratch objects and registers everything for
 *      disposal. Both counters are live in metadata, and `dispose()` proves the
 *      difference: the leaky half reports resources it can no longer reach.
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

interface Half {
  group: THREE_NS.Group;
  mesh: THREE_NS.Mesh;
  material: THREE_NS.MeshStandardMaterial;
}

function buildHalf(THREE: ThreeNamespace, colour: number, name: string): Half {
  const group = new THREE.Group();
  group.name = name;
  const geometry = new THREE.TorusKnotGeometry(0.3, 0.1, 72, 10);
  const material = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.35, metalness: 0.25 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.5;
  group.add(mesh);
  return { group, mesh, material };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();

  const leaky = buildHalf(THREE, 0x9a3b3b, 'before:allocates-per-frame-and-never-disposes');
  const clean = buildHalf(THREE, 0x3b8a5a, 'after:hoisted-scratch-and-registered-disposal');

  // The AFTER half registers everything it creates. The BEFORE half deliberately
  // does not, which is the defect.
  registry.track(clean.mesh.geometry as THREE_NS.BufferGeometry);
  registry.track(clean.material);

  const root = sideBySide(THREE, registry, leaky.group, clean.group, 2.0);
  root.name = 'source-09:frame-loop-and-disposal-audit';

  // Hoisted scratch for the clean half — SKILL.md:36's named fix.
  const scratchVector = new THREE.Vector3();
  const scratchColour = new THREE.Color();
  const baseColour = new THREE.Color(0x3b8a5a);
  const leakyBase = new THREE.Color(0x9a3b3b);

  // Resources the leaky half creates and abandons, tracked here only so the
  // demo can COUNT the leak honestly and still release it at teardown. A real
  // leak would have no such list; that is the point of the counter.
  const abandoned: Array<{ dispose: () => void }> = [];

  let allocationsThisUpdate = 0;
  let leakedResources = 0;

  const metadata = {
    sourceId: 9,
    title: 'Three.js frame-loop and visual audit',
    method:
      'Severity follows the render loop: per-frame allocation and missing disposal are HIGH because they run 60x a second or grow without bound. Fix by hoisting scratch objects and mutating in place, and by registering every imperatively created GPU resource for disposal.',
    adaptation: 'adapted' as const,
    sources: [
      'https://x.com/aidenybai/status/2089400082550620636',
      'https://github.com/millionco/react-doctor',
      'millionco/react-doctor@e183c3519010599d929ed14d99a18bf1f8f8a44c skills/improve-threejs/SKILL.md:10,34-48,56-67,93-103 (Modified MIT)',
    ],
    limitation:
      'The upstream skill was not installed and `npx react-doctor` was not run: installing executes third-party code, which is an owner decision, and the Modified MIT carve-outs restrict use as training/evaluation data. The rubric rows that require rendered evidence - z-fighting, shadow acne, colour space, resize/DPR - stay OPEN in this lane because no browser or GPU job runs here. Our own restated scanner covers the static half only.',
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      perFrameAllocations: 0,
      leakedResources: 0,
      registeredForDisposal: registry.size,
    },
  };

  return {
    root,
    update(time: number) {
      allocationsThisUpdate = 0;

      // BEFORE — every one of these is a HIGH finding from SKILL.md:36-38.
      const spin = new THREE.Vector3(0, time * 0.8, 0); // fresh Vector3 each frame
      const tint = new THREE.Color().setHSL((time * 0.08) % 1, 0.4, 0.45); // fresh Color
      allocationsThisUpdate += 2;
      leaky.mesh.rotation.setFromVector3(spin);
      leaky.material.color.copy(leakyBase).lerp(tint, 0.5);
      if (Math.floor(time * 2) % 30 === 0) {
        // A geometry rebuilt periodically and never disposed: the unbounded half.
        const replacement = new THREE.TorusKnotGeometry(0.3, 0.1, 72, 10);
        abandoned.push(replacement);
        leaky.mesh.geometry = replacement;
        leakedResources += 1;
      }

      // AFTER — same visible result, zero allocations, nothing abandoned.
      scratchVector.set(0, time * 0.8, 0);
      clean.mesh.rotation.setFromVector3(scratchVector);
      scratchColour.setHSL((time * 0.08) % 1, 0.4, 0.45);
      clean.material.color.copy(baseColour).lerp(scratchColour, 0.5);

      metadata.counters.perFrameAllocations = allocationsThisUpdate;
      metadata.counters.leakedResources = leakedResources;
    },
    dispose() {
      // The leaky half is released here so the LAB does not leak; the counter
      // above is what records that the pattern would have leaked in production.
      for (const item of abandoned) item.dispose();
      abandoned.length = 0;
      (leaky.mesh.geometry as THREE_NS.BufferGeometry).dispose();
      leaky.material.dispose();
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
