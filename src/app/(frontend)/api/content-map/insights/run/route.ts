import crypto from "crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { writeInsights } from "@/lib/content-map/citations";
import { writeResearchInsights } from "@/lib/content-map/placement";

// The whole budget is for the AI job (4 topics in flight, up to 2 minutes each).
export const maxDuration = 300;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!secret || !token) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Internal: run a research-placement or AI-citation analysis job handed off by
 * a short page-load route (src/lib/content-map/handoff.ts). Answers at once and
 * works after the response. Resumes only the topics still missing.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = ((await req.json().catch(() => null)) ?? {}) as { kind?: unknown; id?: unknown };
  const kind = body.kind === "research" || body.kind === "citations" ? body.kind : null;
  const id = typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : "";
  if (!kind || !/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "kind and id are required" }, { status: 400 });
  const payload = await getPayload({ config });
  const collection = kind === "research" ? "content-map-research" : "content-map-citations";
  let doc: Record<string, unknown>;
  try {
    doc = (await payload.findByID({ collection, id: Number(id), depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (doc.status !== "completed") return NextResponse.json({ error: "Run isn't completed" }, { status: 409 });
  after(async () => {
    const res = await (kind === "research" ? writeResearchInsights(payload, doc) : writeInsights(payload, doc)).catch((err: Error) => ({ ok: false as const, error: err.message }));
    if (!res.ok) console.warn(`[content-map] ${kind} insights (handed off) failed:`, res.error);
  });
  return NextResponse.json({ ok: true, kind, id }, { status: 202 });
}
