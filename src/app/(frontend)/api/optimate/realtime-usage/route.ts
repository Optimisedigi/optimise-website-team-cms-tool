import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import {
  REALTIME_VOICE_MODEL_RATES_USD_PER_HOUR,
  USD_TO_AUD_EXCHANGE_RATE,
  convertUsdToAud,
  estimateRealtimeVoiceCostAud,
  estimateRealtimeVoiceCostUsd,
  realtimeVoiceRateAudPerHour,
  resolveRealtimeVoiceModel,
  type RealtimeVoiceModel,
} from "@/lib/realtime/voice-costs";

export const runtime = "nodejs";

const MAX_REASONABLE_CALL_SECONDS = 6 * 60 * 60;

type VoiceAgent = "google-ads" | "email" | "invoice";

interface UsageSummaryRow {
  model: RealtimeVoiceModel;
  calls: number;
  durationSeconds: number;
  estimatedCostUsd: number;
  estimatedCostAud: number;
  rateUsdPerHour: number;
  rateAudPerHour: number;
}

function resolveVoiceAgent(value: unknown): VoiceAgent {
  return value === "email" || value === "invoice" ? value : "google-ads";
}

function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function readNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    const model = resolveRealtimeVoiceModel(body?.model);
    const durationSecondsRaw = readNumber(body?.durationSeconds);
    const startedAt = typeof body?.startedAt === "string" ? body.startedAt : "";
    const endedAt = typeof body?.endedAt === "string" ? body.endedAt : "";

    if (!sessionId) return NextResponse.json({ ok: false, error: "sessionId is required" }, { status: 400 });
    if (!model) return NextResponse.json({ ok: false, error: "Unsupported realtime model" }, { status: 400 });
    if (durationSecondsRaw === null) {
      return NextResponse.json({ ok: false, error: "durationSeconds is required" }, { status: 400 });
    }

    const durationSeconds = Math.min(
      MAX_REASONABLE_CALL_SECONDS,
      Math.max(0, Math.round(durationSecondsRaw)),
    );
    if (durationSeconds < 1) {
      return NextResponse.json({ ok: true, skipped: true, reason: "duration too short" });
    }

    const started = Number.isNaN(Date.parse(startedAt))
      ? new Date(Date.now() - durationSeconds * 1000).toISOString()
      : new Date(startedAt).toISOString();
    const ended = Number.isNaN(Date.parse(endedAt)) ? new Date().toISOString() : new Date(endedAt).toISOString();
    const estimatedCostUsd = estimateRealtimeVoiceCostUsd(model, durationSeconds);
    const estimatedCostAud = estimateRealtimeVoiceCostAud(model, durationSeconds);

    const data = {
      sessionId,
      agent: resolveVoiceAgent(body?.agent),
      model,
      rateUsdPerHour: REALTIME_VOICE_MODEL_RATES_USD_PER_HOUR[model],
      durationSeconds,
      estimatedCostUsd,
      startedAt: started,
      endedAt: ended,
      user: user.id,
      metadata: {
        mode: body?.mode,
        auditId: body?.auditId,
        customerId: body?.customerId,
        businessName: body?.businessName,
        selectedAccountRefs: body?.selectedAccountRefs,
      },
    };

    try {
      await payload.create({
        collection: "realtime-voice-usage" as never,
        data: data as never,
        overrideAccess: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/unique|duplicate/i.test(message)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      throw err;
    }

    return NextResponse.json({
      ok: true,
      durationSeconds,
      estimatedCostUsd,
      estimatedCostAud,
      exchangeRate: { from: "USD", to: "AUD", rate: USD_TO_AUD_EXCHANGE_RATE },
    });
  } catch (err) {
    console.error("[realtime-usage] record error:", err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message || "Failed to record realtime usage" },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await payload.find({
      collection: "realtime-voice-usage" as never,
      where: { startedAt: { greater_than_equal: monthStartIso() } } as never,
      limit: 1000,
      sort: "-startedAt",
      depth: 0,
      overrideAccess: true,
    });

    const summary = new Map<RealtimeVoiceModel, UsageSummaryRow>();
    for (const model of Object.keys(REALTIME_VOICE_MODEL_RATES_USD_PER_HOUR) as RealtimeVoiceModel[]) {
      summary.set(model, {
        model,
        calls: 0,
        durationSeconds: 0,
        estimatedCostUsd: 0,
        estimatedCostAud: 0,
        rateUsdPerHour: REALTIME_VOICE_MODEL_RATES_USD_PER_HOUR[model],
        rateAudPerHour: realtimeVoiceRateAudPerHour(model),
      });
    }

    for (const row of rows.docs as unknown as Array<{
      model?: unknown;
      durationSeconds?: unknown;
      estimatedCostUsd?: unknown;
    }>) {
      const model = resolveRealtimeVoiceModel(row.model);
      if (!model) continue;
      const existing = summary.get(model);
      if (!existing) continue;
      existing.calls += 1;
      existing.durationSeconds += readNumber(row.durationSeconds) ?? 0;
      existing.estimatedCostUsd += readNumber(row.estimatedCostUsd) ?? 0;
      existing.estimatedCostAud = convertUsdToAud(existing.estimatedCostUsd);
    }

    const byModel = Array.from(summary.values());
    return NextResponse.json({
      periodStart: monthStartIso(),
      calls: byModel.reduce((sum, row) => sum + row.calls, 0),
      durationSeconds: byModel.reduce((sum, row) => sum + row.durationSeconds, 0),
      estimatedCostUsd: byModel.reduce((sum, row) => sum + row.estimatedCostUsd, 0),
      estimatedCostAud: byModel.reduce((sum, row) => sum + row.estimatedCostAud, 0),
      exchangeRate: { from: "USD", to: "AUD", rate: USD_TO_AUD_EXCHANGE_RATE },
      byModel,
    });
  } catch (err) {
    console.error("[realtime-usage] summary error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to load realtime usage" },
      { status: 500 },
    );
  }
}
