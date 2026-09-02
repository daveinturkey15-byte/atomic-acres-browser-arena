/**
 * What the running build calls ITSELF - the header badge, the session block and the
 * blocked-renderer notice all read this.
 *
 * Stamped to PASS 85 on 2026-09-02 (the pass85 cut). Stamping is part of CUTTING a
 * release, and the identity must always name the channel this source will publish to:
 * the pass82 publish shipped with the PASS 81 stamp still in place - the exact repeat of
 * the PASS 80/PASS 81 class of failure this file's rule exists to stop. The publish
 * badge check reads the `release-identity-*.js` chunk, not index.html.
 *
 * The build identity is also the multiplayer lobby gate: hosts refuse joins whose
 * stamped pass differs, so guests on an older channel can no longer connect and
 * silently play a different map.
 *
 * HF-400 (owner, 2026-09-02: "pin this version and remove all past versions, this can
 * be the safe backup"): once this pass publishes, gh-pages carries exactly
 * channels/pass85 (this build, live) and channels/pass84 (the pinned safe backup).
 * Every older tree is retired by scripts/orchestration/publish_pass85.py.
 */
export const PASS66_RELEASE_IDENTITY = Object.freeze({
  pass: 'PASS 85',
  label: 'PASS 85',
  state: 'RELEASE CANDIDATE',
  route: 'channels/pass85',
  runtimeLabel: 'PASS 85',
});

export const PASS64_FAILED_REGRESSION_IDENTITY = Object.freeze({
  pass: 'PASS 64',
  publishedLabel: 'EXPERIMENTAL NEW NETCODE',
  role: 'published-failed-regression-evidence',
  sourceSha: '5075a52d80c6db69a97ed53acc2df5368728371a',
  pagesSha: '8326c95659a9fb8c5979c13f9b88126c4ffb85f7',
  route: 'channels/experimental-netcode-pass',
  runtimeFileCount: 130,
  runtimeTreeSha256: 'ffd3e130d005e9321976795fe2d5cadfd9965ebb27dc0bbff0c1609816cff20b',
});
