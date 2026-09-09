import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS, SELECTABLE_ARENAS } from '../map-selection';
import { createPass64ShellViewModel, renderPass64Shell } from './pass64-shell';
import { DEFAULT_LIGHTING_TIME_CHOICE } from '../rendering/lighting-conditions';

describe('Pass 66 command shell', () => {
  it('escapes persisted player names before placing them in markup', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('"<script>&'));
    expect(markup).toContain('value="&quot;&lt;script&gt;&amp;"');
    expect(markup).not.toContain('<script>');
  });

  it('renders the new command hierarchy and ordered player-facing arenas', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect(markup).toContain('class="panel pass64-command-deck"');
    expect(markup).toMatch(/PASS 70/);
    expect(markup).not.toContain('THE BIG ONE');
    expect(markup).not.toContain('HITL REVIEW DECK');
    expect(markup).not.toContain('LIVE SYSTEMS READY');
    expect(markup).toContain('class="command-rail"');
    expect(markup).toContain('class="arena-command"');
    expect(markup).toContain('class="deployment-manifest"');
    expect(markup).toContain('class="hud-mission-console"');
    expect(markup).toContain('class="hud-map-console"');
    expect(markup).toContain('class="hud-operator-console"');
    expect(markup).toContain('class="hud-weapon-console"');
    expect([...markup.matchAll(/data-arena-route="([^"]+)"/g)].map((match) => match[1])).toEqual(
      SELECTABLE_ARENAS.map((entry) => entry.routeId),
    );
    // HF-495 (owner, 2026-09-04): rebuild preview order is load-bearing, so pin
    // the offered sequence explicitly too.
    expect([...markup.matchAll(/data-arena-route="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'nuke-town-rebuild',
      'raid-rebuild',
      'terminal',
      'rustrig',
      'gun-range',
      'high-seas',
      'test1',
      'map3',
    ]);
    // HF-429 (owner, 2026-09-03): farcrysis is PARKED, so it is not rendered.
    // This pin has now swung three times - absent, present-and-PREVIEW, absent
    // again - so it is written DERIVED rather than as a third literal: every
    // registry row flagged `selectable: false` must render no card, and every
    // flagged-selectable row must render exactly one. A future park or un-park
    // moves one field in src/map-selection.ts and nothing here.
    for (const entry of ARENA_SELECTIONS) {
      const rendered = markup.includes(`data-arena-route="${entry.routeId}"`);
      expect(rendered, `${entry.id} card rendered=${rendered}, selectable=${entry.selectable !== false}`)
        .toBe(entry.selectable !== false);
    }
    // Not vacuous: something really is parked, and it really is still a
    // registered arena that old links decode to.
    expect(ARENA_SELECTIONS.some((entry) => entry.selectable === false)).toBe(true);
    // The PREVIEW label, also derived. A card that the registry labels
    // PREVIEW must say so where a player reads it, and the match is bounded
    // so it cannot run into the NEXT card and borrow its label. `[^]` is the
    // any-character class here on purpose: it needs no backslash escape, and
    // a mis-escaped [\s\S] inside a template literal silently degrades to
    // [sS], which matches almost nothing and passes vacuously.
    const previewCards = SELECTABLE_ARENAS.filter(
      (row) => /PREVIEW/.test(`${row.selectorLabel} ${row.rulesLabel}`),
    );
    expect(previewCards.length, 'the PREVIEW pin must not be vacuous').toBeGreaterThan(0);
    for (const entry of previewCards) {
      expect(markup, `${entry.id} must be labelled PREVIEW`).toMatch(
        new RegExp(`data-arena-route="${entry.routeId}"(?:(?!data-arena-route=)[^])*?PREVIEW`),
      );
    }
    expect(markup).toContain(`${SELECTABLE_ARENAS.length} deployable spaces · choose before launch`);
  });

  it('keeps deployment controls inert until the gameplay module binds their handlers', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect(markup).toContain('id="solo" class="primary" disabled');
    expect(markup).toContain('id="host" disabled');
    expect(markup).toContain('id="room-input" placeholder="Paste room code" autocomplete="off" disabled');
    expect(markup).toContain('id="join" disabled');
    expect(markup.match(/class="map-card[^>]+disabled/g)).toHaveLength(SELECTABLE_ARENAS.length);
  });

  it('renders four curated kits, exactly three custom slots with nested EDIT, and one manager', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect([...markup.matchAll(/data-kit-id="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'balanced', 'runner', 'breacher', 'marksman',
    ]);
    expect([...markup.matchAll(/data-custom-preset-id="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'custom-1', 'custom-2', 'custom-3',
    ]);
    // Owner direction: rename/modify is nested inside each Custom card.
    expect(markup.match(/id="loadout-manage"/g)).toBeNull();
    expect([...markup.matchAll(/data-custom-modify="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'custom-1', 'custom-2', 'custom-3',
    ]);
    expect(markup).toContain('id="loadout-primary"');
    expect(markup).toContain('id="loadout-secondary"');
    expect(markup).toContain('id="loadout-grenade"');
    expect(markup).toContain('<option value="frag">Frag</option>');
    expect(markup).toContain('<option value="smoke">Smoke</option>');
    expect(markup).toContain('<option value="flash">Flashbang</option>');
    expect(markup).toContain('<option value="semtex">Semtex</option>');
    expect(markup.match(/data-weapon-presentation/g)).toHaveLength(7);
    expect(markup.match(/data-weapon-dps(?:\s|>)/g)).toHaveLength(8);
    expect(markup.match(/data-weapon-metric="damage"/g)).toHaveLength(8);
    expect(markup.match(/data-weapon-metric="piercing"/g)).toHaveLength(8);
    expect(markup.match(/data-weapon-metric=/g)).toHaveLength(40);
    expect(markup).not.toContain('data-loadout-stat="dps"');
    expect(markup).toContain('id="loadout-save-status"');
    expect(markup.match(/✓ SELECTED/g)).toHaveLength(7);
    expect(markup).toContain('pass65-firearms/carbine-hero-quarter.webp');
    expect(markup).toContain('pass65-firearms/m4a1-hero-quarter.webp');
  });

  // Was "four simple graphics modes". The owner asked for a fifth on 2026-08-24: "would be
  // great to have a 4th graphics mode above performance ... plus extra RTX things like
  // raytracing", so this test pinned an intent he has since overridden. Re-pinned, not
  // relaxed: the list is still exact and ordered, and now also asserts the honest NAME.
  //
  // HF-418 (owner 2026-09-02 19:10) re-pins it again, and STRENGTHENS it twice.
  // A sixth rendering mode, BALANCED, sits between PERFORMANCE and QUALITY, and
  // the list is now asserted to CLIMB rather than to lead with the default. The
  // RTX rule is unchanged in substance and tightened in form: no option that
  // maps to a rendering profile may carry the letters RTX, because no browser
  // exposes a ray-tracing pipeline or RT cores. What is allowed is exactly one
  // option that is NOT a profile — the native-runtime EXPLAINER, whose value
  // is outside GraphicsPreset and which changes no renderer setting at all
  // (src/ui/rtx-native-runtime-explainer.ts, src/graphics-profile-contract.test.ts).
  //
  // HF-438 (owner 2026-09-03) retires the RAY TRACED rung entirely — "I don't
  // think we should have a ray tracing AND an RTX mode" — so the list is five
  // options again: four named rungs (QUALITY and MAX now carry the ray-traced
  // controls) plus CUSTOM, plus the explainer.
  it('exposes the climbing graphics ladder plus the RTX explainer, and keeps WebGPU tuning under Advanced Graphics', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    const presetMarkup = markup.match(/<select id="graphics-profile">([\s\S]*?)<\/select>/)?.[1] ?? '';
    const options = [...presetMarkup.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)]
      .map((match) => [match[1], match[2]]);
    expect(options).toEqual([
      ['performance', 'PERFORMANCE'],
      ['balanced', 'BALANCED'],
      ['high', 'QUALITY'],
      ['max', 'MAX'],
      ['custom', 'CUSTOM'],
      ['rtx-native-runtime-info', 'RTX — WHAT IS IT?'],
    ]);
    for (const [value, label] of options) {
      if (value === 'rtx-native-runtime-info') continue;
      expect(label, `${value}: no browser exposes RT cores; RTX would be an unbackable claim`)
        .not.toMatch(/RTX/i);
      expect(value, 'the explainer value is the only non-preset entry')
        .not.toMatch(/RTX/i);
    }
    expect(markup).toContain('id="advanced-graphics"');
    expect(markup).toContain('ADVANCED GRAPHICS');
    expect(markup).toMatch(/id="graphics-target-fps"[^>]+type="range"[^>]+min="30" max="360"/);
    expect(markup).toMatch(/id="graphics-frame-rate-limit"[^>]+max="361"/);
    expect(markup).toContain('AI upscaling / frame generation');
    expect(markup.indexOf('id="advanced-graphics"')).toBeLessThan(markup.indexOf('id="graphics-render-scale"'));
  });

  it('registers dedicated visual hooks for support feedback and crate collection', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect(markup).toContain('id="chopper-damage-dealt"');
    expect(markup).toContain('id="support-platform-name"');
    expect(markup).toContain('id="support-platform-mode"');
    expect(markup).toContain('id="support-platform-health"');
    expect(markup).toContain('id="support-platform-ammo"');
    expect(markup).toContain('id="support-platform-time"');
    expect(markup).toContain('id="support-control-action"');
    expect(markup).not.toContain('id="killstreak-enter-prompt"');
    expect(markup).toContain('id="adrenaline-hud"');
    expect(markup).toContain('id="adrenaline-time"');
    expect(markup).toContain('id="support-interaction-prompt"');
    expect(markup).toContain('<kbd>F</kbd><span>COLLECT KILLSTREAK</span>');
  });

  it('makes public leaderboard result sharing an explicit default-off choice with disclosure', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect(markup).toContain('id="privacy-settings"');
    expect(markup).toContain('id="share-global-leaderboard" type="checkbox"');
    expect(markup).not.toContain('id="share-global-leaderboard" type="checkbox" checked');
    expect(markup).toContain('chosen callsign, streak, kills, deaths, build/season and a pseudonymous browser ID');
    expect(markup).toContain('Turning this off stops future submissions and forgets this browser ID');
  });

  it('ships a prerecorded menu preview surface instead of renderer-owned showcase geometry', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect(markup).toContain('id="menu-preview-video"');
    expect(markup).toContain('id="menu-preview-poster"');
    expect(markup).toContain('autoplay loop muted playsinline preload="metadata"');
    expect(markup).toContain('data-renderer-submissions="0"');
    expect(markup).toContain('<div id="match-pause-backdrop"');
    expect(markup).toContain('data-contract="game-canvas-css-compositor-v1"');
    expect(markup).toContain('data-periodic-readback-count="0"');
    expect(markup).not.toContain('<canvas id="match-pause-backdrop"');
    expect(markup).not.toContain('class="preview-helicopter"');
    expect(markup).not.toContain('class="preview-cat"');
  });

  // MAP3 (HF-409): the menu is the only place a player can learn the standalone
  // showcase page exists.
  it('ships the showcase link hidden and with no href, for the selection code to fill in', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect(markup).toContain('id="arena-showcase-link"');
    expect(markup).toContain('class="arena-showcase-link"');

    const link = /<a class="arena-showcase-link"[^>]*>/.exec(markup)?.[0] ?? '';
    expect(link).not.toBe('');
    // Hidden until an arena that HAS a second page is selected: the shell is
    // rendered once, for every arena.
    expect(link).toContain('hidden');
    // No href in the static markup. A rooted or baked href is exactly the bug
    // this link has to avoid - it is resolved per channel at selection time.
    expect(link).not.toMatch(/href=/);
    // The showcase captures pointer lock and the movement keys, so it must not
    // replace the menu that launched it.
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
  });

  // Lane AB (PASS 87): the brief asks that SOLO "picks a random time within the
  // arena's range unless the player fixes it". The random default shipped, but
  // for one pass the only way to FIX it was a `?tod=` URL parameter, which is
  // not a player-facing control. This pins the solo row's existence, its
  // default, and the fact that it offers exactly the modes the model authors.
  it('gives a solo player the same TIME OF DAY choice the lobby gives a host', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect(markup).toContain('id="solo-time-of-day"');
    const solo = /<select id="solo-time-of-day">[\s\S]*?<\/select>/.exec(markup)?.[0] ?? '';
    const lobby = /<select id="lobby-time-of-day">[\s\S]*?<\/select>/.exec(markup)?.[0] ?? '';
    expect(solo).not.toBe('');
    // The two rows are the same replicated field, so they must offer the same
    // options in the same order and start on the same default. A drift here
    // would mean a player could pick a mode in solo that no lobby can hold.
    expect(solo.replace('solo-time-of-day', 'X')).toBe(lobby.replace('lobby-time-of-day', 'X'));
    expect(solo).toContain(`value="${DEFAULT_LIGHTING_TIME_CHOICE}" selected`);
  });
});
