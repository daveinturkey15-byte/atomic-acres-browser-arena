import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const start = source.indexOf('function recordOwnerSupportDamage');
const end = source.indexOf('function killstreakActorModifiers', start);
const body = source.slice(start, end);

describe('Pass 72 replicated Chopper audio', () => {
  it('plays the replicated support cue before the owner-only HUD/tracer branch', () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(body).toContain("audio.supportGun(drone ? 'drone' : 'chopper');");
    expect(body.indexOf("audio.supportGun(drone ? 'drone' : 'chopper');")).toBeLessThan(
      body.indexOf('if (event.ownerId !== player.id) return;'),
    );
    expect(body).toContain('only the owner gets the local tracer and damage HUD');
  });
});
