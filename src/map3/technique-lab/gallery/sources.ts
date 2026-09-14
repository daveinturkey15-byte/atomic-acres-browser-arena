/**
 * src/map3/technique-lab/gallery/sources.ts — pure helpers for the SKILLS LAB
 * "URL provided" tab and the blocked-row explanations. No DOM, no fetch: the
 * host feeds records in and renders what comes out, so every rule here is
 * unit-testable on the CPU.
 *
 * Honesty rules:
 * - A URL is classified by its host only; classification never implies the
 *   page was fetched or read.
 * - Embeds are allowed only for a short allowlist of public players/images.
 *   Everything else gets the original link as the fallback.
 * - Skill mappings come from the sources lane's `source-catalog.json` when it
 *   is present. Without it, a row says so ("ingestion needed"), never "mapped".
 * - Blocker plans from the catalog win. The host default plans below are
 *   labelled as host-authored proposals, not as lane research.
 */

export type UrlKind =
  | 'x-post'
  | 'x-profile'
  | 'github'
  | 'huggingface'
  | 'itch'
  | 'youtube'
  | 'image'
  | 'docs'
  | 'site'
  | 'non-http';

export interface ClassifiedUrl {
  url: string;
  kind: UrlKind;
  /** Short host label for the table ("x.com", "github.com", …). */
  host: string;
  /** Embeddable iframe/img source, or null when only the link is safe. */
  embed: { type: 'iframe' | 'img'; src: string } | null;
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i;

export function classifyUrl(raw: string): ClassifiedUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { url: raw, kind: 'non-http', host: '', embed: null };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { url: raw, kind: 'non-http', host: '', embed: null };
  }
  const host = url.hostname.replace(/^www\./, '');
  let kind: UrlKind = 'site';
  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('fxtwitter.com')) {
    kind = /\/status\/\d+/.test(url.pathname) ? 'x-post' : 'x-profile';
  } else if (host === 'github.com' || host === 'raw.githubusercontent.com' || host.endsWith('.github.io')) {
    kind = 'github';
  } else if (host === 'huggingface.co') kind = 'huggingface';
  else if (host.endsWith('itch.io')) kind = 'itch';
  else if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') kind = 'youtube';
  else if (IMAGE_RE.test(url.pathname)) kind = 'image';
  else if (/docs\.|\/docs\b|blog\./.test(host + url.pathname)) kind = 'docs';
  return { url: raw, kind, host, embed: embedFor(url, kind) };
}

/** Safe embed source for a small allowlist; null means "link only". */
export function embedFor(url: URL, kind: UrlKind): ClassifiedUrl['embed'] {
  if (kind === 'youtube') {
    const id =
      url.hostname === 'youtu.be'
        ? url.pathname.slice(1)
        : url.pathname.startsWith('/embed/')
          ? url.pathname.slice('/embed/'.length)
          : url.searchParams.get('v') ?? '';
    if (/^[\w-]{6,20}$/.test(id)) {
      return { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}` };
    }
    return null;
  }
  if (kind === 'image' && url.protocol === 'https:') {
    return { type: 'img', src: url.href };
  }
  return null;
}

/** Catalog-supplied embed URLs are accepted only from known public players. */
export function acceptCatalogEmbed(embedUrl: unknown): string | null {
  if (typeof embedUrl !== 'string') return null;
  try {
    const url = new URL(embedUrl);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtube-nocookie.com' || host === 'youtube.com' || host === 'player.vimeo.com') {
      return url.href;
    }
  } catch {
    // fall through
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Source catalog (public/assets/skills-lab/source-catalog.json)        */
/* ------------------------------------------------------------------ */

export interface SkillMapping {
  skill: string;
  sourceReference: string;
  relation: string;
}

export interface BlockerPlan {
  reason: string;
  unblockAction: string;
  experiment: string;
  test: string;
  resources: string;
  /** Where the plan came from; rendered so nobody mistakes a proposal for research. */
  origin: 'sources-lane catalog' | 'host default plan' | 'none';
}

export interface CatalogSource {
  sourceId: number;
  title: string | null;
  urls: Array<{ url: string; kind: string | null; label: string | null; embedUrl: string | null }>;
  skillMappings: SkillMapping[];
  status: string | null;
  method: string | null;
  adaptation: string | null;
  blocker: Omit<BlockerPlan, 'origin'> | null;
  evidence: Array<{ url: string; pin: string | null; inspectedAt: string | null; observation: string | null }>;
  demo: { revision: string | null; status: string | null } | null;
  limitations: string[];
}

export interface SourceCatalog {
  updatedAt: string | null;
  sources: Map<number, CatalogSource>;
  /** Rows dropped with the reason, so the UI can say what was ignored. */
  ignored: string[];
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
}

/** Tolerant parse: unknown fields are ignored, malformed rows are reported, nothing is invented. */
export function parseSourceCatalog(data: unknown): SourceCatalog {
  const out: SourceCatalog = { updatedAt: null, sources: new Map(), ignored: [] };
  if (typeof data !== 'object' || data === null) {
    out.ignored.push('source catalog is not an object; ignored');
    return out;
  }
  const root = data as Record<string, unknown>;
  out.updatedAt = str(root.updatedAt);
  if (!Array.isArray(root.sources)) {
    out.ignored.push('source catalog has no sources[] array; ignored');
    return out;
  }
  root.sources.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null) {
      out.ignored.push(`sources[${index}] is not an object`);
      return;
    }
    const r = raw as Record<string, unknown>;
    const id = r.sourceId;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > 50) {
      out.ignored.push(`sources[${index}] has no valid sourceId (1–50)`);
      return;
    }
    if (out.sources.has(id)) {
      out.ignored.push(`sources[${index}] duplicates sourceId ${id}; first kept`);
      return;
    }
    const urls = Array.isArray(r.urls)
      ? r.urls.flatMap((u) => {
          if (typeof u === 'string') return [{ url: u, kind: null, label: null, embedUrl: null }];
          if (typeof u !== 'object' || u === null) return [];
          const o = u as Record<string, unknown>;
          const url = str(o.url);
          return url ? [{ url, kind: str(o.kind), label: str(o.label), embedUrl: acceptCatalogEmbed(o.embedUrl) }] : [];
        })
      : [];
    const skillMappings = Array.isArray(r.skillMappings)
      ? r.skillMappings.flatMap((m) => {
          if (typeof m !== 'object' || m === null) return [];
          const o = m as Record<string, unknown>;
          const skill = str(o.skill);
          return skill
            ? [{ skill, sourceReference: str(o.sourceReference) ?? '', relation: str(o.relation) ?? 'unspecified' }]
            : [];
        })
      : [];
    const b = typeof r.blocker === 'object' && r.blocker !== null ? (r.blocker as Record<string, unknown>) : null;
    const blocker = b
      ? {
          reason: str(b.reason) ?? 'reason not recorded',
          unblockAction: str(b.unblockAction) ?? 'unblock action not recorded',
          experiment: str(b.experiment) ?? 'experiment not recorded',
          test: str(b.test) ?? 'pass/fail test not recorded',
          resources: str(b.resources) ?? 'resources not recorded',
        }
      : null;
    const evidence = Array.isArray(r.evidence)
      ? r.evidence.flatMap((e) => {
          if (typeof e !== 'object' || e === null) return [];
          const o = e as Record<string, unknown>;
          const url = str(o.url);
          return url ? [{ url, pin: str(o.pin), inspectedAt: str(o.inspectedAt), observation: str(o.observation) }] : [];
        })
      : [];
    const d = typeof r.demo === 'object' && r.demo !== null ? (r.demo as Record<string, unknown>) : null;
    out.sources.set(id, {
      sourceId: id,
      title: str(r.title),
      urls,
      skillMappings,
      status: str(r.status),
      method: str(r.method),
      adaptation: str(r.adaptation),
      blocker,
      evidence,
      demo: d ? { revision: str(d.revision), status: str(d.status) } : null,
      limitations: strList(r.limitations),
    });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Mapping state and blocker plans                                      */
/* ------------------------------------------------------------------ */

export type MappingState =
  | { label: 'mapped to skill'; detail: string }
  | { label: 'ingestion needed'; detail: string }
  | { label: 'experiment needed'; detail: string }
  | { label: 'blocked'; detail: string };

/**
 * What the URL tab says about a row. `hasDemo`/`blocked` come from the demo
 * manifest; `catalog` is the sources-lane row when loaded.
 */
export function mappingState(
  catalog: CatalogSource | undefined,
  hasDemo: boolean,
  blocked: boolean,
): MappingState {
  if (catalog && catalog.skillMappings.length > 0) {
    const names = [...new Set(catalog.skillMappings.map((m) => m.skill))];
    return { label: 'mapped to skill', detail: `${names.join(', ')} (${catalog.skillMappings.length} mapping(s), from sources lane)` };
  }
  if (blocked) {
    return { label: 'blocked', detail: 'no honest demo; see the blocked-row plan on the Skills tab' };
  }
  if (hasDemo) {
    return { label: 'experiment needed', detail: 'a demo exists but no skill mapping is recorded; extract a skill or record why not' };
  }
  return { label: 'ingestion needed', detail: catalog ? 'catalog row present, no skill mapping yet' : 'no sources-lane catalog row loaded; source not yet ingested' };
}

/**
 * Host default plans for the seven register rows known to be blocked at
 * 6e9b2caf (15, 22, 24, 25, 30, 32, 44). Each is a proposal the root can
 * accept, edit or reject; the "why" is always taken from the demo limitation
 * text, which is lane research, not from here.
 */
const HOST_DEFAULT_PLANS: Record<number, Omit<BlockerPlan, 'origin' | 'reason'>> = {
  15: {
    unblockAction: 'Treat as out of scope for the browser: record threepp as a native comparator only, or port ONE effect (its TSL scene description) into the WebGPU stage.',
    experiment: 'Author a WebGPU-only scene from the repository README scene description without any native runtime.',
    test: 'Demo mounts on WebGPURenderer with zero console errors and a 1600x1000 capture matching the README still within a stated tolerance.',
    resources: 'Read-only GitHub access to SamG-Coder/threepp; no native build.',
  },
  22: {
    unblockAction: 'Pick one comparator (revo-realms is open Three.js) and extract one named technique (e.g. its grass or water pass) instead of treating the batch as one row.',
    experiment: 'Inspect the comparator repository, name the technique, implement it as a paired control/technique demo.',
    test: 'Manifest gains a method string and a factory for the extracted technique; host badge moves from blocked to loaded.',
    resources: 'Public repository read; owner decision on which comparator counts.',
  },
  24: {
    unblockAction: 'Search for the TAKEN/VOIDMODE source or dev-log again; if still unlocated, close the row as "quality bar only" with the play link kept.',
    experiment: 'Two bounded searches (GitHub, itch.io dev logs) recorded with dates; no scraping of the game bundle.',
    test: 'Either a repository URL lands in the manifest sources or the row is relabelled "quality bar, no technique" with the search receipts.',
    resources: 'Read-only web; ~20 minutes.',
  },
  25: {
    unblockAction: 'Read the post in a real browser (X client shell blocks plain fetch), record the described shoreline blend, then implement from our own webgpu-water baseline.',
    experiment: 'Depth-based shoreline foam/blend over the existing water demo; compare to the post still.',
    test: 'Side-by-side control/technique demo mounts; shoreline blend visible in a capture at 1280x720.',
    resources: 'Owner-approved browser read of one X post; no downloads.',
  },
  30: {
    unblockAction: 'Run the first step (reference video) on a granted GPU slot, or substitute an existing CC0 mocap clip so the retarget step can be shown without video generation.',
    experiment: 'Retarget one CC0 clip onto the canonical operator rig and show the rig data only.',
    test: 'Animation plays on the shipped rig in the stage; no video asset is shipped.',
    resources: 'Serialized GPU slot or a CC0 clip; Blender CPU export is allowed.',
  },
  32: {
    unblockAction: 'Do not ship weights. Record the ComfyUI workflow as documentation and route any generation to a GPU slot outside this lane.',
    experiment: 'None in-browser; the row is a pipeline reference, not a scene.',
    test: 'Row relabelled as "pipeline reference" with the licence and workflow link; no fake demo.',
    resources: 'Owner GPU time if a generation is ever wanted.',
  },
  44: {
    unblockAction: 'Close as "no technique" unless the owner names a specific artefact behind either post.',
    experiment: 'None; two posts contain no implementable method.',
    test: 'Row stays blocked with this explanation; any future demo must cite a repository.',
    resources: 'Owner decision only.',
  },
};

export function blockerPlan(
  sourceId: number,
  limitation: string | undefined,
  catalog: CatalogSource | undefined,
): BlockerPlan {
  if (catalog?.blocker) return { ...catalog.blocker, origin: 'sources-lane catalog' };
  const reason = limitation ?? 'Limitation text not recorded by the demo group.';
  const plan = HOST_DEFAULT_PLANS[sourceId];
  if (plan) return { reason, ...plan, origin: 'host default plan' };
  return {
    reason,
    unblockAction: 'Not planned yet: the sources lane must record an unblock action for this row.',
    experiment: 'not recorded',
    test: 'not recorded',
    resources: 'not recorded',
    origin: 'none',
  };
}

/** Route from a blocked/loaded row to the showcase, stated once so every row says the same thing. */
export function routeToShowcase(sourceId: number): string {
  return `Route: demo factory under demos/group-*/index.ts for sourceId ${sourceId} → host badge "loaded" → root GPU capture → owner visual acceptance (OPEN until then).`;
}
