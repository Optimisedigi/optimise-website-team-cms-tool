import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * Proxy to Growth Tools: POST /api/search-console/content-refresh
 * Analyses a page and generates AI-powered content improvement suggestions.
 */
export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { url, siteUrl, focusKeyword } = body;

    if (!url) {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 },
      );
    }

    const res = await fetch(
      `${GROWTH_TOOLS_URL}/api/search-console/content-refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY,
        },
        body: JSON.stringify({ url, siteUrl, focusKeyword }),
      },
    );

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Content refresh failed";
    console.error("[gsc/indexing-helper/content-refresh]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
