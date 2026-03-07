import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

// Channel metadata for display
const CHANNELS = [
  { value: "referral", label: "Referral", color: "#6366f1" },
  { value: "website", label: "Website", color: "#22c55e" },
  { value: "bni", label: "BNI", color: "#f59e0b" },
  { value: "advertising", label: "Advertising", color: "#ef4444" },
  { value: "cold_outreach", label: "Cold Outreach", color: "#8b5cf6" },
] as const;

// Ordered funnel stages
const STAGES = [
  "new_lead",
  "contacted",
  "meeting_booked",
  "proposal_sent",
  "contract_sent",
  "client",
] as const;

const STAGE_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  meeting_booked: "Meeting Booked",
  proposal_sent: "Proposal Sent",
  contract_sent: "Contract Sent",
  client: "Client (Won)",
  lost: "Lost",
};

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config });

    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse optional date range from query params
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "all"; // all, ytd, 90d, 30d, custom
    const customFrom = searchParams.get("from");
    const customTo = searchParams.get("to");

    const now = new Date();
    let dateFilter: Record<string, any> | undefined;

    if (period === "ytd") {
      dateFilter = {
        firstContactDate: {
          greater_than_equal: new Date(now.getFullYear(), 0, 1).toISOString(),
        },
      };
    } else if (period === "90d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      dateFilter = { firstContactDate: { greater_than_equal: d.toISOString() } };
    } else if (period === "30d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      dateFilter = { firstContactDate: { greater_than_equal: d.toISOString() } };
    } else if (period === "custom" && customFrom) {
      dateFilter = {
        firstContactDate: {
          greater_than_equal: new Date(customFrom).toISOString(),
          ...(customTo
            ? { less_than_equal: new Date(customTo).toISOString() }
            : {}),
        },
      };
    }

    // Fetch all leads (up to 2000)
    const allLeads = await payload.find({
      collection: "sales-leads" as any,
      where: dateFilter || {},
      limit: 2000,
      depth: 0,
      sort: "-createdAt",
      overrideAccess: true,
    });

    const leads = allLeads.docs as any[];

    // ── Overall funnel counts ──
    // A lead that reached stage X also passed through all prior stages
    const funnelCounts: Record<string, number> = {};
    for (const stage of STAGES) {
      funnelCounts[stage] = 0;
    }
    funnelCounts.lost = 0;

    for (const lead of leads) {
      if (lead.stage === "lost") {
        funnelCounts.lost++;
        // Also count lost leads in stages they passed through via history
        const history = (lead.stageHistory as any[]) || [];
        // Find the furthest stage they reached before being lost
        let furthestIdx = 0; // at minimum they were new_lead
        for (const h of history) {
          const fromIdx = STAGES.indexOf(h.fromStage);
          if (fromIdx > furthestIdx) furthestIdx = fromIdx;
        }
        // Count them in all stages up to their furthest
        for (let i = 0; i <= furthestIdx; i++) {
          funnelCounts[STAGES[i]]++;
        }
      } else {
        const stageIdx = STAGES.indexOf(lead.stage);
        if (stageIdx >= 0) {
          // Count this lead in current stage and all prior stages
          for (let i = 0; i <= stageIdx; i++) {
            funnelCounts[STAGES[i]]++;
          }
        }
      }
    }

    // ── Per-channel breakdown ──
    const channelData = CHANNELS.map((ch) => {
      const channelLeads = leads.filter((l: any) => l.channel === ch.value);
      const total = channelLeads.length;
      const active = channelLeads.filter((l: any) => l.stage !== "lost").length;
      const won = channelLeads.filter((l: any) => l.stage === "client").length;
      const lost = channelLeads.filter((l: any) => l.stage === "lost").length;
      const totalValue = channelLeads.reduce(
        (sum: number, l: any) => sum + ((l.estimatedValue as number) || 0),
        0,
      );
      const wonValue = channelLeads
        .filter((l: any) => l.stage === "client")
        .reduce(
          (sum: number, l: any) => sum + ((l.estimatedValue as number) || 0),
          0,
        );

      // Stage breakdown for this channel
      const stages: Record<string, number> = {};
      for (const stage of [...STAGES, "lost" as const]) {
        stages[stage] = channelLeads.filter(
          (l: any) => l.stage === stage,
        ).length;
      }

      // Conversion rate: won / total (excluding still-active leads for fair comparison)
      const closedLeads = won + lost;
      const conversionRate =
        closedLeads > 0 ? round((won / closedLeads) * 100) : 0;

      // Average days to close for won leads
      const wonLeads = channelLeads.filter((l: any) => l.stage === "client");
      let avgDaysToClose = 0;
      if (wonLeads.length > 0) {
        const totalDays = wonLeads.reduce((sum: number, l: any) => {
          const created = new Date(l.firstContactDate || l.createdAt);
          const history = (l.stageHistory as any[]) || [];
          const wonEntry = history.find((h: any) => h.toStage === "client");
          const closedAt = wonEntry
            ? new Date(wonEntry.transitionDate)
            : new Date(l.updatedAt);
          return (
            sum +
            Math.max(
              0,
              (closedAt.getTime() - created.getTime()) / (1000 * 60 * 60 * 24),
            )
          );
        }, 0);
        avgDaysToClose = round(totalDays / wonLeads.length);
      }

      return {
        channel: ch.value,
        label: ch.label,
        color: ch.color,
        total,
        active,
        won,
        lost,
        totalValue,
        wonValue,
        conversionRate,
        avgDaysToClose,
        stages,
      };
    });

    // ── Monthly trend data (last 6 months) ──
    const monthlyTrend: {
      month: string;
      leads: number;
      won: number;
      lost: number;
      value: number;
    }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const monthLabel = d.toLocaleString("en-AU", {
        month: "short",
        year: "2-digit",
      });

      const monthLeads = leads.filter((l: any) => {
        const created = new Date(l.firstContactDate || l.createdAt);
        return created >= d && created < nextMonth;
      });

      monthlyTrend.push({
        month: monthLabel,
        leads: monthLeads.length,
        won: monthLeads.filter((l: any) => l.stage === "client").length,
        lost: monthLeads.filter((l: any) => l.stage === "lost").length,
        value: monthLeads.reduce(
          (sum: number, l: any) => sum + ((l.estimatedValue as number) || 0),
          0,
        ),
      });
    }

    // ── Top-level summary ──
    const totalLeads = leads.length;
    const totalWon = leads.filter((l: any) => l.stage === "client").length;
    const totalLost = leads.filter((l: any) => l.stage === "lost").length;
    const totalActive = totalLeads - totalWon - totalLost;
    const totalPipelineValue = leads
      .filter((l: any) => l.stage !== "lost" && l.stage !== "client")
      .reduce(
        (sum: number, l: any) => sum + ((l.estimatedValue as number) || 0),
        0,
      );
    const totalWonValue = leads
      .filter((l: any) => l.stage === "client")
      .reduce(
        (sum: number, l: any) => sum + ((l.estimatedValue as number) || 0),
        0,
      );
    const closedTotal = totalWon + totalLost;
    const overallConversionRate =
      closedTotal > 0 ? round((totalWon / closedTotal) * 100) : 0;

    // ── Lost reason breakdown ──
    const lostReasons: Record<string, number> = {};
    leads
      .filter((l: any) => l.stage === "lost" && l.lostReason)
      .forEach((l: any) => {
        lostReasons[l.lostReason] = (lostReasons[l.lostReason] || 0) + 1;
      });

    // ── Best channel (highest conversion rate with 2+ closed) ──
    const qualifiedChannels = channelData.filter(
      (c) => c.won + c.lost >= 2,
    );
    const bestChannel = qualifiedChannels.length > 0
      ? qualifiedChannels.reduce((best, c) =>
          c.conversionRate > best.conversionRate ? c : best,
        )
      : null;

    // ── Recent leads (last 10) ──
    const recentLeads = leads.slice(0, 10).map((l: any) => ({
      id: l.id,
      businessName: l.businessName,
      channel: l.channel,
      stage: l.stage,
      estimatedValue: l.estimatedValue,
      contactName: l.contactName,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));

    return NextResponse.json({
      summary: {
        totalLeads,
        totalWon,
        totalLost,
        totalActive,
        totalPipelineValue,
        totalWonValue,
        overallConversionRate,
        bestChannel: bestChannel
          ? { label: bestChannel.label, conversionRate: bestChannel.conversionRate }
          : null,
      },
      funnel: STAGES.map((stage) => ({
        stage,
        label: STAGE_LABELS[stage],
        count: funnelCounts[stage],
      })),
      channels: channelData,
      monthlyTrend,
      lostReasons,
      recentLeads,
      stageLabels: STAGE_LABELS,
    });
  } catch (err) {
    console.error("[sales-funnel] API error:", err);
    return NextResponse.json(
      { error: "Failed to load sales funnel data", details: String(err) },
      { status: 500 },
    );
  }
}
