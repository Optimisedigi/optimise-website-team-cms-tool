import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const EXTENSIONS_COLLECTION: any = "google-ads-ad-extensions";

interface AssignExtensionRequest {
  extensionId: string;
  campaignIds?: string[];
  campaignNames?: string[];
  adGroupIds?: string[];
  adGroupNames?: string[];
}

/**
 * POST /api/google-ads-extensions/[id]/assign
 * Assign an extension to campaigns and/or ad groups.
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
  let body: AssignExtensionRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    extensionId,
    campaignIds,
    campaignNames,
    adGroupIds,
    adGroupNames,
  } = body;

  if (!extensionId) {
    return NextResponse.json(
      { error: "Missing required field: extensionId" },
      { status: 400 }
    );
  }

  if (!campaignIds?.length && !adGroupIds?.length) {
    return NextResponse.json(
      { error: "At least one campaignId or adGroupId is required" },
      { status: 400 }
    );
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

  // Fetch the extension record
  let extension: any;
  try {
    extension = await payload.findByID({
      collection: EXTENSIONS_COLLECTION,
      id: extensionId,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json(
      { error: "Extension not found" },
      { status: 404 }
    );
  }

  // Assign in Google Ads via Growth Tools if configured
  let assetSetId: string | undefined;
  if (GROWTH_TOOLS_URL && INTERNAL_API_KEY && extension.assetId) {
    try {
      const response = await fetch(
        `${GROWTH_TOOLS_URL}/api/google-ads/ad-extensions/assign`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-key": INTERNAL_API_KEY!,
          },
          body: JSON.stringify({
            customerId: customerId.replace(/-/g, ""),
            assetId: extension.assetId,
            campaignIds: campaignIds || [],
            adGroupIds: adGroupIds || [],
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        assetSetId = result.assetSetId;
      } else {
        const errorBody = await response.text();
        if (errorBody.includes("REQUESTED_METRICS_FOR_MANAGER")) {
          return NextResponse.json(
            { error: "This is a manager (MCC) account. Enter the client account ID instead — find it under the MCC in Google Ads." },
            { status: 400 }
          );
        }
        console.warn(
          "[GoogleAdsExtensions] Assign in Google Ads failed:",
          errorBody
        );
      }
    } catch (e: any) {
      console.warn(
        "[GoogleAdsExtensions] Growth Tools assign call failed:",
        e.message
      );
    }
  }

  // Build assignments arrays
  const newCampaignAssignments = (campaignIds || []).map(
    (campaignId: string, index: number) => ({
      campaignId,
      campaignName: campaignNames?.[index] || campaignId,
    })
  );

  const newAdGroupAssignments = (adGroupIds || []).map(
    (adGroupId: string, index: number) => ({
      adGroupId,
      adGroupName: adGroupNames?.[index] || adGroupId,
      campaignId: "pending", // Will be updated if provided
    })
  );

  // Merge with existing assignments (avoid duplicates)
  const existingCampaigns = extension.assignedCampaigns || [];
  const existingAdGroups = extension.assignedAdGroups || [];

  const mergedCampaigns = [
    ...existingCampaigns,
    ...newCampaignAssignments.filter(
      (nc) =>
        !existingCampaigns.some(
          (ec: any) => ec.campaignId === nc.campaignId
        )
    ),
  ];

  const mergedAdGroups = [
    ...existingAdGroups,
    ...newAdGroupAssignments.filter(
      (nag) =>
        !existingAdGroups.some((eag: any) => eag.adGroupId === nag.adGroupId)
    ),
  ];

  // Update CMS record
  try {
    const updateData: Record<string, any> = {
      assignedCampaigns: mergedCampaigns,
      assignedAdGroups: mergedAdGroups,
      updatedAt: new Date().toISOString(),
    };

    if (assetSetId) {
      updateData.assetSetId = assetSetId;
    }

    // Update status to deployed if it was draft
    if (extension.status === "draft") {
      updateData.status = "deployed";
      updateData.deployedAt = new Date().toISOString();
    }

    const updated = await payload.update({
      collection: EXTENSIONS_COLLECTION,
      id: extensionId,
      data: updateData as any,
      overrideAccess: true,
    });

    return NextResponse.json({
      success: true,
      extension: updated,
      assignedCampaigns: newCampaignAssignments.length,
      assignedAdGroups: newAdGroupAssignments.length,
    });
  } catch (e: any) {
    console.error("[GoogleAdsExtensions] CMS update error:", e.message);
    return NextResponse.json(
      { error: `Failed to update extension: ${e.message}` },
      { status: 500 }
    );
  }
}
