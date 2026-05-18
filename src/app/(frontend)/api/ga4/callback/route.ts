import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { exchangeGa4Code } from "@/lib/ga4-service";
import { OAUTH_NONCE_COOKIE, verifyOAuthState } from "@/lib/oauth-state";

/**
 * GA4 OAuth callback.
 *
 * Validates the HMAC-signed `state` (BP-007 mitigation) before persisting any
 * tokens onto the target client row. See `src/app/(frontend)/api/gsc/callback`
 * for the three-check rationale (signature, nonce cookie, initiator session).
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  const errorRedirect = (reason: string, clientId?: string) => {
    const path = clientId
      ? `/admin/collections/clients/${clientId}?ga4_error=${encodeURIComponent(reason)}`
      : `/admin?ga4_error=${encodeURIComponent(reason)}`;
    return NextResponse.redirect(new URL(path, req.url));
  };

  if (oauthError) {
    return errorRedirect(oauthError);
  }

  if (!code || !stateRaw) {
    return NextResponse.json(
      { error: "Missing code or state parameter" },
      { status: 400 },
    );
  }

  const verified = verifyOAuthState(stateRaw);
  if (!verified.ok) return errorRedirect(verified.reason);

  const { nonce, targetId: clientId, initiatorUserId } = verified;

  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get(OAUTH_NONCE_COOKIE.ga4)?.value;
  if (!cookieNonce || cookieNonce !== nonce) {
    return errorRedirect("nonce_mismatch");
  }
  cookieStore.delete(OAUTH_NONCE_COOKIE.ga4);

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user || user.role !== "admin" || String(user.id) !== initiatorUserId) {
    return errorRedirect("user_mismatch");
  }

  try {
    const tokens = await exchangeGa4Code(code);

    const client = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    });

    if (!client.ga4PropertyId) {
      return errorRedirect(
        "Set the GA4 Property ID on the client before connecting OAuth",
        clientId,
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
      new URL(`/admin/collections/clients/${clientId}`, req.url),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth exchange failed";
    console.error("[ga4-callback]", message);
    return errorRedirect(message, clientId);
  }
}
