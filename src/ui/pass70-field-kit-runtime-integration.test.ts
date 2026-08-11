import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./pass64-shell.ts', import.meta.url), 'utf8');

function functionSource(name: string, nextNeedle: string): string {
  const start = main.indexOf(`function ${name}`);
  const end = main.indexOf(nextNeedle, start);
  expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} has a bounded source slice`).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('HF-249/HF-250/HF-251 Field Kit runtime integration', () => {
  it('uses the shared catalog projection in cards and the Manage/Rename inspector', () => {
    const inspector = functionSource('renderLoadoutInspector', '\nfunction renderFieldKitSelection');
    expect(shell).toContain("weaponMenuStatDeckMarkup('m4a1')");
    expect(inspector).toContain('applyWeaponMenuPresentation(inspector, weapon.id as WeaponId)');
    expect(inspector).not.toContain('const cyclicDps');
    expect(inspector).not.toContain('data-loadout-stat');
    expect(inspector).not.toContain('* 760');
  });

  it('maintains exactly one explicit aria-current selection state from authoritative loadout state', () => {
    const selection = functionSource('applyLoadoutCardSelection', '\nfunction renderFieldKitSelection');
    expect(selection).toContain("card.setAttribute('aria-current', 'true')");
    expect(selection).toContain("card.removeAttribute('aria-current')");
    expect(selection).toContain("card.setAttribute('aria-pressed', String(selected))");
  });

  it('closes only after verified persistence and keeps failure feedback inside the open manager', () => {
    const save = functionSource('saveManagedPreset', '\ndocument.querySelectorAll<HTMLButtonElement>');
    const selectSavedPreset = save.indexOf("selected: { kind: 'custom', presetId: submittedPresetId } as SelectedLoadoutRef");
    const persist = save.indexOf('if (!persistLoadoutState(candidate))');
    const close = save.indexOf('manager.hidden = true');
    const reenable = save.indexOf('saveButton.disabled = false');
    const restoreFailureFocus = save.indexOf('if (!manager.hidden) saveButton.focus()');
    expect(save).toContain('if (manager.hidden || loadoutSaveInFlight) return;');
    expect(save).toContain('YOUR EDITS ARE STILL HERE');
    expect(save).toContain("setLoadoutSaveStatus('SAVE FAILED");
    expect(selectSavedPreset).toBeGreaterThanOrEqual(0);
    expect(persist).toBeGreaterThan(selectSavedPreset);
    expect(persist).toBeGreaterThanOrEqual(0);
    expect(close).toBeGreaterThan(persist);
    expect(save.slice(persist, close)).toContain('return;');
    expect(save.match(/manager\.hidden = true/gu)).toHaveLength(1);
    expect(reenable).toBeGreaterThan(close);
    expect(restoreFailureFocus).toBeGreaterThan(reenable);
  });
});
