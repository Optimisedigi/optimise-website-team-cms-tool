import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { exchangeGa4Code, listGa4Properties } from "@/lib/ga4-service";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const clientId = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/collections/clients/${clientId}?ga4_error=${error}`, req.url)
    );
  }

  if (!code || !clientId) {
    return NextResponse.json(
      { error: "Missing code or state parameter" },
      { status: 400 }
    );
  }

  try {
    const tokens = await exchangeGa4Code(code);
    const properties = await listGa4Properties(tokens.accessToken);

    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    const client = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    });

    // Try to match by domain, fall back to first property
    let selectedProperty = properties[0];
    if (client.websiteUrl && properties.length > 1) {
      const clientDomain = (client.websiteUrl as string)
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/$/, "")
        .toLowerCase();

      const match = properties.find((p) =>
        p.displayName.toLowerCase().includes(clientDomain) ||
        clientDomain.includes(p.displayName.toLowerCase())
      );
      if (match) selectedProperty = match;
    }

    if (!selectedProperty) {
      return NextResponse.redirect(
        new URL(
          `/admin/collections/clients/${clientId}?ga4_error=${encodeURIComponent("No GA4 properties found for this Google account")}`,
          req.url
        )
      );
    }

    await payload.update({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
      data: {
        ga4Connected: true,
        ga4PropertyId: selectedProperty.propertyId,
        ga4AccessToken: tokens.accessToken,
        ga4RefreshToken: tokens.refreshToken,
        ga4TokenExpiry: tokens.expiry,
      },
    });

    return NextResponse.redirect(
      new URL(`/admin/collections/clients/${clientId}`, req.url)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth exchange failed";
    console.error("[ga4-callback]", message);
    return NextResponse.redirect(
      new URL(
        `/admin/collections/clients/${clientId}?ga4_error=${encodeURIComponent(message)}`,
        req.url
      )
    );
  }
}
