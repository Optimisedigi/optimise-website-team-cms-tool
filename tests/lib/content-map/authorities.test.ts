import { describe, expect, it } from "vitest";
import {
  authoritiesFromClient,
  normalizeAuthorityRows,
  slugifyAuthority,
  validateContentMapSettings,
} from "@/lib/content-map/authorities";
import { blogPostChanged, clientRunMode } from "@/lib/content-map/hooks";

describe("authority keys", () => {
  it("slugs names, folding accents and ampersands", () => {
    expect(slugifyAuthority("Outsourcing to Vietnam")).toBe("outsourcing-to-vietnam");
    expect(slugifyAuthority("Café & Bar")).toBe("cafe-and-bar");
    expect(slugifyAuthority("!!!")).toBe("topic");
  });

  it("never uses a reserved group key and de-duplicates clashes", () => {
    const rows = normalizeAuthorityRows([{ name: "Core" }, { name: "Other" }, { name: "Cost" }, { name: "cost" }, { name: "COST!" }]);
    expect(rows.map((r) => r.key)).toEqual(["core-topic", "other-topic", "cost", "cost-topic", "cost-topic-2"]);
  });

  it("makes the first row primary when none is", () => {
    const rows = normalizeAuthorityRows([{ name: "A" }, { name: "B" }]);
    expect(rows.map((r) => r.primary)).toEqual([true, false]);
    const kept = normalizeAuthorityRows([{ name: "A" }, { name: "B", primary: true }]);
    expect(kept.map((r) => r.primary)).toEqual([false, true]);
  });

  it("lists the primary authority first for GT", () => {
    const list = authoritiesFromClient({
      topicAuthorities: [{ name: "A" }, { name: "B", primary: true, description: " covers b " }, { name: "  " }],
    });
    expect(list).toEqual([
      { key: "b", name: "B", description: "covers b", primary: true },
      { key: "a", name: "A", primary: false },
    ]);
  });
});

describe("validateContentMapSettings", () => {
  const rows = [{ name: "A" }];
  it("rejects more than one primary", () => {
    const res = validateContentMapSettings({ enabled: false, websiteUrl: "", rows: [{ name: "A", primary: true }, { name: "B", primary: true }] });
    expect(res.ok).toBe(false);
  });
  it("rejects more than 8 authorities", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `T${i}` }));
    expect(validateContentMapSettings({ enabled: false, websiteUrl: "", rows: many }).ok).toBe(false);
  });
  it("rejects enabling without a website or without authorities", () => {
    expect(validateContentMapSettings({ enabled: true, websiteUrl: " ", rows }).ok).toBe(false);
    expect(validateContentMapSettings({ enabled: true, websiteUrl: "https://x.com", rows: [] }).ok).toBe(false);
  });
  it("accepts a valid enabled client and any disabled one", () => {
    expect(validateContentMapSettings({ enabled: true, websiteUrl: "https://x.com", rows }).ok).toBe(true);
    expect(validateContentMapSettings({ enabled: false, websiteUrl: "", rows: [] }).ok).toBe(true);
  });
});

describe("save hook decisions", () => {
  const on = { contentMapEnabled: true, websiteUrl: "https://x.com", topicAuthorities: [{ name: "A" }] };
  it("runs full on switch-on or URL change, refresh on authority change, nothing otherwise", () => {
    expect(clientRunMode(on, { ...on, contentMapEnabled: false })).toBe("full");
    expect(clientRunMode(on, null)).toBe("full");
    expect(clientRunMode(on, { ...on, websiteUrl: "https://y.com" })).toBe("full");
    expect(clientRunMode(on, { ...on, topicAuthorities: [{ name: "B" }] })).toBe("refresh");
    expect(clientRunMode(on, on)).toBeNull();
    expect(clientRunMode({ ...on, contentMapEnabled: false }, on)).toBeNull();
  });
  it("only treats analysed blog-post fields as changes", () => {
    const post = { title: "T", slug: "t", status: "draft", markdownContent: "x", category: "", excerpt: "a" };
    expect(blogPostChanged({ ...post, excerpt: "b" }, post)).toBe(false);
    expect(blogPostChanged({ ...post, markdownContent: "y" }, post)).toBe(true);
    expect(blogPostChanged(post, null)).toBe(true);
  });
});
