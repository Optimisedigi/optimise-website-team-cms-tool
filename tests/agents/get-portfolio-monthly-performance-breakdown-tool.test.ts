/**
 * get_portfolio_monthly_performance_breakdown tool (parallelized fan-out).
 *
 * Sibling of the weekly-metric-table test. Proves the same concurrency rewrite:
 * the account x month grid is fetched through the real `mapWithConcurrencyOrdered`
 * (bounded at PORTFOLIO_FETCH_CONCURRENCY) instead of a serial nested loop, and
 * results keep POSITIONAL ALIGNMENT under out-of-order completion.
 *
 * 3 accounts x 8 months = 24 cells (> concurrency cap 5) with reverse fetch
 * delays to scramble completion order. Unlike the weekly tool (which folds a
 * failed week into an account-level error), the monthly tool folds a failed
 * month into a PER-MONTH error row — so sibling months in the same account must
 * survive. We assert that finer-grained isolation too.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PortfolioAccount } from "@/lib/agents/optimate-google-ads/tools/_portfolio-accounts";

process.env.GROWTH_TOOLS_URL = "http://growth.test";
process.env.INTERNAL_API_KEY = "test-internal-key";

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

const { getPortfolioMonthlyPerformanceBreakdown } = await import(
  "@/lib/agents/optimate-google-ads/tools/get-portfolio-monthly-performance-breakdown"
);
import type { ToolContext } from "@/lib/agents/_shared/tool";

const CUSTOMER_IDS = ["1111111111", "2222222222", "3333333333"];
const START_MONTH = "2026-01";
const END_MONTH = "2026-08";
const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];

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

function seedOf(customerId: string): number {
  return Number(customerId.slice(-1));
}
/** Unique, decodable spend per account+month. seed*1e6 + MM. */
function cellSpend(customerId: string, month: string): number {
  const mm = Number(month.split("-")[1]);
  return seedOf(customerId) * 1_000_000 + mm;
}

const ctx: ToolContext = {
  agentName: "optimate-google-ads",
  agentRunId: "run_portfolio_monthly",
  context: {},
  log: vi.fn(),
};

function installFetch(opts: { failFor?: { customerId: string; month: string }; failAll?: boolean } = {}) {
  let callIndex = 0;
  const fetchMock = vi.fn((url: string) => {
    const current = callIndex++;
    const parsed = new URL(url);
    const customerId = parsed.searchParams.get("customerId") ?? "";
    const dateRange = parsed.searchParams.get("dateRange") ?? "";
    const startDate = dateRange.split(",")[0] ?? ""; // "2026-03-01"
    const month = startDate.slice(0, 7); // "2026-03"
    const delay = Math.max(1, (30 - current) * 4); // reverse-ish completion order
    return new Promise<Response>((resolve) => {
      setTimeout(() => {
        if (
          opts.failAll ||
          (opts.failFor && opts.failFor.customerId === customerId && opts.failFor.month === month)
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
                  cost: cellSpend(customerId, month),
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

interface MonthRow {
  month: string;
  spend?: number;
  error?: string;
}
interface MonthlyAccountEnvelope {
  accountRef?: string | number;
  displayName: string;
  months: MonthRow[];
}
interface MonthlyData {
  analysedCount: number;
  startMonth: string | null;
  endMonth: string | null;
  accounts: MonthlyAccountEnvelope[];
}

describe("get_portfolio_monthly_performance_breakdown - parallel fan-out ordering", () => {
  it("places every account×month cell in its correct positional slot despite out-of-order completion", async () => {
    const fetchMock = installFetch();

    const args = getPortfolioMonthlyPerformanceBreakdown.validate!({
      accountRefs: ["a1", "a2", "a3"],
      startMonth: START_MONTH,
      endMonth: END_MONTH,
    });
    const result = await getPortfolioMonthlyPerformanceBreakdown.execute(args, ctx);

    expect(result.ok).toBe(true);
    // 3 accounts x 8 months = 24 calls, > PORTFOLIO_FETCH_CONCURRENCY (5).
    expect(fetchMock).toHaveBeenCalledTimes(24);

    const data = result.data as MonthlyData;
    expect(data.analysedCount).toBe(3);
    expect(data.startMonth).toBe(START_MONTH);
    expect(data.endMonth).toBe(END_MONTH);
    expect(data.accounts).toHaveLength(3);

    data.accounts.forEach((account, accountIndex) => {
      const customerId = CUSTOMER_IDS[accountIndex];
      expect(account.accountRef).toBe(`a${accountIndex + 1}`);
      expect(account.months).toHaveLength(MONTHS.length);
      account.months.forEach((row, monthIndex) => {
        expect(row.month).toBe(MONTHS[monthIndex]);
        expect(row.error).toBeUndefined();
        expect(row.spend).toBe(cellSpend(customerId, MONTHS[monthIndex]));
      });
    });
  });

  it("isolates a single failing month to that one row, leaving sibling months and other accounts correct", async () => {
    // Fail only account 2, month 2026-04 (index 3).
    installFetch({ failFor: { customerId: "2222222222", month: "2026-04" } });

    const args = getPortfolioMonthlyPerformanceBreakdown.validate!({
      accountRefs: ["a1", "a2", "a3"],
      startMonth: START_MONTH,
      endMonth: END_MONTH,
    });
    const result = await getPortfolioMonthlyPerformanceBreakdown.execute(args, ctx);
    expect(result.ok).toBe(true);

    const data = result.data as MonthlyData;

    // Account 2: only 2026-04 carries an error; every other month is intact.
    const account2 = data.accounts[1];
    account2.months.forEach((row, monthIndex) => {
      if (MONTHS[monthIndex] === "2026-04") {
        expect(row.error).toMatch(/500/);
        expect(row.spend).toBeUndefined();
      } else {
        expect(row.error).toBeUndefined();
        expect(row.spend).toBe(cellSpend("2222222222", MONTHS[monthIndex]));
      }
    });

    // Accounts 1 and 3 fully correct.
    for (const accountIndex of [0, 2]) {
      const account = data.accounts[accountIndex];
      const customerId = CUSTOMER_IDS[accountIndex];
      account.months.forEach((row, monthIndex) => {
        expect(row.error).toBeUndefined();
        expect(row.spend).toBe(cellSpend(customerId, MONTHS[monthIndex]));
      });
    }
  });

  it("degrades gracefully on total upstream failure (ok:true, every month carries an error)", async () => {
    // The tool never returns top-level ok:false; failures fold into per-month rows.
    installFetch({ failAll: true });

    const args = getPortfolioMonthlyPerformanceBreakdown.validate!({
      accountRefs: ["a1", "a2", "a3"],
      startMonth: START_MONTH,
      endMonth: END_MONTH,
    });
    const result = await getPortfolioMonthlyPerformanceBreakdown.execute(args, ctx);

    expect(result.ok).toBe(true);
    const data = result.data as MonthlyData;
    expect(data.accounts).toHaveLength(3);
    for (const account of data.accounts) {
      expect(account.months).toHaveLength(MONTHS.length);
      for (const row of account.months) {
        expect(row.error).toMatch(/500/);
        expect(row.spend).toBeUndefined();
      }
    }
  });
});
