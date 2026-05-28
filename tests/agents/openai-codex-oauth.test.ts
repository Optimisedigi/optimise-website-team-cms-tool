/**
 * Codex (ChatGPT subscription) OAuth — Authorization Code + PKCE flow.
 *
 * Mirrors gg-framework's openai.ts. Covers: authorize-URL construction with the
 * exact gg params; pasted-input parsing (url / code#state / query / raw);
 * code exchange builds the correct form body + extracts account id from the
 * access_token; state-mismatch rejection; refresh preserves the refresh token
 * when not rotated; isCodexExpiringSoon boundary; account-id extraction
 * fallbacks; and the header builder.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  beginCodexLogin,
  parseAuthorizationInput,
  completeCodexLogin,
  exchangeCodexCode,
  refreshCodexCredential,
  isCodexExpiringSoon,
  extractAccountId,
  codexAuthHeaders,
} from "@/lib/agents/_shared/llm/auth/oauth/openai-codex";
import type { OAuthCredential } from "@/lib/agents/_shared/llm/auth/types";

/** Build a JWT (header.payload.signature) with the given payload. Signature is
 *  irrelevant — the module never verifies it. */
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url(payload)}.sig`;
}

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchOnce(status: number, body: unknown): void {
  (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
}

describe("beginCodexLogin", () => {
  it("builds the authorize URL with gg-framework's exact params", () => {
    const { authorizeUrl, state, codeVerifier } = beginCodexLogin();
    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toBe("https://auth.openai.com/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
    expect(url.searchParams.get("scope")).toBe(
      "openid profile email offline_access api.connectors.read api.connectors.invoke",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("id_token_add_organizations")).toBe("true");
    expect(url.searchParams.get("codex_cli_simplified_flow")).toBe("true");
    expect(url.searchParams.get("originator")).toBe("ggcoder");
    expect(codeVerifier.length).toBeGreaterThan(20);
  });
});

describe("parseAuthorizationInput", () => {
  it("parses a full callback URL", () => {
    expect(
      parseAuthorizationInput("http://localhost:1455/auth/callback?code=abc&state=xyz"),
    ).toEqual({ code: "abc", state: "xyz" });
  });
  it("parses code#state", () => {
    expect(parseAuthorizationInput("abc#xyz")).toEqual({ code: "abc", state: "xyz" });
  });
  it("parses a raw query string with code=", () => {
    expect(parseAuthorizationInput("code=abc&state=xyz")).toEqual({ code: "abc", state: "xyz" });
  });
  it("treats a bare value as a raw code", () => {
    expect(parseAuthorizationInput("just-a-code")).toEqual({ code: "just-a-code" });
  });
  it("returns empty for blank input", () => {
    expect(parseAuthorizationInput("   ")).toEqual({});
  });
});

describe("extractAccountId", () => {
  it("reads chatgpt_account_id from the auth claim", () => {
    const token = makeJwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-123" } });
    expect(extractAccountId(token)).toBe("acct-123");
  });
  it("falls back to the default organization id", () => {
    const token = makeJwt({
      "https://api.openai.com/auth": {
        organizations: [
          { id: "org-A", is_default: false },
          { id: "org-B", is_default: true },
        ],
      },
    });
    expect(extractAccountId(token)).toBe("org-B");
  });
  it("returns empty string for a malformed token", () => {
    expect(extractAccountId("not-a-jwt")).toBe("");
  });
});

describe("exchangeCodexCode", () => {
  it("builds the form body and extracts the account id from access_token", async () => {
    const accessToken = makeJwt({
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-xyz" },
    });
    mockFetchOnce(200, {
      access_token: accessToken,
      refresh_token: "refresh-1",
      expires_in: 3600,
    });

    const cred = await exchangeCodexCode({ authorizationCode: "auth-code", codeVerifier: "verifier" });
    expect(cred.provider).toBe("openai-codex");
    expect(cred.accessToken).toBe(accessToken);
    expect(cred.refreshToken).toBe("refresh-1");
    expect(cred.accountId).toBe("acct-xyz");
    expect(cred.expiresAt).toBeGreaterThan(Date.now());
    expect(cred.expiresAt).toBeLessThan(Date.now() + 3600 * 1000);

    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = String(call[1].body);
    expect(sentBody).toContain("grant_type=authorization_code");
    expect(sentBody).toContain("code=auth-code");
    expect(sentBody).toContain("code_verifier=verifier");
    expect(sentBody).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback");
  });

  it("throws when the token has no account id (gg-framework hard-fails)", async () => {
    mockFetchOnce(200, {
      access_token: makeJwt({ sub: "user" }), // no auth claim
      refresh_token: "r",
      expires_in: 3600,
    });
    await expect(
      exchangeCodexCode({ authorizationCode: "x", codeVerifier: "y" }),
    ).rejects.toThrow(/Failed to extract accountId/);
  });

  it("throws on a non-OK exchange", async () => {
    mockFetchOnce(400, "bad request");
    await expect(
      exchangeCodexCode({ authorizationCode: "x", codeVerifier: "y" }),
    ).rejects.toThrow(/OpenAI token exchange failed \(400\)/);
  });
});

describe("completeCodexLogin", () => {
  it("rejects a state mismatch when the paste carries a state", async () => {
    await expect(
      completeCodexLogin({ pasteString: "abc#wrong", expectedState: "right", codeVerifier: "v" }),
    ).rejects.toThrow(/State mismatch/);
  });

  it("exchanges when the paste has no state (raw code)", async () => {
    const accessToken = makeJwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" } });
    mockFetchOnce(200, { access_token: accessToken, refresh_token: "r", expires_in: 3600 });
    const cred = await completeCodexLogin({
      pasteString: "just-a-code",
      expectedState: "right",
      codeVerifier: "v",
    });
    expect(cred.accountId).toBe("acct-1");
  });

  it("throws when no code is found", async () => {
    await expect(
      completeCodexLogin({ pasteString: "   ", expectedState: "s", codeVerifier: "v" }),
    ).rejects.toThrow(/No authorization code/);
  });
});

describe("refreshCodexCredential", () => {
  const base: OAuthCredential = {
    kind: "oauth",
    provider: "openai-codex",
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: 0,
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    scope: "",
    obtainedAt: 0,
    accountId: "acct-keep",
  };

  it("preserves the refresh token + account id when the server does not rotate them", async () => {
    // Access token with no auth claim -> extractAccountId returns "" -> keep old.
    mockFetchOnce(200, { access_token: makeJwt({ sub: "u" }), expires_in: 3600 });
    const refreshed = await refreshCodexCredential(base);
    expect(refreshed.accessToken).toBe(makeJwt({ sub: "u" }));
    expect(refreshed.refreshToken).toBe("old-refresh");
    expect(refreshed.accountId).toBe("acct-keep");
  });

  it("rotates refresh token + account id when the server returns them", async () => {
    const accessToken = makeJwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-new" } });
    mockFetchOnce(200, {
      access_token: accessToken,
      refresh_token: "rotated-refresh",
      expires_in: 3600,
    });
    const refreshed = await refreshCodexCredential(base);
    expect(refreshed.refreshToken).toBe("rotated-refresh");
    expect(refreshed.accountId).toBe("acct-new");
  });

  it("throws on a failed refresh (so the resolver escalates to fallback)", async () => {
    mockFetchOnce(401, "unauthorized");
    await expect(refreshCodexCredential(base)).rejects.toThrow(/OpenAI token refresh failed \(401\)/);
  });
});

describe("isCodexExpiringSoon", () => {
  const cred = (expiresAt: number): OAuthCredential => ({
    kind: "oauth",
    provider: "openai-codex",
    accessToken: "a",
    refreshToken: "r",
    expiresAt,
    clientId: "c",
    scope: "",
    obtainedAt: 0,
  });
  it("is true at or past expiresAt", () => {
    expect(isCodexExpiringSoon(cred(Date.now() - 1))).toBe(true);
    expect(isCodexExpiringSoon(cred(Date.now()))).toBe(true);
  });
  it("is false when expiresAt is comfortably in the future", () => {
    expect(isCodexExpiringSoon(cred(Date.now() + 600_000))).toBe(false);
  });
});

describe("codexAuthHeaders", () => {
  it("includes the bearer token and chatgpt-account-id when present", () => {
    const headers = codexAuthHeaders({
      kind: "oauth",
      provider: "openai-codex",
      accessToken: "tok",
      refreshToken: "r",
      expiresAt: Date.now() + 1000,
      clientId: "c",
      scope: "",
      obtainedAt: 0,
      accountId: "acct-1",
    });
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["chatgpt-account-id"]).toBe("acct-1");
  });
  it("omits chatgpt-account-id when the account id is unknown", () => {
    const headers = codexAuthHeaders({
      kind: "oauth",
      provider: "openai-codex",
      accessToken: "tok",
      refreshToken: "r",
      expiresAt: Date.now() + 1000,
      clientId: "c",
      scope: "",
      obtainedAt: 0,
    });
    expect("chatgpt-account-id" in headers).toBe(false);
  });
});
