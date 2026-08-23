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
export const OPERATOR_PREVIEW_PANEL_ID = 'menu-panel-operator';
export const OPERATOR_PREVIEW_CONTRACT = 'live-turntable-selected-skin-v1';
/** Slow enough to read the silhouette, fast enough to show the back. */
export const OPERATOR_PREVIEW_TURN_RADIANS_PER_SECOND = 0.42;
/**
 * The authored operator faces away from +Z in its own space, so the turntable
 * starts half a turn round: the player sees their own front first and the back
 * comes round after, rather than opening on the back of a head.
 */
export const OPERATOR_PREVIEW_FACING_OFFSET_RADIANS = Math.PI;
const PREVIEW_MAX_PIXEL_RATIO = 1.75;

export type OperatorPreviewHandle = Readonly<{
  setSkin: (skinId: string) => void;
  /** Advances the turntable by dt seconds; exposed for deterministic tests. */
  advance: (dt: number) => void;
  dispose: () => void;
  state: () => Readonly<{
    contract: string;
    skinId: string;
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

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let stage: THREE.Group | null = null;
  let model: THREE.Object3D | null = null;
  let skinId = selectedOperatorSkinFrom(root);
  let requestedSkinId = skinId;
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
    renderer.shadowMap.enabled = false;
    scene = new THREE.Scene();
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
    const instance = createRiggedOperator(0, 'operator-preview', false, 'team', skinId);
    if (!instance) return;
    disposeModel();
    model = instance.root;
    model.position.set(0, 0, 0);
    stage.add(model);
    // Standing idle: the runtime's own locomotion driver at zero speed, so the
    // preview plays exactly the clip the player will stand in.
    updateRiggedOperator(model, 0, 'stand');
    const definition = OPERATOR_SKIN_CATALOG.definitions.find((entry) => entry.id === skinId);
    setStatus(`${definition?.displayName ?? 'Standard Operator'} · live preview`);
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
    const card = target?.closest<HTMLElement>('[data-operator-skin]');
    const chosen = card?.dataset.operatorSkin;
    if (chosen !== undefined && isSelectable(chosen)) requestedSkinId = chosen;
  };

  panel.addEventListener('click', onCardPress);
  frame = requestAnimationFrame(tick);

  return Object.freeze({
    setSkin: (next: string): void => {
      if (isSelectable(next)) requestedSkinId = next;
    },
    advance,
    dispose: (): void => {
      disposed = true;
      running = false;
      if (frame !== 0) cancelAnimationFrame(frame);
      panel.removeEventListener('click', onCardPress);
      disposeModel();
      renderer?.dispose();
      renderer = null;
    },
    state: () => Object.freeze({
      contract: OPERATOR_PREVIEW_CONTRACT,
      skinId: requestedSkinId,
      mounted: !disposed,
      rendererCreated: renderer !== null,
      running,
      modelReady: model !== null,
      turnRadians,
    }),
  });
}
