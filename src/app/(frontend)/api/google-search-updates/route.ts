import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getPayload, type Where } from "payload";

import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";

const MAX_LIMIT = 100;

/** Confirmed Google Search algorithm updates for the Watchtower page. */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!userHasFeature(user, "nav:google-ads") && !userHasFeature(user, "nav:seo")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const params = req.nextUrl.searchParams;
    const and: Where[] = [];
    if (params.get("all") !== "1") {
      and.push({ kind: { in: ["core", "spam", "discover"] } });
    }

    const kind = params.get("kind");
    if (kind) and.push({ kind: { equals: kind } });

    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit") || 30) || 30));

    const result = await payload.find({
      collection: "google-search-status-incidents",
      where: and.length > 0 ? { and } : {},
      sort: "-begin",
      limit,
      depth: 0,
      overrideAccess: false,
      user,
    });

    const response = NextResponse.json({
      incidents: result.docs,
      totalDocs: result.totalDocs,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[google-search-updates]", error);
    return NextResponse.json({ error: "Failed to load search updates" }, { status: 500 });
  }
}
