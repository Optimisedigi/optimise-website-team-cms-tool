import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";
import { negateExactInOwnList } from "@/lib/match-type-exact-negate";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const MAX_KEYWORDS_PER_REQUEST = 200;

interface AdGroupRow {
  adGroupId?: string;
  adGroupName?: string;
  campaignName?: string;
  status?: string;
}

interface KeywordsAddResult {
  added?: number;
  skippedDuplicates?: number;
  duplicates?: Array<{ text?: string; matchType?: string }>;
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
 * POST /api/match-type-violations/add-exact-bulk
 *
 * Bulk Dismissed-tab action: pushes many dismissed terms as EXACT positive
 * keywords to a set of ad groups (or every enabled ad group) in one pass.
 * Keywords are added PAUSED via Growth Tools with `matchExisting`, so each
 * copies the final URLs, max CPC, and labels of an exemplar keyword in its
 * target ad group; server-side duplicates are skipped.
 *
 * When `negateSource` (default true), each term is also added as an EXACT
 * negative to its candidate's own ad-group negative keyword list — so the
 * original phrase/exact match stops serving the term and traffic funnels to
 * the new exact keyword.
 *
 * Body: {
 *   candidateIds: (string|number)[],
 *   adGroupIds?: string[],        // explicit targets
 *   allAdGroups?: boolean,        // or: every ENABLED ad group
 *   negateSource?: boolean,       // default true
 *   overrides?: Record<string, string>,  // candidateId -> keyword text
 * }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    candidateIds?: Array<string | number>;
    adGroupIds?: Array<string | number>;
    allAdGroups?: boolean;
    negateSource?: boolean;
    overrides?: Record<string, string>;
  };

  const candidateIds = Array.isArray(body.candidateIds) ? body.candidateIds : [];
  if (candidateIds.length === 0) {
    return NextResponse.json({ error: "candidateIds must be a non-empty array" }, { status: 400 });
  }
  const explicitIds = Array.isArray(body.adGroupIds)
    ? body.adGroupIds.map((v) => String(v).trim()).filter(Boolean)
    : [];
  if (!body.allAdGroups && explicitIds.length === 0) {
    return NextResponse.json({ error: "adGroupIds or allAdGroups is required" }, { status: 400 });
  }
  const negateSource = body.negateSource !== false;
  const overrides = body.overrides ?? {};

  // ── Load candidates (rejected + not yet actioned only) ────────────────────
  const candidates: any[] = [];
  for (const id of candidateIds) {
    const c = await (payload.findByID as any)({
      collection: "match-type-violation-candidates",
      id,
      depth: 1,
      overrideAccess: true,
    }).catch(() => null);
    if (c && c.status === "rejected" && !c.addedAsKeywordAt) candidates.push(c);
  }
  if (candidates.length === 0) {
    return NextResponse.json({ error: "No eligible dismissed candidates found" }, { status: 400 });
  }

  // ── Resolve customer ID (all candidates share the view's client) ──────────
  const first = candidates[0];
  const clientId = typeof first.client === "object" ? first.client?.id : first.client;
  const clientDoc =
    typeof first.client === "object"
      ? first.client
      : await (payload.findByID as any)({
          collection: "clients",
          id: clientId,
          depth: 0,
          overrideAccess: true,
        }).catch(() => null);
  const customerId = String(clientDoc?.googleAdsCustomerId ?? "").replace(/-/g, "");
  if (!customerId) {
    return NextResponse.json({ error: "Client has no Google Ads customer ID" }, { status: 400 });
  }

  // ── Resolve target ad groups ───────────────────────────────────────────────
  const listRes = await postGrowthTools("/api/google-ads/ad-groups/list", { customerId });
  if (!listRes.ok) {
    return NextResponse.json({ error: `Failed to list ad groups: ${listRes.error}` }, { status: 502 });
  }
  const adGroups: AdGroupRow[] = Array.isArray((listRes.data as any)?.adGroups)
    ? (listRes.data as any).adGroups
    : [];

  let targets: Array<{ adGroupId: string; adGroupName: string }>;
  if (body.allAdGroups) {
    targets = adGroups
      .filter((g) => g.adGroupId && String(g.status ?? "").toUpperCase() === "ENABLED")
      .map((g) => ({ adGroupId: String(g.adGroupId), adGroupName: String(g.adGroupName ?? "") }));
  } else {
    const byId = new Map(adGroups.map((g) => [String(g.adGroupId ?? ""), g]));
    targets = explicitIds.map((agid) => ({
      adGroupId: agid,
      adGroupName: String(byId.get(agid)?.adGroupName ?? agid),
    }));
  }
  if (targets.length === 0) {
    return NextResponse.json({ error: "No target ad groups resolved" }, { status: 400 });
  }

  // ── Push: one Growth Tools call per target ad group, all terms batched ─────
  const keywordOf = (c: any): string =>
    String(overrides[String(c.id)] ?? c.searchTerm ?? "").trim();
  const texts = Array.from(new Set(candidates.map(keywordOf).filter(Boolean)));

  // text -> was it added in at least one ad group / duplicate somewhere
  const addedTexts = new Set<string>();
  const duplicateTexts = new Set<string>();
  const groupErrors: Array<{ adGroupName: string; error: string }> = [];

  for (const target of targets) {
    for (let i = 0; i < texts.length; i += MAX_KEYWORDS_PER_REQUEST) {
      const chunk = texts.slice(i, i + MAX_KEYWORDS_PER_REQUEST);
      const addRes = await postGrowthTools(
        `/api/google-ads/ad-groups/${encodeURIComponent(target.adGroupId)}/keywords/add`,
        {
          customerId,
          keywords: chunk.map((text) => ({ text, matchType: "EXACT" })),
          matchExisting: true,
        },
      );
      if (!addRes.ok) {
        groupErrors.push({ adGroupName: target.adGroupName, error: addRes.error });
        continue;
      }
      const result = (addRes.data ?? {}) as KeywordsAddResult;
      const dupSet = new Set(
        (result.duplicates ?? []).map((d) => String(d.text ?? "").toLowerCase()),
      );
      const errSet = new Set(
        (result.errors ?? []).map((e) => String(e.text ?? "").toLowerCase()),
      );
      for (const text of chunk) {
        const key = text.toLowerCase();
        if (dupSet.has(key)) duplicateTexts.add(key);
        else if (!errSet.has(key)) addedTexts.add(key);
      }
    }
  }

  // ── Negate each term in its candidate's own ad-group list ─────────────────
  const now = new Date().toISOString();
  const userId = typeof user.id === "object" ? (user.id as any).id : user.id;
  let negated = 0;
  const negateErrors: string[] = [];

  const results: Array<{ id: string | number; outcome: string }> = [];
  for (const c of candidates) {
    const text = keywordOf(c);
    const key = text.toLowerCase();
    const outcome = addedTexts.has(key)
      ? "added"
      : duplicateTexts.has(key)
        ? "already_exists"
        : null;
    if (!outcome) {
      results.push({ id: c.id, outcome: "error" });
      continue;
    }

    if (negateSource && text) {
      try {
        const neg = await negateExactInOwnList(payload, c, text);
        if (!neg.alreadyPresent) negated++;
      } catch (err) {
        negateErrors.push(`"${text}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await (payload.update as any)({
      collection: "match-type-violation-candidates",
      id: c.id,
      data: { addedAsKeywordAt: now, addedAsKeywordOutcome: outcome },
      overrideAccess: true,
    });
    results.push({ id: c.id, outcome });
  }

  const actioned = results.filter((r) => r.outcome !== "error").length;
  if (actioned > 0) {
    await logActivity(payload, {
      type: "match_type_violation_keyword_added",
      title: `Bulk pushed ${actioned} dismissed term${actioned === 1 ? "" : "s"} as exact keywords`,
      description:
        `Targets: ${body.allAdGroups ? `all ${targets.length} enabled ad groups` : `${targets.length} selected ad group${targets.length === 1 ? "" : "s"}`}. ` +
        `${addedTexts.size} added (paused, matched URLs/CPC/labels), ${duplicateTexts.size} already existed.` +
        (negateSource ? ` ${negated} exact negatives added to source ad-group lists.` : "") +
        (groupErrors.length ? ` ${groupErrors.length} ad-group error(s).` : "") +
        (negateErrors.length ? ` ${negateErrors.length} negate error(s).` : ""),
      user: userId,
      client: clientId,
    });
  }

  return NextResponse.json({
    ok: true,
    actioned,
    added: addedTexts.size,
    alreadyExists: duplicateTexts.size,
    negated,
    results,
    groupErrors,
    negateErrors,
  });
}
