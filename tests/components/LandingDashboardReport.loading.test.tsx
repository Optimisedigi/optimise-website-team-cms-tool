// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LandingDashboardReport } from "@/components/dashboards/landing/LandingDashboardReport";

/** Resolves when the test says so, so "still loading" is an observable state. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LandingDashboardReport loading order", () => {
  it("keeps the lower panels out of sight until the report has loaded", async () => {
    const report = deferred<Record<string, unknown>>();

    vi.stubGlobal("fetch", vi.fn((input: string) => {
      // The report is held open; every other panel answers immediately, which is
      // the race that used to leave a stray card under the rocket splash.
      if (input.includes("landing-experiments")) {
        return report.promise.then((json) => ({ ok: true, json: async () => json }));
      }
      return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "fetch failed" }) });
    }));

    const { container } = render(<LandingDashboardReport slug="away-digital-teams" />);

    // The panels are mounted (so their requests run in parallel) but hidden.
    const shade = () => container.querySelector("[hidden]");
    await waitFor(() => expect(shade()).not.toBeNull());
    // Mounted, but inside the hidden shade - never painted beside the rocket.
    expect(shade()!.contains(screen.getByText("Category page previews"))).toBe(true);

    report.resolve({ variants: [], comparisons: [], funnel: [], sections: [], pages: [], devices: [], markets: [] });

    await waitFor(() => expect(container.querySelector("[hidden]")).toBeNull());
  });
});
