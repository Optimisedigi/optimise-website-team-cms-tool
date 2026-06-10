/**
 * Test-swarm coordinator (Phase 4 / step 11 of
 * `.gg/plans/platform-feature-test-swarm.md`).
 *
 * Responsibilities:
 *   1. Load the per-domain scenario files from `docs/test-scenarios/`.
 *   2. Parse out each scenario's FEAT-ID, id, surface, domain and
 *      side-effect class (READ / CMS-WRITE / EXTERNAL-SAFE / DANGER).
 *   3. Group scenarios by domain + side-effect class and dispatch each batch
 *      to the worker role that owns that surface (api / browser / optimate /
 *      goal-agent / validation). Worker roles are registered via
 *      {@link WorkerRegistry}; the worker implementations are step 12 — until
 *      they are registered the coordinator records an honest `blocked` result
 *      so a run is still end-to-end runnable today.
 *   4. Collect every {@link ScenarioResult} and append it via
 *      {@link appendResult} to `docs/test-runs/<date>/results.jsonl`.
 *   5. Log every created/modified row to
 *      `docs/test-runs/<date>/teardown-manifest.jsonl`.
 *
 * CENTRAL SAFETY ENFORCEMENT — the binding contract from
 * `docs/test-runs/README.md` (Safety Interlock). Every live external write
 * (Brevo/Postmark/SendGrid email, Google Sheets, calendar, Google Ads push,
 * Xero) is **blocked by default at the harness level** — not left to scenario
 * authors. The ONLY permitted live write is the single green-tier negative
 * push on campaign `search_cro-audit-tool_au` / account `659-101-3898`, and
 * only when `--allow-live-push` is passed. This is enforced two ways:
 *   - Dispatch-level: DANGER scenarios are coerced to `skipped-danger` and
 *     never handed to a worker, except the one allow-listed push under the flag.
 *   - Request-level: {@link installFetchGuard} wraps the in-process `fetch` so
 *     any worker attempting a live external write is rejected before the
 *     network — a scenario that *tries* to send is still stopped.
 *
 * Run (default — fully safe):
 *   npx tsx --env-file=.env --env-file=.env.local \
 *     scripts/test-harness/coordinator.ts --date 2026-06-04
 *
 * Run (DANGER opt-in — enables ONLY the one allow-listed push):
 *   npx tsx --env-file=.env --env-file=.env.local \
 *     scripts/test-harness/coordinator.ts --date 2026-06-04 --allow-live-push
 */

import { appendFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  appendResult,
  makeRunDir,
  type ScenarioResult,
} from './result-schema';

// ── Safety Interlock constants (docs/test-runs/README.md §2 + Safety Interlock)
//
/** Whitelisted Google Ads account — `659-101-3898`, digits-only normalised. */
const ALLOWLISTED_ACCOUNT = '6591013898';
/** The single campaign a live green-tier negative push may target. */
const ALLOWLISTED_CAMPAIGN = 'search_cro-audit-tool_au';

// ── Domain map: scenario filename → (domain, FEAT-ID prefix). Mirrors
//    docs/test-scenarios/README.md.
const DOMAIN_BY_FILE: Readonly<Record<string, string>> = {
  'clients-proposals.md': 'clients-proposals',
  'audits.md': 'audits',
  'google-ads-audits.md': 'google-ads-audits',
  'optimate.md': 'optimate',
  'gsc-serp-ai.md': 'gsc-serp-ai',
  'negative-keywords.md': 'negative-keywords',
  'finance.md': 'finance',
  'processes.md': 'processes',
  'content.md': 'content',
  'client-portals.md': 'client-portals',
  'decks.md': 'decks',
  'platform-infra.md': 'platform-infra',
  'goal-agents.md': 'goal-agents',
};

// ── Types ────────────────────────────────────────────────────────────────

/** Side-effect class as classified in the feature catalog / scenarios. */
export type SideEffectClass = 'READ' | 'CMS-WRITE' | 'EXTERNAL-SAFE' | 'DANGER';

const SIDE_EFFECT_CLASSES: readonly SideEffectClass[] = [
  'READ',
  'CMS-WRITE',
  'EXTERNAL-SAFE',
  'DANGER',
] as const;

/** Worker role that owns a surface. Implementations land in step 12. */
export type WorkerRoleName =
  | 'api'
  | 'browser'
  | 'optimate'
  | 'goal-agent'
  | 'validation';

/** One parsed scenario, ready to dispatch. */
export interface Scenario {
  /** Feature identifier (e.g. `CLI-001`). */
  readonly featId: string;
  /** Scenario identifier (e.g. `CLI-001-happy`). */
  readonly scenarioId: string;
  /** Domain area (from the source file). */
  readonly domain: string;
  /** Free-text surface line (entry point / surface heading text). */
  readonly surface: string;
  /** Resolved side-effect class. */
  readonly sideEffect: SideEffectClass;
  /** Worker role inferred to own this scenario. */
  readonly role: WorkerRoleName;
  /** True only for the gated, allow-listed live green-tier push. */
  readonly isAllowlistedLivePush: boolean;
  /** Source scenario file (relative to scenarios dir). */
  readonly file: string;
}

/** A batch of scenarios sharing a domain + side-effect class + role. */
export interface ScenarioBatch {
  readonly domain: string;
  readonly sideEffect: SideEffectClass;
  readonly role: WorkerRoleName;
  readonly scenarios: readonly Scenario[];
}

/** A row written to the teardown manifest so a run can be reversed. */
export interface TeardownEntry {
  /** CMS collection the row belongs to. */
  readonly collection: string;
  /** Record id (string form). */
  readonly id: string;
  /** Operation performed. */
  readonly op: 'create' | 'update' | 'delete';
  /** ISO timestamp. */
  readonly at: string;
  /** Optional context (scenario id, fields touched). */
  readonly note?: string;
}

/** Context handed to every worker executor. */
export interface WorkerContext {
  /** Absolute/relative run directory (`docs/test-runs/<date>`). */
  readonly runDir: string;
  /** Central safety interlock — workers MUST route live writes through it. */
  readonly interlock: SafetyInterlock;
  /** True only when `--allow-live-push` was passed. */
  readonly allowLivePush: boolean;
  /** Record a created/modified row to the teardown manifest. */
  readonly recordTeardown: (entry: TeardownEntry) => void;
}

/** A worker executes one scenario and returns its result record. */
export type WorkerExecutor = (
  scenario: Scenario,
  ctx: WorkerContext,
) => Promise<ScenarioResult>;

// ── Safety Interlock ─────────────────────────────────────────────────────

/** Category of a candidate live external write. */
export type LiveWriteKind =
  | 'email'
  | 'sheets'
  | 'calendar'
  | 'google-ads-push'
  | 'xero';

/** A candidate outbound external write the interlock must rule on. */
export interface LiveWrite {
  readonly kind: LiveWriteKind;
  /** Google Ads account id (digits-only) when known. */
  readonly account?: string;
  /** Google Ads campaign name when known. */
  readonly campaign?: string;
  /** Human context for logging. */
  readonly detail?: string;
}

/** Verdict from the interlock for a candidate write. */
export interface InterlockVerdict {
  readonly allowed: boolean;
  readonly reason: string;
}

/** Thrown when a blocked live external write is attempted in-process. */
export class BlockedExternalWriteError extends Error {
  constructor(reason: string) {
    super(`Safety Interlock blocked a live external write: ${reason}`);
    this.name = 'BlockedExternalWriteError';
  }
}

/**
 * Central, fail-closed enforcement of the Safety Interlock. Default = blocked.
 * The ONLY allowed live write is the green-tier negative push on
 * `search_cro-audit-tool_au` / `659-101-3898`, and only when constructed with
 * `allowLivePush = true`.
 */
export class SafetyInterlock {
  constructor(private readonly allowLivePush: boolean) {}

  /** Whether the gated live-push opt-in is active for this run. */
  get livePushEnabled(): boolean {
    return this.allowLivePush;
  }

  /**
   * Rule on a candidate live external write. Fails closed: anything that is
   * not the single allow-listed green-tier push is blocked.
   */
  evaluate(write: LiveWrite): InterlockVerdict {
    if (write.kind !== 'google-ads-push') {
      return {
        allowed: false,
        reason: `${write.kind} writes are blocked by default at the harness level`,
      };
    }

    const account = normaliseAccountId(write.account ?? '');
    const campaign = write.campaign ?? '';
    const targetsAllowlist =
      account === ALLOWLISTED_ACCOUNT && campaign === ALLOWLISTED_CAMPAIGN;

    if (!targetsAllowlist) {
      return {
        allowed: false,
        reason: `Google Ads push to ${account || '?'} / ${campaign || '?'} is not the allow-listed target (${ALLOWLISTED_ACCOUNT} / ${ALLOWLISTED_CAMPAIGN})`,
      };
    }

    if (!this.allowLivePush) {
      return {
        allowed: false,
        reason:
          'allow-listed green-tier push requires the explicit --allow-live-push opt-in',
      };
    }

    return {
      allowed: true,
      reason: `permitted: single green-tier push on ${ALLOWLISTED_CAMPAIGN} / ${ALLOWLISTED_ACCOUNT}`,
    };
  }

  /**
   * Assert a candidate write is permitted; throw {@link BlockedExternalWriteError}
   * otherwise. Workers call this before performing any external write.
   */
  assert(write: LiveWrite): void {
    const verdict = this.evaluate(write);
    if (!verdict.allowed) throw new BlockedExternalWriteError(verdict.reason);
  }

  /**
   * Inspect an outbound HTTP request and classify it as a live external write
   * if its URL/method match a known external-write surface. Returns `null` for
   * requests that are not external writes (reads, CMS DB writes via the dev
   * server, preview/dry-run endpoints).
   */
  classifyRequest(
    url: string,
    method: string,
    body?: string,
  ): LiveWrite | null {
    const verb = method.toUpperCase();
    if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return null;

    const path = safePathname(url).toLowerCase();
    const haystack = `${path} ${(body ?? '').toLowerCase()}`;

    // Preview / dry-run / staging endpoints never go live.
    if (/(preview|dry-run|dry_run|email-preview|propose)/.test(path)) {
      return null;
    }

    // Email transports.
    if (
      /(send-email|approve-send|\/send\b|sendmail|brevo|postmark|sendgrid)/.test(
        path,
      )
    ) {
      return { kind: 'email', detail: path };
    }

    // Google Sheets writes.
    if (/sheets/.test(path)) return { kind: 'sheets', detail: path };

    // Calendar event creation.
    if (/calendar/.test(path)) return { kind: 'calendar', detail: path };

    // Xero send/approve.
    if (/xero/.test(path) && /(send|approve)/.test(haystack)) {
      return { kind: 'xero', detail: path };
    }

    // Google Ads pushes (negative push-live, budget push, campaign build,
    // ad-copy deploy, negative-sweep apply).
    if (
      /(push-live|nkl-push-live|negative-sweep\/apply|push\b|\/apply\b|campaign-build|deploy)/.test(
        path,
      ) &&
      /(google-ads|negative|budget|campaign|ad-copy|nkl)/.test(haystack)
    ) {
      return {
        kind: 'google-ads-push',
        account: extractAccount(haystack),
        campaign: extractCampaign(haystack),
        detail: path,
      };
    }

    return null;
  }
}

/** Normalise a Google Ads customer id to digits only (`659-101-3898` → `6591013898`). */
function normaliseAccountId(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Best-effort pathname extraction that tolerates relative paths. */
function safePathname(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url;
  }
}

/** Pull a Google Ads account id from a URL/body haystack, if present. */
function extractAccount(haystack: string): string | undefined {
  const dashed = /\b(\d{3}-\d{3}-\d{4})\b/.exec(haystack);
  if (dashed?.[1]) return normaliseAccountId(dashed[1]);
  const digits = /\b(\d{10})\b/.exec(haystack);
  return digits?.[1];
}

/** Pull the allow-listed campaign name from a haystack, if present. */
function extractCampaign(haystack: string): string | undefined {
  return haystack.includes(ALLOWLISTED_CAMPAIGN)
    ? ALLOWLISTED_CAMPAIGN
    : undefined;
}

/**
 * Wrap the in-process `globalThis.fetch` so every outbound request is screened
 * by the interlock before it reaches the network. Returns a restore function.
 * This is the request-level half of the harness-level enforcement: a worker
 * that *attempts* a blocked live write is stopped even if a scenario tries it.
 */
export function installFetchGuard(interlock: SafetyInterlock): () => void {
  const original = globalThis.fetch;

  const guarded: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method =
      init?.method ??
      (typeof input === 'object' && 'method' in input
        ? (input as Request).method
        : 'GET');
    const body =
      typeof init?.body === 'string' ? init.body : undefined;

    const write = interlock.classifyRequest(url, method, body);
    if (write) interlock.assert(write); // throws if blocked

    return original(input, init);
  };

  globalThis.fetch = guarded;
  return () => {
    globalThis.fetch = original;
  };
}

// ── Worker registry ──────────────────────────────────────────────────────

/** Holds the executor for each worker role (registered in step 12). */
export class WorkerRegistry {
  private readonly executors = new Map<WorkerRoleName, WorkerExecutor>();

  register(role: WorkerRoleName, executor: WorkerExecutor): void {
    this.executors.set(role, executor);
  }

  get(role: WorkerRoleName): WorkerExecutor | undefined {
    return this.executors.get(role);
  }
}

// ── Scenario loading + parsing ───────────────────────────────────────────

/**
 * Load and parse every scenario file under `dir` (default
 * `docs/test-scenarios`). README.md and any non-domain files are skipped.
 */
export function loadScenarios(
  dir: string = join('docs', 'test-scenarios'),
): Scenario[] {
  const files = readdirSync(dir).filter((f) => f in DOMAIN_BY_FILE);
  const scenarios: Scenario[] = [];
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    scenarios.push(...parseScenarioFile(text, file));
  }
  return scenarios;
}

const FEATURE_HEADING = /^##\s+([A-Z]+-[\w.]+)\s+—\s+(.+)$/;
const SCENARIO_HEADING = /^###\s+([A-Z]+-[\w.]+-[\w]+)\s+—\s+(.+)$/;

/**
 * Parse one scenario markdown file into {@link Scenario} records.
 *
 * The side-effect class is read from the trailing `· CLASS` token on a feature
 * (`## FEAT — title · CMS-WRITE`) or scenario (`### FEAT-happy — … · DANGER`)
 * heading; a scenario-level class overrides its feature's. A scenario inherits
 * the most recent feature heading's class when it has none of its own.
 */
export function parseScenarioFile(text: string, file: string): Scenario[] {
  const domain = DOMAIN_BY_FILE[file] ?? file.replace(/\.md$/, '');
  const lines = text.split('\n');
  const out: Scenario[] = [];

  let featureClass: SideEffectClass = 'READ';
  let pendingSurface = '';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    const feat = FEATURE_HEADING.exec(line);
    if (feat) {
      featureClass = sideEffectFromHeading(feat[2]) ?? 'READ';
      pendingSurface = '';
      continue;
    }

    const scen = SCENARIO_HEADING.exec(line);
    if (scen) {
      const scenarioId = scen[1] ?? '';
      const headingText = scen[2] ?? '';
      const featId = featIdOf(scenarioId);
      const sideEffect = sideEffectFromHeading(headingText) ?? featureClass;
      const surface = surfaceForScenario(lines, i, headingText);
      const isAllowlistedLivePush = detectAllowlistedLivePush(
        scenarioId,
        lines,
        i,
      );
      out.push({
        featId,
        scenarioId,
        domain,
        surface,
        sideEffect,
        role: inferRole(featId, surface),
        isAllowlistedLivePush,
        file,
      });
      pendingSurface = '';
    }
  }

  return out;
}

/** Read a trailing `· CLASS` (possibly bold) from a heading's text. */
function sideEffectFromHeading(headingText: string): SideEffectClass | null {
  const cls = /·\s*\*{0,2}(READ|CMS-WRITE|EXTERNAL-SAFE|DANGER)/.exec(
    headingText,
  );
  const found = cls?.[1];
  return found && (SIDE_EFFECT_CLASSES as readonly string[]).includes(found)
    ? (found as SideEffectClass)
    : null;
}

/** Derive the FEAT-ID from a scenario id (`CLI-001-happy` → `CLI-001`). */
function featIdOf(scenarioId: string): string {
  const m = /^([A-Z]+-[\w.]+?)-(?:happy|edge|[a-z]+)$/.exec(scenarioId);
  if (m?.[1]) return m[1];
  // Fallback: drop the final `-suffix`.
  const idx = scenarioId.lastIndexOf('-');
  return idx > 0 ? scenarioId.slice(0, idx) : scenarioId;
}

/**
 * Resolve the surface text for a scenario: prefer an explicit `Surface:` /
 * `Entry point:` bullet in the following lines, else fall back to the heading.
 */
function surfaceForScenario(
  lines: readonly string[],
  headingIndex: number,
  headingText: string,
): string {
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^#{2,3}\s/.test(line)) break; // next heading — stop
    const m = /^\s*-\s*\*\*(Surface|Entry point):\*\*\s*(.+)$/.exec(line);
    if (m?.[2]) return m[2].trim();
  }
  return headingText.trim();
}

/**
 * Detect the single allow-listed live green-tier push. Both conditions must
 * hold: the scenario references the `--allow-live-push` flag and names the
 * allow-listed campaign in its block.
 */
function detectAllowlistedLivePush(
  scenarioId: string,
  lines: readonly string[],
  headingIndex: number,
): boolean {
  let block = scenarioId;
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^#{2,3}\s/.test(line)) break;
    block += `\n${line}`;
  }
  return (
    block.includes('--allow-live-push') && block.includes(ALLOWLISTED_CAMPAIGN)
  );
}

/** Infer which worker role owns a scenario from its FEAT-ID + surface text. */
function inferRole(featId: string, surface: string): WorkerRoleName {
  if (featId.startsWith('OPT')) return 'optimate';
  if (featId.startsWith('GOAL')) return 'goal-agent';
  const s = surface.toLowerCase();
  if (/validat|ground.?truth/.test(s)) return 'validation';
  if (/\/admin\/|browser|screenshot|component|deck|page\b/.test(s)) {
    return 'browser';
  }
  return 'api';
}

// ── Grouping ─────────────────────────────────────────────────────────────

/**
 * Group scenarios by domain + side-effect class + role into ordered batches.
 * Batches are ordered by safety (READ → EXTERNAL-SAFE → CMS-WRITE → DANGER) so
 * the swarm runs least-risky work first.
 */
export function groupIntoBatches(scenarios: readonly Scenario[]): ScenarioBatch[] {
  const order: Record<SideEffectClass, number> = {
    READ: 0,
    'EXTERNAL-SAFE': 1,
    'CMS-WRITE': 2,
    DANGER: 3,
  };
  const map = new Map<string, Scenario[]>();
  for (const s of scenarios) {
    const key = `${s.domain}\u0000${s.sideEffect}\u0000${s.role}`;
    const bucket = map.get(key);
    if (bucket) bucket.push(s);
    else map.set(key, [s]);
  }

  const batches: ScenarioBatch[] = [];
  for (const [key, group] of map) {
    const [domain, sideEffect, role] = key.split('\u0000') as [
      string,
      SideEffectClass,
      WorkerRoleName,
    ];
    batches.push({ domain, sideEffect, role, scenarios: group });
  }

  return batches.sort(
    (a, b) =>
      order[a.sideEffect] - order[b.sideEffect] ||
      a.domain.localeCompare(b.domain) ||
      a.role.localeCompare(b.role),
  );
}

// ── Teardown manifest ────────────────────────────────────────────────────

/** Append a created/modified row to `<runDir>/teardown-manifest.jsonl`. */
export function appendTeardown(runDir: string, entry: TeardownEntry): void {
  mkdirSync(runDir, { recursive: true });
  appendFileSync(
    join(runDir, 'teardown-manifest.jsonl'),
    `${JSON.stringify(entry)}\n`,
    'utf8',
  );
}

// ── Dispatch ─────────────────────────────────────────────────────────────

/**
 * Build the coordinator-generated result for a DANGER scenario that the
 * interlock refuses to run live. Centrally enforces "DANGER never applied"
 * before any worker is involved.
 */
function dangerSkipResult(scenario: Scenario, reason: string): ScenarioResult {
  return {
    featId: scenario.featId,
    scenarioId: scenario.scenarioId,
    surface: scenario.surface,
    domain: scenario.domain,
    steps: [`Coordinator screened DANGER scenario: ${reason}`],
    expected: 'Live external write blocked at the harness level (never applied).',
    observed: `Skipped before dispatch — ${reason}`,
    status: 'skipped-danger',
    envDeps: [],
    triage: null,
    notes:
      'Central Safety Interlock enforcement: DANGER scenarios are not dispatched to workers.',
  };
}

/** Result for a scenario whose worker role has no executor registered yet. */
function noWorkerResult(scenario: Scenario): ScenarioResult {
  return {
    featId: scenario.featId,
    scenarioId: scenario.scenarioId,
    surface: scenario.surface,
    domain: scenario.domain,
    steps: [`No executor registered for worker role "${scenario.role}".`],
    expected: 'Scenario executed by its worker role.',
    observed: `Blocked — worker role "${scenario.role}" not registered (step 12 deliverable).`,
    status: 'blocked',
    envDeps: [],
    triage: null,
    notes:
      'Coordinator is runnable end-to-end; register worker executors via WorkerRegistry to execute.',
  };
}

/**
 * Dispatch a single scenario through central safety enforcement, then (if
 * permitted) to its worker role. Returns the result record without writing it.
 */
export async function dispatchScenario(
  scenario: Scenario,
  registry: WorkerRegistry,
  ctx: WorkerContext,
): Promise<ScenarioResult> {
  // Central DANGER-never-applied enforcement.
  if (scenario.sideEffect === 'DANGER') {
    if (!scenario.isAllowlistedLivePush) {
      return dangerSkipResult(
        scenario,
        'not the single allow-listed green-tier push',
      );
    }
    if (!ctx.allowLivePush) {
      return dangerSkipResult(
        scenario,
        'allow-listed live push requires --allow-live-push',
      );
    }
    // Allowed to proceed: the one gated green-tier push, opt-in active.
  }

  const executor = registry.get(scenario.role);
  if (!executor) return noWorkerResult(scenario);

  try {
    return await executor(scenario, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      featId: scenario.featId,
      scenarioId: scenario.scenarioId,
      surface: scenario.surface,
      domain: scenario.domain,
      steps: ['Worker executor threw before completing.'],
      expected: 'Scenario completes and reports a status.',
      observed: `Worker error: ${message}`,
      status:
        err instanceof BlockedExternalWriteError ? 'skipped-danger' : 'fail',
      envDeps: [],
      triage: err instanceof BlockedExternalWriteError ? null : 'UNKNOWN',
      notes:
        err instanceof BlockedExternalWriteError
          ? 'Request-level Safety Interlock blocked a live external write.'
          : 'Worker raised an unexpected error.',
    };
  }
}

// ── Coordinator run ──────────────────────────────────────────────────────

/** Parsed CLI flags. */
export interface CoordinatorOptions {
  /** Run directory date. */
  readonly date: Date;
  /** Whether the single allow-listed live push is opted in. */
  readonly allowLivePush: boolean;
  /** Scenarios directory (override for tests). */
  readonly scenariosDir?: string;
  /** Pre-populated registry (override for tests / step 12). */
  readonly registry?: WorkerRegistry;
}

/** Summary returned from a coordinator run. */
export interface RunSummary {
  readonly runDir: string;
  readonly total: number;
  readonly byStatus: Readonly<Record<ScenarioResult['status'], number>>;
  readonly batches: number;
}

/**
 * Execute a full coordinator run: load → group → dispatch (safety-screened) →
 * append results + teardown rows. Installs the request-level fetch guard for
 * the duration of the run.
 */
export async function runCoordinator(
  opts: CoordinatorOptions,
): Promise<RunSummary> {
  const runDir = makeRunDir(opts.date);
  const interlock = new SafetyInterlock(opts.allowLivePush);
  const registry = opts.registry ?? new WorkerRegistry();
  const restoreFetch = installFetchGuard(interlock);

  const ctx: WorkerContext = {
    runDir,
    interlock,
    allowLivePush: opts.allowLivePush,
    recordTeardown: (entry) => appendTeardown(runDir, entry),
  };

  const byStatus: Record<ScenarioResult['status'], number> = {
    pass: 0,
    fail: 0,
    blocked: 0,
    'skipped-danger': 0,
  };

  try {
    const scenarios = loadScenarios(opts.scenariosDir);
    const batches = groupIntoBatches(scenarios);

    let total = 0;
    for (const batch of batches) {
      for (const scenario of batch.scenarios) {
        const result = await dispatchScenario(scenario, registry, ctx);
        appendResult(runDir, result);
        byStatus[result.status] += 1;
        total += 1;
      }
    }

    return { runDir, total, byStatus, batches: batches.length };
  } finally {
    restoreFetch();
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────

/** Parse argv into coordinator options. `--date` defaults to today (UTC). */
export function parseArgs(argv: readonly string[]): CoordinatorOptions {
  let date = new Date();
  let allowLivePush = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--allow-live-push') {
      allowLivePush = true;
    } else if (arg === '--date') {
      const value = argv[i + 1];
      i += 1;
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error('--date requires a YYYY-MM-DD value');
      }
      date = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`--date is not a valid date: ${value}`);
      }
    } else if (arg?.startsWith('--date=')) {
      const value = arg.slice('--date='.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error('--date requires a YYYY-MM-DD value');
      }
      date = new Date(`${value}T00:00:00Z`);
    }
  }

  return { date, allowLivePush };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.allowLivePush) {
    console.warn(
      `⚠️  --allow-live-push is set. The ONLY permitted live write is the green-tier negative push on ${ALLOWLISTED_CAMPAIGN} / ${ALLOWLISTED_ACCOUNT}. Everything else stays blocked.`,
    );
  }

  // Register the step-12 worker roles (dynamic import keeps the module graph
  // acyclic — workers/index imports types/values from this file).
  const { buildDefaultRegistry } = await import('./workers/index');
  const registry = buildDefaultRegistry();

  const summary = await runCoordinator({ ...opts, registry });
  console.log(`Run directory: ${summary.runDir}`);
  console.log(
    `Scenarios: ${summary.total} across ${summary.batches} batch(es) — ` +
      `pass ${summary.byStatus.pass}, fail ${summary.byStatus.fail}, ` +
      `blocked ${summary.byStatus.blocked}, skipped-danger ${summary.byStatus['skipped-danger']}`,
  );
}

// Run only when invoked directly (tsx / node), not when imported by tests.
const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  /coordinator\.ts$/.test(process.argv[1] ?? '');

if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
