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

/** `#rrggbb` -> [r, g, b], each 0..255. */
function parseHex(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** The hex value of a custom property declaration, or null if it is not one. */
function hexOf(css: string, property: string): [number, number, number] | null {
  const match = new RegExp(`${property}:\\s*(#[0-9a-fA-F]{6})`, 'u').exec(css);
  return match ? parseHex(match[1]!.toLowerCase()) : null;
}

/**
 * WCAG relative luminance, 0 (black) to 1 (white).
 *
 * Used instead of pinning hex values so the AGENTS.md requirement - that the
 * command deck stay a "bright, legible tactical system" rather than regressing
 * to a "near-black or dark-blue monolith" - is enforced as the PROPERTY it
 * actually is, leaving the palette free to change.
 */
function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
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
    expect(hud).toMatch(/translate:[\s\S]{0,40}?var\(--hud-sway-x, 0\)/u);
    expect(hud).toMatch(/@keyframes p77-breathe-a \{[\s\S]*?transform: translate3d/u);
    for (const name of ['p77-breathe-a', 'p77-breathe-b', 'p77-breathe-c']) {
      expect(hud).toContain(`@keyframes ${name}`);
    }
  });

  it('puts impact on the SAME `translate` and roll on the free `rotate` channel', () => {
    // Three transform channels, three independent producers, none able to
    // clobber another: `translate` carries the two runtime-computed positional
    // signals, `transform` carries the keyframe animation, `rotate` carries
    // impact roll. Putting roll on `transform` would kill the breathing;
    // putting it on `translate` would need a matrix the runtime cannot express.
    expect(hud).toMatch(/translate:[\s\S]*?var\(--hud-impact-x, 0\)/u);
    expect(hud).toMatch(/rotate: calc\(var\(--hud-impact-roll, 0\)/u);
  });

  it('keeps the stationary idle independent of movement', () => {
    // The defect: --hud-breathe used to be movement intensity, so it was
    // exactly zero standing still and the HUD froze. Respiration and gait are
    // now separate terms and BOTH must appear in the displacement.
    expect(hud).toMatch(/var\(--hud-breathe, 0\) \* [\d.]+px/u);
    expect(hud).toMatch(/var\(--hud-gait, 0\) \* [\d.]+px/u);
  });

  it('registers every impact property with an at-rest default', () => {
    // An unwired build must render a still, unflashed HUD - never a displaced
    // or permanently red one.
    for (const property of [
      '--hud-impact-x', '--hud-impact-y', '--hud-impact-roll',
      '--hud-impact-chroma', '--hud-impact-flash',
    ]) {
      expect(hud).toMatch(new RegExp(`@property ${property} \\{[\\s\\S]*?syntax: '<number>';`, 'u'));
      expect(hud).toMatch(new RegExp(`@property ${property} \\{[\\s\\S]*?initial-value: 0;`, 'u'));
    }
    expect(hud).toMatch(/@property --hud-impact-bearing \{[\s\S]*?syntax: '<angle>';/u);
    expect(hud).toMatch(/@property --hud-impact-bearing \{[\s\S]*?initial-value: 0deg;/u);
  });

  it('gives a bullet and an explosion visibly different impact signatures', () => {
    expect(hud).toContain("#hud[data-hud-impact='explosion']::after");
    expect(hud).toContain("#hud[data-hud-impact='fall']::after");
  });

  it('never lets the impact wash cover the centre of the screen', () => {
    // Combat safety: the wash is edge-only, masked out of the middle, so it
    // can never obscure what the player is aiming at.
    expect(hud).toMatch(/#hud::after \{[\s\S]*?mask-image: radial-gradient\([\s\S]*?transparent/u);
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
    // The HUD must be completely static under either switch. All THREE
    // transform channels have to be cleared, not two: `rotate` carries impact
    // roll, so clearing only animation/translate/transform would leave a
    // motion-sensitive player with a HUD that still tilts when they are shot.
    expect(hud).toMatch(/html\[data-reduced-motion='true'\][\s\S]*?\{\s*animation: none;\s*translate: none;\s*transform: none;\s*rotate: none;\s*\}/u);
    expect(hud).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation: none;\s*translate: none;\s*transform: none;\s*rotate: none;/u);
  });

  it('keeps telling the player they were hit under reduced motion', () => {
    // Reduced motion removes MOVEMENT, not INFORMATION. The directional
    // damage wash is how a player learns where they are being shot from, so it
    // survives both switches at reduced strength rather than being hidden.
    expect(hud).toMatch(/html\[data-reduced-motion='true'\] #hud::after \{[\s\S]*?opacity: calc\(var\(--hud-impact-flash, 0\)/u);
    expect(hud).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?#hud::after \{[\s\S]*?opacity: calc\(var\(--hud-impact-flash, 0\)/u);
  });

  it('honours the sensory switch by flattening blur and glow, not by hiding data', () => {
    expect(hud).toContain("html[data-reduced-sensory='true'] #hud #matchbar");
    expect(hud).toMatch(/html\[data-reduced-sensory='true'\][\s\S]*?backdrop-filter: none;/u);
    expect(shell).toMatch(/html\[data-reduced-sensory='true'\] #menu\.pass64-command-deck::after \{\s*display: none;\s*\}/u);
  });
});

describe('Pass 77 HF-370 reskin - command deck', () => {
  it('keeps the deck bright, as AGENTS.md requires, while giving it a material', () => {
    // MEASURED, NOT PINNED. The previous version of this test asserted the
    // literal hex of the deck ground. That pinned an aesthetic the owner had
    // already rejected three times: any real reskin had to either fail this
    // test or leave it asserting a look that no longer rendered.
    //
    // What AGENTS.md actually requires is that the deck stay BRIGHT - "rather
    // than regressing to a near-black or dark-blue monolith". So that is what
    // is measured. The palette is now free to move; the guarantee is not.
    const paper = hexOf(shell, '--p77-paper');
    expect(paper).not.toBeNull();
    expect(relativeLuminance(paper!)).toBeGreaterThan(0.75);

    // ...and it must not be a BLUE monolith either, which is the other half of
    // the same AGENTS.md sentence. Blue may not be the dominant channel.
    const [red, green, blue] = paper!;
    expect(blue).toBeLessThanOrEqual(Math.max(red, green));

    // A light source and a ground, not a flat fill.
    expect(shell).toMatch(/#menu\.pass64-command-deck \{[\s\S]*?radial-gradient\(120% 90% at 6% -10%/u);
    expect(shell).toMatch(/linear-gradient\(168deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 62%, #[0-9a-f]{6} 100%\)/u);
  });

  it('commits to a genuinely different palette from the rejected build', () => {
    // The owner rejected three builds with "the menus really don't look that
    // different", and the audit traced it to the palette being untouched
    // between them. These are the exact values of the rejected deck; if any of
    // them comes back, the same complaint comes back with it.
    for (const rejected of [
      '#f7faf9', // the cold near-white paper
      '#e8f0ef', // the cold workspace ground
      '#0f8b93', // the teal accent
      '#12a7b1', // the lit teal
      '#16323b', // the blue-black instrument sheet
    ]) expect(shell, `rejected Pass 75/77-v5 value ${rejected} is back`).not.toContain(`: ${rejected}`);
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
    expect(shell).toMatch(/#menu \.command-header \{[\s\S]*?background-color: var\(--p77-dark-bottom\);/u);

    // The workspace is the surface the player actually reads and operates, so
    // AGENTS.md's brightness requirement binds hardest here. Measured, for the
    // same reason as the deck ground above.
    const workspace = /#menu \.command-workspace \{[\s\S]*?background-color: (#[0-9a-f]{6});/u.exec(shell);
    expect(workspace).not.toBeNull();
    expect(relativeLuminance(parseHex(workspace![1]!))).toBeGreaterThan(0.70);

    expect(shell).toMatch(/linear-gradient\(166deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 62%, #[0-9a-f]{6} 100%\)/u);
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

/*
 * Pass 79 reskin completion - the last three surfaces still on the OLD
 * teal-on-white/cold-blue-black deck. The owner's rejection was "the menus
 * really don't look that different"; these sheets were imported from shell
 * modules (advanced-graphics.css via pass64-shell.ts, project-map-dialog.css
 * via project-map-dialog.ts) or predate the warm palette (the deployment
 * console block in tactical-ui.css), so the Pass 77 re-pointing never reached
 * them. These assertions are written against declarations-only text, like the
 * checks above, so a comment cannot satisfy them.
 */
describe('Pass 79 reskin completion - no surface left on the rejected deck', () => {
  /** The exact signatures of the rejected cold/teal deck, per sheet. */
  const rejectedSignatures = {
    './advanced-graphics.css': [
      '#0b6b78', // deep readable teal used as the panel accent
      '#0e8b9b', // SAVE button gradient start
      '#0a5f6b', // SAVE button gradient end
      '#12a4b6', // SAVE button hover lit teal
      '#54d9ec', // bright cyan category-edge fallback
      '--ui-accent-readable', // undefined token whose fallback was teal
      '--ui-ink', // undefined token whose fallback was pale cold white
    ],
    './project-map-dialog.css': [
      '#a4ecf0', // cold cyan button text
      'rgba(18, 167, 177', // teal button plate
      'rgba(140, 232, 240', // cyan button edge
      '#12a7b1', // lit teal hover
      'rgba(88, 227, 220', // aqua chips, intro edge, tree rails, bullet glow
      'var(--aqua)', // direct reads of the team-colour token
      'rgba(244, 196, 79', // the old gold hairlines and selected tab
      'rgba(12, 24, 27', // cold blue-black panel ground
      'rgba(5, 12, 15', // cold blue-black panel ground
      'rgba(4, 9, 12', // cold blue-black backdrop
    ],
  } as const;

  for (const [sheet, rejected] of Object.entries(rejectedSignatures)) {
    it(`brings ${sheet} onto the warm bone / ink / burnt-orange deck`, () => {
      const css = declarationsOnly(sheet);
      for (const value of rejected) {
        expect(css, `rejected old-deck value ${value} is back in ${sheet}`).not.toContain(value);
      }
    });
  }

  it('repoints the deployment transition console off the cold cyan scrim', () => {
    const css = declarationsOnly('./tactical-ui.css');
    // Every use of these values in tactical-ui.css is inside the deployment
    // console/scrim block (verified before this test was written), so a
    // file-wide rejection is safe.
    for (const value of ['#54e6d9', 'rgba(84, 230, 217', 'rgba(5, 19, 23', 'rgba(2, 12, 15']) {
      expect(css, `rejected old-deck value ${value} is back in tactical-ui.css`).not.toContain(value);
    }
  });

  it('warms the Options panel ground itself, not just its sections', () => {
    // pass66-overhaul.css painted the whole Options panel cold blue-black
    // (rgba(8, 24, 29) -> rgba(4, 12, 16)); Pass 77 re-pointed the sections
    // inside it but left this ground, so the panel kept a cold halo. The value
    // is unique to that panel rule in the overhaul sheet, so a file-wide
    // rejection is safe (verified before this test was written).
    const css = declarationsOnly('./pass66-overhaul.css');
    expect(css, 'rejected old-deck value rgba(8, 24, 29 is back in pass66-overhaul.css').not.toContain('rgba(8, 24, 29');
  });
});
