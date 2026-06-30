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
 * Keywords are added ENABLED via Growth Tools with `matchExisting`, so each
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
 *   autoExactFromCandidates?: boolean, // target each candidate's matching exact campaign/ad group
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
    autoExactFromCandidates?: boolean;
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
  const autoExactFromCandidates = body.autoExactFromCandidates === true;
  if (!body.allAdGroups && explicitIds.length === 0 && !autoExactFromCandidates) {
    return NextResponse.json({ error: "adGroupIds, allAdGroups, or autoExactFromCandidates is required" }, { status: 400 });
  }
  const negateSource = body.negateSource !== false;
  const overrides = body.overrides ?? {};

  // ── Load candidates (pending review opportunities or dismissed rows) ───────
  const candidates: any[] = [];
  for (const id of candidateIds) {
    const c = await (payload.findByID as any)({
      collection: "match-type-violation-candidates",
      id,
      depth: 1,
      overrideAccess: true,
    }).catch(() => null);
    if (c && (c.status === "pending" || c.status === "rejected") && !c.addedAsKeywordAt) candidates.push(c);
  }
  if (candidates.length === 0) {
    return NextResponse.json({ error: "No eligible candidates found" }, { status: 400 });
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

  const keywordOf = (c: any): string =>
    String(overrides[String(c.id)] ?? c.searchTerm ?? "").trim();

  function campaignLooksExact(name: string): boolean {
    const normalised = name.toLowerCase();
    return /\bexact\b/.test(normalised) || /\bem\b/.test(normalised);
  }

  function campaignLooksPhrase(name: string): boolean {
    const normalised = name.toLowerCase();
    return /\bphrase\b/.test(normalised) || /\bpm\b/.test(normalised);
  }

  function exactCampaignEquivalent(name: string): string {
    return name
      .replace(/\bphrase\b/gi, "Exact")
      .replace(/\bpm\b/g, "EM")
      .replace(/\bPM\b/g, "EM");
  }

  type KeywordTarget = { adGroupId: string; adGroupName: string; campaignName?: string };

  function chooseExactTarget(candidate: any): KeywordTarget | null {
    const adGroupName = String(candidate.adGroupName ?? "").trim();
    const campaignName = String(candidate.campaignName ?? "").trim();
    if (!adGroupName) return null;
    const nameMatches = adGroups.filter(
      (g) => g.adGroupId && String(g.adGroupName ?? "").toLowerCase() === adGroupName.toLowerCase(),
    );
    const enabledMatches = nameMatches.filter((g) => String(g.status ?? "ENABLED").toUpperCase() !== "REMOVED");
    const matches = enabledMatches.length > 0 ? enabledMatches : nameMatches;
    const exactEquivalent = exactCampaignEquivalent(campaignName).toLowerCase();
    const target =
      matches.find((g) => String(g.campaignName ?? "").toLowerCase() === exactEquivalent) ??
      matches.find((g) => campaignLooksExact(String(g.campaignName ?? "")) && !campaignLooksPhrase(String(g.campaignName ?? ""))) ??
      matches.find((g) => String(g.campaignName ?? "").toLowerCase() === campaignName.toLowerCase()) ??
      matches[0];
    return target?.adGroupId
      ? {
          adGroupId: String(target.adGroupId),
          adGroupName: String(target.adGroupName ?? adGroupName),
          campaignName: String(target.campaignName ?? ""),
        }
      : null;
  }

  const candidateTargets = new Map<string, KeywordTarget[]>();
  if (autoExactFromCandidates) {
    for (const candidate of candidates) {
      const target = chooseExactTarget(candidate);
      if (target) candidateTargets.set(String(candidate.id), [target]);
    }
  } else {
    let targets: KeywordTarget[];
    if (body.allAdGroups) {
      targets = adGroups
        .filter((g) => g.adGroupId && String(g.status ?? "").toUpperCase() === "ENABLED")
        .map((g) => ({
          adGroupId: String(g.adGroupId),
          adGroupName: String(g.adGroupName ?? ""),
          campaignName: String(g.campaignName ?? ""),
        }));
    } else {
      const byId = new Map(adGroups.map((g) => [String(g.adGroupId ?? ""), g]));
      targets = explicitIds.map((agid) => ({
        adGroupId: agid,
        adGroupName: String(byId.get(agid)?.adGroupName ?? agid),
        campaignName: String(byId.get(agid)?.campaignName ?? ""),
      }));
    }
    for (const candidate of candidates) candidateTargets.set(String(candidate.id), targets);
  }
  if (![...candidateTargets.values()].some((targets) => targets.length > 0)) {
    return NextResponse.json({ error: "No target ad groups resolved" }, { status: 400 });
  }

  // ── Push: batch candidate terms by resolved target ad group ─────────────────
  const targetBatches = new Map<string, { target: KeywordTarget; texts: Set<string> }>();
  for (const candidate of candidates) {
    const text = keywordOf(candidate);
    if (!text) continue;
    for (const target of candidateTargets.get(String(candidate.id)) ?? []) {
      const targetKey = target.adGroupId;
      if (!targetBatches.has(targetKey)) targetBatches.set(targetKey, { target, texts: new Set() });
      targetBatches.get(targetKey)!.texts.add(text);
    }
  }

  const addedByTextTarget = new Set<string>();
  const duplicateByTextTarget = new Set<string>();
  const groupErrors: Array<{ adGroupName: string; error: string }> = [];

  for (const { target, texts } of targetBatches.values()) {
    const textList = Array.from(texts);
    for (let i = 0; i < textList.length; i += MAX_KEYWORDS_PER_REQUEST) {
      const chunk = textList.slice(i, i + MAX_KEYWORDS_PER_REQUEST);
      const addRes = await postGrowthTools(
        `/api/google-ads/ad-groups/${encodeURIComponent(target.adGroupId)}/keywords/add`,
        {
          customerId,
          keywords: chunk.map((text) => ({ text, matchType: "EXACT" })),
          status: "ENABLED",
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
        if (dupSet.has(key)) duplicateByTextTarget.add(`${key}\u0000${target.adGroupId}`);
        else if (!errSet.has(key)) addedByTextTarget.add(`${key}\u0000${target.adGroupId}`);
      }
    }
  }

  const addedTexts = new Set([...addedByTextTarget].map((key) => key.split("\u0000")[0]));
  const duplicateTexts = new Set([...duplicateByTextTarget].map((key) => key.split("\u0000")[0]));
  const targetSummaries = Array.from(targetBatches.values()).map(({ target, texts }) => {
    const textList = Array.from(texts);
    const addedKeywords = textList.filter((text) => addedByTextTarget.has(`${text.toLowerCase()}\u0000${target.adGroupId}`));
    const skippedKeywords = textList.filter((text) => duplicateByTextTarget.has(`${text.toLowerCase()}\u0000${target.adGroupId}`));
    return {
      adGroupId: target.adGroupId,
      adGroupName: target.adGroupName,
      campaignName: target.campaignName ?? "",
      selected: textList.length,
      added: addedKeywords.length,
      alreadyExists: skippedKeywords.length,
      addedKeywords: addedKeywords.map((keyword) => ({ keyword, matchType: "EXACT" })),
      skippedKeywords: skippedKeywords.map((keyword) => ({ keyword, matchType: "EXACT" })),
    };
  });

  // ── Negate each term in its candidate's own ad-group list ─────────────────
  const now = new Date().toISOString();
  const userId = typeof user.id === "object" ? (user.id as any).id : user.id;
  let negated = 0;
  let skippedSourceNegatives = 0;
  const negateErrors: string[] = [];

  function shouldNegateSource(candidate: any, targets: KeywordTarget[]): boolean {
    const sourceCampaign = String(candidate.campaignName ?? "").trim().toLowerCase();
    const sourceAdGroup = String(candidate.adGroupName ?? "").trim().toLowerCase();
    if (!sourceCampaign || !sourceAdGroup) return false;
    return targets.some((target) => {
      const targetCampaign = String(target.campaignName ?? "").trim().toLowerCase();
      const targetAdGroup = String(target.adGroupName ?? "").trim().toLowerCase();
      return targetCampaign !== sourceCampaign || targetAdGroup !== sourceAdGroup;
    });
  }

  const results: Array<{ id: string | number; outcome: string }> = [];
  for (const c of candidates) {
    const text = keywordOf(c);
    const key = text.toLowerCase();
    const targets = candidateTargets.get(String(c.id)) ?? [];
    const succeededForCandidate = targets.some((target) => addedByTextTarget.has(`${key}\u0000${target.adGroupId}`));
    const duplicatedForCandidate = targets.length > 0 && targets.every((target) => duplicateByTextTarget.has(`${key}\u0000${target.adGroupId}`));
    const outcome = succeededForCandidate
      ? "added"
      : duplicatedForCandidate
        ? "already_exists"
        : null;
    if (!outcome) {
      results.push({ id: c.id, outcome: "error" });
      continue;
    }

    if (negateSource && text) {
      if (shouldNegateSource(c, targets)) {
        try {
          const neg = await negateExactInOwnList(payload, c, text);
          if (!neg.alreadyPresent) negated++;
        } catch (err) {
          negateErrors.push(`"${text}": ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        skippedSourceNegatives++;
      }
    }

    const updateData: Record<string, unknown> = {
      addedAsKeywordAt: now,
      addedAsKeywordOutcome: outcome,
    };
    if (c.status === "pending") {
      updateData.status = "approved";
      updateData.approvedAt = now;
      updateData.approvedBy = userId;
    }
    await (payload.update as any)({
      collection: "match-type-violation-candidates",
      id: c.id,
      data: updateData,
      overrideAccess: true,
    });
    results.push({ id: c.id, outcome });
  }

  const actioned = results.filter((r) => r.outcome !== "error").length;
  if (actioned === 0) {
    const reason = groupErrors[0]?.error ?? negateErrors[0] ?? "Growth Tools reported no added or duplicate keywords";
    return NextResponse.json(
      {
        error: `No exact keywords were added: ${reason}`,
        actioned,
        added: addedTexts.size,
        alreadyExists: duplicateTexts.size,
        negated,
        skippedSourceNegatives,
        results,
        targetSummaries,
        groupErrors,
        negateErrors,
      },
      { status: 502 },
    );
  }

  if (actioned > 0) {
    await logActivity(payload, {
      type: "match_type_violation_keyword_added",
      title: `Bulk pushed ${actioned} selected term${actioned === 1 ? "" : "s"} as exact keywords`,
      description:
        `Targets: ${autoExactFromCandidates ? "matching exact campaign/ad group per candidate" : body.allAdGroups ? `all ${targetBatches.size} enabled ad groups` : `${targetBatches.size} selected ad group${targetBatches.size === 1 ? "" : "s"}`}. ` +
        `${addedTexts.size} added (EXACT, paused, matched URLs/CPC/labels), ${duplicateTexts.size} already existed.` +
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
    skippedSourceNegatives,
    results,
    targetSummaries,
    groupErrors,
    negateErrors,
  });
}
