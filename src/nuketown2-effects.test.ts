import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  buildNuketown2Effects,
  NUKETOWN2_EFFECTS_DRAW_COUNT,
  NUKETOWN2_EFFECTS_DUST_COUNT,
  NUKETOWN2_EFFECTS_SHAFT_COUNT,
  NUKETOWN2_EFFECTS_TRIANGLE_COUNT,
} from "./nuketown2-effects";
import { buildNuketown2 } from "./nuketown2-arena";

function shaftTransforms(
  effects: ReturnType<typeof buildNuketown2Effects>,
): number[] {
  const values: number[] = [];
  for (const shaft of effects.shafts) {
    values.push(
      shaft.mesh.position.x,
      shaft.mesh.position.y,
      shaft.mesh.position.z,
      shaft.mesh.quaternion.x,
      shaft.mesh.quaternion.y,
      shaft.mesh.quaternion.z,
      shaft.mesh.quaternion.w,
      shaft.baseOpacity,
    );
  }
  return values;
}

describe("DAY-VISUAL-C nuketown2 golden-hour effects", () => {
  it("builds the bounded set: shafts plus one dust field, nothing else", () => {
    const parent = new THREE.Group();
    const effects = buildNuketown2Effects(parent);
    expect(effects.shafts).toHaveLength(NUKETOWN2_EFFECTS_SHAFT_COUNT);
    expect(effects.shafts).toHaveLength(5);
    expect(effects.stats).toEqual({
      shafts: 5,
      dust: NUKETOWN2_EFFECTS_DUST_COUNT,
      draws: NUKETOWN2_EFFECTS_DRAW_COUNT,
      triangles: NUKETOWN2_EFFECTS_TRIANGLE_COUNT,
    });
    expect(effects.stats.draws).toBe(6);
    expect(effects.stats.triangles).toBe(10);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0]).toBe(effects.group);
  });

  it("keeps every quad additive, fog-free, depth-write-free and unculled", () => {
    const parent = new THREE.Group();
    const effects = buildNuketown2Effects(parent);
    for (const shaft of effects.shafts) {
      expect(shaft.material.blending).toBe(THREE.AdditiveBlending);
      expect(shaft.material.transparent).toBe(true);
      expect(shaft.material.depthWrite).toBe(false);
      expect(shaft.material.fog).toBe(false);
      expect(shaft.mesh.frustumCulled).toBe(false);
      expect(shaft.mesh.renderOrder).toBe(997);
      expect(shaft.baseOpacity).toBeGreaterThanOrEqual(0.04);
      expect(shaft.baseOpacity).toBeLessThanOrEqual(0.07);
    }
    expect(effects.dustMaterial.blending).toBe(THREE.AdditiveBlending);
    expect(effects.dustMaterial.depthWrite).toBe(false);
    expect(effects.dustMaterial.fog).toBe(false);
    expect(effects.dustPoints.frustumCulled).toBe(false);
    const positions = effects.dustPoints.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    expect(positions.count).toBe(NUKETOWN2_EFFECTS_DUST_COUNT);
  });

  it("adds no lights and casts no shadows", () => {
    const parent = new THREE.Group();
    const effects = buildNuketown2Effects(parent);
    const lights: THREE.Object3D[] = [];
    const casters: THREE.Object3D[] = [];
    effects.group.traverse((object) => {
      if ((object as THREE.Light).isLight) lights.push(object);
      if ((object as THREE.Mesh).isMesh && object.castShadow) {
        casters.push(object);
      }
    });
    expect(lights).toEqual([]);
    expect(casters).toEqual([]);
  });

  it("builds deterministically: two builds place identical shafts", () => {
    const first = buildNuketown2Effects(new THREE.Group());
    const second = buildNuketown2Effects(new THREE.Group());
    expect(shaftTransforms(second)).toEqual(shaftTransforms(first));
  });

  it("advances deterministically and tolerates junk time", () => {
    const parent = new THREE.Group();
    const effects = buildNuketown2Effects(parent);
    effects.advance(12.5);
    const opacities = effects.shafts.map((shaft) => shaft.material.opacity);
    effects.advance(Number.NaN);
    effects.advance(Number.POSITIVE_INFINITY);
    for (const shaft of effects.shafts) {
      expect(Number.isFinite(shaft.material.opacity)).toBe(true);
    }
    const replay = buildNuketown2Effects(new THREE.Group());
    replay.advance(12.5);
    expect(replay.shafts.map((shaft) => shaft.material.opacity)).toEqual(
      opacities,
    );
  });

  it("dresses both verge lamp heads in the lit diffuser material", () => {
    const scene = new THREE.Scene();
    const arena = buildNuketown2(scene);
    const heads: THREE.Mesh[] = [];
    arena.root.traverse((object) => {
      if (
        (object as THREE.Mesh).isMesh &&
        object.name.includes("lamp head")
      ) {
        heads.push(object as THREE.Mesh);
      }
    });
    // Two authored heads, paired across the handedness mirror.
    expect(heads.length).toBe(4);
    for (const head of heads) {
      const material = head.material as THREE.Material;
      expect(material.name).toBe("nuketown2-lamp-head");
    }
  });

  it("wires into the built arena behind the existing wind hook", () => {
    const scene = new THREE.Scene();
    const arena = buildNuketown2(scene);
    const stats = arena.root.userData.nuketown2EffectsStats as
      { shafts: number; draws: number } | undefined;
    expect(stats?.shafts).toBe(NUKETOWN2_EFFECTS_SHAFT_COUNT);
    expect(stats?.draws).toBe(NUKETOWN2_EFFECTS_DRAW_COUNT);
    expect(arena.root.getObjectByName("nuketown2-effects")).toBeDefined();
    const wind = arena.root.userData.nuketownLawnWind as
      ((seconds: number) => void) | undefined;
    expect(typeof wind).toBe("function");
    // The one existing per-frame hook now advances the effects too: no throw,
    // no new call site.
    wind!(1.5);
  });
});
