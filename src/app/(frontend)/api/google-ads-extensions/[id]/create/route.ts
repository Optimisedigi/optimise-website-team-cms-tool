import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const EXTENSIONS_COLLECTION: any = "google-ads-ad-extensions";

interface CreateExtensionRequest {
  extensionType: "sitelink" | "structured_snippet";
  level?: "account" | "campaign" | "ad_group";
  // Sitelink fields
  sitelinkText?: string;
  sitelinkUrl?: string;
  sitelinkDescription1?: string;
  sitelinkDescription2?: string;
  // Structured snippet fields
  snippetHeader?: string;
  snippetValues?: string[];
}

/**
 * POST /api/google-ads-extensions/[id]/create
 * Create a new ad extension and store it in CMS.
 * Optionally deploy to Google Ads via Growth Tools.
 */
export async function POST(
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

  // Parse request body
  let body: CreateExtensionRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    extensionType,
    level = "account",
    sitelinkText,
    sitelinkUrl,
    sitelinkDescription1,
    sitelinkDescription2,
    snippetHeader,
    snippetValues,
  } = body;

  if (!extensionType) {
    return NextResponse.json(
      { error: "Missing required field: extensionType" },
      { status: 400 }
    );
  }

  // Validate sitelink fields
  if (extensionType === "sitelink") {
    if (!sitelinkText || sitelinkText.length > 25) {
      return NextResponse.json(
        { error: "Sitelink text is required and must be 25 characters or less" },
        { status: 400 }
      );
    }
    if (!sitelinkUrl) {
      return NextResponse.json(
        { error: "Sitelink URL is required" },
        { status: 400 }
      );
    }
    if (sitelinkDescription1 && sitelinkDescription1.length > 35) {
      return NextResponse.json(
        { error: "Sitelink description 1 must be 35 characters or less" },
        { status: 400 }
      );
    }
    if (sitelinkDescription2 && sitelinkDescription2.length > 35) {
      return NextResponse.json(
        { error: "Sitelink description 2 must be 35 characters or less" },
        { status: 400 }
      );
    }
  }

  // Validate structured snippet fields
  if (extensionType === "structured_snippet") {
    if (!snippetHeader) {
      return NextResponse.json(
        { error: "Snippet header is required" },
        { status: 400 }
      );
    }
    if (
      !snippetValues ||
      !Array.isArray(snippetValues) ||
      snippetValues.length < 3
    ) {
      return NextResponse.json(
        { error: "At least 3 snippet values are required" },
        { status: 400 }
      );
    }
    if (snippetValues.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 snippet values allowed" },
        { status: 400 }
      );
    }
    const invalidValues = snippetValues.filter((v: string) => v.length > 25);
    if (invalidValues.length > 0) {
      return NextResponse.json(
        { error: "Each snippet value must be 25 characters or less" },
        { status: 400 }
      );
    }
  }

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

  // Build extension data
  const extensionData: Record<string, any> = {};
  if (extensionType === "sitelink") {
    extensionData.linkText = sitelinkText;
    extensionData.linkUrl = sitelinkUrl;
    if (sitelinkDescription1) extensionData.description1 = sitelinkDescription1;
    if (sitelinkDescription2) extensionData.description2 = sitelinkDescription2;
  } else {
    extensionData.header = snippetHeader;
    extensionData.values = snippetValues;
  }

  // Create in Google Ads via Growth Tools if configured
  let assetId: string | undefined;
  if (GROWTH_TOOLS_URL && INTERNAL_API_KEY) {
    try {
      const response = await fetch(
        `${GROWTH_TOOLS_URL}/api/google-ads/ad-extensions/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-key": INTERNAL_API_KEY!,
          },
          body: JSON.stringify({
            customerId: customerId.replace(/-/g, ""),
            extensionType,
            extensionData,
            level,
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        assetId = result.assetId;
      } else {
        const errorBody = await response.text();
        if (errorBody.includes("REQUESTED_METRICS_FOR_MANAGER")) {
          return NextResponse.json(
            { error: "This is a manager (MCC) account. Enter the client account ID instead — find it under the MCC in Google Ads." },
            { status: 400 }
          );
        }
        console.warn(
          "[GoogleAdsExtensions] Create in Google Ads failed:",
          errorBody
        );
        // Continue to store in CMS even if API fails
      }
    } catch (e: any) {
      console.warn(
        "[GoogleAdsExtensions] Growth Tools call failed:",
        e.message
      );
      // Continue to store in CMS even if API fails
    }
  }

  // Store in CMS
  try {
    const cmsData: Record<string, any> = {
      audit: id,
      customerId: customerId,
      extensionType,
      level,
      status: assetId ? "deployed" : "draft",
      deployedAt: assetId ? new Date().toISOString() : null,
    };

    if (extensionType === "sitelink") {
      cmsData.sitelinkText = sitelinkText;
      cmsData.sitelinkUrl = sitelinkUrl;
      cmsData.sitelinkDescription1 = sitelinkDescription1 || null;
      cmsData.sitelinkDescription2 = sitelinkDescription2 || null;
    } else {
      cmsData.snippetHeader = snippetHeader;
      cmsData.snippetValues =
        snippetValues instanceof Array
          ? snippetValues.join("\n")
          : snippetValues;
    }

    if (assetId) {
      cmsData.assetId = assetId;
    }

    const extension = await payload.create({
      collection: EXTENSIONS_COLLECTION,
      data: cmsData as any,
      overrideAccess: true,
    });

    return NextResponse.json({
      success: true,
      extension,
      deployedToGoogleAds: !!assetId,
    });
  } catch (e: any) {
    console.error("[GoogleAdsExtensions] CMS create error:", e.message);
    return NextResponse.json(
      { error: `Failed to create extension: ${e.message}` },
      { status: 500 }
    );
  }
}
