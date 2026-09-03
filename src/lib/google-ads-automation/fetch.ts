/**
 * Transport for Growth Tools `GET /api/google-ads/change-events`.
 *
 * The Google Ads API only serves change_event for the trailing ~30 days, so
 * the caller (the daily cron) persists everything this returns.
 *
 * Google's REST transport is inconsistent about casing — the same payload can
 * arrive as `changeEvent.changeDateTime` or `change_event.change_date_time`
 * (see getAuditNegativeChangeHistory in Growth Tools, which handles both) — so
 * every read here goes through a casing-tolerant accessor.
 */

const FETCH_TIMEOUT_MS = 60_000;

export interface NormalisedChangeEvent {
  /** change_event.resource_name — stable per event, used as the dedupe key. */
  resourceName: string;
  changeDateTime: string;
  changeResourceType: string;
  resourceChangeOperation: string;
  clientType: string;
  userEmail: string;
  changeResourceName: string;
  campaignId: string;
  campaignName: string;
  changedFields: string[];
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}

function pick(source: unknown, ...keys: string[]): unknown {
  if (source === null || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** `changed_fields` arrives as a FieldMask: either "a,b,c" or { paths: [...] }. */
function fieldMask(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  const paths = pick(value, "paths");
  if (Array.isArray(paths)) return paths.filter((v): v is string => typeof v === "string");
  return [];
}

/** "customers/123/campaigns/456" → "456". */
function campaignIdFromResourceName(resourceName: string): string {
  const match = /\/campaigns\/(\d+)/.exec(resourceName);
  return match ? match[1] : "";
}

export function normaliseChangeEvent(raw: unknown): NormalisedChangeEvent | null {
  const event = record(pick(raw, "changeEvent", "change_event")) ?? record(raw);
  if (!event) return null;

  const resourceName = str(pick(event, "resourceName", "resource_name"));
  if (!resourceName) return null;

  const oldValues = record(pick(event, "oldResource", "old_resource"));
  const newValues = record(pick(event, "newResource", "new_resource"));

  const campaignResource = str(pick(event, "campaign"));
  const changeResourceName = str(pick(event, "changeResourceName", "change_resource_name"));

  const campaignName =
    str(pick(record(pick(newValues, "campaign")), "name")) ||
    str(pick(record(pick(oldValues, "campaign")), "name"));

  return {
    resourceName,
    changeDateTime: str(pick(event, "changeDateTime", "change_date_time")),
    changeResourceType: str(pick(event, "changeResourceType", "change_resource_type")),
    resourceChangeOperation: str(pick(event, "resourceChangeOperation", "resource_change_operation")),
    clientType: str(pick(event, "clientType", "client_type")),
    userEmail: str(pick(event, "userEmail", "user_email")),
    changeResourceName,
    campaignId:
      campaignIdFromResourceName(campaignResource) ||
      campaignIdFromResourceName(changeResourceName) ||
      campaignIdFromResourceName(resourceName),
    campaignName,
    changedFields: fieldMask(pick(event, "changedFields", "changed_fields")),
    oldValues,
    newValues,
  };
}

export interface FetchChangeEventsResult {
  ok: boolean;
  events: NormalisedChangeEvent[];
  error?: string;
}

/**
 * Read one account's change events for an inclusive day window
 * (`YYYY-MM-DD`). Never throws — failures come back as `{ ok: false }` so one
 * client's outage cannot abort the cron.
 */
export async function fetchChangeEvents(
  customerId: string,
  startDay: string,
  endDay: string,
  deps: { fetchImpl?: typeof fetch; baseUrl?: string; apiKey?: string } = {},
): Promise<FetchChangeEventsResult> {
  const baseUrl = (deps.baseUrl ?? process.env.GROWTH_TOOLS_URL ?? "").replace(/\/$/, "");
  const apiKey = deps.apiKey ?? process.env.INTERNAL_API_KEY ?? "";
  if (!baseUrl || !apiKey) {
    return { ok: false, events: [], error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY is not configured" };
  }

  const params = new URLSearchParams({ customerId, startDay, endDay });
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${baseUrl}/api/google-ads/change-events?${params}`, {
      headers: { "x-internal-key": apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, events: [], error: `Growth Tools ${response.status}: ${text.slice(0, 300)}` };
    }
    const json = (await response.json()) as { events?: unknown; error?: string };
    if (typeof json?.error === "string" && json.error) {
      return { ok: false, events: [], error: json.error };
    }
    const rows = Array.isArray(json?.events) ? json.events : [];
    const events: NormalisedChangeEvent[] = [];
    for (const row of rows) {
      const normalised = normaliseChangeEvent(row);
      if (normalised) events.push(normalised);
    }
    return { ok: true, events };
  } catch (err) {
    return { ok: false, events: [], error: `Change event fetch failed: ${(err as Error).message}` };
  }
}
