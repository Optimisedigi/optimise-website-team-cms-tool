import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const idOf = (value: unknown) => typeof value === "object" && value ? String((value as { id?: unknown }).id ?? "") : String(value ?? "");

async function authorizedAudit(req: NextRequest, auditId: string) {
  const payload: any = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return { payload, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  try {
    const audit = await payload.findByID({ collection: "google-ads-audits", id: auditId, depth: 0, overrideAccess: true });
    if (!audit.client) return { payload, error: NextResponse.json({ error: "Audit has no client" }, { status: 400 }) };
    return { payload, audit, clientId: idOf(audit.client) };
  } catch { return { payload, error: NextResponse.json({ error: "Audit not found" }, { status: 404 }) }; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: auditId } = await params;
  const result = await authorizedAudit(req, auditId);
  if (result.error || !result.audit) return result.error!;
  const snapshots = await result.payload.find({ collection: "google-ads-audit-snapshots", where: { and: [{ audit: { equals: auditId } }, { client: { equals: result.clientId } }, { status: { equals: "completed" } }] }, sort: "-capturedAt", limit: 1, depth: 0, overrideAccess: true });
  const snapshot = snapshots.docs[0];
  const clientId = Number(result.clientId);
  if (!snapshot) return NextResponse.json({ error: "No completed snapshot" }, { status: 404 });
  const existing = await result.payload.find({ collection: "search-query-review-groups", where: { and: [{ snapshot: { equals: snapshot.id } }, { client: { equals: result.clientId } }] }, limit: 1, depth: 0, overrideAccess: true });
  if (!existing.totalDocs) {
    const groups = (snapshot.analysis as { searchTerms?: { reviewGroups?: unknown[] } } | undefined)?.searchTerms?.reviewGroups ?? [];
    for (const group of (groups as Array<Record<string, unknown>>).slice(0, 500)) {
      await result.payload.create({ collection: "search-query-review-groups", data: { snapshot: snapshot.id, client: clientId, fingerprint: String(group.fingerprint), classificationState: "review", representativeTerms: Array.isArray(group.representativeTerms) ? group.representativeTerms : [], metrics: { spend: Number(group.totalSpend ?? 0), clicks: Number(group.totalClicks ?? 0), conversions: Number(group.totalConversions ?? 0), queryCount: Number(group.queryCount ?? 0) }, sourceRows: Array.isArray(group.sourceRows) ? group.sourceRows : [], contexts: Array.isArray(group.contexts) ? group.contexts : [], rationale: { initial: String(group.rationale ?? "Frozen deterministic group") } }, overrideAccess: true });
    }
  }
  const persisted = await result.payload.find({ collection: "search-query-review-groups", where: { and: [{ snapshot: { equals: snapshot.id } }, { client: { equals: result.clientId } }] }, sort: "-metrics.spend", limit: 500, depth: 0, overrideAccess: true });
  return NextResponse.json({ snapshotId: snapshot.id, audit: { businessName: result.audit.businessName, proposalId: idOf(result.audit.proposal) || undefined }, groups: persisted.docs });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: auditId } = await params;
  const result = await authorizedAudit(req, auditId);
  if (result.error || !result.audit) return result.error!;
  const body = await req.json() as { groupId?: string; decision?: "relevant" | "irrelevant" | "review" | "split"; phrase?: string; scope?: "service" | "product" | "category"; createNegativeCandidate?: boolean };
  if (!body.groupId || !body.decision) return NextResponse.json({ error: "groupId and decision are required" }, { status: 400 });
  const group = await result.payload.findByID({ collection: "search-query-review-groups", id: body.groupId, depth: 0, overrideAccess: true }).catch(() => null);
  if (!group || idOf(group.client) !== result.clientId) return NextResponse.json({ error: "Review group not found" }, { status: 404 });
  let vocabularyId: number | undefined;
  const clientId = Number(result.clientId);
  if (body.decision === "relevant" || body.decision === "irrelevant") {
    const phrase = normalize(body.phrase || group.fingerprint);
    if (!phrase) return NextResponse.json({ error: "A vocabulary phrase is required" }, { status: 400 });
    const existing = await result.payload.find({ collection: "search-query-vocabulary", where: { and: [{ client: { equals: result.clientId } }, { normalizedPhrase: { equals: phrase } }] }, limit: 1, depth: 0, overrideAccess: true });
    const vocabulary = existing.docs[0] ?? await result.payload.create({ collection: "search-query-vocabulary", data: { client: clientId, phrase: body.phrase || group.fingerprint, normalizedPhrase: phrase, classification: body.decision, scope: body.scope || "category", source: "team_decision", enabled: true, auditDecisionTrail: [] }, overrideAccess: true });
    vocabularyId = Number(vocabulary.id);
  }
  const candidateIds: number[] = [];
  if (body.decision === "irrelevant" && body.createNegativeCandidate) {
    for (const term of (group.representativeTerms as string[]).slice(0, 5)) {
      const candidate = await result.payload.create({ collection: "negative-sweep-candidates", data: { client: clientId, searchTerm: term, suggestedNegative: body.phrase || group.fingerprint, aiReasoning: "Created from an explicitly approved search-query review group; pending downstream approval.", status: "pending", sweepDate: new Date().toISOString() }, overrideAccess: true });
      candidateIds.push(Number(candidate.id));
    }
  }
  const updated = await result.payload.update({ collection: "search-query-review-groups", id: group.id, data: { classificationState: body.decision, ...(vocabularyId ? { vocabulary: vocabularyId } : {}), ...(candidateIds.length ? { negativeCandidates: candidateIds } : {}), reviewerDecision: { decision: body.decision, phrase: body.phrase, createNegativeCandidate: !!body.createNegativeCandidate, decidedAt: new Date().toISOString() } }, overrideAccess: true });
  return NextResponse.json({ group: updated, vocabularyId, candidateIds });
}
