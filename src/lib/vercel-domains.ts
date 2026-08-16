/**
 * Thin server-only client for the two Vercel domain endpoints the landing
 * settings area needs: attach a hostname to a project, and read that
 * hostname's DNS configuration status.
 *
 * Trust model: VERCEL_TOKEN is an account-wide credential — a leak controls
 * every project in the account, not just the landing one. It is read from env
 * at call time, never logged, and never included in any response object.
 * Without it every helper fails closed with `configured: false`, which the
 * routes translate into a 503.
 */

export const DEFAULT_VERCEL_PROJECT = "od-landing-page-adt";

/** Hostnames come from an admin form, but they still reach an external API. */
const HOSTNAME_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function isValidHostname(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length <= 253 &&
    !value.includes("*") &&
    HOSTNAME_PATTERN.test(value)
  );
}

interface VercelAuth {
  token: string;
  teamQuery: string;
}

function vercelAuth(): VercelAuth | null {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return null;
  const teamId = process.env.VERCEL_TEAM_ID;
  return { token, teamQuery: teamId ? `teamId=${encodeURIComponent(teamId)}` : "" };
}

export function vercelConfigured(): boolean {
  return vercelAuth() !== null;
}

export interface VercelVerificationChallenge {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}

export interface AddDomainResult {
  ok: boolean;
  status: number;
  /** True once Vercel considers ownership verified for this project. */
  verified: boolean;
  /** TXT challenges returned when the domain belongs to another Vercel account. */
  verification: VercelVerificationChallenge[];
  error?: string;
}

export interface DomainConfigResult {
  ok: boolean;
  status: number;
  misconfigured: boolean;
  configuredBy: string | null;
  /**
   * Project-specific CNAME target (`*.vercel-dns-0xx.com`). The generic
   * `cname.vercel-dns.com` fails verification on newer projects, so this value
   * is the only one that may ever be shown to a client.
   */
  recommendedCNAME: string | null;
  error?: string;
}

async function vercelFetch(
  path: string,
  init: RequestInit,
  auth: VercelAuth,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `https://api.vercel.com${path}${auth.teamQuery ? `${separator}${auth.teamQuery}` : ""}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    // A cached config response is a known trap (vercel/platforms#373): stale
    // "misconfigured" would keep telling the client their correct DNS is wrong.
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, body };
}

/** Errors from Vercel may embed request context; keep only a short message, never the token. */
function safeError(body: Record<string, unknown> | null): string {
  const error = body?.error as { message?: unknown } | undefined;
  return String(error?.message ?? "Vercel request failed").slice(0, 200);
}

/** POST /v10/projects/{idOrName}/domains — attach a hostname to the project. */
export async function addProjectDomain(
  projectIdOrName: string,
  hostname: string,
): Promise<AddDomainResult> {
  const auth = vercelAuth();
  if (!auth) return { ok: false, status: 503, verified: false, verification: [], error: "VERCEL_TOKEN is not configured" };
  if (!isValidHostname(hostname)) {
    return { ok: false, status: 400, verified: false, verification: [], error: "Invalid hostname" };
  }

  try {
    const { status, body } = await vercelFetch(
      `/v10/projects/${encodeURIComponent(projectIdOrName)}/domains`,
      { method: "POST", body: JSON.stringify({ name: hostname }) },
      auth,
    );

    // 409 means the domain is already attached to this project — for our
    // purposes that is success: re-registering an existing mapping must not fail.
    if (status !== 200 && status !== 409) {
      return { ok: false, status, verified: false, verification: [], error: safeError(body) };
    }

    const verification = Array.isArray(body?.verification)
      ? (body!.verification as VercelVerificationChallenge[]).map((challenge) => ({
          type: String(challenge.type ?? ""),
          domain: String(challenge.domain ?? ""),
          value: String(challenge.value ?? ""),
          reason: challenge.reason ? String(challenge.reason) : undefined,
        }))
      : [];

    return { ok: true, status, verified: body?.verified === true, verification };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      verified: false,
      verification: [],
      error: error instanceof Error ? error.message.slice(0, 200) : "Vercel request failed",
    };
  }
}

/** GET /v6/domains/{domain}/config — is DNS pointed correctly, and at what. */
export async function getDomainConfig(
  hostname: string,
  projectIdOrName: string,
): Promise<DomainConfigResult> {
  const auth = vercelAuth();
  if (!auth) return { ok: false, status: 503, misconfigured: true, configuredBy: null, recommendedCNAME: null, error: "VERCEL_TOKEN is not configured" };
  if (!isValidHostname(hostname)) {
    return { ok: false, status: 400, misconfigured: true, configuredBy: null, recommendedCNAME: null, error: "Invalid hostname" };
  }

  try {
    const { status, body } = await vercelFetch(
      `/v6/domains/${encodeURIComponent(hostname)}/config?projectIdOrName=${encodeURIComponent(projectIdOrName)}`,
      { method: "GET" },
      auth,
    );

    if (status !== 200) {
      return { ok: false, status, misconfigured: true, configuredBy: null, recommendedCNAME: null, error: safeError(body) };
    }

    const recommended = Array.isArray(body?.recommendedCNAME)
      ? (body!.recommendedCNAME as unknown[]).map(String).find(Boolean) ?? null
      : null;

    return {
      ok: true,
      status,
      misconfigured: body?.misconfigured !== false,
      configuredBy: body?.configuredBy ? String(body.configuredBy) : null,
      recommendedCNAME: recommended,
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      misconfigured: true,
      configuredBy: null,
      recommendedCNAME: null,
      error: error instanceof Error ? error.message.slice(0, 200) : "Vercel request failed",
    };
  }
}
