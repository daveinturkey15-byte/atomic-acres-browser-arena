# PASS 84 publish runbook (HF-400)

Prepared by Lane F (Claude Code, Fable 5.1) on 2026-09-02 in
`contrib/dave-gaming-pc/claude/pass84-release-prep`. The orchestrator runs this from the
INTEGRATED worktree after every other lane has merged. Nothing here was run for real by
Lane F: the plan below was proven with `--dry-run` against a temp worktree of
`origin/gh-pages` at `718a5295` and with a fresh local build; no push, no publish.

## Policy (owner, 2026-09-02 06:58 BST, verbatim)

> also when you push the next pass, pin this version and remove all past versions, this
> can be the safe backup

After the publish, gh-pages carries EXACTLY two channel trees:

| tree               | role                          | chooser key    | reached by                                              |
|--------------------|-------------------------------|----------------|---------------------------------------------------------|
| `channels/pass84`  | live default                  | `experimental` | `?release=latest`, `?release=normal`, every `?room=` invite, card 1 |
| `channels/pass83`  | pinned safe backup            | `previous`     | `?release=previous`, `?release=stable`, `?release=rollback`, `?release=pass72`, card 2 |

`channels/pass72-retained`, `channels/pass81`, `channels/pass82`, `channels/recent-stable`,
`channels/the-big-one` (and anything else under `channels/`) are deleted from gh-pages and
from the chooser. The script enumerates what is on gh-pages at run time and asserts the
post-state is exactly `{pass84, pass83}` before it commits.

Why those keys: `release-shell/release-shell.js` hard-routes `latest`/`normal`/room to
`experimental` and `previous`/`stable`/`rollback`/`pass72` to `previous`. Keying the cards
`pass84`/`pass83` would make `?release=latest` and every room invite throw. A bare
`?release=pass84` or `?release=pass83` falls through to the chooser page (not a 404).

## 0. Precondition that is NOT in Lane F's ownership (apply first, or the publish refuses)

The in-build two-card chooser (`src/bootstrap.ts`, drawn on every direct channel link with
no `?release=`) resolves its second card from `release-channels.json` through
`const stableFallback = releaseChannels.pass73Retained ?? releaseChannels.stable`. Both of
those trees are retired by this publish. `publish_pass84.py` parses that line and refuses
to publish unless the fallback resolves to `channels/pass83`. Lane F added the
`pass83Backup` key to `release-channels.json` and removed `pass73Retained`; the two-line
source change below is outside Lane F's file ownership and is saved as
`artifacts/pass84-outside-ownership.patch` in the Lane F worktree (verified: with it
applied, `npx tsc --noEmit` is 0, the six focused test files are 65/65, the contract test
is 8/8, and the dry run is all-green).

`src/bootstrap.ts` (line 40):

```ts
// before
const stableFallback = releaseChannels.pass73Retained ?? releaseChannels.stable;
// after  (HF-400: the only backup after the pass84 publish is channels/pass83)
const stableFallback = releaseChannels.pass83Backup ?? releaseChannels.stable;
```

`src/release-channel.ts` (the optional key on `ReleaseChannelConfig`):

```ts
// before
pass73Retained?: Readonly<{ label: string; description: string; pass: string; path: string }>;
// after
pass83Backup?: Readonly<{ label: string; description: string; pass: string; path: string }>;
```

`src/bootstrap.ts` (line 110, the second card's eyebrow, otherwise reads "PASS 83 · STABLE WEBGL"):

```ts
// before
<small>${stableFallback.pass} · STABLE WEBGL</small>
// after
<small>${stableFallback.pass} · SAFE BACKUP</small>
```

Until that lands, `python scripts/orchestration/publish_pass84.py --dry-run` reports
`in-build-fallback: WOULD REFUSE` and the contract test's third case is red. That red is
correct: it means a direct link would offer a second card that 404s.

## 1. Command sequence (integrated worktree; prefix every command with `cd <worktree> &&`)

```bash
# 1. Static + unit gates on the MERGED tree
npx tsc --noEmit                                  # must be 0
npx vitest run                                    # full floor: 4,955+ passed, 0 failed (orchestrator only)
npx vitest run src/release-topology.test.ts src/project-map.test.ts src/release-channel.test.ts src/release-pipeline.test.ts src/changelog.test.ts src/build-identity-handshake.test.ts
node --test scripts/orchestration/publish_pass84_plan.test.mjs     # 8/8 (needs the section-0 patch for case 3)

# 2. Identity stamp is PASS 84 in SOURCE
grep -n "PASS 84\|channels/pass84" src/release-identity.ts        # pass, label, route, runtimeLabel

# 3. Plan against live gh-pages BEFORE building (fetches origin/gh-pages into .gh-pages-publish, touches nothing)
python scripts/orchestration/publish_pass84.py --dry-run
#   expected: exit 2 with exactly ONE red guard, build-present (no dist-pass84 yet);
#   PLAN must list: delete pass72-retained, pass81, pass82, recent-stable, the-big-one;
#   keep channels/pass83/; write channels/pass84/; post-state ['pass83','pass84'];
#   chooser experimental -> PASS 84 (channels/pass84), previous -> PASS 83 (channels/pass83);
#   in-build fallback guard OK (pass83Backup -> channels/pass83).

# 4. Build, then badge check FROM THE IDENTITY CHUNK (not index.html - the pass82 publish
#    shipped calling itself PASS 81 and index.html looked fine)
npm run build                                     # ~14 s measured 2026-09-02
grep -l "PASS 84" dist/assets/release-identity-*.js               # must print the chunk
grep -c "PASS 83" dist/assets/release-identity-*.js               # must print 0

# 5. Hand-copy the build IMMEDIATELY after the build. Do not edit or touch any source
#    afterwards: the freshness guard compares the newest dist-pass84 mtime against the
#    newest .ts/.tsx/.css/.html/.json mtime under the repo and refuses a stale copy.
rm -rf dist-pass84 && cp -r dist dist-pass84

# 6. (Ritual step, proves the guard still fires - do it BEFORE the final copy, not after)
#    touch src/legacy-main.ts && python scripts/orchestration/publish_pass84.py --dry-run
#    -> build-freshness: WOULD REFUSE - STALE BUILD ... ; then npm run build && rm -rf dist-pass84 && cp -r dist dist-pass84

# 7. Final dry run: every guard green, exit 0
python scripts/orchestration/publish_pass84.py --dry-run
#   expected last line: "DRY RUN: every guard green; a real run would commit and push the publish plan above"

# 8. Publish (fetch origin/gh-pages -> detached worktree .gh-pages-publish -> copy -> retire
#    by enumeration -> assert post-state -> content-addressed root chooser -> assert
#    post-state again -> git add -A -> commit -> push HEAD:gh-pages)
python scripts/orchestration/publish_pass84.py
#   expected last line: PUBLISHED: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/
```

## 2. Live smoke (after the push; GitHub Pages root files are `max-age=600`, allow up to 10 min)

```bash
BASE=https://daveinturkey15-byte.github.io/atomic-acres-browser-arena

# a. gh-pages tree is exactly the two channels
git fetch --no-tags origin gh-pages && git ls-tree --name-only FETCH_HEAD channels/
#   expected: channels/pass83  channels/pass84  (nothing else)

# b. channel roots answer 200 / retired ones 404 (retired trees may serve from the CDN for <=600 s)
curl -sI "$BASE/channels/pass84/" | head -1                        # HTTP/2 200
curl -sI "$BASE/channels/pass83/" | head -1                        # HTTP/2 200
curl -sI "$BASE/channels/pass82/" | head -1                        # HTTP/2 404 once the edge expires

# c. Badge check from the identity chunk the LIVE page references
CHUNK=$(curl -s "$BASE/channels/pass84/" | grep -o 'assets/release-identity-[^"]*\.js' | head -1)
curl -s "$BASE/channels/pass84/$CHUNK" | grep -c "PASS 84"         # >= 1
curl -s "$BASE/channels/pass84/$CHUNK" | grep -c "PASS 83"         # 0

# d. Chooser check: the generation pointer names a manifest whose channel set is exactly the two cards
GEN=$(curl -s -H 'Cache-Control: no-store' "$BASE/release-index.json")
echo "$GEN"                                                        # {"generation":"<12 hex>","manifest":"release-manifest.<12 hex>.json"}
MANIFEST=$(echo "$GEN" | sed 's/.*"manifest":"\([^"]*\)".*/\1/')
curl -s "$BASE/$MANIFEST" | node -e '
  const m = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const keys = Object.keys(m.channels);
  const ok = keys.join() === "experimental,previous"
    && m.channels.experimental.path === "channels/pass84" && m.channels.experimental.pass === "PASS 84"
    && m.channels.experimental.deploymentState === "live"
    && m.channels.previous.path === "channels/pass83" && m.channels.previous.pass === "PASS 83";
  console.log(ok ? "CHOOSER OK" : "CHOOSER WRONG", JSON.stringify(m.channels, null, 1));
  process.exit(ok ? 0 : 1);'
#   the inline list in index.html carries the same generation:
curl -s "$BASE/index.html" | grep -o '__ATOMIC_ACRES_RELEASE_GENERATION__="[0-9a-f]*"'

# e. Cross-engine stall smoke on the LIVE channel. Run ALONE (a concurrent vitest run faked
#    97 stalls / 14.6% frozen on a clean build). GPU: require >= 3000 MiB free first
#    (nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader); headless only,
#    never on the owner's screen.
node scripts/qa/measure-cross-engine-stalls.mjs --url "$BASE/channels/pass84/" --lanes chrome,edge,firefox --seconds 120
#   expected: ~0% frozen per lane (PASS 83 reference: Chrome 0%, Edge 0.13%, Firefox 0%)

# f. In-build chooser on a direct link (the page bootstrap.ts draws with no ?release=):
#    the two cards must be PASS 84 and "PASS 83 · SAFE BACKUP" - the second must open
#    channels/pass83/, not the-big-one or recent-stable.
```

## 3. Rollback (re-point the default to PASS 83)

Both trees stay published; nothing is rebuilt; no tree is deleted. The chooser flips so
`latest`/`normal`/room invites route to `channels/pass83` and PASS 84 is offered as the
`previous` card labelled "PASS 84 · ROLLED BACK".

```bash
python scripts/orchestration/publish_pass84.py --rollback --dry-run    # plan; refuses unless gh-pages is exactly {pass83, pass84}
python scripts/orchestration/publish_pass84.py --rollback              # commit "rollback: default re-pointed to PASS 83 safe backup" + push
# smoke: repeat 2.d expecting experimental -> channels/pass83 (PASS 83, live) and previous -> channels/pass84 (PASS 84)
```

Re-promotion after a fix is a normal PASS 84 publish again (`npm run build`, copy,
`--dry-run`, run): the script replaces `channels/pass84` and restores the two-card chooser
with PASS 84 as the default.

Last resort, byte-exact restore of the pre-HF-400 gh-pages (brings back every retired
tree, i.e. undoes the owner's policy until the next publish): `git push origin
718a5295:gh-pages --force` from a fetched clone. Prefer `--rollback`.

## 4. What the dry run printed on 2026-09-02 (temp worktree of origin/gh-pages 718a5295, fresh local build, section-0 patch applied)

```
DRY RUN PUBLISH (HF-400) against <temp worktree> - nothing will be written, added, committed or pushed
  build freshness guard: OK (build newer than newest source)
  farcrysis-unselectable guard: OK (1 registry entry checked, all selectable:false)

PLAN
  channel trees on gh-pages now: ['pass72-retained', 'pass81', 'pass82', 'pass83', 'recent-stable', 'the-big-one']
  would delete channels/pass72-retained/
  would delete channels/pass81/
  would delete channels/pass82/
  would delete channels/recent-stable/
  would delete channels/the-big-one/
  would keep   ['channels/pass83/']
  would write channels/pass84/ <- dist-pass84/ (replacing any existing tree)
  channels/ post-state would be: ['pass83', 'pass84']
  chooser keys live now: ['experimental', 'previous', 'pass81', 'pass82', 'pass83']; would become: ['experimental', 'previous']
    experimental: PASS 84 -> channels/pass84  "PASS 84"
    previous: PASS 83 -> channels/pass83  "PASS 83 · SAFE BACKUP"
  predecessor guard: OK (offering PASS 84, PASS 83)
  in-build fallback guard: OK (pass83Backup -> channels/pass83 is the HF-400 safe backup and is on gh-pages)
  root chooser would be published as generation 3382bb988c2b (2 channels inlined, 3 superseded asset(s) swept, keeping ['3382bb988c2b', '76b095f29713'])
  would write index.html, release-shell.<gen>.js, release-shell.<gen>.css, release-manifest.<gen>.json,
              release-index.json, release-shell.js, release-shell.css, release-channel-config.js
  would sweep release-manifest.fb56f71d793a.json, release-shell.fb56f71d793a.css, release-shell.fb56f71d793a.js

DRY RUN: every guard green; a real run would commit and push the plan above
```

The generation id will differ on the integrated tree (it hashes the channel list AND the
three release-shell files).

## 5. Known hazards left OPEN (outside Lane F's ownership)

- `scripts/qa/verify-release-topology.mjs` and `scripts/release/stage-release-topology.mjs`
  describe the CI production-workflow topology (the-big-one, pass72/70/69-retained,
  recent-stable, pass63-rollback), not the `publish_passNN.py` topology that has actually
  shipped since PASS 80. The verifier fails today on "This release would remove live
  channel(s) pass81, pass82, pass83" and hardcodes `channels/the-big-one` for the live
  channel; running `.github/workflows/release-production.yml` would re-stage the retired
  trees over HF-400's two-channel gh-pages. Do not trigger that workflow for PASS 84.
- `tests/e2e/release-channel-chooser.spec.ts:46` still expects `/channels/the-big-one/`.
- `release-shell/release-shell.js` `route(key)` dereferences `config[key].path` for the
  legacy aliases `pass70` -> `retained` and `pass69` -> `historical`, which have not been in
  the published config since PASS 80; `?release=pass70` throws before the chooser draws.
  Pre-existing; unchanged by this pass.
