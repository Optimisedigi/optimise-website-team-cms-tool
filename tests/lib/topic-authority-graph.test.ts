import { describe, expect, it } from "vitest";
import { buildTopicAuthorityGraph, extractMarkdownLinks, getFirstDegreeNeighborhood, normalizeInternalUrl, parseTaxonomy } from "@/lib/topic-authority-graph";

const posts = [
  { id: 1, title: "A", slug: "a", status: "published", category: " seo ", tags: ["Audit", "Shared"], markdownContent: "[B](/blog/b?x=1) [B again](/blog/b#top) [Service](https://example.com/services/)" },
  { id: 2, title: "B", slug: "b", status: "draft", category: "Content", tags: ["Shared"], markdownContent: "" },
  { id: 3, title: "C", slug: "c", status: "published", category: "Unknown", tags: [], markdownContent: "" },
  { id: 4, title: "D", slug: "d", status: "draft", category: "", tags: [], markdownContent: "" },
];

describe("topic authority graph", () => {
  it("preserves configured order and empty categories while matching case-insensitively", () => {
    const graph = buildTopicAuthorityGraph({ configuredCategories: "SEO\nContent\nNews", configuredTags: "Audit\nShared", posts, siteOrigins: ["https://example.com"], derivedAt: "2026-01-01T00:00:00.000Z" });
    expect(graph.categories.slice(0, 3).map((category) => category.label)).toEqual(["SEO", "Content", "News"]);
    expect(graph.categories.find((category) => category.label === "News")?.health).toBe("Empty");
    expect(graph.summary).toMatchObject({ articleCount: 4, unusedConfiguredCategories: 1, uncategorizedArticles: 1, unconfiguredCategoryArticles: 1, untaggedArticles: 2 });
  });

  it("keeps shared tags singular with multiple category memberships", () => {
    const graph = buildTopicAuthorityGraph({ configuredCategories: ["SEO", "Content"], posts: posts.slice(0, 2), siteOrigins: ["https://example.com"] });
    const shared = graph.nodes.find((node) => node.id === "topic:shared");
    expect(shared?.categoryIds).toHaveLength(2);
    expect(graph.nodes.filter((node) => node.id === "topic:shared")).toHaveLength(1);
  });

  it("normalizes safe local URLs and rejects external or unsafe URLs", () => {
    expect(normalizeInternalUrl("https://example.com/a/?x=1#x", ["https://example.com"])).toBe("/a");
    expect(normalizeInternalUrl("javascript:alert(1)", ["https://example.com"])).toBeNull();
    expect(normalizeInternalUrl("https://other.example/a", ["https://example.com"])).toBeNull();
    expect(extractMarkdownLinks("[x](/a) [x](/a#b) [bad](mailto:a@b.com)")).toEqual(["/a"]);
  });

  it("detects orphans, bridges, typed suggestions and transparent metrics", () => {
    const graph = buildTopicAuthorityGraph({ configuredCategories: ["SEO", "Content"], posts: posts.slice(0, 3), siteOrigins: ["https://example.com"], suggestions: [{ id: 7, sourceUrl: "/blog/b", targetUrl: "/services", confidenceScore: 83, status: "pending" }] });
    expect(graph.edges).toContainEqual(expect.objectContaining({ type: "published_link", source: "article:1", target: "article:2" }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ type: "suggested_link", confidence: 83, status: "pending" }));
    expect(graph.categories.find((category) => category.label === "SEO")?.bridgeCount).toBe(1);
    expect(graph.summary.orphanArticles).toBe(1);
    expect(getFirstDegreeNeighborhood(graph, "article:1").nodes.map((node) => node.id)).toContain("article:2");
  });

  it("caps graph output and reports truncation", () => {
    const graph = buildTopicAuthorityGraph({ configuredCategories: ["SEO"], posts, maxNodes: 2, maxEdges: 1 });
    expect(graph.nodes.length).toBeLessThanOrEqual(2);
    expect(graph.edges.length).toBeLessThanOrEqual(1);
    expect(graph.summary.truncated).toBe(true);
  });

  it("keeps configured tag gaps and collision-resistant taxonomy IDs", () => {
    const graph = buildTopicAuthorityGraph({ configuredCategories: ["C++", "C#"], configuredTags: ["Planned topic"], posts: [] });
    expect(graph.categories.map((category) => category.id)).toEqual(["category:c%2B%2B", "category:c%23"]);
    expect(graph.topics).toContainEqual(expect.objectContaining({ label: "Planned topic", articleCount: 0, gaps: ["Needs more articles"] }));
  });

  it("deduplicates normalized taxonomy values", () => {
    expect(parseTaxonomy(" SEO \nseo\nContent ")).toEqual(["SEO", "Content"]);
  });
});
