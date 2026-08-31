import { describe, expect, it } from 'vitest';
import {
  DOMINATION_APPROACH_RADIUS_M,
  deriveDominationCapturePrompt,
  type DominationPromptZoneView,
} from './domination-capture-prompt';
import { DOMINATION_ZONE_RADIUS_M } from './domination-mode';

function zone(overrides: Partial<DominationPromptZoneView> = {}): DominationPromptZoneView {
  return {
    id: 'A',
    centre: [0, 0, 0],
    radius: DOMINATION_ZONE_RADIUS_M,
    owner: null,
    capturingTeam: null,
    progress: 0,
    contested: false,
    ...overrides,
  };
}

const AT_CENTRE = { x: 0, z: 0 };

describe('the Domination capture prompt', () => {
  it('says nothing when the player is nowhere near a zone', () => {
    const prompt = deriveDominationCapturePrompt({
      alive: true, team: 0, position: { x: 60, z: 60 }, zones: [zone()],
    });
    expect(prompt.state).toBe('clear');
    expect(prompt.headline).toBe('');
  });

  it('teaches the rule on approach, before the player is standing in the circle', () => {
    const prompt = deriveDominationCapturePrompt({
      alive: true, team: 0, position: { x: DOMINATION_ZONE_RADIUS_M + 2, z: 0 }, zones: [zone()],
    });
    expect(prompt.state).toBe('approaching');
    // THE POINT OF THE WHOLE MODULE: the screen has to say what to do.
    expect(prompt.detail).toMatch(/STAND INSIDE/);
  });

  it('stops teaching once the player is well past the approach radius', () => {
    const prompt = deriveDominationCapturePrompt({
      alive: true, team: 0, position: { x: DOMINATION_APPROACH_RADIUS_M + 1, z: 0 }, zones: [zone()],
    });
    expect(prompt.state).toBe('clear');
  });

  it('counts down the seconds left while capturing a neutral zone', () => {
    const prompt = deriveDominationCapturePrompt({
      alive: true, team: 0, position: AT_CENTRE,
      zones: [zone({ capturingTeam: 0, progress: 0.6 })],
    });
    expect(prompt.state).toBe('capturing');
    expect(prompt.tone).toBe('friendly');
    // 5 s step, 60% done -> 2 s left.
    expect(prompt.secondsRemaining).toBe(2);
  });

  it('names the enemy in the circle as the reason the bar has stopped', () => {
    const prompt = deriveDominationCapturePrompt({
      alive: true, team: 0, position: AT_CENTRE,
      zones: [zone({ contested: true, capturingTeam: 0, progress: 0.4 })],
    });
    expect(prompt.state).toBe('contested');
    expect(prompt.detail).toMatch(/ENEMY/);
    // A frozen bar must not pretend to be counting down.
    expect(prompt.secondsRemaining).toBeNull();
  });

  it('explains that an enemy zone must be neutralised before it can be taken', () => {
    const prompt = deriveDominationCapturePrompt({
      alive: true, team: 0, position: AT_CENTRE,
      zones: [zone({ owner: 1, capturingTeam: 0, progress: 0.3 })],
    });
    // This is the "I stood here for five seconds and got nothing" case.
    expect(prompt.state).toBe('neutralising');
    expect(prompt.detail).toMatch(/THEN CAPTURE/);
  });

  it('confirms a held zone is scoring rather than going quiet', () => {
    const prompt = deriveDominationCapturePrompt({
      alive: true, team: 0, position: AT_CENTRE, zones: [zone({ owner: 0 })],
    });
    expect(prompt.state).toBe('holding');
    expect(prompt.detail).toMatch(/SCORING/);
  });

  it('prefers the zone being stood in over a nearer-looking neighbour', () => {
    const prompt = deriveDominationCapturePrompt({
      alive: true, team: 0, position: AT_CENTRE,
      zones: [
        zone({ id: 'B', centre: [DOMINATION_ZONE_RADIUS_M + 1, 0, 0] }),
        zone({ id: 'A', centre: [0, 0, 0], capturingTeam: 0, progress: 0.5 }),
      ],
    });
    expect(prompt.zone).toBe('A');
    expect(prompt.state).toBe('capturing');
  });

  it('shows nothing to a dead player', () => {
    const prompt = deriveDominationCapturePrompt({
      alive: false, team: 0, position: AT_CENTRE, zones: [zone({ capturingTeam: 0, progress: 0.5 })],
    });
    expect(prompt.state).toBe('clear');
  });
});
