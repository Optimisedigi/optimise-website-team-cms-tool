/**
 * Content Map link actions: write an accepted link suggestion into its source
 * page. The model picks one sentence and adds one markdown link; every draft
 * is checked here (exact sentence, one new link to the target, only a few
 * words changed) before anyone sees it. Nothing is written to an article
 * until a person clicks Apply.
 *
 * - CMS articles (blog-posts.markdownContent, which client sites render) are
 *   edited in place on Apply.
 * - Pages that are not CMS articles get the same before/after for the team to
 *   paste into the site; Apply then just records it as done.
 */

import type { Payload, TypedUser, Where } from "payload";
import { absoluteUrl } from "./decisions";
import { callContentMapModel, extractJson, type ContentMapLlmResult } from "./llm";
import { relId } from "./snapshots";
import type { ContentMapSnapshot, LinkAction, LinkActionSource, LinkActionStatus, SnapshotOpportunity } from "./types";

type Doc = Record<string, unknown>;

const MAX_SOURCE_CHARS = 30_000;
const MAX_PAGE_BYTES = 2_000_000;
const MAX_WORD_CHANGES = 6;
const MAX_ATTEMPTS = 2;
const MD_LINK = /\[([^\]\n]{1,200})\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

const str = (v: unknown) => (typeof v === "string" ? v : "");

// ─── Pure checks ──────────────────────────────────────────────────────────

/** Comparable form of a link target: host without www + path without trailing slash, lower-cased. */
export function hrefKey(href: string, siteUrl: string): string | null {
  try {
    const u = new URL(href.trim(), new URL(siteUrl).origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = decodeURI(u.pathname).replace(/\/+$/, "").toLowerCase();
    return `${host}${path || "/"}`;
  } catch {
    return null;
  }
}

export function markdownLinks(text: string): Array<{ anchor: string; href: string }> {
  return [...text.matchAll(MD_LINK)].map((m) => ({ anchor: m[1].trim(), href: m[2] }));
}

/** True when the markdown (or HTML hrefs) already link to the target. */
export function alreadyLinks(text: string, targetUrl: string, siteUrl: string): boolean {
  const target = hrefKey(targetUrl, siteUrl);
  if (!target) return false;
  const hrefs = [...markdownLinks(text).map((l) => l.href), ...[...text.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])];
  return hrefs.some((h) => hrefKey(h, siteUrl) === target);
}

export function stripLinks(text: string): string {
  return text.replace(MD_LINK, "$1");
}

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s'’-]/gu, " ").split(/\s+/).filter(Boolean);
}

/** Words added or removed between two texts (length minus longest common subsequence). */
export function wordChanges(a: string, b: string): number {
  const x = words(a), y = words(b);
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return Math.max(x.length, y.length) - dp[x.length][y.length];
}

/**
 * Find `needle` in `text`: exact first, then tolerant of whitespace
 * differences. Returns the exact substring of `text` and its index, only when
 * it occurs once.
 */
export function locateOnce(text: string, needle: string): { at: number; match: string } | null {
  const trimmed = needle.trim();
  if (!trimmed) return null;
  const first = text.indexOf(trimmed);
  if (first >= 0) return text.indexOf(trimmed, first + 1) < 0 ? { at: first, match: trimmed } : null;
  const parts = trimmed.split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(parts.join("\\s+"), "g");
  const hits = [...text.matchAll(re)];
  return hits.length === 1 && hits[0].index !== undefined ? { at: hits[0].index, match: hits[0][0] } : null;
}

export type EditCheck = { ok: true; original: string; at: number; anchor: string } | { ok: false; reason: string };

/** Validate a drafted edit against the source text before anyone sees it. */
export function checkLinkEdit(input: {
  text: string;
  original: string;
  replacement: string;
  targetUrl: string;
  siteUrl: string;
  markdown: boolean;
}): EditCheck {
  const { text, replacement, targetUrl, siteUrl } = input;
  if (input.original.trim().length < 15) return { ok: false, reason: "The chosen sentence is too short." };
  if (input.original.length > 1500) return { ok: false, reason: "The chosen text is longer than one sentence or paragraph." };
  const found = locateOnce(text, input.original);
  if (!found) return { ok: false, reason: "The chosen sentence is not in the page exactly once." };
  if (input.markdown) {
    const lineStart = text.lastIndexOf("\n", found.at) + 1;
    const line = text.slice(lineStart, text.indexOf("\n", found.at) < 0 ? undefined : text.indexOf("\n", found.at));
    if (/^\s{0,3}#/.test(line)) return { ok: false, reason: "The chosen text is a heading." };
    if (/^\s*!\[/.test(found.match)) return { ok: false, reason: "The chosen text is an image." };
  }
  const target = hrefKey(targetUrl, siteUrl);
  const before = markdownLinks(found.match).map((l) => hrefKey(l.href, siteUrl));
  const after = markdownLinks(replacement);
  const added = [...after];
  for (const key of before) {
    const i = added.findIndex((l) => hrefKey(l.href, siteUrl) === key);
    if (i >= 0) added.splice(i, 1);
  }
  if (added.length !== 1) return { ok: false, reason: "The edit must add exactly one link." };
  const link = added[0];
  if (hrefKey(link.href, siteUrl) !== target) return { ok: false, reason: "The new link does not point at the target page." };
  if (!link.anchor || link.anchor.length > 80 || /^https?:\/\//i.test(link.anchor)) return { ok: false, reason: "The link text is not a natural anchor." };
  if (wordChanges(stripLinks(found.match), stripLinks(replacement)) > MAX_WORD_CHANGES) {
    return { ok: false, reason: "The edit rewrites too much of the sentence." };
  }
  return { ok: true, original: found.match, at: found.at, anchor: link.anchor };
}

// ─── Live pages ───────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Page HTML without scripts and site chrome (nav, header, footer), so only in-content links count. */
export function stripChrome(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|header|footer|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

/** Readable paragraphs of an HTML page (p and li text), for picking a sentence. */
export function htmlToParagraphs(html: string): string {
  const body = stripChrome(html);
  const out: string[] = [];
  for (const m of body.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (text.length >= 40) out.push(text);
  }
  return out.join("\n\n").slice(0, MAX_SOURCE_CHARS);
}

function sameSite(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.toLowerCase().replace(/^www\./, "");
    const hb = new URL(b).hostname.toLowerCase().replace(/^www\./, "");
    return ha === hb;
  } catch {
    return false;
  }
}

function isLocalHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  } catch {
    return true;
  }
}

/** Fetch a page on the client's own site and return its paragraphs. */
export async function fetchLivePage(
  url: string,
  siteUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; text: string; html: string } | { ok: false; reason: string }> {
  if (!/^https?:\/\//i.test(url) || !sameSite(url, siteUrl) || isLocalHost(url)) {
    return { ok: false, reason: "The page is not on the client's website." };
  }
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "OptimiseDigital-ContentMap/1.0", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: `The live page returned HTTP ${res.status}.` };
    if (res.url && !sameSite(res.url, siteUrl)) return { ok: false, reason: "The live page redirected off the client's website." };
    if (!(res.headers.get("content-type") ?? "").includes("html")) return { ok: false, reason: "The live page is not HTML." };
    const raw = (await res.text()).slice(0, MAX_PAGE_BYTES);
    const text = htmlToParagraphs(raw);
    if (!text) return { ok: false, reason: "No readable paragraphs on the live page." };
    return { ok: true, text, html: stripChrome(raw) };
  } catch (err) {
    return { ok: false, reason: `Couldn't read the live page: ${(err as Error).message}` };
  }
}

// ─── Model draft ──────────────────────────────────────────────────────────

const SYSTEM = `You add one internal link to an existing web page for SEO. Be conservative: keep the author's words and only add the link.

Rules:
- Pick ONE sentence from the page where a link to the target page genuinely helps the reader.
- Copy that sentence exactly, character for character, as "original".
- "replacement" is the same sentence with exactly one markdown link added: [anchor text](TARGET_URL). Use 2 to 6 words that are already in the sentence as the anchor. Change at most a few words, and only if the sentence needs it to read naturally.
- Never use a heading, a list of sources, an image, a quote, a sentence that already has a link, or the page's first sentence.
- If no sentence fits naturally, say so with found: false.

Reply with JSON only, no prose:
{"found": true, "original": "...", "replacement": "...", "anchor": "...", "why": "one short sentence for the editor"}
or {"found": false, "why": "..."}`;

export function buildDraftPrompt(input: {
  sourceTitle: string;
  sourceText: string;
  targetTitle: string;
  targetUrl: string;
  targetTopic: string;
  opp: SnapshotOpportunity;
  avoid: string[];
  rejected?: string;
}): string {
  const hints = [
    input.opp.terms.length ? `Shared concepts: ${input.opp.terms.join(", ")}` : "",
    input.opp.anchor ? `Suggested anchor: "${input.opp.anchor}"` : "",
    input.opp.snippet ? `Likely sentence: "${input.opp.snippet}"` : "",
  ].filter(Boolean);
  return [
    `Target page: ${input.targetTitle}`,
    `TARGET_URL: ${input.targetUrl}`,
    `Target topic: ${input.targetTopic}`,
    ...hints,
    input.avoid.length ? `Do not use these sentences (already rejected by the editor):\n${input.avoid.map((a) => `- ${a}`).join("\n")}` : "",
    input.rejected ? `Your previous answer was rejected: ${input.rejected} Try again and follow the rules exactly.` : "",
    "",
    `Page to edit: ${input.sourceTitle}`,
    "<<<",
    input.sourceText.slice(0, MAX_SOURCE_CHARS),
    ">>>",
  ].filter((l) => l !== "").join("\n");
}

type ModelDraft =
  | { ok: true; original: string; replacement: string; anchor: string; why: string; model: string; at: number }
  | { ok: false; reason: string; model: string; noFit?: boolean };

export async function draftWithModel(
  payload: Payload,
  input: Omit<Parameters<typeof buildDraftPrompt>[0], "rejected"> & { siteUrl: string; markdown: boolean },
  call: (p: Payload, i: { system: string; user: string; maxTokens?: number }) => Promise<ContentMapLlmResult> = callContentMapModel,
): Promise<ModelDraft> {
  let rejected: string | undefined;
  let model = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await call(payload, { system: SYSTEM, user: buildDraftPrompt({ ...input, rejected }), maxTokens: 2000 });
    model = res.model;
    const json = extractJson(res.text) as Record<string, unknown> | null;
    if (!json || typeof json !== "object") {
      rejected = "It was not valid JSON.";
      continue;
    }
    if (json.found === false) return { ok: false, reason: str(json.why) || "No sentence on the page fits this link naturally.", model, noFit: true };
    const check = checkLinkEdit({
      text: input.sourceText,
      original: str(json.original),
      replacement: str(json.replacement).trim(),
      targetUrl: input.targetUrl,
      siteUrl: input.siteUrl,
      markdown: input.markdown,
    });
    if (check.ok) {
      return { ok: true, original: check.original, replacement: str(json.replacement).trim(), anchor: check.anchor, why: str(json.why).slice(0, 300), model, at: check.at };
    }
    rejected = check.reason;
  }
  return { ok: false, reason: `The model's edit failed checks: ${rejected ?? "unknown"}`, model };
}

// ─── Storage ──────────────────────────────────────────────────────────────

export function toLinkAction(doc: Doc): LinkAction | null {
  const status = str(doc.actionStatus) as LinkActionStatus;
  if (!status) return null;
  const source = str(doc.actionSource) as LinkActionSource;
  const blogPost = doc.blogPost == null ? "" : relId(doc.blogPost);
  return {
    status,
    source: source || null,
    original: str(doc.editOriginal),
    replacement: str(doc.editReplacement),
    anchor: str(doc.anchorText),
    note: str(doc.actionNote),
    model: str(doc.actionModel),
    blogPostId: blogPost || null,
    appliedAt: str(doc.appliedAt) || null,
  };
}

function suggestionWhere(clientId: string, key: string): Where {
  return {
    and: [
      { client: { equals: clientId } },
      { origin: { equals: "content-map" } },
      { opportunityKey: { equals: key } },
    ],
  };
}

export async function loadLinkActions(payload: Payload, clientId: string): Promise<Record<string, LinkAction>> {
  const res = await payload.find({
    collection: "internal-link-suggestions",
    where: {
      and: [
        { client: { equals: clientId } },
        { origin: { equals: "content-map" } },
        { status: { equals: "approved" } },
        { actionStatus: { exists: true } },
      ],
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  });
  const out: Record<string, LinkAction> = {};
  for (const doc of res.docs as unknown as Doc[]) {
    const key = str(doc.opportunityKey);
    const action = toLinkAction(doc);
    if (key && action) out[key] = action;
  }
  return out;
}

export type ActionResult = { ok: true; action: LinkAction } | { ok: false; error: string; status: number };

async function findAccepted(payload: Payload, clientId: string, key: string): Promise<Doc | null> {
  const res = await payload.find({ collection: "internal-link-suggestions", where: suggestionWhere(clientId, key), limit: 1, depth: 0, overrideAccess: true });
  const doc = res.docs[0] as unknown as Doc | undefined;
  return doc && doc.status === "approved" ? doc : null;
}

async function saveAction(payload: Payload, id: unknown, data: Doc): Promise<LinkAction> {
  const doc = (await payload.update({ collection: "internal-link-suggestions", id: id as number, data: data as never, overrideAccess: true })) as unknown as Doc;
  return toLinkAction(doc) as LinkAction;
}

function lastSegment(path: string): string {
  return path.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop()?.toLowerCase() ?? "";
}

/** The CMS article behind a snapshot node, if the user can see it and it belongs to this client. */
async function findSourceArticle(payload: Payload, clientId: string, node: { id: string; cmsId?: string }, user: TypedUser): Promise<Doc | null> {
  const select = { title: true, slug: true, markdownContent: true, client: true } as const;
  if (node.cmsId) {
    try {
      const post = (await payload.findByID({ collection: "blog-posts", id: node.cmsId, depth: 0, overrideAccess: false, user, select })) as unknown as Doc;
      if (relId(post.client) === clientId) return post;
    } catch {
      /* not found or no access */
    }
  }
  const slug = lastSegment(node.id);
  if (!slug || node.id.startsWith("cms:")) return null;
  const res = await payload.find({
    collection: "blog-posts",
    where: { and: [{ client: { equals: clientId } }, { slug: { equals: slug } }] },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user,
    select,
  });
  return (res.docs[0] as unknown as Doc | undefined) ?? null;
}

export interface LinkActionDeps {
  draft?: typeof draftWithModel;
  fetchPage?: typeof fetchLivePage;
  now?: () => Date;
}

/** Draft (or redraft) the edit that writes an accepted suggestion into its source page. */
export async function draftLinkAction(
  payload: Payload,
  input: { clientId: string; siteUrl: string; snapshot: ContentMapSnapshot | null; key: string; user: TypedUser; redo?: boolean },
  deps: LinkActionDeps = {},
): Promise<ActionResult> {
  const snapshot = input.snapshot;
  const opp = snapshot?.opportunities.find((o) => o.key === input.key);
  if (!snapshot || !opp) return { ok: false, error: "Opportunity not found in the latest analysis", status: 404 };
  const doc = await findAccepted(payload, input.clientId, input.key);
  if (!doc) return { ok: false, error: "Accept the suggestion before writing it in", status: 409 };
  if (doc.actionStatus === "applied") return { ok: false, error: "This link has already been applied", status: 409 };
  const siteUrl = input.siteUrl || snapshot.siteUrl;
  const src = snapshot.nodes[opp.s];
  const tgt = snapshot.nodes[opp.t];
  if (!src || !tgt || tgt.id.startsWith("cms:")) return { ok: false, error: "The target page isn't live yet", status: 422 };
  const targetUrl = absoluteUrl(siteUrl, tgt.id);
  const targetTopic = snapshot.topics.find((t) => t.k === tgt.g)?.name ?? tgt.g;
  const avoid = input.redo && str(doc.editOriginal) ? [str(doc.editOriginal)] : [];

  const fail = (note: string, source: LinkActionSource | null, status: LinkActionStatus = "failed", model = "") =>
    saveAction(payload, doc.id, { actionStatus: status, actionSource: source, actionNote: note.slice(0, 500), actionModel: model, editOriginal: "", editReplacement: "" });

  const article = await findSourceArticle(payload, input.clientId, src, input.user);
  let sourceText: string;
  let source: LinkActionSource;
  if (article) {
    source = "cms-article";
    sourceText = str(article.markdownContent);
    if (!sourceText.trim()) return { ok: true, action: await fail("This article has no markdown content to edit.", source) };
  } else {
    if (src.id.startsWith("cms:")) return { ok: true, action: await fail("Couldn't open the source article in the CMS.", null) };
    source = "live-page";
    const page = await (deps.fetchPage ?? fetchLivePage)(absoluteUrl(siteUrl, src.id), siteUrl);
    if (!page.ok) return { ok: true, action: await fail(page.reason, source) };
    if (alreadyLinks(page.html, targetUrl, siteUrl)) return { ok: true, action: await fail("The live page already links to the target.", source, "already-linked") };
    sourceText = page.text;
  }
  if (source === "cms-article" && alreadyLinks(sourceText, targetUrl, siteUrl)) {
    return { ok: true, action: await fail("The article already links to the target.", source, "already-linked") };
  }

  let draft: Awaited<ReturnType<typeof draftWithModel>>;
  try {
    draft = await (deps.draft ?? draftWithModel)(payload, {
      sourceTitle: article ? str(article.title) : src.t,
      sourceText,
      targetTitle: tgt.t,
      targetUrl,
      targetTopic,
      opp,
      avoid,
      siteUrl,
      markdown: source === "cms-article",
    });
  } catch (err) {
    return { ok: true, action: await fail(`No model could write the link: ${(err as Error).message}`.slice(0, 500), source) };
  }
  if (!draft.ok) return { ok: true, action: await fail(draft.reason, source, "failed", draft.model) };
  return {
    ok: true,
    action: await saveAction(payload, doc.id, {
      actionStatus: "drafted",
      actionSource: source,
      blogPost: article ? article.id : null,
      editOriginal: draft.original,
      editReplacement: draft.replacement,
      anchorText: draft.anchor,
      contextSnippet: draft.original.slice(0, 1000),
      actionNote: draft.why,
      actionModel: draft.model,
    }),
  };
}

/** Apply a drafted edit: rewrite the CMS article, or record a pasted live-page edit as done. */
export async function applyLinkAction(
  payload: Payload,
  input: { clientId: string; siteUrl: string; key: string; user: TypedUser },
  deps: Pick<LinkActionDeps, "now"> = {},
): Promise<ActionResult> {
  const doc = await findAccepted(payload, input.clientId, input.key);
  if (!doc) return { ok: false, error: "Accept the suggestion first", status: 409 };
  if (doc.actionStatus !== "drafted") return { ok: false, error: "There is no drafted edit to apply", status: 409 };
  const user = input.user as unknown as Doc;
  const appliedBy = str(user.email) || String(user.id ?? "");
  const appliedAt = (deps.now?.() ?? new Date()).toISOString();

  if (doc.actionSource === "cms-article") {
    const postId = relId(doc.blogPost);
    let post: Doc;
    try {
      post = (await payload.findByID({ collection: "blog-posts", id: postId, depth: 0, overrideAccess: false, user: input.user, select: { markdownContent: true, client: true } })) as unknown as Doc;
    } catch {
      return { ok: false, error: "The article is no longer available", status: 404 };
    }
    if (relId(post.client) !== input.clientId) return { ok: false, error: "The article belongs to another client", status: 403 };
    const md = str(post.markdownContent);
    const targetUrl = str(doc.targetUrl);
    const siteUrl = input.siteUrl || targetUrl;
    if (alreadyLinks(md, targetUrl, siteUrl)) {
      return { ok: true, action: await saveAction(payload, doc.id, { actionStatus: "already-linked", actionNote: "The article already links to the target." }) };
    }
    const found = locateOnce(md, str(doc.editOriginal));
    if (!found) return { ok: false, error: "The article changed since this edit was drafted. Redo the draft.", status: 409 };
    const next = md.slice(0, found.at) + str(doc.editReplacement) + md.slice(found.at + found.match.length);
    await payload.update({ collection: "blog-posts", id: postId, data: { markdownContent: next } as never, overrideAccess: false, user: input.user });
  }
  return { ok: true, action: await saveAction(payload, doc.id, { actionStatus: "applied", appliedAt, appliedBy }) };
}
