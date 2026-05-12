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

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";
const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL || "";
// Direct Railway URL — bypasses Vercel proxy 60s timeout for long-running calls.
const GROWTH_TOOLS_DIRECT_URL = process.env.GROWTH_TOOLS_DIRECT_URL || GROWTH_TOOLS_URL;

export type MatchType = "exact" | "phrase" | "broad";

export interface NklKeyword {
  keyword: string;
  matchType: MatchType;
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
  const audit = (await payload.findByID({
    collection: "google-ads-audits",
    id: auditId as any,
    overrideAccess: true,
    depth: 1,
  })) as unknown as Record<string, unknown> & { customerId?: string; client?: unknown };

  let customerId = String(audit.customerId ?? "").trim();
  const directClient = audit.client as { id?: string | number; googleAdsCustomerId?: string } | string | number | null | undefined;
  if (directClient) {
    let clientDoc: { googleAdsCustomerId?: string } | null = null;
    if (typeof directClient === "object") {
      clientDoc = directClient as { googleAdsCustomerId?: string };
    } else {
      try {
        clientDoc = (await payload.findByID({
          collection: "clients",
          id: directClient as any,
          overrideAccess: true,
        })) as { googleAdsCustomerId?: string };
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
  if (!INTERNAL_API_KEY || !GROWTH_TOOLS_DIRECT_URL) return;
  const url = `${GROWTH_TOOLS_DIRECT_URL}${pathFromRoot}`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_API_KEY,
    },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error(`[postGrowthToolsFireAndForget] ${pathFromRoot}:`, (err as Error).message);
  });
}

export async function postGrowthTools(
  pathFromRoot: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number; error: string }> {
  if (!INTERNAL_API_KEY) {
    return { ok: false, status: 500, error: "INTERNAL_API_KEY is not configured" };
  }
  if (!GROWTH_TOOLS_URL) {
    return { ok: false, status: 500, error: "GROWTH_TOOLS_URL is not configured" };
  }
  const url = `${GROWTH_TOOLS_URL}${pathFromRoot}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return { ok: false, status: 0, error: `Network error calling Growth Tools ${pathFromRoot}: ${(err as Error).message}` };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const errMsg = (parsed && typeof parsed === "object" && (parsed as { error?: unknown }).error)
      ? String((parsed as { error?: unknown }).error)
      : `Growth Tools HTTP ${res.status}`;
    return { ok: false, status: res.status, error: errMsg };
  }
  return { ok: true, status: res.status, data: parsed };
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
