import type { AnalyseRequest, CitationEngine, RunStatus, RunStatusValue } from "./types";
import { isRecord } from "./types";

/** CMS → GT calls. Same env + header as src/lib/google-ads-campaign-names.ts. */
export type GtResult<T> = { ok: true; value: T } | { ok: false; error: string; status?: number };

/** GT replies `{ message, issues? }` (older paths `{ error }`); turn it into one plain line. */
function gtMessage(json: unknown, status: number): string {
  if (!isRecord(json)) return `HTTP ${status}`;
  const base = typeof json.message === "string" ? json.message : typeof json.error === "string" ? json.error : `HTTP ${status}`;
  const issues = Array.isArray(json.issues) ? json.issues : [];
  const first = issues.find(isRecord);
  if (!first) return base;
  const path = Array.isArray(first.path) ? first.path.join(".") : "";
  return `${base} (${path ? `${path}: ` : ""}${typeof first.message === "string" ? first.message : "invalid"})`;
}

function gtConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.GROWTH_TOOLS_URL?.replace(/\/$/, "");
  const apiKey = process.env.INTERNAL_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

export async function startGtAnalysis(
  body: AnalyseRequest,
  signal?: AbortSignal,
): Promise<GtResult<{ runId: string; adopted: boolean }>> {
  const cfg = gtConfig();
  if (!cfg) return { ok: false, error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY is not configured" };
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/api/content-map/analyse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": cfg.apiKey },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return { ok: false, error: `Growth Tools unreachable: ${(err as Error).message}` };
  }
  const json: unknown = await res.json().catch(() => null);
  const runId = isRecord(json) && typeof json.runId === "string" ? json.runId : "";
  if ((res.status === 202 || res.ok) && runId) return { ok: true, value: { runId, adopted: false } };
  if (res.status === 409 && runId) return { ok: true, value: { runId, adopted: true } };
  const message = gtMessage(json, res.status);
  return { ok: false, error: `Growth Tools rejected the analysis: ${message}`, status: res.status };
}

export async function getGtRun(runId: string, timeoutMs = 4_000): Promise<GtResult<RunStatus>> {
  const cfg = gtConfig();
  if (!cfg) return { ok: false, error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY is not configured" };
  try {
    const res = await fetch(`${cfg.baseUrl}/api/content-map/runs/${encodeURIComponent(runId)}`, {
      headers: { "x-internal-key": cfg.apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    const json: unknown = await res.json();
    if (!isRecord(json) || typeof json.status !== "string") return { ok: false, error: "Bad run status" };
    return { ok: true, value: json as unknown as RunStatus };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface CitationsRequest {
  clientId: string;
  siteUrl: string;
  brandTerms: string[];
  engines: CitationEngine[];
  location?: string;
  language?: string;
  questions: Array<{ id: string; topic: string; question: string }>;
}

export interface CitationsRunStatus {
  runId: string;
  clientId: string;
  status: RunStatusValue;
  phase?: "queued" | "asking" | "reading-sources" | "done";
  progress?: { checksDone: number; checksTotal: number };
  error?: string;
  result?: unknown;
}

/** CONTRACT-2 §1: start a citation run. 409 = one is already running (adopted). */
export async function startGtCitations(
  body: CitationsRequest,
  signal?: AbortSignal,
): Promise<GtResult<{ runId: string; adopted: boolean }>> {
  const cfg = gtConfig();
  if (!cfg) return { ok: false, error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY is not configured" };
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/api/content-map/citations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": cfg.apiKey },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return { ok: false, error: `Growth Tools unreachable: ${(err as Error).message}` };
  }
  const json: unknown = await res.json().catch(() => null);
  const runId = isRecord(json) && typeof json.runId === "string" ? json.runId : "";
  if ((res.status === 202 || res.ok) && runId) return { ok: true, value: { runId, adopted: false } };
  if (res.status === 409 && runId) return { ok: true, value: { runId, adopted: true } };
  const message = gtMessage(json, res.status);
  return { ok: false, error: `Growth Tools rejected the citation run: ${message}`, status: res.status };
}

export async function getGtCitations(runId: string, timeoutMs = 4_000): Promise<GtResult<CitationsRunStatus>> {
  const cfg = gtConfig();
  if (!cfg) return { ok: false, error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY is not configured" };
  try {
    const res = await fetch(`${cfg.baseUrl}/api/content-map/citations/${encodeURIComponent(runId)}`, {
      headers: { "x-internal-key": cfg.apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    const json: unknown = await res.json();
    if (!isRecord(json) || typeof json.status !== "string") return { ok: false, error: "Bad citation run status" };
    return { ok: true, value: json as unknown as CitationsRunStatus };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ─── Research (CONTRACT-3 §1) ─────────────────────────────────────────────

export interface ResearchRequest {
  clientId: string;
  siteUrl: string;
  location: string;
  language?: string;
  topics: Array<{ key: string; name: string; description?: string; seeds: string[] }>;
  excludeDomains?: string[];
  limits?: { keywordsPerTopic?: number; questionSeedsPerTopic?: number; competitorKeywordsPerTopic?: number; competitorPagesPerTopic?: number };
}

export interface ResearchRunStatus {
  runId: string;
  clientId: string;
  status: RunStatusValue;
  phase?: "queued" | "keywords" | "questions" | "competitors" | "reading-pages" | "done";
  progress?: { topicsDone: number; topicsTotal: number };
  error?: string;
  result?: unknown;
}

/** CONTRACT-3 §1: start a research run. 409 = one is already running (adopted). */
export async function startGtResearch(body: ResearchRequest, signal?: AbortSignal): Promise<GtResult<{ runId: string; adopted: boolean }>> {
  const cfg = gtConfig();
  if (!cfg) return { ok: false, error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY is not configured" };
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/api/content-map/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": cfg.apiKey },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return { ok: false, error: `Growth Tools unreachable: ${(err as Error).message}` };
  }
  const json: unknown = await res.json().catch(() => null);
  const runId = isRecord(json) && typeof json.runId === "string" ? json.runId : "";
  if ((res.status === 202 || res.ok) && runId) return { ok: true, value: { runId, adopted: false } };
  if (res.status === 409 && runId) return { ok: true, value: { runId, adopted: true } };
  const message = gtMessage(json, res.status);
  return { ok: false, error: `Growth Tools rejected the research run: ${message}`, status: res.status };
}

export async function getGtResearch(runId: string, timeoutMs = 4_000): Promise<GtResult<ResearchRunStatus>> {
  const cfg = gtConfig();
  if (!cfg) return { ok: false, error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY is not configured" };
  try {
    const res = await fetch(`${cfg.baseUrl}/api/content-map/research/${encodeURIComponent(runId)}`, {
      headers: { "x-internal-key": cfg.apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    const json: unknown = await res.json();
    if (!isRecord(json) || typeof json.status !== "string") return { ok: false, error: "Bad research run status" };
    return { ok: true, value: json as unknown as ResearchRunStatus };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
