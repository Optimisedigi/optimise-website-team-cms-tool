import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const EXTENSIONS_COLLECTION: any = "google-ads-ad-extensions";

/**
 * POST /api/google-ads-extensions/[id]/sync
 * Sync all extensions from Google Ads account to CMS.
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

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Growth Tools not configured" },
      { status: 500 }
    );
  }

  // Call Growth Tools sync endpoint
  try {
    const response = await fetch(
      `${GROWTH_TOOLS_URL}/api/google-ads/ad-extensions/sync`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY!,
        },
        body: JSON.stringify({
          customerId: customerId.replace(/-/g, ""),
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      if (errorBody.includes("REQUESTED_METRICS_FOR_MANAGER")) {
        return NextResponse.json(
          { error: "This is a manager (MCC) account. Enter the client account ID instead — find it under the MCC in Google Ads." },
          { status: 400 }
        );
      }
      throw new Error(
        `Growth tools sync failed (${response.status}): ${errorBody}`
      );
    }

    const result = await response.json();
    const extensions = result.extensions || [];

    // Normalise extensionType from Growth Tools (may be uppercase)
    const normaliseType = (t: string): string => {
      const lower = t.toLowerCase();
      if (lower === "sitelink") return "sitelink";
      if (lower === "structured_snippet" || lower === "structuredsnippet") return "structured_snippet";
      return lower;
    };

    // Normalise level from Growth Tools (may be uppercase)
    const normaliseLevel = (l: string | undefined): string => {
      if (!l) return "account";
      const lower = l.toLowerCase();
      if (lower === "account" || lower === "campaign" || lower === "ad_group") return lower;
      // Google Ads API uses ADGROUP without underscore
      if (lower === "adgroup" || lower === "ad group") return "ad_group";
      return "account";
    };

    // Valid snippet headers from the collection's select options
    const VALID_SNIPPET_HEADERS = [
      "Destinations", "Services", "Brands", "Schools", "Neighborhoods",
      "Types", "Collections", "Hotels", "Insurance Coverage", "Models",
      "Entertainment", "Activities", "Featured Items", "Product Types",
      "Services Offered", "Programs", "Events", "Amenities", "Styles",
      "Benefits", "Menu Items", "Dining Options",
    ];

    // Match header case-insensitively to valid options
    const normaliseSnippetHeader = (h: string | undefined): string | null => {
      if (!h) return null;
      const match = VALID_SNIPPET_HEADERS.find(v => v.toLowerCase() === h.toLowerCase());
      return match || null;
    };

    // Store/update each extension in CMS
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const ext of extensions) {
      const extType = normaliseType(ext.extensionType);

      // Skip unknown extension types
      if (extType !== "sitelink" && extType !== "structured_snippet") {
        skipped++;
        continue;
      }

      // Check if extension already exists
      const existing = await payload.find({
        collection: EXTENSIONS_COLLECTION,
        where: {
          audit: { equals: id },
          assetId: { equals: ext.assetId },
        },
        limit: 1,
        overrideAccess: true,
      });

      const cmsData: Record<string, any> = {
        audit: id,
        customerId: customerId,
        extensionType: extType,
        level: normaliseLevel(ext.level),
        assetId: ext.assetId,
        status: ext.status === "ACTIVE" ? "deployed" : "paused",
        deployedAt: new Date().toISOString(),
      };

      // Parse extension data
      if (extType === "sitelink") {
        cmsData.sitelinkText = ext.linkText;
        cmsData.sitelinkUrl = ext.linkUrl;
        cmsData.sitelinkDescription1 = ext.description1 || null;
        cmsData.sitelinkDescription2 = ext.description2 || null;
      } else {
        const header = normaliseSnippetHeader(ext.header);
        if (!header) {
          // Skip snippets with unrecognised headers rather than failing the whole sync
          skipped++;
          continue;
        }
        cmsData.snippetHeader = header;
        cmsData.snippetValues =
          ext.values instanceof Array ? ext.values.join("\n") : ext.values;
      }

      // Add assignments
      if (ext.campaignAssignments) {
        cmsData.assignedCampaigns = ext.campaignAssignments.map(
          (ca: any) => ({
            campaignId: ca.campaignId,
            campaignName: ca.campaignName,
          })
        );
      }

      if (ext.adGroupAssignments) {
        cmsData.assignedAdGroups = ext.adGroupAssignments.map(
          (aga: any) => ({
            adGroupId: aga.adGroupId,
            adGroupName: aga.adGroupName,
            campaignId: aga.campaignId,
          })
        );
      }

      if (existing.totalDocs > 0) {
        // Update existing
        await payload.update({
          collection: EXTENSIONS_COLLECTION,
          id: existing.docs[0].id,
          data: {
            ...cmsData,
            updatedAt: new Date().toISOString(),
          },
          overrideAccess: true,
        });
        updated++;
      } else {
        // Create new
        await payload.create({
          collection: EXTENSIONS_COLLECTION,
          data: cmsData as any,
          overrideAccess: true,
        });
        created++;
      }
    }

    return NextResponse.json({
      success: true,
      total: extensions.length,
      created,
      updated,
      skipped,
    });
  } catch (e: any) {
    console.error("[GoogleAdsExtensions] Sync error:", e.message);
    return NextResponse.json(
      { error: `Failed to sync extensions: ${e.message}` },
      { status: 500 }
    );
  }
}
