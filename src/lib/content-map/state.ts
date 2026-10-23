import { timingSafeEqual } from "crypto";
import type { Payload, TypedUser } from "payload";
import { authoritiesFromClient } from "./authorities";
import { computeTermW } from "./decisions";
import { loadLinkActions } from "./link-action";
import { buildCitationsView, latestCompletedCitations, loadCitationState } from "./citations";
import { buildPlanWithAliases, parseCitationsResult, parseInsights } from "./plan";
import { loadResearchState, researchPlanItems } from "./placement";
import { latestCompletedResearch, parseResearchInsights } from "./research";
import { loadQuestions } from "./questions";
import { loadDecisions, pollStaleRun, relId, RETAIN_COMPLETED } from "./snapshots";
import { loadSuggestions, toSuggestionView } from "./suggestions";
import type { ContentMapApiResponse, ContentMapSnapshot, PlanItem, RunStatusValue, SnapshotStats } from "./types";
import { parseSnapshot } from "./types";
import { clientSiteUrl } from "./paths";

type Doc = Record<string, unknown>;

export function validClientId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

/** Staff-visible client (access enforced with overrideAccess: false). */
export async function loadClientForUser(payload: Payload, clientId: string, user: TypedUser): Promise<Doc | null> {
  try {
    return (await payload.findByID({
      collection: "clients",
      id: clientId,
      depth: 0,
      overrideAccess: false,
      user,
      select: { name: true, slug: true, websiteUrl: true, contentMapEnabled: true, topicAuthorities: true, blogCategories: true, targetLocation: true, gscConnected: true },
    })) as unknown as Doc;
  } catch {
    return null;
  }
}

/** GT → CMS writes: `Authorization: users API-Key <key>` checked like other GT pushes (CMS_API_KEY, falling back to AUDIT_API_KEY). */
export function isGrowthToolsPush(request: Request): boolean {
  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("users API-Key ")
    ? auth.slice("users API-Key ".length).trim()
    : request.headers.get("x-api-key") ?? "";
  const expected = process.env.CMS_API_KEY || process.env.AUDIT_API_KEY || "";
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function latestCompleted(payload: Payload, clientId: string): Promise<ContentMapSnapshot | null> {
  const res = await payload.find({
    collection: "content-map-snapshots",
    where: { and: [{ client: { equals: clientId } }, { status: { equals: "completed" } }] },
    sort: "-generatedAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const doc = res.docs[0] as unknown as Doc | undefined;
  return doc ? parseSnapshot(doc.data) : null;
}

export async function buildContentMapState(
  payload: Payload,
  client: Doc,
  now: () => number = Date.now,
): Promise<ContentMapApiResponse> {
  const clientId = String(client.id);
  const [completedRes, currentRes, decisions, prompts, actions, suggestionDocs, questionDocs, citationState] = await Promise.all([
    payload.find({
      collection: "content-map-snapshots",
      where: { and: [{ client: { equals: clientId } }, { status: { equals: "completed" } }] },
      sort: "-generatedAt",
      limit: RETAIN_COMPLETED,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: "content-map-snapshots",
      where: { client: { equals: clientId } },
      sort: "-createdAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { data: false },
    }),
    loadDecisions(payload, clientId),
    payload.find({
      collection: "blog-prompts",
      where: { and: [{ client: { equals: clientId } }, { source: { equals: "content-map" } }] },
      limit: 500,
      depth: 0,
      overrideAccess: true,
      select: { contentMapRecommendationId: true },
    }),
    loadLinkActions(payload, clientId),
    loadSuggestions(payload, clientId),
    loadQuestions(payload, clientId),
    loadCitationState(payload, clientId, now),
  ]);
  let completed = completedRes.docs as unknown as Doc[];

  let current = (currentRes.docs[0] as unknown as Doc | undefined) ?? null;
  if (current && current.status === "running") {
    current = await pollStaleRun(payload, current, now);
    // The poll just completed the run: it is the newest snapshot.
    if (current.status === "completed" && !completed.some((d) => d.id === current?.id)) {
      completed = [current, ...completed].slice(0, RETAIN_COMPLETED);
    }
  }
  const snapshots = completed.map((d) => parseSnapshot(d.data));
  const showRun = current && (current.status === "running" || current.status === "failed");

  const sent: Record<string, string> = {};
  for (const p of prompts.docs as unknown as Doc[]) {
    const rid = typeof p.contentMapRecommendationId === "string" ? p.contentMapRecommendationId : "";
    if (rid && !sent[rid]) sent[rid] = String(p.id);
  }

  const snapshot = snapshots[0] ?? null;
  const authorities = authoritiesFromClient(client);
  const lastCitations = citationState.completed[0];
  const researchState = await loadResearchState(payload, { clientId, client, snapshot, authorities }, now);
  const { plan, aliases } = buildPlanWithAliases({
    research: researchState.planItems,
    snapshot,
    suggestions: suggestionDocs,
    result: lastCitations ? parseCitationsResult(lastCitations.result) : null,
    insights: lastCitations ? parseInsights(lastCitations.insights) : null,
  });

  return {
    client: {
      id: clientId,
      name: String(client.name ?? ""),
      slug: typeof client.slug === "string" ? client.slug : null,
      siteUrl: clientSiteUrl(client),
      enabled: client.contentMapEnabled === true,
      authorities,
    },
    run: showRun && current
      ? {
          runId: String(current.runId ?? ""),
          status: current.status as RunStatusValue,
          mode: (current.mode as string | null) ?? null,
          phase: (current.phase as string | null) ?? null,
          pagesCrawled: typeof current.pagesCrawled === "number" ? current.pagesCrawled : null,
          error: (current.error as string | null) ?? null,
          startedAt: (current.startedAt as string | null) ?? null,
        }
      : null,
    snapshot,
    decisions,
    termW: computeTermW(decisions, snapshots),
    sent,
    actions,
    history: completed.map((d) => ({
      generatedAt: (d.generatedAt as string | null) ?? null,
      stats: (d.stats as SnapshotStats | null) ?? null,
    })),
    plan,
    suggestions: suggestionDocs.map(toSuggestionView),
    citations: buildCitationsView({ latest: citationState.latest, completed: citationState.completed, questions: questionDocs, authorities }),
    // A research idea whose plan item merged into another points at the kept one.
    research: researchState.research
      ? { ...researchState.research, ideas: researchState.research.ideas.map((i) => (i.planItemId && aliases[i.planItemId] ? { ...i, planItemId: aliases[i.planItemId] ?? i.planItemId } : i)) }
      : null,
    inProgress: researchState.inProgress,
  };
}

/** The merged plan for one client (used when sending a plan item to the Blog Prompter). */
export async function loadPlan(payload: Payload, clientId: string): Promise<{ plan: PlanItem[]; snapshot: ContentMapSnapshot | null; aliases: Record<string, string> }> {
  const [snapshot, suggestions, [last], [research]] = await Promise.all([
    latestCompleted(payload, clientId),
    loadSuggestions(payload, clientId),
    latestCompletedCitations(payload, clientId),
    latestCompletedResearch(payload, clientId),
  ]);
  const { plan, aliases } = buildPlanWithAliases({ research: researchPlanItems(research ? parseResearchInsights(research.insights) : null), snapshot, suggestions, result: last ? parseCitationsResult(last.result) : null, insights: last ? parseInsights(last.insights) : null });
  return { plan, snapshot, aliases };
}

export { relId };
