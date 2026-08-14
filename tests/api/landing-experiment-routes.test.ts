import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAssignmentToken } from "@/lib/landing-api";

/**
 * Contract tests for the landing manifest and ingestion routes.
 *
 * These assert the security boundaries rather than the happy path only:
 * a missing signing secret must fail closed, an origin outside the property's
 * allowlist must be refused, and a replayed event_id must not double-count.
 */

const payloadMock = {
  find: vi.fn(),
  create: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => payloadMock),
}));

vi.mock("@/payload.config", () => ({ default: {} }));

import { GET as manifestGET } from "@/app/(frontend)/api/landing/v1/manifest/route";
import {
  POST as eventsPOST,
  OPTIONS as eventsOPTIONS,
} from "@/app/(frontend)/api/landing/v1/events/route";

const PROPERTY_KEY = "away-digital-teams-landing";
const ALLOWED_ORIGIN = "https://awaydigitalteams.com";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";

const experimentDoc = {
  experimentId: "landing-hero-v1",
  status: "running",
  allocationVersion: "3",
  variants: [
    { variantId: "a", weight: 50, contentProfileId: "default" },
    { variantId: "b", weight: 50, contentProfileId: "variant-b-copy" },
  ],
  contentProfiles: [
    {
      profileId: "variant-b-copy",
      fields: [{ key: "headline", value: "Hire developers in Vietnam" }],
    },
    {
      profileId: "default",
      fields: [
        { key: "headline", value: "Build your offshore team" },
        { key: "cta_url", value: "/contact/" },
        // Rejected by the key allowlist — must never reach the response.
        { key: "bad key!", value: "should be dropped" },
      ],
    },
  ],
};

function propertyDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    client: 42,
    propertyKey: PROPERTY_KEY,
    status: "active",
    allowedOrigins: [{ origin: ALLOWED_ORIGIN }],
    activeExperiment: experimentDoc,
    ...overrides,
  };
}

function manifestRequest(origin: string | null, propertyKey = PROPERTY_KEY) {
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  return new NextRequest(
    `http://localhost/api/landing/v1/manifest?property_key=${encodeURIComponent(propertyKey)}&route=/`,
    { method: "GET", headers }
  );
}

function eventsRequest(body: unknown, origin: string | null = ALLOWED_ORIGIN) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost/api/landing/v1/events", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function eventBatch(events: unknown[], token: string | null) {
  return {
    schema_version: 1,
    sent_at: new Date().toISOString(),
    property_key: PROPERTY_KEY,
    assignment_token: token,
    events,
  };
}

function sampleEvent(eventId: string, type = "cta_click") {
  return {
    event_id: eventId,
    type,
    timestamp: new Date().toISOString(),
    session_id: "session-abc",
    page_view_id: "pageview-abc",
    visitor_id: "visitor-abc",
    variant_id: "b",
    content_profile_id: "default",
    route: "/",
    referrer_class: "search",
    device_class: "mobile",
    attribution: { gclid: "test-gclid", ad_group_id: "12345", evil_field: "dropped" },
    properties: { cta_id: "hero-primary", position: 1 },
  };
}

describe("landing experiment routes", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("LANDING_TOKEN_SECRET", SECRET);
    payloadMock.find.mockReset();
    payloadMock.create.mockReset();
    payloadMock.find.mockResolvedValue({ docs: [propertyDoc()] });
    payloadMock.create.mockResolvedValue({ id: 1 });
  });

  describe("missing signing secret fails closed", () => {
    it("manifest returns 503 rather than minting an unsigned token", async () => {
      vi.stubEnv("LANDING_TOKEN_SECRET", "");
      const res = await manifestGET(manifestRequest(ALLOWED_ORIGIN));
      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toMatchObject({ error: expect.any(String) });
    });

    it("manifest returns 503 when the secret is too short to be safe", async () => {
      vi.stubEnv("LANDING_TOKEN_SECRET", "tooshort");
      const res = await manifestGET(manifestRequest(ALLOWED_ORIGIN));
      expect(res.status).toBe(503);
    });

    it("ingestion returns 503 and writes nothing", async () => {
      vi.stubEnv("LANDING_TOKEN_SECRET", "");
      const token = signAssignmentToken(
        {
          propertyKey: PROPERTY_KEY,
          experimentId: "landing-hero-v1",
          allocationVersion: "3",
          issuedAt: Date.now(),
        },
        SECRET
      );
      const res = await eventsPOST(eventsRequest(eventBatch([sampleEvent("evt-1")], token)));
      expect(res.status).toBe(503);
      expect(payloadMock.create).not.toHaveBeenCalled();
    });
  });

  describe("origin allowlist is the authorisation gate", () => {
    it("manifest rejects an origin outside the property allowlist", async () => {
      const res = await manifestGET(manifestRequest("https://attacker.example"));
      expect(res.status).toBe(403);
    });

    it("manifest rejects a request with no Origin header", async () => {
      const res = await manifestGET(manifestRequest(null));
      expect(res.status).toBe(403);
    });

    it("ingestion rejects a disallowed origin even with a valid token", async () => {
      const token = signAssignmentToken(
        {
          propertyKey: PROPERTY_KEY,
          experimentId: "landing-hero-v1",
          allocationVersion: "3",
          issuedAt: Date.now(),
        },
        SECRET
      );
      const res = await eventsPOST(
        eventsRequest(eventBatch([sampleEvent("evt-1")], token), "https://attacker.example")
      );
      expect(res.status).toBe(403);
      expect(payloadMock.create).not.toHaveBeenCalled();
    });

    it("serves every profile so the assigned variant can differ from the default", async () => {
      // Sending only the default profile would label visitors with a variant
      // while showing them identical copy, so the comparison would measure
      // nothing. Each variant must be able to resolve its own copy.
      const res = await manifestGET(manifestRequest(ALLOWED_ORIGIN));
      const body = await res.json();

      expect(body.experiment.variants).toEqual([
        { id: "a", weight: 50, content_profile_id: "default" },
        { id: "b", weight: 50, content_profile_id: "variant-b-copy" },
      ]);

      expect(body.content_profiles["default"].fields.headline).toBe("Build your offshore team");
      expect(body.content_profiles["variant-b-copy"].fields.headline).toBe(
        "Hire developers in Vietnam"
      );
    });

    it("manifest serves an allowed origin and echoes it back", async () => {
      const res = await manifestGET(manifestRequest(ALLOWED_ORIGIN));
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);

      const body = await res.json();
      expect(body.schema_version).toBe(1);
      expect(body.experiment.id).toBe("landing-hero-v1");
      expect(body.experiment.allocation_version).toBe("3");
      expect(body.experiment.variants).toHaveLength(2);
      expect(typeof body.assignment_token).toBe("string");
      // Disallowed content-field key must be filtered out.
      expect(body.content_profile.fields).toEqual({
        headline: "Build your offshore team",
        cta_url: "/contact/",
      });
    });
  });

  describe("CORS preflight", () => {
    function preflight(origin: string | null) {
      const headers: Record<string, string> = {};
      if (origin) headers.origin = origin;
      return new NextRequest("http://localhost/api/landing/v1/events", {
        method: "OPTIONS",
        headers,
      });
    }

    it("answers a preflight that carries no query string", async () => {
      // The browser sends no body and no query string here. Requiring a property
      // key meant returning no CORS headers, so every real POST was blocked
      // while sendBeacon still reported success and the events vanished.
      const res = await eventsOPTIONS(preflight(ALLOWED_ORIGIN));

      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
      expect(res.headers.get("access-control-allow-headers")).toContain("content-type");
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    });

    it("grants no CORS headers to an origin outside every property allowlist", async () => {
      payloadMock.find.mockResolvedValue({ docs: [] });
      const res = await eventsOPTIONS(preflight("https://attacker.example"));

      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("grants no CORS headers when there is no Origin header", async () => {
      const res = await eventsOPTIONS(preflight(null));
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    });
  });

  describe("signed batch ingestion", () => {
    function validToken() {
      return signAssignmentToken(
        {
          propertyKey: PROPERTY_KEY,
          experimentId: "landing-hero-v1",
          allocationVersion: "3",
          issuedAt: Date.now(),
        },
        SECRET
      );
    }

    it("writes a two-event batch once each, scoped to the server-owned tenant", async () => {
      const res = await eventsPOST(
        eventsRequest(
          eventBatch([sampleEvent("evt-1"), sampleEvent("evt-2", "form_submit")], validToken())
        )
      );

      expect(res.status).toBe(202);
      await expect(res.json()).resolves.toEqual({ accepted: 2, rejected: 0 });
      expect(payloadMock.create).toHaveBeenCalledTimes(2);

      const first = payloadMock.create.mock.calls[0][0];
      expect(first.collection).toBe("landing-events");
      // Tenant comes from the property record, never the request body.
      expect(first.data.property).toBe(7);
      expect(first.data.client).toBe(42);
      // Experiment context comes from the signed token.
      expect(first.data.experimentId).toBe("landing-hero-v1");
      expect(first.data.allocationVersion).toBe("3");
      // Attribution is allowlisted; unknown keys are dropped.
      expect(first.data.attribution).toEqual({ gclid: "test-gclid", ad_group_id: "12345" });
      expect(first.data.properties).toEqual({ cta_id: "hero-primary", position: 1 });
    });

    it("counts a repeated event_id once — a retried batch writes a single row", async () => {
      const duplicateError = new Error("UNIQUE constraint failed: landing_events.event_id");
      payloadMock.create
        .mockResolvedValueOnce({ id: 1 })
        .mockRejectedValueOnce(duplicateError);

      const token = validToken();
      const first = await eventsPOST(
        eventsRequest(eventBatch([sampleEvent("evt-dup")], token))
      );
      expect(first.status).toBe(202);
      await expect(first.json()).resolves.toEqual({ accepted: 1, rejected: 0 });

      const replay = await eventsPOST(
        eventsRequest(eventBatch([sampleEvent("evt-dup")], token))
      );
      expect(replay.status).toBe(202);
      // Idempotent: reported accepted, but the duplicate did not create a row.
      await expect(replay.json()).resolves.toEqual({ accepted: 1, rejected: 0 });

      expect(payloadMock.create).toHaveBeenCalledTimes(2);
      const written = payloadMock.create.mock.calls.map((call) => call[0].data.eventId);
      expect(written).toEqual(["evt-dup", "evt-dup"]);

      // The second write was refused by the unique index, so only one row exists.
      // Both attempts still report accepted, which is what makes retries safe.
      await expect(payloadMock.create.mock.results[1].value).rejects.toThrow(
        /unique constraint/i
      );
    });

    it("takes experiment context from the server, whatever the request claims", async () => {
      // The token no longer decides this. A caller cannot name an experiment or
      // an allocation version at all: both are read from the property's own
      // experiment record, so they can be neither forged nor go stale.
      const forged = signAssignmentToken(
        {
          propertyKey: PROPERTY_KEY,
          experimentId: "attacker-chosen-experiment",
          allocationVersion: "999",
          issuedAt: Date.now(),
        },
        "an-entirely-different-secret-that-is-long-enough"
      );

      const res = await eventsPOST(eventsRequest(eventBatch([sampleEvent("evt-forged")], forged)));
      expect(res.status).toBe(202);

      const written = payloadMock.create.mock.calls[0][0].data;
      expect(written.experimentId).toBe("landing-hero-v1");
      expect(written.allocationVersion).toBe("3");
      expect(written.variantId).toBe("b");
    });

    it("drops a variant the experiment does not configure", async () => {
      // Assignment happens in the browser, so the variant has to be accepted
      // from the request. Anything outside the configured list is discarded
      // rather than appearing in the dashboard as an arm nobody ran.
      const event = { ...sampleEvent("evt-phantom"), variant_id: "z-phantom" };
      const res = await eventsPOST(eventsRequest(eventBatch([event], validToken())));
      expect(res.status).toBe(202);

      const written = payloadMock.create.mock.calls[0][0].data;
      expect(written.experimentId).toBe("landing-hero-v1");
      expect(written.variantId).toBeUndefined();
    });

    it("rejects a batch larger than the contract limit", async () => {
      const events = Array.from({ length: 41 }, (_, i) => sampleEvent(`evt-${i}`));
      const res = await eventsPOST(eventsRequest(eventBatch(events, validToken())));
      expect(res.status).toBe(413);
      expect(payloadMock.create).not.toHaveBeenCalled();
    });

    it("rejects malformed events without aborting the valid ones", async () => {
      const res = await eventsPOST(
        eventsRequest(
          eventBatch(
            [
              sampleEvent("evt-ok"),
              { event_id: "evt-bad", type: "not_a_real_event", timestamp: new Date().toISOString() },
              { event_id: "evt-stale", type: "page_view", timestamp: "1999-01-01T00:00:00.000Z" },
            ],
            validToken()
          )
        )
      );

      expect(res.status).toBe(202);
      await expect(res.json()).resolves.toEqual({ accepted: 1, rejected: 2 });
      expect(payloadMock.create).toHaveBeenCalledTimes(1);
    });
  });
});
