import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * Proxy to Growth Tools: GET /api/search-console/sites
 * Lists all GSC properties available for the authenticated service account.
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config: await config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
      return NextResponse.json(
        { error: "Growth Tools not configured" },
        { status: 503 },
      );
    }

    const res = await fetch(`${GROWTH_TOOLS_URL}/api/search-console/sites`, {
      headers: { "x-internal-key": INTERNAL_API_KEY },
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch sites";
    console.error("[gsc/indexing-helper/sites]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
