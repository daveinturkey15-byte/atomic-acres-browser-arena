import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const network = readFileSync(new URL('./network.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./ui/pass64-shell.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('Pass 72 explicit lobby reset contract', () => {
  it('keeps FFA as the visible lobby default while retaining TDM as a selectable option', () => {
    expect(shell).toContain('<option value="ffa" selected>FREE FOR ALL</option>');
    expect(shell).toContain('<option value="tdm">TEAM DEATHMATCH</option>');
    expect(main).toContain("privateMatchMode = 'ffa'");
  });

  it('only lets the active host invalidate the room and opens a fresh code', () => {
    expect(network).toMatch(/resetLobby\(onReady: \(\) => void\): boolean \{[\s\S]*?this\.role !== 'host'/);
    expect(network).toMatch(/resetLobby\(onReady: \(\) => void\): boolean \{[\s\S]*?this\.close\(\);[\s\S]*?this\.host\(onReady\);/);
    const resetStart = main.indexOf("element<HTMLButtonElement>('#lobby-reset').addEventListener('click'");
    const resetEnd = main.indexOf("element<HTMLButtonElement>('#lobby-balance').addEventListener('click'", resetStart);
    expect(resetStart).toBeGreaterThanOrEqual(0);
    expect(resetEnd).toBeGreaterThan(resetStart);
    const resetHandler = main.slice(resetStart, resetEnd);
    const hostGuard = resetHandler.indexOf("if (network.role !== 'host') return;");
    const durableRoomInvalidation = resetHandler.indexOf('clearLastHostedRoomCode(clientPersistentStorage())');
    const checkpointInvalidation = resetHandler.indexOf('clearStoredHostMatchCheckpoint();');
    const freshHostAttempt = resetHandler.indexOf('network.resetLobby(initializeHostLobby)');
    expect(hostGuard).toBeGreaterThanOrEqual(0);
    expect(durableRoomInvalidation).toBeGreaterThan(hostGuard);
    expect(checkpointInvalidation).toBeGreaterThan(durableRoomInvalidation);
    expect(freshHostAttempt).toBeGreaterThan(checkpointInvalidation);
    expect(resetHandler).toMatch(/if \(!clearLastHostedRoomCode\(clientPersistentStorage\(\)\)\) \{[\s\S]*?return;[\s\S]*?\}/);
  });

  it('does not label recovery as reset: the old room is intentionally invalidated', () => {
    expect(network).toContain('admits nobody from the invalidated room');
    expect(main).toContain('Old room invalidated — opening a fresh lobby code…');
    expect(shell).toContain('id="lobby-reset"');
  });
});
