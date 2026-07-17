import * as THREE from 'three';
import { ARENA_ROUTE_IDENTITIES } from './world-identity';

export type WorldIdentityPresentation = {
  root: THREE.Group;
  routeLights: number;
  routeSigns: number;
  cueInstances: number;
  atmosphericParticles: number;
};

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function routeSignAtlasTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    const data = new Uint8Array(ARENA_ROUTE_IDENTITIES.flatMap((route) => [
      (route.primaryColor >> 16) & 0xff,
      (route.primaryColor >> 8) & 0xff,
      route.primaryColor & 0xff,
      255,
    ]));
    const texture = new THREE.DataTexture(data, ARENA_ROUTE_IDENTITIES.length, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  const segmentWidth = 512;
  const canvas = document.createElement('canvas');
  canvas.width = segmentWidth * ARENA_ROUTE_IDENTITIES.length;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable for route-sign atlas');

  ARENA_ROUTE_IDENTITIES.forEach((route, index) => {
    const x = index * segmentWidth;
    context.fillStyle = '#0a1012';
    context.fillRect(x, 0, segmentWidth, canvas.height);
    context.fillStyle = cssColor(route.primaryColor);
    context.fillRect(x, 0, 18, canvas.height);
    context.fillStyle = cssColor(route.secondaryColor);
    context.fillRect(x + 18, 0, 9, canvas.height);
    context.strokeStyle = 'rgba(234,244,238,0.55)';
    context.lineWidth = 5;
    context.strokeRect(x + 4, 4, segmentWidth - 8, canvas.height - 8);
    context.fillStyle = '#eaf4ee';
    context.font = '700 66px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(route.label, x + segmentWidth * 0.54, canvas.height * 0.53, segmentWidth - 64);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createRouteSignMesh(): THREE.Mesh {
  const signTransforms: Record<string, readonly [number, number, number, number]> = {
    'west-cultivation': [-30.82, 6.55, 8.5, Math.PI / 2],
    'central-transit': [0, 5.96, 0.18, 0],
    'east-service': [26.82, 6.15, -7.5, -Math.PI / 2],
  };
  const local = [
    new THREE.Vector3(-2.3, -0.48, 0),
    new THREE.Vector3(2.3, -0.48, 0),
    new THREE.Vector3(2.3, 0.48, 0),
    new THREE.Vector3(-2.3, 0.48, 0),
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  ARENA_ROUTE_IDENTITIES.forEach((route, index) => {
    const [x, y, z, yaw] = signTransforms[route.id];
    const matrix = new THREE.Matrix4().makeRotationY(yaw);
    matrix.setPosition(x, y, z);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(matrix);
    local.forEach((point) => {
      const world = point.clone().applyMatrix4(matrix);
      positions.push(world.x, world.y, world.z);
      normals.push(normal.x, normal.y, normal.z);
    });
    const u0 = index / ARENA_ROUTE_IDENTITIES.length;
    const u1 = (index + 1) / ARENA_ROUTE_IDENTITIES.length;
    uvs.push(u0, 0, u1, 0, u1, 1, u0, 1);
    const base = index * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({
    map: routeSignAtlasTexture(),
    transparent: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Pass 27 route-sign atlas';
  mesh.frustumCulled = true;
  return mesh;
}

export function createWorldIdentityPresentation(
  scene: THREE.Scene,
  routeLightIntensity: number,
  reducedMode: boolean,
): WorldIdentityPresentation {
  const root = new THREE.Group();
  root.name = 'pass27-world-identity-presentation';

  for (const route of ARENA_ROUTE_IDENTITIES) {
    const light = new THREE.PointLight(route.secondaryColor, routeLightIntensity, 13, 2);
    light.name = `route-light-${route.id}`;
    const [x, z] = route.cuePositions[Math.floor(route.cuePositions.length / 2)];
    light.position.set(x, route.id === 'central-transit' ? 5.6 : 3.3, z);
    light.castShadow = false;
    if (reducedMode) light.intensity *= 0.7;
    root.add(light);
  }

  // One atlas-backed mesh carries all three route signs. Route cues and contact
  // grounding already exist in the authored GLB, avoiding redundant runtime draws.
  root.add(createRouteSignMesh());
  scene.add(root);
  return {
    root,
    routeLights: ARENA_ROUTE_IDENTITIES.length,
    routeSigns: ARENA_ROUTE_IDENTITIES.length,
    cueInstances: 0,
    atmosphericParticles: 0,
  };
}
