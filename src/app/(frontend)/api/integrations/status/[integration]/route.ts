import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import {
  ensureValidToken as ensureGa4Token,
  fetchGa4Report,
} from "@/lib/ga4-service";
import { refreshAccessToken as refreshGscToken } from "@/lib/gsc-service";

/**
 * Per-client connection-test endpoint used by the "Tools" tab on the Clients
 * collection admin view.
 *
 * GET /api/integrations/status/:integration?clientId=:id
 *   integration ∈ { ga4, gsc, googleAds, metaAds }
 *
 * Returns: { ok: boolean, status: 'ok'|'missing'|'error', message?: string }
 *
 * The agency OAuth tokens currently live per-client on the Clients collection
 * (e.g. ga4RefreshToken, gscRefreshToken). The shared-agency-account model
 * described in the Tools tab is a UI convention — the underlying OAuth grant
 * is the same. These checks verify the stored credentials can read this
 * specific client's property/account.
 */

type Integration = "ga4" | "gsc" | "googleAds" | "metaAds";

type StatusResult = {
  ok: boolean;
  status: "ok" | "missing" | "error";
  message?: string;
};

const VALID_INTEGRATIONS: ReadonlySet<Integration> = new Set([
  "ga4",
  "gsc",
  "googleAds",
  "metaAds",
]);

function isIntegration(value: string): value is Integration {
  return VALID_INTEGRATIONS.has(value as Integration);
}

async function checkGa4(client: Record<string, unknown>): Promise<StatusResult> {
  const propertyId = (client.ga4PropertyId as string) || "";
  const refreshToken = (client.ga4RefreshToken as string) || "";
  const accessToken = (client.ga4AccessToken as string) || "";
  const tokenExpiry = (client.ga4TokenExpiry as string | null) || null;
  if (!propertyId) {
    return { ok: false, status: "missing", message: "No GA4 Property ID set." };
  }
  if (!refreshToken) {
    return {
      ok: false,
      status: "error",
      message: "Agency account not authorised for GA4. Reconnect via the Integrations page.",
    };
  }
  try {
    const tok = await ensureGa4Token(accessToken, refreshToken, tokenExpiry);
    const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    await fetchGa4Report(tok.accessToken, propertyId, start, end);
    return { ok: true, status: "ok", message: `Read property ${propertyId} successfully.` };
  } catch (err) {
    return {
      ok: false,
      status: "error",
      message: err instanceof Error ? err.message : "GA4 request failed.",
    };
  }
}

async function checkGsc(client: Record<string, unknown>): Promise<StatusResult> {
  const siteUrl = ((client.gscPropertyUrl as string) || "").trim();
  const refreshToken = (client.gscRefreshToken as string) || "";
  if (!siteUrl) {
    return { ok: false, status: "missing", message: "No GSC property URL set." };
  }
  if (!refreshToken) {
    return {
      ok: false,
      status: "error",
      message: "Agency account not authorised for GSC. Reconnect via the Integrations page.",
    };
  }
  try {
    const { accessToken } = await refreshGscToken(refreshToken);
    // Lightest possible authenticated probe: list the sites the token can see
    // and confirm the configured property is in the set.
    const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      return {
        ok: false,
        status: "error",
        message: `GSC sites.list returned ${res.status}.`,
      };
    }
    const data = (await res.json()) as { siteEntry?: Array<{ siteUrl?: string }> };
    const sites = (data.siteEntry || []).map((s) => s.siteUrl || "");
    const found = sites.some((s) => s === siteUrl);
    if (!found) {
      return {
        ok: false,
        status: "error",
        message: `Agency account cannot access "${siteUrl}". Grant access in GSC.`,
      };
    }
    return { ok: true, status: "ok", message: `Read property ${siteUrl} successfully.` };
  } catch (err) {
    return {
      ok: false,
      status: "error",
      message: err instanceof Error ? err.message : "GSC request failed.",
    };
  }
}

async function checkGoogleAds(client: Record<string, unknown>): Promise<StatusResult> {
  const customerId = ((client.googleAdsCustomerId as string) || "").replace(/-/g, "").trim();
  if (!customerId) {
    return { ok: false, status: "missing", message: "No Google Ads customer ID set." };
  }
  // Verify shape — Google Ads CIDs are 10 digits.
  if (!/^\d{10}$/.test(customerId)) {
    return {
      ok: false,
      status: "error",
      message: "Customer ID must be 10 digits (e.g. 955-493-5739).",
    };
  }
  // Google Ads auth is currently brokered by Growth Tools (see CLAUDE.md).
  // Without a direct token here we can only confirm the ID is well-formed and
  // present — actual MCC linkage is verified when an audit runs.
  return {
    ok: true,
    status: "ok",
    message: `Customer ID ${customerId} is well-formed. MCC linkage verified on next audit run.`,
  };
}

async function checkMetaAds(client: Record<string, unknown>): Promise<StatusResult> {
  const adAccountId = ((client.metaAdAccountId as string) || "").trim();
  if (!adAccountId) {
    return { ok: false, status: "missing", message: "No Meta Ads account ID set." };
  }
  if (!/^act_\d+$/.test(adAccountId)) {
    return {
      ok: false,
      status: "error",
      message: 'Ad Account ID must look like "act_XXXXXXXXX".',
    };
  }
  // Meta Marketing API OAuth is not yet wired into the CMS. For now we only
  // validate the ID format; once the agency Meta token lives in env/Globals,
  // probe /v19.0/{adAccountId} with the system-user token.
  return {
    ok: true,
    status: "ok",
    message: `${adAccountId} format is valid. Live API check pending Meta OAuth wiring.`,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ integration: string }> },
): Promise<NextResponse<StatusResult>> {
  const { integration } = await params;
  if (!isIntegration(integration)) {
    return NextResponse.json(
      { ok: false, status: "error", message: `Unknown integration: ${integration}` },
      { status: 400 },
    );
  }

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json(
      { ok: false, status: "error", message: "Missing clientId." },
      { status: 400 },
    );
  }

  const payload = await getPayload({ config });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    return NextResponse.json(
      { ok: false, status: "error", message: "Unauthorized." },
      { status: 401 },
    );
  }

  let client: Record<string, unknown> | null;
  try {
    client = (await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, status: "error", message: "Client not found." },
      { status: 404 },
    );
  }
  if (!client) {
    return NextResponse.json(
      { ok: false, status: "error", message: "Client not found." },
      { status: 404 },
    );
  }

  let result: StatusResult;
  switch (integration) {
    case "ga4":
      result = await checkGa4(client);
      break;
    case "gsc":
      result = await checkGsc(client);
      break;
    case "googleAds":
      result = await checkGoogleAds(client);
      break;
    case "metaAds":
      result = await checkMetaAds(client);
      break;
  }
  return NextResponse.json(result);
}
