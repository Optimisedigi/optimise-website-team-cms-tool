import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import { headers as getHeaders } from "next/headers";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";
import {
  computeBudgetRecommendations,
  daysInPreviousMonth,
  type CampaignPerformance,
} from "@/lib/google-ads-budget-recommend";

export const maxDuration = 300;

const BUDGETS_COLLECTION = "google-ads-campaign-budgets" as never;
const AUDITS_COLLECTION = "google-ads-audits";

/**
 * Monthly Google Ads budget recommendation engine.
 *
 * Runs on the 1st of each month (Vercel cron `0 1 1 * *`, 01:00 UTC). For each
 * managed Google Ads account (a `google-ads-audits` doc with a customerId and a
 * monthly budget), it pulls LAST_MONTH per-campaign metrics from Growth Tools,
 * computes a recommended daily-budget split weighted by conversions, CPA, and
 * recent spend, and persists those as advisory `recommendedDailyBudget` values
 * on each campaign-budget row. It NEVER pushes to Google Ads — the team reviews
 * and applies manually. At the end it fans out one in-CMS notification per
 * admin prompting a review.
 *
 * Auth:
 *  - GET  → CRON_SECRET bearer (Vercel cron).
 *  - POST → admin session ("recompute now").
 */

interface GrowthToolsCampaignRow {
  campaignId: string;
  campaignName: string;
  campaignStatus?: string;
  conversions?: number;
  cost?: number;
}

interface AccountResult {
  auditId: number | string;
  customerId: string;
  campaignsRecommended: number;
  monthlyBudget: number;
  error?: string;
}

function readEnv() {
  return {
    GROWTH_TOOLS_URL: process.env.GROWTH_TOOLS_URL,
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization");
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

  const cfg = await config;
  const payload = await getPayload({ config: cfg });
  return runRecommendations(payload, { triggeredBy: "cron" });
}

export async function POST(): Promise<NextResponse> {
  const cfg = await config;
  const payload = await getPayload({ config: cfg });
  const reqHeaders = await getHeaders();
  const { user } = await payload.auth({ headers: reqHeaders });
  if (!user || (user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return runRecommendations(payload, {
    triggeredBy: "manual",
    triggeredByEmail: (user as { email?: string }).email,
  });
}

interface RunOptions {
  triggeredBy: "cron" | "manual";
  triggeredByEmail?: string;
}

async function runRecommendations(
  payload: Awaited<ReturnType<typeof getPayload>>,
  opts: RunOptions,
): Promise<NextResponse> {
  const env = readEnv();
  if (!env.GROWTH_TOOLS_URL || !env.INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY not configured" },
      { status: 500 },
    );
  }

  const nowIso = new Date().toISOString();
  const daysInMonth = daysInPreviousMonth();

  // Managed accounts: audits with a customerId AND a positive monthly budget.
  const audits = await payload.find({
    collection: AUDITS_COLLECTION,
    where: {
      and: [
        { customerId: { not_equals: "" } },
        { monthlyBudget: { greater_than: 0 } },
      ],
    } as never,
    limit: 500,
    depth: 1,
    overrideAccess: true,
  });

  const results: AccountResult[] = [];
  let accountsWithRecommendations = 0;

  for (const auditDoc of audits.docs) {
    const audit = auditDoc as unknown as {
      id: number | string;
      customerId?: string;
      monthlyBudget?: number;
      client?: { id: number | string; googleAdsCustomerId?: string; dashboardConversionActions?: string } | number | string | null;
    };

    const monthlyBudget = Number(audit.monthlyBudget) || 0;
    let customerId = audit.customerId ?? "";
    let conversionActions: string[] = [];

    // Prefer the linked client's account ID (the audit's may be an MCC).
    if (audit.client && typeof audit.client === "object") {
      if (audit.client.googleAdsCustomerId) {
        customerId = audit.client.googleAdsCustomerId;
      }
      const dca = audit.client.dashboardConversionActions || "";
      conversionActions = dca
        .split(/[\r\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    if (!customerId) {
      results.push({
        auditId: audit.id,
        customerId: "",
        campaignsRecommended: 0,
        monthlyBudget,
        error: "no customer id",
      });
      continue;
    }

    try {
      const campaigns = await fetchLastMonthCampaigns(
        env.GROWTH_TOOLS_URL,
        env.INTERNAL_API_KEY,
        customerId,
        conversionActions,
      );

      const performance: CampaignPerformance[] = campaigns.map((c) => ({
        campaignId: String(c.campaignId),
        campaignName: c.campaignName ?? "",
        enabled:
          c.campaignStatus !== "PAUSED" && c.campaignStatus !== "REMOVED",
        conversions: Number(c.conversions) || 0,
        spend: Number(c.cost) || 0,
      }));

      const { recommendations } = computeBudgetRecommendations({
        monthlyBudget,
        daysInMonth,
        campaigns: performance,
      });

      let saved = 0;
      for (const rec of recommendations) {
        const existing = await payload.find({
          collection: BUDGETS_COLLECTION,
          where: {
            and: [
              { audit: { equals: audit.id } },
              { campaignId: { equals: rec.campaignId } },
            ],
          } as never,
          limit: 1,
          depth: 0,
          overrideAccess: true,
        });

        const data = {
          recommendedDailyBudget: rec.recommendedDailyBudget,
          recommendationGeneratedAt: nowIso,
          recommendationBasis: rec.basis,
        } as never;

        try {
          if (existing.docs[0]) {
            await payload.update({
              collection: BUDGETS_COLLECTION,
              id: (existing.docs[0] as { id: number | string }).id,
              data,
              overrideAccess: true,
            });
          } else {
            await payload.create({
              collection: BUDGETS_COLLECTION,
              data: {
                audit: audit.id,
                customerId,
                campaignId: rec.campaignId,
                campaignName: rec.campaignName,
                ...(data as object),
              } as never,
              overrideAccess: true,
            });
          }
          saved++;
        } catch (err) {
          payload.logger?.error?.({
            msg: "budget-recommendation save failed",
            auditId: audit.id,
            campaignId: rec.campaignId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (saved > 0) accountsWithRecommendations++;
      results.push({
        auditId: audit.id,
        customerId,
        campaignsRecommended: saved,
        monthlyBudget,
      });
    } catch (err) {
      results.push({
        auditId: audit.id,
        customerId,
        campaignsRecommended: 0,
        monthlyBudget,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const trigger =
    opts.triggeredBy === "manual"
      ? ` (manual by ${opts.triggeredByEmail ?? "admin"})`
      : "";
  logActivity(payload, {
    type: "google_ads_budget_recommendations",
    title: `Monthly Google Ads budget recommendations${trigger}`,
    description: `Processed ${results.length} account(s); ${accountsWithRecommendations} got recommendations.`,
  }).catch(() => {});

  // Fan out one notification per admin, superseding prior review prompts so
  // each admin only ever sees the latest one.
  let notified = 0;
  if (accountsWithRecommendations > 0) {
    const admins = await payload.find({
      collection: "users",
      where: { role: { equals: "admin" } } as never,
      limit: 100,
      depth: 0,
      overrideAccess: true,
    });

    try {
      await payload.delete({
        collection: "notifications" as never,
        where: { kind: { equals: "google-ads-budget-review" } } as never,
        overrideAccess: true,
      });
    } catch (err) {
      payload.logger?.error?.({
        msg: "budget-review notification cleanup failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    for (const admin of admins.docs) {
      const adminId = (admin as { id: number | string }).id;
      try {
        await payload.create({
          collection: "notifications" as never,
          overrideAccess: true,
          data: {
            recipient: adminId,
            kind: "google-ads-budget-review",
            title: "Monthly Google Ads budget review ready",
            body: `Recommended budgets for ${accountsWithRecommendations} account${accountsWithRecommendations === 1 ? "" : "s"} are ready to review. Nothing has been changed in Google Ads.`,
            url: `/admin/collections/${AUDITS_COLLECTION}`,
          } as never,
        });
        notified++;
      } catch (err) {
        payload.logger?.error?.({
          msg: "budget-review notification create failed",
          adminId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return NextResponse.json({
    triggeredBy: opts.triggeredBy,
    accountsProcessed: results.length,
    accountsWithRecommendations,
    notified,
    daysInMonth,
    results,
  });
}

/**
 * Fetch LAST_MONTH per-campaign metrics from Growth Tools. Same endpoint and
 * contract the live budget list route uses, with dateRange "LAST_MONTH".
 */
async function fetchLastMonthCampaigns(
  growthToolsUrl: string,
  internalApiKey: string,
  customerId: string,
  conversionActions: string[],
): Promise<GrowthToolsCampaignRow[]> {
  const response = await fetch(
    `${growthToolsUrl}/api/google-ads/campaign-budgets/list`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": internalApiKey,
      },
      body: JSON.stringify({
        customerId: customerId.replace(/-/g, ""),
        dateRange: "LAST_MONTH",
        ...(conversionActions.length > 0 && { conversionActions }),
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Growth Tools error (${response.status}): ${errorBody.slice(0, 300)}`);
  }

  const result = (await response.json()) as { campaigns?: GrowthToolsCampaignRow[] };
  return Array.isArray(result.campaigns) ? result.campaigns : [];
}
