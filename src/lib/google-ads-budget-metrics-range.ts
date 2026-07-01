export type BudgetMetricsRange = "THIS_MONTH" | "LAST_MONTH" | "LAST_30_DAYS" | "LAST_60_DAYS" | "LAST_180_DAYS";

export type GrowthToolsBudgetMetricsRequest = {
  dateRange: string;
};

function formatGoogleAdsDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseBudgetMetricsRange(value: string | null): BudgetMetricsRange {
  return value === "LAST_MONTH" || value === "LAST_30_DAYS" || value === "LAST_60_DAYS" || value === "LAST_180_DAYS"
    ? value
    : "THIS_MONTH";
}

export function getLast180DaysRequest(now = new Date()): GrowthToolsBudgetMetricsRequest {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 179);

  // Growth Tools accepts explicit custom ranges as a single `dateRange`
  // string (`YYYY-MM-DD,YYYY-MM-DD`). Sending `LAST_30_DAYS` with separate
  // `startDate`/`endDate` leaves the request on the preset window, which made
  // the 180-day tab show the wrong numbers.
  return {
    dateRange: `${formatGoogleAdsDate(start)},${formatGoogleAdsDate(end)}`,
  };
}

export function getGrowthToolsMetricsRequest(range: BudgetMetricsRange): GrowthToolsBudgetMetricsRequest {
  return range === "LAST_180_DAYS" ? getLast180DaysRequest() : { dateRange: range };
}
