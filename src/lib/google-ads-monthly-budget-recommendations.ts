import { getPayload } from "payload";
import { logActivity } from "@/lib/activity-log";
import { buildInternalMarkdown, mdTable } from "@/lib/agents/optimate-google-ads/tools/_propose-helpers";
import {
  computeBudgetRecommendations,
  daysInPreviousMonth,
  type CampaignPerformance,
  type CampaignRecommendation,
} from "@/lib/google-ads-budget-recommend";

const BUDGETS_COLLECTION = "google-ads-campaign-budgets" as never;
const AUDITS_COLLECTION = "google-ads-audits";
const APPROVALS_COLLECTION = "agent-approval-queue" as never;

interface GrowthToolsCampaignRow {
  campaignId: string;
  campaignName: string;
  campaignStatus?: string;
  conversions?: number;
  cost?: number;
}

interface BudgetAuditDoc {
  id: number | string;
  businessName?: string | null;
  customerId?: string;
  monthlyBudget?: number;
  client?: {
    id: number | string;
    name?: string | null;
    googleAdsCustomerId?: string;
    dashboardConversionActions?: string;
  } | number | string | null;
}

interface AccountResult {
  auditId: number | string;
  customerId: string;
  campaignsRecommended: number;
  monthlyBudget: number;
  approvalId?: number | string;
  approvalSkipped?: string;
  error?: string;
}

export interface MonthlyBudgetRecommendationOptions {
  triggeredBy: "cron" | "manual" | "scheduled-task";
  triggeredByEmail?: string;
  auditIds?: Array<number | string>;
}

export interface MonthlyBudgetRecommendationResult {
  triggeredBy: MonthlyBudgetRecommendationOptions["triggeredBy"];
  accountsProcessed: number;
  accountsWithRecommendations: number;
  notified: number;
  daysInMonth: number;
  results: AccountResult[];
}

function readEnv(): { GROWTH_TOOLS_URL?: string; INTERNAL_API_KEY?: string } {
  return {
    GROWTH_TOOLS_URL: process.env.GROWTH_TOOLS_URL,
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
  };
}

export async function runMonthlyBudgetRecommendations(
  payload: Awaited<ReturnType<typeof getPayload>>,
  opts: MonthlyBudgetRecommendationOptions,
): Promise<MonthlyBudgetRecommendationResult> {
  const env = readEnv();
  if (!env.GROWTH_TOOLS_URL || !env.INTERNAL_API_KEY) {
    throw new Error("GROWTH_TOOLS_URL or INTERNAL_API_KEY not configured");
  }

  const nowIso = new Date().toISOString();
  const daysInMonth = daysInPreviousMonth();
  const audits = await loadBudgetAudits(payload, opts.auditIds);

  const results: AccountResult[] = [];
  let accountsWithRecommendations = 0;

  for (const audit of audits) {
    const monthlyBudget = Number(audit.monthlyBudget) || 0;
    let customerId = audit.customerId ?? "";
    let conversionActions: string[] = [];

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
        enabled: c.campaignStatus !== "PAUSED" && c.campaignStatus !== "REMOVED",
        conversions: Number(c.conversions) || 0,
        spend: Number(c.cost) || 0,
      }));

      const { recommendations } = computeBudgetRecommendations({
        monthlyBudget,
        daysInMonth,
        campaigns: performance,
      });

      const saved = await persistRecommendations(payload, {
        auditId: audit.id,
        customerId,
        recommendations,
        nowIso,
      });

      let approvalId: number | string | undefined;
      let approvalSkipped: string | undefined;
      if (saved > 0) {
        accountsWithRecommendations++;
        const approval = await queueMonthlyBudgetApproval(payload, {
          audit,
          customerId,
          monthlyBudget,
          recommendations,
          targetMonthLabel: currentMonthLabel(),
          agentRunId: monthlyBudgetRunId(nowIso),
        });
        approvalId = approval.approvalId;
        approvalSkipped = approval.skipped;
      }

      results.push({
        auditId: audit.id,
        customerId,
        campaignsRecommended: saved,
        monthlyBudget,
        ...(approvalId !== undefined ? { approvalId } : {}),
        ...(approvalSkipped !== undefined ? { approvalSkipped } : {}),
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

  const trigger = opts.triggeredBy === "manual"
    ? ` (manual by ${opts.triggeredByEmail ?? "admin"})`
    : opts.triggeredBy === "scheduled-task"
      ? " (scheduled task)"
      : "";

  logActivity(payload, {
    type: "google_ads_budget_recommendations",
    title: `Monthly Google Ads budget recommendations${trigger}`,
    description: `Processed ${results.length} account(s); ${accountsWithRecommendations} got recommendations.`,
  }).catch(() => {});

  const notified = await fanOutLegacyBudgetNotification(payload, accountsWithRecommendations);

  return {
    triggeredBy: opts.triggeredBy,
    accountsProcessed: results.length,
    accountsWithRecommendations,
    notified,
    daysInMonth,
    results,
  };
}

async function loadBudgetAudits(
  payload: Awaited<ReturnType<typeof getPayload>>,
  auditIds?: Array<number | string>,
): Promise<BudgetAuditDoc[]> {
  if (auditIds && auditIds.length > 0) {
    const docs: BudgetAuditDoc[] = [];
    for (const auditId of auditIds) {
      const audit = await payload.findByID({
        collection: AUDITS_COLLECTION,
        id: auditId,
        depth: 1,
        overrideAccess: true,
      });
      docs.push(audit as unknown as BudgetAuditDoc);
    }
    return docs.filter((audit) => (audit.customerId ?? "") !== "" && Number(audit.monthlyBudget) > 0);
  }

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
  return audits.docs as unknown as BudgetAuditDoc[];
}

async function persistRecommendations(
  payload: Awaited<ReturnType<typeof getPayload>>,
  input: {
    auditId: number | string;
    customerId: string;
    recommendations: CampaignRecommendation[];
    nowIso: string;
  },
): Promise<number> {
  let saved = 0;
  for (const rec of input.recommendations) {
    const existing = await payload.find({
      collection: BUDGETS_COLLECTION,
      where: {
        and: [
          { audit: { equals: input.auditId } },
          { campaignId: { equals: rec.campaignId } },
        ],
      } as never,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const data = {
      recommendedDailyBudget: rec.recommendedDailyBudget,
      recommendationGeneratedAt: input.nowIso,
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
            audit: input.auditId,
            customerId: input.customerId,
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
        auditId: input.auditId,
        campaignId: rec.campaignId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return saved;
}

async function queueMonthlyBudgetApproval(
  payload: Awaited<ReturnType<typeof getPayload>>,
  input: {
    audit: BudgetAuditDoc;
    customerId: string;
    monthlyBudget: number;
    recommendations: CampaignRecommendation[];
    targetMonthLabel: string;
    agentRunId: string;
  },
): Promise<{ approvalId?: number | string; skipped?: string }> {
  const campaigns = input.recommendations
    .filter((rec) => rec.recommendedDailyBudget > 0)
    .map((rec) => ({
      campaignId: rec.campaignId,
      campaignName: rec.campaignName,
      dailyBudget: rec.recommendedDailyBudget,
    }));

  if (campaigns.length === 0) {
    return { skipped: "no positive recommended daily budgets" };
  }

  const client = input.audit.client && typeof input.audit.client === "object" ? input.audit.client : null;
  const clientId = client?.id;
  const accountName = input.audit.businessName ?? client?.name ?? `Audit #${input.audit.id}`;
  const title = `${accountName}: approve ${input.targetMonthLabel} budget push`;

  const existing = await payload.find({
    collection: APPROVALS_COLLECTION,
    where: {
      and: [
        { status: { equals: "pending" } },
        { proposalType: { equals: "budget-push-live" } },
        { title: { equals: title } },
      ],
    } as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  if (existing.docs[0]) {
    return {
      approvalId: (existing.docs[0] as { id: number | string }).id,
      skipped: "pending approval already exists",
    };
  }

  const totalDaily = campaigns.reduce((sum, campaign) => sum + campaign.dailyBudget, 0);
  const internalMarkdown = buildInternalMarkdown({
    summary: `Monthly Google Ads budget recommendations are ready for ${accountName}. Review and apply this approval to push the recommended daily budgets live in Google Ads.`,
    supportingNumbers: [
      `Monthly budget: $${input.monthlyBudget.toFixed(2)}`,
      `Recommended total daily budget: $${totalDaily.toFixed(2)}/day`,
      `Campaigns included: ${campaigns.length}`,
      "Generated from last-month campaign performance; nothing has been pushed yet.",
    ],
    diffSection: mdTable(
      ["Campaign", "Recommended daily budget"],
      campaigns.map((campaign) => [
        campaign.campaignName,
        `$${campaign.dailyBudget.toFixed(2)}/day`,
      ]),
    ),
    applyEffect: `Will call Growth Tools \`campaign-budgets/push\` for audit #${input.audit.id} and customer ${input.customerId.replace(/\d(?=\d{4})/g, "•")}, then stamp \`actualDailyBudget\` and \`lastPushedAt\` on the CMS budget rows.`,
  });

  const created = await payload.create({
    collection: APPROVALS_COLLECTION,
    data: {
      title,
      agentName: "optimate-google-ads",
      agentRunId: input.agentRunId,
      proposalType: "budget-push-live",
      proposalPayload: {
        source: "monthly-budget-recommendations",
        targetMonth: input.targetMonthLabel,
        auditId: input.audit.id,
        campaigns,
      },
      rendered: { internalMarkdown },
      status: "pending",
      ...(clientId !== undefined ? { client: clientId } : {}),
    } as never,
    overrideAccess: true,
  });

  return { approvalId: (created as { id: number | string }).id };
}

async function fanOutLegacyBudgetNotification(
  payload: Awaited<ReturnType<typeof getPayload>>,
  accountsWithRecommendations: number,
): Promise<number> {
  let notified = 0;
  if (accountsWithRecommendations <= 0) return notified;

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
          title: "Monthly Google Ads budget approvals ready",
          body: `Recommended budget pushes for ${accountsWithRecommendations} account${accountsWithRecommendations === 1 ? "" : "s"} are waiting in Agent Approvals. Nothing has been changed in Google Ads.`,
          url: "/admin/agent-approvals",
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

  return notified;
}

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

function monthlyBudgetRunId(nowIso: string): string {
  return `monthly-budget-recommendations:${nowIso.slice(0, 7)}`;
}

function currentMonthLabel(ref: Date = new Date()): string {
  return ref.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}
