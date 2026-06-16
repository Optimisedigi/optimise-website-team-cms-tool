import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseWecanquitMetricsPayload,
  signWecanquitMetricsPayload,
  verifyWecanquitMetricsSignature,
} from "@/lib/wecanquit-metrics-ingest";

const payloadMock = {
  find: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => payloadMock),
}));

vi.mock("@/payload.config", () => ({ default: {} }));

import { POST } from "@/app/(frontend)/api/integrations/wecanquit/metrics/route";

const validPayload = {
  clientSlug: "we-can-quit",
  trackingStartDate: "2026-05-01",
  asOf: "2026-06-16T00:00:00.000Z",
  assessmentsCompleted: 12,
  prescriptions: 9,
  assessmentTarget: 500,
  prescriptionTarget: 500,
  source: "website-we-can-quit",
} as const;

function signedRequest(body: unknown, secret = "ingest-secret", timestamp = Date.now().toString()) {
  const rawBody = JSON.stringify(body);
  return new NextRequest("http://localhost/api/integrations/wecanquit/metrics", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wcq-timestamp": timestamp,
      "x-wcq-signature": signWecanquitMetricsPayload(rawBody, timestamp, secret),
    },
    body: rawBody,
  });
}

describe("WeCanQuit metrics ingest", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("WCQ_METRICS_INGEST_SECRET", "ingest-secret");
    vi.stubEnv("WCQ_METRICS_CLIENT_SLUG", "we-can-quit");
    payloadMock.find.mockReset();
    payloadMock.update.mockReset();
    payloadMock.create.mockReset();
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 123, slug: "we-can-quit" }] })
      .mockResolvedValueOnce({ docs: [] });
    payloadMock.update.mockResolvedValue({});
    payloadMock.create.mockResolvedValue({ id: 456 });
  });

  it("verifies timestamp-bound HMAC signatures", () => {
    const rawBody = JSON.stringify(validPayload);
    const timestamp = "1771200000000";
    const signature = signWecanquitMetricsPayload(rawBody, timestamp, "secret");

    expect(
      verifyWecanquitMetricsSignature({
        rawBody,
        timestamp,
        signature,
        secret: "secret",
        now: 1771200000000,
      })
    ).toEqual({ ok: true });
    expect(
      verifyWecanquitMetricsSignature({
        rawBody,
        timestamp,
        signature: "sha256=bad",
        secret: "secret",
        now: 1771200000000,
      }).ok
    ).toBe(false);
  });

  it("rejects stale timestamps", () => {
    const rawBody = JSON.stringify(validPayload);
    const timestamp = "1771200000000";
    const signature = signWecanquitMetricsPayload(rawBody, timestamp, "secret");

    expect(
      verifyWecanquitMetricsSignature({
        rawBody,
        timestamp,
        signature,
        secret: "secret",
        now: 1771200600001,
      })
    ).toEqual({ ok: false, error: "Stale signature timestamp" });
  });

  it("rejects sensitive or unexpected payload keys", () => {
    expect(() => parseWecanquitMetricsPayload(JSON.stringify({ ...validPayload, patientEmail: "x@y.test" }))).toThrow();
  });

  it("updates the client summary and creates a daily aggregate snapshot", async () => {
    const res = await POST(signedRequest(validPayload));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      clientSlug: "we-can-quit",
      assessmentsCompleted: 12,
      prescriptions: 9,
      asOf: "2026-06-16T00:00:00.000Z",
    });
    expect(payloadMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "clients",
        id: 123,
        data: expect.objectContaining({
          wcqAssessmentsCompleted: 12,
          wcqPrescriptionCount: 9,
          wcqMetricsLastSyncedAt: "2026-06-16T00:00:00.000Z",
        }),
      })
    );
    expect(payloadMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "client-metric-snapshots",
        data: expect.objectContaining({
          client: 123,
          date: "2026-06-16",
          assessmentsCompleted: 12,
          prescriptions: 9,
        }),
      })
    );
  });

  it("upserts an existing daily snapshot", async () => {
    payloadMock.find
      .mockReset()
      .mockResolvedValueOnce({ docs: [{ id: 123, slug: "we-can-quit" }] })
      .mockResolvedValueOnce({ docs: [{ id: 789 }] });

    const res = await POST(signedRequest(validPayload));

    expect(res.status).toBe(200);
    expect(payloadMock.create).not.toHaveBeenCalled();
    expect(payloadMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "client-metric-snapshots", id: 789 })
    );
  });

  it("keeps the client summary update when snapshot history fails", async () => {
    payloadMock.create.mockRejectedValueOnce(new Error("snapshot table unavailable"));

    const res = await POST(signedRequest(validPayload));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(payloadMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "clients",
        id: 123,
        data: expect.objectContaining({ wcqAssessmentsCompleted: 12 }),
      })
    );
  });

  it("rejects missing signatures before touching Payload", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/integrations/wecanquit/metrics", {
        method: "POST",
        body: JSON.stringify(validPayload),
      })
    );

    expect(res.status).toBe(401);
    expect(payloadMock.find).not.toHaveBeenCalled();
  });
});
