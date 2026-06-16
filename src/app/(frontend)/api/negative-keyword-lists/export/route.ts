import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function GET(request: NextRequest) {
  try {
    // Accept either the dedicated read-only export key or the admin API key
    const NKL_EXPORT_KEY = "8f2fa5b8b97ab933ae306ccdfad2ce1df0de16f926e97cb1";
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey || (apiKey !== NKL_EXPORT_KEY && apiKey !== process.env.AUDIT_API_KEY)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await getPayload({ config });

    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    const normalizedCustomerId = customerId?.replace(/\D/g, "").slice(0, 10) || null;
    const clientId = url.searchParams.get("clientId");

    if (!normalizedCustomerId && !clientId) {
      return NextResponse.json(
        { error: "customerId or clientId is required" },
        { status: 400 },
      );
    }

    // Look up client
    let client: any;
    if (clientId) {
      client = await payload.findByID({
        collection: "clients",
        id: Number(clientId),
        overrideAccess: true,
      });
    } else {
      // Look up by Google Ads customer ID. The client field is stored without
      // dashes, while Google Ads scripts commonly return IDs as 123-456-7890.
      const result = await payload.find({
        collection: "clients",
        where: { googleAdsCustomerId: { equals: normalizedCustomerId } },
        limit: 1,
        overrideAccess: true,
      });
      client = result.docs[0];
    }

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Fetch active keyword lists for this client
    const listsResult = await payload.find({
      collection: "negative-keyword-lists",
      where: {
        client: { equals: client.id },
        isActive: { equals: true },
      },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    });

    const lists = listsResult.docs.map((list: any) => ({
      name: list.name,
      scope: list.scope,
      campaignName: list.campaignName || null,
      campaigns: (list.campaigns || []).map((c: any) => c.campaignName).filter(Boolean),
      adGroupName: list.adGroupName || null,
      campaignRegex: list.campaignRegex || null,
      keywords: (list.keywords || []).map((kw: any) => ({
        keyword: kw.keyword,
        matchType: kw.matchType,
      })),
    }));

    return NextResponse.json({
      ok: true,
      clientName: client.name || client.businessName || "",
      customerId: client.googleAdsCustomerId || "",
      lists,
    });
  } catch (err) {
    console.error("[negative-keyword-lists/export] error:", err);
    return NextResponse.json(
      { error: "Failed to export", details: String(err) },
      { status: 500 },
    );
  }
}
