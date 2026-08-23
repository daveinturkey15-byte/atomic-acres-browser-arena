import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bootstrap = readFileSync(new URL('../bootstrap.ts', import.meta.url), 'utf8');

/**
 * These sheets are heavily commented on purpose - the rationale for a visual
 * decision is the part a later reviewer cannot reconstruct. That means every
 * structural assertion has to read DECLARATIONS, not prose, or a comment
 * mentioning `@layer` or `.is-ready` would satisfy or break a check about the
 * actual CSS. Comments are stripped once, here.
 */
function declarationsOnly(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
}

const hud = declarationsOnly('./pass77-instrument-hud.css');
const shell = declarationsOnly('./pass77-command-shell.css');

/** Every font-size literal in a sheet, in px. */
function pixelFontSizes(css: string): number[] {
  return [...css.matchAll(/font-size:\s*([0-9]+(?:\.[0-9]+)?)px/gu)].map((match) => Number(match[1]));
}

/** The selector text of every top-level rule that sets a given property. */
function selectorsSetting(css: string, property: string): string[] {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)];
  return rules
    .filter((rule) => new RegExp(`(^|[;\\s])${property}\\s*:`, 'u').test(rule[2]!))
    .map((rule) => rule[1]!.trim());
}

describe('Pass 77 HF-370 reskin - cascade placement', () => {
  it('loads both sheets last and unlayered, after the Pass 75 sheets', () => {
    const menu75 = bootstrap.indexOf("import './ui/pass75-menu-redesign.css'");
    const hudSheet = bootstrap.indexOf("import './ui/pass77-instrument-hud.css'");
    const shellSheet = bootstrap.indexOf("import './ui/pass77-command-shell.css'");
    expect(menu75).toBeGreaterThan(0);
    expect(hudSheet).toBeGreaterThan(menu75);
    expect(shellSheet).toBeGreaterThan(hudSheet);
    // Unlayered is the whole mechanism: pass66-readability.css is unlayered and
    // outranks every @layer, so a layered sheet here would silently not apply.
    expect(hud).not.toMatch(/@layer/u);
    expect(shell).not.toMatch(/@layer/u);
  });
});

describe('Pass 77 HF-370 reskin - HUD material and instrumentation', () => {
  it('registers the four runtime inputs with safe unwired defaults', () => {
    for (const property of ['--hud-sway-x', '--hud-sway-y', '--hud-breathe', '--hud-health']) {
      expect(hud).toMatch(new RegExp(`@property ${property} \\{[\\s\\S]*?syntax: '<number>';`, 'u'));
    }
    // Unwired, sway and breathe must be zero (static HUD) and health full
    // (healthy colour), so an unwired build is never wrong-looking.
    expect(hud).toMatch(/@property --hud-sway-x \{[\s\S]*?initial-value: 0;/u);
    expect(hud).toMatch(/@property --hud-breathe \{[\s\S]*?initial-value: 0;/u);
    expect(hud).toMatch(/@property --hud-health \{[\s\S]*?initial-value: 1;/u);
  });

  it('replaces flat fills with a blurred layered sheet on the five clusters', () => {
    for (const selector of [
      '#hud #matchbar',
      '#hud .hud-map-console',
      '#hud .hud-operator-console',
      '#hud #weapon-block',
      '#hud #support-block',
    ]) expect(hud).toContain(selector);
    expect(hud).toContain('backdrop-filter: var(--p77-glass)');
    expect(hud).toContain('--p77-glass: blur(10px) saturate(1.45)');
    // Every backdrop-filter declaration carries its -webkit- twin, so the
    // material does not silently degrade to a flat fill on older WebKit.
    const plain = (hud.match(/(?<!-webkit-)backdrop-filter:/gu) ?? []).length;
    const prefixed = (hud.match(/-webkit-backdrop-filter:/gu) ?? []).length;
    expect(plain).toBeGreaterThan(3);
    expect(prefixed).toBe(plain);
  });

  it('carries real instrument micro-detail rather than plain rectangles', () => {
    expect(hud).toContain('--p77-bracket: 13px');
    expect(hud).toContain('repeating-linear-gradient(90deg, var(--p77-tick) 0 1px, transparent 1px 8px)');
    expect(hud).toMatch(/#hud \.health-track::after \{[\s\S]*?repeating-linear-gradient\([\s\S]*?10%\)/u);
    // Tight technical geometry, not a 10px web-card radius.
    expect(hud).toContain('--p77-radius: 2px');
  });

  it('drives the vitals ramp from the live value with a healthy unwired default', () => {
    // The wash is dead-band + linear: nothing below 70% condition, full danger
    // at zero, so a scratch does not repaint the bar.
    expect(hud).toContain('--p77-hurt: calc(max(0, 0.7 - var(--hud-health, 1)) / 0.7)');
    expect(hud).toContain('rgb(255 96 82 / calc(var(--p77-hurt) * 100%))');
  });

  it('paints the clusters as directional scrims, not uniform box fills', () => {
    expect(hud).toContain('--p77-sheet-dense');
    expect(hud).toContain('--p77-sheet-thin');
    expect(hud).toContain('linear-gradient(var(--p77-fade), var(--p77-sheet-dense) 0%, var(--p77-sheet-thin) 100%)');
    // Every cluster fades away from the screen edge it is anchored to, so no
    // two share a direction by accident.
    const fades = [...hud.matchAll(/#hud [^{]*\{\s*--p77-fade:\s*(\d+)deg;\s*\}/gu)].map((m) => Number(m[1]));
    expect(fades.length).toBe(5);
    expect(new Set(fades).size).toBe(5);
  });

  it('stops the damage feeds from being a permanent empty slab', () => {
    expect(hud).toMatch(/#hud #damage-feeds,[\s\S]*?\{\s*border: 0;\s*background: none;/u);
    expect(hud).toContain('#hud #damage-done-feed > *');
  });

  it('leaves no panel-inside-a-panel from the superseded Pass 75 sheet', () => {
    // #health-block, #room-hud and #killfeed live inside a cluster that now
    // carries the sheet, or are empty most of the match. A bordered glass box
    // inside a bordered glass box is the slab reading this pass removes.
    expect(hud).toMatch(/#hud #health-block,\s*#hud #room-hud,\s*#hud #killfeed \{[\s\S]*?background: none;/u);
  });

  it('targets the support classes the runtime actually sets', () => {
    // legacy-main.ts toggles `.ready` and `.controller-selected`; the Pass 75
    // sheet targeted [data-support-state] and .is-ready, which never existed.
    expect(hud).toContain('#hud .support-list b.ready');
    expect(hud).toContain('#hud .support-list b.controller-selected');
    expect(hud).not.toContain("[data-support-state='ready']");
    expect(hud).not.toContain('.is-ready');
  });

  it('never lowers a font below the AGENTS.md floor', () => {
    for (const size of pixelFontSizes(hud)) expect(size).toBeGreaterThanOrEqual(9);
  });
});

describe('Pass 77 HF-370 reskin - diegetic motion', () => {
  it('splits wired lag onto `translate` and idle breathing onto `transform`', () => {
    // The split is load-bearing: an animation always beats an inline style, so
    // a single `transform` carrying both would make the wiring a no-op.
    expect(hud).toMatch(/translate:\s*\n?\s*calc\(var\(--hud-sway-x, 0\)/u);
    expect(hud).toMatch(/@keyframes p77-breathe-a \{[\s\S]*?transform: translate3d/u);
    for (const name of ['p77-breathe-a', 'p77-breathe-b', 'p77-breathe-c']) {
      expect(hud).toContain(`@keyframes ${name}`);
    }
  });

  it('gives each cluster a different lag so the parallax reads as depth', () => {
    const lags = [...hud.matchAll(/--p77-lag:\s*(\d+)/gu)].map((match) => Number(match[1]));
    expect(new Set(lags).size).toBeGreaterThanOrEqual(5);
    // The CSS ceiling the pass77-hud-sway.ts +-1 clamp is designed against.
    for (const lag of lags) expect(lag).toBeLessThanOrEqual(10);
  });

  it('never moves an aim, confirmation or warning surface', () => {
    const moved = selectorsSetting(hud, 'translate').join(' ');
    for (const forbidden of [
      '#crosshair', '#hitmarker', '#damage-numbers', '#sniper-scope',
      '#railgun-thermal', '#dmr-thermal', '#countdown', '#banner', '#respawn',
      'gunner-reticle',
    ]) expect(moved).not.toContain(forbidden);
  });

  it('gates every motion layer behind BOTH reduced-motion switches', () => {
    for (const css of [hud, shell]) {
      expect(css).toContain("html[data-reduced-motion='true']");
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    }
    // The HUD must be completely static under either switch: animation, the
    // wired translate and the composed transform all cleared.
    expect(hud).toMatch(/html\[data-reduced-motion='true'\][\s\S]*?\{\s*animation: none;\s*translate: none;\s*transform: none;\s*\}/u);
    expect(hud).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation: none;\s*translate: none;\s*transform: none;/u);
  });

  it('honours the sensory switch by flattening blur and glow, not by hiding data', () => {
    expect(hud).toContain("html[data-reduced-sensory='true'] #hud #matchbar");
    expect(hud).toMatch(/html\[data-reduced-sensory='true'\][\s\S]*?backdrop-filter: none;/u);
    expect(shell).toMatch(/html\[data-reduced-sensory='true'\] #menu\.pass64-command-deck::after \{\s*display: none;\s*\}/u);
  });
});

describe('Pass 77 HF-370 reskin - command deck', () => {
  it('keeps the deck bright, as AGENTS.md requires, while giving it a material', () => {
    expect(shell).toContain('--p77-paper: #f7faf9');
    expect(shell).toMatch(/#menu\.pass64-command-deck \{[\s\S]*?radial-gradient\(120% 90% at 6% -10%/u);
    // A light source and a ground, not a flat fill.
    expect(shell).toContain('linear-gradient(168deg, #ffffff 0%, #eef4f3 62%, #e7eeed 100%)');
  });

  it('uses tight technical geometry instead of the dated web-card radius', () => {
    expect(shell).toContain('--p77-radius: 3px');
    for (const size of [...shell.matchAll(/border-radius:\s*(\d+)px/gu)].map((m) => Number(m[1]))) {
      expect(size).toBeLessThanOrEqual(6);
    }
  });

  it('animates state instead of cutting to it, inside the review capture window', () => {
    expect(shell).toContain('@keyframes p77-panel-in');
    const duration = /animation: p77-panel-in (\d+)ms/u.exec(shell);
    expect(duration).not.toBeNull();
    // capture-visual-review.mjs waits 450 ms after a tab click; an evidence
    // frame must never be captured mid-transition.
    expect(Number(duration![1])).toBeLessThanOrEqual(400);
    expect(shell).toContain('transform: scaleY(0)');
    expect(shell).toContain('transform: scaleX(0)');
  });

  it('applies one card language to every selectable card', () => {
    for (const selector of [
      '#menu .map-card',
      '#menu .kit-card',
      '#menu .killstreak-slot-card',
      '#menu .operator-skin-card',
      '#menu .operator-anim-card',
    ]) expect(shell).toContain(selector);
    // Selection is fill + bar + edge, never colour alone.
    expect(shell).toContain('box-shadow: inset 3px 0 0 var(--p77-accent), inset 0 0 0 1px var(--p77-accent-line)');
    // The angular signature: deck, cards and the primary action all chamfered.
    expect((shell.match(/clip-path: polygon\(/gu) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('repairs the map-card rules line that auto-placement wrapped one word per line', () => {
    expect(shell).toMatch(/#menu \.map-card small \{\s*grid-column: 1 \/ -1;\s*\}/u);
  });

  it('makes the header and rail one dark chrome L around a bright workspace', () => {
    // AGENTS.md forbids a near-black monolith: the surface the player reads and
    // operates must stay bright, so the workspace ground is asserted light.
    expect(shell).toMatch(/#menu \.command-header \{[\s\S]*?background-color: var\(--p77-dark-bottom\);/u);
    expect(shell).toMatch(/#menu \.command-workspace \{[\s\S]*?background-color: #e8f0ef;/u);
    expect(shell).toContain('linear-gradient(166deg, #f4f9f8 0%, #e4edec 62%, #dde8e7 100%)');
  });

  it('replaces the stock browser slider that was the deck\'s most dated control', () => {
    expect(shell).toContain("#menu input[type='range']::-webkit-slider-runnable-track");
    expect(shell).toContain("#menu input[type='range']::-webkit-slider-thumb");
    expect(shell).toContain("#menu input[type='range']::-moz-range-track");
    expect(shell).toContain("#menu input[type='range']::-moz-range-thumb");
  });

  it('brings the dark Options surface into the same instrument sheet', () => {
    expect(shell).toContain('#menu #menu-panel-options .settings-section');
    expect(shell).toContain('--p77-dark-hair-lit');
  });

  it('never lowers a font below the AGENTS.md floor', () => {
    for (const size of pixelFontSizes(shell)) expect(size).toBeGreaterThanOrEqual(10);
  });
});
