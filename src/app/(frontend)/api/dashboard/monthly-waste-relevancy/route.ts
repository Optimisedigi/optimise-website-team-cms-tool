import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * Per-month waste / relevancy figures for the Progress tab's Monthly Trend
 * chart. Pulls 12 months of search-term spend from Google Ads (via Growth
 * Tools) and computes:
 *   - totalSpend            — sum of cost across all search terms that month
 *   - nonConvertingSpend    — cost on terms with 0 conversions that month
 *   - irrelevantSpend       — cost on terms currently in the client's NKL set
 *
 * The CMS resolves "irrelevant terms" from the client's active NKLs (every
 * source — deep-dive saves, NLB-imported lists, manual additions). Sends
 * that list to Growth Tools so the per-month bucketing can match.
 *
 * Auth: dashboard_token cookie (same pattern as the other dashboard routes).
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const clientIdParam = req.nextUrl.searchParams.get("clientId");
  const customerId = req.nextUrl.searchParams.get("customerId") || "";
  const monthsBack = Math.min(
    36,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("monthsBack") || "12", 10) || 12),
  );

  if (!slug || !clientIdParam) {
    return NextResponse.json({ error: "Missing slug or clientId" }, { status: 400 });
  }

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GROWTH_TOOLS_URL || !GROWTH_TOOLS_API_KEY || !customerId) {
    // Without an upstream we can't compute the chart values; respond with
    // an empty monthly array so the dashboard falls back gracefully.
    return NextResponse.json({ success: false, monthsBack, monthly: [] });
  }

  const clientId = parseInt(clientIdParam, 10);
  if (Number.isNaN(clientId)) {
    return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
  }

  // Pull every keyword from this client's active NKLs (any source). These
  // are the "currently flagged irrelevant" terms — Growth Tools matches
  // search-term spend against this set per month.
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const nkls = await payload.find({
    collection: "negative-keyword-lists",
    where: {
      and: [
        { client: { equals: clientId } },
        { isActive: { equals: true } },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  const irrelevantSet = new Set<string>();
  for (const list of nkls.docs as any[]) {
    for (const kw of list?.keywords ?? []) {
      if (typeof kw?.keyword === "string" && kw.keyword.trim()) {
        irrelevantSet.add(kw.keyword.trim());
      }
    }
  }
  const irrelevantTerms = Array.from(irrelevantSet);

  try {
    const cleanCustomerId = customerId.replace(/-/g, "");
    const res = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${encodeURIComponent(slug)}/monthly-waste-relevancy`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-key": GROWTH_TOOLS_API_KEY,
      },
      body: JSON.stringify({
        customerId: cleanCustomerId,
        irrelevantTerms,
        monthsBack,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[monthly-waste-relevancy] Growth Tools ${res.status}: ${text}`);
      return NextResponse.json({ success: false, monthsBack, monthly: [] });
    }

    const data = await res.json();
    const out = NextResponse.json({
      success: true,
      monthsBack: data.monthsBack ?? monthsBack,
      monthly: Array.isArray(data.monthly) ? data.monthly : [],
      irrelevantTermCount: irrelevantTerms.length,
    });
    out.headers.set("Cache-Control", "no-store");
    return out;
  } catch (err) {
    console.error("[monthly-waste-relevancy]", err);
    return NextResponse.json({ success: false, monthsBack, monthly: [] });
  }
}
