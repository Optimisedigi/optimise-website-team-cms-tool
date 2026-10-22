import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getGmailOAuthUrl } from "@/lib/gmail-service";
import { gmailAltDomains } from "@/lib/gmail-oauth-apps";
import { OAUTH_NONCE_COOKIE, signOAuthState } from "@/lib/oauth-state";

/**
 * Initiate Gmail OAuth for the currently logged-in CMS user.
 *
 * Requires an admin session. Signs an HMAC `state` binding (nonce, userId,
 * initiatorUserId) where target == initiator \u2014 only the user themselves can
 * (re)bind their own Gmail tokens. See BP-007 / `src/lib/oauth-state.ts`.
 * Existing users will need to re-click "Connect" once after this rollout
 * because old `state=<userId>` URLs no longer validate.
 *
 * `?add=1` connects another Gmail address as an extra Mail account (see
 * src/lib/mail/accounts.ts); the main Gmail on the user record is untouched.
 * `?add=1&app=alt` does the same through the second Gmail app, for accounts
 * of another Google Workspace (see src/lib/gmail-oauth-apps.ts).
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
  // ?add=1 (Mail account menu): connect another Gmail as an extra account
  // instead of replacing the main one. The flow is marked by which nonce
  // cookie is set, so the callback knows without trusting a URL parameter.
  const adding = req.nextUrl.searchParams.get("add") === "1";
  const alt = adding && req.nextUrl.searchParams.get("app") === "alt";
  if (alt && gmailAltDomains().length === 0) {
    return NextResponse.json({ error: "The second Gmail sign-in app is not set up." }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(alt ? OAUTH_NONCE_COOKIE.gmailAddAlt : adding ? OAUTH_NONCE_COOKIE.gmailAdd : OAUTH_NONCE_COOKIE.gmail, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(getGmailOAuthUrl(state, { selectAccount: adding, app: alt ? "alt" : "main" }));
}
