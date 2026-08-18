import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientIpFromRequest, isExcludedIp, signAssignmentToken } from "@/lib/landing-api";

/**
 * Internal-traffic exclusion at ingest.
 *
 * Two boundaries matter here. The matcher must only ever read the leftmost
 * x-forwarded-for entry, because everything after it is client-supplied. And it
 * must fail open — a missing or malformed header records the event, since
 * exclusion is a reporting convenience and dropping real traffic is the worse
 * failure.
 */

const payloadMock = {
  find: vi.fn(),
  create: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => payloadMock),
}));

vi.mock("@/payload.config", () => ({ default: {} }));

import { POST as eventsPOST } from "@/app/(frontend)/api/landing/v1/events/route";

const PROPERTY_KEY = "away-digital-teams-landing";
const ALLOWED_ORIGIN = "https://awaydigitalteams.com";
const SECRET = "landing-token-secret-that-is-long-enough-to-pass";
const OFFICE_IP = "203.0.113.7";

function req(forwardedFor: string | null) {
  const headers: Record<string, string> = {};
  if (forwardedFor !== null) headers["x-forwarded-for"] = forwardedFor;
  return new NextRequest("http://localhost/api/landing/v1/events", { method: "POST", headers });
}

describe("clientIpFromRequest", () => {
  it("reads only the leftmost entry — later ones are client-controlled", () => {
    expect(clientIpFromRequest(req("203.0.113.7, 70.41.3.18, 150.172.238.178"))).toBe(OFFICE_IP);
  });

  it("returns null when the header is absent or unparseable", () => {
    expect(clientIpFromRequest(req(null))).toBeNull();
    expect(clientIpFromRequest(req(""))).toBeNull();
    expect(clientIpFromRequest(req("not-an-ip"))).toBeNull();
    expect(clientIpFromRequest(req("a".repeat(200)))).toBeNull();
  });

  it("strips an appended port for both families", () => {
    expect(clientIpFromRequest(req("203.0.113.7:41234"))).toBe(OFFICE_IP);
    expect(clientIpFromRequest(req("[2001:db8::1]:443"))).toBe("2001:db8::1");
    expect(clientIpFromRequest(req("2001:db8::1"))).toBe("2001:db8::1");
  });
});

describe("isExcludedIp", () => {
  it("matches an exact address", () => {
    expect(isExcludedIp(OFFICE_IP, [OFFICE_IP])).toBe(true);
    expect(isExcludedIp("203.0.113.8", [OFFICE_IP])).toBe(false);
  });

  it("matches inside a CIDR range and not outside it", () => {
    expect(isExcludedIp("203.0.113.99", ["203.0.113.0/24"])).toBe(true);
    expect(isExcludedIp("203.0.114.1", ["203.0.113.0/24"])).toBe(false);
    expect(isExcludedIp("2001:db8::5", ["2001:db8::/32"])).toBe(true);
    expect(isExcludedIp("2001:dba::5", ["2001:db8::/32"])).toBe(false);
  });

  it("does not cross families", () => {
    expect(isExcludedIp(OFFICE_IP, ["2001:db8::/32"])).toBe(false);
  });

  it("fails open on a missing IP, a bad IP, or an unusable list", () => {
    expect(isExcludedIp(null, [OFFICE_IP])).toBe(false);
    expect(isExcludedIp("not-an-ip", [OFFICE_IP])).toBe(false);
    expect(isExcludedIp(OFFICE_IP, [])).toBe(false);
    expect(isExcludedIp(OFFICE_IP, ["garbage", "203.0.113.0/999", "10.0.0.0/"])).toBe(false);
  });

  it("ignores a malformed entry without losing the valid ones beside it", () => {
    expect(isExcludedIp(OFFICE_IP, ["garbage", "203.0.113.0/24"])).toBe(true);
  });
});

describe("events route drops excluded traffic before writing", () => {
  function propertyDoc(excludedIps: { ip: string }[]) {
    return {
      id: 7,
      client: 42,
      propertyKey: PROPERTY_KEY,
      status: "active",
      allowedOrigins: [{ origin: ALLOWED_ORIGIN }],
      excludedIps,
      activeExperiment: null,
    };
  }

  function batchRequest(forwardedFor: string | null) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      origin: ALLOWED_ORIGIN,
    };
    if (forwardedFor !== null) headers["x-forwarded-for"] = forwardedFor;

    return new NextRequest("http://localhost/api/landing/v1/events", {
      method: "POST",
      headers,
      body: JSON.stringify({
        schema_version: 1,
        sent_at: new Date().toISOString(),
        property_key: PROPERTY_KEY,
        assignment_token: signAssignmentToken(
          {
            propertyKey: PROPERTY_KEY,
            experimentId: "landing-hero-v1",
            allocationVersion: "3",
            issuedAt: Date.now(),
          },
          SECRET
        ),
        events: [
          {
            event_id: "evt-1",
            type: "page_view",
            timestamp: new Date().toISOString(),
            session_id: "session-abc",
            page_view_id: "pageview-abc",
          },
        ],
      }),
    });
  }

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("LANDING_TOKEN_SECRET", SECRET);
    payloadMock.find.mockReset();
    payloadMock.create.mockReset();
    payloadMock.create.mockResolvedValue({ id: 1 });
  });

  it("writes nothing for an excluded IP and reports it as excluded, not rejected", async () => {
    payloadMock.find.mockResolvedValue({ docs: [propertyDoc([{ ip: "203.0.113.0/24" }])] });

    const res = await eventsPOST(batchRequest("203.0.113.7, 70.41.3.18"));

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({ accepted: 0, rejected: 0, excluded: 1 });
    expect(payloadMock.create).not.toHaveBeenCalled();
  });

  it("still records an event when the IP is outside the list", async () => {
    payloadMock.find.mockResolvedValue({ docs: [propertyDoc([{ ip: "203.0.113.0/24" }])] });

    const res = await eventsPOST(batchRequest("198.51.100.4"));

    await expect(res.json()).resolves.toEqual({ accepted: 1, rejected: 0, excluded: 0 });
    expect(payloadMock.create).toHaveBeenCalledTimes(1);
  });

  it("fails open when the forwarded header is missing", async () => {
    payloadMock.find.mockResolvedValue({ docs: [propertyDoc([{ ip: "203.0.113.0/24" }])] });

    const res = await eventsPOST(batchRequest(null));

    await expect(res.json()).resolves.toEqual({ accepted: 1, rejected: 0, excluded: 0 });
    expect(payloadMock.create).toHaveBeenCalledTimes(1);
  });

  it("cannot be spoofed by a client appending its own forwarded entry", async () => {
    // The excluded address appears only in a later, client-supplied position.
    payloadMock.find.mockResolvedValue({ docs: [propertyDoc([{ ip: OFFICE_IP }])] });

    const res = await eventsPOST(batchRequest("198.51.100.4, 203.0.113.7"));

    await expect(res.json()).resolves.toEqual({ accepted: 1, rejected: 0, excluded: 0 });
    expect(payloadMock.create).toHaveBeenCalledTimes(1);
  });

  it("never writes the IP into the event row", async () => {
    payloadMock.find.mockResolvedValue({ docs: [propertyDoc([])] });

    await eventsPOST(batchRequest("198.51.100.4"));

    const written = JSON.stringify(payloadMock.create.mock.calls[0][0].data);
    expect(written).not.toContain("198.51.100.4");
  });
});
