// Adapter: recorded fixtures. This is what --dry-run uses.
//
// It proves the plumbing - prompt build, probe stamp, tier-0 measurement,
// schema validation, adjudication, journalling, stop rules - without spending
// one token of quota and without touching the GPU.
//
// It deliberately CANNOT pass a round it should not: it returns whatever the
// fixture says, including a wrong probe token or a tier-0-contradicting score,
// so the harness's own refusals are exercised rather than assumed.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createFixtureAdapter({ dir = null, responses = null } = {}) {
  return {
    id: 'fixture',
    kind: 'vision',
    describe: () => `recorded fixtures from ${dir ?? 'in-memory map'} (dry run: no quota, no GPU)`,

    async available() {
      if (responses) return { ok: true, detail: `${Object.keys(responses).length} in-memory fixtures` };
      return existsSync(dir ?? '') ? { ok: true, detail: `fixture dir ${dir}` } : { ok: false, detail: `fixture dir missing: ${dir}` };
    },

    async critique({ criticId, cycle, probeToken }) {
      const key = `cycle-${cycle}-critic-${criticId}`;
      let body = null;
      if (responses && responses[key] !== undefined) body = responses[key];
      else if (dir && existsSync(join(dir, `${key}.json`))) body = JSON.parse(readFileSync(join(dir, `${key}.json`), 'utf8'));
      if (body === null) {
        return { ok: false, raw: null, text: null, route: this.id, meta: { error: `no fixture for ${key}` } };
      }
      // "echoProbe" lets a fixture opt in to being a well-behaved critic
      // without having to know the derived token; a fixture that hard-codes a
      // wrong token is how the invalid path gets exercised.
      const resolved = body.sawImages?.answer === 'ECHO' ? { ...body, sawImages: { answer: probeToken } } : body;
      const text = JSON.stringify(resolved, null, 2);
      return { ok: true, raw: text, text, route: this.id, meta: { fixture: key, elapsedMs: 0 } };
    },
  };
}
