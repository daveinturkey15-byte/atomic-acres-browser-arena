import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('High Seas overboard runtime integration', () => {
  it('eliminates non-swimmable ocean contact before the retained float response', () => {
    expect(source).toContain("import { shouldEliminateArenaOverboard } from './arena-overboard';");
    const start = source.indexOf('const postWater = waterSystem.samplePhysics(player.position);');
    const end = source.indexOf('if (playerGrounded) lastGroundedAt = now;', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);
    expect(block).toContain('shouldEliminateArenaOverboard(selectedArena.id, postWater)');
    expect(block).toContain("{ kind: 'environment' }");
    expect(block.indexOf('shouldEliminateArenaOverboard')).toBeLessThan(block.indexOf('if (postWater.inWater'));
  });
});
