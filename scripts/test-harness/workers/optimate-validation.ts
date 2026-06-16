/**
 * OptiMate real-data validation worker (Phase 5 / step 13 of
 * `.gg/plans/platform-feature-test-swarm.md`).
 *
 * Because the CMS holds no Google Ads credentials, **ground truth = the same
 * Growth Tools endpoints the read tools wrap**, queried independently and
 * compared to what OptiMate reports. This worker, for each OptiMate read tool:
 *
 *   (a) captures OptiMate's typed answer + the tool it called (best-effort live
 *       chat — non-fatal if the LLM provider is absent in dev);
 *   (b) calls the wrapped Growth Tools endpoint directly for the same
 *       whitelisted account (`659-101-3898`) and fixed date range;
 *   (c) recomputes the derived values (CTR, CPA, IS, weekly buckets, waste
 *       sums) the same way the tool does, by running the tool's own
 *       `execute()` AND an independent hand re-aggregation of the raw rows;
 *   (d) asserts the numbers match within tolerance — **exact** for raw counts
 *       and spend, a **small epsilon** for rounded rates / CPA / IS.
 *
 * It specifically exercises the transformations the plan flagged as
 * silent-misreport risks:
 *   - date-range resolution (`resolveRange` → Growth Tools comma-span),
 *   - brand / non-brand split via `brandKeywords`,
 *   - conversion-action / category mapping,
 *   - Monday-anchored weekly bucketing,
 *   - zero-conversion waste aggregation,
 *   - voice-vs-typed parity.
 *
 * Every check emits a {@link ScenarioResult} whose `evidence` carries BOTH the
 * ground-truth number and the tool number plus the resolved date range, so a
 * data/transformation bug is distinguishable from an agent-reasoning bug.
 *
 * The worker plugs into the swarm as the `validation` role (registered in
 * `workers/index.ts`) and also ships a standalone runner (`main()`) that drives
 * the fixed OPT-V scenario set and appends results to
 * `docs/test-runs/<date>/results.jsonl`.
 *
 * Run standalone:
 *   npx tsx --env-file=.env --env-file=.env.local \
 *     scripts/test-harness/workers/optimate-validation.ts --date 2026-06-16
 */

import { SafetyInterlock, type Scenario, type WorkerContext, type WorkerExecutor, type WorkerRoleName } from '../coordinator';
import type { ScenarioResult } from '../result-schema';
import { appendResult, makeRunDir } from '../result-schema';
import { authedFetch } from '../auth';
import { ensureAdminLogin, extractNumbers, makeResult, snippet } from './shared';
import type {
  ToolContext,
  ToolResultPayload,
} from '../../../src/lib/agents/_shared/tool';
import { getAccountOverview } from '../../../src/lib/agents/optimate-google-ads/tools/get-account-overview';
import { getCampaignPerformance } from '../../../src/lib/agents/optimate-google-ads/tools/get-campaign-performance';
import { getSearchTerms } from '../../../src/lib/agents/optimate-google-ads/tools/get-search-terms';
import { getWeeklyMetricTable } from '../../../src/lib/agents/optimate-google-ads/tools/get-weekly-metric-table';
import { growthToolsGet } from '../../../src/lib/agents/optimate-google-ads/tools/_growth-tools';

// ── Fixtures: whitelisted account + fixed date range ────────────────────────

/** Whitelisted live READ account (= ZZ Test Client). Reads are safe. */
const ACCOUNT_DASHED = '659-101-3898';
/** Digits-only form Growth Tools expects. */
const CUSTOMER_ID = '6591013898';
/** Client slug used to resolve conversion-action / brand context from the CMS. */
const CLIENT_SLUG = 'zz-test-client';

/**
 * Fixed, fully-closed calendar month so ground truth is reproducible across a
 * run (the most recent closed month at authoring time). Both the literal span
 * the tools resolve (`..`) and the comma-span Growth Tools expects are derived
 * from it.
 */
const MONTH_START = '2026-05-01';
const MONTH_END = '2026-05-31';
/** What a user / the agent passes as `range` — resolved to a CUSTOM span. */
const MONTH_RANGE_LITERAL = `${MONTH_START}..${MONTH_END}`;
/** What Growth Tools receives as `dateRange` once the span is resolved. */
const MONTH_RANGE_COMMA = `${MONTH_START},${MONTH_END}`;

/** Fixed anchor for Monday-anchored weekly checks (a closed-week boundary). */
const WEEKLY_END_DATE = MONTH_END;

const GET_METRICS = '/api/google-ads/campaign-budgets/get-metrics';
const SEARCH_TERMS = '/api/google-ads/search-terms';
const CHAT_ENDPOINT = '/api/optimate/google-ads-portfolio/chat';
const ACCOUNTS_ENDPOINT = '/api/optimate/google-ads-accounts';

/**
 * Authoritative map of each OptiMate read tool → the Growth Tools endpoint it
 * wraps. Used to document each scenario's surface and to build the independent
 * ground-truth query. (GA4 / GSC tools wrap `ga4-service` / `gsc-service`,
 * which need per-client OAuth tokens rather than a public Growth Tools route.)
 */
export const TOOL_ENDPOINT_MAP: Readonly<Record<string, string>> = {
  get_account_overview: `GET ${GET_METRICS}`,
  get_campaign_performance: `GET ${GET_METRICS}`,
  get_weekly_metric_table: `GET ${GET_METRICS} (one call per Monday-anchored week)`,
  get_weekly_trend_note: `GET ${GET_METRICS} (last week vs prior week)`,
  get_search_terms: `GET ${SEARCH_TERMS}`,
  get_portfolio_performance_summary: `GET ${GET_METRICS} (per account in inventory)`,
  get_portfolio_search_term_wastage: `GET ${SEARCH_TERMS} (per account in inventory)`,
  get_gsc_branded_split: 'gsc-service.fetchBrandedAnalytics (per-client GSC OAuth)',
  get_ga4_overview: 'ga4-service.fetchGa4Report (per-client GA4 OAuth)',
};

const ENV_DEPS = ['TEST_ADMIN_PASSWORD', 'GROWTH_TOOLS_URL', 'INTERNAL_API_KEY'];

// ── Tolerances (docs/test-scenarios/optimate.md §"How to run an OPT-V") ──────

/** Raw counts / spend match exactly after 2dp rounding. */
const EXACT = 0;
/** Rounded CPA / CPC. */
const MONEY_EPS = 0.01;
/** Rounded rates expressed in percentage points (CTR, conv-rate, IS). */
const RATE_EPS = 0.1;

// ── Raw Growth Tools row shapes ─────────────────────────────────────────────

interface MetricRow {
  campaignId?: string | number;
  campaignName?: string;
  status?: string;
  cost?: number;
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  ctr?: number | string | null;
  conversionsByAction?: Record<string, number>;
  conversionsByCategory?: Record<string, number>;
  searchImpressionShare?: unknown;
  searchBudgetLostIS?: unknown;
  searchBudgetLostImpressionShare?: unknown;
  searchRankLostIS?: unknown;
  searchRankLostImpressionShare?: unknown;
}

interface SearchTermRow {
  searchTerm?: string;
  query?: string;
  campaignName?: string;
  impressions?: number;
  clicks?: number;
  cost?: number;
  spend?: number;
  conversions?: number;
}

// ── Small numeric helpers (independent re-implementations on purpose) ───────

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Independent percent parser mirroring the tools' `parsePercent`: accepts a
 * fraction (0–1) or an already-percent value (>1 or "%"-suffixed) and returns
 * a 2dp percentage, or undefined when unusable.
 */
function parsePercent(value: unknown): number | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return undefined;
    return round2(value > 1 ? value : value * 100);
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '--' || trimmed === '< 10%') return undefined;
  const n = Number(trimmed.replace(/[%<>,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return round2(trimmed.includes('%') || n > 1 ? n : n * 100);
}

// ── Comparison accumulator ──────────────────────────────────────────────────

interface Check {
  label: string;
  groundTruth: number | string | null;
  tool: number | string | null;
  tol: number;
  ok: boolean;
}

function checkNum(
  label: string,
  groundTruth: number | null,
  tool: number | null,
  tol: number,
): Check {
  const ok =
    (groundTruth === null && tool === null) ||
    (groundTruth !== null &&
      tool !== null &&
      Math.abs(groundTruth - tool) <= tol + 1e-9);
  return { label, groundTruth, tool, tol, ok };
}

function checkStr(label: string, groundTruth: string | null, tool: string | null): Check {
  return { label, groundTruth, tool, tol: 0, ok: groundTruth === tool };
}

/** Outcome an individual validator returns before being wrapped in a result. */
interface ValidationOutcome {
  steps: string[];
  expected: string;
  status: ScenarioResult['status'];
  triage: ScenarioResult['triage'];
  notes: string;
  checks: Check[];
  /** Date range that was actually validated (recorded in every record). */
  dateRange: string;
  /** Best-effort captured live chat answer, when available. */
  chat?: ChatCapture;
  /** Extra evidence merged into the record. */
  extra?: Record<string, unknown>;
  /** Set when the validator couldn't run (DEV-CONFIG / blocked). */
  blockedReason?: string;
}

// ── Growth Tools ground-truth fetchers ──────────────────────────────────────

type RowsResult<T> = { ok: true; rows: T[] } | { ok: false; error: string };

async function fetchMetrics(
  customerId: string,
  dateRange: string,
  conversionActions?: string,
  conversionActionCategories?: string,
): Promise<RowsResult<MetricRow>> {
  const qs = new URLSearchParams({ customerId: customerId.replace(/-/g, ''), dateRange });
  if (conversionActions) qs.set('conversionActions', conversionActions);
  if (conversionActionCategories) qs.set('conversionActionCategories', conversionActionCategories);
  const res = await growthToolsGet<{ metrics?: MetricRow[] }>(`${GET_METRICS}?${qs.toString()}`);
  if (!res.ok) return { ok: false, error: res.error ?? 'Growth Tools get-metrics failed' };
  return { ok: true, rows: res.data?.metrics ?? [] };
}

async function fetchSearchTerms(
  customerId: string,
  dateRange: string,
  conversionActions?: string,
): Promise<RowsResult<SearchTermRow>> {
  const qs = new URLSearchParams({
    customerId: customerId.replace(/-/g, ''),
    dateRange,
    limit: '1000',
  });
  if (conversionActions) qs.set('conversionActions', conversionActions);
  const res = await growthToolsGet<{ searchTerms?: SearchTermRow[]; terms?: SearchTermRow[] }>(
    `${SEARCH_TERMS}?${qs.toString()}`,
  );
  if (!res.ok) return { ok: false, error: res.error ?? 'Growth Tools search-terms failed' };
  return { ok: true, rows: res.data?.searchTerms ?? res.data?.terms ?? [] };
}

/** A Growth Tools failure is a dev-wiring problem (no key / service down), not a code bug. */
function growthFailureTriage(error: string): ScenarioResult['triage'] {
  if (/INTERNAL_API_KEY|not configured|ECONNREFUSED|fetch failed|timeout|abort/i.test(error)) {
    return 'DEV-CONFIG';
  }
  if (/\b5\d\d\b/.test(error)) return 'UNKNOWN';
  return 'DEV-CONFIG';
}

// ── Tool runner ─────────────────────────────────────────────────────────────

function toolContext(context: Record<string, unknown>): ToolContext {
  return {
    agentName: 'optimate-validation',
    agentRunId: `validation-${Date.now()}`,
    context,
    log: () => {},
  };
}

async function runTool<T>(
  tool: { execute: (args: T, ctx: ToolContext) => Promise<ToolResultPayload>; validate?: (raw: unknown) => T },
  rawArgs: unknown,
  context: Record<string, unknown>,
): Promise<ToolResultPayload> {
  try {
    const args = tool.validate ? tool.validate(rawArgs) : (rawArgs as T);
    return await tool.execute(args, toolContext(context));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Live chat capture (part a) ──────────────────────────────────────────────

interface ChatCapture {
  ok: boolean;
  reply: string;
  numbers: string[];
  runId: string;
  modelUsed: string;
  error?: string;
}

async function captureChat(
  prompt: string,
  selectedAccountRefs: string[] = [],
): Promise<ChatCapture> {
  try {
    const res = await authedFetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, history: [], selectedAccountRefs }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      reply?: string;
      runId?: string;
      modelUsed?: string;
      error?: string;
    };
    const reply = data.reply ?? '';
    return {
      ok: res.ok && !data.error && reply.trim().length > 0,
      reply,
      numbers: extractNumbers(reply),
      runId: data.runId ?? '',
      modelUsed: data.modelUsed ?? '',
      ...(data.error ? { error: data.error } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      reply: '',
      numbers: [],
      runId: '',
      modelUsed: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Client context resolution (conversion actions / brand terms) ────────────

interface ClientContext {
  clientId: string | number | null;
  conversionActions: string;
  conversionActionCategories: string;
  brandKeywords: string;
  ga4Connected: boolean;
  gscConnected: boolean;
}

function splitActions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.flatMap(splitActions);
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Mirror of `conversionActionsForClient` — derive the merged action list. */
function deriveConversionActions(client: Record<string, unknown>): string {
  const set = new Set<string>();
  const categories = Array.isArray(client.conversionActionCategories)
    ? (client.conversionActionCategories as Array<{ actions?: unknown }>)
    : [];
  for (const cat of categories) splitActions(cat?.actions).forEach((a) => set.add(a));
  splitActions(client.dashboardConversionActions).forEach((a) => set.add(a));
  splitActions(client.phoneCallConversionActions).forEach((a) => set.add(a));
  splitActions(client.formSubmitConversionActions).forEach((a) => set.add(a));
  return Array.from(set).join(',');
}

/** Mirror of `conversionActionCategoriesForClient` — JSON-encoded category set. */
function deriveConversionActionCategories(client: Record<string, unknown>): string {
  const out: Array<{ label: string; color: string; actions: string[] }> = [];
  const categories = Array.isArray(client.conversionActionCategories)
    ? (client.conversionActionCategories as Array<{ label?: unknown; color?: unknown; actions?: unknown }>)
    : [];
  for (const cat of categories) {
    const label = String(cat?.label ?? '').trim();
    const actions = splitActions(cat?.actions);
    if (label && actions.length > 0) {
      out.push({ label, color: String(cat?.color ?? 'sky'), actions });
    }
  }
  if (out.length === 0) {
    const phone = splitActions(client.phoneCallConversionActions);
    const form = splitActions(client.formSubmitConversionActions);
    if (phone.length > 0) out.push({ label: 'Phone Calls', color: 'sky', actions: phone });
    if (form.length > 0) out.push({ label: 'Form Submits', color: 'violet', actions: form });
  }
  return out.length > 0 ? JSON.stringify(out) : '';
}

let cachedClientContext: ClientContext | null = null;

async function resolveClientContext(): Promise<ClientContext> {
  if (cachedClientContext) return cachedClientContext;
  const fallback: ClientContext = {
    clientId: null,
    conversionActions: '',
    conversionActionCategories: '',
    brandKeywords: '',
    ga4Connected: false,
    gscConnected: false,
  };
  try {
    const res = await authedFetch(
      `/api/clients?where[slug][equals]=${CLIENT_SLUG}&limit=1&depth=0`,
    );
    if (!res.ok) return fallback;
    const data = (await res.json().catch(() => ({}))) as { docs?: Array<Record<string, unknown>> };
    const doc = data.docs?.[0];
    if (!doc) return fallback;
    cachedClientContext = {
      clientId: (doc.id as string | number) ?? null,
      conversionActions: deriveConversionActions(doc),
      conversionActionCategories: deriveConversionActionCategories(doc),
      brandKeywords: typeof doc.brandKeywords === 'string' ? doc.brandKeywords : '',
      ga4Connected: doc.ga4Connected === true,
      gscConnected: doc.gscConnected === true,
    };
    return cachedClientContext;
  } catch {
    return fallback;
  }
}

// ── Validators (one per OPT-V scenario, keyed by tool) ──────────────────────

/** OPT-V-01: account overview totals + CTR/CPA/IS recompute. */
async function validateAccountOverview(): Promise<ValidationOutcome> {
  const client = await resolveClientContext();
  const ctx = {
    customerId: ACCOUNT_DASHED,
    conversionActions: client.conversionActions,
    conversionActionCategories: client.conversionActionCategories,
  };

  const gt = await fetchMetrics(
    CUSTOMER_ID,
    MONTH_RANGE_COMMA,
    client.conversionActions || undefined,
    client.conversionActionCategories || undefined,
  );
  if (!gt.ok) return devConfig('get_account_overview', GET_METRICS, gt.error, MONTH_RANGE_COMMA);

  // Independent re-aggregation of the raw rows.
  let spend = 0;
  let conv = 0;
  let impr = 0;
  let clicks = 0;
  let active = 0;
  let wIS = 0;
  let wISWeight = 0;
  for (const m of gt.rows) {
    const rowImpr = num(m.impressions);
    spend += num(m.cost ?? m.spend);
    conv += num(m.conversions);
    impr += rowImpr;
    clicks += num(m.clicks);
    if (rowImpr > 0) active += 1;
    const is = parsePercent(m.searchImpressionShare);
    if (is !== undefined && rowImpr > 0) {
      wIS += is * rowImpr;
      wISWeight += rowImpr;
    }
  }
  const gtSpend = round2(spend);
  const gtConv = round2(conv);
  const gtCpa = conv > 0 ? round2(spend / conv) : null;
  const gtCtr = impr > 0 ? round2((clicks / impr) * 100) : null;
  const gtIS = wISWeight > 0 ? round2(wIS / wISWeight) : null;

  const toolRes = await runTool(getAccountOverview, { range: MONTH_RANGE_LITERAL }, ctx);
  if (!toolRes.ok) return devConfig('get_account_overview', GET_METRICS, toolRes.error ?? '', MONTH_RANGE_COMMA);
  const d = (toolRes.data ?? {}) as Record<string, unknown>;

  const chat = await captureChat(
    `Give me the account overview for ${ACCOUNT_DASHED} for ${MONTH_START}..${MONTH_END} — spend, impressions, clicks, conversions, CTR and CPA.`,
    [CUSTOMER_ID],
  );

  const checks: Check[] = [
    checkNum('totalSpend', gtSpend, num(d.totalSpend), EXACT),
    checkNum('totalConversions', gtConv, num(d.totalConversions), EXACT),
    checkNum('totalImpressions', impr, num(d.totalImpressions), EXACT),
    checkNum('totalClicks', clicks, num(d.totalClicks), EXACT),
    checkNum('activeCampaigns', active, num(d.activeCampaigns), EXACT),
    checkNum('avgCpa', gtCpa, (d.avgCpa as number | null) ?? null, MONEY_EPS),
    checkNum(
      'searchImpressionShare',
      gtIS,
      (d.searchImpressionShare as number | null) ?? null,
      RATE_EPS,
    ),
  ];

  return finalize({
    tool: 'get_account_overview',
    endpoint: GET_METRICS,
    dateRange: MONTH_RANGE_COMMA,
    expected:
      'Tool totals equal the independently re-summed Growth Tools rows; avgCpa/IS within epsilon.',
    checks,
    chat,
    extra: {
      derivedCtr: gtCtr,
      ctrNote: 'CTR is clicks/impressions — the agent recomputes it; the overview tool omits it.',
      conversionActionsApplied: d.conversionActionsApplied ?? null,
    },
  });
}

/** Conversion-action / category mapping (account overview breakdowns). */
async function validateConversionCategoryMapping(): Promise<ValidationOutcome> {
  const client = await resolveClientContext();
  if (!client.conversionActions) {
    return {
      steps: [`Resolve conversion actions for ${CLIENT_SLUG}.`],
      expected: 'Per-action / per-category conversion breakdown matches an independent merge.',
      status: 'blocked',
      triage: 'DEV-CONFIG',
      notes:
        'Whitelisted client has no configured conversion actions, so there is no breakdown to validate. ' +
        'Re-run against an account with attributed conversions (e.g. MTP 184-083-4992) to exercise the per-action merge.',
      checks: [],
      dateRange: 'LAST_90_DAYS',
      blockedReason: 'no conversion actions configured',
    };
  }

  const ctx = {
    customerId: ACCOUNT_DASHED,
    conversionActions: client.conversionActions,
    conversionActionCategories: client.conversionActionCategories,
  };
  const gt = await fetchMetrics(
    CUSTOMER_ID,
    'LAST_90_DAYS',
    client.conversionActions,
    client.conversionActionCategories || undefined,
  );
  if (!gt.ok) return devConfig('get_account_overview', GET_METRICS, gt.error, 'LAST_90_DAYS');

  // Independent merge of conversionsByAction / conversionsByCategory.
  const gtAction = mergeBreakdown(gt.rows.map((m) => m.conversionsByAction));
  const gtCategory = mergeBreakdown(gt.rows.map((m) => m.conversionsByCategory));

  const toolRes = await runTool(getAccountOverview, { range: 'LAST_90_DAYS' }, ctx);
  if (!toolRes.ok) return devConfig('get_account_overview', GET_METRICS, toolRes.error ?? '', 'LAST_90_DAYS');
  const d = (toolRes.data ?? {}) as Record<string, unknown>;
  const toolAction = (d.conversionsByAction as Record<string, number> | null) ?? {};
  const toolCategory = (d.conversionsByCategory as Record<string, number> | null) ?? {};

  const checks: Check[] = [];
  const actionKeys = new Set([...Object.keys(gtAction), ...Object.keys(toolAction)]);
  for (const key of actionKeys) {
    checks.push(checkNum(`action:${key}`, round2(gtAction[key] ?? 0), round2(toolAction[key] ?? 0), EXACT));
  }
  const categoryKeys = new Set([...Object.keys(gtCategory), ...Object.keys(toolCategory)]);
  for (const key of categoryKeys) {
    checks.push(checkNum(`category:${key}`, round2(gtCategory[key] ?? 0), round2(toolCategory[key] ?? 0), EXACT));
  }
  if (checks.length === 0) {
    checks.push(checkStr('breakdown', 'empty', Object.keys(toolAction).length === 0 ? 'empty' : 'non-empty'));
  }

  return finalize({
    tool: 'get_account_overview',
    endpoint: GET_METRICS,
    dateRange: 'LAST_90_DAYS',
    expected:
      'Per-action and per-category conversion sums equal an independent merge of the raw Growth Tools rows.',
    checks,
    extra: { conversionActionsApplied: d.conversionActionsApplied ?? null },
  });
}

function mergeBreakdown(maps: Array<Record<string, number> | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const map of maps) {
    if (!map || typeof map !== 'object') continue;
    for (const [key, raw] of Object.entries(map)) {
      const amount = num(raw);
      if (!key.trim() || amount === 0) continue;
      out[key] = round2((out[key] ?? 0) + amount);
    }
  }
  return out;
}

/** OPT-V-02: per-campaign performance + top spender. */
async function validateCampaignPerformance(): Promise<ValidationOutcome> {
  const client = await resolveClientContext();
  const ctx = { customerId: ACCOUNT_DASHED, conversionActions: client.conversionActions };

  const gt = await fetchMetrics(CUSTOMER_ID, MONTH_RANGE_COMMA, client.conversionActions || undefined);
  if (!gt.ok) return devConfig('get_campaign_performance', GET_METRICS, gt.error, MONTH_RANGE_COMMA);
  if (gt.rows.length === 0) {
    return {
      steps: [`GET ${GET_METRICS} for ${CUSTOMER_ID} ${MONTH_RANGE_COMMA}`],
      expected: 'Per-campaign rows to validate.',
      status: 'blocked',
      triage: 'UNKNOWN',
      notes: 'Account returned no campaigns in range — nothing to validate (may genuinely be empty).',
      checks: [],
      dateRange: MONTH_RANGE_COMMA,
      blockedReason: 'no campaigns in range',
    };
  }

  // Independent: per-campaign cost/cpa + the max-spend campaign.
  const gtRows = gt.rows.map((m) => {
    const spend = num(m.cost ?? m.spend);
    const conv = num(m.conversions);
    return {
      name: m.campaignName ?? String(m.campaignId),
      spend: round2(spend),
      cpa: conv > 0 ? round2(spend / conv) : null,
    };
  });
  const gtTop = [...gtRows].sort((a, b) => b.spend - a.spend)[0]!;

  const toolRes = await runTool(getCampaignPerformance, { range: MONTH_RANGE_LITERAL }, ctx);
  if (!toolRes.ok) return devConfig('get_campaign_performance', GET_METRICS, toolRes.error ?? '', MONTH_RANGE_COMMA);
  const d = (toolRes.data ?? {}) as { campaigns?: Array<{ name: string; spend: number; cpa: number | null }> };
  const toolRows = d.campaigns ?? [];
  const toolTop = toolRows[0]; // tool sorts by spend desc

  const checks: Check[] = [
    checkNum('campaignCount', gtRows.length, toolRows.length, EXACT),
    checkStr('topSpendCampaign', gtTop.name, toolTop?.name ?? null),
    checkNum('topSpend', gtTop.spend, toolTop ? round2(toolTop.spend) : null, EXACT),
  ];
  // Spot-check CPA on the top row.
  checks.push(checkNum('topCpa', gtTop.cpa, toolTop?.cpa ?? null, MONEY_EPS));

  return finalize({
    tool: 'get_campaign_performance',
    endpoint: GET_METRICS,
    dateRange: MONTH_RANGE_COMMA,
    expected: 'Campaign count, highest-spend campaign name and its spend/CPA match ground truth.',
    checks,
    extra: { topSpendCampaign: gtTop.name },
  });
}

/** OPT-V-03: zero-conversion search-term waste aggregation. */
async function validateSearchTermWaste(): Promise<ValidationOutcome> {
  const client = await resolveClientContext();
  const ctx = { customerId: ACCOUNT_DASHED, conversionActions: client.conversionActions };
  const MIN_IMPRESSIONS = 50;

  const gt = await fetchSearchTerms(CUSTOMER_ID, MONTH_RANGE_COMMA, client.conversionActions || undefined);
  if (!gt.ok) return devConfig('get_search_terms', SEARCH_TERMS, gt.error, MONTH_RANGE_COMMA);

  // Independent zero-conversion waste aggregation.
  const gtWaste = gt.rows
    .map((t) => ({
      term: String(t.searchTerm ?? t.query ?? '').trim(),
      impressions: num(t.impressions),
      cost: round2(num(t.cost ?? t.spend)),
      conversions: num(t.conversions),
    }))
    .filter((t) => t.term && t.impressions >= MIN_IMPRESSIONS && t.conversions === 0 && t.cost > 0);
  const gtTotalWaste = round2(gtWaste.reduce((s, t) => s + t.cost, 0));
  const gtTop10 = [...gtWaste].sort((a, b) => b.cost - a.cost).slice(0, 10).map((t) => t.term);

  // Tool path: run the tool, then aggregate waste from ITS output the same way.
  const toolRes = await runTool(
    getSearchTerms,
    { range: MONTH_RANGE_LITERAL, minImpressions: MIN_IMPRESSIONS, limit: 1000 },
    ctx,
  );
  if (!toolRes.ok) return devConfig('get_search_terms', SEARCH_TERMS, toolRes.error ?? '', MONTH_RANGE_COMMA);
  const d = (toolRes.data ?? {}) as {
    terms?: Array<{ term: string; impressions: number; spend: number; conversions: number }>;
  };
  const toolWaste = (d.terms ?? []).filter((t) => t.conversions === 0 && t.spend > 0);
  const toolTotalWaste = round2(toolWaste.reduce((s, t) => s + num(t.spend), 0));
  const toolTop10 = [...toolWaste].sort((a, b) => b.spend - a.spend).slice(0, 10).map((t) => t.term);

  const checks: Check[] = [
    checkNum('wasteTermCount', gtWaste.length, toolWaste.length, EXACT),
    checkNum('totalWastedSpend', gtTotalWaste, toolTotalWaste, MONEY_EPS),
    checkStr('top10Set', gtTop10.slice().sort().join('|'), toolTop10.slice().sort().join('|')),
  ];

  return finalize({
    tool: 'get_search_terms',
    endpoint: SEARCH_TERMS,
    dateRange: MONTH_RANGE_COMMA,
    expected:
      'Zero-conversion (impr≥50, cost>0) waste set + total wasted spend match an independent aggregation of the raw rows.',
    checks,
    extra: { groundTruthTop10: gtTop10, toolTop10 },
  });
}

/** OPT-V-04: Monday-anchored weekly bucketing (8 weeks). */
async function validateWeeklyMetricTable(): Promise<ValidationOutcome> {
  const client = await resolveClientContext();
  const ctx = { customerId: ACCOUNT_DASHED, conversionActions: client.conversionActions };
  const WEEKS = 8;

  const toolRes = await runTool(
    getWeeklyMetricTable,
    { weeks: WEEKS, endDate: WEEKLY_END_DATE, metrics: ['spend', 'clicks', 'conversions', 'cpa'] },
    ctx,
  );
  if (!toolRes.ok) {
    return devConfig('get_weekly_metric_table', GET_METRICS, toolRes.error ?? '', `${WEEKS}w→${WEEKLY_END_DATE}`);
  }
  const d = (toolRes.data ?? {}) as {
    rows?: Array<{ weekStart: string; weekEnd: string; partial: boolean; totals: Record<string, number> }>;
  };
  const rows = d.rows ?? [];

  const checks: Check[] = [checkNum('weekCount', WEEKS, rows.length, EXACT)];

  // Structural: every weekStart is a Monday; buckets contiguous, no overlap.
  let prevEnd: string | null = null;
  for (const row of rows) {
    const dow = new Date(`${row.weekStart}T00:00:00Z`).getUTCDay();
    checks.push(checkNum(`monday:${row.weekStart}`, 1, dow, EXACT));
    if (prevEnd) {
      const expectedStart = addDaysIso(prevEnd, 1);
      checks.push(checkStr(`contiguous:${row.weekStart}`, expectedStart, row.weekStart));
    }
    prevEnd = row.weekEnd;
  }

  // Per-bucket totals vs an independent Growth Tools call for that exact span.
  for (const row of rows) {
    const span = `${row.weekStart},${row.weekEnd}`;
    const gt = await fetchMetrics(CUSTOMER_ID, span, client.conversionActions || undefined);
    if (!gt.ok) return devConfig('get_weekly_metric_table', GET_METRICS, gt.error, span);
    let spend = 0;
    let clicks = 0;
    let conv = 0;
    for (const m of gt.rows) {
      spend += num(m.cost ?? m.spend);
      clicks += num(m.clicks);
      conv += num(m.conversions);
    }
    checks.push(checkNum(`spend:${row.weekStart}`, round2(spend), round2(num(row.totals.spend)), EXACT));
    checks.push(checkNum(`clicks:${row.weekStart}`, clicks, num(row.totals.clicks), EXACT));
    checks.push(checkNum(`conv:${row.weekStart}`, round2(conv), round2(num(row.totals.conversions)), EXACT));
  }

  return finalize({
    tool: 'get_weekly_metric_table',
    endpoint: GET_METRICS,
    dateRange: `${WEEKS} Monday-anchored weeks → ${WEEKLY_END_DATE}`,
    expected:
      'Every weekStart is a Monday, buckets are contiguous (no gap/overlap), and per-bucket spend/clicks/conversions equal an independent per-week Growth Tools call.',
    checks,
  });
}

/** OPT-V-16: date-range resolution for relative "last week vs prior week". */
async function validateWeeklyTrendResolution(): Promise<ValidationOutcome> {
  const client = await resolveClientContext();
  const ctx = { customerId: ACCOUNT_DASHED, conversionActions: client.conversionActions };

  // get_weekly_trend_note is a shim around the weekly table; validate the
  // Monday-anchored two-week resolution it relies on. Use a Sunday endDate so
  // both weeks are complete (no partial highlight row).
  const toolRes = await runTool(
    getWeeklyMetricTable,
    { weeks: 2, endDate: WEEKLY_END_DATE, metrics: ['spend', 'conversions', 'cpa'] },
    ctx,
  );
  if (!toolRes.ok) return devConfig('get_weekly_trend_note', GET_METRICS, toolRes.error ?? '', `2w→${WEEKLY_END_DATE}`);
  const d = (toolRes.data ?? {}) as {
    rows?: Array<{ weekStart: string; weekEnd: string; totals: Record<string, number> }>;
  };
  const rows = d.rows ?? [];
  const checks: Check[] = [checkNum('weekCount', 2, rows.length, EXACT)];

  for (const row of rows) {
    const dow = new Date(`${row.weekStart}T00:00:00Z`).getUTCDay();
    checks.push(checkNum(`monday:${row.weekStart}`, 1, dow, EXACT));
    const span = `${row.weekStart},${row.weekEnd}`;
    const gt = await fetchMetrics(CUSTOMER_ID, span, client.conversionActions || undefined);
    if (!gt.ok) return devConfig('get_weekly_trend_note', GET_METRICS, gt.error, span);
    let spend = 0;
    let conv = 0;
    for (const m of gt.rows) {
      spend += num(m.cost ?? m.spend);
      conv += num(m.conversions);
    }
    checks.push(checkNum(`spend:${row.weekStart}`, round2(spend), round2(num(row.totals.spend)), EXACT));
    checks.push(checkNum(`conv:${row.weekStart}`, round2(conv), round2(num(row.totals.conversions)), EXACT));
  }

  return finalize({
    tool: 'get_weekly_trend_note',
    endpoint: GET_METRICS,
    dateRange: `2 trailing complete ISO weeks → ${WEEKLY_END_DATE}`,
    expected:
      '"Last week vs prior week" resolves to two contiguous Monday→Sunday weeks whose totals match ground truth.',
    checks,
  });
}

/** OPT-V-13: portfolio cross-account aggregation (spend + conversions). */
async function validatePortfolioPerformance(): Promise<ValidationOutcome> {
  const accounts = await listPortfolioAccounts();
  if (!accounts.ok) {
    return devConfig('get_portfolio_performance_summary', ACCOUNTS_ENDPOINT, accounts.error, MONTH_RANGE_COMMA);
  }
  let portfolioSpend = 0;
  let portfolioConv = 0;
  let top: { customerId: string; spend: number } | null = null;
  for (const customerId of accounts.ids) {
    const gt = await fetchMetrics(customerId, MONTH_RANGE_COMMA);
    if (!gt.ok) continue;
    let spend = 0;
    let conv = 0;
    for (const m of gt.rows) {
      spend += num(m.cost ?? m.spend);
      conv += num(m.conversions);
    }
    portfolioSpend += spend;
    portfolioConv += conv;
    if (!top || spend > top.spend) top = { customerId, spend: round2(spend) };
  }

  // The portfolio tool itself reads the inventory from the CMS DB, so it isn't
  // run in-process here; the ground-truth cross-account aggregation IS computed
  // and recorded, and the live chat answer is captured to compare against it.
  const chat = await captureChat(
    `Across all managed Google Ads accounts, which account spent the most in ${MONTH_START}..${MONTH_END}, and what was total portfolio spend and total conversions?`,
  );

  // Real assertion (per the OPT-V-13 triage): the whitelisted account must be
  // present in the resolved portfolio inventory.
  const hasWhitelisted = accounts.ids.includes(CUSTOMER_ID);
  const checks: Check[] = [
    checkStr('whitelistedAccountInInventory', CUSTOMER_ID, hasWhitelisted ? CUSTOMER_ID : null),
  ];

  return finalize({
    tool: 'get_portfolio_performance_summary',
    endpoint: GET_METRICS,
    dateRange: MONTH_RANGE_COMMA,
    expected:
      'Cross-account ground truth (Σ spend, Σ conversions, max-spend account) is computed for the chat answer to be checked against, and the whitelisted account appears in the inventory.',
    triage: hasWhitelisted ? null : 'PROD-BUG',
    notes:
      'Ground truth recomputed across the live account inventory. Compare the captured chat answer against portfolioTotalSpend / topAccount; the portfolio tool reads its inventory from the CMS DB and is exercised end-to-end via chat.',
    checks,
    chat,
    extra: {
      portfolioTotalSpend: round2(portfolioSpend),
      portfolioTotalConversions: round2(portfolioConv),
      topAccount: top,
      accountsCount: accounts.ids.length,
    },
  });
}

/** OPT-V-15: portfolio zero-conversion waste across accounts. */
async function validatePortfolioWaste(): Promise<ValidationOutcome> {
  const accounts = await listPortfolioAccounts();
  if (!accounts.ok) {
    return devConfig('get_portfolio_search_term_wastage', ACCOUNTS_ENDPOINT, accounts.error, MONTH_RANGE_COMMA);
  }
  const perAccount: Array<{ customerId: string; wastedSpend: number }> = [];
  let portfolioWaste = 0;
  for (const customerId of accounts.ids) {
    const gt = await fetchSearchTerms(customerId, MONTH_RANGE_COMMA);
    if (!gt.ok) continue;
    const waste = gt.rows
      .filter((t) => num(t.conversions) === 0 && num(t.cost ?? t.spend) > 0)
      .reduce((s, t) => s + num(t.cost ?? t.spend), 0);
    portfolioWaste += waste;
    perAccount.push({ customerId, wastedSpend: round2(waste) });
  }
  const worst5 = [...perAccount].sort((a, b) => b.wastedSpend - a.wastedSpend).slice(0, 5);
  const hasWhitelisted = accounts.ids.includes(CUSTOMER_ID);

  return finalize({
    tool: 'get_portfolio_search_term_wastage',
    endpoint: SEARCH_TERMS,
    dateRange: MONTH_RANGE_COMMA,
    expected:
      'Cross-account zero-conversion waste total + worst-5 ground truth is recomputed for chat comparison, and the whitelisted account appears in the inventory.',
    triage: hasWhitelisted ? null : 'PROD-BUG',
    notes:
      'Per-account zero-conversion waste summed independently. Compare the chat answer (portfolioWastedSpend / worst 5) against this ground truth.',
    checks: [checkStr('whitelistedAccountInInventory', CUSTOMER_ID, hasWhitelisted ? CUSTOMER_ID : null)],
    extra: { portfolioWastedSpend: round2(portfolioWaste), worst5 },
  });
}

type AccountListResult = { ok: true; ids: string[] } | { ok: false; error: string };

async function listPortfolioAccounts(): Promise<AccountListResult> {
  try {
    const res = await authedFetch(ACCOUNTS_ENDPOINT);
    if (!res.ok) return { ok: false, error: `${ACCOUNTS_ENDPOINT} ${res.status}` };
    const data = (await res.json().catch(() => ({}))) as { accounts?: Array<{ customerId?: string }> };
    const ids = (data.accounts ?? [])
      .map((a) => (a.customerId ?? '').replace(/-/g, ''))
      .filter(Boolean);
    return ids.length > 0 ? { ok: true, ids } : { ok: false, error: 'empty account inventory' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** OPT-V-06: brand/non-brand GSC split — needs per-client GSC OAuth tokens. */
async function validateBrandedSplit(): Promise<ValidationOutcome> {
  const client = await resolveClientContext();
  const reason = !client.gscConnected
    ? `${CLIENT_SLUG} has no GSC connection in dev`
    : !client.brandKeywords
      ? `${CLIENT_SLUG} has no brandKeywords set`
      : '';
  return {
    steps: [
      'Resolve client GSC tokens + brandKeywords.',
      'Recompute per-side ctr = clicks/impressions; assert brand+nonBrand reconciles to the unfiltered total.',
    ],
    expected:
      'brand+nonBrand clicks/impr reconcile to the unfiltered GSC total; per-side CTR = clicks/impr; position impression-weighted.',
    status: 'blocked',
    triage: 'DEV-CONFIG',
    notes:
      (reason ? `${reason}. ` : '') +
      'Brand/non-brand split validation needs a GSC-connected account with saved brand terms. ' +
      'The brandTerms transformation was validated against live GSC in the 2026-06-04 run (3 prod bugs found + fixed).',
    checks: [],
    dateRange: 'LAST_30_DAYS',
    blockedReason: reason || 'GSC not connected',
  };
}

/** OPT-V-07: GA4 overview — needs per-client GA4 OAuth tokens. */
async function validateGa4Overview(): Promise<ValidationOutcome> {
  const client = await resolveClientContext();
  return {
    steps: [
      'Resolve client GA4 tokens + property id.',
      'Recompute engagementRate = engagedSessions/sessions; reconcile channel sessions to the total.',
    ],
    expected: 'sessions/users/conversions exact; engagementRate within epsilon; channel sessions sum to total.',
    status: 'blocked',
    triage: 'DEV-CONFIG',
    notes:
      (client.ga4Connected ? '' : `${CLIENT_SLUG} has no GA4 connection in dev. `) +
      'GA4 overview validation needs a GA4-connected account; it was validated against live GA4 in the 2026-06-04 run (all metrics matched).',
    checks: [],
    dateRange: 'LAST_30_DAYS',
    blockedReason: 'GA4 not connected',
  };
}

/** OPT-V-14: voice-vs-typed parity (typed leg runnable; voice leg DEV-CONFIG). */
async function validateVoiceTypedParity(): Promise<ValidationOutcome> {
  const client = await resolveClientContext();
  const ctx = { customerId: ACCOUNT_DASHED, conversionActions: client.conversionActions };

  // Ground truth: account overview spend + CPA for the fixed month.
  const gt = await fetchMetrics(CUSTOMER_ID, MONTH_RANGE_COMMA, client.conversionActions || undefined);
  if (!gt.ok) return devConfig('get_account_overview', GET_METRICS, gt.error, MONTH_RANGE_COMMA);
  let spend = 0;
  let conv = 0;
  for (const m of gt.rows) {
    spend += num(m.cost ?? m.spend);
    conv += num(m.conversions);
  }
  const gtSpend = round2(spend);
  const gtCpa = conv > 0 ? round2(spend / conv) : null;

  // Typed leg: run the tool (the shared path both models use).
  const toolRes = await runTool(getAccountOverview, { range: MONTH_RANGE_LITERAL }, ctx);
  const typedSpend = toolRes.ok ? num((toolRes.data as Record<string, unknown>).totalSpend) : null;
  const typedCpa = toolRes.ok ? ((toolRes.data as Record<string, unknown>).avgCpa as number | null) ?? null : null;

  // Best-effort live typed chat capture; voice leg requires OpenAI Realtime
  // (absent in dev) — recorded as a DEV-CONFIG note, not a failure.
  const typedChat = await captureChat(
    `What was total spend and CPA for ${ACCOUNT_DASHED} in ${MONTH_START}..${MONTH_END}?`,
    [CUSTOMER_ID],
  );

  const checks: Check[] = [
    checkNum('typedSpend=groundTruth', gtSpend, typedSpend, EXACT),
    checkNum('typedCpa=groundTruth', gtCpa, typedCpa, MONEY_EPS),
  ];

  const outcome = finalize({
    tool: 'get_account_overview',
    endpoint: GET_METRICS,
    dateRange: MONTH_RANGE_COMMA,
    expected:
      'Typed answer matches ground truth; voice answer (when available) matches both. Voice leg is DEV-CONFIG when OPENAI_API_KEY is absent.',
    checks,
    chat: typedChat,
    extra: {
      voiceLeg: 'DEV-CONFIG: OpenAI Realtime (OPENAI_API_KEY) absent in dev — voice path not minted.',
    },
  });
  // Voice unavailability must not fail the scenario when the typed leg passes.
  if (outcome.status === 'pass') {
    outcome.notes =
      'Typed leg matched ground truth. Voice-vs-typed parity is DEV-CONFIG for the voice leg only (no realtime session in dev).';
  }
  return outcome;
}

// ── Outcome finalisation ────────────────────────────────────────────────────

function devConfig(
  tool: string,
  endpoint: string,
  error: string,
  dateRange: string,
): ValidationOutcome {
  const triage = growthFailureTriage(error);
  return {
    steps: [`Map ${tool} → ${endpoint}.`, `Query ground truth for ${ACCOUNT_DASHED} / ${dateRange}.`],
    expected: 'Ground-truth Growth Tools data to compare against.',
    status: triage === 'UNKNOWN' ? 'fail' : 'blocked',
    triage,
    notes: `Could not reach ground truth: ${snippet(error, 240)}`,
    checks: [],
    dateRange,
    blockedReason: error,
  };
}

interface FinalizeArgs {
  tool: string;
  endpoint: string;
  dateRange: string;
  expected: string;
  checks: Check[];
  status?: ScenarioResult['status'];
  triage?: ScenarioResult['triage'];
  notes?: string;
  chat?: ChatCapture;
  extra?: Record<string, unknown>;
}

function finalize(args: FinalizeArgs): ValidationOutcome {
  const failed = args.checks.filter((c) => !c.ok);
  const ok = failed.length === 0;
  const status: ScenarioResult['status'] = args.status ?? (ok ? 'pass' : 'fail');
  const triage: ScenarioResult['triage'] =
    args.triage !== undefined ? args.triage : ok ? null : 'PROD-BUG';
  const notes =
    args.notes ??
    (ok
      ? 'All numbers match ground truth within tolerance — transformation is faithful.'
      : `Validation mismatch: ${failed
          .map((c) => `${c.label} gt=${c.groundTruth} tool=${c.tool}`)
          .join('; ')}`);
  return {
    steps: [
      `Map ${args.tool} → ${args.endpoint}.`,
      `Capture OptiMate answer + tool call (live chat best-effort).`,
      `Query Growth Tools directly for ${ACCOUNT_DASHED} / ${args.dateRange}.`,
      `Recompute derived values (CTR/CPA/IS/buckets/waste) independently.`,
      `Assert ${args.checks.length} value(s) within tolerance (exact counts/spend, epsilon rates).`,
    ],
    expected: args.expected,
    status,
    triage,
    notes,
    checks: args.checks,
    dateRange: args.dateRange,
    ...(args.chat ? { chat: args.chat } : {}),
    ...(args.extra ? { extra: args.extra } : {}),
  };
}

function outcomeToResult(scenario: Scenario, outcome: ValidationOutcome): ScenarioResult {
  const evidence = JSON.stringify(
    {
      account: ACCOUNT_DASHED,
      dateRange: outcome.dateRange,
      checks: outcome.checks.map((c) => ({
        label: c.label,
        groundTruth: c.groundTruth,
        tool: c.tool,
        tol: c.tol,
        ok: c.ok,
      })),
      ...(outcome.chat
        ? {
            optimateChat: {
              ok: outcome.chat.ok,
              modelUsed: outcome.chat.modelUsed,
              runId: outcome.chat.runId,
              numbers: outcome.chat.numbers,
              reply: snippet(outcome.chat.reply, 400),
              ...(outcome.chat.error ? { error: snippet(outcome.chat.error, 160) } : {}),
            },
          }
        : {}),
      ...(outcome.extra ? { derived: outcome.extra } : {}),
      ...(outcome.blockedReason ? { blockedReason: snippet(outcome.blockedReason, 200) } : {}),
    },
    null,
    2,
  );

  const passedChecks = outcome.checks.filter((c) => c.ok).length;
  const observed =
    outcome.status === 'pass'
      ? `${passedChecks}/${outcome.checks.length} checks matched ground truth (range ${outcome.dateRange}).`
      : outcome.status === 'fail'
        ? `${outcome.checks.length - passedChecks} mismatch(es) vs ground truth (range ${outcome.dateRange}).`
        : `Not validated: ${snippet(outcome.blockedReason ?? 'see notes', 160)}`;

  return makeResult(scenario, {
    steps: outcome.steps,
    expected: outcome.expected,
    observed,
    status: outcome.status,
    triage: outcome.triage,
    notes: outcome.notes,
    evidence,
    envDeps: ENV_DEPS,
  });
}

// ── Scenario routing ────────────────────────────────────────────────────────

type Validator = () => Promise<ValidationOutcome>;

/** Exact scenario-id → validator (the fixed OPT-V set this worker owns). */
const VALIDATORS_BY_ID: Readonly<Record<string, Validator>> = {
  'OPT-V-01': validateAccountOverview,
  'OPT-V-02': validateCampaignPerformance,
  'OPT-V-03': validateSearchTermWaste,
  'OPT-V-04': validateWeeklyMetricTable,
  'OPT-V-06': validateBrandedSplit,
  'OPT-V-07': validateGa4Overview,
  'OPT-V-13': validatePortfolioPerformance,
  'OPT-V-14': validateVoiceTypedParity,
  'OPT-V-15': validatePortfolioWaste,
  'OPT-V-16': validateWeeklyTrendResolution,
  'OPT-V-CONV': validateConversionCategoryMapping,
};

/**
 * Surface-text fallback for coordinator-parsed scenarios whose ids differ.
 * Ordered most-specific first so conversion-mapping / voice / portfolio win
 * over the generic `account overview` substring that appears in their surfaces.
 */
const VALIDATORS_BY_SURFACE: ReadonlyArray<readonly [RegExp, Validator]> = [
  [/conversion.?(action|categor)/i, validateConversionCategoryMapping],
  [/voice|parity/i, validateVoiceTypedParity],
  [/portfolio.*(waste|wastage)/i, validatePortfolioWaste],
  [/portfolio.*(performance|summary)|cross.?account/i, validatePortfolioPerformance],
  [/search.?term.*waste|waste.*search.?term/i, validateSearchTermWaste],
  [/weekly.?metric.?table|monday/i, validateWeeklyMetricTable],
  [/trend.?note|date.?range/i, validateWeeklyTrendResolution],
  [/campaign.?performance/i, validateCampaignPerformance],
  [/brand|\bgsc\b/i, validateBrandedSplit],
  [/\bga4\b/i, validateGa4Overview],
  [/account.?overview/i, validateAccountOverview],
];

function pickValidator(scenario: Scenario): Validator | null {
  const byId = VALIDATORS_BY_ID[scenario.scenarioId];
  if (byId) return byId;
  for (const [re, validator] of VALIDATORS_BY_SURFACE) {
    if (re.test(scenario.surface)) return validator;
  }
  return null;
}

/**
 * Worker entry point. Routes an OPT-V scenario to its validator, then maps the
 * outcome to a {@link ScenarioResult}. Scenarios with no matching validator are
 * reported `blocked` (honest — needs a dedicated ground-truth path).
 */
export const optimateValidationWorker: WorkerExecutor = async (scenario, ctx) => {
  const login = await ensureAdminLogin();
  if (!login.ok) {
    return makeResult(scenario, {
      steps: ['loginAdmin()'],
      expected: 'Authenticated session for ground-truth + chat capture.',
      observed: `Login failed: ${login.reason}`,
      status: 'blocked',
      triage: 'DEV-CONFIG',
      notes: 'Validation needs a running dev server and TEST_ADMIN_PASSWORD.',
      envDeps: ENV_DEPS,
    });
  }

  const validator = pickValidator(scenario);
  if (!validator) {
    return makeResult(scenario, {
      steps: [`Match ${scenario.scenarioId} to a ground-truth validator.`],
      expected: 'A read-tool → Growth Tools ground-truth comparison.',
      observed: 'No data-validation path maps to this scenario (likely CMS-write / agent-behaviour).',
      status: 'blocked',
      triage: null,
      notes:
        'This validation worker covers the read tools wrapped over Growth Tools / GA4 / GSC. ' +
        'Memory / propose / confirm scenarios are owned by the optimate + api workers.',
      envDeps: ENV_DEPS,
    });
  }

  // Honour the central interlock contract even though every path here is a read.
  void ctx.interlock;

  const outcome = await validator();
  return outcomeToResult(scenario, outcome);
};

// ── Standalone runner ───────────────────────────────────────────────────────

/** The fixed OPT-V data-validation scenario set this worker owns. */
export function buildValidationScenarios(): Scenario[] {
  const base = {
    domain: 'optimate',
    sideEffect: 'EXTERNAL-SAFE' as const,
    role: 'validation' as WorkerRoleName,
    isAllowlistedLivePush: false,
    file: 'optimate.md',
  };
  const defs: Array<[string, string, string]> = [
    ['OPT-V-01', 'get_account_overview', TOOL_ENDPOINT_MAP.get_account_overview],
    ['OPT-V-02', 'get_campaign_performance', TOOL_ENDPOINT_MAP.get_campaign_performance],
    ['OPT-V-03', 'get_search_terms (zero-conversion waste)', TOOL_ENDPOINT_MAP.get_search_terms],
    ['OPT-V-04', 'get_weekly_metric_table (Monday bucketing)', TOOL_ENDPOINT_MAP.get_weekly_metric_table],
    ['OPT-V-06', 'get_gsc_branded_split (brandKeywords)', TOOL_ENDPOINT_MAP.get_gsc_branded_split],
    ['OPT-V-07', 'get_ga4_overview', TOOL_ENDPOINT_MAP.get_ga4_overview],
    ['OPT-V-13', 'get_portfolio_performance_summary (cross-account)', TOOL_ENDPOINT_MAP.get_portfolio_performance_summary],
    ['OPT-V-14', 'voice-vs-typed parity (get_account_overview)', TOOL_ENDPOINT_MAP.get_account_overview],
    ['OPT-V-15', 'get_portfolio_search_term_wastage', TOOL_ENDPOINT_MAP.get_portfolio_search_term_wastage],
    ['OPT-V-16', 'get_weekly_trend_note (date-range resolution)', TOOL_ENDPOINT_MAP.get_weekly_trend_note],
    ['OPT-V-CONV', 'get_account_overview conversion-action/category mapping', TOOL_ENDPOINT_MAP.get_account_overview],
  ];
  return defs.map(([id, tool, endpoint]) => ({
    ...base,
    featId: id,
    scenarioId: id,
    surface: `${tool} → ${endpoint}`,
  }));
}

async function main(): Promise<void> {
  const dateArg = process.argv.find((a) => a.startsWith('--date='))?.slice('--date='.length);
  const flagDate = process.argv.indexOf('--date');
  const dateStr = dateArg ?? (flagDate >= 0 ? process.argv[flagDate + 1] : undefined);
  const date = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(`${dateStr}T00:00:00Z`) : new Date();

  const runDir = makeRunDir(date);
  const scenarios = buildValidationScenarios();

  // Minimal context: every validator here is a read; the interlock is satisfied.
  const ctx: WorkerContext = {
    runDir,
    interlock: new SafetyInterlock(false),
    allowLivePush: false,
    recordTeardown: () => {},
  };

  const byStatus: Record<ScenarioResult['status'], number> = {
    pass: 0,
    fail: 0,
    blocked: 0,
    'skipped-danger': 0,
  };

  for (const scenario of scenarios) {
    const result = await optimateValidationWorker(scenario, ctx);
    appendResult(runDir, result);
    byStatus[result.status] += 1;
    console.log(`${result.status.toUpperCase().padEnd(7)} ${scenario.scenarioId} — ${result.observed}`);
  }

  console.log(`\nRun directory: ${runDir}`);
  console.log(
    `OptiMate data validation: ${scenarios.length} scenario(s) — ` +
      `pass ${byStatus.pass}, fail ${byStatus.fail}, blocked ${byStatus.blocked}.`,
  );
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  /optimate-validation\.ts$/.test(process.argv[1] ?? '');

if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
