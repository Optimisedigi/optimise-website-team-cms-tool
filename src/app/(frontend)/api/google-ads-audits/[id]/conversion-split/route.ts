import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { hasValidApiKey } from "@/collections/api-key-access";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * GET /api/google-ads-audits/[id]/conversion-split
 *
 * Admin-authed. Resolves the audit's linked client, calls the Growth Tools
 * dashboard endpoint with the client's slug + Google Ads config, and returns
 * just the conversion-split shape the `ConversionSplit` component needs.
 *
 * Used by the Google Ads Audit > Conversions tab. The dashboard endpoint is
 * keyed by client slug, so a linked client with a slug is required.
 *
 * Response: { conversionSplit, conversionSplitByCampaign }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auditId = Number(id);

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user && !hasValidApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let audit: any;
  try {
    audit = await payload.findByID({
      collection: "google-ads-audits",
      id: auditId,
      depth: 2,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Resolve the linked client (the conversion config + slug live there).
  let linkedClient: any = null;
  if (audit.client) {
    try {
      const clientId =
        typeof audit.client === "object" ? audit.client.id : audit.client;
      linkedClient =
        typeof audit.client === "object"
          ? audit.client
          : await payload.findByID({
              collection: "clients",
              id: clientId,
              overrideAccess: true,
            });
    } catch {
      /* fall through */
    }
  }

  if (!linkedClient) {
    return NextResponse.json(
      { error: "Audit has no linked client" },
      { status: 400 }
    );
  }

  const slug: string = linkedClient.slug || "";
  if (!slug) {
    return NextResponse.json(
      { error: "Linked client has no slug" },
      { status: 400 }
    );
  }

  const customerId = linkedClient.googleAdsCustomerId || audit.customerId;
  if (!customerId) {
    return NextResponse.json(
      { error: "No Google Ads customer ID on linked client or audit" },
      { status: 400 }
    );
  }

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Growth Tools service not configured" },
      { status: 503 }
    );
  }

  const range = req.nextUrl.searchParams.get("range") || "all_time";

  // Conversion-action filter (newline/comma -> comma-separated).
  const conversionActions: string = String(
    linkedClient.dashboardConversionActions || ""
  )
    .split(/[\r\n,]+/)
    .map((s: string) => s.trim())
    .filter(Boolean)
    .join(",");

  // Build the conversionActionCategories JSON the dashboard expects so the
  // split renders per-category columns. Mirror the dashboard page's logic:
  // explicit categories first, falling back to legacy phone/form fields.
  let categoriesArray: Array<{ label: string; color: string; actions: string[] }> = [];
  const rawCategories = linkedClient.conversionActionCategories;
  if (Array.isArray(rawCategories) && rawCategories.length > 0) {
    categoriesArray = rawCategories
      .map((c: any) => ({
        label: String(c?.label || "").trim(),
        color: String(c?.color || "sky"),
        actions: String(c?.actions || "")
          .split(/[\r\n,]+/)
          .map((s: string) => s.trim())
          .filter(Boolean),
      }))
      .filter((c) => c.label && c.actions.length > 0);
  } else {
    const phone = String(linkedClient.phoneCallConversionActions || "")
      .split(/[\r\n,]+/)
      .map((s: string) => s.trim())
      .filter(Boolean);
    const form = String(linkedClient.formSubmitConversionActions || "")
      .split(/[\r\n,]+/)
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (phone.length > 0)
      categoriesArray.push({ label: "Phone Calls", color: "sky", actions: phone });
    if (form.length > 0)
      categoriesArray.push({ label: "Form Submits", color: "violet", actions: form });
  }

  try {
    const cleanCustomerId = String(customerId).replace(/-/g, "");
    const qs = new URLSearchParams({ range, customerId: cleanCustomerId });
    if (linkedClient.name) qs.set("clientName", linkedClient.name);
    if (linkedClient.brandKeywords) qs.set("brandKeywords", linkedClient.brandKeywords);
    if (conversionActions) qs.set("conversionActions", conversionActions);
    if (categoriesArray.length > 0)
      qs.set("conversionActionCategories", JSON.stringify(categoriesArray));

    const url = `${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${encodeURIComponent(slug)}?${qs}`;
    const res = await fetch(url, {
      headers: { "x-internal-key": INTERNAL_API_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Growth Tools returned ${res.status}: ${body.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      conversionSplit: data?.conversionSplit ?? null,
      conversionSplitByCampaign: Array.isArray(data?.conversionSplitByCampaign)
        ? data.conversionSplitByCampaign
        : [],
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to fetch conversion split: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
