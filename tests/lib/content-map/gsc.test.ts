import { describe, expect, it, vi } from "vitest";
vi.mock("googleapis", () => ({ google: { searchconsole: vi.fn(() => { throw new Error("no real google in tests"); }) } }));
vi.mock("@/lib/gsc-service", () => ({ refreshAccessToken: vi.fn(async () => { throw new Error("no real refresh"); }) }));
import { buildGscSignals, isQuestionQuery, normPath, nodeIndex, pullGsc, RETAIN_GSC_PULLS } from "@/lib/content-map/gsc";
import { createFakePayload } from "./fake-payload";
import { snap } from "./research-fixtures";

const NOW = Date.parse("2026-10-20T00:00:00.000Z");

describe("URL → node mapping", () => {
  it("normalises host, case, query, trailing slash", () => {
    expect(normPath("https://www.a.com/Blog/Dev-Cost?utm=1#x")).toBe("/blog/dev-cost/");
    expect(nodeIndex(snap()).get(normPath("https://a.com/blog/hire"))).toBe("/blog/hire/");
    expect(isQuestionQuery("how much is it")).toBe(true);
    expect(isQuestionQuery("vietnam devs")).toBe(false);
  });
});

describe("signals", () => {
  const doc = {
    id: 1, pulledAt: "x",
    pages: [
      { page: "https://a.com/blog/dev-cost", clicks: 70, impressions: 1000, position: 8, prevClicks: 100 },
      { page: "https://a.com/blog/hire/", clicks: 5, impressions: 500, position: 12, prevClicks: null },
      { page: "https://a.com/unknown/", clicks: 1, impressions: 9, position: 40, prevClicks: 1 },
    ],
    queries: [
      { query: "offshore payroll rules", page: "https://a.com/blog/hire/", clicks: 0, impressions: 300, position: 25 },
      { query: "vietnam devs", page: "https://a.com/blog/dev-cost/", clicks: 5, impressions: 100, position: 6 },
      { query: "vietnam devs", page: "https://a.com/blog/hire/", clicks: 1, impressions: 60, position: 9 },
      { query: "is vietnam developer cost cheap", page: "https://a.com/blog/dev-cost/", clicks: 2, impressions: 40, position: 5 },
    ],
  };
  const s = buildGscSignals(doc, snap());

  it("page signals with clicksChange (null without baseline), unknown URLs skipped", () => {
    const cost = s.pages.find((p) => p.nodeId === "/blog/dev-cost/");
    expect(cost?.clicksChange).toBe(-0.3);
    expect(s.pages.find((p) => p.nodeId === "/blog/hire/")?.clicksChange).toBeNull();
    expect(s.pages).toHaveLength(2);
  });
  it("unanswered / cannibal / question", () => {
    const kind = (q: string) => s.queries.find((x) => x.query === q)?.kind;
    expect(kind("offshore payroll rules")).toBe("unanswered");
    expect(kind("vietnam devs")).toBe("cannibal");
    expect(s.queries.find((x) => x.query === "vietnam devs")?.pages).toEqual(["/blog/dev-cost/", "/blog/hire/"]);
    expect(kind("is vietnam developer cost cheap")).toBe("question");
    expect(s.queries.find((x) => x.query === "offshore payroll rules")?.topic).toBe("vietnam");
  });
});

describe("pullGsc", () => {
  it("not connected → connected:false, no throw", async () => {
    const payload = createFakePayload({ clients: [{ id: 7, gscConnected: false }] });
    await expect(pullGsc(payload as never, "7")).resolves.toMatchObject({ ok: false, connected: false });
  });
  it("expired token whose refresh fails → connected:false, no throw", async () => {
    const payload = createFakePayload({ clients: [{ id: 7, gscConnected: true, gscRefreshToken: "r", gscAccessToken: "a", gscTokenExpiry: "2020-01-01", gscPropertyUrl: "sc-domain:a.com" }] });
    await expect(pullGsc(payload as never, "7", { now: () => NOW })).resolves.toMatchObject({ ok: false, connected: false });
  });
  it("pulls 28 days query×page + previous by page, refreshes token, keeps 8", async () => {
    const payload = createFakePayload({ clients: [{ id: 7, gscConnected: true, gscRefreshToken: "r", gscAccessToken: "old", gscTokenExpiry: "2020-01-01", gscPropertyUrl: "sc-domain:a.com" }] });
    const query = vi.fn(async (i: { dimensions: string[] }) =>
      i.dimensions.length === 2 ? [{ keys: ["q", "https://a.com/blog/hire/"], clicks: 4, impressions: 10, position: 3 }] : [{ keys: ["https://a.com/blog/hire/"], clicks: 2 }]);
    const refresh = vi.fn(async () => ({ accessToken: "new", expiry: "2027-01-01T00:00:00.000Z" }));
    for (let i = 0; i < RETAIN_GSC_PULLS + 2; i++) await pullGsc(payload as never, "7", { now: () => NOW + i * 1000, query, refresh });
    expect(payload.store.clients?.[0]?.gscAccessToken).toBe("new");
    expect(query.mock.calls[0]?.[0]).toMatchObject({ dimensions: ["query", "page"], rowLimit: 25000, endDate: "2026-10-17", startDate: "2026-09-20" });
    expect(payload.store["content-map-gsc"]).toHaveLength(RETAIN_GSC_PULLS);
    expect(payload.store["content-map-gsc"]?.[0]?.pages).toEqual([{ page: "https://a.com/blog/hire/", clicks: 4, impressions: 10, position: 3, prevClicks: 2 }]);
  });
});
