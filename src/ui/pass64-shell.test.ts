import { describe, expect, it } from 'vitest';
import { createPass64ShellViewModel, renderPass64Shell } from './pass64-shell';

describe('Pass 64 command shell', () => {
  it('escapes persisted player names before placing them in markup', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('"<script>&'));
    expect(markup).toContain('value="&quot;&lt;script&gt;&amp;"');
    expect(markup).not.toContain('<script>');
  });

  it('renders the new command hierarchy and ordered player-facing arenas', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect(markup).toContain('class="panel pass64-command-deck"');
    expect(markup).toContain('PASS 64 · HITL CANDIDATE');
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
    expect(markup).toContain('<option value="flash">Flash</option>');
  });
});
