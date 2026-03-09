import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { exchangeGa4Code } from "@/lib/ga4-service";

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

    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    const client = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    });

    if (!client.ga4PropertyId) {
      return NextResponse.redirect(
        new URL(
          `/admin/collections/clients/${clientId}?ga4_error=${encodeURIComponent("Set the GA4 Property ID on the client before connecting OAuth")}`,
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
