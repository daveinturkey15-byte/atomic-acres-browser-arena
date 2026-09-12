import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS, NUKETOWN_DISPLAY_NAME, arenaCanvasLabel, arenaSelection } from './map-selection';
import { buildNuketown2 } from './nuketown2-arena';
import { deploymentBriefingCopy } from './ui/deployment-briefing-surface';
import { menuPreviewDefinition } from './ui/menu-preview-camera';
import { menuPreviewVideoDefinition } from './ui/menu-preview-video';

/**
 * day3-identity-loading (owner 2026-09-08: "just call it nuketown now").
 *
 * Behaviour pin, not a value pin: every player-visible surface must read the
 * same source. No assertion below names the literal display string, so the
 * next rename edits one constant and zero tests. ARENA_SELECTIONS is imported
 * so a future split of the registry row away from the constant fails here.
 */
describe('nuketown display name shares one source', () => {
  const selection = () => arenaSelection('nuketown2');

  it('the registry row is the source, and the card fields derive from it', () => {
    expect(ARENA_SELECTIONS.find((entry) => entry.id === 'nuketown2')?.displayName)
      .toBe(NUKETOWN_DISPLAY_NAME);
    expect(selection().displayName).toBe(NUKETOWN_DISPLAY_NAME);
    expect(selection().selectorLabel).toContain(NUKETOWN_DISPLAY_NAME.toUpperCase());
    expect(`${selection().titleLead} ${selection().titleAccent}`.trim()).toBe(
      NUKETOWN_DISPLAY_NAME.toUpperCase(),
    );
    expect(selection().menuLede).toContain(NUKETOWN_DISPLAY_NAME);
    expect(arenaCanvasLabel(selection())).toContain(NUKETOWN_DISPLAY_NAME);
  });

  it('the in-game arena label reads the constant', () => {
    expect(buildNuketown2(new THREE.Scene()).label).toBe(NUKETOWN_DISPLAY_NAME);
  });

  it('the menu preview and choreography labels read the constant', () => {
    expect(menuPreviewVideoDefinition('nuketown2').label).toContain(
      NUKETOWN_DISPLAY_NAME.toUpperCase(),
    );
    expect(menuPreviewDefinition('nuketown2').label).toContain(selection().selectorLabel);
  });

  it('the deployment briefing title reads the constant', () => {
    const copy = deploymentBriefingCopy(
      'nuketown2',
      selection().displayName,
      'PASS 95 // DEPLOYMENT STREAM',
    );
    expect(copy.title).toBe(NUKETOWN_DISPLAY_NAME.toUpperCase());
  });

  it('the rename moves no link, storage or history boundary', () => {
    expect(selection().id).toBe('nuketown2');
    expect(selection().routeId).toBe('nuke-town-rebuild');
    expect(buildNuketown2(new THREE.Scene()).id).toBe('nuketown2');
  });
});
