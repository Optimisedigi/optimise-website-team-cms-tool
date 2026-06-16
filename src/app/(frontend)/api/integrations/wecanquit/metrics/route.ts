import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  parseWecanquitMetricsPayload,
  verifyWecanquitMetricsSignature,
} from "@/lib/wecanquit-metrics-ingest";

function snapshotDate(asOf: string): string {
  return new Date(asOf).toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-wcq-signature");
  const timestamp = req.headers.get("x-wcq-timestamp");

  const verification = verifyWecanquitMetricsSignature({
    rawBody,
    signature,
    timestamp,
    secret: process.env.WCQ_METRICS_INGEST_SECRET,
  });

  if (!verification.ok) {
    console.warn(`[wecanquit-metrics] rejected request: ${verification.error}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let metrics;
  try {
    metrics = parseWecanquitMetricsPayload(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid metrics payload" }, { status: 400 });
  }

  const allowedSlug = process.env.WCQ_METRICS_CLIENT_SLUG || "we-can-quit";
  if (metrics.clientSlug !== allowedSlug) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  try {
    const payload = await getPayload({ config });
    const clientResult = await payload.find({
      collection: "clients" as any,
      where: { slug: { equals: metrics.clientSlug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const client = clientResult.docs[0];

    if (!client?.id) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    await payload.update({
      collection: "clients" as any,
      id: client.id,
      data: {
        wcqTrackingStartDate: metrics.trackingStartDate,
        wcqAssessmentsCompleted: metrics.assessmentsCompleted,
        wcqPrescriptionCount: metrics.prescriptions,
        wcqAssessmentTarget: metrics.assessmentTarget,
        wcqPrescriptionTarget: metrics.prescriptionTarget,
        wcqMetricsLastSyncedAt: metrics.asOf,
      },
      overrideAccess: true,
    });

    const date = snapshotDate(metrics.asOf);
    const existingSnapshot = await payload.find({
      collection: "client-metric-snapshots" as any,
      where: {
        and: [
          { client: { equals: client.id } },
          { source: { equals: metrics.source } },
          { date: { equals: date } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const snapshotData = {
      client: client.id,
      source: metrics.source,
      date,
      trackingStartDate: metrics.trackingStartDate,
      assessmentsCompleted: metrics.assessmentsCompleted,
      prescriptions: metrics.prescriptions,
      assessmentTarget: metrics.assessmentTarget,
      prescriptionTarget: metrics.prescriptionTarget,
      asOf: metrics.asOf,
    };

    if (existingSnapshot.docs[0]?.id) {
      await payload.update({
        collection: "client-metric-snapshots" as any,
        id: existingSnapshot.docs[0].id,
        data: snapshotData,
        overrideAccess: true,
      });
    } else {
      await payload.create({
        collection: "client-metric-snapshots" as any,
        data: snapshotData,
        overrideAccess: true,
      });
    }

    return NextResponse.json({
      ok: true,
      clientSlug: metrics.clientSlug,
      assessmentsCompleted: metrics.assessmentsCompleted,
      prescriptions: metrics.prescriptions,
      asOf: metrics.asOf,
    });
  } catch (error) {
    console.error("[wecanquit-metrics] ingest failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
