import { describe, expect, it } from 'vitest';
import { SELECTABLE_ARENAS } from '../map-selection';
import { createPass64ShellViewModel, renderPass64Shell } from './pass64-shell';

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
    // Order is still load-bearing, so pin the offered sequence explicitly too.
    expect([...markup.matchAll(/data-arena-route="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'nuke-town',
      'terminal',
      'rustrig',
      'gun-range',
      'high-seas',
      // owner 2026-08-30: Test1/Test2 arenas added.
      'test1',
      'test2',
      // MAP3 (owner 2026-09-02, HF-409, card restored in PASS 86): the corridor
      // showcase is offered as an EXPLORE arena, last in registry order.
      'map3',
    ]);
    // Farcrysis is hidden (owner, 2026-08-28) but must remain a real arena elsewhere.
    expect(markup).not.toContain('data-arena-route="farcrysis"');
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
  // It must never ship as "RTX" — no browser exposes a ray-tracing pipeline or RT cores,
  // so that label would be a claim the build cannot back.
  it('exposes five simple graphics modes and keeps WebGPU tuning under Advanced Graphics', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    const presetMarkup = markup.match(/<select id="graphics-profile">([\s\S]*?)<\/select>/)?.[1] ?? '';
    expect([...presetMarkup.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)]
      .map((match) => [match[1], match[2]])).toEqual([
      ['high', 'QUALITY'],
      ['performance', 'PERFORMANCE'],
      ['raytraced', 'RAY TRACED'],
      ['max', 'MAX'],
      ['custom', 'CUSTOM'],
    ]);
    expect(presetMarkup, 'no browser exposes RT cores; RTX would be an unbackable claim')
      .not.toMatch(/RTX/i);
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
});
