import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export const dynamic = "force-dynamic";

/**
 * GET /api/landing/v1/ad-group-scaffold?client=<id>
 *
 * Produces a starting ad-groups.json for a client's landing-page repository:
 * each enabled ad group with the keywords that ad group actually bids on.
 *
 * This is a build-time authoring aid, not a runtime endpoint. Landing pages
 * never call it — a human runs it, reviews the copy, and commits the result,
 * because generated ad copy that nobody read is how a landing page ends up
 * promising something the business does not do.
 *
 * Requires a Payload session: it reaches Google Ads data through Growth Tools
 * and must not be reachable by an anonymous caller.
 */

/** Read at call time rather than module load, so configuration is picked up per request. */
function growthToolsConfig() {
  return {
    baseUrl: process.env.GROWTH_TOOLS_URL,
    apiKey: process.env.INTERNAL_API_KEY,
  };
}

/** Cap the response so one large account cannot produce an unusable file. */
const MAX_AD_GROUPS = 100;
const MAX_KEYWORDS_PER_GROUP = 10;

interface AdGroupRow {
  adGroupId?: string;
  adGroupName?: string;
  campaignName?: string;
  status?: string;
  campaignStatus?: string;
  campaignEndDate?: string;
}

interface KeywordRow {
  adGroupId?: string;
  adGroupName?: string;
  text?: string;
  matchType?: string;
}

/** Slugify an ad-group name into the filename-safe form the generator accepts. */
export function slugifyAdGroup(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Collect keyword rows from Growth Tools' nested response shapes. */
function collectKeywordRows(payload: unknown, rows: KeywordRow[] = []): KeywordRow[] {
  if (Array.isArray(payload)) {
    for (const entry of payload) collectKeywordRows(entry, rows);
    return rows;
  }
  if (!payload || typeof payload !== "object") return rows;

  const record = payload as Record<string, unknown>;
  if (typeof record.text === "string") {
    rows.push({
      adGroupId: record.adGroupId ? String(record.adGroupId) : undefined,
      adGroupName: record.adGroupName ? String(record.adGroupName) : undefined,
      text: record.text,
      matchType: record.matchType ? String(record.matchType) : undefined,
    });
    return rows;
  }
  for (const key of ["keywords", "rows", "data", "results"]) {
    if (record[key]) collectKeywordRows(record[key], rows);
  }
  return rows;
}

async function growthTools(path: string, body: unknown): Promise<unknown | null> {
  const { baseUrl, apiKey } = growthToolsConfig();
  if (!baseUrl || !apiKey) return null;
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config: await config });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("client");
  if (!clientId) return NextResponse.json({ error: "client is required" }, { status: 400 });

  const { baseUrl, apiKey } = growthToolsConfig();
  if (!baseUrl || !apiKey) {
    return NextResponse.json({ error: "Growth Tools is not configured" }, { status: 503 });
  }

  const clientDoc = await payload
    .findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true })
    .catch(() => null);

  const customerId = String(
    (clientDoc as { googleAdsCustomerId?: unknown } | null)?.googleAdsCustomerId ?? ""
  ).replace(/-/g, "");
  if (!customerId) {
    return NextResponse.json({ error: "Client has no Google Ads customer ID" }, { status: 400 });
  }

  const [adGroupData, keywordData] = await Promise.all([
    growthTools("/api/google-ads/ad-groups/list", { customerId }),
    growthTools("/api/google-ads/keywords/list", { customerId }),
  ]);

  if (!adGroupData) {
    return NextResponse.json({ error: "Could not read ad groups from Growth Tools" }, { status: 502 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const adGroups: AdGroupRow[] = Array.isArray((adGroupData as { adGroups?: unknown }).adGroups)
    ? ((adGroupData as { adGroups: AdGroupRow[] }).adGroups)
    : [];

  const keywordsByAdGroup = new Map<string, string[]>();
  for (const row of collectKeywordRows(keywordData)) {
    const key = row.adGroupId ?? row.adGroupName;
    if (!key || !row.text) continue;
    const list = keywordsByAdGroup.get(key) ?? [];
    if (!list.includes(row.text)) list.push(row.text);
    keywordsByAdGroup.set(key, list);
  }

  const seenSlugs = new Set<string>();
  const entries = adGroups
    .filter((group) => {
      if (!group.adGroupId || !group.adGroupName) return false;
      if (String(group.status ?? "").toUpperCase() !== "ENABLED") return false;
      if (String(group.campaignStatus ?? "ENABLED").toUpperCase() !== "ENABLED") return false;
      const endDate = String(group.campaignEndDate ?? "").trim();
      return !endDate || endDate >= today;
    })
    .slice(0, MAX_AD_GROUPS)
    .map((group) => {
      const name = String(group.adGroupName);
      let slug = slugifyAdGroup(name) || `ad-group-${group.adGroupId}`;
      // Two ad groups can share a name across campaigns; slugs must stay unique
      // because they become filenames.
      if (seenSlugs.has(slug)) slug = `${slug}-${group.adGroupId}`.slice(0, 60);
      seenSlugs.add(slug);

      const keywords = (keywordsByAdGroup.get(String(group.adGroupId)) ?? keywordsByAdGroup.get(name) ?? [])
        .slice(0, MAX_KEYWORDS_PER_GROUP);

      return {
        slug,
        adGroupId: String(group.adGroupId),
        adGroupName: name,
        campaignName: String(group.campaignName ?? ""),
        keywords,
        // Left blank on purpose. Copy is a human decision: the primary keyword
        // should read naturally in a real sentence, and repeating it to hit a
        // crawler is both against Google's guidance and worse for the visitor.
        variant: "a",
        title: "",
        description: "",
        headline: "",
        lede: "",
        ctaLabel: "",
      };
    });

  return NextResponse.json(
    {
      client: { id: clientId, customerId },
      generatedAt: new Date().toISOString(),
      adGroupsFound: adGroups.length,
      truncated: adGroups.length > MAX_AD_GROUPS,
      keywordsUnavailable: keywordData === null,
      adGroups: entries,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
