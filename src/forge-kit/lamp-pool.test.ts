/**
 * lamp-pool.test.ts - HF-536 NIGHT MUSE-LAMPS proof (brief: the Proof list, first bullet).
 *
 * Prefab arithmetic is asserted without building an arena; placement,
 * presentation-only authority and the shared-material prop collapse are
 * asserted against the built arena, because that is where `pair()` and the
 * props ratchet actually run.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  LAMP_POOL_COLOR_HEX,
  LAMP_POOL_OPACITY,
  LAMP_POOL_RADIUS,
  LAMP_POOL_SLAB_H,
  LAMP_POOL_TRIANGLES,
  LAMP_POOL_Y,
  LAMP_POST_HIGHLIGHT,
  getLampPoolMaterial,
  lampPoolParts,
} from './lamp-pool';
import { buildNuketown2 } from '../nuketown2-arena';
import { NUKETOWN2_LAMP_POST_LAYOUT } from '../nuketown2-layout';

describe('lamp pool prefab', () => {
  it('adds at most 60 triangles per lamp: one pool slab plus one highlight strip', () => {
    const parts = lampPoolParts();
    expect(parts).toHaveLength(2);
    expect(parts.length * 12).toBe(LAMP_POOL_TRIANGLES);
    expect(LAMP_POOL_TRIANGLES).toBe(24);
    expect(LAMP_POOL_TRIANGLES).toBeLessThanOrEqual(60);
    expect(new Set(parts.map((part) => part.suffix)).size).toBe(parts.length);
    for (const part of parts) {
      expect(part.suffix.trim()).not.toBe('');
      for (const size of part.size) {
        expect(size).toBeGreaterThan(0.002);
        expect(size).toBeLessThan(30);
      }
    }
  });

  it('pools every part through the lane material role', () => {
    for (const part of lampPoolParts()) {
      expect(part.role).toBe('lampPool');
    }
  });

  it('sizes the pool to the brief: ~2.6 m radius, 12 mm over the verge, opacity 0.95 linear for centre/ring 1.124 -> 1.35-1.6', () => {
    const pool = lampPoolParts().find((part) => part.suffix === 'light pool')!;
    expect(pool).toBeDefined();
    expect(pool.size[0] / 2).toBeCloseTo(LAMP_POOL_RADIUS, 6);
    expect(pool.size[2] / 2).toBeCloseTo(LAMP_POOL_RADIUS, 6);
    expect(LAMP_POOL_RADIUS).toBeCloseTo(2.6, 6);
    // Anchored at the ground under the post, so the offset IS the world height.
    expect(pool.offset[1]).toBeCloseTo(LAMP_POOL_Y, 6);
    expect(LAMP_POOL_Y).toBeCloseTo(0.012, 6);
    // Interim-3 squared 0.35 read 1.124 (invisible); squared 0.8 re-captured at
    // 1.275, topping out at ~1.34 - so 0.95 rides a LINEAR falloff to 0 at the
    // rim (disc-mean factor 0.458 -> 0.667), predicting ~1.47 mid-band.
    // Warm sodium tint unchanged.
    expect(LAMP_POOL_OPACITY).toBeCloseTo(0.95, 6);
    expect(LAMP_POOL_COLOR_HEX).toBe(0xffc37a);
  });

  it('grounds the pool flat: thin axis is Y, centre within 0.05 m of the ground', () => {
    const pool = lampPoolParts().find((part) => part.suffix === 'light pool')!;
    // Slab: 5.2 m across, 20 mm thick - the broad faces are the ground-facing pair.
    expect(pool.size[1]).toBeCloseTo(LAMP_POOL_SLAB_H, 6);
    expect(pool.size[1]).toBeLessThan(pool.size[0] / 100);
    expect(pool.size[1]).toBeLessThan(pool.size[2] / 100);
    // Centre height is the world height: 12 mm, inside the 0.05 m ground anchor.
    expect(Math.abs(pool.offset[1])).toBeLessThanOrEqual(0.05);
    const strip = lampPoolParts().find((part) => part.suffix === 'cone highlight')!;
    // Strip: 2.0 m tall plate - the long axis is Y, standing on the post face.
    expect(strip.size[1]).toBeGreaterThan(strip.size[0] * 10);
    expect(strip.size[1]).toBeGreaterThan(strip.size[2] * 10);
  });

  it('never sits coplanar with the ground: 22 mm over the crown, 2 mm proud of the verge', () => {
    const pool = lampPoolParts().find((part) => part.suffix === 'light pool')!;
    const topY = pool.offset[1] + pool.size[1] / 2;
    const bottomY = pool.offset[1] - pool.size[1] / 2;
    // Carriageway crown tops at 0.0, verge tile at 0.02: neither pool face shares
    // a plane with either (1 mm epsilon - the audit threshold).
    expect(topY).toBeCloseTo(0.022, 6);
    expect(bottomY).toBeCloseTo(0.002, 6);
    for (const faceY of [topY, bottomY]) {
      expect(Math.abs(faceY - 0.0)).toBeGreaterThan(0.001);
      expect(Math.abs(faceY - 0.02)).toBeGreaterThan(0.001);
    }
  });

  it('stands the highlight strip on the road face with its bright end at the head', () => {
    const strip = lampPoolParts().find((part) => part.suffix === 'cone highlight')!;
    expect(strip).toBeDefined();
    expect(strip.size[1]).toBeCloseTo(LAMP_POST_HIGHLIGHT.height, 6);
    expect(strip.size[1]).toBeGreaterThan(strip.size[0]);
    // Road side: authored +z, mirrored onto -z for the south half by pair().
    expect(strip.offset[2]).toBeGreaterThan(0);
    // Bright end (strip top) meets the head; nothing pokes past the fixture.
    expect(strip.offset[1] + strip.size[1] / 2).toBeLessThanOrEqual(4.35);
    expect(strip.offset[1] - strip.size[1] / 2).toBeGreaterThan(0);
  });

  it('mints exactly one additive material: transparent, depthWrite off, no sampler', () => {
    const first = getLampPoolMaterial();
    expect(getLampPoolMaterial()).toBe(first);
    expect(first.blending).toBe(THREE.AdditiveBlending);
    expect(first.transparent).toBe(true);
    expect(first.depthWrite).toBe(false);
    expect(first.map).toBeNull();
    expect((first as unknown as { colorNode?: { isNode?: boolean } }).colorNode?.isNode).toBe(true);
  });
});

describe('lamp pool arena placement', () => {
  it('grounds both lamp posts, presentation-only, sharing the head prop and the one material', () => {
    const map = buildNuketown2(new THREE.Scene());
    const pools: THREE.Mesh[] = [];
    const strips: THREE.Mesh[] = [];
    map.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.name.includes('light pool')) pools.push(node);
      if (node.name.includes('cone highlight')) strips.push(node);
    });
    // Two authored posts, each mirrored by pair(): four pools, four strips.
    expect(pools).toHaveLength(NUKETOWN2_LAMP_POST_LAYOUT.length * 2);
    expect(strips).toHaveLength(NUKETOWN2_LAMP_POST_LAYOUT.length * 2);
    const material = getLampPoolMaterial();
    const seenProps = new Set<string>();
    for (const mesh of [...pools, ...strips]) {
      expect(mesh.material).toBe(material);
      expect(mesh.userData.presentationOnly).toBe(true);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.userData.ballisticSurfaceId).toBeUndefined();
      const prop = (mesh.userData as { nuketown2Prop?: unknown }).nuketown2Prop;
      expect(typeof prop).toBe('string');
      // Collapsed with the lamp head: the pool is not a new prop.
      expect(prop).toMatch(/^(north|south) verge (west|east) lamp head$/);
      seenProps.add(prop as string);
    }
    // Both posts, both halves, each with its pool and its strip under the head's prop.
    expect(seenProps.size).toBe(NUKETOWN2_LAMP_POST_LAYOUT.length * 2);
    for (const lamp of NUKETOWN2_LAMP_POST_LAYOUT) {
      const atPost = pools.filter(
        (mesh) => Math.abs(Math.abs(mesh.position.x) - Math.abs(lamp.x)) < 1e-6
          && Math.abs(Math.abs(mesh.position.z) - Math.abs(lamp.z)) < 1e-6,
      );
      expect(atPost.length, `pool at lamp ${lamp.id}`).toBe(2);
      for (const mesh of atPost) {
        expect(mesh.position.y).toBeCloseTo(LAMP_POOL_Y, 6);
      }
    }
  });
});
