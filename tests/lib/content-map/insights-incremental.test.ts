import { describe, expect, it, vi } from "vitest";
const afterMock = vi.hoisted(() => vi.fn());
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: afterMock }));
import { healResearchInsights, trimResearchInput, writeResearchInsights } from "@/lib/content-map/placement";
import { parseResearchInsights } from "@/lib/content-map/research";
import { citationInsightsStalled, healCitationInsights, writeInsights } from "@/lib/content-map/citations";
import { parseInsights } from "@/lib/content-map/plan";
import type { CitationsResult, ResearchResult } from "@/lib/content-map/types";
import { createFakePayload } from "./fake-payload";
import { snap } from "./research-fixtures";

const KEYS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
const NOW = Date.parse("2026-10-23T10:00:00.000Z");
const brief = { priority: "high", primaryKeyword: "x", outline: ["What is it?"], answerFirst: "A direct answer.", schema: ["Article"] };

function researchResult(): ResearchResult {
  return {
    version: 1, clientId: "7", siteUrl: "https://a.com", location: "Australia", generatedAt: "2026-10-23T08:00:00.000Z",
    topics: KEYS.map((key) => ({
      key,
      keywords: [{ keyword: `${key} service demand`, volume: 500, competition: null, cpcLow: null, cpcHigh: null }],
      questions: [],
      competitors: { domains: [], pages: [] },
      totals: { volume: 500, keywords: 1, questions: 0 }, errors: [],
    })),
    stats: { keywords: KEYS.length, questions: 0, competitorPages: 0 },
  };
}

const topicOf = (user: string) => /\(key: ([a-z]+)\)/.exec(user)?.[1] ?? "";
const reply = (key: string) => JSON.stringify({ ideas: [{ title: `Complete guide to ${key} services`, question: `What does ${key} cost?`, keywords: [`${key} service demand`], topic: key, fit: 0.8, placement: "new-article", ...brief }] });

function setup(insights?: unknown) {
  const payload = createFakePayload({
    clients: [{ id: 7, websiteUrl: "https://a.com", topicAuthorities: KEYS.map((k, i) => ({ name: k, primary: i === 0 })) }],
    "content-map-snapshots": [{ id: 1, client: 7, status: "completed", generatedAt: "2026-10-01", data: snap() }],
    "content-map-suggestions": [],
    "content-map-research": [{ id: 50, client: 7, status: "completed", generatedAt: "2026-10-23T08:00:00.000Z", result: researchResult(), ...(insights ? { insights } : {}) }],
  });
  const stored = () => parseResearchInsights(payload.store["content-map-research"]?.[0]?.insights);
  return { payload, stored, doc: () => ({ ...(payload.store["content-map-research"]?.[0] ?? {}) }) as Record<string, unknown> };
}

describe("research insights: parallel + incremental", () => {
  it("runs at most 4 topics in flight and saves after each topic", async () => {
    const { payload, stored, doc } = setup();
    let inFlight = 0;
    let peak = 0;
    const savesSeen: number[] = [];
    const call = vi.fn(async (_p: unknown, i: { user: string; timeoutMs?: number }) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      expect(i.timeoutMs).toBe(120_000);
      return { text: reply(topicOf(i.user)), model: "kimi-k3" };
    });
    payload.update.mockImplementation(async (args: { collection: string; id: unknown; data: Record<string, unknown> }) => {
      const d = payload.store[args.collection]?.find((x) => String(x.id) === String(args.id));
      Object.assign(d ?? {}, args.data);
      const ins = parseResearchInsights(args.data.insights);
      if (ins?.complete === false) savesSeen.push(ins.topicsDone?.length ?? 0);
      return { ...d };
    });
    const out = await writeResearchInsights(payload as never, doc(), { call, now: () => NOW });
    expect(out.ok).toBe(true);
    expect(peak).toBe(4);
    expect(call).toHaveBeenCalledTimes(6);
    // Initial marker save, then one per finished topic.
    expect(savesSeen).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const final = stored();
    expect(final?.complete).toBe(true);
    expect(final?.topicsDone).toEqual(KEYS);
    expect(final?.ideas.filter((i) => i.status === "in-plan")).toHaveLength(6);
  });

  it("a hanging topic doesn't lose the others' saved ideas; statuses wait for every topic", async () => {
    const { payload, stored, doc } = setup();
    const call = vi.fn(async (_p: unknown, i: { user: string }) => {
      const key = topicOf(i.user);
      if (key === "delta") return new Promise<never>(() => {}); // the function is killed mid-call
      if (key === "echo") throw new Error("boom");
      return { text: reply(key), model: "kimi-k3" };
    });
    void writeResearchInsights(payload as never, doc(), { call, now: () => NOW });
    await vi.waitFor(() => expect(stored()?.topicsDone).toHaveLength(4));
    const partial = stored();
    expect(partial?.complete).toBe(false);
    expect(partial?.topicsFailedKeys).toEqual(["echo"]);
    expect(partial?.ideas.map((i) => i.topic).sort()).toEqual(["alpha", "bravo", "charlie", "foxtrot"]);
    // No final statuses / suggestions yet.
    expect(partial?.ideas.every((i) => i.status === "listed")).toBe(true);
    expect(payload.store["content-map-suggestions"]).toHaveLength(0);

    // Next run (self-heal) calls only the missing topics, then finishes.
    const call2 = vi.fn(async (_p: unknown, i: { user: string }) => ({ text: reply(topicOf(i.user)), model: "kimi-k3" }));
    const out = await writeResearchInsights(payload as never, doc(), { call: call2, now: () => NOW });
    expect(out.ok).toBe(true);
    expect(call2.mock.calls.map((c) => topicOf(c[1].user)).sort()).toEqual(["delta", "echo"]);
    expect(stored()?.complete).toBe(true);
    expect(stored()?.ideas.filter((i) => i.status === "in-plan")).toHaveLength(6);
  });

  it("trims each topic's model input", () => {
    const kw = Array.from({ length: 60 }, (_, i) => ({ keyword: `k${i}`, volume: i, competition: null, cpcLow: null, cpcHigh: null }));
    const page = { url: "u", domain: "d", title: "t", headings: Array.from({ length: 12 }, (_, i) => `h${i}`), summary: "", keyword: "k", position: 1, ok: true };
    const out = trimResearchInput({
      topic: { key: "a", name: "A", primary: true } as never,
      keywords: kw,
      questions: Array.from({ length: 50 }, (_, i) => ({ question: `q${i}`, source: "people_also_ask", volume: null })) as never,
      competitors: Array.from({ length: 10 }, () => page),
      gsc: Array.from({ length: 30 }, (_, i) => ({ query: `g${i}` })) as never,
      planned: [],
    });
    expect(out.keywords).toHaveLength(40);
    expect(out.keywords[0]?.keyword).toBe("k59");
    expect(out.questions).toHaveLength(30);
    expect(out.competitors).toHaveLength(6);
    expect(out.competitors[0]?.headings).toHaveLength(8);
    expect(out.gsc).toHaveLength(20);
  });
});

describe("research insights self-heal", () => {
  it("restarts a stalled run once, not again within 6 min, and not for a fresh run", async () => {
    afterMock.mockReset();
    const { payload, doc } = setup();
    // Run finished 2 min ago: leave it to the ingest job.
    expect(await healResearchInsights(payload as never, doc(), { now: () => Date.parse("2026-10-23T08:02:00.000Z") })).toBe(false);
    expect(await healResearchInsights(payload as never, doc(), { now: () => NOW })).toBe(true);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(parseResearchInsights(doc().insights)?.insightsStartedAt).toBe(new Date(NOW).toISOString());
    expect(await healResearchInsights(payload as never, doc(), { now: () => NOW + 5 * 60_000 })).toBe(false);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(await healResearchInsights(payload as never, doc(), { now: () => NOW + 7 * 60_000 })).toBe(true);
    expect(afterMock).toHaveBeenCalledTimes(2);
  });

  it("ignores complete (and legacy, unflagged) insights", async () => {
    const { payload, doc } = setup({ model: "m", generatedAt: "x", gscId: null, ideas: [], briefs: {}, inProgress: [], topicsFailed: 0 });
    expect(await healResearchInsights(payload as never, doc(), { now: () => NOW })).toBe(false);
  });
});

describe("research insights: failed topics retry", () => {
  it("keeps the run open while a failed topic has attempts left, then completes after 3 with the reason recorded", async () => {
    const { payload, stored, doc } = setup();
    const call = vi.fn(async (_p: unknown, i: { user: string }) => {
      const key = topicOf(i.user);
      // echo's ideas all lack evidence: nothing kept.
      return { text: key === "echo" ? JSON.stringify({ ideas: [{ title: "An idea with nothing behind it", question: "Why?", keywords: ["nope"], topic: "echo", fit: 0.5, placement: "new-article", ...brief }] }) : reply(key), model: "m" };
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await writeResearchInsights(payload as never, doc(), { call, now: () => NOW });
    expect(stored()).toMatchObject({ complete: false, topicsFailedKeys: ["echo"], topicAttempts: { echo: 1 } });
    expect(stored()?.topicsFailedReasons?.echo).toContain("1 no evidence");
    expect(warn.mock.calls.some((c) => String(c[0]).includes("noEvidence=1"))).toBe(true);
    expect(stored()?.ideas.filter((i) => i.status === "in-plan")).toHaveLength(5);
    call.mockClear();
    await writeResearchInsights(payload as never, doc(), { call, now: () => NOW });
    expect(call.mock.calls.map((c) => topicOf(c[1].user))).toEqual(["echo"]);
    expect(stored()).toMatchObject({ complete: false, topicAttempts: { echo: 2 } });
    await writeResearchInsights(payload as never, doc(), { call, now: () => NOW });
    expect(stored()).toMatchObject({ complete: true, topicsFailedKeys: ["echo"], topicAttempts: { echo: 3 } });
    expect(stored()?.ideas.filter((i) => i.status === "in-plan")).toHaveLength(5);
    expect(await healResearchInsights(payload as never, doc(), { now: () => NOW + 60 * 60_000 })).toBe(false);
    warn.mockRestore();
  });

  it("an old-format doc (complete, failures, no topicAttempts) self-heals and retries only the failed topics", async () => {
    afterMock.mockReset();
    const { payload, stored, doc } = setup({
      model: "m", generatedAt: "x", gscId: null, ideas: [], briefs: {}, inProgress: [], topicsFailed: 5,
      topicsDone: ["alpha"], topicsFailedKeys: KEYS.slice(1), complete: true, insightsStartedAt: "2026-10-23T08:00:00.000Z",
    });
    expect(await healResearchInsights(payload as never, doc(), { now: () => NOW })).toBe(true);
    const call = vi.fn(async (_p: unknown, i: { user: string }) => ({ text: reply(topicOf(i.user)), model: "m" }));
    await writeResearchInsights(payload as never, doc(), { call, now: () => NOW });
    expect(call.mock.calls.map((c) => topicOf(c[1].user)).sort()).toEqual(KEYS.slice(1));
    expect(stored()).toMatchObject({ complete: true, topicsFailedKeys: [] });
    expect(stored()?.topicAttempts?.bravo).toBe(2);
  });
});

describe("citation insights: incremental + self-heal", () => {
  const citationResult = (): CitationsResult => ({
    version: 1, clientId: "7", siteUrl: "https://a.com", generatedAt: "2026-10-23T08:00:00.000Z", engines: ["chatgpt"],
    questions: KEYS.slice(0, 3).map((k) => ({
      id: `q-${k}`, topic: k, question: `Is ${k} worth it?`,
      results: [{ engine: "chatgpt", ok: true, clientCited: false, clientMentioned: false, cited: [{ url: "https://o.com/x", domain: "o.com", title: "O" }], answer: "" }],
    })),
    sources: [],
    stats: { questions: 3, checks: 3, okChecks: 3, clientCitedChecks: 0, clientMentionedChecks: 0, topDomains: [] },
  }) as unknown as CitationsResult;

  it("saves each topic as it finishes and resumes only the missing ones", async () => {
    const payload = createFakePayload({
      clients: [{ id: 7, websiteUrl: "https://a.com", topicAuthorities: KEYS.slice(0, 3).map((k, i) => ({ name: k, primary: i === 0 })) }],
      "content-map-citations": [{ id: 5, client: 7, status: "completed", generatedAt: "2026-10-23T08:00:00.000Z", result: citationResult() }],
    });
    const row = () => ({ ...(payload.store["content-map-citations"]?.[0] ?? {}) }) as Record<string, unknown>;
    const gap = (k: string) => JSON.stringify({ gaps: [{ questionId: `q-${k}`, title: `Is ${k} really worth it in 2026`, why: "", priority: "high" }], refresh: [], plan: [] });
    const call = vi.fn(async (_p: unknown, i: { user: string }) => {
      const k = topicOf(i.user);
      if (k === "charlie") return new Promise<never>(() => {});
      return { text: gap(k), model: "kimi-k3" };
    });
    void writeInsights(payload as never, row(), { call, now: () => NOW });
    await vi.waitFor(() => expect(parseInsights(row().insights)?.topicsDone).toHaveLength(2));
    expect(parseInsights(row().insights)).toMatchObject({ complete: false });
    expect(parseInsights(row().insights)?.gaps).toHaveLength(2);
    expect(citationInsightsStalled(row(), NOW)).toBe(false); // job started just now
    expect(citationInsightsStalled(row(), NOW + 7 * 60_000)).toBe(true);

    afterMock.mockReset();
    expect(await healCitationInsights(payload as never, row(), { now: () => NOW + 7 * 60_000 })).toBe(true);
    expect(await healCitationInsights(payload as never, row(), { now: () => NOW + 8 * 60_000 })).toBe(false);
    expect(afterMock).toHaveBeenCalledTimes(1);

    const call2 = vi.fn(async (_p: unknown, i: { user: string }) => ({ text: gap(topicOf(i.user)), model: "kimi-k3" }));
    const res = await writeInsights(payload as never, row(), { call: call2, now: () => NOW });
    expect(call2).toHaveBeenCalledTimes(1);
    expect(res.ok && res.insights.gaps).toHaveLength(3);
    expect(parseInsights(row().insights)?.complete).toBe(true);
  });
});
