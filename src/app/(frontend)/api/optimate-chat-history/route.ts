import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

/**
 * GET /api/optimate-chat-history
 *
 * Two modes (query params):
 *   ?auditId=...    → list recent chat sessions for the authenticated user
 *                     in this audit. Returns `{ sessions: [{ sessionId,
 *                     firstMessage, lastMessageAt, turnCount }] }`.
 *   ?sessionId=...  → list the turns inside a single session in chronological
 *                     order. Ownership is enforced — non-admin users can
 *                     only read their own threads.
 *
 * Persistence is best-effort upstream (the chat route logs errors and keeps
 * going), so consumers MUST tolerate an empty list — it doesn't necessarily
 * mean the audit has no history, it might just mean writes failed.
 */
export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const auditId = url.searchParams.get("auditId");
    const sessionId = url.searchParams.get("sessionId");

    const isAdmin = (user as { role?: string }).role === "admin";

    if (sessionId) {
      // Thread view: fetch all turns for this session in order. Ownership
      // filter is applied unless the caller is an admin.
      const where: Record<string, unknown> = {
        sessionId: { equals: sessionId },
      };
      if (!isAdmin) {
        where.user = { equals: user.id };
      }
      const res = await payload.find({
        collection: "optimate-chat-turns" as any,
        where: where as any,
        sort: "createdAt",
        limit: 500,
        overrideAccess: true,
      });
      const turns = (res.docs as Array<Record<string, unknown>>).map((d) => ({
        id: d.id,
        role: d.role,
        content: d.content,
        runId: d.runId,
        modelUsed: d.modelUsed,
        proposalIds: d.proposalIds,
        createdAt: d.createdAt,
      }));
      return NextResponse.json({ sessionId, turns });
    }

    if (!auditId) {
      return NextResponse.json(
        { error: "auditId or sessionId is required" },
        { status: 400 },
      );
    }

    // Session list: pull recent turns for this audit (user-scoped unless
    // admin) and reduce into one row per sessionId. We over-fetch turns and
    // group client-side because Payload's REST/local API doesn't expose a
    // GROUP BY. Capped at 200 rows scanned, 50 sessions returned.
    const where: Record<string, unknown> = {
      audit: { equals: auditId },
    };
    if (!isAdmin) {
      where.user = { equals: user.id };
    }
    const res = await payload.find({
      collection: "optimate-chat-turns" as any,
      where: where as any,
      sort: "-createdAt",
      limit: 200,
      overrideAccess: true,
    });

    type Session = {
      sessionId: string;
      firstMessage: string;
      lastMessageAt: string;
      turnCount: number;
    };
    const sessions = new Map<string, Session>();
    for (const raw of res.docs as Array<Record<string, unknown>>) {
      const sid = typeof raw.sessionId === "string" ? raw.sessionId : "";
      if (!sid) continue;
      const preview =
        typeof raw.preview === "string" && raw.preview.length > 0
          ? raw.preview
          : typeof raw.content === "string"
            ? raw.content.slice(0, 80)
            : "";
      const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : "";
      const existing = sessions.get(sid);
      if (!existing) {
        // First (= most recent because sort is desc) row encountered for this
        // session becomes the placeholder; we overwrite firstMessage as we
        // walk through to older rows so the final value is the OLDEST turn
        // (the actual first message of the thread).
        sessions.set(sid, {
          sessionId: sid,
          firstMessage: preview,
          lastMessageAt: createdAt,
          turnCount: 1,
        });
      } else {
        existing.turnCount += 1;
        // Replace with older row's preview — this row is older than the
        // previously stored one (desc sort), so its preview is closer to the
        // thread's true first message.
        if (raw.role === "user" || existing.firstMessage === "") {
          existing.firstMessage = preview;
        }
      }
    }

    const list = Array.from(sessions.values())
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .slice(0, 50);

    return NextResponse.json({ sessions: list });
  } catch (err) {
    console.error("[optimate-chat-history] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to load chat history" },
      { status: 500 },
    );
  }
}
