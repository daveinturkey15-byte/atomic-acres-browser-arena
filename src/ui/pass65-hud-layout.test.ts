import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hudCss = readFileSync(new URL('./pass65-hud.css', import.meta.url), 'utf8');
const tacticalCss = readFileSync(new URL('./tactical-ui.css', import.meta.url), 'utf8');
const rootCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./pass64-shell.ts', import.meta.url), 'utf8');

describe('Pass 65 modern tactical HUD layout contract', () => {
  it('loads one late bounded HUD layer without bypassing the accessibility layer', () => {
    expect(rootCss).toContain("@import url('./ui/pass65-hud.css')");
    expect(tacticalCss).toContain('pass65.hitl, pass65.hud, pass64.accessibility');
    expect(hudCss.trimStart()).toMatch(/^@layer pass65\.hud \{/);
  });

  it('uses shared edge, gap and panel-width tokens to keep the right rail collision-free', () => {
    for (const token of [
      '--hud-edge', '--hud-gap', '--hud-mission-width', '--hud-map-width',
      '--hud-operator-width', '--hud-weapon-width', '--hud-support-width',
    ]) expect(hudCss).toContain(token);
    expect(hudCss).toContain('right: calc(var(--hud-edge) + var(--hud-support-width) + var(--hud-gap))');
    expect(hudCss).toContain('right: calc(var(--hud-edge) + var(--hud-map-width) + var(--hud-gap))');
  });

  it('keeps support status readable and changes the narrow layout to two real columns', () => {
    expect(hudCss).toMatch(/\.support-name\s*\{[\s\S]*?font:\s*900 13px/);
    expect(hudCss).toMatch(/\.support-state\s*\{[\s\S]*?font:\s*800 9px/);
    expect(hudCss).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.support-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/);
    expect(shell).toContain('class="support-list" role="list"');
    expect(shell).toContain('role="listitem" data-support=');
  });

  it('preserves an assertive accessible countdown with a motion-free alternative', () => {
    expect(shell).toContain('id="countdown" role="status" aria-live="assertive" aria-atomic="true"');
    expect(tacticalCss).toContain('@keyframes pass65CountdownBeatOdd');
    expect(tacticalCss).toContain('@keyframes pass65CountdownBeatEven');
    expect(hudCss).toContain('@keyframes pass65HudCountdownRing');
    expect(hudCss).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*?#countdown\.countdown-cue-active[\s\S]*?animation:\s*none/);
  });

  it('keeps the possessed chopper HUD minimal, legible, and free of exterior rotor presentation', () => {
    expect(tacticalCss).toContain('#support-combat-feedback[data-support-kind="chopper"][data-possessed="true"]');
    expect(tacticalCss).toMatch(/data-support-kind="chopper"[\s\S]*?#support-platform-name\s*\{\s*font-size:\s*17px/);
    expect(tacticalCss).toMatch(/data-support-kind="chopper"[\s\S]*?\.support-optic-frame\s*\{[\s\S]*?width:\s*min\(62vw, 820px\)/);
    expect(shell).toContain('class="support-optic-frame" aria-hidden="true"');
  });
});
