import { describe, expect, it, vi } from "vitest";
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
import { toClientView } from "@/lib/content-map/client-view";
import { buildPlan } from "@/lib/content-map/plan";
import {
  assignStatuses, buildEvidence, competitorTerms, ideaRank, parseResearchIdeas, placementContext, researchPlanItems, validatePlacement, writeResearchInsights, type TopicResearchInput,
} from "@/lib/content-map/placement";
import type { ContentMapApiResponse, PlanItem, ResearchIdea, SnapshotRecommendation } from "@/lib/content-map/types";
import { createFakePayload } from "./fake-payload";
import { result, snap } from "./research-fixtures";

const authorities = [{ key: "cost", name: "Cost", primary: true }, { key: "vietnam", name: "Vietnam", primary: false }];
const ctx = placementContext(authorities, snap());
const res = result();
const t0 = res.topics[0];
if (!t0) throw new Error("fixture");
const input: TopicResearchInput = { topic: authorities[0] as never, keywords: t0.keywords, questions: t0.questions, competitors: t0.competitors.pages, gsc: [], planned: [] };
const brief = { priority: "high", primaryKeyword: "vietnam developer cost", outline: ["What does it cost?"], answerFirst: "A direct answer.", schema: ["Article"] };

describe("validatePlacement", () => {
  it("drops bad topics, unknown node ids; clamps fit; improve-page without a real page → new-article", () => {
    expect(validatePlacement({ topic: "made-up", fit: 0.9, placement: "new-article" }, "A title here", ctx)).toBeNull();
    expect(validatePlacement({ topic: "cost", fit: 0.9, placement: "weird" }, "A title here", ctx)).toBeNull();
    const p = validatePlacement({ topic: "cost", fit: 7, overlaps: ["vietnam", "nope", "cost"], placement: "improve-page", pageId: "/ghost/", linksTo: ["/blog/hire/", "/ghost/"] }, "Something else entirely", ctx);
    expect(p).toMatchObject({ topic: "cost", fit: 1, overlaps: ["vietnam"], placement: "new-article", pageId: null, linksTo: [{ id: "/blog/hire/", title: "Hiring in Vietnam" }] });
    expect(validatePlacement({ topic: "cost", fit: -2, placement: "improve-page", pageId: "/blog/dev-cost/" }, "x y z", ctx)).toMatchObject({ fit: 0, pageId: "/blog/dev-cost/" });
  });
});

describe("parseResearchIdeas", () => {
  it("discards off-topic inputs the model flags; ideas resting only on them are dropped", () => {
    const withImmigration = { ...input, questions: [...input.questions, { question: "how to immigrate to vietnam", source: "autocomplete" as const, volume: 900 }] };
    const json = {
      discarded: ["how to immigrate to vietnam"],
      ideas: [
        { title: "Moving to Vietnam: the visa guide", question: "How to immigrate to Vietnam?", questions: ["how to immigrate to vietnam"], topic: "vietnam", fit: 0.4, placement: "new-article", ...brief },
        { title: "Vietnam developer cost in 2026", question: "How much does a developer cost in Vietnam?", keywords: ["vietnam developer cost"], questions: ["how much does a developer cost in vietnam", "how to immigrate to vietnam"], topic: "cost", fit: 0.8, placement: "new-article", ...brief },
      ],
    };
    const ideas = parseResearchIdeas(json, ctx, withImmigration, competitorTerms(input.competitors));
    expect(ideas.map((d) => d.idea.title)).toEqual(["Vietnam developer cost in 2026"]);
    expect(JSON.stringify(ideas)).not.toContain("immigrate");
  });

  it("evidence is built by code: volume sum, counts only in text, no model text naming competitors", () => {
    const json = { ideas: [{ title: "Vietnam developer cost in 2026", question: "How much does a developer cost in Vietnam?", keywords: ["vietnam developer cost", "offshore payroll tax"], competitorPages: [0], topic: "cost", fit: 0.8, placement: "new-article", ...brief, why: "rival.com does it better", evidence: ["See Rival Pricing Secrets Page"] }] };
    const [d] = parseResearchIdeas(json, ctx, input, competitorTerms(input.competitors));
    expect(d?.idea.volume).toBe(400);
    expect(d?.idea.evidence.map((e) => e.text)).toEqual(["400 searches a month", "1 competitor covers this"]);
    expect(d?.idea.evidence[1]?.domains).toEqual(["rival.com"]);
    const text = JSON.stringify(d?.brief);
    expect(text).not.toContain("rival");
    expect(text.toLowerCase()).not.toContain("pricing secrets");
  });
});

const idea = (id: string, topic: string | null, volume: number | null, evidence = 1, fit = 0.5, placement: ResearchIdea["placement"] = "new-article"): ResearchIdea => ({
  id, title: `Idea ${id} long title`, question: `q ${id}?`, topic, fit, overlaps: [], placement, pageId: null, pageTitle: null, newTopicName: placement === "new-topic" ? "Visas" : null,
  linksTo: [], linksFrom: [], why: "", warnings: [], layers: [], evidence: Array.from({ length: evidence }, () => ({ source: "questions" as const, text: "x" })), volume, keywords: [], status: "listed", planItemId: null,
});
const rec = (id: string, topic = "cost"): SnapshotRecommendation => ({ id: `cm-${id}`, topic, overlaps: [], title: `Idea ${id} long title`, question: `q ${id}?`, why: "", priority: "high", score: 0.8, secondaryKeywords: [], outline: [], geo: { answerFirst: "", entities: [], faqs: [], evidence: [], schema: [] }, linksTo: [], linksFrom: [] });

describe("ranking and statuses", () => {
  it("top 3 per topic go in-plan, the rest listed; previously dismissed stays dismissed", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const drafts = ids.map((id, i) => ({ idea: idea(id, "cost", 1000 * (5 - i)), brief: rec(id) }));
    const { ideas } = assignStatuses(drafts, { model: "", generatedAt: "", gscId: null, ideas: [{ ...idea("b", "cost", 1), status: "dismissed" }], briefs: {}, inProgress: [], topicsFailed: 0 }, new Set());
    const by = Object.fromEntries(ideas.map((i) => [i.id, i.status]));
    expect(by).toEqual({ a: "in-plan", b: "dismissed", c: "in-plan", d: "in-plan", e: "listed" });
    expect(ideas.find((i) => i.id === "a")?.planItemId).toBe("cm-a");
  });
  it("tiny or null volumes fall back to evidence count then fit", () => {
    const list = [idea("v20", "cost", 20, 1, 0.9), idea("v30", "cost", 30, 1, 0.5), idea("null3", "cost", null, 3, 0.3), idea("big", "cost", 5000, 1, 0.1)];
    expect([...list].sort(ideaRank).map((i) => i.id)).toEqual(["big", "null3", "v20", "v30"]);
  });
});

describe("writeResearchInsights", () => {
  it("new-topic idea → one pending AI topic suggestion (deduped), never auto-added; in-plan → research plan items", async () => {
    const payload = createFakePayload({
      clients: [{ id: 7, websiteUrl: "https://a.com", topicAuthorities: [{ name: "Cost", primary: true }, { name: "Vietnam" }] }],
      "content-map-snapshots": [{ id: 1, client: 7, status: "completed", generatedAt: "2026-10-01", data: snap() }],
      "content-map-suggestions": [],
    });
    const run = { id: 50, client: 7, status: "completed", result: res };
    payload.store["content-map-research"] = [run as never];
    const reply = { ideas: [
      { title: "Vietnam developer cost in 2026", question: "How much does a developer cost in Vietnam?", keywords: ["vietnam developer cost"], topic: "cost", fit: 0.8, placement: "new-article", ...brief },
      { title: "Payroll tax for offshore staff", question: "Do I pay payroll tax on offshore staff?", keywords: ["offshore payroll tax"], topic: "cost", fit: 0.3, placement: "new-topic", newTopicName: "Payroll" },
      { title: "Payroll rules for offshore teams", question: "What payroll rules apply offshore?", keywords: ["offshore payroll tax"], topic: "cost", fit: 0.3, placement: "new-topic", newTopicName: "payroll" },
    ] };
    const call = vi.fn(async () => ({ text: JSON.stringify(reply), model: "kimi-k3" }));
    const out = await writeResearchInsights(payload as never, run, { call });
    expect(out.ok).toBe(true);
    const sugg = payload.store["content-map-suggestions"] ?? [];
    expect(sugg).toHaveLength(1);
    expect(sugg[0]).toMatchObject({ kind: "topic", origin: "ai", status: "pending" });
    expect(String(sugg[0]?.title).toLowerCase()).toBe("payroll");
    if (!out.ok) return;
    expect(out.insights.ideas.filter((i) => i.status === "in-plan").map((i) => i.title)).toEqual(["Vietnam developer cost in 2026"]);
    const items = researchPlanItems(out.insights);
    expect(items[0]).toMatchObject({ origin: "research", volume: 300 });
    expect(items[0]?.reasons.map((r) => r.kind)).toContain("demand");
    // Second run: still one suggestion.
    await writeResearchInsights(payload as never, run, { call });
    expect(payload.store["content-map-suggestions"]).toHaveLength(1);
  });
});

describe("near-duplicate merge in buildPlan", () => {
  it("merges the research and ai-citations pair, keeps the higher score, unions reasons, keeps volume/researchId", () => {
    const base = (over: Partial<PlanItem>): PlanItem => ({ ...rec("x"), origin: "ai", reasons: [], ...over });
    const research = base({ id: "cm-research-1", topic: "cost", title: "Vietnam developer salaries in 2026, by role", question: "How much does a developer cost in Vietnam?", score: 0.86, origin: "research", volume: 1300, researchId: "rs1", reasons: [{ kind: "demand", text: "1,300 searches a month" }] });
    const gap = { ...base({ id: "cm-gap-1", topic: "cost", title: "Vietnam developer salaries in 2026, by role and seniority", question: "How much does a software developer cost in Vietnam?", score: 0.9 }), questionId: "q1", cover: ["salary bands"], beat: ["fresher data"] };
    const { questionId: _q, ...gapItem } = gap;
    const plan = buildPlan({ snapshot: null, suggestions: [], result: null, insights: { model: "", generatedAt: "", gaps: [gap as never], refresh: [], notes: {}, topicsFailed: 0 }, research: [research] });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ id: gapItem.id, volume: 1300, researchId: "rs1", cover: ["salary bands"] });
    expect(plan[0]?.reasons.map((r) => r.kind)).toEqual(["demand"]);
  });
});

describe("client view", () => {
  it("never shows competitor domains, URLs or titles", () => {
    const [d] = parseResearchIdeas({ ideas: [{ title: "Vietnam developer cost in 2026", question: "How much?", keywords: ["vietnam developer cost"], competitorPages: [0], topic: "cost", fit: 0.8, placement: "new-article", ...brief }] }, ctx, input, []);
    const ideaV = { ...(d?.idea as ResearchIdea) };
    const plan = researchPlanItems({ model: "m", generatedAt: "", gscId: null, ideas: [{ ...ideaV, status: "in-plan" }], briefs: { [ideaV.id]: rec("z") }, inProgress: [], topicsFailed: 0 });
    const state: ContentMapApiResponse = {
      client: { id: "7", name: "A", siteUrl: "https://a.com", enabled: true, authorities }, run: null, snapshot: null, decisions: [], termW: {}, sent: {}, history: [], plan,
      research: { status: "completed", error: "boom", generatedAt: null, gscAt: null, gscConnected: false, location: "Australia", topics: { cost: { key: "cost", volume: 1, keywords: 1, covered: 0, questions: 0, competitorPages: 1, competitorDomains: [{ domain: "rival.com", pages: 1 }], gsc: null } }, ideas: [ideaV], gscPages: [], gscQueries: [], pairs: [], insightsModel: "m" },
      inProgress: [{ id: "ip", kind: "brief", title: "T", cmsId: "301", placement: null }],
    };
    const out = JSON.stringify(toClientView(state));
    expect(JSON.stringify(state)).toContain("rival.com");
    expect(out).not.toContain("rival");
    expect(out).not.toContain("301");
    expect(out).not.toContain("boom");
  });
});

describe("buildEvidence", () => {
  it("null volumes → volume null, no demand line", () => {
    expect(buildEvidence({ keywords: [{ keyword: "x", volume: null, competition: null, cpcLow: null, cpcHigh: null }], questions: [], competitors: [], gsc: [] })).toEqual({ evidence: [], volume: null });
  });
});

describe("runResearchSchedule", () => {
  const NOW = Date.parse("2026-11-02T00:00:00.000Z");
  it("starts research when the last completed run is ≥ 28 days old, not when newer; pulls GSC each time via maybePull", async () => {
    const { runResearchSchedule } = await import("@/lib/content-map/placement");
    const payload = createFakePayload({ clients: [{ id: 7, topicAuthorities: [{ name: "Cost", primary: true }] }] });
    const pull = vi.fn(async () => null);
    const start = vi.fn(async () => ({ ok: true as const, run: { status: "running" }, reused: false }));
    payload.store["content-map-research"] = [{ id: 1, client: 7, status: "completed", generatedAt: new Date(NOW - 10 * 86_400_000).toISOString(), result: result() } as never];
    expect((await runResearchSchedule(payload as never, "7", { now: () => NOW, pull, start })).research).toBeNull();
    expect(start).not.toHaveBeenCalled();
    payload.store["content-map-research"] = [{ id: 1, client: 7, status: "completed", generatedAt: new Date(NOW - 29 * 86_400_000).toISOString(), result: result() } as never];
    await runResearchSchedule(payload as never, "7", { now: () => NOW, pull, start });
    expect(start).toHaveBeenCalledTimes(1);
    expect(pull).toHaveBeenCalledTimes(2);
  });
});
