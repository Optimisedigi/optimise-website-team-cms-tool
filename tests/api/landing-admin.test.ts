import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract tests for the internal landing-admin routes.
 *
 * Boundaries asserted here: no admin session → 401; no VERCEL_TOKEN → 503
 * fail-closed; a passed Vercel config check appends exactly one
 * https://{hostname} origin however many times it is re-checked; and the
 * client instructions carry the exact project-specific record values.
 */

const payloadMock = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  db: { drizzle: { run: vi.fn(async () => ({ rows: [] })) } },
};

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => payloadMock),
}));

vi.mock("@/payload.config", () => ({ default: {} }));

import { isValidHostname } from "@/lib/vercel-domains";
import { deriveDnsRecord, renderDomainInstructions } from "@/lib/landing-domain-instructions";
import { GET as overviewGET } from "@/app/(frontend)/api/landing-admin/overview/route";
import { POST as domainsPOST } from "@/app/(frontend)/api/landing-admin/domains/route";
import { POST as checkPOST } from "@/app/(frontend)/api/landing-admin/domains/[id]/check/route";
import { GET as instructionsGET } from "@/app/(frontend)/api/landing-admin/domains/[id]/instructions/route";

const ADMIN = { user: { id: 1, email: "admin@example.com" } };
const CNAME_VALUE = "9d3f975be5e2c6da.vercel-dns-016.com";

function request(url = "http://localhost/api/landing-admin/overview", init?: RequestInit) {
  return new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
}

function domainRequest(body: unknown) {
  return request("http://localhost/api/landing-admin/domains", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const realFetch = global.fetch;

function mockVercel(responses: Record<string, { status: number; body: unknown }>) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [fragment, response] of Object.entries(responses)) {
      if (url.includes(fragment)) {
        return new Response(JSON.stringify(response.body), { status: response.status });
      }
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
}

describe("hostname validation", () => {
  it.each([
    ["hire.awaydigitalteams.com", true],
    ["outsourcing.example.co", true],
    ["example.com", true],
    ["a.b", true],
    ["*.example.com", false],
    ["https://hire.example.com", false],
    ["hire.example.com/path", false],
    ["HIRE.EXAMPLE.COM", false],
    ["-bad.example.com", false],
    ["bad-.example.com", false],
    ["single-label", false],
    ["", false],
  ])("%s → %s", (hostname, expected) => {
    expect(isValidHostname(hostname as string)).toBe(expected);
  });

  it("rejects a hostname longer than 253 characters", () => {
    expect(isValidHostname(`${"a".repeat(250)}.example.com`)).toBe(false);
  });
});

describe("DNS record derivation", () => {
  it("uses the project-specific CNAME for a subdomain, never a generic value", () => {
    const record = deriveDnsRecord("hire.awaydigitalteams.com", CNAME_VALUE);
    expect(record).toEqual({ type: "CNAME", name: "hire", value: CNAME_VALUE });
  });

  it("refuses to invent a CNAME when Vercel returned none", () => {
    expect(deriveDnsRecord("hire.awaydigitalteams.com", null)).toBeNull();
  });

  it("falls back to the apex A record for a two-label domain", () => {
    expect(deriveDnsRecord("example.com", null)).toEqual({ type: "A", name: "@", value: "76.76.21.21" });
  });
});

describe("instructions rendering", () => {
  it("contains the exact record values and the trailing-dot note", () => {
    const text = renderDomainInstructions({
      hostname: "hire.awaydigitalteams.com",
      dnsRecordType: "CNAME",
      dnsRecordName: "hire",
      dnsRecordValue: CNAME_VALUE,
    });
    expect(text).toContain(CNAME_VALUE);
    expect(text).toContain("CNAME");
    expect(text).toContain("trailing dot");
    expect(text).toContain("Do not change your nameservers");
    expect(text).not.toContain("cname.vercel-dns.com");
  });

  it("includes the TXT verification row when present", () => {
    const text = renderDomainInstructions({
      hostname: "hire.awaydigitalteams.com",
      dnsRecordType: "CNAME",
      dnsRecordName: "hire",
      dnsRecordValue: CNAME_VALUE,
      verificationTxt: "vc-domain-verify=abc123",
    });
    expect(text).toContain("vc-domain-verify=abc123");
    expect(text).toContain("_vercel.awaydigitalteams.com");
  });
});

describe("landing-admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_TOKEN = "test-token";
    payloadMock.auth.mockResolvedValue(ADMIN);
  });

  afterEach(() => {
    delete process.env.VERCEL_TOKEN;
    global.fetch = realFetch;
  });

  it("every route refuses an unauthenticated caller with 401", async () => {
    payloadMock.auth.mockResolvedValue({ user: null });
    expect((await overviewGET(request())).status).toBe(401);
    expect((await domainsPOST(domainRequest({ propertyId: 1, hostname: "a.b.c" }))).status).toBe(401);
    expect((await checkPOST(request("http://localhost", { method: "POST" }), ctx("1"))).status).toBe(401);
    expect((await instructionsGET(request(), ctx("1"))).status).toBe(401);
  });

  it("domain routes fail closed with 503 when VERCEL_TOKEN is missing", async () => {
    delete process.env.VERCEL_TOKEN;
    expect((await domainsPOST(domainRequest({ propertyId: 1, hostname: "a.b.c" }))).status).toBe(503);
    payloadMock.findByID.mockResolvedValue({ id: 1, hostname: "a.b.c", vercelProjectId: "p" });
    expect((await checkPOST(request("http://localhost", { method: "POST" }), ctx("1"))).status).toBe(503);
  });

  it("registers a domain, stores the Vercel-provided record and returns instructions", async () => {
    mockVercel({
      "/v10/projects/": { status: 200, body: { verified: true, verification: [] } },
      "/v6/domains/": {
        status: 200,
        body: { misconfigured: true, configuredBy: null, recommendedCNAME: [CNAME_VALUE] },
      },
    });
    payloadMock.findByID.mockResolvedValue({ id: 5, name: "AU page" });
    payloadMock.find.mockResolvedValue({ docs: [] });
    payloadMock.create.mockResolvedValue({ id: 9, status: "pending-dns" });

    const res = await domainsPOST(domainRequest({ propertyId: 5, hostname: "hire.awaydigitalteams.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.domain.dnsRecordValue).toBe(CNAME_VALUE);
    expect(json.instructions).toContain(CNAME_VALUE);
    expect(payloadMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "landing-domains",
        data: expect.objectContaining({ hostname: "hire.awaydigitalteams.com", dnsRecordValue: CNAME_VALUE }),
      }),
    );
  });

  it("rejects an invalid hostname before any Vercel call", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const res = await domainsPOST(domainRequest({ propertyId: 5, hostname: "https://x.com" }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("check flips to live and appends the origin exactly once across repeats", async () => {
    mockVercel({
      "/v6/domains/": { status: 200, body: { misconfigured: false, configuredBy: "CNAME" } },
    });
    const property = { id: 5, allowedOrigins: [{ origin: "http://localhost:4321" }] };
    const domain = {
      id: 9,
      hostname: "hire.awaydigitalteams.com",
      vercelProjectId: "od-landing-page-adt",
      property: 5,
      status: "pending-dns",
      auditLog: "",
    };
    payloadMock.findByID.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === "landing-domains" ? domain : property,
    );
    payloadMock.update.mockResolvedValue({});

    const first = await checkPOST(request("http://localhost", { method: "POST" }), ctx("9"));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ status: "live", originAdded: true });
    expect(payloadMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "landing-properties",
        data: {
          allowedOrigins: [{ origin: "http://localhost:4321" }, { origin: "https://hire.awaydigitalteams.com" }],
        },
      }),
    );

    // Second check: origin already present → no property write, still live.
    property.allowedOrigins.push({ origin: "https://hire.awaydigitalteams.com" });
    payloadMock.update.mockClear();
    const second = await checkPOST(request("http://localhost", { method: "POST" }), ctx("9"));
    expect(await second.json()).toMatchObject({ status: "live", originAdded: false });
    const propertyWrites = payloadMock.update.mock.calls.filter(
      ([args]) => (args as { collection: string }).collection === "landing-properties",
    );
    expect(propertyWrites).toHaveLength(0);
  });

  it("serves cached instructions without touching Vercel", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    payloadMock.findByID.mockResolvedValue({
      id: 9,
      hostname: "hire.awaydigitalteams.com",
      dnsRecordType: "CNAME",
      dnsRecordName: "hire",
      dnsRecordValue: CNAME_VALUE,
      verificationTxt: "",
    });

    const res = await instructionsGET(request(), ctx("9"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toContain(CNAME_VALUE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("overview groups properties under clients with per-property stats and domains", async () => {
    payloadMock.find.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === "landing-properties") {
        return {
          docs: [
            {
              id: 5,
              name: "AU page",
              propertyKey: "away-key",
              status: "active",
              client: { id: 6, name: "Away Digital", slug: "away-digital" },
              activeExperiment: { experimentId: "landing-hero-v1", status: "running", primaryGoal: "booking_complete" },
              allowedOrigins: [{ origin: "https://hire.awaydigitalteams.com" }],
            },
          ],
        };
      }
      if (collection === "landing-domains") {
        return { docs: [{ id: 9, property: 5, hostname: "hire.awaydigitalteams.com", status: "live" }] };
      }
      return { docs: [] };
    });
    payloadMock.db.drizzle.run.mockResolvedValue({
      rows: [
        { property_id: 5, event_type: "page_view", sessions: 120 },
        { property_id: 5, event_type: "booking_complete", sessions: 7 },
      ],
    });

    const res = await overviewGET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.clients).toHaveLength(1);
    expect(json.clients[0]).toMatchObject({ slug: "away-digital", sessions30d: 120, conversions30d: 7 });
    expect(json.clients[0].properties[0]).toMatchObject({
      sessions30d: 120,
      conversions30d: 7,
      domains: [{ hostname: "hire.awaydigitalteams.com", status: "live" }],
    });
  });
});
