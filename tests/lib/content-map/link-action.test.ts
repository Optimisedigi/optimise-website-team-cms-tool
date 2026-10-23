import { describe, expect, it, vi } from "vitest";
import type { Payload, TypedUser } from "payload";

vi.mock("@/lib/agents/_shared/llm", () => ({ callLLM: vi.fn() }));
vi.mock("@/lib/agents/_shared/llm/auth/store", () => ({ getCredential: vi.fn() }));
vi.mock("@/lib/agents/_shared/optimate-default-models", () => ({ getOptiMateDefaultModels: vi.fn() }));

import {
  alreadyLinks,
  applyLinkAction,
  checkLinkEdit,
  draftLinkAction,
  draftWithModel,
  htmlToParagraphs,
  locateOnce,
  wordChanges,
} from "@/lib/content-map/link-action";
import type { ContentMapSnapshot } from "@/lib/content-map/types";
import { createFakePayload, type FakePayload } from "./fake-payload";

const asPayload = (p: FakePayload) => p as unknown as Payload;
const user = { id: 3, email: "pe@optimisedigital.online" } as unknown as TypedUser;
const site = "https://www.site.com";
const target = "https://www.site.com/blog/vietnam-costs/";
const sentence = "Outsourcing bookkeeping to Vietnam saves money for small firms every single year.";
const article = `# Bookkeeping guide\n\nThis guide explains the basics of offshore bookkeeping for owners.\n\n${sentence}\n\n## Next steps\n\nTalk to your accountant first.`;
const replacement = "Outsourcing bookkeeping to [Vietnam saves money](https://www.site.com/blog/vietnam-costs/) for small firms every single year.";

function snapshot(srcExtra: Record<string, unknown> = { cmsId: "11" }): ContentMapSnapshot {
  return {
    version: 1,
    clientId: "7",
    siteUrl: site,
    generatedAt: "2026-10-22T09:00:00.000Z",
    crawledAt: "2026-10-22T09:00:00.000Z",
    mode: "full",
    ai: { embeddings: "openai", llm: "none" },
    topics: [{ k: "vietnam", name: "Vietnam", primary: true }],
    nodes: [
      { id: "/blog/bookkeeping-guide/", g: "vietnam", t: "Bookkeeping guide", in: 1, out: 0, ...srcExtra },
      { id: "/blog/vietnam-costs/", g: "vietnam", t: "What Vietnam teams cost", in: 0, out: 0 },
    ],
    links: [],
    opportunities: [{ key: "/blog/bookkeeping-guide/>/blog/vietnam-costs/", s: 0, t: 1, sim: 0.8, terms: ["vietnam", "cost"] }],
    recommendations: [],
    stats: { pagesCrawled: 2, mapped: 2, links: 0, orphans: 1 },
  };
}
const key = "/blog/bookkeeping-guide/>/blog/vietnam-costs/";

function seed(extra: Record<string, unknown> = {}) {
  return createFakePayload({
    "blog-posts": [{ id: 11, client: 7, title: "Bookkeeping guide", slug: "bookkeeping-guide", markdownContent: article }],
    "internal-link-suggestions": [{ id: 5, client: 7, origin: "content-map", opportunityKey: key, status: "approved", targetUrl: target, ...extra }],
  });
}

describe("link edit checks", () => {
  it("accepts one natural link to the target inside an existing sentence", () => {
    const res = checkLinkEdit({ text: article, original: sentence, replacement, targetUrl: target, siteUrl: site, markdown: true });
    expect(res).toMatchObject({ ok: true, anchor: "Vietnam saves money", original: sentence });
  });

  it("rejects text that isn't in the page, headings, wrong targets, extra links and rewrites", () => {
    const base = { text: article, targetUrl: target, siteUrl: site, markdown: true };
    expect(checkLinkEdit({ ...base, original: "A sentence the article never had in it.", replacement }).ok).toBe(false);
    expect(checkLinkEdit({ ...base, original: "## Next steps", replacement: "## [Next steps](https://www.site.com/blog/vietnam-costs/)" })).toMatchObject({ ok: false });
    expect(checkLinkEdit({ ...base, original: sentence, replacement: replacement.replace("vietnam-costs", "other-page") })).toMatchObject({ ok: false, reason: expect.stringMatching(/target/) });
    expect(checkLinkEdit({ ...base, original: sentence, replacement: `${replacement} See [more](/blog/vietnam-costs/).` })).toMatchObject({ ok: false, reason: expect.stringMatching(/exactly one/) });
    expect(checkLinkEdit({ ...base, original: sentence, replacement: "Hiring offshore staff in [Vietnam saves money](https://www.site.com/blog/vietnam-costs/) for companies across Australia and beyond today." })).toMatchObject({ ok: false, reason: expect.stringMatching(/too much/) });
  });

  it("matches across whitespace differences and only when the text is unique", () => {
    expect(locateOnce("one two\nthree four", "two three")).toEqual({ at: 4, match: "two\nthree" });
    expect(locateOnce("same line. same line.", "same line.")).toBeNull();
    expect(wordChanges("a b c d", "a b x c d")).toBe(1);
  });

  it("treats relative, absolute, www and trailing-slash forms of the target as the same link", () => {
    expect(alreadyLinks("See [costs](/blog/vietnam-costs).", target, site)).toBe(true);
    expect(alreadyLinks('<p><a href="https://site.com/blog/vietnam-costs/">x</a></p>', target, site)).toBe(true);
    expect(alreadyLinks("See [other](/blog/other/).", target, site)).toBe(false);
  });

  it("reads page paragraphs without menus, footers or scripts", () => {
    const html = `<nav><p>Home About Contact Services Blog Careers Login</p></nav><p>Teams in Vietnam handle bookkeeping &amp; payroll for Australian firms.</p><footer><p>Copyright 2026 Site Pty Ltd. All rights reserved worldwide.</p></footer><script>var x = "<p>nope</p>"</script>`;
    expect(htmlToParagraphs(html)).toBe("Teams in Vietnam handle bookkeeping & payroll for Australian firms.");
  });
});

describe("draftWithModel", () => {
  it("retries once with the rejection reason, then returns the checked edit", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ text: '{"found":true,"original":"not in the article at all, sorry","replacement":"x","anchor":"x","why":"x"}', model: "kimi-k3" })
      .mockResolvedValueOnce({ text: "```json\n" + JSON.stringify({ found: true, original: sentence, replacement, anchor: "Vietnam saves money", why: "Readers comparing costs want the numbers." }) + "\n```", model: "kimi-k3" });
    const res = await draftWithModel({} as Payload, {
      sourceTitle: "Bookkeeping guide", sourceText: article, targetTitle: "What Vietnam teams cost", targetUrl: target, targetTopic: "Vietnam",
      opp: snapshot().opportunities[0]!, avoid: [], siteUrl: site, markdown: true,
    }, call);
    expect(res).toMatchObject({ ok: true, original: sentence, replacement, anchor: "Vietnam saves money", model: "kimi-k3" });
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1]![1].user).toMatch(/previous answer was rejected/);
  });

  it("reports when no sentence fits", async () => {
    const call = vi.fn().mockResolvedValue({ text: '{"found": false, "why": "The page never mentions costs."}', model: "grok-4.6" });
    const res = await draftWithModel({} as Payload, {
      sourceTitle: "x", sourceText: article, targetTitle: "y", targetUrl: target, targetTopic: "Vietnam", opp: snapshot().opportunities[0]!, avoid: [], siteUrl: site, markdown: true,
    }, call);
    expect(res).toEqual({ ok: false, reason: "The page never mentions costs.", model: "grok-4.6", noFit: true });
  });
});

describe("draftLinkAction", () => {
  const okResult = { ok: true as const, original: sentence, replacement, anchor: "Vietnam saves money", why: "Fits.", model: "kimi-k3", at: 0 };
  const okDraft = vi.fn(async () => okResult);

  it("drafts an edit for a CMS article without touching the article", async () => {
    const p = seed();
    const res = await draftLinkAction(asPayload(p), { clientId: "7", siteUrl: site, snapshot: snapshot(), key, user }, { draft: okDraft });
    expect(res).toMatchObject({ ok: true, action: { status: "drafted", source: "cms-article", blogPostId: "11", original: sentence, replacement, anchor: "Vietnam saves money", model: "kimi-k3" } });
    expect(p.store["blog-posts"]![0]!.markdownContent).toBe(article);
  });

  it("needs the suggestion to be accepted first", async () => {
    const p = seed({ status: "rejected" });
    const res = await draftLinkAction(asPayload(p), { clientId: "7", siteUrl: site, snapshot: snapshot(), key, user }, { draft: okDraft });
    expect(res).toMatchObject({ ok: false, status: 409 });
  });

  it("marks already-linked articles instead of calling the model", async () => {
    const p = seed();
    p.store["blog-posts"]![0]!.markdownContent = `${article}\n\nRead [our costs](/blog/vietnam-costs/).`;
    const draft = vi.fn();
    const res = await draftLinkAction(asPayload(p), { clientId: "7", siteUrl: site, snapshot: snapshot(), key, user }, { draft });
    expect(res).toMatchObject({ ok: true, action: { status: "already-linked" } });
    expect(draft).not.toHaveBeenCalled();
  });

  it("uses the live page when the source isn't a CMS article, and asks to avoid the last sentence on redo", async () => {
    const p = seed({ editOriginal: "Old rejected sentence that the editor did not like." });
    p.store["blog-posts"] = [];
    const fetchPage = vi.fn(async () => ({ ok: true as const, text: article, html: "<p>no links</p>" }));
    const draft = vi.fn(async (..._args: unknown[]) => okResult);
    const res = await draftLinkAction(asPayload(p), { clientId: "7", siteUrl: site, snapshot: snapshot({}), key, user, redo: true }, { draft, fetchPage });
    expect(fetchPage).toHaveBeenCalledWith("https://www.site.com/blog/bookkeeping-guide/", site);
    expect(draft.mock.calls[0]![1]).toMatchObject({ markdown: false, avoid: ["Old rejected sentence that the editor did not like."] });
    expect(res).toMatchObject({ ok: true, action: { status: "drafted", source: "live-page", blogPostId: null } });
  });

  it("records a failure when no model is available", async () => {
    const p = seed();
    const draft = vi.fn(async () => { throw new Error("All models failed"); });
    const res = await draftLinkAction(asPayload(p), { clientId: "7", siteUrl: site, snapshot: snapshot(), key, user }, { draft });
    expect(res).toMatchObject({ ok: true, action: { status: "failed", note: expect.stringMatching(/All models failed/) } });
  });
});

describe("applyLinkAction", () => {
  const drafted = { actionStatus: "drafted", actionSource: "cms-article", blogPost: 11, editOriginal: sentence, editReplacement: replacement };

  it("writes the drafted link into the article and records who applied it", async () => {
    const p = seed(drafted);
    const res = await applyLinkAction(asPayload(p), { clientId: "7", siteUrl: site, key, user }, { now: () => new Date("2026-10-23T01:00:00.000Z") });
    expect(res).toMatchObject({ ok: true, action: { status: "applied", appliedAt: "2026-10-23T01:00:00.000Z" } });
    expect(p.store["blog-posts"]![0]!.markdownContent).toBe(article.replace(sentence, replacement));
    expect(p.store["internal-link-suggestions"]![0]).toMatchObject({ appliedBy: "pe@optimisedigital.online" });
    expect(p.update).toHaveBeenCalledWith(expect.objectContaining({ collection: "blog-posts", overrideAccess: false, user }));
  });

  it("refuses when the article changed since the draft", async () => {
    const p = seed(drafted);
    p.store["blog-posts"]![0]!.markdownContent = article.replace(sentence, "A completely different sentence now sits here instead.");
    const res = await applyLinkAction(asPayload(p), { clientId: "7", siteUrl: site, key, user });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(p.store["internal-link-suggestions"]![0]!.actionStatus).toBe("drafted");
  });

  it("only records live-page edits as done", async () => {
    const p = seed({ ...drafted, actionSource: "live-page", blogPost: null });
    const res = await applyLinkAction(asPayload(p), { clientId: "7", siteUrl: site, key, user });
    expect(res).toMatchObject({ ok: true, action: { status: "applied", source: "live-page" } });
    expect(p.store["blog-posts"]![0]!.markdownContent).toBe(article);
  });

  it("has nothing to apply without a draft", async () => {
    const p = seed();
    expect(await applyLinkAction(asPayload(p), { clientId: "7", siteUrl: site, key, user })).toMatchObject({ ok: false, status: 409 });
  });
});
