import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Ga4PerformancePage from "@/components/Ga4PerformancePage";

vi.mock("@/components/RocketSplash", () => ({ default: () => <div>Loading</div> }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Ga4PerformancePage", () => {
  it("shows the GA4 query error instead of a blank page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/clients/list") {
          return Promise.resolve({
            ok: true,
            json: async () => [{ id: "1", name: "Optimise Digital", ga4Connected: true }],
          });
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: "Failed to fetch GA4 data", details: "invalid metric conversions" }),
        });
      }),
    );

    render(<Ga4PerformancePage />);

    await waitFor(() => {
      expect(screen.getByText(/couldn't load Google Analytics/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/invalid metric conversions/i)).toBeInTheDocument();
  });

  it("labels 12-month daily sessions with month ticks", async () => {
    const daily = Array.from({ length: 365 }, (_, i) => {
      const date = new Date(2025, 7, 29);
      date.setDate(date.getDate() + i);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return { date: `${y}${m}${d}`, users: 10, sessions: 20, pageviews: 30 };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/clients/list") {
          return Promise.resolve({
            ok: true,
            json: async () => [{ id: "1", name: "Optimise Digital", ga4Connected: true }],
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ga4Connected: true,
            overview: {
              users: 1,
              newUsers: 1,
              sessions: 1,
              pageviews: 1,
              bounceRate: 0.4,
              avgSessionDuration: 60,
              engagementRate: 0.5,
              conversions: 1,
            },
            daily,
          }),
        });
      }),
    );

    render(<Ga4PerformancePage />);

    await waitFor(() => {
      expect(screen.getByText("Daily Sessions")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "12 months" }));
    await waitFor(() => {
      expect(screen.getByText(/^Sept\.?$/, { hidden: true })).toBeInTheDocument();
    });
    expect(screen.getByText(/^Jan\.?$/, { hidden: true })).toBeInTheDocument();
    expect(screen.getAllByText(/Aug\.?\s*'?26/, { hidden: true }).length).toBeGreaterThan(0);
  });
});
