/**
 * Shared helpers for the test-swarm worker roles (step 12 of
 * `.gg/plans/platform-feature-test-swarm.md`).
 *
 * Every worker (api / browser / optimate / goal-agent) builds its
 * {@link ScenarioResult} through {@link makeResult} so the records are uniform,
 * carry evidence + env-dependency tags, and pass {@link ScenarioResultSchema}
 * validation when {@link appendResult} writes them to disk.
 *
 * The helpers here are deliberately small and pure where possible: the parsed
 * {@link Scenario} only carries metadata (FEAT-ID, surface line, side-effect
 * class), not the full markdown instruction block, so a worker extracts what it
 * can (an endpoint, a navigable path, env deps) and reports an honest
 * `blocked` result when a scenario needs inputs the metadata does not encode.
 */

import type { Scenario } from '../coordinator';
import { getSessionCookie, loginAdmin } from '../auth';
import type { ScenarioResult, ScenarioStatus, Triage } from '../result-schema';

// ── Result construction ────────────────────────────────────────────────────

/** Fields a worker supplies to build a {@link ScenarioResult}. */
export interface ResultFields {
  readonly steps: readonly string[];
  readonly expected: string;
  readonly observed: string;
  readonly status: ScenarioStatus;
  readonly triage: Triage;
  readonly notes: string;
  readonly evidence?: string;
  readonly envDeps?: readonly string[];
}

/** Build a schema-valid {@link ScenarioResult} from a scenario + worker fields. */
export function makeResult(scenario: Scenario, fields: ResultFields): ScenarioResult {
  const base: ScenarioResult = {
    featId: scenario.featId,
    scenarioId: scenario.scenarioId,
    surface: scenario.surface,
    domain: scenario.domain,
    steps: [...fields.steps],
    expected: fields.expected,
    observed: fields.observed,
    status: fields.status,
    envDeps: fields.envDeps ? [...fields.envDeps] : [],
    triage: fields.triage,
    notes: fields.notes,
  };
  return fields.evidence !== undefined ? { ...base, evidence: fields.evidence } : base;
}

// ── Admin login (login once, reuse) ─────────────────────────────────────────

type LoginState = 'unknown' | 'ok' | 'failed';
let loginState: LoginState = 'unknown';
let loginReason = '';

/**
 * Establish the shared admin session via {@link loginAdmin}, memoised across
 * workers. Returns `{ ok: false }` (rather than throwing) when the dev server
 * is unreachable or `TEST_ADMIN_PASSWORD` is unset — the caller turns that into
 * a `blocked` / DEV-CONFIG result instead of crashing the run.
 */
export async function ensureAdminLogin(): Promise<{ ok: boolean; reason: string }> {
  if (loginState === 'ok' || getSessionCookie()) return { ok: true, reason: '' };
  if (loginState === 'failed') return { ok: false, reason: loginReason };
  try {
    await loginAdmin();
    loginState = 'ok';
    return { ok: true, reason: '' };
  } catch (err) {
    loginState = 'failed';
    loginReason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: loginReason };
  }
}

/** Raw `payload-token` value (without the `name=` prefix), or null. */
export function sessionTokenValue(): string | null {
  const cookie = getSessionCookie();
  if (!cookie) return null;
  const eq = cookie.indexOf('=');
  return eq >= 0 ? cookie.slice(eq + 1) : null;
}

// ── Endpoint / path extraction ──────────────────────────────────────────────

/** An HTTP method + path parsed from a scenario's surface text. */
export interface EndpointRef {
  readonly method: string;
  readonly path: string;
}

const METHOD_PATH = /\b(GET|POST|PATCH|PUT|DELETE)\s+(\/[\w\-./[\]:?=&]+)/i;
const BARE_PATH = /(?:^|\s|`)(\/(?:api|admin)\/[\w\-./[\]:?=&]+)/;

/**
 * Extract an HTTP endpoint from a surface line. Prefers an explicit
 * `METHOD /path`; falls back to a bare `/api/...` or `/admin/...` path assumed
 * to be a GET. Returns null when no endpoint is present.
 */
export function extractEndpoint(text: string): EndpointRef | null {
  const m = METHOD_PATH.exec(text);
  if (m?.[1] && m[2]) return { method: m[1].toUpperCase(), path: cleanPath(m[2]) };
  const p = BARE_PATH.exec(text);
  if (p?.[1]) return { method: 'GET', path: cleanPath(p[1]) };
  return null;
}

/** A navigable browser path (`/admin/...` or a public route) from surface text. */
export function extractBrowserPath(text: string): string | null {
  const adminOrApi = BARE_PATH.exec(text);
  if (adminOrApi?.[1] && adminOrApi[1].startsWith('/admin')) return cleanPath(adminOrApi[1]);
  // Public routes referenced as `/audits/<slug>` etc.
  const pub = /(?:^|\s|`)(\/(?:audits|proposals|reports|mockup|client-hub|partners|negative-keyword-build|google-dashboard|discovery)\/[\w\-./[\]:]+)/.exec(
    text,
  );
  if (pub?.[1]) return cleanPath(pub[1]);
  return null;
}

/** True when a path still contains an unresolved `<id>` / `[slug]` placeholder. */
export function isTemplatedPath(path: string): boolean {
  return /[<\[]/.test(path);
}

function cleanPath(raw: string): string {
  return raw.replace(/[.,)`'"]+$/, '');
}

// ── Env-dependency inference (for dev-vs-prod triage) ───────────────────────

const ENV_DEP_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/growth.?tools|campaign-budget|search-term|performance-report|get-metrics|conversion/i, 'GROWTH_TOOLS_URL'],
  [/scrapling|screenshot|social.?link|meta.?ads/i, 'SCRAPLING_SERVICE_URL'],
  [/blob|media|upload/i, 'BLOB_READ_WRITE_TOKEN'],
  [/brevo/i, 'BREVO_API_KEY'],
  [/postmark/i, 'POSTMARK_API_KEY'],
  [/sendgrid/i, 'SENDGRID_API_KEY'],
  [/gemini|generative|blog.?image/i, 'GOOGLE_GENERATIVE_AI_API_KEY'],
  [/gsc|search.?console|indexing/i, 'GOOGLE_CLIENT_ID'],
  [/ga4|analytics/i, 'GOOGLE_CLIENT_ID'],
  [/cron/i, 'CRON_SECRET'],
  [/migrate|audit-api-key/i, 'AUDIT_API_KEY'],
];

/**
 * Infer the env keys / external services a scenario depends on from its surface
 * text. Always includes `TEST_ADMIN_PASSWORD` when `adminSession` is true.
 */
export function inferEnvDeps(text: string, adminSession = true): string[] {
  const deps = new Set<string>();
  if (adminSession) deps.add('TEST_ADMIN_PASSWORD');
  for (const [re, dep] of ENV_DEP_RULES) {
    if (re.test(text)) deps.add(dep);
  }
  return [...deps];
}

// ── Misc ────────────────────────────────────────────────────────────────────

/** Truncate text for inclusion in an evidence field. */
export function snippet(text: string, max = 600): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Pull up to 20 number-like tokens (counts, $spend, %rates) from a string. */
export function extractNumbers(text: string): string[] {
  const matches = text.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  return matches.slice(0, 20);
}

/** Map an HTTP status to a triage bucket for a failed read. */
export function triageForStatus(status: number): Triage {
  if (status === 401 || status === 403) return 'DEV-CONFIG';
  if (status >= 500) return 'UNKNOWN';
  return 'PROD-BUG';
}
