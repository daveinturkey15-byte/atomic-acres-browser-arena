// Generates UI-INVENTORY.md: every element id in the menu shell, grouped by the
// markup function (panel/section) that renders it, each with a [ ] checkbox so
// the owner can mark elements to remove. Run: node scripts/qa/gen-ui-inventory.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const files = ['src/ui/pass64-shell.ts', 'src/ui/killstreak-loadout-menu.ts', 'src/ui/project-map-dialog.ts', 'src/ui/release-history-dialog.ts', 'src/ui/advanced-graphics-controls.ts'];

let out = '# UI ELEMENT INVENTORY - Atomic Acres menu\n';
out += '# Mark [x] next to any element you do NOT need; leave [ ] to keep.\n';
out += '# Grouped by source file and the markup function (panel/section) that renders it.\n\n';

for (const file of files) {
  const src = readFileSync(join(root, file), 'utf8');
  const lines = src.split('\n');
  let fn = '(top-level)';
  const groups = new Map();
  for (const line of lines) {
    const fm = line.match(/^\s*(?:export\s+)?function\s+([A-Za-z0-9_]+)/);
    if (fm) fn = fm[1];
    const re = /id="([^"]+)"/g;
    let mm;
    while ((mm = re.exec(line)) !== null) {
      if (!groups.has(fn)) groups.set(fn, new Set());
      groups.get(fn).add(mm[1]);
    }
  }
  out += `# ===== ${file} =====\n\n`;
  for (const [g, ids] of groups) {
    out += `## ${g}\n`;
    for (const id of ids) out += `[ ] #${id}\n`;
    out += '\n';
  }
}
writeFileSync(join(root, 'UI-INVENTORY.md'), out);
console.log('wrote UI-INVENTORY.md');
