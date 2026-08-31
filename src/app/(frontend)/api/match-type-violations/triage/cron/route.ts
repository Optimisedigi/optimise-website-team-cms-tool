/**
 * Weekly auto-triage for phrase-match violations.
 *
 * Researches the violations that actually matter (any clicks, or >5 impressions)
 * and pre-decides each into one of four buckets, so the human review in the
 * "Auto decisions" tab is a few bulk clicks. NOTHING is applied to Google Ads
 * here: this only writes the `ai_*` columns on the candidate row.
 *
 * Idempotency: `aiDecidedAt` is the marker. A row is only picked up when it is
 * NULL, and a client whose research or classification fails is left entirely
 * untouched so next week's run retries it.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";
import { NO_SUMMARY, researchSearchTerms } from "@/lib/search-term-research";
import { classifyViolations, type TriageRow } from "@/lib/match-type-triage";

export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;
/** Bound cost/time per client per run. */
const MAX_TERMS_PER_CLIENT = 60;
/** Stop starting new clients past this; remaining ones wait for next week. */
const TIME_BUDGET_MS = 240_000;

async function authCron(req: NextRequest): Promise<boolean> {
  if (!CRON_SECRET) return false;
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!token) return false;
  try {
    const expected = Buffer.from(CRON_SECRET);
    const provided = Buffer.from(token);
    return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

interface ClientResult {
  clientId: number;
  clientName: string;
  decided: number;
  /** Rows left undecided because research returned no usable summary. */
  unresearched?: number;
  skippedReason?: string;
}

async function triageClient(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientDoc: { id: number | string; name?: string; websiteUrl?: string | null },
): Promise<ClientResult> {
  const clientId = Number(typeof clientDoc.id === "object" ? (clientDoc.id as any).id : clientDoc.id);
  const clientName = String(clientDoc.name ?? `Client ${clientId}`);

  const candidates = await (payload.find as any)({
    collection: "match-type-violation-candidates",
    where: {
      and: [
        { client: { equals: clientId } },
        { status: { equals: "pending" } },
        { matchType: { equals: "PHRASE" } },
        { aiDecidedAt: { exists: false } },
        { or: [{ clicks: { greater_than: 0 } }, { impressions: { greater_than: 5 } }] },
      ],
    },
    sort: "-clicks,-impressions",
    limit: MAX_TERMS_PER_CLIENT,
    depth: 0,
    overrideAccess: true,
  });

  const docs: any[] = Array.isArray(candidates?.docs) ? candidates.docs : [];
  if (docs.length === 0) return { clientId, clientName, decided: 0 };

  const research = await researchSearchTerms(docs.map((d) => String(d.searchTerm ?? "")));
  if (research.summariserError) {
    // Leave every row undecided so next week retries with a working summariser.
    return { clientId, clientName, decided: 0, skippedReason: `research failed: ${research.summariserError}` };
  }
  const byTerm = new Map(research.results.map((r) => [r.term.toLowerCase(), r]));

  const allRows: TriageRow[] = docs.map((d) => {
    const term = String(d.searchTerm ?? "");
    const researched = byTerm.get(term.toLowerCase());
    return {
      id: d.id,
      searchTerm: term,
      campaignName: d.campaignName,
      adGroupName: d.adGroupName,
      triggeringKeyword: d.triggeringKeyword,
      nearestKeyword: d.nearestKeyword,
      summary: researched?.summary ?? null,
      sourceTitle: researched?.source?.title ?? null,
      sourceLink: researched?.source?.link ?? null,
    };
  });

  // A row with no real summary would be classified blind. Leave it undecided so
  // next week's run retries it with working research.
  const rows = allRows.filter((r) => r.summary && r.summary !== NO_SUMMARY);
  const unresearched = allRows.length - rows.length;
  if (rows.length === 0) {
    return {
      clientId,
      clientName,
      decided: 0,
      skippedReason: `no usable research for ${allRows.length} term(s)`,
    };
  }

  let decisions;
  try {
    decisions = await classifyViolations({
      client: { name: clientName, websiteUrl: clientDoc.websiteUrl ?? null },
      rows,
    });
  } catch (err) {
    // Unparseable model output: write nothing, so the rows stay retryable.
    return {
      clientId,
      clientName,
      decided: 0,
      skippedReason: `classification failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const rowById = new Map(rows.map((r) => [String(r.id), r]));
  const now = new Date().toISOString();
  let decided = 0;
  for (const decision of decisions) {
    const row = rowById.get(String(decision.id));
    if (!row) continue;
    try {
      await (payload.update as any)({
        collection: "match-type-violation-candidates",
        id: decision.id,
        data: {
          aiDecision: decision.decision,
          aiReason: decision.reason,
          aiSummary: row.summary ?? null,
          aiSourceTitle: row.sourceTitle ?? null,
          aiSourceLink: row.sourceLink ?? null,
          aiConfidence: decision.confidence,
          aiDecidedAt: now,
        },
        overrideAccess: true,
      });
      decided++;
    } catch (err) {
      console.error(`[match-type-triage] Failed to persist decision for candidate ${decision.id}:`, err);
    }
  }

  if (decided > 0) {
    await logActivity(payload, {
      type: "match_type_violation_sync",
      title: `Match type triage: ${decided} violations pre-decided`,
      description: `${clientName}: ${decided} of ${rows.length} phrase violations auto-triaged for review`,
      client: clientId,
    });
  }

  return { clientId, clientName, decided, ...(unresearched > 0 ? { unresearched } : {}) };
}

export async function GET(req: NextRequest) {
  if (!(await authCron(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    const clientParam = req.nextUrl.searchParams.get("clientId");
    // ?force=true + ?clientId= triages one named client even when its monitor
    // toggle is off. Without a clientId the toggle still gates the run, so a
    // stray force never fans out across every client.
    const force = req.nextUrl.searchParams.get("force") === "true" && Boolean(clientParam);

    const where: any = { and: [] as any[] };
    if (!force) where.and.push({ "gadsAuto.matchTypeMonitorEnabled": { equals: true } });
    if (clientParam && /^\d+$/.test(clientParam)) {
      where.and.push({ id: { equals: Number(clientParam) } });
    }

    const clientsResult = await (payload.find as any)({
      collection: "clients",
      where: where.and.length > 0 ? where : {},
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });

    const clientDocs: any[] = Array.isArray(clientsResult?.docs) ? clientsResult.docs : [];
    const results: ClientResult[] = [];
    let timedOut = false;

    for (let i = 0; i < clientDocs.length; i++) {
      // A client's rows are only written after its batch completes, so stopping
      // here never leaves half-classified state.
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        timedOut = true;
        break;
      }
      try {
        results.push(await triageClient(payload, clientDocs[i]));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const cause = (err as { cause?: { message?: string } })?.cause?.message ?? "";
        console.error(
          `[match-type-triage] Client ${clientDocs[i]?.id} failed:`,
          msg,
          cause ? `Cause: ${cause}` : "",
        );
        results.push({
          clientId: Number(clientDocs[i]?.id),
          clientName: String(clientDocs[i]?.name ?? ""),
          decided: 0,
          skippedReason: msg,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      clients: clientDocs.length,
      processed: results.length,
      decided: results.reduce((sum, r) => sum + r.decided, 0),
      skipped: results.filter((r) => r.skippedReason).map((r) => ({ client: r.clientName, reason: r.skippedReason })),
      timedOut,
      unprocessed: clientDocs.length - results.length,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[match-type-triage] Run failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
