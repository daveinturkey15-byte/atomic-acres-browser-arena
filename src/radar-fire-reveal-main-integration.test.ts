import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function block(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('HF-378: unsuppressed gunfire reveals the shooter on enemy radar', () => {
  it('records the reveal only from the replicated host-admitted shot stream', () => {
    const shot = block("if (message.type === 'shot') {", "\n  if (message.type === 'melee') {");
    // Exactly two write sites, both inside the replicated 'shot' handler: the
    // nonce-deduped railgun path and the admission-gated ordinary path. No
    // audio-, presentation- or prediction-side writes exist anywhere else.
    expect(source.match(/remoteRadarFireRevealAt\.set\(/g)).toHaveLength(2);
    const ownGuard = shot.indexOf('message.by === player.id');
    const firstWrite = shot.indexOf('remoteRadarFireRevealAt.set(');
    expect(ownGuard).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(ownGuard);
    // Railgun: only after the replay nonce is committed.
    const railgunWrite = shot.indexOf('remoteRadarFireRevealAt.set(', shot.indexOf("weapon === 'railgun'"));
    expect(railgunWrite).toBeGreaterThan(shot.indexOf('processedNonces.add(message.nonce)', shot.indexOf("weapon === 'railgun'")));
    // Ordinary shots: only after remote-shot admission accepted the message.
    const ordinaryWrite = shot.indexOf('remoteRadarFireRevealAt.set(', shot.indexOf('admission.accepted'));
    expect(ordinaryWrite).toBeGreaterThan(shot.indexOf('remoteShotAdmissions.set(message.by', shot.indexOf('admission.accepted')));
    // Rejected admissions never open a reveal window.
    expect(shot.indexOf('if (!admission.accepted) return;')).toBeLessThan(ordinaryWrite);
  });

  it('paints hostile remotes on the minimap through the shared gunfire-reveal policy', () => {
    // HF-510 renamed the assignment source (the structural layer replaced the
    // per-arena landmark lists). Same block, same assertions.
    const loop = block('minimapLandmarksRendered = structure.records;', '\n  for (const bot of bots.values()) {');
    expect(loop).toContain(
      '!shouldRevealEnemy(remote.target.distanceTo(player.position), now, remoteRadarFireRevealAt.get(remote.snapshot.id) ?? 0)',
    );
    // Teammates stay friendly-coloured; scout sweep still overrides everything.
    expect(loop).toContain("const friendly = privateMatchMode === 'tdm' && remote.snapshot.team === player.team;");
    expect(loop).toContain('const scoutActive = scoutSweepPulseVisible(now, scoutSweepUntil);');
    // FFA has no friendlies: every revealed remote draws as hostile.
    expect(loop).toContain("friendly ? '#58e3dc' : '#ff765f'");
  });

  it('clears every fire-reveal window with the match state reset', () => {
    // Pins the exact reset site: the scout-sweep clear inside the shared
    // match-state teardown must be immediately followed by the reveal clear.
    expect(source).toContain('scoutSweepUntil = 0;\n  remoteRadarFireRevealAt.clear();');
  });
});
