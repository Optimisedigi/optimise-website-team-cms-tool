import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

const mockPayload = {
  find: vi.fn(),
  auth: vi.fn(),
  logger: { error: vi.fn() },
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(() => Promise.resolve()),
}));

const sendBrevoEmail = vi.fn();
vi.mock("@/lib/brevo-email", () => ({
  sendBrevoEmail: (...args: unknown[]) => sendBrevoEmail(...args),
}));

const globalFetch = vi.fn();
vi.stubGlobal("fetch", globalFetch);

import { GET, POST } from "@/app/(frontend)/api/invoice-statements/admin-digest/route";

const CONTACTS = [
  {
    contactId: "c1",
    contactName: "Acme Pty Ltd",
    emailAddress: "ap@acme.test",
    unpaid: [{ dueDate: "2026-04-10", amountDue: 1100 }],
    totalOutstanding: 2200,
    totalOverdue: 1100,
    unpaidCount: 2,
    overdueCount: 1,
  },
];

const CLIENTS = [
  {
    id: 5,
    name: "Acme",
    tradingName: "Acme Pty Ltd",
    monthlyRetainer: 1100,
    clientStartDate: "2025-01-15T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  process.env.GROWTH_TOOLS_URL = "https://growth-tools.test";
  process.env.INTERNAL_API_KEY = "internal-key";
  delete process.env.ADMIN_INVOICE_DIGEST_EMAIL;
  mockPayload.find.mockResolvedValue({ docs: CLIENTS });
  sendBrevoEmail.mockResolvedValue({ ok: true, messageId: "m1" });
  globalFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(CONTACTS),
    text: () => Promise.resolve(""),
  });
});

function cronRequest(auth?: string): NextRequest {
  return new NextRequest(
    "http://localhost/api/invoice-statements/admin-digest",
    { method: "GET", headers: auth ? { Authorization: auth } : {} },
  );
}

describe("GET /api/invoice-statements/admin-digest", () => {
  it("rejects a missing bearer token", async () => {
    const res = await GET(cronRequest());
    expect(res.status).toBe(401);
    expect(sendBrevoEmail).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token", async () => {
    const res = await GET(cronRequest("Bearer nope"));
    expect(res.status).toBe(401);
    expect(sendBrevoEmail).not.toHaveBeenCalled();
  });

  it("sends one digest email to the default recipient", async () => {
    const res = await GET(cronRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(true);
    expect(body.recipient).toBe("peter@optimisedigital.online");
    expect(body.clientCount).toBe(1);

    expect(sendBrevoEmail).toHaveBeenCalledTimes(1);
    const payload = sendBrevoEmail.mock.calls[0][0];
    expect(payload.to).toEqual([{ email: "peter@optimisedigital.online" }]);
    // Enriched from the matched CMS client.
    expect(payload.htmlContent).toContain("Acme");
    expect(payload.htmlContent).toContain("$1,100.00/mo");
    expect(payload.htmlContent).toContain("$2,200.00");
  });

  it("enriches a client whose CMS name is shorter than the Xero entity name", async () => {
    mockPayload.find.mockResolvedValue({
      docs: [
        {
          id: 9,
          name: "Berendsen",
          monthlyRetainer: 2400,
          clientStartDate: "2024-05-02T00:00:00.000Z",
        },
      ],
    });
    globalFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(""),
      json: () =>
        Promise.resolve([
          { ...CONTACTS[0], contactName: "Berendsen Fluid Power" },
        ]),
    });

    await GET(cronRequest("Bearer test-secret"));
    const html = sendBrevoEmail.mock.calls[0][0].htmlContent;
    expect(html).toContain("Berendsen");
    expect(html).toContain("$2,400.00/mo");
  });

  it("honours ADMIN_INVOICE_DIGEST_EMAIL", async () => {
    process.env.ADMIN_INVOICE_DIGEST_EMAIL = "owner@example.com";
    await GET(cronRequest("Bearer test-secret"));
    expect(sendBrevoEmail.mock.calls[0][0].to).toEqual([
      { email: "owner@example.com" },
    ]);
  });

  it("asks Growth Tools for every contact with at least one unpaid invoice", async () => {
    await GET(cronRequest("Bearer test-secret"));
    const url = String(globalFetch.mock.calls[0][0]);
    expect(url).toContain("/api/xero/contacts/with-outstanding");
    expect(url).toContain("minCount=1");
  });

  it("never writes to the invoice-statement-drafts collection", async () => {
    await GET(cronRequest("Bearer test-secret"));
    const collections = mockPayload.find.mock.calls.map((c) => c[0].collection);
    expect(collections).toEqual(["clients"]);
  });

  it("returns 502 when Growth Tools fails", async () => {
    globalFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("boom"),
    });
    const res = await GET(cronRequest("Bearer test-secret"));
    expect(res.status).toBe(502);
    expect(sendBrevoEmail).not.toHaveBeenCalled();
  });

  it("returns 502 when the Brevo send fails", async () => {
    sendBrevoEmail.mockResolvedValue({ ok: false, message: "bad key" });
    const res = await GET(cronRequest("Bearer test-secret"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.sent).toBe(false);
    expect(body.error).toBe("bad key");
  });
});

describe("POST /api/invoice-statements/admin-digest", () => {
  function postRequest(query = ""): NextRequest {
    return new NextRequest(
      `http://localhost/api/invoice-statements/admin-digest${query}`,
      { method: "POST" },
    );
  }

  it("rejects non-admin users", async () => {
    mockPayload.auth.mockResolvedValue({ user: { role: "staff" } });
    const res = await POST(postRequest());
    expect(res.status).toBe(403);
    expect(sendBrevoEmail).not.toHaveBeenCalled();
  });

  it("lets an admin send on demand", async () => {
    mockPayload.auth.mockResolvedValue({
      user: { role: "admin", email: "admin@example.com" },
    });
    const res = await POST(postRequest());
    expect(res.status).toBe(200);
    expect(sendBrevoEmail).toHaveBeenCalledTimes(1);
  });

  it("renders without sending in preview mode", async () => {
    mockPayload.auth.mockResolvedValue({
      user: { role: "admin", email: "admin@example.com" },
    });
    const res = await POST(postRequest("?preview=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preview).toBe(true);
    expect(body.html).toContain("Acme");
    expect(sendBrevoEmail).not.toHaveBeenCalled();
  });
});
