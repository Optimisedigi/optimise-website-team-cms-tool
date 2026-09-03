import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getPayload, type Where } from "payload";

import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";

const MAX_LIMIT = 200;

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

    const result = await payload.find({
      collection: "google-ads-automation-events",
      where: and.length > 0 ? { and } : {},
      sort: "-changeDateTime",
      limit,
      page,
      depth: 1,
      overrideAccess: false,
      user,
    });

    const response = NextResponse.json({
      events: result.docs,
      totalDocs: result.totalDocs,
      page: result.page,
      totalPages: result.totalPages,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[google-ads-automation]", error);
    return NextResponse.json({ error: "Failed to load automation events" }, { status: 500 });
  }
}
