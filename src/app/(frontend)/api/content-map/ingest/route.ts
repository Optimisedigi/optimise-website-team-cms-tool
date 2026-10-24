import { after, NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { maybeStartWeeklyCitations } from "@/lib/content-map/citations";
import { needsIdeas, refreshIdeas } from "@/lib/content-map/ideas";
import { runResearchSchedule } from "@/lib/content-map/placement";
import { triggerContentMapRun, upsertRun } from "@/lib/content-map/snapshots";
import { isGrowthToolsPush, validClientId } from "@/lib/content-map/state";
import { isRecord } from "@/lib/content-map/types";

// Long enough for the post-response Write next ideas (after()).
export const maxDuration = 300;

/** GT pushes a finished (or failed) analysis here. Idempotent: upsert by runId. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isGrowthToolsPush(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const clientId = typeof body.clientId === "number" ? String(body.clientId) : body.clientId;
  const runId = body.runId;
  const status = body.status;
  if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });
  if (typeof runId !== "string" || !runId || runId.length > 200) return NextResponse.json({ error: "runId is invalid" }, { status: 400 });
  if (status !== "completed" && status !== "failed") return NextResponse.json({ error: "status must be completed or failed" }, { status: 400 });
  try {
    const payload = await getPayload({ config });
    try {
      await payload.findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true, select: { name: true } });
    } catch {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    const out = await upsertRun(payload, {
      clientId,
      runId,
      status,
      error: typeof body.error === "string" ? body.error.slice(0, 2000) : undefined,
      snapshot: status === "completed" ? body.snapshot : undefined,
    });
    let refreshRunId: string | null = null;
    if (out.pendingRefresh) {
      const next = await triggerContentMapRun(payload, clientId, "refresh");
      if (next.ok) refreshRunId = String(next.run.runId ?? "");
    }
    // GT ran without an LLM: write the Write next ideas with the CMS's
    // subscription models once the push has been acknowledged. In parallel,
    // Search Console (≥ 6 days) and monthly research (≥ 28 days) start right
    // away: research doesn't need the ideas. The weekly AI citation check
    // (≥ 6 days) waits for the ideas, because it tracks their questions.
    const completed = out.doc.status === "completed";
    const ideasPending = completed && needsIdeas(out.snapshot);
    if (completed) {
      const doc = out.doc;
      const ideasThenCitations = async () => {
        if (ideasPending) {
          const res = await refreshIdeas(payload, doc).catch((err: Error) => ({ ok: false as const, error: err.message }));
          if (!res.ok) console.warn("[content-map] ideas after ingest failed:", res.error);
        }
        const cit = await maybeStartWeeklyCitations(payload, clientId).catch((err: Error) => ({ ok: false as const, error: err.message, status: 500 }));
        if (cit && !cit.ok) console.warn("[content-map] weekly citation run not started:", cit.error);
      };
      const research = async () => {
        const rs = await runResearchSchedule(payload, clientId).catch((err: Error) => { console.warn("[content-map] research schedule failed:", err.message); return null; });
        if (rs?.research && !rs.research.ok) console.warn("[content-map] monthly research not started:", rs.research.error);
      };
      const job = async () => {
        await Promise.all([ideasThenCitations(), research()]);
      };
      try {
        after(job);
      } catch {
        // Outside a request scope (scripts): run detached rather than lose it.
        void job();
      }
    }
    return NextResponse.json({ ok: true, status: out.doc.status, refreshRunId, ideasPending });
  } catch (err) {
    console.error("[content-map] ingest failed:", (err as Error).message);
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
