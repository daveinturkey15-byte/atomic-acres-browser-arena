import {
  CHANGELOG,
  PENDING_PRODUCTION_RELEASE,
  latestChangelogEntry,
  type ChangelogEntry,
} from './changelog';
import { ARENA_IDS } from './arena-identity';
import releaseChannelsJson from '../release-channels.json';
import { PASS64_FAILED_REGRESSION_IDENTITY } from './release-identity';

export type ProjectMapNode = Readonly<{
  id: string;
  title: string;
  summary: string;
  authority: string;
  status: 'active' | 'progressive-migration';
  paths?: readonly string[];
  children?: readonly ProjectMapNode[];
}>;

export type ProjectMapBundle = Readonly<{
  schemaVersion: 1;
  current: Readonly<{
    product: 'Nuke Town';
    generatedAt: string;
    architectureRevision: 'atomic-acres-domains-v1';
    releaseState: 'release-candidate' | 'released';
    release: ChangelogEntry;
    previousRelease: string | null;
  }>;
  publishedChannels: Readonly<{
    schemaVersion: number;
    liveTarget: Readonly<{ pass: string; label: string; path: string; state: 'release-candidate' | 'released' }>;
    failedRegressionEvidence: Readonly<{
      pass: string;
      label: string;
      path: string;
      role: 'published-failed-regression-evidence';
      sourceSha: string;
      pagesSha: string;
      runtimeFileCount: number;
      runtimeTreeSha256: string;
    }>;
    stable: Readonly<{ pass: string; label: string; path: string; sourceSha: string; pagesSha: string; role: 'stable' }>;
  }>;
  operatingBoundaries: readonly string[];
  architecture: readonly ProjectMapNode[];
  changes: readonly ChangelogEntry[];
  archive: readonly ChangelogEntry[];
}>;

/**
 * HF-406: the project map's "current release" is no longer a second, hand-written copy
 * of the release notes. It IS the changelog's current entry, which in turn takes its
 * pass number from the build stamp. Before this, the map rendered
 * `PASS 84 · Pass 73 · release candidate` - three surfaces, two of them eleven passes
 * stale, and an `HITL` area chip on a player-facing panel (measured 2026-09-02 on the
 * local build AND on the live PASS 83 channel).
 */
export const PROJECT_MAP_RELEASE: ChangelogEntry = latestChangelogEntry();

export const PROJECT_MAP_TREE: readonly ProjectMapNode[] = Object.freeze([
  Object.freeze({
    id: 'browser-client',
    title: 'Browser client',
    summary: 'The Vite, TypeScript, Three.js and Rapier application delivered to every player.',
    authority: 'Owns local input and presentation; gameplay outcomes remain in the explicit authority modules below.',
    status: 'progressive-migration',
    children: Object.freeze([
      Object.freeze({
        id: 'runtime-shell',
        title: 'Runtime shell and menu',
        summary: 'Bootstraps release routing, builds the menu/HUD shell, and coordinates the live game loop.',
        authority: 'Composition only; it must call domain contracts rather than silently reimplement them.',
        status: 'progressive-migration',
        paths: Object.freeze(['src/bootstrap.ts', 'src/main.ts', 'src/legacy-main.ts', 'src/style.css']),
      }),
      Object.freeze({
        id: 'gameplay-authority',
        title: 'Gameplay and physics authority',
        summary: 'Weapons, damage, movement, collision, ballistics, hit zones, maps and the fixed simulation contract.',
        authority: 'Authoritative for movement and combat semantics in every render profile.',
        status: 'active',
        paths: Object.freeze([
          'src/gameplay.ts',
          'src/physics.ts',
          'src/collision.ts',
          'src/ballistics.ts',
          'src/hit-proxies.ts',
          'src/map.ts',
          'src/destructible-world.ts',
          'src/destructible-shed-definition.ts',
          'src/destructible-shed-registry.ts',
          'src/interactive-world-runtime.ts',
          'src/house-destruction.ts',
          'src/major-debris-budget.ts',
        ]),
      }),
      Object.freeze({
        id: 'multiplayer-authority',
        title: 'Private multiplayer authority',
        summary: 'Peer transport, versioned protocol, host-owned lobby/match state, shot resolution, rewind and interpolation.',
        authority: 'The browser host admits and resolves shared state; signalling is not gameplay authority.',
        status: 'active',
        paths: Object.freeze([
          'src/network.ts',
          'src/protocol.ts',
          'src/private-match.ts',
          'src/text-chat.ts',
          'src/authoritative-shot.ts',
          'src/lag-compensation.ts',
          'src/network-sync.ts',
        ]),
      }),
      Object.freeze({
        id: 'world-presentation',
        title: 'World and weapon presentation',
        summary: 'Arena construction, streamed assets, render profiles, lighting, post effects and first-person presentation.',
        authority: 'Presentation follows the shared physics world and may never invent profile-only gameplay collision.',
        status: 'active',
        paths: Object.freeze([
          'src/additional-maps.ts',
          'src/environment-assets.ts',
          'src/graphics-refinement.ts',
          'src/atomic-signal.ts',
          'src/weapon-presentation.ts',
          'src/render-profile.ts',
          'src/destructible-shed-presentation.ts',
          'src/house-destruction-presentation.ts',
        ]),
      }),
      Object.freeze({
        // HF-406: "the map button contains the proper project map too". The arena list
        // is DERIVED from the canonical id list, so shipping a new arena updates the
        // project map without anyone remembering to edit it.
        id: 'arena-catalog',
        title: 'Arena catalog',
        summary: `The ${ARENA_IDS.length} canonical arena ids in this build: ${ARENA_IDS.join(', ')}. Menu roster, spawn safety, audio, replay and the network protocol all decode against this one list.`,
        authority: 'One canonical id list. Display labels, route ids and selectability are projections of it, never a second hand-maintained roster.',
        status: 'active',
        paths: Object.freeze([
          'src/arena-identity.ts',
          'src/map-selection.ts',
          'src/additional-maps.ts',
          'src/rendering/arenas',
          'src/spawn-safety.ts',
        ]),
      }),
      Object.freeze({
        id: 'ui-observability',
        title: 'UI, reports and observability',
        summary: 'Release history, project documentation, HUD feedback, bounded client errors and match exports.',
        authority: 'Explains recorded state; it does not create combat or network outcomes.',
        status: 'progressive-migration',
        paths: Object.freeze([
          'src/changelog.ts',
          'src/client-runtime-log.ts',
          'src/match-report.ts',
          'src/match-diagnostics.ts',
          'src/project-map.ts',
          'src/ui/release-history-dialog.ts',
          'src/ui/project-map-dialog.ts',
        ]),
      }),
    ]),
  }),
  Object.freeze({
    id: 'services',
    title: 'Optional services',
    summary: 'The season-aware public leaderboard, browser-local fallback and explicit result-sharing consent policy.',
    authority: 'Public records are readable without creating an identifier. Result submission is default-off, disclosed, revocable and never blocks play.',
    status: 'active',
    children: Object.freeze([
      Object.freeze({
        id: 'leaderboard-service',
        title: 'Leaderboard Worker',
        summary: 'Cloudflare Worker/D1 retrieval plus explicitly consented submission with shared validation policy.',
        authority: 'Authoritative only for the optional global board; local cache remains a fallback and no browser ID is created or retained while sharing is off.',
        status: 'active',
        paths: Object.freeze([
          'src/global-leaderboard.ts',
          'src/pass65-settings.ts',
          'src/ui/pass64-shell.ts',
          'shared/leaderboard-policy.ts',
          'shared/leaderboard-season.ts',
          'worker/src/index.ts',
        ]),
      }),
    ]),
  }),
  Object.freeze({
    id: 'delivery',
    title: 'Verification and delivery',
    summary: 'Mechanical checks, immutable previews, acceptance evidence and exact-SHA production promotion.',
    authority: 'GitHub PRs are the contribution ledger; only the protected production workflow may publish Pages.',
    status: 'active',
    children: Object.freeze([
      Object.freeze({
        id: 'qa-contracts',
        title: 'QA contracts',
        summary: 'Unit, property, real-peer, browser, asset and release-tree evidence.',
        authority: 'Positive contracts are preserved; a feature fix may not weaken them to obtain green.',
        status: 'active',
        paths: Object.freeze([
          'tests/e2e/atomic-acres.spec.ts',
          'scripts/qa/run-bounded-e2e.mjs',
          'scripts/qa/verify-release-tree.mjs',
        ]),
      }),
      Object.freeze({
        id: 'release-pipeline',
        title: 'Contribution and release pipeline',
        summary: 'Impact classification, requirement acceptance, cross-platform verification and serialized Pages promotion.',
        authority: 'A release is live only when source SHA, Pages SHA, receipt and canonical browser smoke agree.',
        status: 'active',
        paths: Object.freeze([
          '.github/workflows/verify.yml',
          '.github/workflows/release-production.yml',
          'scripts/release/acceptance-gate.mjs',
          'scripts/release/pipeline-guard.mjs',
        ]),
      }),
    ]),
  }),
  Object.freeze({
    id: 'project-knowledge',
    title: 'Project knowledge',
    summary: 'Executable contributor rules, pass specifications, acceptance manifests and historical release context.',
    authority: 'Current contracts outrank old pass notes; history remains available as evidence, not active instruction.',
    status: 'active',
    paths: Object.freeze([
      'AGENTS.md',
      'docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md',
      'docs/INDEX.md',
      'acceptance/README.md',
    ]),
  }),
]);

export const PROJECT_OPERATING_BOUNDARIES = Object.freeze([
  'TypeScript and Rapier own physics, collision, hit admission and gameplay state.',
  'Three.js, GLB assets, shaders and adaptive effects present that same authority in every graphics profile.',
  'The private-match host owns shared lobby, movement, damage, score, drop and match transitions.',
  'The PeerJS service supplies signalling; it is not a TURN service or a gameplay server.',
  'GitHub pull requests and exact-SHA workflow receipts are release evidence; local builds and chat claims are not.',
]);

export function flattenProjectMap(nodes: readonly ProjectMapNode[] = PROJECT_MAP_TREE): readonly ProjectMapNode[] {
  return nodes.flatMap((node) => [node, ...flattenProjectMap(node.children ?? [])]);
}

export function createProjectMapBundle(
  generatedAt = new Date().toISOString(),
  entries: readonly ChangelogEntry[] = CHANGELOG,
): ProjectMapBundle {
  if (Number.isNaN(Date.parse(generatedAt))) throw new Error(`Invalid project-map timestamp: ${generatedAt}`);
  // HF-406: one source. The map's current release is whatever the changelog says is
  // current, for the default list and for any list a caller hands in.
  const release = latestChangelogEntry(entries);
  return {
    schemaVersion: 1,
    current: {
      product: 'Nuke Town',
      generatedAt,
      architectureRevision: 'atomic-acres-domains-v1',
      releaseState: release.releasedAt === PENDING_PRODUCTION_RELEASE ? 'release-candidate' : 'released',
      release,
      previousRelease: entries.find((entry) => entry.id !== release.id)?.pass ?? null,
    },
    publishedChannels: {
      schemaVersion: releaseChannelsJson.schemaVersion,
      liveTarget: {
        pass: releaseChannelsJson.experimental.pass,
        label: releaseChannelsJson.experimental.label,
        path: releaseChannelsJson.experimental.path,
        state: release.releasedAt === PENDING_PRODUCTION_RELEASE ? 'release-candidate' : 'released',
      },
      failedRegressionEvidence: {
        pass: PASS64_FAILED_REGRESSION_IDENTITY.pass,
        label: PASS64_FAILED_REGRESSION_IDENTITY.publishedLabel,
        path: PASS64_FAILED_REGRESSION_IDENTITY.route,
        role: PASS64_FAILED_REGRESSION_IDENTITY.role,
        sourceSha: PASS64_FAILED_REGRESSION_IDENTITY.sourceSha,
        pagesSha: PASS64_FAILED_REGRESSION_IDENTITY.pagesSha,
        runtimeFileCount: PASS64_FAILED_REGRESSION_IDENTITY.runtimeFileCount,
        runtimeTreeSha256: PASS64_FAILED_REGRESSION_IDENTITY.runtimeTreeSha256,
      },
      stable: {
        pass: releaseChannelsJson.rollback.pass,
        label: releaseChannelsJson.rollback.label,
        path: releaseChannelsJson.rollback.path,
        sourceSha: releaseChannelsJson.rollback.sourceSha,
        pagesSha: releaseChannelsJson.rollback.pagesSha,
        role: 'stable',
      },
    },
    operatingBoundaries: PROJECT_OPERATING_BOUNDARIES,
    architecture: PROJECT_MAP_TREE,
    changes: Object.freeze([release, ...entries.filter((entry) => entry.id !== release.id)]),
    archive: entries,
  };
}

export function projectMapJson(bundle: ProjectMapBundle = createProjectMapBundle()): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

function markdownTree(nodes: readonly ProjectMapNode[], depth = 2): string[] {
  return nodes.flatMap((node) => {
    const lines = [
      `${'#'.repeat(Math.min(depth, 6))} ${node.title}`,
      '',
      node.summary,
      '',
      `Authority: ${node.authority}`,
      '',
    ];
    if (node.paths?.length) {
      lines.push('Paths:', '', ...node.paths.map((path) => `- \`${path}\``), '');
    }
    return [...lines, ...markdownTree(node.children ?? [], depth + 1)];
  });
}

export function projectMapMarkdown(bundle: ProjectMapBundle = createProjectMapBundle()): string {
  const current = bundle.current.release;
  const lines = [
    '# Nuke Town project map',
    '',
    `Generated: ${bundle.current.generatedAt}`,
    `Architecture revision: ${bundle.current.architectureRevision}`,
    `Release state: ${bundle.current.releaseState}`,
    '',
    '## Current release snapshot',
    '',
    `- ${current.pass}: ${current.title}`,
    `- Release timestamp: ${current.releasedAt}`,
    `- Areas: ${current.areas.join(', ')}`,
    `- Summary: ${current.summary}`,
    `- Live target: ${bundle.publishedChannels.liveTarget.pass} (${bundle.publishedChannels.liveTarget.label}); ${bundle.publishedChannels.liveTarget.state}`,
    `- Failed-regression evidence: ${bundle.publishedChannels.failedRegressionEvidence.pass} (${bundle.publishedChannels.failedRegressionEvidence.label}); not selectable`,
    `- Published stable channel: ${bundle.publishedChannels.stable.pass} (${bundle.publishedChannels.stable.label})`,
    '',
    'Current changes:',
    '',
    ...current.highlights.map((line) => `- ${line}`),
    '',
    '## Operating boundaries',
    '',
    ...bundle.operatingBoundaries.map((line) => `- ${line}`),
    '',
    '## Architecture tree',
    '',
    ...markdownTree(bundle.architecture, 3),
    '## Release archive',
    '',
    ...bundle.archive.flatMap((entry) => [
      `### ${entry.pass}: ${entry.title}`,
      '',
      `Released: ${entry.releasedAt}`,
      '',
      entry.summary,
      '',
      ...entry.highlights.map((line) => `- ${line}`),
      '',
    ]),
  ];
  return `${lines.join('\n').trim()}\n`;
}
