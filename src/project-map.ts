import {
  CHANGELOG,
  PENDING_PRODUCTION_RELEASE,
  latestChangelogEntry,
  type ChangelogEntry,
} from './changelog';
import releaseChannelsJson from '../release-channels.json';

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
    architectureRevision: 'pass63-project-map-v1';
    candidateState: 'hitl-candidate' | 'released';
    release: ChangelogEntry;
    previousRelease: string | null;
  }>;
  publishedChannels: Readonly<{
    schemaVersion: number;
    live: Readonly<{ pass: string; label: string; path: string }>;
    stable: Readonly<{ pass: string; label: string; path: string; sourceSha: string; pagesSha: string }>;
  }>;
  operatingBoundaries: readonly string[];
  architecture: readonly ProjectMapNode[];
  changes: readonly ChangelogEntry[];
  archive: readonly ChangelogEntry[];
}>;

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
    summary: 'The season-aware global leaderboard Worker and browser-local fallback policy.',
    authority: 'Leaderboard availability never blocks local play or private matches.',
    status: 'active',
    children: Object.freeze([
      Object.freeze({
        id: 'leaderboard-service',
        title: 'Leaderboard Worker',
        summary: 'Cloudflare Worker/D1 submission and retrieval with shared validation policy.',
        authority: 'Authoritative only for the optional global board; local cache remains a fallback.',
        status: 'active',
        paths: Object.freeze([
          'src/global-leaderboard.ts',
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
  const release = latestChangelogEntry(entries);
  return {
    schemaVersion: 1,
    current: {
      product: 'Nuke Town',
      generatedAt,
      architectureRevision: 'pass63-project-map-v1',
      candidateState: release.releasedAt === PENDING_PRODUCTION_RELEASE ? 'hitl-candidate' : 'released',
      release,
      previousRelease: entries[1]?.pass ?? null,
    },
    publishedChannels: {
      schemaVersion: releaseChannelsJson.schemaVersion,
      live: {
        pass: releaseChannelsJson.experimental.pass,
        label: releaseChannelsJson.experimental.label,
        path: releaseChannelsJson.experimental.path,
      },
      stable: {
        pass: releaseChannelsJson.stable.pass,
        label: releaseChannelsJson.stable.label,
        path: releaseChannelsJson.stable.path,
        sourceSha: releaseChannelsJson.stable.sourceSha,
        pagesSha: releaseChannelsJson.stable.pagesSha,
      },
    },
    operatingBoundaries: PROJECT_OPERATING_BOUNDARIES,
    architecture: PROJECT_MAP_TREE,
    changes: entries,
    archive: entries.slice(1),
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
    `Candidate state: ${bundle.current.candidateState}`,
    '',
    '## Current release snapshot',
    '',
    `- ${current.pass}: ${current.title}`,
    `- Release timestamp: ${current.releasedAt}`,
    `- Areas: ${current.areas.join(', ')}`,
    `- Summary: ${current.summary}`,
    `- Published live channel: ${bundle.publishedChannels.live.pass} (${bundle.publishedChannels.live.label})`,
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
