import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiRow } from "@/components/dashboards/googleads/KpiRow";
import type { GoogleAdsDashboardKpis } from "@/lib/dashboard-types";

/**
 * Payload captured from the live Growth Tools dashboard endpoint:
 *   GET /api/google-ads/dashboard/away-digital
 *       ?range=this_month&customerId=3425353766
 *       &conversionActions=Chat - Email Shared,GTM - P1 Forms
 *
 * conversions = 1 (primary filter), allConversions = 66, so 65 conversions
 * across four actions belong in the Secondary Conv group.
 */
const LIVE_KPIS: GoogleAdsDashboardKpis = {
  spend: 7400,
  clicks: 261,
  impressions: 6551,
  avgCpc: 28.46,
  ctr: 3.98,
  conversions: 1,
  allConversions: 66,
  cpa: 7400,
  conversionsByAction: { "GTM - P1 Forms": 1 },
  allConversionsByAction: {
    "Chat - Interaction": 53,
    "GNG【form visit】contact-us": 10,
    "Chat - Conversation Started": 1,
    "Chat - Quick Reply Click": 1,
    "GTM - P1 Forms": 1,
  },
  prevSpend: null,
  prevClicks: null,
  prevImpressions: null,
  prevAvgCpc: null,
  prevCtr: null,
  prevConversions: null,
  prevAllConversions: null,
  prevCpa: null,
  yoySpend: null,
  yoyClicks: null,
  yoyImpressions: null,
  yoyAvgCpc: null,
  yoyCtr: null,
  yoyConversions: null,
  yoyAllConversions: null,
  yoyCpa: null,
};

const SELECTED = ["Chat - Email Shared", "GTM - P1 Forms"];
const LABELS = { "GTM - P1 Forms": "Form Submit" };

function renderRow(overrides: Partial<GoogleAdsDashboardKpis> = {}) {
  return render(
    <KpiRow
      kpis={{ ...LIVE_KPIS, ...overrides }}
      compareMode="year"
      selectedConversionActions={SELECTED}
      conversionActionLabels={LABELS}
    />,
  );
}

describe("KpiRow secondary conversions", () => {
  it("renders the secondary group for actions outside the primary filter", () => {
    const { container } = renderRow();
    const bar = container.querySelector(".rounded-full.grid") as HTMLElement;

    expect(within(bar).getByText("Secondary Conv (4)")).toBeInTheDocument();
    expect(within(bar).getByText("Chat - Interaction")).toBeInTheDocument();
    expect(within(bar).getByText("GNG【form visit】contact-us")).toBeInTheDocument();
    expect(within(bar).getByText("53")).toBeInTheDocument();
    expect(within(bar).getByText("10")).toBeInTheDocument();
  });

  it("keeps the secondary counts reconciling to allConversions minus primary", () => {
    const { container } = renderRow();
    const bar = container.querySelector(".rounded-full.grid") as HTMLElement;
    const secondaryColumn = bar.children[1] as HTMLElement;

    const counts = Array.from(secondaryColumn.querySelectorAll(".tabular-nums")).map((el) =>
      Number(el.textContent),
    );
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(
      (LIVE_KPIS.allConversions ?? 0) - LIVE_KPIS.conversions,
    );
  });

  it("never shows a selected action in both the primary and secondary groups", () => {
    // "Chat - Email Shared" is selected but has zero primary conversions, so it
    // renders at 0 in Primary Conv. It must not leak into Secondary Conv even
    // when it reports all_conversions.
    const { container } = renderRow({
      allConversionsByAction: {
        ...LIVE_KPIS.allConversionsByAction,
        "Chat - Email Shared": 12,
      },
    });
    const bar = container.querySelector(".rounded-full.grid") as HTMLElement;
    const secondaryColumn = bar.children[1] as HTMLElement;

    expect(within(bar).getByText("Secondary Conv (4)")).toBeInTheDocument();
    expect(within(secondaryColumn).queryByText("Chat - Email Shared")).toBeNull();
  });

  it("aggregates secondary actions that share a dashboard label", () => {
    const { container } = render(
      <KpiRow
        kpis={LIVE_KPIS}
        compareMode="year"
        selectedConversionActions={SELECTED}
        conversionActionLabels={{
          ...LABELS,
          "Chat - Interaction": "Chat",
          "Chat - Conversation Started": "Chat",
          "Chat - Quick Reply Click": "Chat",
        }}
      />,
    );
    const bar = container.querySelector(".rounded-full.grid") as HTMLElement;

    expect(within(bar).getByText("Secondary Conv (2)")).toBeInTheDocument();
    expect(within(bar).getByText("Chat")).toBeInTheDocument();
    expect(within(bar).getByText("55")).toBeInTheDocument();
  });

  it("omits the secondary group when the API sends no breakdown", () => {
    renderRow({ allConversionsByAction: undefined });
    expect(screen.queryByText(/Secondary Conv/)).toBeNull();
    expect(screen.getByText("Primary Conv (2)")).toBeInTheDocument();
  });
});
