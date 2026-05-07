/**
 * PKCE helpers for OAuth Authorization Code + PKCE flow.
 * Modelled on gg-coder's core/oauth/pkce.js.
 */

import crypto from "crypto";

function base64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateChallenge(): { codeVerifier: string; codeChallenge: string } {
  const verifierBytes = crypto.randomBytes(32);
  const codeVerifier = base64Url(verifierBytes);
  const challengeBytes = crypto.createHash("sha256").update(codeVerifier).digest();
  const codeChallenge = base64Url(challengeBytes);
  return { codeVerifier, codeChallenge };
}

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds. */
  expiresIn: number;
  scope: string;
}

export interface ExchangeCodeOptions {
  tokenUrl: string;
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
}

export async function exchangeCode(opts: ExchangeCodeOptions): Promise<ExchangedTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    code_verifier: opts.codeVerifier,
  });
  const res = await fetch(opts.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`PKCE token exchange failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    scope?: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in ?? 3600,
    scope: json.scope ?? "",
  };
}

export async function refreshTokens(opts: {
  tokenUrl: string;
  refreshToken: string;
  clientId: string;
}): Promise<ExchangedTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
  });
  const res = await fetch(opts.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`PKCE token refresh failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  return {
    accessToken: json.access_token,
    // Some providers rotate refresh tokens, others don't. Preserve the old one if not returned.
    refreshToken: json.refresh_token ?? opts.refreshToken,
    expiresIn: json.expires_in ?? 3600,
    scope: json.scope ?? "",
  };
}
