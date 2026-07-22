import * as THREE from 'three';
import { HOUSE_LAYOUT } from './arena-layout';
import type { ArenaLightingProfile } from './blender-lighting';
import { createHouseArchitecture } from './house-navigation';
import { ARENA_ROUTE_IDENTITIES } from './world-identity';

export type WorldIdentityPresentation = {
  root: THREE.Group;
  routeLights: number;
  routeSigns: number;
  cueInstances: number;
  atmosphericParticles: number;
  practicalLights: number;
  streetLights: number;
  interiorLights: number;
  fixtureInstances: number;
  ceilingInstances: number;
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

function createRouteSignSupports(): THREE.InstancedMesh {
  // West/east atlas signs previously hovered without visible mounting. Ground
  // each boundary sign on a slim authored post; the central sign already sits
  // on the Civic Transit gantry.
  const placements: readonly (readonly [number, number, number])[] = [
    [-30.82, 6.55, 8.5],
    [26.82, 6.15, -7.5],
  ];
  const geometry = new THREE.BoxGeometry(0.2, 1, 0.2);
  const material = new THREE.MeshStandardMaterial({ color: 0x20292c, roughness: 0.66, metalness: 0.58 });
  const supports = new THREE.InstancedMesh(geometry, material, placements.length);
  supports.name = 'pass32-grounded-route-sign-posts';
  const matrix = new THREE.Matrix4();
  placements.forEach(([x, signY, z], index) => {
    const height = signY - 0.48;
    matrix.compose(
      new THREE.Vector3(x, height / 2, z),
      new THREE.Quaternion(),
      new THREE.Vector3(1, height, 1),
    );
    supports.setMatrixAt(index, matrix);
  });
  supports.instanceMatrix.needsUpdate = true;
  supports.castShadow = true;
  supports.receiveShadow = true;
  supports.userData.presentationOnly = true;
  supports.userData.blocksShots = false;
  return supports;
}

export function createWorldIdentityPresentation(
  scene: THREE.Scene,
  lighting: ArenaLightingProfile,
  softwareRenderer = false,
): WorldIdentityPresentation {
  const root = new THREE.Group();
  root.name = 'pass27-world-identity-presentation';

  const practicalAnchors: Record<string, readonly [number, number, number]> = {
    'west-cultivation': [-25.5, 3.65, 16],
    'central-transit': [0, 5.35, 0.18],
    'east-service': [26.8, 3.75, -11.8],
  };
  const admittedRouteLights = softwareRenderer ? 0 : lighting.routeLightCount;
  for (const route of ARENA_ROUTE_IDENTITIES.slice(0, admittedRouteLights)) {
    const light = new THREE.PointLight(route.secondaryColor, lighting.routeLightIntensity, 13, 2);
    light.name = `route-light-${route.id}`;
    light.position.set(...practicalAnchors[route.id]);
    light.castShadow = false;
    root.add(light);
  }

  // These anchors exactly match the four authored streetlamp lenses in
  // environment-assets.ts. They are presentation-only pools rather than route,
  // objective or team markers.
  const streetAnchors: readonly (readonly [number, number, number])[] = [
    [-12, 5.08, -16],
    [12, 5.08, 16],
    [-12, 5.08, 22],
    [12, 5.08, -22],
  ];
  const admittedStreetLights = softwareRenderer ? 0 : Math.min(lighting.streetLightCount, streetAnchors.length);
  for (let index = 0; index < admittedStreetLights; index += 1) {
    const light = new THREE.PointLight(0xffd2a0, lighting.streetLightIntensity, 14.5, 2);
    light.name = `street-light-${index + 1}`;
    light.position.set(...streetAnchors[index]);
    light.castShadow = false;
    root.add(light);
  }

  const houses = HOUSE_LAYOUT.map((entry) => createHouseArchitecture(entry.team, entry.x, entry.z, entry.facing));
  const fixtureGeometry = new THREE.BoxGeometry(2.2, 0.06, 0.72);
  const fixtureMaterial = new THREE.MeshBasicMaterial({ color: 0xffdca0, toneMapped: false });
  const fixtureCount = houses.reduce((total, house) => total + house.rooms.length, 0);
  const fixtures = new THREE.InstancedMesh(fixtureGeometry, fixtureMaterial, fixtureCount);
  fixtures.name = 'pass29-interior-ceiling-panels';
  fixtures.castShadow = false;
  fixtures.receiveShadow = false;
  fixtures.userData.presentationOnly = true;
  fixtures.userData.blocksShots = false;
  const matrix = new THREE.Matrix4();
  let fixtureIndex = 0;
  for (const house of houses) {
    for (const room of house.rooms) {
      matrix.makeTranslation(room.centre[0], room.level === 'upper' ? 6.66 : 3.18, room.centre[2]);
      fixtures.setMatrixAt(fixtureIndex, matrix);
      fixtureIndex += 1;
    }
  }
  fixtures.instanceMatrix.needsUpdate = true;
  root.add(fixtures);

  const ceilingPlacements = [
    ...houses.flatMap((house) => house.rooms
      .filter((room) => room.level === 'upper')
      .map((room) => ({ x: room.centre[0], y: 6.72, z: room.centre[2], width: room.size[0] - 0.5, depth: room.size[1] - 0.35 }))),
    ...houses.flatMap((house) => house.solids
      .filter((solid) => solid.name.startsWith('upper-floor-'))
      .map((solid) => ({ x: solid.position[0], y: 3.28, z: solid.position[2], width: solid.size[0], depth: solid.size[2] }))),
  ];
  const ceilingGeometry = new THREE.BoxGeometry(1, 0.08, 1);
  const ceilingMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8d1bd,
    roughness: 0.94,
    metalness: 0,
    emissive: 0x17120c,
    emissiveIntensity: 0.18,
  });
  const ceilings = new THREE.InstancedMesh(ceilingGeometry, ceilingMaterial, ceilingPlacements.length);
  ceilings.name = 'pass29-structural-room-ceilings';
  ceilings.castShadow = false;
  ceilings.receiveShadow = true;
  ceilings.userData.presentationOnly = true;
  ceilings.userData.blocksShots = false;
  ceilingPlacements.forEach((placement, index) => {
    matrix.compose(
      new THREE.Vector3(placement.x, placement.y, placement.z),
      new THREE.Quaternion(),
      new THREE.Vector3(placement.width, 1, placement.depth),
    );
    ceilings.setMatrixAt(index, matrix);
  });
  ceilings.instanceMatrix.needsUpdate = true;
  root.add(ceilings);

  const admittedInteriorLights = softwareRenderer ? 0 : lighting.interiorLightCount;
  if (admittedInteriorLights === 2) {
    for (const house of houses) {
      const light = new THREE.PointLight(0xffd6a2, lighting.interiorLightIntensity, 11.5, 2);
      light.name = `interior-light-${house.id}-broad`;
      light.position.set(house.origin.x, 3.1, house.origin.z);
      light.castShadow = false;
      root.add(light);
    }
  } else if (admittedInteriorLights === 4) {
    for (const house of houses) {
      for (const [level, y] of [['ground', 2.75], ['upper', 6.12]] as const) {
        const light = new THREE.PointLight(0xffd6a2, lighting.interiorLightIntensity, 9.4, 2);
        light.name = `interior-light-${house.id}-${level}`;
        light.position.set(house.origin.x, y, house.origin.z);
        light.castShadow = false;
        root.add(light);
      }
    }
  }

  // One atlas-backed mesh carries all three route signs. Route cues and contact
  // grounding already exist in the authored GLB, avoiding redundant runtime draws.
  root.add(createRouteSignMesh(), createRouteSignSupports());
  scene.add(root);
  return {
    root,
    routeLights: admittedRouteLights,
    routeSigns: ARENA_ROUTE_IDENTITIES.length,
    cueInstances: 0,
    atmosphericParticles: 0,
    practicalLights: admittedRouteLights + admittedStreetLights,
    streetLights: admittedStreetLights,
    interiorLights: admittedInteriorLights,
    fixtureInstances: fixtureCount,
    ceilingInstances: ceilingPlacements.length,
  };
}
