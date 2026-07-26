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
    expect(source).not.toMatch(/!interactWithKillstreakSupport\(\)[\s\S]{0,100}!interactWithShedDoor\(\)/);
  });

  it('applies the exact Adrenaline stage to damage, movement and reload duration', () => {
    expect(source).toContain('* killstreakActorModifiers(player.id, now).damage');
    expect(source).toContain('maxSpeed: baseProfile.maxSpeed * movementBoost');
    expect(source).toContain('(reloadState.endsAt - reloadStartedAt) * reloadDuration');
  });
});
