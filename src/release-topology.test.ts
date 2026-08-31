import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateAcceptance, validateAcceptanceManifest } from '../scripts/release/acceptance-gate.mjs';
import { PASS66_RELEASE_IDENTITY } from './release-identity';

const config = JSON.parse(readFileSync('release-channels.json', 'utf8'));
const pass62Benchmark = JSON.parse(readFileSync('baselines/pass62/best-netcode-benchmark.json', 'utf8'));
const shell = readFileSync('release-shell/release-shell.js', 'utf8');
const shellHtml = readFileSync('release-shell/index.html', 'utf8');
const staging = readFileSync('scripts/release/stage-release-topology.mjs', 'utf8');
const playwrightServer = readFileSync('scripts/qa/playwright-web-server.mjs', 'utf8');

describe('Pass 80 release topology', () => {
  // Re-pinned from PASS 73 on 2026-08-26. The build published to channels/pass80 still
  // announced itself as PASS 73 in the header, the session block and the blocked-renderer
  // notice, so the owner opened the new URL and was told he was looking at the old build.
  // The bundle was correct; the identity was never stamped. Re-pinned at EQUAL strictness -
  // every field still exact - and the protected fallback pins below are untouched.
  it('identifies this source as Pass 80 without moving any protected fallback pin', () => {
    expect(PASS66_RELEASE_IDENTITY).toMatchObject({
      pass: 'PASS 81',
      label: 'PASS 81',
      state: 'RELEASE CANDIDATE',
      route: 'channels/pass81',
      runtimeLabel: 'PASS 81',
    });
    expect(config.latest.label).toBe('PASS 81');
    // The identity's route must be the channel the config actually stages, or the shell
    // links players at a 404 - which is exactly how a correct bundle came to announce
    // itself as the wrong pass. This assertion did not exist before.
    expect(config.experimental.path).toBe(PASS66_RELEASE_IDENTITY.route);
    // PASS 73 must remain REACHABLE at its original path, not overwritten by the new cut.
    expect(config.pass73Retained).toMatchObject({
      pass: 'PASS 73', path: 'channels/the-big-one',
    });
    expect(config.previous).toMatchObject({
      pass: 'PASS 72',
      sourceSha: '5da686551d92387d08b00be40125386c391bb3ed',
      pagesSha: 'd5b77dc3b9e46608264c52eb0737b50590d70eb5',
      pagesPath: 'channels/the-big-one',
      runtimeFileCount: 515,
      runtimeTreeSha256: '62fafc5e5c39fa744dfc4f7067b3e0953dd190d8ffecc04e203b2b86d6a8974f',
      path: 'channels/pass72-retained',
    });
    expect(config.retained).toMatchObject({
      pass: 'PASS 70',
      sourceSha: '130fd59bd2cf1e1719b802463219ddf36e2484d5',
      pagesSha: '3b5e675c54eaea2a2dd721eca6f247c933361587',
      pagesPath: 'channels/the-big-one',
      runtimeFileCount: 515,
      runtimeTreeSha256: 'c8f6aeed492cd747ef83aa41bdc0d05f2fd86264418d40d0ebbd0916c85d6160',
      path: 'channels/pass70-retained',
    });
    expect(config.stable.sourceSha).toBe('8c3ad1cd4d819aba79f07c01c16c8c4294fd14c1');
    expect(config.historical).toMatchObject({
      pass: 'PASS 69',
      sourceSha: '685ed7865018e107df5acf6cb6f7498b4468940c',
      pagesSha: '71ec5616504d8e24241450742d01b25c1d6ff4e4',
      pagesPath: 'channels/the-big-one',
      runtimeFileCount: 515,
      runtimeTreeSha256: '5ace26fdf83a4cf695d0075a40523f70e0d6fcee02cb6ae5b42666b6679107b9',
      path: 'channels/pass69-retained',
    });
    expect(config.rollback.sourceSha).toBe('ac85e9b8b46cc2370aee903d564ecf3c4682b24c');
    expect(config.rollback).toMatchObject({
      pass: 'PASS 63',
      pagesSha: '46d366d188bfc5ebc5ee7a991fd52b792575316c',
      pagesPath: 'channels/pass63-rollback',
      runtimeFileCount: 119,
      runtimeTreeSha256: 'b7416e02c190d8ff0403a65cd7a7c894970507bc6a8de7b196cc2d7979d69bce',
      path: 'channels/pass63-rollback',
    });
  });

  it('retains the immutable best-ever Pass 62 benchmark record independently', () => {
    expect(pass62Benchmark).toMatchObject({
      designation: 'user-approved-best-ever-netcode',
      releasePass: 'PASS 62',
      immutable: true,
      sourceSha: '249a7ee77dce761eb237f3eb0e0d0ea1d0356317',
      pagesSha: '27c90967bdaf5387c0372933c7965a60ce75a765',
      runtimeFileCount: 118,
      runtimeTreeSha256: '035e868ad80a7d81aeac6a08c17db4123feb6a1343f1b8eb24bbd8b1971c1d5d',
      productionWorkflowRun: 30109672269,
      pagesWorkflowRun: 30109872134,
    });
  });

  it('uses schema 5 and pins stable Pass 67.1 by exact production source, Pages subtree, and runtime digest', () => {
    expect(config.schemaVersion).toBe(5);
    expect(config.stable).toEqual({
      pass: 'PASS 67.1',
      label: 'STABLE SINGLEPLAYER',
      description: expect.any(String),
      sourceSha: '8c3ad1cd4d819aba79f07c01c16c8c4294fd14c1',
      pagesSha: '271cea28299570af8def30e879701ddbd3c4bc12',
      pagesPath: 'channels/recent-stable',
      runtimeFileCount: 508,
      runtimeTreeSha256: 'd8d444578e83a408c2e4d63ca4d1c2c5b705521f565fee6a58daffeb1e205ce9',
      path: 'channels/recent-stable',
    });
  });

  it('stages the Pass 73 candidate at the promotable path and removes retired channels', () => {
    expect(config.experimental).toEqual({
      pass: PASS66_RELEASE_IDENTITY.pass,
      label: PASS66_RELEASE_IDENTITY.label,
      description: expect.any(String),
      path: PASS66_RELEASE_IDENTITY.route,
    });
    expect(config.normal).toBeUndefined();
    expect(JSON.stringify(config)).not.toContain('PASS 59');
    expect(config.stable.pass).not.toBe('PASS 64');
    expect(JSON.stringify(config)).not.toContain('channels/new-netcode');
  });

  it('offers every configured pass with no hardcoded key list, and copy that cannot go stale', () => {
    // The BEHAVIOUR is proven in release-shell-chooser.test.ts, which runs this shell against
    // a synthetic config. What is pinned here is that the hardcoded list cannot come back -
    // it is what hid a published PASS 80 and PASS 63 from the owner, and it hid them from
    // every gate at the same time, because every gate had been given the same four names.
    expect(shell).not.toContain("['experimental', 'previous', 'retained', 'historical']");
    expect(shell).not.toContain("['experimental', 'stable', 'rollback']");
    expect(shell).not.toContain("['normal', 'stable', 'experimental']");
    expect(shell).toContain('const orderedKeys = Object.keys(config)');
    expect(shell).toContain("channel.deploymentState === 'live' ? 'LIVE' : 'RELEASE CANDIDATE'");
    // Legacy aliases are load-bearing: room invites and old links resolve through them.
    expect(shell).toContain("requested === 'stable' || requested === 'rollback') return route('previous')");
    expect(shell).toContain("requested === 'previous' || requested === 'pass72') return route('previous')");
    expect(shell).toContain("requested === 'pass70') return route('retained')");
    expect(shell).toContain("requested === 'pass69') return route('historical')");
    // The static copy enumerated the same four passes and went stale for the same reason, so
    // it no longer names any pass at all. A sentence listing builds is a second place to
    // forget to update.
    expect(shellHtml).not.toContain('Pass 73');
    expect(shellHtml).not.toContain('Pass 72');
    expect(shellHtml).not.toContain('Pass 70');
    expect(shellHtml).not.toContain('Pass 69');
    expect(shellHtml).not.toContain('The Big One');
    expect(shellHtml).toContain('newest build');
    expect(shellHtml).toContain('Nuke Town');
    expect(shellHtml).not.toContain('Atomic Acres');
    expect(shellHtml).not.toContain('Pass 59');
  });

  it('routes root rooms and legacy latest or normal aliases to Pass 73', () => {
    expect(shell).toContain("requested === 'latest' || requested === 'normal') return route('experimental')");
    expect(shell).toContain("requested === 'experimental'");
    expect(shell).toContain("requested === 'stable' || requested === 'rollback') return route('previous')");
    expect(shell).toContain("target.searchParams.set('release', 'latest')");
  });

  it('bridges overlapping controls into immutable Pass 63 and back without changing channel bytes', () => {
    expect(shell).toContain("const profileKey = 'atomic-acres.player-profile.v1'");
    expect(shell).toContain("bridgeControls(key === 'stable' ? 'stable' : 'latest')");
    expect(shell).toContain("mouseSensitivity: 'atomic-acres-sensitivity'");
    expect(shell).toContain('localStorage.removeItem(key)');
  });

  it('moves the candidate under experimental and requires timestamped retained-source rebuilds in production', () => {
    expect(staging).toContain('process.env.RELEASE_DIST_ROOT');
    expect(staging).toContain('process.env.RELEASE_TOPOLOGY_RECEIPT_PATH');
    expect(staging).toContain("renameSync(join(distRoot, 'index.html'), join(experimentalRoot, 'index.html'))");
    expect(staging).toContain('process.env.RELEASE_STABLE_DIST');
    expect(staging).toContain('process.env.REQUIRE_STABLE_RELEASE_TIMESTAMP');
    expect(staging).toContain("stageRebuilt('recent-stable', config.stable");
    expect(staging).toContain("stagePinned('recent-stable', config.stable)");
    expect(staging).toContain("stagePinned('pass72-retained', config.previous)");
    expect(staging).toContain("stagePinned('pass70-retained', config.retained)");
    expect(staging).toContain("stagePinned('pass69-retained', config.historical)");
    expect(staging).toContain('STABLE_RELEASED_AT must be one strict UTC ISO-8601 instant');
    expect(staging).toContain("channel: liveChannelId");
    expect(staging).toContain('channel.pagesPath');
    expect(staging).toContain("'pinned-channel-provenance.json'");
    expect(staging).not.toContain("stagePinned('new-netcode'");
    expect(staging).toContain('experimental: {');
    expect(staging).toContain('...(rollback ? {');
    expect(staging).toContain('stable: {');
    expect(staging).toContain("RELEASE_ROLLBACK_DIST");
    expect(staging).toContain('ROLLBACK_RELEASED_AT must be one strict UTC ISO-8601 instant');
    expect(staging).toContain("releasedAt: rollbackReleasedAt");
    expect(staging).toContain("originalPagesSha: exactSha(config.rollback.pagesSha, 'rollback.pagesSha')");
    expect(staging).toContain('originalPagesPath: config.rollback.pagesPath');
    expect(staging).toContain("pagesSha: '46d366d188bfc5ebc5ee7a991fd52b792575316c'");
    expect(staging).toContain("rollback = stagePinned('rollback', { ...config.rollback, ...PASS63_PREVIEW_PIN })");
    expect(staging).toContain('const TOPOLOGY_SCHEMA_VERSION = 5');
    expect(staging).toContain("process.env.RELEASE_BUILT_AT?.trim() ? 'live' : 'candidate'");
    expect(staging).toContain('deploymentState,');
    expect(staging).toContain("deploymentState === 'live'");
    expect(staging).toContain('Publication remains disabled until exact preview binding.');
  });

  it('stages the production channel topology before browser regression tests', () => {
    expect(playwrightServer).toContain("['scripts/release/stage-release-topology.mjs']");
    expect(playwrightServer).toContain("stdio: 'inherit'");
    expect(playwrightServer.indexOf('stage-release-topology.mjs')).toBeLessThan(playwrightServer.indexOf('const server = await preview'));
  });

  it('tracks the current release acceptance lifecycle without inventing preview or mechanical evidence', () => {
    // Derived, not hardcoded. It read 'acceptance/pass-73.json' while evaluating whatever
    // pass the IDENTITY names, so after a stamp it checked one manifest and evaluated
    // another - the same class of staleness that let a Pass 80 bundle announce itself as
    // Pass 73.
    const manifestPath = `acceptance/${PASS66_RELEASE_IDENTITY.pass.toLowerCase().replace(' ', '-')}.json`;
    if (!existsSync(manifestPath)) {
      expect(() => evaluateAcceptance({ phase: 'release', pass: PASS66_RELEASE_IDENTITY.pass }))
        .toThrow(`acceptance manifest does not exist: ${manifestPath}`);
      return;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const validation = validateAcceptanceManifest(manifest);
    if (!manifest.preview) {
      expect(manifest.bindingState).toBe('awaiting-immutable-preview-and-owner-hitl');
      expect(manifest.humanAcceptance).toBeNull();
      expect(manifest.requirements.some((requirement: { state?: string }) => requirement.state === 'pending')).toBe(true);
      expect(validation.ok).toBe(false);
      expect(validation.errors).toContain('preview must name its kind, immutable reference, full source SHA, and createdAt timestamp');
      expect(validation.errors).toContain('preview exact pins require a positive artifactId, positive fileCount, and lowercase SHA-256 treeSha256');
      return;
    }
    expect(validation.ok, validation.errors.join('\n')).toBe(true);
    const result = evaluateAcceptance({ phase: 'release', pass: PASS66_RELEASE_IDENTITY.pass }) as {
      ok: boolean;
      errors: string[];
      approvalParity: { ok: boolean };
    };
    // A finalized runtime candidate must fail closed unless its immutable
    // preview remains an ancestor and only allowed finalizer paths changed.
    if (!result.approvalParity.ok) {
      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.startsWith('preview approval invalid:'))).toBe(true);
      return;
    }
    if (!manifest.humanAcceptance) {
      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(['humanAcceptance must be approved by Dave with timestamped evidence']);
      return;
    }
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// The chooser is published content-addressed. Owner, 2026-08-30: "I just opened it in a new
// chrome I ran as admin and now I see pass 73 and 72 lol, before I only saw 81 and 63 or
// something. Defo something odd going on here? ... now i opened in firefox, and its back to
// pass 81."
//
// He was looking at three separately cached root URLs - index.html, release-shell.js and
// release-channel-config.js - with nothing tying a generation of one to a generation of
// another, all served `Cache-Control: max-age=600` by a host that offers no way to change
// that. Measured against the live origin on 2026-08-31: a request-side `no-cache` does not
// force revalidation (Age: 109 came back) and the query string is stripped from the CDN
// cache key (`?ts=<random>` returned Age: 82), so the ONLY reliable freshness primitive
// there is a path nobody has requested before (those always return Age: 0).
//
// What is pinned below is the shape that makes a cross-generation mixture unrepresentable.
// The cross-browser proof that a reload converges lives outside the unit suite, because it
// needs three real browser HTTP caches; this is the structural half.
describe('the published chooser cannot be assembled from two publishes', () => {
  const publish = readFileSync('scripts/orchestration/publish_pass81.py', 'utf8');

  it('gives index.html the substitution points publish needs, and no second cacheable list', () => {
    // The channel list is INLINED. A separate release-channel-config.js is still written
    // for index.html generations cached before this change, but the current document must
    // not depend on a second URL whose cache lifetime is its own.
    expect(shellHtml).toContain('/*__RELEASE_GENERATION__*/');
    expect(shellHtml).toContain('window.__ATOMIC_ACRES_RELEASE_CHANNELS__');
    expect(shellHtml).toContain('href="./release-shell.css"');
    expect(shellHtml).toContain('src="./release-shell.js"');
    // The legacy config tag stays in the TEMPLATE - stage-release-topology.mjs publishes
    // this document verbatim and feeds it the channel list that way, so removing it there
    // would ship that path a chooser with a null list, which throws before it draws. The
    // publish script deletes the tag, which is what the next assertion pins.
    expect(shellHtml).toContain('src="./release-channel-config.js"');
  });

  it('content-addresses the shell and publishes a generation-addressed manifest', () => {
    expect(publish).toContain('def generation_id(channels, sources)');
    expect(publish).toContain('shell_js = f"release-shell.{generation}.js"');
    expect(publish).toContain('shell_css = f"release-shell.{generation}.css"');
    expect(publish).toContain('manifest_name = f"release-manifest.{generation}.json"');
    expect(publish).toContain('write("release-index.json"');
    // ...and deletes the second cacheable channel list from the document it publishes.
    expect(publish).toContain(String.raw`<script defer src="\./release-channel-config\.js"></script>`);
    // The generation hashes the CODE as well as the channel list. Hashing only the channels
    // would keep serving the previous script filename after a shell fix, and that script is
    // exactly what cannot be evicted from a browser inside its ten-minute freshness window.
    expect(publish).toContain('digest.update(canonical_channel_bytes(channels))');
    expect(publish).toContain('digest.update(sources[name])');
  });

  it('keeps the previous generation reachable and still writes the legacy filenames', () => {
    // A browser that loaded the previous index.html seconds ago must still be able to fetch
    // the script that document names, and an index.html cached before this change still asks
    // for the unhashed files. Deleting either 404s a real visitor into a blank chooser.
    expect(publish).toContain('keep_generations = {generation}');
    expect(publish).toContain('keep_generations.add(previous)');
    expect(publish).toContain('write("release-shell.js"');
    expect(publish).toContain('write("release-shell.css"');
    expect(publish).toContain('write("release-channel-config.js"');
  });

  it('substitutes with callables, because the channel labels are full of backslash escapes', () => {
    // A string replacement raised `re.PatternError: bad escape \u` the first time this ran
    // against the real channel set - every retained label carries a · middot.
    expect(publish).toContain('lambda _: inline');
    expect(publish).toContain('lambda _: f"./{shell_css}"');
    expect(publish).toContain('lambda _: f"./{shell_js}"');
    expect(publish).not.toMatch(/re\.subn\([^)]*,\s*inline\s*,/);
  });

  it('escapes the channel list for the script block it now lives inside, and proves it did', () => {
    // Inlining moved authored channel strings into a <script> block - a sink the separate
    // config file never was. A description containing "</script>" would close the block and
    // spill the rest of the list into the document as markup.
    expect(publish).toContain('def script_safe(text)');
    expect(publish).toContain('r"\\u003c"');
    // The first draft of that escape was a Python "\\u003c" literal, which IS the '<'
    // character - a silent no-op. So the script self-tests the escape and round-trips the
    // bytes it is about to write, rather than trusting that escaping happened.
    expect(publish).toContain('script_safe is not escaping');
    expect(publish).toContain('json.loads(emitted) != channels');
  });

  it('refuses to publish a chooser that would ship a blank or unsubstituted document', () => {
    expect(publish).toContain('if not (inline_hits and css_hits and js_hits and tag_hits)');
    expect(publish).toContain("did not survive inlining into index.html");
    expect(publish).toContain("does not reference this generation's shell assets");
  });

  it('refuses to offer the newest pass with no recent predecessor beside it', () => {
    // Owner, 2026-08-30: "i dont want pass 63, stable webgl, i want the previous 1/2
    // versions we had, 73 and 71 I think? i forgot, unhide those on next publish please."
    expect(publish).toContain('def assert_predecessors_offered(channels)');
    expect(publish).toContain('if len(predecessors) < 2');
    expect(publish).toContain('"experimental": {');
    expect(publish).toContain('PASS 73 · PREVIOUS VERSION');
    expect(publish).toContain('PASS 72 · THE ONE BEFORE THAT');
    expect(publish).toContain('KEEP_AT_LEAST = {"experimental", "previous", "pass81"}');
    // And it has to have been seen red. A gate nobody has watched fail is a gate nobody
    // has checked - this file's own history is the argument for that.
    expect(publish).toContain('the predecessor guard failed its own red test');
  });

  it('refuses to publish while the in-build chooser links a fallback that is not on gh-pages', () => {
    // src/bootstrap.ts draws its own two-card chooser from release-channels.json for anyone
    // opening a channel URL with no ?release=. Its second card used to be `rollback ??
    // stable`, i.e. PASS 63 at channels/pass63-rollback - a path that returns 404 on the
    // live host (measured 2026-08-31). That dead card was the other half of "I only saw
    // 81 and 63".
    //
    // Re-pinned 2026-08-31: this asserted the guard contained the literal
    // `config.get("rollback") or config.get("stable")`, i.e. it pinned the guard's
    // ASSUMPTION about which key bootstrap.ts uses. bootstrap.ts now prefers
    // pass73Retained (the newest LIVE predecessor), and the guard refused a correct
    // publish because of that stale assumption - the guard committing the exact bug it
    // was written to catch. The guard now PARSES the stableFallback expression out of
    // bootstrap.ts and resolves the ?? chain, so pin that behaviour instead of a literal.
    expect(publish).toContain('def assert_in_game_fallback_exists(worktree)');
    expect(publish).toContain('const stableFallback = ([^;]+);');
    expect(publish, 'the guard must read the real expression, not assume a key')
      .toContain('bootstrap.ts');
    expect(publish, 'and must fail loudly if it can no longer find it, not check nothing')
      .toContain('this guard can no longer tell which channel the in-build chooser offers');
    expect(publish).toContain('is NOT on gh-pages');
  });
});
