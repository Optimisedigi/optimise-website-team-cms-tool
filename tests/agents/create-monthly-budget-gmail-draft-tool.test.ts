import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@/lib/agents/_shared/tool";

const mocks = vi.hoisted(() => ({
  executeDashboard: vi.fn(),
  executeMonthly: vi.fn(),
  executeBudget: vi.fn(),
  executeDraft: vi.fn(),
}));

vi.mock("@/lib/agents/optimate-google-ads/tools/get-dashboard-email-components", () => ({
  getDashboardEmailComponents: { execute: mocks.executeDashboard },
}));

vi.mock("@/lib/agents/optimate-google-ads/tools/get-monthly-metric-table", () => ({
  getMonthlyMetricTable: { execute: mocks.executeMonthly },
}));

vi.mock("@/lib/agents/optimate-google-ads/tools/get-budget-management-email", () => ({
  getBudgetManagementEmail: { execute: mocks.executeBudget },
}));

vi.mock("@/lib/agents/optimate-google-ads/tools/create-gmail-draft", () => ({
  createGmailDraftTool: { execute: mocks.executeDraft },
}));

import { createMonthlyBudgetGmailDraftTool } from "@/lib/agents/optimate-google-ads/tools/create-monthly-budget-gmail-draft";

const ctx: ToolContext = {
  agentName: "optimate-google-ads",
  agentRunId: "run_monthly_budget_draft",
  context: {
    auditId: 4,
    clientId: 9,
    clientName: "Berendsen",
    customerId: "1234567890",
    userId: 12,
  },
  log: vi.fn(),
};

describe("create_monthly_budget_gmail_draft", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00Z"));
    mocks.executeDashboard.mockReset();
    mocks.executeMonthly.mockReset();
    mocks.executeBudget.mockReset();
    mocks.executeDraft.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not create a draft and asks which components to include for 'Create a monthly budget Gmail draft'", async () => {
    const userRequest = "Create a monthly budget Gmail draft";
    expect(userRequest).not.toMatch(/keyword relevancy|cpa trend|quality score|top converters/i);

    const args = createMonthlyBudgetGmailDraftTool.validate!({});
    const result = await createMonthlyBudgetGmailDraftTool.execute(args, ctx);

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      needsClarification: true,
      validComponents: ["keyword_relevancy", "cpa_trend", "quality_score", "top_converters"],
    });
    const message = String((result.data as { message: string }).message);
    expect(message).toContain("Which monthly email components");
    expect(message).toContain("Keyword Relevancy");
    expect(message).toContain("CPA Trend");
    expect(message).toContain("Quality Score");
    expect(message).toContain("Top Converters");
    expect(mocks.executeDashboard).not.toHaveBeenCalled();
    expect(mocks.executeMonthly).not.toHaveBeenCalled();
    expect(mocks.executeBudget).not.toHaveBeenCalled();
    expect(mocks.executeDraft).not.toHaveBeenCalled();
  });

  it("creates the monthly budget Gmail draft without returning large HTML to the LLM", async () => {
    mocks.executeDashboard.mockResolvedValueOnce({
      ok: true,
      data: {
        html: '<div data-testid="dashboard">dashboard html</div>',
        components: ["keyword_relevancy", "cpa_trend"],
        warnings: [],
      },
    });
    mocks.executeMonthly.mockResolvedValueOnce({
      ok: true,
      data: {
        html: '<table data-testid="monthly">monthly html</table>',
        metrics: ["spend", "conversions", "cpa"],
        rows: [
          {
            label: "June 2026",
            totals: { spend: 6375, conversions: 75 },
            metrics: { spend: 6375, conversions: 75, cpa: 85 },
          },
        ],
      },
    });
    mocks.executeBudget.mockResolvedValueOnce({
      ok: true,
      data: {
        subject: "Berendsen - Google Ads Budget Report - July 2026",
        html: '<div data-testid="budget"><h3 style="margin:24px 0 16px;font-size:15px">July 2026 (Month-to-Date)</h3><!-- Budget Progress + Time Tracking side by side --><table><tr><td>Time Tracking</td><td>Days Remaining</td></tr></table><h3 style="margin:0 0 8px;font-size:15px">Campaign Breakdown</h3><table><tr><th>MTD Spend</th></tr><tr><td>June campaign rows</td></tr></table></div>',
      },
    });
    mocks.executeDraft.mockResolvedValueOnce({
      ok: true,
      data: {
        draftId: "draft_456",
        messageId: "msg_456",
        gmailUrl: "https://mail.google.com/mail/u/0/#drafts/msg_456",
        subject: "Berendsen - Google Ads Budget Report - July 2026",
      },
    });

    const args = createMonthlyBudgetGmailDraftTool.validate!({
      components: ["keyword_relevancy", "cpa_trend"],
      months: 4,
    });
    const result = await createMonthlyBudgetGmailDraftTool.execute(args, ctx);

    expect(result.ok).toBe(true);
    expect(mocks.executeDashboard).toHaveBeenCalledWith(
      { components: ["keyword_relevancy", "cpa_trend"], months: 14, endMonth: "2026-06" },
      ctx,
    );
    expect(mocks.executeMonthly).toHaveBeenCalledWith(
      expect.objectContaining({ startMonth: "2026-03", endMonth: "2026-06", metrics: ["spend", "conversions", "cpa"] }),
      ctx,
    );
    expect(mocks.executeBudget).toHaveBeenCalledWith({ mode: "this_month", campaignMetricsRange: "LAST_MONTH" }, ctx);
    expect(mocks.executeDraft).toHaveBeenCalledTimes(1);
    const draftArgs = mocks.executeDraft.mock.calls[0]?.[0];
    expect(draftArgs.subject).toBe("Berendsen - Google Ads Budget Report - June 2026");
    expect(draftArgs.htmlBody).toContain("Hey team,");
    expect(draftArgs.htmlBody).toContain("June 2026 delivered 75 conversions at a CPA of $85");
    expect(draftArgs.htmlBody).toContain('data-testid="monthly"');
    expect(draftArgs.htmlBody).toContain('data-testid="dashboard"');
    expect(draftArgs.htmlBody).toContain('data-testid="budget"');
    expect(draftArgs.htmlBody).not.toContain("July 2026 (Month-to-Date)");
    expect(draftArgs.htmlBody).not.toContain("Time Tracking");
    expect(draftArgs.htmlBody).not.toContain("Days Remaining");
    expect(draftArgs.htmlBody).toContain("Campaign Breakdown");
    expect(draftArgs.htmlBody).toContain("June campaign rows");
    expect(draftArgs.htmlBody).toContain(">Spend</th>");
    expect(draftArgs.htmlBody).not.toContain(">MTD Spend</th>");

    const data = result.data as Record<string, unknown>;
    expect(data.gmailUrl).toBe("https://mail.google.com/mail/u/0/#drafts/msg_456");
    expect(data.summary).toBe("June 2026 delivered 75 conversions at a CPA of $85, with Keyword Relevancy, CPA Trend included above the budget tracker.");
    expect(JSON.stringify(data)).not.toContain("monthly html");
    expect(JSON.stringify(data)).not.toContain("dashboard html");
    expect(JSON.stringify(data)).not.toContain("budget html");
  });
});
