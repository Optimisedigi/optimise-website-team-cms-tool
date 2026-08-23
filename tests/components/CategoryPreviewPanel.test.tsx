// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CategoryPreviewPanel } from "@/components/dashboards/landing/CategoryPreviewPanel";

const PAGE = {
  pageId: "ag-data-engineer-vietnam-us",
  slug: "data-engineer-vietnam-us",
  market: "US",
  url: "http://localhost:4321/data-engineer-vietnam-us.html",
  title: "Hire a data engineer in Vietnam | Away Digital Teams",
  headline: "Hire a data engineer in Vietnam",
  adGroupIds: ["180491343342"],
  noindex: true,
  adGroups: [{
    id: "180491343342",
    name: "Data Engineer",
    campaign: "Category – Developer/IT – US – Exact",
    clicks: 0,
    cost: 0,
  }],
  clicks: 0,
  cost: 0,
  conversions: 0,
  sessions: 0,
  paidSessions: 0,
  engagedSessions: 0,
  paidEngagedSessions: 0,
  bounceRate: null,
  medianSeconds: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CategoryPreviewPanel", () => {
  it("shows category identity and working Preview and Open controls without metrics", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: async () => ({ pages: [
        PAGE,
        { ...PAGE, pageId: "ag-cloud-engineer-vietnam-us", slug: "cloud-engineer-vietnam-us", url: "http://localhost:4321/cloud-engineer-vietnam-us.html", headline: "Hire a cloud engineer in Vietnam", adGroups: [{ ...PAGE.adGroups[0], id: "180491343782", name: "Cloud Engineer" }] },
        { ...PAGE, slug: "generic-outsourcing-us" },
      ] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CategoryPreviewPanel slug="away-digital-teams" range={{ mode: "today" }} />);

    expect(await screen.findByRole("heading", { name: "Category page previews" })).toBeTruthy();
    expect(screen.getByText("Hire a data engineer in Vietnam")).toBeTruthy();
    expect(screen.getAllByText("Category – Developer/IT – US – Exact")).toHaveLength(1);
    expect(screen.getByText("2 pages")).toBeTruthy();
    expect(screen.getByText("Data Engineer")).toBeTruthy();
    expect(screen.getByText("Cloud Engineer")).toBeTruthy();
    expect(screen.queryByText("generic-outsourcing-us")).toBeNull();
    expect(screen.queryByText("Google Ads clicks")).toBeNull();

    const dataCard = screen.getByText("Data Engineer").closest("li")!;
    const open = within(dataCard).getByRole("link", { name: "Open ↗" });
    expect(open).toHaveAttribute("href", PAGE.url);
    expect(open).toHaveAttribute("target", "_blank");

    fireEvent.click(within(dataCard).getByRole("button", { name: "Preview" }));
    expect(screen.getByTitle("Preview of Hire a data engineer in Vietnam")).toHaveAttribute("src", PAGE.url);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("preview=1"));
  });
});
