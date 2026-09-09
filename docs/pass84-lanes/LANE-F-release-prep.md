# Lane F — PASS 84 release preparation (HF-400 policy), code only

Orchestrator: Claude Code (Fable 5.1), takeover record
`docs/PASS84_TAKEOVER_CLAUDE_2026-09-02.md`. Ledger row HF-400.

Worktree: `C:\Users\david\projects\aa-claude-release84`
Branch: `contrib/dave-gaming-pc/claude/pass84-release-prep` (base ac0bc5f2)

This lane prepares everything the PASS 84 publish needs WITHOUT publishing.
The orchestrator integrates every other lane, runs the full suite on the
merged tree, and performs the publish itself. You never push to gh-pages,
never run a publish script for real, never touch the live site.

## Owner policy (verbatim, 2026-09-02 06:58 BST)
"also when you push the next pass, pin this version and remove all past
versions, this can be the safe backup"
-> After PASS 84 publishes, gh-pages carries EXACTLY two channels: PASS 84
(live default) and PASS 83 (pinned safe backup). Every other tree
(channels/pass81, channels/pass82, channels/pass72-retained,
channels/the-big-one, channels/recent-stable, and anything else under
channels/) is removed from gh-pages and from the chooser.

NOTE: the ledger row HF-400 claims this is "Implemented in
scripts/orchestration/publish_pass84.py". That file does not exist. You
create it.

## Facts (verified at takeover)
- Live gh-pages root today: `release-index.json` -> generation
  `76b095f29713`, `release-manifest.76b095f29713.json`, release-shell
  assets for two generations (`76b095f29713`, `fb56f71d793a`), and
  `channels/{pass72-retained,pass81,pass82,pass83,recent-stable,the-big-one}`.
- Existing siblings: `scripts/orchestration/publish_pass80.py` ...
  `publish_pass83.py`. Read `publish_pass83.py` fully first: it has a
  freshness guard (refuses a stale dist), a predecessor guard (currently
  requires two recent predecessors), an in-build fallback pin
  (`pass73Retained` -> `channels/the-big-one`), a `KEEP_AT_LEAST` set and a
  superseded-asset sweep with a keep-list of generations.
- Identity: `src/release-identity.ts` stamps the pass name and channel;
  `release-channels.json` is the chooser config; `src/release-topology.test.ts`
  and `src/project-map.test.ts` pin literals and read the publish script by
  name; there is a topology verifier `scripts/qa/verify-release-topology.mjs`
  and a browser one `verify-release-topology-browser.mjs`.
- Known regression class: a pass82 publish once shipped still calling itself
  "PASS 81" (third time). The identity lives in the `release-identity-*.js`
  chunk, not index.html; the badge check must read the chunk.
- Known regression class: a stale hand-copied `dist-passNN` published as
  green. The freshness guard exists because of it; do not weaken it.

## Job
1. Create `scripts/orchestration/publish_pass84.py` from the pass83 sibling:
   CHANNEL `channels/pass84`, DIST `dist-pass84`, `KEEP_AT_LEAST = {"pass83"}`,
   RETIRE every other channel tree (enumerate what is on gh-pages at run
   time rather than hardcoding, then assert the post-state is exactly
   {pass84, pass83}), predecessor guard relaxed to ONE pinned backup with a
   comment citing HF-400 and the owner's sentence, in-build fallback
   re-pinned to PASS 83 (`channels/pass83`), chooser config regenerated
   with two cards (PASS 84 live, PASS 83 safe backup) and the alias
   `previous` -> pass83. Keep the freshness guard and the farcrysis-hidden
   guard intact. Add a `--dry-run` that prints the full plan (trees to
   delete, files to write) without touching git.
2. Stamp `src/release-identity.ts` -> PASS 84 / `channels/pass84`; update
   `release-channels.json`; re-pin `src/release-topology.test.ts` and
   `src/project-map.test.ts` literals; point the topology test's script read
   at `publish_pass84.py`. Any test that asserts "at least two predecessors"
   or the old fallback needs updating WITH the HF-400 citation — that is a
   policy change by the owner, not a weakened gate; say so in the commit.
3. Write a contract test for the new script's plan (`node --test` or vitest,
   whichever the siblings use): given a fake gh-pages tree with the six
   channels, the plan deletes exactly four, keeps pass83, adds pass84, and
   the fallback points at pass83.
4. Run: `npx tsc --noEmit`, `npx vitest run src/release-topology.test.ts src/project-map.test.ts src/release-channel.test.ts src/release-pipeline.test.ts src/changelog.test.ts`, your new contract test, `node scripts/qa/verify-release-topology.mjs` if it runs offline,
   and `python scripts/orchestration/publish_pass84.py --dry-run` against a
   local clone of gh-pages (`git fetch origin gh-pages` then a temp
   worktree) to prove the plan. Do NOT run it for real.
5. Write `docs/PASS84_PUBLISH_RUNBOOK.md`: the exact command sequence the
   orchestrator runs (build, freshness check, `cp -r dist dist-pass84`,
   publish, live smoke with
   `node scripts/qa/measure-cross-engine-stalls.mjs --url https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass84/ --lanes chrome,edge,firefox --seconds 120`,
   badge check from the identity chunk, chooser check), and the rollback
   (re-point default to pass83).

## Boundaries
- You own: `scripts/orchestration/publish_pass84.py`, `src/release-identity.ts`,
  `release-channels.json`, the release/topology/project-map tests, the
  runbook. Nothing else. No `src/legacy-main.ts`, no arenas, no gameplay.
- No browser needed. No publish. Commit to your branch with explicit paths.

## Report (final message = raw data for the orchestrator)
Files changed with one line each, the dry-run plan output, test results,
commits, and anything not verified. Claim-state every line:
VERIFIED / CLAIMED / OPEN.
