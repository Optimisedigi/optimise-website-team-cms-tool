import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  extractSpreadsheetId,
  readExistingKeywords,
  readSheetLists,
} from "@/lib/sheets-service";
import { logActivity } from "@/lib/activity-log";

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k2";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

interface SweepCandidate {
  searchTerm: string;
  campaignName: string;
  adGroupName: string;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
  matchType: string;
}

/**
 * GET /api/negative-sweep/cron
 * Weekly cron that calls Growth Tools' negative sweep endpoint to get candidates,
 * then uses Kimi AI to classify and suggest smarter negative keywords.
 * Authenticated via CRON_SECRET bearer token.
 *
 * Manual trigger: ?clientId=123&force=true — bypasses weekday check, runs for one client.
 */
export async function GET(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const forceClientId = req.nextUrl.searchParams.get("clientId");
  const force = req.nextUrl.searchParams.get("force") === "true";

  const today = WEEKDAYS[new Date().getDay()];
  const sweepDate = new Date().toISOString().split("T")[0];

  try {
    let clients;

    if (force && forceClientId) {
      // Manual trigger: skip weekday check, run for specific client
      const client = await payload.findByID({
        collection: "clients",
        id: forceClientId,
        overrideAccess: true,
      });
      clients = { docs: client ? [client] : [] };
    } else {
      // Normal cron: find clients with matching weekday
      clients = await payload.find({
        collection: "clients",
        where: {
          "gadsAuto.negativeSweepEnabled": { equals: true },
          "gadsAuto.negativeSweepWeekday": { equals: today },
          isActive: { not_equals: false },
        },
        limit: 100,
        overrideAccess: true,
      });
    }

    const summary: {
      client: string;
      candidatesCreated: number;
      error?: string;
    }[] = [];

    for (const client of clients.docs as any[]) {
      try {
        const result = await processClient(payload, client, sweepDate);
        summary.push({
          client: client.name,
          candidatesCreated: result.created,
        });
      } catch (err: any) {
        console.error(
          `[negative-sweep/cron] Error for ${client.name}:`,
          err?.message || err
        );
        summary.push({
          client: client.name,
          candidatesCreated: 0,
          error: err?.message || String(err),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      date: sweepDate,
      weekday: today,
      clientsProcessed: clients.docs.length,
      summary,
    });
  } catch (err: any) {
    console.error("[negative-sweep/cron]", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Cron failed" },
      { status: 500 }
    );
  }
}

async function processClient(
  payload: any,
  client: any,
  sweepDate: string
): Promise<{ created: number }> {
  const customerId = client.googleAdsCustomerId;
  if (!customerId) {
    throw new Error("No Google Ads customer ID configured");
  }

  const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
  if (!GROWTH_TOOLS_URL) {
    throw new Error("GROWTH_TOOLS_URL not configured");
  }

  // 1. Check for existing candidates from this sweep date
  const existingCandidates = await payload.find({
    collection: "negative-sweep-candidates" as any,
    where: {
      client: { equals: client.id },
      sweepDate: { equals: sweepDate },
    },
    limit: 1,
    overrideAccess: true,
  });

  if (existingCandidates.docs.length > 0) {
    return { created: 0 };
  }

  // 2. Call Growth Tools negative sweep endpoint
  // This fetches search terms + existing campaign negatives in parallel,
  // filters by spend/clicks/conversions, deduplicates, and returns candidates
  const minSpend = client.gadsAuto?.negativeSweepMinSpendThreshold ?? 5;
  const response = await fetch(
    `${GROWTH_TOOLS_URL}/api/google-ads/negative-sweep`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INTERNAL_API_KEY ? { "x-api-key": INTERNAL_API_KEY } : {}),
      },
      body: JSON.stringify({
        customerId: customerId.replace(/-/g, ""),
        minSpend,
        minClicks: 3,
        maxCandidates: 50,
      }),
      signal: AbortSignal.timeout(60_000),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Growth Tools returned ${response.status}: ${text}`);
  }

  const data = await response.json();
  const candidates: SweepCandidate[] = data.candidates || [];

  if (candidates.length === 0) {
    return { created: 0 };
  }

  // 3. Additional filtering: exclude brand keywords and manual exclude terms
  const excludeTermsRaw = client.gadsAuto?.negativeSweepExcludeTerms || "";
  const brandKeywordsRaw = client.brandKeywords || "";

  const excludeSet = new Set(
    [...excludeTermsRaw.split("\n"), ...brandKeywordsRaw.split("\n")]
      .map((t: string) => t.trim().toLowerCase())
      .filter(Boolean)
  );

  const filtered = candidates.filter((c) => {
    const termLower = c.searchTerm.toLowerCase().trim();
    // Skip if any exclude/brand term appears in the search term
    for (const exclude of excludeSet) {
      if (termLower.includes(exclude)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    return { created: 0 };
  }

  // 4. Get sheet lists info (for AI context on available lists)
  let sheetListsInfo: { name: string; column: string; regex: string }[] = [];
  let existingSheetKeywords = new Set<string>();
  const sheetUrl = client.gadsAuto?.negativeSweepSheetUrl;
  if (sheetUrl) {
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (spreadsheetId) {
      try {
        const sheetsAuth = await payload.findGlobal({
          slug: "sheets-auth" as any,
          overrideAccess: true,
        });
        const refreshToken = (sheetsAuth as any).refreshToken;
        if (refreshToken) {
          const lists = await readSheetLists(refreshToken, spreadsheetId);
          sheetListsInfo = lists;
          for (const list of lists) {
            const keywords = await readExistingKeywords(
              refreshToken,
              spreadsheetId,
              list.column
            );
            keywords.forEach((kw) => existingSheetKeywords.add(kw));
          }
        }
      } catch (err) {
        console.warn(
          `[negative-sweep/cron] Could not read sheet for ${client.name}:`,
          err
        );
      }
    }
  }

  // Filter out terms already in the sheet
  const newCandidates = existingSheetKeywords.size > 0
    ? filtered.filter((c) => !existingSheetKeywords.has(c.searchTerm.toLowerCase().trim()))
    : filtered;

  if (newCandidates.length === 0) {
    return { created: 0 };
  }

  // 5. AI classification with Kimi — classifies candidates and suggests
  // smarter negative keywords (e.g. "salary" phrase match instead of "plumber salary" exact)
  const classified = await classifyWithAI(newCandidates, client, sheetListsInfo);

  // 6. Create candidate records
  let created = 0;
  for (const item of classified) {
    if (!item.isCandidate) continue;

    await payload.create({
      collection: "negative-sweep-candidates" as any,
      data: {
        client: client.id,
        searchTerm: item.searchTerm,
        suggestedNegative: item.suggestedNegative || item.searchTerm,
        campaignName: item.campaignName,
        adGroupName: item.adGroupName,
        clicks: item.clicks,
        impressions: item.impressions,
        cost: item.cost,
        conversions: item.conversions,
        status: "pending",
        suggestedList: item.suggestedList || "",
        matchType: item.matchType || "exact",
        aiReasoning: item.reasoning || "",
        sweepDate,
      } as any,
      overrideAccess: true,
    });
    created++;
  }

  logActivity(payload, {
    type: "negative_sweep_completed" as any,
    title: `Negative sweep: ${created} candidates from ${newCandidates.length} terms`,
    description: `Client: ${client.name}`,
    client: client.id,
  }).catch(() => {});

  return { created };
}

interface ClassifiedTerm extends SweepCandidate {
  isCandidate: boolean;
  suggestedNegative?: string;
  suggestedList?: string;
  reasoning?: string;
}

async function classifyWithAI(
  terms: SweepCandidate[],
  client: any,
  sheetLists: { name: string; column: string; regex: string }[]
): Promise<ClassifiedTerm[]> {
  const KIMI_API_KEY = process.env.KIMI_API_KEY;

  if (!KIMI_API_KEY) {
    // Fallback: treat all terms as candidates with the raw search term
    return terms.map((t) => ({
      ...t,
      isCandidate: true,
      suggestedNegative: t.searchTerm,
      reasoning: "AI classification unavailable — flagged by spend/conversion filters",
    }));
  }

  const listsInfo =
    sheetLists.length > 0
      ? sheetLists
          .map((l) => `- ${l.name} (regex: ${l.regex || "none"})`)
          .join("\n")
      : "";

  const termsJson = JSON.stringify(
    terms.map((t) => ({
      searchTerm: t.searchTerm,
      campaign: t.campaignName,
      adGroup: t.adGroupName,
      clicks: t.clicks,
      impressions: t.impressions,
      cost: t.cost,
    }))
  );

  const systemPrompt = [
    "You are a Google Ads negative keyword analyst.",
    "You analyze search terms that are spending money without converting and determine:",
    "1. Whether the term is genuinely irrelevant to the business (true negative) or just underperforming (keep it).",
    "2. The SMARTEST negative keyword to add — not necessarily the exact search term.",
    "",
    "IMPORTANT: Suggest the root irrelevant word or phrase, not the full search term.",
    "Example: If the client is a plumber and the search term is 'plumber salary',",
    "suggest 'salary' as a PHRASE match negative — this blocks 'plumber salary',",
    "'plumbing salary', 'salary for plumbers', etc. in one rule.",
    "",
    "Example: 'free plumbing quotes online' → suggest 'free' as PHRASE match.",
    "Example: 'plumber jobs near me' → suggest 'jobs' as PHRASE match.",
    "Example: 'how to fix a tap DIY' → suggest 'diy' as PHRASE match.",
    "Example: 'best plumber review reddit' → suggest 'reddit' as PHRASE match.",
    "",
    "Only use EXACT match when the root word is too generic and would block good traffic.",
    "Use BROAD match sparingly — only for very clearly irrelevant concepts.",
    "",
    "Return ONLY a valid JSON array, no markdown fences, no explanation.",
  ].join("\n");

  const userMessage = `Client: "${client.name}" (${client.websiteUrl || "unknown website"})
Business description: ${client.businessDescription || client.industry || "Not provided"}

${listsInfo ? `Available negative keyword lists:\n${listsInfo}\n` : ""}
Search terms to analyze (all have spend but zero conversions):
${termsJson}

For each term, return a JSON object with:
- searchTerm: the original search term
- isCandidate: boolean (true = genuinely irrelevant, false = keep/underperforming)
- suggestedNegative: the smarter negative keyword to add (root word/phrase, not the full search term)
- matchType: "exact", "phrase", or "broad"
- suggestedList: which list to add it to (from available lists, or "General")
- reasoning: brief explanation`;

  try {
    const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KIMI_API_KEY}`,
      },
      body: JSON.stringify({
        model: KIMI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[negative-sweep/cron] Kimi API error ${res.status}: ${detail}`);
      throw new Error(`Kimi API error: ${res.status}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    // Strip potential markdown code fences
    const jsonStr = text.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      throw new Error("AI response is not an array");
    }

    // Map back to our type
    return terms.map((t) => {
      const match = parsed.find(
        (p: any) =>
          p.searchTerm?.toLowerCase() === t.searchTerm.toLowerCase()
      );
      return {
        ...t,
        isCandidate: match?.isCandidate ?? true,
        suggestedNegative: match?.suggestedNegative || t.searchTerm,
        suggestedList: match?.suggestedList || "",
        matchType: match?.matchType || "phrase",
        reasoning: match?.reasoning || "",
      };
    });
  } catch (err) {
    console.error("[negative-sweep/cron] AI classification failed:", err);
    // Fallback: flag all as candidates with the raw search term
    return terms.map((t) => ({
      ...t,
      isCandidate: true,
      suggestedNegative: t.searchTerm,
      reasoning: "AI classification failed — flagged by spend/conversion filters",
    }));
  }
}
