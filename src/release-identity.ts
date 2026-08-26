/**
 * What the running build calls ITSELF - the header badge, the session block and the
 * blocked-renderer notice all read this.
 *
 * Stamped to PASS 80 on 2026-08-26 when that build was published to
 * channels/pass80. It had been left at PASS 73 through the whole publish, so the owner
 * opened the new URL and was told he was looking at Pass 73. The bundle was correct; only
 * this was stale. Stamping the identity is part of CUTTING a release, not an afterthought.
 *
 * PASS 73 remains live at channels/the-big-one and is untouched.
 */
export const PASS66_RELEASE_IDENTITY = Object.freeze({
  pass: 'PASS 80',
  label: 'PASS 80',
  state: 'RELEASE CANDIDATE',
  route: 'channels/pass80',
  runtimeLabel: 'PASS 80',
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
