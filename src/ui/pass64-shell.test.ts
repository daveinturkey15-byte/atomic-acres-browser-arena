import { describe, expect, it } from 'vitest';
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
    expect(markup).toContain('PASS 66.4 · THE BIG ONE');
    expect(markup).toContain('THE BIG ONE · PASS 66');
    expect(markup).not.toContain('HITL REVIEW DECK');
    expect(markup).not.toContain('LIVE SYSTEMS READY');
    expect(markup).toContain('class="command-rail"');
    expect(markup).toContain('class="arena-command"');
    expect(markup).toContain('class="deployment-manifest"');
    expect(markup).toContain('class="hud-mission-console"');
    expect(markup).toContain('class="hud-map-console"');
    expect(markup).toContain('class="hud-operator-console"');
    expect(markup).toContain('class="hud-weapon-console"');
    expect([...markup.matchAll(/data-arena-route="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'nuke-town',
      'terminal',
      'rustrig',
      'gun-range',
    ]);
  });

  it('renders four curated kits, exactly three custom slots, and one explicit manager', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect([...markup.matchAll(/data-kit-id="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'balanced', 'runner', 'breacher', 'marksman',
    ]);
    expect([...markup.matchAll(/data-custom-preset-id="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'custom-1', 'custom-2', 'custom-3',
    ]);
    expect(markup.match(/id="loadout-manage"/g)).toHaveLength(1);
    expect(markup).toContain('id="loadout-primary"');
    expect(markup).toContain('id="loadout-secondary"');
    expect(markup).toContain('id="loadout-grenade"');
    expect(markup).toContain('<option value="frag">Frag</option>');
    expect(markup).toContain('<option value="smoke">Smoke</option>');
    expect(markup).toContain('<option value="flash">Flashbang</option>');
    expect(markup).toContain('<option value="semtex">Semtex</option>');
    expect(markup.match(/data-weapon-presentation/g)).toHaveLength(7);
    expect(markup.match(/data-weapon-metric="damage"/g)).toHaveLength(7);
    expect(markup).toContain('pass65-firearms/carbine-hero-quarter.webp');
    expect(markup).toContain('pass65-firearms/m4a1-hero-quarter.webp');
  });

  it('exposes four simple graphics modes and keeps WebGPU tuning under Advanced Graphics', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    const presetMarkup = markup.match(/<select id="graphics-profile">([\s\S]*?)<\/select>/)?.[1] ?? '';
    expect([...presetMarkup.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)]
      .map((match) => [match[1], match[2]])).toEqual([
      ['high', 'QUALITY'],
      ['performance', 'PERFORMANCE'],
      ['max', 'MAX'],
      ['custom', 'CUSTOM'],
    ]);
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
});
