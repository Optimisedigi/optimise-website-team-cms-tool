import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getGmailOAuthUrl } from "@/lib/gmail-service";
import { OAUTH_NONCE_COOKIE, signOAuthState } from "@/lib/oauth-state";

/**
 * Initiate Gmail OAuth for the currently logged-in CMS user.
 *
 * Requires an admin session. Signs an HMAC `state` binding (nonce, userId,
 * initiatorUserId) where target == initiator \u2014 only the user themselves can
 * (re)bind their own Gmail tokens. See BP-007 / `src/lib/oauth-state.ts`.
 * Existing users will need to re-click "Connect" once after this rollout
 * because old `state=<userId>` URLs no longer validate.
 */
export async function GET(req: NextRequest) {
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.GMAIL_REDIRECT_URI
  ) {
    return NextResponse.json(
      {
        error:
          "Gmail OAuth credentials not configured (need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REDIRECT_URI).",
      },
      { status: 500 },
    );
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });

  if (!user || user.role !== "admin") {
    return NextResponse.json(
      { error: "You must be signed in as an admin to connect Gmail." },
      { status: 401 },
    );
  }

  const { state, nonce } = signOAuthState(user.id, user.id);

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_NONCE_COOKIE.gmail, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(getGmailOAuthUrl(state));
}
