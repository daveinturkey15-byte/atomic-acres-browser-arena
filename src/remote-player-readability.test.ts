import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOT_EMISSIVE_BRIGHTNESS_SCALE, applyBotEmissiveBrightness } from './operator-model';
import {
  REMOTE_HUMAN_READABILITY_COLOR,
  REMOTE_HUMAN_READABILITY_INTENSITY,
  REMOTE_HUMAN_READABILITY_MIX,
  applyRemoteHumanReadabilityHighlight,
  remoteHumanReadabilityTelemetry,
} from './remote-player-readability';

describe('remote human readability', () => {
  it('highlights authored presentation meshes without mutating their source material', () => {
    const root = new THREE.Group();
    const source = new THREE.MeshStandardMaterial({
      color: 0x244f57,
      emissive: 0x000000,
      emissiveIntensity: 0,
      depthTest: true,
      depthWrite: true,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), source);
    body.userData.presentationOnly = true;
    root.add(body);

    expect(applyRemoteHumanReadabilityHighlight(root)).toBe(1);
    const highlighted = body.material as THREE.MeshStandardMaterial;
    expect(highlighted).not.toBe(source);
    expect(source.emissive.getHex()).toBe(0x000000);
    expect(highlighted.emissive.getHex()).not.toBe(0x000000);
    expect(highlighted.emissiveIntensity).toBe(REMOTE_HUMAN_READABILITY_INTENSITY);
    expect(REMOTE_HUMAN_READABILITY_INTENSITY).toBe(0.25);
    expect(REMOTE_HUMAN_READABILITY_INTENSITY).toBe(BOT_EMISSIVE_BRIGHTNESS_SCALE / 2);
    expect(REMOTE_HUMAN_READABILITY_MIX).toBeLessThanOrEqual(0.4);
    expect(highlighted.depthTest).toBe(true);
    expect(highlighted.depthWrite).toBe(true);
    expect(highlighted.transparent).toBe(false);
    expect(root.userData.remoteHumanReadabilityColor).toBe(REMOTE_HUMAN_READABILITY_COLOR);
    expect(remoteHumanReadabilityTelemetry(root)).toEqual({
      color: REMOTE_HUMAN_READABILITY_COLOR,
      intensity: REMOTE_HUMAN_READABILITY_INTENSITY,
      highlightedMeshes: 1,
      highlightedMaterials: 1,
      allDepthTested: true,
      allDepthWriting: true,
    });
  });

  it('does not highlight authoritative proxies, hidden props, or clone twice', () => {
    const root = new THREE.Group();
    const visible = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhongMaterial());
    const proxyMaterial = new THREE.MeshLambertMaterial({ emissive: 0x000000 });
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), proxyMaterial);
    proxy.userData.authoritativeProxy = true;
    const hiddenMaterial = new THREE.MeshStandardMaterial();
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hiddenMaterial);
    hidden.visible = false;
    root.add(visible, proxy, hidden);

    expect(applyRemoteHumanReadabilityHighlight(root)).toBe(1);
    const once = visible.material;
    expect(applyRemoteHumanReadabilityHighlight(root)).toBe(0);
    expect(visible.material).toBe(once);
    expect(proxy.material).toBe(proxyMaterial);
    expect(hidden.material).toBe(hiddenMaterial);
  });

  it('normalizes the readability lift to the exact remote-human budget', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      emissive: 0x001122,
      emissiveIntensity: 0.9,
    });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    applyRemoteHumanReadabilityHighlight(root);
    expect((root.children[0] as THREE.Mesh).material).not.toBe(material);
    expect(((root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0.25);
    expect(material.emissiveIntensity).toBe(0.9);
  });

  it('keeps hosted and skirmish bots on their separate purple emissive path', () => {
    const bot = new THREE.Group();
    const purple = new THREE.MeshStandardMaterial({ emissive: 0x7d16bd, emissiveIntensity: 1.2 });
    bot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), purple));
    applyBotEmissiveBrightness(bot);
    expect(purple.emissive.getHex()).toBe(0x7d16bd);
    expect(purple.emissiveIntensity).toBeCloseTo(0.6);

    const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const spawnBot = main.slice(main.indexOf('function spawnBot('), main.indexOf('async function prewarmBotPresentations('));
    expect(spawnBot).toContain('applyBotEmissiveBrightness(root)');
    expect(spawnBot).not.toContain('applyRemoteHumanReadabilityHighlight');
  });
});
