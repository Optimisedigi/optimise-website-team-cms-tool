import type { ContentMapSnapshot, ResearchResult } from "@/lib/content-map/types";

export function snap(): ContentMapSnapshot {
  return {
    version: 1, clientId: "7", siteUrl: "https://a.com", generatedAt: "2026-10-01T00:00:00.000Z", crawledAt: "2026-10-01T00:00:00.000Z", mode: "full",
    ai: { embeddings: "tfidf", llm: "none" },
    topics: [{ k: "cost", name: "Cost", primary: true }, { k: "vietnam", name: "Vietnam" }],
    nodes: [
      { id: "/blog/dev-cost/", g: "cost", t: "Vietnam developer cost guide – Away", in: 3, out: 1 },
      { id: "/blog/hire/", g: "vietnam", t: "Hiring in Vietnam", in: 1, out: 1 },
    ],
    links: [], opportunities: [], recommendations: [], stats: { pagesCrawled: 2, mapped: 2, links: 0, orphans: 0 },
  };
}
export function result(): ResearchResult {
  return {
    version: 1, clientId: "7", siteUrl: "https://a.com", location: "Australia", generatedAt: "2026-10-02T00:00:00.000Z",
    topics: [{
      key: "cost",
      keywords: [
        { keyword: "vietnam developer cost", volume: 300, competition: "LOW", cpcLow: null, cpcHigh: null },
        { keyword: "offshore payroll tax", volume: 100, competition: null, cpcLow: null, cpcHigh: null },
      ],
      questions: [{ question: "how much does a developer cost in vietnam", source: "people_also_ask", volume: 50 }],
      competitors: { domains: [{ domain: "rival.com", pages: 1, bestPosition: 2 }], pages: [{ url: "https://rival.com/x", domain: "rival.com", title: "Rival Pricing Secrets Page", headings: [], summary: "", keyword: "vietnam developer cost", position: 2, ok: true }] },
      totals: { volume: 400, keywords: 2, questions: 1 }, errors: [],
    }],
    stats: { keywords: 2, questions: 1, competitorPages: 1 },
  };
}

