import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { batchStaticMeshes } from './art-kit';
import { buildNuketown2 } from './nuketown2-arena';
import { NUKETOWN2_ROOF_BODY_TABLE } from './nuketown2-roofs';

// DAY-ROOF lane (HF-533 visual continuation / HF-535 day shift), 2026-09-06.
// Falsifiable-probe pin for the black-house-roof failure mode: the visible
// roof is the merged preserve-mode batch (`Nuketown2 arena-render-batches`,
// material `nuketown2-roof-shingles`), NOT the authored source meshes (which
// batching hides). A roof goes black when the merged batch stops receiving
// light response, so this test pins both halves of that contract:
//   (1) the authored sources keep receiveShadow (and their current cast flags);
//   (2) preserve-mode merging keeps cast+receive on the batch whenever any
//       roof source still casts, and keeps receive even when none does.

function buildRoofPair(castFirst: boolean, castSecond: boolean): THREE.Mesh {
  const root = new THREE.Group();
  root.name = 'roof-shadow-test';
  const material = new THREE.MeshStandardMaterial({ color: 0x5a6265, roughness: 0.9, metalness: 0.02 });
  const first = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 6), material);
  first.castShadow = castFirst;
  first.receiveShadow = true;
  const second = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 6), material);
  second.position.x = 5;
  second.castShadow = castSecond;
  second.receiveShadow = true;
  root.add(first, second);
  const destination = new THREE.Group();
  const stats = batchStaticMeshes(root, destination, () => '', 'preserve');
  expect(stats).toEqual({ sourceMeshes: 2, batches: 1 });
  expect(first.visible).toBe(false);
  expect(second.visible).toBe(false);
  return destination.getObjectByName('roof-shadow-test-render-batches')?.children[0] as THREE.Mesh;
}

describe('nuketown2 roof batch shadow response', () => {
  it('keeps the merged roof batch casting and receiving while any roof source casts', () => {
    const batch = buildRoofPair(true, false);
    expect(batch.castShadow).toBe(true);
    expect(batch.receiveShadow).toBe(true);
  });

  it('keeps the merged roof batch receiving even when no roof source casts', () => {
    const batch = buildRoofPair(false, false);
    expect(batch.castShadow).toBe(false);
    expect(batch.receiveShadow).toBe(true);
  });

  it('keeps receiveShadow on every authored roof source (deck, garage, rakes)', () => {
    const scene = new THREE.Scene();
    const map = buildNuketown2(scene);
    const names = [
      'nuketown2 north house roof deck',
      'nuketown2 south house roof deck',
      'nuketown2 north garage roof',
      'nuketown2 south garage roof',
      ...NUKETOWN2_ROOF_BODY_TABLE.filter((body) => body.kind === 'rake')
        .flatMap((body) => [`nuketown2 ${body.side} ${body.name}`]),
    ];
    expect(names.length).toBeGreaterThan(4);
    for (const name of names) {
      const mesh = map.root.getObjectByName(name);
      expect(mesh instanceof THREE.Mesh, name).toBe(true);
      expect((mesh as THREE.Mesh).receiveShadow, `${name} receiveShadow`).toBe(true);
    }
  });
});
