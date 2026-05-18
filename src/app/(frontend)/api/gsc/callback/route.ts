import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { exchangeCode, listGscSites } from "@/lib/gsc-service";
import { OAUTH_NONCE_COOKIE, verifyOAuthState } from "@/lib/oauth-state";

/**
 * GSC OAuth callback.
 *
 * Validates the HMAC-signed `state` (BP-007 mitigation) before persisting any
 * tokens onto the target client row. Three independent checks must pass:
 *   1. State signature (`PAYLOAD_SECRET` HMAC) \u2014 only our connect route
 *      could have minted this state.
 *   2. Nonce cookie match \u2014 ties the OAuth round-trip to the same browser
 *      session that started it.
 *   3. Initiator-session match \u2014 the admin completing OAuth must be the
 *      same admin who clicked "Connect", preventing an attacker with a
 *      Google account from rebinding tokens to a victim's client row.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  const errorRedirect = (reason: string, clientId?: string) => {
    const path = clientId
      ? `/admin/collections/clients/${clientId}?gsc_error=${encodeURIComponent(reason)}`
      : `/admin?gsc_error=${encodeURIComponent(reason)}`;
    return NextResponse.redirect(new URL(path, req.url));
  };

  if (oauthError) {
    // We can't trust the bare `state` value here, so don't deep-link to a row.
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
  const cookieNonce = cookieStore.get(OAUTH_NONCE_COOKIE.gsc)?.value;
  if (!cookieNonce || cookieNonce !== nonce) {
    return errorRedirect("nonce_mismatch");
  }
  cookieStore.delete(OAUTH_NONCE_COOKIE.gsc);

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user || user.role !== "admin" || String(user.id) !== initiatorUserId) {
    return errorRedirect("user_mismatch");
  }

  try {
    const tokens = await exchangeCode(code);

    const sites = await listGscSites(tokens.accessToken);

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

    return NextResponse.redirect(
      new URL(`/admin/collections/clients/${clientId}`, req.url),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth exchange failed";
    console.error("[gsc-callback]", message);
    return errorRedirect(message, clientId);
  }
}
