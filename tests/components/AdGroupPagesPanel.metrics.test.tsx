// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdGroupPagesPanel } from "@/components/dashboards/landing/AdGroupPagesPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdGroupPagesPanel measurement labels", () => {
  it("shows only Google Ads landing sessions, paid metrics, and compact actions", async () => {
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            adMetricsAvailable: true,
            pages: [
              {
                pageId: "ag-bpo-services-au",
                slug: "bpo-services-au",
                market: "AU",
                url: "https://hire.awaydigitalteams.com/lp/bpo-services-au",
                title: "BPO Services",
                headline: "BPO services without the churn",
                adGroupIds: ["1", "2"],
                noindex: true,
                adGroups: [
                  { id: "1", name: "bpo", campaign: "Search Exact", clicks: 29, cost: 800 },
                  { id: "2", name: "bpo", campaign: "Search Phrase", clicks: 20, cost: 540 },
                ],
                clicks: 49,
                cost: 1340,
                conversions: 0,
                sessions: 12,
                paidSessions: 12,
                engagedSessions: 7,
                paidEngagedSessions: 5,
                trackedConversions: 2,
                paidTrackedConversions: 1,
                averageSeconds: 11,
                paidAverageSeconds: 9,
                bounceRate: 100,
                medianSeconds: 8,
                paidMedianSeconds: 7,
              },
              {
                pageId: "ag-unused-au",
                slug: "unused-au",
                market: "AU",
                url: "https://hire.awaydigitalteams.com/unused-au",
                title: "Unused",
                headline: "No Google Ads visit",
                adGroupIds: ["3"],
                noindex: true,
                adGroups: [{ id: "3", name: "unused", campaign: "Search Other", clicks: 20, cost: 200 }],
                clicks: 20,
                cost: 200,
                conversions: 0,
                sessions: 4,
                paidSessions: 0,
                engagedSessions: 0,
                paidEngagedSessions: 0,
                bounceRate: 100,
                medianSeconds: null,
              },
              {
                pageId: "offshore-teams-au",
                slug: "outsourcing-au",
                market: "AU",
                url: "https://hire.awaydigitalteams.com/outsourcing-au",
                title: "AU outsourcing",
                headline: "Outsourcing, done better",
                adGroupIds: [],
                noindex: false,
                adGroups: [],
                clicks: 0,
                cost: 0,
                conversions: 0,
                sessions: 20,
                paidSessions: 10,
                engagedSessions: 8,
                paidEngagedSessions: 6,
                trackedConversions: 1,
                averageSeconds: 24,
                paidAverageSeconds: 20,
                bounceRate: 40,
                medianSeconds: 20,
                paidMedianSeconds: 18,
              },
            ],
          }),
        }),
      ),
    );

    render(<AdGroupPagesPanel slug="away-digital-teams" />);

    const headline = await screen.findByText("BPO services without the churn");
    const cleanUrl = screen.getByText("hire.awaydigitalteams.com/lp/bpo-services-au");
    expect(screen.getByText("hire.awaydigitalteams.com/outsourcing-au")).toBeTruthy();
    expect(screen.queryByText("hire.awaydigitalteams.com/unused-au")).toBeNull();
    expect(screen.queryByText("https://hire.awaydigitalteams.com/lp/bpo-services-au")).toBeNull();
    expect(headline.compareDocumentPosition(cleanUrl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText("Google Ads clicks")).toHaveLength(2);
    expect(screen.getAllByText("Google Ads sessions")).toHaveLength(2);
    expect(screen.getAllByText("Engaged sessions")).toHaveLength(2);
    expect(screen.getAllByText("Conversions")).toHaveLength(2);
    expect(screen.getAllByText("Conversion rate")).toHaveLength(2);
    expect(screen.getAllByText("Median active time")).toHaveLength(2);
    expect(screen.getByText("7s")).toBeTruthy();
    expect(screen.getByText("18s")).toBeTruthy();
    expect(screen.getByText("8.33%")).toBeTruthy();
    expect(screen.getByText("0.00%")).toBeTruthy();
    expect(screen.getByText(/Only sessions carrying gclid, gbraid or wbraid/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "AU" })).toHaveClass("text-sm");
    const campaign = screen.getByText(/Search Exact, Search Phrase/);
    const adGroup = screen.getByText("bpo", { exact: true });
    expect(campaign).toHaveClass("whitespace-normal");
    expect(campaign.compareDocumentPosition(adGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText(/not mapped/)).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Preview" })[0]?.parentElement).toHaveClass(
      "items-center",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open all" }));
    expect(openMock).toHaveBeenCalledTimes(2);
    expect(openMock).toHaveBeenCalledWith(
      "https://hire.awaydigitalteams.com/lp/bpo-services-au",
      "_blank",
      "noopener,noreferrer",
    );
    expect(openMock).toHaveBeenCalledWith(
      "https://hire.awaydigitalteams.com/outsourcing-au",
      "_blank",
      "noopener,noreferrer",
    );
  });

  /*
   * Per-page conversions count both doorways, exactly as the headline card and
   * the campaign table do. A page-level figure counting only the form would
   * disagree with the total above it, which is how a chat lead sitting in
   * HubSpot came to look like a broken dashboard rather than an uncounted one.
   */
  it("totals form submits and chat sign-ups per page, and rates the total", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            adMetricsAvailable: true,
            pages: [
              {
                pageId: "ag-chatty-au",
                slug: "chatty-au",
                market: "AU",
                url: "https://hire.awaydigitalteams.com/lp/chatty-au",
                title: "Chatty",
                headline: "Chat and form together",
                adGroupIds: ["1"],
                noindex: true,
                adGroups: [{ id: "1", name: "chatty", campaign: "Search Exact", clicks: 40, cost: 900 }],
                clicks: 40,
                cost: 900,
                conversions: 0,
                sessions: 40,
                paidSessions: 40,
                engagedSessions: 20,
                paidEngagedSessions: 18,
                trackedConversions: 5,
                paidTrackedConversions: 3,
                paidChatSessions: 9,
                paidChatLeadSessions: 2,
                averageSeconds: 30,
                paidAverageSeconds: 28,
                bounceRate: 50,
                medianSeconds: 25,
                paidMedianSeconds: 22,
              },
            ],
          }),
        }),
      ),
    );

    render(<AdGroupPagesPanel slug="away-digital-teams" />);
    await screen.findByText("Chat and form together");

    /* Each figure through its own label: several of these numbers repeat across
       the card, so a bare text lookup cannot say which one it found. */
    const figure = (label: string) =>
      screen.getByText(label).parentElement?.textContent?.replace(label, "");

    // 3 form + 2 chat, from 40 paid sessions.
    expect(figure("Conversions")).toBe("5");
    expect(figure("Form submits")).toBe("3");
    expect(figure("Chat sign-ups")).toBe("2");
    // 5/40, not the 7.50% that rating the form half alone would give.
    expect(figure("Conversion rate")).toBe("12.50%");
  });

  it("does not render a second loading panel", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { container } = render(<AdGroupPagesPanel slug="away-digital-teams" />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Loading pages…")).toBeNull();
  });
});
