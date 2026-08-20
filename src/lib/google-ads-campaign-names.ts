interface AttributionRow {
  key: string;
  sessions: number;
  conversions: number;
  conversionRate: number;
}

interface CampaignNameCacheEntry {
  expiresAt: number;
  names: Map<string, string>;
}

const campaignNameCache = new Map<string, CampaignNameCacheEntry>();
const CACHE_MS = 5 * 60 * 1000;

export function labelCampaignIds(
  rows: AttributionRow[],
  names: ReadonlyMap<string, string>,
): AttributionRow[] {
  return rows.map((row) => {
    const parts = row.key.split(" / ");
    const campaignIndex = parts.findIndex((part) => /^\d{6,20}$/.test(part));
    if (campaignIndex < 0) return row;

    const campaignName = names.get(parts[campaignIndex]);
    if (!campaignName) return row;
    parts[campaignIndex] = campaignName;
    return { ...row, key: parts.join(" / ") };
  });
}

export async function loadGoogleAdsCampaignNames(customerId: string): Promise<Map<string, string>> {
  const normalisedCustomerId = customerId.replace(/-/g, "");
  if (!/^\d{10}$/.test(normalisedCustomerId)) return new Map();

  const cached = campaignNameCache.get(normalisedCustomerId);
  if (cached && cached.expiresAt > Date.now()) return cached.names;

  const baseUrl = process.env.GROWTH_TOOLS_URL?.replace(/\/$/, "");
  const apiKey = process.env.INTERNAL_API_KEY;
  if (!baseUrl || !apiKey) return new Map();

  try {
    const response = await fetch(`${baseUrl}/api/google-ads/campaign-budgets/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": apiKey },
      body: JSON.stringify({ customerId: normalisedCustomerId, dateRange: "LAST_30_DAYS" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return new Map();

    const body = (await response.json()) as { campaigns?: unknown[] };
    const names = new Map<string, string>();
    for (const entry of Array.isArray(body.campaigns) ? body.campaigns : []) {
      if (!entry || typeof entry !== "object") continue;
      const campaign = entry as Record<string, unknown>;
      const id = String(campaign.campaignId ?? "");
      const name = String(campaign.campaignName ?? "").trim().slice(0, 200);
      if (/^\d{6,20}$/.test(id) && name) names.set(id, name);
    }

    campaignNameCache.set(normalisedCustomerId, { expiresAt: Date.now() + CACHE_MS, names });
    return names;
  } catch (error) {
    console.error("[landing-dashboard] campaign names unavailable:", error);
    return new Map();
  }
}
