import { describe, expect, it, vi } from "vitest";
import sampleJson from "../../fixtures/content-map-snapshot-sample.json";
import { createFakePayload, type FakePayload } from "./fake-payload";
import { createSuggestion, decideSuggestion, parseSuggestionInput, plainText, toSuggestionView } from "@/lib/content-map/suggestions";
import { addQuestion, ensureQuestions, removeQuestion } from "@/lib/content-map/questions";
import {
  applyCitationRetention,
  brandTerms,
  buildCitationsView,
  maybeStartWeeklyCitations,
  needsInsights,
  startCitationRun,
  upsertCitationRun,
  writeInsights,
} from "@/lib/content-map/citations";
import { buildPlan, type CitationInsights } from "@/lib/content-map/plan";
import { recommendationToBrief } from "@/lib/content-map/brief";
import { toClientView } from "@/lib/content-map/client-view";
import { authoritiesFromClient } from "@/lib/content-map/authorities";
import type { CitationsResult, ContentMapApiResponse, ContentMapSnapshot, PlanItem } from "@/lib/content-map/types";

const sample = sampleJson as unknown as ContentMapSnapshot;
const rec1 = sample.recommendations[0];
if (!rec1) throw new Error("fixture");
const client = {
  id: 7,
  name: "Away Digital Teams",
  tradingName: "Away",
  websiteUrl: "https://www.awaydigitalteams.com",
  contentMapEnabled: true,
  topicAuthorities: [{ name: "Vietnam", primary: true }, { name: "Cost" }],
};
const authorities = authoritiesFromClient(client);
const model = (text: string) => vi.fn(async () => ({ text, model: "kimi-k3" }));
const NOW = Date.parse("2026-10-23T00:00:00.000Z");

function result(questions: Array<{ id: string; topic: string; question: string; clientCited?: boolean }>): CitationsResult {
  return {
    version: 1,
    clientId: "7",
    siteUrl: "https://awaydigitalteams.com",
    generatedAt: "2026-10-22T10:00:00.000Z",
    engines: ["chatgpt", "perplexity"],
    questions: questions.map((q) => ({
      id: q.id,
      topic: q.topic,
      question: q.question,
      results: [
        { engine: "chatgpt", ok: true, answer: "secret answer", cited: [{ url: "https://deel.com/a", domain: "deel.com" }], clientCited: false, clientMentioned: false },
        {
          engine: "perplexity",
          ok: true,
          answer: "secret answer",
          cited: q.clientCited ? [{ url: "https://awaydigitalteams.com/x", domain: "awaydigitalteams.com" }] : [{ url: "https://statista.com/b", domain: "statista.com" }, { url: "https://deel.com/a", domain: "deel.com" }],
          clientCited: Boolean(q.clientCited),
          clientMentioned: false,
        },
      ],
    })),
    sources: [{ url: "https://deel.com/a", domain: "deel.com", title: "Deel guide", headings: ["Costs"], summary: "s", words: 900, citedBy: 2, questionIds: ["q1"], ok: true }],
    stats: { questions: questions.length, checks: questions.length * 2, okChecks: questions.length * 2, clientCitedChecks: 1, clientMentionedChecks: 0, topDomains: [{ domain: "deel.com", count: 2 }] },
  };
}

describe("suggestions", () => {
  it("sanitises to plain text and enforces the §3 limits", () => {
    expect(plainText("<b>Hi</b>\u0000 there<script>x</script>")).toBe("Hi there x");
    expect(parseSuggestionInput({ kind: "topic", title: "<i>ab</i>", why: "" }, authorities)).toMatchObject({ ok: false, status: 400 });
    expect(parseSuggestionInput({ kind: "topic", title: "x".repeat(161) }, authorities)).toMatchObject({ ok: false });
    expect(parseSuggestionInput({ kind: "topic", title: "Hiring devs", why: "y".repeat(601) }, authorities)).toMatchObject({ ok: false });
    expect(parseSuggestionInput({ kind: "article", title: "Hiring devs", topic: "nope" }, authorities)).toMatchObject({ ok: false });
    expect(parseSuggestionInput({ kind: "bridge", title: "Hiring devs", topic: "cost", topicB: "cost" }, authorities)).toMatchObject({ ok: false });
    expect(parseSuggestionInput({ kind: "evil", title: "Hiring devs" }, authorities)).toMatchObject({ ok: false });
    const ok = parseSuggestionInput({ kind: "bridge", title: " Cost <em>and</em> teams ", why: "a\nb", topic: "vietnam", topicB: "cost" }, authorities);
    expect(ok).toEqual({ ok: true, value: { kind: "bridge", title: "Cost and teams", why: "a\nb", topic: "vietnam", topicB: "cost" } });
  });

  it("limits clients to 10 a day and 30 pending (429); team is unlimited", async () => {
    const value = { kind: "topic" as const, title: "Hiring devs", why: "", topic: null, topicB: null };
    const recent = new Date(NOW - 1000).toISOString();
    const old = new Date(NOW - 2 * 86_400_000).toISOString();
    const p = createFakePayload({ "content-map-suggestions": Array.from({ length: 10 }, () => ({ client: 7, origin: "client", status: "approved", createdAt: recent })) });
    expect(await createSuggestion(p as never, { clientId: "7", value, origin: "client", suggestedBy: "Client" }, () => NOW)).toMatchObject({ ok: false, status: 429 });
    expect(await createSuggestion(p as never, { clientId: "8", value, origin: "client", suggestedBy: "Client" }, () => NOW)).toMatchObject({ ok: true });
    expect(await createSuggestion(p as never, { clientId: "7", value, origin: "team", suggestedBy: "Peter" }, () => NOW)).toMatchObject({ ok: true });
    const q = createFakePayload({ "content-map-suggestions": Array.from({ length: 30 }, () => ({ client: 7, origin: "client", status: "pending", createdAt: old })) });
    expect(await createSuggestion(q as never, { clientId: "7", value, origin: "client", suggestedBy: "Client" }, () => NOW)).toMatchObject({ ok: false, status: 429 });
  });

  function seeded(extra: Record<string, unknown>): FakePayload {
    return createFakePayload({
      clients: [client],
      "content-map-suggestions": [{ id: 50, client: 7, status: "pending", origin: "client", title: "Hiring developers in Vietnam", why: "Leads", ...extra }],
    });
  }

  it("approve topic adds an authority and starts a refresh; 409 at 8", async () => {
    const p = seeded({ kind: "topic" });
    const refresh = vi.fn(async () => {});
    const res = await decideSuggestion(p as never, { clientId: "7", id: "50", decision: "approve", decidedBy: "Peter" }, { refresh, now: () => NOW });
    expect(res).toMatchObject({ ok: true, suggestion: { status: "approved", decidedBy: "Peter" } });
    expect((p.store.clients?.[0]?.topicAuthorities as unknown[]).length).toBe(3);
    expect(p.update).toHaveBeenCalledWith(expect.objectContaining({ collection: "clients", context: { skipContentMap: true } }));
    expect(refresh).toHaveBeenCalledWith(p, "7");
    const full = createFakePayload({
      clients: [{ ...client, topicAuthorities: Array.from({ length: 8 }, (_, i) => ({ name: `T${i}` })) }],
      "content-map-suggestions": [{ id: 50, client: 7, status: "pending", origin: "team", kind: "topic", title: "New one" }],
    });
    expect(await decideSuggestion(full as never, { clientId: "7", id: "50", decision: "approve", decidedBy: "P" }, { refresh })).toMatchObject({ ok: false, status: 409 });
  });

  it("never decides another client's suggestion", async () => {
    const p = seeded({ kind: "topic" });
    expect(await decideSuggestion(p as never, { clientId: "8", id: "50", decision: "dismiss", decidedBy: "P" })).toMatchObject({ ok: false, status: 404 });
  });

  it("approve article/bridge stores a model-written GEO brief and becomes a plan item", async () => {
    const idea = { title: "Hiring developers in Vietnam: the 2026 guide", question: "How do I hire developers in Vietnam?", why: "Leads ask", priority: "high", overlaps: [], outline: ["What do they cost?"], answerFirst: "A", linksTo: [sample.nodes.find((n) => n.g === "vietnam")?.id, "/not-a-page/"] };
    const p = seeded({ kind: "bridge", topic: "vietnam", topicB: "cost" });
    const call = model(JSON.stringify({ ideas: [idea] }));
    const res = await decideSuggestion(p as never, { clientId: "7", id: "50", decision: "approve", decidedBy: "P" }, { call, snapshot: sample });
    if (!res.ok) throw new Error(res.error);
    expect(res.planItem).toMatchObject({ origin: "client", suggestionId: "50", topic: "vietnam", overlaps: ["cost"], question: idea.question });
    expect(res.planItem?.linksTo).toEqual([idea.linksTo[0]]);
    expect(res.suggestion.recommendationId).toBe(res.planItem?.id);
    const bad = seeded({ kind: "article", topic: "vietnam" });
    expect(await decideSuggestion(bad as never, { clientId: "7", id: "50", decision: "approve", decidedBy: "P" }, { call: model("no json") })).toMatchObject({ ok: false, status: 502 });
    expect(bad.store["content-map-suggestions"]?.[0]?.status).toBe("pending");
  });

  it("dismiss stores the reason; deciding twice is 409", async () => {
    const p = seeded({ kind: "article", topic: "vietnam" });
    const res = await decideSuggestion(p as never, { clientId: "7", id: "50", decision: "dismiss", reason: "<b>Covered</b>", decidedBy: "P" });
    expect(res).toMatchObject({ ok: true, suggestion: { status: "dismissed", dismissReason: "Covered" } });
    expect(await decideSuggestion(p as never, { clientId: "7", id: "50", decision: "dismiss", decidedBy: "P" })).toMatchObject({ ok: false, status: 409 });
  });
});

describe("tracked questions", () => {
  it("fills to 8 per topic in order, stays stable, and never re-adds removed ones", async () => {
    const p = createFakePayload({ "content-map-questions": [{ id: 1, client: 7, topic: "vietnam", question: "Removed question about Vietnam?", source: "team", active: false }] });
    const snapshot: ContentMapSnapshot = { ...sample, nodes: [...sample.nodes, { id: "/q/", g: "vietnam", t: "Is Vietnam safe for outsourcing?", in: 1, out: 0 }] };
    const suggestions = [{ id: 9, status: "approved", topic: "vietnam", origin: "client", brief: { question: "How do I hire developers in Vietnam?" } }];
    const call = model(JSON.stringify({ questions: ["Removed question about Vietnam?", ...Array.from({ length: 12 }, (_, i) => `Buyer question number ${i} for this topic?`)] }));
    const input = { clientId: "7", siteUrl: "https://a.com", authorities, snapshot, suggestions };
    const first = await ensureQuestions(p as never, input, { call });
    const vn = first.filter((q) => q.topic === "vietnam");
    expect(vn).toHaveLength(8);
    const recQs = sample.recommendations.filter((r) => r.topic === "vietnam").map((r) => r.question);
    expect(vn.slice(0, recQs.length).map((q) => q.question)).toEqual(recQs);
    expect(vn.map((q) => q.source)).toContain("client");
    expect(vn.map((q) => q.source)).toContain("article");
    expect(vn.map((q) => q.question)).not.toContain("Removed question about Vietnam?");
    expect(first.filter((q) => q.topic === "cost")).toHaveLength(8);
    const again = await ensureQuestions(p as never, input, { call });
    expect(again.map((q) => q.id)).toEqual(first.map((q) => q.id));
  });

  it("add (max 8, 409) and remove", async () => {
    const p = createFakePayload({ "content-map-questions": Array.from({ length: 8 }, (_, i) => ({ client: 7, topic: "cost", question: `Cost question ${i}?`, source: "ai", active: true })) });
    expect(await addQuestion(p as never, { clientId: "7", topic: "cost", question: "Another cost question?", authorities })).toMatchObject({ ok: false, status: 409 });
    expect(await addQuestion(p as never, { clientId: "7", topic: "nope", question: "Another cost question?", authorities })).toMatchObject({ ok: false, status: 400 });
    const added = await addQuestion(p as never, { clientId: "7", topic: "vietnam", question: "Is Vietnam good for <b>QA</b> teams?", authorities });
    if (!added.ok) throw new Error(added.error);
    expect(added.questions.some((q) => q.question === "Is Vietnam good for QA teams?" && q.source === "team")).toBe(true);
    const id = String(added.questions[0]?.id);
    const removed = await removeQuestion(p as never, { clientId: "7", id });
    expect(removed.ok && removed.questions.some((q) => String(q.id) === id)).toBe(false);
    expect(await removeQuestion(p as never, { clientId: "8", id })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("citation runs", () => {
  const fetchOk = (runId = "c1") => vi.fn(async () => new Response(JSON.stringify({ runId, status: "running" }), { status: 202 }));

  it("builds brand terms from name, trading name and domain label", () => {
    expect(brandTerms(client)).toEqual(["Away Digital Teams", "Away", "awaydigitalteams"]);
  });

  it("starts a run with all engines + Australia, then reuses it within 60 min", async () => {
    vi.stubEnv("GROWTH_TOOLS_URL", "http://gt.test");
    vi.stubEnv("INTERNAL_API_KEY", "k");
    const f = fetchOk();
    vi.stubGlobal("fetch", f);
    const p = createFakePayload({ clients: [client], "content-map-snapshots": [{ client: 7, runId: "a", status: "completed", generatedAt: "2026-10-22", data: sample }] });
    const res = await startCitationRun(p as never, "7", { now: () => NOW, call: model("{\"questions\":[]}") });
    expect(res).toMatchObject({ ok: true, reused: false, run: { runId: "c1", status: "running" } });
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ clientId: "7", engines: ["chatgpt", "perplexity", "gemini", "google_aio"], location: "Australia", brandTerms: ["Away Digital Teams", "Away", "awaydigitalteams"] });
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.questions.length).toBeLessThanOrEqual(64);
    const again = await startCitationRun(p as never, "7", { now: () => NOW + 30 * 60_000 });
    expect(again).toMatchObject({ ok: true, reused: true });
    expect(f).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("ingest is idempotent by runId and a completed run is final", async () => {
    const p = createFakePayload();
    const r = result([{ id: "q1", topic: "vietnam", question: "Q one?" }]);
    const a = await upsertCitationRun(p as never, { clientId: "7", runId: "c1", status: "completed", result: r });
    const b = await upsertCitationRun(p as never, { clientId: "7", runId: "c1", status: "failed", error: "late" });
    expect(p.store["content-map-citations"]).toHaveLength(1);
    expect(b.doc.status).toBe("completed");
    expect(a.doc.stats).toEqual({ questions: 1, checks: 2, okChecks: 2, cited: 1, mentioned: 0 });
    expect(needsInsights(a.doc)).toBe(true);
    const bad = await upsertCitationRun(p as never, { clientId: "7", runId: "c2", status: "completed", result: { nope: 1 } });
    expect(bad.doc).toMatchObject({ status: "failed", error: "Citation result missing or invalid" });
  });

  it("keeps the latest 12 completed runs", async () => {
    const p = createFakePayload({ "content-map-citations": Array.from({ length: 14 }, (_, i) => ({ client: 7, runId: `r${i}`, status: "completed" })) });
    expect(await applyCitationRetention(p as never, "7")).toBe(2);
    expect(p.store["content-map-citations"]).toHaveLength(12);
  });

  it("maps model insights into gaps, refresh items and plan notes (validated)", async () => {
    const vnPage = sample.nodes.find((n) => n.g === "vietnam");
    if (!vnPage) throw new Error("fixture");
    const r = result([
      { id: "q1", topic: "vietnam", question: "Is Vietnam good for software teams?" },
      { id: "q2", topic: "vietnam", question: rec1.question },
      { id: "q3", topic: "vietnam", question: "Is Vietnam safe?" },
      { id: "q4", topic: "vietnam", question: "Cited already?", clientCited: true },
    ]);
    const p = createFakePayload({
      clients: [client],
      "content-map-snapshots": [{ client: 7, runId: "a", status: "completed", generatedAt: "2026-10-22", data: sample }],
      "content-map-citations": [{ id: 5, client: 7, runId: "c1", status: "completed", result: r }],
    });
    const reply = {
      gaps: [
        { questionId: "q1", title: "Software teams in Vietnam: what to expect", why: "AI cites Deel", priority: "high", cover: ["Costs"], beat: ["Local data"] },
        { questionId: "q4", title: "Should not be used at all here", why: "" },
      ],
      refresh: [{ questionId: "q3", nodeId: vnPage.id, missing: ["Safety stats"], why: "Deel covers it" }, { questionId: "q3", nodeId: "/fake/", missing: [] }],
      plan: [{ planId: rec1.id, questionId: "q2", cover: ["Rates"], beat: ["2026 numbers"] }, { planId: "ghost", questionId: "q2" }],
    };
    const call = model(JSON.stringify(reply));
    const doc = (p.store["content-map-citations"]?.[0] ?? {}) as Record<string, unknown>;
    const res = await writeInsights(p as never, doc, { call, now: () => NOW });
    if (!res.ok) throw new Error(res.error);
    expect(call).toHaveBeenCalledTimes(1);
    expect(res.insights.gaps).toHaveLength(1);
    expect(res.insights.gaps[0]).toMatchObject({ questionId: "q1", question: "Is Vietnam good for software teams?", cover: ["Costs"], beat: ["Local data"] });
    expect(res.insights.refresh).toEqual([expect.objectContaining({ nodeId: vnPage.id, missing: ["Safety stats"], sources: expect.arrayContaining([expect.objectContaining({ domain: "deel.com", title: "Deel guide" })]) })]);
    expect(Object.keys(res.insights.notes)).toEqual([rec1.id]);
    expect(res.insights.model).toBe("kimi-k3");
    expect(needsInsights(p.store["content-map-citations"]?.[0])).toBe(false);
  });

  it("weekly chain starts only when the last completed run is ≥ 6 days old", async () => {
    vi.stubEnv("GROWTH_TOOLS_URL", "http://gt.test");
    vi.stubEnv("INTERNAL_API_KEY", "k");
    const f = fetchOk("w1");
    vi.stubGlobal("fetch", f);
    const p = createFakePayload({
      clients: [client],
      "content-map-questions": [{ client: 7, topic: "vietnam", question: "Is Vietnam good for software?", source: "team", active: true }],
      "content-map-citations": [{ client: 7, runId: "old", status: "completed", generatedAt: new Date(NOW - 3 * 86_400_000).toISOString() }],
    });
    const call = model("{\"questions\":[]}");
    expect(await maybeStartWeeklyCitations(p as never, "7", { now: () => NOW, call })).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(await maybeStartWeeklyCitations(p as never, "7", { now: () => NOW + 4 * 86_400_000, call })).toMatchObject({ ok: true });
    expect(f).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

describe("plan + view", () => {
  const r = result([{ id: "q1", topic: "vietnam", question: rec1.question }]);
  const gap = { ...rec1, id: "g1", title: "Totally new gap article title here", question: "A brand new question?", questionId: "q9", cover: ["c"], beat: ["b"] };
  const insights: CitationInsights = { model: "kimi-k3", generatedAt: "x", gaps: [gap, { ...gap, id: "g2", title: rec1.title }], refresh: [], notes: { [rec1.id]: { questionId: "q1", cover: ["Rates"], beat: ["Fresh"] } }, topicsFailed: 0 };
  const suggestions = [
    { id: 60, status: "approved", kind: "article", origin: "client", brief: { ...rec1, id: "s-dup", title: `${rec1.title}!` } },
    { id: 61, status: "pending", kind: "article", origin: "team", brief: { ...rec1, id: "s-pending", title: "Pending one is not planned" } },
  ];

  it("merges, de-dupes by normalised title/question and attaches reasons", () => {
    const plan = buildPlan({ snapshot: sample, suggestions, result: r, insights });
    const ids = plan.map((p) => p.id);
    expect(ids).toContain("g1");
    expect(ids).not.toContain("g2");
    expect(ids).not.toContain("s-pending");
    expect(plan.filter((p) => p.title.replace("!", "") === rec1.title)).toHaveLength(1);
    const top = plan.find((p) => p.title.startsWith(rec1.title));
    if (!top) throw new Error("missing");
    const kinds = top.reasons.map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(["ai-cites-others", "suggested", "no-page"]));
    expect(top.suggestionId).toBe("60");
    expect(top.reasons.find((x) => x.kind === "ai-cites-others")?.text).toBe("ChatGPT and Perplexity cite 2 other sites for this");
    expect(top.cover).toEqual(["Rates"]);
    expect(top.sources?.[0]).toMatchObject({ domain: "deel.com", title: "Deel guide" });
    expect(plan.find((p) => p.id === "g1")?.origin).toBe("ai-citations");
  });

  it("adds unlinked-topics and orphan-pages reasons from the snapshot", () => {
    const snap: ContentMapSnapshot = {
      ...sample,
      topics: [{ k: "a", name: "Alpha" }, { k: "b", name: "Beta" }],
      nodes: [{ id: "/a/", g: "a", t: "Alpha page", in: 0, out: 0 }, { id: "/b/", g: "b", t: "Beta page", in: 1, out: 0 }],
      links: [],
      recommendations: [{ ...rec1, topic: "a", overlaps: ["b"], linksTo: ["/a/"] }],
    };
    const [item] = buildPlan({ snapshot: snap, suggestions: [], result: null, insights: null });
    expect(item?.reasons.map((x) => x.text)).toEqual([
      "No page on the site answers this question yet",
      "Bridges Alpha and Beta, which never link to each other",
      "Links to 1 page nothing links to yet",
    ]);
  });

  it("builds the citations view with trend oldest → newest", () => {
    const completed = [
      { id: 2, status: "completed", generatedAt: "2026-10-22", result: r, insights, stats: { okChecks: 2, cited: 1 } },
      { id: 1, status: "completed", generatedAt: "2026-10-15", stats: { okChecks: 4, cited: 0 } },
    ];
    const view = buildCitationsView({ latest: completed[0] ?? null, completed, questions: [{ id: "q1", topic: "vietnam", question: rec1.question, source: "recommendation" }, { id: "q7", topic: "gone", question: "x" }], authorities });
    expect(view).toMatchObject({ status: "completed", generatedAt: "2026-10-22", insightsModel: "kimi-k3", topDomains: [{ domain: "deel.com", count: 2 }] });
    expect(view?.trend.map((t) => t.generatedAt)).toEqual(["2026-10-15", "2026-10-22"]);
    expect(view?.questions).toHaveLength(1);
    expect(view?.questions[0]?.checks[1]).toEqual({ engine: "perplexity", ok: true, clientCited: false, clientMentioned: false, citedDomains: ["statista.com", "deel.com"] });
    expect(view?.byTopic.vietnam).toEqual({ questions: 1, checks: 2, cited: 0 });
  });

  it("brief adds AI source, cover and beat lines", () => {
    const item: PlanItem = { ...rec1, origin: "ai-citations", reasons: [], sources: [{ url: "https://deel.com/a", domain: "deel.com", title: "Deel guide" }], cover: ["Rates"], beat: ["2026 data"] };
    const brief = recommendationToBrief({ clientId: "7", rec: item, snapshot: sample, siteUrl: "https://a.com", blogCategories: "" });
    expect(brief.supportingContent).toContain("Sources AI cites now:\n- Deel guide (https://deel.com/a)");
    expect(brief.supportingContent).toContain("Cover:\n- Rates");
    expect(brief.supportingContent).toContain("Do better than them:\n- 2026 data");
    expect(recommendationToBrief({ clientId: "7", rec: rec1, snapshot: sample, siteUrl: "", blogCategories: "" }).supportingContent).not.toContain("Sources AI cites now");
  });
});

describe("toClientView — living layer allowlist", () => {
  const sv = (o: Record<string, unknown>) => toSuggestionView({ createdAt: "2026-10-22", title: "T title", why: "w", kind: "article", topic: "vietnam", ...o });
  const state: ContentMapApiResponse = {
    client: { id: "7", name: "Away", siteUrl: "https://a.com", enabled: true, authorities },
    run: null,
    snapshot: null,
    decisions: [],
    termW: {},
    sent: {},
    history: [],
    plan: [{ ...rec1, origin: "ai", reasons: [{ kind: "no-page", text: "t", secret: 1 } as never], suggestionId: "60", internal: "x" } as never],
    suggestions: [
      sv({ id: 1, origin: "client", status: "dismissed", dismissReason: "spam", suggestedBy: "Client" }),
      sv({ id: 2, origin: "team", status: "pending", suggestedBy: "Peter" }),
      sv({ id: 3, origin: "team", status: "dismissed", suggestedBy: "Peter", dismissReason: "no" }),
      sv({ id: 4, origin: "ai", status: "approved", suggestedBy: "AI" }),
      sv({ id: 5, origin: "ai", status: "pending" }),
      sv({ id: 6, origin: "team", status: "approved", suggestedBy: "Peter" }),
    ],
    citations: {
      status: "failed",
      error: "DataForSEO 500",
      generatedAt: "2026-10-22",
      engines: ["chatgpt"],
      questions: [{ id: "q1", topic: "vietnam", question: "Q?", source: "ai", checks: [{ engine: "chatgpt", ok: true, clientCited: false, clientMentioned: false, citedDomains: ["deel.com"], answer: "secret" } as never] }],
      byTopic: {},
      trend: [],
      topDomains: [],
      refresh: [{ id: "r", nodeId: "/a/", topic: "vietnam", question: "Q?", missing: ["m"], sources: [], why: "w" }],
      insightsModel: "kimi-k3",
    },
  };

  it("keeps the client's own + approved team/ai suggestions, relabels, strips internals", () => {
    const view = toClientView(state);
    expect(view.suggestions?.map((s) => s.id)).toEqual(["1", "4", "6"]);
    expect(view.suggestions?.map((s) => s.suggestedBy)).toEqual(["You", "Optimise Digital", "Optimise Digital"]);
    expect(view.suggestions?.every((s) => !("dismissReason" in s))).toBe(true);
    const json = JSON.stringify(view);
    for (const leak of ["DataForSEO", "kimi-k3", "secret", "spam", "Peter", "internal"]) expect(json).not.toContain(leak);
    expect(view.citations).toMatchObject({ error: null, insightsModel: "", refresh: [{ id: "r" }] });
    expect(view.plan?.[0]).toMatchObject({ id: rec1.id, suggestionId: "60", reasons: [{ kind: "no-page", text: "t" }] });
  });
});
