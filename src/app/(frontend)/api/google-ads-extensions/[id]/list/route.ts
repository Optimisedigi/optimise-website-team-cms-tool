import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const EXTENSIONS_COLLECTION: any = "google-ads-ad-extensions";

interface ListExtensionsRequest {
  extensionType?: "sitelink" | "structured_snippet";
}

/**
 * GET /api/google-ads-extensions/[id]/list
 * List existing ad extensions from both Growth Tools and CMS.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse query params
  const { searchParams } = new URL(req.url);
  const extensionType = searchParams.get("extensionType") as
    | "sitelink"
    | "structured_snippet"
    | null;

  // Fetch the audit record
  let audit: any;
  try {
    audit = await payload.findByID({
      collection: "google-ads-audits",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Prefer client account ID over audit's (which may be MCC)
  let customerId = audit.customerId;
  if (audit.client) {
    try {
      const clientId = typeof audit.client === 'object' ? audit.client.id : audit.client;
      const client = typeof audit.client === 'object' ? audit.client : await payload.findByID({
        collection: "clients",
        id: clientId,
        overrideAccess: true,
      });
      if (client?.googleAdsCustomerId) {
        customerId = client.googleAdsCustomerId;
      }
    } catch { /* client lookup failed, use audit customerId */ }
  }
  if (!customerId) {
    return NextResponse.json(
      { error: "No Google Ads customer ID found on audit or linked client" },
      { status: 400 }
    );
  }

  // Build CMS query
  const cmsWhere: any = { audit: { equals: id } };
  if (extensionType) {
    cmsWhere.extensionType = { equals: extensionType };
  }

  // Fetch from CMS
  let cmsExtensions: any[] = [];
  try {
    const result = await payload.find({
      collection: EXTENSIONS_COLLECTION,
      where: cmsWhere,
      limit: 100,
      overrideAccess: true,
    });
    cmsExtensions = result.docs;
  } catch (e: any) {
    console.error("[GoogleAdsExtensions] CMS fetch error:", e.message);
  }

  // Fetch from Growth Tools if configured
  let apiExtensions: any[] = [];
  if (GROWTH_TOOLS_URL && INTERNAL_API_KEY) {
    try {
      const url = new URL(
        `${GROWTH_TOOLS_URL}/api/google-ads/ad-extensions/list`
      );
      url.searchParams.set("customerId", customerId.replace(/-/g, ""));
      if (extensionType) {
        url.searchParams.set("extensionType", extensionType);
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "x-internal-key": INTERNAL_API_KEY!,
        },
      });

      if (response.ok) {
        const result = await response.json();
        apiExtensions = result.extensions || [];
      } else {
        const errorBody = await response.text();
        if (errorBody.includes("REQUESTED_METRICS_FOR_MANAGER")) {
          return NextResponse.json(
            { error: "This is a manager (MCC) account. Enter the client account ID instead — find it under the MCC in Google Ads." },
            { status: 400 }
          );
        }
      }
    } catch (e: any) {
      console.error("[GoogleAdsExtensions] API fetch error:", e.message);
    }
  }

  return NextResponse.json({
    success: true,
    cmsExtensions,
    apiExtensions,
    totalCount: cmsExtensions.length + apiExtensions.length,
  });
}
