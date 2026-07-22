import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import {
  firstMonthProrationFactor,
  netMonthlyRetainer,
  oneOffsThisMonth,
  oneOffsYTD,
  retainerRevenueYTD,
  revenueShareFactor,
} from "@/lib/client-revenue";
import { convertUsdToAud } from "@/lib/realtime/voice-costs";

// ── Default per-unit API costs in AUD (fallbacks if global not configured) ──
const DEFAULT_COST_PER_AUD = {
  seoAudit: 0.012,
  croAudit: 0.005,
  keywordSnapshot: 0.008,
  competitorAnalysis: 0.01,
  contentResearch: 0.004,
  blogImage: 0.031,
};

// ── Monthly fixed infrastructure costs in AUD ──
const INFRA_MONTHLY_AUD = {
  vercel: 31.0,       // Vercel Pro (~$20 USD)
  railway: 7.75,      // Railway Hobby ($5 USD)
  turso: 0.0,         // Free Starter tier
  blobStorage: 0.5,   // Vercel Blob (small usage)
  screenshotOne: 0.0, // Free tier 100/mo
  sendGrid: 0.0,      // Free tier
  domain: 3.5,        // ~$42 AUD/yr ÷ 12
};

// ── Monthly LLM subscription costs in AUD (manually tracked) ──
const LLM_MONTHLY_AUD = {
  claudeCode: 0.0,    // Update when subscribed
  chatGPT: 0.0,       // Update when subscribed
  kimi: 0.0,          // Update when subscribed
};

// Dashboard Activity is an executive feed, not an audit trail. The full
// activity log remains available in Payload admin for operational detail.
export const DASHBOARD_EXCLUDED_ACTIVITY_TYPES = [
  "agent_tool_call",
  "agent_reasoning",
  "agent_final_output",
  "agent_error",
  "agent_auth_event",
  "template_created",
  "timeline_created",
  "keyword_analysis",
  "gsc_snapshot",
  "ai_visibility_snapshot_created",
  "serp_displacement_snapshot_created",
  "serp_displacement_alert_created",
  "match_type_synonym_rule_created",
  "match_type_allow_list_term_created",
] as const;

type AgencyKpiSnapshotValues = {
  activeClients: number;
  activeLeads: number;
  arr: number;
  monthlyRetainer: number;
  retainerYTD: number;
  oneOffYTD: number;
  leadConversion: number;
  mtdCosts: number;
};

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonthKey(date: Date): string {
  return monthKey(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

function buildMomDelta(current: number, previous: number, suffix = ""): { text: string; dir: "up" | "down" | "flat" } {
  const diff = round(current - previous);
  if (diff === 0) return { text: "— MoM", dir: "flat" };
  const dir = diff > 0 ? "up" : "down";
  const arrow = diff > 0 ? "▲" : "▼";
  const abs = Math.abs(diff);
  const formatted = suffix === "%" ? `${abs.toFixed(abs % 1 === 0 ? 0 : 1)}%` : abs.toLocaleString("en-AU", { maximumFractionDigits: 0 });
  return { text: `${arrow} ${formatted} MoM`, dir };
}

async function findAgencyKpiSnapshot(payload: any, key: string): Promise<any | null> {
  const result = await payload.find({
    collection: "agency-kpi-snapshots" as any,
    where: { month: { equals: key } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return result.docs[0] ?? null;
}

async function upsertAgencyKpiSnapshot(payload: any, key: string, values: AgencyKpiSnapshotValues): Promise<void> {
  try {
    const existing = await findAgencyKpiSnapshot(payload, key);
    if (existing?.id) {
      await payload.update({
        collection: "agency-kpi-snapshots" as any,
        id: existing.id,
        data: values,
        overrideAccess: true,
      });
      return;
    }
    await payload.create({
      collection: "agency-kpi-snapshots" as any,
      data: { month: key, ...values },
      overrideAccess: true,
    });
  } catch (error) {
    console.error("[dashboard] KPI snapshot upsert error:", error);
  }
}

export async function GET() {
  try {
  const payload = await getPayload({ config });

  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Dashboard contains agency-wide data — only admins, or users explicitly
  // granted the `nav:dashboard` feature, may read it.
  const { userHasFeature } = await import("@/lib/access");
  if (!userHasFeature(user, "nav:dashboard")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Read configurable API cost rates from global, fallback to defaults
  let COST_PER_AUD = { ...DEFAULT_COST_PER_AUD };
  try {
    const rates = await payload.findGlobal({ slug: 'api-cost-rates' as any, overrideAccess: true });
    if (rates) {
      COST_PER_AUD = {
        seoAudit: (rates as any).seoAuditCost ?? DEFAULT_COST_PER_AUD.seoAudit,
        croAudit: (rates as any).croAuditCost ?? DEFAULT_COST_PER_AUD.croAudit,
        keywordSnapshot: (rates as any).keywordSnapshotCost ?? DEFAULT_COST_PER_AUD.keywordSnapshot,
        competitorAnalysis: (rates as any).competitorAnalysisCost ?? DEFAULT_COST_PER_AUD.competitorAnalysis,
        contentResearch: (rates as any).contentResearchCost ?? DEFAULT_COST_PER_AUD.contentResearch,
        blogImage: (rates as any).blogImageCost ?? DEFAULT_COST_PER_AUD.blogImage,
      };
    }
  } catch {
    // Global not configured yet, use defaults
  }

  const now = new Date();
  const thisMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonthKeyForCosts = `${thisMonthDate.getFullYear()}-${String(thisMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthKeyForCosts = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthStart = lastMonthDate.toISOString();
  const lastMonthEnd = thisMonthDate.toISOString();

  // Fetch business costs summaries for the dashboard: MTD for the topline KPI,
  // last completed month for the detailed Costs card.
  let businessCostsSummary = { totalThisMonth: 0, totalLastMonth: 0, uncategorisedCount: 0 };
  try {
    const [bcThisMonth, bcLastMonth, bcUncat] = await Promise.all([
      payload.find({
        collection: 'business-costs' as any,
        where: { month: { equals: thisMonthKeyForCosts } },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'business-costs' as any,
        where: { month: { equals: lastMonthKeyForCosts } },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'business-costs' as any,
        where: {
          or: [
            { category: { exists: false } },
            { category: { equals: null as any } },
          ],
        },
        limit: 0,
        overrideAccess: true,
      }),
    ]);
    businessCostsSummary = {
      totalThisMonth: round(bcThisMonth.docs.reduce((sum: number, c: any) => sum + ((c.amount as number) || 0), 0)),
      totalLastMonth: round(bcLastMonth.docs.reduce((sum: number, c: any) => sum + ((c.amount as number) || 0), 0)),
      uncategorisedCount: bcUncat.totalDocs,
    };
  } catch {
    // business-costs collection might not exist yet
  }

  const monthStart = thisMonthDate.toISOString();

  // Build date ranges for last 6 months (for chart)
  const monthRanges: { label: string; start: string; end: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    monthRanges.push({
      label: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
      start: d.toISOString(),
      end: nextMonth.toISOString(),
    });
  }

  const [
    gscBundle,
    clientCount,
    clientsForRetainer,
    activityResult,
    seoCount,
    croCount,
    kwCount,
    compCount,
    contentCount,
    mediaCount,
    lastMonthSeoCount,
    lastMonthCroCount,
    lastMonthKwCount,
    lastMonthCompCount,
    lastMonthContentCount,
    lastMonthMediaCount,
    activeProposals,
    convertedProposals,
    totalProposals,
    activeLeadsCount,
    totalLeadsReceivedCount,
    processesData,
    teamTasksData,
    ...historicalCounts
  ] = await Promise.all([
    // Latest GSC snapshot + 13-month history for Optimise Digital
    (async (): Promise<{ gsc: any; gscMonthly: any[] } | null> => {
      try {
        const odClient = await payload.find({
          collection: "clients",
          where: { slug: { equals: "optimise-digital" } },
          limit: 1,
        });
        const client = odClient.docs[0];
        if (!client) return null;
        const clientMeta = {
          clientId: client.id,
          gscConnected: client.gscConnected || false,
        };

        // Query last 13 months of snapshots
        const snapshots = await payload.find({
          collection: "gsc-snapshots",
          where: { client: { equals: client.id } },
          sort: "-periodEnd",
          limit: 100,
          overrideAccess: true,
        });

        // Group by the month the data covers (periodEnd), not when snapshot was taken
        // Use slice(0,7) to extract "YYYY-MM" — handles both "YYYY-MM-DD" and full ISO strings
        // Keep the snapshot with the MOST data per month (highest impressions) since
        // multiple snapshots can exist per month and early-month ones may have zeros
        const byMonth = new Map<string, any>();
        for (const snap of snapshots.docs) {
          const dateStr = (snap.periodEnd as string) || (snap.snapshotDate as string);
          const key = dateStr.slice(0, 7); // "YYYY-MM"
          const existing = byMonth.get(key);
          if (!existing) {
            byMonth.set(key, snap);
          } else {
            // Prefer the snapshot with more impressions (most complete data)
            const existingImpressions = (existing.totalImpressions as number) || 0;
            const newImpressions = (snap.totalImpressions as number) || 0;
            if (newImpressions > existingImpressions) {
              byMonth.set(key, snap);
            }
          }
        }

        // Build a fixed 12-month rolling chart ending at the current month.
        // Missing months are included as zero-value bars so the dashboard always
        // shows one bar per month.
        const gscMonthly: { month: string; clicks: number; impressions: number }[] = [];
        const chartStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        for (let i = 0; i < 12; i += 1) {
          const d = new Date(chartStart.getFullYear(), chartStart.getMonth() + i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const snap = byMonth.get(key);
          gscMonthly.push({
            month: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
            clicks: snap ? ((snap.totalClicks as number) || 0) : 0,
            impressions: snap ? ((snap.totalImpressions as number) || 0) : 0,
          });
        }

        // Get the best snapshot for current stats (most recent month, most data)
        // byMonth already has the best snapshot per month; use the most recent month's best snapshot
        const sortedMonthKeys = Array.from(byMonth.keys()).sort().reverse();
        const latestSnap = sortedMonthKeys.length > 0 ? byMonth.get(sortedMonthKeys[0]) : null;
        if (!latestSnap) return { gsc: clientMeta, gscMonthly };

        // Compute unique keywords (clicks > 0) and unique pages (clicks > 0)
        const topKeywords = (latestSnap.topKeywords as any[]) || [];
        const topPages = (latestSnap.topPages as any[]) || [];
        const uniqueKeywords = topKeywords.filter((k: any) => k.clicks > 0).length;
        const uniquePages = topPages.filter((p: any) => p.clicks > 0).length;

        // Compute YoY: compare latest month to same month last year
        const latestDateStr = (latestSnap.periodEnd as string) || (latestSnap.snapshotDate as string);
        const [latestYear, latestMonth] = latestDateStr.split('-');
        const yoyKey = `${Number(latestYear) - 1}-${latestMonth}`;
        const yoySnap = byMonth.get(yoyKey);

        let clicksChange = latestSnap.clicksChange as number | undefined;
        let impressionsChange = latestSnap.impressionsChange as number | undefined;
        let positionChange = latestSnap.positionChange as number | undefined;
        let ctrChange: number | undefined;

        if (yoySnap) {
          const oldClicks = (yoySnap.totalClicks as number) || 1;
          const oldImpressions = (yoySnap.totalImpressions as number) || 1;
          const oldCtr = (yoySnap.avgCtr as number) || 0;
          const oldPosition = (yoySnap.avgPosition as number) || 0;
          clicksChange = round(((((latestSnap.totalClicks as number) || 0) - oldClicks) / oldClicks) * 100);
          impressionsChange = round(((((latestSnap.totalImpressions as number) || 0) - oldImpressions) / oldImpressions) * 100);
          ctrChange = oldCtr > 0 ? round(((((latestSnap.avgCtr as number) || 0) - oldCtr) / oldCtr) * 100) : 0;
          positionChange = oldPosition > 0 ? round(((((latestSnap.avgPosition as number) || 0) - oldPosition) / oldPosition) * 100) : 0;
        }

        const gsc = {
          ...latestSnap,
          ...clientMeta,
          uniqueKeywords,
          uniquePages,
          clicksChange,
          impressionsChange,
          positionChange,
          ctrChange,
        };

        return { gsc, gscMonthly };
      } catch (err) {
        console.error("[dashboard] GSC bundle error:", err);
        // Still try to return clientMeta so Connect button works
        try {
          const odClient = await payload.find({
            collection: "clients",
            where: { slug: { equals: "optimise-digital" } },
            limit: 1,
          });
          const c = odClient.docs[0];
          if (c) return { gsc: { clientId: c.id, gscConnected: c.gscConnected || false }, gscMonthly: [] };
        } catch { /* ignore */ }
        return null;
      }
    })(),

    payload.count({
      collection: "clients",
      where: {
        isActive: { equals: true },
        or: [
          { isAgency: { not_equals: true } },
          { isAgency: { exists: false } },
        ],
      },
    }).catch(() => ({ totalDocs: 0 })),

    payload.find({
      collection: "clients",
      where: {
        isActive: { equals: true },
        or: [
          { isAgency: { not_equals: true } },
          { isAgency: { exists: false } },
        ],
      },
      limit: 500,
      select: {
        name: true,
        monthlyRetainer: true,
        setupFee: true,
        revenueSharePercent: true,
        oneOffProjects: true,
        referralCommissions: true,
        clientStartDate: true,
        retainerStartDate: true,
        retainerHistory: true,
        historicalRevenueByYear: true,
      } as any,
    }).catch(() => ({ docs: [] })),

    payload.find({
      collection: "activity-log" as any,
      where: {
        type: { not_in: [...DASHBOARD_EXCLUDED_ACTIVITY_TYPES] },
      },
      limit: 20,
      sort: "-createdAt",
      depth: 1,
      overrideAccess: true,
    }).catch((err) => {
      console.error("[dashboard] Activity feed error:", err);
      return { docs: [] };
    }),

    // This month's counts
    payload.count({ collection: "seo-audits", where: { createdAt: { greater_than: monthStart } } }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: "cro-audits", where: { createdAt: { greater_than: monthStart } } }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: "keyword-snapshots", where: { createdAt: { greater_than: monthStart } } }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: "competitor-analyses", where: { createdAt: { greater_than: monthStart } } }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: "content-researches", where: { createdAt: { greater_than: monthStart } } }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: "media", where: { createdAt: { greater_than: monthStart } } }).catch(() => ({ totalDocs: 0 })),

    // Last completed month's counts for the detailed Costs card
    payload.count({ collection: "seo-audits", where: { createdAt: { greater_than: lastMonthStart, less_than: lastMonthEnd } } }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: "cro-audits", where: { createdAt: { greater_than: lastMonthStart, less_than: lastMonthEnd } } }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: "keyword-snapshots", where: { createdAt: { greater_than: lastMonthStart, less_than: lastMonthEnd } } }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: "competitor-analyses", where: { createdAt: { greater_than: lastMonthStart, less_than: lastMonthEnd } } }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: "content-researches", where: { createdAt: { greater_than: lastMonthStart, less_than: lastMonthEnd } } }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: "media", where: { createdAt: { greater_than: lastMonthStart, less_than: lastMonthEnd } } }).catch(() => ({ totalDocs: 0 })),

    // Proposals — active (not declined, not converted)
    payload.count({
      collection: "client-proposals",
      where: {
        or: [
          { proposalStatus: { not_equals: "declined" } },
          { proposalStatus: { exists: false } },
        ],
      },
    } as any).catch(() => ({ totalDocs: 0 })),

    // Proposals converted to clients
    payload.count({
      collection: "client-proposals",
      where: { proposalStatus: { equals: "client" } },
    } as any).catch(() => ({ totalDocs: 0 })),

    // Total proposals ever
    payload.count({ collection: "client-proposals" }).catch(() => ({ totalDocs: 0 })),

    // Active sales leads — excludes lost and confirmed/client outcomes.
    payload.count({
      collection: "sales-leads" as any,
      where: {
        and: [
          { stage: { not_equals: "lost" } },
          { stage: { not_equals: "client" } },
        ],
      },
    } as any).catch(() => ({ totalDocs: 0 })),

    // Total leads received — conversion denominator includes every lead, not only active leads.
    payload.count({ collection: "sales-leads" as any }).catch(() => ({ totalDocs: 0 })),

    // Client processes counts by status
    (async () => {
      try {
        const [activeCount, notStartedCount, completedCount, onHoldCount, recentResult] = await Promise.all([
          payload.count({ collection: "client-processes" as any, where: { overallStatus: { equals: "in_progress" } } }),
          payload.count({ collection: "client-processes" as any, where: { overallStatus: { equals: "not_started" } } }),
          payload.count({ collection: "client-processes" as any, where: { overallStatus: { equals: "completed" } } }),
          payload.count({ collection: "client-processes" as any, where: { overallStatus: { equals: "on_hold" } } }),
          payload.find({
            collection: "client-processes" as any,
            sort: "-updatedAt",
            limit: 5,
            depth: 0,
            overrideAccess: true,
          }),
        ]);

        const recentProcesses = recentResult.docs.map((doc: any) => {
          // Compute completion percentage from phases/steps
          const phases = Array.isArray(doc.phases) ? doc.phases : [];
          let totalSteps = 0;
          let completedSteps = 0;
          let currentPhase = '';
          for (const phase of phases) {
            const steps = Array.isArray(phase.steps) ? phase.steps : [];
            totalSteps += steps.length;
            completedSteps += steps.filter((s: any) => s.stepStatus === 'completed' || s.stepStatus === 'skipped').length;
            if (!currentPhase && (phase.phaseStatus === 'in_progress' || phase.phaseStatus === 'not_started')) {
              currentPhase = phase.phaseName || '';
            }
          }
          // If all phases are completed, show the last phase
          if (!currentPhase && phases.length > 0) {
            currentPhase = phases[phases.length - 1]?.phaseName || '';
          }
          const completionPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

          return {
            id: doc.id,
            processTitle: doc.processTitle || 'Untitled',
            overallStatus: doc.overallStatus || 'not_started',
            currentPhase,
            completionPercentage,
            updatedAt: doc.updatedAt,
          };
        });

        return {
          active: activeCount.totalDocs,
          notStarted: notStartedCount.totalDocs,
          completed: completedCount.totalDocs,
          onHold: onHoldCount.totalDocs,
          recentProcesses,
        };
      } catch {
        return null;
      }
    })(),

    // Team tasks summary for the agency dashboard
    (async () => {
      try {
        const completedMonthStart = monthStart;
        const nowIso = now.toISOString();
        const [notStarted, inProgress, readyForReview, completedThisMonth, postponed, overdue, activeResult] = await Promise.all([
          payload.count({ collection: "team-tasks" as any, where: { status: { equals: "not_started" } } }),
          payload.count({ collection: "team-tasks" as any, where: { status: { equals: "in_progress" } } }),
          payload.count({ collection: "team-tasks" as any, where: { status: { equals: "ready_for_review" } } }),
          payload.count({
            collection: "team-tasks" as any,
            where: {
              and: [
                { status: { equals: "completed" } },
                { completedAt: { greater_than: completedMonthStart } },
              ],
            },
          }),
          payload.count({ collection: "team-tasks" as any, where: { status: { equals: "task_postponed" } } }),
          payload.count({
            collection: "team-tasks" as any,
            where: {
              and: [
                { dueDate: { less_than: nowIso } },
                { status: { not_equals: "completed" } },
                { status: { not_equals: "task_postponed" } },
              ],
            },
          }),
          payload.find({
            collection: "team-tasks" as any,
            where: {
              and: [
                { status: { not_equals: "completed" } },
                { status: { not_equals: "task_postponed" } },
              ],
            },
            sort: "dueDate",
            limit: 500,
            depth: 1,
            overrideAccess: true,
          }),
        ]);

        const assigneeMap = new Map<string, { userId: string | number | null; name: string; active: number; readyForReview: number }>();
        for (const task of activeResult.docs as any[]) {
          const assignee = task.assignedTo;
          const userId = assignee && typeof assignee === "object" ? assignee.id : assignee ?? null;
          const key = userId == null ? "unassigned" : String(userId);
          const name = assignee && typeof assignee === "object" ? assignee.name || assignee.email || "Unnamed user" : "Unassigned";
          const current = assigneeMap.get(key) || { userId, name, active: 0, readyForReview: 0 };
          current.active += 1;
          if (task.status === "ready_for_review") current.readyForReview += 1;
          assigneeMap.set(key, current);
        }

        return {
          notStarted: notStarted.totalDocs,
          inProgress: inProgress.totalDocs,
          readyForReview: readyForReview.totalDocs,
          completedThisMonth: completedThisMonth.totalDocs,
          postponed: postponed.totalDocs,
          overdue: overdue.totalDocs,
          perAssignee: Array.from(assigneeMap.values()).sort((a, b) => b.active - a.active).slice(0, 6),
        };
      } catch (error) {
        console.error("[dashboard] Team tasks summary error:", error);
        return null;
      }
    })(),

    // Historical counts per month (for chart) — count all auditable collections per month + business costs
    ...monthRanges.map(async (range) => {
      const where = {
        createdAt: {
          greater_than: range.start,
          less_than: range.end,
        },
      };
      // Derive YYYY-MM key from range start date for business costs query
      const rangeDate = new Date(range.start);
      const monthKey = `${rangeDate.getFullYear()}-${String(rangeDate.getMonth() + 1).padStart(2, '0')}`;

      const [seo, cro, kw, comp, content, media, bcMonth] = await Promise.all([
        payload.count({ collection: "seo-audits", where }).catch(() => ({ totalDocs: 0 })),
        payload.count({ collection: "cro-audits", where }).catch(() => ({ totalDocs: 0 })),
        payload.count({ collection: "keyword-snapshots", where }).catch(() => ({ totalDocs: 0 })),
        payload.count({ collection: "competitor-analyses", where }).catch(() => ({ totalDocs: 0 })),
        payload.count({ collection: "content-researches", where }).catch(() => ({ totalDocs: 0 })),
        payload.count({ collection: "media", where }).catch(() => ({ totalDocs: 0 })),
        payload.find({
          collection: 'business-costs' as any,
          where: { month: { equals: monthKey } },
          limit: 5000,
          depth: 0,
          overrideAccess: true,
        }).catch(() => ({ docs: [] })),
      ]);
      const apiCost =
        seo.totalDocs * COST_PER_AUD.seoAudit +
        cro.totalDocs * COST_PER_AUD.croAudit +
        kw.totalDocs * COST_PER_AUD.keywordSnapshot +
        comp.totalDocs * COST_PER_AUD.competitorAnalysis +
        content.totalDocs * COST_PER_AUD.contentResearch +
        media.totalDocs * COST_PER_AUD.blogImage;

      const businessCostTotal = bcMonth.docs.reduce((sum: number, c: any) => sum + ((c.amount as number) || 0), 0);

      return {
        label: range.label,
        infrastructure: round(Object.values(INFRA_MONTHLY_AUD).reduce((a, b) => a + b, 0)),
        api: round(apiCost),
        llm: round(Object.values(LLM_MONTHLY_AUD).reduce((a, b) => a + b, 0)),
        business: round(businessCostTotal),
      };
    }),
  ]);

  // Helper: agency's share of this client's revenue (0..1). Defaults to 1
  // when the field is unset. Multiplied into every per-client contribution
  // below so contract amounts stay full but dashboard rollups reflect the
  // agency's actual take.
  const shareOf = (c: any) => revenueShareFactor(c?.revenueSharePercent);

  // First-month pro-ration factor for "this month" retainer figures. Uses the
  // retainer anchor (retainerStartDate ?? clientStartDate): the partial first
  // month is scaled down, a not-yet-started retainer contributes 0, and every
  // later month resolves to 1 (unchanged).
  const thisMonthFactorOf = (c: any): number => {
    const anchorIso = c?.retainerStartDate ?? c?.clientStartDate ?? null;
    if (!anchorIso) return 1;
    const anchor = new Date(anchorIso);
    if (isNaN(anchor.getTime())) return 1;
    return firstMonthProrationFactor(anchor, now);
  };

  // Net monthly retainer (this month) — sum across clients, deducting active
  // commissions, applying the first-month pro-ration, then the revenue share.
  const monthlyRetainerNet = round(
    clientsForRetainer.docs.reduce(
      (sum: number, c: any) =>
        sum +
        netMonthlyRetainer(
          Number(c.monthlyRetainer) || 0,
          Array.isArray(c.referralCommissions) ? c.referralCommissions : [],
          now,
        ) *
          thisMonthFactorOf(c) *
          shareOf(c),
      0,
    ),
  );

  // Sum one-off projects from the current month (retainer-tagged rows are
  // excluded — they belong to Retainer YTD, not One-Off totals). Multiplied
  // by per-client revenue share.
  const oneOffTotal = round(
    clientsForRetainer.docs.reduce(
      (sum: number, c: any) =>
        sum + oneOffsThisMonth(c.oneOffProjects, now, false) * shareOf(c),
      0,
    ),
  );

  // One-off YTD (sum across clients, retainer-tagged rows excluded, scaled
  // by per-client revenue share).
  const oneOffYTD = round(
    clientsForRetainer.docs.reduce(
      (sum: number, c: any) =>
        sum + oneOffsYTD(c.oneOffProjects, now, false) * shareOf(c),
      0,
    ),
  );

  // Sum of historicalRevenueByYear rows tagged with the current calendar
  // year for a given client. These rows represent retainer income for the
  // current year that pre-dates CMS tracking, so they flow into Retainer YTD.
  const currentYearForHist = now.getFullYear();
  function thisYearHistoricalForClient(c: any): number {
    const rows = Array.isArray(c?.historicalRevenueByYear) ? c.historicalRevenueByYear : [];
    let total = 0;
    for (const r of rows) {
      if (Number(r?.year) !== currentYearForHist) continue;
      const amt = Number(r?.amount);
      if (!Number.isFinite(amt) || amt <= 0) continue;
      total += amt;
    }
    return total;
  }

  // Retainer revenue YTD (net of commissions, walks retainer history per client,
  // includes setupFee + retainer-tagged one-offs + current-year historical
  // rows). Scaled per client by revenue share.
  const retainerYTD = round(
    clientsForRetainer.docs.reduce(
      (sum: number, c: any) =>
        sum +
        (retainerRevenueYTD(
          {
            monthlyRetainer: Number(c.monthlyRetainer) || 0,
            setupFee: Number(c.setupFee) || 0,
            clientStartDate: c.clientStartDate ?? null,
            retainerStartDate: c.retainerStartDate ?? null,
            retainerHistory: Array.isArray(c.retainerHistory) ? c.retainerHistory : [],
            referralCommissions: Array.isArray(c.referralCommissions)
              ? c.referralCommissions
              : [],
            oneOffProjects: Array.isArray(c.oneOffProjects) ? c.oneOffProjects : [],
          },
          now,
        ) +
          thisYearHistoricalForClient(c)) *
          shareOf(c),
      0,
    ),
  );

  // ── Per-client breakdowns for dashboard tooltips ───────────────────────
  const yearStartIso = new Date(now.getFullYear(), 0, 1);
  const monthlyRetainerBreakdown = clientsForRetainer.docs
    .map((c: any) => {
      const gross = Number(c.monthlyRetainer) || 0;
      if (gross <= 0) return null;
      const commissions = Array.isArray(c.referralCommissions) ? c.referralCommissions : [];
      const factor = thisMonthFactorOf(c);
      const net = netMonthlyRetainer(gross, commissions, now) * factor;
      const proratedGross = gross * factor;
      const share = shareOf(c);
      const sharePct = Number(c.revenueSharePercent);
      return {
        clientName: String(c.name ?? `#${c.id}`),
        gross: round(proratedGross * share),
        commission: round((proratedGross - net) * share),
        net: round(net * share),
        revenueSharePercent: Number.isFinite(sharePct) && sharePct < 100 ? sharePct : null,
      };
    })
    .filter((row: any) => row !== null)
    .sort((a: any, b: any) => b.net - a.net);

  const oneOffYTDBreakdown: Array<{
    clientName: string;
    projectName: string;
    amount: number;
    date: string;
  }> = [];
  for (const c of clientsForRetainer.docs as any[]) {
    const rows = Array.isArray(c.oneOffProjects) ? c.oneOffProjects : [];
    const share = shareOf(c);
    for (const p of rows) {
      if (p?.countTowardsRetainer) continue;
      if (!p?.date || p?.amount == null) continue;
      const d = new Date(p.date);
      if (isNaN(d.getTime())) continue;
      if (d < yearStartIso || d > now) continue;
      oneOffYTDBreakdown.push({
        clientName: String(c.name ?? `#${c.id}`),
        projectName: String(p.projectName ?? ""),
        amount: round((Number(p.amount) || 0) * share),
        date: typeof p.date === "string" ? p.date : d.toISOString(),
      });
    }
  }
  oneOffYTDBreakdown.sort((a, b) => b.amount - a.amount);

  const retainerYTDBreakdown = clientsForRetainer.docs
    .map((c: any) => {
      const share = shareOf(c);
      const sharePct = Number(c.revenueSharePercent);
      const monthlyOnly = retainerRevenueYTD(
        {
          monthlyRetainer: Number(c.monthlyRetainer) || 0,
          clientStartDate: c.clientStartDate ?? null,
          retainerStartDate: c.retainerStartDate ?? null,
          retainerHistory: Array.isArray(c.retainerHistory) ? c.retainerHistory : [],
          referralCommissions: Array.isArray(c.referralCommissions)
            ? c.referralCommissions
            : [],
        },
        now,
      );
      const anchorIso = c.retainerStartDate ?? c.clientStartDate ?? null;
      const startDate = anchorIso ? new Date(anchorIso) : null;
      const setupFee =
        startDate && !isNaN(startDate.getTime()) && startDate.getFullYear() === now.getFullYear()
          ? Number(c.setupFee) || 0
          : 0;
      const retainerOneOffs: Array<{ projectName: string; amount: number }> = [];
      const rows = Array.isArray(c.oneOffProjects) ? c.oneOffProjects : [];
      for (const p of rows) {
        if (!p?.countTowardsRetainer) continue;
        if (!p?.date || p?.amount == null) continue;
        const d = new Date(p.date);
        if (isNaN(d.getTime())) continue;
        if (d < yearStartIso || d > now) continue;
        retainerOneOffs.push({
          projectName: String(p.projectName ?? ""),
          amount: round((Number(p.amount) || 0) * share),
        });
      }
      const priorPeriodThisYear = thisYearHistoricalForClient(c);
      const total = round(
        (monthlyOnly +
          setupFee +
          rows
            .filter((p: any) => p?.countTowardsRetainer)
            .reduce((s: number, p: any) => {
              const pd = p?.date ? new Date(p.date) : null;
              if (!pd || isNaN(pd.getTime()) || pd < yearStartIso || pd > now) return s;
              return s + (Number(p.amount) || 0);
            }, 0) +
          priorPeriodThisYear) *
          share,
      );
      if (total <= 0) return null;
      return {
        clientName: String(c.name ?? `#${c.id}`),
        monthlyNetSum: round(monthlyOnly * share),
        setupFee: round(setupFee * share),
        retainerOneOffs,
        priorPeriodThisYear: round(priorPeriodThisYear * share),
        total,
        revenueSharePercent: Number.isFinite(sharePct) && sharePct < 100 ? sharePct : null,
      };
    })
    .filter((row: any) => row !== null)
    .sort((a: any, b: any) => b.total - a.total);

  // Back-compat fields (existing consumers). Current-year historical rows
  // are already folded into `retainerYTD` above — do not double-count here.
  const totalMonthlyRevenue = monthlyRetainerNet;
  const totalRetainer = round(monthlyRetainerNet + oneOffTotal);
  const annualisedAgencyRevenue = round(monthlyRetainerNet * 12);
  const ytdRevenue = round(retainerYTD + oneOffYTD);

  const usage = {
    seoAudits: seoCount.totalDocs,
    croAudits: croCount.totalDocs,
    keywordSnapshots: kwCount.totalDocs,
    competitorAnalyses: compCount.totalDocs,
    contentResearches: contentCount.totalDocs,
    mediaUploads: mediaCount.totalDocs,
  };

  const currentMonthApiCosts = {
    seoAudits: round(usage.seoAudits * COST_PER_AUD.seoAudit),
    croAudits: round(usage.croAudits * COST_PER_AUD.croAudit),
    keywords: round(usage.keywordSnapshots * COST_PER_AUD.keywordSnapshot),
    competitors: round(usage.competitorAnalyses * COST_PER_AUD.competitorAnalysis),
    content: round(usage.contentResearches * COST_PER_AUD.contentResearch),
    blogImages: round(usage.mediaUploads * COST_PER_AUD.blogImage),
  };

  const lastMonthApiCosts = {
    seoAudits: round(lastMonthSeoCount.totalDocs * COST_PER_AUD.seoAudit),
    croAudits: round(lastMonthCroCount.totalDocs * COST_PER_AUD.croAudit),
    keywords: round(lastMonthKwCount.totalDocs * COST_PER_AUD.keywordSnapshot),
    competitors: round(lastMonthCompCount.totalDocs * COST_PER_AUD.competitorAnalysis),
    content: round(lastMonthContentCount.totalDocs * COST_PER_AUD.contentResearch),
    blogImages: round(lastMonthMediaCount.totalDocs * COST_PER_AUD.blogImage),
  };

  const infraTotal = round(Object.values(INFRA_MONTHLY_AUD).reduce((a, b) => a + b, 0));
  const currentMonthApiTotal = round(Object.values(currentMonthApiCosts).reduce((a, b) => a + b, 0));
  const lastMonthApiTotal = round(Object.values(lastMonthApiCosts).reduce((a, b) => a + b, 0));
  const llmTotal = round(Object.values(LLM_MONTHLY_AUD).reduce((a, b) => a + b, 0));
  const currentMonthCost = round(infraTotal + currentMonthApiTotal + llmTotal);
  const lastMonthCost = round(infraTotal + lastMonthApiTotal + llmTotal + businessCostsSummary.totalLastMonth);
  const mtdCosts = round(currentMonthCost + businessCostsSummary.totalThisMonth);

  // Lead conversion: leads that reached "client" stage / total leads
  // Fetch agency yearly sales target — from the agency client's
  // yearlyTargets[] array, matching the current calendar year.
  let salesTarget: { target: number } | null = null;
  try {
    const agencyClient = await payload.find({
      collection: "clients",
      where: { isAgency: { equals: true } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const agency = agencyClient.docs[0] as any;
    const targetsArr: Array<{ year?: number; target?: number }> = Array.isArray(
      agency?.yearlyTargets,
    )
      ? agency.yearlyTargets
      : [];
    const yr = now.getFullYear();
    const match = targetsArr.find((t) => Number(t?.year) === yr);
    const target = Number(match?.target) || 0;
    if (target > 0) {
      salesTarget = { target };
    }
  } catch { /* agency not configured */ }

  // WeCanQuit assessment target — unique to this one client. Surfaces the
  // aggregate counter pushed from the WeCanQuit app (paid + completed
  // assessments, no patient data) as a progress bar on the dashboard. Other
  // clients never have these fields set.
  let wcqAssessmentTarget: { current: number; target: number } | null = null;
  try {
    const wcq = await payload.find({
      collection: "clients",
      where: { slug: { equals: "we-can-quit" } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const wcqDoc = wcq.docs[0] as any;
    if (wcqDoc) {
      const target = Number(wcqDoc.wcqAssessmentTarget) || 0;
      const current = Number(wcqDoc.wcqAssessmentsCompleted) || 0;
      if (target > 0) {
        wcqAssessmentTarget = { current, target };
      }
    }
  } catch { /* we-can-quit client not present */ }

  let convertedLeadsCount = 0;
  try {
    const cl = await payload.count({
      collection: "sales-leads" as any,
      where: { stage: { equals: "client" } },
    });
    convertedLeadsCount = cl.totalDocs;
  } catch {}
  const totalLeadsReceived = Number(totalLeadsReceivedCount.totalDocs) || 0;
  const conversionRate = totalLeadsReceived > 0
    ? round((convertedLeadsCount / totalLeadsReceived) * 100)
    : 0;

  let realtimeVoiceCost = { estimatedCostAud: 0, durationSeconds: 0, calls: 0 };
  try {
    let page = 1;
    let hasNextPage = true;
    while (hasNextPage) {
      const voiceRows = await payload.find({
        collection: "realtime-voice-usage" as any,
        limit: 500,
        page,
        depth: 0,
        overrideAccess: true,
        select: {
          estimatedCostUsd: true,
          durationSeconds: true,
        } as any,
      });
      for (const row of voiceRows.docs as any[]) {
        realtimeVoiceCost.estimatedCostAud += convertUsdToAud(Number(row.estimatedCostUsd) || 0);
        realtimeVoiceCost.durationSeconds += Number(row.durationSeconds) || 0;
        realtimeVoiceCost.calls += 1;
      }
      hasNextPage = Boolean((voiceRows as any).hasNextPage);
      page += 1;
    }
  } catch {
    // Voice usage table may not exist until migrations have run.
  }

  const currentKpiSnapshot: AgencyKpiSnapshotValues = {
    activeClients: clientCount.totalDocs,
    activeLeads: activeLeadsCount.totalDocs,
    arr: annualisedAgencyRevenue,
    monthlyRetainer: monthlyRetainerNet,
    retainerYTD,
    oneOffYTD,
    leadConversion: conversionRate,
    mtdCosts,
  };

  const thisMonthKey = monthKey(now);
  const prevMonthKey = previousMonthKey(now);
  const previousSnapshot = await findAgencyKpiSnapshot(payload, prevMonthKey).catch(() => null);
  await upsertAgencyKpiSnapshot(payload, thisMonthKey, currentKpiSnapshot);
  const kpiMom = previousSnapshot
    ? {
        activeClients: buildMomDelta(currentKpiSnapshot.activeClients, Number(previousSnapshot.activeClients ?? 0)),
        activeLeads: buildMomDelta(currentKpiSnapshot.activeLeads, Number(previousSnapshot.activeLeads ?? 0)),
        arr: buildMomDelta(currentKpiSnapshot.arr, Number(previousSnapshot.arr ?? 0)),
        monthlyRetainer: buildMomDelta(currentKpiSnapshot.monthlyRetainer, Number(previousSnapshot.monthlyRetainer ?? 0)),
        retainerYTD: buildMomDelta(currentKpiSnapshot.retainerYTD, Number(previousSnapshot.retainerYTD ?? 0)),
        oneOffYTD: buildMomDelta(currentKpiSnapshot.oneOffYTD, Number(previousSnapshot.oneOffYTD ?? 0)),
        leadConversion: buildMomDelta(currentKpiSnapshot.leadConversion, Number(previousSnapshot.leadConversion ?? 0), "%"),
        mtdCosts: buildMomDelta(currentKpiSnapshot.mtdCosts, Number(previousSnapshot.mtdCosts ?? 0)),
      }
    : null;

  return NextResponse.json({
    gsc: gscBundle?.gsc || null,
    gscMonthly: gscBundle?.gscMonthly || [],
    activeClients: clientCount.totalDocs,
    totalRetainer,
    totalMonthlyRevenue,
    oneOffTotal,
    ytdRevenue,
    monthlyRetainerNet,
    annualisedAgencyRevenue,
    oneOffYTD,
    retainerYTD,
    activity: activityResult.docs,
    userRole: user.role,
    userName: user.name || user.email,
    proposals: {
      active: activeProposals.totalDocs,
      converted: convertedProposals.totalDocs,
      total: totalProposals.totalDocs,
      conversionRate,
    },
    usage,
    costs: {
      period: lastMonthDate.toLocaleString("en-AU", { month: "long", year: "numeric" }),
      api: lastMonthApiCosts,
      apiTotal: lastMonthApiTotal,
      infrastructure: INFRA_MONTHLY_AUD,
      infraTotal,
      llm: LLM_MONTHLY_AUD,
      llmTotal,
      total: lastMonthCost,
    },
    kpiMom,
    costHistory: historicalCounts,
    totalLeads: totalLeadsReceived,
    activeLeads: activeLeadsCount.totalDocs,
    businessCosts: businessCostsSummary,
    processes: processesData || null,
    teamTasks: teamTasksData || null,
    realtimeVoiceCost,
    salesTarget,
    wcqAssessmentTarget,
    breakdowns: {
      monthlyRetainer: monthlyRetainerBreakdown,
      oneOffYTD: oneOffYTDBreakdown,
      retainerYTD: retainerYTDBreakdown,
    },
    month: now.toLocaleString("en-AU", { month: "long", year: "numeric" }),
  });
  } catch (err) {
    console.error("[dashboard] API error:", err);
    return NextResponse.json(
      { error: "Failed to load dashboard data", details: String(err) },
      { status: 500 },
    );
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
