import { beforeEach, describe, expect, it, vi } from "vitest";

const inspect = vi.fn();

vi.mock("googleapis", () => {
  class OAuth2 {
    setCredentials() {}
  }
  return {
    google: {
      auth: { OAuth2 },
      searchconsole: vi.fn(() => ({
        urlInspection: { index: { inspect } },
      })),
    },
  };
});

function urls(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `https://example.com/page-${index}`);
}

function indexedResponse() {
  return { data: { inspectionResult: { indexStatusResult: { coverageState: "Submitted and indexed" } } } };
}

describe("inspectUrlBatch", () => {
  beforeEach(() => {
    vi.useRealTimers();
    inspect.mockReset();
    inspect.mockImplementation(async () => indexedResponse());
  });

  it("stops at the time budget and returns a resumable prefix", async () => {
    const { inspectUrlBatch } = await import("@/lib/gsc-service");

    // Each inspection is slow enough that the budget expires mid-batch.
    inspect.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return indexedResponse();
    });

    const all = urls(40);
    const results = await inspectUrlBatch("token", "sc-domain:example.com", all, {
      budgetMs: 150,
      concurrency: 2,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThan(all.length);
    // Prefix ordering is what lets the next chunk resume from results.length.
    expect(results.map((r) => r.url)).toEqual(all.slice(0, results.length));
  });

  it("inspects every url when the budget is generous", async () => {
    const { inspectUrlBatch } = await import("@/lib/gsc-service");

    const all = urls(8);
    const results = await inspectUrlBatch("token", "sc-domain:example.com", all, {
      budgetMs: 60_000,
      concurrency: 4,
    });

    expect(results.map((r) => r.url)).toEqual(all);
    expect(inspect).toHaveBeenCalledTimes(8);
  });

  it("runs inspections concurrently within a wave", async () => {
    const { inspectUrlBatch } = await import("@/lib/gsc-service");

    let inFlight = 0;
    let peak = 0;
    inspect.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight--;
      return indexedResponse();
    });

    await inspectUrlBatch("token", "sc-domain:example.com", urls(8), { concurrency: 4 });

    expect(peak).toBe(4);
  });

  it("returns only the results preceding a rate limit", async () => {
    const { inspectUrlBatch } = await import("@/lib/gsc-service");

    let call = 0;
    inspect.mockImplementation(async () => {
      call++;
      if (call > 2) throw Object.assign(new Error("Quota exceeded"), { code: 429 });
      return indexedResponse();
    });

    const all = urls(10);
    const results = await inspectUrlBatch("token", "sc-domain:example.com", all, { concurrency: 2 });

    expect(results.map((r) => r.url)).toEqual(all.slice(0, 2));
    expect(results.every((r) => r.coverageState === "Submitted and indexed")).toBe(true);
  });

  it("records non-rate-limit failures and keeps going", async () => {
    const { inspectUrlBatch } = await import("@/lib/gsc-service");

    inspect.mockImplementationOnce(async () => {
      throw new Error("Inspection exploded");
    });

    const results = await inspectUrlBatch("token", "sc-domain:example.com", urls(3), { concurrency: 1 });

    expect(results).toHaveLength(3);
    expect(results[0].coverageState).toBe("inspection_failed");
    expect(results[0].error).toBe("Inspection exploded");
    expect(results[1].coverageState).toBe("Submitted and indexed");
  });

  it("defaults to sequential inspection with no budget", async () => {
    const { inspectUrlBatch } = await import("@/lib/gsc-service");

    let inFlight = 0;
    let peak = 0;
    inspect.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return indexedResponse();
    });

    const results = await inspectUrlBatch("token", "sc-domain:example.com", urls(3));

    expect(peak).toBe(1);
    expect(results).toHaveLength(3);
  });
});
