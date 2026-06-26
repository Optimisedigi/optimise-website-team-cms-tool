import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_INTERNAL_KEY = process.env.GROWTH_TOOLS_INTERNAL_KEY || process.env.INTERNAL_API_KEY;

export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GROWTH_TOOLS_URL || !GROWTH_TOOLS_INTERNAL_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: missing GROWTH_TOOLS_URL or GROWTH_TOOLS_INTERNAL_KEY" },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  const websiteUrl = typeof body?.websiteUrl === "string" ? body.websiteUrl.trim() : "";
  const businessName = typeof body?.businessName === "string" ? body.businessName.trim() : undefined;
  const location = typeof body?.location === "string" && body.location.trim() ? body.location.trim() : "us";

  if (!websiteUrl) {
    return NextResponse.json({ error: "websiteUrl is required" }, { status: 400 });
  }

  try {
    const parsed = new URL(websiteUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Website URL must start with http:// or https://" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });
  }

  try {
    const res = await fetch(`${GROWTH_TOOLS_URL.replace(/\/+$/, "")}/api/google-ads/page-build-keyword-research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": GROWTH_TOOLS_INTERNAL_KEY,
      },
      body: JSON.stringify({
        websiteUrl,
        businessName,
        location,
        maxCategories: 12,
        maxKeywordsPerCategory: 30,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const status = res.status >= 400 && res.status <= 599 ? res.status : 502;
      return NextResponse.json(
        { error: data?.message || data?.error || `Keyword research failed (${res.status})` },
        { status },
      );
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ClientProposalKeywordResearch] Error:", message);
    return NextResponse.json({ error: "Keyword research failed" }, { status: 500 });
  }
}
