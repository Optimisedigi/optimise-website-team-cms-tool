import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { exchangeGmailCode } from "@/lib/gmail-service";
import { OAUTH_NONCE_COOKIE, verifyOAuthState } from "@/lib/oauth-state";

/**
 * Gmail OAuth callback.
 *
 * Validates the HMAC-signed `state` (BP-007 mitigation) before persisting any
 * tokens onto the target user row. For Gmail, target == initiator: only the
 * user themselves may (re)bind their own Gmail tokens. Three independent
 * checks must pass:
 *   1. State signature (`PAYLOAD_SECRET` HMAC).
 *   2. Nonce cookie match.
 *   3. Current session must equal `initiatorUserId` (which equals `targetId`).
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  const redirectTo = (params: Record<string, string>) => {
    const u = new URL("/admin/settings/integrations", req.url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return NextResponse.redirect(u);
  };

  if (oauthError) {
    return redirectTo({ gmail_error: oauthError });
  }
  if (!code || !stateRaw) {
    return NextResponse.json(
      { error: "Missing code or state parameter" },
      { status: 400 },
    );
  }

  const verified = verifyOAuthState(stateRaw);
  if (!verified.ok) return redirectTo({ gmail_error: verified.reason });

  const { nonce, targetId, initiatorUserId } = verified;
  if (targetId !== initiatorUserId) {
    // Defence-in-depth: Gmail flows always self-bind. A mismatched pair
    // would mean the state was minted by something other than our connect
    // route (or a bug in it) \u2014 refuse.
    return redirectTo({ gmail_error: "target_initiator_mismatch" });
  }

  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get(OAUTH_NONCE_COOKIE.gmail)?.value;
  if (!cookieNonce || cookieNonce !== nonce) {
    return redirectTo({ gmail_error: "nonce_mismatch" });
  }
  cookieStore.delete(OAUTH_NONCE_COOKIE.gmail);

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user || String(user.id) !== initiatorUserId) {
    return redirectTo({ gmail_error: "user_mismatch" });
  }

  const userId = Number(targetId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return redirectTo({ gmail_error: "invalid_state" });
  }

  try {
    const tokens = await exchangeGmailCode(code);

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
