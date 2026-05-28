/**
 * Resolver behaviour for the openai-codex provider (Option B semantics +
 * Codex specifics):
 *
 *   - OAuth connected, refresh succeeds -> returns codex headers incl.
 *     chatgpt-account-id, source='oauth'.
 *   - OAuth connected, refresh fails    -> throws OAuthFailedError (no silent
 *     fallback; Codex has no API key path anyway).
 *   - OAuth never connected             -> NoCredentialError (Codex is
 *     OAuth-only; no env API key).
 *   - CODEX_OAUTH_DISABLED set          -> behaves as if no credential stored
 *     -> NoCredentialError (env kill-switch).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCredential = vi.fn();
const mockIsForceFallback = vi.fn();
const mockGetRefreshLock = vi.fn();
const mockSetRefreshLock = vi.fn();

vi.mock("@/lib/agents/_shared/llm/auth/store", () => ({
  getCredential: (...args: unknown[]) => mockGetCredential(...args),
  setCredential: vi.fn(),
  isForceFallback: (...args: unknown[]) => mockIsForceFallback(...args),
  getRefreshLock: (...args: unknown[]) => mockGetRefreshLock(...args),
  setRefreshLock: (...args: unknown[]) => mockSetRefreshLock(...args),
}));

// Anthropic module is imported by the resolver; keep it inert here.
vi.mock("@/lib/agents/_shared/llm/auth/oauth/anthropic", () => ({
  refreshAnthropicCredential: vi.fn(),
  isExpiringSoon: () => false,
}));

const mockRefreshCodex = vi.fn();
vi.mock("@/lib/agents/_shared/llm/auth/oauth/openai-codex", () => ({
  refreshCodexCredential: (...args: unknown[]) => mockRefreshCodex(...args),
  // Force the refresh path so we can simulate success/failure.
  isCodexExpiringSoon: () => true,
  codexAuthHeaders: (cred: { accessToken: string; accountId?: string }) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${cred.accessToken}` };
    if (cred.accountId) headers["chatgpt-account-id"] = cred.accountId;
    return headers;
  },
}));

vi.mock("@/lib/agents/_shared/llm/auth/events", () => ({
  recordAuthEvent: vi.fn().mockResolvedValue(undefined),
}));

import { resolveCredential, OAuthFailedError } from "@/lib/agents/_shared/llm/auth/resolver";
import { NoCredentialError } from "@/lib/agents/_shared/llm/auth/types";

const connectedCred = {
  kind: "oauth" as const,
  provider: "openai-codex" as const,
  accessToken: "stale-access",
  refreshToken: "refresh-1",
  expiresAt: 0,
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  scope: "",
  obtainedAt: 0,
  accountId: "acct-123",
};

beforeEach(() => {
  mockGetCredential.mockReset();
  mockIsForceFallback.mockReset();
  mockGetRefreshLock.mockReset();
  mockSetRefreshLock.mockReset();
  mockRefreshCodex.mockReset();
  delete process.env.CODEX_OAUTH_DISABLED;
});

describe("resolveCredential('openai-codex')", () => {
  it("returns codex headers incl. chatgpt-account-id when OAuth refresh succeeds", async () => {
    mockIsForceFallback.mockResolvedValueOnce(false);
    mockGetCredential.mockResolvedValueOnce(connectedCred);
    mockGetRefreshLock.mockReturnValueOnce(undefined);
    mockSetRefreshLock.mockImplementationOnce((_p, p) => p);
    mockRefreshCodex.mockResolvedValueOnce({
      ...connectedCred,
      accessToken: "fresh-access",
      expiresAt: Date.now() + 3600_000,
    });

    const auth = await resolveCredential("openai-codex");
    expect(auth.source).toBe("oauth");
    expect(auth.authHeader.Authorization).toBe("Bearer fresh-access");
    expect(auth.authHeader["chatgpt-account-id"]).toBe("acct-123");
  });

  it("throws OAuthFailedError when refresh fails (no silent fallback)", async () => {
    mockIsForceFallback.mockResolvedValueOnce(false);
    mockGetCredential.mockResolvedValueOnce(connectedCred);
    mockGetRefreshLock.mockReturnValueOnce(undefined);
    mockSetRefreshLock.mockImplementationOnce((_p, p) => p);
    mockRefreshCodex.mockRejectedValueOnce(new Error("Codex token refresh failed (401)"));

    await expect(resolveCredential("openai-codex")).rejects.toBeInstanceOf(OAuthFailedError);
  });

  it("throws NoCredentialError when OAuth was never connected (no API key path)", async () => {
    mockIsForceFallback.mockResolvedValueOnce(false);
    mockGetCredential.mockResolvedValueOnce(null); // no OAuth stored
    // Resolver then checks for a stored API key; none either.
    mockGetCredential.mockResolvedValueOnce(null);

    await expect(resolveCredential("openai-codex")).rejects.toBeInstanceOf(NoCredentialError);
  });

  it("env kill-switch CODEX_OAUTH_DISABLED skips OAuth -> NoCredentialError", async () => {
    process.env.CODEX_OAUTH_DISABLED = "1";
    mockIsForceFallback.mockResolvedValueOnce(false);
    // With the kill-switch on, the OAuth branch never calls getCredential for
    // the stored OAuth check; it falls through to the API-key path which also
    // queries getCredential once (returns null).
    mockGetCredential.mockResolvedValueOnce(null);

    await expect(resolveCredential("openai-codex")).rejects.toBeInstanceOf(NoCredentialError);
    // refresh must never be attempted when disabled.
    expect(mockRefreshCodex).not.toHaveBeenCalled();
  });
});
