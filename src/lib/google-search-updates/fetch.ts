/**
 * Transport for Google's public Search Status Dashboard.
 * Hardcoded host — never takes a caller-supplied URL (SSRF).
 */

import { classifySearchIncident, stripHtml, type SearchUpdateKind } from "./classify";

export const SEARCH_STATUS_URL = "https://status.search.google.com/incidents.json";
const FETCH_TIMEOUT_MS = 20_000;
/** Cap so a poisoned or unexpectedly huge payload cannot blow the store. */
export const INCIDENT_CAP = 200;

export interface NormalisedSearchIncident {
  incidentId: string;
  title: string;
  kind: SearchUpdateKind;
  begin: string;
  end: string;
  modified: string;
  statusImpact: string;
  severity: string;
  serviceName: string;
  latestUpdate: string;
  sourceUri: string;
  raw: Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Only the official dashboard — never a caller- or payload-supplied host. */
function safeStatusUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return "https://status.search.google.com/";
  try {
    const absolute = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? new URL(trimmed)
      : new URL(trimmed.replace(/^\//, ""), "https://status.search.google.com/");
    if (absolute.protocol !== "https:" || absolute.hostname !== "status.search.google.com") {
      return "https://status.search.google.com/";
    }
    return absolute.toString().slice(0, 500);
  } catch {
    return "https://status.search.google.com/";
  }
}

export function normaliseIncident(raw: unknown): NormalisedSearchIncident | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const incidentId = str(row.id).slice(0, 80);
  const title = stripHtml(str(row.external_desc)).slice(0, 240);
  if (!incidentId || !title) return null;

  const latest = row.most_recent_update;
  const latestText =
    latest && typeof latest === "object" && !Array.isArray(latest)
      ? stripHtml(str((latest as Record<string, unknown>).text))
      : "";

  const uri = str(row.uri);
  const sourceUri = safeStatusUri(uri);

  return {
    incidentId,
    title,
    kind: classifySearchIncident(title, str(row.service_name)),
    begin: str(row.begin).slice(0, 40),
    end: str(row.end).slice(0, 40),
    modified: str(row.modified).slice(0, 40),
    statusImpact: str(row.status_impact).slice(0, 80),
    severity: str(row.severity).slice(0, 40),
    serviceName: str(row.service_name).slice(0, 80),
    latestUpdate: latestText.slice(0, 1000),
    sourceUri,
    raw: row,
  };
}

export async function fetchSearchStatusIncidents(
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<{ ok: boolean; incidents: NormalisedSearchIncident[]; error?: string }> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const response = await doFetch(SEARCH_STATUS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return { ok: false, incidents: [], error: `Search Status ${response.status}` };
    }
    const json: unknown = await response.json();
    if (!Array.isArray(json)) {
      return { ok: false, incidents: [], error: "Search Status payload was not an array" };
    }
    const incidents: NormalisedSearchIncident[] = [];
    for (const row of json.slice(0, INCIDENT_CAP)) {
      const normalised = normaliseIncident(row);
      if (normalised) incidents.push(normalised);
    }
    return { ok: true, incidents };
  } catch (err) {
    return { ok: false, incidents: [], error: `Search Status fetch failed: ${(err as Error).message}` };
  }
}
