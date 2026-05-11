/**
 * Resolver behaviour, Option B (per build conversation 2026-05-07):
 *
 *   - OAuth was connected and works     -> use it (source='oauth')
 *   - OAuth was connected but refresh fails -> THROW OAuthFailedError
 *     (the agent loop walks down fallbackModels to a different provider).
 *     We never silently switch from OAuth to billed Anthropic API.
 *   - OAuth was never connected         -> use env API key (source='api-key'),
 *     this is a chosen path, not a fallback.
 *   - Neither available                 -> throw NoCredentialError.
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

const mockRefreshAnthropic = vi.fn();
vi.mock("@/lib/agents/_shared/llm/auth/oauth/anthropic", () => ({
  refreshAnthropicCredential: (...args: unknown[]) => mockRefreshAnthropic(...args),
  isExpiringSoon: () => true, // force the refresh path so we can simulate success/failure
  toAuthHeader: (cred: { accessToken: string }) => ({
    Authorization: `Bearer ${cred.accessToken}`,
    betaFlags: ["claude-code-20250219", "oauth-2025-04-20"],
  }),
}));

vi.mock("@/lib/agents/_shared/llm/auth/events", () => ({
  recordAuthEvent: vi.fn().mockResolvedValue(undefined),
}));

import { resolveCredential, OAuthFailedError } from "@/lib/agents/_shared/llm/auth/resolver";
import { NoCredentialError } from "@/lib/agents/_shared/llm/auth/types";

beforeEach(() => {
  mockGetCredential.mockReset();
  mockIsForceFallback.mockReset();
  mockGetRefreshLock.mockReset();
  mockSetRefreshLock.mockReset();
  mockRefreshAnthropic.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.KIMI_API_KEY;
  delete process.env.MOONSHOT_API_KEY;
  delete process.env.MINIMAX_API_KEY;
});

describe("resolveCredential, Option B semantics", () => {
  it("returns OAuth credential when stored and refresh succeeds", async () => {
    mockIsForceFallback.mockResolvedValueOnce(false);
    mockGetCredential.mockResolvedValueOnce({
      kind: "oauth",
      provider: "anthropic",
      accessToken: "expired-token",
      refreshToken: "refresh-1",
      expiresAt: 0,
      clientId: "test-client",
      scope: "user:inference",
      obtainedAt: 0,
    });
    mockGetRefreshLock.mockReturnValueOnce(undefined);
    mockSetRefreshLock.mockImplementationOnce((_, p) => p);
    mockRefreshAnthropic.mockResolvedValueOnce({
      kind: "oauth",
      provider: "anthropic",
      accessToken: "fresh-token",
      refreshToken: "refresh-2",
      expiresAt: Date.now() + 3600_000,
      clientId: "test-client",
      scope: "user:inference",
      obtainedAt: Date.now(),
    });

    const auth = await resolveCredential("anthropic");
    expect(auth.source).toBe("oauth");
    expect(auth.authHeader.Authorization).toBe("Bearer fresh-token");
    // anthropic-version is the resolver's responsibility; anthropic-beta
    // and Claude Code identity headers (user-agent, x-app) are composed by
    // the adapter so they can adapt to the model + features in flight.
    expect(auth.authHeader["anthropic-version"]).toBe("2023-06-01");
  });

  it("THROWS OAuthFailedError when OAuth was connected but refresh fails (does NOT silently fall to API key)", async () => {
    process.env.ANTHROPIC_API_KEY = "billed-key-should-not-be-used";
    mockIsForceFallback.mockResolvedValueOnce(false);
    mockGetCredential.mockResolvedValueOnce({
      kind: "oauth",
      provider: "anthropic",
      accessToken: "expired",
      refreshToken: "bad-refresh",
      expiresAt: 0,
      clientId: "test-client",
      scope: "",
      obtainedAt: 0,
    });
    mockGetRefreshLock.mockReturnValueOnce(undefined);
    mockSetRefreshLock.mockImplementationOnce((_, p) => p);
    mockRefreshAnthropic.mockRejectedValueOnce(new Error("Anthropic token refresh failed (401)"));

    await expect(resolveCredential("anthropic")).rejects.toBeInstanceOf(OAuthFailedError);
  });

  it("uses env API key when OAuth was never connected (api-key, not api-key-fallback)", async () => {
    process.env.ANTHROPIC_API_KEY = "billed-key";
    mockIsForceFallback.mockResolvedValueOnce(false);
    mockGetCredential.mockResolvedValueOnce(null); // no OAuth stored

    const auth = await resolveCredential("anthropic");
    expect(auth.source).toBe("api-key");
    expect(auth.authHeader["x-api-key"]).toBe("billed-key");
  });

  it("uses env API key for non-OAuth providers (Kimi)", async () => {
    process.env.KIMI_API_KEY = "kimi-key";
    mockGetCredential.mockResolvedValueOnce(null);

    const auth = await resolveCredential("moonshot");
    expect(auth.source).toBe("api-key");
    expect(auth.authHeader.Authorization).toBe("Bearer kimi-key");
  });

  it("throws NoCredentialError when neither OAuth nor API key is available", async () => {
    mockGetCredential.mockResolvedValueOnce(null);
    await expect(resolveCredential("minimax")).rejects.toBeInstanceOf(NoCredentialError);
  });

  it("force-fallback toggle: skips OAuth check, uses API key even with OAuth stored", async () => {
    process.env.ANTHROPIC_API_KEY = "forced-key";
    mockIsForceFallback.mockResolvedValueOnce(true);
    // With force-fallback on, getCredential is bypassed for OAuth path.
    // It is called once as a fallback for stored API key after the env key
    // check; mock returns null so we use env key.
    mockGetCredential.mockResolvedValueOnce(null);

    const auth = await resolveCredential("anthropic");
    expect(auth.source).toBe("api-key");
    expect(auth.authHeader["x-api-key"]).toBe("forced-key");
  });

  it("Kimi: uses KIMI_API_KEY (preferred) over MOONSHOT_API_KEY (alias)", async () => {
    process.env.KIMI_API_KEY = "preferred";
    process.env.MOONSHOT_API_KEY = "fallback-alias";
    mockGetCredential.mockResolvedValueOnce(null);

    const auth = await resolveCredential("moonshot");
    expect(auth.authHeader.Authorization).toBe("Bearer preferred");
  });

  it("Kimi: falls back to MOONSHOT_API_KEY when KIMI_API_KEY not set", async () => {
    process.env.MOONSHOT_API_KEY = "moonshot-only";
    mockGetCredential.mockResolvedValueOnce(null);

    const auth = await resolveCredential("moonshot");
    expect(auth.authHeader.Authorization).toBe("Bearer moonshot-only");
  });
});
