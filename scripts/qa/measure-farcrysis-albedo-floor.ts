// Lane R (PASS 87, HF-423): WHICH farcrysis layers are the crushed-to-black
// mass that scripts/qa/measure-farcrysis-frame-tone.mjs counts in the frame?
//
//   npx tsx scripts/qa/measure-farcrysis-albedo-floor.ts [--out <file.json>] [--top N]
//
// The frame-tone instrument says HOW MUCH of the frame sits below linear luma
// 0.02; it cannot say WHOSE pixels those are. This one builds the arena in
// node and computes, per mesh, the shaded-side floor each material can reach:
//
//   albedo   linear luma of material.color x the MEAN of its albedo map
//            (map multiplies colour; a light colour over a dark map is dark).
//   floor    albedo x AMBIENT + emissive luma. AMBIENT is the arena's own
//            hemisphere/ambient contribution to a face turned away from the
//            sun - the light level at which a surface renders when nothing
//            direct reaches it. Below CRUSH_LUMA (0.02, the frame-tone
//            instrument's own threshold) that face is a black silhouette.
//   mass     triangles x instances - a screen-mass PROXY, not a pixel count.
//            It ranks layers; it does not predict the frame percentage.
//
// A layer is only interesting if it is BOTH below the crush line and carries
// mass, so the report is ordered by crushed mass rather than by darkness.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { buildFarcrysis } from '../../src/farcrysis';

/**
 * Ambient reaching a face turned fully away from the sun. Taken from the
 * arena's own lighting rather than assumed: see AMBIENT_SOURCE below, which
 * fails loudly if the arena stops providing it.
 */
const CRUSH_LUMA = 0.02;

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Linear luma of a THREE.Color already in linear-working space. */
function luma(color: THREE.Color): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

/** Mean linear reflectance of an albedo map, or 1 when there is none. */
function meanMapReflectance(tex: THREE.Texture | null | undefined): number {
  if (!tex) return 1;
  const img = tex.image as { data?: ArrayLike<number>; width?: number; height?: number } | undefined;
  if (!img?.data || !img.width || !img.height) return 1;
  const data = img.data;
  const px = img.width * img.height;
  const stride = Math.round(data.length / px);
  if (stride < 3) return 1;
  // Sample rather than walk every texel: these are procedural noise maps and
  // 4096 samples pin a mean to well under a percent.
  const step = Math.max(1, Math.floor(px / 4096));
  let sum = 0;
  let n = 0;
  for (let i = 0; i < px; i += step) {
    const p = i * stride;
    sum += 0.2126 * srgbToLinear(data[p] / 255)
      + 0.7152 * srgbToLinear(data[p + 1] / 255)
      + 0.0722 * srgbToLinear(data[p + 2] / 255);
    n += 1;
  }
  return n === 0 ? 1 : sum / n;
}

interface Row {
  mesh: string;
  instances: number;
  triangles: number;
  mass: number;
  colorLuma: number;
  mapMean: number;
  albedo: number;
  emissive: number;
  floor: number;
  crushed: boolean;
}

function main(): void {
  const outFlag = process.argv.indexOf('--out');
  const topFlag = process.argv.indexOf('--top');
  const top = topFlag >= 0 ? Number(process.argv[topFlag + 1]) : 25;

  const scene = new THREE.Scene();
  buildFarcrysis(scene);

  // The ambient floor, read off the arena's own lights rather than guessed.
  let ambient = 0;
  scene.traverse((obj) => {
    if (obj instanceof THREE.AmbientLight) ambient += obj.intensity * luma(obj.color);
    // A hemisphere light gives a downward-facing/away face roughly its ground
    // colour; take the darker of the two hemispheres as the away-side floor.
    else if (obj instanceof THREE.HemisphereLight) {
      ambient += obj.intensity * Math.min(luma(obj.color), luma(obj.groundColor));
    }
  });
  if (ambient <= 0) {
    throw new Error('no ambient/hemisphere light found in the farcrysis scene - the crush floor cannot be computed');
  }

  const rows: Row[] = [];
  const seen = new Set<string>();
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    // Nothing invisible can crush a frame: the collision/raycast proxies
    // (`collisionProxy: true`, the idiom this arena uses 13 times) and any
    // hidden mesh are excluded, or the report ranks geometry nobody sees.
    if (!obj.visible || obj.userData?.collisionProxy === true) return;
    let hidden = false;
    for (let p = obj.parent; p; p = p.parent) if (!p.visible) hidden = true;
    if (hidden) return;
    const mat = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as THREE.MeshStandardMaterial;
    if (!mat?.color) return;
    const geom = obj.geometry as THREE.BufferGeometry;
    const index = geom.getIndex();
    const posAttr = geom.getAttribute('position');
    if (!posAttr) return;
    const triangles = Math.floor((index ? index.count : posAttr.count) / 3);
    const instances = (obj as THREE.InstancedMesh).isInstancedMesh
      ? (obj as THREE.InstancedMesh).count : 1;
    const colorLuma = luma(mat.color);
    const mapMean = meanMapReflectance(mat.map);
    const albedo = colorLuma * mapMean;
    const emissive = mat.emissive ? luma(mat.emissive) * (mat.emissiveIntensity ?? 1) : 0;
    const floor = albedo * ambient + emissive;
    const key = `${obj.name}#${rows.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      mesh: obj.name || '(unnamed)',
      instances,
      triangles,
      mass: triangles * instances,
      colorLuma: Number(colorLuma.toFixed(5)),
      mapMean: Number(mapMean.toFixed(5)),
      albedo: Number(albedo.toFixed(5)),
      emissive: Number(emissive.toFixed(5)),
      floor: Number(floor.toFixed(5)),
      crushed: floor < CRUSH_LUMA,
    });
  });

  const totalMass = rows.reduce((s, r) => s + r.mass, 0);
  const crushedMass = rows.filter((r) => r.crushed).reduce((s, r) => s + r.mass, 0);
  const worst = rows.filter((r) => r.crushed).sort((a, b) => b.mass - a.mass).slice(0, top);

  const report = {
    contract: 'farcrysis-albedo-floor-v1',
    measuredAt: new Date().toISOString(),
    ambient: Number(ambient.toFixed(5)),
    crushLuma: CRUSH_LUMA,
    meshes: rows.length,
    totalMass,
    crushedMass,
    crushedMassShare: Number((crushedMass / totalMass).toFixed(5)),
    worst,
  };

  console.log(`ambient=${report.ambient} crushLuma=${CRUSH_LUMA} meshes=${rows.length}`);
  console.log(`crushed mass ${crushedMass} / ${totalMass} = ${(report.crushedMassShare * 100).toFixed(2)}%`);
  for (const r of worst) {
    console.log(`  ${r.mesh.padEnd(40)} mass=${String(r.mass).padStart(8)}`
      + ` albedo=${r.albedo.toFixed(4)} emis=${r.emissive.toFixed(4)} floor=${r.floor.toFixed(4)}`);
  }

  if (outFlag >= 0) {
    const out = resolve(process.argv[outFlag + 1]);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${out}`);
  }
}

main();
