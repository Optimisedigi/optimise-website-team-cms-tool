import { createGoogleOAuth2Client } from "@/lib/google-oauth-client";

/**
 * The Google OAuth apps Gmail can sign in with.
 *
 * - "main": the CMS's own app (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET), used
 *   for every Google integration.
 * - "alt": a second app owned by another Google Workspace, for Gmail only
 *   (GMAIL_ALT_CLIENT_ID / GMAIL_ALT_CLIENT_SECRET). That app is "Internal",
 *   so Google only lets it sign in accounts of its own Workspace, listed in
 *   GMAIL_ALT_DOMAINS (comma-separated, e.g. "cipherhealth.com.au"); the main
 *   app cannot sign those accounts in at all (Error 403: org_internal).
 *
 * So an account's email domain always tells which app issued its tokens, and
 * token refresh picks the app the same way: no stored flag needed. The OAuth
 * callback enforces it both ways (an alt sign-in must be on an alt domain,
 * and a main sign-in must not be), so the rule holds for every saved token.
 * Both apps use the same redirect URI (GMAIL_REDIRECT_URI).
 */

export type GmailOAuthApp = "main" | "alt";

const DOMAIN_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** The Workspace domains the alt app serves; empty when it is not configured. */
export function gmailAltDomains(): string[] {
  if (!process.env.GMAIL_ALT_CLIENT_ID?.trim() || !process.env.GMAIL_ALT_CLIENT_SECRET?.trim()) return [];
  return [
    ...new Set(
      (process.env.GMAIL_ALT_DOMAINS ?? "")
        .split(",")
        .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
        .filter((domain) => DOMAIN_RE.test(domain)),
    ),
  ].sort();
}

/** The app whose tokens this address has: "alt" for the alt app's domains, else "main". */
export function gmailAppForEmail(email: string): GmailOAuthApp {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return domain && gmailAltDomains().includes(domain) ? "alt" : "main";
}

export function createGmailOAuthClient(app: GmailOAuthApp) {
  if (app === "main") return createGoogleOAuth2Client(process.env.GMAIL_REDIRECT_URI);
  if (gmailAltDomains().length === 0) throw new Error("The second Gmail sign-in app is not configured.");
  return createGoogleOAuth2Client(
    process.env.GMAIL_REDIRECT_URI,
    process.env.GMAIL_ALT_CLIENT_ID?.trim(),
    process.env.GMAIL_ALT_CLIENT_SECRET?.trim(),
  );
}

/**
 * Whether a signed-in address may keep tokens from this app (callback check).
 * The alt app is Internal, so this mostly confirms what Google already enforced.
 */
export function gmailAppMatchesEmail(app: GmailOAuthApp, email: string): boolean {
  return gmailAppForEmail(email) === app;
}
