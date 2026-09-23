import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * PASS 87 Lane AR - skeptic follow-up on evidence.
 *
 * The brief asked for before/after evidence under
 * `docs/evidence/pass87/residuals/` per item. Several items are pure logic and
 * were evidenced by their tests alone, which left figures the lane report
 * quotes - 600 -> 300 redraws, 21/46 and 22/47 roof-slab claims, the 2.20 m
 * nacelle delta - reconstructible only by re-running a test and reading its
 * source. They are now emitted as receipts, from the SAME measurement the test
 * asserts on, so the number in the report and the number in the evidence cannot
 * drift apart.
 *
 * Opt-in: a test run never writes into the repository unless asked.
 *   PASS87_RECEIPTS=1 npx vitest run <files>
 */
export function recordResidualReceipt(name: string, data: unknown): void {
  if (process.env.PASS87_RECEIPTS !== '1') return;
  const path = resolve(process.cwd(), 'docs/evidence/pass87/residuals', `${name}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}
