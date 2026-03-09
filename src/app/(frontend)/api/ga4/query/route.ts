import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { fetchGa4Report, ensureValidToken } from "@/lib/ga4-service";

/**
 * GET /api/ga4/query?clientId=X&period=30d|90d|12m
 * Fetches live GA4 data for a client (or Optimise Digital by default).
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = req.nextUrl.searchParams.get("clientId");
    const period = req.nextUrl.searchParams.get("period") || "30d";

    let client: any;
    if (clientId) {
      client = await payload.findByID({
        collection: "clients",
        id: clientId,
        overrideAccess: true,
      });
    } else {
      // Default to Optimise Digital
      const result = await payload.find({
        collection: "clients",
        where: { slug: { equals: "optimise-digital" } },
        limit: 1,
        overrideAccess: true,
      });
      client = result.docs[0];
    }

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (!client.ga4Connected || !client.ga4PropertyId || !client.ga4RefreshToken) {
      return NextResponse.json({
        error: "GA4 not connected",
        ga4Connected: false,
      }, { status: 200 });
    }

    // Ensure valid token
    const tokenResult = await ensureValidToken(
      client.ga4AccessToken,
      client.ga4RefreshToken,
      client.ga4TokenExpiry,
    );

    // Update token if refreshed
    if (tokenResult.refreshed) {
      await payload.update({
        collection: "clients",
        id: client.id,
        overrideAccess: true,
        data: {
          ga4AccessToken: tokenResult.accessToken,
          ga4TokenExpiry: tokenResult.expiry,
        },
      });
    }

    // Calculate date range
    const now = new Date();
    let startDate: string;
    const endDate = new Date(now.getTime() - 86400000).toISOString().slice(0, 10); // yesterday

    if (period === "7d") {
      startDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    } else if (period === "90d") {
      startDate = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
    } else if (period === "12m") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 12);
      startDate = d.toISOString().slice(0, 10);
    } else {
      // Default 30d
      startDate = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    }

    const report = await fetchGa4Report(
      tokenResult.accessToken,
      client.ga4PropertyId,
      startDate,
      endDate,
    );

    return NextResponse.json({
      ga4Connected: true,
      clientId: client.id,
      clientName: client.name,
      propertyId: client.ga4PropertyId,
      ...report,
    });
  } catch (err) {
    console.error("[ga4-query] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch GA4 data", details: String(err) },
      { status: 500 },
    );
  }
}
