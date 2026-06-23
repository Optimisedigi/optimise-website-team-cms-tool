import type { Payload } from "payload";

const COLLECTION = "google-ads-account-structure-snapshots" as any;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type AccountStructureCacheSource = "cron" | "manual_refresh";

export interface AccountStructureResponse {
  partner?: string;
  campaignCount?: number;
  campaigns?: unknown[];
  _cache?: AccountStructureCacheMeta;
  [key: string]: unknown;
}

export interface AccountStructureCacheMeta {
  source: "cache" | "cron" | "manual_refresh" | "cold_cache_live_fill";
  capturedAt: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  conversionFilterKey?: string;
  stale?: boolean;
}

interface SnapshotDoc {
  id: string | number;
  client: string | number | { id: string | number };
  clientSlug?: string | null;
  customerId?: string | null;
  capturedAt?: string | null;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  source?: AccountStructureCacheSource | null;
  payload?: unknown;
  error?: string | null;
}

export interface AccountStructureClientRef {
  clientId: string | number;
  clientSlug: string;
  customerId: string;
}

export function normalizeCustomerId(raw: string): string {
  return raw.replace(/[-\s]/g, "");
}

export function assertIsoDate(value: string | null, name: string): string | null {
  if (value === null) return null;
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`Invalid '${name}' — expected YYYY-MM-DD`);
  }
  return value;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getYesterdayWindow(now = new Date()): { from: string; to: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  to.setUTCDate(to.getUTCDate() - 1);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  return { from: isoDate(from), to: isoDate(to) };
}

function addCacheMeta(
  payload: AccountStructureResponse,
  meta: AccountStructureCacheMeta,
): AccountStructureResponse {
  return { ...payload, _cache: meta };
}

export interface AccountStructureCacheMatch {
  conversionFilterKey?: string;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
}

export async function getLatestCachedAccountStructure(
  payload: Payload,
  clientId: string | number,
  match: AccountStructureCacheMatch = {},
): Promise<{ data: AccountStructureResponse; doc: SnapshotDoc } | null> {
  const conversionFilterKey = match.conversionFilterKey ?? "";
  const result = await payload.find({
    collection: COLLECTION,
    where: {
      and: [
        { client: { equals: clientId } },
        { error: { exists: false } },
        { dateRangeStart: { equals: match.dateRangeStart ?? null } },
        { dateRangeEnd: { equals: match.dateRangeEnd ?? null } },
      ],
    },
    sort: "-capturedAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const doc = (result.docs as SnapshotDoc[])[0];
  if (!doc || !doc.payload || typeof doc.payload !== "object") return null;
  const cachedFilterKey = typeof (doc.payload as AccountStructureResponse)._conversionFilterKey === "string"
    ? String((doc.payload as AccountStructureResponse)._conversionFilterKey)
    : "";
  if (cachedFilterKey !== conversionFilterKey) return null;
  const capturedAt = doc.capturedAt ?? new Date().toISOString();
  const ageMs = Date.now() - new Date(capturedAt).getTime();
  return {
    doc,
    data: addCacheMeta(doc.payload as AccountStructureResponse, {
      source: doc.source ?? "cache",
      capturedAt,
      ...(doc.dateRangeStart ? { dateRangeStart: doc.dateRangeStart } : {}),
      ...(doc.dateRangeEnd ? { dateRangeEnd: doc.dateRangeEnd } : {}),
      ...(conversionFilterKey ? { conversionFilterKey } : {}),
      stale: Number.isFinite(ageMs) ? ageMs > 24 * 60 * 60 * 1000 : true,
    }),
  };
}

export async function upsertAccountStructureSnapshot(
  payload: Payload,
  args: AccountStructureClientRef & {
    capturedAt?: Date;
    dateRangeStart?: string;
    dateRangeEnd?: string;
    source: AccountStructureCacheSource;
    payload: AccountStructureResponse;
    error?: string;
  },
): Promise<SnapshotDoc> {
  const capturedAt = (args.capturedAt ?? new Date()).toISOString();
  const data = {
    client: args.clientId,
    clientSlug: args.clientSlug,
    customerId: normalizeCustomerId(args.customerId),
    capturedAt,
    dateRangeStart: args.dateRangeStart,
    dateRangeEnd: args.dateRangeEnd,
    source: args.source,
    payload: args.payload,
    error: args.error,
  };

  const existing = await payload.find({
    collection: COLLECTION,
    where: {
      and: [
        { client: { equals: args.clientId } },
        { dateRangeStart: { equals: args.dateRangeStart ?? null } },
        { dateRangeEnd: { equals: args.dateRangeEnd ?? null } },
      ],
    },
    sort: "-capturedAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const candidate = (existing.docs as SnapshotDoc[])[0];
  const candidateFilterKey =
    candidate && candidate.payload && typeof candidate.payload === "object"
      ? String((candidate.payload as AccountStructureResponse)._conversionFilterKey ?? "")
      : null;
  const requestedFilterKey = String(
    (args.payload as AccountStructureResponse)._conversionFilterKey ?? "",
  );
  const doc = candidate && candidateFilterKey === requestedFilterKey ? candidate : undefined;
  if (doc?.id) {
    return await payload.update({
      collection: COLLECTION,
      id: doc.id,
      data,
      overrideAccess: true,
    }) as SnapshotDoc;
  }

  return await payload.create({
    collection: COLLECTION,
    data,
    overrideAccess: true,
  }) as SnapshotDoc;
}

export interface AccountStructureConversionFilters {
  conversionActions?: string;
  phoneCallActions?: string;
  formSubmitActions?: string;
  conversionActionCategories?: string;
}

export function accountStructureConversionFilterKey(filters: AccountStructureConversionFilters): string {
  return JSON.stringify({
    conversionActions: filters.conversionActions || "",
    phoneCallActions: filters.phoneCallActions || "",
    formSubmitActions: filters.formSubmitActions || "",
    conversionActionCategories: filters.conversionActionCategories || "",
  });
}

export function withConversionFilterKey(
  payload: AccountStructureResponse,
  conversionFilterKey: string,
): AccountStructureResponse {
  return { ...payload, _conversionFilterKey: conversionFilterKey };
}

export async function fetchLiveAccountStructure(args: {
  clientSlug: string;
  customerId: string;
  from?: string | null;
  to?: string | null;
  endpoint?: "client" | "partner";
  conversionFilters?: AccountStructureConversionFilters;
}): Promise<AccountStructureResponse> {
  const growthToolsUrl = process.env.GROWTH_TOOLS_URL;
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!growthToolsUrl || !internalApiKey) {
    throw new Error(
      `Server misconfigured: missing ${!growthToolsUrl ? "GROWTH_TOOLS_URL" : ""}${!growthToolsUrl && !internalApiKey ? " and " : ""}${!internalApiKey ? "INTERNAL_API_KEY" : ""}`,
    );
  }

  const cleanCustomerId = normalizeCustomerId(args.customerId);
  const qs = new URLSearchParams();
  if (args.from) qs.set("from", args.from);
  if (args.to) qs.set("to", args.to);
  if (args.conversionFilters?.conversionActions) {
    qs.set("conversionActions", args.conversionFilters.conversionActions);
  }
  if (args.conversionFilters?.phoneCallActions) {
    qs.set("phoneCallActions", args.conversionFilters.phoneCallActions);
  }
  if (args.conversionFilters?.formSubmitActions) {
    qs.set("formSubmitActions", args.conversionFilters.formSubmitActions);
  }
  if (args.conversionFilters?.conversionActionCategories) {
    qs.set("conversionActionCategories", args.conversionFilters.conversionActionCategories);
  }

  let url: string;
  if (args.endpoint === "partner") {
    qs.set("customerId", cleanCustomerId);
    url = `${growthToolsUrl.replace(/\/$/, "")}/api/partners/${encodeURIComponent(args.clientSlug)}/account-structure?${qs.toString()}`;
  } else {
    const suffix = qs.toString();
    url = `${growthToolsUrl.replace(/\/$/, "")}/api/google-ads/account-structure/${cleanCustomerId}${suffix ? `?${suffix}` : ""}`;
  }

  const upstream = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-internal-key": internalApiKey,
    },
    cache: "no-store",
  });

  const text = await upstream.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { message: text || `Upstream returned non-JSON (HTTP ${upstream.status})` };
  }
  if (!upstream.ok) {
    const message = typeof body === "object" && body && "message" in body
      ? String((body as { message?: unknown }).message)
      : text;
    throw new Error(`Growth Tools ${upstream.status}: ${message}`);
  }
  return body as AccountStructureResponse;
}

export function withCacheMeta(
  payload: AccountStructureResponse,
  meta: AccountStructureCacheMeta,
): AccountStructureResponse {
  return addCacheMeta(payload, meta);
}
