import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Pass 70 contact and Railgun scope integration contracts', () => {
  it('keeps contact motion presentation-only while camera-forward remains shot authority', () => {
    const presentation = read('./weapon-presentation.ts');
    const runtime = read('./legacy-main.ts');
    const probe = read('./viewmodel-contact-probe.ts');
    expect(presentation).toContain('viewmodelContactResponse(');
    expect(presentation).toContain('+ this.contactResponse.pitchRadians');
    expect(presentation).toContain('+ this.contactResponse.yawRadians');
    expect(presentation).toContain('+ shotRoll + this.contactResponse.rollRadians');
    expect(presentation).toContain('* this.contactResponse.scale');
    expect(runtime).toContain('const baseDirection = camera.getWorldDirection(new THREE.Vector3());');
    expect(runtime).toContain('cameraDirection: baseDirection.toArray()');
    expect(runtime).toContain('const profile = VIEWMODEL_CONTACT_PROFILES[player.weapon];');
    expect(runtime).toContain('const viewmodelContactProbe = new ViewmodelContactProbe();');
    expect(runtime).toContain('const sample = viewmodelContactProbe.sample(');
    expect(runtime).toContain('sample.nearestForwardSurfaceMeters');
    expect(probe).toContain("'retained-splayed-real-collider-envelope-v1'");
    expect(probe).toContain('for (const offset of VIEWMODEL_CONTACT_PROBE_OFFSETS)');
    expect(probe).toContain('profile.envelopeHalfWidthMeters');
    expect(probe).toContain('segmentBoxHitTime(start, end, collider, paddingMeters)');
    expect(presentation).toContain('viewmodelContactActionFreedom(this.contactResponse.obstructionBlend)');
    expect(runtime).not.toMatch(/contactResponse[^\n]*(camera|baseDirection|projectile)/u);
    expect(probe).not.toMatch(/camera\.position|player\.position|muzzle|projectile/u);
  });

  it('routes M14, Railgun, Chopper and piloted-drone reveals through one exact-model renderer without pawn proxies', () => {
    const runtime = read('./legacy-main.ts');
    const ghost = read('./thermal-ghost-presentation.ts');
    const dmr = read('./dmr-thermal-presentation.ts');
    const railgun = read('./railgun-presentation.ts');
    expect(runtime).toContain("const chopperThermal = possessionKind === 'chopper-gunner';");
    expect(runtime).toContain('const revealActive = dmrThermalRevealActive || railgunRevealActive || chopperThermal || pilotedDroneThermal;');
    expect(runtime).toContain('const contacts = dmrThermalContacts(!thermalGhostWasActive);');
    expect(runtime).toContain('occluded: contact?.solidOccluded ?? true');
    expect(runtime).toContain('railgunPresentation.syncExactOperatorReveal(railgunRevealActive, thermalGhostPresentation.telemetry())');
    expect(runtime).toContain("const pilotedDroneThermal = possessionKind === 'piloted-drone';");
    expect(runtime).toContain('new Set(killstreakSnapshot.sensorContacts.map((contact) => `${contact.kind}:${contact.id}`))');
    expect(runtime).toContain('if (pilotedDroneContactKeys && !pilotedDroneContactKeys.has(`${kind}:${id}`)) return;');
    expect(ghost).toContain("'occlusion-conditioned-single-exact-animated-thermal-operator-v2'");
    expect(ghost).toContain('model.skeleton === layer.source.skeleton');
    expect(ghost).toContain('parent.add(model);');
    expect(ghost).not.toContain('orangeHaloMaterial');
    expect(dmr).not.toContain('DataTexture');
    expect(dmr).not.toContain('InstancedMesh');
    expect(dmr).not.toContain('document.createElement');
    expect(railgun).not.toContain('CapsuleGeometry');
    expect(railgun).not.toContain('railgun-thermal-silhouette');
    expect(railgun).not.toContain("part('thermal-head'");
    expect(railgun).not.toContain('document.createElement');
  });

  it('traces trusted RMB admission to immediate reveal while keeping optic/viewmodel settlement separate', () => {
    const runtime = read('./legacy-main.ts');
    const scope = read('./railgun-scope-state.ts');
    const inputStart = runtime.indexOf("canvas.addEventListener('mousedown'");
    const inputEnd = runtime.indexOf("window.addEventListener('mouseup'", inputStart);
    const trustedRmb = runtime.slice(inputStart, inputEnd);
    expect(trustedRmb).toContain('if (event.button === 2)');
    expect(trustedRmb).toContain('adsHeld = admittedAdsHeld(debugAdsOverride ?? true);');
    expect(runtime).toContain('railgunScopeState = deriveRailgunScopePresentation({');
    expect(runtime).toContain('function synchronizeRailgunScopeLifecycle(): void {');
    expect(runtime).toContain('if (!playerSimulationEnabled()) {');
    expect(runtime).toContain('synchronizeRailgunScopeLifecycle();\n    updateRailgun(now);');
    expect(scope).toContain("revealActivation: 'admitted-local-ads-hold'");
    expect(scope).toContain('const revealActive = input.alive');
    expect(scope).toContain('const active = revealActive\n    && adsSettled\n    && fovSettled;');
    expect(runtime).toContain('const revealActive = railgunScopeState.revealActive;');
    expect(runtime).toContain('revealActive ? railgunThermalContacts() : []');
    expect(runtime).toContain('railgunScopeActive,\n    revealActive,');
    expect(runtime).toContain('adsHeld = admittedAdsHeld(false);');
    expect(runtime).toContain('sniperScopeActive || dmrThermalActive || railgunScopeActive');
    expect(runtime).toContain("hudRoot.classList.toggle('railgun-scope-active', railgunScopeActive)");
    expect(runtime).toContain("element<HTMLElement>('.railgun-scope-reticle')");
    expect(runtime).toContain('synchronizeWeaponViewmodelPresentation();');
  });

  it('authors a transparent centre aperture, aligned reticle and opaque outside mask', () => {
    const shell = read('./ui/pass64-shell.ts');
    const css = read('./ui/tactical-ui.css');
    expect(shell).toContain('Railgun 2.5x clear thermal scope');
    expect(shell).toContain('class="railgun-scope-glass"');
    expect(shell).toContain('class="railgun-scope-reticle"');
    expect(css).toMatch(/#railgun-thermal \.railgun-scope-window[\s\S]*?background:\s*transparent;/u);
    expect(css).toMatch(/0 0 0 100vmax rgba\(1, 6, 9, 0\.96\)/u);
    expect(css).toMatch(/#railgun-thermal \.railgun-scope-glass[\s\S]*?transparent 0 62%/u);
    expect(css).toContain('#hud.railgun-scope-active #crosshair { opacity: 0; }');
  });
});
