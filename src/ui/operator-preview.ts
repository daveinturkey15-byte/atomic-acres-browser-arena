import * as THREE from 'three';
import {
  createRiggedOperator,
  loadOperatorSkinAsset,
  loadRiggedOperatorAsset,
  operatorSkinAssetReady,
  riggedOperatorAssetReady,
  updateRiggedOperator,
} from '../operator-model';
import { OPERATOR_SKIN_CATALOG } from '../operator-skin-catalog';
import { operatorSkinPortraitMarkup } from './operator-skin-portrait';
import { isOperatorStanceId, operatorStance } from '../operator-appearance-catalog'; // HF-382
import { activeOperatorStance, setActiveOperatorStance } from '../operator-stance-runtime'; // HF-382
import { createOperatorWeaponPresentation } from '../art-kit';
import { loadPass65WeaponPresentation } from '../weapon-model';

/**
 * HF-366 - the 3D half of "Should be a 2d and 3d preview ... i have no idea
 * what i look like".
 *
 * Shows the SELECTED operator wearing the SELECTED skin, turning slowly, and
 * re-reads the selection whenever a skin card is pressed. The arena cards next
 * door use prerecorded video because their subject is a whole streamed arena;
 * an operator is one already-loaded rigged GLB, so a live turntable is both
 * cheaper and the only thing that can actually answer "what do I look like".
 *
 * Cost discipline, because this sits in a menu that must stay cheap:
 *  - the renderer is created lazily, on the first frame the OPERATOR panel is
 *    actually visible, and never at all if the player never opens that tab;
 *  - the loop runs only while the panel is visible and the tab is in the
 *    foreground, and is torn down with the panel;
 *  - one directional light, no shadows, no post, capped device pixel ratio.
 *
 * Presentation only. Nothing here touches the authoritative selection - the
 * lobby-skin replication path in the main shell remains the only writer.
 */

export const OPERATOR_PREVIEW_CANVAS_ID = 'operator-preview-canvas';
export const OPERATOR_PREVIEW_STATUS_ID = 'operator-preview-status';
/** The 2D half: the pressed skin's card art, shown beside the turntable. */
export const OPERATOR_PREVIEW_PORTRAIT_ID = 'operator-preview-portrait';
export const OPERATOR_PREVIEW_PANEL_ID = 'menu-panel-operator';
export const OPERATOR_PREVIEW_CONTRACT = 'live-turntable-selected-skin-stance-v2';
/** Slow enough to read the silhouette, fast enough to show the back. */
export const OPERATOR_PREVIEW_TURN_RADIANS_PER_SECOND = 0.42;
/**
 * The authored operator faces away from +Z in its own space, so the turntable
 * starts half a turn round: the player sees their own front first and the back
 * comes round after, rather than opening on the back of a head.
 */
export const OPERATOR_PREVIEW_FACING_OFFSET_RADIANS = Math.PI;
const PREVIEW_MAX_PIXEL_RATIO = 1.75;
/**
 * HF-366 second pass. Three things made the first turntable read as "another
 * grey silhouette" even though it was loading the right GLB:
 *
 *  1. no environment. The authored operator materials are PBR with a metalness
 *     map; three lights and no IBL give a dark, matte, colourless result, which
 *     is why every skin came out the same near-black in the panel while the
 *     same asset looks fine in an arena that HAS an environment;
 *  2. no tone mapping, so what light there was clipped instead of rolling off;
 *  3. a hard-coded camera that framed the operator by guesswork - the figure
 *     sat left of centre and was cut off at the knees.
 *
 * All three are fixed below. The environment is a four-stop vertical gradient
 * rendered once into a PMREM; it costs one small render at first paint and is
 * disposed with the panel.
 */
const PREVIEW_ENVIRONMENT_CONTRACT = 'gradient-pmrem-showcase-v1';
/** Fraction of the frame height the operator fills. */
const PREVIEW_FILL = 0.86;

function buildPreviewEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture | null {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#cfe6f2');
  gradient.addColorStop(0.45, '#8fa6b4');
  gradient.addColorStop(0.62, '#4a5a63');
  gradient.addColorStop(1, '#171f24');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const equirect = new THREE.CanvasTexture(canvas);
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  equirect.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    return pmrem.fromEquirectangular(equirect).texture;
  } catch {
    return null;
  } finally {
    pmrem.dispose();
    equirect.dispose();
  }
}

export type OperatorPreviewHandle = Readonly<{
  setSkin: (skinId: string) => void;
  /** HF-382: selects the idle stance the turntable plays. */
  setStance: (stanceId: string) => void;
  /** Advances the turntable by dt seconds; exposed for deterministic tests. */
  advance: (dt: number) => void;
  dispose: () => void;
  state: () => Readonly<{
    contract: string;
    skinId: string;
    stanceId: string;
    mounted: boolean;
    rendererCreated: boolean;
    running: boolean;
    modelReady: boolean;
    turnRadians: number;
  }>;
}>;

function isSelectable(skinId: string): boolean {
  return OPERATOR_SKIN_CATALOG.definitions
    .some((definition) => definition.id === skinId && definition.availability === 'selectable');
}

/**
 * Reads the panel's own pressed card rather than taking a skin argument, so the
 * preview cannot disagree with the cards the player is looking at.
 */
export function selectedOperatorSkinFrom(root: ParentNode): string {
  const pressed = root.querySelector<HTMLElement>('[data-operator-skin][aria-pressed="true"]');
  const skinId = pressed?.dataset.operatorSkin ?? 'default';
  return isSelectable(skinId) ? skinId : 'default';
}

export function mountOperatorPreview(root: ParentNode = document): OperatorPreviewHandle | null {
  const canvas = root.querySelector<HTMLCanvasElement>(`#${OPERATOR_PREVIEW_CANVAS_ID}`);
  const panel = root.querySelector<HTMLElement>(`#${OPERATOR_PREVIEW_PANEL_ID}`);
  if (!canvas || !panel) return null;
  const status = root.querySelector<HTMLElement>(`#${OPERATOR_PREVIEW_STATUS_ID}`);
  const portrait = root.querySelector<HTMLElement>(`#${OPERATOR_PREVIEW_PORTRAIT_ID}`);

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let stage: THREE.Group | null = null;
  let model: THREE.Object3D | null = null;
  let environment: THREE.Texture | null = null;
  let skinId = selectedOperatorSkinFrom(root);
  let requestedSkinId = skinId;
  // HF-382: the turntable tracks the pressed IDLE STANCE card the same way it
  // tracks the pressed skin card, so the selector visibly changes the pose.
  let stanceId = activeOperatorStance();
  let requestedStanceId = stanceId;
  let turnRadians = 0;
  let running = false;
  let disposed = false;
  let frame = 0;
  let lastFrameMs = 0;
  let loading = false;

  const setStatus = (text: string): void => {
    if (status) status.textContent = text;
  };

  const panelVisible = (): boolean => !panel.hidden && panel.offsetParent !== null;

  const frameModel = (): void => {
    if (!model || !camera || !stage) return;
    // Measure UNROTATED. The turntable spins the stage every frame, so a box
    // taken mid-turn would centre the figure for one angle and swing it off
    // frame for every other one.
    const spin = stage.rotation.y;
    stage.rotation.y = 0;
    model.position.x = 0;
    stage.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    stage.rotation.y = spin;
    if (box.isEmpty()) return;
    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(centre);
    const height = Math.max(0.4, size.y);
    // Distance that puts `height / PREVIEW_FILL` across the vertical FOV, plus
    // enough room that a turning figure's shoulders never clip the frame.
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const radius = Math.max(size.x, size.z) / 2;
    const distance = (height / PREVIEW_FILL / 2) / Math.tan(halfFov) + radius;
    camera.position.set(0, centre.y, distance);
    camera.lookAt(0, centre.y, 0);
    camera.updateProjectionMatrix();
    // Put the figure's own centre on the turntable axis, so it rotates in place
    // instead of orbiting a point it does not stand on.
    model.position.x = -centre.x;
    model.position.z = -centre.z;
    stage.updateMatrixWorld(true);
  };

  /**
   * The authored idle is `Idle_Gun_Pointing` - "rifle up and levelled". Without
   * a rifle it reads as an operator reaching into empty space, which is how the
   * first turntable looked. The world-variant carbine is the same model every
   * other player already sees in your hands, so mounting it here costs one
   * cached asset and makes the pose mean what it is.
   */
  const mountPreviewWeapon = (instance: { weaponSocket: THREE.Group }): void => {
    const attach = (): void => {
      if (disposed || !model) return;
      const weapon = createOperatorWeaponPresentation('carbine', false);
      if (!weapon) return;
      instance.weaponSocket.add(weapon);
      // Deliberately NOT re-framing here. The framing box is the OPERATOR, and
      // a levelled rifle sticks a metre forward of the chest: including it
      // pushed the body sideways to make room for the barrel.
    };
    attach();
    if (instance.weaponSocket.children.length === 0) {
      void loadPass65WeaponPresentation('carbine', 'world').then(attach).catch(() => undefined);
    }
  };

  const ensureRenderer = (): boolean => {
    if (renderer) return true;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      // A menu preview must never be the thing that breaks the menu. Without a
      // context the 2D portraits still describe every skin.
      setStatus('Live preview unavailable on this device; the card art shows each skin.');
      canvas.hidden = true;
      return false;
    }
    renderer.setPixelRatio(Math.min(PREVIEW_MAX_PIXEL_RATIO, globalThis.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = false;
    scene = new THREE.Scene();
    environment = buildPreviewEnvironment(renderer);
    if (environment) {
      scene.environment = environment;
      scene.environmentIntensity = 1.15;
    }
    canvas.dataset.previewEnvironment = environment ? PREVIEW_ENVIRONMENT_CONTRACT : 'none';
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    camera.position.set(0, 1.02, 3.05);
    camera.lookAt(0, 0.96, 0);
    stage = new THREE.Group();
    scene.add(stage);
    scene.add(new THREE.HemisphereLight(0xdcecf4, 0x223033, 3.1));
    const key = new THREE.DirectionalLight(0xfff0da, 3.4);
    key.position.set(2.2, 3.4, 2.6);
    key.castShadow = false;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fd0ff, 1.9);
    rim.position.set(-2.6, 1.6, -2.2);
    rim.castShadow = false;
    scene.add(rim);
    // A soft fill straight down the camera axis. The authored operator
    // materials are deliberately dark for arena lighting; without this the
    // menu portrait reads as another grey silhouette, which is the exact
    // complaint being fixed.
    const fill = new THREE.DirectionalLight(0xf2f8ff, 1.35);
    fill.position.set(0, 1.2, 4);
    fill.castShadow = false;
    scene.add(fill);
    return true;
  };

  const disposeModel = (): void => {
    if (!model || !stage) return;
    stage.remove(model);
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!(mesh as { isMesh?: boolean }).isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
    model = null;
  };

  const buildModel = (): void => {
    if (!stage) return;
    // Flat materials off: the menu wants the real PBR look the player will
    // spawn with, not the low-cost bot flattening.
    // 'showcase': the skin's own colours with no team wash. A player looking at
    // their own operator in the menu is not on a team yet, and washing 34% of
    // aqua over every card was half of why the four skins looked alike.
    const instance = createRiggedOperator(0, 'operator-preview', false, 'showcase', skinId);
    if (!instance) return;
    disposeModel();
    model = instance.root;
    // HF-382: publish the selected stance before the first idle evaluation so
    // the preview opens in the pose the player has chosen, not the skin default.
    model.userData.operatorStanceId = stanceId;
    model.position.set(0, 0, 0);
    stage.add(model);
    // Frame on the bare operator first, then hand it its rifle.
    frameModel();
    mountPreviewWeapon(instance);
    // Standing idle: the runtime's own locomotion driver at zero speed, so the
    // preview plays exactly the clip the player will stand in.
    updateRiggedOperator(model, 0, 'stand');
    const definition = OPERATOR_SKIN_CATALOG.definitions.find((entry) => entry.id === skinId);
    setStatus(`${definition?.displayName ?? 'Standard Operator'} · ${operatorStance(stanceId).displayName} · live preview`);
    // Keep the 2D half in step with the 3D half: the owner asked for both, and
    // two previews that can disagree are worse than one.
    // HF-381: the card grid and this live preview must agree - repainting the SVG
    // here put the blob straight back the moment a skin was selected.
    if (portrait) portrait.innerHTML = operatorSkinPortraitMarkup(skinId, `preview-${skinId}`);
  };

  const ensureModel = (): void => {
    if (loading || model !== null) return;
    const ready = skinId === 'default' ? riggedOperatorAssetReady() : operatorSkinAssetReady(skinId);
    if (ready) {
      buildModel();
      return;
    }
    loading = true;
    setStatus('Loading operator…');
    const load = skinId === 'default' ? loadRiggedOperatorAsset() : loadOperatorSkinAsset(skinId);
    void load.then(() => {
      loading = false;
      if (!disposed) ensureModel();
    }).catch(() => {
      loading = false;
      setStatus('Operator asset unavailable; the card art shows each skin.');
    });
  };

  const resize = (): void => {
    if (!renderer || !camera) return;
    const width = Math.max(1, canvas.clientWidth || 320);
    const height = Math.max(1, canvas.clientHeight || 240);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const advance = (dt: number): void => {
    const step = Math.min(0.05, Math.max(0, dt));
    turnRadians = (turnRadians + OPERATOR_PREVIEW_TURN_RADIANS_PER_SECOND * step) % (Math.PI * 2);
    if (requestedSkinId !== skinId) {
      skinId = requestedSkinId;
      disposeModel();
      // Face the player again on every change: picking a card should show you
      // the FRONT of what you just picked, not whatever angle the turntable
      // happened to be at.
      turnRadians = 0;
    }
    if (requestedStanceId !== stanceId) {
      stanceId = requestedStanceId;
      if (model) model.userData.operatorStanceId = stanceId;
      const definition = OPERATOR_SKIN_CATALOG.definitions.find((entry) => entry.id === skinId);
      setStatus(`${definition?.displayName ?? 'Standard Operator'} · ${operatorStance(stanceId).displayName} · live preview`);
    }
    if (!renderer || !scene || !camera || !stage) return;
    ensureModel();
    if (model) updateRiggedOperator(model, 0, 'stand');
    stage.rotation.y = turnRadians + OPERATOR_PREVIEW_FACING_OFFSET_RADIANS;
    resize();
    renderer.render(scene, camera);
  };

  const tick = (nowMs: number): void => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    if (!panelVisible()) {
      running = false;
      lastFrameMs = nowMs;
      return;
    }
    if (!ensureRenderer()) {
      cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    running = true;
    const dt = lastFrameMs === 0 ? 1 / 60 : (nowMs - lastFrameMs) / 1000;
    lastFrameMs = nowMs;
    advance(dt);
  };

  const onCardPress = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    // HF-382: one delegated listener serves both card grids - the skin cards
    // drive the model swap above, the stance cards drive the idle cross-fade.
    const card = target?.closest<HTMLElement>('[data-operator-skin], [data-operator-stance]');
    const chosenSkin = card?.dataset.operatorSkin;
    if (chosenSkin !== undefined && isSelectable(chosenSkin)) {
      requestedSkinId = chosenSkin;
      return;
    }
    const chosenStance = card?.dataset.operatorStance;
    if (chosenStance !== undefined && isOperatorStanceId(chosenStance)) {
      requestedStanceId = chosenStance;
      // Mirror the menu's own persistence write so the first-person arms and
      // any future third-person consumer read the same stance this frame.
      setActiveOperatorStance(chosenStance);
    }
  };

  panel.addEventListener('click', onCardPress);
  frame = requestAnimationFrame(tick);

  return Object.freeze({
    setSkin: (next: string): void => {
      if (isSelectable(next)) requestedSkinId = next;
    },
    /** HF-382: programmatic stance selection, mirroring a card press. */
    setStance: (next: string): void => {
      if (isOperatorStanceId(next)) requestedStanceId = next;
    },
    advance,
    dispose: (): void => {
      disposed = true;
      running = false;
      if (frame !== 0) cancelAnimationFrame(frame);
      panel.removeEventListener('click', onCardPress);
      disposeModel();
      environment?.dispose();
      environment = null;
      renderer?.dispose();
      renderer = null;
    },
    state: () => Object.freeze({
      contract: OPERATOR_PREVIEW_CONTRACT,
      skinId: requestedSkinId,
      stanceId: requestedStanceId,
      mounted: !disposed,
      rendererCreated: renderer !== null,
      running,
      modelReady: model !== null,
      turnRadians,
    }),
  });
}
