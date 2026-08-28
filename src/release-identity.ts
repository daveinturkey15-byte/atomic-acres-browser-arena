/**
 * What the running build calls ITSELF - the header badge, the session block and the
 * blocked-renderer notice all read this.
 *
 * Stamped to PASS 81 on 2026-08-28. The previous stamp (PASS 80) survived into the
 * first channels/pass81 publish, so the owner clicked PASS 81 in the chooser and the game
 * introduced itself as PASS 80 - the third time this exact class of failure has shipped
 * (PASS 73 before that). Stamping the identity is part of CUTTING a release, not an
 * afterthought, and the identity must always name the channel this source will publish to.
 *
 * PASS 73 remains live at channels/the-big-one and is untouched.
 */
export const PASS66_RELEASE_IDENTITY = Object.freeze({
  pass: 'PASS 81',
  label: 'PASS 81',
  state: 'RELEASE CANDIDATE',
  route: 'channels/pass81',
  runtimeLabel: 'PASS 81',
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
