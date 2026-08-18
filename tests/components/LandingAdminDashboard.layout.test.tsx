import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingAdminDashboard } from "@/components/dashboards/landing/LandingAdminDashboard";

/**
 * Guards the shell layout: the report gets the full width, the client picker
 * sits top-right rather than in a sidebar, and the removed Settings block stays
 * removed.
 */

vi.mock("@/components/dashboards/googleads/LandingExperimentTab", () => ({
  LandingExperimentTab: ({ slug }: { slug: string }) => <div data-testid="report">{slug}</div>,
}));

const overview = {
  rangeDays: 30,
  clients: [
    {
      id: 1,
      name: "Away Digital",
      slug: "away-digital",
      sessions30d: 2076,
      conversions30d: 110,
      properties: [{ id: 9, name: "LP", propertyKey: "k", status: "active", domains: [{ hostname: "x.com", status: "live" }] }],
    },
    {
      id: 2,
      name: "Second Client",
      slug: "second-client",
      sessions30d: 40,
      conversions30d: 1,
      properties: [{ id: 10, name: "LP2", propertyKey: "k2", status: "active", domains: [] }],
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

function renderDashboard() {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => overview }));
  return render(<LandingAdminDashboard />);
}

describe("LandingAdminDashboard layout", () => {
  it("gives the report full width instead of a sidebar column", async () => {
    const { container } = renderDashboard();

    await screen.findByTestId("report");
    // The old shell was `lg:grid-cols-[280px_1fr]`; nothing should reserve a
    // fixed sidebar track any more.
    expect(container.innerHTML).not.toContain("280px");
    expect(container.querySelector("aside")).toBeNull();
  });

  it("puts the client picker at the top right, above the report", async () => {
    renderDashboard();

    const group = await screen.findByRole("group", { name: "Select client" });
    const header = group.parentElement!;

    // Heading left, picker right, on one justified row.
    expect(header.className).toContain("justify-between");
    expect(header.firstElementChild!.tagName).toBe("H2");
    expect(header.lastElementChild).toBe(group);

    // Header precedes the report section in document order.
    const report = screen.getByTestId("report");
    expect(header.compareDocumentPosition(report) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("marks the active client and switches the report on click", async () => {
    renderDashboard();

    const group = await screen.findByRole("group", { name: "Select client" });
    const first = within(group).getByRole("button", { name: /Away Digital/ });
    const second = within(group).getByRole("button", { name: /Second Client/ });

    expect(first.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("report").textContent).toBe("away-digital");

    fireEvent.click(second);

    await waitFor(() => expect(screen.getByTestId("report").textContent).toBe("second-client"));
    expect(second.getAttribute("aria-pressed")).toBe("true");
  });

  it("no longer renders the removed settings section", async () => {
    renderDashboard();

    await screen.findByTestId("report");
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
  });
});
