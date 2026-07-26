import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('Pass 65 playable killstreak integration', () => {
  it('freezes the persisted five-slot selection at match start and maps keys 3-7 by slot order', () => {
    expect(source).toContain('killstreakLoadoutController.freezeAtMatchStart()');
    expect(source).toContain('createFieldSupportState(frozenKillstreakLoadout)');
    expect(source).toContain("['Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'].indexOf(event.code)");
    expect(source).toContain('activateFieldSupport(fieldSupport.loadout.slots[supportSlot])');
    expect(source).not.toContain("activateFieldSupport('hunter-swarm');");
  });

  it('drives host runtime snapshots/damage and admits only host messages on clients', () => {
    expect(source).toContain('killstreakRuntime.advance(now, killstreakWorldState())');
    expect(source).toContain("message.type === 'killstreak-activate-intent'");
    expect(source).toContain("message.type === 'killstreak-damage-result'");
    expect(source).toContain("message.by !== privateLobbySnapshot?.hostId");
    expect(source).toContain('event.targetLifeId !== localContinuity');
  });

  it('projects support damage from the admitted victim and never flashes the caller reticle', () => {
    const start = source.indexOf('function recordOwnerSupportDamage(');
    const end = source.indexOf('\nfunction killstreakActorModifiers(', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);
    expect(block).toContain('new THREE.Vector3(...event.targetPosition)');
    expect(block).toContain('projectSupportDamageAnchor(targetPosition, camera, viewport)');
    expect(block).toContain('supportDamageFeedbackTelemetry.record(event, anchor, viewport)');
    expect(block).toContain("showDamageNumber(event.damage, 'body', undefined, { ...anchor, targetId: event.targetId })");
    expect(block).not.toContain('showHitmarker(');
  });

  it('uses the real tactical map for one-click Care/Carpet placement and host-owned surface height', () => {
    expect(source).toContain("beginPointSupportTargeting('care-package')");
    expect(source).toContain("beginPointSupportTargeting('carpet-bomber')");
    expect(source).toContain('function registerPointSupportClick(');
    expect(source).toContain('tacticalMapToWorld(x, y, arena.bounds');
    expect(source).toContain('requestKillstreakActivation(targeting.id, confirmedAt, [point.x, 0, point.z])');
    expect(source).toContain('cancelSupportTargeting(true)');
    expect(source).toContain('groundHeightAt: supportPlacementGroundHeightAt');
    expect(source).not.toContain('nearestSupportTarget()?.point ?? player.position.clone().addScaledVector');
  });

  it('feeds arena-owned portal/no-fly data and current static plus dynamic solids into support flight', () => {
    expect(source).toContain('PASS65_FLIGHT_NAVIGATION[selectedArena.id]');
    expect(source).toContain('resolveFlightPosition: (from, desired, radius)');
    expect(source).toContain('resolveSupportFlightStep({');
    expect(source).toContain('solids: activeWorldColliders()');
  });

  it('routes F to gun-only chopper handoff, autonomous/manual drone toggle, care capture, or shed interaction before weapon pickup', () => {
    expect(source).toContain("import { primaryInteraction, type InteractionCandidate } from './interaction-arbitration'");
    expect(source).toContain('function selectedFInteraction(');
    expect(source).toContain('function executePrimaryFInteraction(');
    expect(source).toContain("if (event.code === 'KeyF' && !event.repeat) executePrimaryFInteraction()");
    expect(source).toContain("interaction.kind === 'support-enter-chopper'");
    expect(source).toContain("interaction.kind === 'support-enter-drone'");
    expect(source).toContain("type: 'killstreak-care-capture-intent'");
    expect(source).toContain("if (event.code === 'KeyF') releaseCareCapture();");
    expect(source).toMatch(/function clearGameplayInput\(\): void \{\s+releaseCareCapture\(\);/);
    expect(source).toContain('if (appliedDamage > 0) releaseCareCapture(now);');
    expect(source).toContain('killstreakRuntime.recordActorDamage(victimId)');
    expect(source).not.toMatch(/!interactWithKillstreakSupport\(\)[\s\S]{0,100}!interactWithShedDoor\(\)/);
  });

  it('applies the exact Adrenaline stage to damage, movement and reload duration', () => {
    expect(source).toContain('* killstreakActorModifiers(player.id, now).damage');
    expect(source).toContain('maxSpeed: baseProfile.maxSpeed * movementBoost');
    expect(source).toContain('(reloadState.endsAt - reloadStartedAt) * reloadDuration');
  });
});
