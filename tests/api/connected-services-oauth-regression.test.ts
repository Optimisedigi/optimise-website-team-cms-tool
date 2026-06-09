import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  update: vi.fn(),
  updateGlobal: vi.fn(),
};

const cookieJar = new Map<string, string>();
const mockCookieSet = vi.fn((name: string, value: string) => {
  cookieJar.set(name, value);
});
const mockCookieDelete = vi.fn((name: string) => {
  cookieJar.delete(name);
});

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value ? { name, value } : undefined;
    },
    set: mockCookieSet,
    delete: mockCookieDelete,
  })),
}));

const mockGetGmailOAuthUrl = vi.fn((state: string) => `https://google.test/gmail?state=${encodeURIComponent(state)}`);
const mockExchangeGmailCode = vi.fn();
const mockCreateGmailDraft = vi.fn();
vi.mock("@/lib/gmail-service", () => ({
  getGmailOAuthUrl: (state: string) => mockGetGmailOAuthUrl(state),
  exchangeGmailCode: (code: string) => mockExchangeGmailCode(code),
  createGmailDraft: (...args: unknown[]) => mockCreateGmailDraft(...args),
}));

const mockSearchInbox = vi.fn();
const mockFetchMessageBody = vi.fn();
vi.mock("@/lib/gmail-search", () => ({
  searchInbox: (...args: unknown[]) => mockSearchInbox(...args),
  fetchMessageBody: (...args: unknown[]) => mockFetchMessageBody(...args),
}));

const mockGetValidGmailToken = vi.fn();
vi.mock("@/lib/agents/_shared/user-gmail-tokens", () => ({
  getValidGmailToken: (userId: unknown) => mockGetValidGmailToken(userId),
}));

const mockGetOAuthUrl = vi.fn((state: string) => `https://google.test/gsc?state=${encodeURIComponent(state)}`);
const mockExchangeCode = vi.fn();
const mockListGscSites = vi.fn();
const mockFetchSearchAnalytics = vi.fn();
const mockFetchBrandedAnalytics = vi.fn();
const mockRefreshAccessToken = vi.fn();
vi.mock("@/lib/gsc-service", () => ({
  getOAuthUrl: (state: string) => mockGetOAuthUrl(state),
  exchangeCode: (code: string) => mockExchangeCode(code),
  listGscSites: (token: string) => mockListGscSites(token),
  fetchSearchAnalytics: (...args: unknown[]) => mockFetchSearchAnalytics(...args),
  fetchBrandedAnalytics: (...args: unknown[]) => mockFetchBrandedAnalytics(...args),
  refreshAccessToken: (...args: unknown[]) => mockRefreshAccessToken(...args),
}));

const mockGetGa4OAuthUrl = vi.fn((state: string) => `https://google.test/ga4?state=${encodeURIComponent(state)}`);
const mockExchangeGa4Code = vi.fn();
const mockEnsureValidToken = vi.fn();
const mockFetchGa4Report = vi.fn();
vi.mock("@/lib/ga4-service", () => ({
  getGa4OAuthUrl: (state: string) => mockGetGa4OAuthUrl(state),
  exchangeGa4Code: (code: string) => mockExchangeGa4Code(code),
  ensureValidToken: (...args: unknown[]) => mockEnsureValidToken(...args),
  fetchGa4Report: (...args: unknown[]) => mockFetchGa4Report(...args),
}));

const mockGetCalendarOAuthUrl = vi.fn((redirectUri: string, state: string) => `https://google.test/calendar?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`);
const mockExchangeCalendarCode = vi.fn();
const mockGetCalendarUserEmail = vi.fn();
vi.mock("@/lib/calendar-service", () => ({
  getCalendarOAuthUrl: (redirectUri: string, state: string) => mockGetCalendarOAuthUrl(redirectUri, state),
  exchangeCalendarCode: (...args: unknown[]) => mockExchangeCalendarCode(...args),
  getCalendarUserEmail: (...args: unknown[]) => mockGetCalendarUserEmail(...args),
}));

const mockGetSheetsOAuthUrl = vi.fn((state: string) => `https://google.test/sheets?state=${state}`);
const mockExchangeSheetsCode = vi.fn();
const mockGetSheetsUserEmail = vi.fn();
vi.mock("@/lib/sheets-service", () => ({
  getSheetsOAuthUrl: (state: string) => mockGetSheetsOAuthUrl(state),
  exchangeSheetsCode: (...args: unknown[]) => mockExchangeSheetsCode(...args),
  getSheetsUserEmail: (...args: unknown[]) => mockGetSheetsUserEmail(...args),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: vi.fn(() => ({ setCredentials: vi.fn() })) },
    searchconsole: vi.fn(() => ({
      searchanalytics: { query: vi.fn(async () => ({ data: { rows: [] } })) },
    })),
  },
}));

function req(url: string, init: RequestInit = {}): NextRequest {
  return new NextRequest(url, init);
}

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function redirectLocation(res: Response): string {
  return res.headers.get("location") ?? "";
}

describe("connected service OAuth and route regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clear();
    process.env.PAYLOAD_SECRET = "test-payload-secret";
    process.env.GOOGLE_CLIENT_ID = "google-client";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    process.env.GMAIL_REDIRECT_URI = "http://localhost/api/gmail/callback";
    delete process.env.CALENDAR_REDIRECT_URI;
    mockPayload.auth.mockResolvedValue({ user: { id: 7, role: "admin" } });
  });

  it("rejects unauthenticated Gmail connect before minting OAuth state", async () => {
    const { GET } = await import("@/app/(frontend)/api/gmail/connect/route");
    mockPayload.auth.mockResolvedValueOnce({ user: null });

    const res = await GET(req("http://localhost/api/gmail/connect"));

    expect(res.status).toBe(401);
    expect(mockGetGmailOAuthUrl).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("Gmail callback rejects tampered state without exchanging or storing tokens", async () => {
    const { GET } = await import("@/app/(frontend)/api/gmail/callback/route");

    const res = await GET(req("http://localhost/api/gmail/callback?code=secret-code&state=7"));

    expect(res.status).toBe(307);
    expect(redirectLocation(res)).toContain("gmail_error=malformed_state");
    expect(mockExchangeGmailCode).not.toHaveBeenCalled();
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("Gmail callback enforces initiator user boundary before token exchange", async () => {
    const { signOAuthState } = await import("@/lib/oauth-state");
    const { GET } = await import("@/app/(frontend)/api/gmail/callback/route");
    const { state, nonce } = signOAuthState(7, 7);
    cookieJar.set("oauth_nonce_gmail", nonce);
    mockPayload.auth.mockResolvedValueOnce({ user: { id: 8, role: "admin" } });

    const res = await GET(req(`http://localhost/api/gmail/callback?code=secret-code&state=${encodeURIComponent(state)}`));

    expect(redirectLocation(res)).toContain("gmail_error=user_mismatch");
    expect(mockExchangeGmailCode).not.toHaveBeenCalled();
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("Gmail search maps external permission failures without logging or leaking tokens", async () => {
    const { GET } = await import("@/app/(frontend)/api/gmail/search/route");
    mockGetValidGmailToken.mockResolvedValueOnce({ ok: true, accessToken: "ya29.secret-token" });
    mockSearchInbox.mockRejectedValueOnce(Object.assign(new Error("Forbidden token ya29.secret-token"), { status: 403 }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await GET(req("http://localhost/api/gmail/search?q=from%3Aclient&max=5"));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("scope-insufficient");
    expect(JSON.stringify(json)).not.toContain("ya29.secret-token");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("Gmail draft requires the logged-in user's own connected token", async () => {
    const { POST } = await import("@/app/(frontend)/api/gmail/draft/route");
    mockPayload.auth.mockResolvedValueOnce({ user: { id: 42, role: "editor" } });
    mockGetValidGmailToken.mockResolvedValueOnce({ ok: false, reason: "missing-refresh-token" });

    const res = await POST(jsonReq("http://localhost/api/gmail/draft", { body: "Hello" }));

    expect(res.status).toBe(403);
    expect(mockGetValidGmailToken).toHaveBeenCalledWith(42);
    expect(mockCreateGmailDraft).not.toHaveBeenCalled();
  });

  it("GSC connect requires admin auth before issuing a client-bound OAuth URL", async () => {
    const { GET } = await import("@/app/(frontend)/api/gsc/connect/route");
    mockPayload.auth.mockResolvedValueOnce({ user: { id: 7, role: "editor" } });

    const res = await GET(req("http://localhost/api/gsc/connect?clientId=123"));

    expect(res.status).toBe(401);
    expect(mockGetOAuthUrl).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("GSC callback validates nonce before fetching sites or updating a client", async () => {
    const { signOAuthState } = await import("@/lib/oauth-state");
    const { GET } = await import("@/app/(frontend)/api/gsc/callback/route");
    const { state } = signOAuthState(123, 7);
    cookieJar.set("oauth_nonce_gsc", "wrong-nonce");

    const res = await GET(req(`http://localhost/api/gsc/callback?code=code&state=${encodeURIComponent(state)}`));

    expect(redirectLocation(res)).toContain("gsc_error=nonce_mismatch");
    expect(mockExchangeCode).not.toHaveBeenCalled();
    expect(mockListGscSites).not.toHaveBeenCalled();
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("GSC query falls back safely when live external fetch fails", async () => {
    const { POST } = await import("@/app/(frontend)/api/gsc/query/route");
    mockPayload.findByID.mockResolvedValueOnce({
      id: 123,
      gscConnected: true,
      gscAccessToken: "gsc-access-secret",
      gscPropertyUrl: "https://example.com/",
      brandKeywords: "Example",
    });
    mockFetchSearchAnalytics.mockRejectedValueOnce(new Error("upstream gsc outage gsc-access-secret"));
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 0, docs: [] })
      .mockResolvedValueOnce({ totalDocs: 0, docs: [] });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(jsonReq("http://localhost/api/gsc/query", { clientId: 123, startDate: "2026-05-01", endDate: "2026-05-07" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.summary).toEqual({ totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0 });
    expect(JSON.stringify(json)).not.toContain("gsc-access-secret");
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("GA4 callback rejects initiator mismatch before exchanging code", async () => {
    const { signOAuthState } = await import("@/lib/oauth-state");
    const { GET } = await import("@/app/(frontend)/api/ga4/callback/route");
    const { state, nonce } = signOAuthState(123, 7);
    cookieJar.set("oauth_nonce_ga4", nonce);
    mockPayload.auth.mockResolvedValueOnce({ user: { id: 99, role: "admin" } });

    const res = await GET(req(`http://localhost/api/ga4/callback?code=code&state=${encodeURIComponent(state)}`));

    expect(redirectLocation(res)).toContain("ga4_error=user_mismatch");
    expect(mockExchangeGa4Code).not.toHaveBeenCalled();
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("GA4 callback redirects with a success marker after storing client tokens", async () => {
    const { signOAuthState } = await import("@/lib/oauth-state");
    const { GET } = await import("@/app/(frontend)/api/ga4/callback/route");
    const { state, nonce } = signOAuthState(123, 7);
    cookieJar.set("oauth_nonce_ga4", nonce);
    mockExchangeGa4Code.mockResolvedValueOnce({
      accessToken: "ga4-access-secret",
      refreshToken: "ga4-refresh-secret",
      expiry: "2026-06-09T12:00:00.000Z",
    });
    mockPayload.findByID.mockResolvedValueOnce({ id: 123, ga4PropertyId: "308123456" });

    const res = await GET(req(`http://localhost/api/ga4/callback?code=code&state=${encodeURIComponent(state)}`));

    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: "clients",
      id: "123",
      data: expect.objectContaining({
        ga4Connected: true,
        ga4RefreshToken: "ga4-refresh-secret",
      }),
    }));
    const location = redirectLocation(res);
    expect(location).toContain("/admin/collections/clients/123");
    expect(location).toContain("ga4_connected=1");
    expect(location).toContain("oauth_refresh=");
  });

  it("GA4 query requires a logged-in user before reading connected client data", async () => {
    const { GET } = await import("@/app/(frontend)/api/ga4/query/route");
    mockPayload.auth.mockResolvedValueOnce({ user: null });

    const res = await GET(req("http://localhost/api/ga4/query?clientId=123&period=30d"));

    expect(res.status).toBe(401);
    expect(mockPayload.findByID).not.toHaveBeenCalled();
    expect(mockFetchGa4Report).not.toHaveBeenCalled();
  });

  it("Calendar callback rejects state mismatch before auth, exchange, or global update", async () => {
    const { GET } = await import("@/app/(frontend)/api/calendar/callback/route");

    const res = await GET(req("http://localhost/api/calendar/callback?code=code&state=attacker", {
      headers: { cookie: "oauth_state_calendar=expected" },
    }));

    expect(redirectLocation(res)).toContain("error=oauth_state_mismatch");
    expect(mockPayload.auth).not.toHaveBeenCalled();
    expect(mockExchangeCalendarCode).not.toHaveBeenCalled();
    expect(mockPayload.updateGlobal).not.toHaveBeenCalled();
  });

  it("Calendar callback continues on non-secret email lookup failure", async () => {
    const { GET } = await import("@/app/(frontend)/api/calendar/callback/route");
    mockExchangeCalendarCode.mockResolvedValueOnce({ accessToken: "calendar-access-secret", refreshToken: "calendar-refresh-secret" });
    mockGetCalendarUserEmail.mockRejectedValueOnce(new Error("profile unavailable calendar-access-secret"));
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const res = await GET(req("http://localhost/api/calendar/callback?code=code&state=expected", {
      headers: { cookie: "oauth_state_calendar=expected" },
    }));

    expect(redirectLocation(res)).toBe("http://localhost/admin/settings/integrations");
    expect(mockPayload.updateGlobal).toHaveBeenCalledWith(expect.objectContaining({
      slug: "calendar-auth",
      data: expect.objectContaining({ connectedEmail: "(connected)", refreshToken: "calendar-refresh-secret" }),
      overrideAccess: true,
    }));
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain("calendar-refresh-secret");
    consoleWarn.mockRestore();
  });

  it("Sheets connect requires admin auth before issuing OAuth state", async () => {
    const { GET } = await import("@/app/(frontend)/api/sheets/connect/route");
    mockPayload.auth.mockResolvedValueOnce({ user: { id: 7, role: "editor" } });

    const res = await GET(req("http://localhost/api/sheets/connect"));

    expect(res.status).toBe(401);
    expect(mockGetSheetsOAuthUrl).not.toHaveBeenCalled();
  });

  it("Sheets callback rejects missing state before exchanging code", async () => {
    const { GET } = await import("@/app/(frontend)/api/sheets/callback/route");

    const res = await GET(req("http://localhost/api/sheets/callback?code=code"));

    expect(redirectLocation(res)).toContain("error=oauth_state_mismatch");
    expect(mockExchangeSheetsCode).not.toHaveBeenCalled();
    expect(mockPayload.updateGlobal).not.toHaveBeenCalled();
  });
});
