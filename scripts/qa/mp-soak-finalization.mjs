import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// A separate, write-once receipt survives a forced process-tree shutdown.
// This records requested cleanup/disposition, never an inferred OS exit status.
export function finalizationWriter(path, identity) {
  let written = false;
  return (details) => {
    if (written) return false;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({
      schema: 'mp-soak-finalization-v1', ...identity,
      recordedAt: new Date().toISOString(), ...details,
    }, null, 2) + '\n', { flag: 'wx' });
    written = true;
    return true;
  };
}
