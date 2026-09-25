// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LandingDashboardReport } from "@/components/dashboards/landing/LandingDashboardReport";

/**
 * Away's report opens on the new layout and one toggle switches every panel -
 * report, page list and chat - to the original layout. Other clients get no
 * toggle and send no layout.
 */

const REPORT = {
  filters: { page: null, device: null, market: null },
  pages: [],
  markets: [],
  devices: [],
  attribution: [],
  experiment: null,
  rangeDays: 7,
  controlVariantId: "a",
  variants: [],
  comparisons: [],
  funnel: [],
  funnelByVariant: {},
  sections: [],
  behaviourTotals: {},
  eventsScanned: 0,
  truncated: false,
};

const EMPTY_CHAT = {
  funnel: [],
  openedBy: { auto: { sessions: 0, started: 0 }, button: { sessions: 0, started: 0 } },
  paths: [],
  dropOff: [],
  droppedSessions: 0,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: async () =>
        url.includes("landing-pages")
          ? { pages: [] }
          : url.includes("landing-chat")
            ? { all: EMPTY_CHAT, paid: EMPTY_CHAT, trackingSince: null, truncated: false }
            : REPORT,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const layoutsRequested = (path: string) =>
  fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes(path))
    .map((url) => new URL(url, "http://x").searchParams.get("layout"));

describe("landing dashboard layout toggle", () => {
  it("opens Away on the new layout and switches every panel together", async () => {
    render(<LandingDashboardReport slug="away-digital-teams" />);

    const current = await screen.findByRole("button", { name: /New layout · from 25 Sep$/ });
    const original = screen.getByRole("button", { name: /Original layout · until 25 Sep$/ });
    expect(current.getAttribute("aria-pressed")).toBe("true");
    expect(original.getAttribute("aria-pressed")).toBe("false");
    for (const path of ["landing-experiments", "landing-pages", "landing-chat"]) {
      expect(layoutsRequested(path)).toContain("current");
      expect(layoutsRequested(path)).not.toContain("original");
    }

    fireEvent.click(original);

    await waitFor(() => {
      for (const path of ["landing-experiments", "landing-pages", "landing-chat"]) {
        expect(layoutsRequested(path)).toContain("original");
      }
    });
    expect(
      (await screen.findByRole("button", { name: /Original layout/ })).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows no toggle and sends no layout for other clients", async () => {
    render(<LandingDashboardReport slug="other-client" />);

    await waitFor(() => expect(layoutsRequested("landing-experiments").length).toBeGreaterThan(0));
    expect(screen.queryByRole("group", { name: "Page layout" })).toBeNull();
    expect(layoutsRequested("landing-experiments").every((layout) => layout === null)).toBe(true);
    expect(layoutsRequested("landing-chat")).toEqual([]);
  });
});
