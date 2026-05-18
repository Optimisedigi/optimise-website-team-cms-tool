import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getOAuthUrl } from "@/lib/gsc-service";
import { OAUTH_NONCE_COOKIE, signOAuthState } from "@/lib/oauth-state";

/**
 * Initiate GSC OAuth for a client row.
 *
 * Requires an admin session. Signs an HMAC `state` binding (nonce, clientId,
 * initiatorUserId) so the callback can prove the round-trip wasn't tampered
 * with \u2014 see BP-007 / `src/lib/oauth-state.ts`. Existing users will need to
 * re-click "Connect" once after this rollout because old `state=<clientId>`
 * URLs no longer validate.
 */
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId query parameter is required" },
      { status: 400 },
    );
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Google OAuth credentials not configured" },
      { status: 500 },
    );
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });

  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { state, nonce } = signOAuthState(clientId, user.id);

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_NONCE_COOKIE.gsc, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(getOAuthUrl(state));
}
