import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import { GoogleGenAI } from "@google/genai";
import {
  extractSpreadsheetId,
  readExistingKeywords,
  readSheetLists,
} from "@/lib/sheets-service";
import { logActivity } from "@/lib/activity-log";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

interface SearchTermRow {
  searchTerm: string;
  campaignName: string;
  adGroupName: string;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
}

/**
 * GET /api/negative-sweep/cron
 * Weekly cron that pulls search term data, runs AI analysis, creates candidates.
 * Authenticated via CRON_SECRET bearer token.
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

  const today = WEEKDAYS[new Date().getDay()];
  const sweepDate = new Date().toISOString().split("T")[0];

  try {
    // Find clients with negative sweep enabled and matching weekday
    const clients = await payload.find({
      collection: "clients",
      where: {
        "gadsAuto.negativeSweepEnabled": { equals: true },
        "gadsAuto.negativeSweepWeekday": { equals: today },
        isActive: { not_equals: false },
      },
      limit: 100,
      overrideAccess: true,
    });

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

  // 1. Fetch search term data from Growth Tools
  const response = await fetch(
    `${GROWTH_TOOLS_URL}/api/google-ads/search-terms`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INTERNAL_API_KEY
          ? { "x-api-key": INTERNAL_API_KEY }
          : {}),
      },
      body: JSON.stringify({
        customerId: customerId.replace(/-/g, ""),
        dateRange: "LAST_7_DAYS",
      }),
      signal: AbortSignal.timeout(60_000),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Growth Tools returned ${response.status}: ${text}`);
  }

  const data = await response.json();
  const searchTerms: SearchTermRow[] = data.searchTerms || data.results || [];

  if (searchTerms.length === 0) {
    return { created: 0 };
  }

  // 2. Build exclusion sets
  const minSpend = client.gadsAuto?.negativeSweepMinSpendThreshold ?? 5;
  const excludeTermsRaw = client.gadsAuto?.negativeSweepExcludeTerms || "";
  const brandKeywordsRaw = client.brandKeywords || "";

  const excludeSet = new Set(
    [
      ...excludeTermsRaw.split("\n"),
      ...brandKeywordsRaw.split("\n"),
    ]
      .map((t: string) => t.trim().toLowerCase())
      .filter(Boolean)
  );

  // 3. Get existing keywords from sheet (if configured)
  let existingSheetKeywords = new Set<string>();
  let sheetListsInfo: { name: string; column: string; regex: string }[] = [];
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

  // 4. Check for existing candidates from this sweep date
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
    // Already ran for this date
    return { created: 0 };
  }

  // 5. Filter search terms
  const filtered = searchTerms.filter((term) => {
    const termLower = term.searchTerm.toLowerCase().trim();
    if (excludeSet.has(termLower)) return false;
    if (existingSheetKeywords.has(termLower)) return false;
    if (term.cost < minSpend) return false;
    if (term.conversions > 0) return false; // Don't flag converting terms
    return true;
  });

  if (filtered.length === 0) {
    return { created: 0 };
  }

  // 6. AI classification
  const classified = await classifyWithAI(filtered, client, sheetListsInfo);

  // 7. Create candidate records
  let created = 0;
  for (const item of classified) {
    if (!item.isCandidate) continue;

    await payload.create({
      collection: "negative-sweep-candidates" as any,
      data: {
        client: client.id,
        searchTerm: item.searchTerm,
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
    title: `Negative sweep: ${created} candidates from ${filtered.length} terms`,
    description: `Client: ${client.name}`,
    client: client.id,
  }).catch(() => {});

  return { created };
}

interface ClassifiedTerm extends SearchTermRow {
  isCandidate: boolean;
  suggestedList?: string;
  matchType?: string;
  reasoning?: string;
}

async function classifyWithAI(
  terms: SearchTermRow[],
  client: any,
  sheetLists: { name: string; column: string; regex: string }[]
): Promise<ClassifiedTerm[]> {
  const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!GEMINI_API_KEY) {
    // Fallback: treat all filtered terms as candidates without AI reasoning
    return terms.map((t) => ({
      ...t,
      isCandidate: true,
      reasoning: "AI classification unavailable, flagged by spend/conversion filters",
      matchType: "exact",
    }));
  }

  const listsInfo = sheetLists.length > 0
    ? sheetLists.map((l) => `- ${l.name} (regex: ${l.regex || "none"})`).join("\n")
    : "";

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const termsJson = JSON.stringify(
    terms.map((t) => ({
      searchTerm: t.searchTerm,
      campaign: t.campaignName,
      adGroup: t.adGroupName,
      clicks: t.clicks,
      impressions: t.impressions,
      cost: t.cost,
      conversions: t.conversions,
    }))
  );

  const prompt = `You are a Google Ads negative keyword analyst for "${client.name}" (${client.websiteUrl || "unknown website"}).

Analyze these search terms and classify each as a negative keyword candidate or legitimate traffic.

${listsInfo ? `Available negative keyword lists:\n${listsInfo}\n` : ""}
Search terms (JSON):
${termsJson}

For each term, return a JSON array with objects containing:
- searchTerm: the original search term
- isCandidate: boolean (true if it should be a negative keyword)
- suggestedList: which negative keyword list to add it to (from the available lists above, or "General" if no lists provided)
- matchType: "exact", "phrase", or "broad"
- reasoning: brief explanation of why this is or isn't a negative keyword candidate

Consider:
- Irrelevant intent (e.g., job seekers, DIY, competitors, unrelated industries)
- High spend with zero conversions is suspicious but not always negative
- Terms related to the client's actual business should NOT be flagged
- When in doubt, flag it for review (the team will make the final call)

Return ONLY a valid JSON array, no markdown, no explanation.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text?.trim() || "";
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
        suggestedList: match?.suggestedList || "",
        matchType: match?.matchType || "exact",
        reasoning: match?.reasoning || "",
      };
    });
  } catch (err) {
    console.error("[negative-sweep/cron] AI classification failed:", err);
    // Fallback: flag all as candidates
    return terms.map((t) => ({
      ...t,
      isCandidate: true,
      reasoning:
        "AI classification failed, flagged by spend/conversion filters",
      matchType: "exact" as const,
    }));
  }
}
