import type { Payload } from "payload";
import { authoritiesFromClient } from "./authorities";
import { getGtRun, startGtAnalysis } from "./gt";
import type {
  AnalyseArticle,
  AnalyseRequest,
  ContentMapDecision,
  ContentMapMode,
  ContentMapSnapshot,
  RunStatusValue,
  TopicAuthorityInput,
} from "./types";
import { parseSnapshot } from "./types";
import { clientSiteUrl } from "./paths";

export const ARTICLE_LIMIT = 500;
export const RETAIN_COMPLETED = 12;
export const RUN_REUSE_MS = 30 * 60 * 1000;
export const POLL_AFTER_MS = 2 * 60 * 1000;

type Doc = Record<string, unknown>;
type DecisionRow = { key: string; decision: ContentMapDecision };

export type RunResult =
  | { ok: true; run: Doc; reused: boolean }
  | { ok: false; error: string; status: number };

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function relId(value: unknown): string {
  if (value && typeof value === "object" && "id" in value) return str((value as { id: unknown }).id);
  return str(value);
}

/** Posts → AnalyseRequest articles: max 500, archived/trashed excluded. */
export function buildArticles(posts: readonly Doc[]): AnalyseArticle[] {
  return posts
    .filter((p) => {
      const status = str(p.status).toLowerCase();
      return status !== "archived" && status !== "trashed" && !p.deletedAt && !p.archivedAt;
    })
    .slice(0, ARTICLE_LIMIT)
    .map((p) => {
      const category = str(p.category).trim();
      const markdown = str(p.markdownContent);
      return {
        cmsId: str(p.id),
        title: str(p.title),
        slug: str(p.slug),
        status: str(p.status) || "draft",
        ...(category ? { category } : {}),
        ...(markdown ? { markdown } : {}),
      };
    });
}

export function buildAnalyseRequest(input: {
  clientId: string;
  siteUrl: string;
  mode: ContentMapMode;
  authorities: TopicAuthorityInput[];
  posts: readonly Doc[];
  decisions: DecisionRow[];
}): AnalyseRequest {
  return {
    clientId: input.clientId,
    siteUrl: input.siteUrl.trim(),
    mode: input.mode,
    topicAuthorities: input.authorities,
    articles: buildArticles(input.posts),
    decisions: input.decisions,
  };
}

/** Content-map link-suggestion docs → decisions (approved = accepted, rejected = dismissed). */
export async function loadDecisions(payload: Payload, clientId: string): Promise<DecisionRow[]> {
  const res = await payload.find({
    collection: "internal-link-suggestions",
    where: { and: [{ client: { equals: clientId } }, { origin: { equals: "content-map" } }] },
    limit: 2000,
    depth: 0,
    overrideAccess: true,
    sort: "opportunityKey",
  });
  const rows: DecisionRow[] = [];
  for (const doc of res.docs as unknown as Doc[]) {
    const key = str(doc.opportunityKey);
    if (!key) continue;
    if (doc.status === "approved") rows.push({ key, decision: "accepted" });
    else if (doc.status === "rejected") rows.push({ key, decision: "dismissed" });
  }
  return rows;
}

export async function findActiveRun(payload: Payload, clientId: string, now: number): Promise<Doc | null> {
  const res = await payload.find({
    collection: "content-map-snapshots",
    where: { and: [{ client: { equals: clientId } }, { status: { equals: "running" } }] },
    sort: "-startedAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { data: false },
  });
  const doc = (res.docs[0] as unknown as Doc | undefined) ?? null;
  if (!doc) return null;
  const started = Date.parse(str(doc.startedAt));
  return Number.isFinite(started) && now - started < RUN_REUSE_MS ? doc : null;
}

/** Start (or reuse) a GT analysis. Never throws for expected failures. */
export async function triggerContentMapRun(
  payload: Payload,
  clientId: string,
  mode: ContentMapMode,
  now: () => number = Date.now,
): Promise<RunResult> {
  let client: Doc;
  try {
    client = (await payload.findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true })) as unknown as Doc;
  } catch {
    return { ok: false, error: "Client not found", status: 404 };
  }
  const siteUrl = clientSiteUrl(client);
  const authorities = authoritiesFromClient(client);
  if (client.contentMapEnabled !== true) return { ok: false, error: "Content analysis is switched off for this client", status: 400 };
  if (!siteUrl) return { ok: false, error: "The client's Website URL is missing or isn't a valid web address", status: 400 };
  if (!authorities.length) return { ok: false, error: "Client has no topic authorities", status: 400 };

  const active = await findActiveRun(payload, clientId, now());
  if (active) return { ok: true, run: active, reused: true };

  const posts = await payload.find({
    collection: "blog-posts",
    where: { client: { equals: clientId } },
    sort: "-updatedAt",
    limit: ARTICLE_LIMIT,
    depth: 0,
    overrideAccess: true,
    select: { title: true, slug: true, status: true, category: true, markdownContent: true },
  });
  const decisions = await loadDecisions(payload, clientId);
  const body = buildAnalyseRequest({
    clientId,
    siteUrl,
    mode,
    authorities,
    posts: posts.docs as unknown as Doc[],
    decisions,
  });
  const started = await startGtAnalysis(body);
  if (!started.ok) return { ok: false, error: started.error, status: 502 };

  const existing = await findByRunId(payload, started.value.runId);
  if (existing) return { ok: true, run: existing, reused: true };
  const run = (await payload.create({
    collection: "content-map-snapshots",
    data: {
      client: Number(clientId) || clientId,
      runId: started.value.runId,
      status: "running",
      mode,
      phase: "queued",
      pendingRefresh: false,
      startedAt: new Date(now()).toISOString(),
    } as never,
    overrideAccess: true,
  })) as unknown as Doc;
  return { ok: true, run, reused: started.value.adopted };
}

export async function findByRunId(payload: Payload, runId: string): Promise<Doc | null> {
  const res = await payload.find({
    collection: "content-map-snapshots",
    where: { runId: { equals: runId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return (res.docs[0] as unknown as Doc | undefined) ?? null;
}

export interface RunUpdate {
  clientId: string;
  runId: string;
  status: RunStatusValue;
  phase?: string;
  pagesCrawled?: number;
  error?: string;
  snapshot?: unknown;
}

/** Upsert by runId (ingest push and GT poll share this, so both stay idempotent). */
export async function upsertRun(
  payload: Payload,
  update: RunUpdate,
  now: () => number = Date.now,
): Promise<{ doc: Doc; pendingRefresh: boolean; snapshot: ContentMapSnapshot | null }> {
  const snapshot = update.snapshot === undefined ? null : parseSnapshot(update.snapshot);
  const status: RunStatusValue = update.status === "completed" && !snapshot ? "failed" : update.status;
  const data: Doc = {
    status,
    ...(update.phase ? { phase: update.phase } : {}),
    ...(status === "completed" ? { phase: "done" } : {}),
    ...(typeof update.pagesCrawled === "number" ? { pagesCrawled: update.pagesCrawled } : {}),
    ...(snapshot
      ? {
          data: snapshot,
          stats: snapshot.stats,
          generatedAt: snapshot.generatedAt,
          mode: snapshot.mode,
          pagesCrawled: snapshot.stats.pagesCrawled,
        }
      : {}),
    ...(status === "failed"
      ? { error: update.error || (update.status === "completed" ? "Snapshot missing or invalid" : "Analysis failed") }
      : {}),
  };
  const existing = await findByRunId(payload, update.runId);
  let doc: Doc;
  if (existing) {
    // A finished run hands its pending refresh to the caller exactly once.
    if (status !== "running" && existing.pendingRefresh === true) data.pendingRefresh = false;
    doc = (await payload.update({
      collection: "content-map-snapshots",
      id: existing.id as number,
      data: data as never,
      overrideAccess: true,
    })) as unknown as Doc;
  } else {
    doc = (await payload.create({
      collection: "content-map-snapshots",
      data: {
        client: Number(update.clientId) || update.clientId,
        runId: update.runId,
        startedAt: new Date(now()).toISOString(),
        pendingRefresh: false,
        ...data,
      } as never,
      overrideAccess: true,
    })) as unknown as Doc;
  }
  if (status !== "running") await applyRetention(payload, update.clientId);
  return { doc, pendingRefresh: status !== "running" && existing?.pendingRefresh === true, snapshot };
}

/**
 * Keep the latest 12 completed snapshots per client plus anything running.
 * The newest failed run is also kept when it is newer than the latest
 * completed one, so the UI can show the failure and offer Retry.
 */
export async function applyRetention(payload: Payload, clientId: string): Promise<number> {
  const res = await payload.find({
    collection: "content-map-snapshots",
    where: { and: [{ client: { equals: clientId } }, { status: { not_equals: "running" } }] },
    sort: "-createdAt",
    limit: 500,
    depth: 0,
    overrideAccess: true,
    select: { status: true, createdAt: true },
  });
  const docs = res.docs as unknown as Doc[];
  const keep = new Set<unknown>();
  docs.filter((d) => d.status === "completed").slice(0, RETAIN_COMPLETED).forEach((d) => keep.add(d.id));
  const first = docs[0];
  if (first && first.status === "failed") keep.add(first.id);
  const drop = docs.filter((d) => !keep.has(d.id)).map((d) => d.id);
  if (!drop.length) return 0;
  await payload.delete({
    collection: "content-map-snapshots",
    where: { id: { in: drop as number[] } },
    overrideAccess: true,
  });
  return drop.length;
}

/** Fallback for a missed ingest push: ask GT directly and upsert. */
export async function pollStaleRun(payload: Payload, run: Doc, now: () => number = Date.now): Promise<Doc> {
  const started = Date.parse(str(run.startedAt));
  if (run.status !== "running" || !Number.isFinite(started) || now() - started < POLL_AFTER_MS) return run;
  const res = await getGtRun(str(run.runId));
  if (!res.ok) return run;
  const s = res.value;
  const out = await upsertRun(
    payload,
    {
      clientId: relId(run.client),
      runId: str(run.runId),
      status: s.status,
      phase: s.phase,
      pagesCrawled: s.progress?.pagesCrawled,
      error: s.error,
      snapshot: s.status === "completed" ? s.snapshot : undefined,
    },
    now,
  );
  if (out.pendingRefresh) await triggerContentMapRun(payload, relId(run.client), "refresh", now);
  return out.doc;
}

/** Article changed: refresh now, or flag the running analysis to refresh when it ends. */
export async function requestRefresh(payload: Payload, clientId: string, now: () => number = Date.now): Promise<void> {
  const active = await findActiveRun(payload, clientId, now());
  if (active) {
    if (active.pendingRefresh !== true) {
      await payload.update({
        collection: "content-map-snapshots",
        id: active.id as number,
        data: { pendingRefresh: true } as never,
        overrideAccess: true,
      });
    }
    return;
  }
  await triggerContentMapRun(payload, clientId, "refresh", now);
}
