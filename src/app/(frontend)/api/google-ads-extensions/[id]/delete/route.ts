import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const EXTENSIONS_COLLECTION: any = "google-ads-ad-extensions";

interface DeleteExtensionRequest {
  extensionId: string;
}

/**
 * POST /api/google-ads-extensions/[id]/delete
 * Delete an ad extension from CMS and optionally from Google Ads.
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
  let body: DeleteExtensionRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { extensionId } = body;

  if (!extensionId) {
    return NextResponse.json(
      { error: "Missing required field: extensionId" },
      { status: 400 }
    );
  }

  // Fetch the extension
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

  // Delete from Google Ads if it has an assetId
  if (GROWTH_TOOLS_URL && INTERNAL_API_KEY && extension.assetId) {
    try {
      // Fetch audit to get customerId
      const audit = await payload.findByID({
        collection: "google-ads-audits",
        id,
        overrideAccess: true,
      });

      const response = await fetch(
        `${GROWTH_TOOLS_URL}/api/google-ads/ad-extensions/delete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-key": INTERNAL_API_KEY!,
          },
          body: JSON.stringify({
            customerId: (audit.customerId as string).replace(/-/g, ""),
            assetId: extension.assetId,
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        console.warn(
          "[GoogleAdsExtensions] Delete from Google Ads failed:",
          errorBody
        );
        // Continue to delete from CMS
      }
    } catch (e: any) {
      console.warn(
        "[GoogleAdsExtensions] Growth Tools delete call failed:",
        e.message
      );
      // Continue to delete from CMS
    }
  }

  // Delete from CMS
  try {
    await payload.delete({
      collection: EXTENSIONS_COLLECTION,
      id: extensionId,
      overrideAccess: true,
    });

    return NextResponse.json({
      success: true,
      message: "Extension deleted successfully",
    });
  } catch (e: any) {
    console.error("[GoogleAdsExtensions] CMS delete error:", e.message);
    return NextResponse.json(
      { error: `Failed to delete extension: ${e.message}` },
      { status: 500 }
    );
  }
}
