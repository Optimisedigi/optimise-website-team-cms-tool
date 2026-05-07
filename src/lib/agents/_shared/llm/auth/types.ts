/**
 * Credential types.
 *
 * Two kinds: OAuth (currently Anthropic only, via Claude Code client
 * impersonation) and API key (env var fallback for everyone). The resolver
 * returns ResolvedAuth in either case so adapters never branch on credential
 * type.
 */

import type { ProviderName } from "../registry";

export interface OAuthCredential {
  kind: "oauth";
  provider: "anthropic";
  accessToken: string;
  refreshToken: string;
  /** Unix ms. */
  expiresAt: number;
  /** Stored so we can detect rotation by Anthropic of the Claude Code client id. */
  clientId: string;
  scope: string;
  obtainedAt: number;
}

export interface ApiKeyCredential {
  kind: "api-key";
  provider: ProviderName;
  apiKey: string;
  /** 'primary' | 'rotation-2' | etc. Reserved for future per-client keys. */
  label?: string;
}

export type Credential = OAuthCredential | ApiKeyCredential;

export interface ResolvedAuth {
  /** Ready to spread into fetch headers. */
  authHeader: Record<string, string>;
  source: "oauth" | "api-key" | "api-key-fallback";
  credential: Credential;
}

export class NoCredentialError extends Error {
  constructor(public provider: ProviderName) {
    super(`No credential available for ${provider}`);
    this.name = "NoCredentialError";
  }
}
