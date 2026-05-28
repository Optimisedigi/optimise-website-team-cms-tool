/**
 * Codex (ChatGPT subscription) OAuth — device-code flow.
 *
 * Lets the OptiMate fleet serve GPT-5.5 from a flat-rate ChatGPT plan via the
 * Codex CLI OAuth client + the private `chatgpt.com/backend-api/codex/responses`
 * endpoint, instead of a billed OPENAI_API_KEY. This is the "Sign in with
 * ChatGPT" subscription-reuse pattern — the same shape Anthropic banned for
 * Claude. OpenAI has not (as of 2026-05) banned it, but can revoke tokens,
 * rotate the client id, or change the server-side Codex-prompt check at any
 * time. The resolver + callLLM fallback chain means any failure here walks
 * down fallbackModels (Kimi -> MiniMax -> Claude) automatically.
 *
 * Why device-code, not the localhost-callback browser flow: the Codex CLI
 * browser flow posts back to http://localhost:1455/auth/callback, which can't
 * work on Vercel. The device-authorization flow has no callback — the operator
 * opens a URL, enters a code, and we poll for the result. Verified against
 * openai/codex's device_code_auth.rs and the tumf/opencode-openai-device-auth
 * reference implementation.
 *
 * Flow:
 *   1. POST /api/accounts/deviceauth/usercode  { client_id }
 *        -> { device_auth_id, user_code, interval }
 *   2. Operator opens https://auth.openai.com/codex/device, enters user_code.
 *   3. Poll POST /api/accounts/deviceauth/token  { device_auth_id, user_code }
 *        -> 200 { authorization_code, code_verifier }   (verifier is server-supplied)
 *        -> 403/404 while still pending.
 *   4. POST /oauth/token  grant_type=authorization_code (+ code_verifier)
 *        -> { id_token, access_token, refresh_token, expires_in }
 *   5. Extract chatgpt_account_id from the id_token JWT.
 */

import type { OAuthCredential } from "../types";

/** Codex CLI public OAuth client id. Verified against openai/codex and
 *  tumf/opencode-openai-device-auth. Public client (no secret). */
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const BASE_URL = "https://auth.openai.com";
const DEVICE_USERCODE_URL = `${BASE_URL}/api/accounts/deviceauth/usercode`;
const DEVICE_TOKEN_URL = `${BASE_URL}/api/accounts/deviceauth/token`;
const OAUTH_TOKEN_URL = `${BASE_URL}/oauth/token`;
/** The device-auth token exchange uses this fixed redirect_uri. */
const DEVICE_REDIRECT_URI = `${BASE_URL}/deviceauth/callback`;
/** Page the operator opens in a browser to enter the one-time code. */
export const DEVICE_VERIFICATION_URL = `${BASE_URL}/codex/device`;

/** JWT claim namespace OpenAI uses for ChatGPT account/org identity. */
const JWT_AUTH_CLAIM = "https://api.openai.com/auth";

/** Refresh ~5 minutes early to avoid 401s on the boundary. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** User-Agent the Codex CLI device-auth requests use. Mirrors the reference
 *  implementation so device-auth traffic isn't obviously third-party. */
const DEVICE_USER_AGENT = "codex_cli_rs/0.0.0";

interface UserCodeResponse {
  device_auth_id: string;
  user_code?: string;
  usercode?: string;
  interval?: string | number;
}

interface DeviceTokenResponse {
  authorization_code: string;
  code_verifier: string;
}

interface OAuthTokenResponse {
  id_token?: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}

/** Output of beginCodexDeviceLogin — given to the admin page so it can render
 *  the verification link + one-time code and remember the device_auth_id
 *  across the poll/complete step. */
export interface BeginCodexLoginResult {
  userCode: string;
  deviceAuthId: string;
  verificationUrl: string;
  /** Poll interval in seconds the server asked for (defaults to 5). */
  intervalSeconds: number;
}

/**
 * Decode a JWT payload without verifying the signature. We only need to read
 * claims (account id); the token's authenticity is established by the fact
 * that it came from the OAuth token endpoint over TLS. Returns null on any
 * malformed input rather than throwing.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Extract the ChatGPT account id from a Codex id_token (or access_token).
 *
 * The canonical location is `["https://api.openai.com/auth"].chatgpt_account_id`.
 * Some tokens omit it; we fall back to the first organization id (which the
 * Codex backend also accepts as the account scope). Returns "" if nothing is
 * found — the adapter then omits the chatgpt-account-id header.
 */
export function extractAccountId(token: string): string {
  const claims = decodeJwtPayload(token);
  if (!claims) return "";
  const authClaim = claims[JWT_AUTH_CLAIM] as
    | {
        chatgpt_account_id?: string;
        organization_id?: string;
        organizations?: Array<{ id?: string; is_default?: boolean }>;
      }
    | undefined;
  if (authClaim?.chatgpt_account_id) return authClaim.chatgpt_account_id;
  if (authClaim?.organization_id) return authClaim.organization_id;
  const orgs = authClaim?.organizations;
  if (Array.isArray(orgs) && orgs.length > 0) {
    const def = orgs.find((o) => o.is_default) ?? orgs[0];
    if (def?.id) return def.id;
  }
  // Last-ditch: top-level organization_id some tokens carry.
  const topOrg = claims.organization_id;
  if (typeof topOrg === "string" && topOrg) return topOrg;
  return "";
}

/** Step 1: request a device code. Returns the code to display + the
 *  device_auth_id to poll with. Throws on a non-2xx response. */
export async function beginCodexDeviceLogin(): Promise<BeginCodexLoginResult> {
  const res = await fetch(DEVICE_USERCODE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": DEVICE_USER_AGENT,
    },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404) {
      throw new Error(
        "Device-code login is not enabled for this ChatGPT account. Enable it in ChatGPT \u2192 Settings \u2192 Security \u2192 'Allow device code login' (or have your workspace admin enable it), then retry.",
      );
    }
    throw new Error(`Codex device-code request failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as UserCodeResponse;
  const userCode = data.user_code ?? data.usercode;
  if (!userCode || !data.device_auth_id) {
    throw new Error("Codex device-code response missing user_code or device_auth_id.");
  }
  const intervalSeconds =
    typeof data.interval === "string"
      ? parseInt(data.interval, 10) || 5
      : typeof data.interval === "number"
      ? data.interval
      : 5;
  return {
    userCode,
    deviceAuthId: data.device_auth_id,
    verificationUrl: DEVICE_VERIFICATION_URL,
    intervalSeconds,
  };
}

/**
 * Step 3 (one poll). Hits the device token endpoint once.
 *   - 200  -> { authorization_code, code_verifier }
 *   - 403/404 -> still pending; returns { pending: true }
 *   - other -> throws.
 */
export async function pollCodexDeviceToken(opts: {
  deviceAuthId: string;
  userCode: string;
}): Promise<{ pending: true } | { pending: false; result: DeviceTokenResponse }> {
  const res = await fetch(DEVICE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": DEVICE_USER_AGENT,
    },
    body: JSON.stringify({
      device_auth_id: opts.deviceAuthId,
      user_code: opts.userCode,
    }),
  });
  if (res.ok) {
    const result = (await res.json()) as DeviceTokenResponse;
    if (!result.authorization_code || !result.code_verifier) {
      throw new Error("Codex device token response missing authorization_code or code_verifier.");
    }
    return { pending: false, result };
  }
  // Authorization not yet granted.
  if (res.status === 403 || res.status === 404) {
    return { pending: true };
  }
  const text = await res.text();
  throw new Error(`Codex device token poll failed (${res.status}): ${text}`);
}

/**
 * Steps 3+4 combined, server-side. Polls the device token endpoint up to
 * `maxWaitMs`, then exchanges the authorization code for tokens and builds the
 * stored credential (account id extracted from the id_token). This is the
 * single-shot "Complete" path the admin page calls after the operator has
 * entered the code in their browser.
 */
export async function completeCodexDeviceLogin(opts: {
  deviceAuthId: string;
  userCode: string;
  maxWaitMs?: number;
  intervalSeconds?: number;
}): Promise<OAuthCredential> {
  const maxWaitMs = opts.maxWaitMs ?? 60_000;
  const intervalMs = (opts.intervalSeconds ?? 5) * 1000;
  const start = Date.now();

  let deviceToken: DeviceTokenResponse | null = null;
  // Poll immediately, then on the interval, until granted or timed out.
  while (Date.now() - start < maxWaitMs) {
    const poll = await pollCodexDeviceToken({
      deviceAuthId: opts.deviceAuthId,
      userCode: opts.userCode,
    });
    if (!poll.pending) {
      deviceToken = poll.result;
      break;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (!deviceToken) {
    throw new Error(
      "Authorization not completed in time. Open the device link, enter the code, then click Complete again.",
    );
  }

  const cred = await exchangeCodexCode({
    authorizationCode: deviceToken.authorization_code,
    codeVerifier: deviceToken.code_verifier,
  });
  return cred;
}

/** Step 4: exchange the authorization code (+ server-supplied verifier) for
 *  tokens at the OAuth token endpoint and build the stored credential. */
export async function exchangeCodexCode(opts: {
  authorizationCode: string;
  codeVerifier: string;
}): Promise<OAuthCredential> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code: opts.authorizationCode,
      code_verifier: opts.codeVerifier,
      redirect_uri: DEVICE_REDIRECT_URI,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Codex token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as OAuthTokenResponse;
  const now = Date.now();
  const accountId = extractAccountId(data.id_token ?? data.access_token);
  return {
    kind: "oauth",
    provider: "openai-codex",
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: now + data.expires_in * 1000 - REFRESH_MARGIN_MS,
    clientId: CLIENT_ID,
    scope: data.scope ?? "",
    obtainedAt: now,
    accountId: accountId || undefined,
  };
}

/** Refresh the access token using the stored refresh token. Returns the
 *  updated credential (with rotated tokens if OpenAI rotated them, and a
 *  re-extracted account id when a new id_token comes back). Caller persists
 *  via setCredential() and serialises calls via the refresh-lock map. */
export async function refreshCodexCredential(cred: OAuthCredential): Promise<OAuthCredential> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cred.clientId || CLIENT_ID,
      refresh_token: cred.refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Codex token refresh failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as OAuthTokenResponse;
  const now = Date.now();
  const refreshedAccountId = data.id_token ? extractAccountId(data.id_token) : "";
  return {
    ...cred,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? cred.refreshToken,
    expiresAt: now + data.expires_in * 1000 - REFRESH_MARGIN_MS,
    scope: data.scope ?? cred.scope,
    accountId: refreshedAccountId || cred.accountId,
  };
}

/** True if the credential is at or past `expiresAt`. `expiresAt` already has
 *  REFRESH_MARGIN_MS subtracted (see exchange/refresh), so don't subtract it
 *  a second time. Mirrors the Anthropic module's helper of the same name. */
export function isCodexExpiringSoon(cred: OAuthCredential): boolean {
  return Date.now() >= cred.expiresAt;
}

/**
 * Build the auth identity headers for a Codex Responses request. The adapter
 * composes the rest (OpenAI-Beta, originator, User-Agent, Content-Type). We
 * return the Bearer token and, when known, the chatgpt-account-id header.
 */
export function codexAuthHeaders(cred: OAuthCredential): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cred.accessToken}`,
  };
  if (cred.accountId) headers["chatgpt-account-id"] = cred.accountId;
  return headers;
}
