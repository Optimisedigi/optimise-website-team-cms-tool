/**
 * Shared helpers for the Optimate-Google-Ads apply-handlers.
 *
 * Several handlers need the same primitives: resolve an audit's effective
 * customerId (preferring the linked client's googleAdsCustomerId over the
 * audit's, since audits may carry the MCC), call an internal CMS route on
 * behalf of the user, normalise an NKL payload entry, etc. Centralising them
 * here keeps the handler files thin.
 */

import type { Payload } from "payload";

function internalApiKey(): string {
  return process.env.INTERNAL_API_KEY || "";
}

function growthToolsUrl(): string {
  return process.env.GROWTH_TOOLS_URL || "";
}

function growthToolsDirectUrl(): string {
  return process.env.GROWTH_TOOLS_DIRECT_URL || growthToolsUrl();
}

export type MatchType = "exact" | "phrase" | "broad";

type SqlClient = {
  execute: (sql: string) => Promise<{ rows?: Array<Record<string, unknown>> }>;
};

export interface NklKeyword {
  keyword: string;
  matchType: MatchType;
}

async function resolveAuditViaSqlClient(
  client: SqlClient,
  numericAuditId: number,
  auditId: string | number,
): Promise<Record<string, unknown> & { customerId?: string; client?: unknown }> {
  const result = await client.execute(
    `SELECT id, customer_id, client_id, proposal_id FROM google_ads_audits WHERE id = ${numericAuditId} LIMIT 1`,
  );
  const row = result?.rows?.[0];
  if (!row) throw new Error(`Google Ads audit #${auditId} not found`);

  return {
    id: row.id,
    customerId: String(row.customer_id ?? ""),
    client: row.client_id,
    proposal: row.proposal_id,
  };
}

/**
 * Resolve the effective Google Ads customer ID for an audit. Mirrors the
 * logic in google-ads-budgets/[id]/update so the agent's apply-handlers
 * push to the same account the admin UI does.
 */
export async function resolveCustomerId(
  payload: Payload,
  auditId: string | number,
): Promise<{ customerId: string; auditDoc: Record<string, unknown> }> {
  const numericAuditId = Number(auditId);
  if (!Number.isFinite(numericAuditId)) {
    throw new Error(`Invalid Google Ads audit ID: ${auditId}`);
  }

  // Keep this intentionally raw + narrow when the libSQL client is available.
  // Payload findByID selects every column in google_ads_audits; when production
  // schema drift leaves a newly-added proposal column missing, unrelated
  // budget/NKL apply handlers fail before they can read the stable
  // customer/client columns they actually need. Tests often mock Payload without
  // payload.db.client, so fall back to findByID there.
  const client = (payload as unknown as { db?: { client?: SqlClient } }).db?.client;
  const audit: Record<string, unknown> & {
    customerId?: string;
    client?: unknown;
  } = client
    ? await resolveAuditViaSqlClient(client, numericAuditId, auditId)
    : ((await payload.findByID({
        collection: "google-ads-audits",
        id: auditId as any,
        overrideAccess: true,
      })) as unknown as Record<string, unknown> & {
        customerId?: string;
        client?: unknown;
      });

  let customerId = String(audit.customerId ?? "").trim();
  const directClient = audit.client as { id?: string | number; googleAdsCustomerId?: string } | string | number | null | undefined;
  if (directClient) {
    let clientDoc: { googleAdsCustomerId?: string } | null = null;
    if (typeof directClient === "object") {
      clientDoc = directClient as { googleAdsCustomerId?: string };
    } else {
      try {
        const numericClientId = Number(directClient);
        if (client && Number.isFinite(numericClientId)) {
          const clientResult = await client.execute(
            `SELECT google_ads_customer_id FROM clients WHERE id = ${numericClientId} LIMIT 1`,
          );
          const clientRow = clientResult?.rows?.[0];
          clientDoc = clientRow
            ? { googleAdsCustomerId: String(clientRow.google_ads_customer_id ?? "") }
            : null;
        } else {
          clientDoc = (await payload.findByID({
            collection: "clients",
            id: directClient as any,
            overrideAccess: true,
          })) as { googleAdsCustomerId?: string };
        }
      } catch {
        clientDoc = null;
      }
    }
    const clientCid = clientDoc?.googleAdsCustomerId?.trim();
    if (clientCid) customerId = clientCid;
  }

  if (!customerId) {
    throw new Error("No Google Ads customer ID found on audit or linked client");
  }
  return { customerId: customerId.replace(/-/g, ""), auditDoc: audit };
}

/**
 * Resolve the linked client's id for an audit, preferring the audit's direct
 * client field, falling back to the audit's proposal->client. Returns null if
 * none. Used by NKL handlers that create a list scoped to a client.
 */
export async function resolveClientId(
  payload: Payload,
  audit: Record<string, unknown>,
): Promise<string | number | null> {
  const directClient = audit.client as { id?: string | number } | string | number | null | undefined;
  if (directClient && typeof directClient === "object") {
    const id = (directClient as { id?: string | number }).id;
    if (id !== undefined) return id;
  } else if (typeof directClient === "string" || typeof directClient === "number") {
    return directClient;
  }

  const proposalRef = audit.proposal as { id?: string | number; client?: unknown } | string | number | null | undefined;
  if (proposalRef) {
    let proposalDoc: { client?: unknown } | null = null;
    if (typeof proposalRef === "object") {
      proposalDoc = proposalRef as { client?: unknown };
    } else {
      try {
        proposalDoc = (await payload.findByID({
          collection: "client-proposals",
          id: proposalRef as any,
          overrideAccess: true,
        })) as { client?: unknown };
      } catch {
        proposalDoc = null;
      }
    }
    const c = proposalDoc?.client;
    if (c && typeof c === "object") {
      const id = (c as { id?: string | number }).id;
      if (id !== undefined) return id;
    } else if (typeof c === "string" || typeof c === "number") {
      return c;
    }
  }
  return null;
}

/**
 * POST to a Growth Tools endpoint with the internal-key header. Mirrors the
 * pattern used by the existing CMS routes (approve-negatives, push,
 * deploy-ad-copy) so apply-handlers behave the same way as a human clicking
 * the equivalent admin button.
 */
/**
 * Fire-and-forget POST to Growth Tools — used for long-running calls like
 * campaign-proposal that exceed Vercel's function timeout. Calls the direct
 * Railway URL (bypassing the Vercel proxy) and does NOT await the response.
 */
export function postGrowthToolsFireAndForget(
  pathFromRoot: string,
  body: Record<string, unknown>,
): void {
  const key = internalApiKey();
  const baseUrl = growthToolsDirectUrl();
  if (!key || !baseUrl) return;
  const url = `${baseUrl}${pathFromRoot}`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": key,
    },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error(`[postGrowthToolsFireAndForget] ${pathFromRoot}:`, (err as Error).message);
  });
}

export type GrowthToolsMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface GrowthToolsActionMetadata {
  agentRunId?: string;
  clientId?: string | number;
  auditId?: string | number;
  userId?: string | number;
  source?: "optimax";
}

export async function growthToolsRequest(options: {
  method: GrowthToolsMethod;
  pathFromRoot: string;
  body?: Record<string, unknown>;
  timeoutMs?: number;
  metadata?: GrowthToolsActionMetadata;
}): Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number; error: string }> {
  const key = internalApiKey();
  if (!key) {
    return { ok: false, status: 500, error: "INTERNAL_API_KEY is not configured" };
  }
  const baseUrl = growthToolsUrl();
  if (!baseUrl) {
    return { ok: false, status: 500, error: "GROWTH_TOOLS_URL is not configured" };
  }
  const body = options.body && options.metadata
    ? { ...options.body, ...options.metadata, source: options.metadata.source ?? "optimax" }
    : options.body;
  const url = `${baseUrl}${options.pathFromRoot}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method,
      headers: {
        "x-internal-key": key,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });
  } catch (err) {
    return { ok: false, status: 0, error: `Network error calling Growth Tools ${options.pathFromRoot}: ${(err as Error).message}` };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    let errMsg = `Growth Tools HTTP ${res.status}`;
    if (parsed && typeof parsed === "object") {
      const parsedObj = parsed as { error?: unknown; message?: unknown; errors?: unknown };
      if (parsedObj.error) {
        errMsg = String(parsedObj.error);
      } else if (parsedObj.message) {
        errMsg = String(parsedObj.message);
      } else if (Array.isArray(parsedObj.errors) && parsedObj.errors.length > 0) {
        errMsg = parsedObj.errors.map((error) => String(error)).join("; ");
      }
    }
    return { ok: false, status: res.status, error: errMsg };
  }
  return { ok: true, status: res.status, data: parsed };
}

export async function postGrowthTools(
  pathFromRoot: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number; error: string }> {
  return growthToolsRequest({ method: "POST", pathFromRoot, body });
}

/**
 * Stamp negatedAt on a list of keywords so the avoided-spend cache is
 * crediting from "now" forward. Mirrors the beforeChange hook on
 * NegativeKeywordLists, but we set it explicitly because some handlers go
 * through Growth Tools instead of payload.update().
 */
export function stampNegatedAt(keywords: NklKeyword[]): Array<NklKeyword & { negatedAt: string }> {
  const now = new Date().toISOString();
  return keywords.map((k) => ({ ...k, negatedAt: now }));
}
