import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { exchangeGmailCode } from "@/lib/gmail-service";

/**
 * Gmail OAuth callback. Exchanges the code for tokens, persists them onto
 * the user identified by `state`, then redirects back to the admin account
 * page.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const redirectTo = (params: Record<string, string>) => {
    const u = new URL("/admin/account", req.url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return NextResponse.redirect(u);
  };

  if (error) {
    return redirectTo({ gmail_error: error });
  }
  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state parameter" },
      { status: 400 },
    );
  }

  const userId = Number(state);
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  try {
    const tokens = await exchangeGmailCode(code);

    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    await payload.update({
      collection: "users",
      id: userId,
      overrideAccess: true,
      data: {
        gmailConnected: true,
        gmailEmail: tokens.email,
        gmailAccessToken: tokens.accessToken,
        gmailRefreshToken: tokens.refreshToken,
        gmailTokenExpiry: tokens.expiry,
      },
    });

    return redirectTo({ gmail_connected: "1" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth exchange failed";
    console.error("[gmail-callback]", message);
    return redirectTo({ gmail_error: message });
  }
}
