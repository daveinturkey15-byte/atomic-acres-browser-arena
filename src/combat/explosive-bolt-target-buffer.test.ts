import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ExplosiveBoltTargetBuffer } from './explosive-bolt-target-buffer';

type TestTeam = 0 | 1;
const source = readFileSync(new URL('./explosive-bolt-target-buffer.ts', import.meta.url), 'utf8');

describe('ExplosiveBoltTargetBuffer', () => {
  it('preserves authored player, remote, and bot order and exact target fields', () => {
    const buffer = new ExplosiveBoltTargetBuffer<TestTeam>();
    buffer.append('local', 0, 7, 'player', { x: 1, y: 2, z: 3 }, -0.62);
    buffer.append('remote', 1, 8, 'remote', { x: 4, y: 5, z: 6 }, 1);
    buffer.append('bot', 0, 9, 'bot', { x: 7, y: 8, z: 9 }, 1);

    expect(buffer.length).toBe(3);
    expect(buffer.at(0)).toMatchObject({ id: 'local', team: 0, lifeId: 7, kind: 'player' });
    expect(buffer.at(0).position.toArray()).toEqual([1, 1.38, 3]);
    expect(buffer.at(1)).toMatchObject({ id: 'remote', team: 1, lifeId: 8, kind: 'remote' });
    expect(buffer.at(1).position.toArray()).toEqual([4, 6, 6]);
    expect(buffer.at(2)).toMatchObject({ id: 'bot', team: 0, lifeId: 9, kind: 'bot' });
    expect(buffer.at(2).position.toArray()).toEqual([7, 9, 9]);
    expect(buffer.findIndex('remote', 8)).toBe(1);
    expect(buffer.findIndex('remote', 7)).toBe(-1);
  });

  it('reuses the same records and vectors after warmup while overwriting stale identity and position', () => {
    const buffer = new ExplosiveBoltTargetBuffer<TestTeam>();
    buffer.append('old-player', 0, 1, 'player', { x: 1, y: 2, z: 3 }, -0.62);
    buffer.append('old-bot', 1, 2, 'bot', { x: 4, y: 5, z: 6 }, 1);
    const firstRecord = buffer.at(0);
    const firstPosition = firstRecord.position;
    const secondRecord = buffer.at(1);
    const secondPosition = secondRecord.position;

    buffer.reset();
    expect(buffer.length).toBe(0);
    expect(() => buffer.at(0)).toThrow(RangeError);
    buffer.append('new-remote', 1, 91, 'remote', { x: -3, y: 10, z: 12 }, 1);
    buffer.append('new-player', 0, 92, 'player', { x: 20, y: 3, z: -4 }, -0.62);

    expect(buffer.at(0)).toBe(firstRecord);
    expect(buffer.at(0).position).toBe(firstPosition);
    expect(buffer.at(0)).toMatchObject({ id: 'new-remote', team: 1, lifeId: 91, kind: 'remote' });
    expect(buffer.at(0).position.toArray()).toEqual([-3, 11, 12]);
    expect(buffer.at(1)).toBe(secondRecord);
    expect(buffer.at(1).position).toBe(secondPosition);
    expect(buffer.at(1)).toMatchObject({ id: 'new-player', team: 0, lifeId: 92, kind: 'player' });
    expect(buffer.at(1).position.toArray()).toEqual([20, 2.38, -4]);
  });

  it('hides dormant high-water slots after a smaller refill', () => {
    const buffer = new ExplosiveBoltTargetBuffer<TestTeam>();
    buffer.append('one', 0, 1, 'player', { x: 0, y: 0, z: 0 }, 0);
    buffer.append('two', 1, 2, 'remote', { x: 0, y: 0, z: 0 }, 0);
    buffer.append('three', 1, 3, 'bot', { x: 0, y: 0, z: 0 }, 0);
    buffer.reset();
    buffer.append('one-next-life', 0, 4, 'player', { x: 0, y: 0, z: 0 }, 0);

    expect(buffer.length).toBe(1);
    expect(buffer.findIndex('two', 2)).toBe(-1);
    expect(() => buffer.at(1)).toThrow(RangeError);
  });

  it('keeps allocation confined to high-water growth, never reset or warmed append', () => {
    const resetStart = source.indexOf('  reset(): void {');
    const appendStart = source.indexOf('  append(', resetStart);
    const atStart = source.indexOf('  at(index:', appendStart);
    const reset = source.slice(resetStart, appendStart);
    const append = source.slice(appendStart, atStart);

    expect(reset).toContain('this.#length = 0;');
    expect(reset).not.toContain('[]');
    expect(reset).not.toContain('new ');
    expect(reset).not.toContain('.slice(');
    expect(reset).not.toContain('.map(');
    expect(append.match(/new THREE\.Vector3\(\)/g)).toHaveLength(1);
    expect(append.indexOf('if (!target)')).toBeLessThan(append.indexOf('new THREE.Vector3()'));
    expect(append).toContain('target.position.set(sourcePosition.x, sourcePosition.y + verticalOffset, sourcePosition.z);');
    expect(append).not.toContain('.clone()');
    expect(append).not.toContain('.slice(');
    expect(append).not.toContain('...sourcePosition');
  });
});
