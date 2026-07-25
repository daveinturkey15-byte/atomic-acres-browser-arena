import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { batchStaticMeshes } from '../art-kit';
import { applyAdditionalMapPresentationProfile, buildSkylineTerminal } from '../additional-maps';
import { ArenaRenderWatchdog, auditArenaRenderLiveness } from './arena-render-watchdog';

function authoritativeTerminal(): { scene: THREE.Scene; root: THREE.Group } {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.userData.authoritativeArenaId = 'skyline-terminal';
  root.userData.arenaVisualDefinitionId = 'skyline-terminal';
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  scene.add(root);
  return { scene, root };
}

describe('selected arena render watchdog', () => {
  it('keeps the real Quality Terminal world drawable after static batching and profile application', () => {
    const scene = new THREE.Scene();
    const terminal = buildSkylineTerminal(scene);
    terminal.root.userData.authoritativeArenaId = 'skyline-terminal';
    terminal.root.userData.arenaVisualDefinitionId = 'skyline-terminal';
    batchStaticMeshes(terminal.root, terminal.root, () => '', 'preserve');
    applyAdditionalMapPresentationProfile(terminal.root, 'blender');
    const audit = auditArenaRenderLiveness(scene, terminal.root, 'skyline-terminal', { calls: 1, triangles: 1, points: 0, lines: 0 });
    expect(audit.reasons).toEqual([]);
    expect(audit.visibleRenderableDescendants).toBeGreaterThan(20);
  });

  it('does not let an atmosphere-only scene hide a detached Terminal world', () => {
    const { scene, root } = authoritativeTerminal();
    root.removeFromParent();
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(10), new THREE.MeshBasicMaterial()));
    const audit = auditArenaRenderLiveness(scene, root, 'skyline-terminal', { calls: 4, triangles: 400, points: 0, lines: 0 });
    expect(audit.reasons).toContain('selected-root-detached');
    expect(audit.visibleRenderableDescendants).toBeGreaterThan(0);
  });

  it('debounces one bad frame and records failure then recovery', () => {
    const { scene, root } = authoritativeTerminal();
    const watchdog = new ArenaRenderWatchdog(2);
    root.visible = false;
    const bad = auditArenaRenderLiveness(scene, root, 'skyline-terminal', { calls: 2, triangles: 12, points: 0, lines: 0 });
    expect(watchdog.observe(bad, 10).status).toBe('suspect');
    expect(watchdog.observe(bad, 20)).toMatchObject({ status: 'failed', incidents: 1, fatal: true, fatalReasons: ['selected-root-hidden', 'selected-world-empty'], lastFatalAt: 20 });
    root.visible = true;
    const good = auditArenaRenderLiveness(scene, root, 'skyline-terminal', { calls: 9, triangles: 1200, points: 0, lines: 0 });
    expect(watchdog.observe(good, 30)).toMatchObject({ status: 'healthy', recoveries: 1, lastHealthyAt: 30 });
  });

  it('can exclude Atomic Acres when its procedural root is intentionally replaced by the quality GLB', () => {
    const { scene, root } = authoritativeTerminal();
    root.visible = false;
    const audit = auditArenaRenderLiveness(scene, root, 'skyline-terminal', { calls: 1, triangles: 2, points: 0, lines: 0 }, false);
    expect(audit.reasons).toEqual([]);
    expect(new ArenaRenderWatchdog().observe(audit, 10).status).toBe('not-applicable');
  });

  it('records empty selected geometry as fatal instead of masking it with sky draw calls', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.userData.authoritativeArenaId = 'skyline-terminal';
    root.userData.arenaVisualDefinitionId = 'skyline-terminal';
    scene.add(root);
    const watchdog = new ArenaRenderWatchdog(2);
    const empty = auditArenaRenderLiveness(scene, root, 'skyline-terminal', { calls: 7, triangles: 900, points: 48, lines: 0 });
    watchdog.observe(empty, 10);
    expect(watchdog.observe(empty, 20)).toMatchObject({
      status: 'failed',
      fatal: true,
      fatalReasons: ['selected-world-empty'],
      incidents: 1,
    });
  });

  it('detects a selected world excluded from the gameplay camera layer and an empty renderer submission', () => {
    const { scene, root } = authoritativeTerminal();
    const mesh = root.children[0];
    mesh.layers.set(2);
    const camera = new THREE.PerspectiveCamera();
    const audit = auditArenaRenderLiveness(scene, root, 'skyline-terminal', { calls: 0, triangles: 0, points: 0, lines: 0 }, true, camera);
    expect(audit.reasons).toEqual(['selected-world-out-of-camera-layer', 'renderer-submission-empty']);
    expect(audit.cameraLayerRenderableDescendants).toBe(0);
  });
});
