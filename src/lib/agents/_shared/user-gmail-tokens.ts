/**
 * Resolve a logged-in user's Gmail OAuth credentials, refreshing the access
 * token when it's expired. Mirrors the GA4/GSC pattern in
 * `optimate-google-ads/tools/_client-tokens.ts` but reads from the `users`
 * collection instead of `clients`.
 */

import { getPayload } from "payload";
import payloadConfig from "@/payload.config";
import { refreshGmailAccessToken } from "@/lib/gmail-service";

interface UserDoc {
  id: number;
  email?: string;
  gmailConnected?: boolean;
  gmailEmail?: string;
  gmailAccessToken?: string;
  gmailRefreshToken?: string;
  gmailTokenExpiry?: string | null;
}

export interface GmailTokenResult {
  ok: true;
  accessToken: string;
  email: string; // the connected gmail address
  userEmail: string; // the user's CMS email (fallback recipient)
}

export interface GmailTokenError {
  ok: false;
  reason: string;
}

function isExpired(expiry: string | null | undefined): boolean {
  if (!expiry) return true;
  return new Date(expiry).getTime() <= Date.now() + 30_000; // 30s safety
}

async function loadUser(userId: number): Promise<UserDoc | null> {
  const cfg = await payloadConfig;
  const payload = await getPayload({ config: cfg });
  try {
    return (await payload.findByID({
      collection: "users",
      id: userId,
      overrideAccess: true,
    })) as unknown as UserDoc;
  } catch {
    return null;
  }
}

async function persistRefreshedToken(
  userId: number,
  data: { accessToken: string; expiry: string | null },
): Promise<void> {
  const cfg = await payloadConfig;
  const payload = await getPayload({ config: cfg });
  await payload.update({
    collection: "users",
    id: userId,
    overrideAccess: true,
    data: {
      gmailAccessToken: data.accessToken,
      gmailTokenExpiry: data.expiry,
    } as never,
  });
}

/**
 * Get a valid Gmail access token for the given CMS user. Refreshes on expiry
 * and writes the new token back to the user record.
 */
export async function getValidGmailToken(
  userId: number | undefined | null,
): Promise<GmailTokenResult | GmailTokenError> {
  if (userId === undefined || userId === null) {
    return { ok: false, reason: "No user id provided." };
  }

  const user = await loadUser(userId);
  if (!user) return { ok: false, reason: `User ${userId} not found.` };
  if (!user.gmailConnected) {
    return {
      ok: false,
      reason:
        "Gmail not connected for this user. Connect via /api/gmail/connect from the admin UI before scheduling tasks.",
    };
  }

  const refreshToken = (user.gmailRefreshToken ?? "").trim();
  if (!refreshToken) {
    return {
      ok: false,
      reason: "User has no Gmail refresh token saved. Reconnect Gmail.",
    };
  }

  let accessToken = user.gmailAccessToken ?? "";
  if (isExpired(user.gmailTokenExpiry) || !accessToken) {
    try {
      const refreshed = await refreshGmailAccessToken(refreshToken);
      await persistRefreshedToken(userId, refreshed);
      accessToken = refreshed.accessToken;
    } catch (err) {
      return {
        ok: false,
        reason: `Gmail token refresh failed: ${(err as Error).message}`,
      };
    }
  }

  return {
    ok: true,
    accessToken,
    email: user.gmailEmail ?? "",
    userEmail: user.email ?? "",
  };
}
