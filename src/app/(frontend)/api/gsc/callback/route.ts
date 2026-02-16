import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { exchangeCode, listGscSites } from "@/lib/gsc-service";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const clientId = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/collections/clients/${clientId}?gsc_error=${error}`, req.url)
    );
  }

  if (!code || !clientId) {
    return NextResponse.json(
      { error: "Missing code or state parameter" },
      { status: 400 }
    );
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await exchangeCode(code);

    // List GSC sites to find the property URL
    const sites = await listGscSites(tokens.accessToken);

    // Use the first available site, or the client's websiteUrl if it matches
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    const client = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    });

    let propertyUrl = sites[0]?.siteUrl || "";

    // Try to match the client's websiteUrl to a GSC property
    if (client.websiteUrl) {
      const clientDomain = client.websiteUrl
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");

      const match = sites.find((s) => {
        const siteDomain = s.siteUrl
          .replace(/^https?:\/\//, "")
          .replace(/^sc-domain:/, "")
          .replace(/\/$/, "");
        return siteDomain === clientDomain || clientDomain.includes(siteDomain);
      });

      if (match) {
        propertyUrl = match.siteUrl;
      }
    }

    // Store tokens and connection status on the client
    await payload.update({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
      data: {
        gscConnected: true,
        gscPropertyUrl: propertyUrl,
        gscAccessToken: tokens.accessToken,
        gscRefreshToken: tokens.refreshToken,
        gscTokenExpiry: tokens.expiry,
      },
    });

    // Redirect back to the client edit page
    return NextResponse.redirect(
      new URL(`/admin/collections/clients/${clientId}`, req.url)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth exchange failed";
    console.error("[gsc-callback]", message);
    return NextResponse.redirect(
      new URL(
        `/admin/collections/clients/${clientId}?gsc_error=${encodeURIComponent(message)}`,
        req.url
      )
    );
  }
}
