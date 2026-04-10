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

  const { customerId } = audit;
  if (!customerId) {
    return NextResponse.json(
      { error: "Missing customerId on audit record" },
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
      throw new Error(
        `Growth tools sync failed (${response.status}): ${errorBody}`
      );
    }

    const result = await response.json();
    const extensions = result.extensions || [];

    // Store/update each extension in CMS
    let created = 0;
    let updated = 0;

    for (const ext of extensions) {
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
        extensionType: ext.extensionType,
        level: ext.level || "account",
        assetId: ext.assetId,
        status: ext.status === "ACTIVE" ? "deployed" : "paused",
        deployedAt: new Date().toISOString(),
      };

      // Parse extension data
      if (ext.extensionType === "sitelink" || ext.extensionType === "SITELINK") {
        cmsData.sitelinkText = ext.linkText;
        cmsData.sitelinkUrl = ext.linkUrl;
        cmsData.sitelinkDescription1 = ext.description1 || null;
        cmsData.sitelinkDescription2 = ext.description2 || null;
      } else {
        cmsData.snippetHeader = ext.header;
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
    });
  } catch (e: any) {
    console.error("[GoogleAdsExtensions] Sync error:", e.message);
    return NextResponse.json(
      { error: `Failed to sync extensions: ${e.message}` },
      { status: 500 }
    );
  }
}
