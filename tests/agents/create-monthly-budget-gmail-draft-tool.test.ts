import { beforeEach, describe, expect, it, vi } from "vitest";
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
    mocks.executeDashboard.mockReset();
    mocks.executeMonthly.mockReset();
    mocks.executeBudget.mockReset();
    mocks.executeDraft.mockReset();
  });

  it("asks which components to include and does not create a draft when components are missing", async () => {
    const args = createMonthlyBudgetGmailDraftTool.validate!({});
    const result = await createMonthlyBudgetGmailDraftTool.execute(args, ctx);

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      needsClarification: true,
      validComponents: ["keyword_relevancy", "cpa_trend", "quality_score", "top_converters"],
    });
    expect(String((result.data as { message: string }).message)).toContain("Which monthly email components");
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
        subject: "Berendsen - Google Ads Budget Report - June 2026",
        html: '<div data-testid="budget">budget html</div>',
      },
    });
    mocks.executeDraft.mockResolvedValueOnce({
      ok: true,
      data: {
        draftId: "draft_456",
        messageId: "msg_456",
        gmailUrl: "https://mail.google.com/mail/u/0/#drafts/msg_456",
        subject: "Berendsen - Google Ads Budget Report - June 2026",
      },
    });

    const args = createMonthlyBudgetGmailDraftTool.validate!({
      components: ["keyword_relevancy", "cpa_trend"],
      months: 4,
    });
    const result = await createMonthlyBudgetGmailDraftTool.execute(args, ctx);

    expect(result.ok).toBe(true);
    expect(mocks.executeDashboard).toHaveBeenCalledWith(
      { components: ["keyword_relevancy", "cpa_trend"], months: 4 },
      ctx,
    );
    expect(mocks.executeMonthly).toHaveBeenCalledWith(
      expect.objectContaining({ metrics: ["spend", "conversions", "cpa"] }),
      ctx,
    );
    expect(mocks.executeBudget).toHaveBeenCalledWith({ mode: "this_month" }, ctx);
    expect(mocks.executeDraft).toHaveBeenCalledTimes(1);
    const draftArgs = mocks.executeDraft.mock.calls[0]?.[0];
    expect(draftArgs.subject).toBe("Berendsen - Google Ads Budget Report - June 2026");
    expect(draftArgs.htmlBody).toContain("Hey team,");
    expect(draftArgs.htmlBody).toContain("June 2026 delivered 75 conversions at a CPA of $85");
    expect(draftArgs.htmlBody).toContain('data-testid="monthly"');
    expect(draftArgs.htmlBody).toContain('data-testid="dashboard"');
    expect(draftArgs.htmlBody).toContain('data-testid="budget"');

    const data = result.data as Record<string, unknown>;
    expect(data.gmailUrl).toBe("https://mail.google.com/mail/u/0/#drafts/msg_456");
    expect(data.summary).toBe("June 2026 delivered 75 conversions at a CPA of $85, with Keyword Relevancy, CPA Trend included above the budget tracker.");
    expect(JSON.stringify(data)).not.toContain("monthly html");
    expect(JSON.stringify(data)).not.toContain("dashboard html");
    expect(JSON.stringify(data)).not.toContain("budget html");
  });
});
