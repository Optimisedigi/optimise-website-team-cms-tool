/**
 * get_portfolio_weekly_metric_table tool (parallelized fan-out).
 *
 * These tests prove the concurrency rewrite that fixed the portfolio-mode 504:
 * the account x week grid is now fetched through `mapWithConcurrencyOrdered`
 * (bounded at PORTFOLIO_FETCH_CONCURRENCY) instead of a serial nested loop.
 *
 * The critical guarantee under test is POSITIONAL ALIGNMENT: every fetched cell
 * must land in its correct [account][week] slot even though calls complete out
 * of order. We use 3 accounts x 8 weeks = 24 cells (well over the concurrency
 * cap of 5, so genuine parallel waves happen) and give each fetch a REVERSE
 * delay so completion order is scrambled relative to issue order. A naive
 * completion-order pool (like the sibling helper) would leak values into the
 * wrong slots; `mapWithConcurrencyOrdered` must not.
 *
 * Mocks:
 *   - `loadPortfolioAccounts` (only) is overridden; the real
 *     `mapWithConcurrencyOrdered`, `PORTFOLIO_FETCH_CONCURRENCY` and
 *     `customerKey` are kept — that's the code we're exercising.
 *   - global `fetch` returns a UNIQUE, decodable spend per (customerId, week).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PortfolioAccount } from "@/lib/agents/optimate-google-ads/tools/_portfolio-accounts";

process.env.GROWTH_TOOLS_URL = "http://growth.test";
process.env.INTERNAL_API_KEY = "test-internal-key";

// Keep the real concurrency helper + customerKey; only stub the DB-backed loader.
const accountsRef: { current: PortfolioAccount[] } = { current: [] };
vi.mock("@/lib/agents/optimate-google-ads/tools/_portfolio-accounts", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/agents/optimate-google-ads/tools/_portfolio-accounts")
  >("@/lib/agents/optimate-google-ads/tools/_portfolio-accounts");
  return {
    ...actual,
    loadPortfolioAccounts: vi.fn(async () => accountsRef.current),
  };
});

const { getPortfolioWeeklyMetricTable } = await import(
  "@/lib/agents/optimate-google-ads/tools/get-portfolio-weekly-metric-table"
);
const { buildWeeklyBuckets } = await import("@/lib/google-ads-weekly-metric-table");
import type { ToolContext } from "@/lib/agents/_shared/tool";

const CUSTOMER_IDS = ["1111111111", "2222222222", "3333333333"];

function makeAccounts(): PortfolioAccount[] {
  return CUSTOMER_IDS.map((customerId, i) => ({
    accountRef: `a${i + 1}`,
    clientId: i + 1,
    displayName: `Account ${i + 1}`,
    customerId,
    maskedCustomerId: `•••-${customerId.slice(-4)}`,
    source: "client" as const,
    active: true,
    managed: true,
  }));
}

/** Unique, decodable spend for a given account+period. seed*1e6 + MMDD. */
function seedOf(customerId: string): number {
  return Number(customerId.slice(-1));
}
function cellSpend(customerId: string, startDate: string): number {
  const mmdd = Number(startDate.replace(/-/g, "").slice(4)); // "2026-05-11" -> 511
  return seedOf(customerId) * 1_000_000 + mmdd;
}

const ctx: ToolContext = {
  agentName: "optimate-google-ads",
  agentRunId: "run_portfolio_weekly",
  context: {},
  log: vi.fn(),
};

/**
 * fetch mock: decode customerId + dateRange from the URL, respond with a single
 * metric row whose `cost` is the unique cell value. A reverse delay (earlier
 * calls resolve later) forces out-of-order completion to stress ordering.
 * `failFor` optionally 500s one specific (customerId, startDate) cell.
 */
function installFetch(opts: { failFor?: { customerId: string; startDate: string }; failAll?: boolean } = {}) {
  let callIndex = 0;
  const fetchMock = vi.fn((url: string) => {
    const current = callIndex++;
    const parsed = new URL(url);
    const customerId = parsed.searchParams.get("customerId") ?? "";
    const dateRange = parsed.searchParams.get("dateRange") ?? "";
    const startDate = dateRange.split(",")[0] ?? "";
    const delay = Math.max(1, (30 - current) * 4); // reverse-ish completion order
    return new Promise<Response>((resolve) => {
      setTimeout(() => {
        if (
          opts.failAll ||
          (opts.failFor && opts.failFor.customerId === customerId && opts.failFor.startDate === startDate)
        ) {
          resolve(new Response("upstream broken", { status: 500 }));
          return;
        }
        resolve(
          new Response(
            JSON.stringify({
              success: true,
              metrics: [
                {
                  cost: cellSpend(customerId, startDate),
                  clicks: seedOf(customerId),
                  impressions: seedOf(customerId) * 10,
                  conversions: 0,
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }, delay);
    });
  });
  // @ts-expect-error - test override
  globalThis.fetch = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  accountsRef.current = makeAccounts();
});

interface WeeklyAccountEnvelope {
  accountRef?: string | number;
  displayName: string;
  error?: string;
  weeks?: Array<{ weekStart: string; weekEnd: string; spend: number }>;
}
interface WeeklyData {
  analysedCount: number;
  weeks: number;
  endDate: string;
  accounts: WeeklyAccountEnvelope[];
}

describe("get_portfolio_weekly_metric_table - parallel fan-out ordering", () => {
  it("places every account×week cell in its correct positional slot despite out-of-order completion", async () => {
    const fetchMock = installFetch();
    const weeks = 8;
    const endDate = "2026-05-17";

    const args = getPortfolioWeeklyMetricTable.validate!({
      accountRefs: ["a1", "a2", "a3"],
      weeks,
      endDate,
      metrics: ["spend"],
    });
    const result = await getPortfolioWeeklyMetricTable.execute(args, ctx);

    expect(result.ok).toBe(true);
    // 3 accounts x 8 weeks = 24 calls, > PORTFOLIO_FETCH_CONCURRENCY (5).
    expect(fetchMock).toHaveBeenCalledTimes(24);

    const data = result.data as WeeklyData;
    expect(data.analysedCount).toBe(3);
    expect(data.accounts).toHaveLength(3);

    // Canonical bucket order the tool uses internally.
    const buckets = buildWeeklyBuckets({ perDay: [], weeks, endDate });

    // Every cell must equal f(thisAccount.customerId, thisBucket.weekStart).
    // If ordering leaked, values would belong to a different account/week.
    data.accounts.forEach((account, accountIndex) => {
      const customerId = CUSTOMER_IDS[accountIndex];
      expect(account.accountRef).toBe(`a${accountIndex + 1}`);
      expect(account.weeks).toHaveLength(weeks);
      account.weeks!.forEach((week, weekIndex) => {
        expect(week.weekStart).toBe(buckets[weekIndex].weekStart);
        expect(week.spend).toBe(cellSpend(customerId, buckets[weekIndex].weekStart));
      });
    });
  });

  it("isolates a single failing cell to its own account, leaving other accounts fully correct", async () => {
    const weeks = 8;
    const endDate = "2026-05-17";
    const buckets = buildWeeklyBuckets({ perDay: [], weeks, endDate });
    // Fail one week of account 2 only.
    const failStart = buckets[3].weekStart;
    installFetch({ failFor: { customerId: "2222222222", startDate: failStart } });

    const args = getPortfolioWeeklyMetricTable.validate!({
      accountRefs: ["a1", "a2", "a3"],
      weeks,
      endDate,
      metrics: ["spend"],
    });
    const result = await getPortfolioWeeklyMetricTable.execute(args, ctx);
    expect(result.ok).toBe(true);

    const data = result.data as WeeklyData;

    // Account 2 (index 1) errors as a whole (weekly folds any failed week to an
    // account-level error envelope) — but its failure must not corrupt others.
    expect(data.accounts[1].error).toMatch(/500/);
    expect(data.accounts[1].weeks).toBeUndefined();

    // Accounts 1 and 3 remain fully populated and correctly aligned.
    for (const accountIndex of [0, 2]) {
      const account = data.accounts[accountIndex];
      const customerId = CUSTOMER_IDS[accountIndex];
      expect(account.error).toBeUndefined();
      expect(account.weeks).toHaveLength(weeks);
      account.weeks!.forEach((week, weekIndex) => {
        expect(week.spend).toBe(cellSpend(customerId, buckets[weekIndex].weekStart));
      });
    }
  });

  it("degrades gracefully on total upstream failure (ok:true, every account carries an error)", async () => {
    // NOTE: the portfolio tool intentionally never returns top-level ok:false —
    // it embeds per-account errors so one bad account can't blank the whole
    // portfolio answer. Total failure therefore yields ok:true + all errors.
    installFetch({ failAll: true });

    const args = getPortfolioWeeklyMetricTable.validate!({
      accountRefs: ["a1", "a2", "a3"],
      weeks: 8,
      endDate: "2026-05-17",
      metrics: ["spend"],
    });
    const result = await getPortfolioWeeklyMetricTable.execute(args, ctx);

    expect(result.ok).toBe(true);
    const data = result.data as WeeklyData;
    expect(data.accounts).toHaveLength(3);
    for (const account of data.accounts) {
      expect(account.error).toMatch(/500/);
      expect(account.weeks).toBeUndefined();
    }
  });
});
