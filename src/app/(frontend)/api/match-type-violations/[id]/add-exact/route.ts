import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface AdGroupRow {
  adGroupId?: string;
  adGroupName?: string;
  campaignName?: string;
}

interface KeywordsAddResult {
  added?: number;
  skippedDuplicates?: number;
  errors?: Array<{ text?: string; error?: string }>;
}

async function postGrowthTools(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return { ok: false, error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY is not configured" };
  }
  let res: Response;
  try {
    res = await fetch(`${GROWTH_TOOLS_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return { ok: false, error: `Network error calling Growth Tools ${path}: ${(err as Error).message}` };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const errMsg =
      parsed && typeof parsed === "object" && (parsed as { error?: unknown }).error
        ? String((parsed as { error?: unknown }).error)
        : `Growth Tools HTTP ${res.status}`;
    return { ok: false, error: errMsg };
  }
  return { ok: true, data: parsed };
}

/**
 * POST /api/match-type-violations/[id]/add-exact
 *
 * Dismissed-tab action: adds a rejected candidate's search term as an EXACT
 * positive keyword via Growth Tools, with `matchExisting: true` so each new
 * keyword copies the final URLs, max CPC, and labels of an exemplar keyword
 * already in the target ad group (keywords land PAUSED; server-side
 * duplicates are skipped).
 *
 * Body:
 *   - `keyword?`: override text (defaults to the search term)
 *   - `adGroupIds?: string[]` — push to these ad groups; when omitted the
 *     candidate's own ad group is resolved by name
 *   - `skip?: true` — reviewed, not wanted as a keyword
 *
 * Outcome stamped on the candidate so it stops appearing in the tab:
 *   - `added`: created in at least one ad group
 *   - `already_exists`: duplicate everywhere it was pushed
 *   - `skipped`
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    keyword?: string;
    skip?: boolean;
    adGroupIds?: Array<string | number>;
  };

  const candidate = await (payload.findByID as any)({
    collection: "match-type-violation-candidates",
    id,
    depth: 1,
    overrideAccess: true,
  }).catch(() => null);

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  if ((candidate as { status?: string }).status !== "rejected") {
    return NextResponse.json(
      { error: "Only dismissed (rejected) candidates can be actioned here" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const userId = typeof user.id === "object" ? (user.id as any).id : user.id;
  const clientId =
    typeof (candidate as any).client === "object"
      ? (candidate as any).client?.id
      : (candidate as any).client;

  // ── Skip: reviewed but not wanted as a keyword ────────────────────────────
  if (body.skip) {
    await (payload.update as any)({
      collection: "match-type-violation-candidates",
      id,
      data: { addedAsKeywordAt: now, addedAsKeywordOutcome: "skipped" },
      overrideAccess: true,
    });
    return NextResponse.json({ ok: true, outcome: "skipped" });
  }

  const keywordText = (body.keyword ?? (candidate as any).searchTerm ?? "").trim();
  if (!keywordText) {
    return NextResponse.json({ error: "No keyword text" }, { status: 400 });
  }

  // ── Resolve the client's Google Ads customer ID ───────────────────────────
  const clientDoc =
    typeof (candidate as any).client === "object"
      ? (candidate as any).client
      : await (payload.findByID as any)({
          collection: "clients",
          id: clientId,
          depth: 0,
          overrideAccess: true,
        }).catch(() => null);

  const customerId = String(clientDoc?.googleAdsCustomerId ?? "").replace(/-/g, "");
  if (!customerId) {
    return NextResponse.json(
      { error: "Client has no Google Ads customer ID" },
      { status: 400 },
    );
  }

  // ── Resolve target ad group IDs ───────────────────────────────────────
  // Explicit selection wins; otherwise fall back to the candidate's own
  // ad group resolved by name (candidates only store names, not IDs).
  let targets: Array<{ adGroupId: string; adGroupName: string; campaignName: string }> = [];

  const explicitIds = Array.isArray(body.adGroupIds)
    ? body.adGroupIds.map((v) => String(v).trim()).filter(Boolean)
    : [];

  const adGroupName = String((candidate as any).adGroupName ?? "").trim();
  const campaignName = String((candidate as any).campaignName ?? "").trim();

  const listRes = await postGrowthTools("/api/google-ads/ad-groups/list", { customerId });
  if (!listRes.ok) {
    return NextResponse.json(
      { error: `Failed to list ad groups: ${listRes.error}` },
      { status: 502 },
    );
  }
  const adGroups: AdGroupRow[] = Array.isArray((listRes.data as any)?.adGroups)
    ? (listRes.data as any).adGroups
    : [];

  if (explicitIds.length > 0) {
    const byId = new Map(adGroups.map((g) => [String(g.adGroupId ?? ""), g]));
    targets = explicitIds.map((agid) => {
      const g = byId.get(agid);
      return {
        adGroupId: agid,
        adGroupName: String(g?.adGroupName ?? agid),
        campaignName: String(g?.campaignName ?? ""),
      };
    });
  } else {
    if (!adGroupName) {
      return NextResponse.json(
        { error: "Candidate has no ad group name to add the keyword to" },
        { status: 400 },
      );
    }
    const nameMatches = adGroups.filter(
      (g) => String(g.adGroupName ?? "").toLowerCase() === adGroupName.toLowerCase(),
    );
    // Prefer a campaign-name match when the same ad-group name exists in
    // multiple campaigns.
    const adGroup =
      nameMatches.find(
        (g) => String(g.campaignName ?? "").toLowerCase() === campaignName.toLowerCase(),
      ) ?? nameMatches[0];

    if (!adGroup?.adGroupId) {
      return NextResponse.json(
        { error: `Ad group "${adGroupName}" not found in account ${customerId}` },
        { status: 404 },
      );
    }
    targets = [{
      adGroupId: String(adGroup.adGroupId),
      adGroupName: String(adGroup.adGroupName ?? adGroupName),
      campaignName: String(adGroup.campaignName ?? campaignName),
    }];
  }

  // ── Add the keyword as EXACT to each target ad group ─────────────────────
  // matchExisting: Growth Tools copies the final URLs, max CPC, and labels of
  // an exemplar keyword already in each ad group. Duplicates skipped, PAUSED.
  let added = 0;
  let skippedDuplicates = 0;
  const perGroup: Array<{ adGroupId: string; adGroupName: string; added: number; skippedDuplicates: number; error?: string }> = [];

  for (const target of targets) {
    const addRes = await postGrowthTools(
      `/api/google-ads/ad-groups/${encodeURIComponent(target.adGroupId)}/keywords/add`,
      { customerId, keywords: [{ text: keywordText, matchType: "EXACT" }], matchExisting: true },
    );
    if (!addRes.ok) {
      perGroup.push({ adGroupId: target.adGroupId, adGroupName: target.adGroupName, added: 0, skippedDuplicates: 0, error: addRes.error });
      continue;
    }
    const result = (addRes.data ?? {}) as KeywordsAddResult;
    const groupAdded = Number(result.added ?? 0);
    const groupSkipped = Number(result.skippedDuplicates ?? 0);
    const errors = Array.isArray(result.errors) ? result.errors : [];
    added += groupAdded;
    skippedDuplicates += groupSkipped;
    perGroup.push({
      adGroupId: target.adGroupId,
      adGroupName: target.adGroupName,
      added: groupAdded,
      skippedDuplicates: groupSkipped,
      ...(groupAdded === 0 && groupSkipped === 0 && errors[0]?.error ? { error: errors[0].error } : {}),
    });
  }

  if (added === 0 && skippedDuplicates === 0) {
    const reason = perGroup.find((g) => g.error)?.error ?? "Growth Tools reported nothing added and no duplicates";
    return NextResponse.json({ error: `Keyword not added: ${reason}`, perGroup }, { status: 502 });
  }

  const outcome = added > 0 ? "added" : "already_exists";

  await (payload.update as any)({
    collection: "match-type-violation-candidates",
    id,
    data: { addedAsKeywordAt: now, addedAsKeywordOutcome: outcome },
    overrideAccess: true,
  });

  const targetSummary = perGroup
    .map((g) => `"${g.adGroupName}" (${g.added > 0 ? "added" : g.skippedDuplicates > 0 ? "duplicate" : g.error ?? "failed"})`)
    .join(", ");

  await logActivity(payload, {
    type: "match_type_violation_keyword_added",
    title:
      outcome === "added"
        ? `Dismissed term added as exact keyword: "${keywordText}"`
        : `Dismissed term already an exact keyword: "${keywordText}"`,
    description: `Pushed PAUSED with matched URLs/CPC/labels to ${targets.length} ad group${targets.length === 1 ? "" : "s"}: ${targetSummary}`,
    user: userId,
    client: clientId,
  });

  return NextResponse.json({ ok: true, outcome, added, skippedDuplicates, perGroup });
}
