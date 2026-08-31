// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CampaignAdGroupTable, type CampaignAdGroupRow } from "@/components/dashboards/landing/CampaignAdGroupTable";

const PAGE: CampaignAdGroupRow = {
  pageId: "ag-data-engineer-vietnam-us",
  paidSessions: 40,
  paidTrackedConversions: 4,
  paidTimedSessions: 40,
  paidAverageSeconds: 90,
  paidChecklistSessions: 2,
  adGroups: [{ name: "Data Engineer", campaign: "Category – Developer/IT – US – Exact" }],
};

afterEach(cleanup);

describe("CampaignAdGroupTable", () => {
  it("totals each campaign and lists its ad groups", () => {
    render(<CampaignAdGroupTable pages={[
      PAGE,
      { ...PAGE, pageId: "ag-cloud", paidSessions: 10, paidTrackedConversions: 1, paidTimedSessions: 10, paidAverageSeconds: 30, paidChecklistSessions: 1, adGroups: [{ name: "Cloud Engineer", campaign: "Category – Developer/IT – US – Exact" }] },
    ]} />);

    // Grouped under the campaign minus its match type - that is a bidding
    // setting, not a separate campaign.
    const totals = screen.getByText("Category – Developer/IT – US").closest("tr")!;
    expect(within(totals).getByText("50")).toBeTruthy();
    expect(within(totals).getByText("5")).toBeTruthy();
    // Session-weighted mean of 90s over 40 and 30s over 10.
    expect(within(totals).getByText("1m 18s")).toBeTruthy();
    expect(within(totals).getByText("3")).toBeTruthy();

    expect(screen.getByText("Data Engineer")).toBeTruthy();
    expect(screen.getByText("Cloud Engineer")).toBeTruthy();
    // The page's meta title and headline are not part of this table.
    expect(screen.queryByText(/Hire a/)).toBeNull();
  });

  it("folds a campaign's match types into one group", () => {
    render(<CampaignAdGroupTable pages={[
      { ...PAGE, paidSessions: 40, adGroups: [{ name: "Exact ad group", campaign: "Outsourcing – US – Exact" }] },
      { ...PAGE, pageId: "ag-p", paidSessions: 10, adGroups: [{ name: "Phrase ad group", campaign: "Outsourcing – US – Phrase" }] },
    ]} />);

    // One campaign row totalling both, not one row per match type.
    const totals = screen.getByText("Outsourcing – US").closest("tr")!;
    expect(within(totals).getByText("50")).toBeTruthy();
    expect(screen.queryByText(/– (Exact|Phrase)$/)).toBeNull();
    // Both ad groups are still listed beneath it.
    expect(screen.getByText("Exact ad group")).toBeTruthy();
    expect(screen.getByText("Phrase ad group")).toBeTruthy();
  });

  it("sorts ad groups by any metric, and flips the active column", () => {
    render(<CampaignAdGroupTable pages={[
      { ...PAGE, adGroups: [{ name: "Big traffic", campaign: "C" }], paidSessions: 40, paidChecklistSessions: 1 },
      { ...PAGE, pageId: "ag-b", adGroups: [{ name: "Big checklist", campaign: "C" }], paidSessions: 10, paidChecklistSessions: 9 },
    ]} />);

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Sessions↓",
      "Conversions↓",
      "Avg time on page↓",
      "Checklist sign-ups↓",
      // Chat is the doorway the HubSpot widget opens, which this table stayed
      // blind to while those visitors were reaching the CRM.
      "Chats started↓",
      "Chat sign-ups↓",
    ]);

    const names = () => screen.getAllByRole("row").slice(2).map((row) => row.querySelector("th")?.textContent);
    expect(names()).toEqual(["Big traffic", "Big checklist"]);

    fireEvent.click(screen.getByRole("button", { name: /Checklist sign-ups/ }));
    expect(names()).toEqual(["Big checklist", "Big traffic"]);

    fireEvent.click(screen.getByRole("button", { name: /Checklist sign-ups/ }));
    expect(names()).toEqual(["Big traffic", "Big checklist"]);
  });

  it("shows n/a when no session was timed, and renders nothing without paid sessions", () => {
    const { container } = render(<CampaignAdGroupTable pages={[
      { ...PAGE, paidTimedSessions: 0, paidAverageSeconds: null },
    ]} />);
    expect(screen.getAllByText("n/a").length).toBe(2);

    cleanup();
    // Partial coverage is stated, so an average from a fraction of traffic is visible as such.
    render(<CampaignAdGroupTable pages={[{ ...PAGE, paidSessions: 100, paidTimedSessions: 40 }]} />);
    expect(screen.getAllByText("40 of 100 timed")).toHaveLength(2);

    cleanup();
    // Full coverage prints no note at all.
    render(<CampaignAdGroupTable pages={[{ ...PAGE, paidSessions: 40, paidTimedSessions: 40 }]} />);
    expect(screen.queryByText(/of \d+ timed/)).toBeNull();

    cleanup();
    const empty = render(<CampaignAdGroupTable pages={[{ ...PAGE, paidSessions: 0 }]} />);
    expect(empty.container.innerHTML).toBe("");
    expect(container).toBeTruthy();
  });
});
