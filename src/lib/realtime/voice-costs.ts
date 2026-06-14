export type RealtimeVoiceModel = "gpt-realtime-mini" | "gpt-realtime-2";

export const REALTIME_VOICE_MODEL_RATES_USD_PER_HOUR: Record<RealtimeVoiceModel, number> = {
  "gpt-realtime-mini": 0.9,
  "gpt-realtime-2": 2.88,
};

// Latest checked USD → AUD spot rate for displaying OpenAI Realtime costs in AUD.
// Source checked 2026-06-14: exchangerates.org reported 1 USD = 1.419971 AUD on 2026-06-13.
export const USD_TO_AUD_EXCHANGE_RATE = 1.419971;

export function resolveRealtimeVoiceModel(value: unknown): RealtimeVoiceModel | null {
  return value === "gpt-realtime-mini" || value === "gpt-realtime-2" ? value : null;
}

export function estimateRealtimeVoiceCostUsd(
  model: RealtimeVoiceModel,
  durationSeconds: number,
): number {
  const safeSeconds = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  return (safeSeconds / 3600) * REALTIME_VOICE_MODEL_RATES_USD_PER_HOUR[model];
}

export function convertUsdToAud(usd: number): number {
  const safeUsd = Number.isFinite(usd) ? Math.max(0, usd) : 0;
  return safeUsd * USD_TO_AUD_EXCHANGE_RATE;
}

export function realtimeVoiceRateAudPerHour(model: RealtimeVoiceModel): number {
  return convertUsdToAud(REALTIME_VOICE_MODEL_RATES_USD_PER_HOUR[model]);
}

export function estimateRealtimeVoiceCostAud(
  model: RealtimeVoiceModel,
  durationSeconds: number,
): number {
  return convertUsdToAud(estimateRealtimeVoiceCostUsd(model, durationSeconds));
}
