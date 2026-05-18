import { google } from "googleapis";

/**
 * Per-user Gmail OAuth + Drafts/Read service.
 *
 * Mirrors the GSC pattern (gsc-service.ts). Scopes:
 *  - gmail.compose  → scheduled-agent-tasks drop reports into user Drafts.
 *  - gmail.readonly → OptiMate launcher search & attach inbox emails as
 *                     per-turn chat context. We never send mail on the
 *                     user's behalf.
 *
 * Note: gmail.readonly was added in Phase 6. Existing users connected under
 * the previous (compose-only) scope must reconnect once via /api/gmail/connect
 * — refresh tokens issued under the old scope set will not yield readonly
 * access, and Gmail returns 403 insufficientPermissions on search calls.
 */

// Includes openid + email so we can resolve the connecting user's address.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI,
  );
}

/**
 * Generate the Google OAuth consent URL for Gmail Drafts access.
 *
 * `state` must be an HMAC-signed payload produced by the connect route — it
 * binds the OAuth flow to (nonce, targetUserId, initiatorUserId) so the
 * callback can verify the round-trip wasn't tampered with (OAuth CSRF /
 * row-rebind mitigation — see BP-007). The bare-userId form was retired
 * alongside that fix; users must click "Connect Gmail" once after the
 * rollout to obtain a freshly-signed state.
 */
export function getGmailOAuthUrl(state: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state,
    prompt: "consent",
    include_granted_scopes: true,
  });
}

/**
 * Exchange an authorization code for tokens, and resolve the user's email.
 */
export async function exchangeGmailCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiry: string | null;
  email: string;
}> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("Gmail OAuth: no access_token returned");
  }
  if (!tokens.refresh_token) {
    // Without a refresh token we can't run scheduled tasks long-term.
    // This happens if the user previously connected and Google didn't
    // re-issue a refresh token. Force re-consent via prompt=consent (already
    // set above) — if it still happens, surface a clear error.
    throw new Error(
      "Gmail OAuth: no refresh_token returned. Revoke previous access at https://myaccount.google.com/permissions and reconnect.",
    );
  }

  oauth2Client.setCredentials(tokens);

  // Resolve the connecting Google account's email address so we can show it
  // in the admin UI and default scheduled-task recipients to it.
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userinfo = await oauth2.userinfo.get();
  const email = userinfo.data.email;
  if (!email) {
    throw new Error("Gmail OAuth: could not resolve user email from userinfo");
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiry: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null,
    email,
  };
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshGmailAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiry: string | null;
}> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  if (!credentials.access_token) {
    throw new Error("Gmail OAuth: refresh returned no access_token");
  }
  return {
    accessToken: credentials.access_token,
    expiry: credentials.expiry_date
      ? new Date(credentials.expiry_date).toISOString()
      : null,
  };
}

/**
 * Build an RFC 2822 MIME message and base64url-encode it for Gmail's API.
 */
function buildMimeMessage(args: {
  to: string;
  subject: string;
  htmlBody: string;
}): string {
  const { to, subject, htmlBody } = args;
  // Encode subject as RFC 2047 if it contains non-ASCII to keep Gmail happy.
  const isAscii = /^[\x20-\x7E]*$/.test(subject);
  const encodedSubject = isAscii
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;

  const lines = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    htmlBody,
  ];
  const raw = lines.join("\r\n");
  // Gmail wants base64url (URL-safe, no padding).
  return Buffer.from(raw, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Create a Gmail draft using the given access token. Returns the draft id
 * and the underlying message id.
 */
export async function createGmailDraft(
  accessToken: string,
  args: { to: string; subject: string; htmlBody: string },
): Promise<{ draftId: string; messageId: string }> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const raw = buildMimeMessage(args);

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw },
    },
  });

  const draftId = res.data.id;
  const messageId = res.data.message?.id;
  if (!draftId || !messageId) {
    throw new Error("Gmail draft creation returned no id");
  }
  return { draftId, messageId };
}
