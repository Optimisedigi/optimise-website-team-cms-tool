import { render, screen, waitFor } from "@testing-library/react";
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
});
