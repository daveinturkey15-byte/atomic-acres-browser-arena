import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const audioSource = readFileSync(new URL('./audio.ts', import.meta.url), 'utf8');

describe('support presentation hot-path contract', () => {
  it('refreshes audio and HUD at bounded rates without throttling possession', () => {
    expect(mainSource).toContain('const SUPPORT_ROTOR_AUDIO_REFRESH_INTERVAL_MS = 50;');
    expect(mainSource).toContain('const SUPPORT_STATUS_HUD_REFRESH_INTERVAL_MS = 100;');
    const runtime = mainSource.slice(
      mainSource.indexOf('function updatePass65KillstreakRuntime('),
      mainSource.indexOf('function overdriveStateMessage('),
    );
    expect(runtime).toContain('syncActiveSupportRotorAudio(now);');
    expect(runtime).toContain('refreshSupportStatusHud(now);');
    expect(runtime).toContain('updateKillstreakPossession(now);');
    expect(runtime.indexOf('refreshSupportStatusHud(now);')).toBeLessThan(runtime.indexOf('updateKillstreakPossession(now);'));
  });

  it('reuses a four-source rotor pool and avoids per-refresh entity arrays', () => {
    const rotorSync = mainSource.slice(
      mainSource.indexOf('function syncActiveSupportRotorAudio('),
      mainSource.indexOf('function updateKillstreakPossession('),
    );
    expect(mainSource).toContain('Array.from({ length: 4 }');
    expect(rotorSync).toContain('activeSupportRotorAudioSources.length = 0;');
    expect(rotorSync).toContain('activeSupportRotorAudioSources.push(source);');
    expect(rotorSync).not.toContain('.filter(');
    expect(rotorSync).not.toContain('.map(');
  });

  it('selects and cleans owned support without temporary arrays', () => {
    const ownedSupport = mainSource.slice(
      mainSource.indexOf('function preferredOwnedSupportEntity('),
      mainSource.indexOf('function updateSupportStatusHud('),
    );
    const supportHud = mainSource.slice(
      mainSource.indexOf('function updateSupportStatusHud('),
      mainSource.indexOf('function refreshSupportStatusHud('),
    );
    expect(ownedSupport).not.toContain('.filter(');
    expect(ownedSupport).not.toContain('.sort(');
    expect(supportHud).toContain('liveSupportActivationIds.clear();');
    expect(supportHud).not.toContain('new Set(');
  });

  it('keeps rotor admission allocation-bounded inside the audio mixer', () => {
    const rotorMixer = audioSource.slice(
      audioSource.indexOf('syncChopperRotors('),
      audioSource.indexOf('scoutSweep('),
    );
    expect(audioSource).toContain('private readonly liveChopperRotorIds = new Set<string>();');
    expect(rotorMixer).toContain('this.liveChopperRotorIds.clear();');
    expect(rotorMixer).not.toContain('.filter(');
    expect(rotorMixer).not.toContain('.slice(');
    expect(rotorMixer).not.toContain('new Set(');
  });
});
