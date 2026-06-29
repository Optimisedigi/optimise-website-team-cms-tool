/**
 * Resolve a client's GA4 / GSC OAuth credentials, refreshing the access token
 * when it's expired. Persists refreshed tokens via payload.update so the next
 * tool call doesn't repeat the refresh.
 *
 * Mirrors gsc-monitor.ts pattern: refresh-on-expiry, write-back, return ready
 * access token + the property/site identifier the data API needs.
 */

import { getPayload } from "payload";
import payloadConfig from "@/payload.config";
import { refreshAccessToken as refreshGscAccessToken } from "@/lib/gsc-service";
import { refreshGa4AccessToken } from "@/lib/ga4-service";

interface ClientDoc {
  id: string | number;
  ga4Connected?: boolean;
  ga4PropertyId?: string;
  ga4AccessToken?: string;
  ga4RefreshToken?: string;
  ga4TokenExpiry?: string | null;
  gscConnected?: boolean;
  gscPropertyUrl?: string;
  gscAccessToken?: string;
  gscRefreshToken?: string;
  gscTokenExpiry?: string | null;
  brandKeywords?: string;
}

export interface Ga4TokenResult {
  ok: true;
  accessToken: string;
  propertyId: string;
}

export interface GscTokenResult {
  ok: true;
  accessToken: string;
  siteUrl: string;
  brandTerms: string[];
}

export interface TokenError {
  ok: false;
  reason: string;
}

async function loadClient(clientId: string | number): Promise<ClientDoc> {
  const cfg = await payloadConfig;
  const payload = await getPayload({ config: cfg });
  return (await payload.findByID({
    collection: "clients",
    id: clientId,
    overrideAccess: true,
    depth: 0,
  })) as unknown as ClientDoc;
}

async function persistToken(
  clientId: string | number,
  field: "ga4" | "gsc",
  data: { accessToken: string; expiry: string | null },
): Promise<void> {
  const cfg = await payloadConfig;
  const payload = await getPayload({ config: cfg });
  const update: Record<string, unknown> = {};
  if (field === "ga4") {
    update.ga4AccessToken = data.accessToken;
    update.ga4TokenExpiry = data.expiry;
  } else {
    update.gscAccessToken = data.accessToken;
    update.gscTokenExpiry = data.expiry;
  }
  await payload.update({
    collection: "clients",
    id: clientId,
    data: update as never,
    overrideAccess: true,
  });
}

function isExpired(expiry: string | null | undefined): boolean {
  if (!expiry) return true;
  return new Date(expiry).getTime() <= Date.now() + 30_000; // 30s safety
}

/**
 * Resolve a valid GA4 access token + property id for a given CMS client.
 * Returns a tagged-union result so callers can render a clean error message.
 */
export async function getValidGa4Token(
  clientId: string | number | undefined | null,
): Promise<Ga4TokenResult | TokenError> {
  if (clientId === undefined || clientId === null) {
    return { ok: false, reason: "No client linked to this audit; GA4 needs a client to read tokens from." };
  }
  const client = await loadClient(clientId);
  if (!client.ga4Connected) {
    return { ok: false, reason: "GA4 is not connected for this client. Have an admin connect via /clients/[id] OAuth flow." };
  }
  const propertyId = (client.ga4PropertyId ?? "").trim();
  const refreshToken = (client.ga4RefreshToken ?? "").trim();
  if (!propertyId) return { ok: false, reason: "Client has no ga4PropertyId set." };
  if (!refreshToken) return { ok: false, reason: "Client has no GA4 refresh token saved (re-connect required)." };

  if (isExpired(client.ga4TokenExpiry) || !client.ga4AccessToken) {
    try {
      const refreshed = await refreshGa4AccessToken(refreshToken);
      await persistToken(clientId, "ga4", refreshed);
      return { ok: true, accessToken: refreshed.accessToken, propertyId };
    } catch (err) {
      return { ok: false, reason: `GA4 token refresh failed: ${(err as Error).message}` };
    }
  }
  return { ok: true, accessToken: client.ga4AccessToken, propertyId };
}

/**
 * Resolve a valid GSC access token + site URL for a given CMS client. Also
 * returns brandTerms (one per line in the field) so the brand-split tool can
 * split queries.
 */
export async function getValidGscToken(
  clientId: string | number | undefined | null,
): Promise<GscTokenResult | TokenError> {
  if (clientId === undefined || clientId === null) {
    return { ok: false, reason: "No client linked to this audit; GSC needs a client to read tokens from." };
  }
  const client = await loadClient(clientId);
  if (!client.gscConnected) {
    return { ok: false, reason: "GSC is not connected for this client. Have an admin connect via /clients/[id] OAuth flow." };
  }
  const siteUrl = (client.gscPropertyUrl ?? "").trim();
  const refreshToken = (client.gscRefreshToken ?? "").trim();
  if (!siteUrl) return { ok: false, reason: "Client has no gscPropertyUrl set." };
  if (!refreshToken) return { ok: false, reason: "Client has no GSC refresh token saved (re-connect required)." };

  let accessToken = client.gscAccessToken ?? "";
  if (isExpired(client.gscTokenExpiry) || !accessToken) {
    try {
      const refreshed = await refreshGscAccessToken(refreshToken);
      await persistToken(clientId, "gsc", refreshed);
      accessToken = refreshed.accessToken;
    } catch (err) {
      return { ok: false, reason: `GSC token refresh failed: ${(err as Error).message}` };
    }
  }

  const brandTerms = String(client.brandKeywords ?? "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return { ok: true, accessToken, siteUrl, brandTerms };
}

/**
 * Lightweight connection-state read used by the system prompt so the agent
 * knows up-front whether GA4/GSC tools will work for the linked client.
 */
export async function readClientConnectionFlags(
  clientId: string | number | undefined | null,
): Promise<{
  ga4Connected: boolean;
  ga4PropertyId: string | null;
  gscConnected: boolean;
  gscPropertyUrl: string | null;
}> {
  if (clientId === undefined || clientId === null) {
    return { ga4Connected: false, ga4PropertyId: null, gscConnected: false, gscPropertyUrl: null };
  }
  try {
    const client = await loadClient(clientId);
    return {
      ga4Connected: Boolean(client.ga4Connected),
      ga4PropertyId: (client.ga4PropertyId ?? "").trim() || null,
      gscConnected: Boolean(client.gscConnected),
      gscPropertyUrl: (client.gscPropertyUrl ?? "").trim() || null,
    };
  } catch {
    return { ga4Connected: false, ga4PropertyId: null, gscConnected: false, gscPropertyUrl: null };
  }
}

/**
 * Translate a range preset (or a literal ISO span) to (startDate, endDate)
 * ISO strings for GA4 / GSC queries.
 *
 * Accepts:
 *   - A preset name from SUPPORTED_PRESETS (e.g. "LAST_7_DAYS").
 *   - A literal `"YYYY-MM-DD..YYYY-MM-DD"` span — returned verbatim. Used
 *     by the OptiMate tools so the agent can isolate back-dated weeks for
 *     GA4 / GSC the same way it can for Google Ads now.
 *
 * Unknown inputs fall back to LAST_30_DAYS (last 30 days ending yesterday).
 */
export function rangeToDates(rangePreset: string): { startDate: string; endDate: string } {
  // Literal ISO span: "YYYY-MM-DD..YYYY-MM-DD". Validated by `resolveRange`
  // upstream, so we trust the format here.
  const spanMatch = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(rangePreset);
  if (spanMatch) {
    return { startDate: spanMatch[1], endDate: spanMatch[2] };
  }

  const today = new Date();
  const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10);
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
  };
  const days = (n: number) => {
    const d = startOfDay(today);
    d.setUTCDate(d.getUTCDate() - n);
    return d;
  };

  switch (rangePreset) {
    case "TODAY":
      return { startDate: yyyymmdd(today), endDate: yyyymmdd(today) };
    case "YESTERDAY": {
      const y = days(1);
      return { startDate: yyyymmdd(y), endDate: yyyymmdd(y) };
    }
    case "LAST_7_DAYS":
      return { startDate: yyyymmdd(days(7)), endDate: yyyymmdd(days(1)) };
    case "LAST_14_DAYS":
      return { startDate: yyyymmdd(days(14)), endDate: yyyymmdd(days(1)) };
    case "LAST_30_DAYS":
      return { startDate: yyyymmdd(days(30)), endDate: yyyymmdd(days(1)) };
    case "LAST_60_DAYS":
      return { startDate: yyyymmdd(days(60)), endDate: yyyymmdd(days(1)) };
    case "LAST_90_DAYS":
      return { startDate: yyyymmdd(days(90)), endDate: yyyymmdd(days(1)) };
    case "THIS_MONTH": {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { startDate: yyyymmdd(first), endDate: yyyymmdd(today) };
    }
    case "LAST_MONTH": {
      const firstThis = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const lastPrev = new Date(firstThis.getTime() - 86400000);
      const firstPrev = new Date(Date.UTC(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), 1));
      return { startDate: yyyymmdd(firstPrev), endDate: yyyymmdd(lastPrev) };
    }
    case "THIS_WEEK_MON_TODAY": {
      const d = startOfDay(today);
      const dow = d.getUTCDay();
      const diff = dow === 0 ? 6 : dow - 1; // Mon = 1
      d.setUTCDate(d.getUTCDate() - diff);
      return { startDate: yyyymmdd(d), endDate: yyyymmdd(today) };
    }
    case "LAST_WEEK_SUN_SAT": {
      const d = startOfDay(today);
      const dow = d.getUTCDay();
      // Sat of last week = today - (dow + 1) days (Sun=0 → -1, Mon=1 → -2, Sat=6 → -7)
      const sat = new Date(d);
      sat.setUTCDate(sat.getUTCDate() - (dow + 1));
      const sun = new Date(sat);
      sun.setUTCDate(sun.getUTCDate() - 6);
      return { startDate: yyyymmdd(sun), endDate: yyyymmdd(sat) };
    }
    case "LAST_WEEK":
    case "LAST_WEEK_MON_SUN": {
      // Agency convention: Monday to Sunday, the most recently completed pair.
      // Mirrors lastWeekMonSun() in _date-range.ts. Kept here so legacy callers
      // that pass the preset name (rather than an ISO span) still get correct
      // bounds without round-tripping through resolveRange().
      const d = startOfDay(today);
      const dow = d.getUTCDay();
      const daysSinceMonday = dow === 0 ? 6 : dow - 1;
      const endOffset = daysSinceMonday + 1;
      const startOffset = endOffset + 6;
      const end = new Date(d);
      end.setUTCDate(end.getUTCDate() - endOffset);
      const start = new Date(d);
      start.setUTCDate(start.getUTCDate() - startOffset);
      return { startDate: yyyymmdd(start), endDate: yyyymmdd(end) };
    }
    default:
      return { startDate: yyyymmdd(days(30)), endDate: yyyymmdd(days(1)) };
  }
}
