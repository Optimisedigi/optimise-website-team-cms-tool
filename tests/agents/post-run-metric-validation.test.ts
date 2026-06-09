import { describe, expect, it } from "vitest";
import { checkRunForCorrection } from "@/lib/agents/optimate-google-ads/post-run-checks";

describe("OptiMate post-run metric validation", () => {
  it("requires the canonical monthly tool for monthly CTR answers", () => {
    const correction = checkRunForCorrection(
      "Can I get CTR by month for April and May?",
      "| Month | CTR |\n|---|---|\n| April 2026 | 5.39% |\n| May 2026 | 7.30% |",
      ["get_campaign_performance"],
    );

    expect(correction).toMatchObject({
      reason: "unverified_metric_breakdown",
    });
    expect(correction?.correctionNote).toContain("get_monthly_metric_table");
  });

  it("accepts monthly CTR answers backed by the canonical monthly tool", () => {
    expect(
      checkRunForCorrection(
        "Can I get CTR by month for April and May?",
        "| Month | CTR |\n|---|---|\n| April 2026 | 1.59% |\n| May 2026 | 1.42% |",
        ["get_monthly_metric_table"],
      ),
    ).toBeNull();
  });

  it("requires the canonical weekly tool for weekly CTR answers", () => {
    const correction = checkRunForCorrection(
      "Can I get weekly CTR?",
      "| Week | CTR |\n|---|---|\n| Apr 6 - Apr 12 | 10.17% |",
      ["get_campaign_performance"],
    );

    expect(correction).toMatchObject({
      reason: "unverified_metric_breakdown",
    });
    expect(correction?.correctionNote).toContain("get_weekly_metric_table");
  });

  it("rejects plain Google Ads numbers when no Google Ads read tool was called", () => {
    const correction = checkRunForCorrection(
      "How many clicks did Google Ads get in May?",
      "May had 1,879 clicks.",
      [],
    );

    expect(correction).toMatchObject({
      reason: "unverified_google_ads_data",
    });
    expect(correction?.correctionNote).toContain("Google Ads read tool");
  });

  it("accepts plain Google Ads numbers when a Google Ads read tool was called", () => {
    expect(
      checkRunForCorrection(
        "How many clicks did Google Ads get in May?",
        "May had 1,879 clicks.",
        ["get_monthly_metric_table"],
      ),
    ).toBeNull();
  });
});
