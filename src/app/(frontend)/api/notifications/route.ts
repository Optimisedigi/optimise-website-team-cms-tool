import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * GET /api/notifications
 *
 * Returns the logged-in user's notifications, newest first (ties broken by
 * id). Default page size 20.
 *
 *  - `?unreadOnly=true` returns unread rows only.
 *  - `?beforeCreatedAt=<ISO>&beforeId=<id>` returns the rows after that one
 *    (keyset paging, used by the bell's infinite scroll). Unlike `page`, it
 *    never skips or repeats a row when rows are read or added in between.
 *  - `?page=M` still works for simple offset paging.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cfg = await config;
  const payload = await getPayload({ config: cfg });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
  const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const cursor = parseCursor(url.searchParams.get("beforeCreatedAt"), url.searchParams.get("beforeId"));

  const where: Record<string, unknown> = {
    and: [
      { recipient: { equals: user.id } },
      ...(unreadOnly ? [{ readAt: { exists: false } }] : []),
      ...(cursor
        ? [{
            or: [
              { createdAt: { less_than: cursor.createdAt } },
              { and: [{ createdAt: { equals: cursor.createdAt } }, { id: { less_than: cursor.id } }] },
            ],
          }]
        : []),
    ],
  };

  const notificationResult = await payload
    .find({
      collection: "notifications" as never,
      where: where as never,
      limit,
      page: cursor ? 1 : page,
      sort: ["-createdAt", "-id"],
      overrideAccess: true,
      depth: 0,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        url: true,
        readAt: true,
        createdAt: true,
      } as never,
    }).catch((err: unknown) => {
      payload.logger?.error?.({
        msg: "notifications find failed; returning no rows",
        error: err instanceof Error ? err.message : String(err),
      });
      return { docs: [], totalDocs: 0, totalPages: 1 };
    });

  const docs = notificationResult.docs as Array<Record<string, unknown>>;
  const totalDocs = notificationResult.totalDocs ?? docs.length;
  const totalPages = notificationResult.totalPages ?? 1;

  return NextResponse.json({
    docs,
    totalDocs,
    page: cursor ? 1 : page,
    totalPages,
    hasNextPage: docs.length > 0 && totalDocs > (cursor ? docs.length : (page - 1) * limit + docs.length),
  });
}

/** A valid keyset cursor, or null when either part is missing or malformed. */
function parseCursor(createdAt: string | null, id: string | null): { createdAt: string; id: number } | null {
  if (!createdAt || !id) return null;
  const time = new Date(createdAt);
  const numericId = Number(id);
  if (Number.isNaN(time.getTime()) || !Number.isInteger(numericId)) return null;
  return { createdAt: time.toISOString(), id: numericId };
}
