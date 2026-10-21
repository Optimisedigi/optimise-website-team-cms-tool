import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { hasValidApiKey } from "@/collections/api-key-access";
import { isAdmin } from "@/lib/access";
import { backfillClientOverviews, listBackfillCandidates } from "@/lib/client-overview/draft";

export const maxDuration = 300;

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

/**
 * POST /api/client-overview/backfill — admin session or `x-api-key: AUDIT_API_KEY`.
 *
 * One-off backfill of "Who is this client?" drafts for existing clients that
 * are active, have a website URL, have an empty section and no draft already
 * waiting. Drafts go to the OptiMate approval queue; nothing is written to a
 * client until an admin approves and applies it.
 *
 * Preview by default (lists the clients, no website or LLM calls). Send
 * `{ "apply": true }` to draft a batch of up to `limit` (default 5, max 10)
 * clients; the response has `remaining` and `nextAfterId`. Repeat with
 * `{ "apply": true, "afterId": <nextAfterId> }` until `remaining` is 0.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const payload = await getPayload({ config: await config });

  let authorised = hasValidApiKey(request);
  if (!authorised) {
    const { user } = await payload.auth({ headers: request.headers });
    authorised = Boolean(user) && isAdmin(user);
  }
  if (!authorised) {
    return NextResponse.json({ error: "Unauthorized: admin or API key required" }, { status: 401 });
  }

  let fields: Record<string, unknown> = {};
  try {
    const text = await request.text();
    const parsed: unknown = text.trim() ? JSON.parse(text) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      fields = parsed as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ error: 'Body must be JSON, e.g. {"apply": true}' }, { status: 400 });
  }

  const rawLimit = fields.limit ?? DEFAULT_LIMIT;
  if (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT) {
    return NextResponse.json({ error: `"limit" must be a whole number from 1 to ${MAX_LIMIT}` }, { status: 400 });
  }
  const afterId = fields.afterId;
  if (afterId !== undefined && (typeof afterId !== "number" || !Number.isFinite(afterId))) {
    return NextResponse.json({ error: '"afterId" must be a client id number' }, { status: 400 });
  }

  try {
    if (fields.apply !== true) {
      const candidates = await listBackfillCandidates(payload);
      return NextResponse.json({
        mode: "preview",
        count: candidates.length,
        clients: candidates,
        next: `Send {"apply": true} to draft up to ${DEFAULT_LIMIT} at a time.`,
      });
    }

    const batch = await backfillClientOverviews(payload, { limit: rawLimit, afterId });
    const queued = batch.results.filter((r) => r.status === "queued").length;
    payload.logger.info({ msg: "client overview backfill batch", queued, processed: batch.results.length, remaining: batch.remaining });
    return NextResponse.json({
      mode: "apply",
      processed: batch.results.length,
      queued,
      results: batch.results,
      remaining: batch.remaining,
      nextAfterId: batch.remaining > 0 ? batch.lastId : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    payload.logger.error({ msg: "client overview backfill failed", error: message });
    return NextResponse.json({ error: "Backfill failed", detail: message }, { status: 500 });
  }
}
