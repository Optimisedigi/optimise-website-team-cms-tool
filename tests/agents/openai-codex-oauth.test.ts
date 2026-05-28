/**
 * Codex (ChatGPT subscription) OAuth device-code module.
 *
 * Covers: device-code begin parses the response; the authorization-code
 * exchange builds the correct form body; refresh preserves the refresh token
 * when not rotated; isCodexExpiringSoon boundary; account-id extraction from a
 * sample JWT (chatgpt_account_id claim + organizations fallback + org id
 * fallback); and the header builder.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  beginCodexDeviceLogin,
  exchangeCodexCode,
  refreshCodexCredential,
  isCodexExpiringSoon,
  extractAccountId,
  codexAuthHeaders,
  DEVICE_VERIFICATION_URL,
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

describe("extractAccountId", () => {
  it("reads chatgpt_account_id from the auth claim", () => {
    const token = makeJwt({
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-123" },
    });
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

  it("falls back to organization_id in the auth claim", () => {
    const token = makeJwt({
      "https://api.openai.com/auth": { organization_id: "org-fallback" },
    });
    expect(extractAccountId(token)).toBe("org-fallback");
  });

  it("returns empty string for a malformed token", () => {
    expect(extractAccountId("not-a-jwt")).toBe("");
    expect(extractAccountId("")).toBe("");
  });
});

describe("beginCodexDeviceLogin", () => {
  it("parses user_code, device_auth_id and interval", async () => {
    mockFetchOnce(200, {
      device_auth_id: "dev-1",
      user_code: "ABCD-1234",
      interval: "5",
    });
    const result = await beginCodexDeviceLogin();
    expect(result.userCode).toBe("ABCD-1234");
    expect(result.deviceAuthId).toBe("dev-1");
    expect(result.intervalSeconds).toBe(5);
    expect(result.verificationUrl).toBe(DEVICE_VERIFICATION_URL);
  });

  it("throws a helpful error on 404 (device-code login not enabled)", async () => {
    mockFetchOnce(404, "not found");
    await expect(beginCodexDeviceLogin()).rejects.toThrow(/device-code login is not enabled/i);
  });
});

describe("exchangeCodexCode", () => {
  it("builds the form body and extracts the account id from id_token", async () => {
    const idToken = makeJwt({
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-xyz" },
    });
    mockFetchOnce(200, {
      id_token: idToken,
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_in: 3600,
    });

    const cred = await exchangeCodexCode({
      authorizationCode: "auth-code",
      codeVerifier: "verifier",
    });

    expect(cred.provider).toBe("openai-codex");
    expect(cred.accessToken).toBe("access-1");
    expect(cred.refreshToken).toBe("refresh-1");
    expect(cred.accountId).toBe("acct-xyz");
    // expiresAt is in the future but earlier than now+expires_in (margin applied)
    expect(cred.expiresAt).toBeGreaterThan(Date.now());
    expect(cred.expiresAt).toBeLessThan(Date.now() + 3600 * 1000);

    // Verify the request used grant_type=authorization_code with the verifier.
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = String(call[1].body);
    expect(sentBody).toContain("grant_type=authorization_code");
    expect(sentBody).toContain("code=auth-code");
    expect(sentBody).toContain("code_verifier=verifier");
  });

  it("throws on a non-OK exchange", async () => {
    mockFetchOnce(400, "bad request");
    await expect(
      exchangeCodexCode({ authorizationCode: "x", codeVerifier: "y" }),
    ).rejects.toThrow(/Codex token exchange failed \(400\)/);
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

  it("preserves the refresh token when the server does not rotate it", async () => {
    mockFetchOnce(200, { access_token: "new-access", expires_in: 3600 });
    const refreshed = await refreshCodexCredential(base);
    expect(refreshed.accessToken).toBe("new-access");
    expect(refreshed.refreshToken).toBe("old-refresh"); // preserved
    expect(refreshed.accountId).toBe("acct-keep"); // preserved (no new id_token)
  });

  it("rotates the refresh token and account id when the server returns them", async () => {
    const idToken = makeJwt({
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-new" },
    });
    mockFetchOnce(200, {
      access_token: "new-access",
      refresh_token: "rotated-refresh",
      id_token: idToken,
      expires_in: 3600,
    });
    const refreshed = await refreshCodexCredential(base);
    expect(refreshed.refreshToken).toBe("rotated-refresh");
    expect(refreshed.accountId).toBe("acct-new");
  });

  it("throws on a failed refresh (so the resolver escalates to fallback)", async () => {
    mockFetchOnce(401, "unauthorized");
    await expect(refreshCodexCredential(base)).rejects.toThrow(/Codex token refresh failed \(401\)/);
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
    expect(headers.Authorization).toBe("Bearer tok");
    expect("chatgpt-account-id" in headers).toBe(false);
  });
});
