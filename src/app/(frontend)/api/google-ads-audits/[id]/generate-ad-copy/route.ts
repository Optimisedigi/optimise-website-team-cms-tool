import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k2-0905-preview";

const SYSTEM_PROMPT = `You are a Google Ads RSA (Responsive Search Ad) copywriter. Generate ad copy for one ad group.

Return ONLY valid JSON with this exact structure:
{"headlines": ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8", "h9", "h10"], "descriptions": ["d1", "d2", "d3", "d4"]}

Rules:
- Exactly 10 headlines, each MUST be 30 characters or less (including spaces)
- Exactly 4 descriptions, each MUST be 90 characters or less (including spaces)
- Headlines should be varied: benefits, CTAs, features, brand mentions, urgency
- Include the business name in at least 1 headline
- Include a CTA in at least 2 headlines (e.g. "Get a Quote", "Shop Now", "Call Today")
- If brand headlines are provided, include 1-2 of them exactly as written in your 10 headlines
- Use the landing page content (heading, title, description) to make copy specific and relevant
- Descriptions should elaborate on the value proposition shown on the landing page
- Use keywords naturally, do not stuff
- Return ONLY the JSON object, no markdown, no explanation`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const KIMI_API_KEY = process.env.KIMI_API_KEY;

    if (!KIMI_API_KEY) {
      return NextResponse.json({ error: "KIMI_API_KEY not configured" }, { status: 500 });
    }

    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    let user: any;
    try {
      const authResult = await payload.auth({ headers: req.headers });
      user = authResult.user;
    } catch {
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let audit: any;
    try {
      audit = await payload.findByID({ collection: "google-ads-audits", id, overrideAccess: true });
    } catch {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    const proposalData = typeof audit.campaignProposal === "string"
      ? JSON.parse(audit.campaignProposal)
      : audit.campaignProposal;
    const proposedCampaigns = proposalData?.proposedCampaigns;

    if (!Array.isArray(proposedCampaigns) || proposedCampaigns.length === 0) {
      return NextResponse.json({ error: "No approved campaign structure found" }, { status: 400 });
    }

    // Set status to generating
    try {
      const dbClient = (payload.db as any).client;
      await dbClient.execute({
        sql: "UPDATE google_ads_audits SET ad_copy_status = ? WHERE id = ?",
        args: ["generating", id],
      });
    } catch (err) {
      console.error("[generate-ad-copy] Failed to set generating status:", err);
    }

    // Return immediately, process in background
    after(async () => {
      try {
        const businessName = audit.businessName || "the business";
        const adCopyMap: Record<string, Record<string, { headlines: string[]; descriptions: string[] }>> = {};

        // Parse brand headlines (one per line, from CMS field)
        const brandHeadlines: string[] = typeof audit.adCopyBrandHeadlines === "string"
          ? audit.adCopyBrandHeadlines.split("\n").map((h: string) => h.trim()).filter((h: string) => h && h.length <= 30)
          : [];

        // Build discovered pages lookup: URL → { title, h1, metaDescription, seedPhrases }
        const discoveredPages = new Map<string, { title: string; h1: string; metaDescription: string; seedPhrases: string[] }>();
        for (const page of proposalData?.discoveredPages || []) {
          if (page.url) {
            const normalizedUrl = page.url.replace(/\/$/, "").toLowerCase();
            discoveredPages.set(normalizedUrl, {
              title: page.title || "",
              h1: page.h1 || "",
              metaDescription: page.metaDescription || "",
              seedPhrases: page.seedPhrases || [],
            });
          }
        }

        // Collect all ad groups with their context
        const adGroups: Array<{
          campaignName: string;
          adGroupName: string;
          landingPage: string;
          keywords: string[];
          pageTitle: string;
          pageH1: string;
          pageDescription: string;
        }> = [];

        for (const campaign of proposedCampaigns) {
          for (const ag of campaign.adGroups || []) {
            const lpUrl = ag.landingPage?.url || audit.websiteUrl || "";
            const normalizedLp = lpUrl.replace(/\/$/, "").toLowerCase();
            const pageData = discoveredPages.get(normalizedLp);

            adGroups.push({
              campaignName: campaign.name,
              adGroupName: ag.name,
              landingPage: lpUrl,
              keywords: (ag.keywords || []).slice(0, 5).map((k: any) => k.text || k),
              pageTitle: pageData?.title || "",
              pageH1: pageData?.h1 || "",
              pageDescription: pageData?.metaDescription || "",
            });
          }
        }

        console.log(`[generate-ad-copy] Generating ad copy for ${adGroups.length} ad groups...`);

        // Process in batches of 5
        const BATCH_SIZE = 5;
        for (let i = 0; i < adGroups.length; i += BATCH_SIZE) {
          const batch = adGroups.slice(i, i + BATCH_SIZE);

          const results = await Promise.allSettled(
            batch.map(async (ag) => {
              const pageContext = [
                ag.pageH1 && `Page Heading: "${ag.pageH1}"`,
                ag.pageTitle && `Page Title: "${ag.pageTitle}"`,
                ag.pageDescription && `Page Description: "${ag.pageDescription}"`,
              ].filter(Boolean).join("\n");

              const brandNote = brandHeadlines.length > 0
                ? `\nBrand Headlines to Include (use 1-2 of these exactly as written): ${brandHeadlines.join(", ")}`
                : "";

              const userMessage = `Business: "${businessName}"
Ad Group: "${ag.adGroupName}"
Landing Page: ${ag.landingPage}
${pageContext}
Top Keywords: ${ag.keywords.join(", ")}${brandNote}`;

              const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${KIMI_API_KEY}`,
                },
                body: JSON.stringify({
                  model: KIMI_MODEL,
                  messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userMessage },
                  ],
                  temperature: 0.8,
                  max_tokens: 800,
                }),
                signal: AbortSignal.timeout(30_000),
              });

              if (!res.ok) {
                throw new Error(`Kimi API error ${res.status}`);
              }

              const data = await res.json();
              const content = data.choices?.[0]?.message?.content?.trim();
              if (!content) throw new Error("Empty response from Kimi");

              // Parse JSON — handle potential markdown wrapping
              const jsonStr = content.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
              const parsed = JSON.parse(jsonStr);

              // Post-process: enforce character limits
              const headlines = (parsed.headlines || []).slice(0, 10).map((h: string) => {
                if (h.length <= 30) return h;
                const truncated = h.slice(0, 30).replace(/\s+\S*$/, "");
                return truncated || h.slice(0, 30);
              });
              const descriptions = (parsed.descriptions || []).slice(0, 4).map((d: string) => {
                if (d.length <= 90) return d;
                const truncated = d.slice(0, 90).replace(/\s+\S*$/, "");
                return truncated || d.slice(0, 90);
              });

              return {
                campaignName: ag.campaignName,
                adGroupName: ag.adGroupName,
                headlines,
                descriptions,
              };
            })
          );

          for (const result of results) {
            if (result.status === "fulfilled") {
              const { campaignName, adGroupName, headlines, descriptions } = result.value;
              if (!adCopyMap[campaignName]) adCopyMap[campaignName] = {};
              adCopyMap[campaignName][adGroupName] = { headlines, descriptions };
            } else {
              console.error(`[generate-ad-copy] Failed for ad group in batch:`, result.reason?.message);
            }
          }
        }

        // Save results
        const totalGenerated = Object.values(adCopyMap).reduce(
          (s, ags) => s + Object.keys(ags).length, 0
        );
        console.log(`[generate-ad-copy] Generated ad copy for ${totalGenerated}/${adGroups.length} ad groups`);

        const dbClient = (payload.db as any).client;
        await dbClient.execute({
          sql: "UPDATE google_ads_audits SET generated_ad_copy = ?, ad_copy_status = ?, ad_copy_generated_at = ? WHERE id = ?",
          args: [JSON.stringify(adCopyMap), "generated", new Date().toISOString(), id],
        });

        console.log(`[generate-ad-copy] Saved ad copy for audit ${id}`);
      } catch (error) {
        console.error("[generate-ad-copy] Background error:", error);
        try {
          const dbClient = (payload.db as any).client;
          await dbClient.execute({
            sql: "UPDATE google_ads_audits SET ad_copy_status = ? WHERE id = ?",
            args: ["draft", id],
          });
        } catch { /* best effort */ }
      }
    });

    return NextResponse.json({ ok: true, message: "Ad copy generation started" });
  } catch (err) {
    console.error("[generate-ad-copy] Unhandled error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
