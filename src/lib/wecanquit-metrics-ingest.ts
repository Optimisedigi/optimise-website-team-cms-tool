import crypto from "crypto";
import { z } from "zod";

export const WCQ_METRICS_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const wecanquitMetricsPayloadSchema = z
  .object({
    clientSlug: z.string().min(1).max(120),
    trackingStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    asOf: z.string().datetime(),
    assessmentsCompleted: z.number().int().min(0),
    prescriptions: z.number().int().min(0),
    assessmentTarget: z.number().int().min(0).default(500),
    prescriptionTarget: z.number().int().min(0).default(500),
    source: z.literal("website-we-can-quit"),
  })
  .strict();

export type WecanquitMetricsPayload = z.infer<typeof wecanquitMetricsPayloadSchema>;

export function timingSafeEqualString(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function signWecanquitMetricsPayload(rawBody: string, timestamp: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

export function verifyWecanquitMetricsSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string | undefined;
  now?: number;
}): { ok: true } | { ok: false; error: string } {
  if (!input.secret) return { ok: false, error: "Metrics ingest secret is not configured" };
  if (!input.timestamp || !input.signature) return { ok: false, error: "Missing signature headers" };

  const timestampMs = Number.parseInt(input.timestamp, 10);
  if (!Number.isFinite(timestampMs)) return { ok: false, error: "Invalid timestamp" };

  const now = input.now ?? Date.now();
  if (Math.abs(now - timestampMs) > WCQ_METRICS_MAX_CLOCK_SKEW_MS) {
    return { ok: false, error: "Stale signature timestamp" };
  }

  const expected = signWecanquitMetricsPayload(input.rawBody, input.timestamp, input.secret);
  if (!timingSafeEqualString(input.signature, expected)) {
    return { ok: false, error: "Invalid signature" };
  }

  return { ok: true };
}

export function parseWecanquitMetricsPayload(rawBody: string): WecanquitMetricsPayload {
  const parsed = JSON.parse(rawBody) as unknown;
  return wecanquitMetricsPayloadSchema.parse(parsed);
}
