import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@/lib/agents/_shared/tool";

const mocks = vi.hoisted(() => ({
  executeWeekly: vi.fn(),
  executeDashboard: vi.fn(),
  executeBudget: vi.fn(),
  executeDraft: vi.fn(),
}));

vi.mock("@/lib/agents/optimate-google-ads/tools/get-weekly-metric-table", () => ({
  getWeeklyMetricTable: { execute: mocks.executeWeekly },
}));

vi.mock("@/lib/agents/optimate-google-ads/tools/get-dashboard-email-components", () => ({
  getDashboardEmailComponents: { execute: mocks.executeDashboard },
}));

vi.mock("@/lib/agents/optimate-google-ads/tools/get-budget-management-email", () => ({
  getBudgetManagementEmail: { execute: mocks.executeBudget },
}));

vi.mock("@/lib/agents/optimate-google-ads/tools/create-gmail-draft", () => ({
  createGmailDraftTool: { execute: mocks.executeDraft },
}));

import { createWeeklyBudgetGmailDraftTool } from "@/lib/agents/optimate-google-ads/tools/create-weekly-budget-gmail-draft";

const ctx: ToolContext = {
  agentName: "optimate-google-ads",
  agentRunId: "run_weekly_budget_draft",
  context: {
    auditId: 4,
    clientId: 9,
    clientName: "Berendsen",
    customerId: "1234567890",
    userId: 12,
  },
  log: vi.fn(),
};

describe("create_weekly_budget_gmail_draft", () => {
  beforeEach(() => {
    mocks.executeWeekly.mockReset();
    mocks.executeDashboard.mockReset();
    mocks.executeBudget.mockReset();
    mocks.executeDraft.mockReset();
  });

  it("creates the weekly budget Gmail draft without returning large HTML to the LLM", async () => {
    mocks.executeWeekly.mockResolvedValueOnce({
      ok: true,
      data: {
        html: '<table data-testid="weekly">weekly html</table>',
        weeks: 1,
        rows: [
          {
            label: "Jun 22 - Jun 28",
            weekStart: "2026-06-22",
            weekEnd: "2026-06-28",
            partial: false,
            totals: { spend: 620, clicks: 100, impressions: 1000, conversions: 4 },
          },
        ],
      },
    });
    mocks.executeDashboard.mockResolvedValueOnce({
      ok: true,
      data: {
        html: '<section data-testid="dashboard">dashboard html</section>',
        components: ["keyword_relevancy"],
      },
    });
    mocks.executeBudget.mockResolvedValueOnce({
      ok: true,
      data: {
        subject: "Berendsen - Google Ads Budget Report - June 2026",
        html: '<div data-testid="budget">budget html</div>',
      },
    });
    mocks.executeDraft.mockResolvedValueOnce({
      ok: true,
      data: {
        draftId: "draft_123",
        messageId: "msg_123",
        gmailUrl: "https://mail.google.com/mail/u/0/#drafts/msg_123",
        subject: "Berendsen - Google Ads Weekly Report",
      },
    });

    const args = createWeeklyBudgetGmailDraftTool.validate!({
      weeks: 1,
      components: ["keyword_relevancy"],
      endDate: "2026-06-28",
    });
    const result = await createWeeklyBudgetGmailDraftTool.execute(args, ctx);

    expect(result.ok).toBe(true);
    expect(mocks.executeWeekly).toHaveBeenCalledWith(
      {
        weeks: 1,
        endDate: "2026-06-28",
        metrics: ["spend", "conversions", "cpa"],
        title: "Weekly Performance Trend",
      },
      ctx,
    );
    expect(mocks.executeDashboard).toHaveBeenCalledWith(
      { components: ["keyword_relevancy"], months: 14, range: "LAST_30_DAYS" },
      ctx,
    );
    expect(mocks.executeBudget).toHaveBeenCalledWith({ mode: "this_month" }, ctx);
    expect(mocks.executeDraft).toHaveBeenCalledTimes(1);
    const draftArgs = mocks.executeDraft.mock.calls[0]?.[0];
    expect(draftArgs.subject).toBe("Berendsen - Google Ads Weekly Report");
    expect(draftArgs.htmlBody).toContain("Hey team,");
    expect(draftArgs.htmlBody).toContain("Jun 22 - Jun 28 delivered 4 conversions");
    expect(draftArgs.htmlBody).toContain('data-testid="weekly"');
    expect(draftArgs.htmlBody).toContain('data-testid="dashboard"');
    expect(draftArgs.htmlBody).toContain('data-testid="budget"');

    const data = result.data as Record<string, unknown>;
    expect(data.gmailUrl).toBe("https://mail.google.com/mail/u/0/#drafts/msg_123");
    expect(data.summary).toBe("Jun 22 - Jun 28 delivered 4 conversions at a CPA of $155, with $620 in spend.");
    expect(JSON.stringify(data)).not.toContain("weekly html");
    expect(JSON.stringify(data)).not.toContain("budget html");
  });

  it("asks for graph selection before creating a weekly draft", async () => {
    const args = createWeeklyBudgetGmailDraftTool.validate!({ weeks: 4 });
    const result = await createWeeklyBudgetGmailDraftTool.execute(args, ctx);

    expect(result).toEqual({
      ok: true,
      data: {
        needsClarification: true,
        message:
          "Which weekly report graphs should I include: Keyword Relevancy, CPA Trend, or both? I will create the Gmail draft after you choose.",
        validComponents: ["keyword_relevancy", "cpa_trend"],
      },
    });
    expect(mocks.executeWeekly).not.toHaveBeenCalled();
  });
});

describe("create_weekly_budget_gmail_draft validate", () => {
  const validate = createWeeklyBudgetGmailDraftTool.validate!;

  it("defaults to weeks=4 when weeks is omitted", () => {
    expect(validate({})).toEqual({ weeks: 4, components: [] });
  });

  it("keeps weeks=1 for an explicit last-week request", () => {
    expect(validate({ weeks: 1 })).toEqual({ weeks: 1, components: [] });
  });

  it("passes an explicit week count through", () => {
    expect(validate({ weeks: 8 })).toEqual({ weeks: 8, components: [] });
  });

  it("throws when weeks is out of range", () => {
    expect(() => validate({ weeks: 0 })).toThrow(/weeks must be an integer between 1 and 12/);
    expect(() => validate({ weeks: 13 })).toThrow(/weeks must be an integer between 1 and 12/);
  });

  it("throws when weeks is not an integer", () => {
    expect(() => validate({ weeks: 2.5 })).toThrow(/weeks must be an integer between 1 and 12/);
  });

  it("accepts either graph once and rejects unsupported graphs", () => {
    expect(validate({ weeks: 4, components: ["cpa_trend", "cpa_trend"] })).toEqual({
      weeks: 4,
      components: ["cpa_trend"],
    });
    expect(() => validate({ components: ["quality_score"] })).toThrow(/Unknown weekly report graph/);
  });

  it("throws when endDate is malformed", () => {
    expect(() => validate({ weeks: 4, endDate: "28-06-2026" })).toThrow(/endDate must be in YYYY-MM-DD format/);
  });

  it("passes a valid ISO endDate through", () => {
    expect(validate({ weeks: 4, endDate: "2026-06-28" })).toEqual({ weeks: 4, components: [], endDate: "2026-06-28" });
  });
});
