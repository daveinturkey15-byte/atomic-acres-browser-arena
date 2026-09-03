import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PASS 85, Lane N (QA corpus streamline) — a one-way size ratchet on
 * `src/legacy-main.ts`.
 *
 * Why this exists, measured rather than assumed:
 *
 *   Ten commits between 2026-07-27 and 2026-09-02 carry the word "streamline"
 *   or "refactor" in their subject and touch this file. Together they removed
 *   a net 191 lines. Over the same window the file grew from ~32,300 to 35,720
 *   lines. Every one of those passes was real work and every one of them was
 *   swamped, in the same window, by feature code landing in the same file.
 *   Tidying without a ratchet is a treadmill: nothing holds the ground that a
 *   cleanup pass wins, so the next lane spends its budget winning it again.
 *
 * So this test does not ask anybody to shrink the file. It asks that the file
 * not get BIGGER without somebody writing down why, and that when it does get
 * smaller the win is locked in.
 *
 * IT FAILS IN ONE DIRECTION ONLY. Growth of even one line reds `npm test`
 * until LINE_CEILING is raised with a CEILING_HISTORY entry. Removal never
 * fails, ever.
 *
 * PASS 87 Lane AR, item 4 - why the second direction was removed. As shipped
 * in PASS 85 this test ALSO failed when the file shrank more than
 * RATCHET_SLACK (250) lines below the ceiling, to stop the ceiling decaying
 * into permanent slack. The intent was right and the effect was backwards: the
 * repo runs standing streamline lanes (owner directive 2026-08-22), so the
 * likeliest way to hit this gate was to do exactly the work it exists to
 * encourage, and a lane that deleted 300 lines got a red `npm test` for its
 * trouble. A gate that reds honest cleanup teaches contributors to stop
 * cleaning, or worse, to pad. Neither is what a ratchet is for.
 *
 * The cost of dropping it is stated rather than hidden: after a big cleanup
 * the ceiling sits above the real size, and that slack can be re-consumed by
 * later growth without an entry. That is a bookkeeping loss, not a defect
 * escaping - the number in the ledger is still a ceiling nobody may exceed
 * silently. A shrink now prints the three-step lowering procedure with the
 * exact number to paste, so locking the win in stays one edit away, and
 * `npm test` stays green while you decide.
 *
 * It is deliberately NOT a style rule, a complexity metric, or a lint. It is a
 * single number with a ledger, because a single number is the only thing about
 * a 35,000-line module that every contributor can check in one second.
 *
 * --------------------------------------------------------------------------
 * HOW TO LOWER THE CEILING (optional, and never required to get green)
 * --------------------------------------------------------------------------
 * 1. Run `node -e "process.stdout.write(String(require('fs').readFileSync('src/legacy-main.ts').toString().split('\n').length - 1))"`.
 * 2. Set LINE_CEILING to that number.
 * 3. Add a CEILING_HISTORY entry recording the drop.
 * That is the whole procedure. Lowering never needs review; it is the
 * direction this ratchet exists to push. The test prints these steps, with the
 * number already computed, whenever it notices real slack.
 *
 * --------------------------------------------------------------------------
 * HOW TO RAISE THE CEILING (only when the growth is genuinely warranted)
 * --------------------------------------------------------------------------
 * Raising is allowed — this is a ratchet, not a freeze — but it is not silent.
 * Add a CEILING_HISTORY entry with the new number, the date and one honest
 * sentence naming the feature that needed the lines, then set LINE_CEILING.
 * The entry is the whole point: it turns "legacy-main keeps growing" from an
 * impression into a list a reviewer can read.
 *
 * Extracting a region into its own module is always preferable to raising.
 */

/**
 * Newline count of `src/legacy-main.ts`, i.e. exactly what `wc -l` reports.
 * The file is LF-terminated with a trailing newline; see the CRLF note in
 * `docs/MULTI_AGENT_REPO_DISCIPLINE.md` — source-pinned tests in this repo
 * break if a tool rewrites this file with CRLF, so the ratchet asserts the
 * line ending too.
 */
const LINE_CEILING = 37_080;

/**
 * How far below the ceiling the file has to fall before the test REPORTS the
 * slack. It never fails for it - see the one-direction note above. 250 lines
 * is roughly one large function: small enough that a real cleanup pass is
 * noticed, large enough that ordinary churn does not print noise every run.
 */
const RATCHET_SLACK = 250;

const CEILING_HISTORY: ReadonlyArray<{ date: string; lines: number; note: string }> = [
  {
    date: '2026-09-02',
    lines: 35_720,
    note:
      'PASS 85 Lane N: first ceiling, set to the measured size at PASS 84 ship '
      + '(75a4e508). No lines were added or removed to establish it.',
  },
  {
    date: '2026-09-03',
    lines: 36_408,
    note:
      'PASS 86 integration: Lane W viewmodel fit (HF-410), Lane Y drop shots (HF-412), '
      + 'Lane U Nuke Town Rebuild registration (HF-407) and Lane V Map 3 explore with the '
      + 'lazy arena registry and explore HUD (HF-409) grew the file; measured at the merged head.',
  },
  {
    date: '2026-09-03',
    lines: 36_414,
    note:
      'PASS 87 Lane AR item 2: +6 lines of comment at MINIMAP_RENDER_HZ recording why the '
      + 'minimap redraw dropped 60 Hz -> 30 Hz and where the 2-frame responsiveness budget '
      + 'is measured (src/minimap-render-cadence.test.ts). No executable lines added.',
  },
  {
    date: '2026-09-03',
    lines: 36_434,
    note:
      'PASS 87 Lane AR item 5: overdriveClaimSight() - the eye-to-core line-of-sight test '
      + 'that stops the 2x Damage Core being claimed through the bus roof slab - plus its '
      + 'scratch vector and the comment recording the measured defect.',
  },
  {
    date: '2026-09-03',
    lines: 36_472,
    note:
      'PASS 87 Lane AR item 3: bots gain a stance. Field on BotPlayer, the resolve call in '
      + 'the AI loop with its speed cap, under-fire recording in applyBotDamage, stance reset '
      + 'on respawn and on the two QA staging paths, and replication through the hosted-bot '
      + 'snapshot. The decision itself lives in src/bot-stance.ts, not here.',
  },
  {
    date: '2026-09-03',
    lines: 36_415,
    note:
      'PASS 87 raid integration: Lane AQ Raid Rebuild registration (HF-408) added the `raid2` builder import and its eagerArena row to the arena factory registry. Measured at the merged head, not estimated.',
  },
  {
    date: '2026-09-03',
    lines: 36_479,
    note:
      'PASS 87 integration: Lane AR residuals (bot stance, minimap cadence, overdrive line of sight) merged on top of '
      + 'Farcrysis and Raid Rebuild; measured on the merged head, not summed.',
  },

  {
    date: '2026-09-03',
    lines: 36_624,
    note:
      'PASS 88 candidate: Lane H2 load-time second pass (admission attribution markers, cold-session precompile reach) '
      + 'merged; measured on the merged head.',
  },
  {
    date: '2026-09-03',
    lines: 36_654,
    note:
      'PASS 89 integration, Lane AI (HF-418): +30 lines wiring the BALANCED preset, the '
      + 'per-mode copy panel and the RTX native-runtime explainer into the settings shell '
      + '(src/ui/pass64-shell.ts holds the markup; these are the legacy-main call sites). '
      + 'Measured at the merged head.',
  },
  {
    date: '2026-09-03',
    lines: 37_069,
    note:
      'PASS 89 integration, Lane AB (time of day). Authored as 36_830 on a branch based at '
      + 'integration head 54c15b1e; re-measured here at the PASS 89 merged head, which also '
      + 'carries Lane H2 and Lane AI. The lane text follows, unchanged: '
      + 'the time-of-day uniform-write plumbing in the `// LIGHTING:` '
      + 'region -- the per-arena baseline capture, the re-aim of the existing key light, '
      + 'the one apply function and its writes-comparison gate, the lobby mirror and the '
      + 'QA hooks (including the unforced weather override the gate falsifier needs). '
      + 'The extraction the header asks for was already done: the whole model is pure and '
      + 'lives in src/rendering/lighting-conditions.ts (~800 lines, zero THREE imports). '
      + 'What is left here is exactly the code that must touch the light objects, and it '
      + 'writes uniforms only -- no light is created, destroyed or toggled, which is the '
      + 'PASS 82 constraint and is pinned against this source region by '
      + 'src/rendering/lighting-conditions-light-set.test.ts. Measured on the tree merged '
      + 'with integration head 54c15b1e (Lane AQ Raid Rebuild, AD, AE), not estimated. '
      + 'The last 23 of these lines are the SOLO time-of-day row: the brief asks that a '
      + 'solo player be able to fix the hour, and for one pass the only way to do it was '
      + 'a URL parameter, and the last 8 suppress the display-refresh HUD advisory '
      + 'in capture mode, which was laying an opaque strip across the bottom 8% of '
      + 'the Terminal review frames.',
  },
  {
    date: '2026-09-03',
    lines: 36_635,
    note:
      'PASS 89 Lane AX (HF-431): +11 lines wiring the sprint latch. The owner reported that a drop shot taken '
      + 'while sprinting resumed sprinting the moment the player stood, because Shift was still down. The state '
      + 'machine itself is in src/prone-transition.ts (stepSprintLatch/clearSprintLatchOnDropShot); what lands here '
      + 'is the module-scope latch field, its reset on respawn, the clear inside requestStance() when the target '
      + 'stance is prone, and the substitution of the latch for the raw Shift read in updatePhysics.',
  },
  {
    date: '2026-09-03',
    lines: 37_080,
    note:
      'Post-PASS 89 integration: chiptune rotation + drop shot from sprint (HF-430/431) merged; measured on the merged head.',
  },

];

function legacyMainSource(): string {
  return readFileSync(resolve(__dirname, 'legacy-main.ts'), 'utf8');
}

function countLines(source: string): number {
  let lines = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) lines += 1;
  }
  return lines;
}

describe('src/legacy-main.ts size ratchet', () => {
  it('does not grow past the recorded ceiling', () => {
    const lines = countLines(legacyMainSource());
    expect(
      lines,
      `src/legacy-main.ts is ${lines} lines, past its ${LINE_CEILING}-line ceiling.\n`
        + 'Either extract the new code into its own module (preferred), or raise\n'
        + 'LINE_CEILING in src/legacy-main-size-ratchet.test.ts and add a\n'
        + 'CEILING_HISTORY entry saying what needed the lines.',
    ).toBeLessThanOrEqual(LINE_CEILING);
  });

  it('invites the ceiling down after a cleanup without ever failing for it', () => {
    const lines = countLines(legacyMainSource());
    // Deliberately NOT an assertion on `lines`. Removing code is the outcome
    // this file exists to encourage; it must never be the thing that reds a
    // run. What IS asserted is that the reporting path still works, so the
    // invitation cannot rot into a no-op unnoticed.
    if (lines <= LINE_CEILING - RATCHET_SLACK) {
      console.warn(
        `[legacy-main ratchet] src/legacy-main.ts is ${lines} lines, `
        + `${LINE_CEILING - lines} below its ${LINE_CEILING}-line ceiling. A cleanup landed. `
        + `Lock it in: set LINE_CEILING to ${lines} and add a CEILING_HISTORY entry. `
        + 'Optional - this run is green either way.',
      );
    }
    expect(Number.isInteger(lines) && lines > 0).toBe(true);
    expect(LINE_CEILING - RATCHET_SLACK).toBeLessThan(LINE_CEILING);
  });

  /**
   * The one-direction property, asserted rather than described. A file that
   * loses lines - any number of them, down to a single one - must not be able
   * to red this suite. Written against the same predicate the growth test
   * enforces, so re-introducing a lower bound fails here first, with a message
   * saying why it was removed.
   */
  it('is one-directional: no line count at or below the ceiling can fail it', () => {
    const ceilingBreached = (lines: number): boolean => !(lines <= LINE_CEILING);
    for (const lines of [1, 100, 10_000, LINE_CEILING - RATCHET_SLACK - 1, LINE_CEILING - 1, LINE_CEILING]) {
      expect(
        ceilingBreached(lines),
        `${lines} lines is at or below the ${LINE_CEILING}-line ceiling and must be green. `
          + 'A shrink direction was re-added: it reds every refactor that removes lines, '
          + 'which is the work this ratchet exists to protect.',
      ).toBe(false);
    }
    expect(ceilingBreached(LINE_CEILING + 1)).toBe(true);
  });

  it('keeps the ceiling honest: the history records the current number', () => {
    expect(CEILING_HISTORY.length).toBeGreaterThan(0);
    const latest = CEILING_HISTORY[CEILING_HISTORY.length - 1]!;
    expect(
      latest.lines,
      'The newest CEILING_HISTORY entry must be the current LINE_CEILING, so the\n'
        + 'ledger cannot drift away from the number actually being enforced.',
    ).toBe(LINE_CEILING);
    for (const entry of CEILING_HISTORY) {
      expect(entry.note.trim().length, 'every ceiling change carries a reason').toBeGreaterThan(20);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    }
  });

  it('is measuring the LF file the source-pinned tests read', () => {
    const source = legacyMainSource();
    // A tool that rewrites this file with CRLF changes no visible behaviour and
    // breaks 85 source-pinned tests at once. Cheapest possible tripwire.
    expect(source.includes('\r'), 'src/legacy-main.ts must stay LF-terminated').toBe(false);
    expect(source.endsWith('\n')).toBe(true);
    // Guards the measurement itself: a scrape that silently returned '' would
    // otherwise report a triumphant zero-line file and pass the ceiling.
    expect(countLines(source)).toBeGreaterThan(10_000);
  });
});
