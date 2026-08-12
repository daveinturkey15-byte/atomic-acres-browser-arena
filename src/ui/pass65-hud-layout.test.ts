import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hudCss = readFileSync(new URL('./pass65-hud.css', import.meta.url), 'utf8');
const tacticalCss = readFileSync(new URL('./tactical-ui.css', import.meta.url), 'utf8');
const rootCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./pass64-shell.ts', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');

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

  it('centres the urgent sticky warning safely while retaining compact combat status', () => {
    expect(shell).toContain('id="sticky-warning" hidden role="alert" aria-live="assertive" aria-atomic="true"');
    expect(hudCss).toMatch(/#sticky-warning\s*\{[\s\S]*?left:\s*50%[\s\S]*?top:\s*50%/);
    expect(hudCss).toMatch(/#sticky-warning\s*\{[\s\S]*?transform:\s*translate\(-50%, -50%\)/);
    expect(hudCss).toContain('animation: sticky-warning-flash var(--sticky-warning-duration, 500ms) ease-out both;');
    expect(hudCss).toContain('@keyframes sticky-warning-flash');
    expect(hudCss).toContain('#sticky-warning[hidden] { display: none; }');
    expect(hudCss).toMatch(/@media \(max-width: 760px\), \(max-height: 520px\)[\s\S]*?#sticky-warning/);
    expect(hudCss).toContain("html[data-reduced-sensory='true'] #sticky-warning");
    expect(mainSource).toContain("addFeed('STUCK', 'coral');");
    expect(mainSource).toContain("addFeed('STUCK', 'gold');");
  });

  it('keeps the possessed chopper HUD minimal, legible, and free of exterior rotor presentation', () => {
    expect(tacticalCss).toContain('#support-combat-feedback[data-support-kind="chopper"][data-possessed="true"]');
    expect(tacticalCss).toMatch(/data-support-kind="chopper"[\s\S]*?#support-platform-name\s*\{\s*font-size:\s*17px/);
    expect(tacticalCss).toMatch(/data-support-kind="chopper"[\s\S]*?\.support-optic-frame\s*\{[\s\S]*?width:\s*min\(62vw, 820px\)/);
    expect(shell).toContain('class="support-optic-frame" aria-hidden="true"');
  });

  it('gives Chopper possession one uncluttered HUD lane and one centre marker', () => {
    for (const surface of [
      '.hud-mission-console', '.hud-map-console', '.hud-operator-console', '.hud-weapon-console',
      '#support-block', '#support-combat-feedback', '#crosshair',
    ]) {
      expect(hudCss).toContain(`html[data-killstreak-possession="chopper-gunner"] ${surface}`);
    }
    expect(hudCss).toMatch(/data-killstreak-possession="chopper-gunner"[\s\S]*?display:\s*none !important/);
    expect(hudCss).not.toContain('html[data-killstreak-possession="chopper-gunner"] #gunner-cockpit-hud');
  });

  it('enhances the existing support action row without a duplicate operate banner', () => {
    expect(shell).not.toContain('id="killstreak-enter-prompt"');
    expect(shell).toContain('<footer id="support-control-action">');
    expect(hudCss).toMatch(/#support-control-action\s*\{[\s\S]*?font:\s*800 clamp\(10px, 0\.56vw, 13px\)/);
    expect(hudCss).toContain('#support-combat-feedback[data-awaiting-operation="true"] #support-control-action');
    expect(hudCss).not.toContain('#killstreak-enter-prompt');
  });
});
