import { describe, expect, it } from "vitest";
import type { Payload } from "payload";
import sampleJson from "../../fixtures/content-map-snapshot-sample.json";
import { recommendationToBrief, sendRecommendation } from "@/lib/content-map/brief";
import { absoluteUrl, applyDecision, computeTermW } from "@/lib/content-map/decisions";
import type { ContentMapSnapshot } from "@/lib/content-map/types";
import { createFakePayload, type FakePayload } from "./fake-payload";

const sample = sampleJson as unknown as ContentMapSnapshot;
const asPayload = (p: FakePayload) => p as unknown as Payload;
const site = "https://awaydigitalteams.com/";

describe("computeTermW", () => {
  it("adds +1 per accepted term and -1 per dismissed term", () => {
    const snaps = [{ opportunities: [{ key: "a", s: 0, t: 1, sim: 1, terms: ["x", "y"] }, { key: "b", s: 0, t: 2, sim: 1, terms: ["y", "z"] }] }];
    const w = computeTermW([{ key: "a", decision: "accepted" }, { key: "b", decision: "dismissed" }, { key: "gone", decision: "accepted" }], snaps);
    expect(w).toEqual({ x: 1, z: -1 });
  });
});

describe("applyDecision", () => {
  const opp = sample.opportunities[0];
  if (!opp) throw new Error("fixture has no opportunities");

  it("accepted → approved suggestion with absolute URLs and confidence", async () => {
    const p = createFakePayload();
    const res = await applyDecision(asPayload(p), { clientId: "7", siteUrl: site, snapshot: sample, key: opp.key, decision: "accepted" });
    expect(res.ok).toBe(true);
    const src = sample.nodes[opp.s];
    const tgt = sample.nodes[opp.t];
    const topic = (k?: string) => sample.topics.find((t) => t.k === k)?.name;
    expect(p.store["internal-link-suggestions"]?.[0]).toMatchObject({
      client: 7,
      origin: "content-map",
      opportunityKey: opp.key,
      status: "approved",
      sourceUrl: `https://awaydigitalteams.com${src?.id}`,
      targetUrl: `https://awaydigitalteams.com${tgt?.id}`,
      anchorText: opp.anchor,
      contextSnippet: opp.snippet,
      confidenceScore: Math.round(opp.sim * 100),
      clusterRelation: src?.g === tgt?.g ? "within" : "cross",
      clusterName: src?.g === tgt?.g ? topic(src?.g) : `${topic(src?.g)} → ${topic(tgt?.g)}`,
    });
  });

  it("dismissed updates the same doc to rejected; undo deletes it", async () => {
    const p = createFakePayload();
    await applyDecision(asPayload(p), { clientId: "7", siteUrl: site, snapshot: sample, key: opp.key, decision: "accepted" });
    await applyDecision(asPayload(p), { clientId: "7", siteUrl: site, snapshot: sample, key: opp.key, decision: "dismissed" });
    expect(p.store["internal-link-suggestions"]).toHaveLength(1);
    expect(p.store["internal-link-suggestions"]?.[0]?.status).toBe("rejected");
    await applyDecision(asPayload(p), { clientId: "7", siteUrl: site, snapshot: null, key: opp.key, decision: "undo" });
    expect(p.store["internal-link-suggestions"]).toHaveLength(0);
  });

  it("404s an unknown opportunity", async () => {
    const res = await applyDecision(asPayload(createFakePayload()), { clientId: "7", siteUrl: site, snapshot: sample, key: "nope", decision: "accepted" });
    expect(res).toMatchObject({ ok: false, status: 404 });
  });
});

describe("recommendationToBrief", () => {
  const rec = {
    id: "r1",
    topic: "vietnam",
    overlaps: [],
    title: "Is Vietnam cheaper?",
    question: "How much cheaper is Vietnam?",
    why: "Gap",
    priority: "high" as const,
    score: 0.9,
    primaryKeyword: "vietnam cost",
    secondaryKeywords: ["bpo", "rates"],
    outline: ["What does it cost?", "Who is it for?"],
    geo: { answerFirst: "It is about 40% cheaper.", entities: ["BPO"], faqs: ["Is it safe?"], evidence: ["Salary survey"], schema: ["FAQPage"] },
    linksTo: ["/blog/a/", "cms:12"],
    linksFrom: ["/"],
  };
  const vietnamName = sample.topics.find((t) => t.k === "vietnam")?.name ?? "";

  it("maps fields, with category only when it is a client blog category", () => {
    const brief = recommendationToBrief({ clientId: "7", rec, snapshot: sample, siteUrl: site, blogCategories: `News\n${vietnamName.toUpperCase()}` });
    expect(brief.category).toBe(vietnamName.toUpperCase());
    expect(brief.mainPoint).toBe("How much cheaper is Vietnam?\n\nIt is about 40% cheaper.");
    expect(brief.keyPoints).toBe("What does it cost?\nWho is it for?");
    expect(brief.secondaryKeywords).toBe("bpo, rates");
    expect(brief.supportingContent).toContain("Link to: https://awaydigitalteams.com/blog/a/");
    expect(brief.supportingContent).toContain("Link from: https://awaydigitalteams.com/");
    expect(brief.supportingContent).toContain("GEO checklist");
    expect(brief.supportingContent).toContain("- FAQPage");
    expect(brief).toMatchObject({ client: 7, source: "content-map", contentMapRecommendationId: "r1" });
    expect(recommendationToBrief({ clientId: "7", rec, snapshot: sample, siteUrl: site, blogCategories: "News" }).category).toBe("");
  });

  it("is idempotent per client + recommendation", async () => {
    const p = createFakePayload();
    const snap = { ...sample, recommendations: [rec] };
    const first = await sendRecommendation(asPayload(p), { clientId: "7", recommendationId: "r1", snapshot: snap, siteUrl: site, blogCategories: "" });
    const second = await sendRecommendation(asPayload(p), { clientId: "7", recommendationId: "r1", snapshot: snap, siteUrl: site, blogCategories: "" });
    expect(first).toMatchObject({ ok: true, created: true });
    expect(second).toMatchObject({ ok: true, created: false, blogPromptId: first.ok ? first.blogPromptId : "" });
    expect(p.store["blog-prompts"]).toHaveLength(1);
    const other = await sendRecommendation(asPayload(p), { clientId: "8", recommendationId: "r1", snapshot: snap, siteUrl: site, blogCategories: "" });
    expect(other).toMatchObject({ ok: true, created: true });
  });

  it("keeps cms: ids as-is in absoluteUrl", () => {
    expect(absoluteUrl(site, "cms:12")).toBe("cms:12");
    expect(absoluteUrl("https://x.com/blog", "a/")).toBe("https://x.com/a/");
  });
});
