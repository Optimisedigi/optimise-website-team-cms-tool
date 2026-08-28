import { beforeEach, describe, expect, it, vi } from "vitest";

const runReport = vi.fn();

vi.mock("googleapis", () => {
  class OAuth2 {
    setCredentials() {}
  }
  return {
    google: {
      auth: { OAuth2 },
      analyticsdata: vi.fn(() => ({ properties: { runReport } })),
    },
  };
});

function metricNames(callIndex: number): string[] {
  return (runReport.mock.calls[callIndex][0].requestBody.metrics as { name: string }[]).map(
    (metric) => metric.name,
  );
}

describe("fetchGa4Report", () => {
  beforeEach(() => {
    runReport.mockReset();
    runReport.mockImplementation(async ({ requestBody }: { requestBody: { metrics: { name: string }[] } }) => ({
      data: {
        rows: [
          {
            dimensionValues: [{ value: "Organic Search" }, { value: "Home" }],
            metricValues: requestBody.metrics.map((_, index) => ({ value: String(index + 1) })),
          },
        ],
      },
    }));
  });

  it("requests keyEvents instead of the deprecated conversions metric", async () => {
    const { fetchGa4Report } = await import("@/lib/ga4-service");
    const report = await fetchGa4Report("token", "123456", "2026-07-01", "2026-07-31");

    const overviewMetrics = metricNames(0);
    expect(overviewMetrics).toContain("keyEvents");
    expect(overviewMetrics).not.toContain("conversions");
    expect(metricNames(1)).toContain("keyEvents");
    expect(metricNames(1)).not.toContain("conversions");
    expect(report.overview.keyEvents).toBe(8);
    expect(report.overview.conversions).toBe(8);
  });
});
