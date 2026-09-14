/**
 * Source 19 - Classic ray tracing in the browser (THREE.js-RayTracing-Renderer).
 * Row 21 aliases this row and adds no technique of its own.
 *
 * Primary source, read at the pinned revision on 2026-09-12:
 *   https://github.com/erichlof/THREE.js-RayTracing-Renderer @ 490ca0817ce31781df2cd36af2edcc2f36d9dfcc
 *   shaders/WhittedRayTracing_Fragment.glsl (14,588 bytes) and README.md (14,104 bytes).
 *   LICENSE: CC0-1.0, read in full - a public-domain dedication, the one source in this
 *   group whose expression could lawfully be adapted directly. We still wrote our own, and
 *   we do not use the author's or project's name to imply endorsement (CC0 s4a keeps the
 *   trademark carve-out).
 *
 * What the source's shader actually does, from reading it:
 *   - one `Material` record per surface carrying type, colour, metalness, roughness and IoR
 *     (WhittedRayTracing_Fragment.glsl line 23);
 *   - a bounded iterative bounce loop, `for (int bounces = 0; bounces < 12; bounces++)`
 *     (line 171) - recursion is flattened into iteration with a running colour mask;
 *   - direct lighting uses Blinn's halfway-vector modification of Phong (line 288);
 *   - CLEARCOAT is a dielectric coat over a diffuse base (line 316), METAL tints the
 *     reflection (line 336), TRANSPARENT refracts with ni = 1.0 air against the material IoR
 *     and splits energy by Fresnel reflectance Re / transmittance Tr (lines 155, 345-352).
 * This is Whitted-style classic ray tracing with the Hall shading model: deterministic,
 * low-noise, and explicitly NOT path tracing - it buys speed by giving up diffuse
 * interreflection, which the author states plainly and which we carry forward.
 *
 * COMPATIBILITY DIFFERENCE: the source is a WebGL2 fragment-shader renderer. A lab demo may
 * not own a renderer, and this repository forbids GLSL on its WebGPU path, so the tracer here
 * runs on the CPU at build time and presents its result as a DataTexture. The algorithm is
 * the same; the execution target and the resolution are not. No frame rate claim is made or
 * implied - the source's 60 fps target is an author claim about a GPU path we did not run.
 */

import { disposeGroup, type Demo, type DemoContext } from './types';

const WIDTH = 160;
const HEIGHT = 120;
const MAX_BOUNCES = 5;
const EPSILON = 1e-4;

type MaterialType = 'phong' | 'metal' | 'clearcoat' | 'transparent';

interface Sphere {
  cx: number; cy: number; cz: number; radius: number;
  type: MaterialType;
  colour: [number, number, number];
  ior: number;
}

interface Vec { x: number; y: number; z: number }

const SPHERES: Sphere[] = [
  { cx: -1.15, cy: 0.75, cz: 0, radius: 0.75, type: 'metal', colour: [0.94, 0.88, 0.72], ior: 1 },
  { cx: 0.15, cy: 0.85, cz: 0.35, radius: 0.85, type: 'transparent', colour: [0.92, 0.97, 0.95], ior: 1.52 },
  { cx: 1.5, cy: 0.6, cz: -0.4, radius: 0.6, type: 'clearcoat', colour: [0.75, 0.16, 0.14], ior: 1.4 },
];

const LIGHT: Vec = { x: -2.6, y: 4.4, z: 3.2 };
const SUN_COLOUR: [number, number, number] = [1.0, 0.95, 0.86];

function normalise(v: Vec): Vec {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Schlick's approximation of Fresnel reflectance - the Re/Tr split the source shader uses. */
function fresnelReflectance(cosine: number, ior: number): number {
  const r0 = ((1 - ior) / (1 + ior)) ** 2;
  return r0 + (1 - r0) * (1 - Math.abs(cosine)) ** 5;
}

interface Hit {
  t: number;
  point: Vec;
  normal: Vec;
  colour: [number, number, number];
  type: MaterialType;
  ior: number;
}

/** Nearest intersection against three quadrics and one checkered ground plane at y = 0. */
function intersect(origin: Vec, direction: Vec): Hit | null {
  let best: Hit | null = null;

  for (const sphere of SPHERES) {
    const ox = origin.x - sphere.cx;
    const oy = origin.y - sphere.cy;
    const oz = origin.z - sphere.cz;
    const b = 2 * (ox * direction.x + oy * direction.y + oz * direction.z);
    const c = ox * ox + oy * oy + oz * oz - sphere.radius * sphere.radius;
    const discriminant = b * b - 4 * c;
    if (discriminant < 0) continue;
    const root = Math.sqrt(discriminant);
    let t = (-b - root) / 2;
    if (t < EPSILON) t = (-b + root) / 2;
    if (t < EPSILON || (best && t >= best.t)) continue;
    const point = { x: origin.x + direction.x * t, y: origin.y + direction.y * t, z: origin.z + direction.z * t };
    best = {
      t,
      point,
      normal: normalise({ x: point.x - sphere.cx, y: point.y - sphere.cy, z: point.z - sphere.cz }),
      colour: sphere.colour,
      type: sphere.type,
      ior: sphere.ior,
    };
  }

  if (Math.abs(direction.y) > 1e-6) {
    const t = -origin.y / direction.y;
    if (t > EPSILON && (!best || t < best.t)) {
      const point = { x: origin.x + direction.x * t, y: 0, z: origin.z + direction.z * t };
      if (Math.abs(point.x) < 7 && point.z > -7 && point.z < 5) {
        const checker = (Math.floor(point.x) + Math.floor(point.z)) & 1;
        best = {
          t,
          point,
          normal: { x: 0, y: 1, z: 0 },
          colour: checker ? [0.82, 0.80, 0.76] : [0.14, 0.16, 0.19],
          type: 'phong',
          ior: 1,
        };
      }
    }
  }
  return best;
}

/** Pixel-perfect hard shadow: one occlusion ray to the light, no softening, no sampling. */
function inShadow(point: Vec, normal: Vec): boolean {
  const toLight = normalise({ x: LIGHT.x - point.x, y: LIGHT.y - point.y, z: LIGHT.z - point.z });
  const origin = {
    x: point.x + normal.x * 1e-3,
    y: point.y + normal.y * 1e-3,
    z: point.z + normal.z * 1e-3,
  };
  const hit = intersect(origin, toLight);
  // A transparent occluder does not fully block: the source's caustic path comes from
  // exactly this distinction, and a binary test here would paint black glass shadows.
  return hit !== null && hit.type !== 'transparent';
}

function shadeDirect(hit: Hit, view: Vec): [number, number, number] {
  const toLight = normalise({ x: LIGHT.x - hit.point.x, y: LIGHT.y - hit.point.y, z: LIGHT.z - hit.point.z });
  const lambert = Math.max(0, dot(hit.normal, toLight));
  const shadowed = lambert > 0 && inShadow(hit.point, hit.normal);
  const diffuse = shadowed ? 0.0 : lambert;
  // Blinn's halfway vector, as the source uses rather than Phong's reflection vector.
  const halfway = normalise({ x: toLight.x - view.x, y: toLight.y - view.y, z: toLight.z - view.z });
  const specular = shadowed ? 0 : Math.max(0, dot(hit.normal, halfway)) ** 48;
  const ambient = 0.12;
  return [
    hit.colour[0] * (diffuse * SUN_COLOUR[0] + ambient) + specular * 0.5,
    hit.colour[1] * (diffuse * SUN_COLOUR[1] + ambient) + specular * 0.5,
    hit.colour[2] * (diffuse * SUN_COLOUR[2] + ambient) + specular * 0.5,
  ];
}

/**
 * Iterative Whitted trace with a running colour mask, flattened exactly as the source
 * flattens recursion into a bounded bounce loop.
 */
function trace(origin: Vec, direction: Vec, maxBounces: number): [number, number, number] {
  let accumulated: [number, number, number] = [0, 0, 0];
  let mask: [number, number, number] = [1, 1, 1];
  let rayOrigin = origin;
  let rayDirection = direction;

  for (let bounce = 0; bounce < maxBounces; bounce += 1) {
    const hit = intersect(rayOrigin, rayDirection);
    if (!hit) {
      // Sky gradient stands in for the source's environment term.
      const t = Math.max(0, rayDirection.y);
      accumulated[0] += mask[0] * (0.36 + t * 0.34);
      accumulated[1] += mask[1] * (0.50 + t * 0.34);
      accumulated[2] += mask[2] * (0.72 + t * 0.24);
      break;
    }

    const direct = shadeDirect(hit, rayDirection);
    const cosine = dot(rayDirection, hit.normal);

    if (hit.type === 'metal') {
      // Metal contributes only a tinted reflection: no diffuse term at all.
      accumulated[0] += mask[0] * direct[0] * 0.12;
      accumulated[1] += mask[1] * direct[1] * 0.12;
      accumulated[2] += mask[2] * direct[2] * 0.12;
      mask = [mask[0] * hit.colour[0], mask[1] * hit.colour[1], mask[2] * hit.colour[2]];
      rayDirection = reflect(rayDirection, hit.normal);
      rayOrigin = offset(hit.point, rayDirection);
      continue;
    }

    if (hit.type === 'transparent') {
      const reflectance = fresnelReflectance(cosine, hit.ior);
      // Deterministic energy split: take the transmitted path and carry the reflected
      // fraction as a single-bounce specular term, so the image stays noise-free.
      const reflected = reflect(rayDirection, hit.normal);
      const reflectHit = intersect(offset(hit.point, reflected), reflected);
      if (reflectHit) {
        const reflectShade = shadeDirect(reflectHit, reflected);
        accumulated[0] += mask[0] * reflectance * reflectShade[0];
        accumulated[1] += mask[1] * reflectance * reflectShade[1];
        accumulated[2] += mask[2] * reflectance * reflectShade[2];
      }
      const entering = cosine < 0;
      const eta = entering ? 1 / hit.ior : hit.ior;
      const refracted = refract(rayDirection, entering ? hit.normal : negate(hit.normal), eta);
      if (!refracted) {
        rayDirection = reflected;
        rayOrigin = offset(hit.point, reflected);
        continue;
      }
      const transmitted = 1 - reflectance;
      mask = [
        mask[0] * hit.colour[0] * transmitted,
        mask[1] * hit.colour[1] * transmitted,
        mask[2] * hit.colour[2] * transmitted,
      ];
      rayDirection = refracted;
      rayOrigin = offset(hit.point, refracted);
      continue;
    }

    if (hit.type === 'clearcoat') {
      // A dielectric coat over a diffuse base: Fresnel decides how much of the coat's
      // mirror reflection is added on top of the painted layer.
      const reflectance = fresnelReflectance(cosine, hit.ior);
      accumulated[0] += mask[0] * direct[0] * (1 - reflectance);
      accumulated[1] += mask[1] * direct[1] * (1 - reflectance);
      accumulated[2] += mask[2] * direct[2] * (1 - reflectance);
      mask = [mask[0] * reflectance, mask[1] * reflectance, mask[2] * reflectance];
      rayDirection = reflect(rayDirection, hit.normal);
      rayOrigin = offset(hit.point, rayDirection);
      continue;
    }

    accumulated[0] += mask[0] * direct[0];
    accumulated[1] += mask[1] * direct[1];
    accumulated[2] += mask[2] * direct[2];
    break;
  }
  return accumulated;
}

function reflect(direction: Vec, normal: Vec): Vec {
  const d = 2 * dot(direction, normal);
  return normalise({
    x: direction.x - normal.x * d,
    y: direction.y - normal.y * d,
    z: direction.z - normal.z * d,
  });
}

function negate(v: Vec): Vec {
  return { x: -v.x, y: -v.y, z: -v.z };
}

function offset(point: Vec, direction: Vec): Vec {
  return {
    x: point.x + direction.x * 1e-3,
    y: point.y + direction.y * 1e-3,
    z: point.z + direction.z * 1e-3,
  };
}

function refract(direction: Vec, normal: Vec, eta: number): Vec | null {
  const cosine = -dot(direction, normal);
  const k = 1 - eta * eta * (1 - cosine * cosine);
  if (k < 0) return null; // total internal reflection
  const scale = eta * cosine - Math.sqrt(k);
  return normalise({
    x: eta * direction.x + normal.x * scale,
    y: eta * direction.y + normal.y * scale,
    z: eta * direction.z + normal.z * scale,
  });
}

function renderPanel(maxBounces: number): Uint8Array {
  const data = new Uint8Array(WIDTH * HEIGHT * 4);
  const cameraPosition: Vec = { x: 0, y: 1.5, z: 5.2 };
  const aspect = WIDTH / HEIGHT;
  const scale = Math.tan((42 * Math.PI) / 180 / 2);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const ndcX = ((x + 0.5) / WIDTH) * 2 - 1;
      const ndcY = 1 - ((y + 0.5) / HEIGHT) * 2;
      const direction = normalise({
        x: ndcX * aspect * scale,
        y: ndcY * scale - 0.16,
        z: -1,
      });
      const colour = trace(cameraPosition, direction, maxBounces);
      const index = (y * WIDTH + x) * 4;
      // Reinhard tone curve then sRGB-ish encode, done here because the demo must not
      // touch the host renderer's tone mapping.
      for (let channel = 0; channel < 3; channel += 1) {
        const mapped = colour[channel] / (1 + colour[channel]);
        data[index + channel] = Math.round(255 * Math.min(1, Math.max(0, mapped ** (1 / 2.2))));
      }
      data[index + 3] = 255;
    }
  }
  return data;
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const root = new THREE.Group();
  root.name = 'source-19-classic-ray-tracing';

  const textures: import('three').DataTexture[] = [];

  function panel(maxBounces: number, x: number, label: string): void {
    const texture = new THREE.DataTexture(renderPanel(maxBounces), WIDTH, HEIGHT, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.needsUpdate = true;
    textures.push(texture);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2 * (HEIGHT / WIDTH)),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    );
    mesh.name = label;
    mesh.position.set(x, 1.4, 0);
    root.add(mesh);
  }

  // Before: the identical tracer stopped at the first hit - direct lighting only, which is
  // what the scene looks like without the recursive transport that defines the technique.
  panel(1, -1.75, 'direct-only');
  // After: full Whitted recursion - mirror reflection, refraction with Fresnel split, and
  // the light transmitted through glass onto the floor.
  panel(MAX_BOUNCES, 1.75, 'whitted-recursive');

  return {
    root,
    dispose: () => {
      disposeGroup(root);
      for (const texture of textures) texture.dispose();
    },
    metadata: {
      sourceId: 19,
      title: 'Classic ray tracing in the browser (THREE.js-RayTracing-Renderer)',
      method:
        'Whitted-style classic ray tracing with the Hall shading model: a bounded iterative '
        + 'bounce loop with a running colour mask, Blinn-Phong direct lighting, hard shadow '
        + 'rays that let transparent occluders pass, mirror reflection for metal, a '
        + 'Fresnel-weighted dielectric coat for clearcoat, and refraction with a Schlick '
        + 'Fresnel energy split and total-internal-reflection handling. Left panel is the same '
        + 'tracer limited to one bounce (direct lighting only); right panel is the full '
        + 'recursion.',
      adaptation: 'adapted',
      sources: [
        'https://github.com/erichlof/THREE.js-RayTracing-Renderer',
        'https://raw.githubusercontent.com/erichlof/THREE.js-RayTracing-Renderer/490ca0817ce31781df2cd36af2edcc2f36d9dfcc/shaders/WhittedRayTracing_Fragment.glsl',
      ],
      limitation:
        'Traced on the CPU at 160x120 into a DataTexture, not in a WebGL2 fragment shader: a '
        + 'lab demo owns no renderer. No BVH, no quadric shapes beyond spheres, no depth of '
        + 'field, and no performance claim - the source\'s 60 fps target describes its GPU '
        + 'path and was not measured here. Classic ray tracing has no diffuse global '
        + 'illumination, which the source states and this demo inherits.',
      localLights: [],
    },
  };
}

export default createDemo;
