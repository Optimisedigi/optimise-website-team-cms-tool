/**
 * Anthropic OAuth via Claude Code client impersonation.
 *
 * Modelled directly on gg-coder's core/oauth/anthropic.js. The Claude Code
 * OAuth client id, authorize URL, token URL, redirect URI, and scope list
 * are taken verbatim. Anthropic uses a paste-the-code flow rather than a
 * localhost redirect, which suits a Vercel deployment perfectly: the admin
 * page generates a verifier + challenge, opens the consent URL, and the
 * user pastes the returned `code#state` string back into a form on the
 * admin page. No callback route required.
 *
 * Operational risk note (lifted from the build plan): using OAuth tokens
 * from the Claude Code client to power server-side agents is outside the
 * spirit of Anthropic's Max plan terms. The legal status is grey rather
 * than clearly prohibited, but Anthropic can revoke tokens, rotate the
 * client id, or rate-limit at any time. This module makes the credential
 * work; the resolver layer transparently falls back to env-var API key on
 * any OAuth failure so the fleet keeps running.
 */

import { generateChallenge } from "../pkce";
import type { OAuthCredential } from "../types";

const CLIENT_ID = atob("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl");
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";
const SCOPES = [
  "org:create_api_key",
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
  "user:mcp_servers",
  "user:file_upload",
].join(" ");

/** Refresh ~5 minutes early to avoid 401s on the boundary. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Output of beginAnthropicLogin ,  give to the admin page so it can render
 *  the consent link and remember the verifier across the paste step. */
export interface BeginLoginResult {
  authorizeUrl: string;
  state: string;
  codeVerifier: string;
}

export function beginAnthropicLogin(): BeginLoginResult {
  const { codeVerifier, codeChallenge } = generateChallenge();
  // 32 hex chars of state, matches gg-coder's randomBytes(16).toString('hex')
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const params = new URLSearchParams({
    code: "true",
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });
  return {
    authorizeUrl: `${AUTHORIZE_URL}?${params}`,
    state,
    codeVerifier,
  };
}

/** Anthropic's flow returns a paste string of form `code#state`. Validate
 *  + exchange. The expectedState must match the state generated at login start. */
export async function completeAnthropicLogin(opts: {
  pasteString: string;
  expectedState: string;
  codeVerifier: string;
}): Promise<OAuthCredential> {
  const parts = opts.pasteString.trim().split("#");
  if (parts.length !== 2 || !parts[0] || parts[1] !== opts.expectedState) {
    throw new Error("Invalid code or state mismatch. Please retry the login flow.");
  }
  const code = parts[0];
  const state = parts[1];
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      state,
      redirect_uri: REDIRECT_URI,
      code_verifier: opts.codeVerifier,
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  };
  const now = Date.now();
  return {
    kind: "oauth",
    provider: "anthropic",
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: now + data.expires_in * 1000 - REFRESH_MARGIN_MS,
    clientId: CLIENT_ID,
    scope: data.scope ?? SCOPES,
    obtainedAt: now,
  };
}

/** Refresh the access token using the stored refresh token. Returns the
 *  updated credential (with rotated tokens if Anthropic rotated them).
 *  Caller is responsible for persisting via setCredential() and for
 *  serialising calls via the refresh-lock map. */
export async function refreshAnthropicCredential(cred: OAuthCredential): Promise<OAuthCredential> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: cred.clientId,
      refresh_token: cred.refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic token refresh failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  const now = Date.now();
  return {
    ...cred,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? cred.refreshToken,
    expiresAt: now + data.expires_in * 1000 - REFRESH_MARGIN_MS,
    scope: data.scope ?? cred.scope,
  };
}

/** True if the credential is within REFRESH_MARGIN_MS of expiry (or already expired). */
export function isExpiringSoon(cred: OAuthCredential): boolean {
  return Date.now() >= cred.expiresAt - REFRESH_MARGIN_MS;
}

/** Beta headers Anthropic expects when authenticating via OAuth. The native
 *  API distinguishes Claude Code OAuth callers from API key callers via these
 *  beta flags. Lifted verbatim from gg-ai's outbound request shape. */
export const OAUTH_BETA_HEADERS = ["claude-code-20250219", "oauth-2025-04-20"] as const;

/** Headers the Anthropic native API expects when authenticating via OAuth.
 *  Note: differs from API key auth (which uses `x-api-key`). The adapter
 *  composes these with any other beta flags (e.g. prompt caching). */
export function toAuthHeader(cred: OAuthCredential): {
  Authorization: string;
  betaFlags: string[];
} {
  return {
    Authorization: `Bearer ${cred.accessToken}`,
    betaFlags: [...OAUTH_BETA_HEADERS],
  };
}
