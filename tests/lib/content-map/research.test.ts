import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildResearchView, buildSeeds, upsertResearchRun, startResearchRun, titleKeywords } from "@/lib/content-map/research";
import { result, snap } from "./research-fixtures";
import { createFakePayload, jsonResponse } from "./fake-payload";

describe("seeds", () => {
  it("topic name, description phrases, page title keywords, planned keywords; 1..10, de-duped", () => {
    const seeds = buildSeeds({
      topic: { key: "cost", name: "Cost", description: "What offshore teams cost, salaries by role", primary: true },
      snapshot: snap(),
      plan: [{ topic: "cost", primaryKeyword: "Developer salary Vietnam" }, { topic: "vietnam", primaryKeyword: "ignored" }],
    });
    expect(seeds[0]).toBe("cost");
    expect(seeds).toContain("what offshore teams cost");
    expect(seeds).toContain("vietnam developer cost");
    expect(seeds).toContain("developer salary vietnam");
    expect(seeds).not.toContain("ignored");
    expect(seeds.length).toBeLessThanOrEqual(10);
    expect(titleKeywords("The 10 best tips for you | Brand")).toBe("best tips");
  });
});

describe("runs", () => {
  beforeEach(() => { vi.stubEnv("GROWTH_TOOLS_URL", "http://gt.test"); vi.stubEnv("INTERNAL_API_KEY", "k"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("ingest is idempotent by runId and a completed run is final", async () => {
    const payload = createFakePayload({ clients: [{ id: 7 }] });
    await upsertResearchRun(payload as never, { clientId: "7", runId: "r1", status: "completed", result: result() });
    await upsertResearchRun(payload as never, { clientId: "7", runId: "r1", status: "completed", result: result() });
    await upsertResearchRun(payload as never, { clientId: "7", runId: "r1", status: "failed", error: "late" });
    const rows = payload.store["content-map-research"] ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "completed", phase: "done" });
    const bad = await upsertResearchRun(payload as never, { clientId: "7", runId: "r2", status: "completed", result: { nope: 1 } });
    expect(bad.doc.status).toBe("failed");
  });

  it("keeps the latest 12 completed runs", async () => {
    const payload = createFakePayload({ clients: [{ id: 7 }] });
    for (let i = 0; i < 14; i++) await upsertResearchRun(payload as never, { clientId: "7", runId: `r${i}`, status: "completed", result: result() });
    expect(payload.store["content-map-research"]).toHaveLength(12);
    expect(payload.store["content-map-research"]?.some((d) => d.runId === "r0")).toBe(false);
  });

  it("start sends location as-is (default Australia) and reuses a run < 60 min", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(202, { runId: "g1", status: "running" }));
    vi.stubGlobal("fetch", fetchMock);
    const payload = createFakePayload({ clients: [{ id: 7, contentMapEnabled: true, websiteUrl: "https://a.com", topicAuthorities: [{ name: "Cost", primary: true }] }] });
    const a = await startResearchRun(payload as never, "7");
    const b = await startResearchRun(payload as never, "7");
    expect(a.ok && b.ok && b.reused).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.location).toBe("Australia");
    expect(body.topics[0].seeds.length).toBeGreaterThan(0);
  });
});

describe("buildResearchView", () => {
  it("coverage = share of volume whose keyword has a page; pairs from ideas", () => {
    const view = buildResearchView({
      latest: { id: 1, status: "completed" },
      done: {
        id: 1, status: "completed", generatedAt: "2026-10-02", result: result(),
        insights: { model: "m", ideas: [
          { id: "i1", topic: "cost", overlaps: ["vietnam"], volume: 300, status: "listed" },
          { id: "i2", topic: "cost", overlaps: ["vietnam"], volume: 100, status: "in-plan" },
          { id: "i3", topic: "cost", overlaps: ["vietnam"], volume: 999, status: "dismissed" },
        ], briefs: {} },
      },
      gsc: null, gscConnected: false, snapshot: snap(),
      authorities: [{ key: "cost", name: "Cost", primary: true }], location: "Australia",
    });
    expect(view?.topics.cost?.covered).toBe(0.75);
    expect(view?.topics.cost?.competitorDomains).toEqual([{ domain: "rival.com", pages: 1 }]);
    expect(view?.pairs).toEqual([{ a: "cost", b: "vietnam", volume: 400, ideas: 2 }]);
    expect(view?.insightsModel).toBe("m");
  });
});
