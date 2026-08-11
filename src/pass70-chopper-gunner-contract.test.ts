import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legacy = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./ui/pass64-shell.ts', import.meta.url), 'utf8');
const hudCss = readFileSync(new URL('./ui/pass65-hud.css', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('./killstreak-presentation.ts', import.meta.url), 'utf8');
const authoring = readFileSync(new URL('../scripts/blender/create-pass65-support-vehicles.py', import.meta.url), 'utf8');
const authoringRunner = readFileSync(new URL('../scripts/blender/run-authoring.mjs', import.meta.url), 'utf8');

describe('Pass 70 complete Chopper Gunner contract', () => {
  it('presents the complete authored cockpit while excluding exterior and rotors', () => {
    const start = presentation.indexOf('function setSupportFirstPersonVisibility(');
    const end = presentation.indexOf('\nfunction buildAuthoredSupportVehicle(', start);
    const block = presentation.slice(start, end);
    expect(block).toContain('isGunnerCockpitNode(root, node)');
    expect(block).toContain('node.visible = gunnerCockpitNode && !retiredStaticSource');
    expect(block).toContain('1 << SUPPORT_FIRST_PERSON_RENDER_LAYER');
    expect(block).toContain('node.layers.mask = node.userData.supportBaseLayerMask');
    expect(block).toContain('!entry.transparent && entry.opacity >= 1');
    expect(block).not.toContain('node.visible = gunnerSightlineNode && !retiredStaticSource');
  });

  it('keeps the centre reticle clear and all instruments bounded on desktop and mobile', () => {
    for (const id of [
      'gunner-hull', 'gunner-ammo', 'gunner-altitude', 'gunner-speed', 'gunner-time', 'gunner-damage',
      'gunner-target-confirm', 'gunner-platform', 'gunner-weapon-mode',
    ]) expect(shell).toContain(`id="${id}"`);
    expect(shell).toContain('data-centre-clear="true"');
    expect(shell).not.toContain('class="gunner-reticle"><i></i><b></b>');
    expect(hudCss).toContain('.gunner-reticle .north { bottom: 58%; top: auto; }');
    expect(hudCss).toContain('.gunner-reticle .east { left: 58%; }');
    expect(hudCss).toContain('@media (max-width: 760px), (max-height: 520px)');
    expect(hudCss).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(hudCss).toContain('env(safe-area-inset-bottom)');
  });

  it('uses authority geometry and target projection for shot and damage feedback', () => {
    const updateStart = legacy.indexOf('function updateKillstreakPossession(');
    const updateEnd = legacy.indexOf('\nfunction updatePass65KillstreakRuntime(', updateStart);
    const update = legacy.slice(updateStart, updateEnd);
    expect(update).toContain('chopperGunnerCameraOrigin(entity.position, entity.attitude)');
    expect(update).toContain('chopperGunnerAuthoritativeRay(entity.position, entity.attitude, player.yaw, player.pitch)');
    expect(update).toContain('new THREE.Vector3(...shotRay.tracerOrigin)');
    expect(update).toContain('new THREE.Vector3(...shotRay.direction)');

    const hitStart = legacy.indexOf('function showGunnerTargetConfirm(');
    const hitEnd = legacy.indexOf('\nfunction resetKillstreakPossessionPresentation(', hitStart);
    const hit = legacy.slice(hitStart, hitEnd);
    expect(hit).toContain("event.source !== 'chopper' || !anchor.visible");
    expect(hit).toContain('entity.activationId !== event.activationId');
    expect(hit).toContain('`${anchor.xPx}px`');
    expect(hit).toContain('`${anchor.yPx}px`');
  });

  it('cleans the cockpit, thermal overlay, target marker, cadence, and camera on every exit path', () => {
    const hideStart = legacy.indexOf('function hideGunnerCockpitHud(');
    const hideEnd = legacy.indexOf('\nfunction showGunnerTargetConfirm(', hideStart);
    const hide = legacy.slice(hideStart, hideEnd);
    expect(hide).toContain("hud.dataset.supportKind = 'none'");
    expect(hide).toContain("hud.dataset.hitConfirm = 'false'");
    expect(hide).toContain("element<HTMLElement>('#chopper-thermal').hidden = true");
    expect(hide).toContain('nextLocalSupportGunReportAt = 0');
    expect(legacy).toContain('if (!possession || !player.alive)');
    expect(legacy).toContain('if (camera.near !== 0.08)');
  });

  it('authors and optimizes only Chopper LODs for this correction', () => {
    expect(authoring).toContain('{"all", "aircraft", "chopper"}');
    expect(authoring).toContain('if AUTHORING_SCOPE == "chopper"');
    expect(authoring).toContain('pass70-complete-tandem-attack-airframe-v5');
    expect(authoring).toContain('complete-exterior-cockpit-gun-readable-materials-v5');
    expect(authoring).toContain('pass70-daylight-readable-olive-pbr-v1');
    const runnerStart = authoringRunner.indexOf('function authorSupportChopper()');
    const runnerEnd = authoringRunner.indexOf('\nfunction authorWeaponFamilies(', runnerStart);
    const runner = authoringRunner.slice(runnerStart, runnerEnd);
    expect(runner).toContain("env.PASS65_SUPPORT_AUTHORING_SCOPE = 'chopper'");
    expect(runner).toContain('pass65-chopper-gunner-lod${lod}.glb');
    expect(runner).not.toContain('pass65-care-aircraft');
    expect(runner).not.toContain('pass65-carpet-aircraft');
  });
});
