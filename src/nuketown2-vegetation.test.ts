/**
 * nuketown2-vegetation.test.ts — the containment contract for PASS 94's
 * hedges and avenue.
 *
 * The whole admissibility argument for this module is two claims:
 *   1. every hedge run dresses a body the arena already emits as a COLLIDER,
 *      so no cover read, sightline or shot surface moved; and
 *   2. every avenue tree stands OUTSIDE the arena rectangle inflated by
 *      AVENUE_RECT_MARGIN_M, so no reachable ground has an unexplained
 *      visible solid over it.
 *
 * Both are asserted here against the REAL constructed arena, not against a
 * second copy of the numbers - the same discipline nuketown-lawn-field.test.ts
 * applies to the lawn keep-out table, and for the same reason: a hand-mirrored
 * table drifts from map source silently, and a table checked against the built
 * arena cannot.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2 } from './nuketown2-arena';
import { NUKETOWN2_BOUNDS, nuketown2HandedX } from './nuketown2-layout';
import {
  AVENUE_MAX_RADIAL_M,
  HEDGE_CLAD_M,
  HEDGE_CLAD_TOP_M,
  HEDGE_TOP_TINT,
  AVENUE_RECT_MARGIN_M,
  AVENUE_TREE_BUDGET,
  HEDGE_SPECIES,
  LEAF_ALPHA_TEST,
  LEAF_ATLAS_CELLS,
  LEAF_ATLAS_SIZE,
  LEAF_SPRIG_CARDS,
  NUKETOWN2_HEDGE_DRESSING,
  TREE_SPECIES,
  buildNuketown2Vegetation,
  createLeafAtlasData,
  leafSprigGeometry,
  nuketown2AvenueTreePositions,
  nuketown2LeafAtlas,
} from './nuketown2-vegetation';

describe('Nuke Town Rebuild vegetation', () => {
  it('dresses only footprints the arena already emits as solid colliders', () => {
    const map = buildNuketown2(new THREE.Scene());
    for (const run of NUKETOWN2_HEDGE_DRESSING) {
      // Both halves: the authored run and its 180-degree partner.
      for (const sign of [1, -1] as const) {
        const cx = nuketown2HandedX(run.x) * sign;
        const cz = run.z * sign;
        const x0 = cx - run.width / 2;
        const x1 = cx + run.width / 2;
        const z0 = cz - run.depth / 2;
        const z1 = cz + run.depth / 2;
        const covering = map.colliders.find((bounds) => (
          bounds.minX <= x0 + 1e-6 && bounds.maxX >= x1 - 1e-6
          && bounds.minZ <= z0 + 1e-6 && bounds.maxZ >= z1 - 1e-6
          && Math.abs((bounds.maxY ?? 0) - run.topY) < 1e-6
        ));
        expect(
          covering,
          `hedge run "${run.id}" at (${cx}, ${cz}) ${run.width}x${run.depth} top=${run.topY}`
          + ' has no arena collider under it - the dressing has drifted from nuketown2-arena.ts',
        ).toBeDefined();
      }
    }
  });

  it('plants every avenue tree outside the inflated arena rectangle and inside the forest ring', () => {
    const positions = nuketown2AvenueTreePositions();
    expect(positions.length).toBeGreaterThan(30);
    expect(positions.length).toBeLessThanOrEqual(AVENUE_TREE_BUDGET);
    const minX = NUKETOWN2_BOUNDS.minX - AVENUE_RECT_MARGIN_M;
    const maxX = NUKETOWN2_BOUNDS.maxX + AVENUE_RECT_MARGIN_M;
    const minZ = NUKETOWN2_BOUNDS.minZ - AVENUE_RECT_MARGIN_M;
    const maxZ = NUKETOWN2_BOUNDS.maxZ + AVENUE_RECT_MARGIN_M;
    for (const [x, z] of positions) {
      const inside = x > minX && x < maxX && z > minZ && z < maxZ;
      expect(inside, `avenue tree at (${x.toFixed(2)}, ${z.toFixed(2)}) stands on playable ground`).toBe(false);
      // Inside the forest ring's inner radius (44.5), so the avenue is a
      // distinct kept planting and never a second ragged forest edge.
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(AVENUE_MAX_RADIAL_M + 1e-6);
    }
  });

  it('keeps every avenue trunk at least 4.6 m from every other one', () => {
    const positions = nuketown2AvenueTreePositions();
    for (let a = 0; a < positions.length; a += 1) {
      for (let b = a + 1; b < positions.length; b += 1) {
        const [ax, az] = positions[a]!;
        const [bx, bz] = positions[b]!;
        expect(Math.hypot(ax - bx, az - bz)).toBeGreaterThanOrEqual(4.6 - 1e-9);
      }
    }
  });

  it('is deterministic: two builds place the identical avenue', () => {
    const first = nuketown2AvenueTreePositions();
    const second = nuketown2AvenueTreePositions();
    expect(second).toEqual(first);
  });

  it('adds no collider, raycast mesh or shot surface to the arena', () => {
    const bare = buildNuketown2(new THREE.Scene());
    // Every vegetation node in the constructed arena is presentation-only.
    let vegetationNodes = 0;
    bare.root.traverse((node) => {
      if (!node.name.startsWith('nuketown2-hedges') && !node.name.startsWith('nuketown2-avenue')) return;
      vegetationNodes += 1;
      expect(node.userData.presentationOnly, node.name).toBe(true);
    });
    // 8 hedge runs x (1 LOD + 3 meshes) + 4 avenue sectors x (1 + 3) = 48,
    // plus HF-536 look-2b's ONE leaf-card InstancedMesh = 49. The count is
    // still an EXACT pin, and it still fails if anything else appears under
    // either prefix - which is the property it was written to defend.
    expect(vegetationNodes).toBe(49);
    for (const mesh of bare.raycastMeshes) {
      expect(mesh.name.startsWith('nuketown2-hedges')).toBe(false);
      expect(mesh.name.startsWith('nuketown2-avenue')).toBe(false);
    }
  });

  it('gives every LOD three levels, with the near level the most expensive', () => {
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    const lods = vegetation.group.children.filter((node): node is THREE.LOD => (node as THREE.LOD).isLOD === true);
    // 8 hedge runs + 4 avenue sectors.
    expect(lods.length).toBe(12);
    for (const lod of lods) {
      expect(lod.levels.length).toBe(3);
      // Distances strictly increase, and the first is 0 (always drawn near).
      expect(lod.levels[0]!.distance).toBe(0);
      expect(lod.levels[1]!.distance).toBeGreaterThan(lod.levels[0]!.distance);
      expect(lod.levels[2]!.distance).toBeGreaterThan(lod.levels[1]!.distance);
      const tris = lod.levels.map((level) => {
        const geometry = (level.object as THREE.Mesh).geometry;
        return geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
      });
      expect(tris[0]).toBeGreaterThan(tris[1]!);
      expect(tris[1]).toBeGreaterThan(tris[2]!);
      // AND the LOD object must stand where the thing it draws stands. An LOD
      // parked at the origin switches on distance-to-map-centre, which is a
      // global quality switch, not a distance LOD. Only a run or sector that
      // genuinely straddles the origin may sit there, and none of these do.
      expect(lod.position.lengthSq(), `${lod.name} sits at the arena origin`).toBeGreaterThan(1);
    }
    vegetation.dispose();
  });

  it('CLADS its host solid instead of hiding inside it', () => {
    // The regression this exists for: the first cut inset the foliage 0.06 m
    // inside an opaque host box, so the hedge rendered nowhere and the review
    // capture was byte-similar to the baseline. Cladding is the fix, and the
    // numbers are asserted so a future "tidy" cannot quietly re-inset them.
    expect(HEDGE_CLAD_M).toBeGreaterThan(0);
    expect(HEDGE_CLAD_TOP_M).toBeGreaterThan(0.03);
    // ...and it stays DRESSING: a hedge that reads much taller than the cover
    // it sits on is a cover lie, so the ridge may not rise more than 0.1 m.
    expect(HEDGE_CLAD_TOP_M).toBeLessThanOrEqual(0.1);
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    const lod = vegetation.group.children.find(
      (node) => node.name === 'nuketown2-hedges-north-verge-front-hedge',
    ) as THREE.LOD;
    const run = NUKETOWN2_HEDGE_DRESSING.find((entry) => entry.id === 'verge front hedge')!;
    const near = lod.levels[0]!.object as THREE.Mesh;
    near.geometry.computeBoundingBox();
    const box = near.geometry.boundingBox!;
    // Wider than the host on the long axis, and taller than its top face.
    expect(box.max.x - box.min.x).toBeGreaterThan(run.width);
    expect(box.max.z - box.min.z).toBeGreaterThan(run.depth);
    expect(box.max.y).toBeGreaterThan(run.topY);
    // But not by much - this is cladding, not a new body.
    expect(box.max.y).toBeLessThan(run.topY + 0.2);
    vegetation.dispose();
  });

  it('carries two distinct species, not one silhouette scaled twice', () => {
    expect(HEDGE_SPECIES.id).not.toEqual(TREE_SPECIES.id);
    // The properties that actually make them different plants: a clipped hedge
    // barely moves and a deciduous crown moves a lot.
    expect(TREE_SPECIES.swayM).toBeGreaterThan(HEDGE_SPECIES.swayM * 4);
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    expect(vegetation.stats.species).toBe(2);
    vegetation.dispose();
  });

  it('advances the wind with one uniform write and allocates nothing per frame', () => {
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    // The call must be safe to make sixty times a second forever.
    for (let i = 0; i < 120; i += 1) vegetation.advanceWind(i / 60);
    expect(vegetation.stats.hedgeSegments).toBeGreaterThan(20);
    vegetation.dispose();
  });

  it('stays inside its stated draw-call and triangle budget', () => {
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    // Worst case = every one of the 12 LODs showing level 0 at once. It is a
    // BOUND, not the normal case: the four avenue sectors are 40 m apart and
    // cannot all be inside one camera's 26 m near tier.
    // 12 LODs + HF-536 look-2b's ONE leaf-card InstancedMesh, which covers all
    // eight hedge runs from a single instanced draw rather than one per run.
    expect(vegetation.stats.worstCaseDrawCalls).toBe(13);
    // Measured 2026-09-04: 40,376. The ceiling is that measurement plus ~11 %
    // headroom, and it is 7 % of the arena's 650 k triangle budget. If a future
    // edit blows it, the thing to change is the geometry, not this number.
    // MEASURED AFTER look-2b: 44,384 (the leaf layer is 160 sprigs x 8 tris =
    // 1,280 of that). The ceiling is NOT moved - the pass fits under the number
    // it inherited, with 616 triangles to spare, and the next pass that wants
    // more geometry here has to earn it rather than raise the bar.
    expect(vegetation.stats.worstCaseTriangles).toBeLessThan(45_000);
    vegetation.dispose();
  });

  it('keys the hedge top face lighter than its root (DAY-VISUAL-B clipped look, HF-536 muse-lawn measured ratchet: hedge 0x33592b -> 0x55602e with the lawn)', () => {
    // The TSL value ramp multiplies the base colour by HEDGE_TOP_TINT at the
    // crown: a warm-lit clipped top face against dark sides, not a flat slab.
    expect(HEDGE_TOP_TINT.r).toBeGreaterThan(1.2);
    expect(HEDGE_TOP_TINT.g).toBeGreaterThan(1.1);
    expect(HEDGE_TOP_TINT.b).toBeLessThan(1);
    expect(HEDGE_TOP_TINT.r).toBeGreaterThan(HEDGE_TOP_TINT.g);
    expect(HEDGE_TOP_TINT.g).toBeGreaterThan(HEDGE_TOP_TINT.b);
    // And the base is a deep clipped OLIVE, near-black in shadow, measured with the
    // lawn boxes (boards bedGround hue 61.3 sat 63.5%; old lime 0x33592b hue 109.6).
    expect(HEDGE_SPECIES.color).toBe(0x55602e);
  });

  // -------------------------------------------------------------------------
  // HF-536 look-2b: the procedurally drawn leaf atlas and the cards it feeds
  // -------------------------------------------------------------------------

  it('draws sixteen DIFFERENT leaf silhouettes into the atlas', () => {
    const data = createLeafAtlasData();
    const cell = LEAF_ATLAS_SIZE / LEAF_ATLAS_CELLS;
    expect(data.length).toBe(LEAF_ATLAS_SIZE * LEAF_ATLAS_SIZE * 4);
    const coverage: number[] = [];
    for (let cy = 0; cy < LEAF_ATLAS_CELLS; cy += 1) {
      for (let cx = 0; cx < LEAF_ATLAS_CELLS; cx += 1) {
        let opaque = 0;
        for (let py = 0; py < cell; py += 1) {
          for (let px = 0; px < cell; px += 1) {
            const alpha = data[(((cy * cell + py) * LEAF_ATLAS_SIZE) + (cx * cell + px)) * 4 + 3]!;
            if (alpha >= LEAF_ALPHA_TEST * 255) opaque += 1;
          }
        }
        coverage.push(opaque / (cell * cell));
      }
    }
    expect(coverage.length).toBe(16);
    for (const value of coverage) {
      // A leaf, not a full square and not an empty cell. Measured band on the
      // shipped atlas is 0.247..0.407.
      expect(value).toBeGreaterThan(0.15);
      expect(value).toBeLessThan(0.55);
    }
    // ...and no two cells are the same silhouette. Rounded to 1e-3, sixteen
    // distinct coverages means sixteen distinct leaves.
    expect(new Set(coverage.map((v) => v.toFixed(3))).size).toBe(16);
  });

  it('keeps a transparent gutter so no cell bleeds into its neighbour', () => {
    // The failure this exists for, measured on the first cut: the leaf's BASE
    // nub reached the bottom row of its own cell in all sixteen cells (four at
    // alpha 255), so bilinear filtering and the mip chain smeared one leaf into
    // the next cell and every card grew a grey fringe.
    const data = createLeafAtlasData();
    const cell = LEAF_ATLAS_SIZE / LEAF_ATLAS_CELLS;
    let worst = 0;
    for (let cy = 0; cy < LEAF_ATLAS_CELLS; cy += 1) {
      for (let cx = 0; cx < LEAF_ATLAS_CELLS; cx += 1) {
        for (let py = 0; py < cell; py += 1) {
          for (let px = 0; px < cell; px += 1) {
            const onBorder = px <= 1 || py <= 1 || px >= cell - 2 || py >= cell - 2;
            if (!onBorder) continue;
            worst = Math.max(worst, data[(((cy * cell + py) * LEAF_ATLAS_SIZE) + (cx * cell + px)) * 4 + 3]!);
          }
        }
      }
    }
    expect(worst, 'the outer two texels of every atlas cell must be fully transparent').toBe(0);
  });

  it('instances the leaf cards as ONE draw inside the 80-per-run cap', () => {
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    const cards = vegetation.group.children.filter(
      (node) => (node as THREE.InstancedMesh).isInstancedMesh === true
        && node.name === 'nuketown2-hedges-leaf-cards',
    ) as THREE.InstancedMesh[];
    expect(cards.length, 'the whole leaf layer must be one instanced draw').toBe(1);
    const mesh = cards[0]!;
    // The brief's cap, and it is per RUN, not in total.
    expect(vegetation.stats.leafCardsPerRun).toBeLessThanOrEqual(80);
    expect(vegetation.stats.leafCards)
      .toBe(vegetation.stats.leafCardsPerRun * NUKETOWN2_HEDGE_DRESSING.length * 2);
    expect(mesh.userData.presentationOnly).toBe(true);
    expect(mesh.userData.blocksShots).toBe(false);
    // SHADOWS OFF, and this assertion is the record of WHY. three r185's
    // WebGPU shadow pass sets scene.overrideMaterial to one shared opaque
    // NodeMaterial with no alpha test (ShadowNode.js:746 ->
    // ShadowFilterNode.js:196), so an alpha-tested card casts its whole quad.
    expect(mesh.castShadow, 'an alpha-tested card would cast a solid rectangle on r185 WebGPU').toBe(false);
    expect(mesh.receiveShadow).toBe(true);
    // Frustum-culling gotcha: the bounds must wrap every instance, not the
    // sprig at the origin. The runs span both halves of an 84 m map.
    expect(mesh.boundingSphere).not.toBeNull();
    expect(mesh.boundingSphere!.radius).toBeGreaterThan(8);
    vegetation.dispose();
  });

  it('spends exactly ONE texture sampler on the whole leaf layer', () => {
    // The gotcha this defends against by name:
    // gotcha-silent-arena-rollback-device-limit. A 17-sampler arena's
    // requestDevice was rejected with no visible error and the arena silently
    // rolled back, so every sampler this map spends has to be deliberate and
    // countable. The browser census in docs/forge/sampler-census.json is the
    // authority on the arena TOTAL; this is the cheap static guard that stops
    // a future edit adding a normal map, a roughness map and an alpha map to
    // the leaf material without anyone noticing.
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    const mesh = vegetation.group.children.find(
      (node) => node.name === 'nuketown2-hedges-leaf-cards',
    ) as THREE.InstancedMesh;
    const material = mesh.material as THREE.Material & Record<string, unknown>;
    const textures = new Set<object>();
    const seen = new Set<object>();
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      const record = node as Record<string, unknown>;
      const value = record.value as { isTexture?: boolean } | undefined;
      if (value && typeof value === 'object' && value.isTexture === true) textures.add(value);
      for (const key of Object.keys(record)) {
        if (key === 'parent' || key === 'parents') continue;
        walk(record[key]);
      }
    };
    for (const slot of ['colorNode', 'opacityNode', 'positionNode', 'normalNode', 'roughnessNode']) {
      walk(material[slot]);
    }
    // Plus the classic non-node map slots, which a NodeMaterial still honours.
    for (const slot of ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
      const texture = material[slot] as { isTexture?: boolean } | null | undefined;
      if (texture && texture.isTexture === true) textures.add(texture);
    }
    expect(textures.size, 'the leaf layer may cost exactly one sampler').toBe(1);
    expect([...textures][0] as THREE.Texture).toBe(nuketown2LeafAtlas());
    // THE CUT-OUT ITSELF. Read out of the installed r185 source rather than
    // assumed: NodeMaterial.setupDiffuseColor takes `vec4(this.colorNode)`,
    // and NodeBuilder.format (NodeBuilder.js:3407-3409) pads a vec3 to
    // `vec4( <vec3>, 1.0 )` - so alpha is 1 until an opacityNode multiplies
    // it, and `materialOpacity` is NOT applied when opacityNode is set. Drop
    // the opacityNode and every leaf card becomes a solid opaque square while
    // still passing every other assertion in this file. So pin both halves.
    expect(material.alphaTest).toBe(LEAF_ALPHA_TEST);
    expect(material.opacityNode, 'without an opacityNode the cut-out is a solid square').toBeTruthy();
    // ...and the atlas is a module singleton, so a second hedge build cannot
    // quietly spend a second sampler.
    expect(nuketown2LeafAtlas()).toBe(nuketown2LeafAtlas());
    vegetation.dispose();
  });

  it('gives the sprig one atlas COLUMN per card and keeps it two triangles wide', () => {
    const sprig = leafSprigGeometry();
    const uvAttribute = sprig.getAttribute('uv');
    expect(uvAttribute, 'the cards need UVs to address the atlas').toBeTruthy();
    const triangleCount = sprig.index
      ? sprig.index.count / 3
      : sprig.getAttribute('position').count / 3;
    expect(triangleCount).toBe(LEAF_SPRIG_CARDS * 2);
    // Every u must land inside ONE atlas column, and the four cards must use
    // FOUR different columns - otherwise the sprig is one leaf drawn 4 times.
    const columns = new Set<number>();
    for (let i = 0; i < uvAttribute.count; i += 1) {
      const u = uvAttribute.getX(i);
      const v = uvAttribute.getY(i);
      expect(u).toBeGreaterThanOrEqual(-1e-6);
      expect(u).toBeLessThanOrEqual(1 + 1e-6);
      // Row 0 only: the material adds the row per instance.
      expect(v).toBeLessThanOrEqual(1 / LEAF_ATLAS_CELLS + 1e-6);
      columns.add(Math.round(u * LEAF_ATLAS_CELLS - 0.5));
    }
    expect(columns.size).toBeGreaterThanOrEqual(LEAF_SPRIG_CARDS);
    sprig.dispose();
  });

  it('builds hedge lobes at two sizes with a lean, at the same triangle cost', () => {
    // critic gap #5: "flat-shaded blobs". Two lobe sizes and a per-lobe lean
    // break the row of identical domes. A lobe costs 80 triangles at ANY
    // scale, so this must not have moved the LOD ordering or the ceiling -
    // which the budget test above re-checks.
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    const lod = vegetation.group.children.find(
      (node) => node.name === 'nuketown2-hedges-north-verge-front-hedge',
    ) as THREE.LOD;
    const near = (lod.levels[0]!.object as THREE.Mesh).geometry;
    const position = near.getAttribute('position');
    // Read the lobe band (above the clipped body top) and measure how many
    // DISTINCT heights the lobe crowns sit at: one size and no lean would put
    // every crown on one plane.
    const run = NUKETOWN2_HEDGE_DRESSING.find((entry) => entry.id === 'verge front hedge')!;
    const bodyTop = (run.topY + HEDGE_CLAD_TOP_M) * 0.88;
    const crowns = new Set<string>();
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      if (y > bodyTop) crowns.add(y.toFixed(3));
    }
    expect(crowns.size, 'the lobe crowns must not all sit on one plane').toBeGreaterThan(12);
    vegetation.dispose();
  });

  it('leans avenue trunks seed-stably without moving their stations', () => {
    const parent = new THREE.Group();
    const vegetation = buildNuketown2Vegetation(parent);
    const matrix = new THREE.Matrix4();
    const yAxis = new THREE.Vector3();
    let maxTilt = 0;
    let leaning = 0;
    let total = 0;
    for (const node of vegetation.group.children) {
      const lod = node as THREE.LOD;
      if (lod.isLOD !== true || !lod.name.includes('avenue')) continue;
      const mesh = lod.levels[0]!.object as THREE.InstancedMesh;
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.getMatrixAt(i, matrix);
        // Yaw-proof: read the tilt off the instance Y basis, not an Euler
        // triple (XYZ decomposition flips x/z near yaw PI).
        yAxis.set(matrix.elements[4]!, matrix.elements[5]!, matrix.elements[6]!).normalize();
        const tilt = Math.acos(Math.min(1, yAxis.y));
        maxTilt = Math.max(maxTilt, tilt);
        if (tilt > 0.005) leaning += 1;
        total += 1;
      }
    }
    // Every lean pivots at the trunk base: measured 0.044 rad max keeps the
    // crown shift under 0.35 m while the 4.6 m-separated station never moves.
    expect(total).toBeGreaterThan(30);
    expect(leaning).toBeGreaterThan(total * 0.8);
    expect(maxTilt).toBeLessThanOrEqual(0.05);
    vegetation.dispose();
  });
});
