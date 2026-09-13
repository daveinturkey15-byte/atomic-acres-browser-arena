# Asset provenance: binding unchanged media to a historical generator revision

Status: process contract for `assets.manifest.json`, enforced by `scripts/qa/verify-asset-provenance.mjs`
(`npm run verify:provenance`) and by `scripts/qa/verify-public-asset-provenance.mjs` (`npm run
qa:asset-provenance`), which imports the same `verifyRevision` implementation rather than skipping the
generator when a revision is declared. Both commands stay standalone.
Added 2026-09-11 (provenance repair lane P1, contribution branch
`contrib/dave-gaming-pc/claude/provenance-repair-20260911`).

## The problem this solves

`sourceScriptSha256` pins the generator that produced a family of shipped media. When the generator is
edited later without regenerating the media (a roster rename, a browser launch flag, a map-order
change), the pin goes stale although not one media byte moved. Re-pinning the digest to the live file
would say "the current script generated these bytes", which is false. Regenerating historical captures
to satisfy a digit is expensive and destroys evidence.

## The rule

An entry may carry a `sourceScriptRevision` object next to its `sourceScript` and `sourceScriptSha256`:

```json
"sourceScript": "scripts/assets/finalize-pass77-arena-menu-previews.mjs",
"sourceScriptSha256": "8106aaad…",
"sourceScriptRevision": {
  "commit": "3b79d9a2c72145a0230a9d24fe8b6ba253034f2e",
  "path": "scripts/assets/finalize-pass77-arena-menu-previews.mjs",
  "crlfSha256": "<optional: what the same blob hashes to on a CRLF checkout>",
  "reason": "<why this commit, and what changed the generator afterwards>"
}
```

When it is present the verifier stops hashing the live worktree file for that generator and instead
checks, against the repository's own Git objects:

1. `commit` is a full 40-hex SHA, exists as a commit, and is an ancestor of `HEAD`;
2. `path` equals the entry's `sourceScript` and is a safe repository-relative path (no absolute form,
   drive, backslash or `..` segment);
3. the blob at `commit:path`, digested with the same CRLF-to-LF normalisation the worktree check uses,
   equals `sourceScriptSha256`;
4. every pinned `files[]` entry exists at `commit` with exactly its pinned digest, and the live worktree
   bytes still equal that pin (the ordinary check keeps running for media);
5. `commit` touched the generator or at least one pinned media file;
6. `crlfSha256`, when present, equals the CRLF form of the same blob.

The live generator file must still exist. Size, existence, licence and every other digest check are
unchanged. Entries without a revision are verified exactly as before.

## What the binding proves, and what it does not

Git proves **coexistence**: at the named commit these media bytes and this generator revision were
committed together, and the media have not changed since. Coexistence is origin evidence, not proof of
which process produced the bytes: the family's capture receipt and sidecar carry that claim, and the
`reason` field must cite them rather than assert causation on the commit alone. A generator
edit followed by deterministic regeneration may legitimately emit identical bytes, so a generator edit
is **not** required to change an output hash, and commit chronology alone never proves a recapture
happened. The revision names the exact object a reviewer can open; the family's capture receipt under
`source-assets/` remains the record of what was actually run.

Merely editing digits cannot satisfy the rule: a re-pinned generator digest fails unless a real blob
at the named commit hashes to it, a fabricated media digest fails against the blob at that commit, a
commit that is not reachable, does not exist, or touched nothing relevant is rejected, and unsafe paths
are rejected. `src/asset-provenance-revision-contract.test.ts` pins each of these.

## When to use it

- The generator changed after the capture and the media are intentionally untouched: bind to the
  capture commit (or the last documented no-byte-change re-pin) and say in `reason` what changed later.
- A shipped file was replaced by a different pipeline (for example the HF-561 code-derived loading
  posters): give the new bytes their **own** entry bound to their own generator and sidecar, and retire
  the old digest from the original family with a `retiredPoster` note instead of pretending one
  generator produced both.
- A historical pin turns out to be a CRLF-checkout digest of a real blob: pin the LF digest, name the
  commit, and record the CRLF value in `crlfSha256` so the old receipt still reconciles.

If intent or provenance cannot be traced to a real commit and object, leave the entry red and OPEN.
