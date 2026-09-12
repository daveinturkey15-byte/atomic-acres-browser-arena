import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
require('tsx/cjs');

export const THREE = require('three');
export const {
  applyShedExplosion,
  applyShedSheetImpact,
  createInitialShedState,
  SHED_PANEL_COORD_Q,
} = require('../../../src/destructible-world.ts');
export const { panelCoordinates } = require('../../../src/interactive-world-runtime.ts');
export const { FIELD_SHED_DEFINITION } = require('../../../src/destructible-shed-definition.ts');
export const { PASS65_SHED_PLACEMENTS } = require('../../../src/destructible-shed-registry.ts');
export const {
  createFieldShedPresentation,
  createRawShedPanelShapeForQA,
  panelBasis,
  panelShape,
} = require('../../../src/destructible-shed-presentation.ts');

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const RAY_COUNT = 20_400;

export function placementFor(id = 'nuketown2-shed-north-yard') {
  const placement = PASS65_SHED_PLACEMENTS.find((candidate) => candidate.id === id);
  if (!placement) throw new Error(`Unknown registered shed placement: ${id}`);
  return placement;
}

export function stateFor(placement, { apertures = [], detached = [] } = {}) {
  let state = createInitialShedState(FIELD_SHED_DEFINITION, placement, 901);
  for (const item of apertures) {
    const result = applyShedSheetImpact(FIELD_SHED_DEFINITION, state, {
      isHost: true,
      matchEpoch: state.matchEpoch,
      expectedRevision: state.revision,
      surfaceId: item.surfaceId,
      uQ: item.uQ,
      vQ: item.vQ,
      radiusUQ: item.radiusUQ,
      radiusVQ: item.radiusVQ,
      damageQ: item.damageQ ?? 60,
      penetrationEnergyQ: item.penetrationEnergyQ ?? 70,
    });
    if (!result.accepted) throw new Error(`Aperture mutation rejected: ${result.reason}`);
    state = result.state;
  }
  for (const requestedId of detached) {
    const surface = FIELD_SHED_DEFINITION.surfaces.find((candidate) => (
      candidate.id === requestedId || candidate.detachableChunkId === requestedId
    ));
    if (!surface) throw new Error(`Unknown detachable surface/chunk: ${requestedId}`);
    const result = applyShedExplosion(FIELD_SHED_DEFINITION, state, {
      isHost: true,
      matchEpoch: state.matchEpoch,
      expectedRevision: state.revision,
      surfaceId: surface.id,
      damageQ: FIELD_SHED_DEFINITION.thresholds.detachDamageQ,
    });
    if (!result.accepted) throw new Error(`Detach mutation rejected: ${result.reason}`);
    state = result.state;
  }
  return state;
}

export function parseApertures(value) {
  if (!value) return [];
  return value.split(';').filter(Boolean).map((entry) => {
    const separator = entry.indexOf(':');
    if (separator <= 0) throw new Error(`Invalid aperture: ${entry}`);
    const surfaceId = entry.slice(0, separator);
    const values = entry.slice(separator + 1).split(',').map(Number);
    if (values.length !== 4 || values.some((number) => !Number.isInteger(number))) {
      throw new Error(`Invalid aperture tuple: ${entry}`);
    }
    const [uQ, vQ, radiusUQ, radiusVQ] = values;
    return { surfaceId, uQ, vQ, radiusUQ, radiusVQ };
  });
}

export function parseIds(value) {
  return value ? value.split(',').map((entry) => entry.trim()).filter(Boolean) : [];
}

export function buildPanelGeometry(surface, surfaceState, { world = false } = {}) {
  const geometry = new THREE.ShapeGeometry(panelShape(surface, surfaceState), 18);
  if (world) geometry.applyMatrix4(panelBasis(surface));
  geometry.computeVertexNormals();
  return geometry;
}

export function indexedTriangles(geometry) {
  return Math.floor((geometry.index?.count ?? 0) / 3);
}

export function panelTriangles(state) {
  return Object.fromEntries(FIELD_SHED_DEFINITION.surfaces.map((surface) => {
    const surfaceState = state.surfaces.find((candidate) => candidate.surfaceId === surface.id);
    if (!surfaceState || surface.role === 'door' || surfaceState.stage === 'detached') return [surface.id, 0];
    const geometry = buildPanelGeometry(surface, surfaceState);
    const triangles = indexedTriangles(geometry);
    geometry.dispose();
    return [surface.id, triangles];
  }));
}

function fibonacciDirection(index, count) {
  const y = (index + 0.5) / count;
  const radial = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(Math.cos(theta) * radial, y, Math.sin(theta) * radial);
}

export function escapeFraction(state, placement) {
  const presentation = createFieldShedPresentation(placement, state);
  const shell = presentation.root.getObjectByName('field-shed-damageable-shell');
  const door = presentation.root.getObjectByName('field-shed-door-leaf');
  if (!shell || !door) throw new Error('Shed envelope missing from presentation');
  presentation.root.updateMatrixWorld(true);
  const origin = new THREE.Vector3(0, 1.6, 0).applyMatrix4(presentation.root.matrixWorld);
  const rootRotation = new THREE.Quaternion().setFromRotationMatrix(presentation.root.matrixWorld);
  const raycaster = new THREE.Raycaster(undefined, undefined, 0, 12);
  let escaped = 0;
  for (let index = 0; index < RAY_COUNT; index += 1) {
    const direction = fibonacciDirection(index, RAY_COUNT).applyQuaternion(rootRotation).normalize();
    raycaster.set(origin, direction);
    if (raycaster.intersectObjects([shell, door], true).length === 0) escaped += 1;
  }
  presentation.dispose();
  return { escaped, total: RAY_COUNT, fraction: escaped / RAY_COUNT };
}

export function holeAreaStillSolid(state, placement) {
  const presentation = createFieldShedPresentation(placement, state);
  const shell = presentation.root.getObjectByName('field-shed-damageable-shell');
  if (!shell) throw new Error('Shed shell missing from presentation');
  presentation.root.updateMatrixWorld(true);
  const rootRotation = new THREE.Quaternion().setFromRotationMatrix(presentation.root.matrixWorld);
  const rootInverse = presentation.root.matrixWorld.clone().invert();
  let apertures = 0;
  let solid = 0;
  for (const surfaceState of state.surfaces) {
    for (const aperture of surfaceState.apertures) {
      apertures += 1;
      const surface = FIELD_SHED_DEFINITION.surfaces.find((candidate) => candidate.id === surfaceState.surfaceId);
      if (!surface || surfaceState.stage === 'detached') continue;
      const centre = new THREE.Vector3(surface.frame.centre.x, surface.frame.centre.y, surface.frame.centre.z)
        .addScaledVector(new THREE.Vector3(surface.frame.uAxis.x, surface.frame.uAxis.y, surface.frame.uAxis.z), aperture.uQ / SHED_PANEL_COORD_Q * surface.frame.halfU)
        .addScaledVector(new THREE.Vector3(surface.frame.vAxis.x, surface.frame.vAxis.y, surface.frame.vAxis.z), aperture.vQ / SHED_PANEL_COORD_Q * surface.frame.halfV);
      const normal = new THREE.Vector3().crossVectors(
        new THREE.Vector3(surface.frame.uAxis.x, surface.frame.uAxis.y, surface.frame.uAxis.z),
        new THREE.Vector3(surface.frame.vAxis.x, surface.frame.vAxis.y, surface.frame.vAxis.z),
      ).normalize();
      const origin = centre.clone().addScaledVector(normal, -0.08).applyMatrix4(presentation.root.matrixWorld);
      const direction = normal.clone().applyQuaternion(rootRotation).normalize();
      const raycaster = new THREE.Raycaster(origin, direction, 0, 0.3);
      if (raycaster.intersectObject(shell, false).length > 0) solid += 1;
    }
  }
  presentation.dispose();
  return { apertures, solid, fraction: apertures === 0 ? 0 : solid / apertures };
}

export function rawCollapsedSelfTest() {
  const surface = FIELD_SHED_DEFINITION.surfaces.find((candidate) => candidate.id === 'wall-east');
  const state = stateFor(placementFor(), {
    apertures: [0, 1, 2].map(() => ({ surfaceId: 'wall-east', uQ: 0, vQ: 0, radiusUQ: 300, radiusVQ: 300 })),
  });
  const surfaceState = state.surfaces.find((candidate) => candidate.surfaceId === surface.id);
  const shape = createRawShedPanelShapeForQA(surface, surfaceState);
  const geometry = new THREE.ShapeGeometry(shape, 18);
  const triangles = indexedTriangles(geometry);
  geometry.dispose();
  return triangles;
}

export function gateOneState(placement) {
  return stateFor(placement, {
    apertures: [0, 1, 2].map(() => ({ surfaceId: 'wall-east', uQ: 0, vQ: 0, radiusUQ: 700, radiusVQ: 700 })),
  });
}
