import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getPayload, type Where } from "payload";

import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import { groupAutomationEvents, type GroupableEvent } from "@/lib/google-ads-automation/group";

const MAX_LIMIT = 200;
/** Raw change events read per request before grouping into batch rows. */
const RAW_EVENT_CAP = 5000;

/** Feed for /admin/google-ads-automation. Filters: client, source, resource
 *  type, date range; Google-made changes only unless `all=1`. */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!userHasFeature(user, "nav:google-ads")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const params = req.nextUrl.searchParams;
    const and: Where[] = [];

    if (params.get("all") !== "1") and.push({ isGoogleAutomated: { equals: true } });

    const clientId = params.get("clientId");
    if (clientId) and.push({ client: { equals: clientId } });

    const clientType = params.get("clientType");
    if (clientType) and.push({ clientType: { equals: clientType } });

    const resourceType = params.get("resourceType");
    if (resourceType) and.push({ changeResourceType: { equals: resourceType } });

    const reviewStatus = params.get("reviewStatus");
    if (reviewStatus) and.push({ reviewStatus: { equals: reviewStatus } });

    const day = /^\d{4}-\d{2}-\d{2}$/;
    const start = params.get("start");
    if (start && day.test(start)) and.push({ changeDateTime: { greater_than_equal: `${start} 00:00:00` } });
    const end = params.get("end");
    if (end && day.test(end)) and.push({ changeDateTime: { less_than_equal: `${end} 23:59:59` } });

    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit") || 100) || 100));
    const page = Math.max(1, Number(params.get("page") || 1) || 1);

    // Bulk operations (a script touching every keyword) arrive as one event per
    // resource, so read raw events up to a cap, collapse each batch into one
    // row, then page over the grouped rows.
    const result = await payload.find({
      collection: "google-ads-automation-events",
      where: and.length > 0 ? { and } : {},
      sort: "-changeDateTime",
      limit: RAW_EVENT_CAP,
      pagination: false,
      depth: 0,
      overrideAccess: false,
      user,
    });
    const rawDocs = result.docs as unknown as GroupableEvent[];
    const grouped = groupAutomationEvents(rawDocs);

    const totalDocs = grouped.length;
    const totalPages = Math.max(1, Math.ceil(totalDocs / limit));
    const pageRows = grouped.slice((page - 1) * limit, page * limit);

    const clientIds = [...new Set(pageRows.map((row) => row.client).filter((id): id is number | string => typeof id === "number" || typeof id === "string"))];
    const clientNames = new Map<string, string>();
    if (clientIds.length > 0) {
      const clients = await payload.find({
        collection: "clients",
        where: { id: { in: clientIds } },
        limit: clientIds.length,
        depth: 0,
        pagination: false,
        overrideAccess: false,
        user,
      });
      for (const client of clients.docs as Array<{ id: number | string; name?: string | null }>) {
        clientNames.set(String(client.id), client.name || "");
      }
    }

    const events = pageRows.map((row) => {
      const id = typeof row.client === "number" || typeof row.client === "string" ? row.client : null;
      return {
        ...row,
        client: id === null ? null : { id, name: clientNames.get(String(id)) || undefined },
      };
    });

    const response = NextResponse.json({
      events,
      totalDocs,
      page,
      totalPages,
      rawEventCount: rawDocs.length,
      truncated: rawDocs.length >= RAW_EVENT_CAP,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[google-ads-automation]", error);
    return NextResponse.json({ error: "Failed to load automation events" }, { status: 500 });
  }
}
