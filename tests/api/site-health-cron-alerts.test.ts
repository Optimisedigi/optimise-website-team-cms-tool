import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.GROWTH_TOOLS_URL = "https://growth.example";
  process.env.INTERNAL_API_KEY = "internal-key";
  process.env.CRON_SECRET = "cron-secret";
});

const mockPayload = {
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  logger: { error: vi.fn() },
};

vi.mock("payload", () => ({ getPayload: vi.fn(() => Promise.resolve(mockPayload)) }));
// The manual-run route defers its crawl with `after()`, which needs a request
// scope; run the callback inline instead.
const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => { afterCallbacks.push(fn); } };
});
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { GET as siteHealthCron } from "@/app/(frontend)/api/site-health/cron/route";
import { newCriticalIssues } from "@/lib/site-health/notify-regression";

const CLIENT = {
  id: 7,
  name: "Acme Ltd",
  seoAuto: {
    siteUrl: "https://acme.example",
    monthlyHealthEnabled: true,
    // Stored as an array of rows, not plain strings — the cron must unwrap.
    notificationEmails: [{ email: "a@acme.example" }, { email: "b@acme.example" }, { email: "" }],
  },
};

const RESULT = {
  healthScore: 61,
  reportDate: "2026-09-03",
  issues: [],
  comparison: {
    previousScore: 80,
    scoreChange: -19,
    newIssues: 2,
    fixedIssues: 0,
    newIssuesList: [
      { type: "broken-link", url: "/pricing", severity: "critical", message: "404" },
      { type: "thin-content", url: "/blog/x", severity: "notice", message: "short" },
    ],
    fixedIssuesList: [],
  },
};

function cronRequest(): NextRequest {
  return new NextRequest("https://cms.example/api/site-health/cron", {
    headers: { authorization: "Bearer cron-secret" },
  });
}

describe("site health cron", () => {
  beforeEach(() => {
    mockPayload.find.mockReset();
    mockPayload.create.mockReset();
    mockPayload.update.mockReset();

    mockPayload.find.mockImplementation(async ({ collection }: any) => {
      if (collection === "clients") return { docs: [CLIENT] };
      if (collection === "users") return { docs: [{ id: 1 }, { id: 2 }] };
      return { docs: [] };
    });
    mockPayload.create.mockImplementation(async ({ collection }: any) =>
      collection === "site-health-reports" ? { id: 99 } : { id: 1 },
    );
    mockPayload.update.mockResolvedValue({ id: 99 });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(RESULT), { status: 200, headers: { "content-type": "application/json" } })),
    );
  });

  it("asks Growth Tools to send the client email, with the name and unwrapped recipients", async () => {
    await siteHealthCron(cronRequest());

    const call = (globalThis.fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes("/api/site-health/run"));
    expect(call).toBeTruthy();
    const body = JSON.parse(call[1].body);
    expect(body.sendEmail).toBe(true);
    expect(body.clientName).toBe("Acme Ltd");
    expect(body.notificationEmails).toEqual(["a@acme.example", "b@acme.example"]);
  });

  it("stores the issue delta lists that came back on comparison", async () => {
    await siteHealthCron(cronRequest());

    const update = mockPayload.update.mock.calls.find((c: any[]) => c[0].collection === "site-health-reports");
    expect(update?.[0].data.comparison.newIssuesList).toHaveLength(2);
    expect(update?.[0].data.comparison.fixedIssuesList).toEqual([]);
  });

  it("notifies each admin exactly once about the new critical issue", async () => {
    await siteHealthCron(cronRequest());

    const notifications = mockPayload.create.mock.calls.filter((c: any[]) => c[0].collection === "notifications");
    expect(notifications).toHaveLength(2);
    expect(notifications[0][0].data.kind).toBe("site-health-regression");
    expect(notifications[0][0].data.title).toContain("1 new critical site issue");
    expect(notifications[0][0].data.url).toBe("/admin/collections/site-health-reports/99");
  });

  it("stays quiet when nothing critical is new", async () => {
    (globalThis.fetch as any).mockImplementation(
      async () =>
        new Response(JSON.stringify({ ...RESULT, comparison: { ...RESULT.comparison, newIssuesList: [{ type: "thin-content", url: "/x", severity: "notice" }] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await siteHealthCron(cronRequest());

    expect(mockPayload.create.mock.calls.filter((c: any[]) => c[0].collection === "notifications")).toHaveLength(0);
  });

  it("rejects an unauthenticated call before touching the database", async () => {
    const response = await siteHealthCron(new NextRequest("https://cms.example/api/site-health/cron"));
    expect(response.status).toBe(401);
  });
});

describe("newCriticalIssues", () => {
  it("keeps only critical entries and tolerates a missing delta", () => {
    expect(newCriticalIssues(RESULT.comparison)).toHaveLength(1);
    expect(newCriticalIssues(undefined)).toEqual([]);
    expect(newCriticalIssues({ newIssues: 3 })).toEqual([]);
  });
});

// The manual Run button must never mail the client — it relies on sendEmail
// defaulting off upstream, so assert the outgoing body rather than trust it.
describe("manual site health run", () => {
  beforeEach(() => {
    mockPayload.update.mockReset().mockResolvedValue({ id: 99 });
    (mockPayload as any).auth = vi.fn(async () => ({ user: { id: 1, role: "admin" } }));
    (mockPayload as any).findByID = vi.fn(async ({ collection }: any) =>
      collection === "site-health-reports"
        ? { id: 99, siteUrl: "https://acme.example", client: 7 }
        : CLIENT,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(RESULT), { status: 200, headers: { "content-type": "application/json" } })),
    );
  });

  it("falls back to the client's website and contact email when monitor fields are empty", async () => {
    mockPayload.find.mockImplementation(async ({ collection }: any) => {
      if (collection === "clients") {
        return {
          docs: [{
            id: 8,
            name: "Beta",
            websiteUrl: "www.beta.example",
            contactEmail: "hello@beta.example",
            seoAuto: { monthlyHealthEnabled: true },
          }],
        };
      }
      if (collection === "users") return { docs: [] };
      return { docs: [] };
    });

    await siteHealthCron(cronRequest());
    const call = (globalThis.fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes("/api/site-health/run"));
    const body = JSON.parse(call[1].body);
    expect(body.siteUrl).toBe("https://www.beta.example");
    expect(body.notificationEmails).toEqual(["hello@beta.example"]);
  });

  it("never asks Growth Tools to email the client", async () => {
    const { POST } = await import("@/app/(frontend)/api/site-health-reports/[id]/run/route");
    afterCallbacks.length = 0;
    await POST(new NextRequest("https://cms.example/api/site-health-reports/99/run", { method: "POST" }), {
      params: Promise.resolve({ id: "99" }),
    });
    // The crawl is deferred with after(); run it here so the request body exists.
    for (const callback of afterCallbacks) await callback();
    const calls = (globalThis.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes("/api/site-health/run"));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0][1].body)).not.toHaveProperty("sendEmail");
  });
});
