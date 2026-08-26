/**
 * Pass 75 - selectable operator appearance.
 *
 * The owner asked for skins AND animations to be easy to select in their own
 * menu option. The risk in an "animations" feature is that it promises clips
 * the runtime cannot actually play, or that it quietly inflates the deliberate
 * spawn-time clip-binding budget. Both are pinned here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPERATOR_EMOTE,
  DEFAULT_OPERATOR_STANCE,
  OPERATOR_APPEARANCE_CLIP_NAMES,
  OPERATOR_EMOTES,
  OPERATOR_STANCES,
  isOperatorEmoteId,
  isOperatorStanceId,
  operatorEmote,
  operatorStance,
  stanceIdleClip,
} from './operator-appearance-catalog';
import { RIGGED_OPERATOR_RUNTIME_ACTION_NAMES } from './operator-model';
import { UI_SURFACE_INVENTORY } from './ui/surface-registry';

describe('operator appearance catalog', () => {
  it('only ever requests clips the runtime mixer actually binds', () => {
    // This is the load-bearing guarantee: a selectable animation that is not in
    // the bound set would silently do nothing at runtime.
    for (const clip of OPERATOR_APPEARANCE_CLIP_NAMES) {
      expect(RIGGED_OPERATOR_RUNTIME_ACTION_NAMES, clip).toContain(clip);
    }
  });

  it('keeps the spawn-time binding budget small', () => {
    // The authored GLB carries 24 clips; binding all of them at spawn is a
    // multi-hundred-millisecond main-thread task the runtime deliberately
    // avoids. Appearance choices must not erode that.
    expect(RIGGED_OPERATOR_RUNTIME_ACTION_NAMES.length).toBeLessThanOrEqual(14);
  });

  it('exposes distinct, well-formed stances and emotes', () => {
    expect(OPERATOR_STANCES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(OPERATOR_STANCES.map((stance) => stance.id)).size).toBe(OPERATOR_STANCES.length);
    expect(new Set(OPERATOR_STANCES.map((stance) => stance.clipName)).size).toBe(OPERATOR_STANCES.length);
    expect(new Set(OPERATOR_EMOTES.map((emote) => emote.id)).size).toBe(OPERATOR_EMOTES.length);
    for (const entry of [...OPERATOR_STANCES, ...OPERATOR_EMOTES]) {
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(8);
    }
  });

  it('offers an explicit no-emote choice, and it is the default', () => {
    expect(operatorEmote('none').clipName).toBeNull();
    expect(DEFAULT_OPERATOR_EMOTE).toBe('none');
    expect(operatorStance(DEFAULT_OPERATOR_STANCE).clipName).toBe('Idle_Gun_Pointing');
  });

  it('validates wire/storage values and rejects anything off-catalog', () => {
    expect(isOperatorStanceId('ready')).toBe(true);
    expect(isOperatorStanceId('sprinting')).toBe(false);
    expect(isOperatorStanceId(undefined)).toBe(false);
    expect(isOperatorEmoteId('wave')).toBe(true);
    expect(isOperatorEmoteId('dance')).toBe(false);
  });

  it('falls back rather than leaving an operator with no idle clip', () => {
    const full = new Set(['Idle_Gun_Pointing', 'Idle_Gun', 'Idle_Gun_Shoot']);
    expect(stanceIdleClip('alert', full)).toBe('Idle_Gun_Shoot');
    // A mixer missing the preferred clip must still idle.
    expect(stanceIdleClip('alert', new Set(['Idle_Gun']))).toBe('Idle_Gun');
    expect(stanceIdleClip('low', new Set(['Idle']))).toBe('Idle');
  });
});

describe('operator panel surface', () => {
  it('is a registered, critical UI surface', () => {
    const ids = UI_SURFACE_INVENTORY.map((surface) => surface.rootElementId);
    expect(ids).toContain('menu-panel-operator');
    expect(ids).toContain('operator-appearance');
    expect(UI_SURFACE_INVENTORY.find((surface) => surface.rootElementId === 'menu-panel-operator')?.critical).toBe(true);
  });

  it('renders one card per selectable skin, stance and emote', () => {
    const shell = readFileSync(new URL('./ui/pass64-shell.ts', import.meta.url), 'utf8');
    expect(shell).toContain('data-operator-skin=');
    expect(shell).toContain('data-operator-stance=');
    expect(shell).toContain('data-operator-emote=');
    // The tab must exist and address the panel.
    expect(shell).toContain('id="menu-tab-operator"');
    expect(shell).toContain('aria-controls="menu-panel-operator"');
    expect(shell).toContain('data-menu-panel="operator"');
  });

  // HF-366 supersedes the previous expectation here. That test required the
  // standard operator's card to carry a typographic emblem placeholder, and the
  // owner's report is that the whole grid read as greyed-out placeholder art.
  // The rule is now STRICTER, not looser: no borrowed asset AND no placeholder
  // of any kind, on any card.
  it('never presents a weapon still, a raw UV atlas, or a placeholder as operator art', () => {
    const shell = readFileSync(new URL('./ui/pass64-shell.ts', import.meta.url), 'utf8');
    const start = shell.indexOf('function operatorPanelMarkup');
    const body = shell.slice(start, shell.indexOf('function menuMarkup', start));
    expect(body).not.toContain('pass65-firearms');
    expect(body).not.toContain('baseColor');
    expect(body).not.toContain('operator-skin-emblem');
    expect(body).toContain('operatorSkinPortraitSvg(definition.id)');
  });
});
