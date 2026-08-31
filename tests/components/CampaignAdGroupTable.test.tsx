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

/**
 * The Conversions column counts both doorways, exactly as the headline card
 * does. A column that counted only the form would disagree with the total above
 * it, and that disagreement is what made a chat lead sitting in HubSpot look
 * like a broken dashboard rather than an uncounted one.
 */
describe("conversions column", () => {
  const CHATTY: CampaignAdGroupRow = {
    ...PAGE,
    pageId: "ag-chatty",
    paidSessions: 20,
    paidTrackedConversions: 3,
    paidChatSessions: 7,
    paidChatLeadSessions: 2,
    adGroups: [{ name: "Chatty", campaign: "Chat campaign" }],
  };

  it("totals form submits and chat sign-ups per ad group", () => {
    render(<CampaignAdGroupTable pages={[CHATTY]} />);

    const row = screen.getByText("Chatty").closest("tr")!;
    const cells = within(row).getAllByRole("cell").map((cell) => cell.textContent);
    // Conversions, form submits, chat sign-ups, chats started: 3 + 2 = 5.
    expect(cells.slice(0, 4)).toEqual(["20", "5", "3", "2"]);
    expect(cells[4]).toBe("7");
  });

  it("totals both doorways across a campaign, not just the form", () => {
    render(
      <CampaignAdGroupTable
        pages={[
          CHATTY,
          {
            ...CHATTY,
            pageId: "ag-chatty-2",
            paidSessions: 10,
            paidTrackedConversions: 1,
            paidChatLeadSessions: 4,
            adGroups: [{ name: "Chatty two", campaign: "Chat campaign" }],
          },
        ]}
      />,
    );

    const totals = screen.getByText("Chat campaign").closest("tr")!;
    const cells = within(totals).getAllByRole("cell").map((cell) => cell.textContent);
    // (3 + 2) + (1 + 4) = 10, from 4 form and 6 chat.
    expect(cells.slice(0, 4)).toEqual(["30", "10", "4", "6"]);
  });

  it("still counts form leads when a row has no chat at all", () => {
    render(<CampaignAdGroupTable pages={[PAGE]} />);

    const row = screen.getByText("Data Engineer").closest("tr")!;
    const cells = within(row).getAllByRole("cell").map((cell) => cell.textContent);
    // Missing chat counts read as zero, never as a missing conversion.
    expect(cells.slice(0, 4)).toEqual(["40", "4", "4", "0"]);
  });
});

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
    /* By position, not by text: with no chat in this fixture the conversions
       total and the form submits under it are both 5, so a bare text lookup
       matches two cells and cannot say which column it found.

       Sessions, conversions, form submits, chat sign-ups, chats started, then
       the session-weighted mean of 90s over 40 and 30s over 10, then checklist. */
    expect(within(totals).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "50",
      "5",
      "5",
      "0",
      "0",
      "1m 18s",
      "3",
    ]);

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

    /* The total leads first, then the two doorways it is made of, then the rest.
       Chat is the doorway the HubSpot widget opens, which this table stayed
       blind to while those visitors were reaching the CRM. */
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Sessions↓",
      "Conversions↓",
      "Form submits↓",
      "Chat sign-ups↓",
      "Chats started↓",
      "Avg time on page↓",
      "Checklist sign-ups↓",
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
